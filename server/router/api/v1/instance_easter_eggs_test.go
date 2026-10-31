package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestEasterEggSettingsPersistAndRequireAdmin(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "eggs-admin", store.RoleAdmin)
	member := createSpaceTestUser(ctx, t, s, "eggs-member", store.RoleUser)
	initial, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.False(t, initial.DisableEasterEggs)
	require.Empty(t, initial.DisabledEasterEggs)
	request := func(all bool, ids ...string) *v1pb.UpdateInstanceSettingRequest {
		return &v1pb.UpdateInstanceSettingRequest{Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/GENERAL",
			Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{
				DisableEasterEggs: all, DisabledEasterEggs: ids,
			}},
		}}
	}
	_, err = s.UpdateInstanceSetting(ctx, request(true, "glitch"))
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = s.UpdateInstanceSetting(userCtx(ctx, member.ID), request(true, "glitch"))
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	for _, all := range []bool{true, false} {
		updated, e := s.UpdateInstanceSetting(userCtx(ctx, admin.ID), request(all, "rain", "glitch", "rain"))
		require.NoError(t, e)
		require.Equal(t, []string{"glitch", "rain"}, updated.GetGeneralSetting().DisabledEasterEggs)
		stored, e := s.Store.GetInstanceGeneralSetting(ctx)
		require.NoError(t, e)
		require.Equal(t, all, stored.DisableEasterEggs)
		require.Equal(t, []string{"glitch", "rain"}, stored.DisabledEasterEggs)
		public, e := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
		require.NoError(t, e)
		require.Equal(t, all, public.GetGeneralSetting().DisableEasterEggs)
		require.Equal(t, stored.DisabledEasterEggs, public.GetGeneralSetting().DisabledEasterEggs)
	}
	_, err = s.UpdateInstanceSetting(userCtx(ctx, admin.ID), request(false, "unknown"))
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	stored, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, []string{"glitch", "rain"}, stored.DisabledEasterEggs)

	_, err = s.UpdateInstanceSetting(userCtx(ctx, admin.ID), request(false, easterEggIDs...))
	require.NoError(t, err)
	_, err = s.UpdateInstanceSetting(userCtx(ctx, admin.ID), request(false))
	require.NoError(t, err)
	stored, err = s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Empty(t, stored.DisabledEasterEggs)
}

func TestNormalizeDisabledEasterEggs(t *testing.T) {
	_, err := normalizeDisabledEasterEggs(make([]string, len(easterEggIDs)+1))
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}
