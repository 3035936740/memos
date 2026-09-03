package mysql

import (
	"context"
	"database/sql"
	stderrors "errors"

	"github.com/usememos/memos/store"
)

func validateMySQLMemoWritePolicy(ctx context.Context, tx *sql.Tx, memoID int32, policy *store.MemoWritePolicy, update *store.UpdateMemo) error {
	var actorStatus store.RowStatus
	var actorRole store.Role
	if err := tx.QueryRowContext(ctx, "SELECT row_status, role FROM user WHERE id = ?", policy.ActorUserID).Scan(&actorStatus, &actorRole); stderrors.Is(err, sql.ErrNoRows) {
		return store.ErrMemoSpaceMembershipRequired
	} else if err != nil {
		return err
	} else if actorStatus != store.Normal {
		return store.ErrMemoSpaceMembershipRequired
	}

	snapshot := new(store.MemoWriteSnapshot)
	snapshot.ActorInstanceAdmin = actorRole == store.RoleAdmin
	var spaceID sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT creator_id, row_status, space_id, visibility FROM memo WHERE id = ?`, memoID).Scan(
		&snapshot.CreatorID, &snapshot.RowStatus, &spaceID, &snapshot.Visibility,
	); err != nil {
		if stderrors.Is(err, sql.ErrNoRows) {
			return store.ErrMemoMutationConflict
		}
		return err
	}
	snapshot.SpaceID = store.NullInt32Pointer(spaceID)
	if snapshot.SpaceID != nil {
		var err error
		snapshot.SourceSpaceExists, snapshot.SourceMemberActive, snapshot.SourceMemberAdmin, snapshot.SourceSpaceAccessMode, err = mysqlMemoPolicySpaceStateWithRole(ctx, tx, *snapshot.SpaceID, policy.ActorUserID)
		if err != nil {
			return err
		}
	}
	if update != nil && update.SpaceID != nil {
		var err error
		snapshot.TargetSpaceExists, snapshot.TargetMemberActive, _, snapshot.TargetSpaceAccessMode, err = mysqlMemoPolicySpaceStateWithRole(ctx, tx, *update.SpaceID, policy.ActorUserID)
		if err != nil {
			return err
		}
	}

	if update != nil && update.Visibility != nil && *update.Visibility == store.SpaceAudience {
		var shareID int32
		err := tx.QueryRowContext(ctx, `SELECT id FROM memo_share
			WHERE memo_id = ? AND (expires_ts IS NULL OR expires_ts > UNIX_TIMESTAMP())
			LIMIT 1`, memoID).Scan(&shareID)
		snapshot.HasActiveShare = err == nil
		if err != nil && !stderrors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return store.ValidateMemoWriteSnapshot(policy, update, snapshot)
}

func mysqlMemoPolicySpaceState(ctx context.Context, tx *sql.Tx, spaceID, actorUserID int32) (bool, bool, store.SpaceAccessMode, error) {
	exists, member, _, accessMode, err := mysqlMemoPolicySpaceStateWithRole(ctx, tx, spaceID, actorUserID)
	return exists, member, accessMode, err
}

func mysqlMemoPolicySpaceStateWithRole(ctx context.Context, tx *sql.Tx, spaceID, actorUserID int32) (bool, bool, bool, store.SpaceAccessMode, error) {
	var accessMode store.SpaceAccessMode
	if err := tx.QueryRowContext(ctx, "SELECT access_mode FROM space WHERE id = ?", spaceID).Scan(&accessMode); stderrors.Is(err, sql.ErrNoRows) {
		return false, false, false, "", nil
	} else if err != nil {
		return false, false, false, "", err
	}
	var role store.SpaceMemberRole
	err := tx.QueryRowContext(ctx, `SELECT role FROM space_member
		WHERE space_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('ADMIN', 'USER')`, spaceID, actorUserID).Scan(&role)
	if stderrors.Is(err, sql.ErrNoRows) {
		return true, false, false, accessMode, nil
	}
	if err != nil {
		return false, false, false, "", err
	}
	return true, role.IsActiveMember(), role == store.SpaceMemberRoleAdmin, accessMode, nil
}

func mysqlSpaceExists(ctx context.Context, tx *sql.Tx, spaceID int32) (bool, error) {
	var exists bool
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM space WHERE id = ?)", spaceID).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}
