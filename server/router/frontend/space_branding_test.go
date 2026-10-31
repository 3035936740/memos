package frontend

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/auth"
	"github.com/usememos/memos/store"
	teststore "github.com/usememos/memos/store/test"
)

func TestSpaceFirstHTMLContainsAuthorizedTitleAndAvatar(t *testing.T) {
	ctx := context.Background()
	s := teststore.NewTestingStore(ctx, t)
	defer s.Close()
	_, err := s.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_ACCESS,
		Value: &storepb.InstanceSetting_AccessSetting{AccessSetting: &storepb.InstanceAccessSetting{AccessMode: storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PUBLIC}}})
	require.NoError(t, err)
	_, err = s.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_GENERAL,
		Value: &storepb.InstanceSetting_GeneralSetting{GeneralSetting: &storepb.InstanceGeneralSetting{
			CustomProfile: &storepb.InstanceCustomProfile{Title: "Instance & brand", LogoUrl: "/storage/site.png"},
		}}})
	require.NoError(t, err)
	owner, err := s.CreateUser(ctx, &store.User{Username: "brand-owner", Role: store.RoleUser})
	require.NoError(t, err)
	_, err = s.CreateSpace(ctx, &store.Space{UID: "public-brand", URLSlug: "sharedspace", Title: "Public & Space", AccessMode: store.SpaceAccessModePublic, AvatarURL: "data:image/png;base64,AA=="}, owner.ID)
	require.NoError(t, err)
	_, err = s.CreateSpace(ctx, &store.Space{UID: "private-brand", Title: "Private Space", AccessMode: store.SpaceAccessModeInviteOnly, AvatarURL: "/storage/private.png"}, owner.ID)
	require.NoError(t, err)
	const secret = "space-brand-test-secret"
	token, expires, err := auth.GenerateRefreshToken(owner.ID, "brand-session", []byte(secret))
	require.NoError(t, err)
	require.NoError(t, s.AddUserRefreshToken(ctx, owner.ID, &storepb.RefreshTokensUserSetting_RefreshToken{TokenId: "brand-session", ExpiresAt: timestamppb.New(expires)}))
	e := echo.New()
	NewFrontendService(&profile.Profile{}, s, secret).Serve(ctx, e)
	read := func(path string, signedIn bool) string {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if signedIn {
			r.AddCookie(&http.Cookie{Name: auth.RefreshTokenCookieName, Value: token})
		}
		w := httptest.NewRecorder()
		e.ServeHTTP(w, r)
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, frontendHTMLCacheControl, w.Header().Get("Cache-Control"))
		return w.Body.String()
	}
	for _, path := range []string{"/space/public-brand", "/space/sharedspace/home"} {
		body := read(path, false)
		require.Contains(t, body, "<title>Public &amp; Space</title>")
		require.Contains(t, body, `rel="icon" href="/file/spaces/public-brand/avatar"`)
		require.Contains(t, body, `rel="preload" as="image" href="/file/spaces/public-brand/avatar"`)
		require.Contains(t, body, `id="memos-space-branding"`)
		require.Contains(t, body, `"name":"spaces/public-brand"`)
	}
	private := read("/space/private-brand", true)
	require.Contains(t, private, "<title>Private Space</title>")
	require.Contains(t, private, `rel="icon" href="/storage/private.png"`)
	require.Contains(t, private, `"viewerName":"users/brand-owner"`)
	for _, path := range []string{"/space/private-brand", "/space/private-brand/home", "/space/missing", "/space/missing/home"} {
		body := read(path, false)
		require.Contains(t, body, "<title>Instance &amp; brand</title>")
		require.Contains(t, body, `rel="icon" href="/storage/site.png"`)
		require.NotContains(t, body, `id="memos-space-branding"`)
		require.NotContains(t, body, "Private Space")
		require.NotContains(t, body, "/storage/private.png")
	}
}
