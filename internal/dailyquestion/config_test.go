package dailyquestion

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestQuestionLocalesMatchInterfaceCatalog(t *testing.T) {
	raw, err := os.ReadFile("../../web/src/locale-codes.json")
	require.NoError(t, err)
	var locales []string
	require.NoError(t, json.Unmarshal(raw, &locales))
	require.ElementsMatch(t, locales, supportedQuestionLocales)
	translations := make(map[string]string, len(locales))
	for _, locale := range locales {
		translations[locale] = " translation-" + locale + " "
	}
	for _, locale := range locales {
		raw, err := json.Marshal([]Question{{Text: "question", Locale: locale, Translations: translations}})
		require.NoError(t, err)
		canonical, texts, err := NormalizeQuestions(string(raw))
		require.NoError(t, err, locale)
		var questions []Question
		require.NoError(t, json.Unmarshal([]byte(canonical), &questions))
		require.Len(t, questions[0].Translations, len(locales))
		for _, translationLocale := range locales {
			require.Equal(t, "translation-"+translationLocale, questions[0].Translations[translationLocale])
			require.Contains(t, texts, "translation-"+translationLocale)
		}
	}
}

func TestSeedFormatAndUniqueness(t *testing.T) {
	a, err := NewSeed()
	require.NoError(t, err)
	b, err := NewSeed()
	require.NoError(t, err)
	require.Regexp(t, `^[0-9a-f]{16}$`, a)
	require.NotEqual(t, a, b)
	for _, seed := range []string{"", "abc_DEF-123", strings.Repeat("x", 64)} {
		require.NoError(t, ValidateSeed(seed))
	}
	for _, seed := range []string{"space here", "../seed", "种子", "line\nbreak", strings.Repeat("x", 65)} {
		require.Error(t, ValidateSeed(seed))
	}
}
func TestQuestionNormalization(t *testing.T) {
	canonical, questions, err := NormalizeQuestions(`[" question ","", "  ","question","第二题"]`)
	require.NoError(t, err)
	require.Equal(t, []string{"question", "第二题"}, questions)
	require.Equal(t, `["question","第二题"]`, canonical)
	for _, input := range []string{"", `[]`, `[" ",""]`} {
		value, _, e := NormalizeQuestions(input)
		require.NoError(t, e)
		require.Empty(t, value)
	}
	for _, input := range []string{`null`, `{}`, `"question"`, `[null]`, `[1]`, `[true]`, `[["nested"]]`, `["valid",{}]`, `["unterminated]`} {
		_, _, e := NormalizeQuestions(input)
		require.Error(t, e, input)
	}
	chinese := strings.Repeat("问", 200)
	raw, _ := json.Marshal([]string{chinese})
	_, _, err = NormalizeQuestions(string(raw))
	require.NoError(t, err)
	raw, _ = json.Marshal([]string{chinese + "问"})
	_, _, err = NormalizeQuestions(string(raw))
	require.Error(t, err)
	bank := make([]string, MaxQuestions)
	for i := range bank {
		bank[i] = fmt.Sprintf("question-%d", i)
	}
	raw, _ = json.Marshal(bank)
	_, _, err = NormalizeQuestions(string(raw))
	require.NoError(t, err)
	raw, _ = json.Marshal(append(bank, "one too many"))
	_, _, err = NormalizeQuestions(string(raw))
	require.Error(t, err)
	_, _, err = NormalizeQuestions(strings.Repeat(" ", MaxJSONBytes+1))
	require.Error(t, err)
}

func TestMultilingualQuestionBank(t *testing.T) {
	value, texts, err := NormalizeQuestions(`[{"builtin":0},{"builtin":364},{"builtin":0},{"text":" Hello? ","locale":"en","translations":{"zh-Hans":" 今天好吗？ ","zh-Hant":" 今天好嗎？ "}}," Legacy? "]`)
	require.NoError(t, err)
	require.JSONEq(t, `[{"builtin":0},{"builtin":364},{"text":"Hello?","locale":"en","translations":{"zh-Hans":"今天好吗？","zh-Hant":"今天好嗎？"}},"Legacy?"]`, value)
	require.Equal(t, []string{"Hello?", "今天好吗？", "今天好嗎？", "Legacy?"}, texts)
	for _, invalid := range []string{
		`[{"builtin":-1}]`, `[{"builtin":365}]`, `[{"builtin":1.5}]`, `[{"builtin":"1"}]`,
		`[{"builtin":1,"text":"ignored"}]`, `[{"text":"q","locale":"invalid"}]`,
		`[{"text":"q","translations":{"en":1}}]`, `[{"text":"q","translations":{"invalid":"x"}}]`,
		`[{"text":"","translations":{"en":"lost text"}}]`, `[{"text":"q","unknown":"ignored"}]`,
	} {
		_, _, err = NormalizeQuestions(invalid)
		require.Error(t, err, invalid)
	}
	tooLong, err := json.Marshal([]Question{{Text: "short", Translations: map[string]string{"en": strings.Repeat("x", 201)}}})
	require.NoError(t, err)
	_, _, err = NormalizeQuestions(string(tooLong))
	require.Error(t, err)
}
