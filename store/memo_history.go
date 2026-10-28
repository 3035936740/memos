package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/usememos/memos/proto/gen/store"
)

// SQLExecutor is the transaction-capable database surface used by shared lifecycle helpers.
type SQLExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// MemoRevision is a private historical snapshot, never returned to ordinary readers.
type MemoRevision struct {
	ID         int64
	MemoID     int32
	EditorID   int32
	SavedBy    int32
	CreatedTs  int64
	Content    string
	Payload    string
	Visibility Visibility
}

// MemoRevisionMergeWindow bounds coalescing to the start of a save session.
const MemoRevisionMergeWindow = 10 * time.Minute

// CaptureMemoRevision is called inside the same transaction as the content write.
func CaptureMemoRevision(ctx context.Context, tx SQLExecutor, driver string, update *UpdateMemo) error {
	if update.RevisionLimit == nil || update.Policy == nil || (update.Content == nil && update.Payload == nil) {
		return nil
	}
	var content, payload string
	var visibility Visibility
	var editor int32
	query := `SELECT content, payload, visibility, COALESCE(last_editor_id, creator_id) FROM memo WHERE id=? AND deleted_ts IS NULL`
	if driver != "sqlite" {
		query += " FOR UPDATE"
	}
	if err := tx.QueryRowContext(ctx, BindSQL(driver, query), update.ID).Scan(&content, &payload, &visibility, &editor); err != nil {
		return err
	}
	old := &storepb.MemoPayload{}
	if err := protojson.Unmarshal([]byte(payload), old); err != nil {
		return errors.Wrap(err, "cannot read historical memo payload")
	}
	changed := (update.Content != nil && *update.Content != content) || (update.Payload != nil && update.Payload.GetProperty().GetTitle() != old.GetProperty().GetTitle())
	if !changed {
		return nil
	}
	limit := max(0, min(*update.RevisionLimit, 200))
	nowSec := time.Now().Unix()
	var lastBy int32
	var lastTime int64
	err := tx.QueryRowContext(ctx, BindSQL(driver, `SELECT saved_by, created_ts FROM memo_revision WHERE memo_id=? ORDER BY id DESC LIMIT 1`), update.ID).Scan(&lastBy, &lastTime)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	coalesce := err == nil && lastBy == update.Policy.ActorUserID && nowSec-lastTime < int64(MemoRevisionMergeWindow.Seconds())
	if limit > 0 && (!coalesce || update.RevisionForce) {
		if _, err := tx.ExecContext(ctx, BindSQL(driver, `INSERT INTO memo_revision(memo_id,editor_id,saved_by,created_ts,content,payload,visibility) VALUES (?,?,?,?,?,?,?)`), update.ID, editor, update.Policy.ActorUserID, nowSec, content, payload, visibility); err != nil {
			return err
		}
	}
	// Delete by a bounded id threshold; MySQL cannot delete from a table while
	// selecting it in the same nested DELETE without an extra derived table.
	offset := limit
	if limit > 0 {
		var cutoff int64
		err := tx.QueryRowContext(ctx, BindSQL(driver, `SELECT id FROM memo_revision WHERE memo_id=? ORDER BY id DESC LIMIT 1 OFFSET ?`), update.ID, offset).Scan(&cutoff)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil {
			if _, err := tx.ExecContext(ctx, BindSQL(driver, `DELETE FROM memo_revision WHERE memo_id=? AND id<=?`), update.ID, cutoff); err != nil {
				return err
			}
		}
	}
	_, err = tx.ExecContext(ctx, BindSQL(driver, `UPDATE memo SET last_editor_id=? WHERE id=? AND deleted_ts IS NULL`), update.Policy.ActorUserID, update.ID)
	return err
}

// ListMemoRevisions returns bounded snapshots for an already-authorized memo manager.
func (s *Store) ListMemoRevisions(ctx context.Context, memoID int32) ([]*MemoRevision, error) {
	return s.queryMemoRevisions(ctx, memoID, false)
}

// ListMemoRevisionPreviews reads only 100 characters, never historical payloads or full bodies.
func (s *Store) ListMemoRevisionPreviews(ctx context.Context, memoID int32) ([]*MemoRevision, error) {
	return s.queryMemoRevisions(ctx, memoID, true)
}

func (s *Store) queryMemoRevisions(ctx context.Context, memoID int32, previews bool) ([]*MemoRevision, error) {
	columns := "content,payload"
	if previews {
		columns = "SUBSTR(content,1,100),'{}'"
	}
	rows, err := s.driver.GetDB().QueryContext(ctx, BindSQL(s.profile.Driver, `SELECT id,memo_id,editor_id,saved_by,created_ts,`+columns+`,visibility FROM memo_revision WHERE memo_id=? ORDER BY id DESC LIMIT 200`), memoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []*MemoRevision{}
	for rows.Next() {
		r := &MemoRevision{}
		if err := rows.Scan(&r.ID, &r.MemoID, &r.EditorID, &r.SavedBy, &r.CreatedTs, &r.Content, &r.Payload, &r.Visibility); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// GetMemoRevision scopes the lookup to its parent memo, preventing cross-memo id access.
func (s *Store) GetMemoRevision(ctx context.Context, memoID int32, id int64) (*MemoRevision, error) {
	r := &MemoRevision{}
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT id,memo_id,editor_id,saved_by,created_ts,content,payload,visibility FROM memo_revision WHERE memo_id=? AND id=?`), memoID, id).Scan(&r.ID, &r.MemoID, &r.EditorID, &r.SavedBy, &r.CreatedTs, &r.Content, &r.Payload, &r.Visibility)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

// DeleteMemoRevisions deletes a single version, or all versions when id is zero.
func (s *Store) DeleteMemoRevisions(ctx context.Context, memoID int32, id int64) error {
	query := `DELETE FROM memo_revision WHERE memo_id=?`
	args := []any{memoID}
	if id != 0 {
		query += ` AND id=?`
		args = append(args, id)
	}
	_, err := s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, query), args...)
	return err
}

// DeleteMemoSetRevisions removes history in every hard-deletion path.
func DeleteMemoSetRevisions(ctx context.Context, tx SQLExecutor, driver string, ids []int32) error {
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, BindSQL(driver, `DELETE FROM memo_revision WHERE memo_id=?`), id); err != nil {
			return err
		}
	}
	return nil
}

// MemoCommentTree follows COMMENT ownership only; references never confer deletion authority.
func MemoCommentTree(ctx context.Context, tx SQLExecutor, driver string, id int32) ([]int32, error) {
	result := []int32{id}
	seen := map[int32]bool{id: true}
	for i := 0; i < len(result); i++ {
		children, err := queryCommentChildren(ctx, tx, driver, result[i])
		if err != nil {
			return nil, err
		}
		for _, child := range children {
			if !seen[child] {
				seen[child] = true
				result = append(result, child)
			}
		}
	}
	return result, nil
}

func queryCommentChildren(ctx context.Context, tx SQLExecutor, driver string, id int32) ([]int32, error) {
	rows, err := tx.QueryContext(ctx, BindSQL(driver, `SELECT memo_id FROM memo_relation WHERE related_memo_id=? AND type='COMMENT'`), id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	children := []int32{}
	for rows.Next() {
		var child int32
		if err := rows.Scan(&child); err != nil {
			return nil, err
		}
		children = append(children, child)
	}
	return children, rows.Err()
}

// SoftDeleteMemoSet marks a memo and its live comments with one deletion batch id.
func SoftDeleteMemoSet(ctx context.Context, tx SQLExecutor, driver string, id int32, at int64) error {
	ids, err := MemoCommentTree(ctx, tx, driver, id)
	if err != nil {
		return err
	}
	for _, target := range ids {
		if _, err := tx.ExecContext(ctx, BindSQL(driver, `UPDATE memo SET deleted_ts=? WHERE id=? AND deleted_ts IS NULL`), at, target); err != nil {
			return err
		}
	}
	return nil
}

// RestoreDeletedMemo restores only comments that shared the exact deletion batch.
func (s *Store) RestoreDeletedMemo(ctx context.Context, id int32, actorID int32, admin bool) error {
	tx, err := s.driver.GetDB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var actorRole Role
	var actorStatus RowStatus
	if err := tx.QueryRowContext(ctx, BindSQL(s.profile.Driver, "SELECT role,row_status FROM `user` WHERE id=?"), actorID).Scan(&actorRole, &actorStatus); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrMemoPermissionDenied
		}
		return err
	}
	if actorStatus != Normal {
		return ErrMemoPermissionDenied
	}
	admin = admin && actorRole == RoleAdmin
	var creator int32
	var at sql.NullInt64
	query := `SELECT creator_id,deleted_ts FROM memo WHERE id=?`
	if s.profile.Driver != "sqlite" {
		query += " FOR UPDATE"
	}
	if err := tx.QueryRowContext(ctx, BindSQL(s.profile.Driver, query), id).Scan(&creator, &at); err != nil {
		return err
	}
	if creator != actorID && !admin {
		return ErrMemoPermissionDenied
	}
	if !at.Valid {
		return ErrMemoMutationConflict
	}
	// A comment's parent must still exist and be outside trash.
	var unavailable int
	if err := tx.QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT COUNT(*) FROM memo_relation r LEFT JOIN memo p ON p.id=r.related_memo_id WHERE r.memo_id=? AND r.type='COMMENT' AND (p.id IS NULL OR p.deleted_ts IS NOT NULL)`), id).Scan(&unavailable); err != nil {
		return err
	}
	if unavailable > 0 {
		return ErrMemoMutationConflict
	}
	ids, err := MemoCommentTree(ctx, tx, s.profile.Driver, id)
	if err != nil {
		return err
	}
	for _, target := range ids {
		if _, err := tx.ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE memo SET deleted_ts=NULL WHERE id=? AND deleted_ts=?`), target, at.Int64); err != nil {
			return err
		}
	}
	return tx.Commit()
}
