package v1

import (
	"context"
	"log/slog"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

type revisionRestoreKey struct{}

func (s *APIV1Service) historyLimits(ctx context.Context) (int, int, error) {
	setting, err := s.Store.GetInstanceGeneralSetting(ctx)
	if err != nil {
		return 0, 0, err
	}
	days, limit := 30, 20
	if setting.TrashRetentionDays != nil {
		days = int(*setting.TrashRetentionDays)
	}
	if setting.MemoRevisionLimit != nil {
		limit = int(*setting.MemoRevisionLimit)
	}
	return days, limit, nil
}

func (s *APIV1Service) requireMemoManager(ctx context.Context, name string, deleted bool) (*store.Memo, *store.User, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, nil, status.Error(codes.Internal, "failed to resolve user")
	}
	if user == nil {
		return nil, nil, status.Error(codes.Unauthenticated, "sign in required")
	}
	uid, err := ExtractMemoUIDFromName(name)
	if err != nil {
		return nil, nil, status.Error(codes.InvalidArgument, "invalid memo name")
	}
	find := &store.FindMemo{UID: &uid}
	if deleted {
		find.Deleted = store.OnlyDeleted
	}
	memo, err := s.Store.GetMemo(ctx, find)
	if err != nil {
		return nil, nil, status.Error(codes.Internal, "failed to find memo")
	}
	if memo == nil {
		return nil, nil, status.Error(codes.NotFound, "memo not found")
	}
	allowed := memo.CreatorID == user.ID || isSuperUser(user)
	if !deleted {
		allowed, err = s.canManageMemo(ctx, user, memo)
		if err != nil {
			return nil, nil, status.Error(codes.Internal, "failed to resolve memo permissions")
		}
	}
	if !allowed {
		return nil, nil, status.Error(codes.PermissionDenied, "memo manager permission required")
	}
	return memo, user, nil
}

// ListDeletedMemos returns only the caller's trash unless an administrator explicitly requests all.
func (s *APIV1Service) ListDeletedMemos(ctx context.Context, r *v1pb.ListDeletedMemosRequest) (*v1pb.ListDeletedMemosResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, status.Error(codes.Unauthenticated, "sign in required")
	}
	if r.ShowAll && !isSuperUser(user) {
		return nil, status.Error(codes.PermissionDenied, "administrator required")
	}
	limit, offset, err := listSpacePage(r.PageSize, r.PageToken)
	if err != nil {
		return nil, err
	}
	limit = min(limit, 100)
	size := limit + 1
	find := &store.FindMemo{Deleted: store.OnlyDeleted, Limit: &size, Offset: &offset}
	if !r.ShowAll {
		find.CreatorID = &user.ID
	}
	memos, err := s.Store.ListMemos(ctx, find)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to list trash")
	}
	response := &v1pb.ListDeletedMemosResponse{Memos: []*v1pb.Memo{}}
	if len(memos) > limit {
		memos = memos[:limit]
		response.NextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, err
		}
	}
	days, _, err := s.historyLimits(ctx)
	if err != nil {
		return nil, err
	}
	for _, memo := range memos {
		// Trash is a manager-only projection; do not rely on public read projections
		// which intentionally hide deleted resources and may consult parent memos.
		item := &v1pb.Memo{Name: buildMemoName(memo.UID), Content: memo.Content, State: convertStateFromStore(memo.RowStatus), Visibility: convertVisibilityFromStore(memo.Visibility), CreateTime: timestamppb.New(time.Unix(memo.CreatedTs, 0)), UpdateTime: timestamppb.New(time.Unix(memo.UpdatedTs, 0))}
		if memo.Payload != nil {
			item.Property = convertMemoPropertyFromStore(memo.Payload.Property)
		}
		if memo.DeletedTs != nil {
			at := time.UnixMicro(*memo.DeletedTs)
			item.DeleteTime = timestamppb.New(at)
			item.PurgeTime = timestamppb.New(at.Add(time.Duration(days) * 24 * time.Hour))
		}
		response.Memos = append(response.Memos, item)
	}
	return response, nil
}

// RestoreMemo restores a deleted memo and its jointly deleted comments.
func (s *APIV1Service) RestoreMemo(ctx context.Context, r *v1pb.RestoreMemoRequest) (*v1pb.Memo, error) {
	memo, user, err := s.requireMemoManager(ctx, r.Name, true)
	if err != nil {
		return nil, err
	}
	if err := s.Store.RestoreDeletedMemo(ctx, memo.ID, user.ID, isSuperUser(user)); err != nil {
		return nil, mapMemoWriteError(err, "cannot restore memo or its parent")
	}
	s.SSEHub.publishMemoChanged()
	result, err := s.GetMemo(ctx, &v1pb.GetMemoRequest{Name: r.Name})
	if err != nil {
		// Management permission can outlive read permission after leaving a space.
		// A successful restore must not expose the content in that case.
		if status.Code(err) == codes.PermissionDenied || status.Code(err) == codes.NotFound {
			return &v1pb.Memo{Name: r.Name}, nil
		}
		return nil, err
	}
	if err := s.DispatchMemoUpdatedWebhook(ctx, result); err != nil {
		slog.Warn("restored memo webhook failed", "error", err)
	}
	return result, nil
}

func (s *APIV1Service) purgeStoredMemo(ctx context.Context, memo *store.Memo, actor int32) error {
	var result *store.DeleteMemoWithPolicyResult
	var err error
	if actor == 0 {
		result, err = s.Store.PurgeDeletedMemo(ctx, memo.ID)
	} else {
		result, err = s.Store.DeleteMemoWithPolicy(ctx, &store.DeleteMemoWithPolicy{MemoID: memo.ID, ActorUserID: actor, AdminOverride: actor != memo.CreatorID, RequireDeleted: true})
	}
	if err != nil {
		return err
	}
	return s.cleanupDeletedAttachmentStorage(ctx, result.Attachments)
}

// PurgeMemo permanently deletes a resource after revalidating that it is in trash.
func (s *APIV1Service) PurgeMemo(ctx context.Context, r *v1pb.PurgeMemoRequest) (*emptypb.Empty, error) {
	memo, user, err := s.requireMemoManager(ctx, r.Name, true)
	if err != nil {
		return nil, err
	}
	if err := s.purgeStoredMemo(ctx, memo, user.ID); err != nil {
		return nil, mapMemoWriteError(err, "failed to purge memo")
	}
	s.SSEHub.publishMemoChanged()
	return &emptypb.Empty{}, nil
}

// EmptyTrash works in bounded batches and honors cancellation.
func (s *APIV1Service) EmptyTrash(ctx context.Context, r *v1pb.EmptyTrashRequest) (*emptypb.Empty, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, status.Error(codes.Unauthenticated, "sign in required")
	}
	if r.ShowAll && !isSuperUser(user) {
		return nil, status.Error(codes.PermissionDenied, "administrator required")
	}
	size := 100
	find := &store.FindMemo{Deleted: store.OnlyDeleted, Limit: &size, OrderByID: true}
	if !r.ShowAll {
		find.CreatorID = &user.ID
	}
	for ctx.Err() == nil {
		memos, err := s.Store.ListMemos(ctx, find)
		if err != nil {
			return nil, err
		}
		if len(memos) == 0 {
			break
		}
		for _, memo := range memos {
			existing, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &memo.ID, Deleted: store.OnlyDeleted})
			if err != nil {
				return nil, err
			}
			if existing == nil {
				continue
			}
			if err := s.purgeStoredMemo(ctx, memo, user.ID); err != nil {
				return nil, mapMemoWriteError(err, "failed to empty trash")
			}
		}
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	s.SSEHub.publishMemoChanged()
	return &emptypb.Empty{}, nil
}

// PurgeExpiredTrash processes at most 100 expired roots each hourly run, retrying failures next time.
func (s *APIV1Service) PurgeExpiredTrash(ctx context.Context) {
	defer s.Store.RetryAttachmentCleanup(ctx)
	days, _, err := s.historyLimits(ctx)
	if err != nil {
		slog.Warn("trash retention lookup failed", "error", err)
		return
	}
	beforeMicro := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMicro()
	size := 100
	memos, err := s.Store.ListMemos(ctx, &store.FindMemo{Deleted: store.OnlyDeleted, DeletedBeforeTs: &beforeMicro, Limit: &size, OrderByID: true})
	if err != nil {
		slog.Warn("expired trash lookup failed", "error", err)
		return
	}
	for _, memo := range memos {
		if ctx.Err() != nil {
			return
		}
		if err := s.purgeStoredMemo(ctx, memo, 0); err != nil {
			slog.Warn("expired trash purge failed; will retry", "memo", memo.UID, "error", err)
		}
	}
	if len(memos) > 0 {
		s.SSEHub.publishMemoChanged()
	}
}

func (s *APIV1Service) revisionMessage(ctx context.Context, name string, r *store.MemoRevision, full bool) *v1pb.MemoRevision {
	editor := ""
	if user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &r.EditorID}); err == nil && user != nil {
		editor = BuildUserName(user.Username)
	}
	runes := []rune(r.Content)
	preview := r.Content
	if len(runes) > 100 {
		preview = string(runes[:100]) + "…"
	}
	item := &v1pb.MemoRevision{Id: r.ID, Memo: name, Editor: editor, CreateTime: timestamppb.New(time.Unix(r.CreatedTs, 0)), Preview: preview, Visibility: convertVisibilityFromStore(r.Visibility)}
	if full {
		item.Content = r.Content
	}
	return item
}

// ListMemoRevisions never grants public readers access to historical private content.
func (s *APIV1Service) ListMemoRevisions(ctx context.Context, r *v1pb.ListMemoRevisionsRequest) (*v1pb.ListMemoRevisionsResponse, error) {
	memo, _, err := s.requireMemoManager(ctx, r.Name, false)
	if err != nil {
		return nil, err
	}
	list, err := s.Store.ListMemoRevisionPreviews(ctx, memo.ID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to list history")
	}
	result := &v1pb.ListMemoRevisionsResponse{Revisions: []*v1pb.MemoRevision{}}
	for _, revision := range list {
		result.Revisions = append(result.Revisions, s.revisionMessage(ctx, r.Name, revision, false))
	}
	return result, nil
}

// GetMemoRevision checks the memo's management permission beforeMicro looking up a revision id.
func (s *APIV1Service) GetMemoRevision(ctx context.Context, r *v1pb.GetMemoRevisionRequest) (*v1pb.MemoRevision, error) {
	memo, _, err := s.requireMemoManager(ctx, r.Name, false)
	if err != nil {
		return nil, err
	}
	if r.RevisionId <= 0 {
		return nil, status.Error(codes.InvalidArgument, "invalid revision id")
	}
	revision, err := s.Store.GetMemoRevision(ctx, memo.ID, r.RevisionId)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to read revision")
	}
	if revision == nil {
		return nil, status.Error(codes.NotFound, "revision not found")
	}
	return s.revisionMessage(ctx, r.Name, revision, true), nil
}

// RestoreMemoRevision intentionally uses UpdateMemo for validation, payload parsing and side effects.
func (s *APIV1Service) RestoreMemoRevision(ctx context.Context, r *v1pb.RestoreMemoRevisionRequest) (*v1pb.Memo, error) {
	revision, err := s.GetMemoRevision(ctx, &v1pb.GetMemoRevisionRequest{Name: r.Name, RevisionId: r.RevisionId})
	if err != nil {
		return nil, err
	}
	return s.UpdateMemo(context.WithValue(ctx, revisionRestoreKey{}, true), &v1pb.UpdateMemoRequest{Memo: &v1pb.Memo{Name: r.Name, Content: revision.Content}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}}})
}

// DeleteMemoRevision removes a single private snapshot.
func (s *APIV1Service) DeleteMemoRevision(ctx context.Context, r *v1pb.DeleteMemoRevisionRequest) (*emptypb.Empty, error) {
	memo, _, err := s.requireMemoManager(ctx, r.Name, false)
	if err != nil {
		return nil, err
	}
	if r.RevisionId <= 0 {
		return nil, status.Error(codes.InvalidArgument, "invalid revision id")
	}
	if err := s.Store.DeleteMemoRevisions(ctx, memo.ID, r.RevisionId); err != nil {
		return nil, status.Error(codes.Internal, "failed to delete revision")
	}
	return &emptypb.Empty{}, nil
}

// ClearMemoRevisions deletes every private snapshot for a memo managed by the caller.
func (s *APIV1Service) ClearMemoRevisions(ctx context.Context, r *v1pb.ClearMemoRevisionsRequest) (*emptypb.Empty, error) {
	memo, _, err := s.requireMemoManager(ctx, r.Name, false)
	if err != nil {
		return nil, err
	}
	if err := s.Store.DeleteMemoRevisions(ctx, memo.ID, 0); err != nil {
		return nil, status.Error(codes.Internal, "failed to clear history")
	}
	return &emptypb.Empty{}, nil
}
