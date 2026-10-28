package v1

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/text"

	"github.com/usememos/memos/internal/blogimport"
	"github.com/usememos/memos/internal/markdown/renderer"
	"github.com/usememos/memos/internal/safearchive"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/server/auth"
	"github.com/usememos/memos/store"
)

const importSettingName = "BLOG_IMPORT"

type blogImportSetting struct {
	MaxUploadMB int `json:"maxUploadMb"`
}
type importPreview struct {
	ID        string          `json:"id"`
	Source    string          `json:"source"`
	Format    string          `json:"format"`
	ExpiresAt time.Time       `json:"expiresAt"`
	Posts     []importArticle `json:"posts"`
}
type importArticle struct {
	blogimport.Post
	Category       string `json:"category"`
	Visibility     string `json:"visibility"`
	LocalImages    int    `json:"localImages"`
	ExternalImages int    `json:"externalImages"`
	SkipReason     string `json:"skipReason,omitempty"`
	Memo           string `json:"memo,omitempty"`
	State          string `json:"state"`
}
type runImportRequest struct {
	PreviewID   string   `json:"previewId"`
	SelectedIDs []string `json:"selectedIds"`
	Visibility  string   `json:"visibility"`
	Space       string   `json:"space"`
}
type importReport struct {
	Entries  []importArticle `json:"entries"`
	Imported int             `json:"imported"`
	Skipped  int             `json:"skipped"`
	Failed   int             `json:"failed"`
}

func (s *APIV1Service) blogImportLimit(ctx context.Context) (int64, error) {
	settings, err := s.Store.GetDriver().ListInstanceSettings(ctx, &store.FindInstanceSetting{Name: importSettingName})
	if err != nil {
		return 0, err
	}
	setting := blogImportSetting{MaxUploadMB: 100}
	if len(settings) > 0 {
		if err = json.Unmarshal([]byte(settings[0].Value), &setting); err != nil {
			return 0, err
		}
	}
	if setting.MaxUploadMB < 1 || setting.MaxUploadMB > 250 {
		return 0, errors.New("invalid configured import upload limit")
	}
	return int64(setting.MaxUploadMB) << 20, nil
}
func (s *APIV1Service) importPreviewDir(userID int32, id string) (string, error) {
	if _, err := uuid.Parse(id); err != nil {
		return "", errors.New("invalid preview ID")
	}
	return filepath.Join(s.Profile.Data, "imports", "previews", strconv.Itoa(int(userID)), id), nil
}
func (s *APIV1Service) importCategories(ctx context.Context) (map[string]string, error) {
	g, err := s.Store.GetInstanceGeneralSetting(ctx)
	if err != nil {
		return nil, err
	}
	cats, err := parseInstanceMemoCategories(g.MemoCategoriesJson)
	if err != nil {
		return nil, err
	}
	m := map[string]string{}
	for _, c := range cats {
		m[strings.ToLower(c.Slug)] = c.Slug
		m[strings.ToLower(c.Title)] = c.Slug
	}
	return m, nil
}
func importImageDestinations(content string) []string {
	root := goldmark.DefaultParser().Parse(text.NewReader([]byte(content)))
	destinations := []string{}
	_ = ast.Walk(root, func(n ast.Node, enter bool) (ast.WalkStatus, error) {
		if enter {
			if image, ok := n.(*ast.Image); ok {
				d := string(image.Destination)
				if !slices.Contains(destinations, d) {
					destinations = append(destinations, d)
				}
			}
		}
		return ast.WalkContinue, nil
	})
	return destinations
}

func rewriteImportImages(content string, replacements map[string]string) string {
	if len(replacements) == 0 {
		return content
	}
	source := []byte(content)
	parser := goldmark.New(goldmark.WithExtensions(extension.GFM)).Parser()
	root := parser.Parse(text.NewReader(source))
	_ = ast.Walk(root, func(n ast.Node, enter bool) (ast.WalkStatus, error) {
		if enter {
			if image, ok := n.(*ast.Image); ok {
				if destination := replacements[string(image.Destination)]; destination != "" {
					image.Destination = []byte(destination)
				}
			}
		}
		return ast.WalkContinue, nil
	})
	return renderer.NewMarkdownRenderer().Render(root, source)
}

// RegisterBlogImportRoutes deliberately uses streaming multipart upload instead
// of a base64 protobuf body, keeping a 100 MB archive off the JSON decoder heap.
func RegisterBlogImportRoutes(router *echo.Group, s *APIV1Service, authorizer *Authorizer) {
	userFor := func(c *echo.Context) (*store.User, error) {
		u, code, err := s.authenticateModerationUser(c, authorizer)
		if err != nil {
			return nil, echo.NewHTTPError(code, err.Error())
		}
		c.SetRequest(c.Request().WithContext(auth.SetUserInContext(c.Request().Context(), u, "")))
		setAPIResponseNoStoreHeaders(c.Response().Header())
		return u, nil
	}
	router.GET("/api/v1/admin/import-settings", func(c *echo.Context) error {
		if _, code, err := s.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		limit, err := s.blogImportLimit(c.Request().Context())
		if err != nil {
			return err
		}
		return c.JSON(200, blogImportSetting{int(limit >> 20)})
	})
	router.PUT("/api/v1/admin/import-settings", func(c *echo.Context) error {
		if _, code, err := s.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, code, err)
		}
		setting := blogImportSetting{}
		if err := decodeModerationJSON(c, &setting); err != nil || setting.MaxUploadMB < 1 || setting.MaxUploadMB > 250 {
			return moderationError(c, 400, errors.New("maxUploadMb must be between 1 and 250"))
		}
		b, _ := json.Marshal(setting)
		_, err := s.Store.GetDriver().UpsertInstanceSetting(c.Request().Context(), &store.InstanceSetting{Name: importSettingName, Value: string(b)})
		if err != nil {
			return err
		}
		return c.JSON(200, setting)
	})
	router.POST("/api/v1/imports/preview", func(c *echo.Context) error {
		u, err := userFor(c)
		if err != nil {
			return err
		}
		ctx := c.Request().Context()
		limit, err := s.blogImportLimit(ctx)
		if err != nil {
			return err
		}
		c.Request().Body = http.MaxBytesReader(c.Response(), c.Request().Body, limit+(1<<20))
		reader, err := c.Request().MultipartReader()
		if err != nil {
			return moderationError(c, 400, errors.New("multipart form required"))
		}
		id := uuid.NewString()
		dir, _ := s.importPreviewDir(u.ID, id)
		// Bound abandoned previews per user. Old previews expire on the next upload.
		parent := filepath.Dir(dir)
		_ = os.MkdirAll(parent, 0700)
		entries, _ := os.ReadDir(parent)
		active := 0
		for _, entry := range entries {
			info, e := entry.Info()
			if e != nil {
				continue
			}
			if time.Since(info.ModTime()) > 30*time.Minute {
				_ = os.RemoveAll(filepath.Join(parent, entry.Name()))
			} else {
				active++
			}
		}
		if active >= 3 {
			return moderationError(c, 429, errors.New("at most three unexpired import previews per user"))
		}
		if err = os.Mkdir(dir, 0700); err != nil {
			return err
		}
		keep := false
		defer func() {
			if !keep {
				_ = os.RemoveAll(dir)
			}
		}()
		format, source := "", ""
		uploaded := false
		filename := ""
		for {
			part, e := reader.NextPart()
			if e == io.EOF {
				break
			}
			if e != nil {
				return moderationError(c, 400, e)
			}
			switch part.FormName() {
			case "file":
				if uploaded {
					return moderationError(c, 400, errors.New("one file required"))
				}
				uploaded = true
				filename = part.FileName()
				f, e := os.OpenFile(filepath.Join(dir, "archive"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
				if e != nil {
					return e
				}
				n, e := io.Copy(f, io.LimitReader(part, limit+1))
				closeErr := f.Close()
				if e != nil || closeErr != nil || n > limit {
					return moderationError(c, 413, errors.New("import upload exceeds size limit or failed"))
				}
			case "format", "source":
				b, e := io.ReadAll(io.LimitReader(part, 1025))
				if e != nil || len(b) > 1024 {
					return moderationError(c, 400, errors.New("import field too long"))
				}
				if part.FormName() == "format" {
					format = string(b)
				} else {
					source = string(b)
				}
			default:
				return moderationError(c, 400, errors.New("unknown multipart field"))
			}
			_ = part.Close()
		}
		if !uploaded {
			return moderationError(c, 400, errors.New("file required"))
		}
		if format == "" {
			if strings.EqualFold(path.Ext(filename), ".xml") {
				format = "wordpress"
			} else {
				format = "markdown"
			}
		}
		if format != "wordpress" && format != "markdown" {
			return moderationError(c, 400, errors.New("format must be wordpress or markdown"))
		}
		if source == "" {
			source = format
		}
		source = strings.TrimSpace(source)
		if source == "" || len(source) > 255 {
			return moderationError(c, 400, errors.New("source must be 1–255 bytes"))
		}
		posts, files, closeArchive, err := readImportArchive(filepath.Join(dir, "archive"), format)
		if err != nil {
			return moderationError(c, 400, err)
		}
		defer closeArchive()
		categories, err := s.importCategories(ctx)
		if err != nil {
			return err
		}
		lengthLimit, err := s.getContentLengthLimit(ctx)
		if err != nil {
			return err
		}
		preview := importPreview{ID: id, Source: source, Format: format, ExpiresAt: time.Now().Add(30 * time.Minute), Posts: []importArticle{}}
		for _, p := range posts {
			content, cat := p.Compose(categories)
			p.Content = content
			article := importArticle{Post: p, Category: cat, Visibility: "PRIVATE", State: "pending"}
			if p.Error != "" {
				article.SkipReason = p.Error
			}
			if len(content) > lengthLimit {
				article.SkipReason = fmt.Sprintf("content exceeds %d byte limit", lengthLimit)
			}
			duplicate, e := s.Store.IsMemoImported(ctx, u.ID, source, p.ID)
			if e != nil {
				return e
			}
			if duplicate {
				article.SkipReason = "already imported"
			}
			for _, destination := range importImageDestinations(content) {
				local, ok := blogimport.ResolveImage(p.ID, destination)
				if ok && files[local] != nil {
					article.LocalImages++
				} else {
					article.ExternalImages++
				}
			}
			preview.Posts = append(preview.Posts, article)
		}
		b, err := json.Marshal(preview)
		if err != nil {
			return err
		}
		if err = os.WriteFile(filepath.Join(dir, "preview.json"), b, 0600); err != nil {
			return err
		}
		keep = true
		// Preview JSON omits article bodies from the public response, but keeps the
		// validated source in a private staging file for the confirmed run.
		for i := range preview.Posts {
			preview.Posts[i].Content = ""
		}
		return c.JSON(200, preview)
	})
	router.POST("/api/v1/imports/run", func(c *echo.Context) error {
		u, err := userFor(c)
		if err != nil {
			return err
		}
		request := runImportRequest{}
		if err = decodeModerationJSON(c, &request); err != nil {
			return moderationError(c, 400, err)
		}
		visibility := request.Visibility
		if visibility == "" {
			visibility = "PRIVATE"
		}
		if visibility != "PRIVATE" && visibility != "PUBLIC" && visibility != "PROTECTED" && visibility != "SPACE" {
			return moderationError(c, 400, errors.New("invalid visibility"))
		}
		request.Visibility = visibility
		if request.Space != "" {
			if _, err = s.resolveWritableSpaceByName(c.Request().Context(), request.Space, u.ID); err != nil {
				return moderationError(c, 403, err)
			}
		} else if visibility == "SPACE" {
			return moderationError(c, 400, errors.New("SPACE visibility requires a space"))
		}
		dir, err := s.importPreviewDir(u.ID, request.PreviewID)
		if err != nil {
			return moderationError(c, 400, err)
		}
		b, err := os.ReadFile(filepath.Join(dir, "preview.json"))
		if err != nil {
			return moderationError(c, 404, errors.New("preview not found"))
		}
		var preview importPreview
		if err = json.Unmarshal(b, &preview); err != nil {
			return err
		}
		if time.Now().After(preview.ExpiresAt) {
			return moderationError(c, 410, errors.New("preview expired"))
		}
		if request.SelectedIDs != nil {
			for _, id := range request.SelectedIDs {
				found := false
				for _, p := range preview.Posts {
					if p.ID == id {
						found = true
						break
					}
				}
				if !found {
					return moderationError(c, 400, errors.New("selected article is not in preview"))
				}
			}
		}
		job := &store.MemoImportJob{ID: uuid.NewString(), UserID: u.ID, State: "running", Source: preview.Source, Report: `{"entries":[]}`, CreatedTs: time.Now().Unix(), UpdatedTs: time.Now().Unix()}
		if err = s.Store.CreateMemoImportJob(c.Request().Context(), job); err != nil {
			return moderationError(c, 409, err)
		}
		ctx := auth.SetUserInContext(context.WithoutCancel(c.Request().Context()), u, "")
		go s.runBlogImport(ctx, u, job, preview, request, dir)
		return c.JSON(http.StatusAccepted, job)
	})
	router.GET("/api/v1/imports/:id", func(c *echo.Context) error {
		u, err := userFor(c)
		if err != nil {
			return err
		}
		j, err := s.Store.GetMemoImportJob(c.Request().Context(), u.ID, c.Param("id"))
		if err != nil {
			return err
		}
		if j == nil {
			return moderationError(c, 404, errors.New("import not found"))
		}
		return c.JSON(200, struct {
			*store.MemoImportJob
			Report json.RawMessage `json:"report"`
		}{j, json.RawMessage(j.Report)})
	})
	router.DELETE("/api/v1/imports/:id", func(c *echo.Context) error {
		u, err := userFor(c)
		if err != nil {
			return err
		}
		if err = s.Store.CancelMemoImport(c.Request().Context(), u.ID, c.Param("id")); err != nil {
			return err
		}
		return c.NoContent(204)
	})
}

func readImportArchive(filename, format string) ([]blogimport.Post, map[string]*zip.File, func(), error) {
	f, err := os.Open(filename)
	if err != nil {
		return nil, nil, func() {}, err
	}
	closeFile := func() { _ = f.Close() }
	info, err := f.Stat()
	if err != nil {
		closeFile()
		return nil, nil, func() {}, err
	}
	if format == "markdown" {
		posts, files, e := blogimport.MarkdownZIP(f, info.Size())
		if e != nil {
			closeFile()
			return nil, nil, func() {}, e
		}
		return posts, files, closeFile, e
	}
	b, err := io.ReadAll(io.LimitReader(f, (250<<20)+1))
	if err != nil {
		closeFile()
		return nil, nil, func() {}, err
	}
	posts, err := blogimport.WXR(b, info.ModTime())
	if err != nil {
		closeFile()
		return nil, nil, func() {}, err
	}
	return posts, nil, closeFile, err
}

func readImportAssets(filename, format string) (map[string]*zip.File, func(), error) {
	if format != "markdown" {
		return nil, func() {}, nil
	}
	f, err := os.Open(filename)
	if err != nil {
		return nil, func() {}, err
	}
	closeFile := func() { _ = f.Close() }
	info, err := f.Stat()
	if err != nil {
		closeFile()
		return nil, func() {}, err
	}
	files, err := safearchive.Read(f, info.Size(), safearchive.Limits{Files: 5000, TotalBytes: 256 << 20, FileBytes: 20 << 20})
	if err != nil {
		closeFile()
		return nil, func() {}, err
	}
	return files, closeFile, nil
}

func (s *APIV1Service) runBlogImport(ctx context.Context, user *store.User, job *store.MemoImportJob, preview importPreview, request runImportRequest, dir string) {
	heartbeatCtx, stopHeartbeat := context.WithCancel(ctx)
	defer stopHeartbeat()
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatCtx.Done():
				return
			case <-ticker.C:
				if err := s.Store.HeartbeatMemoImport(heartbeatCtx, job.ID); err != nil {
					slog.Warn("import heartbeat failed", "job", job.ID, "error", err)
				}
			}
		}
	}()
	report := importReport{Entries: []importArticle{}}
	defer func() {
		if recoverValue := recover(); recoverValue != nil {
			job.State = "failed"
			slog.Error("blog import panic", "job", job.ID, "error", recoverValue)
		}
		if job.State == "running" {
			job.State = "completed"
		}
		b, _ := json.Marshal(report)
		job.Report = string(b)
		if err := s.Store.SaveMemoImportJob(context.Background(), job, true); err != nil {
			slog.Error("cannot finish import report", "job", job.ID, "error", err)
		}
		s.SSEHub.publishMemoChanged()
	}()
	files, closeFile, err := readImportAssets(filepath.Join(dir, "archive"), preview.Format)
	if err != nil {
		job.State = "failed"
		report.Entries = append(report.Entries, importArticle{Post: blogimport.Post{Error: err.Error()}, State: "failed"})
		report.Failed++
		return
	}
	defer closeFile()
	for _, entry := range preview.Posts {
		current, err := s.Store.GetMemoImportJob(ctx, user.ID, job.ID)
		if err != nil {
			job.State = "failed"
			return
		}
		if current == nil || current.CancelRequested {
			job.State = "cancelled"
			return
		}
		if request.SelectedIDs != nil && !slices.Contains(request.SelectedIDs, entry.ID) {
			entry.SkipReason = "not selected"
		}
		duplicate, err := s.Store.IsMemoImported(ctx, user.ID, preview.Source, entry.ID)
		if err != nil {
			job.State = "failed"
			return
		}
		if duplicate {
			entry.SkipReason = "already imported"
		}
		if entry.SkipReason != "" {
			entry.State = "skipped"
			report.Skipped++
		} else {
			memo, err := s.importBlogArticle(ctx, user, job, entry, request, files)
			if err != nil {
				entry.State = "failed"
				entry.Error = err.Error()
				report.Failed++
			} else {
				entry.State = "imported"
				entry.Memo = "memos/" + memo.UID
				report.Imported++
			}
		}
		entry.Content = ""
		report.Entries = append(report.Entries, entry)
		b, _ := json.Marshal(report)
		job.Report = string(b)
		if err := s.Store.SaveMemoImportJob(ctx, job, false); err != nil {
			job.State = "failed"
			return
		}
	}
}

func (s *APIV1Service) importBlogArticle(ctx context.Context, user *store.User, job *store.MemoImportJob, entry importArticle, request runImportRequest, files map[string]*zip.File) (*store.Memo, error) {
	content := entry.Content
	replacements := map[string]string{}
	attachments := []*v1pb.Attachment{}
	committed := false
	defer func() {
		if !committed {
			for _, a := range attachments {
				if _, err := s.DeleteAttachment(context.WithoutCancel(ctx), &v1pb.DeleteAttachmentRequest{Name: a.Name}); err != nil {
					slog.Warn("cannot clean up import attachment", "job", job.ID, "attachment", a.Name, "error", err)
				}
			}
		}
	}()
	for _, destination := range importImageDestinations(content) {
		local, ok := blogimport.ResolveImage(entry.ID, destination)
		if !ok || files[local] == nil {
			continue
		}
		blob, err := safearchive.Bytes(files[local], 20<<20)
		if err != nil {
			return nil, err
		}
		mime := http.DetectContentType(blob)
		if !strings.HasPrefix(mime, "image/") {
			return nil, errors.Errorf("archive image %q is not a supported image", local)
		}
		a, err := s.CreateAttachment(ctx, &v1pb.CreateAttachmentRequest{Attachment: &v1pb.Attachment{Filename: path.Base(local), Type: mime, Content: blob}})
		if err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
		link := "/file/" + strings.TrimPrefix(a.Name, "attachments/") + "/" + url.PathEscape(a.Filename)
		// Destinations come from the Markdown AST, so code samples alone are not
		// treated as attachments. Angle destinations and reference definitions work.
		replacements[destination] = link
	}
	content = rewriteImportImages(content, replacements)
	visibility := v1pb.Visibility(v1pb.Visibility_value[request.Visibility])
	if entry.Draft || entry.Private {
		visibility = v1pb.Visibility_PRIVATE
	}
	input := &v1pb.Memo{Content: content, Visibility: visibility, Draft: entry.Draft, Attachments: attachments}
	if request.Space != "" {
		input.Space = &request.Space
	}
	if entry.Category != "" {
		input.Category = &entry.Category
	}
	uid, err := ValidateAndGenerateUID("")
	if err != nil {
		return nil, err
	}
	prepared, err := s.prepareMemoCreate(ctx, user, input, uid)
	if err != nil {
		return nil, err
	}
	// Only this internal import path supplies original timestamps. The ordinary
	// create service keeps its administrator-only timestamp authorization.
	prepared.memo.CreatedTs = entry.Created.Unix()
	prepared.memo.UpdatedTs = entry.Updated.Unix()
	bindings, _ := buildMemoAttachmentMutationBindings(prepared.attachments)
	err = s.Store.ApplyMemoMutation(ctx, &store.MemoMutation{MemoCreate: prepared.memo, Bindings: bindings, RequiredAttachmentIDs: prepared.requiredAttachmentIDs, ReferenceRelations: prepared.referenceRelations, ReplaceReferenceRelations: len(prepared.referenceRelations) > 0, ImportRecord: &store.MemoImportRecord{Source: job.Source, SourceID: entry.ID, JobID: job.ID, CreatedTs: entry.Created.Unix(), UpdatedTs: entry.Updated.Unix()}})
	if err != nil {
		return nil, err
	}
	committed = true
	return prepared.memo, nil
}
