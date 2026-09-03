package v1

import (
	"context"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/errors"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func validatePoll(input *v1pb.Poll) error {
	if input == nil {
		return nil
	}
	if input.Question == "" {
		return errors.New("poll question is required")
	}
	if len(input.Options) < 2 {
		return errors.New("poll requires at least two options")
	}
	seen := make(map[string]struct{}, len(input.Options))
	for _, option := range input.Options {
		if option == nil || option.Text == "" {
			return errors.New("poll option text is required")
		}
		if option.Id != "" {
			if _, ok := seen[option.Id]; ok {
				return errors.New("poll option IDs must be unique")
			}
			seen[option.Id] = struct{}{}
		}
	}
	maxSelections := input.MaxSelections
	if !input.AllowMultiple {
		if maxSelections != 0 && maxSelections != 1 {
			return errors.New("single-choice polls must use one selection")
		}
	} else if maxSelections < 2 || int(maxSelections) > len(input.Options) {
		return errors.Errorf("poll maximum selections must be between 2 and %d", len(input.Options))
	}
	if input.StartTime != nil && !input.StartTime.IsValid() {
		return errors.New("poll start time is invalid")
	}
	if input.EndTime != nil && !input.EndTime.IsValid() {
		return errors.New("poll end time is invalid")
	}
	if input.StartTime != nil && input.EndTime != nil && !input.EndTime.AsTime().After(input.StartTime.AsTime()) {
		return errors.New("poll end time must be after start time")
	}
	if input.VoterType != v1pb.VoterType_AUTHENTICATED && input.VoterType != v1pb.VoterType_ANYONE && input.VoterType != v1pb.VoterType_VOTER_TYPE_UNSPECIFIED {
		return errors.New("invalid poll voter type")
	}
	return nil
}

func pollToStore(input *v1pb.Poll) *storepb.MemoPayload_Poll {
	if input == nil {
		return nil
	}
	poll := &storepb.MemoPayload_Poll{
		Question:               input.Question,
		AllowMultiple:          input.AllowMultiple,
		MaxSelections:          input.MaxSelections,
		VoterType:              pollVoterTypeToStore(input.VoterType),
		Options:                make([]*storepb.MemoPayload_PollOption, 0, len(input.Options)),
		HideResultsUntilVoted:  input.HideResultsUntilVoted,
		ShowVotersBeforeVoting: input.ShowVotersBeforeVoting && input.VoterType != v1pb.VoterType_ANYONE,
		ShowVotersAfterVoting:  input.ShowVotersAfterVoting && input.VoterType != v1pb.VoterType_ANYONE,
		ShowVoterChoices:       input.ShowVoterChoices && input.VoterType != v1pb.VoterType_ANYONE,
	}
	if !poll.AllowMultiple {
		poll.MaxSelections = 1
	}
	if input.Image != nil {
		poll.ImageName = input.Image.Name
	}
	if input.StartTime != nil {
		poll.StartTs = input.StartTime.AsTime().Unix()
	}
	if input.EndTime != nil {
		poll.EndTs = input.EndTime.AsTime().Unix()
	}
	for _, option := range input.Options {
		id := option.Id
		if id == "" {
			id = uuid.NewString()
		}
		poll.Options = append(poll.Options, &storepb.MemoPayload_PollOption{Id: id, Text: option.Text, ImageName: attachmentName(option.Image)})
	}
	return poll
}

func pollVoterTypeToStore(value v1pb.VoterType) string {
	if value == v1pb.VoterType_ANYONE {
		return "ANYONE"
	}
	return "AUTHENTICATED"
}

func pollVoterTypeFromStore(value string) v1pb.VoterType {
	if value == "ANYONE" {
		return v1pb.VoterType_ANYONE
	}
	return v1pb.VoterType_AUTHENTICATED
}

func attachmentName(attachment *v1pb.Attachment) string {
	if attachment == nil {
		return ""
	}
	return attachment.Name
}

func (s *APIV1Service) convertPoll(ctx context.Context, memo *store.Memo, attachments []*store.Attachment, viewer *store.User, deviceID string) (*v1pb.Poll, error) {
	if memo == nil || memo.Payload == nil || memo.Payload.Poll == nil {
		return nil, nil
	}
	stored := memo.Payload.Poll
	attachmentMap := make(map[string]*v1pb.Attachment, len(attachments))
	for _, attachment := range attachments {
		attachmentMap[attachmentNameFromStore(attachment)] = convertAttachmentFromStore(attachment)
	}
	poll := &v1pb.Poll{
		Question:               stored.Question,
		AllowMultiple:          stored.AllowMultiple,
		MaxSelections:          stored.MaxSelections,
		VoterType:              pollVoterTypeFromStore(stored.VoterType),
		Options:                make([]*v1pb.PollOption, 0, len(stored.Options)),
		HideResultsUntilVoted:  stored.HideResultsUntilVoted,
		ShowVotersBeforeVoting: stored.ShowVotersBeforeVoting,
		ShowVotersAfterVoting:  stored.ShowVotersAfterVoting,
		ShowVoterChoices:       stored.ShowVoterChoices,
	}
	if poll.MaxSelections == 0 {
		if poll.AllowMultiple {
			poll.MaxSelections = int32(len(stored.Options))
		} else {
			poll.MaxSelections = 1
		}
	}
	if stored.ImageName != "" {
		poll.Image = attachmentMap[stored.ImageName]
	}
	if stored.StartTs > 0 {
		poll.StartTime = timestamppb.New(time.Unix(stored.StartTs, 0))
	}
	if stored.EndTs > 0 {
		poll.EndTime = timestamppb.New(time.Unix(stored.EndTs, 0))
	}
	userID := int32(0)
	if viewer != nil {
		userID, deviceID = viewer.ID, ""
	}
	votes, err := s.Store.ListPollVotesByVoter(ctx, memo.ID, userID, deviceID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list poll votes")
	}
	selected := make([]string, 0)
	for _, vote := range votes {
		selected = append(selected, vote.OptionID)
	}
	poll.SelectedOptionIds = selected
	hasVoted := len(selected) > 0
	poll.ResultsHidden = stored.HideResultsUntilVoted && !hasVoted
	counts := make(map[string]int32)
	if !poll.ResultsHidden {
		counts, err = s.Store.CountPollVotes(ctx, memo.ID)
		if err != nil {
			return nil, errors.Wrap(err, "failed to count poll votes")
		}
		for _, count := range counts {
			poll.TotalVotes += count
		}
	}
	poll.VotersVisible = stored.VoterType != "ANYONE" && ((!hasVoted && stored.ShowVotersBeforeVoting) || (hasVoted && stored.ShowVotersAfterVoting))
	if poll.VotersVisible {
		participants, err := s.Store.SamplePollVoters(ctx, memo.ID, 11)
		if err != nil {
			return nil, errors.Wrap(err, "failed to sample poll participants")
		}
		// The eleventh participant detects overflow. Shuffle this small sample before
		// truncation so database row ordering cannot bias which ten users are shown.
		rand.Shuffle(len(participants), func(i, j int) { participants[i], participants[j] = participants[j], participants[i] })
		poll.HasMoreVoters = len(participants) > 10
		if poll.HasMoreVoters {
			participants = participants[:10]
		}
		ids := make([]int32, 0, len(participants))
		for _, participant := range participants {
			ids = append(ids, participant.UserID)
		}
		if len(ids) > 0 {
			users, err := s.Store.ListUsers(ctx, &store.FindUser{IDList: ids})
			if err != nil {
				return nil, errors.Wrap(err, "failed to list poll participants")
			}
			byID := make(map[int32]*store.User, len(users))
			for _, user := range users {
				byID[user.ID] = user
			}
			for _, participant := range participants {
				user := byID[participant.UserID]
				if user == nil {
					continue
				}
				voter := &v1pb.PollVoter{
					Name: BuildUserName(user.Username), Username: user.Username, DisplayName: user.Nickname, AvatarUrl: user.AvatarURL,
				}
				if stored.ShowVoterChoices {
					voter.SelectedOptionIds = participant.OptionIDs
				}
				poll.Voters = append(poll.Voters, voter)
			}
		}
	}
	for _, option := range stored.Options {
		pollOption := &v1pb.PollOption{Id: option.Id, Text: option.Text}
		if !poll.ResultsHidden {
			pollOption.VoteCount = counts[option.Id]
		}
		if option.ImageName != "" {
			pollOption.Image = attachmentMap[option.ImageName]
		}
		poll.Options = append(poll.Options, pollOption)
	}
	return poll, nil
}

// pollVotingRulesChanged ignores visibility-only edits so they preserve existing ballots.
func pollVotingRulesChanged(previous, next *storepb.MemoPayload_Poll) bool {
	if previous == nil || next == nil {
		return previous != next
	}
	before := proto.Clone(previous).(*storepb.MemoPayload_Poll)
	after := proto.Clone(next).(*storepb.MemoPayload_Poll)
	for _, poll := range []*storepb.MemoPayload_Poll{before, after} {
		poll.HideResultsUntilVoted = false
		poll.ShowVotersBeforeVoting = false
		poll.ShowVotersAfterVoting = false
		poll.ShowVoterChoices = false
	}
	return !proto.Equal(before, after)
}

func attachmentNameFromStore(attachment *store.Attachment) string {
	if attachment == nil {
		return ""
	}
	return AttachmentNamePrefix + attachment.UID
}
