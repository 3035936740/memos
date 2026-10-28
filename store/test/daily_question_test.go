package test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestDailyQuestionFreshInstallAndStableMigration(t *testing.T) {
	ctx := context.Background()
	a, b := NewTestingStore(ctx, t), NewTestingStore(ctx, t)
	first, err := a.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	second, err := b.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Regexp(t, `^[0-9a-f]{16}$`, first.DailyQuestionSeed)
	require.NotEqual(t, first.DailyQuestionSeed, second.DailyQuestionSeed)
	require.Empty(t, first.DailyQuestionsJson)
	require.False(t, first.DisableDailyQuestion)
	require.NoError(t, a.Migrate(ctx))
	again, err := a.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, first.DailyQuestionSeed, again.DailyQuestionSeed)
}

func TestDailyQuestionUpgradeBackfillsWithoutOverwriting(t *testing.T) {
	ctx := context.Background()
	s := NewTestingStore(ctx, t)
	for _, seed := range []string{"", "custom-stable_seed-123"} {
		t.Run(seed, func(t *testing.T) {
			original := map[string]any{"customProfile": map[string]any{"title": "Keep this title"}, "additionalStyle": "body { color: red; }", "futureField": map[string]any{"keep": true}, "dailyQuestionSeed": seed}
			b, err := json.Marshal(original)
			require.NoError(t, err)
			_, err = s.GetDriver().UpsertInstanceSetting(ctx, &store.InstanceSetting{Name: "GENERAL", Value: string(b)})
			require.NoError(t, err)
			_, err = s.GetDriver().GetDB().ExecContext(ctx, `DELETE FROM memos_plus_migration WHERE version='0004__daily_question.sql'`)
			require.NoError(t, err)
			require.NoError(t, s.Migrate(ctx))
			rows, err := s.GetDriver().ListInstanceSettings(ctx, &store.FindInstanceSetting{Name: "GENERAL"})
			require.NoError(t, err)
			require.Len(t, rows, 1)
			var got map[string]any
			require.NoError(t, json.Unmarshal([]byte(rows[0].Value), &got))
			if seed == "" {
				require.Regexp(t, `^[0-9a-f]{16}$`, got["dailyQuestionSeed"])
			} else {
				require.Equal(t, seed, got["dailyQuestionSeed"])
			}
			require.Equal(t, original["customProfile"], got["customProfile"])
			require.Equal(t, original["additionalStyle"], got["additionalStyle"])
			require.Equal(t, original["futureField"], got["futureField"])
		})
	}
}
