package test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestPlusTrashAndHistory(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	owner, err := ts.CreateUser(ctx, &store.User{Username: "history-owner", Role: store.RoleUser, PasswordHash: "hash"})
	require.NoError(t, err)
	reader, err := ts.CreateUser(ctx, &store.User{Username: "history-reader", Role: store.RoleUser, PasswordHash: "hash"})
	require.NoError(t, err)
	memo, err := ts.CreateMemo(ctx, &store.Memo{UID: "history-root", CreatorID: owner.ID, Content: "original", Visibility: store.Public})
	require.NoError(t, err)
	comment, err := ts.CreateMemoComment(ctx, &store.Memo{UID: "history-comment", CreatorID: reader.ID, Content: "comment", Visibility: store.Public}, memo.ID, reader.ID)
	require.NoError(t, err)
	first, second := "first edit", "second edit"
	limit := 2
	update := &store.UpdateMemo{ID: memo.ID, Content: &first, Policy: &store.MemoWritePolicy{ActorUserID: owner.ID}, RevisionLimit: &limit}
	require.NoError(t, ts.UpdateMemo(ctx, update))
	update.Content = &second
	require.NoError(t, ts.UpdateMemo(ctx, update))
	history, err := ts.ListMemoRevisions(ctx, memo.ID)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, "original", history[0].Content)
	pinned := true
	require.NoError(t, ts.UpdateMemo(ctx, &store.UpdateMemo{ID: memo.ID, Pinned: &pinned, Policy: update.Policy, RevisionLimit: &limit}))
	history, err = ts.ListMemoRevisions(ctx, memo.ID)
	require.NoError(t, err)
	require.Len(t, history, 1)
	update.Content = &first
	update.RevisionForce = true
	require.NoError(t, ts.UpdateMemo(ctx, update))
	update.Content = &second
	require.NoError(t, ts.UpdateMemo(ctx, update))
	history, err = ts.ListMemoRevisions(ctx, memo.ID)
	require.NoError(t, err)
	require.Len(t, history, 2)
	atMicro := time.Now().UnixMicro()
	result, err := ts.DeleteMemoWithPolicy(ctx, &store.DeleteMemoWithPolicy{MemoID: memo.ID, ActorUserID: owner.ID, DeletedTs: &atMicro})
	require.NoError(t, err)
	require.Empty(t, result.Attachments)
	for _, id := range []int32{memo.ID, comment.ID} {
		gone, err := ts.GetMemo(ctx, &store.FindMemo{ID: &id})
		require.NoError(t, err)
		require.Nil(t, gone)
	}
	deleted, err := ts.ListMemos(ctx, &store.FindMemo{Deleted: store.OnlyDeleted})
	require.NoError(t, err)
	require.Len(t, deleted, 2)
	require.ErrorIs(t, ts.RestoreDeletedMemo(ctx, memo.ID, reader.ID, false), store.ErrMemoPermissionDenied)
	require.ErrorIs(t, ts.RestoreDeletedMemo(ctx, comment.ID, reader.ID, false), store.ErrMemoMutationConflict)
	require.NoError(t, ts.RestoreDeletedMemo(ctx, memo.ID, owner.ID, false))
	restored, err := ts.GetMemo(ctx, &store.FindMemo{ID: &comment.ID})
	require.NoError(t, err)
	require.NotNil(t, restored)
	_, err = ts.DeleteMemoWithPolicy(ctx, &store.DeleteMemoWithPolicy{MemoID: memo.ID, ActorUserID: owner.ID, RequireDeleted: true})
	require.ErrorIs(t, err, store.ErrMemoMutationConflict)
	_, err = ts.DeleteMemoWithPolicy(ctx, &store.DeleteMemoWithPolicy{MemoID: memo.ID, ActorUserID: owner.ID, DeletedTs: &atMicro})
	require.NoError(t, err)
	_, err = ts.PurgeDeletedMemo(ctx, memo.ID)
	require.NoError(t, err)
	history, err = ts.ListMemoRevisions(ctx, memo.ID)
	require.NoError(t, err)
	require.Empty(t, history)
	gone, err := ts.GetMemo(ctx, &store.FindMemo{ID: &comment.ID, Deleted: store.IncludeDeleted})
	require.NoError(t, err)
	require.Nil(t, gone)
}

func TestPlusMigrationsPreserveUpstreamSchemaVersion(t *testing.T) {
	if getDriverFromEnv() != "sqlite" {
		t.Skip("SQLite snapshot coverage")
	}
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "upstream.db")
	ts := NewTestingStoreWithDSN(ctx, t, "sqlite", path)
	latest, err := os.ReadFile("../migration/sqlite/LATEST.sql")
	require.NoError(t, err)
	schema := string(latest)
	schema = strings.Replace(schema, ",\n  deleted_ts BIGINT DEFAULT NULL,\n  last_editor_id INTEGER DEFAULT NULL", "", 1)
	schema = strings.Split(schema, "CREATE INDEX idx_memo_deleted_creator")[0]
	_, err = ts.GetDriver().GetDB().ExecContext(ctx, schema)
	require.NoError(t, err)
	// Reproduce an upstream 0.34 database, with no Plus migration ledger.
	_, err = ts.GetDriver().GetDB().ExecContext(ctx, `INSERT INTO user(id,username,role,password_hash) VALUES (1,'old-owner','ADMIN','hash'); INSERT INTO memo(uid,creator_id,content,payload) VALUES ('original-memo',1,'keep me','{}'); INSERT INTO system_setting(name,value) VALUES ('BASIC','{"schemaVersion":"0.34.1"}')`)
	require.NoError(t, err)
	require.NoError(t, ts.Migrate(ctx))
	version, err := ts.GetCurrentSchemaVersion()
	require.NoError(t, err)
	require.Equal(t, "0.34.1", version, "Plus numbering must never masquerade as an upstream version")
	var deleted sql.NullInt64
	var content string
	require.NoError(t, ts.GetDriver().GetDB().QueryRowContext(ctx, `SELECT content,deleted_ts FROM memo WHERE uid='original-memo'`).Scan(&content, &deleted))
	require.Equal(t, "keep me", content)
	require.False(t, deleted.Valid)
	backups, err := filepath.Glob(filepath.Join(ts.GetDataDir(), "memos_prod.db.before-*.bak"))
	require.NoError(t, err)
	require.Len(t, backups, 1)
	require.NoError(t, ts.Migrate(ctx))
	again, _ := filepath.Glob(filepath.Join(ts.GetDataDir(), "memos_prod.db.before-*.bak"))
	require.Len(t, again, 1, "no duplicate backup or migration on restart")
	// Future upstream schema additions coexist with the independent Plus ledger.
	_, err = ts.GetDriver().GetDB().ExecContext(ctx, `ALTER TABLE memo ADD COLUMN upstream_future_column TEXT`)
	require.NoError(t, err)
	require.NoError(t, ts.Migrate(ctx))
}

func TestPlusUpgradeFrom034AcrossDrivers(t *testing.T) {
	ctx := context.Background()
	s := NewTestingStore(ctx, t)
	driver := getDriverFromEnv()
	u, err := s.CreateUser(ctx, &store.User{Username: "upgrade-owner", Role: store.RoleAdmin})
	require.NoError(t, err)
	m, err := s.CreateMemo(ctx, &store.Memo{UID: "upgrade-preserved", CreatorID: u.ID, Content: "keep this text", Visibility: store.Public})
	require.NoError(t, err)
	database := s.GetDriver().GetDB()
	// Strip only Plus additions to recreate the preceding upstream schema.
	for _, item := range []struct{ name, table string }{{"idx_memo_deleted_creator", "memo"}, {"idx_space_access_id", "space"}} {
		query := "DROP INDEX " + item.name
		if driver == "mysql" {
			query += " ON " + item.table
		}
		_, err = database.ExecContext(ctx, query)
		require.NoError(t, err)
	}
	for _, query := range []string{"DROP TABLE memo_revision", "DROP TABLE attachment_cleanup", "ALTER TABLE memo DROP COLUMN deleted_ts", "ALTER TABLE memo DROP COLUMN last_editor_id", "DELETE FROM memos_plus_migration"} {
		_, err = database.ExecContext(ctx, query)
		require.NoError(t, err)
	}
	require.NoError(t, s.Migrate(ctx))
	got, err := s.GetMemo(ctx, &store.FindMemo{ID: &m.ID})
	require.NoError(t, err)
	require.Equal(t, m.Content, got.Content)
	require.Nil(t, got.DeletedTs)
	// A partially applied DDL file must be retryable, including on MySQL.
	_, err = database.ExecContext(ctx, "DELETE FROM memos_plus_migration")
	require.NoError(t, err)
	_, err = database.ExecContext(ctx, "ALTER TABLE memo ADD COLUMN future_upstream_field TEXT")
	require.NoError(t, err)
	require.NoError(t, s.Migrate(ctx))
	var count int
	require.NoError(t, database.QueryRowContext(ctx, "SELECT COUNT(*) FROM memos_plus_migration").Scan(&count))
	require.Equal(t, 3, count)
}
