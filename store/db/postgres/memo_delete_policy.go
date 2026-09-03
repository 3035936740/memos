package postgres

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
	if err := tx.QueryRowContext(ctx, `SELECT row_status, role FROM "user" WHERE id = $1`, delete.ActorUserID).Scan(&actorStatus, &actorRole); errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrMemoPermissionDenied
	} else if err != nil {
		return nil, errors.Wrap(err, "failed to read memo deletion actor")
	} else if actorStatus != store.Normal {
		return nil, store.ErrMemoPermissionDenied
	}

	var creatorID int32
	var rowStatus store.RowStatus
	var visibility store.Visibility
	var memoSpace sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT creator_id, row_status, visibility, space_id FROM memo WHERE id = $1`, delete.MemoID).Scan(
		&creatorID, &rowStatus, &visibility, &memoSpace,
	); errors.Is(err, sql.ErrNoRows) {
		return nil, store.ErrMemoMutationConflict
	} else if err != nil {
		return nil, errors.Wrap(err, "failed to read memo")
	}
	memoSpaceID := store.NullInt32Pointer(memoSpace)
	spaceExists, actorMember := false, false
	if memoSpaceID != nil {
		spaceExists, actorMember, _, err = readPostgresMemoSpaceState(ctx, tx, *memoSpaceID, delete.ActorUserID)
		if err != nil {
			return nil, errors.Wrap(err, "failed to read memo space state")
		}
	}
	if creatorID != delete.ActorUserID {
		allowed := delete.AdminOverride && actorRole == store.RoleAdmin
		if !allowed && delete.AdminOverride && memoSpaceID != nil && spaceExists {
			var role store.SpaceMemberRole
			err = tx.QueryRowContext(ctx, `SELECT role FROM space_member
				WHERE space_id = $1 AND user_id = $2 AND status = 'ACTIVE' AND role IN ('ADMIN', 'USER')`, *memoSpaceID, delete.ActorUserID).Scan(&role)
			allowed = err == nil && role == store.SpaceMemberRoleAdmin
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return nil, errors.Wrap(err, "failed to read memo space administrator")
			}
		}
		if !allowed {
			return nil, store.ErrMemoPermissionDenied
		}
	}
	actorCanRead := store.MemoDeleteActorCanRead(rowStatus, visibility, memoSpaceID, spaceExists, actorMember)

	attachments, err := deletePostgresMemoSetTx(ctx, tx, []int32{delete.MemoID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to delete memo set")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Wrap(err, "failed to commit memo delete transaction")
	}
	return &store.DeleteMemoWithPolicyResult{ActorCanRead: actorCanRead, Attachments: attachments}, nil
}
