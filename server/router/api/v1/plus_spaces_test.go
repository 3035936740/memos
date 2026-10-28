package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestPlusSpaceDirectoryPermissions(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	admin := createSpaceTestUser(ctx, t, s, "dir-admin", store.RoleAdmin)
	viewer := createSpaceTestUser(ctx, t, s, "dir-viewer", store.RoleUser)
	adminCtx := userCtx(ctx, admin.ID)
	viewerCtx := userCtx(ctx, viewer.ID)
	names := []string{}
	for i, mode := range []v1pb.Space_AccessMode{v1pb.Space_PUBLIC, v1pb.Space_AUTHENTICATED, v1pb.Space_INVITE_ONLY} {
		space, err := s.CreateSpace(adminCtx, &v1pb.CreateSpaceRequest{Space: &v1pb.Space{Title: []string{"Alpha", "Beta", "Secret"}[i], AccessMode: mode, AvatarUrl: "data:image/png;base64,aGVsbG8="}})
		require.NoError(t, err)
		names = append(names, space.Name)
	}
	_, err := s.ListSpaces(ctx, &v1pb.ListSpacesRequest{Scope: v1pb.ListSpacesRequest_JOINED})
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	joined, err := s.ListSpaces(viewerCtx, &v1pb.ListSpacesRequest{Scope: v1pb.ListSpacesRequest_JOINED})
	require.NoError(t, err)
	require.Empty(t, joined.Spaces)
	public, err := s.BatchGetSpaces(ctx, &v1pb.BatchGetSpacesRequest{Names: append(names, "spaces/not-present")})
	require.NoError(t, err)
	require.Len(t, public.Spaces, 1)
	require.Contains(t, public.Spaces[0].AvatarUrl, "/file/spaces/")
	require.NotContains(t, public.Spaces[0].AvatarUrl, "data:")
	visible, err := s.BatchGetSpaces(viewerCtx, &v1pb.BatchGetSpacesRequest{Names: names})
	require.NoError(t, err)
	require.Len(t, visible.Spaces, 2)
	list, err := s.ListSpaces(viewerCtx, &v1pb.ListSpacesRequest{OrderBy: "title", ShowTotalSize: true, PageSize: 1})
	require.NoError(t, err)
	require.Equal(t, int32(2), list.TotalSize)
	require.Equal(t, "Alpha", list.Spaces[0].Title)
	require.NotEmpty(t, list.NextPageToken)
	next, err := s.ListSpaces(viewerCtx, &v1pb.ListSpacesRequest{OrderBy: "title", PageToken: list.NextPageToken})
	require.NoError(t, err)
	require.Len(t, next.Spaces, 1)
	require.Equal(t, "Beta", next.Spaces[0].Title)
	_, err = s.ListSpaces(viewerCtx, &v1pb.ListSpacesRequest{OrderBy: "DROP TABLE space"})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	sample, err := s.SampleSpaces(ctx, &v1pb.SampleSpacesRequest{Count: 1000})
	require.NoError(t, err)
	require.Len(t, sample.Spaces, 1)
	joined, err = s.ListSpaces(adminCtx, &v1pb.ListSpacesRequest{Scope: v1pb.ListSpacesRequest_JOINED})
	require.NoError(t, err)
	require.Len(t, joined.Spaces, 3)
}

func TestPlusDemoMutationGuards(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	admin := createSpaceTestUser(ctx, t, s, "demo-admin", store.RoleAdmin)
	adminCtx := userCtx(ctx, admin.ID)
	s.Profile.Demo = true
	_, err := s.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = s.UpdateUser(adminCtx, &v1pb.UpdateUserRequest{User: &v1pb.User{Name: BuildUserName(admin.Username)}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"nickname"}}})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = s.DeleteUser(adminCtx, &v1pb.DeleteUserRequest{Name: BuildUserName(admin.Username)})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = s.CreateAttachment(adminCtx, &v1pb.CreateAttachmentRequest{Attachment: &v1pb.Attachment{Filename: "too-large.txt", Content: make([]byte, (1<<20)+1)}})
	require.Error(t, err)
}
