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

func TestInstanceDefaultAvatarPersistenceAndPermissions(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "avatar-admin", store.RoleAdmin)
	member := createSpaceTestUser(ctx, t, s, "avatar-member", store.RoleUser)
	request := &v1pb.UpdateInstanceSettingRequest{Setting: &v1pb.InstanceSetting{Name: "instance/settings/GENERAL", Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{CustomProfile: &v1pb.InstanceSetting_GeneralSetting_CustomProfile{Title: "Custom", LogoUrl: "/storage/logo.png", DefaultAvatarUrl: "/storage/avatar.png"}}}}}
	_, err := s.UpdateInstanceSetting(userCtx(ctx, member.ID), request)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = s.UpdateInstanceSetting(userCtx(ctx, admin.ID), request)
	require.NoError(t, err)
	got, err := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
	require.NoError(t, err)
	require.Equal(t, "/storage/avatar.png", got.GetGeneralSetting().CustomProfile.DefaultAvatarUrl)
	stored, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "/storage/avatar.png", stored.CustomProfile.DefaultAvatarUrl)
	for _, bad := range []string{"javascript:alert(1)", "//external.test/image.png", "/\\external.test/image.png", "data:text/html,x"} {
		request.Setting.GetGeneralSetting().CustomProfile.DefaultAvatarUrl = bad
		_, err = s.UpdateInstanceSetting(userCtx(ctx, admin.ID), request)
		require.Equal(t, codes.InvalidArgument, status.Code(err), bad)
	}
}
