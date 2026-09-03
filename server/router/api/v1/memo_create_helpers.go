package v1

import (
	"context"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/server/runner/memopayload"
	"github.com/usememos/memos/store"
)

func mapMemoCreateError(err error, uid, operation string) error {
	errMessage := err.Error()
	if strings.Contains(errMessage, "UNIQUE constraint failed") ||
		strings.Contains(errMessage, "duplicate key") ||
		strings.Contains(errMessage, "Duplicate entry") {
		return status.Errorf(codes.AlreadyExists, "memo with ID %q already exists", uid)
	}
	return mapMemoWriteError(err, operation)
}

type preparedMemoCreate struct {
	memo                  *store.Memo
	attachments           *preparedMemoAttachments
	requiredAttachmentIDs []int32
	referenceRelations    []*store.MemoRelation
}

// prepareMemoCreate validates and prepares the fields shared by top-level
// memo and comment creation. It does not write database or external state.
func (s *APIV1Service) prepareMemoCreate(ctx context.Context, user *store.User, input *v1pb.Memo, uid string) (*preparedMemoCreate, error) {
	if user == nil || input == nil {
		return nil, status.Error(codes.InvalidArgument, "memo is required")
	}
	if input.Hidden && !isSuperUser(user) {
		return nil, status.Error(codes.PermissionDenied, "only administrators can hide memos")
	}
	if input.HideTime && !isSuperUser(user) {
		return nil, status.Error(codes.PermissionDenied, "only administrators can hide memo timestamps")
	}
	if input.AdminScript != "" && !isSuperUser(user) {
		return nil, status.Error(codes.PermissionDenied, "only administrators can set memo scripts")
	}
	if !isSuperUser(user) && (input.CreateTime != nil || input.UpdateTime != nil) {
		return nil, status.Error(codes.PermissionDenied, "only administrators can customize memo timestamps")
	}
	if err := validateMemoAdminScript(input.AdminScript); err != nil {
		return nil, err
	}
	if err := validateMemoLocalScripts(input.Content, isSuperUser(user)); err != nil {
		return nil, err
	}
	visibility, err := validateCreateMemoVisibility(input.Visibility)
	if err != nil {
		return nil, err
	}
	memo := &store.Memo{
		UID:        uid,
		CreatorID:  user.ID,
		Content:    input.Content,
		Visibility: visibility,
	}
	if input.Space != nil && input.GetSpace() != "" {
		space, err := s.resolveWritableSpaceByName(ctx, input.GetSpace(), user.ID)
		if err != nil {
			return nil, err
		}
		memo.SpaceID = &space.ID
	}
	if memo.Visibility == store.SpaceAudience && memo.SpaceID == nil {
		return nil, status.Error(codes.InvalidArgument, "SPACE visibility requires a space")
	}
	if input.CreateTime != nil && input.CreateTime.IsValid() {
		memo.CreatedTs = input.CreateTime.AsTime().Unix()
	}
	if input.UpdateTime != nil && input.UpdateTime.IsValid() {
		memo.UpdatedTs = input.UpdateTime.AsTime().Unix()
	}

	contentLengthLimit, err := s.getContentLengthLimit(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get content length limit")
	}
	if len(memo.Content) > contentLengthLimit {
		return nil, status.Errorf(codes.InvalidArgument, "content too long (max %d characters)", contentLengthLimit)
	}
	if err := s.validateMemoContentAgainstBlockedWords(ctx, memo.Content); err != nil {
		return nil, err
	}
	if err := memopayload.RebuildMemoPayload(ctx, memo, s.MarkdownService); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to rebuild memo payload: %v", err)
	}
	if input.Location != nil {
		memo.Payload.Location = convertLocationToStore(input.Location)
	}
	if input.PublishTime != nil {
		if !input.PublishTime.IsValid() {
			return nil, status.Error(codes.InvalidArgument, "publish_time is invalid")
		}
		memo.Payload.PublishTs = input.PublishTime.AsTime().Unix()
	}
	memo.Payload.Draft = input.Draft || memo.Payload.PublishTs > time.Now().Unix()
	if memo.Payload.Draft && memo.Payload.PublishTs > 0 && memo.Payload.PublishTs <= time.Now().Unix() {
		memo.Payload.PublishTs = 0
	}
	if input.Hidden {
		memo.Payload.Hidden = true
		memo.Visibility = store.Public
	}
	memo.Payload.Anonymous = input.Anonymous
	memo.Payload.AdminScript = input.AdminScript
	memo.Payload.HideTime = input.HideTime
	if input.Category != nil {
		category, err := s.normalizeMemoCategory(ctx, *input.Category)
		if err != nil {
			return nil, err
		}
		memo.Payload.Category = category
	}
	if err := validatePoll(input.Poll); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "%v", err)
	}
	memo.Payload.Poll = pollToStore(input.Poll)

	attachments, err := s.prepareMemoAttachments(ctx, user, memo, input.Attachments)
	if err != nil {
		return nil, err
	}
	requiredAttachmentIDs, err := s.resolveMemoAttachmentReferences(memo.Content, attachments.normalized)
	if err != nil {
		return nil, err
	}
	relations, err := s.prepareMemoRelations(ctx, memo, input.Relations)
	if err != nil {
		return nil, err
	}
	return &preparedMemoCreate{
		memo:                  memo,
		attachments:           attachments,
		requiredAttachmentIDs: requiredAttachmentIDs,
		referenceRelations:    relations,
	}, nil
}
