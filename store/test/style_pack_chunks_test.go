package test

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/stylepack"
	"github.com/usememos/memos/store"
)

func TestStylePackChunkStorageAndMigration(t *testing.T) {
	ctx := context.Background()
	s := NewTestingStore(ctx, t)
	driver := os.Getenv("DRIVER")
	db := s.GetDriver().GetDB()
	// Simulate an existing schema before the chunk migration, retaining old resources.
	old := &stylepack.Pack{Manifest: stylepack.Manifest{ID: "chunk-pack", Name: map[string]string{"en": "Chunks"}}, Version: "old", Original: "old", Compiled: "old", ZIP: []byte("old ZIP")}
	require.NoError(t, s.SaveStylePack(ctx, old, 1, false))
	_, err := db.ExecContext(ctx, `DROP TABLE style_pack_resource_chunk`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `DELETE FROM memos_plus_migration WHERE version='0005__style_pack_chunks.sql'`)
	require.NoError(t, err)
	require.NoError(t, s.Migrate(ctx))
	require.NoError(t, s.Migrate(ctx))
	a, err := s.StylePackResource(ctx, old.Manifest.ID, "old", "__original.zip", true)
	require.NoError(t, err)
	require.Equal(t, old.ZIP, a.Content)
	p := &stylepack.Pack{Manifest: old.Manifest, Version: "new", Original: "new", Compiled: strings.Repeat("x", 3<<20), ZIP: bytes.Repeat([]byte{1}, 20<<20), Assets: []stylepack.Asset{{Name: "font.woff2", ContentType: "font/woff2", Content: bytes.Repeat([]byte{2}, 6<<20)}}}
	require.NoError(t, s.SaveStylePack(ctx, p, 1, true))
	for _, name := range []string{"font.woff2", "__original.zip", "__compiled.css"} {
		a, err = s.StylePackResource(ctx, p.Manifest.ID, p.Version, name, true)
		require.NoError(t, err)
		want := p.ZIP
		if name == "font.woff2" {
			want = p.Assets[0].Content
		}
		if name == "__compiled.css" {
			want = []byte(p.Compiled)
		}
		require.Equal(t, want, a.Content)
		var maxSize, total int
		require.NoError(t, db.QueryRowContext(ctx, store.BindSQL(driver, `SELECT MAX(LENGTH(content)),SUM(LENGTH(content)) FROM style_pack_resource_chunk WHERE name=?`), name).Scan(&maxSize, &total))
		require.LessOrEqual(t, maxSize, 1<<20)
		require.Equal(t, len(want), total)
	}
	hidden, err := s.StylePackResource(ctx, p.Manifest.ID, p.Version, "font.woff2", false)
	require.NoError(t, err)
	require.Nil(t, hidden)
	require.NoError(t, s.ChangeStylePack(ctx, p.Manifest.ID, false, true))
	var count int
	require.NoError(t, db.QueryRowContext(ctx, `SELECT COUNT(*) FROM style_pack_resource_chunk`).Scan(&count))
	require.Zero(t, count)
}
