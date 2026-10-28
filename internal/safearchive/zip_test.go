package safearchive

import (
	"archive/zip"
	"bytes"
	"io/fs"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestZIPRejectsLinksDuplicateEntriesAndExpandedSize(t *testing.T) {
	for _, kind := range []string{"symlink", "duplicate", "expanded-size", "file-count"} {
		t.Run(kind, func(t *testing.T) {
			var b bytes.Buffer
			w := zip.NewWriter(&b)
			header := &zip.FileHeader{Name: "article.md", Method: zip.Deflate}
			if kind == "symlink" {
				header.SetMode(fs.ModeSymlink | 0600)
			}
			f, err := w.CreateHeader(header)
			require.NoError(t, err)
			_, err = f.Write([]byte("content"))
			require.NoError(t, err)
			if kind == "duplicate" || kind == "file-count" {
				f, err = w.Create("article.md")
				require.NoError(t, err)
				_, err = f.Write([]byte("second"))
				require.NoError(t, err)
			}
			require.NoError(t, w.Close())
			limits := Limits{Files: 10, FileBytes: 100, TotalBytes: 100}
			if kind == "expanded-size" {
				limits.TotalBytes = 3
			}
			if kind == "file-count" {
				limits.Files = 1
			}
			_, err = Read(bytes.NewReader(b.Bytes()), int64(b.Len()), limits)
			require.Error(t, err)
		})
	}
}
