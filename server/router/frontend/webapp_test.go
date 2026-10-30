package frontend

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	teststore "github.com/usememos/memos/store/test"
)

func TestWebAppManifestFollowsSavedBrand(t *testing.T) {
	ctx := context.Background()
	s := teststore.NewTestingStore(ctx, t)
	defer s.Close()
	e := echo.New()
	NewFrontendService(&profile.Profile{}, s).Serve(ctx, e)

	readManifest := func() map[string]any {
		r := httptest.NewRecorder()
		e.ServeHTTP(r, httptest.NewRequest(http.MethodGet, "/site.webmanifest?v=old", nil))
		require.Equal(t, http.StatusOK, r.Code)
		require.Contains(t, r.Header().Get("Content-Type"), "application/manifest+json")
		require.Equal(t, frontendHTMLCacheControl, r.Header().Get("Cache-Control"))
		var result map[string]any
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &result))
		return result
	}
	initial := readManifest()
	require.Equal(t, "Memos Plus", initial["name"])
	require.Equal(t, "/", initial["id"])
	require.Len(t, initial["icons"], 2)

	for _, logo := range []string{"/storage/custom-brand.png", "https://example.com/brand.svg?version=2"} {
		_, err := s.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
			Key: storepb.InstanceSettingKey_GENERAL,
			Value: &storepb.InstanceSetting_GeneralSetting{GeneralSetting: &storepb.InstanceGeneralSetting{
				CustomProfile: &storepb.InstanceCustomProfile{Title: "Custom & site", Description: "My app", LogoUrl: logo},
			}},
		})
		require.NoError(t, err)
		updated := readManifest()
		require.Equal(t, "Custom & site", updated["name"])
		require.Equal(t, "Custom & site", updated["short_name"])
		require.Equal(t, "My app", updated["description"])
		require.Equal(t, initial["id"], updated["id"])
		require.Equal(t, initial["start_url"], updated["start_url"])
		require.Equal(t, initial["share_target"], updated["share_target"])
		icons := updated["icons"].([]any)
		require.Len(t, icons, 1)
		require.Equal(t, logo, icons[0].(map[string]any)["src"])
	}
}

func TestWebAppMetadataEscapesTitleAndChangesManifestRevision(t *testing.T) {
	source := `<head><title></title><link rel="manifest" href="/site.webmanifest"/></head>`
	first := initialBranding{Title: `Custom " <site>`, LogoURL: "/storage/first.png"}
	second := first
	second.LogoURL = "/storage/second.png"
	require.NotEqual(t, webAppBrandVersion(first), webAppBrandVersion(second))
	result := brandHTML(source, first)
	require.Contains(t, result, `/site.webmanifest?v=`+webAppBrandVersion(first))
	require.Contains(t, result, `name="application-name" content="Custom &#34; &lt;site&gt;"`)
	require.Contains(t, result, `name="apple-mobile-web-app-title"`)
}
