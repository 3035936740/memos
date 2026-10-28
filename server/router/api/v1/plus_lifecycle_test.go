package v1

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"gopkg.in/yaml.v3"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestPlusHistoryPrivacyRestoreAndTrash(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	admin := createSpaceTestUser(ctx, t, s, "plus-admin", store.RoleAdmin)
	owner := createSpaceTestUser(ctx, t, s, "plus-owner", store.RoleUser)
	reader := createSpaceTestUser(ctx, t, s, "plus-reader", store.RoleUser)
	ownerCtx := userCtx(ctx, owner.ID)
	m, err := s.CreateMemo(ownerCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "private detail #original", Visibility: v1pb.Visibility_PUBLIC}})
	require.NoError(t, err)
	_, err = s.UpdateMemo(ownerCtx, &v1pb.UpdateMemoRequest{Memo: &v1pb.Memo{Name: m.Name, Content: "new text #replacement"}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}}})
	require.NoError(t, err)
	for _, caller := range []context.Context{ctx, userCtx(ctx, reader.ID)} {
		_, err := s.ListMemoRevisions(caller, &v1pb.ListMemoRevisionsRequest{Name: m.Name})
		require.Contains(t, []codes.Code{codes.Unauthenticated, codes.PermissionDenied, codes.NotFound}, status.Code(err))
		_, err = s.GetMemoRevision(caller, &v1pb.GetMemoRevisionRequest{Name: m.Name, RevisionId: 1})
		require.Error(t, err)
	}
	list, err := s.ListMemoRevisions(userCtx(ctx, admin.ID), &v1pb.ListMemoRevisionsRequest{Name: m.Name})
	require.NoError(t, err)
	require.Len(t, list.Revisions, 1)
	require.Empty(t, list.Revisions[0].Content)
	restored, err := s.RestoreMemoRevision(ownerCtx, &v1pb.RestoreMemoRevisionRequest{Name: m.Name, RevisionId: list.Revisions[0].Id})
	require.NoError(t, err)
	require.Equal(t, m.Content, restored.Content)
	require.Contains(t, restored.Tags, "original")
	require.NotContains(t, restored.Tags, "replacement")
	list, err = s.ListMemoRevisions(ownerCtx, &v1pb.ListMemoRevisionsRequest{Name: m.Name})
	require.NoError(t, err)
	require.Len(t, list.Revisions, 2)
	_, err = s.DeleteMemo(ownerCtx, &v1pb.DeleteMemoRequest{Name: m.Name})
	require.NoError(t, err)
	_, err = s.GetMemo(ctx, &v1pb.GetMemoRequest{Name: m.Name})
	require.Equal(t, codes.NotFound, status.Code(err))
	trash, err := s.ListDeletedMemos(userCtx(ctx, reader.ID), &v1pb.ListDeletedMemosRequest{})
	require.NoError(t, err)
	require.Empty(t, trash.Memos)
	_, err = s.RestoreMemo(userCtx(ctx, reader.ID), &v1pb.RestoreMemoRequest{Name: m.Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	trash, err = s.ListDeletedMemos(ownerCtx, &v1pb.ListDeletedMemosRequest{})
	require.NoError(t, err)
	require.Len(t, trash.Memos, 1)
	require.NotNil(t, trash.Memos[0].DeleteTime)
	require.NotNil(t, trash.Memos[0].PurgeTime)
	_, err = s.RestoreMemo(ownerCtx, &v1pb.RestoreMemoRequest{Name: m.Name})
	require.NoError(t, err)
	_, err = s.ClearMemoRevisions(ownerCtx, &v1pb.ClearMemoRevisionsRequest{Name: m.Name})
	require.NoError(t, err)
	list, err = s.ListMemoRevisions(ownerCtx, &v1pb.ListMemoRevisionsRequest{Name: m.Name})
	require.NoError(t, err)
	require.Empty(t, list.Revisions)
}

func TestPlusBackupAuthorizationContentsAndSnapshot(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	admin := createSpaceTestUser(ctx, t, s, "backup-admin", store.RoleAdmin)
	reader := createSpaceTestUser(ctx, t, s, "backup-reader", store.RoleUser)
	adminCtx := userCtx(ctx, admin.ID)
	raw := "# Original\n\nDo not change: : \"quotes\"\n\n#tag\n"
	m, err := s.CreateMemo(adminCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: raw, Visibility: v1pb.Visibility_PRIVATE}})
	require.NoError(t, err)
	_, err = s.CreateMemoComment(adminCtx, &v1pb.CreateMemoCommentRequest{Name: m.Name, Comment: &v1pb.Memo{Content: "a comment", Visibility: v1pb.Visibility_PRIVATE}})
	require.NoError(t, err)
	uid := strings.TrimPrefix(m.Name, "memos/")
	stored, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	require.NoError(t, err)
	for i, name := range []string{"../missing: quote\".png", "valid.txt"} {
		ref := filepath.Join(s.Store.GetDataDir(), name)
		if i == 1 {
			require.NoError(t, os.WriteFile(ref, []byte("attachment contents"), 0600))
		}
		_, err = s.Store.CreateAttachment(ctx, &store.Attachment{UID: "backup-" + string(rune('a'+i)), CreatorID: admin.ID, Filename: name, StorageType: storepb.AttachmentStorageType_LOCAL, Reference: ref, MemoID: &stored.ID})
		require.NoError(t, err)
	}
	token := func(user *store.User) string {
		p, err := s.CreatePersonalAccessToken(userCtx(ctx, user.ID), &v1pb.CreatePersonalAccessTokenRequest{Parent: BuildUserName(user.Username)})
		require.NoError(t, err)
		return p.Token
	}
	adminToken, readerToken := token(admin), token(reader)
	s.Profile.Data = s.Store.GetDataDir()
	e := echo.New()
	registerBackupRoutes(e.Group(""), s, NewAuthorizer(s.Store, s.Secret))
	request := func(token, query string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, "/api/v1/admin/backup"+query, nil)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		e.ServeHTTP(w, r)
		return w
	}
	require.Equal(t, 401, request("", "").Code)
	require.Equal(t, 403, request(readerToken, "").Code)
	s.backupMu.Lock()
	require.Equal(t, 409, request(adminToken, "").Code)
	s.backupMu.Unlock()
	w := request(adminToken, "?database=1")
	require.Equal(t, 200, w.Code)
	require.Equal(t, "application/zip", w.Header().Get("Content-Type"))
	z, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	require.NoError(t, err)
	entries := map[string][]byte{}
	for _, f := range z.File {
		require.NotContains(t, f.Name, "..")
		r, err := f.Open()
		require.NoError(t, err)
		data, err := io.ReadAll(r)
		r.Close()
		require.NoError(t, err)
		entries[f.Name] = data
	}
	var manifest backupManifest
	require.NoError(t, json.Unmarshal(entries["manifest.json"], &manifest))
	require.Equal(t, 2, manifest.Memos)
	require.Equal(t, 1, manifest.Attachments)
	require.Equal(t, 1, manifest.SkippedCount)
	require.NotEmpty(t, manifest.Warning)
	found, comment := false, false
	for path, data := range entries {
		if strings.HasPrefix(path, "comments/") {
			comment = true
		}
		if strings.HasPrefix(path, "memos/") {
			parts := strings.SplitN(string(data), "---\n", 3)
			require.Len(t, parts, 3)
			var metadata backupMemoMetadata
			require.NoError(t, yaml.Unmarshal([]byte(parts[1]), &metadata))
			require.Equal(t, raw, parts[2])
			require.Equal(t, "PRIVATE", metadata.Visibility)
			found = true
		}
	}
	require.True(t, found)
	require.True(t, comment)
	dbPath := filepath.Join(t.TempDir(), "export.db")
	require.NoError(t, os.WriteFile(dbPath, entries["database/memos.db"], 0600))
	db, err := sql.Open("sqlite", dbPath)
	require.NoError(t, err)
	defer db.Close()
	var count int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM memo").Scan(&count))
	require.Equal(t, 2, count)
	temps, err := filepath.Glob(filepath.Join(s.Profile.Data, ".memos-export-*.db"))
	require.NoError(t, err)
	require.Empty(t, temps)
	s.Profile.Demo = true
	require.Equal(t, 403, request(adminToken, "").Code)
}

func TestPlusTrashExpiryRetriesStorageCleanup(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "expiry-owner", store.RoleAdmin)
	m, err := s.Store.CreateMemo(ctx, &store.Memo{UID: "expired-memo", CreatorID: owner.ID, Content: "expired", Visibility: store.Public})
	require.NoError(t, err)
	path := filepath.Join(s.Store.GetDataDir(), "cleanup.txt")
	require.NoError(t, os.WriteFile(path, []byte("cleanup"), 0600))
	_, err = s.Store.CreateAttachment(ctx, &store.Attachment{UID: "cleanup-att", CreatorID: owner.ID, MemoID: &m.ID, StorageType: storepb.AttachmentStorageType_LOCAL, Reference: path})
	require.NoError(t, err)
	atMicro := time.Now().Add(-31 * 24 * time.Hour).UnixMicro()
	_, err = s.Store.DeleteMemoWithPolicy(ctx, &store.DeleteMemoWithPolicy{MemoID: m.ID, ActorUserID: owner.ID, DeletedTs: &atMicro})
	require.NoError(t, err)
	s.PurgeExpiredTrash(store.WithDeleteAttachmentStorageFailpoint(ctx))
	_, err = os.Stat(path)
	require.NoError(t, err)
	s.PurgeExpiredTrash(ctx)
	_, err = os.Stat(path)
	require.True(t, os.IsNotExist(err))
	var pending int
	require.NoError(t, s.Store.GetDriver().GetDB().QueryRow("SELECT COUNT(*) FROM attachment_cleanup").Scan(&pending))
	require.Zero(t, pending)
}
