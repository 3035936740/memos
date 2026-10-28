package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func TestFestivalEffectsSetting(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	admin, err := ts.CreateHostUser(ctx, "festival-admin")
	require.NoError(t, err)
	member, err := ts.CreateRegularUser(ctx, "festival-member")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	memberCtx := ts.CreateUserContext(ctx, member.ID)

	setting, err := ts.Service.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
	require.NoError(t, err)
	require.False(t, setting.GetGeneralSetting().GetDisableFestivalEffects(), "existing sites keep holiday effects enabled")
	setting.GetGeneralSetting().DisableFestivalEffects = true
	for _, deniedCtx := range []context.Context{ctx, memberCtx} {
		_, err := ts.Service.UpdateInstanceSetting(deniedCtx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
		require.Contains(t, []codes.Code{codes.Unauthenticated, codes.PermissionDenied}, status.Code(err))
	}

	for _, disabled := range []bool{true, false} {
		setting.GetGeneralSetting().DisableFestivalEffects = disabled
		updated, err := ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
		require.NoError(t, err)
		require.Equal(t, disabled, updated.GetGeneralSetting().GetDisableFestivalEffects())
		stored, err := ts.Store.GetInstanceGeneralSetting(ctx)
		require.NoError(t, err)
		require.Equal(t, disabled, stored.GetDisableFestivalEffects())
		for _, readerCtx := range []context.Context{ctx, memberCtx} {
			public, err := ts.Service.GetInstanceSetting(readerCtx, &v1pb.GetInstanceSettingRequest{Name: setting.Name})
			require.NoError(t, err)
			require.Equal(t, disabled, public.GetGeneralSetting().GetDisableFestivalEffects())
		}
	}
}
