package v1

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/dailyquestion"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func dailySetting(seed, questions string, disabled bool) *v1pb.UpdateInstanceSettingRequest {
	return &v1pb.UpdateInstanceSettingRequest{Setting: &v1pb.InstanceSetting{Name: "instance/settings/GENERAL", Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{DailyQuestionSeed: seed, DailyQuestionsJson: questions, DisableDailyQuestion: disabled}}}}
}

func TestDailyQuestionPublicSettingsAndAdminUpdates(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "daily-admin", store.RoleAdmin)
	member := createSpaceTestUser(ctx, t, s, "daily-member", store.RoleUser)
	adminCtx := userCtx(ctx, admin.ID)
	initial, err := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
	require.NoError(t, err)
	require.Regexp(t, `^[0-9a-f]{16}$`, initial.GetGeneralSetting().DailyQuestionSeed)
	require.Empty(t, initial.GetGeneralSetting().DailyQuestionsJson)
	require.False(t, initial.GetGeneralSetting().DisableDailyQuestion)
	_, err = s.UpdateInstanceSetting(ctx, dailySetting("user-seed", `["q"]`, false))
	require.Equal(t, codes.Unauthenticated, status.Code(err))
	_, err = s.UpdateInstanceSetting(userCtx(ctx, member.ID), dailySetting("user-seed", `["q"]`, false))
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	updated, err := s.UpdateInstanceSetting(adminCtx, dailySetting("admin_seed-2026", `[" A ","", "A"," B "]`, true))
	require.NoError(t, err)
	require.Equal(t, `["A","B"]`, updated.GetGeneralSetting().DailyQuestionsJson)
	public, err := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
	require.NoError(t, err)
	require.Equal(t, "admin_seed-2026", public.GetGeneralSetting().DailyQuestionSeed)
	require.Equal(t, `["A","B"]`, public.GetGeneralSetting().DailyQuestionsJson)
	require.True(t, public.GetGeneralSetting().DisableDailyQuestion)
	cleared, err := s.UpdateInstanceSetting(adminCtx, dailySetting("", `[" ",""]`, false))
	require.NoError(t, err)
	newSeed := cleared.GetGeneralSetting().DailyQuestionSeed
	require.Regexp(t, `^[0-9a-f]{16}$`, newSeed)
	require.NotEqual(t, initial.GetGeneralSetting().DailyQuestionSeed, newSeed)
	require.Empty(t, cleared.GetGeneralSetting().DailyQuestionsJson)
	require.NoError(t, s.Store.Migrate(ctx))
	stored, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, newSeed, stored.DailyQuestionSeed)
	require.NoError(t, s.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"banned-daily"}}))
	_, err = s.UpdateInstanceSetting(adminCtx, dailySetting("", `["a banned-daily question"]`, false))
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	stored, err = s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, newSeed, stored.DailyQuestionSeed)
}

func TestDailyQuestionAPIRejectsInvalidConfiguration(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "daily-validation-admin", store.RoleAdmin)
	ctx = userCtx(ctx, admin.ID)
	for _, seed := range []string{"bad seed", "bad!", strings.Repeat("x", 65), "种子"} {
		_, err := s.UpdateInstanceSetting(ctx, dailySetting(seed, "", false))
		require.Equal(t, codes.InvalidArgument, status.Code(err))
		require.Contains(t, err.Error(), "daily_question_seed")
	}
	many := make([]string, 2001)
	for i := range many {
		many[i] = fmt.Sprintf("question %d", i)
	}
	tooMany, _ := json.Marshal(many)
	tooLong, _ := json.Marshal([]string{strings.Repeat("问", 201)})
	for _, bank := range []string{`null`, `{}`, `[1]`, `[null]`, `[true]`, string(tooLong), string(tooMany), strings.Repeat(" ", dailyquestion.MaxJSONBytes+1)} {
		_, err := s.UpdateInstanceSetting(ctx, dailySetting("valid-seed", bank, false))
		require.Equal(t, codes.InvalidArgument, status.Code(err))
	}
}

func TestDailyQuestionTranslationsAreModerated(t *testing.T) {
	s := newIntegrationService(t)
	ctx := context.Background()
	admin := createSpaceTestUser(ctx, t, s, "daily-i18n-admin", store.RoleAdmin)
	adminCtx := userCtx(ctx, admin.ID)
	bank := `[{"builtin":2},{"text":"Hello?","locale":"en","translations":{"zh-Hans":"今天好吗？"}}]`
	_, err := s.UpdateInstanceSetting(adminCtx, dailySetting("stable-seed", bank, false))
	require.NoError(t, err)
	public, err := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/GENERAL"})
	require.NoError(t, err)
	require.JSONEq(t, bank, public.GetGeneralSetting().DailyQuestionsJson)
	require.NoError(t, s.replaceContentModerationSetting(ctx, &store.InstanceBlockedWordsSetting{Words: []string{"banned-translation"}}))
	for _, locale := range []string{"en", "ja", "ar", "pt-BR", "en-GB"} {
		bank := fmt.Sprintf(`[{"text":"safe","translations":{%q:"banned-translation"}}]`, locale)
		_, err = s.UpdateInstanceSetting(adminCtx, dailySetting("changed-seed", bank, false))
		require.Equal(t, codes.InvalidArgument, status.Code(err), locale)
	}
	stored, err := s.Store.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "stable-seed", stored.DailyQuestionSeed)
	require.JSONEq(t, bank, stored.DailyQuestionsJson)
}
