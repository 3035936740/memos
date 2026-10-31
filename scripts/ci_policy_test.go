package scripts

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCIUnsupportedDatabaseBoundaryIsExplicit(t *testing.T) {
	data, err := os.ReadFile("ci-unsupported-upstream-tests.txt")
	require.NoError(t, err)
	files, err := filepath.Glob("../store/test/*_test.go")
	require.NoError(t, err)
	tests := map[string]bool{}
	for _, path := range files {
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		require.NoError(t, err)
		for _, declaration := range file.Decls {
			if function, ok := declaration.(*ast.FuncDecl); ok {
				tests[function.Name.Name] = true
			}
		}
	}
	retired := map[string]bool{}
	for _, name := range strings.Split(string(data), "\n") {
		name = strings.TrimSpace(name)
		if name == "" || strings.HasPrefix(name, "#") {
			continue
		}
		require.Regexp(t, regexp.MustCompile(`^Test[A-Za-z0-9_]+$`), name)
		require.True(t, tests[name], "retired test must still exist: %s", name)
		require.False(t, retired[name], "duplicate retired test: %s", name)
		retired[name] = true
	}
	for _, supported := range []string{
		"TestFreshInstall", "TestMigrationReRun", "TestMigrationWithData", "TestMigrationMultipleReRuns",
		"TestMigrationRejectsDowngrade", "TestPlusTrashAndHistory", "TestPlusDirectoryDeepSQLPagination",
	} {
		require.True(t, tests[supported])
		require.False(t, retired[supported], "current functionality must stay required: %s", supported)
	}
}

func TestCICurrentImageNeverSeedsAnUpstreamDatabase(t *testing.T) {
	data, err := os.ReadFile("release_smoke_test.sh")
	require.NoError(t, err)
	for _, removed := range []string{"previous_image", "--previous-image", "neosmemo/memos", "upgrade_volume"} {
		require.NotContains(t, string(data), removed)
	}
	for _, required := range []string{"docker restart", "create_admin", "assert_memo", "/usr/local/memos/LICENSE", "/usr/local/memos/visual-effects-NOTICES.txt"} {
		require.Contains(t, string(data), required)
	}
	for _, workflow := range []string{"release.yml", "build-canary-image.yml"} {
		data, err := os.ReadFile(filepath.Join("..", ".github", "workflows", workflow))
		require.NoError(t, err)
		require.Contains(t, string(data), "uses: ./.github/workflows/ci.yml")
		require.NotContains(t, string(data), "upgrade-smoke")
	}
	for _, workflow := range []string{"ci.yml", "backend-tests.yml", "frontend-tests.yml", "fresh-install.yml"} {
		data, err := os.ReadFile(filepath.Join("..", ".github", "workflows", workflow))
		require.NoError(t, err)
		require.NotContains(t, string(data), "continue-on-error")
		require.NotContains(t, string(data), "SKIP_CONTAINER_TESTS")
	}
}
