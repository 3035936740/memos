package fileserver

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"

	"github.com/labstack/echo/v5"

	"github.com/usememos/memos/store"
)

func (s *FileServerService) serveSpaceAvatar(c *echo.Context) error {
	ctx := c.Request().Context()
	uid := c.Param("uid")
	user, err := s.getCurrentUser(ctx, c)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "avatar not found")
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &uid})
	if err != nil || space == nil {
		return echo.NewHTTPError(http.StatusNotFound, "avatar not found")
	}
	allowed := space.AccessMode == store.SpaceAccessModePublic
	if user == nil {
		anonymous, err := s.Store.AllowsAnonymousAccess(ctx)
		allowed = allowed && err == nil && anonymous
	} else {
		allowed = allowed || space.AccessMode == store.SpaceAccessModeAuthenticated || user.Role == store.RoleAdmin
		if !allowed {
			member, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &user.ID})
			allowed = err == nil && member != nil && member.Role.IsActiveMember()
		}
	}
	if !allowed {
		return echo.NewHTTPError(http.StatusNotFound, "avatar not found")
	}
	parts := dataURIRegex.FindStringSubmatch(space.AvatarURL)
	if len(parts) != 3 || !avatarAllowedTypes[parts[1]] {
		return echo.NewHTTPError(http.StatusNotFound, "avatar not found")
	}
	blob, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "avatar not found")
	}
	sum := sha256.Sum256(blob)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`
	header := c.Response().Header()
	header.Set("Cache-Control", "private, no-cache")
	header.Set("ETag", etag)
	header.Set("X-Content-Type-Options", "nosniff")
	if c.Request().Header.Get("If-None-Match") == etag {
		return c.NoContent(http.StatusNotModified)
	}
	return c.Blob(http.StatusOK, parts[1], blob)
}
