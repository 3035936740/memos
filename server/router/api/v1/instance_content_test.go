package v1

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestAboutNavigationSettingPersistsAndRequiresAdmin(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "about-admin", store.RoleAdmin)
	user := createSpaceTestUser(ctx, t, s, "about-user", store.RoleUser)
	initial, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.False(t, initial.HideAboutNavigation)
	setting := func(hidden bool) *v1pb.InstanceSetting {
		return &v1pb.InstanceSetting{Name: "instance/settings/GENERAL", Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{HideAboutNavigation: hidden}}}
	}
	_, err = s.UpdateInstanceSetting(userCtx(ctx, user.ID), &v1pb.UpdateInstanceSettingRequest{Setting: setting(true)})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	for _, hidden := range []bool{true, false} {
		updated, e := s.UpdateInstanceSetting(userCtx(ctx, admin.ID), &v1pb.UpdateInstanceSettingRequest{Setting: setting(hidden)})
		require.NoError(t, e)
		require.Equal(t, hidden, updated.GetGeneralSetting().HideAboutNavigation)
		stored, e := s.Store.GetInstanceGeneralSetting(ctx)
		require.NoError(t, e)
		require.Equal(t, hidden, stored.HideAboutNavigation)
		public, e := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
		require.NoError(t, e)
		require.Equal(t, hidden, public.GetGeneralSetting().HideAboutNavigation)
	}
}

func TestFilterInstanceContentJSON(t *testing.T) {
	input := `[{"id":"public","access":"public"},{"id":"default"},{"id":"member","access":"authenticated"},{"id":"admin","access":"admin","markdown":"secret"}]`

	var anonymous []map[string]any
	require.NoError(t, json.Unmarshal([]byte(filterInstanceContentJSON(input, false)), &anonymous))
	require.Len(t, anonymous, 2)
	require.Equal(t, "public", anonymous[0]["id"])
	require.Equal(t, "default", anonymous[1]["id"])

	var authenticated []map[string]any
	require.NoError(t, json.Unmarshal([]byte(filterInstanceContentJSON(input, true)), &authenticated))
	require.Len(t, authenticated, 3)
	require.Equal(t, "member", authenticated[2]["id"])

	require.Equal(t, "[]", filterInstanceContentJSON("not-json", true))
}

func TestInstanceContentSettingsRoundTrip(t *testing.T) {
	original := &v1pb.InstanceSetting_GeneralSetting{
		NavigationJson:                 `[{"id":"about"}]`,
		CustomPagesJson:                `[{"slug":"about"}]`,
		MemoCategoriesJson:             `[{"slug":"design"}]`,
		MemoPageSize:                   12,
		FirstVisitDefaultLocale:        "zh-Hans",
		FirstVisitDefaultTheme:         "cosmic-dark",
		FirstVisitDefaultStyle:         "magazine",
		PreferencesResetAt:             1_798_000_000_000,
		MusicConfigJson:                `{"enabled":true,"defaultVolume":0.2,"mode":"random","tracks":[{"id":"track-1","title":"Song","url":"/file/attachments/audio-1"}]}`,
		DefaultBackgroundImageUrl:      "https://example.com/background.webp",
		DefaultMemberMemoVisibility:    "PUBLIC",
		DefaultMemberSaveMediaMetadata: true,
	}

	stored := convertInstanceGeneralSettingToStore(original)
	require.Equal(t, original.NavigationJson, stored.NavigationJson)
	require.Equal(t, original.CustomPagesJson, stored.CustomPagesJson)
	require.Equal(t, original.MemoCategoriesJson, stored.MemoCategoriesJson)
	require.Equal(t, original.MemoPageSize, stored.MemoPageSize)
	require.Equal(t, original.FirstVisitDefaultLocale, stored.FirstVisitDefaultLocale)
	require.Equal(t, original.FirstVisitDefaultTheme, stored.FirstVisitDefaultTheme)
	require.Equal(t, original.FirstVisitDefaultStyle, stored.FirstVisitDefaultStyle)
	require.Equal(t, original.PreferencesResetAt, stored.PreferencesResetAt)
	require.Equal(t, original.MusicConfigJson, stored.MusicConfigJson)
	require.Equal(t, original.DefaultBackgroundImageUrl, stored.DefaultBackgroundImageUrl)
	require.Equal(t, original.DefaultMemberMemoVisibility, stored.DefaultMemberMemoVisibility)
	require.Equal(t, original.DefaultMemberSaveMediaMetadata, stored.DefaultMemberSaveMediaMetadata)

	roundTripped := convertInstanceGeneralSettingFromStore(stored)
	require.Equal(t, original.NavigationJson, roundTripped.NavigationJson)
	require.Equal(t, original.CustomPagesJson, roundTripped.CustomPagesJson)
	require.Equal(t, original.MemoCategoriesJson, roundTripped.MemoCategoriesJson)
	require.Equal(t, original.MemoPageSize, roundTripped.MemoPageSize)
	require.Equal(t, original.FirstVisitDefaultLocale, roundTripped.FirstVisitDefaultLocale)
	require.Equal(t, original.FirstVisitDefaultTheme, roundTripped.FirstVisitDefaultTheme)
	require.Equal(t, original.FirstVisitDefaultStyle, roundTripped.FirstVisitDefaultStyle)
	require.Equal(t, original.PreferencesResetAt, roundTripped.PreferencesResetAt)
	require.Equal(t, original.MusicConfigJson, roundTripped.MusicConfigJson)
	require.Equal(t, original.DefaultBackgroundImageUrl, roundTripped.DefaultBackgroundImageUrl)
	require.Equal(t, original.DefaultMemberMemoVisibility, roundTripped.DefaultMemberMemoVisibility)
	require.Equal(t, original.DefaultMemberSaveMediaMetadata, roundTripped.DefaultMemberSaveMediaMetadata)
}
