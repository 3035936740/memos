package sqlite

import (
	"context"
	"database/sql"
	stderrors "errors"

	"github.com/usememos/memos/store"
)

func validateSQLiteMemoWritePolicy(ctx context.Context, executor dbExecutor, memoID int32, policy *store.MemoWritePolicy, update *store.UpdateMemo) error {
	var actorStatus store.RowStatus
	var actorRole store.Role
	if err := executor.QueryRowContext(ctx, "SELECT row_status, role FROM user WHERE id = ?", policy.ActorUserID).Scan(&actorStatus, &actorRole); stderrors.Is(err, sql.ErrNoRows) {
		return store.ErrMemoSpaceMembershipRequired
	} else if err != nil {
		return err
	} else if actorStatus != store.Normal {
		return store.ErrMemoSpaceMembershipRequired
	}

	snapshot := new(store.MemoWriteSnapshot)
	snapshot.ActorInstanceAdmin = actorRole == store.RoleAdmin
	var spaceID sql.NullInt64
	if err := executor.QueryRowContext(ctx, `SELECT creator_id, row_status, space_id, visibility FROM memo WHERE id = ?`, memoID).Scan(
		&snapshot.CreatorID, &snapshot.RowStatus, &spaceID, &snapshot.Visibility,
	); err != nil {
		if stderrors.Is(err, sql.ErrNoRows) {
			return store.ErrMemoMutationConflict
		}
		return err
	}
	snapshot.SpaceID = store.NullInt32Pointer(spaceID)
	if err := populateSQLiteMemoPolicySpaceState(ctx, executor, policy.ActorUserID, update, snapshot); err != nil {
		return err
	}

	if update != nil && update.Visibility != nil && *update.Visibility == store.SpaceAudience {
		var shareID int32
		err := executor.QueryRowContext(ctx, `SELECT id FROM memo_share
			WHERE memo_id = ? AND (expires_ts IS NULL OR expires_ts > CAST(strftime('%s', 'now') AS INTEGER))
			LIMIT 1`, memoID).Scan(&shareID)
		snapshot.HasActiveShare = err == nil
		if err != nil && !stderrors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return store.ValidateMemoWriteSnapshot(policy, update, snapshot)
}

func populateSQLiteMemoPolicySpaceState(
	ctx context.Context,
	executor dbExecutor,
	actorUserID int32,
	update *store.UpdateMemo,
	snapshot *store.MemoWriteSnapshot,
) error {
	if snapshot.SpaceID != nil {
		exists, member, memberAdmin, accessMode, err := sqliteMemoPolicySpaceStateWithRole(ctx, executor, *snapshot.SpaceID, actorUserID)
		if err != nil {
			return err
		}
		snapshot.SourceSpaceExists = exists
		snapshot.SourceMemberActive = member
		snapshot.SourceMemberAdmin = memberAdmin
		snapshot.SourceSpaceAccessMode = accessMode
	}
	if update != nil && update.SpaceID != nil {
		exists, member, _, accessMode, err := sqliteMemoPolicySpaceStateWithRole(ctx, executor, *update.SpaceID, actorUserID)
		if err != nil {
			return err
		}
		snapshot.TargetSpaceExists = exists
		snapshot.TargetMemberActive = member
		snapshot.TargetSpaceAccessMode = accessMode
	}
	return nil
}

func sqliteMemoPolicySpaceState(ctx context.Context, executor dbExecutor, spaceID, actorUserID int32) (bool, bool, store.SpaceAccessMode, error) {
	exists, member, _, accessMode, err := sqliteMemoPolicySpaceStateWithRole(ctx, executor, spaceID, actorUserID)
	return exists, member, accessMode, err
}

func sqliteMemoPolicySpaceStateWithRole(ctx context.Context, executor dbExecutor, spaceID, actorUserID int32) (bool, bool, bool, store.SpaceAccessMode, error) {
	var accessMode store.SpaceAccessMode
	if err := executor.QueryRowContext(ctx, "SELECT access_mode FROM space WHERE id = ?", spaceID).Scan(&accessMode); stderrors.Is(err, sql.ErrNoRows) {
		return false, false, false, "", nil
	} else if err != nil {
		return false, false, false, "", err
	}
	var role store.SpaceMemberRole
	err := executor.QueryRowContext(ctx, `SELECT role FROM space_member
		WHERE space_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('ADMIN', 'USER')`, spaceID, actorUserID).Scan(&role)
	if stderrors.Is(err, sql.ErrNoRows) {
		return true, false, false, accessMode, nil
	}
	if err != nil {
		return false, false, false, "", err
	}
	return true, role.IsActiveMember(), role == store.SpaceMemberRoleAdmin, accessMode, nil
}
