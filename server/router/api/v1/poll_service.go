package v1

import (
	"context"
	"strings"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

// GetMemoPoll returns the poll data visible to the current voter.
func (s *APIV1Service) GetMemoPoll(ctx context.Context, request *v1pb.GetMemoPollRequest) (*v1pb.Poll, error) {
	if request == nil {
		return nil, status.Errorf(codes.InvalidArgument, "poll request is required")
	}
	uid, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo: %v", err)
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}
	if err := s.checkMemoReadAccess(ctx, memo); err != nil {
		return nil, err
	}
	if memo.Payload == nil || memo.Payload.Poll == nil {
		return nil, status.Errorf(codes.NotFound, "poll not found")
	}
	viewer, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	deviceID := ""
	if viewer == nil && memo.Payload.Poll.VoterType == "ANYONE" {
		deviceID = strings.TrimSpace(request.DeviceId)
	}
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list poll attachments: %v", err)
	}
	result, err := s.convertPoll(ctx, memo, attachments, viewer, deviceID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to build poll: %v", err)
	}
	return result, nil
}

func (s *APIV1Service) VoteMemo(ctx context.Context, request *v1pb.VoteMemoRequest) (*v1pb.Poll, error) {
	if request == nil {
		return nil, status.Error(codes.InvalidArgument, "vote request is required")
	}
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo: %v", err)
	}
	if memo == nil {
		return nil, status.Error(codes.NotFound, "memo not found")
	}
	if err := s.checkMemoReadAccess(ctx, memo); err != nil {
		return nil, err
	}
	if memo.Payload == nil || memo.Payload.Poll == nil {
		return nil, status.Error(codes.NotFound, "poll not found")
	}
	poll := memo.Payload.Poll
	viewer, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get current user")
	}
	if poll.VoterType != "ANYONE" && viewer == nil {
		return nil, status.Error(codes.Unauthenticated, "user not authenticated")
	}
	deviceID := ""
	userID := int32(0)
	if viewer != nil {
		userID = viewer.ID
	} else {
		deviceID = strings.TrimSpace(request.DeviceId)
		if len(deviceID) < 16 || len(deviceID) > 128 {
			return nil, status.Error(codes.InvalidArgument, "a valid device ID is required for guest voting")
		}
	}
	now := time.Now()
	if poll.StartTs > 0 && now.Unix() < poll.StartTs {
		return nil, status.Error(codes.FailedPrecondition, "poll has not started")
	}
	if poll.EndTs > 0 && now.Unix() >= poll.EndTs {
		return nil, status.Error(codes.FailedPrecondition, "poll has ended")
	}
	if len(request.OptionIds) == 0 {
		return nil, status.Error(codes.InvalidArgument, "at least one poll option is required")
	}
	seen := make(map[string]struct{}, len(request.OptionIds))
	validOptions := make(map[string]struct{}, len(poll.Options))
	for _, option := range poll.Options {
		validOptions[option.Id] = struct{}{}
	}
	for _, optionID := range request.OptionIds {
		if _, ok := validOptions[optionID]; !ok {
			return nil, status.Error(codes.InvalidArgument, "poll option does not exist")
		}
		if _, ok := seen[optionID]; ok {
			return nil, status.Error(codes.InvalidArgument, "poll options must be unique")
		}
		seen[optionID] = struct{}{}
	}
	maxSelections := int(poll.MaxSelections)
	if maxSelections == 0 {
		maxSelections = 1
		if poll.AllowMultiple {
			maxSelections = len(poll.Options)
		}
	}
	if !poll.AllowMultiple && len(request.OptionIds) != 1 {
		return nil, status.Error(codes.InvalidArgument, "single-choice polls accept one option")
	}
	if len(request.OptionIds) > maxSelections {
		return nil, status.Errorf(codes.InvalidArgument, "you can select at most %d options", maxSelections)
	}
	votes, err := s.Store.ListPollVotesByVoter(ctx, memo.ID, userID, deviceID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to check existing poll vote: %v", err)
	}
	for _, vote := range votes {
		if (viewer != nil && vote.UserID == userID) || (viewer == nil && vote.DeviceID == deviceID) {
			return nil, status.Error(codes.FailedPrecondition, "you have already voted in this poll")
		}
	}
	if err := s.Store.ReplacePollVotes(ctx, &store.ReplacePollVotes{
		MemoID:    memo.ID,
		UserID:    userID,
		DeviceID:  deviceID,
		OptionIDs: request.OptionIds,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save poll vote: %v", err)
	}
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list poll attachments")
	}
	result, err := s.convertPoll(ctx, memo, attachments, viewer, deviceID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to build poll result")
	}
	s.SSEHub.publishMemoChanged()
	return result, nil
}
