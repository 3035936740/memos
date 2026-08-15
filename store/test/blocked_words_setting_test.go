package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestInstanceBlockedWordsSettingReplacement(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { ts.Close() })

	require.NoError(t, ts.ReplaceInstanceBlockedWordsSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"old", "shared"}}))
	require.NoError(t, ts.ReplaceInstanceBlockedWordsSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"new"}}))

	setting, err := ts.GetInstanceBlockedWordsSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, []string{"new"}, setting.Words)

	require.NoError(t, ts.ClearInstanceBlockedWordsSetting(ctx))
	setting, err = ts.GetInstanceBlockedWordsSetting(ctx)
	require.NoError(t, err)
	require.Empty(t, setting.Words)
}
