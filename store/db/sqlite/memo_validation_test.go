package sqlite

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestValidateSQLiteMemoCreatePreservesQueryErrors(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })
	_, err = db.Exec(`
		CREATE TABLE user (id INTEGER PRIMARY KEY, row_status TEXT NOT NULL);
		CREATE TABLE space (id INTEGER PRIMARY KEY, access_mode TEXT NOT NULL DEFAULT 'INVITE_ONLY');
		CREATE TABLE space_member (space_id INTEGER, user_id INTEGER, status TEXT, role TEXT);
		INSERT INTO user (id, row_status) VALUES (1, 'NORMAL'), (2, 'ARCHIVED');
	`)
	require.NoError(t, err)

	canceledContext, cancel := context.WithCancel(context.Background())
	cancel()
	err = validateSQLiteMemoCreate(canceledContext, db, &store.Memo{CreatorID: 1})
	require.ErrorIs(t, err, context.Canceled)

	err = validateSQLiteMemoCreate(context.Background(), db, &store.Memo{CreatorID: 99})
	require.ErrorIs(t, err, store.ErrMemoSpaceMembershipRequired)
	err = validateSQLiteMemoCreate(context.Background(), db, &store.Memo{CreatorID: 2})
	require.ErrorIs(t, err, store.ErrMemoSpaceMembershipRequired)

	err = validateSQLiteMemoSpaceWriter(canceledContext, db, 1, 1)
	require.ErrorIs(t, err, context.Canceled)
	err = validateSQLiteMemoSpaceWriter(context.Background(), db, 99, 1)
	require.ErrorIs(t, err, store.ErrMemoSpaceNotWritable)
}
