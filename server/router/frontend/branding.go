package frontend

import (
	"encoding/json"
	"html"
	"io/fs"
	"net/http"
	"regexp"
	"strings"

	"github.com/labstack/echo/v5"

	storepb "github.com/usememos/memos/proto/gen/store"
)

type initialBranding struct {
	Title            string `json:"title"`
	Description      string `json:"description"`
	LogoURL          string `json:"logoUrl"`
	DefaultAvatarURL string `json:"defaultAvatarUrl"`
}

var titleElement = regexp.MustCompile(`(?is)<title>.*?</title>`)
var iconElement = regexp.MustCompile(`(?i)<link\b[^>]*\brel="(?:icon|apple-touch-icon)"[^>]*>`)
var manifestElement = regexp.MustCompile(`(?i)<link\b[^>]*\brel="manifest"[^>]*>`)

func brandHTML(source string, branding initialBranding, documentBrand ...initialBranding) string {
	document := branding
	if len(documentBrand) > 0 {
		document = documentBrand[0]
	}
	source = titleElement.ReplaceAllStringFunc(source, func(string) string { return "<title>" + html.EscapeString(document.Title) + "</title>" })
	source = iconElement.ReplaceAllStringFunc(source, func(link string) string {
		rel := "icon"
		iconURL := document.LogoURL
		if strings.Contains(link, "apple-touch-icon") {
			rel = "apple-touch-icon"
		}
		switch strings.Split(iconURL, "?")[0] {
		case "/logo.svg", "/logo.webp", "/full-logo.webp":
			// Keep an official M+ icon even if JavaScript or the SVG request fails.
			// The frontend replaces it with the themed SVG when ready.
			iconURL = "/favicon.ico"
			if rel == "apple-touch-icon" {
				iconURL = "/apple-touch-icon.png"
			}
		default:
		}
		return `<link rel="` + rel + `" href="` + html.EscapeString(iconURL) + `" />`
	})
	source = manifestElement.ReplaceAllStringFunc(source, func(string) string {
		return `<link rel="manifest" href="/site.webmanifest?v=` + webAppBrandVersion(branding) + `" />`
	})
	// JSON escapes HTML delimiters, including a malicious </script>.
	data, _ := json.Marshal(branding)
	meta := `<meta name="application-name" content="` + html.EscapeString(branding.Title) + `" />` +
		`<meta name="apple-mobile-web-app-title" content="` + html.EscapeString(branding.Title) + `" />`
	return strings.Replace(source, "</head>", meta+`<script id="memos-branding" type="application/json">`+string(data)+"</script></head>", 1)
}

func resolveInitialBranding(setting *storepb.InstanceGeneralSetting) initialBranding {
	branding := initialBranding{Title: "Memos Plus", LogoURL: "/logo.svg"}
	if p := setting.GetCustomProfile(); p != nil {
		if p.Title != "" {
			branding.Title = p.Title
		}
		if p.LogoUrl != "" {
			branding.LogoURL = p.LogoUrl
		}
		branding.Description = p.Description
		branding.DefaultAvatarURL = p.DefaultAvatarUrl
	}
	return branding
}

func (s *FrontendService) serveIndex(files fs.FS) echo.HandlerFunc {
	return func(c *echo.Context) error {
		setting, err := s.Store.GetInstanceGeneralSetting(c.Request().Context())
		source, readErr := fs.ReadFile(files, "index.html")
		if readErr != nil {
			return readErr
		}
		setFrontendCacheHeaders(c, c.Request().URL.Path)
		if err != nil {
			// Keep a real branded error document instead of an empty response.
			// The client may reuse a successful public brand from localStorage,
			// but must not persist this temporary default over that cached brand.
			body := brandHTML(string(source), resolveInitialBranding(nil))
			body = strings.Replace(body, `id="memos-branding"`, `id="memos-branding" data-unavailable`, 1)
			return c.HTML(http.StatusServiceUnavailable, body)
		}
		branding := resolveInitialBranding(setting)
		if strings.HasPrefix(c.Request().URL.Path, "/space/") {
			return c.HTML(http.StatusOK, s.brandSpaceHTML(c, string(source), branding))
		}
		return c.HTML(http.StatusOK, brandHTML(string(source), branding))
	}
}
