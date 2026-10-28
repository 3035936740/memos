package v1

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func richStyleZIP(t *testing.T, source string) []byte {
	t.Helper()
	var data bytes.Buffer
	w := zip.NewWriter(&data)
	files := map[string]string{
		"style.json": `{"kind":"memos-plus.style","version":1,"id":"preview-pack","name":{"en":"Preview"},"description":{"en":"Description","zh-Hans":"简介"},"preview":"art.svg","minVersion":"0.9.0"}`,
		"style.css":  source, "assets/art.svg": `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10Z"/></svg>`,
	}
	for name, content := range files {
		f, err := w.Create(name)
		require.NoError(t, err)
		_, err = f.Write([]byte(content))
		require.NoError(t, err)
	}
	require.NoError(t, w.Close())
	return data.Bytes()
}

func TestStylePackPreviewCapabilities(t *testing.T) {
	s := newIntegrationService(t)
	s.Secret = "test-instance-secret"
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "preview-admin", store.RoleAdmin)
	member := createSpaceTestUser(ctx, t, s, "preview-member", store.RoleUser)
	adminCtx := userCtx(ctx, admin.ID)
	pack, err := s.InstallStylePack(adminCtx, &v1pb.InstallStylePackRequest{Zip: richStyleZIP(t, `.a{mask-image:url(asset:art.svg)}`)})
	require.NoError(t, err)
	require.Equal(t, "简介", pack.Description["zh-Hans"])
	require.Equal(t, "0.9.0", pack.MinVersion)
	require.Contains(t, pack.PreviewUrl, "/assets/art.svg")
	for _, testCtx := range []context.Context{ctx, userCtx(ctx, member.ID)} {
		_, err = s.PreviewStylePack(testCtx, &v1pb.PreviewStylePackRequest{Id: pack.Id})
		require.Error(t, err)
	}
	_, err = s.PreviewStylePack(adminCtx, &v1pb.PreviewStylePackRequest{Id: "missing-pack"})
	require.Equal(t, codes.NotFound, status.Code(err))
	preview, err := s.PreviewStylePack(adminCtx, &v1pb.PreviewStylePackRequest{Id: pack.Id})
	require.NoError(t, err)
	require.WithinDuration(t, time.Now().Add(time.Hour), preview.ExpiresAt.AsTime(), 2*time.Second)
	e := echo.New()
	RegisterStylePackResources(e, s)
	get := func(url string) *httptest.ResponseRecorder {
		r := httptest.NewRecorder()
		e.ServeHTTP(r, httptest.NewRequest(http.MethodGet, url, nil))
		return r
	}
	css := get(preview.CssUrl)
	require.Equal(t, 200, css.Code)
	require.Equal(t, "private, no-store", css.Header().Get("Cache-Control"))
	require.Equal(t, "nosniff", css.Header().Get("X-Content-Type-Options"))
	require.Contains(t, css.Header().Get("Content-Security-Policy"), "sandbox")
	require.Equal(t, "same-origin", css.Header().Get("Cross-Origin-Resource-Policy"))
	token := strings.Split(preview.CssUrl, "/")[3]
	assetURL := "/style-packs/preview/" + token + "/" + pack.Id + "/" + pack.Version + "/assets/art.svg"
	require.Contains(t, css.Body.String(), assetURL)
	asset := get(assetURL)
	require.Equal(t, 200, asset.Code)
	require.NotEmpty(t, asset.Header().Get("Content-Disposition"))
	require.Equal(t, "private, no-store", asset.Header().Get("Cache-Control"))
	require.Equal(t, 404, get(pack.CssUrl).Code)
	require.Equal(t, 404, get(pack.PreviewUrl).Code)
	list, err := s.ListStylePacks(ctx, &v1pb.ListStylePacksRequest{})
	require.NoError(t, err)
	require.Empty(t, list.StylePacks)
	general, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.NotEqual(t, pack.Id, general.FirstVisitDefaultStyle)
	old := s.stylePreviewToken(pack.Id, pack.Version, time.Now().Add(-time.Second))
	for _, badToken := range []string{old, token + "x", s.stylePreviewToken("other-pack", pack.Version, time.Now().Add(time.Hour)), s.stylePreviewToken(pack.Id, "wrong-version", time.Now().Add(time.Hour))} {
		require.Equal(t, 404, get(strings.Replace(preview.CssUrl, token, badToken, 1)).Code)
		require.Equal(t, 404, get(strings.Replace(assetURL, token, badToken, 1)).Code)
	}
	require.Equal(t, 404, get(strings.Replace(assetURL, "art.svg", "__original.zip", 1)).Code)
	enabled := true
	_, err = s.UpdateStylePack(adminCtx, &v1pb.UpdateStylePackRequest{Id: pack.Id, Enabled: &enabled})
	require.NoError(t, err)
	list, err = s.ListStylePacks(ctx, &v1pb.ListStylePacksRequest{})
	require.NoError(t, err)
	require.Equal(t, pack.Description, list.StylePacks[0].Description)
	require.Equal(t, pack.PreviewUrl, list.StylePacks[0].PreviewUrl)
	_, err = s.UpdateStylePack(adminCtx, &v1pb.UpdateStylePackRequest{Id: pack.Id, Zip: richStyleZIP(t, `.a{color:blue}`)})
	require.NoError(t, err)
	require.Equal(t, 404, get(preview.CssUrl).Code)
	require.Equal(t, 404, get(assetURL).Code)
	current, err := s.PreviewStylePack(adminCtx, &v1pb.PreviewStylePackRequest{Id: pack.Id})
	require.NoError(t, err)
	_, err = s.DeleteStylePack(adminCtx, &v1pb.DeleteStylePackRequest{Id: pack.Id})
	require.NoError(t, err)
	require.Equal(t, 404, get(current.CssUrl).Code)
}

func TestValidateStylePackDoesNotPersist(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "validate-admin", store.RoleAdmin)
	member := createSpaceTestUser(ctx, t, s, "validate-member", store.RoleUser)
	for _, testCtx := range []context.Context{ctx, userCtx(ctx, member.ID)} {
		_, err := s.ValidateStylePack(testCtx, &v1pb.ValidateStylePackRequest{})
		require.Error(t, err)
	}
	good, err := s.ValidateStylePack(userCtx(ctx, admin.ID), &v1pb.ValidateStylePackRequest{Zip: richStyleZIP(t, `.a{color:red}`)})
	require.NoError(t, err)
	require.Empty(t, good.Errors)
	require.Equal(t, "preview-pack", good.Manifest.Id)
	require.Positive(t, good.CompiledSize)
	bad, err := s.ValidateStylePack(userCtx(ctx, admin.ID), &v1pb.ValidateStylePackRequest{Zip: richStyleZIP(t, ".a{color:red}\n.a{background:url(https://evil.test)}")})
	require.NoError(t, err)
	require.Len(t, bad.Errors, 1)
	require.Equal(t, "style.css", bad.Errors[0].File)
	require.Equal(t, int32(2), bad.Errors[0].Line)
	for _, table := range []string{"style_pack", "style_pack_resource", "style_pack_resource_chunk"} {
		var count int
		require.NoError(t, s.Store.GetDriver().GetDB().QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count))
		require.Zero(t, count)
	}
	// Validate calls must not change unrelated instance defaults either.
	_, err = s.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_GENERAL, Value: &storepb.InstanceSetting_GeneralSetting{GeneralSetting: &storepb.InstanceGeneralSetting{FirstVisitDefaultStyle: "golden"}}})
	require.NoError(t, err)
	_, err = s.ValidateStylePack(userCtx(ctx, admin.ID), &v1pb.ValidateStylePackRequest{Zip: richStyleZIP(t, `.a{color:red}`)})
	require.NoError(t, err)
	setting, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "golden", setting.FirstVisitDefaultStyle)
}
