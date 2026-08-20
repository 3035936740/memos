package store

import "context"

type ModerationTargetType string

const (
	ModerationTargetArticle ModerationTargetType = "ARTICLE"
	ModerationTargetComment ModerationTargetType = "COMMENT"
	ModerationTargetUser    ModerationTargetType = "USER"
)

type ModerationReport struct {
	ID         int32
	CreatedTs  int64
	CreatorID  int32
	TargetType ModerationTargetType
	TargetID   int32
	Reason     string
}

type ModerationReportSummary struct {
	TargetType ModerationTargetType
	TargetID   int32
	Count      int32
	LastTs     int64
	Reason     string
}

type FindModerationReportSummary struct {
	TargetType *ModerationTargetType
	Limit      int
	Offset     int
}

type ModerationQuarantine struct {
	ID          int32
	CreatedTs   int64
	TargetType  ModerationTargetType
	TargetID    int32
	ReportCount int32
	Reason      string
}

type FindModerationQuarantine struct {
	TargetType *ModerationTargetType
	Limit      int
	Offset     int
}

type ModerationUserBan struct {
	UserID      int32
	CreatedTs   int64
	UpdatedTs   int64
	ExpiresTs   int64
	StrikeCount int32
	Source      string
	Active      bool
}

func (s *Store) CreateModerationReport(ctx context.Context, report *ModerationReport) (*ModerationReport, error) {
	return s.driver.CreateModerationReport(ctx, report)
}

func (s *Store) CountModerationReports(ctx context.Context, targetType ModerationTargetType, targetID int32) (int32, error) {
	return s.driver.CountModerationReports(ctx, targetType, targetID)
}

func (s *Store) SetModerationReportCount(ctx context.Context, targetType ModerationTargetType, targetID, count int32) error {
	return s.driver.SetModerationReportCount(ctx, targetType, targetID, count)
}

func (s *Store) ListModerationReportSummaries(ctx context.Context, find *FindModerationReportSummary) ([]*ModerationReportSummary, int, error) {
	return s.driver.ListModerationReportSummaries(ctx, find)
}

func (s *Store) UpsertModerationQuarantine(ctx context.Context, quarantine *ModerationQuarantine) error {
	return s.driver.UpsertModerationQuarantine(ctx, quarantine)
}

func (s *Store) ListModerationQuarantines(ctx context.Context, find *FindModerationQuarantine) ([]*ModerationQuarantine, int, error) {
	return s.driver.ListModerationQuarantines(ctx, find)
}

func (s *Store) RestoreModerationTarget(ctx context.Context, targetType ModerationTargetType, targetID int32) error {
	return s.driver.RestoreModerationTarget(ctx, targetType, targetID)
}

func (s *Store) GetModerationUserBan(ctx context.Context, userID int32) (*ModerationUserBan, error) {
	return s.driver.GetModerationUserBan(ctx, userID)
}

func (s *Store) UpsertModerationUserBan(ctx context.Context, ban *ModerationUserBan) error {
	return s.driver.UpsertModerationUserBan(ctx, ban)
}

func (s *Store) ListExpiredModerationUserBanIDs(ctx context.Context, beforeTs int64, limit int) ([]int32, error) {
	return s.driver.ListExpiredModerationUserBanIDs(ctx, beforeTs, limit)
}

func (s *Store) DeactivateModerationUserBan(ctx context.Context, userID int32) error {
	return s.driver.DeactivateModerationUserBan(ctx, userID)
}

func (s *Store) UpsertMemoBookmark(ctx context.Context, userID, memoID int32) error {
	return s.driver.UpsertMemoBookmark(ctx, userID, memoID)
}

func (s *Store) ListMemoBookmarkIDs(ctx context.Context, userID int32, limit, offset int) ([]int32, int, error) {
	return s.driver.ListMemoBookmarkIDs(ctx, userID, limit, offset)
}

func (s *Store) DeleteMemoBookmark(ctx context.Context, userID, memoID int32) error {
	return s.driver.DeleteMemoBookmark(ctx, userID, memoID)
}

func (s *Store) HasMemoBookmark(ctx context.Context, userID, memoID int32) (bool, error) {
	return s.driver.HasMemoBookmark(ctx, userID, memoID)
}
