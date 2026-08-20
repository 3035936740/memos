package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateModerationReport(ctx context.Context, report *store.ModerationReport) (*store.ModerationReport, error) {
	err := d.db.QueryRowContext(ctx, `INSERT INTO moderation_report (creator_id, target_type, target_id, reason)
		VALUES (?, ?, ?, ?) RETURNING id, created_ts`, report.CreatorID, report.TargetType, report.TargetID, report.Reason).
		Scan(&report.ID, &report.CreatedTs)
	return report, err
}
func (d *DB) CountModerationReports(ctx context.Context, targetType store.ModerationTargetType, targetID int32) (int32, error) {
	var count int32
	err := d.db.QueryRowContext(ctx, `SELECT MAX(0, (SELECT COUNT(*) FROM moderation_report WHERE target_type = ? AND target_id = ?)
		+ COALESCE((SELECT adjustment FROM moderation_report_adjustment WHERE target_type = ? AND target_id = ?), 0))`, targetType, targetID, targetType, targetID).Scan(&count)
	return count, err
}

func (d *DB) SetModerationReportCount(ctx context.Context, targetType store.ModerationTargetType, targetID, count int32) error {
	var rawCount int32
	if err := d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM moderation_report WHERE target_type = ? AND target_id = ?`, targetType, targetID).Scan(&rawCount); err != nil {
		return err
	}
	_, err := d.db.ExecContext(ctx, `INSERT INTO moderation_report_adjustment(target_type,target_id,adjustment) VALUES(?,?,?)
		ON CONFLICT(target_type,target_id) DO UPDATE SET adjustment=excluded.adjustment,updated_ts=strftime('%s', 'now')`, targetType, targetID, count-rawCount)
	if err != nil {
		return err
	}
	_, err = d.db.ExecContext(ctx, `UPDATE moderation_quarantine SET report_count=? WHERE target_type=? AND target_id=?`, count, targetType, targetID)
	return err
}

func (d *DB) ListModerationReportSummaries(ctx context.Context, find *store.FindModerationReportSummary) ([]*store.ModerationReportSummary, int, error) {
	where, args := "", []any{}
	if find.TargetType != nil {
		where, args = " WHERE r.target_type = ?", append(args, *find.TargetType)
	}
	var total int
	if err := d.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM (SELECT 1 FROM moderation_report r"+where+" GROUP BY r.target_type, r.target_id)", args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	queryArgs := append(append([]any{}, args...), find.Limit, find.Offset)
	rows, err := d.db.QueryContext(ctx, `SELECT r.target_type, r.target_id, MAX(0, COUNT(*) + COALESCE(a.adjustment, 0)), MAX(r.created_ts), MAX(r.reason)
		FROM moderation_report r LEFT JOIN moderation_report_adjustment a ON a.target_type=r.target_type AND a.target_id=r.target_id`+where+`
		GROUP BY r.target_type, r.target_id, a.adjustment ORDER BY MAX(r.created_ts) DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []*store.ModerationReportSummary{}
	for rows.Next() {
		item := &store.ModerationReportSummary{}
		if err := rows.Scan(&item.TargetType, &item.TargetID, &item.Count, &item.LastTs, &item.Reason); err != nil {
			return nil, 0, err
		}
		result = append(result, item)
	}
	return result, total, rows.Err()
}

func (d *DB) UpsertModerationQuarantine(ctx context.Context, item *store.ModerationQuarantine) error {
	_, err := d.db.ExecContext(ctx, `INSERT INTO moderation_quarantine (target_type, target_id, report_count, reason)
		VALUES (?, ?, ?, ?) ON CONFLICT(target_type, target_id) DO UPDATE SET report_count = excluded.report_count, reason = excluded.reason`, item.TargetType, item.TargetID, item.ReportCount, item.Reason)
	return err
}

func (d *DB) ListModerationQuarantines(ctx context.Context, find *store.FindModerationQuarantine) ([]*store.ModerationQuarantine, int, error) {
	where, args := "", []any{}
	if find.TargetType != nil {
		where, args = " WHERE target_type = ?", append(args, *find.TargetType)
	}
	var total int
	if err := d.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM moderation_quarantine"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	queryArgs := append(append([]any{}, args...), find.Limit, find.Offset)
	rows, err := d.db.QueryContext(ctx, `SELECT id, created_ts, target_type, target_id, report_count, reason FROM moderation_quarantine`+where+` ORDER BY created_ts DESC, id DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []*store.ModerationQuarantine{}
	for rows.Next() {
		item := &store.ModerationQuarantine{}
		if err := rows.Scan(&item.ID, &item.CreatedTs, &item.TargetType, &item.TargetID, &item.ReportCount, &item.Reason); err != nil {
			return nil, 0, err
		}
		result = append(result, item)
	}
	return result, total, rows.Err()
}

func (d *DB) RestoreModerationTarget(ctx context.Context, targetType store.ModerationTargetType, targetID int32) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range []string{"moderation_report", "moderation_quarantine", "moderation_report_adjustment"} {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table+" WHERE target_type = ? AND target_id = ?", targetType, targetID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) GetModerationUserBan(ctx context.Context, userID int32) (*store.ModerationUserBan, error) {
	ban := &store.ModerationUserBan{}
	err := d.db.QueryRowContext(ctx, `SELECT user_id, created_ts, updated_ts, expires_ts, strike_count, source, active
		FROM moderation_user_ban WHERE user_id = ?`, userID).
		Scan(&ban.UserID, &ban.CreatedTs, &ban.UpdatedTs, &ban.ExpiresTs, &ban.StrikeCount, &ban.Source, &ban.Active)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return ban, err
}

func (d *DB) UpsertModerationUserBan(ctx context.Context, ban *store.ModerationUserBan) error {
	_, err := d.db.ExecContext(ctx, `INSERT INTO moderation_user_ban (user_id, expires_ts, strike_count, source, active)
		VALUES (?, ?, ?, ?, 1)
		ON CONFLICT(user_id) DO UPDATE SET updated_ts = strftime('%s', 'now'), expires_ts = excluded.expires_ts,
		strike_count = excluded.strike_count, source = excluded.source, active = 1`, ban.UserID, ban.ExpiresTs, ban.StrikeCount, ban.Source)
	return err
}

func (d *DB) ListExpiredModerationUserBanIDs(ctx context.Context, beforeTs int64, limit int) ([]int32, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT user_id FROM moderation_user_ban
		WHERE active = 1 AND expires_ts > 0 AND expires_ts <= ? ORDER BY expires_ts LIMIT ?`, beforeTs, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int32{}
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (d *DB) DeactivateModerationUserBan(ctx context.Context, userID int32) error {
	_, err := d.db.ExecContext(ctx, `UPDATE moderation_user_ban SET active = 0, updated_ts = strftime('%s', 'now') WHERE user_id = ?`, userID)
	return err
}

func (d *DB) UpsertMemoBookmark(ctx context.Context, userID, memoID int32) error {
	_, err := d.db.ExecContext(ctx, `INSERT INTO memo_bookmark (user_id, memo_id) VALUES (?, ?) ON CONFLICT(user_id, memo_id) DO NOTHING`, userID, memoID)
	return err
}

func (d *DB) ListMemoBookmarkIDs(ctx context.Context, userID int32, limit, offset int) ([]int32, int, error) {
	var total int
	if err := d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM memo_bookmark WHERE user_id = ?`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := d.db.QueryContext(ctx, `SELECT memo_id FROM memo_bookmark WHERE user_id = ? ORDER BY created_ts DESC LIMIT ? OFFSET ?`, userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ids := []int32{}
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	return ids, total, rows.Err()
}

func (d *DB) DeleteMemoBookmark(ctx context.Context, userID, memoID int32) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM memo_bookmark WHERE user_id = ? AND memo_id = ?`, userID, memoID)
	return err
}
func (d *DB) HasMemoBookmark(ctx context.Context, userID, memoID int32) (bool, error) {
	var one int
	err := d.db.QueryRowContext(ctx, `SELECT 1 FROM memo_bookmark WHERE user_id = ? AND memo_id = ?`, userID, memoID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
