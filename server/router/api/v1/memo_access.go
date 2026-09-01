package v1

import (
	"context"
	stderrors "errors"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/server/access"
	"github.com/usememos/memos/store"
)

// buildMemoReadContext resolves authorization inputs for exactly one memo.
// Relations never contribute access to either endpoint.
func (s *APIV1Service) buildMemoReadContext(ctx context.Context, memo *store.Memo, sharedMemoID *int32) (access.MemoReadContext, error) {
	viewer, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to get user")
	}
	allowAnonymous := false
	if viewer == nil {
		allowAnonymous, err = s.Store.AllowsAnonymousAccess(ctx)
		if err != nil {
			return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to resolve instance access policy")
		}
	}
	return s.buildMemoReadContextForViewer(ctx, memo, viewer, allowAnonymous, sharedMemoID)
}

func (s *APIV1Service) buildMemoReadContextForViewer(ctx context.Context, memo *store.Memo, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (access.MemoReadContext, error) {
	if memo == nil {
		return access.MemoReadContext{}, status.Error(codes.NotFound, "memo not found")
	}
	readContext, err := access.ResolveMemoReadContext(ctx, s.Store, memo, viewer, allowAnonymous, sharedMemoID)
	if err != nil {
		return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to resolve memo access")
	}
	return readContext, nil
}

func (s *APIV1Service) checkMemoReadAccess(ctx context.Context, memo *store.Memo) error {
	readContext, err := s.buildMemoReadContext(ctx, memo, nil)
	if err != nil {
		return err
	}
	if isSuperUser(readContext.Viewer) {
		return nil
	}
	if memo.Payload != nil {
		if memo.Payload.Quarantined {
			return status.Error(codes.NotFound, "memo not found")
		}
		if memo.Payload.Draft && (memo.Payload.PublishTs == 0 || memo.Payload.PublishTs > time.Now().Unix()) &&
			(readContext.Viewer == nil || memo.CreatorID != readContext.Viewer.ID) {
			return status.Error(codes.NotFound, "memo not found")
		}
	}
	deniedCategories, err := s.inaccessibleMemoCategories(ctx, readContext.Viewer)
	if err != nil {
		return status.Error(codes.Internal, "failed to load memo category access")
	}
	if !memoVisibleInCategories(memo, deniedCategories) {
		return status.Error(codes.NotFound, "memo not found")
	}
	return memoAccessDecisionError(access.CheckMemoReadContext(readContext))
}

func (s *APIV1Service) checkMemoAndParentReadAccess(ctx context.Context, memo *store.Memo) error {
	var parent *store.Memo
	if memo != nil && memo.ParentUID != nil {
		var err error
		parent, err = s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
		if err != nil {
			return status.Error(codes.Internal, "failed to get parent memo")
		}
		if parent == nil {
			return status.Error(codes.NotFound, "memo not found")
		}
	}
	return s.checkMemoReadAccessWithParent(ctx, memo, parent)
}

func (s *APIV1Service) checkMemoReadAccessWithParent(ctx context.Context, memo, parent *store.Memo) error {
	if parent != nil {
		if err := s.checkMemoReadAccess(ctx, parent); err != nil {
			return err
		}
	}
	return s.checkMemoReadAccess(ctx, memo)
}

func memoAccessDecisionError(decision access.MemoReadDecision) error {
	switch decision.Denial {
	case access.MemoReadDenialNone:
		return nil
	case access.MemoReadDenialNotFound:
		return status.Error(codes.NotFound, "memo not found")
	case access.MemoReadDenialUnauthenticated:
		return status.Error(codes.Unauthenticated, "user not authenticated")
	default:
		return status.Error(codes.PermissionDenied, "permission denied")
	}
}

// newMemoAccessScope returns the memo-local authorization predicate for a
// caller. Drivers apply it as a database predicate before LIMIT/OFFSET so
// inaccessible rows can neither leak nor skew counts and pagination.
func newMemoAccessScope(currentUser *store.User, allowPublic bool) *store.MemoAccessScope {
	accessScope := &store.MemoAccessScope{AllowPublic: allowPublic, AllowProtected: currentUser != nil}
	if currentUser != nil {
		accessScope.UserID = &currentUser.ID
	}
	return accessScope
}

// resolveMemoAccessScope resolves the caller and builds their memo access
// scope. For an anonymous caller the instance access policy decides whether
// PUBLIC memos are readable at all. Callers map the returned error to their own
// transport representation.
func (s *APIV1Service) resolveMemoAccessScope(ctx context.Context) (*store.MemoAccessScope, *store.User, error) {
	currentUser, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, nil, errors.Wrap(err, "failed to get current user")
	}
	allowPublic := currentUser != nil
	if currentUser == nil {
		allowPublic, err = s.Store.AllowsAnonymousAccess(ctx)
		if err != nil {
			return nil, nil, errors.Wrap(err, "failed to resolve instance access policy")
		}
	}
	return newMemoAccessScope(currentUser, allowPublic), currentUser, nil
}

// resolveReadableSpaceByName resolves a Space used by a collection filter and
// applies the same access-mode policy as GetSpace. Filter validation must not
// require write membership, otherwise a visible public Space becomes
// impossible for guests and non-members to query.
func (s *APIV1Service) resolveReadableSpaceByName(ctx context.Context, name string, user *store.User) (*store.Space, error) {
	spaceUID, err := ExtractSpaceUIDFromName(name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &spaceUID})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get space")
	}
	if space == nil {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	if space.AccessMode == store.SpaceAccessModePublic {
		return space, nil
	}
	if user == nil {
		if space.AccessMode == store.SpaceAccessModeAuthenticated {
			return nil, status.Error(codes.Unauthenticated, "user not authenticated")
		}
		return nil, status.Error(codes.NotFound, "space not found")
	}
	if space.AccessMode == store.SpaceAccessModeAuthenticated {
		return space, nil
	}
	active, err := s.isActiveSpaceMember(ctx, space.ID, user.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to resolve space membership")
	}
	if !active {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	return space, nil
}

// resolveWritableSpaceByName resolves a Space resource name. Open Spaces allow
// any active signed-in user to publish; invite-only Spaces still require an
// active membership. A denied invite-only Space remains indistinguishable from
// a missing resource.
func (s *APIV1Service) resolveWritableSpaceByName(ctx context.Context, name string, userID int32) (*store.Space, error) {
	spaceUID, err := ExtractSpaceUIDFromName(name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UIDOrURLSlug: &spaceUID})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get space")
	}
	if space == nil {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to resolve space writer")
	}
	if user == nil || user.RowStatus != store.Normal {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	if space.AccessMode == store.SpaceAccessModePublic || space.AccessMode == store.SpaceAccessModeAuthenticated {
		return space, nil
	}
	active, err := s.isActiveSpaceMember(ctx, space.ID, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to resolve space membership")
	}
	if !active {
		return nil, status.Error(codes.NotFound, "space not found")
	}
	return space, nil
}

func (s *APIV1Service) isActiveSpaceMember(ctx context.Context, spaceID, userID int32) (bool, error) {
	user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
	if err != nil {
		return false, err
	}
	if user == nil || user.RowStatus != store.Normal {
		return false, nil
	}
	membership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &spaceID, UserID: &userID})
	if err != nil {
		return false, err
	}
	return membership != nil && membership.Role.IsActiveMember(), nil
}

func sameOptionalInt32(left, right *int32) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func memoWritePolicy(actorUserID int32, lifecycleOnly bool) *store.MemoWritePolicy {
	return &store.MemoWritePolicy{
		ActorUserID:   actorUserID,
		LifecycleOnly: lifecycleOnly,
	}
}

func mapMemoWriteError(err error, operation string) error {
	switch {
	case stderrors.Is(err, store.ErrMemoMutationConflict):
		return status.Errorf(codes.FailedPrecondition, "memo state changed: %v", err)
	case stderrors.Is(err, store.ErrMemoSpaceNotWritable):
		return status.Error(codes.FailedPrecondition, "memo space is no longer writable")
	case stderrors.Is(err, store.ErrMemoSpaceMembershipRequired), stderrors.Is(err, store.ErrMemoPermissionDenied):
		return status.Error(codes.PermissionDenied, "permission denied")
	case stderrors.Is(err, store.ErrMemoShareConflict):
		return status.Error(codes.FailedPrecondition, "revoke active shares before using the SPACE audience")
	default:
		return status.Errorf(codes.Internal, "%s: %v", operation, err)
	}
}

func (s *APIV1Service) requireAssignedMemoWritable(ctx context.Context, memo *store.Memo, userID int32) error {
	if memo.SpaceID == nil {
		return nil
	}
	space, err := s.Store.GetSpace(ctx, &store.FindSpace{ID: memo.SpaceID})
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get memo space")
	}
	if space == nil {
		return status.Errorf(codes.FailedPrecondition, "memo has invalid space placement")
	}
	if space.AccessMode == store.SpaceAccessModePublic || space.AccessMode == store.SpaceAccessModeAuthenticated {
		return nil
	}
	active, err := s.isActiveSpaceMember(ctx, space.ID, userID)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to resolve space membership")
	}
	if !active {
		return status.Errorf(codes.PermissionDenied, "active space membership is required")
	}
	return nil
}
