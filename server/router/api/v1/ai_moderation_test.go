package v1

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/ai"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func saveReviewTestProviders(t *testing.T, s *APIV1Service, providers ...*storepb.AIProviderConfig) {
	t.Helper()
	_, err := s.Store.UpsertInstanceSetting(context.Background(), &storepb.InstanceSetting{Key: storepb.InstanceSettingKey_AI, Value: &storepb.InstanceSetting_AiSetting{AiSetting: &storepb.InstanceAISetting{Providers: providers}}})
	require.NoError(t, err)
}

func setReviewPolicy(t *testing.T, s *APIV1Service, review *store.AIReviewSetting) {
	t.Helper()
	security := store.DefaultInstanceModerationSecuritySetting()
	security.AIReview = review
	require.NoError(t, s.Store.UpsertInstanceModerationSecuritySetting(context.Background(), security))
}

func reviewChatResponse(w http.ResponseWriter, content string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": content}}}})
}

func TestAIReviewOptInConsensusQuotaAndCache(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "review-owner", store.RoleUser)
	caller := userCtx(ctx, owner.ID)
	var calls atomic.Int32
	var mode atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if mode.Load() == 2 {
			http.Error(w, "insufficient_quota", http.StatusPaymentRequired)
			return
		}
		if mode.Load() == 3 {
			reviewChatResponse(w, "yes")
			return
		}
		if mode.Load() == 1 && strings.HasPrefix(r.URL.Path, "/second") {
			reviewChatResponse(w, "false")
			return
		}
		reviewChatResponse(w, "true")
	}))
	defer server.Close()
	saveReviewTestProviders(t, s,
		&storepb.AIProviderConfig{Id: "first", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, Endpoint: server.URL + "/first"},
		&storepb.AIProviderConfig{Id: "second", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, Endpoint: server.URL + "/second"},
	)
	create := func(title string) error {
		_, err := s.CreateSpace(caller, &v1pb.CreateSpaceRequest{Space: &v1pb.Space{Title: title}})
		return err
	}
	require.NoError(t, create("off"))
	require.Zero(t, calls.Load())
	policy := &store.AIReviewSetting{Enabled: true, TextEnabled: false, TextProviderIDs: []string{"first", "second"}}
	setReviewPolicy(t, s, policy)
	require.NoError(t, create("text off"))
	require.NoError(t, s.reviewImageSource(ctx, "http://127.0.0.1/private"))
	require.Zero(t, calls.Load())
	policy.TextEnabled = true
	setReviewPolicy(t, s, policy)
	require.NoError(t, create("allowed"))
	require.EqualValues(t, 2, calls.Load())
	require.NoError(t, create("allowed"))
	require.EqualValues(t, 2, calls.Load(), "a cached verdict avoids duplicate upstream calls")
	mode.Store(1)
	require.Equal(t, codes.InvalidArgument, status.Code(create("denied by second")))
	spaces, err := s.Store.ListSpaces(ctx, &store.FindSpace{})
	require.NoError(t, err)
	for _, space := range spaces {
		require.NotEqual(t, "denied by second", space.Title)
	}
	mode.Store(2)
	err = create("quota retry")
	require.Equal(t, codes.Unavailable, status.Code(err))
	require.Contains(t, err.Error(), "balance")
	mode.Store(0)
	require.NoError(t, create("quota retry"), "a quota failure must never become a cached approval or a cached rejection")
	mode.Store(3)
	require.Equal(t, codes.Unavailable, status.Code(create("not a boolean")))
	// Changing the administrator policy invalidates previously cached approvals.
	policy.TextPrompt = "Changed policy"
	setReviewPolicy(t, s, policy)
	require.Equal(t, codes.Unavailable, status.Code(create("allowed")))
}

func tinyReviewPNG(t *testing.T) []byte {
	t.Helper()
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 8, 8))))
	return encoded.Bytes()
}

func TestAIImageReviewGuardsUploadAvatarSpaceAndPublication(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "image-review-owner", store.RoleUser)
	caller := userCtx(ctx, owner.ID)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var request struct {
			Messages []struct {
				Content json.RawMessage `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			http.Error(w, "bad", 400)
			return
		}
		require.Contains(t, string(request.Messages[1].Content), "data:image/jpeg;base64,")
		reviewChatResponse(w, "false")
	}))
	defer server.Close()
	saveReviewTestProviders(t, s, &storepb.AIProviderConfig{Id: "vision", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, Endpoint: server.URL, SupportsVision: true})
	data := tinyReviewPNG(t)
	attachment, err := s.CreateAttachment(caller, &v1pb.CreateAttachmentRequest{Attachment: &v1pb.Attachment{Filename: "before.png", Type: "image/png", Content: data}})
	require.NoError(t, err)
	require.Zero(t, calls.Load())
	policy := &store.AIReviewSetting{Enabled: true, ImagesEnabled: true, ImageProviderIDs: []string{"vision"}}
	setReviewPolicy(t, s, policy)
	_, err = s.CreateMemo(caller, &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "Image post", Visibility: v1pb.Visibility_PUBLIC, Attachments: []*v1pb.Attachment{{Name: attachment.Name}}}})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	avatar := "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
	_, err = s.UpdateUser(caller, &v1pb.UpdateUserRequest{User: &v1pb.User{Name: BuildUserName(owner.Username), AvatarUrl: avatar}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"avatar_url"}}})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	unchanged, err := s.Store.GetUser(ctx, &store.FindUser{ID: &owner.ID})
	require.NoError(t, err)
	require.Empty(t, unchanged.AvatarURL)
	_, err = s.CreateSpace(caller, &v1pb.CreateSpaceRequest{Space: &v1pb.Space{Title: "Avatar space", AvatarUrl: avatar}})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
	_, err = s.CreateAttachment(caller, &v1pb.CreateAttachmentRequest{Attachment: &v1pb.Attachment{Filename: "after.bin", Type: "application/octet-stream", Content: data}})
	require.Equal(t, codes.InvalidArgument, status.Code(err), "declaring an image as another MIME type must not bypass review")
	files, err := s.Store.ListAttachments(ctx, &store.FindAttachment{CreatorID: &owner.ID})
	require.NoError(t, err)
	require.Len(t, files, 1, "rejected uploads must not create a storage row")
	require.EqualValues(t, 1, calls.Load(), "the same normalized image can reuse a verdict across entry points")
	policy.ImagesEnabled = false
	setReviewPolicy(t, s, policy)
	require.NoError(t, s.reviewImageBytes(ctx, []byte("not an image")), "no decoding or upstream requests while image review is off")
}

func TestJevReviewUsesTypedDecisionsAndImages(t *testing.T) {
	for _, probability := range []float64{0.99, 0.5, 0.01} {
		t.Run(strings.ReplaceAll(strings.TrimSpace(jsonNumber(probability)), ".", "_"), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, "/v1/systemone", r.URL.Path)
				require.Equal(t, "Bearer jev-key", r.Header.Get("Authorization"))
				require.Equal(t, "true", r.Header.Get("TypeSafe-Danger-Zone-Images"))
				var payload map[string]any
				require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
				require.Equal(t, "jev-latest", payload["model"])
				require.Len(t, payload["assets"], 1)
				questions, ok := payload["questions"].(map[string]any)
				require.True(t, ok)
				question, ok := questions["compliant"].(map[string]any)
				require.True(t, ok)
				require.Equal(t, "noul", question["type"])
				require.Equal(t, "Custom review policy", question["instructions"])
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"answers": map[string]any{"compliant": map[string]any{"type": "noul", "noul": probability}}})
			}))
			defer server.Close()
			allowed, err := requestAIReview(context.Background(), ai.ProviderConfig{Type: ai.ProviderJev, Endpoint: server.URL + "/v1", APIKey: "jev-key"}, "Custom review policy", "content", []aiImage{{Mime: "image/jpeg", Base64: "aW1hZ2U="}})
			require.NoError(t, err)
			require.Equal(t, probability > 0.5, allowed)
		})
	}
}

func jsonNumber(value float64) string { encoded, _ := json.Marshal(value); return string(encoded) }

func TestWritingRequiresExplicitProviderOptIn(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	admin := createSpaceTestUser(ctx, t, s, "writing-opt-in-admin", store.RoleAdmin)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); reviewChatResponse(w, "Written") }))
	defer server.Close()
	provider := &storepb.AIProviderConfig{Id: "writer", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, Endpoint: server.URL}
	saveReviewTestProviders(t, s, provider)
	_, err := s.GenerateText(userCtx(ctx, admin.ID), &v1pb.GenerateTextRequest{ProviderId: "writer", Prompt: "Write"})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	require.Zero(t, calls.Load())
	provider.WritingEnabled = true
	saveReviewTestProviders(t, s, provider)
	response, err := s.GenerateText(userCtx(ctx, admin.ID), &v1pb.GenerateTextRequest{ProviderId: "writer", Prompt: "Write"})
	require.NoError(t, err)
	require.Equal(t, "Written", response.Text)
}

func TestAIReviewConfigurationValidation(t *testing.T) {
	setting := &storepb.InstanceAISetting{Providers: []*storepb.AIProviderConfig{{Id: "text"}, {Id: "jev", Type: storepb.AIProviderType_JEV, SupportsVision: true}}}
	require.NoError(t, validateAIReviewSetting(nil, setting))
	require.NoError(t, validateAIReviewSetting(&store.AIReviewSetting{}, setting))
	config := &store.AIReviewSetting{Enabled: true, TextEnabled: true}
	require.Error(t, validateAIReviewSetting(config, setting))
	config.TextProviderIDs = []string{"text", "jev"}
	require.NoError(t, validateAIReviewSetting(config, setting))
	config.ImagesEnabled = true
	config.ImageProviderIDs = []string{"text"}
	require.Error(t, validateAIReviewSetting(config, setting))
	config.ImageProviderIDs = []string{"jev"}
	require.NoError(t, validateAIReviewSetting(config, setting))
	config.TextProviderIDs = []string{"text", "text"}
	require.Error(t, validateAIReviewSetting(config, setting))
}

func TestAIReviewSettingsPersistenceAndProviderProtection(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	defaults, err := s.Store.GetInstanceModerationSecuritySetting(ctx)
	require.NoError(t, err)
	require.False(t, defaults.AIReview.Enabled)
	require.False(t, defaults.AIReview.TextEnabled)
	require.False(t, defaults.AIReview.ImagesEnabled)
	provider := &storepb.AIProviderConfig{Id: "reviewer", Title: "Reviewer", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, Endpoint: "https://example.com/v1", SupportsVision: true}
	saveReviewTestProviders(t, s, provider)
	policy := &store.AIReviewSetting{Enabled: true, TextEnabled: true, ImagesEnabled: true, TextProviderIDs: []string{"reviewer"}, ImageProviderIDs: []string{"reviewer"}, TextPrompt: "Text policy", ImagePrompt: "Image policy"}
	setReviewPolicy(t, s, policy)
	loaded, err := s.Store.GetInstanceModerationSecuritySetting(ctx)
	require.NoError(t, err)
	require.Equal(t, policy, loaded.AIReview)
	require.ErrorContains(t, s.prepareInstanceAISettingForUpdate(ctx, &storepb.InstanceAISetting{}), "missing")
	provider.SupportsVision = false
	require.ErrorContains(t, s.prepareInstanceAISettingForUpdate(ctx, &storepb.InstanceAISetting{Providers: []*storepb.AIProviderConfig{provider}}), "image recognition")
	policy.Enabled = false
	setReviewPolicy(t, s, policy)
	require.NoError(t, s.prepareInstanceAISettingForUpdate(ctx, &storepb.InstanceAISetting{}))
}

func TestAIReviewScheduledPublicationFailsClosed(t *testing.T) {
	ctx := context.Background()
	s := newIntegrationService(t)
	owner := createSpaceTestUser(ctx, t, s, "scheduled-review-owner", store.RoleUser)
	response, err := s.CreateMemo(userCtx(ctx, owner.ID), &v1pb.CreateMemoRequest{Memo: &v1pb.Memo{Content: "Scheduled content", Visibility: v1pb.Visibility_PUBLIC, PublishTime: timestamppb.New(time.Now().Add(time.Hour))}})
	require.NoError(t, err)
	uid := strings.TrimPrefix(response.Name, "memos/")
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	require.NoError(t, err)
	memo.Payload.PublishTs = time.Now().Add(-time.Second).Unix()
	require.NoError(t, s.Store.UpdateMemo(ctx, &store.UpdateMemo{ID: memo.ID, Payload: memo.Payload}))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "insufficient_quota", http.StatusPaymentRequired)
	}))
	defer server.Close()
	saveReviewTestProviders(t, s, &storepb.AIProviderConfig{Id: "reviewer", Type: storepb.AIProviderType_OPENAI_COMPATIBLE, Endpoint: server.URL})
	setReviewPolicy(t, s, &store.AIReviewSetting{Enabled: true, TextEnabled: true, TextProviderIDs: []string{"reviewer"}})
	s.PublishScheduledMemos(ctx)
	stored, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	require.NoError(t, err)
	require.True(t, stored.Payload.Draft)
	require.Zero(t, stored.Payload.PublishTs)
	_, err = s.GetMemo(ctx, &v1pb.GetMemoRequest{Name: response.Name})
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestJevReviewRejectsInvalidDecisions(t *testing.T) {
	for _, body := range []string{`{}`, `{"answers":{"compliant":{"type":"noul"}}}`, `{"answers":{"compliant":{"type":"noul","noul":1.1}}}`, `{"answers":{"compliant":{"type":"boolean","noul":1}}}`} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
		allowed, err := requestAIReview(context.Background(), ai.ProviderConfig{Type: ai.ProviderJev, Endpoint: server.URL}, "Policy", "content", nil)
		server.Close()
		require.Error(t, err)
		require.False(t, allowed)
	}
}
