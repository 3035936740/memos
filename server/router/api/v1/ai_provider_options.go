package v1

import (
	"maps"
	"net/http"
	"regexp"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/proto"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
)

var aiHeaderNamePattern = regexp.MustCompile("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
var azureAPIVersionPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}(-preview)?$`)

func mergeAIHeaders(defaults, custom map[string]string) map[string]string {
	result := make(map[string]string, len(defaults)+len(custom))
	for name, value := range defaults {
		result[http.CanonicalHeaderKey(name)] = value
	}
	for name, value := range custom {
		result[http.CanonicalHeaderKey(name)] = value
	}
	return result
}

func prepareAIProviderOptions(provider, existing *storepb.AIProviderConfig) error {
	provider.DefaultModel = strings.TrimSpace(provider.DefaultModel)
	if len(provider.DefaultModel) > 256 || strings.ContainsAny(provider.DefaultModel, "\r\n") {
		return errors.New("default model must not exceed 256 characters or contain line breaks")
	}
	provider.ReasoningEffort = strings.TrimSpace(provider.ReasoningEffort)
	switch provider.ReasoningEffort {
	case "", "none", "minimal", "low", "medium", "high", "xhigh":
	default:
		return errors.New("unsupported reasoning effort")
	}
	if provider.ReasoningEffort != "" && (provider.Type == storepb.AIProviderType_GEMINI || provider.Type == storepb.AIProviderType_ANTHROPIC || provider.Type == storepb.AIProviderType_JEV) {
		return errors.New("reasoning effort requires an OpenAI-compatible provider")
	}
	provider.AzureApiVersion = strings.TrimSpace(provider.AzureApiVersion)
	if provider.AzureApiVersion != "" && (provider.Type != storepb.AIProviderType_AZURE_OPENAI || !azureAPIVersionPattern.MatchString(provider.AzureApiVersion)) {
		return errors.New("Azure API version must be YYYY-MM-DD or YYYY-MM-DD-preview on an Azure provider")
	}
	if provider.Type == storepb.AIProviderType_AZURE_OPENAI && provider.DefaultModel == "" {
		return errors.New("Azure deployment name is required")
	}
	if !provider.ReplaceCustomHeaders && len(provider.CustomHeaders) == 0 {
		provider.CustomHeaders = maps.Clone(existing.GetCustomHeaders())
	}
	if len(provider.CustomHeaders) > 20 {
		return errors.New("at most 20 custom headers are allowed")
	}
	headers := make(map[string]string, len(provider.CustomHeaders))
	for name, value := range provider.CustomHeaders {
		if len(name) > 128 || !aiHeaderNamePattern.MatchString(name) {
			return errors.New("invalid custom header name")
		}
		key := http.CanonicalHeaderKey(name)
		switch key {
		case "Host", "Connection", "Content-Length", "Transfer-Encoding", "Upgrade", "Trailer", "Proxy-Authorization", "Proxy-Connection":
			return errors.Errorf("custom header %q is not supported", key)
		}
		if _, duplicate := headers[key]; duplicate {
			return errors.New("duplicate custom header names")
		}
		if value == "" {
			for oldKey, oldValue := range existing.GetCustomHeaders() {
				if strings.EqualFold(oldKey, key) {
					value = oldValue
					break
				}
			}
		}
		if len(value) == 0 || len(value) > 8192 || strings.ContainsAny(value, "\r\n\x00") {
			return errors.New("custom header value is required, limited to 8192 bytes, and cannot contain line breaks")
		}
		headers[key] = value
	}
	provider.CustomHeaders = headers
	provider.ReplaceCustomHeaders = false
	return nil
}

func convertTextGenerationConfigFromStore(config *storepb.TextGenerationConfig) *v1pb.InstanceSetting_TextGenerationConfig {
	if config == nil {
		return nil
	}
	return &v1pb.InstanceSetting_TextGenerationConfig{Enabled: config.Enabled, PlanningProviderId: config.PlanningProviderId, PlanningModel: config.PlanningModel, GenerationProviderId: config.GenerationProviderId, GenerationModel: config.GenerationModel}
}

func convertTextGenerationConfigToStore(config *v1pb.InstanceSetting_TextGenerationConfig) *storepb.TextGenerationConfig {
	if config == nil {
		return nil
	}
	return &storepb.TextGenerationConfig{Enabled: config.Enabled, PlanningProviderId: config.PlanningProviderId, PlanningModel: config.PlanningModel, GenerationProviderId: config.GenerationProviderId, GenerationModel: config.GenerationModel}
}

func prepareTextGenerationConfig(setting, existing *storepb.InstanceAISetting) error {
	if setting.TextGeneration == nil {
		setting.TextGeneration = proto.CloneOf(existing.GetTextGeneration())
	}
	config := setting.TextGeneration
	if config == nil {
		return nil
	}
	config.PlanningProviderId = strings.TrimSpace(config.PlanningProviderId)
	config.GenerationProviderId = strings.TrimSpace(config.GenerationProviderId)
	config.PlanningModel = strings.TrimSpace(config.PlanningModel)
	config.GenerationModel = strings.TrimSpace(config.GenerationModel)
	if len(config.PlanningModel) > 256 || len(config.GenerationModel) > 256 {
		return errors.New("workflow model ID must not exceed 256 characters")
	}
	if !config.Enabled {
		return nil
	}
	for _, id := range []string{config.PlanningProviderId, config.GenerationProviderId} {
		found := false
		for _, provider := range setting.Providers {
			if id != "" && provider.Id == id && provider.WritingEnabled && provider.Type != storepb.AIProviderType_JEV {
				found = true
				break
			}
		}
		if !found {
			return errors.New("planning and generation providers must be enabled for writing")
		}
	}
	return nil
}
