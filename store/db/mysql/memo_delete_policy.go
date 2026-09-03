package mysql

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
		spaceExists, err = mysqlSpaceExists(ctx, tx, *spaceID)
		if err != nil {
			return nil, errors.Wrap(err, "failed to read memo space")
		}
	}
	if spaceID != nil && spaceExists {
		actorMember, err = mysqlSpaceMemberActive(ctx, tx, *spaceID, delete.ActorUserID)
		if err != nil {
			return nil, errors.Wrap(err, "failed to read memo membership")
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

	attachments, err := deleteMySQLMemoSetTx(ctx, tx, []int32{delete.MemoID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to delete memo set")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Wrap(err, "failed to commit memo delete transaction")
	}
	return &store.DeleteMemoWithPolicyResult{ActorCanRead: actorCanRead, Attachments: attachments}, nil
}
