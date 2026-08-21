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
	provider, err := s.resolveAIProvider(aiSetting, request.GetProviderId())
	if err != nil {
		return nil, err
	}
	model := strings.TrimSpace(request.GetModel())
	if model == "" {
		model = defaultAITextModel(provider.Type)
	}
	if model == "" {
		return nil, status.Errorf(codes.InvalidArgument, "model is required for provider type %q", provider.Type)
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

	switch provider.Type {
	case ai.ProviderOpenAI, ai.ProviderDeepSeek, ai.ProviderOpenAICompatible, ai.ProviderOllama:
		endpoint := strings.TrimRight(provider.Endpoint, "/") + "/chat/completions"
		payload := map[string]any{
			"model": model,
			"messages": []map[string]string{
				{"role": "system", "content": systemText},
				{"role": "user", "content": userText},
			},
		}
		headers := map[string]string{}
		if provider.APIKey != "" {
			headers["Authorization"] = "Bearer " + provider.APIKey
		}
		var response struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := postAIJSON(ctx, endpoint, headers, payload, &response); err != nil {
			return "", err
		}
		if len(response.Choices) == 0 {
			return "", errors.New("provider response did not include choices")
		}
		return response.Choices[0].Message.Content, nil

	case ai.ProviderAnthropic:
		endpoint := strings.TrimRight(provider.Endpoint, "/") + "/messages"
		payload := map[string]any{
			"model": model, "max_tokens": 4096, "system": systemText,
			"messages": []map[string]string{{"role": "user", "content": userText}},
		}
		headers := map[string]string{"x-api-key": provider.APIKey, "anthropic-version": "2023-06-01"}
		var response struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if err := postAIJSON(ctx, endpoint, headers, payload, &response); err != nil {
			return "", err
		}
		parts := make([]string, 0, len(response.Content))
		for _, block := range response.Content {
			if block.Type == "text" && block.Text != "" {
				parts = append(parts, block.Text)
			}
		}
		return strings.Join(parts, "\n"), nil

	case ai.ProviderGemini:
		endpoint := fmt.Sprintf("%s/models/%s:generateContent?key=%s", strings.TrimRight(provider.Endpoint, "/"), url.PathEscape(model), url.QueryEscape(provider.APIKey))
		payload := map[string]any{
			"systemInstruction": map[string]any{"parts": []map[string]string{{"text": systemText}}},
			"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": userText}}}},
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
		if err := postAIJSON(ctx, endpoint, nil, payload, &response); err != nil {
			return "", err
		}
		if len(response.Candidates) == 0 {
			return "", errors.New("provider response did not include candidates")
		}
		parts := make([]string, 0, len(response.Candidates[0].Content.Parts))
		for _, part := range response.Candidates[0].Content.Parts {
			if part.Text != "" {
				parts = append(parts, part.Text)
			}
		}
		return strings.Join(parts, "\n"), nil
	default:
		return "", errors.Errorf("provider type %q is not supported for text generation", provider.Type)
	}
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
	resp, err := aiTextHTTPClient.Do(req)
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
		return errors.Errorf("provider returned HTTP %d: %s", resp.StatusCode, detail)
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
		ID:       provider.GetId(),
		Title:    provider.GetTitle(),
		Type:     convertAIProviderTypeFromStore(provider.GetType()),
		Endpoint: provider.GetEndpoint(),
		APIKey:   provider.GetApiKey(),
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
