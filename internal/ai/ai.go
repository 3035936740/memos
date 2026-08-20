package ai

// ProviderType identifies an AI provider implementation.
type ProviderType string

const (
	// ProviderOpenAI is OpenAI's hosted API.
	ProviderOpenAI ProviderType = "OPENAI"
	// ProviderGemini is Google's Gemini API.
	ProviderGemini ProviderType = "GEMINI"
	// ProviderAnthropic is Anthropic's Claude API.
	ProviderAnthropic ProviderType = "ANTHROPIC"
	// ProviderDeepSeek is DeepSeek's OpenAI-compatible API.
	ProviderDeepSeek ProviderType = "DEEPSEEK"
	// ProviderOpenAICompatible is a custom OpenAI-compatible endpoint.
	ProviderOpenAICompatible ProviderType = "OPENAI_COMPATIBLE"
	// ProviderOllama is an Ollama server exposing its OpenAI-compatible endpoint.
	ProviderOllama ProviderType = "OLLAMA"
)

// SupportsTranscription reports whether Memos has an audio transcription
// adapter for the provider protocol.
func SupportsTranscription(providerType ProviderType) bool {
	switch providerType {
	case ProviderOpenAI, ProviderGemini, ProviderOpenAICompatible:
		return true
	default:
		return false
	}
}

// ProviderConfig configures a callable AI provider connection.
type ProviderConfig struct {
	ID       string
	Title    string
	Type     ProviderType
	Endpoint string
	APIKey   string
}
