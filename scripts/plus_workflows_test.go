package scripts

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

func TestPlusWorkflowAndComposeSyntax(t *testing.T) {
	for _, path := range []string{
		".github/workflows/build-canary-image.yml", ".github/workflows/release.yml",
		".github/workflows/verify-public-image.yml", ".github/workflows/backend-tests.yml", ".github/workflows/frontend-tests.yml",
		".github/workflows/upgrade-smoke.yml", ".github/workflows/release-please.yml",
		".github/workflows/demo-deploy.yml", "deploy/docker-compose.yml", "deploy/docker-compose.demo.yml",
	} {
		t.Run(path, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", filepath.FromSlash(path)))
			require.NoError(t, err)
			var document yaml.Node
			require.NoError(t, yaml.Unmarshal(data, &document))
			require.NotEmpty(t, document.Content)
			require.NotContains(t, string(data), "ghcr.io/usememos/memos")
			require.NotContains(t, string(data), "neosmemo/memos")
		})
	}
}
