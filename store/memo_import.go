package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"time"

	"github.com/pkg/errors"
)

type MemoImportRecord struct {
	Source, SourceID, JobID string
	CreatedTs, UpdatedTs    int64
}

func importHash(s string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(s))) }

// RecordMemoImport runs inside the memo transaction. The unique key prevents
// duplicates even after crashes, retrying jobs, or simultaneous application nodes.
func RecordMemoImport(ctx context.Context, tx SQLExecutor, driver string, m *MemoMutation) error {
	if m.ImportRecord == nil {
		return nil
	}
	r := m.ImportRecord
	if m.MemoCreate == nil || r.Source == "" || r.SourceID == "" || r.JobID == "" {
		return errors.New("invalid memo import mutation")
	}
	// Recheck administration in the write transaction so a removed/demoted
	// administrator cannot finish publishing a stale queued import.
	var role Role
	if err := tx.QueryRowContext(ctx, BindSQL(driver, "SELECT role FROM `user` WHERE id=? AND row_status='NORMAL'"), m.MemoCreatorID).Scan(&role); err != nil {
		return errors.Wrap(err, "check import administrator")
	}
	if role != RoleAdmin {
		if m.MemoCreate.SpaceID == nil {
			return ErrMemoPermissionDenied
		}
		var count int
		if err := tx.QueryRowContext(ctx, BindSQL(driver, `SELECT COUNT(*) FROM space_member WHERE space_id=? AND user_id=? AND role='ADMIN'`), *m.MemoCreate.SpaceID, m.MemoCreatorID).Scan(&count); err != nil {
			return errors.Wrap(err, "check Space import administrator")
		}
		if count != 1 {
			return ErrMemoPermissionDenied
		}
	}
	query := `UPDATE memo SET created_ts=?,updated_ts=? WHERE id=? AND creator_id=?`
	if driver == "mysql" {
		if r.CreatedTs <= 0 || r.UpdatedTs <= 0 || r.CreatedTs > 2147483647 || r.UpdatedTs > 2147483647 {
			return errors.New("article date is outside MySQL TIMESTAMP range")
		}
		query = `UPDATE memo SET created_ts=FROM_UNIXTIME(?),updated_ts=FROM_UNIXTIME(?) WHERE id=? AND creator_id=?`
	}
	if _, err := tx.ExecContext(ctx, BindSQL(driver, query), r.CreatedTs, r.UpdatedTs, m.MemoID, m.MemoCreatorID); err != nil {
		return errors.Wrap(err, "preserve original import timestamps")
	}
	m.MemoCreate.CreatedTs = r.CreatedTs
	m.MemoCreate.UpdatedTs = r.UpdatedTs
	_, err := tx.ExecContext(ctx, BindSQL(driver, `INSERT INTO memo_import_record (user_id,source_hash,source_id_hash,source,source_id,memo_id,job_id,created_ts) VALUES (?,?,?,?,?,?,?,?)`), m.MemoCreatorID, importHash(r.Source), importHash(r.SourceID), r.Source, r.SourceID, m.MemoID, r.JobID, time.Now().Unix())
	return errors.Wrap(err, "record memo import")
}
func (s *Store) IsMemoImported(ctx context.Context, userID int32, source, id string) (bool, error) {
	var n int
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT 1 FROM memo_import_record WHERE user_id=? AND source_hash=? AND source_id_hash=?`), userID, importHash(source), importHash(id)).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, errors.Wrap(err, "find imported article")
}

type MemoImportJob struct {
	ID              string `json:"id"`
	UserID          int32  `json:"-"`
	State           string `json:"state"`
	Source          string `json:"source"`
	Report          string `json:"-"`
	CreatedTs       int64  `json:"createdTs"`
	UpdatedTs       int64  `json:"updatedTs"`
	CancelRequested bool   `json:"cancelRequested"`
}

func (s *Store) CreateMemoImportJob(ctx context.Context, j *MemoImportJob) error {
	tx, err := s.driver.GetDB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Workers refresh their lease even during long image/AI reviews. Only stale
	// jobs are recovered, so starting a second node cannot cancel a live import.
	if _, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE memo_import_job SET state='interrupted' WHERE state='running' AND updated_ts<?`), time.Now().Add(-5*time.Minute).Unix()); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM memo_import_lock WHERE job_id IN (SELECT id FROM memo_import_job WHERE state<>'running')`); err != nil {
		return err
	}
	// The lock is durable, not a process-local mutex. Only the worker releases it.
	if _, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `INSERT INTO memo_import_lock (user_id,job_id) VALUES (?,?)`), j.UserID, j.ID); err != nil {
		return errors.Wrap(err, "another import is active")
	}
	_, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `INSERT INTO memo_import_job (id,user_id,state,source,report,created_ts,updated_ts) VALUES (?,?,?,?,?,?,?)`), j.ID, j.UserID, j.State, j.Source, j.Report, j.CreatedTs, j.UpdatedTs)
	if err != nil {
		return errors.Wrap(err, "create import job")
	}
	return tx.Commit()
}
func (s *Store) GetMemoImportJob(ctx context.Context, userID int32, id string) (*MemoImportJob, error) {
	j := &MemoImportJob{}
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT id,user_id,state,source,report,created_ts,updated_ts,cancel_requested FROM memo_import_job WHERE id=? AND user_id=?`), id, userID).Scan(&j.ID, &j.UserID, &j.State, &j.Source, &j.Report, &j.CreatedTs, &j.UpdatedTs, &j.CancelRequested)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return j, errors.Wrap(err, "get import job")
}
func (s *Store) SaveMemoImportJob(ctx context.Context, j *MemoImportJob, finished bool) error {
	tx, err := s.driver.GetDB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE memo_import_job SET state=?,report=?,updated_ts=? WHERE id=? AND user_id=?`), j.State, j.Report, time.Now().Unix(), j.ID, j.UserID)
	if err != nil {
		return err
	}
	if finished {
		if _, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `DELETE FROM memo_import_lock WHERE user_id=? AND job_id=?`), j.UserID, j.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) CancelMemoImport(ctx context.Context, userID int32, id string) error {
	_, err := s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE memo_import_job SET cancel_requested=1 WHERE id=? AND user_id=? AND state='running'`), id, userID)
	return errors.Wrap(err, "cancel import")
}

// HeartbeatMemoImport keeps a running job lease alive during AI/image processing.
func (s *Store) HeartbeatMemoImport(ctx context.Context, id string) error {
	_, err := s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE memo_import_job SET updated_ts=? WHERE id=? AND state='running'`), time.Now().Unix(), id)
	return err
}
