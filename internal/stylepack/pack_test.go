package stylepack

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func archivePack(t *testing.T, id, source string, assets map[string][]byte) []byte {
	t.Helper()
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	manifest, _ := json.Marshal(Manifest{Kind: "memos-plus.style", Version: 1, ID: id, Name: map[string]string{"en": "Test"}})
	files := map[string][]byte{"style.json": manifest, "style.css": []byte(source)}
	for name, data := range assets {
		files[name] = data
	}
	for name, data := range files {
		f, err := w.Create(name)
		require.NoError(t, err)
		_, err = f.Write(data)
		require.NoError(t, err)
	}
	require.NoError(t, w.Close())
	return b.Bytes()
}
func TestPackManifestAndResourceLimits(t *testing.T) {
	for _, id := range []string{"a", "ABC", "memos-custom", "default", "glass", "test\"unsafe"} {
		_, err := Parse(archivePack(t, id, `.a{color:red}`, nil))
		require.Error(t, err, id)
	}
	_, err := Parse(archivePack(t, "safe-pack", `.a{color:red}`, map[string][]byte{"assets/evil.svg": []byte(`<svg onload="alert(1)"/>`)}))
	require.Error(t, err)
	_, err = Parse(archivePack(t, "safe-pack", `.a{color:red}`, map[string][]byte{"assets/fake.png": []byte(`<html>not an image</html>`)}))
	require.Error(t, err)
	assets := map[string][]byte{}
	for i := range 21 {
		assets[fmt.Sprintf("assets/%d.svg", i)] = []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`)
	}
	_, err = Parse(archivePack(t, "safe-pack", `.a{color:red}`, assets))
	require.Error(t, err)
	pack, err := Parse(archivePack(t, "safe-pack", `:root{--color:red}`, nil))
	require.NoError(t, err)
	require.Contains(t, pack.Compiled, `html[data-style="safe-pack"]`)
	require.Len(t, pack.Version, 64)
}
