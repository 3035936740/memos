package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/store"
)

func TestNormalizeBlockedWords(t *testing.T) {
	words, err := normalizeBlockedWords("\ufeffBad Word\n违规词,重复；重复\tAnother")
	require.NoError(t, err)
	require.Equal(t, []string{"bad word", "违规词", "重复", "another"}, words)

	_, err = normalizeBlockedWords(" \n\t ")
	require.Error(t, err)
}

func TestBlockedWordMatcher(t *testing.T) {
	matcher := newBlockedWordMatcher([]string{"bad word", "违规词"})
	require.True(t, matcher.matches("This contains a BAD WORD."))
	require.True(t, matcher.matches("违\u200b规词"))
	require.False(t, matcher.matches("普通且合规的内容"))
}

func TestContentModerationReplacementAndClear(t *testing.T) {
	service := newIntegrationService(t)
	ctx := context.Background()

	require.NoError(t, service.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"old"}}))
	require.Equal(t, codes.InvalidArgument, status.Code(service.validateMemoContentAgainstBlockedWords(ctx, "contains old")))

	// A second import replaces the single stored row; it does not merge old words.
	require.NoError(t, service.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"new"}}))
	require.NoError(t, service.validateMemoContentAgainstBlockedWords(ctx, "contains old"))
	require.Equal(t, codes.InvalidArgument, status.Code(service.validateMemoContentAgainstBlockedWords(ctx, "contains new")))

	require.NoError(t, service.clearContentModerationSetting(ctx))
	require.NoError(t, service.validateMemoContentAgainstBlockedWords(ctx, "contains new"))
}
