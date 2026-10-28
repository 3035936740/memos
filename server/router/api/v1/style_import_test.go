package v1

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/blogimport"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func testStyleZIP(t *testing.T, id, css string) []byte {
	t.Helper()
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	m, err := w.Create("style.json")
	require.NoError(t, err)
	require.NoError(t, json.NewEncoder(m).Encode(map[string]any{"kind": "memos-plus.style", "version": 1, "id": id, "name": map[string]string{"en": "Test"}}))
	f, err := w.Create("style.css")
	require.NoError(t, err)
	_, err = f.Write([]byte(css))
	require.NoError(t, err)
	require.NoError(t, w.Close())
	return b.Bytes()
}
func TestStylePacksAuthorizationFallbackAndVersionedResources(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "style-admin", store.RoleAdmin)
	user := createSpaceTestUser(ctx, t, s, "style-user", store.RoleUser)
	adminCtx := userCtx(ctx, admin.ID)
	archive := testStyleZIP(t, "test-paper", `:root{--color:red}.a{color:var(--color)}`)
	_, err := s.InstallStylePack(userCtx(ctx, user.ID), &v1pb.InstallStylePackRequest{Zip: archive})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	pack, err := s.InstallStylePack(adminCtx, &v1pb.InstallStylePackRequest{Zip: archive})
	require.NoError(t, err)
	require.False(t, pack.Enabled)
	list, err := s.ListStylePacks(ctx, &v1pb.ListStylePacksRequest{})
	require.NoError(t, err)
	require.Empty(t, list.StylePacks)
	e := echo.New()
	RegisterStylePackResources(e, s)
	get := func(url string) *httptest.ResponseRecorder {
		r := httptest.NewRecorder()
		e.ServeHTTP(r, httptest.NewRequest(http.MethodGet, url, nil))
		return r
	}
	require.Equal(t, 404, get(pack.CssUrl).Code)
	enabled := true
	_, err = s.UpdateStylePack(adminCtx, &v1pb.UpdateStylePackRequest{Id: pack.Id, Enabled: &enabled})
	require.NoError(t, err)
	response := get(pack.CssUrl)
	require.Equal(t, 200, response.Code)
	require.Contains(t, response.Header().Get("Cache-Control"), "immutable")
	originalCSS := response.Body.String()
	_, err = s.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_GENERAL, Value: &storepb.InstanceSetting_GeneralSetting{GeneralSetting: &storepb.InstanceGeneralSetting{FirstVisitDefaultStyle: pack.Id}}})
	require.NoError(t, err)
	newPack, err := s.UpdateStylePack(adminCtx, &v1pb.UpdateStylePackRequest{Id: pack.Id, Zip: testStyleZIP(t, pack.Id, `.a{color:blue}`)})
	require.NoError(t, err)
	require.NotEqual(t, pack.Version, newPack.Version)
	require.Equal(t, originalCSS, get(pack.CssUrl).Body.String())
	export, err := s.ExportStylePack(adminCtx, &v1pb.ExportStylePackRequest{Id: pack.Id})
	require.NoError(t, err)
	require.NotEmpty(t, export.Zip)
	_, err = s.DeleteStylePack(adminCtx, &v1pb.DeleteStylePackRequest{Id: pack.Id})
	require.NoError(t, err)
	general, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "default", general.FirstVisitDefaultStyle)
	require.Equal(t, 404, get(pack.CssUrl).Code)
}
func TestImportTimestampsReviewAndAtomicDuplicate(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	u := createSpaceTestUser(ctx, t, s, "import-user", store.RoleUser)
	ctx = userCtx(ctx, u.ID)
	stamp := time.Date(2020, 2, 3, 4, 5, 6, 0, time.UTC)
	_, err := s.CreateMemo(ctx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "normal", Visibility: v1pb.Visibility_PRIVATE, CreateTime: timestamppb.New(stamp)}})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	entry := importArticle{Post: blogimport.Post{ID: "post.md", Content: "# Test\n\nbody #tag", Created: stamp, Updated: stamp.Add(time.Hour), Draft: true}}
	job := &store.MemoImportJob{ID: "job", Source: "markdown"}
	memo, err := s.importBlogArticle(ctx, u, job, entry, runImportRequest{Visibility: "PUBLIC"}, nil)
	require.NoError(t, err)
	require.Equal(t, stamp.Unix(), memo.CreatedTs)
	require.Equal(t, stamp.Add(time.Hour).Unix(), memo.UpdatedTs)
	require.Equal(t, store.Private, memo.Visibility)
	require.True(t, memo.Payload.Draft)
	_, err = s.importBlogArticle(ctx, u, job, entry, runImportRequest{Visibility: "PUBLIC"}, nil)
	require.Error(t, err)
	var count int
	require.NoError(t, s.Store.GetDriver().GetDB().QueryRowContext(ctx, `SELECT COUNT(*) FROM memo WHERE creator_id=?`, u.ID).Scan(&count))
	require.Equal(t, 1, count)
	require.NoError(t, s.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"forbidden-import"}}))
	entry.ID = "other.md"
	entry.Content = "forbidden-import"
	_, err = s.importBlogArticle(ctx, u, job, entry, runImportRequest{Visibility: "PUBLIC"}, nil)
	require.Error(t, err)
}

func TestImportImageRewritePreservesCodeAndLinks(t *testing.T) {
	text := "![local](photo.png)\n\n`photo.png`\n\n[link](photo.png)"
	out := rewriteImportImages(text, map[string]string{"photo.png": "/file/image/photo.png"})
	require.Contains(t, out, `![local](/file/image/photo.png)`)
	require.Contains(t, out, "`photo.png`")
	require.Contains(t, out, `[link](photo.png)`)
}
