package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStylePackOfflineCheck(t *testing.T) {
	for _, valid := range []bool{true, false} {
		var data bytes.Buffer
		w := zip.NewWriter(&data)
		manifest, err := w.Create("style.json")
		require.NoError(t, err)
		_, err = manifest.Write([]byte(`{"kind":"memos-plus.style","version":1,"id":"cli-pack","name":{"en":"CLI"}}`))
		require.NoError(t, err)
		css, err := w.Create("style.css")
		require.NoError(t, err)
		source := `.a{color:red}`
		if !valid {
			source = ".a{background:url(https://evil.test)}"
		}
		_, err = css.Write([]byte(source))
		require.NoError(t, err)
		require.NoError(t, w.Close())
		file := filepath.Join(t.TempDir(), "pack.zip")
		require.NoError(t, os.WriteFile(file, data.Bytes(), 0600))
		cmd := stylePackCommand()
		var out bytes.Buffer
		cmd.SetOut(&out)
		cmd.SetErr(&out)
		cmd.SetArgs([]string{"check", file})
		err = cmd.Execute()
		if valid {
			require.NoError(t, err)
			require.Contains(t, out.String(), "cli-pack")
			require.Contains(t, out.String(), "compiled CSS:")
		} else {
			require.ErrorContains(t, err, "style.css line 1")
		}
	}
}
