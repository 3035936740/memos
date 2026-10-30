package frontend

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io/fs"
	"net/http"
	"strings"

	"github.com/labstack/echo/v5"
)

// Use the same public-brand fingerprint in the initial HTML and the client.
// The app identity stays fixed even when its name or icon changes.
func webAppBrandVersion(branding initialBranding) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(branding.Title + "\x00" + branding.LogoURL + "\x00" + branding.Description))
	return fmt.Sprintf("%08x", h.Sum32())
}

func (s *FrontendService) serveWebAppManifest(c *echo.Context) error {
	setting, err := s.Store.GetInstanceGeneralSetting(c.Request().Context())
	if err != nil {
		return c.NoContent(http.StatusServiceUnavailable)
	}
	branding := resolveInitialBranding(setting)
	source, err := fs.ReadFile(getFileSystem("dist"), "site.webmanifest")
	if err != nil {
		return err
	}
	var manifest map[string]any
	if err := json.Unmarshal(source, &manifest); err != nil {
		return err
	}
	manifest["id"] = "/"
	manifest["name"] = branding.Title
	manifest["short_name"] = branding.Title
	if branding.Description != "" {
		manifest["description"] = branding.Description
	}
	// Bundled PNGs remain suitable for OS launchers; a custom logo replaces
	// them completely instead of leaving a competing default M+ candidate.
	switch strings.Split(branding.LogoURL, "?")[0] {
	case "/logo.svg", "/logo.webp", "/full-logo.webp":
	default:
		manifest["icons"] = []map[string]string{{"src": branding.LogoURL, "sizes": "any", "purpose": "any"}}
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	c.Response().Header().Set(echo.HeaderCacheControl, frontendHTMLCacheControl)
	c.Response().Header().Set("X-Content-Type-Options", "nosniff")
	return c.Blob(http.StatusOK, "application/manifest+json; charset=utf-8", data)
}
