package v1

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestPollSampledChoicesVisibility(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "sample-owner", store.RoleUser)
	ownerCtx := userCtx(ctx, owner.ID)
	memo, err := s.CreateMemo(ownerCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{
		Content: "Sample", Visibility: v1pb.Visibility_PUBLIC,
		Poll: &v1pb.Poll{Question: "Choose", VoterType: v1pb.VoterType_AUTHENTICATED,
			ShowVotersBeforeVoting: true, Options: []*v1pb.PollOption{{Id: "a", Text: "A"}, {Id: "b", Text: "B"}}},
	}})
	require.NoError(t, err)
	uid, err := ExtractMemoUIDFromName(memo.Name)
	require.NoError(t, err)
	stored, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	require.NoError(t, err)
	for i := range 12 {
		user := createSpaceTestUser(ctx, t, s, fmt.Sprintf("sample-voter-%d", i), store.RoleUser)
		require.NoError(t, s.Store.ReplacePollVotes(ctx, &store.ReplacePollVotes{MemoID: stored.ID, UserID: user.ID, OptionIDs: []string{"b"}}))
	}
	for _, showChoices := range []bool{false, true, false} {
		settings := proto.Clone(memo.Poll).(*v1pb.Poll)
		settings.ShowVoterChoices = showChoices
		_, err = s.UpdateMemo(ownerCtx, &v1pb.UpdateMemoRequest{Memo: &v1pb.Memo{Name: memo.Name, Poll: settings}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"poll"}}})
		require.NoError(t, err)
		poll, err := s.GetMemoPoll(ownerCtx, &v1pb.GetMemoPollRequest{Name: memo.Name})
		require.NoError(t, err)
		require.Len(t, poll.Voters, 10)
		require.True(t, poll.HasMoreVoters)
		require.EqualValues(t, 12, poll.TotalVotes, "visibility changes preserve all ballots")
		for _, voter := range poll.Voters {
			if showChoices {
				require.Equal(t, []string{"b"}, voter.SelectedOptionIds)
			} else {
				require.Empty(t, voter.SelectedOptionIds)
			}
		}
	}
	settings := proto.Clone(memo.Poll).(*v1pb.Poll)
	settings.ShowVoterChoices = true
	settings.ShowVotersBeforeVoting = false
	_, err = s.UpdateMemo(ownerCtx, &v1pb.UpdateMemoRequest{Memo: &v1pb.Memo{Name: memo.Name, Poll: settings}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"poll"}}})
	require.NoError(t, err)
	poll, err := s.GetMemoPoll(ownerCtx, &v1pb.GetMemoPollRequest{Name: memo.Name})
	require.NoError(t, err)
	require.Empty(t, poll.Voters, "hidden participants must not leak their selected choices")
	require.False(t, poll.HasMoreVoters)
	require.EqualValues(t, 12, poll.TotalVotes)
}

func TestPollVisibilityChangesPreserveVotes(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "poll-owner", store.RoleUser)
	voter := createSpaceTestUser(ctx, t, s, "poll-voter", store.RoleUser)
	ownerCtx, voterCtx := userCtx(ctx, owner.ID), userCtx(ctx, voter.ID)
	memo, err := s.CreateMemo(ownerCtx, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{
		Content: "Poll", Visibility: v1pb.Visibility_PUBLIC,
		Poll: &v1pb.Poll{Question: "Choose", VoterType: v1pb.VoterType_AUTHENTICATED, AllowMultiple: true, MaxSelections: 2,
			Options: []*v1pb.PollOption{{Id: "a", Text: "A"}, {Id: "b", Text: "B"}}},
	}})
	require.NoError(t, err)
	result, err := s.VoteMemo(voterCtx, &v1pb.VoteMemoRequest{Name: memo.Name, OptionIds: []string{"a", "b"}})
	require.NoError(t, err)
	require.EqualValues(t, 2, result.TotalVotes)
	require.False(t, result.ResultsHidden)
	require.Empty(t, result.Voters)

	// Every before/after combination works independently without deleting ballots.
	for _, before := range []bool{false, true} {
		for _, after := range []bool{true, false} {
			settings := proto.Clone(memo.Poll).(*v1pb.Poll)
			settings.HideResultsUntilVoted = true
			settings.ShowVotersBeforeVoting = before
			settings.ShowVotersAfterVoting = after
			_, err = s.UpdateMemo(ownerCtx, &v1pb.UpdateMemoRequest{
				Memo: &v1pb.Memo{Name: memo.Name, Poll: settings}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"poll"}},
			})
			require.NoError(t, err)
			for _, viewer := range []struct {
				ctx     context.Context
				voted   bool
				visible bool
			}{
				{ownerCtx, false, before}, {voterCtx, true, after},
			} {
				poll, err := s.GetMemoPoll(viewer.ctx, &v1pb.GetMemoPollRequest{Name: memo.Name})
				require.NoError(t, err)
				require.Equal(t, !viewer.voted, poll.ResultsHidden)
				require.Equal(t, viewer.visible, poll.VotersVisible)
				if viewer.voted {
					require.EqualValues(t, 2, poll.TotalVotes)
					require.EqualValues(t, 1, poll.Options[0].VoteCount)
					require.ElementsMatch(t, []string{"a", "b"}, poll.SelectedOptionIds)
				} else {
					require.Zero(t, poll.TotalVotes)
					for _, option := range poll.Options {
						require.Zero(t, option.VoteCount)
					}
				}
				if viewer.visible {
					require.Len(t, poll.Voters, 1, "multi-choice ballots must not duplicate participants")
					require.Equal(t, voter.Username, poll.Voters[0].Username)
				} else {
					require.Empty(t, poll.Voters)
				}
			}
			uid, err := ExtractMemoUIDFromName(memo.Name)
			require.NoError(t, err)
			stored, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
			require.NoError(t, err)
			votes, err := s.Store.ListPollVotes(ctx, stored.ID)
			require.NoError(t, err)
			require.Len(t, votes, 2, "hiding participant data must not delete ballots")
			// Ordinary memo API uses the same visibility rules.
			loaded, err := s.GetMemo(ownerCtx, &v1pb.GetMemoRequest{Name: memo.Name})
			require.NoError(t, err)
			require.True(t, loaded.Poll.ResultsHidden)
			require.Zero(t, loaded.Poll.TotalVotes)
			require.Equal(t, before, loaded.Poll.VotersVisible)
		}
	}
}

func TestPollGuestResultsRecoveryAndReadAccess(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	_, err := s.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key:   storepb.InstanceSettingKey_ACCESS,
		Value: &storepb.InstanceSetting_AccessSetting{AccessSetting: &storepb.InstanceAccessSetting{AccessMode: storepb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PUBLIC}},
	})
	require.NoError(t, err)
	owner := createSpaceTestUser(ctx, t, s, "guest-poll-owner", store.RoleUser)
	memo, err := s.CreateMemo(userCtx(ctx, owner.ID), &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{
		Content: "Guest poll", Visibility: v1pb.Visibility_PUBLIC,
		Poll: &v1pb.Poll{Question: "Choose", VoterType: v1pb.VoterType_ANYONE, HideResultsUntilVoted: true,
			ShowVotersBeforeVoting: true, ShowVotersAfterVoting: true,
			Options: []*v1pb.PollOption{{Id: "a", Text: "A"}, {Id: "b", Text: "B"}}},
	}})
	require.NoError(t, err)
	device := "guest-device-123456789"
	_, err = s.VoteMemo(ctx, &v1pb.VoteMemoRequest{Name: memo.Name, OptionIds: []string{"a"}, DeviceId: device})
	require.NoError(t, err)
	for _, identity := range []string{"", "another-device-123456", device} {
		poll, err := s.GetMemoPoll(ctx, &v1pb.GetMemoPollRequest{Name: memo.Name, DeviceId: identity})
		require.NoError(t, err)
		require.Equal(t, identity != device, poll.ResultsHidden)
		require.False(t, poll.VotersVisible)
		require.Empty(t, poll.Voters)
		if identity == device {
			require.EqualValues(t, 1, poll.TotalVotes)
		} else {
			require.Zero(t, poll.TotalVotes)
		}
	}
	_, err = s.UpdateMemo(userCtx(ctx, owner.ID), &v1pb.UpdateMemoRequest{
		Memo: &v1pb.Memo{Name: memo.Name, Visibility: v1pb.Visibility_PRIVATE}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"visibility"}},
	})
	require.NoError(t, err)
	_, err = s.GetMemoPoll(ctx, &v1pb.GetMemoPollRequest{Name: memo.Name, DeviceId: device})
	require.Error(t, err, "a voting device must not bypass memo read access")
}
