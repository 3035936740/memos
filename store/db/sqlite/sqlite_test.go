package sqlite

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
)

func TestNewDBKeepsTemporaryStorageInMemory(t *testing.T) {
	driver, err := NewDB(&profile.Profile{DSN: filepath.Join(t.TempDir(), "memos.db")})
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, driver.Close())
	})

	var tempStore int
	require.NoError(t, driver.GetDB().QueryRowContext(context.Background(), "PRAGMA temp_store").Scan(&tempStore))
	require.Equal(t, 2, tempStore)
}
