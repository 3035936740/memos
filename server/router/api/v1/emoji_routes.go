package v1

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/storage"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

const (
	emojiStorageDatabase = "DATABASE"
	emojiStorageLocal    = "LOCAL"
	emojiStorageS3       = "S3"
	emojiStorageExternal = "EXTERNAL"
)

var emojiMimeExtensions = map[string]string{
	"image/png":                ".png",
	"image/jpeg":               ".jpg",
	"image/gif":                ".gif",
	"image/webp":               ".webp",
	"image/avif":               ".avif",
	"image/bmp":                ".bmp",
	"image/x-icon":             ".ico",
	"image/vnd.microsoft.icon": ".ico",
}

type emojiGroupRequest struct {
	Name string `json:"name"`
}

type emojiResponse struct {
	ID          int32  `json:"id"`
	Name        string `json:"name"`
	Token       string `json:"token"`
	URL         string `json:"url"`
	Type        string `json:"type"`
	Size        int64  `json:"size"`
	StorageType string `json:"storageType"`
}

type emojiGroupResponse struct {
	ID     int32           `json:"id"`
	Name   string          `json:"name"`
	Emojis []emojiResponse `json:"emojis"`
}

func validEmojiLabel(value string) bool {
	if value == "" || utf8.RuneCountInString(value) > 40 || strings.TrimSpace(value) != value {
		return false
	}
	for _, r := range value {
		if unicode.IsControl(r) || strings.ContainsRune(`/\[]()<>:"|?*#%`, r) {
			return false
		}
	}
	return value != "." && value != ".."
}

func emojiPublicPath(filename string) string {
	return "/emoji/" + url.PathEscape(filename)
}

func emojiToken(groupName, emojiName string) string {
	return "[" + groupName + "_" + emojiName + "]"
}

func (s *APIV1Service) listEmojiGroups(ctx context.Context) ([]emojiGroupResponse, error) {
	groups, err := s.Store.ListEmojiGroups(ctx, &store.FindEmojiGroup{})
	if err != nil {
		return nil, err
	}
	emojis, err := s.Store.ListEmojis(ctx, &store.FindEmoji{})
	if err != nil {
		return nil, err
	}
	byGroup := make(map[int32][]*store.Emoji)
	for _, emoji := range emojis {
		byGroup[emoji.GroupID] = append(byGroup[emoji.GroupID], emoji)
	}
	result := make([]emojiGroupResponse, 0, len(groups))
	for _, group := range groups {
		item := emojiGroupResponse{ID: group.ID, Name: group.Name, Emojis: []emojiResponse{}}
		for _, emoji := range byGroup[group.ID] {
			item.Emojis = append(item.Emojis, emojiResponse{
				ID: emoji.ID, Name: emoji.Name, Token: emojiToken(group.Name, emoji.Name), URL: emojiPublicPath(emoji.Filename),
				Type: emoji.Type, Size: emoji.Size, StorageType: emoji.StorageType,
			})
		}
		result = append(result, item)
	}
	return result, nil
}

func emojiExtension(contentType, originalFilename string) (string, bool) {
	extension, ok := emojiMimeExtensions[contentType]
	if !ok {
		return "", false
	}
	originalExtension := strings.ToLower(filepath.Ext(originalFilename))
	if contentType == "image/jpeg" && (originalExtension == ".jpg" || originalExtension == ".jpeg") {
		return originalExtension, true
	}
	return extension, true
}

func readEmojiUpload(header *multipart.FileHeader, limit int64) ([]byte, string, string, error) {
	file, err := header.Open()
	if err != nil {
		return nil, "", "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, "", "", err
	}
	if int64(len(data)) > limit {
		return nil, "", "", errors.New("emoji file exceeds the configured upload limit")
	}
	contentType := http.DetectContentType(data)
	extension, ok := emojiExtension(contentType, header.Filename)
	if !ok {
		return nil, "", "", errors.New("unsupported emoji image type")
	}
	return data, contentType, extension, nil
}

func validateEmojiURL(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("emoji URL must be an absolute HTTP(S) URL")
	}
	return parsed.String(), nil
}

func (s *APIV1Service) saveEmojiContent(ctx context.Context, emoji *store.Emoji, data []byte) error {
	setting, err := s.Store.GetInstanceStorageSetting(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to load attachment storage setting")
	}
	configured := store.GetDefaultStorage(setting)
	if configured == nil {
		return errors.New("default attachment storage is not configured")
	}
	switch configured.Type {
	case storepb.StorageType_STORAGE_TYPE_DATABASE:
		emoji.StorageType = emojiStorageDatabase
		emoji.Blob = data
	case storepb.StorageType_STORAGE_TYPE_LOCAL:
		reference := filepath.ToSlash(filepath.Join("emoji", emoji.Filename))
		path := filepath.Join(s.Profile.Data, filepath.FromSlash(reference))
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return errors.Wrap(err, "failed to create emoji directory")
		}
		if err := os.WriteFile(path, data, 0644); err != nil {
			return errors.Wrap(err, "failed to write emoji file")
		}
		emoji.StorageType = emojiStorageLocal
		emoji.Reference = reference
	case storepb.StorageType_STORAGE_TYPE_S3:
		driver, err := storage.NewDriver(ctx, configured)
		if err != nil {
			return errors.Wrap(err, "failed to create emoji storage driver")
		}
		key, err := driver.UploadObject(ctx, filepath.ToSlash(filepath.Join("emoji", emoji.Filename)), emoji.Type, bytes.NewReader(data))
		if err != nil {
			return errors.Wrap(err, "failed to upload emoji")
		}
		emoji.StorageType = emojiStorageS3
		emoji.StorageID = configured.Id
		emoji.StorageKey = key
	default:
		return errors.New("unsupported attachment storage type")
	}
	return nil
}

func (s *APIV1Service) deleteEmojiContent(ctx context.Context, emoji *store.Emoji) error {
	switch emoji.StorageType {
	case emojiStorageLocal:
		path := filepath.Join(s.Profile.Data, filepath.FromSlash(emoji.Reference))
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return errors.Wrap(err, "failed to delete emoji file")
		}
	case emojiStorageS3:
		setting, err := s.Store.GetInstanceStorageSetting(ctx)
		if err != nil {
			return errors.Wrap(err, "failed to load attachment storage setting")
		}
		driver, err := s.Store.ResolveStorageDriver(ctx, setting, emoji.StorageID, nil)
		if err != nil {
			return errors.Wrap(err, "failed to resolve emoji storage")
		}
		if err := driver.DeleteObject(ctx, emoji.StorageKey); err != nil {
			return errors.Wrap(err, "failed to delete emoji object")
		}
	}
	return nil
}

func (s *APIV1Service) readEmojiContent(ctx context.Context, emoji *store.Emoji) ([]byte, error) {
	switch emoji.StorageType {
	case emojiStorageDatabase:
		return emoji.Blob, nil
	case emojiStorageLocal:
		return os.ReadFile(filepath.Join(s.Profile.Data, filepath.FromSlash(emoji.Reference)))
	case emojiStorageS3:
		setting, err := s.Store.GetInstanceStorageSetting(ctx)
		if err != nil {
			return nil, err
		}
		driver, err := s.Store.ResolveStorageDriver(ctx, setting, emoji.StorageID, nil)
		if err != nil {
			return nil, err
		}
		return driver.GetObject(ctx, emoji.StorageKey)
	default:
		return nil, errors.New("unsupported emoji storage type")
	}
}

func emojiConflict(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "unique") || strings.Contains(message, "duplicate")
}

// RegisterEmojiRoutes registers the public catalog/file endpoints and the admin editor endpoints.
func RegisterEmojiRoutes(router *echo.Group, service *APIV1Service, authorizer *Authorizer) {
	router.GET("/api/v1/emojis", func(c *echo.Context) error {
		groups, err := service.listEmojiGroups(c.Request().Context())
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load emoji packs"))
		}
		return c.JSON(http.StatusOK, map[string]any{"groups": groups})
	})

	router.GET("/emoji/:filename", func(c *echo.Context) error {
		filename := c.Param("filename")
		emoji, err := service.Store.GetEmoji(c.Request().Context(), &store.FindEmoji{Filename: &filename, GetBlob: true})
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load emoji").Wrap(err)
		}
		if emoji == nil {
			return echo.NewHTTPError(http.StatusNotFound, "emoji not found")
		}
		if emoji.StorageType == emojiStorageExternal {
			return c.Redirect(http.StatusTemporaryRedirect, emoji.Reference)
		}
		content, err := service.readEmojiContent(c.Request().Context(), emoji)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to read emoji").Wrap(err)
		}
		c.Response().Header().Set(echo.HeaderCacheControl, "public, max-age=3600")
		c.Response().Header().Set("X-Content-Type-Options", "nosniff")
		return c.Blob(http.StatusOK, emoji.Type, content)
	})

	router.POST("/api/v1/admin/emoji-groups", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		request := &emojiGroupRequest{}
		if err := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, 2048)).Decode(request); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		request.Name = strings.TrimSpace(request.Name)
		if !validEmojiLabel(request.Name) {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid emoji group name"))
		}
		group, err := service.Store.CreateEmojiGroup(c.Request().Context(), &store.EmojiGroup{Name: request.Name})
		if err != nil {
			if emojiConflict(err) {
				return moderationError(c, http.StatusConflict, errors.New("emoji group already exists"))
			}
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to create emoji group"))
		}
		return c.JSON(http.StatusCreated, emojiGroupResponse{ID: group.ID, Name: group.Name, Emojis: []emojiResponse{}})
	})

	router.DELETE("/api/v1/admin/emoji-groups/:id", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		id, err := strconv.ParseInt(c.Param("id"), 10, 32)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid emoji group id"))
		}
		groupID := int32(id)
		emojis, err := service.Store.ListEmojis(c.Request().Context(), &store.FindEmoji{GroupID: &groupID})
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load emoji group"))
		}
		for _, emoji := range emojis {
			if err := service.deleteEmojiContent(c.Request().Context(), emoji); err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to delete emoji content"))
			}
		}
		if err := service.Store.DeleteEmojiGroup(c.Request().Context(), groupID); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to delete emoji group"))
		}
		return c.NoContent(http.StatusNoContent)
	})

	router.POST("/api/v1/admin/emojis", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		setting, err := service.Store.GetInstanceStorageSetting(c.Request().Context())
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load upload limit"))
		}
		limit := int64(setting.UploadSizeLimitMb) * MebiByte
		if limit <= 0 {
			limit = MaxUploadBufferSizeBytes
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, limit+(1<<20))
		groupID64, err := strconv.ParseInt(c.FormValue("groupId"), 10, 32)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid emoji group id"))
		}
		groupID := int32(groupID64)
		group, err := service.Store.GetEmojiGroup(c.Request().Context(), &store.FindEmojiGroup{ID: &groupID})
		if err != nil || group == nil {
			return moderationError(c, http.StatusNotFound, errors.New("emoji group not found"))
		}
		name := strings.TrimSpace(c.FormValue("name"))
		if !validEmojiLabel(name) {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid emoji name"))
		}
		emoji := &store.Emoji{GroupID: group.ID, Name: name}
		rawURL := strings.TrimSpace(c.FormValue("url"))
		fileHeader, fileErr := c.FormFile("file")
		if rawURL != "" && fileErr == nil {
			return moderationError(c, http.StatusBadRequest, errors.New("choose either a file or a URL"))
		}
		if rawURL != "" {
			validatedURL, err := validateEmojiURL(rawURL)
			if err != nil {
				return moderationError(c, http.StatusBadRequest, err)
			}
			extension := strings.ToLower(filepath.Ext(strings.Split(validatedURL, "?")[0]))
			if _, ok := map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".avif": true, ".bmp": true, ".ico": true}[extension]; !ok {
				extension = ".webp"
			}
			emoji.Filename = group.Name + "_" + name + extension
			emoji.Type = "image/" + strings.TrimPrefix(extension, ".")
			if extension == ".jpg" || extension == ".jpeg" {
				emoji.Type = "image/jpeg"
			}
			emoji.StorageType = emojiStorageExternal
			emoji.Reference = validatedURL
		} else {
			if fileErr != nil {
				return moderationError(c, http.StatusBadRequest, errors.New("emoji file or URL is required"))
			}
			data, contentType, extension, err := readEmojiUpload(fileHeader, limit)
			if err != nil {
				return moderationError(c, http.StatusBadRequest, err)
			}
			emoji.Filename = group.Name + "_" + name + extension
			emoji.Type = contentType
			emoji.Size = int64(len(data))
			existing, err := service.Store.GetEmoji(c.Request().Context(), &store.FindEmoji{Filename: &emoji.Filename})
			if err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to check emoji name"))
			}
			if existing != nil {
				return moderationError(c, http.StatusConflict, errors.New("emoji already exists"))
			}
			if err := service.saveEmojiContent(c.Request().Context(), emoji, data); err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to store emoji content"))
			}
		}
		created, err := service.Store.CreateEmoji(c.Request().Context(), emoji)
		if err != nil {
			_ = service.deleteEmojiContent(c.Request().Context(), emoji)
			if emojiConflict(err) {
				return moderationError(c, http.StatusConflict, errors.New("emoji already exists"))
			}
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to create emoji"))
		}
		return c.JSON(http.StatusCreated, emojiResponse{ID: created.ID, Name: created.Name, Token: emojiToken(group.Name, created.Name), URL: emojiPublicPath(created.Filename), Type: created.Type, Size: created.Size, StorageType: created.StorageType})
	})

	router.DELETE("/api/v1/admin/emojis/:id", func(c *echo.Context) error {
		if _, code, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		id, err := strconv.ParseInt(c.Param("id"), 10, 32)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid emoji id"))
		}
		emojiID := int32(id)
		emoji, err := service.Store.GetEmoji(c.Request().Context(), &store.FindEmoji{ID: &emojiID})
		if err != nil || emoji == nil {
			return moderationError(c, http.StatusNotFound, errors.New("emoji not found"))
		}
		if err := service.deleteEmojiContent(c.Request().Context(), emoji); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to delete emoji content"))
		}
		if err := service.Store.DeleteEmoji(c.Request().Context(), emoji.ID); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to delete emoji"))
		}
		return c.NoContent(http.StatusNoContent)
	})
}
