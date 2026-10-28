package v1

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/ai"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestAIProviderOptionsSecretLifecycle(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	admin := createSpaceTestUser(ctx, t, s, "ai-options-admin", store.RoleAdmin)
	adminCtx := userCtx(ctx, admin.ID)
	member := createSpaceTestUser(ctx, t, s, "ai-options-member", store.RoleUser)
	provider := &v1pb.InstanceSetting_AIProviderConfig{
		Id: "writer", Title: "Writer", Type: v1pb.InstanceSetting_OPENAI_COMPATIBLE, Endpoint: "https://example.com/v1",
		DefaultModel: "custom-model", ReasoningEffort: "high", ReplaceCustomHeaders: true,
		CustomHeaders: map[string]string{"Authorization": "Bearer secret", "User-Agent": "memos-custom"},
	}
	setting := &v1pb.InstanceSetting{Name: "instance/settings/AI", Value: &v1pb.InstanceSetting_AiSetting{
		AiSetting: &v1pb.InstanceSetting_AISetting{Providers: []*v1pb.InstanceSetting_AIProviderConfig{provider}},
	}}
	updated, err := s.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
	require.NoError(t, err)
	for _, reader := range []context.Context{userCtx(ctx, member.ID), adminCtx} {
		visible, err := s.GetInstanceSetting(reader, &v1pb.GetInstanceSettingRequest{Name: setting.Name})
		require.NoError(t, err)
		p := visible.GetAiSetting().Providers[0]
		require.Empty(t, p.CustomHeaders)
		require.Equal(t, []string{"Authorization", "User-Agent"}, p.CustomHeaderNames)
		require.Equal(t, "custom-model", p.DefaultModel)
	}
	// Saving a redacted response must retain server-side header values.
	_, err = s.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: updated})
	require.NoError(t, err)
	stored, err := s.Store.GetInstanceAISetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "Bearer secret", stored.Providers[0].CustomHeaders["Authorization"])
	provider.CustomHeaders = map[string]string{"authorization": ""}
	_, err = s.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
	require.NoError(t, err)
	stored, err = s.Store.GetInstanceAISetting(ctx)
	require.NoError(t, err)
	require.Equal(t, map[string]string{"Authorization": "Bearer secret"}, stored.Providers[0].CustomHeaders)
	provider.CustomHeaders = map[string]string{}
	_, err = s.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
	require.NoError(t, err)
	stored, err = s.Store.GetInstanceAISetting(ctx)
	require.NoError(t, err)
	require.Empty(t, stored.Providers[0].CustomHeaders)
	for _, headers := range []map[string]string{{"User-Agent": "value\r\nInjected: true"}, {"Host": "elsewhere"}, {"X-Test": "a", "x-test": "b"}} {
		provider.CustomHeaders = headers
		_, err = s.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
		require.Equal(t, codes.InvalidArgument, status.Code(err))
	}
}

func TestAIPlanningWorkflow(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	user := createSpaceTestUser(ctx, t, s, "workflow-user", store.RoleUser)
	var mu sync.Mutex
	var models []string
	providerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Model           string `json:"model"`
			ReasoningEffort string `json:"reasoning_effort"`
			Messages        []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		mu.Lock()
		models = append(models, payload.Model)
		mu.Unlock()
		require.Equal(t, "memos-custom", r.Header.Get("User-Agent"))
		text := "Final article"
		if payload.Model == "planner-model" {
			text = "Step one: introduce the subject"
		} else {
			require.Contains(t, payload.Messages[1].Content, "Step one")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": text}}}})
	}))
	defer providerServer.Close()
	_, err := s.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_AI, Value: &storepb.InstanceSetting_AiSetting{AiSetting: &storepb.InstanceAISetting{
		Providers: []*storepb.AIProviderConfig{
			{Id: "planner", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, WritingEnabled: true, Endpoint: providerServer.URL, DefaultModel: "planner-model", CustomHeaders: map[string]string{"User-Agent": "memos-custom"}},
			{Id: "writer", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, WritingEnabled: true, Endpoint: providerServer.URL, DefaultModel: "writer-model", CustomHeaders: map[string]string{"User-Agent": "memos-custom"}},
		}, TextGeneration: &storepb.TextGenerationConfig{Enabled: true, PlanningProviderId: "planner", GenerationProviderId: "writer"},
	}}})
	require.NoError(t, err)
	response, err := s.GenerateText(userCtx(ctx, user.ID), &v1pb.GenerateTextRequest{Prompt: "Write an article", PlanFirst: true})
	require.NoError(t, err)
	require.Equal(t, "Final article", response.Text)
	mu.Lock()
	require.Equal(t, []string{"planner-model", "writer-model"}, models)
	mu.Unlock()
}

func TestAzureAIRequestOptions(t *testing.T) {
	for _, version := range []string{"", "2025-04-01-preview"} {
		t.Run(version, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if version == "" {
					require.Equal(t, "/openai/v1/chat/completions", r.URL.Path)
				} else {
					require.Equal(t, "/openai/deployments/deployment/chat/completions", r.URL.Path)
				}
				require.Equal(t, version, r.URL.Query().Get("api-version"))
				require.Equal(t, "azure-secret", r.Header.Get("api-key"))
				require.Empty(t, r.Header.Get("Authorization"))
				var payload map[string]any
				require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
				require.Equal(t, "high", payload["reasoning_effort"])
				require.Equal(t, "deployment", payload["model"])
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Azure answer"}}]}`))
			}))
			defer server.Close()
			text, err := generateAIText(context.Background(), ai.ProviderConfig{Type: ai.ProviderAzureOpenAI, Endpoint: server.URL, APIKey: "azure-secret", AzureAPIVersion: version, ReasoningEffort: "high"}, "deployment", "Write", "")
			require.NoError(t, err)
			require.Equal(t, "Azure answer", text)
		})
	}
}

func TestAIPlannerFailureDoesNotGenerate(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	user := createSpaceTestUser(ctx, t, s, "planning-failure-user", store.RoleUser)
	var mu sync.Mutex
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()
		http.Error(w, "planner unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	_, err := s.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_AI, Value: &storepb.InstanceSetting_AiSetting{AiSetting: &storepb.InstanceAISetting{
		Providers:      []*storepb.AIProviderConfig{{Id: "both", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, WritingEnabled: true, Endpoint: server.URL}},
		TextGeneration: &storepb.TextGenerationConfig{Enabled: true, PlanningProviderId: "both", GenerationProviderId: "both"},
	}}})
	require.NoError(t, err)
	_, err = s.GenerateText(userCtx(ctx, user.ID), &v1pb.GenerateTextRequest{PlanFirst: true, Prompt: "Write"})
	require.Equal(t, codes.Internal, status.Code(err))
	require.Contains(t, err.Error(), "planning failed")
	mu.Lock()
	require.Equal(t, 1, calls)
	mu.Unlock()
}

func TestAIWorkflowConfigurationValidation(t *testing.T) {
	setting := &storepb.InstanceAISetting{
		Providers:      []*storepb.AIProviderConfig{{Id: "writer", WritingEnabled: true}},
		TextGeneration: &storepb.TextGenerationConfig{Enabled: true, PlanningProviderId: "missing", GenerationProviderId: "writer"},
	}
	require.Error(t, prepareTextGenerationConfig(setting, nil))
	setting.TextGeneration.PlanningProviderId = "writer"
	require.NoError(t, prepareTextGenerationConfig(setting, nil))
	updated := &storepb.InstanceAISetting{Providers: setting.Providers}
	require.NoError(t, prepareTextGenerationConfig(updated, setting))
	require.True(t, updated.TextGeneration.Enabled)
	require.NotSame(t, setting.TextGeneration, updated.TextGeneration)
	setting.TextGeneration.Enabled = false
	setting.TextGeneration.PlanningProviderId = "missing"
	require.NoError(t, prepareTextGenerationConfig(setting, nil))
}
