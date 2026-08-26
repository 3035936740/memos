package v1

import (
	"context"
	stderrors "errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/emptypb"

	"github.com/usememos/memos/internal/httpgetter"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/access"
	"github.com/usememos/memos/server/runner/memopayload"
	"github.com/usememos/memos/store"
)

// suppressSSEKey is a context key used to suppress the SSE broadcast from
// CreateMemo when it is called internally (e.g., from CreateMemoComment).
type suppressSSEKey struct{}

const maxBatchGetLinkMetadata = 10

var fetchHTMLMeta = httpgetter.GetHTMLMeta

func withSuppressSSE(ctx context.Context) context.Context {
	return context.WithValue(ctx, suppressSSEKey{}, true)
}

func isSSESuppressed(ctx context.Context) bool {
	v, ok := ctx.Value(suppressSSEKey{}).(bool)
	return ok && v
}

func (s *APIV1Service) checkMemoReadAccess(ctx context.Context, memo *store.Memo) error {
	return s.checkMemoReadAccessWithParent(ctx, memo, nil)
}

func (s *APIV1Service) checkMemoAndParentReadAccess(ctx context.Context, memo *store.Memo) error {
	var parent *store.Memo
	if memo != nil && memo.ParentUID != nil {
		var err error
		parent, err = s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
		if err != nil {
			return status.Errorf(codes.Internal, "failed to get parent memo")
		}
		if parent == nil {
			return status.Errorf(codes.NotFound, "memo not found")
		}
	}
	return s.checkMemoReadAccessWithParent(ctx, memo, parent)
}

func (s *APIV1Service) checkMemoReadAccessWithParent(ctx context.Context, memo, parent *store.Memo) error {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get user")
	}
	for _, candidate := range []*store.Memo{parent, memo} {
		if candidate == nil || candidate.Payload == nil || isSuperUser(user) {
			continue
		}
		if candidate.Payload.Quarantined {
			return status.Errorf(codes.NotFound, "memo not found")
		}
		if candidate.Payload.Draft && (candidate.Payload.PublishTs == 0 || candidate.Payload.PublishTs > time.Now().Unix()) {
			if user == nil || candidate.CreatorID != user.ID {
				return status.Errorf(codes.NotFound, "memo not found")
			}
		}
	}
	if isSuperUser(user) {
		return nil
	}
	deniedCategories, err := s.inaccessibleMemoCategories(ctx, user)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to load memo category access")
	}
	for _, candidate := range []*store.Memo{parent, memo} {
		if !memoVisibleInCategories(candidate, deniedCategories) {
			return status.Errorf(codes.NotFound, "memo not found")
		}
	}
	allowAnonymous := s.Profile != nil && s.Profile.AllowAnonymous()
	return memoAccessDecisionError(access.CheckMemoRead(memo, parent, user, allowAnonymous, nil))
}

func memoAccessDecisionError(decision access.MemoReadDecision) error {
	switch decision.Denial {
	case access.MemoReadDenialNone:
		return nil
	case access.MemoReadDenialNotFound:
		return status.Errorf(codes.NotFound, "memo not found")
	case access.MemoReadDenialUnauthenticated:
		return status.Errorf(codes.Unauthenticated, "user not authenticated")
	default:
		return status.Errorf(codes.PermissionDenied, "permission denied")
	}
}

// memoVisibleInCollection omits hidden memos from collection-style responses.
// Creators can still manage their own hidden memos and admins can audit every
// hidden memo; direct GetMemo access remains visibility-based.
//
// This check intentionally runs after the payload has been decoded. Older
// memos do not have the hidden JSON field, and database JSON predicates can
// otherwise treat that missing field as NULL and exclude every legacy memo.
func memoVisibleInCollection(memo *store.Memo, user *store.User) bool {
	if memo == nil {
		return false
	}
	if isSuperUser(user) {
		return true
	}
	if memo.Payload != nil {
		if memo.Payload.Quarantined {
			return false
		}
		if memo.Payload.Draft && (memo.Payload.PublishTs == 0 || memo.Payload.PublishTs > time.Now().Unix()) {
			return user != nil && memo.CreatorID == user.ID
		}
	}
	if memo.Payload == nil || !memo.Payload.Hidden {
		return true
	}
	return user != nil && memo.CreatorID == user.ID
}

func memoIsUnpublished(memo *store.Memo, now int64) bool {
	return memo != nil && memo.Payload != nil && memo.Payload.Draft && (memo.Payload.PublishTs == 0 || memo.Payload.PublishTs > now)
}

func memoVisibleInCollectionScope(memo *store.Memo, user *store.User, hideAnonymousOwnership bool) bool {
	if hideAnonymousOwnership && memo != nil && memo.Payload != nil && memo.Payload.Anonymous && !isSuperUser(user) {
		return user != nil && memo.CreatorID == user.ID
	}
	return memoVisibleInCollection(memo, user)
}

func filterMemosForCollection(memos []*store.Memo, user *store.User, deniedCategories map[string]struct{}) []*store.Memo {
	visibleMemos := make([]*store.Memo, 0, len(memos))
	for _, memo := range memos {
		if memoVisibleInCollection(memo, user) && memoVisibleInCategories(memo, deniedCategories) {
			visibleMemos = append(visibleMemos, memo)
		}
	}
	return visibleMemos
}

// listMemoCollectionPage scans raw database pages and applies collection
// visibility before the public offset and limit. This keeps pagination stable
// even when hidden memos are interleaved with visible ones.
func (s *APIV1Service) listMemoCollectionPage(
	ctx context.Context,
	find *store.FindMemo,
	user *store.User,
	deniedCategories map[string]struct{},
	hideAnonymousOwnership bool,
	visibleOffset int,
	visibleLimit int,
) ([]*store.Memo, error) {
	const chunkSize = 100

	visibleMemos := make([]*store.Memo, 0, visibleLimit)
	rawOffset := 0
	skippedVisible := 0
	for len(visibleMemos) < visibleLimit {
		batchFind := *find
		batchLimit := chunkSize
		batchOffset := rawOffset
		batchFind.Limit = &batchLimit
		batchFind.Offset = &batchOffset

		batch, err := s.Store.ListMemos(ctx, &batchFind)
		if err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}

		for _, memo := range batch {
			if !memoVisibleInCollectionScope(memo, user, hideAnonymousOwnership) || !memoVisibleInCategories(memo, deniedCategories) {
				continue
			}
			if skippedVisible < visibleOffset {
				skippedVisible++
				continue
			}
			visibleMemos = append(visibleMemos, memo)
			if len(visibleMemos) == visibleLimit {
				return visibleMemos, nil
			}
		}

		rawOffset += len(batch)
		if len(batch) < chunkSize {
			break
		}
	}

	return visibleMemos, nil
}

func (s *APIV1Service) CreateMemo(ctx context.Context, request *v1pb.CreateMemoRequest) (*v1pb.Memo, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if request.Memo == nil {
		return nil, status.Errorf(codes.InvalidArgument, "memo is required")
	}
	if !isSuperUser(user) {
		securitySetting, err := s.Store.GetInstanceModerationSecuritySetting(ctx)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to load publishing policy")
		}
		if securitySetting.PublishCooldownSeconds > 0 {
			limit := 1
			recent, err := s.Store.ListMemos(ctx, &store.FindMemo{CreatorID: &user.ID, Limit: &limit})
			if err != nil {
				return nil, status.Errorf(codes.Internal, "failed to check publishing rate")
			}
			if len(recent) > 0 {
				remaining := int64(securitySetting.PublishCooldownSeconds) - (time.Now().Unix() - recent[0].CreatedTs)
				if remaining > 0 {
					return nil, status.Errorf(codes.ResourceExhausted, "please wait %d seconds before publishing again", remaining)
				}
			}
		}
	}

	memoUID, err := ValidateAndGenerateUID(request.MemoId)
	if err != nil {
		return nil, err
	}

	create := &store.Memo{
		UID:        memoUID,
		CreatorID:  user.ID,
		Content:    request.Memo.Content,
		Visibility: convertVisibilityToStore(request.Memo.Visibility),
	}
	if request.Memo.Hidden && !isSuperUser(user) {
		return nil, status.Errorf(codes.PermissionDenied, "only administrators can hide memos")
	}
	if request.Memo.AdminScript != "" && !isSuperUser(user) {
		return nil, status.Errorf(codes.PermissionDenied, "only administrators can set memo scripts")
	}
	if err := validateMemoAdminScript(request.Memo.AdminScript); err != nil {
		return nil, err
	}
	if err := validateMemoLocalScripts(request.Memo.Content, isSuperUser(user)); err != nil {
		return nil, err
	}
	if !isSuperUser(user) && (request.Memo.CreateTime != nil || request.Memo.UpdateTime != nil) {
		return nil, status.Errorf(codes.PermissionDenied, "only administrators can customize memo timestamps")
	}

	// Set custom timestamps if provided in the request.
	if request.Memo.CreateTime != nil && request.Memo.CreateTime.IsValid() {
		createdTs := request.Memo.CreateTime.AsTime().Unix()
		create.CreatedTs = createdTs
	}
	if request.Memo.UpdateTime != nil && request.Memo.UpdateTime.IsValid() {
		updatedTs := request.Memo.UpdateTime.AsTime().Unix()
		create.UpdatedTs = updatedTs
	}

	contentLengthLimit, err := s.getContentLengthLimit(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get content length limit")
	}
	if len(create.Content) > contentLengthLimit {
		return nil, status.Errorf(codes.InvalidArgument, "content too long (max %d characters)", contentLengthLimit)
	}
	if err := s.validateMemoContentAgainstBlockedWords(ctx, create.Content); err != nil {
		return nil, err
	}
	if err := memopayload.RebuildMemoPayload(ctx, create, s.MarkdownService); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to rebuild memo payload: %v", err)
	}
	if request.Memo.PublishTime != nil {
		if !request.Memo.PublishTime.IsValid() {
			return nil, status.Errorf(codes.InvalidArgument, "publish_time is invalid")
		}
		create.Payload.PublishTs = request.Memo.PublishTime.AsTime().Unix()
	}
	create.Payload.Draft = request.Memo.Draft || create.Payload.PublishTs > time.Now().Unix()
	// A past timestamp is an immediate publication, not a scheduled draft. This
	// prevents the background runner from dispatching a second creation event.
	if create.Payload.Draft && create.Payload.PublishTs > 0 && create.Payload.PublishTs <= time.Now().Unix() {
		create.Payload.PublishTs = 0
	}
	if request.Memo.Hidden {
		create.Payload.Hidden = true
		create.Visibility = store.Public
	}
	create.Payload.Anonymous = request.Memo.Anonymous
	create.Payload.AdminScript = request.Memo.AdminScript
	if request.Memo.Location != nil {
		create.Payload.Location = convertLocationToStore(request.Memo.Location)
	}
	if request.Memo.Category != nil {
		category, err := s.normalizeMemoCategory(ctx, *request.Memo.Category)
		if err != nil {
			return nil, err
		}
		create.Payload.Category = category
	}

	preparedAttachments, err := s.prepareMemoAttachments(ctx, user, create, request.Memo.Attachments)
	if err != nil {
		return nil, err
	}
	requiredAttachmentIDs, err := s.resolveMemoAttachmentReferences(create.Content, preparedAttachments.normalized)
	if err != nil {
		return nil, err
	}
	preparedRelations, err := s.prepareMemoRelations(ctx, create, request.Memo.Relations)
	if err != nil {
		return nil, err
	}

	memo, err := s.Store.CreateMemo(ctx, create)
	if err != nil {
		// Check for unique constraint violation (AIP-133 compliance)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") ||
			strings.Contains(errMsg, "duplicate key") ||
			strings.Contains(errMsg, "Duplicate entry") {
			return nil, status.Errorf(codes.AlreadyExists, "memo with ID %q already exists", memoUID)
		}
		return nil, err
	}

	attachments := []*store.Attachment{}
	if len(preparedAttachments.normalized) > 0 || len(preparedRelations) > 0 {
		var relations *[]*store.MemoRelation
		if len(preparedRelations) > 0 {
			relations = &preparedRelations
		}
		if err := s.applyMemoMutation(ctx, memo, preparedAttachments, nil, requiredAttachmentIDs, relations); err != nil {
			return nil, err
		}
		a, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
			MemoID: &memo.ID,
		})
		if err != nil {
			return nil, errors.Wrap(err, "failed to get memo attachments")
		}
		attachments = a
	}

	relations, err := s.loadMemoRelations(ctx, memo)
	if err != nil {
		return nil, errors.Wrap(err, "failed to load memo relations")
	}
	memoMessage, err := s.convertMemoFromStore(ctx, memo, nil, attachments, relations)
	if err != nil {
		return nil, errors.Wrap(err, "failed to convert memo")
	}
	unpublishedDraft := memoIsUnpublished(memo, time.Now().Unix())
	if !unpublishedDraft {
		// Draft content must not leak through webhooks, live events, or mention notifications.
		if err := s.DispatchMemoCreatedWebhook(ctx, memoMessage); err != nil {
			slog.Warn("Failed to dispatch memo created webhook", slog.Any("err", err))
		}
		if !isSSESuppressed(ctx) {
			s.SSEHub.Broadcast(&SSEEvent{Type: SSEEventMemoCreated, Name: memoMessage.Name, Visibility: memo.Visibility, CreatorID: resolveSSECreatorID(memo, nil)})
		}
		if !isMentionNotificationSuppressed(ctx) {
			s.dispatchMemoMentionNotificationsBestEffort(ctx, memo, nil, "")
		}
	}

	return memoMessage, nil
}

func (s *APIV1Service) ListMemos(ctx context.Context, request *v1pb.ListMemosRequest) (*v1pb.ListMemosResponse, error) {
	memoFind := &store.FindMemo{
		// Exclude comments by default.
		ExcludeComments: true,
	}
	currentUser, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}

	if request.State == v1pb.State_ARCHIVED {
		state := store.Archived
		memoFind.RowStatus = &state
		// Archived memos are only visible to their creator.
		if currentUser == nil {
			return &v1pb.ListMemosResponse{}, nil
		}
		memoFind.CreatorID = &currentUser.ID
	} else {
		state := store.Normal
		memoFind.RowStatus = &state
	}

	// Parse order_by field (replaces the old sort and direction fields)
	if request.OrderBy != "" {
		if err := s.parseMemoOrderBy(request.OrderBy, memoFind); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid order_by: %v", err)
		}
	} else {
		// Default ordering by create_time desc.
		memoFind.OrderByTimeAsc = false
	}

	if request.Filter != "" {
		if err := s.validateFilter(ctx, request.Filter); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid filter: %v", err)
		}
		memoFind.Filters = append(memoFind.Filters, request.Filter)
	}
	hideAnonymousOwnership := strings.Contains(request.Filter, "creator ==")

	if currentUser == nil {
		memoFind.VisibilityList = []store.Visibility{store.Public}
	} else if !isSuperUser(currentUser) {
		if memoFind.CreatorID == nil {
			filter := fmt.Sprintf(`creator_id == %d || visibility in ["PUBLIC", "PROTECTED"]`, currentUser.ID)
			memoFind.Filters = append(memoFind.Filters, filter)
		} else if *memoFind.CreatorID != currentUser.ID {
			memoFind.VisibilityList = []store.Visibility{store.Public, store.Protected}
		}
	}
	deniedCategories, err := s.inaccessibleMemoCategories(ctx, currentUser)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to load memo category access: %v", err)
	}
	totalSize := int32(0)
	if request.ShowTotalSize {
		countFind := *memoFind
		countFind.ExcludeContent = true
		countFind.Limit = nil
		countFind.Offset = nil
		matchingMemos, err := s.Store.ListMemos(ctx, &countFind)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to count memos: %v", err)
		}
		visibleMemos := filterMemosForCollection(matchingMemos, currentUser, deniedCategories)
		if hideAnonymousOwnership {
			visibleMemos = slices.DeleteFunc(visibleMemos, func(memo *store.Memo) bool {
				return !memoVisibleInCollectionScope(memo, currentUser, true)
			})
		}
		totalSize = int32(len(visibleMemos))
	}

	var limit, offset int
	if request.PageToken != "" {
		var pageToken v1pb.PageToken
		if err := unmarshalPageToken(request.PageToken, &pageToken); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
		}
		limit = normalizePageSize(pageToken.Limit)
		offset = max(int(pageToken.Offset), 0)
	} else {
		limit = normalizePageSize(request.PageSize)
		offset = max(int(request.PageOffset), 0)
	}
	limit = min(limit, MaxPageSize)
	limitPlusOne := limit + 1
	memos, err := s.listMemoCollectionPage(ctx, memoFind, currentUser, deniedCategories, hideAnonymousOwnership, offset, limitPlusOne)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list memos: %v", err)
	}

	memoMessages := []*v1pb.Memo{}
	nextPageToken := ""
	if len(memos) == limitPlusOne {
		memos = memos[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get next page token, error: %v", err)
		}
	}

	if len(memos) == 0 {
		response := &v1pb.ListMemosResponse{
			Memos:         memoMessages,
			NextPageToken: nextPageToken,
			TotalSize:     totalSize,
		}
		return response, nil
	}

	reactionMap := make(map[string][]*store.Reaction)
	contentIDs := make([]string, 0, len(memos))

	attachmentMap := make(map[int32][]*store.Attachment)
	memoIDs := make([]int32, 0, len(memos))

	for _, m := range memos {
		contentIDs = append(contentIDs, fmt.Sprintf("%s%s", MemoNamePrefix, m.UID))
		memoIDs = append(memoIDs, m.ID)
	}

	// REACTIONS
	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{ContentIDList: contentIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}
	for _, reaction := range reactions {
		reactionMap[reaction.ContentID] = append(reactionMap[reaction.ContentID], reaction)
	}

	// ATTACHMENTS
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoIDList: memoIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}
	for _, attachment := range attachments {
		attachmentMap[*attachment.MemoID] = append(attachmentMap[*attachment.MemoID], attachment)
	}

	// RELATIONS (batch load to avoid N+1)
	relationMap, err := s.batchConvertMemoRelations(ctx, memos, false)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to batch load memo relations")
	}
	creatorIDs := make([]int32, 0, len(memos)+len(reactions))
	for _, memo := range memos {
		creatorIDs = append(creatorIDs, memo.CreatorID)
	}
	for _, reaction := range reactions {
		creatorIDs = append(creatorIDs, reaction.CreatorID)
	}
	creatorMap, err := s.listUsersByID(ctx, creatorIDs)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list memo creators: %v", err)
	}
	for _, memo := range memos {
		memoName := fmt.Sprintf("%s%s", MemoNamePrefix, memo.UID)
		reactions := reactionMap[memoName]
		attachments := attachmentMap[memo.ID]
		relations := relationMap[memo.ID]

		memoMessage, err := s.convertMemoFromStoreWithCreators(ctx, memo, reactions, attachments, relations, creatorMap)
		if err != nil {
			if stderrors.Is(err, errMemoCreatorNotFound) {
				slog.Warn("Skipping memo with missing creator",
					slog.Int64("memo_id", int64(memo.ID)),
					slog.String("memo_uid", memo.UID),
					slog.Int64("creator_id", int64(memo.CreatorID)),
				)
				continue
			}
			return nil, errors.Wrap(err, "failed to convert memo")
		}

		memoMessages = append(memoMessages, memoMessage)
	}

	response := &v1pb.ListMemosResponse{
		Memos:         memoMessages,
		NextPageToken: nextPageToken,
		TotalSize:     totalSize,
	}
	return response, nil
}

func (s *APIV1Service) GetMemo(ctx context.Context, request *v1pb.GetMemoRequest) (*v1pb.Memo, error) {
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{
		UID: &memoUID,
	})
	if err != nil {
		return nil, err
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}

	if err := s.checkMemoAndParentReadAccess(ctx, memo); err != nil {
		return nil, err
	}

	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
		ContentID: &request.Name,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}

	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
		MemoID: &memo.ID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}

	relations, err := s.loadMemoRelations(ctx, memo)
	if err != nil {
		return nil, errors.Wrap(err, "failed to load memo relations")
	}
	memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, relations)
	if err != nil {
		if stderrors.Is(err, errMemoCreatorNotFound) {
			return nil, status.Errorf(codes.NotFound, "memo creator not found")
		}
		return nil, errors.Wrap(err, "failed to convert memo")
	}
	if memo.ParentUID != nil {
		parent, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get parent memo")
		}
		if parent == nil {
			return nil, status.Errorf(codes.NotFound, "memo not found")
		}
		memoMessage.Visibility = convertVisibilityFromStore(parent.Visibility)
	}
	return memoMessage, nil
}

// RecordMemoView records one successful visit to a memo detail page.
func (s *APIV1Service) RecordMemoView(ctx context.Context, request *v1pb.RecordMemoViewRequest) (*v1pb.RecordMemoViewResponse, error) {
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo")
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}
	if memo.ParentUID != nil {
		return nil, status.Errorf(codes.InvalidArgument, "comments do not have a view count")
	}

	if request.ShareToken != "" {
		memoShare, err := s.getActiveMemoShare(ctx, request.ShareToken)
		if err != nil || memoShare.MemoID != memo.ID || memo.RowStatus != store.Normal {
			return nil, status.Errorf(codes.NotFound, "not found")
		}
	} else if err := s.checkMemoAndParentReadAccess(ctx, memo); err != nil {
		return nil, err
	}

	viewCount, err := s.Store.IncrementMemoViewCount(ctx, memo.ID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to record memo view")
	}
	return &v1pb.RecordMemoViewResponse{ViewCount: viewCount}, nil
}

// UpdateMemo updates an existing memo.
func (s *APIV1Service) UpdateMemo(ctx context.Context, request *v1pb.UpdateMemoRequest) (*v1pb.Memo, error) {
	if request.Memo == nil {
		return nil, status.Errorf(codes.InvalidArgument, "memo is required")
	}
	memoUID, err := ExtractMemoUIDFromName(request.Memo.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "update mask is required")
	}

	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo: %v", err)
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}
	wasUnpublished := memoIsUnpublished(memo, time.Now().Unix())

	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	// Only the creator or admin can update the memo.
	if memo.CreatorID != user.ID && !isSuperUser(user) {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	update := &store.UpdateMemo{
		ID: memo.ID,
	}
	previousContent := memo.Content
	contentUpdated := false
	attachmentsUpdated := false
	relationsUpdated := false
	nextMemo := *memo
	if memo.Payload != nil {
		nextMemo.Payload = &storepb.MemoPayload{}
		proto.Merge(nextMemo.Payload, memo.Payload)
	}
	for _, path := range request.UpdateMask.Paths {
		if path == "hidden" && !isSuperUser(user) {
			return nil, status.Errorf(codes.PermissionDenied, "only administrators can hide memos")
		}
		if path == "pinned" && !isSuperUser(user) {
			return nil, status.Errorf(codes.PermissionDenied, "only administrators can pin memos")
		}
		if path == "create_time" && !isSuperUser(user) {
			return nil, status.Errorf(codes.PermissionDenied, "only administrators can customize memo timestamps")
		}
		if path == "admin_script" && !isSuperUser(user) {
			return nil, status.Errorf(codes.PermissionDenied, "only administrators can set memo scripts")
		}
		// An update_time path with no explicit value is the normal automatic
		// timestamp applied to content edits. Only explicit overrides are admin-only.
		if path == "update_time" && request.Memo.UpdateTime != nil && !isSuperUser(user) {
			return nil, status.Errorf(codes.PermissionDenied, "only administrators can customize memo timestamps")
		}
	}

	for _, path := range request.UpdateMask.Paths {
		if path == "content" {
			if err := validateMemoLocalScripts(request.Memo.Content, isSuperUser(user)); err != nil {
				return nil, err
			}
			contentUpdated = true
			contentLengthLimit, err := s.getContentLengthLimit(ctx)
			if err != nil {
				return nil, status.Errorf(codes.Internal, "failed to get content length limit")
			}
			if len(request.Memo.Content) > contentLengthLimit {
				return nil, status.Errorf(codes.InvalidArgument, "content too long (max %d characters)", contentLengthLimit)
			}
			if err := s.validateMemoContentAgainstBlockedWords(ctx, request.Memo.Content); err != nil {
				return nil, err
			}
			nextMemo.Content = request.Memo.Content
			if err := memopayload.RebuildMemoPayload(ctx, &nextMemo, s.MarkdownService); err != nil {
				return nil, status.Errorf(codes.Internal, "failed to rebuild memo payload: %v", err)
			}
			update.Content = &nextMemo.Content
			update.Payload = nextMemo.Payload
		} else if path == "visibility" {
			visibility := convertVisibilityToStore(request.Memo.Visibility)
			if memo.ParentUID != nil {
				parentMemo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
				if err != nil {
					return nil, status.Errorf(codes.Internal, "failed to get parent memo")
				}
				if parentMemo == nil {
					return nil, status.Errorf(codes.NotFound, "memo not found")
				}
				visibility = parentMemo.Visibility
			}
			update.Visibility = &visibility
		} else if path == "pinned" {
			update.Pinned = &request.Memo.Pinned
		} else if path == "state" {
			rowStatus := convertStateToStore(request.Memo.State)
			update.RowStatus = &rowStatus
		} else if path == "create_time" {
			if request.Memo.CreateTime == nil || !request.Memo.CreateTime.IsValid() {
				return nil, status.Errorf(codes.InvalidArgument, "create_time is invalid")
			}
			createdTs := request.Memo.CreateTime.AsTime().Unix()
			update.CreatedTs = &createdTs
		} else if path == "update_time" {
			updatedTs := time.Now().Unix()
			if request.Memo.UpdateTime != nil {
				updatedTs = request.Memo.UpdateTime.AsTime().Unix()
			}
			update.UpdatedTs = &updatedTs
		} else if path == "display_time" {
			return nil, status.Errorf(codes.InvalidArgument, "display_time is not supported")
		} else if path == "location" {
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.Location = convertLocationToStore(request.Memo.Location)
			update.Payload = nextMemo.Payload
		} else if path == "category" {
			category := ""
			if request.Memo.Category != nil {
				category = *request.Memo.Category
			}
			normalized, err := s.normalizeMemoCategory(ctx, category)
			if err != nil {
				return nil, err
			}
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.Category = normalized
			update.Payload = nextMemo.Payload
		} else if path == "hidden" {
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.Hidden = request.Memo.Hidden
			update.Payload = nextMemo.Payload
		} else if path == "anonymous" {
			if memo.ParentUID != nil {
				return nil, status.Errorf(codes.InvalidArgument, "comments cannot be anonymous")
			}
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.Anonymous = request.Memo.Anonymous
			update.Payload = nextMemo.Payload
		} else if path == "admin_script" {
			if err := validateMemoAdminScript(request.Memo.AdminScript); err != nil {
				return nil, err
			}
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.AdminScript = request.Memo.AdminScript
			update.Payload = nextMemo.Payload
		} else if path == "draft" {
			if memo.ParentUID != nil {
				return nil, status.Errorf(codes.InvalidArgument, "comments cannot be drafts")
			}
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.Draft = request.Memo.Draft
			if !request.Memo.Draft {
				nextMemo.Payload.PublishTs = 0
			}
			update.Payload = nextMemo.Payload
		} else if path == "publish_time" {
			if memo.ParentUID != nil {
				return nil, status.Errorf(codes.InvalidArgument, "comments cannot be scheduled")
			}
			if nextMemo.Payload == nil {
				nextMemo.Payload = &storepb.MemoPayload{}
			}
			nextMemo.Payload.PublishTs = 0
			if request.Memo.PublishTime != nil {
				if !request.Memo.PublishTime.IsValid() {
					return nil, status.Errorf(codes.InvalidArgument, "publish_time is invalid")
				}
				nextMemo.Payload.PublishTs = request.Memo.PublishTime.AsTime().Unix()
				nextMemo.Payload.Draft = nextMemo.Payload.PublishTs > time.Now().Unix()
			}
			update.Payload = nextMemo.Payload
		} else if path == "attachments" {
			attachmentsUpdated = true
		} else if path == "relations" {
			relationsUpdated = true
		}
	}
	if nextMemo.Payload != nil && nextMemo.Payload.Hidden {
		visibility := store.Public
		update.Visibility = &visibility
	}
	if nextMemo.Payload != nil && nextMemo.Payload.Draft && nextMemo.Payload.PublishTs > 0 && nextMemo.Payload.PublishTs <= time.Now().Unix() {
		nextMemo.Payload.PublishTs = 0
		update.Payload = nextMemo.Payload
	}

	var preparedAttachments *preparedMemoAttachments
	if attachmentsUpdated {
		preparedAttachments, err = s.prepareMemoAttachments(ctx, user, memo, request.Memo.Attachments)
		if err != nil {
			return nil, err
		}
	}
	var preparedRelations []*store.MemoRelation
	if relationsUpdated {
		preparedRelations, err = s.prepareMemoRelations(ctx, memo, request.Memo.Relations)
		if err != nil {
			return nil, err
		}
	}
	var requiredAttachmentIDs []int32
	if contentUpdated || attachmentsUpdated {
		var finalAttachments []*store.Attachment
		if preparedAttachments != nil {
			finalAttachments = preparedAttachments.normalized
		} else {
			finalAttachments, err = s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
			if err != nil {
				return nil, status.Errorf(codes.Internal, "failed to list attachments")
			}
		}
		requiredAttachmentIDs, err = s.resolveMemoAttachmentReferences(nextMemo.Content, finalAttachments)
		if err != nil {
			return nil, err
		}
	}

	if contentUpdated || attachmentsUpdated || relationsUpdated {
		var relations *[]*store.MemoRelation
		if relationsUpdated {
			relations = &preparedRelations
		}
		if err := s.applyMemoMutation(ctx, memo, preparedAttachments, update, requiredAttachmentIDs, relations); err != nil {
			return nil, err
		}
	} else if err = s.Store.UpdateMemo(ctx, update); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update memo")
	}

	memo, err = s.Store.GetMemo(ctx, &store.FindMemo{
		ID: &memo.ID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get memo")
	}
	memo, parentMemo, memoMessage, err := s.buildUpdatedMemoState(ctx, memo.ID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to build updated memo state")
	}
	isUnpublished := memoIsUnpublished(memo, time.Now().Unix())
	switch {
	case isUnpublished:
		// Never expose draft content through webhooks or public/protected SSE.
		// If a published memo was moved back to drafts, tell existing clients to
		// remove their cached collection entry without including its contents.
		if !wasUnpublished {
			s.SSEHub.Broadcast(&SSEEvent{
				Type:       SSEEventMemoDeleted,
				Name:       memoMessage.Name,
				Visibility: memo.Visibility,
				CreatorID:  memo.CreatorID,
			})
		}
	case wasUnpublished:
		if err := s.DispatchMemoCreatedWebhook(ctx, memoMessage); err != nil {
			slog.Warn("Failed to dispatch published draft webhook", slog.Any("err", err))
		}
		s.SSEHub.Broadcast(&SSEEvent{Type: SSEEventMemoCreated, Name: memoMessage.Name, Visibility: memo.Visibility, CreatorID: memo.CreatorID})
		s.dispatchMemoMentionNotificationsBestEffort(ctx, memo, parentMemo, "")
	default:
		if contentUpdated {
			s.dispatchMemoMentionNotificationsBestEffort(ctx, memo, parentMemo, previousContent)
		}
		s.dispatchMemoUpdatedSideEffects(ctx, memo, parentMemo, memoMessage)
	}

	return memoMessage, nil
}

func (s *APIV1Service) DeleteMemo(ctx context.Context, request *v1pb.DeleteMemoRequest) (*emptypb.Empty, error) {
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{
		UID: &memoUID,
	})
	if err != nil {
		return nil, err
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}

	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	// Only the creator or admin can update the memo.
	if memo.CreatorID != user.ID && !isSuperUser(user) {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
		ContentID: &request.Name,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}

	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
		MemoID: &memo.ID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}

	deleteRelations, _ := s.loadMemoRelations(ctx, memo)
	if memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, deleteRelations); err == nil {
		// Try to dispatch webhook when memo is deleted.
		if err := s.DispatchMemoDeletedWebhook(ctx, memoMessage); err != nil {
			slog.Warn("Failed to dispatch memo deleted webhook", slog.Any("err", err))
		}
	}

	// Delete memo comments first (store.DeleteMemo handles their relations and attachments)
	commentType := store.MemoRelationComment
	relations, err := s.Store.ListMemoRelations(ctx, &store.FindMemoRelation{RelatedMemoID: &memo.ID, Type: &commentType})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list memo comments")
	}
	for _, relation := range relations {
		if err := s.Store.DeleteMemo(ctx, &store.DeleteMemo{ID: relation.MemoID}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to delete memo comment")
		}
	}

	// Delete the memo (store.DeleteMemo handles relation and attachment cleanup)
	if err = s.Store.DeleteMemo(ctx, &store.DeleteMemo{ID: memo.ID}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete memo")
	}

	// Broadcast live refresh event.
	s.SSEHub.Broadcast(&SSEEvent{
		Type:       SSEEventMemoDeleted,
		Name:       request.Name,
		Visibility: memo.Visibility,
		CreatorID:  resolveSSECreatorID(memo, nil),
	})

	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) getContentLengthLimit(ctx context.Context) (int, error) {
	instanceMemoRelatedSetting, err := s.Store.GetInstanceMemoRelatedSetting(ctx)
	if err != nil {
		return 0, status.Errorf(codes.Internal, "failed to get instance memo related setting")
	}
	return int(instanceMemoRelatedSetting.ContentLengthLimit), nil
}

// DispatchMemoCreatedWebhook dispatches webhook when memo is created.
