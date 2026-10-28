package version

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPlusDisplayDoesNotChangeMigrationVersion(t *testing.T) {
	previousBase, previousPlus := Version, PlusVersion
	t.Cleanup(func() { Version = previousBase; PlusVersion = previousPlus })
	Version = "0.34.1"
	PlusVersion = "1.0.0"
	require.Equal(t, "1.0.0 (based on Memos 0.34.1)", GetDisplayVersion())
	require.Equal(t, "0.34.1", GetCurrentVersion())
	require.Equal(t, "0.34", GetMinorVersion(GetCurrentVersion()))
}
