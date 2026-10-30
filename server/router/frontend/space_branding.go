package frontend

import (
	"encoding/json"
	"html"
	"net/url"
	"strings"

	"github.com/labstack/echo/v5"

	"github.com/usememos/memos/store"
)

type initialSpaceBranding struct {
	RouteID    string             `json:"routeId"`
	ViewerName string             `json:"viewerName"`
	Public     bool               `json:"public"`
	Space      spaceBrandMetadata `json:"space"`
}

type spaceBrandMetadata struct {
	Name      string `json:"name"`
	URLSlug   string `json:"urlSlug"`
	Title     string `json:"title"`
	AvatarURL string `json:"avatarUrl"`
}

// Authenticate the navigation request just like image requests. Never embed
// private Space metadata in another visitor's initial HTML.
func (s *FrontendService) initialSpace(c *echo.Context) *initialSpaceBranding {
	raw := strings.SplitN(strings.TrimPrefix(c.Request().URL.Path, "/space/"), "/", 2)[0]
	id, err := url.PathUnescape(raw)
	if err != nil || id == "" {
		return nil
	}
	ctx := c.Request().Context()
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &id})
	if err != nil || space == nil {
		return nil
	}
	user, authErr := s.authenticator.AuthenticateToUser(ctx, c.Request().Header.Get("Authorization"), c.Request().Header.Get("Cookie"))
	if authErr != nil {
		user = nil
	}
	allowed := false
	public := false
	viewerName := ""
	if user == nil {
		anonymous, err := s.Store.AllowsAnonymousAccess(ctx)
		allowed = err == nil && anonymous && space.AccessMode == store.SpaceAccessModePublic
		public = allowed
	} else {
		viewerName = "users/" + user.Username
		allowed = user.Role == store.RoleAdmin || space.AccessMode == store.SpaceAccessModePublic || space.AccessMode == store.SpaceAccessModeAuthenticated
		if !allowed {
			member, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &user.ID})
			allowed = err == nil && member != nil && member.Role.IsActiveMember()
		}
	}
	if !allowed {
		return nil
	}
	avatar := space.AvatarURL
	if strings.HasPrefix(avatar, "data:") {
		avatar = "/file/spaces/" + space.UID + "/avatar"
	}
	return &initialSpaceBranding{RouteID: id, ViewerName: viewerName, Public: public,
		Space: spaceBrandMetadata{Name: "spaces/" + space.UID, URLSlug: space.URLSlug, Title: space.Title, AvatarURL: avatar}}
}

func (s *FrontendService) brandSpaceHTML(c *echo.Context, source string, instance initialBranding) string {
	// A real title and icon are always present, even for an unavailable Space.
	document := initialBranding{Title: "Memos Plus", LogoURL: "/favicon.ico"}
	initial := s.initialSpace(c)
	if initial != nil {
		document.Title = initial.Space.Title
		document.LogoURL = initial.Space.AvatarURL
		if document.Title == "" {
			document.Title = "Memos Plus"
		}
		if document.LogoURL == "" {
			document.LogoURL = "/space-avatar.svg"
		}
	}
	result := brandHTML(source, instance, document)
	if initial == nil {
		return result
	}
	data, _ := json.Marshal(initial)
	bootstrap := `<script id="memos-space-branding" type="application/json">` + string(data) + `</script>`
	if initial.Space.AvatarURL != "" {
		bootstrap += `<link rel="preload" as="image" href="` + html.EscapeString(initial.Space.AvatarURL) + `" />`
	}
	return strings.Replace(result, "</head>", bootstrap+"</head>", 1)
}
