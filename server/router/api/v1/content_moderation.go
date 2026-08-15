package v1

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/labstack/echo/v5"
	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/httpgetter"
	"github.com/usememos/memos/store"
)

const (
	maxBlockedWordsSourceBytes = 30 << 20
	maxBlockedWordsCount       = 50_000
	maxBlockedWordRunes        = 128
	maxBlockedWordsSourceName  = 256
	maxBlockedWordsSourceURL   = 2048
)

var fetchBlockedWordsText = httpgetter.GetText

type contentModerationCache struct {
	mu      sync.RWMutex
	loaded  bool
	setting *store.InstanceBlockedWordsSetting
	matcher *blockedWordMatcher
}

type blockedWordNode struct {
	next   map[rune]int
	fail   int
	output bool
}

// blockedWordMatcher uses Aho-Corasick matching so a large imported word list
// does not turn every memo submission into words × content repeated scans.
type blockedWordMatcher struct {
	nodes []blockedWordNode
}

func newBlockedWordMatcher(words []string) *blockedWordMatcher {
	matcher := &blockedWordMatcher{nodes: []blockedWordNode{{next: map[rune]int{}}}}
	for _, word := range words {
		state := 0
		for _, r := range foldModerationText(word) {
			nextState, ok := matcher.nodes[state].next[r]
			if !ok {
				nextState = len(matcher.nodes)
				matcher.nodes[state].next[r] = nextState
				matcher.nodes = append(matcher.nodes, blockedWordNode{next: map[rune]int{}})
			}
			state = nextState
		}
		matcher.nodes[state].output = true
	}

	queue := make([]int, 0, len(matcher.nodes))
	for _, child := range matcher.nodes[0].next {
		queue = append(queue, child)
	}
	for head := 0; head < len(queue); head++ {
		state := queue[head]
		for r, child := range matcher.nodes[state].next {
			queue = append(queue, child)
			failure := matcher.nodes[state].fail
			for failure != 0 {
				if _, ok := matcher.nodes[failure].next[r]; ok {
					break
				}
				failure = matcher.nodes[failure].fail
			}
			if target, ok := matcher.nodes[failure].next[r]; ok && target != child {
				matcher.nodes[child].fail = target
			}
			if matcher.nodes[matcher.nodes[child].fail].output {
				matcher.nodes[child].output = true
			}
		}
	}
	return matcher
}

func (m *blockedWordMatcher) matches(content string) bool {
	if m == nil || len(m.nodes) <= 1 {
		return false
	}
	state := 0
	for _, r := range foldModerationText(content) {
		for state != 0 {
			if _, ok := m.nodes[state].next[r]; ok {
				break
			}
			state = m.nodes[state].fail
		}
		if nextState, ok := m.nodes[state].next[r]; ok {
			state = nextState
		}
		if m.nodes[state].output {
			return true
		}
	}
	return false
}

func foldModerationText(value string) string {
	return strings.ToLower(strings.Map(func(r rune) rune {
		switch r {
		case '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff':
			return -1
		default:
			return r
		}
	}, value))
}

func normalizeBlockedWords(content string) ([]string, error) {
	if len(content) > maxBlockedWordsSourceBytes {
		return nil, errors.Errorf("word list is too large; maximum size is %d MiB", maxBlockedWordsSourceBytes>>20)
	}
	if !utf8.ValidString(content) {
		return nil, errors.New("word list must be UTF-8 text")
	}

	parts := strings.FieldsFunc(strings.TrimPrefix(content, "\ufeff"), func(r rune) bool {
		switch r {
		case '\r', '\n', '\t', ',', '，', ';', '；':
			return true
		default:
			return false
		}
	})
	words := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		word := strings.TrimSpace(foldModerationText(part))
		if word == "" {
			continue
		}
		if utf8.RuneCountInString(word) > maxBlockedWordRunes {
			return nil, errors.Errorf("blocked word is too long; maximum length is %d characters", maxBlockedWordRunes)
		}
		if _, ok := seen[word]; ok {
			continue
		}
		seen[word] = struct{}{}
		words = append(words, word)
		if len(words) > maxBlockedWordsCount {
			return nil, errors.Errorf("too many blocked words; maximum count is %d", maxBlockedWordsCount)
		}
	}
	if len(words) == 0 {
		return nil, errors.New("word list is empty; use the clear button to disable moderation")
	}
	return words, nil
}

func (s *APIV1Service) getContentModerationSetting(ctx context.Context) (*store.InstanceBlockedWordsSetting, *blockedWordMatcher, error) {
	s.contentModeration.mu.RLock()
	if s.contentModeration.loaded {
		setting, matcher := s.contentModeration.setting, s.contentModeration.matcher
		s.contentModeration.mu.RUnlock()
		return setting, matcher, nil
	}
	s.contentModeration.mu.RUnlock()

	s.contentModeration.mu.Lock()
	defer s.contentModeration.mu.Unlock()
	if !s.contentModeration.loaded {
		setting, err := s.Store.GetInstanceBlockedWordsSetting(ctx)
		if err != nil {
			return nil, nil, err
		}
		s.contentModeration.setting = setting
		s.contentModeration.matcher = newBlockedWordMatcher(setting.Words)
		s.contentModeration.loaded = true
	}
	return s.contentModeration.setting, s.contentModeration.matcher, nil
}

func (s *APIV1Service) replaceContentModerationSetting(ctx context.Context, setting *store.InstanceBlockedWordsSetting) error {
	matcher := newBlockedWordMatcher(setting.Words)
	if err := s.Store.ReplaceInstanceBlockedWordsSetting(ctx, setting); err != nil {
		return err
	}
	s.contentModeration.mu.Lock()
	s.contentModeration.setting = setting
	s.contentModeration.matcher = matcher
	s.contentModeration.loaded = true
	s.contentModeration.mu.Unlock()
	return nil
}

func (s *APIV1Service) clearContentModerationSetting(ctx context.Context) error {
	if err := s.Store.ClearInstanceBlockedWordsSetting(ctx); err != nil {
		return err
	}
	empty := &store.InstanceBlockedWordsSetting{Words: []string{}}
	s.contentModeration.mu.Lock()
	s.contentModeration.setting = empty
	s.contentModeration.matcher = newBlockedWordMatcher(nil)
	s.contentModeration.loaded = true
	s.contentModeration.mu.Unlock()
	return nil
}

func (s *APIV1Service) validateMemoContentAgainstBlockedWords(ctx context.Context, content string) error {
	_, matcher, err := s.getContentModerationSetting(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to load content moderation setting")
	}
	if matcher.matches(content) {
		return status.Error(codes.InvalidArgument, "content contains a blocked word")
	}
	return nil
}

type replaceBlockedWordsRequest struct {
	Content    string `json:"content"`
	SourceType string `json:"sourceType"`
	SourceName string `json:"sourceName"`
}

type importBlockedWordsURLRequest struct {
	URL string `json:"url"`
}

type blockedWordsResponse struct {
	Count      int    `json:"count"`
	SourceType string `json:"sourceType,omitempty"`
	SourceName string `json:"sourceName,omitempty"`
	SourceURL  string `json:"sourceUrl,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
}

func toBlockedWordsResponse(setting *store.InstanceBlockedWordsSetting) blockedWordsResponse {
	return blockedWordsResponse{
		Count:      len(setting.Words),
		SourceType: setting.SourceType,
		SourceName: setting.SourceName,
		SourceURL:  setting.SourceURL,
		UpdatedAt:  setting.UpdatedAt,
	}
}

func decodeModerationJSON(c *echo.Context, value any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(c.Response(), c.Request().Body, maxBlockedWordsSourceBytes*2))
	decoder.DisallowUnknownFields()
	return decoder.Decode(value)
}

func (s *APIV1Service) authenticateModerationAdmin(c *echo.Context, authorizer *Authorizer) (*store.User, int, error) {
	ctx := c.Request().Context()
	result := authorizer.Authenticate(ctx, c.Request().Header.Get("Authorization"))
	if result == nil {
		return nil, http.StatusUnauthorized, errors.New("authentication required")
	}
	var userID int32
	if result.User != nil {
		userID = result.User.ID
	} else if result.Claims != nil {
		userID = result.Claims.UserID
	}
	if userID == 0 {
		return nil, http.StatusUnauthorized, errors.New("authentication required")
	}
	user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("failed to load user")
	}
	if user == nil || user.RowStatus == store.Archived {
		return nil, http.StatusUnauthorized, errors.New("authentication required")
	}
	if user.Role != store.RoleAdmin {
		return nil, http.StatusForbidden, errors.New("administrator permission required")
	}
	return user, 0, nil
}

func moderationError(c *echo.Context, statusCode int, err error) error {
	return c.JSON(statusCode, map[string]string{"error": err.Error()})
}

// RegisterContentModerationRoutes registers admin-only JSON endpoints. Keeping
// these endpoints separate from public instance settings prevents the word list
// from being serialized to ordinary clients.
func RegisterContentModerationRoutes(router *echo.Group, service *APIV1Service, authorizer *Authorizer) {
	const route = "/api/v1/admin/blocked-words"

	router.GET(route, func(c *echo.Context) error {
		if _, statusCode, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, statusCode, err)
		}
		setting, _, err := service.getContentModerationSetting(c.Request().Context())
		if err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to load blocked words"))
		}
		return c.JSON(http.StatusOK, toBlockedWordsResponse(setting))
	})

	router.PUT(route, func(c *echo.Context) error {
		if _, statusCode, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, statusCode, err)
		}
		request := &replaceBlockedWordsRequest{}
		if err := decodeModerationJSON(c, request); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		words, err := normalizeBlockedWords(request.Content)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, err)
		}
		sourceType := strings.TrimSpace(request.SourceType)
		if sourceType != "file" {
			sourceType = "manual"
		}
		sourceName := strings.TrimSpace(request.SourceName)
		if len(sourceName) > maxBlockedWordsSourceName {
			return moderationError(c, http.StatusBadRequest, errors.New("source name is too long"))
		}
		setting := &store.InstanceBlockedWordsSetting{
			Words:      words,
			SourceType: sourceType,
			SourceName: sourceName,
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}
		if err := service.replaceContentModerationSetting(c.Request().Context(), setting); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to replace blocked words"))
		}
		return c.JSON(http.StatusOK, toBlockedWordsResponse(setting))
	})

	router.POST(route+"/import", func(c *echo.Context) error {
		if _, statusCode, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, statusCode, err)
		}
		request := &importBlockedWordsURLRequest{}
		if err := decodeModerationJSON(c, request); err != nil {
			return moderationError(c, http.StatusBadRequest, errors.New("invalid request body"))
		}
		sourceURL := strings.TrimSpace(request.URL)
		if sourceURL == "" || len(sourceURL) > maxBlockedWordsSourceURL {
			return moderationError(c, http.StatusBadRequest, errors.New("valid source URL is required"))
		}
		content, err := fetchBlockedWordsText(sourceURL, maxBlockedWordsSourceBytes)
		if err != nil {
			return moderationError(c, http.StatusBadRequest, errors.Wrap(err, "failed to download word list"))
		}
		words, err := normalizeBlockedWords(string(content))
		if err != nil {
			return moderationError(c, http.StatusBadRequest, err)
		}
		setting := &store.InstanceBlockedWordsSetting{
			Words:      words,
			SourceType: "url",
			SourceURL:  sourceURL,
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}
		if err := service.replaceContentModerationSetting(c.Request().Context(), setting); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to replace blocked words"))
		}
		return c.JSON(http.StatusOK, toBlockedWordsResponse(setting))
	})

	router.DELETE(route, func(c *echo.Context) error {
		if _, statusCode, err := service.authenticateModerationAdmin(c, authorizer); err != nil {
			return moderationError(c, statusCode, err)
		}
		if err := service.clearContentModerationSetting(c.Request().Context()); err != nil {
			return moderationError(c, http.StatusInternalServerError, errors.New("failed to clear blocked words"))
		}
		return c.JSON(http.StatusOK, toBlockedWordsResponse(&store.InstanceBlockedWordsSetting{Words: []string{}}))
	})
}
