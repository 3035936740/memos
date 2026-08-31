package fileserver

import (
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

const storagePublicPrefix = "/storage"

type storageFileInfo struct {
	Path      string    `json:"path"`
	SizeBytes int64     `json:"sizeBytes"`
	ModTime   time.Time `json:"modTime"`
	URL       string    `json:"url"`
}

func (s *FileServerService) registerStorageRoutes(echoServer *echo.Echo) {
	echoServer.GET(storagePublicPrefix+"/*", s.serveStorageFile)
	echoServer.GET("/api/v1/admin/storage-files", s.listStorageFiles)
	echoServer.POST("/api/v1/admin/storage-files", s.uploadStorageFile)
	echoServer.DELETE("/api/v1/admin/storage-files", s.deleteStorageFile)
}

func (s *FileServerService) storageRoot() string {
	return filepath.Join(s.Profile.Data, "storage")
}

func (s *FileServerService) requireAdmin(c *echo.Context) (*store.User, error) {
	user, err := s.getCurrentUser(c.Request().Context(), c)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "failed to get current user").Wrap(err)
	}
	if user == nil {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "unauthorized access")
	}
	if user.Role != store.RoleAdmin {
		return nil, echo.NewHTTPError(http.StatusForbidden, "permission denied")
	}
	return user, nil
}

func normalizeStorageRelativePath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.ReplaceAll(raw, "\\", "/")
	raw = strings.TrimPrefix(raw, "/")
	if raw == "" {
		return "", errors.New("path is required")
	}
	cleaned := pathCleanSlash(raw)
	if cleaned == "." || cleaned == "" || strings.HasPrefix(cleaned, "../") || strings.Contains(cleaned, "/../") {
		return "", errors.New("invalid path")
	}
	for _, part := range strings.Split(cleaned, "/") {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("invalid path")
		}
	}
	return cleaned, nil
}

func pathCleanSlash(raw string) string {
	parts := strings.Split(raw, "/")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || part == "." {
			continue
		}
		if part == ".." {
			if len(out) == 0 {
				return ".."
			}
			out = out[:len(out)-1]
			continue
		}
		out = append(out, part)
	}
	return strings.Join(out, "/")
}

func (s *FileServerService) resolveStoragePath(relative string) (string, error) {
	normalized, err := normalizeStorageRelativePath(relative)
	if err != nil {
		return "", err
	}
	root := s.storageRoot()
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", errors.Wrap(err, "failed to resolve storage root")
	}
	absPath, err := filepath.Abs(filepath.Join(absRoot, filepath.FromSlash(normalized)))
	if err != nil {
		return "", errors.Wrap(err, "failed to resolve storage path")
	}
	rel, err := filepath.Rel(absRoot, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", errors.New("path escapes storage root")
	}
	return absPath, nil
}

func (s *FileServerService) serveStorageFile(c *echo.Context) error {
	relative := c.Param("*")
	absPath, err := s.resolveStoragePath(relative)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid storage path").Wrap(err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to stat file").Wrap(err)
	}
	if info.IsDir() {
		return echo.NewHTTPError(http.StatusNotFound, "file not found")
	}

	file, err := os.Open(absPath)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to open file").Wrap(err)
	}
	defer file.Close()

	contentType := mime.TypeByExtension(filepath.Ext(absPath))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	contentType = sanitizeContentType(contentType)

	setSecurityHeaders(c)
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderCacheControl, cacheMaxAge)
	http.ServeContent(c.Response(), c.Request(), info.Name(), info.ModTime(), file)
	return nil
}

func (s *FileServerService) listStorageFiles(c *echo.Context) error {
	if _, err := s.requireAdmin(c); err != nil {
		return err
	}

	root := s.storageRoot()
	files := make([]storageFileInfo, 0)
	if _, err := os.Stat(root); os.IsNotExist(err) {
		return c.JSON(http.StatusOK, map[string]any{"files": files})
	} else if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to access storage root").Wrap(err)
	}

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		info, err := d.Info()
		if err != nil {
			return err
		}
		files = append(files, storageFileInfo{
			Path:      rel,
			SizeBytes: info.Size(),
			ModTime:   info.ModTime().UTC(),
			URL:       storagePublicPrefix + "/" + rel,
		})
		return nil
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list storage files").Wrap(err)
	}
	return c.JSON(http.StatusOK, map[string]any{"files": files})
}

func (s *FileServerService) uploadStorageFile(c *echo.Context) error {
	if _, err := s.requireAdmin(c); err != nil {
		return err
	}

	req := c.Request()
	if err := req.ParseMultipartForm(64 << 20); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid multipart form").Wrap(err)
	}

	directory := strings.TrimSpace(req.FormValue("path"))
	directory = strings.ReplaceAll(directory, "\\", "/")
	directory = strings.Trim(directory, "/")

	src, fileHeader, err := req.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required").Wrap(err)
	}
	defer src.Close()

	filename := filepath.Base(fileHeader.Filename)
	if filename == "" || filename == "." || filename == ".." {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid filename")
	}

	relative := filename
	if directory != "" {
		relative = directory + "/" + filename
	}
	absPath, err := s.resolveStoragePath(relative)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid storage path").Wrap(err)
	}

	if err := os.MkdirAll(filepath.Dir(absPath), 0o750); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create storage directory").Wrap(err)
	}

	dst, err := os.OpenFile(absPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create storage file").Wrap(err)
	}
	defer dst.Close()

	written, err := io.Copy(dst, src)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to write storage file").Wrap(err)
	}

	info, err := normalizeStorageRelativePath(relative)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to normalize path").Wrap(err)
	}
	return c.JSON(http.StatusOK, storageFileInfo{
		Path:      info,
		SizeBytes: written,
		ModTime:   time.Now().UTC(),
		URL:       storagePublicPrefix + "/" + info,
	})
}

func (s *FileServerService) deleteStorageFile(c *echo.Context) error {
	if _, err := s.requireAdmin(c); err != nil {
		return err
	}

	relative := c.QueryParam("path")
	absPath, err := s.resolveStoragePath(relative)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid storage path").Wrap(err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return echo.NewHTTPError(http.StatusNotFound, "file not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to stat file").Wrap(err)
	}
	if info.IsDir() {
		return echo.NewHTTPError(http.StatusBadRequest, "path is a directory")
	}

	if err := os.Remove(absPath); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete file").Wrap(err)
	}

	// Best-effort cleanup of empty parent directories under storage root.
	root := s.storageRoot()
	dir := filepath.Dir(absPath)
	for dir != root && strings.HasPrefix(dir, root+string(os.PathSeparator)) {
		if err := os.Remove(dir); err != nil {
			break
		}
		dir = filepath.Dir(dir)
	}

	return c.NoContent(http.StatusNoContent)
}
