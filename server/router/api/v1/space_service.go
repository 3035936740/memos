package v1

import (
	"context"
	"database/sql"
	"encoding/base64"
	"regexp"
	"sort"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

const maxSpaceAvatarBytes = 10 << 20

var spaceURLSlugPattern = regexp.MustCompile(`^[A-Za-z0-9]{1,64}$`)

func validateSpaceURLSlug(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value != "" && !spaceURLSlugPattern.MatchString(value) {
		return "", status.Error(codes.InvalidArgument, "space URL alias must contain only 1 to 64 ASCII letters or digits")
	}
	return strings.ToLower(value), nil
}

func validateSpaceAvatar(avatarURL string) error {
	if avatarURL == "" {
		return nil
	}
	imageType, encoded, err := extractImageInfo(avatarURL)
	if err != nil {
		return status.Errorf(codes.InvalidArgument, "invalid space avatar format: %v", err)
	}
	allowedTypes := map[string]bool{"image/png": true, "image/jpeg": true, "image/jpg": true, "image/gif": true, "image/webp": true}
	if !allowedTypes[imageType] {
		return status.Errorf(codes.InvalidArgument, "invalid space avatar image type: %s", imageType)
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return status.Error(codes.InvalidArgument, "invalid space avatar base64 data")
	}
	if len(decoded) > maxSpaceAvatarBytes {
		return status.Error(codes.InvalidArgument, "space avatar must not exceed 10 MB")
	}
	return nil
}

func (s *APIV1Service) requireCurrentSpaceUser(ctx context.Context) (*store.User, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Error(codes.Unauthenticated, "user not authenticated")
	}
	return user, nil
}

func (s *APIV1Service) resolveMemberSpace(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.SpaceMember, error) {
	uid, err := ExtractSpaceUIDFromName(name)
	if err != nil {
		return nil, nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &uid, MemberUserID: &currentUser.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get space: %v", err)
	}
	if space == nil {
		return nil, nil, status.Error(codes.NotFound, "space not found")
	}
	member, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &currentUser.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get space membership: %v", err)
	}
	if member == nil || !member.Role.IsActiveMember() {
		// A non-member must not be able to distinguish an existing private
		// collaboration boundary from a missing resource.
		return nil, nil, status.Error(codes.NotFound, "space not found")
	}
	return space, member, nil
}

func requireSpaceAdministrator(member *store.SpaceMember) error {
	if member == nil || member.Role != store.SpaceMemberRoleAdmin {
		return status.Error(codes.PermissionDenied, "space administrator permission required")
	}
	return nil
}

func mapSpaceMutationError(err error, operation string) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, store.ErrLastSpaceAdmin):
		return status.Error(codes.FailedPrecondition, "a space must retain an active administrator")
	case errors.Is(err, store.ErrSpacePermissionDenied):
		return status.Error(codes.NotFound, "space not found")
	case errors.Is(err, store.ErrSpaceMemberNotActive):
		return status.Error(codes.FailedPrecondition, "space members must be active users")
	case errors.Is(err, store.ErrSpaceAlreadyExists):
		return status.Error(codes.AlreadyExists, "space already exists")
	case errors.Is(err, store.ErrSpaceURLSlugAlreadyExists):
		return status.Error(codes.AlreadyExists, "space URL alias already exists")
	case errors.Is(err, store.ErrSpaceMemberAlreadyExists):
		return status.Error(codes.AlreadyExists, "space membership or invitation already exists")
	case errors.Is(err, store.ErrSpaceInvitationNotFound):
		return status.Error(codes.NotFound, "space invitation not found")
	case errors.Is(err, store.ErrSpaceNotFound), errors.Is(err, store.ErrSpaceMemberNotFound):
		return status.Error(codes.NotFound, "space or membership not found")
	case errors.Is(err, sql.ErrNoRows):
		return status.Error(codes.NotFound, "space or membership not found")
	default:
		return status.Errorf(codes.Internal, "%s: %v", operation, err)
	}
}

// CreateSpace creates a space with the caller as its first administrator.
func (s *APIV1Service) CreateSpace(ctx context.Context, request *v1pb.CreateSpaceRequest) (*v1pb.Space, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	if request.GetSpace() == nil {
		return nil, status.Error(codes.InvalidArgument, "space is required")
	}
	title := strings.TrimSpace(request.Space.Title)
	if title == "" {
		return nil, status.Error(codes.InvalidArgument, "space title is required")
	}
	uid, err := ValidateAndGenerateSpaceUID(request.SpaceId)
	if err != nil {
		return nil, err
	}
	if err := validateSpaceAvatar(request.Space.AvatarUrl); err != nil {
		return nil, err
	}
	urlSlug, err := validateSpaceURLSlug(request.Space.UrlSlug)
	if err != nil {
		return nil, err
	}
	if existing, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &uid}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to validate space UID: %v", err)
	} else if existing != nil {
		return nil, status.Error(codes.AlreadyExists, "space already exists")
	}
	if urlSlug != "" {
		if existing, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &urlSlug}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to validate space URL alias: %v", err)
		} else if existing != nil {
			return nil, status.Error(codes.AlreadyExists, "space URL alias already exists")
		}
	}
	accessMode := store.SpaceAccessModeInviteOnly
	if request.Space.AccessMode != v1pb.Space_ACCESS_MODE_UNSPECIFIED {
		var ok bool
		accessMode, ok = convertSpaceAccessModeToStore(request.Space.AccessMode)
		if !ok {
			return nil, status.Error(codes.InvalidArgument, "invalid space access mode")
		}
	}
	syncToMainFeed := true
	if request.Space.SyncToMainFeed != nil {
		syncToMainFeed = request.Space.GetSyncToMainFeed()
	}
	created, err := s.Store.CreateSpace(ctx, &store.Space{
		UID:               uid,
		URLSlug:           urlSlug,
		Title:             title,
		Description:       strings.TrimSpace(request.Space.Description),
		AvatarURL:         request.Space.AvatarUrl,
		AccessMode:        accessMode,
		SyncToMainFeed:    syncToMainFeed,
		SyncToMainFeedSet: true,
	}, currentUser.ID)
	if err != nil {
		return nil, mapSpaceMutationError(err, "failed to create space")
	}
	s.SSEHub.publishSpaceChanged()
	return convertSpaceFromStore(created), nil
}

// ListSpaces lists spaces visible to the caller. Guests see public spaces;
// signed-in users additionally see authenticated spaces and their memberships.
func (s *APIV1Service) ListSpaces(ctx context.Context, request *v1pb.ListSpacesRequest) (*v1pb.ListSpacesResponse, error) {
	currentUser, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
	if err != nil {
		return nil, err
	}
	limitPlusOne := limit + 1
	find := &store.FindSpace{Limit: &limitPlusOne, Offset: &offset}
	if filter := strings.TrimSpace(request.Filter); filter != "" {
		find.Search = &filter
	}
	var spaces []*store.Space
	if request.ShowAll {
		if currentUser == nil || !isSuperUser(currentUser) {
			return nil, status.Error(codes.PermissionDenied, "instance administrator permission required")
		}
		spaces, err = s.Store.ListSpaces(ctx, find)
	} else if currentUser == nil {
		find.AccessModes = []store.SpaceAccessMode{store.SpaceAccessModePublic}
		spaces, err = s.Store.ListSpaces(ctx, find)
	} else {
		// Fetch enough rows from each visibility source to merge, de-duplicate,
		// sort, and apply one stable page across both sets.
		sourceLimit := offset + limitPlusOne
		memberFind := &store.FindSpace{MemberUserID: &currentUser.ID, Limit: &sourceLimit}
		visibleFind := &store.FindSpace{
			AccessModes: []store.SpaceAccessMode{store.SpaceAccessModeAuthenticated, store.SpaceAccessModePublic},
			Limit:       &sourceLimit,
		}
		if find.Search != nil {
			memberFind.Search = find.Search
			visibleFind.Search = find.Search
		}
		memberSpaces, memberErr := s.Store.ListSpaces(ctx, memberFind)
		if memberErr != nil {
			return nil, status.Errorf(codes.Internal, "failed to list member spaces: %v", memberErr)
		}
		visibleSpaces, visibleErr := s.Store.ListSpaces(ctx, visibleFind)
		if visibleErr != nil {
			return nil, status.Errorf(codes.Internal, "failed to list accessible spaces: %v", visibleErr)
		}
		spaceByID := make(map[int32]*store.Space, len(memberSpaces)+len(visibleSpaces))
		for _, space := range visibleSpaces {
			spaceByID[space.ID] = space
		}
		for _, space := range memberSpaces {
			spaceByID[space.ID] = space
		}
		merged := make([]*store.Space, 0, len(spaceByID))
		for _, space := range spaceByID {
			merged = append(merged, space)
		}
		sort.Slice(merged, func(i, j int) bool { return merged[i].ID > merged[j].ID })
		if offset < len(merged) {
			end := min(offset+limitPlusOne, len(merged))
			spaces = merged[offset:end]
		}
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list spaces: %v", err)
	}

	nextPageToken := ""
	if len(spaces) == limitPlusOne {
		spaces = spaces[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
		}
	}
	response := &v1pb.ListSpacesResponse{Spaces: make([]*v1pb.Space, 0, len(spaces)), NextPageToken: nextPageToken}
	for _, space := range spaces {
		response.Spaces = append(response.Spaces, convertSpaceFromStore(space))
	}
	return response, nil
}

func listSpacePage(pageSize int32, pageToken string) (int, int, error) {
	if pageToken == "" {
		return normalizePageSize(pageSize), 0, nil
	}
	var token v1pb.PageToken
	if err := unmarshalPageToken(pageToken, &token); err != nil {
		return 0, 0, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
	}
	return normalizePageSize(token.Limit), max(int(token.Offset), 0), nil
}

// GetSpace gets a space visible through membership or its configured access mode.
func (s *APIV1Service) GetSpace(ctx context.Context, request *v1pb.GetSpaceRequest) (*v1pb.Space, error) {
	uid, err := ExtractSpaceUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
	}
	currentUser, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if currentUser != nil {
		memberSpace, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &uid, MemberUserID: &currentUser.ID})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get space: %v", err)
		}
		if memberSpace != nil {
			return convertSpaceFromStore(memberSpace), nil
		}
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &uid})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get space: %v", err)
	}
	if space == nil || space.AccessMode == store.SpaceAccessModeInviteOnly {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	if space.AccessMode == store.SpaceAccessModeAuthenticated && currentUser == nil {
		return nil, status.Error(codes.Unauthenticated, "user not authenticated")
	}
	return convertSpaceMetadataFromStore(space), nil
}

// UpdateSpace updates Space metadata.
func (s *APIV1Service) UpdateSpace(ctx context.Context, request *v1pb.UpdateSpaceRequest) (*v1pb.Space, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	if request.GetSpace() == nil {
		return nil, status.Error(codes.InvalidArgument, "space is required")
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Error(codes.InvalidArgument, "update mask is required")
	}
	space, membership, err := s.resolveMemberSpace(ctx, request.Space.Name, currentUser)
	if err != nil {
		return nil, err
	}
	if err := requireSpaceAdministrator(membership); err != nil {
		return nil, err
	}

	update := &store.UpdateSpace{ID: space.ID}
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "title":
			title := strings.TrimSpace(request.Space.Title)
			if title == "" {
				return nil, status.Error(codes.InvalidArgument, "space title is required")
			}
			update.Title = &title
		case "description":
			description := strings.TrimSpace(request.Space.Description)
			update.Description = &description
		case "avatar_url":
			if err := validateSpaceAvatar(request.Space.AvatarUrl); err != nil {
				return nil, err
			}
			update.AvatarURL = &request.Space.AvatarUrl
		case "url_slug":
			urlSlug, err := validateSpaceURLSlug(request.Space.UrlSlug)
			if err != nil {
				return nil, err
			}
			if urlSlug != "" {
				existing, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &urlSlug})
				if err != nil {
					return nil, status.Errorf(codes.Internal, "failed to validate space URL alias: %v", err)
				}
				if existing != nil && existing.ID != space.ID {
					return nil, status.Error(codes.AlreadyExists, "space URL alias already exists")
				}
			}
			update.URLSlug = &urlSlug
		case "access_mode":
			accessMode, ok := convertSpaceAccessModeToStore(request.Space.AccessMode)
			if !ok {
				return nil, status.Error(codes.InvalidArgument, "invalid space access mode")
			}
			update.AccessMode = &accessMode
		case "sync_to_main_feed":
			syncToMainFeed := request.Space.GetSyncToMainFeed()
			update.SyncToMainFeed = &syncToMainFeed
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported update mask path: %s", path)
		}
	}
	updated, err := s.Store.UpdateSpace(ctx, update, currentUser.ID)
	if err != nil {
		return nil, mapSpaceMutationError(err, "failed to update space")
	}
	if updated == nil {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	s.SSEHub.publishSpaceChanged()
	return convertSpaceFromStore(updated), nil
}

// DeleteSpace permanently deletes the Space and every memo directly placed
// in it. The result deliberately exposes no memo inventory to the administrator.
func (s *APIV1Service) DeleteSpace(ctx context.Context, request *v1pb.DeleteSpaceRequest) (*emptypb.Empty, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	instanceAdmin := isSuperUser(currentUser)
	var space *store.Space
	if instanceAdmin {
		uid, err := ExtractSpaceUIDFromName(request.Name)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
		}
		space, err = s.Store.GetSpace(ctx, &store.FindSpace{UID: &uid})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get space: %v", err)
		}
		if space == nil {
			return nil, status.Error(codes.NotFound, "space not found")
		}
	} else {
		var membership *store.SpaceMember
		space, membership, err = s.resolveMemberSpace(ctx, request.Name, currentUser)
		if err != nil {
			return nil, err
		}
		if err := requireSpaceAdministrator(membership); err != nil {
			return nil, err
		}
	}
	deleteResult, err := s.Store.DeleteSpace(ctx, &store.DeleteSpace{ID: space.ID, ActorUserID: currentUser.ID, InstanceAdmin: instanceAdmin})
	if err != nil {
		return nil, mapSpaceMutationError(err, "failed to delete space")
	}
	s.SSEHub.publishSpaceChanged()
	if err := s.cleanupDeletedAttachmentStorage(ctx, deleteResult.Attachments); err != nil {
		return nil, status.Errorf(codes.Internal, "space was deleted but attachment storage cleanup failed: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// CreateSpaceInvitation creates a pending invitation without granting any
// Space access to the invitee.
func (s *APIV1Service) CreateSpaceInvitation(ctx context.Context, request *v1pb.CreateSpaceInvitationRequest) (*v1pb.SpaceInvitation, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	if request.GetSpaceInvitation() == nil {
		return nil, status.Error(codes.InvalidArgument, "space invitation is required")
	}
	space, callerMembership, err := s.resolveMemberSpace(ctx, request.Parent, currentUser)
	if err != nil {
		return nil, err
	}
	if err := requireSpaceAdministrator(callerMembership); err != nil {
		return nil, err
	}
	targetUsername, err := parseUsernameFromName(request.SpaceInvitation.Invitee)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid invitation invitee: %v", err)
	}
	targetUser, err := s.Store.GetUser(ctx, &store.FindUser{Username: &targetUsername})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get invitation invitee: %v", err)
	}
	if targetUser == nil {
		return nil, status.Error(codes.NotFound, "user not found")
	}
	if targetUser.RowStatus != store.Normal {
		return nil, status.Error(codes.FailedPrecondition, "only active users can be invited to a space")
	}
	role, ok := convertSpaceMemberRoleToStore(request.SpaceInvitation.Role)
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "space invitation role must be ADMIN or USER")
	}
	expectedName := buildSpaceInvitationName(space.UID, targetUser.Username)
	if request.SpaceInvitation.Name != "" && request.SpaceInvitation.Name != expectedName {
		return nil, status.Error(codes.InvalidArgument, "space invitation name does not match parent and invitee")
	}
	created, err := s.Store.CreateSpaceInvitation(ctx, &store.SpaceInvitation{
		SpaceID: space.ID,
		UserID:  targetUser.ID,
		Role:    role,
	}, currentUser.ID)
	if err != nil {
		return nil, mapSpaceMutationError(err, "failed to create space invitation")
	}
	if _, err := s.Store.CreateInbox(ctx, &store.Inbox{
		SenderID:   currentUser.ID,
		ReceiverID: targetUser.ID,
		Status:     store.UNREAD,
		Message: &storepb.InboxMessage{
			Type: storepb.InboxMessage_SPACE_INVITATION,
			Payload: &storepb.InboxMessage_SpaceInvitation{
				SpaceInvitation: &storepb.InboxMessage_SpaceInvitationPayload{SpaceId: space.ID},
			},
		},
	}); err != nil {
		// Keep invitation state and the notification center consistent if the
		// second write fails.
		_ = s.Store.RevokeSpaceInvitation(ctx, &store.RevokeSpaceInvitation{SpaceID: space.ID, UserID: targetUser.ID}, currentUser.ID)
		return nil, status.Errorf(codes.Internal, "failed to create space invitation notification: %v", err)
	}
	s.SSEHub.publishSpaceChanged()
	return convertSpaceInvitationFromStore(space, targetUser, created), nil
}

// ListSpaceInvitations lists pending invitations after requiring an active
// Space administrator.
func (s *APIV1Service) ListSpaceInvitations(ctx context.Context, request *v1pb.ListSpaceInvitationsRequest) (*v1pb.ListSpaceInvitationsResponse, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, callerMembership, err := s.resolveMemberSpace(ctx, request.Parent, currentUser)
	if err != nil {
		return nil, err
	}
	if err := requireSpaceAdministrator(callerMembership); err != nil {
		return nil, err
	}
	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
	if err != nil {
		return nil, err
	}
	limitPlusOne := limit + 1
	invitations, err := s.Store.ListSpaceInvitations(ctx, &store.FindSpaceInvitation{
		SpaceID:      &space.ID,
		ViewerUserID: &currentUser.ID,
		Limit:        &limitPlusOne,
		Offset:       &offset,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list space invitations: %v", err)
	}
	nextPageToken := ""
	if len(invitations) == limitPlusOne {
		invitations = invitations[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
		}
	}
	response := &v1pb.ListSpaceInvitationsResponse{
		SpaceInvitations: make([]*v1pb.SpaceInvitation, 0, len(invitations)),
		NextPageToken:    nextPageToken,
	}
	if len(invitations) == 0 {
		return response, nil
	}
	userIDs := make([]int32, 0, len(invitations))
	for _, invitation := range invitations {
		userIDs = append(userIDs, invitation.UserID)
	}
	users, err := s.Store.ListUsers(ctx, &store.FindUser{IDList: userIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to resolve invitation invitees: %v", err)
	}
	usersByID := make(map[int32]*store.User, len(users))
	for _, user := range users {
		usersByID[user.ID] = user
	}
	for _, invitation := range invitations {
		user := usersByID[invitation.UserID]
		if user == nil || convertSpaceMemberRoleFromStore(invitation.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
			continue
		}
		response.SpaceInvitations = append(response.SpaceInvitations, convertSpaceInvitationFromStore(space, user, invitation))
	}
	return response, nil
}

// ListUserSpaceInvitations lists the authenticated user's received pending
// invitations. A user cannot enumerate another user's invitations.
func (s *APIV1Service) ListUserSpaceInvitations(ctx context.Context, request *v1pb.ListUserSpaceInvitationsRequest) (*v1pb.ListUserSpaceInvitationsResponse, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	username, err := parseUsernameFromName(request.Parent)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user parent: %v", err)
	}
	if username != currentUser.Username {
		return nil, status.Error(codes.PermissionDenied, "users may only list their own space invitations")
	}
	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
	if err != nil {
		return nil, err
	}
	limitPlusOne := limit + 1
	invitations, err := s.Store.ListSpaceInvitations(ctx, &store.FindSpaceInvitation{
		UserID:       &currentUser.ID,
		ViewerUserID: &currentUser.ID,
		Limit:        &limitPlusOne,
		Offset:       &offset,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list user space invitations: %v", err)
	}
	nextPageToken := ""
	if len(invitations) == limitPlusOne {
		invitations = invitations[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
		}
	}
	response := &v1pb.ListUserSpaceInvitationsResponse{
		SpaceInvitations: make([]*v1pb.SpaceInvitation, 0, len(invitations)),
		NextPageToken:    nextPageToken,
	}
	if len(invitations) == 0 {
		return response, nil
	}
	spaceIDs := make([]int32, 0, len(invitations))
	for _, invitation := range invitations {
		spaceIDs = append(spaceIDs, invitation.SpaceID)
	}
	spaces, err := s.Store.ListSpaces(ctx, &store.FindSpace{IDList: spaceIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to resolve invitation spaces: %v", err)
	}
	spacesByID := make(map[int32]*store.Space, len(spaces))
	for _, space := range spaces {
		spacesByID[space.ID] = space
	}
	for _, invitation := range invitations {
		space := spacesByID[invitation.SpaceID]
		if space == nil || convertSpaceMemberRoleFromStore(invitation.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
			continue
		}
		response.SpaceInvitations = append(response.SpaceInvitations, convertSpaceInvitationFromStore(space, currentUser, invitation))
	}
	return response, nil
}

// resolveSpaceInvitationResource resolves an invitation and authorizes either
// its invitee or an active administrator of its Space.
func (s *APIV1Service) resolveSpaceInvitationResource(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.User, *store.SpaceMember, *store.SpaceInvitation, error) {
	spaceUID, username, err := ExtractSpaceInvitationTokensFromName(name)
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.InvalidArgument, "invalid space invitation name: %v", err)
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &spaceUID})
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve invitation space: %v", err)
	}
	if space == nil {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
	}
	targetUser, err := s.Store.GetUser(ctx, &store.FindUser{Username: &username})
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve invitation invitee: %v", err)
	}
	if targetUser == nil {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
	}
	callerMembership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &currentUser.ID})
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve caller space membership: %v", err)
	}
	isInvitee := targetUser.ID == currentUser.ID
	isAdministrator := callerMembership != nil && callerMembership.Role == store.SpaceMemberRoleAdmin
	if !isInvitee && !isAdministrator {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
	}
	invitation, err := s.Store.GetSpaceInvitation(ctx, &store.FindSpaceInvitation{
		SpaceID:      &space.ID,
		UserID:       &targetUser.ID,
		ViewerUserID: &currentUser.ID,
	})
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to get space invitation: %v", err)
	}
	if invitation == nil || convertSpaceMemberRoleFromStore(invitation.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
	}
	return space, targetUser, callerMembership, invitation, nil
}

// GetSpaceInvitation gets a pending invitation for its invitee or a Space
// administrator.
func (s *APIV1Service) GetSpaceInvitation(ctx context.Context, request *v1pb.GetSpaceInvitationRequest) (*v1pb.SpaceInvitation, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, targetUser, _, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	return convertSpaceInvitationFromStore(space, targetUser, invitation), nil
}

// DeleteSpaceInvitation revokes a pending invitation. Only an active Space
// administrator can revoke it.
func (s *APIV1Service) DeleteSpaceInvitation(ctx context.Context, request *v1pb.DeleteSpaceInvitationRequest) (*emptypb.Empty, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	_, targetUser, callerMembership, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	if err := requireSpaceAdministrator(callerMembership); err != nil {
		return nil, err
	}
	if err := s.Store.RevokeSpaceInvitation(ctx, &store.RevokeSpaceInvitation{
		SpaceID: invitation.SpaceID,
		UserID:  targetUser.ID,
	}, currentUser.ID); err != nil {
		return nil, mapSpaceMutationError(err, "failed to revoke space invitation")
	}
	if err := s.deleteSpaceInvitationNotifications(ctx, targetUser.ID, invitation.SpaceID); err != nil {
		return nil, status.Errorf(codes.Internal, "space invitation was revoked but its notification could not be removed: %v", err)
	}
	s.SSEHub.publishSpaceChanged()
	return &emptypb.Empty{}, nil
}

// AcceptSpaceInvitation activates the invited user's membership with the role
// selected by the administrator who created the invitation.
func (s *APIV1Service) AcceptSpaceInvitation(ctx context.Context, request *v1pb.AcceptSpaceInvitationRequest) (*v1pb.SpaceMember, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, targetUser, _, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	if targetUser.ID != currentUser.ID {
		return nil, status.Error(codes.PermissionDenied, "only the invitee may accept a space invitation")
	}
	member, err := s.Store.AcceptSpaceInvitation(ctx, &store.AcceptSpaceInvitation{SpaceID: invitation.SpaceID, UserID: currentUser.ID}, currentUser.ID)
	if err != nil {
		return nil, mapSpaceMutationError(err, "failed to accept space invitation")
	}
	if err := s.deleteSpaceInvitationNotifications(ctx, currentUser.ID, invitation.SpaceID); err != nil {
		return nil, status.Errorf(codes.Internal, "space invitation was accepted but its notification could not be removed: %v", err)
	}
	s.SSEHub.publishSpaceChanged()
	return convertSpaceMemberFromStore(space, currentUser, member), nil
}

// DeclineSpaceInvitation deletes the authenticated invitee's pending
// invitation without ever creating a membership.
func (s *APIV1Service) DeclineSpaceInvitation(ctx context.Context, request *v1pb.DeclineSpaceInvitationRequest) (*emptypb.Empty, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	_, targetUser, _, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	if targetUser.ID != currentUser.ID {
		return nil, status.Error(codes.PermissionDenied, "only the invitee may decline a space invitation")
	}
	if err := s.Store.DeclineSpaceInvitation(ctx, &store.DeclineSpaceInvitation{SpaceID: invitation.SpaceID, UserID: currentUser.ID}, currentUser.ID); err != nil {
		return nil, mapSpaceMutationError(err, "failed to decline space invitation")
	}
	if err := s.deleteSpaceInvitationNotifications(ctx, currentUser.ID, invitation.SpaceID); err != nil {
		return nil, status.Errorf(codes.Internal, "space invitation was declined but its notification could not be removed: %v", err)
	}
	s.SSEHub.publishSpaceChanged()
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) deleteSpaceInvitationNotifications(ctx context.Context, receiverID, spaceID int32) error {
	messageType := storepb.InboxMessage_SPACE_INVITATION
	inboxes, err := s.Store.ListInboxes(ctx, &store.FindInbox{ReceiverID: &receiverID, MessageType: &messageType})
	if err != nil {
		return errors.Wrap(err, "failed to list space invitation notifications")
	}
	for _, inbox := range inboxes {
		if inbox.Message == nil {
			continue
		}
		payload := inbox.Message.GetSpaceInvitation()
		if payload == nil || payload.SpaceId != spaceID {
			continue
		}
		if err := s.Store.DeleteInbox(ctx, &store.DeleteInbox{ID: inbox.ID}); err != nil {
			return errors.Wrap(err, "failed to delete space invitation notification")
		}
	}
	return nil
}

// ListSpaceMembers lists memberships after authorizing the caller's own
// membership before applying pagination.
func (s *APIV1Service) ListSpaceMembers(ctx context.Context, request *v1pb.ListSpaceMembersRequest) (*v1pb.ListSpaceMembersResponse, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, _, err := s.resolveMemberSpace(ctx, request.Parent, currentUser)
	if err != nil {
		return nil, err
	}
	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
	if err != nil {
		return nil, err
	}
	limitPlusOne := limit + 1
	members, err := s.Store.ListSpaceMembers(ctx, &store.FindSpaceMember{
		SpaceID:      &space.ID,
		ViewerUserID: &currentUser.ID,
		Limit:        &limitPlusOne,
		Offset:       &offset,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list space members: %v", err)
	}
	nextPageToken := ""
	if len(members) == limitPlusOne {
		members = members[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
		}
	}
	response := &v1pb.ListSpaceMembersResponse{SpaceMembers: make([]*v1pb.SpaceMember, 0, len(members)), NextPageToken: nextPageToken}
	if len(members) == 0 {
		return response, nil
	}

	userIDs := make([]int32, 0, len(members))
	for _, member := range members {
		userIDs = append(userIDs, member.UserID)
	}
	users, err := s.Store.ListUsers(ctx, &store.FindUser{IDList: userIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to resolve space members: %v", err)
	}
	usersByID := make(map[int32]*store.User, len(users))
	for _, user := range users {
		usersByID[user.ID] = user
	}
	for _, member := range members {
		user := usersByID[member.UserID]
		if user == nil || user.RowStatus != store.Normal || convertSpaceMemberRoleFromStore(member.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
			// Malformed/dangling memberships are never exposed as active access.
			continue
		}
		response.SpaceMembers = append(response.SpaceMembers, convertSpaceMemberFromStore(space, user, member))
	}
	return response, nil
}

func (s *APIV1Service) resolveSpaceMemberResource(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.User, *store.SpaceMember, *store.SpaceMember, error) {
	spaceUID, username, err := ExtractSpaceMemberTokensFromName(name)
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.InvalidArgument, "invalid space member name: %v", err)
	}
	space, callerMembership, err := s.resolveMemberSpace(ctx, buildSpaceName(spaceUID), currentUser)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	targetUser, err := ResolveUserByName(ctx, s.Store, BuildUserName(username))
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve member user: %v", err)
	}
	if targetUser == nil {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
	}
	if targetUser.RowStatus != store.Normal {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
	}
	targetMembership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{
		SpaceID:      &space.ID,
		UserID:       &targetUser.ID,
		ViewerUserID: &currentUser.ID,
	})
	if err != nil {
		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to get space membership: %v", err)
	}
	if targetMembership == nil || !targetMembership.Role.IsActiveMember() {
		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
	}
	return space, targetUser, callerMembership, targetMembership, nil
}

// GetSpaceMember gets one membership visible to another member of the space.
func (s *APIV1Service) GetSpaceMember(ctx context.Context, request *v1pb.GetSpaceMemberRequest) (*v1pb.SpaceMember, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	space, targetUser, _, membership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	return convertSpaceMemberFromStore(space, targetUser, membership), nil
}

// UpdateSpaceMember changes a member's role in a Space.
func (s *APIV1Service) UpdateSpaceMember(ctx context.Context, request *v1pb.UpdateSpaceMemberRequest) (*v1pb.SpaceMember, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	if request.GetSpaceMember() == nil {
		return nil, status.Error(codes.InvalidArgument, "space member is required")
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Error(codes.InvalidArgument, "update mask must include role")
	}
	roleIncluded := false
	userIncluded := false
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "role":
			roleIncluded = true
		case "user":
			// grpc-gateway infers user from the schema-required REST body. It is
			// accepted as immutable identity context, never as a mutable field.
			userIncluded = true
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported update mask path: %s", path)
		}
	}
	if !roleIncluded {
		return nil, status.Error(codes.InvalidArgument, "update mask must include role")
	}
	space, targetUser, callerMembership, targetMembership, err := s.resolveSpaceMemberResource(ctx, request.SpaceMember.Name, currentUser)
	if err != nil {
		return nil, err
	}
	expectedUser := BuildUserName(targetUser.Username)
	if userIncluded && request.SpaceMember.User == "" {
		return nil, status.Error(codes.InvalidArgument, "space member user is required when included in the update mask")
	}
	if request.SpaceMember.User != "" && request.SpaceMember.User != expectedUser {
		return nil, status.Error(codes.InvalidArgument, "space member user does not match name")
	}
	if err := requireSpaceAdministrator(callerMembership); err != nil {
		return nil, err
	}
	role, ok := convertSpaceMemberRoleToStore(request.SpaceMember.Role)
	if !ok {
		return nil, status.Error(codes.InvalidArgument, "space member role must be ADMIN or USER")
	}
	updated, err := s.Store.UpdateSpaceMember(ctx, &store.UpdateSpaceMember{
		SpaceID: targetMembership.SpaceID,
		UserID:  targetMembership.UserID,
		Role:    &role,
	}, currentUser.ID)
	if err != nil {
		return nil, mapSpaceMutationError(err, "failed to update space member")
	}
	if updated == nil {
		return nil, status.Error(codes.NotFound, "space member not found")
	}
	s.SSEHub.publishSpaceChanged()
	return convertSpaceMemberFromStore(space, targetUser, updated), nil
}

// DeleteSpaceMember removes a membership or lets a member leave a space.
func (s *APIV1Service) DeleteSpaceMember(ctx context.Context, request *v1pb.DeleteSpaceMemberRequest) (*emptypb.Empty, error) {
	currentUser, err := s.requireCurrentSpaceUser(ctx)
	if err != nil {
		return nil, err
	}
	_, targetUser, callerMembership, targetMembership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
	if err != nil {
		return nil, err
	}
	isSelf := targetUser.ID == currentUser.ID
	if !isSelf {
		if err := requireSpaceAdministrator(callerMembership); err != nil {
			return nil, err
		}
	}
	if err := s.Store.DeleteSpaceMember(ctx, &store.DeleteSpaceMember{
		SpaceID: targetMembership.SpaceID,
		UserID:  targetMembership.UserID,
	}, currentUser.ID); err != nil {
		return nil, mapSpaceMutationError(err, "failed to delete space member")
	}
	s.SSEHub.publishSpaceChanged()
	return &emptypb.Empty{}, nil
}
