package sqlite

import (
	"context"
	"database/sql"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

func (d *DB) DeleteMemoWithPolicy(ctx context.Context, delete *store.DeleteMemoWithPolicy) (*store.DeleteMemoWithPolicyResult, error) {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, errors.Wrap(err, "failed to begin memo delete transaction")
	}
	defer func() { _ = tx.Rollback() }()

	var actorStatus store.RowStatus
	var actorRole store.Role
	if err := tx.QueryRowContext(ctx, "SELECT row_status, role FROM user WHERE id = ?", delete.ActorUserID).Scan(&actorStatus, &actorRole); errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrMemoPermissionDenied
	} else if err != nil {
		return nil, errors.Wrap(err, "failed to read memo deletion actor")
	} else if actorStatus != store.Normal {
		return nil, store.ErrMemoPermissionDenied
	}
	var creatorID int32
	var rowStatus store.RowStatus
	var visibility store.Visibility
	var space sql.NullInt64
	if err := tx.QueryRowContext(ctx, "SELECT creator_id, row_status, visibility, space_id FROM memo WHERE id = ?", delete.MemoID).Scan(
		&creatorID, &rowStatus, &visibility, &space,
	); errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrMemoMutationConflict
	} else if err != nil {
		return nil, errors.Wrap(err, "failed to read memo")
	}
	spaceID := store.NullInt32Pointer(space)
	spaceExists := false
	actorMember := false
	if spaceID != nil {
		var existingSpaceID int32
		if err := tx.QueryRowContext(ctx, "SELECT id FROM space WHERE id = ?", *spaceID).Scan(&existingSpaceID); err == nil {
			spaceExists = true
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, errors.Wrap(err, "failed to read memo space")
		}
		if spaceExists {
			actorMember, err = sqliteSpaceMemberActive(ctx, tx, *spaceID, delete.ActorUserID)
			if err != nil {
				return nil, errors.Wrap(err, "failed to read memo membership")
			}
		}
	}
	if creatorID != delete.ActorUserID {
		allowed := delete.AdminOverride && actorRole == store.RoleAdmin
		if !allowed && delete.AdminOverride && spaceID != nil && spaceExists {
			var role store.SpaceMemberRole
			err = tx.QueryRowContext(ctx, `SELECT role FROM space_member
				WHERE space_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('ADMIN', 'USER')`, *spaceID, delete.ActorUserID).Scan(&role)
			allowed = err == nil && role == store.SpaceMemberRoleAdmin
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return nil, errors.Wrap(err, "failed to read memo space administrator")
			}
		}
		if !allowed {
			return nil, store.ErrMemoPermissionDenied
		}
	}
	actorCanRead := store.MemoDeleteActorCanRead(rowStatus, visibility, spaceID, spaceExists, actorMember)

	if delete.RequireDeleted {
		var deleted sql.NullInt64
		if err := tx.QueryRowContext(ctx, store.BindSQL("sqlite", "SELECT deleted_ts FROM memo WHERE id=?"), delete.MemoID).Scan(&deleted); err != nil {
			return nil, err
		}
		if !deleted.Valid {
			return nil, store.ErrMemoMutationConflict
		}
	}
	if delete.DeletedTs != nil {
		if err := store.SoftDeleteMemoSet(ctx, tx, "sqlite", delete.MemoID, *delete.DeletedTs); err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return &store.DeleteMemoWithPolicyResult{ActorCanRead: actorCanRead}, nil
	}
	memoIDs := []int32{delete.MemoID}
	if delete.RequireDeleted {
		memoIDs, err = store.MemoCommentTree(ctx, tx, "sqlite", delete.MemoID)
		if err != nil {
			return nil, err
		}
	}
	attachments, err := deleteSQLiteMemoSetTx(ctx, tx, memoIDs)
	if err != nil {
		return nil, errors.Wrap(err, "failed to delete memo set")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Wrap(err, "failed to commit memo delete transaction")
	}
	return &store.DeleteMemoWithPolicyResult{ActorCanRead: actorCanRead, Attachments: attachments}, nil
}

// PurgeDeletedMemo is reserved for the expiration runner; interactive purges use DeleteMemoWithPolicy.
func (d *DB) PurgeDeletedMemo(ctx context.Context, id int32) (*store.DeleteMemoWithPolicyResult, error) {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var deleted sql.NullInt64
	query := "SELECT deleted_ts FROM memo WHERE id=?"

	if err := tx.QueryRowContext(ctx, store.BindSQL("sqlite", query), id).Scan(&deleted); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &store.DeleteMemoWithPolicyResult{}, nil
		}
		return nil, err
	}
	if !deleted.Valid {
		return nil, store.ErrMemoMutationConflict
	}
	ids, err := store.MemoCommentTree(ctx, tx, "sqlite", id)
	if err != nil {
		return nil, err
	}
	attachments, err := deleteSQLiteMemoSetTx(ctx, tx, ids)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &store.DeleteMemoWithPolicyResult{Attachments: attachments}, nil
}
