package test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db"
)

func TestPlusDirectoryDeepSQLPagination(t *testing.T) {
	ctx := context.Background()
	s := NewTestingStore(ctx, t)
	driver := getDriverFromEnv()
	tx, err := s.GetDriver().GetDB().BeginTx(ctx, nil)
	require.NoError(t, err)
	defer tx.Rollback()
	for start := 0; start < 20000; start += 500 {
		values := []string{}
		args := []any{}
		for i := start; i < start+500; i++ {
			values = append(values, "(?,?,?)")
			args = append(args, fmt.Sprintf("bulk-%05d", i), fmt.Sprintf("Space %05d", i), "PUBLIC")
		}
		_, err = tx.ExecContext(ctx, store.BindSQL(driver, "INSERT INTO space(uid,title,access_mode) VALUES "+strings.Join(values, ",")), args...)
		require.NoError(t, err)
	}
	require.NoError(t, tx.Commit())
	limit, offset, total := 10, 9990, int32(0)
	find := &store.FindSpace{AccessModes: []store.SpaceAccessMode{store.SpaceAccessModePublic}, Limit: &limit, Offset: &offset, TotalSize: &total, ShortAvatar: true}
	list, err := s.ListSpaces(ctx, find)
	require.NoError(t, err)
	require.Len(t, list, 10)
	require.Equal(t, int32(20000), total)
	require.Equal(t, "bulk-10009", list[0].UID)
	seen := map[string]bool{}
	for _, space := range list {
		seen[space.UID] = true
	}
	offset += 10
	next, err := s.ListSpaces(ctx, find)
	require.NoError(t, err)
	require.Len(t, next, 10)
	for _, space := range next {
		require.False(t, seen[space.UID])
	}
	find.OrderBy = "title"
	offset = 0
	list, err = s.ListSpaces(ctx, find)
	require.NoError(t, err)
	require.Equal(t, "bulk-00000", list[0].UID)
	for range 3 {
		sample, err := s.SampleSpaces(ctx, &store.FindSpace{AccessModes: find.AccessModes, ShortAvatar: true}, 999)
		require.NoError(t, err)
		require.Len(t, sample, 20)
	}
	// SQLite's plan must use the access/id index and return a bounded SQL page,
	// rather than building two offset-sized Go slices and merging them.
	if driver == "sqlite" {
		rows, err := s.GetDriver().GetDB().QueryContext(ctx, "EXPLAIN QUERY PLAN SELECT id FROM space WHERE access_mode='PUBLIC' ORDER BY id DESC LIMIT 10 OFFSET 9990")
		require.NoError(t, err)
		defer rows.Close()
		plan := ""
		for rows.Next() {
			var id, parent, unused int
			var detail string
			require.NoError(t, rows.Scan(&id, &parent, &unused, &detail))
			plan += detail
		}
		require.Contains(t, plan, "idx_space_access_id")
		require.NotContains(t, plan, "TEMP B-TREE")
		require.NoError(t, rows.Err())
	}
}

func TestPlusDemoResetIsExplicitAndRepeatable(t *testing.T) {
	if getDriverFromEnv() != "sqlite" {
		t.Skip("demo intentionally supports SQLite only")
	}
	ctx := context.Background()
	normal := NewTestingStore(ctx, t)
	require.Error(t, normal.ResetDemo(ctx))
	p := &profile.Profile{Demo: true, Driver: "sqlite", Data: t.TempDir(), DSN: ":memory:"}
	driver, err := db.NewDBDriver(p)
	require.NoError(t, err)
	s := store.New(driver, p)
	defer s.Close()
	require.NoError(t, s.Migrate(ctx))
	spaces, err := s.ListSpaces(ctx, &store.FindSpace{})
	require.NoError(t, err)
	require.Len(t, spaces, 3)
	visitor, err := s.CreateUser(ctx, &store.User{Username: "visitor-before-reset", Role: store.RoleUser})
	require.NoError(t, err)
	m, err := s.CreateMemo(ctx, &store.Memo{UID: "visitor-test", CreatorID: visitor.ID, Content: "not retained", Visibility: store.Public})
	require.NoError(t, err)
	require.NoError(t, s.ResetDemo(ctx))
	missing, err := s.GetMemo(ctx, &store.FindMemo{UID: &m.UID})
	require.NoError(t, err)
	require.Nil(t, missing)
	newVisitor, err := s.CreateUser(ctx, &store.User{Username: "visitor-after-reset", Role: store.RoleUser})
	require.NoError(t, err)
	require.Greater(t, newVisitor.ID, visitor.ID)
	require.NoError(t, s.Migrate(ctx)) // Restart also resets cleanly, without duplicate seed rows.
	general, err := s.GetInstanceGeneralSetting(ctx)
	require.NoError(t, err)
	require.True(t, general.SetupCompleted)
	require.Contains(t, general.MusicConfigJson, "quiet-loop.wav")
	uid := "plus-demo-loop"
	attachment, err := s.GetAttachment(ctx, &store.FindAttachment{UID: &uid, GetBlob: true})
	require.NoError(t, err)
	require.NotNil(t, attachment)
	require.Equal(t, "RIFF", string(attachment.Blob[:4]))
	require.Less(t, len(attachment.Blob), 1<<20)
	var tokens int
	require.NoError(t, s.GetDriver().GetDB().QueryRow("SELECT COUNT(*) FROM user_setting WHERE key='PERSONAL_ACCESS_TOKENS'").Scan(&tokens))
	require.Zero(t, tokens)
}
