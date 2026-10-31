package frontend

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	teststore "github.com/usememos/memos/store/test"
)

func TestInitialHTMLBrandingOnAllEntryRoutes(t *testing.T) {
	ctx := context.Background()
	s := teststore.NewTestingStore(ctx, t)
	defer s.Close()
	_, err := s.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_GENERAL, Value: &storepb.InstanceSetting_GeneralSetting{GeneralSetting: &storepb.InstanceGeneralSetting{CustomProfile: &storepb.InstanceCustomProfile{Title: "Custom & site", LogoUrl: "/storage/site.png", DefaultAvatarUrl: "/storage/avatar.png"}}}})
	require.NoError(t, err)
	e := echo.New()
	NewFrontendService(&profile.Profile{}, s).Serve(ctx, e)
	for _, path := range []string{"/", "/index.html", "/explore", "/memos/entry", "/space/demo", "/space/missing/home", "/403", "/404", "/unknown/page"} {
		r := httptest.NewRecorder()
		e.ServeHTTP(r, httptest.NewRequest(http.MethodGet, path, nil))
		require.Equal(t, 200, r.Code, path)
		require.Contains(t, r.Body.String(), "<title>Custom &amp; site</title>")
		require.Contains(t, r.Body.String(), `rel="icon" href="/storage/site.png"`)
		require.Contains(t, r.Body.String(), `"title":"Custom \u0026 site"`)
		require.Contains(t, r.Body.String(), `"defaultAvatarUrl":"/storage/avatar.png"`)
		require.Equal(t, frontendHTMLCacheControl, r.Header().Get("Cache-Control"))
	}
}

func TestBrandingEscapesMarkup(t *testing.T) {
	source := `<head><title>Old</title><link rel="icon" href="/logo.webp" /></head>`
	out := brandHTML(source, initialBranding{Title: `</title><script>alert(1)</script>`, LogoURL: `x" onerror="alert(1)`, Description: `</script><script>alert(2)</script>`})
	require.NotContains(t, out, "<script>alert(")
	require.Contains(t, out, `x&#34; onerror=&#34;`)
	require.Equal(t, 1, strings.Count(out, "</script>"))
}

func TestUnavailableSettingsKeepAnOfficialErrorDocument(t *testing.T) {
	s := teststore.NewTestingStore(context.Background(), t)
	require.NoError(t, s.Close())
	e := echo.New()
	e.GET("/", NewFrontendService(&profile.Profile{}, s).serveIndex(fstest.MapFS{
		"index.html": {Data: []byte(`<head><title></title><link rel="icon" href="data:,"/></head>`)},
	}))
	w := httptest.NewRecorder()
	e.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Contains(t, w.Body.String(), "<title>Memos Plus</title>")
	require.Contains(t, w.Body.String(), `rel="icon" href="/favicon.ico"`)
	require.Contains(t, w.Body.String(), `id="memos-branding" data-unavailable`)
}

func TestDefaultBrandingHasOfficialIconBeforeThemedBrowserIcon(t *testing.T) {
	for _, logo := range []string{"/logo.svg", "/logo.webp", "/full-logo.webp"} {
		result := brandHTML(`<head><title></title><link rel="icon" href="data:,"/><link rel="apple-touch-icon" href="data:,"/></head>`, initialBranding{Title: "Memos Plus", LogoURL: logo})
		require.Contains(t, result, `rel="icon" href="/favicon.ico"`)
		require.Contains(t, result, `rel="apple-touch-icon" href="/apple-touch-icon.png"`)
	}
}
