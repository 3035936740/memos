package v1

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

type instanceMemoCategory struct {
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	MemoNames   []string `json:"memoNames,omitempty"`
	Access      string   `json:"access,omitempty"`
}

func parseInstanceMemoCategories(raw string) ([]instanceMemoCategory, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var categories []instanceMemoCategory
	if err := json.Unmarshal([]byte(raw), &categories); err != nil {
		return nil, errors.Wrap(err, "failed to parse memo categories json")
	}
	return categories, nil
}

func sanitizeInstanceMemoCategories(categories []instanceMemoCategory) []instanceMemoCategory {
	sanitized := make([]instanceMemoCategory, 0, len(categories))
	for _, category := range categories {
		slug := strings.TrimSpace(category.Slug)
		if slug == "" {
			continue
		}
		sanitized = append(sanitized, instanceMemoCategory{
			Slug:        slug,
			Title:       strings.TrimSpace(category.Title),
			Description: category.Description,
			Access:      category.Access,
		})
	}
	return sanitized
}

func encodeInstanceMemoCategories(categories []instanceMemoCategory) (string, error) {
	if len(categories) == 0 {
		return "[]", nil
	}
	bytes, err := json.Marshal(categories)
	if err != nil {
		return "", errors.Wrap(err, "failed to marshal memo categories json")
	}
	return string(bytes), nil
}

func categoriesHaveMemoNames(raw string) bool {
	categories, err := parseInstanceMemoCategories(raw)
	if err != nil {
		return false
	}
	for _, category := range categories {
		if len(category.MemoNames) > 0 {
			return true
		}
	}
	return false
}

func categorySlugSet(categories []instanceMemoCategory) map[string]struct{} {
	set := make(map[string]struct{}, len(categories))
	for _, category := range categories {
		if category.Slug == "" {
			continue
		}
		set[category.Slug] = struct{}{}
	}
	return set
}

func memoCategoryAllowsUser(category instanceMemoCategory, user *store.User) bool {
	switch strings.ToLower(strings.TrimSpace(category.Access)) {
	case "admin":
		return isSuperUser(user)
	case "authenticated":
		return user != nil
	default:
		return true
	}
}

func (s *APIV1Service) inaccessibleMemoCategories(ctx context.Context, user *store.User) (map[string]struct{}, error) {
	denied := map[string]struct{}{}
	if isSuperUser(user) {
		return denied, nil
	}
	general, err := s.Store.GetInstanceGeneralSetting(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get general setting")
	}
	categories, err := parseInstanceMemoCategories(general.GetMemoCategoriesJson())
	if err != nil {
		return nil, err
	}
	for _, category := range categories {
		if category.Slug != "" && !memoCategoryAllowsUser(category, user) {
			denied[category.Slug] = struct{}{}
		}
	}
	return denied, nil
}

func memoVisibleInCategories(memo *store.Memo, denied map[string]struct{}) bool {
	if memo == nil || memo.Payload == nil || memo.Payload.Category == "" {
		return true
	}
	_, blocked := denied[memo.Payload.Category]
	return !blocked
}

func (s *APIV1Service) normalizeMemoCategory(ctx context.Context, category string) (string, error) {
	category = strings.TrimSpace(category)
	if category == "" {
		return "", nil
	}
	general, err := s.Store.GetInstanceGeneralSetting(ctx)
	if err != nil {
		return "", status.Errorf(codes.Internal, "failed to get general setting: %v", err)
	}
	categories, err := parseInstanceMemoCategories(general.GetMemoCategoriesJson())
	if err != nil {
		return "", status.Errorf(codes.Internal, "failed to parse memo categories: %v", err)
	}
	for _, item := range categories {
		if item.Slug == category {
			user, err := s.fetchCurrentUser(ctx)
			if err != nil {
				return "", status.Errorf(codes.Internal, "failed to get current user")
			}
			if !memoCategoryAllowsUser(item, user) {
				return "", status.Errorf(codes.PermissionDenied, "memo category is not available")
			}
			return category, nil
		}
	}
	return "", status.Errorf(codes.InvalidArgument, "unknown memo category %q", category)
}

func (s *APIV1Service) setMemoCategoryByUID(ctx context.Context, memoUID string, category string) error {
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return errors.Wrap(err, "failed to get memo")
	}
	if memo == nil {
		return nil
	}
	if memo.Payload == nil {
		memo.Payload = &storepb.MemoPayload{}
	}
	if memo.Payload.Category == category {
		return nil
	}
	memo.Payload.Category = category
	return s.Store.UpdateMemo(ctx, &store.UpdateMemo{
		ID:      memo.ID,
		Payload: memo.Payload,
	})
}

func (s *APIV1Service) clearMemosInCategory(ctx context.Context, category string) error {
	category = strings.TrimSpace(category)
	if category == "" {
		return nil
	}
	filter := `category == ` + strconvQuote(category)
	memos, err := s.Store.ListMemos(ctx, &store.FindMemo{Filters: []string{filter}})
	if err != nil {
		return errors.Wrap(err, "failed to list memos by category")
	}
	for _, memo := range memos {
		if memo.Payload == nil || memo.Payload.Category == "" {
			continue
		}
		memo.Payload.Category = ""
		if err := s.Store.UpdateMemo(ctx, &store.UpdateMemo{ID: memo.ID, Payload: memo.Payload}); err != nil {
			return errors.Wrap(err, "failed to clear memo category")
		}
	}
	return nil
}

func strconvQuote(value string) string {
	bytes, err := json.Marshal(value)
	if err != nil {
		return `""`
	}
	return string(bytes)
}

// prepareMemoCategoriesForGeneralUpdate migrates legacy memoNames into memo.payload.category,
// clears categories removed by the admin, and strips memoNames from the stored JSON.
func (s *APIV1Service) prepareMemoCategoriesForGeneralUpdate(ctx context.Context, nextJSON string) (string, error) {
	existingGeneral, err := s.Store.GetInstanceGeneralSetting(ctx)
	if err != nil {
		return "", errors.Wrap(err, "failed to get existing general setting")
	}
	oldCategories, err := parseInstanceMemoCategories(existingGeneral.GetMemoCategoriesJson())
	if err != nil {
		return "", err
	}
	nextCategories, err := parseInstanceMemoCategories(nextJSON)
	if err != nil {
		return "", err
	}

	nextSlugSet := categorySlugSet(nextCategories)
	for _, oldCategory := range oldCategories {
		if _, keep := nextSlugSet[oldCategory.Slug]; keep {
			continue
		}
		if err := s.clearMemosInCategory(ctx, oldCategory.Slug); err != nil {
			return "", err
		}
	}

	// Migrate legacy admin-curated memoNames onto memo payloads before dropping them.
	for _, category := range nextCategories {
		for _, memoName := range category.MemoNames {
			memoUID, err := ExtractMemoUIDFromName(memoName)
			if err != nil {
				continue
			}
			if err := s.setMemoCategoryByUID(ctx, memoUID, category.Slug); err != nil {
				return "", err
			}
		}
	}
	for _, category := range oldCategories {
		if _, keep := nextSlugSet[category.Slug]; !keep {
			continue
		}
		for _, memoName := range category.MemoNames {
			memoUID, err := ExtractMemoUIDFromName(memoName)
			if err != nil {
				continue
			}
			if err := s.setMemoCategoryByUID(ctx, memoUID, category.Slug); err != nil {
				return "", err
			}
		}
	}

	return encodeInstanceMemoCategories(sanitizeInstanceMemoCategories(nextCategories))
}
