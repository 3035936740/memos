package fileserver

import (
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
)

func TestNormalizeStorageRelativePath(t *testing.T) {
	t.Parallel()

	path, err := normalizeStorageRelativePath("/5/path1/5.txt")
	require.NoError(t, err)
	require.Equal(t, "5/path1/5.txt", path)

	_, err = normalizeStorageRelativePath("../etc/passwd")
	require.Error(t, err)

	_, err = normalizeStorageRelativePath("a/../../b")
	require.Error(t, err)
}

func TestResolveStoragePathStaysInRoot(t *testing.T) {
	t.Parallel()

	svc := &FileServerService{
		Profile: &profile.Profile{Data: t.TempDir()},
	}
	abs, err := svc.resolveStoragePath("5/path1/5.txt")
	require.NoError(t, err)
	require.Equal(t, filepath.Join(svc.storageRoot(), filepath.FromSlash("5/path1/5.txt")), abs)

	_, err = svc.resolveStoragePath("..\\secret.txt")
	require.Error(t, err)

	if runtime.GOOS != "windows" {
		_, err = svc.resolveStoragePath("/etc/passwd")
		require.Error(t, err)
	}
}
