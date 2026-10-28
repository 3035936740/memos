package v1

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"
	"gopkg.in/yaml.v3"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

type backupSkip struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}
type backupManifest struct {
	ExportedAt     time.Time    `json:"exportedAt"`
	Version        string       `json:"version"`
	SchemaVersion  string       `json:"schemaVersion"`
	Memos          int          `json:"memoCount"`
	Attachments    int          `json:"attachmentCount"`
	AttachmentMode string       `json:"attachmentMode"`
	Database       string       `json:"database"`
	Warning        string       `json:"warning,omitempty"`
	Skipped        []backupSkip `json:"skippedAttachments"`
	SkippedCount   int          `json:"skippedCount"`
}

type backupMemoMetadata struct {
	UID         string   `yaml:"uid"`
	Creator     string   `yaml:"creator"`
	Created     string   `yaml:"created"`
	Updated     string   `yaml:"updated"`
	Visibility  string   `yaml:"visibility"`
	State       string   `yaml:"state"`
	Pinned      bool     `yaml:"pinned"`
	Tags        []string `yaml:"tags"`
	Parent      string   `yaml:"parent,omitempty"`
	Deleted     string   `yaml:"deleted,omitempty"`
	Attachments []string `yaml:"attachments"`
}

func backupComponent(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsControl(r) || strings.ContainsRune(`/\:`, r) {
			b.WriteByte('_')
		} else {
			b.WriteRune(r)
		}
	}
	value = strings.Trim(strings.ReplaceAll(b.String(), "..", "_"), ". ")
	runes := []rune(value)
	if len(runes) > 120 {
		value = string(runes[:120])
	}
	if value == "" {
		return "unnamed"
	}
	return value
}

type backupContextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r backupContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func writeBackupEntry(ctx context.Context, z *zip.Writer, path string, r io.Reader) error {
	header := &zip.FileHeader{Name: path, Method: zip.Deflate}
	header.SetMode(0600)
	entry, err := z.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(entry, backupContextReader{ctx, r})
	return err
}

func (s *APIV1Service) backupAttachmentReader(ctx context.Context, a *store.Attachment, mode string) (io.ReadCloser, error) {
	if mode == "none" {
		return nil, errors.New("attachments omitted by export option")
	}
	switch a.StorageType {
	case storepb.AttachmentStorageType_EXTERNAL:
		return nil, errors.New("external URL only: " + a.Reference)
	case storepb.AttachmentStorageType_LOCAL:
		path := filepath.FromSlash(a.Reference)
		if !filepath.IsAbs(path) {
			path = filepath.Join(s.Profile.Data, path)
		}
		return os.Open(path)
	case storepb.AttachmentStorageType_S3:
		if mode != "all" {
			return nil, errors.New("S3 object omitted by local-only option")
		}
		driver, object, err := s.Store.ResolveAttachmentS3Driver(ctx, a)
		if err != nil {
			return nil, err
		}
		stream, err := driver.GetObjectStream(ctx, object.Key, "")
		if err != nil {
			return nil, err
		}
		return stream.Body, nil
	default:
		// Legacy database blobs are read in 64 KiB chunks, never as one giant []byte.
		reader, writer := io.Pipe()
		go func() { err := s.Store.StreamAttachmentBlob(ctx, a.ID, writer); _ = writer.CloseWithError(err) }()
		return reader, nil
	}
}

func (s *APIV1Service) exportBackup(ctx context.Context, z *zip.Writer, mode, snapshot string) (*backupManifest, error) {
	schema, err := s.Store.GetCurrentSchemaVersion()
	if err != nil {
		return nil, err
	}
	manifest := &backupManifest{ExportedAt: time.Now().UTC(), Version: s.Profile.Version, SchemaVersion: schema, AttachmentMode: mode, Database: "not included", Skipped: []backupSkip{}}
	recordSkip := func(path string, err error) error {
		item := backupSkip{Path: path, Reason: err.Error()}
		manifest.SkippedCount++
		if len(manifest.Skipped) < 1000 {
			manifest.Skipped = append(manifest.Skipped, item)
		}
		// Keep the complete report bounded in memory even if every object is missing.
		data, _ := json.Marshal(item)
		return writeBackupEntry(ctx, z, "skipped/"+strconv.Itoa(manifest.SkippedCount)+".json", bytes.NewReader(data))
	}
	size, after := 100, int32(0)
	for ctx.Err() == nil {
		memos, err := s.Store.ListMemos(ctx, &store.FindMemo{Deleted: store.IncludeDeleted, OrderByID: true, AfterID: &after, Limit: &size})
		if err != nil {
			return nil, err
		}
		if len(memos) == 0 {
			break
		}
		for _, memo := range memos {
			after = memo.ID
			meta := backupMemoMetadata{UID: memo.UID, Creator: "users/" + strconv.Itoa(int(memo.CreatorID)), Created: time.Unix(memo.CreatedTs, 0).UTC().Format(time.RFC3339), Updated: time.Unix(memo.UpdatedTs, 0).UTC().Format(time.RFC3339), State: string(memo.RowStatus), Visibility: string(memo.Visibility), Pinned: memo.Pinned, Tags: []string{}, Attachments: []string{}}
			if memo.Payload != nil {
				meta.Tags = memo.Payload.Tags
			}
			if memo.DeletedTs != nil {
				meta.Deleted = time.UnixMicro(*memo.DeletedTs).UTC().Format(time.RFC3339Nano)
			}
			if memo.ParentUID != nil {
				meta.Parent = "memos/" + *memo.ParentUID
			}
			for offset := 0; ; offset += size {
				attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID, IncludeDeletedMemos: true, Limit: &size, Offset: &offset})
				if err != nil {
					return nil, err
				}
				for _, a := range attachments {
					path := "attachments/" + backupComponent(memo.UID) + "/" + backupComponent(a.UID) + "-" + strconv.Itoa(int(a.ID)) + "-" + backupComponent(a.Filename)
					if a.StorageType == storepb.AttachmentStorageType_EXTERNAL {
						meta.Attachments = append(meta.Attachments, a.Reference)
						continue
					}
					reader, err := s.backupAttachmentReader(ctx, a, mode)
					if err != nil {
						if err := recordSkip(path, err); err != nil {
							return nil, err
						}
						continue
					}
					err = writeBackupEntry(ctx, z, path, reader)
					_ = reader.Close()
					if err != nil {
						if ctx.Err() != nil {
							return nil, ctx.Err()
						}
						if err := recordSkip(path, err); err != nil {
							return nil, err
						}
						continue
					}
					manifest.Attachments++
					meta.Attachments = append(meta.Attachments, path)
				}
				if len(attachments) < size {
					break
				}
			}
			data, err := yaml.Marshal(meta)
			if err != nil {
				return nil, err
			}
			path := "memos/" + time.Unix(memo.CreatedTs, 0).UTC().Format("2006/01") + "/" + backupComponent(memo.UID) + ".md"
			if memo.ParentUID != nil {
				path = "comments/" + backupComponent(*memo.ParentUID) + "/" + backupComponent(memo.UID) + ".md"
			}
			if err := writeBackupEntry(ctx, z, path, io.MultiReader(strings.NewReader("---\n"), bytes.NewReader(data), strings.NewReader("---\n"), strings.NewReader(memo.Content))); err != nil {
				return nil, err
			}
			manifest.Memos++
		}
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if snapshot != "" {
		file, err := os.Open(snapshot)
		if err != nil {
			return nil, err
		}
		err = writeBackupEntry(ctx, z, "database/memos.db", file)
		_ = file.Close()
		if err != nil {
			return nil, err
		}
		manifest.Database = "database/memos.db"
		manifest.Warning = "Contains sensitive credentials: password hashes, access tokens, instance secrets and configuration. Keep this file private."
	} else if s.Profile.Driver != "sqlite" {
		manifest.Database = "Snapshot unavailable for " + s.Profile.Driver + "; use mysqldump or pg_dump separately."
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := writeBackupEntry(ctx, z, "manifest.json", bytes.NewReader(data)); err != nil {
		return nil, err
	}
	return manifest, nil
}

func registerBackupRoutes(router *echo.Group, s *APIV1Service, authorizer *Authorizer) {
	router.GET("/api/v1/admin/backup", func(c *echo.Context) error {
		user, code, err := s.authenticateModerationAdmin(c, authorizer)
		if err != nil {
			return moderationError(c, code, err)
		}
		if s.Profile.Demo {
			return moderationError(c, http.StatusForbidden, errors.New("backups are disabled on the demo instance"))
		}
		mode := c.QueryParam("attachments")
		if mode == "" {
			mode = "local"
		}
		if mode != "local" && mode != "all" && mode != "none" {
			return moderationError(c, http.StatusBadRequest, errors.New("attachments must be local, all or none"))
		}
		database := c.QueryParam("database")
		if database != "" && database != "0" && database != "1" {
			return moderationError(c, http.StatusBadRequest, errors.New("database must be 0 or 1"))
		}
		if !s.backupMu.TryLock() {
			return moderationError(c, http.StatusConflict, errors.New("a backup is already in progress"))
		}
		defer s.backupMu.Unlock()
		ctx := c.Request().Context()
		snapshot := ""
		if database == "1" && s.Profile.Driver == "sqlite" {
			file, err := os.CreateTemp(s.Profile.Data, ".memos-export-*.db")
			if err != nil {
				return err
			}
			snapshot = file.Name()
			_ = file.Close()
			_ = os.Remove(snapshot)
			defer os.Remove(snapshot)
			if err := s.Store.SnapshotSQLite(ctx, snapshot); err != nil {
				return moderationError(c, http.StatusInternalServerError, errors.New("failed to create database snapshot"))
			}
		}
		slog.Info("backup started", "actor_id", user.ID, "time", time.Now().UTC(), "attachments", mode, "database", database == "1")
		header := c.Response().Header()
		header.Set("Content-Type", "application/zip")
		header.Set("Content-Disposition", `attachment; filename="memos-backup-`+time.Now().UTC().Format("20060102-150405")+`.zip"`)
		setAPIResponseNoStoreHeaders(header)
		z := zip.NewWriter(c.Response())
		manifest, err := s.exportBackup(ctx, z, mode, snapshot)
		closeErr := z.Close()
		if err == nil {
			err = closeErr
		}
		if err != nil {
			slog.Warn("backup interrupted or failed", "actor_id", user.ID, "error", err)
			// ZIP headers may already be committed; never append an HTML error page.
			return nil
		}
		slog.Info("backup completed", "actor_id", user.ID, "memos", manifest.Memos, "attachments", manifest.Attachments, "skipped", manifest.SkippedCount)
		return nil
	})
}
