package ai

import "testing"

func TestSupportsTranscription(t *testing.T) {
	tests := []struct {
		provider ProviderType
		want     bool
	}{
		{ProviderOpenAI, true},
		{ProviderGemini, true},
		{ProviderOpenAICompatible, true},
		{ProviderAnthropic, false},
		{ProviderDeepSeek, false},
		{ProviderOllama, false},
	}
	for _, test := range tests {
		t.Run(string(test.provider), func(t *testing.T) {
			if got := SupportsTranscription(test.provider); got != test.want {
				t.Fatalf("SupportsTranscription(%q) = %v, want %v", test.provider, got, test.want)
			}
		})
	}
}
