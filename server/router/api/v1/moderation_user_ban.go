package v1

import (
	"context"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

const maxModerationBanDays int64 = 36500

// resolveModerationUserReference accepts both the legacy numeric database ID
// and the public username/resource-name forms used by the current User API.
func (s *APIV1Service) resolveModerationUserReference(ctx context.Context, reference string) (*store.User, error) {
	reference = strings.TrimSpace(reference)
	if reference == "" {
		return nil, errors.New("empty user reference")
	}

	if userID64, err := strconv.ParseInt(reference, 10, 32); err == nil {
		userID := int32(userID64)
		user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
		if err != nil || user != nil {
			return user, err
		}
	}

	username := strings.TrimPrefix(reference, UserNamePrefix)
	if username == "" || strings.Contains(username, "/") {
		return nil, errors.New("invalid user reference")
	}
	return s.Store.GetUser(ctx, &store.FindUser{Username: &username})
}

func scaledAutomaticBanDays(initialDays int32, strikeCount int32) int64 {
	days := int64(initialDays)
	if days < 1 {
		days = 30
	}
	for strike := int32(1); strike < strikeCount && days < maxModerationBanDays; strike++ {
		if days > maxModerationBanDays/2 {
			days = maxModerationBanDays
		} else {
			days *= 2
		}
	}
	if days > maxModerationBanDays {
		return maxModerationBanDays
	}
	return days
}

func (s *APIV1Service) banModerationUser(ctx context.Context, user *store.User, days *int32, source string, reportCount int32, reason string) (*store.ModerationUserBan, error) {
	if user == nil {
		return nil, errors.New("user not found")
	}
	existing, err := s.Store.GetModerationUserBan(ctx, user.ID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to load user ban")
	}
	strikeCount := int32(0)
	if existing != nil {
		strikeCount = existing.StrikeCount
	}
	expiresTs := int64(0)
	if source == "AUTO" {
		strikeCount++
		initialDays := int32(30)
		if days != nil {
			initialDays = *days
		}
		expiresTs = time.Now().Add(time.Duration(scaledAutomaticBanDays(initialDays, strikeCount)) * 24 * time.Hour).Unix()
	} else if days != nil {
		expiresTs = time.Now().Add(time.Duration(*days) * 24 * time.Hour).Unix()
	}

	archived := store.Archived
	if _, err := s.Store.UpdateUser(ctx, &store.UpdateUser{ID: user.ID, RowStatus: &archived}); err != nil {
		return nil, errors.Wrap(err, "failed to archive user")
	}
	ban := &store.ModerationUserBan{UserID: user.ID, ExpiresTs: expiresTs, StrikeCount: strikeCount, Source: source, Active: true}
	if err := s.Store.UpsertModerationUserBan(ctx, ban); err != nil {
		if user.RowStatus != store.Archived {
			normal := store.Normal
			_, _ = s.Store.UpdateUser(ctx, &store.UpdateUser{ID: user.ID, RowStatus: &normal})
		}
		return nil, errors.Wrap(err, "failed to save user ban")
	}
	if err := s.Store.UpsertModerationQuarantine(ctx, &store.ModerationQuarantine{
		TargetType:  store.ModerationTargetUser,
		TargetID:    user.ID,
		ReportCount: reportCount,
		Reason:      reason,
	}); err != nil {
		return nil, errors.Wrap(err, "failed to save user quarantine")
	}
	return s.Store.GetModerationUserBan(ctx, user.ID)
}

func (s *APIV1Service) restoreModerationUser(ctx context.Context, userID int32) error {
	normal := store.Normal
	if _, err := s.Store.UpdateUser(ctx, &store.UpdateUser{ID: userID, RowStatus: &normal}); err != nil {
		return errors.Wrap(err, "failed to restore user")
	}
	if err := s.Store.DeactivateModerationUserBan(ctx, userID); err != nil {
		return errors.Wrap(err, "failed to deactivate user ban")
	}
	if err := s.Store.RestoreModerationTarget(ctx, store.ModerationTargetUser, userID); err != nil {
		return errors.Wrap(err, "failed to clear user moderation state")
	}
	return nil
}

// ReleaseExpiredUserBans restores temporary bans. It is safe to run repeatedly.
func (s *APIV1Service) ReleaseExpiredUserBans(ctx context.Context) {
	for {
		ids, err := s.Store.ListExpiredModerationUserBanIDs(ctx, time.Now().Unix(), 100)
		if err != nil {
			slog.Error("failed to list expired user bans", slog.String("error", err.Error()))
			return
		}
		if len(ids) == 0 {
			return
		}
		for _, userID := range ids {
			if err := s.restoreModerationUser(ctx, userID); err != nil {
				slog.Error("failed to release expired user ban", slog.Int("userID", int(userID)), slog.String("error", err.Error()))
			}
		}
		if len(ids) < 100 {
			return
		}
	}
}
