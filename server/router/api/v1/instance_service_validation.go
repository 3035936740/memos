package v1

import (
	"context"
	"encoding/json"
	"math"
	"net/url"
	"regexp"
	"strings"

	"github.com/lithammer/shortuuid/v4"
	"github.com/pkg/errors"
	colorpb "google.golang.org/genproto/googleapis/type/color"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/internal/dailyquestion"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func applyInstanceSettingDefaults(setting *v1pb.InstanceSetting) {
	memoRelatedSetting := setting.GetMemoRelatedSetting()
	if memoRelatedSetting == nil || memoRelatedSetting.ContentLengthLimit != 0 {
		return
	}
	memoRelatedSetting.ContentLengthLimit = store.DefaultContentLengthLimit
}

func validateInstanceSetting(setting *v1pb.InstanceSetting) error {
	key, err := ExtractInstanceSettingKeyFromName(setting.Name)
	if err != nil {
		return err
	}
	switch key {
	case storepb.InstanceSettingKey_GENERAL.String():
		return validateInstanceGeneralSetting(setting.GetGeneralSetting())
	case storepb.InstanceSettingKey_MEMO_RELATED.String():
		return validateInstanceMemoRelatedSetting(setting.GetMemoRelatedSetting())
	case storepb.InstanceSettingKey_TAGS.String():
		return validateInstanceTagsSetting(setting.GetTagsSetting())
	case storepb.InstanceSettingKey_ACCESS.String():
		return validateInstanceAccessSetting(setting.GetAccessSetting())
	default:
		return nil
	}
}

const (
	maxFirstVisitStyleLength = 64
	maxMusicConfigJSONLength = 256 * 1024
	maxMusicTrackCount       = 200
)

type musicConfigForValidation struct {
	Mode          string   `json:"mode"`
	DefaultVolume *float64 `json:"defaultVolume"`
	Tracks        []struct {
		ID     string `json:"id"`
		Title  string `json:"title"`
		Artist string `json:"artist"`
		URL    string `json:"url"`
	} `json:"tracks"`
}

func validateInstanceGeneralSetting(setting *v1pb.InstanceSetting_GeneralSetting) error {
	if setting == nil {
		return errors.New("general setting is required")
	}
	if p := setting.CustomProfile; p != nil && p.DefaultAvatarUrl != "" {
		raw := p.DefaultAvatarUrl
		u, err := url.Parse(raw)
		local := strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//")
		remote := u != nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil
		if err != nil || len(raw) > 8192 || strings.ContainsAny(raw, "\\\r\n\t") ||
			(!local && !remote) {
			return errors.New("default avatar must be a local image path or an http(s) URL (maximum 8192 bytes)")
		}
	}
	if err := dailyquestion.ValidateSeed(setting.DailyQuestionSeed); err != nil {
		return err
	}
	normalized, _, err := dailyquestion.NormalizeQuestions(setting.DailyQuestionsJson)
	if err != nil {
		return err
	}
	setting.DailyQuestionsJson = normalized
	if setting.TrashRetentionDays != nil && (*setting.TrashRetentionDays < 0 || *setting.TrashRetentionDays > 3650) {
		return errors.New("trash retention days must be between 0 and 3650")
	}
	if setting.MemoRevisionLimit != nil && (*setting.MemoRevisionLimit < 0 || *setting.MemoRevisionLimit > 200) {
		return errors.New("memo revision limit must be between 0 and 200")
	}
	if len(setting.FirstVisitDefaultStyle) > maxFirstVisitStyleLength {
		return errors.Errorf("first_visit_default_style is too long; maximum length is %d characters", maxFirstVisitStyleLength)
	}
	if setting.PreferencesResetAt < 0 {
		return errors.New("preferences_reset_at cannot be negative")
	}
	if len(setting.MusicConfigJson) > maxMusicConfigJSONLength {
		return errors.Errorf("music_config_json is too long; maximum length is %d bytes", maxMusicConfigJSONLength)
	}
	if strings.TrimSpace(setting.MusicConfigJson) == "" {
		return nil
	}

	var config musicConfigForValidation
	if err := json.Unmarshal([]byte(setting.MusicConfigJson), &config); err != nil {
		return errors.Wrap(err, "music_config_json must be valid JSON")
	}
	if config.Mode != "" && config.Mode != "random" && config.Mode != "sequential" && config.Mode != "reverse" {
		return errors.New("music mode must be random, sequential, or reverse")
	}
	if config.DefaultVolume != nil && (*config.DefaultVolume < 0 || *config.DefaultVolume > 1) {
		return errors.New("music default volume must be between 0 and 1")
	}
	if len(config.Tracks) > maxMusicTrackCount {
		return errors.Errorf("music playlist cannot contain more than %d tracks", maxMusicTrackCount)
	}
	for index, track := range config.Tracks {
		if len(track.ID) > 128 || len(track.Title) > 512 || len(track.Artist) > 512 || len(track.URL) > 4096 {
			return errors.Errorf("music track %d contains a field that is too long", index+1)
		}
		if strings.TrimSpace(track.URL) == "" {
			continue
		}
		parsed, err := url.Parse(track.URL)
		if err != nil || (parsed.Scheme != "" && parsed.Scheme != "http" && parsed.Scheme != "https") {
			return errors.Errorf("music track %d has an invalid URL", index+1)
		}
		if parsed.Scheme == "" && !strings.HasPrefix(parsed.Path, "/") {
			return errors.Errorf("music track %d must use an HTTP(S) URL or an absolute site path", index+1)
		}
	}
	return nil
}

func validateInstanceMemoRelatedSetting(setting *v1pb.InstanceSetting_MemoRelatedSetting) error {
	if setting == nil {
		return errors.New("memo related setting is required")
	}
	if setting.ContentLengthLimit < store.DefaultContentLengthLimit {
		return errors.Errorf("content_length_limit must be at least %d bytes", store.DefaultContentLengthLimit)
	}
	return nil
}

func validateInstanceAccessSetting(setting *v1pb.InstanceSetting_AccessSetting) error {
	if setting == nil {
		return errors.New("access setting is required")
	}
	switch setting.AccessMode {
	case v1pb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PRIVATE, v1pb.InstanceAccessMode_INSTANCE_ACCESS_MODE_PUBLIC:
		return nil
	default:
		return errors.New("access_mode must be PRIVATE or PUBLIC")
	}
}

func (s *APIV1Service) prepareInstanceAISettingForUpdate(ctx context.Context, setting *storepb.InstanceAISetting) error {
	if setting == nil {
		return errors.New("AI setting is required")
	}

	existing, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to get existing AI setting")
	}
	existingProviders := map[string]*storepb.AIProviderConfig{}
	if existing != nil {
		for _, provider := range existing.Providers {
			if provider != nil && provider.Id != "" {
				existingProviders[provider.Id] = provider
			}
		}
	}

	seenIDs := map[string]bool{}
	for _, provider := range setting.Providers {
		if provider == nil {
			return errors.New("provider cannot be nil")
		}

		provider.Id = strings.TrimSpace(provider.Id)
		if provider.Id == "" {
			provider.Id = shortuuid.New()
		}
		if seenIDs[provider.Id] {
			return errors.Errorf("duplicate provider ID %q", provider.Id)
		}
		seenIDs[provider.Id] = true

		provider.Title = strings.TrimSpace(provider.Title)
		if provider.Title == "" {
			return errors.New("provider title is required")
		}
		if !isSupportedAIProviderType(provider.Type) {
			return errors.Errorf("provider %q has unsupported type", provider.Id)
		}

		provider.Endpoint = strings.TrimSpace(provider.Endpoint)
		if provider.Type == storepb.AIProviderType_OPENAI && provider.Endpoint == "" {
			provider.Endpoint = "https://api.openai.com/v1"
		}
		if provider.Type == storepb.AIProviderType_GEMINI && provider.Endpoint == "" {
			provider.Endpoint = "https://generativelanguage.googleapis.com/v1beta"
		}
		if provider.Type == storepb.AIProviderType_ANTHROPIC && provider.Endpoint == "" {
			provider.Endpoint = "https://api.anthropic.com/v1"
		}
		if provider.Type == storepb.AIProviderType_DEEPSEEK && provider.Endpoint == "" {
			provider.Endpoint = "https://api.deepseek.com/v1"
		}
		if provider.Type == storepb.AIProviderType_OPENAI_COMPATIBLE && provider.Endpoint == "" {
			return errors.Errorf("provider %q endpoint is required for an OpenAI-compatible connection", provider.Id)
		}
		if provider.Type == storepb.AIProviderType_AZURE_OPENAI && provider.Endpoint == "" {
			return errors.New("Azure OpenAI resource endpoint is required")
		}
		if err := prepareAIProviderOptions(provider, existingProviders[provider.Id]); err != nil {
			return err
		}
		if provider.Type == storepb.AIProviderType_OLLAMA && provider.Endpoint == "" {
			provider.Endpoint = "http://localhost:11434/v1"
		}
		if provider.Type == storepb.AIProviderType_JEV {
			if provider.WritingEnabled {
				return errors.New("Jev cannot be enabled for writing")
			}
			if provider.Endpoint == "" {
				provider.Endpoint = "https://api.typesafe.ai/v1"
			}
			if provider.DefaultModel == "" {
				provider.DefaultModel = "jev-latest"
			}
		}

		if provider.ApiKey == "" {
			if existingProvider, ok := existingProviders[provider.Id]; ok {
				provider.ApiKey = existingProvider.ApiKey
			}
		}
		if provider.ApiKey == "" && providerRequiresAPIKey(provider.Type) {
			return errors.Errorf("provider %q API key is required", provider.Id)
		}
	}

	if err := preparePersistedTranscriptionConfig(setting, existing); err != nil {
		return err
	}
	if err := prepareTextGenerationConfig(setting, existing); err != nil {
		return err
	}
	security, err := s.Store.GetInstanceModerationSecuritySetting(ctx)
	if err != nil {
		return err
	}
	return validateAIReviewSetting(security.AIReview, setting)
}

func preparePersistedTranscriptionConfig(setting *storepb.InstanceAISetting, existing *storepb.InstanceAISetting) error {
	// Preserve the previously stored transcription config when the request omits it,
	// matching the same "absence == keep" semantics used for API keys. The preserved
	// config still falls through to validation below, so a stale provider_id is
	// rejected if the same update removed or renamed its referenced provider.
	if setting.Transcription == nil && existing != nil {
		setting.Transcription = existing.GetTranscription()
	}
	if setting.Transcription == nil {
		return nil
	}

	cfg := setting.Transcription
	cfg.ProviderId = strings.TrimSpace(cfg.ProviderId)
	cfg.Model = strings.TrimSpace(cfg.Model)
	cfg.Language = strings.TrimSpace(cfg.Language)
	cfg.Prompt = strings.TrimSpace(cfg.Prompt)

	if cfg.ProviderId != "" {
		var referencedProvider *storepb.AIProviderConfig
		for _, provider := range setting.Providers {
			if provider != nil && provider.Id == cfg.ProviderId {
				referencedProvider = provider
				break
			}
		}
		if referencedProvider == nil {
			return errors.Errorf("transcription provider_id %q does not reference any configured provider", cfg.ProviderId)
		}
		if !ai.SupportsTranscription(convertAIProviderTypeFromStore(referencedProvider.Type)) {
			return errors.Errorf("provider %q does not support audio transcription", cfg.ProviderId)
		}
	}

	if len(cfg.Model) > maxTranscriptionConfigModelLength {
		return errors.Errorf("transcription model is too long; maximum length is %d characters", maxTranscriptionConfigModelLength)
	}
	if len(cfg.Language) > maxTranscriptionConfigLanguageLength {
		return errors.Errorf("transcription language is too long; maximum length is %d characters", maxTranscriptionConfigLanguageLength)
	}
	if len(cfg.Prompt) > maxTranscriptionConfigPromptLength {
		return errors.Errorf("transcription prompt is too long; maximum length is %d characters", maxTranscriptionConfigPromptLength)
	}
	return nil
}

func isSupportedAIProviderType(providerType storepb.AIProviderType) bool {
	switch providerType {
	case storepb.AIProviderType_OPENAI,
		storepb.AIProviderType_GEMINI,
		storepb.AIProviderType_ANTHROPIC,
		storepb.AIProviderType_DEEPSEEK,
		storepb.AIProviderType_OPENAI_COMPATIBLE,
		storepb.AIProviderType_OLLAMA,
		storepb.AIProviderType_AZURE_OPENAI,
		storepb.AIProviderType_JEV:
		return true
	default:
		return false
	}
}

func providerRequiresAPIKey(providerType storepb.AIProviderType) bool {
	return providerType != storepb.AIProviderType_OPENAI_COMPATIBLE && providerType != storepb.AIProviderType_OLLAMA
}

func maskAPIKey(apiKey string) string {
	if apiKey == "" {
		return ""
	}
	if len(apiKey) <= 8 {
		return "..."
	}
	prefixLength := min(4, len(apiKey))
	return apiKey[:prefixLength] + "..." + apiKey[len(apiKey)-4:]
}

func validateInstanceTagsSetting(setting *v1pb.InstanceSetting_TagsSetting) error {
	if setting == nil {
		return errors.New("tags setting is required")
	}
	for tag, metadata := range setting.Tags {
		if strings.TrimSpace(tag) == "" {
			return errors.New("tag key cannot be empty")
		}
		if _, err := regexp.Compile(tag); err != nil {
			return errors.Errorf("tag key %q is not a valid regex pattern: %v", tag, err)
		}
		if metadata == nil {
			return errors.Errorf("tag metadata is required for %q", tag)
		}
		if metadata.GetBackgroundColor() != nil {
			if err := validateInstanceColor(metadata.GetBackgroundColor()); err != nil {
				return errors.Wrapf(err, "background_color for %q", tag)
			}
		}
	}
	return nil
}

func validateInstanceColor(color *colorpb.Color) error {
	if err := validateInstanceColorComponent("red", color.GetRed()); err != nil {
		return err
	}
	if err := validateInstanceColorComponent("green", color.GetGreen()); err != nil {
		return err
	}
	if err := validateInstanceColorComponent("blue", color.GetBlue()); err != nil {
		return err
	}
	if alpha := color.GetAlpha(); alpha != nil {
		if err := validateInstanceColorComponent("alpha", alpha.GetValue()); err != nil {
			return err
		}
	}
	return nil
}

func validateInstanceColorComponent(name string, value float32) error {
	if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
		return errors.Errorf("%s must be a finite number", name)
	}
	if value < 0 || value > 1 {
		return errors.Errorf("%s must be between 0 and 1", name)
	}
	return nil
}
