package mysql

import (
	"context"
	"database/sql"
	"errors"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateModerationReport(ctx context.Context, item *store.ModerationReport) (*store.ModerationReport, error) {
	result, err := d.db.ExecContext(ctx, `INSERT INTO moderation_report (creator_id,target_type,target_id,reason) VALUES (?,?,?,?)`, item.CreatorID, item.TargetType, item.TargetID, item.Reason)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	item.ID = int32(id)
	err = d.db.QueryRowContext(ctx, `SELECT created_ts FROM moderation_report WHERE id=?`, item.ID).Scan(&item.CreatedTs)
	return item, err
}
func (d *DB) CountModerationReports(ctx context.Context, targetType store.ModerationTargetType, targetID int32) (int32, error) {
	var count int32
	err := d.db.QueryRowContext(ctx, `SELECT GREATEST(0,(SELECT COUNT(*) FROM moderation_report WHERE target_type=? AND target_id=?)
		+ COALESCE((SELECT adjustment FROM moderation_report_adjustment WHERE target_type=? AND target_id=?),0))`, targetType, targetID, targetType, targetID).Scan(&count)
	return count, err
}
func (d *DB) SetModerationReportCount(ctx context.Context, targetType store.ModerationTargetType, targetID, count int32) error {
	var rawCount int32
	if err := d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM moderation_report WHERE target_type=? AND target_id=?`, targetType, targetID).Scan(&rawCount); err != nil {
		return err
	}
	_, err := d.db.ExecContext(ctx, `INSERT INTO moderation_report_adjustment(target_type,target_id,adjustment) VALUES(?,?,?)
		ON DUPLICATE KEY UPDATE adjustment=VALUES(adjustment),updated_ts=UNIX_TIMESTAMP()`, targetType, targetID, count-rawCount)
	if err != nil {
		return err
	}
	_, err = d.db.ExecContext(ctx, `UPDATE moderation_quarantine SET report_count=? WHERE target_type=? AND target_id=?`, count, targetType, targetID)
	return err
}
func (d *DB) ListModerationReportSummaries(ctx context.Context, find *store.FindModerationReportSummary) ([]*store.ModerationReportSummary, int, error) {
	where := ""
	args := []any{}
	if find.TargetType != nil {
		where = " WHERE r.target_type = ?"
		args = append(args, *find.TargetType)
	}
	var total int
	if err := d.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM (SELECT 1 FROM moderation_report r"+where+" GROUP BY r.target_type,r.target_id) x", args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	queryArgs := append(append([]any{}, args...), find.Limit, find.Offset)
	rows, err := d.db.QueryContext(ctx, `SELECT r.target_type,r.target_id,GREATEST(0,COUNT(*)+COALESCE(a.adjustment,0)),MAX(r.created_ts),MAX(r.reason)
		FROM moderation_report r LEFT JOIN moderation_report_adjustment a ON a.target_type=r.target_type AND a.target_id=r.target_id`+where+`
		GROUP BY r.target_type,r.target_id,a.adjustment ORDER BY MAX(r.created_ts) DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	list := []*store.ModerationReportSummary{}
	for rows.Next() {
		v := &store.ModerationReportSummary{}
		if err := rows.Scan(&v.TargetType, &v.TargetID, &v.Count, &v.LastTs, &v.Reason); err != nil {
			return nil, 0, err
		}
		list = append(list, v)
	}
	return list, total, rows.Err()
}
func (d *DB) UpsertModerationQuarantine(ctx context.Context, v *store.ModerationQuarantine) error {
	_, err := d.db.ExecContext(ctx, `INSERT INTO moderation_quarantine(target_type,target_id,report_count,reason) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE report_count=VALUES(report_count),reason=VALUES(reason)`, v.TargetType, v.TargetID, v.ReportCount, v.Reason)
	return err
}
func (d *DB) ListModerationQuarantines(ctx context.Context, find *store.FindModerationQuarantine) ([]*store.ModerationQuarantine, int, error) {
	where := ""
	args := []any{}
	if find.TargetType != nil {
		where = " WHERE target_type = ?"
		args = append(args, *find.TargetType)
	}
	var total int
	if err := d.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM moderation_quarantine"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	queryArgs := append(append([]any{}, args...), find.Limit, find.Offset)
	rows, err := d.db.QueryContext(ctx, `SELECT id,created_ts,target_type,target_id,report_count,reason FROM moderation_quarantine`+where+` ORDER BY created_ts DESC,id DESC LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	list := []*store.ModerationQuarantine{}
	for rows.Next() {
		v := &store.ModerationQuarantine{}
		if err := rows.Scan(&v.ID, &v.CreatedTs, &v.TargetType, &v.TargetID, &v.ReportCount, &v.Reason); err != nil {
			return nil, 0, err
		}
		list = append(list, v)
	}
	return list, total, rows.Err()
}
func (d *DB) RestoreModerationTarget(ctx context.Context, t store.ModerationTargetType, id int32) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, table := range []string{"moderation_report", "moderation_quarantine", "moderation_report_adjustment"} {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table+" WHERE target_type=? AND target_id=?", t, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (d *DB) GetModerationUserBan(ctx context.Context, userID int32) (*store.ModerationUserBan, error) {
	ban := &store.ModerationUserBan{}
	err := d.db.QueryRowContext(ctx, `SELECT user_id,created_ts,updated_ts,expires_ts,strike_count,source,active FROM moderation_user_ban WHERE user_id=?`, userID).
		Scan(&ban.UserID, &ban.CreatedTs, &ban.UpdatedTs, &ban.ExpiresTs, &ban.StrikeCount, &ban.Source, &ban.Active)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return ban, err
}
func (d *DB) UpsertModerationUserBan(ctx context.Context, ban *store.ModerationUserBan) error {
	_, err := d.db.ExecContext(ctx, `INSERT INTO moderation_user_ban(user_id,expires_ts,strike_count,source,active) VALUES(?,?,?,?,TRUE)
		ON DUPLICATE KEY UPDATE updated_ts=UNIX_TIMESTAMP(),expires_ts=VALUES(expires_ts),strike_count=VALUES(strike_count),source=VALUES(source),active=TRUE`, ban.UserID, ban.ExpiresTs, ban.StrikeCount, ban.Source)
	return err
}
func (d *DB) ListExpiredModerationUserBanIDs(ctx context.Context, beforeTs int64, limit int) ([]int32, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT user_id FROM moderation_user_ban WHERE active=TRUE AND expires_ts>0 AND expires_ts<=? ORDER BY expires_ts LIMIT ?`, beforeTs, limit)
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
	_, err := d.db.ExecContext(ctx, `UPDATE moderation_user_ban SET active=FALSE,updated_ts=UNIX_TIMESTAMP() WHERE user_id=?`, userID)
	return err
}
func (d *DB) UpsertMemoBookmark(ctx context.Context, u, m int32) error {
	_, err := d.db.ExecContext(ctx, `INSERT IGNORE INTO memo_bookmark(user_id,memo_id) VALUES(?,?)`, u, m)
	return err
}
func (d *DB) ListMemoBookmarkIDs(ctx context.Context, u int32, limit, offset int) ([]int32, int, error) {
	var total int
	if err := d.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM memo_bookmark WHERE user_id=?`, u).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := d.db.QueryContext(ctx, `SELECT memo_id FROM memo_bookmark WHERE user_id=? ORDER BY created_ts DESC LIMIT ? OFFSET ?`, u, limit, offset)
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
func (d *DB) DeleteMemoBookmark(ctx context.Context, u, m int32) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM memo_bookmark WHERE user_id=? AND memo_id=?`, u, m)
	return err
}
func (d *DB) HasMemoBookmark(ctx context.Context, u, m int32) (bool, error) {
	var one int
	err := d.db.QueryRowContext(ctx, `SELECT 1 FROM memo_bookmark WHERE user_id=? AND memo_id=?`, u, m).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
