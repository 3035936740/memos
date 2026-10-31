package v1

import (
	"slices"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// These IDs are also exposed by web/src/utils/easter-eggs.ts. Festival effects
// retain their existing setting; the master switch disables those too.
var easterEggIDs = []string{
	"konami", "cursor-trail", "terminal", "vim-navigation", "midnight", "glitch",
	"pixel-boss", "shiny-cards", "achievements", "rain", "cat", "travel", "birthday",
	"void", "teapot", "museum", "time-machine",
}

func normalizeDisabledEasterEggs(ids []string) ([]string, error) {
	if len(ids) > len(easterEggIDs) {
		return nil, status.Error(codes.InvalidArgument, "too many disabled Easter eggs")
	}
	for _, id := range ids {
		if !slices.Contains(easterEggIDs, id) {
			return nil, status.Error(codes.InvalidArgument, "unknown Easter egg ID")
		}
	}
	var result []string
	for _, id := range easterEggIDs {
		if slices.Contains(ids, id) {
			result = append(result, id)
		}
	}
	return result, nil
}
