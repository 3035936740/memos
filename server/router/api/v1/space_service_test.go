package v1

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func createSpaceTestUser(ctx context.Context, t *testing.T, service *APIV1Service, username string, role store.Role) *store.User {
	t.Helper()
	user, err := service.Store.CreateUser(ctx, &store.User{
		Username: username,
		Role:     role,
		Email:    username + "@example.com",
	})
	require.NoError(t, err)
	return user
}

func inviteSpaceTestUser(ctx context.Context, t *testing.T, service *APIV1Service, inviter, invitee *store.User, space *v1pb.Space, role v1pb.SpaceMember_Role) *v1pb.SpaceInvitation {
	t.Helper()
	invitation, err := service.CreateSpaceInvitation(userCtx(ctx, inviter.ID), &v1pb.CreateSpaceInvitationRequest{
		Parent: space.Name,
		SpaceInvitation: &v1pb.SpaceInvitation{
			Invitee: BuildUserName(invitee.Username),
			Role:    role,
		},
	})
	require.NoError(t, err)
	return invitation
}

func inviteAndAcceptSpaceTestUser(ctx context.Context, t *testing.T, service *APIV1Service, inviter, invitee *store.User, space *v1pb.Space, role v1pb.SpaceMember_Role) *v1pb.SpaceMember {
	t.Helper()
	invitation := inviteSpaceTestUser(ctx, t, service, inviter, invitee, space, role)
	membership, err := service.AcceptSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.AcceptSpaceInvitationRequest{Name: invitation.Name})
	require.NoError(t, err)
	return membership
}

func TestCreateSpaceGeneratesUUIDV4WhenSpaceUIDIsEmpty(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "space-id-owner", store.RoleUser)

	for _, spaceUID := range []string{"", " \t\n"} {
		space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
			SpaceId: spaceUID,
			Space:   &v1pb.Space{Title: "Same title"},
		})
		require.NoError(t, err)

		uid, err := ExtractSpaceUIDFromName(space.Name)
		require.NoError(t, err)
		parsed, err := uuid.Parse(uid)
		require.NoError(t, err)
		require.Equal(t, parsed.String(), uid, "generated Space UID must be a canonical lowercase UUID")
		require.Equal(t, byte(4), parsed[6]>>4, "generated Space UID must be UUID v4")
	}
}

func TestSpaceURLSlugAndAccessModeVisibility(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "space-visibility-owner", store.RoleUser)
	viewer := createSpaceTestUser(ctx, t, service, "space-visibility-viewer", store.RoleUser)

	create := func(uid, title, slug string, accessMode v1pb.Space_AccessMode) *v1pb.Space {
		t.Helper()
		space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
			SpaceId: uid,
			Space: &v1pb.Space{
				Title:      title,
				UrlSlug:    slug,
				AccessMode: accessMode,
			},
		})
		require.NoError(t, err)
		return space
	}

	privateSpace := create("private-space-id", "Private", "PrivateAlias", v1pb.Space_INVITE_ONLY)
	authenticatedSpace := create("authenticated-space-id", "Authenticated", "MembersArea", v1pb.Space_AUTHENTICATED)
	publicSpace := create("public-space-id", "Public", "MySpace", v1pb.Space_PUBLIC)
	require.Equal(t, "myspace", publicSpace.UrlSlug)

	guestSpaces, err := service.ListSpaces(ctx, &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.Equal(t, []string{publicSpace.Name}, spaceNames(guestSpaces.Spaces))
	require.Equal(t, v1pb.SpaceMember_ROLE_UNSPECIFIED, guestSpaces.Spaces[0].CurrentUserRole)

	viewerSpaces, err := service.ListSpaces(userCtx(ctx, viewer.ID), &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.ElementsMatch(t, []string{authenticatedSpace.Name, publicSpace.Name}, spaceNames(viewerSpaces.Spaces))

	ownerSpaces, err := service.ListSpaces(userCtx(ctx, owner.ID), &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.ElementsMatch(t, []string{privateSpace.Name, authenticatedSpace.Name, publicSpace.Name}, spaceNames(ownerSpaces.Spaces))
	for _, space := range ownerSpaces.Spaces {
		require.Equal(t, v1pb.SpaceMember_ADMIN, space.CurrentUserRole)
	}

	byAlias, err := service.GetSpace(ctx, &v1pb.GetSpaceRequest{Name: "spaces/myspace"})
	require.NoError(t, err)
	require.Equal(t, publicSpace.Name, byAlias.Name, "the immutable resource name remains UUID/custom-ID based")
	require.Equal(t, "myspace", byAlias.UrlSlug)

	_, err = service.GetSpace(ctx, &v1pb.GetSpaceRequest{Name: "spaces/membersarea"})
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = service.GetSpace(userCtx(ctx, viewer.ID), &v1pb.GetSpaceRequest{Name: "spaces/membersarea"})
	require.NoError(t, err)
	_, err = service.GetSpace(userCtx(ctx, viewer.ID), &v1pb.GetSpaceRequest{Name: "spaces/privatealias"})
	require.Equal(t, codes.NotFound, status.Code(err))

	updated, err := service.UpdateSpace(userCtx(ctx, owner.ID), &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: publicSpace.Name, UrlSlug: "NewAlias"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"url_slug"}},
	})
	require.NoError(t, err)
	require.Equal(t, "newalias", updated.UrlSlug)
	_, err = service.GetSpace(ctx, &v1pb.GetSpaceRequest{Name: "spaces/myspace"})
	require.Equal(t, codes.NotFound, status.Code(err))
	_, err = service.GetSpace(ctx, &v1pb.GetSpaceRequest{Name: "spaces/newalias"})
	require.NoError(t, err)

	_, err = service.UpdateSpace(userCtx(ctx, owner.ID), &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: publicSpace.Name, UrlSlug: "membersarea"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"url_slug"}},
	})
	require.Equal(t, codes.AlreadyExists, status.Code(err))
	_, err = service.UpdateSpace(userCtx(ctx, owner.ID), &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: publicSpace.Name, UrlSlug: "bad-slug"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"url_slug"}},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	_, err = service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "newalias",
		Space:   &v1pb.Space{Title: "Conflicts with alias"},
	})
	require.Equal(t, codes.AlreadyExists, status.Code(err))
}

func TestOpenSpaceMemoReadAndPublishForNonMembers(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "open-space-owner", store.RoleUser)
	outsider := createSpaceTestUser(ctx, t, service, "open-space-outsider", store.RoleUser)
	admin := createSpaceTestUser(ctx, t, service, "open-space-admin", store.RoleAdmin)
	_, err := service.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey_ACCESS,
		Value: &storepb.InstanceSetting_AccessSetting{AccessSetting: &storepb.InstanceAccessSetting{
			AccessMode: storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PUBLIC,
		}},
	})
	require.NoError(t, err)

	createSpace := func(id string, mode v1pb.Space_AccessMode) *v1pb.Space {
		t.Helper()
		space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
			SpaceId: id,
			Space:   &v1pb.Space{Title: id, AccessMode: mode},
		})
		require.NoError(t, err)
		return space
	}
	publicSpace := createSpace("open-public", v1pb.Space_PUBLIC)
	authenticatedSpace := createSpace("open-authenticated", v1pb.Space_AUTHENTICATED)
	inviteOnlySpace := createSpace("closed-invite-only", v1pb.Space_INVITE_ONLY)
	syncDisabled := false
	unsyncedSpace, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "open-unsynced",
		Space: &v1pb.Space{
			Title:          "open-unsynced",
			AccessMode:     v1pb.Space_PUBLIC,
			SyncToMainFeed: &syncDisabled,
		},
	})
	require.NoError(t, err)

	createMemo := func(user *store.User, space *v1pb.Space, content string) (*v1pb.Memo, error) {
		t.Helper()
		spaceName := space.Name
		return service.CreateMemo(userCtx(ctx, user.ID), &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{
			Content:    content,
			Visibility: v1pb.Visibility_SPACE,
			Space:      &spaceName,
		}})
	}
	for _, item := range []struct {
		space   *v1pb.Space
		content string
	}{
		{publicSpace, "public Space audience"},
		{authenticatedSpace, "authenticated Space audience"},
		{inviteOnlySpace, "invite-only Space audience"},
	} {
		_, err := createMemo(owner, item.space, item.content)
		require.NoError(t, err)
	}
	unsyncedMemo, err := createMemo(owner, unsyncedSpace, "unsynced Space audience")
	require.NoError(t, err)

	mainFeed, err := service.ListMemos(userCtx(ctx, outsider.ID), &v1pb.ListMemosRequest{})
	require.NoError(t, err)
	require.NotContains(t, memoNames(mainFeed.Memos), unsyncedMemo.Name)
	mainFeed, err = service.ListMemos(userCtx(ctx, admin.ID), &v1pb.ListMemosRequest{})
	require.NoError(t, err)
	require.Contains(t, memoNames(mainFeed.Memos), unsyncedMemo.Name)

	listSpace := func(callCtx context.Context, space *v1pb.Space) (*v1pb.ListMemosResponse, error) {
		t.Helper()
		return service.ListMemos(callCtx, &v1pb.ListMemosRequest{
			Filter: `space == "` + space.Name + `" && visibility in ["SPACE"]`,
		})
	}

	listed, err := listSpace(userCtx(ctx, outsider.ID), publicSpace)
	require.NoError(t, err)
	require.Len(t, listed.Memos, 1)
	listed, err = listSpace(userCtx(ctx, outsider.ID), unsyncedSpace)
	require.NoError(t, err)
	require.Equal(t, []string{unsyncedMemo.Name}, memoNames(listed.Memos))
	listed, err = listSpace(userCtx(ctx, outsider.ID), authenticatedSpace)
	require.NoError(t, err)
	require.Len(t, listed.Memos, 1)
	_, err = listSpace(userCtx(ctx, outsider.ID), inviteOnlySpace)
	require.Equal(t, codes.NotFound, status.Code(err))

	listed, err = listSpace(ctx, publicSpace)
	require.NoError(t, err)
	require.Len(t, listed.Memos, 1)
	_, err = listSpace(ctx, authenticatedSpace)
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = listSpace(ctx, inviteOnlySpace)
	require.Equal(t, codes.NotFound, status.Code(err))

	publicMemo, err := createMemo(outsider, publicSpace, "outsider public Space memo")
	require.NoError(t, err)
	_, err = createMemo(outsider, authenticatedSpace, "outsider authenticated Space memo")
	require.NoError(t, err)
	_, err = createMemo(outsider, inviteOnlySpace, "outsider invite-only Space memo")
	require.Equal(t, codes.NotFound, status.Code(err))

	publicMemo.Content = "outsider updated public Space memo"
	updated, err := service.UpdateMemo(userCtx(ctx, outsider.ID), &v1pb.UpdateMemoRequest{
		Memo:       publicMemo,
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}},
	})
	require.NoError(t, err)
	require.Equal(t, publicMemo.Content, updated.Content)
}

func spaceNames(spaces []*v1pb.Space) []string {
	names := make([]string, 0, len(spaces))
	for _, space := range spaces {
		names = append(names, space.Name)
	}
	return names
}

func memoNames(memos []*v1pb.Memo) []string {
	names := make([]string, 0, len(memos))
	for _, memo := range memos {
		names = append(names, memo.Name)
	}
	return names
}

func TestSpaceServiceMembershipVisibilityAndGovernance(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "space-owner", store.RoleUser)
	member := createSpaceTestUser(ctx, t, service, "space-member", store.RoleUser)
	applicationAdmin := createSpaceTestUser(ctx, t, service, "application-admin", store.RoleAdmin)

	space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "team-notes",
		Space:   &v1pb.Space{Title: " Team notes ", Description: " Shared work "},
	})
	require.NoError(t, err)
	require.Equal(t, "spaces/team-notes", space.Name)
	require.Equal(t, "Team notes", space.Title)
	require.Equal(t, v1pb.SpaceMember_ADMIN, space.CurrentUserRole)
	require.Equal(t, int32(1), space.MemberCount)
	_, err = service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "team-notes",
		Space:   &v1pb.Space{Title: "Duplicate"},
	})
	require.Equal(t, codes.AlreadyExists, status.Code(err))

	members, err := service.ListSpaceMembers(userCtx(ctx, owner.ID), &v1pb.ListSpaceMembersRequest{Parent: space.Name})
	require.NoError(t, err)
	require.Len(t, members.SpaceMembers, 1)
	require.Equal(t, v1pb.SpaceMember_ADMIN, members.SpaceMembers[0].Role)

	_, err = service.GetSpace(userCtx(ctx, applicationAdmin.ID), &v1pb.GetSpaceRequest{Name: space.Name})
	require.Equal(t, codes.NotFound, status.Code(err), "application ADMIN must not bypass space membership")
	adminSpaces, err := service.ListSpaces(userCtx(ctx, applicationAdmin.ID), &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.Empty(t, adminSpaces.Spaces)

	invitation, err := service.CreateSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.CreateSpaceInvitationRequest{
		Parent:          space.Name,
		SpaceInvitation: &v1pb.SpaceInvitation{Invitee: BuildUserName(member.Username), Role: v1pb.SpaceMember_USER},
	})
	require.NoError(t, err)
	require.Equal(t, "spaces/team-notes/invitations/space-member", invitation.Name)
	require.Equal(t, space.Name, invitation.Space.Name, "the invitation must identify the Space without granting membership access")
	require.Equal(t, space.Title, invitation.Space.Title)
	require.Equal(t, space.Description, invitation.Space.Description)
	require.Equal(t, v1pb.SpaceMember_ROLE_UNSPECIFIED, invitation.Space.CurrentUserRole)
	require.Zero(t, invitation.Space.MemberCount)
	notifications, err := service.ListUserNotifications(userCtx(ctx, member.ID), &v1pb.ListUserNotificationsRequest{Parent: BuildUserName(member.Username)})
	require.NoError(t, err)
	require.Len(t, notifications.Notifications, 1)
	notification := notifications.Notifications[0]
	require.Equal(t, v1pb.UserNotification_SPACE_INVITATION, notification.Type)
	require.Equal(t, invitation.Name, notification.GetSpaceInvitation().Invitation)
	require.Equal(t, space.Name, notification.GetSpaceInvitation().Space)
	require.Equal(t, space.Title, notification.GetSpaceInvitation().SpaceTitle)

	_, err = service.GetSpace(userCtx(ctx, member.ID), &v1pb.GetSpaceRequest{Name: space.Name})
	require.Equal(t, codes.NotFound, status.Code(err), "a pending invitation must not grant Space access")
	invitedUserSpaces, err := service.ListSpaces(userCtx(ctx, member.ID), &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.Empty(t, invitedUserSpaces.Spaces)
	members, err = service.ListSpaceMembers(userCtx(ctx, owner.ID), &v1pb.ListSpaceMembersRequest{Parent: space.Name})
	require.NoError(t, err)
	require.Len(t, members.SpaceMembers, 1, "an invitation must not appear as an active membership")

	spaceInvitations, err := service.ListSpaceInvitations(userCtx(ctx, owner.ID), &v1pb.ListSpaceInvitationsRequest{Parent: space.Name})
	require.NoError(t, err)
	require.Equal(t, []*v1pb.SpaceInvitation{invitation}, spaceInvitations.SpaceInvitations)
	userInvitations, err := service.ListUserSpaceInvitations(userCtx(ctx, member.ID), &v1pb.ListUserSpaceInvitationsRequest{Parent: BuildUserName(member.Username)})
	require.NoError(t, err)
	require.Equal(t, []*v1pb.SpaceInvitation{invitation}, userInvitations.SpaceInvitations)

	_, err = service.CreateSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.CreateSpaceInvitationRequest{
		Parent:          space.Name,
		SpaceInvitation: &v1pb.SpaceInvitation{Invitee: BuildUserName(member.Username), Role: v1pb.SpaceMember_USER},
	})
	require.Equal(t, codes.AlreadyExists, status.Code(err))
	_, err = service.AcceptSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.AcceptSpaceInvitationRequest{Name: invitation.Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err), "an administrator cannot accept for the invitee")

	createdMember, err := service.AcceptSpaceInvitation(userCtx(ctx, member.ID), &v1pb.AcceptSpaceInvitationRequest{Name: invitation.Name})
	require.NoError(t, err)
	require.Equal(t, "spaces/team-notes/members/space-member", createdMember.Name)
	require.Equal(t, v1pb.SpaceMember_USER, createdMember.Role)
	notifications, err = service.ListUserNotifications(userCtx(ctx, member.ID), &v1pb.ListUserNotificationsRequest{Parent: BuildUserName(member.Username)})
	require.NoError(t, err)
	require.Empty(t, notifications.Notifications, "accepting an invitation must remove its notification")
	_, err = service.GetSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.GetSpaceInvitationRequest{Name: invitation.Name})
	require.Equal(t, codes.NotFound, status.Code(err))

	memberSpace, err := service.GetSpace(userCtx(ctx, member.ID), &v1pb.GetSpaceRequest{Name: space.Name})
	require.NoError(t, err)
	require.Equal(t, v1pb.SpaceMember_USER, memberSpace.CurrentUserRole)
	require.Equal(t, int32(2), memberSpace.MemberCount)
	memberSpaces, err := service.ListSpaces(userCtx(ctx, member.ID), &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.Len(t, memberSpaces.Spaces, 1)
	require.Equal(t, v1pb.SpaceMember_USER, memberSpaces.Spaces[0].CurrentUserRole)
	require.Equal(t, int32(2), memberSpaces.Spaces[0].MemberCount)
	updatedSpace, err := service.UpdateSpace(userCtx(ctx, owner.ID), &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: space.Name, Title: "Updated team notes"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title"}},
	})
	require.NoError(t, err)
	require.Equal(t, v1pb.SpaceMember_ADMIN, updatedSpace.CurrentUserRole)
	require.Equal(t, int32(2), updatedSpace.MemberCount)
	_, err = service.UpdateSpace(userCtx(ctx, member.ID), &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: space.Name, Title: "not allowed"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title"}},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	_, err = service.UpdateSpaceMember(userCtx(ctx, owner.ID), &v1pb.UpdateSpaceMemberRequest{
		SpaceMember: &v1pb.SpaceMember{Name: "spaces/team-notes/members/space-owner", Role: v1pb.SpaceMember_USER},
		UpdateMask:  &fieldmaskpb.FieldMask{Paths: []string{"role"}},
	})
	require.Equal(t, codes.FailedPrecondition, status.Code(err), "the last active ADMIN cannot be demoted")
}

func TestSpaceInvitationDeclineRevokeAndSelectedRole(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "invitation-owner", store.RoleUser)
	invitee := createSpaceTestUser(ctx, t, service, "invitation-invitee", store.RoleUser)
	secondInvitee := createSpaceTestUser(ctx, t, service, "invitation-second", store.RoleUser)
	archivedInvitee := createSpaceTestUser(ctx, t, service, "invitation-archived", store.RoleUser)
	pendingThenArchived := createSpaceTestUser(ctx, t, service, "invitation-pending-archived", store.RoleUser)
	space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "invitation-lifecycle",
		Space:   &v1pb.Space{Title: "Invitation lifecycle"},
	})
	require.NoError(t, err)

	invitation := inviteSpaceTestUser(ctx, t, service, owner, invitee, space, v1pb.SpaceMember_ADMIN)
	got, err := service.GetSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.GetSpaceInvitationRequest{Name: invitation.Name})
	require.NoError(t, err)
	require.Equal(t, v1pb.SpaceMember_ADMIN, got.Role)
	_, err = service.DeleteSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.DeleteSpaceInvitationRequest{Name: invitation.Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err), "the invitee cannot revoke an invitation")

	_, err = service.DeleteSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.DeleteSpaceInvitationRequest{Name: invitation.Name})
	require.NoError(t, err)
	_, err = service.AcceptSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.AcceptSpaceInvitationRequest{Name: invitation.Name})
	require.Equal(t, codes.NotFound, status.Code(err), "a revoked invitation cannot be accepted")

	invitation = inviteSpaceTestUser(ctx, t, service, owner, invitee, space, v1pb.SpaceMember_ADMIN)
	_, err = service.DeclineSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.DeclineSpaceInvitationRequest{Name: invitation.Name})
	require.NoError(t, err)
	_, err = service.GetSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.GetSpaceInvitationRequest{Name: invitation.Name})
	require.Equal(t, codes.NotFound, status.Code(err))

	invitation = inviteSpaceTestUser(ctx, t, service, owner, invitee, space, v1pb.SpaceMember_ADMIN)
	membership, err := service.AcceptSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.AcceptSpaceInvitationRequest{Name: invitation.Name})
	require.NoError(t, err)
	require.Equal(t, v1pb.SpaceMember_ADMIN, membership.Role, "accept must preserve the role selected at invite time")

	secondInvitation := inviteSpaceTestUser(ctx, t, service, owner, secondInvitee, space, v1pb.SpaceMember_USER)
	listed, err := service.ListSpaceInvitations(userCtx(ctx, invitee.ID), &v1pb.ListSpaceInvitationsRequest{Parent: space.Name})
	require.NoError(t, err, "any active Space administrator may manage invitations")
	require.Equal(t, []*v1pb.SpaceInvitation{secondInvitation}, listed.SpaceInvitations)
	_, err = service.AcceptSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.AcceptSpaceInvitationRequest{Name: secondInvitation.Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err), "an administrator cannot accept for another user")
	_, err = service.DeleteSpaceInvitation(userCtx(ctx, invitee.ID), &v1pb.DeleteSpaceInvitationRequest{Name: secondInvitation.Name})
	require.NoError(t, err)

	pendingArchivedInvitation := inviteSpaceTestUser(ctx, t, service, owner, pendingThenArchived, space, v1pb.SpaceMember_USER)
	archived := store.Archived
	_, err = service.Store.UpdateUser(ctx, &store.UpdateUser{ID: pendingThenArchived.ID, RowStatus: &archived})
	require.NoError(t, err, "a pending invitation is not an active membership and must not prevent archival")
	listed, err = service.ListSpaceInvitations(userCtx(ctx, owner.ID), &v1pb.ListSpaceInvitationsRequest{Parent: space.Name})
	require.NoError(t, err)
	require.Equal(t, []*v1pb.SpaceInvitation{pendingArchivedInvitation}, listed.SpaceInvitations, "administrators must retain a way to revoke invitations for archived users")
	_, err = service.AcceptSpaceInvitation(userCtx(ctx, pendingThenArchived.ID), &v1pb.AcceptSpaceInvitationRequest{Name: pendingArchivedInvitation.Name})
	require.Equal(t, codes.Unauthenticated, status.Code(err), "an archived user cannot accept an invitation")
	_, err = service.DeleteSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.DeleteSpaceInvitationRequest{Name: pendingArchivedInvitation.Name})
	require.NoError(t, err)

	_, err = service.Store.UpdateUser(ctx, &store.UpdateUser{ID: archivedInvitee.ID, RowStatus: &archived})
	require.NoError(t, err)
	_, err = service.CreateSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.CreateSpaceInvitationRequest{
		Parent:          space.Name,
		SpaceInvitation: &v1pb.SpaceInvitation{Invitee: BuildUserName(archivedInvitee.Username), Role: v1pb.SpaceMember_USER},
	})
	require.Equal(t, codes.FailedPrecondition, status.Code(err), "only NORMAL users can be invited")
}

func TestSpaceServiceHardDeleteLifecycle(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "delete-owner", store.RoleUser)
	target := createSpaceTestUser(ctx, t, service, "delete-target", store.RoleUser)
	applicationAdmin := createSpaceTestUser(ctx, t, service, "delete-application-admin", store.RoleAdmin)

	space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "delete-space",
		Space:   &v1pb.Space{Title: "Delete me"},
	})
	require.NoError(t, err)
	spaceUID, err := ExtractSpaceUIDFromName(space.Name)
	require.NoError(t, err)
	storedSpace, err := service.Store.GetSpace(ctx, &store.FindSpace{UID: &spaceUID})
	require.NoError(t, err)
	require.NotNil(t, storedSpace)
	assignedMemo, err := service.Store.CreateMemo(ctx, &store.Memo{
		UID:        "delete-space-memo",
		CreatorID:  owner.ID,
		Content:    "delete with Space",
		Visibility: store.Private,
		SpaceID:    &storedSpace.ID,
	})
	require.NoError(t, err)
	attachmentPath := filepath.Join(t.TempDir(), "space-delete-attachment.txt")
	require.NoError(t, os.WriteFile(attachmentPath, []byte("delete me"), 0o600))
	_, err = service.Store.CreateAttachment(ctx, &store.Attachment{
		UID:         "delete-space-attachment",
		CreatorID:   owner.ID,
		Filename:    "space-delete-attachment.txt",
		MemoID:      &assignedMemo.ID,
		StorageType: storepb.AttachmentStorageType_LOCAL,
		Reference:   attachmentPath,
		Payload:     &storepb.AttachmentPayload{},
	})
	require.NoError(t, err)
	inviteAndAcceptSpaceTestUser(ctx, t, service, owner, target, space, v1pb.SpaceMember_USER)

	_, err = service.UpdateSpace(userCtx(ctx, owner.ID), &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: space.Name},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"state"}},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err), "Space has no archive or restore state")

	_, err = service.DeleteSpace(userCtx(ctx, target.ID), &v1pb.DeleteSpaceRequest{Name: space.Name})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = service.DeleteSpace(userCtx(ctx, applicationAdmin.ID), &v1pb.DeleteSpaceRequest{Name: space.Name})
	require.NoError(t, err, "application ADMIN can remove any Space for moderation")
	require.NoFileExists(t, attachmentPath)
	_, err = service.GetSpace(userCtx(ctx, owner.ID), &v1pb.GetSpaceRequest{Name: space.Name})
	require.Equal(t, codes.NotFound, status.Code(err))
	spaces, err := service.ListSpaces(userCtx(ctx, owner.ID), &v1pb.ListSpacesRequest{})
	require.NoError(t, err)
	require.Empty(t, spaces.Spaces)
}

func TestSpaceServiceHidesMembershipForInactiveUser(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "inactive-member-owner", store.RoleUser)
	member := createSpaceTestUser(ctx, t, service, "inactive-member", store.RoleUser)

	space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "inactive-member-space",
		Space:   &v1pb.Space{Title: "Inactive member space"},
	})
	require.NoError(t, err)
	inviteAndAcceptSpaceTestUser(ctx, t, service, owner, member, space, v1pb.SpaceMember_USER)

	// The normal archive path rejects users with memberships. Simulate an
	// inconsistent row to verify that membership reads still fail closed.
	_, err = service.Store.GetDriver().GetDB().ExecContext(ctx, "UPDATE user SET row_status = 'ARCHIVED' WHERE id = ?", member.ID)
	require.NoError(t, err)

	members, err := service.ListSpaceMembers(userCtx(ctx, owner.ID), &v1pb.ListSpaceMembersRequest{Parent: space.Name})
	require.NoError(t, err)
	require.Len(t, members.SpaceMembers, 1)
	require.Equal(t, BuildUserName(owner.Username), members.SpaceMembers[0].User)

	_, err = service.GetSpaceMember(userCtx(ctx, owner.ID), &v1pb.GetSpaceMemberRequest{
		Name: buildSpaceMemberName("inactive-member-space", member.Username),
	})
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestUpdateSpaceMemberAcceptsGatewayInferredIdentityMask(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "gateway-owner", store.RoleUser)
	member := createSpaceTestUser(ctx, t, service, "gateway-member", store.RoleUser)

	space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "gateway-space",
		Space:   &v1pb.Space{Title: "Gateway Space"},
	})
	require.NoError(t, err)
	createdMember := inviteAndAcceptSpaceTestUser(ctx, t, service, owner, member, space, v1pb.SpaceMember_USER)

	mux := runtime.NewServeMux()
	require.NoError(t, v1pb.RegisterSpaceServiceHandlerServer(ctx, mux, service))
	patchMember := func(body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPatch, "/api/v1/"+createdMember.Name, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		request = request.WithContext(userCtx(request.Context(), owner.ID))
		response := httptest.NewRecorder()
		mux.ServeHTTP(response, request)
		return response
	}

	response := patchMember(`{"user":"users/gateway-member","role":"ADMIN"}`)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	spaceUID, err := ExtractSpaceUIDFromName(space.Name)
	require.NoError(t, err)
	storedSpace, err := service.Store.GetSpace(ctx, &store.FindSpace{UID: &spaceUID})
	require.NoError(t, err)
	require.NotNil(t, storedSpace)
	storedMember, err := service.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &storedSpace.ID, UserID: &member.ID})
	require.NoError(t, err)
	require.NotNil(t, storedMember)
	require.Equal(t, store.SpaceMemberRoleAdmin, storedMember.Role)

	response = patchMember(`{"user":"users/gateway-owner","role":"USER"}`)
	require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
	storedMember, err = service.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &storedSpace.ID, UserID: &member.ID})
	require.NoError(t, err)
	require.NotNil(t, storedMember)
	require.Equal(t, store.SpaceMemberRoleAdmin, storedMember.Role, "a mismatched immutable user must not update the membership")
}

func TestCreateSpaceInvitationClassifiesTargetUserErrors(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, service, "lookup-owner", store.RoleUser)
	target := createSpaceTestUser(ctx, t, service, "lookup-target", store.RoleUser)
	space, err := service.CreateSpace(userCtx(ctx, owner.ID), &v1pb.CreateSpaceRequest{
		SpaceId: "lookup-space",
		Space:   &v1pb.Space{Title: "Lookup Space"},
	})
	require.NoError(t, err)

	_, err = service.CreateSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.CreateSpaceInvitationRequest{
		Parent:          space.Name,
		SpaceInvitation: &v1pb.SpaceInvitation{Invitee: "invalid-user-name", Role: v1pb.SpaceMember_USER},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))

	// SQLite permits a text value in this integer column. Corrupt only the
	// target row so authentication and Space authorization still succeed, then
	// require the target lookup failure to remain a server error.
	_, err = service.Store.GetDriver().GetDB().ExecContext(ctx, "UPDATE user SET created_ts = ? WHERE id = ?", "not-an-integer", target.ID)
	require.NoError(t, err)
	_, err = service.CreateSpaceInvitation(userCtx(ctx, owner.ID), &v1pb.CreateSpaceInvitationRequest{
		Parent:          space.Name,
		SpaceInvitation: &v1pb.SpaceInvitation{Invitee: BuildUserName(target.Username), Role: v1pb.SpaceMember_USER},
	})
	require.Equal(t, codes.Internal, status.Code(err))
}
