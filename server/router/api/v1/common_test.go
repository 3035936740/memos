package v1

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestAnonymousMemoCollectionVisibility(t *testing.T) {
	t.Parallel()

	require.False(t, isSuperUser(nil))
	require.True(t, memoVisibleInCollection(&store.Memo{Payload: &storepb.MemoPayload{}}, nil))
	require.False(t, memoVisibleInCollection(&store.Memo{Payload: &storepb.MemoPayload{Hidden: true}}, nil))
}

func TestDraftScheduleAndQuarantineCollectionVisibility(t *testing.T) {
	t.Parallel()

	now := time.Now().Unix()
	owner := &store.User{ID: 7, Role: store.RoleUser}
	other := &store.User{ID: 8, Role: store.RoleUser}
	admin := &store.User{ID: 9, Role: store.RoleAdmin}

	draft := &store.Memo{CreatorID: owner.ID, Payload: &storepb.MemoPayload{Draft: true}}
	require.False(t, memoVisibleInCollection(draft, nil))
	require.True(t, memoVisibleInCollection(draft, owner))
	require.False(t, memoVisibleInCollection(draft, other))
	require.True(t, memoVisibleInCollection(draft, admin))
	require.True(t, memoIsUnpublished(draft, now))

	scheduled := &store.Memo{CreatorID: owner.ID, Payload: &storepb.MemoPayload{Draft: true, PublishTs: now + 60}}
	require.False(t, memoVisibleInCollection(scheduled, nil))
	require.True(t, memoIsUnpublished(scheduled, now))
	scheduled.Payload.PublishTs = now - 1
	require.True(t, memoVisibleInCollection(scheduled, nil))
	require.False(t, memoIsUnpublished(scheduled, now))

	quarantined := &store.Memo{CreatorID: owner.ID, Payload: &storepb.MemoPayload{Quarantined: true}}
	require.False(t, memoVisibleInCollection(quarantined, nil))
	require.False(t, memoVisibleInCollection(quarantined, owner))
	require.True(t, memoVisibleInCollection(quarantined, admin))
}

func TestNormalizePageSize(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		pageSize int32
		want     int
	}{
		{
			name:     "default for zero",
			pageSize: 0,
			want:     DefaultPageSize,
		},
		{
			name:     "default for negative",
			pageSize: -1,
			want:     DefaultPageSize,
		},
		{
			name:     "preserves valid size",
			pageSize: 42,
			want:     42,
		},
		{
			name:     "clamps oversized size",
			pageSize: int32(MaxPageSize + 1),
			want:     MaxPageSize,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			require.Equal(t, tt.want, normalizePageSize(tt.pageSize))
		})
	}
}
