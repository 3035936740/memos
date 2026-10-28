package v1

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/internal/ai/audiollm"
	audiollmgemini "github.com/usememos/memos/internal/ai/audiollm/gemini"
	"github.com/usememos/memos/internal/ai/stt"
	sttopenai "github.com/usememos/memos/internal/ai/stt/openai"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
)

const (
	maxTranscriptionAudioSizeBytes = 25 * MebiByte
	maxTranscriptionFilenameLength = 255
	maxAITextPromptLength          = 16000
	maxAITextContextLength         = 64000
	maxAITextResponseBytes         = 2 << 20
)

var aiTextHTTPClient = &http.Client{Timeout: 90 * time.Second}

var supportedTranscriptionContentTypes = map[string]bool{
	"audio/aac":    true,
	"audio/aiff":   true,
	"audio/flac":   true,
	"audio/mpeg":   true,
	"audio/mp3":    true,
	"audio/mp4":    true,
	"audio/mpga":   true,
	"audio/ogg":    true,
	"audio/wav":    true,
	"audio/x-wav":  true,
	"audio/x-flac": true,
	"audio/x-m4a":  true,
	"audio/webm":   true,
	"video/mp4":    true,
	"video/mpeg":   true,
	"video/webm":   true,
}

// Transcribe transcribes an audio file using an instance AI provider.
func (s *APIV1Service) Transcribe(ctx context.Context, request *v1pb.TranscribeRequest) (*v1pb.TranscribeResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	if request.Audio == nil {
		return nil, status.Errorf(codes.InvalidArgument, "audio is required")
	}
	if request.Audio.GetUri() != "" {
		return nil, status.Errorf(codes.InvalidArgument, "audio uri is not supported")
	}
	content := request.Audio.GetContent()
	if len(content) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "audio content is required")
	}
	if len(content) > maxTranscriptionAudioSizeBytes {
		return nil, status.Errorf(codes.InvalidArgument, "audio file is too large; maximum size is 25 MiB")
	}
	filename := strings.TrimSpace(request.Audio.GetFilename())
	if len(filename) > maxTranscriptionFilenameLength {
		return nil, status.Errorf(codes.InvalidArgument, "filename is too long; maximum length is %d characters", maxTranscriptionFilenameLength)
	}
	contentType := strings.TrimSpace(request.Audio.GetContentType())
	if contentType == "" {
		contentType = http.DetectContentType(content)
	}
	if !isSupportedTranscriptionContentType(contentType) {
		return nil, status.Errorf(codes.InvalidArgument, "audio content type %q is not supported", contentType)
	}

	aiSetting, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get AI setting: %v", err)
	}
	persisted := aiSetting.GetTranscription()

	providerID := persisted.GetProviderId()
	if providerID == "" {
		return nil, status.Errorf(codes.FailedPrecondition, "transcription is not configured")
	}

	provider, err := s.resolveAIProvider(aiSetting, providerID)
	if err != nil {
		return nil, err
	}

	model := persisted.GetModel()
	if model == "" {
		defaultModel, err := ai.DefaultTranscriptionModel(provider.Type)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "%v", err)
		}
		model = defaultModel
	}

	var text string
	switch provider.Type {
	case ai.ProviderOpenAI, ai.ProviderOpenAICompatible:
		text, err = s.transcribeViaSTT(ctx, provider, persisted, model, content, filename, contentType)
	case ai.ProviderGemini:
		text, err = s.transcribeViaAudioLLM(ctx, provider, persisted, model, content, contentType)
	default:
		return nil, status.Errorf(codes.FailedPrecondition,
			"provider type %q is not supported for transcription", provider.Type)
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to transcribe audio: %v", err)
	}
	return &v1pb.TranscribeResponse{Text: text}, nil
}

// GenerateText makes text-only providers useful from the memo composer.
func (s *APIV1Service) GenerateText(ctx context.Context, request *v1pb.GenerateTextRequest) (*v1pb.GenerateTextResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	prompt := strings.TrimSpace(request.GetPrompt())
	if prompt == "" {
		return nil, status.Errorf(codes.InvalidArgument, "prompt is required")
	}
	if len(prompt) > maxAITextPromptLength || len(request.GetContext()) > maxAITextContextLength {
		return nil, status.Errorf(codes.InvalidArgument, "AI prompt or memo context is too long")
	}

	aiSetting, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get AI setting: %v", err)
	}
	providerID := request.GetProviderId()
	requestedModel := request.GetModel()
	if request.PlanFirst {
		workflow := aiSetting.GetTextGeneration()
		if !workflow.GetEnabled() {
			return nil, status.Error(codes.FailedPrecondition, "planning workflow is not configured")
		}
		providerID = workflow.GenerationProviderId
		requestedModel = workflow.GenerationModel
	}
	provider, err := s.resolveAIProvider(aiSetting, providerID)
	if err != nil {
		return nil, err
	}
	if !provider.WritingEnabled || provider.Type == ai.ProviderJev {
		return nil, status.Error(codes.PermissionDenied, "AI provider is not enabled for writing")
	}
	model := strings.TrimSpace(requestedModel)
	if model == "" {
		model = provider.DefaultModel
	}
	if model == "" {
		model = defaultAITextModel(provider.Type)
	}
	if model == "" {
		return nil, status.Errorf(codes.InvalidArgument, "model is required for provider type %q", provider.Type)
	}

	if request.PlanFirst {
		workflow := aiSetting.GetTextGeneration()
		planner, err := s.resolveAIProvider(aiSetting, workflow.PlanningProviderId)
		if err != nil {
			return nil, err
		}
		if !planner.WritingEnabled || planner.Type == ai.ProviderJev {
			return nil, status.Error(codes.PermissionDenied, "planning provider is not enabled for writing")
		}
		planningModel := strings.TrimSpace(workflow.PlanningModel)
		if planningModel == "" {
			planningModel = planner.DefaultModel
		}
		if planningModel == "" {
			planningModel = defaultAITextModel(planner.Type)
		}
		if planningModel == "" {
			return nil, status.Error(codes.InvalidArgument, "planning model is required")
		}
		plan, err := generateAIText(ctx, planner, planningModel, "Prepare a concise writing plan for the following instruction. Return the plan only, not the finished article.\n\n"+prompt, request.GetContext())
		if err != nil {
			return nil, status.Errorf(codes.Internal, "AI planning failed: %v", err)
		}
		planRunes := []rune(strings.TrimSpace(plan))
		if len(planRunes) == 0 {
			return nil, status.Error(codes.Internal, "AI planner returned an empty plan")
		}
		if len(planRunes) > 8192 {
			planRunes = planRunes[:8192]
		}
		prompt += "\n\nUse the following writing plan as a guide. Return only the completed text, without the plan:\n---\n" + string(planRunes) + "\n---"
	}
	text, err := generateAIText(ctx, provider, model, prompt, request.GetContext())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "AI text generation failed: %v", err)
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, status.Errorf(codes.Internal, "AI provider returned empty text")
	}
	return &v1pb.GenerateTextResponse{Text: text}, nil
}

func defaultAITextModel(providerType ai.ProviderType) string {
	switch providerType {
	case ai.ProviderOpenAI, ai.ProviderOpenAICompatible:
		return "gpt-4o-mini"
	case ai.ProviderGemini:
		return "gemini-2.5-flash"
	case ai.ProviderAnthropic:
		return "claude-3-5-haiku-latest"
	case ai.ProviderDeepSeek:
		return "deepseek-chat"
	case ai.ProviderOllama:
		return "llama3.2"
	default:
		return ""
	}
}

func generateAIText(ctx context.Context, provider ai.ProviderConfig, model, prompt, memoContext string) (string, error) {
	userText := prompt
	if memoContext = strings.TrimSpace(memoContext); memoContext != "" {
		userText += "\n\nCurrent memo for context:\n---\n" + memoContext + "\n---"
	}
	systemText := "You assist with writing a personal memo or blog post. Return only the requested text in valid Markdown; do not add a preface."
	return callAIModel(ctx, provider, model, systemText, userText, nil)
}

type aiImage struct {
	Mime   string
	Base64 string
}

func callAIModel(ctx context.Context, provider ai.ProviderConfig, model, systemText, userText string, images []aiImage) (string, error) {
	switch provider.Type {
	case ai.ProviderOpenAI, ai.ProviderDeepSeek, ai.ProviderOpenAICompatible, ai.ProviderOllama, ai.ProviderAzureOpenAI:
		endpoint := strings.TrimRight(provider.Endpoint, "/") + "/chat/completions"
		var userContent any = userText
		if len(images) > 0 {
			parts := []map[string]any{{"type": "text", "text": userText}}
			for _, image := range images {
				parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]string{"url": "data:" + image.Mime + ";base64," + image.Base64}})
			}
			userContent = parts
		}
		payload := map[string]any{
			"model": model,
			"messages": []map[string]any{
				{"role": "system", "content": systemText},
				{"role": "user", "content": userContent},
			},
		}
		headers := map[string]string{}
		if provider.APIKey != "" {
			headers["Authorization"] = "Bearer " + provider.APIKey
		}
		if provider.Type == ai.ProviderAzureOpenAI {
			base := strings.TrimRight(provider.Endpoint, "/")
			endpoint = base + "/openai/v1/chat/completions"
			if strings.HasSuffix(base, "/openai/v1") {
				endpoint = base + "/chat/completions"
			}
			if provider.AzureAPIVersion != "" {
				endpoint = base + "/openai/deployments/" + url.PathEscape(model) + "/chat/completions?api-version=" + url.QueryEscape(provider.AzureAPIVersion)
			}
			delete(headers, "Authorization")
			headers["api-key"] = provider.APIKey
		}
		if provider.ReasoningEffort != "" {
			payload["reasoning_effort"] = provider.ReasoningEffort
		}
		var response struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := postAIJSON(ctx, endpoint, mergeAIHeaders(headers, provider.CustomHeaders), payload, &response); err != nil {
			return "", err
		}
		if len(response.Choices) == 0 {
			return "", errors.New("provider response did not include choices")
		}
		return response.Choices[0].Message.Content, nil

	case ai.ProviderAnthropic:
		endpoint := strings.TrimRight(provider.Endpoint, "/") + "/messages"
		parts := []map[string]any{{"type": "text", "text": userText}}
		for _, image := range images {
			parts = append(parts, map[string]any{"type": "image", "source": map[string]string{"type": "base64", "media_type": image.Mime, "data": image.Base64}})
		}
		payload := map[string]any{
			"model": model, "max_tokens": 4096, "system": systemText,
			"messages": []map[string]any{{"role": "user", "content": parts}},
		}
		headers := map[string]string{"x-api-key": provider.APIKey, "anthropic-version": "2023-06-01"}
		var response struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if err := postAIJSON(ctx, endpoint, mergeAIHeaders(headers, provider.CustomHeaders), payload, &response); err != nil {
			return "", err
		}
		textParts := make([]string, 0, len(response.Content))
		for _, block := range response.Content {
			if block.Type == "text" && block.Text != "" {
				textParts = append(textParts, block.Text)
			}
		}
		return strings.Join(textParts, "\n"), nil

	case ai.ProviderGemini:
		endpoint := fmt.Sprintf("%s/models/%s:generateContent?key=%s", strings.TrimRight(provider.Endpoint, "/"), url.PathEscape(model), url.QueryEscape(provider.APIKey))
		parts := []map[string]any{{"text": userText}}
		for _, image := range images {
			parts = append(parts, map[string]any{"inlineData": map[string]string{"mimeType": image.Mime, "data": image.Base64}})
		}
		payload := map[string]any{
			"systemInstruction": map[string]any{"parts": []map[string]string{{"text": systemText}}},
			"contents":          []map[string]any{{"role": "user", "parts": parts}},
		}
		var response struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		if err := postAIJSON(ctx, endpoint, provider.CustomHeaders, payload, &response); err != nil {
			return "", err
		}
		if len(response.Candidates) == 0 {
			return "", errors.New("provider response did not include candidates")
		}
		textParts := make([]string, 0, len(response.Candidates[0].Content.Parts))
		for _, part := range response.Candidates[0].Content.Parts {
			if part.Text != "" {
				textParts = append(textParts, part.Text)
			}
		}
		return strings.Join(textParts, "\n"), nil
	default:
		return "", errors.Errorf("provider type %q is not supported for text generation", provider.Type)
	}
}

type aiProviderHTTPError struct {
	Status int
	Detail string
}

func (err *aiProviderHTTPError) Error() string {
	return fmt.Sprintf("provider returned HTTP %d: %s", err.Status, err.Detail)
}

func postAIJSON(ctx context.Context, endpoint string, headers map[string]string, payload any, target any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return errors.Wrap(err, "failed to encode provider request")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.Wrap(err, "failed to create provider request")
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		if value != "" {
			req.Header.Set(key, value)
		}
	}
	resp, err := ai.WithHeaders(aiTextHTTPClient, headers).Do(req)
	if err != nil {
		return errors.Wrap(err, "provider request failed")
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, maxAITextResponseBytes))
	if err != nil {
		return errors.Wrap(err, "failed to read provider response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail := strings.TrimSpace(string(responseBody))
		// Provider errors can contain large HTML pages or verbose upstream traces.
		// Keep the diagnostic useful without reflecting an unbounded response into
		// the API error and frontend toast.
		const maxProviderErrorLength = 4096
		if len(detail) > maxProviderErrorLength {
			detail = detail[:maxProviderErrorLength] + "..."
		}
		return &aiProviderHTTPError{Status: resp.StatusCode, Detail: detail}
	}
	if err := json.Unmarshal(responseBody, target); err != nil {
		return errors.Wrap(err, "failed to decode provider response")
	}
	return nil
}

func (*APIV1Service) transcribeViaSTT(
	ctx context.Context,
	provider ai.ProviderConfig,
	persisted *storepb.TranscriptionConfig,
	model string,
	content []byte,
	filename string,
	contentType string,
) (string, error) {
	transcriber, err := sttopenai.New(provider, stt.ApplyOptions(nil))
	if err != nil {
		return "", errors.Wrap(err, "failed to create STT transcriber")
	}
	resp, err := transcriber.Transcribe(ctx, stt.Request{
		Audio:       bytes.NewReader(content),
		Size:        int64(len(content)),
		Filename:    filename,
		ContentType: contentType,
		Model:       model,
		Prompt:      persisted.GetPrompt(),
		Language:    persisted.GetLanguage(),
	})
	if err != nil {
		return "", err
	}
	return resp.Text, nil
}

func (*APIV1Service) transcribeViaAudioLLM(
	ctx context.Context,
	provider ai.ProviderConfig,
	persisted *storepb.TranscriptionConfig,
	model string,
	content []byte,
	contentType string,
) (string, error) {
	m, err := audiollmgemini.New(provider, audiollm.ApplyOptions(nil))
	if err != nil {
		return "", errors.Wrap(err, "failed to create audio LLM")
	}
	resp, err := m.GenerateFromAudio(ctx, audiollm.Request{
		Audio:        bytes.NewReader(content),
		Size:         int64(len(content)),
		ContentType:  contentType,
		Model:        model,
		Instructions: buildTranscriptionInstructions(persisted.GetPrompt(), persisted.GetLanguage()),
	})
	if err != nil {
		return "", err
	}
	if resp.FinishReason != audiollm.FinishStop {
		return "", errors.Errorf("transcription incomplete (finish reason: %s)", resp.FinishReason)
	}
	if strings.TrimSpace(resp.Text) == "" {
		return "", errors.New("transcription response did not include text")
	}
	return resp.Text, nil
}

func buildTranscriptionInstructions(prompt, language string) string {
	parts := []string{
		"Transcribe the audio accurately. Return only the transcript text. " +
			"Do not summarize, explain, or add content that is not spoken.",
	}
	if language = strings.TrimSpace(language); language != "" {
		parts = append(parts, "The input language is "+language+".")
	}
	if prompt = strings.TrimSpace(prompt); prompt != "" {
		parts = append(parts, "Context and spelling hints:\n"+prompt)
	}
	return strings.Join(parts, "\n\n")
}

func (*APIV1Service) resolveAIProvider(setting *storepb.InstanceAISetting, providerID string) (ai.ProviderConfig, error) {
	providers := make([]ai.ProviderConfig, 0, len(setting.GetProviders()))
	for _, provider := range setting.GetProviders() {
		if provider == nil {
			continue
		}
		providers = append(providers, convertAIProviderConfigFromStore(provider))
	}

	provider, err := ai.FindProvider(providers, providerID)
	if err != nil {
		return ai.ProviderConfig{}, status.Errorf(codes.FailedPrecondition, "transcription provider is not configured")
	}
	return *provider, nil
}

func convertAIProviderConfigFromStore(provider *storepb.AIProviderConfig) ai.ProviderConfig {
	return ai.ProviderConfig{
		ID:              provider.GetId(),
		Title:           provider.GetTitle(),
		Type:            convertAIProviderTypeFromStore(provider.GetType()),
		Endpoint:        provider.GetEndpoint(),
		APIKey:          provider.GetApiKey(),
		DefaultModel:    provider.GetDefaultModel(),
		ReasoningEffort: provider.GetReasoningEffort(),
		CustomHeaders:   provider.GetCustomHeaders(),
		AzureAPIVersion: provider.GetAzureApiVersion(),
		WritingEnabled:  provider.GetWritingEnabled(),
		SupportsVision:  provider.GetSupportsVision(),
	}
}

func convertAIProviderTypeFromStore(providerType storepb.AIProviderType) ai.ProviderType {
	switch providerType {
	case storepb.AIProviderType_OPENAI:
		return ai.ProviderOpenAI
	case storepb.AIProviderType_GEMINI:
		return ai.ProviderGemini
	case storepb.AIProviderType_ANTHROPIC:
		return ai.ProviderAnthropic
	case storepb.AIProviderType_DEEPSEEK:
		return ai.ProviderDeepSeek
	case storepb.AIProviderType_OPENAI_COMPATIBLE:
		return ai.ProviderOpenAICompatible
	case storepb.AIProviderType_OLLAMA:
		return ai.ProviderOllama
	case storepb.AIProviderType_AZURE_OPENAI:
		return ai.ProviderAzureOpenAI
	case storepb.AIProviderType_JEV:
		return ai.ProviderJev
	default:
		return ""
	}
}

func isSupportedTranscriptionContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(contentType))
	if err != nil {
		return false
	}
	mediaType = strings.ToLower(mediaType)
	return supportedTranscriptionContentTypes[mediaType]
}
