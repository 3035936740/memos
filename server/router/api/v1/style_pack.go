package v1

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"

	"github.com/usememos/memos/internal/stylepack"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func (s *APIV1Service) stylePackAdmin(ctx context.Context) (*store.User, error) {
	u, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to load current user")
	}
	if u == nil {
		return nil, status.Error(codes.Unauthenticated, "authentication required")
	}
	if u.Role != store.RoleAdmin {
		return nil, status.Error(codes.PermissionDenied, "administrator required")
	}
	return u, nil
}
func stylePackMetadata(p *store.StylePack) *v1pb.StylePack {
	m := stylepack.Manifest{}
	_ = json.Unmarshal([]byte(p.ManifestJSON), &m)
	meta := &v1pb.StylePack{Id: p.ID, Name: m.Name, Description: m.Description, MinVersion: m.MinVersion, ReactsLike: m.ReactsLike, ColorScheme: m.ColorScheme, CssUrl: "/style-packs/" + p.ID + "/" + p.Version + ".css", Version: p.Version, Enabled: p.Enabled}
	if m.Preview != "" {
		parts := strings.Split(m.Preview, "/")
		for i := range parts {
			parts[i] = url.PathEscape(parts[i])
		}
		meta.PreviewUrl = "/style-packs/" + p.ID + "/" + p.Version + "/assets/" + strings.Join(parts, "/")
	}
	return meta
}
func (s *APIV1Service) ListStylePacks(ctx context.Context, r *v1pb.ListStylePacksRequest) (*v1pb.ListStylePacksResponse, error) {
	if r.IncludeDisabled {
		if _, err := s.stylePackAdmin(ctx); err != nil {
			return nil, err
		}
	}
	packs, err := s.Store.ListStylePacks(ctx, r.IncludeDisabled)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to list styles")
	}
	result := &v1pb.ListStylePacksResponse{StylePacks: []*v1pb.StylePack{}}
	for _, p := range packs {
		result.StylePacks = append(result.StylePacks, stylePackMetadata(p))
	}
	return result, nil
}
func (s *APIV1Service) getStylePackMetadata(ctx context.Context, id string) (*v1pb.StylePack, error) {
	packs, err := s.Store.ListStylePacks(ctx, true)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to list styles")
	}
	for _, p := range packs {
		if p.ID == id {
			return stylePackMetadata(p), nil
		}
	}
	return nil, status.Error(codes.NotFound, "style pack not found")
}
func (s *APIV1Service) InstallStylePack(ctx context.Context, r *v1pb.InstallStylePackRequest) (*v1pb.StylePack, error) {
	u, err := s.stylePackAdmin(ctx)
	if err != nil {
		return nil, err
	}
	pack, err := stylepack.Parse(r.Zip)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	if err = s.Store.SaveStylePack(ctx, pack, u.ID, false); err != nil {
		return nil, status.Error(codes.FailedPrecondition, err.Error())
	}
	return s.getStylePackMetadata(ctx, pack.Manifest.ID)
}
func (s *APIV1Service) UpdateStylePack(ctx context.Context, r *v1pb.UpdateStylePackRequest) (*v1pb.StylePack, error) {
	u, err := s.stylePackAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if len(r.Zip) > 0 {
		pack, e := stylepack.Parse(r.Zip)
		if e != nil {
			return nil, status.Error(codes.InvalidArgument, e.Error())
		}
		if pack.Manifest.ID != r.Id {
			return nil, status.Error(codes.InvalidArgument, "manifest ID must match request ID")
		}
		if e = s.Store.SaveStylePack(ctx, pack, u.ID, true); e != nil {
			return nil, status.Error(codes.FailedPrecondition, e.Error())
		}
	}
	if r.Enabled != nil {
		if err = s.Store.ChangeStylePack(ctx, r.Id, *r.Enabled, false); err != nil {
			return nil, status.Error(codes.FailedPrecondition, err.Error())
		}
	}
	return s.getStylePackMetadata(ctx, r.Id)
}
func (s *APIV1Service) DeleteStylePack(ctx context.Context, r *v1pb.DeleteStylePackRequest) (*emptypb.Empty, error) {
	if _, err := s.stylePackAdmin(ctx); err != nil {
		return nil, err
	}
	if err := s.Store.ChangeStylePack(ctx, r.Id, false, true); err != nil {
		return nil, status.Error(codes.NotFound, "style pack not found")
	}
	return &emptypb.Empty{}, nil
}
func (s *APIV1Service) ExportStylePack(ctx context.Context, r *v1pb.ExportStylePackRequest) (*v1pb.ExportStylePackResponse, error) {
	if _, err := s.stylePackAdmin(ctx); err != nil {
		return nil, err
	}
	meta, err := s.getStylePackMetadata(ctx, r.Id)
	if err != nil {
		return nil, err
	}
	a, err := s.Store.StylePackResource(ctx, r.Id, meta.Version, "__original.zip", true)
	if err != nil {
		return nil, status.Error(codes.Internal, "cannot export style")
	}
	if a == nil {
		return nil, status.Error(codes.NotFound, "style archive missing")
	}
	return &v1pb.ExportStylePackResponse{Zip: a.Content}, nil
}

func RegisterStylePackResources(e *echo.Echo, s *APIV1Service) {
	serve := func(c *echo.Context, name, version string, preview bool) error {
		if preview {
			c.Response().Header().Set("Cache-Control", "private, no-store")
			if !s.validStylePreview(c.Param("token"), c.Param("id"), version, time.Now()) {
				return c.NoContent(404)
			}
		}
		if strings.HasPrefix(name, "__") && name != "__compiled.css" {
			return c.NoContent(404)
		}
		var a *stylepack.Asset
		var err error
		if preview {
			a, err = s.Store.StylePackPreviewResource(c.Request().Context(), c.Param("id"), version, name)
		} else {
			a, err = s.Store.StylePackResource(c.Request().Context(), c.Param("id"), version, name, false)
		}
		if err != nil {
			return c.NoContent(500)
		}
		if a == nil {
			return c.NoContent(404)
		}
		h := c.Response().Header()
		if !preview {
			h.Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
		if a.ContentType == "image/svg+xml" {
			h.Set("Content-Disposition", `inline; filename="image.svg"`)
		}
		content := a.Content
		if preview && name == "__compiled.css" {
			original := "/style-packs/" + c.Param("id") + "/" + version + "/assets/"
			replacement := "/style-packs/preview/" + c.Param("token") + "/" + c.Param("id") + "/" + version + "/assets/"
			content = []byte(strings.ReplaceAll(string(content), original, replacement))
		}
		return c.Blob(http.StatusOK, a.ContentType, content)
	}
	e.GET("/style-packs/:id/:version", func(c *echo.Context) error {
		v := c.Param("version")
		if !strings.HasSuffix(v, ".css") {
			return c.NoContent(404)
		}
		return serve(c, "__compiled.css", strings.TrimSuffix(v, ".css"), false)
	})
	e.GET("/style-packs/:id/:version/assets/*", func(c *echo.Context) error {
		name := c.Param("*")
		if strings.HasPrefix(name, "__") {
			return c.NoContent(404)
		}
		return serve(c, name, c.Param("version"), false)
	})
	e.GET("/style-packs/preview/:token/:id/:version", func(c *echo.Context) error {
		v := c.Param("version")
		c.Response().Header().Set("Cache-Control", "private, no-store")
		if !strings.HasSuffix(v, ".css") {
			return c.NoContent(404)
		}
		return serve(c, "__compiled.css", strings.TrimSuffix(v, ".css"), true)
	})
	e.GET("/style-packs/preview/:token/:id/:version/assets/*", func(c *echo.Context) error {
		if strings.HasPrefix(c.Param("*"), "__") {
			c.Response().Header().Set("Cache-Control", "private, no-store")
			return c.NoContent(404)
		}
		return serve(c, c.Param("*"), c.Param("version"), true)
	})
}
