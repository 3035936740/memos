package test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestModerationReportsQuarantineBookmarksAndSecuritySetting(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	t.Cleanup(func() { ts.Close() })

	owner, err := createTestingUserWithRole(ctx, ts, "moderation-owner", store.RoleUser)
	require.NoError(t, err)
	reporter, err := createTestingUserWithRole(ctx, ts, "moderation-reporter", store.RoleUser)
	require.NoError(t, err)
	memo, err := ts.CreateMemo(ctx, &store.Memo{
		UID:        "moderation-target",
		CreatorID:  owner.ID,
		Content:    "target article",
		Visibility: store.Public,
	})
	require.NoError(t, err)

	_, err = ts.CreateModerationReport(ctx, &store.ModerationReport{
		CreatorID:  reporter.ID,
		TargetType: store.ModerationTargetArticle,
		TargetID:   memo.ID,
		Reason:     "test report",
	})
	require.NoError(t, err)
	_, err = ts.CreateModerationReport(ctx, &store.ModerationReport{
		CreatorID:  reporter.ID,
		TargetType: store.ModerationTargetArticle,
		TargetID:   memo.ID,
		Reason:     "duplicate",
	})
	require.Error(t, err)

	count, err := ts.CountModerationReports(ctx, store.ModerationTargetArticle, memo.ID)
	require.NoError(t, err)
	require.Equal(t, int32(1), count)
	require.NoError(t, ts.SetModerationReportCount(ctx, store.ModerationTargetArticle, memo.ID, 0))
	count, err = ts.CountModerationReports(ctx, store.ModerationTargetArticle, memo.ID)
	require.NoError(t, err)
	require.Zero(t, count)
	summaries, total, err := ts.ListModerationReportSummaries(ctx, &store.FindModerationReportSummary{Limit: 20})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, summaries, 1)
	require.Zero(t, summaries[0].Count)
	require.Equal(t, "test report", summaries[0].Reason)

	require.NoError(t, ts.UpsertModerationQuarantine(ctx, &store.ModerationQuarantine{
		TargetType:  store.ModerationTargetArticle,
		TargetID:    memo.ID,
		ReportCount: count,
		Reason:      "test report",
	}))
	quarantines, total, err := ts.ListModerationQuarantines(ctx, &store.FindModerationQuarantine{Limit: 20})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, quarantines, 1)
	require.NoError(t, ts.SetModerationReportCount(ctx, store.ModerationTargetArticle, memo.ID, 2))
	quarantines, _, err = ts.ListModerationQuarantines(ctx, &store.FindModerationQuarantine{Limit: 20})
	require.NoError(t, err)
	require.Equal(t, int32(2), quarantines[0].ReportCount)
	require.NoError(t, ts.RestoreModerationTarget(ctx, store.ModerationTargetArticle, memo.ID))
	count, err = ts.CountModerationReports(ctx, store.ModerationTargetArticle, memo.ID)
	require.NoError(t, err)
	require.Zero(t, count)

	require.NoError(t, ts.UpsertMemoBookmark(ctx, reporter.ID, memo.ID))
	require.NoError(t, ts.UpsertMemoBookmark(ctx, reporter.ID, memo.ID))
	saved, err := ts.HasMemoBookmark(ctx, reporter.ID, memo.ID)
	require.NoError(t, err)
	require.True(t, saved)
	bookmarkIDs, total, err := ts.ListMemoBookmarkIDs(ctx, reporter.ID, 20, 0)
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, []int32{memo.ID}, bookmarkIDs)
	require.NoError(t, ts.DeleteMemoBookmark(ctx, reporter.ID, memo.ID))

	require.NoError(t, ts.UpsertModerationUserBan(ctx, &store.ModerationUserBan{
		UserID:      reporter.ID,
		ExpiresTs:   time.Now().Add(-time.Minute).Unix(),
		StrikeCount: 2,
		Source:      "AUTO",
		Active:      true,
	}))
	ban, err := ts.GetModerationUserBan(ctx, reporter.ID)
	require.NoError(t, err)
	require.True(t, ban.Active)
	require.Equal(t, int32(2), ban.StrikeCount)
	expiredIDs, err := ts.ListExpiredModerationUserBanIDs(ctx, time.Now().Unix(), 20)
	require.NoError(t, err)
	require.Equal(t, []int32{reporter.ID}, expiredIDs)
	require.NoError(t, ts.DeactivateModerationUserBan(ctx, reporter.ID))
	ban, err = ts.GetModerationUserBan(ctx, reporter.ID)
	require.NoError(t, err)
	require.False(t, ban.Active)
	require.Equal(t, int32(2), ban.StrikeCount)

	security, err := ts.GetInstanceModerationSecuritySetting(ctx)
	require.NoError(t, err)
	require.Equal(t, store.DefaultInstanceModerationSecuritySetting(), security)
	security.PublishCooldownSeconds = 15
	security.CommentReportThreshold = 3
	require.NoError(t, ts.UpsertInstanceModerationSecuritySetting(ctx, security))
	loaded, err := ts.GetInstanceModerationSecuritySetting(ctx)
	require.NoError(t, err)
	require.Equal(t, security, loaded)
}
