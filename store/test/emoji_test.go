package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestEmojiStore(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()

	group, err := ts.CreateEmojiGroup(ctx, &store.EmojiGroup{Name: "金馆长"})
	require.NoError(t, err)
	require.NotZero(t, group.ID)

	emoji, err := ts.CreateEmoji(ctx, &store.Emoji{
		GroupID:     group.ID,
		Name:        "哭脸",
		Filename:    "金馆长_哭脸.png",
		Type:        "image/png",
		Size:        4,
		StorageType: "DATABASE",
		Blob:        []byte("test"),
	})
	require.NoError(t, err)
	require.NotZero(t, emoji.ID)

	loaded, err := ts.GetEmoji(ctx, &store.FindEmoji{ID: &emoji.ID, GetBlob: true})
	require.NoError(t, err)
	require.Equal(t, []byte("test"), loaded.Blob)

	require.NoError(t, ts.DeleteEmojiGroup(ctx, group.ID))
	remaining, err := ts.ListEmojis(ctx, &store.FindEmoji{GroupID: &group.ID})
	require.NoError(t, err)
	require.Empty(t, remaining)
}
