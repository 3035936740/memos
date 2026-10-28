// Package dailyquestion validates the public configuration of daily writing prompts.
package dailyquestion

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"math"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/pkg/errors"
)

const (
	MaxJSONBytes         = 256 << 10
	MaxQuestions         = 2000
	MaxQuestionRunes     = 200
	BuiltinQuestionCount = 365
)

// NewSeed generates a public per-instance seed from eight cryptographically random bytes.
func NewSeed() (string, error) {
	var data [8]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", errors.Wrap(err, "generate daily question seed")
	}
	return hex.EncodeToString(data[:]), nil
}

// ValidateSeed allows an empty request value, which the storage layer regenerates.
func ValidateSeed(seed string) error {
	if seed == "" {
		return nil
	}
	if len(seed) > 64 {
		return errors.New("daily_question_seed is invalid: use 1–64 ASCII letters, digits, underscores or hyphens")
	}
	for _, c := range seed {
		if (c < 'A' || c > 'Z') && (c < 'a' || c > 'z') && (c < '0' || c > '9') && c != '_' && c != '-' {
			return errors.New("daily_question_seed is invalid: use 1–64 ASCII letters, digits, underscores or hyphens")
		}
	}
	return nil
}

// Question preserves a built-in question by index, or a custom question with
// optional translations. Plain strings remain supported for existing clients.
type Question struct {
	Builtin      *int              `json:"builtin,omitempty"`
	Text         string            `json:"text,omitempty"`
	Locale       string            `json:"locale,omitempty"`
	Translations map[string]string `json:"translations,omitempty"`
}

func validLocale(locale string) bool {
	return locale == "" || slices.Contains(supportedQuestionLocales, locale)
}

func normalizeQuestion(value any, index int) (any, []string, error) {
	if text, ok := value.(string); ok {
		text = strings.TrimSpace(text)
		if utf8.RuneCountInString(text) > MaxQuestionRunes {
			return nil, nil, errors.Errorf("daily_questions_json question %d exceeds 200 characters", index+1)
		}
		if text == "" {
			return nil, nil, nil
		}
		return text, []string{text}, nil
	}
	fields, ok := value.(map[string]any)
	if !ok {
		return nil, nil, errors.Errorf("daily_questions_json question %d must be a string or question object", index+1)
	}
	if builtin, exists := fields["builtin"]; exists {
		number, ok := builtin.(float64)
		if !ok || math.Trunc(number) != number || number < 0 || number >= BuiltinQuestionCount || len(fields) != 1 {
			return nil, nil, errors.Errorf("daily_questions_json question %d has an invalid built-in index", index+1)
		}
		id := int(number)
		return Question{Builtin: &id}, nil, nil
	}
	for key := range fields {
		if key != "text" && key != "locale" && key != "translations" {
			return nil, nil, errors.Errorf("daily_questions_json question %d has an unknown field", index+1)
		}
	}
	text, ok := fields["text"].(string)
	if !ok {
		return nil, nil, errors.Errorf("daily_questions_json question %d requires text", index+1)
	}
	normalized, moderation, err := normalizeQuestion(text, index)
	if err != nil {
		return nil, nil, err
	}
	question := Question{}
	if normalized != nil {
		question.Text = strings.TrimSpace(text)
	}
	if rawLocale, exists := fields["locale"]; exists {
		locale, ok := rawLocale.(string)
		if !ok || !validLocale(locale) {
			return nil, nil, errors.Errorf("daily_questions_json question %d has an invalid locale", index+1)
		}
		question.Locale = locale
	}
	if rawTranslations, exists := fields["translations"]; exists {
		translations, ok := rawTranslations.(map[string]any)
		if !ok {
			return nil, nil, errors.Errorf("daily_questions_json question %d translations must be an object", index+1)
		}
		for locale := range translations {
			if locale == "" || !validLocale(locale) {
				return nil, nil, errors.Errorf("daily_questions_json question %d has an invalid translation locale", index+1)
			}
		}
		question.Translations = map[string]string{}
		for _, locale := range supportedQuestionLocales {
			raw, exists := translations[locale]
			if !exists {
				continue
			}
			translation, ok := raw.(string)
			if !ok {
				return nil, nil, errors.Errorf("daily_questions_json question %d translation must be a string", index+1)
			}
			clean, texts, err := normalizeQuestion(translation, index)
			if err != nil {
				return nil, nil, err
			}
			if clean != nil {
				question.Translations[locale] = strings.TrimSpace(translation)
				moderation = append(moderation, texts...)
			}
		}
	}
	if question.Text == "" {
		if len(question.Translations) > 0 {
			return nil, nil, errors.Errorf("daily_questions_json question %d requires fallback text", index+1)
		}
		return nil, nil, nil
	}
	if question.Locale == "" && len(question.Translations) == 0 {
		return question.Text, moderation, nil
	}
	return question, moderation, nil
}

// NormalizeQuestions bounds, trims and deduplicates the question bank. The
// second return value contains ALL custom text and translations for moderation.
// Built-in references contain no administrator-supplied text to moderate.
func NormalizeQuestions(raw string) (string, []string, error) {
	if len(raw) > MaxJSONBytes {
		return "", nil, errors.New("daily_questions_json exceeds 256 KiB")
	}
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", nil, nil
	}
	if trimmed[0] != '[' {
		return "", nil, errors.New("daily_questions_json must be a JSON question array")
	}
	var input []any
	if err := json.Unmarshal([]byte(trimmed), &input); err != nil {
		return "", nil, errors.Wrap(err, "daily_questions_json must be a JSON question array")
	}
	if len(input) > MaxQuestions {
		return "", nil, errors.New("daily_questions_json cannot contain more than 2000 questions")
	}
	questions := make([]any, 0, len(input))
	var moderation []string
	seen := make(map[string]struct{}, len(input))
	for index, value := range input {
		question, texts, err := normalizeQuestion(value, index)
		if err != nil {
			return "", nil, err
		}
		if question == nil {
			continue
		}
		key, err := json.Marshal(question)
		if err != nil {
			return "", nil, err
		}
		if _, exists := seen[string(key)]; exists {
			continue
		}
		seen[string(key)] = struct{}{}
		questions = append(questions, question)
		moderation = append(moderation, texts...)
	}
	if len(questions) == 0 {
		return "", nil, nil
	}
	value, err := json.Marshal(questions)
	if err != nil {
		return "", nil, errors.Wrap(err, "encode daily question bank")
	}
	if len(value) > MaxJSONBytes {
		return "", nil, errors.New("normalized daily_questions_json exceeds 256 KiB")
	}
	return string(value), moderation, nil
}
