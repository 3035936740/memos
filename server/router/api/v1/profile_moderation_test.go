package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/usememos/memos/internal/idp"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestUserProfileBlockedWords(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	require.NoError(t, s.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"forbidden"}}))

	// First-user setup and validate-only registration must not bypass moderation.
	for _, validateOnly := range []bool{true, false} {
		for _, field := range []string{"username", "display_name", "description"} {
			u := &v1pb.User{Username: "clean-user", Password: "password123", DisplayName: "Clean", Description: "Clean bio"}
			switch field {
			case "username":
				u.Username = "FoRbIdDeN"
			case "display_name":
				u.DisplayName = "for\u200bbidden"
			case "description":
				u.Description = "forbidden biography"
			}
			_, err := s.CreateUser(ctx, &v1pb.CreateUserRequest{User: u, ValidateOnly: validateOnly})
			require.Equal(t, codes.InvalidArgument, status.Code(err), "%s validate-only=%v", field, validateOnly)
		}
	}
	users, err := s.Store.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Empty(t, users)

	admin, err := s.CreateUser(ctx, &v1pb.CreateUserRequest{User: &v1pb.User{
		Username: "clean-admin", Password: "password123", Description: "Initial administrator bio",
	}})
	require.NoError(t, err)
	require.Equal(t, "Initial administrator bio", admin.Description)
	storedAdmin, err := ResolveUserByName(ctx, s.Store, admin.Name)
	require.NoError(t, err)
	adminCtx := userCtx(ctx, storedAdmin.ID)

	// Normal signup and administrator-created accounts use the same checks.
	for _, caller := range []context.Context{ctx, adminCtx} {
		for _, field := range []string{"username", "display_name", "description"} {
			u := &v1pb.User{Username: "new-user", Password: "password123", DisplayName: "Clean", Description: "Clean bio"}
			switch field {
			case "username":
				u.Username = "forbidden-user"
			case "display_name":
				u.DisplayName = "forbidden nickname"
			case "description":
				u.Description = "forbidden bio"
			}
			_, err := s.CreateUser(caller, &v1pb.CreateUserRequest{User: u})
			require.Equal(t, codes.InvalidArgument, status.Code(err), field)
		}
	}
	member, err := s.CreateUser(ctx, &v1pb.CreateUserRequest{User: &v1pb.User{
		Username: "clean-member", Password: "password123", DisplayName: "Clean member", Description: "Member bio",
	}})
	require.NoError(t, err)
	require.Equal(t, "Member bio", member.Description)
	storedMember, err := ResolveUserByName(ctx, s.Store, member.Name)
	require.NoError(t, err)
	memberCtx := userCtx(ctx, storedMember.ID)
	for _, caller := range []context.Context{memberCtx, adminCtx} {
		for _, field := range []string{"username", "display_name", "description"} {
			_, err := s.UpdateUser(caller, &v1pb.UpdateUserRequest{
				User:       &v1pb.User{Name: member.Name, Username: "forbidden", DisplayName: "forbidden", Description: "forbidden"},
				UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{field}},
			})
			require.Equal(t, codes.InvalidArgument, status.Code(err), field)
		}
	}

	// A failure in a later field must not commit an earlier clean field.
	_, err = s.UpdateUser(memberCtx, &v1pb.UpdateUserRequest{
		User:       &v1pb.User{Name: member.Name, DisplayName: "Changed", Description: "forbidden"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"display_name", "description"}},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	unchanged, err := s.GetUser(memberCtx, &v1pb.GetUserRequest{Name: member.Name})
	require.NoError(t, err)
	require.Equal(t, member.DisplayName, unchanged.DisplayName)
	require.Equal(t, member.Description, unchanged.Description)

	// Ignore fields outside the mask and allow clearing a biography.
	updated, err := s.UpdateUser(memberCtx, &v1pb.UpdateUserRequest{
		User:       &v1pb.User{Name: member.Name, DisplayName: "forbidden", Description: ""},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"description"}},
	})
	require.NoError(t, err)
	require.Empty(t, updated.Description)
	require.NoError(t, s.clearContentModerationSetting(ctx))
	_, err = s.UpdateUser(memberCtx, &v1pb.UpdateUserRequest{
		User:       &v1pb.User{Name: member.Name, DisplayName: "forbidden"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"display_name"}},
	})
	require.NoError(t, err)
}

func TestSpaceProfileBlockedWords(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "space-moderation-owner", store.RoleUser)
	ownerCtx := userCtx(ctx, owner.ID)
	require.NoError(t, s.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"forbidden"}}))
	for _, field := range []string{"title", "description", "url_slug"} {
		space := &v1pb.Space{Title: "Clean space", Description: "Clean description", UrlSlug: "clean"}
		switch field {
		case "title":
			space.Title = "for\u200bbidden space"
		case "description":
			space.Description = "forbidden description"
		case "url_slug":
			space.UrlSlug = "Forbidden"
		}
		_, err := s.CreateSpace(ownerCtx, &v1pb.CreateSpaceRequest{Space: space})
		require.Equal(t, codes.InvalidArgument, status.Code(err), field)
	}
	spaces, err := s.Store.ListSpaces(ctx, &store.FindSpace{})
	require.NoError(t, err)
	require.Empty(t, spaces)
	space, err := s.CreateSpace(ownerCtx, &v1pb.CreateSpaceRequest{Space: &v1pb.Space{
		Title: "Clean space", Description: "Clean description", UrlSlug: "cleanspace",
	}})
	require.NoError(t, err)
	for _, field := range []string{"title", "description", "url_slug"} {
		_, err := s.UpdateSpace(ownerCtx, &v1pb.UpdateSpaceRequest{
			Space:      &v1pb.Space{Name: space.Name, Title: "forbidden", Description: "forbidden", UrlSlug: "forbidden"},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{field}},
		})
		require.Equal(t, codes.InvalidArgument, status.Code(err), field)
	}
	_, err = s.UpdateSpace(ownerCtx, &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: space.Name, Title: "Changed", Description: "forbidden"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title", "description"}},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	unchanged, err := s.GetSpace(ownerCtx, &v1pb.GetSpaceRequest{Name: space.Name})
	require.NoError(t, err)
	require.Equal(t, space.Title, unchanged.Title)
	require.Equal(t, space.Description, unchanged.Description)
	updated, err := s.UpdateSpace(ownerCtx, &v1pb.UpdateSpaceRequest{
		Space:      &v1pb.Space{Name: space.Name, Title: "forbidden", Description: ""},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"description"}},
	})
	require.NoError(t, err)
	require.Empty(t, updated.Description)
}

func TestSSOProfileBlockedWords(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	require.NoError(t, s.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"forbidden"}}))
	provider := &storepb.IdentityProvider{Uid: "moderation-idp"}
	for _, info := range []*idp.IdentityProviderUserInfo{
		{Identifier: "forbidden-user", DisplayName: "Clean"},
		{Identifier: "clean-sso", DisplayName: "forbidden"},
	} {
		_, err := s.resolveSSOUser(ctx, nil, provider, info)
		require.Equal(t, codes.InvalidArgument, status.Code(err))
		linked, err := s.getLinkedSSOUser(ctx, provider.Uid, info.Identifier)
		require.NoError(t, err)
		require.Nil(t, linked)
	}
	users, err := s.Store.ListUsers(ctx, &store.FindUser{})
	require.NoError(t, err)
	require.Empty(t, users)
}
