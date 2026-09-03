package test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestPollBoundedReads(t *testing.T) {
	ctx := context.Background()
	s := NewTestingStore(ctx, t)
	owner, err := createTestingHostUser(ctx, s)
	require.NoError(t, err)
	memo, err := s.CreateMemo(ctx, &store.Memo{UID: "sample-poll", CreatorID: owner.ID, Content: "poll", Visibility: store.Public})
	require.NoError(t, err)
	var firstUserID int32
	for i := range 1000 {
		user, err := s.CreateUser(ctx, &store.User{Username: fmt.Sprintf("voter-%d", i), Role: store.RoleUser})
		require.NoError(t, err)
		if i == 0 {
			firstUserID = user.ID
		}
		choices := []string{"a"}
		if i%2 == 0 {
			choices = append(choices, "b")
		}
		require.NoError(t, s.ReplacePollVotes(ctx, &store.ReplacePollVotes{MemoID: memo.ID, UserID: user.ID, OptionIDs: choices}))
	}
	require.NoError(t, s.ReplacePollVotes(ctx, &store.ReplacePollVotes{MemoID: memo.ID, DeviceID: "guest-123456789", OptionIDs: []string{"b"}}))
	counts, err := s.CountPollVotes(ctx, memo.ID)
	require.NoError(t, err)
	require.Equal(t, map[string]int32{"a": 1000, "b": 501}, counts)
	own, err := s.ListPollVotesByVoter(ctx, memo.ID, firstUserID, "")
	require.NoError(t, err)
	require.Len(t, own, 2)
	guest, err := s.ListPollVotesByVoter(ctx, memo.ID, 0, "guest-123456789")
	require.NoError(t, err)
	require.Len(t, guest, 1)
	unknown, err := s.ListPollVotesByVoter(ctx, memo.ID, 0, "")
	require.NoError(t, err)
	require.Empty(t, unknown)
	seenAcrossSamples := make(map[int32]bool)
	for range 4 {
		sample, err := s.SamplePollVoters(ctx, memo.ID, 11)
		require.NoError(t, err)
		require.Len(t, sample, 11)
		seen := make(map[int32]bool)
		for _, voter := range sample {
			require.Positive(t, voter.UserID)
			require.False(t, seen[voter.UserID])
			seen[voter.UserID] = true
			seenAcrossSamples[voter.UserID] = true
			require.Contains(t, voter.OptionIDs, "a")
			require.LessOrEqual(t, len(voter.OptionIDs), 2)
		}
	}
	require.Greater(t, len(seenAcrossSamples), 11, "sampling must not return the same fixed first/last users")
	_, err = s.SamplePollVoters(ctx, memo.ID, 1000)
	require.Error(t, err, "the store must reject unbounded samples")
}
