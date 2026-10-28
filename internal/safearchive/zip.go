// Package safearchive validates untrusted ZIPs without extracting their paths.
package safearchive

import (
	"archive/zip"
	"io"
	"io/fs"
	"path"
	"strings"

	"github.com/pkg/errors"
)

type Limits struct {
	Files                 int
	TotalBytes, FileBytes uint64
}

// Read checks both declared and actual sizes. Duplicate, non-canonical and
// platform-dependent names are rejected before any caller consumes contents.
func Read(reader io.ReaderAt, size int64, limits Limits) (map[string]*zip.File, error) {
	z, err := zip.NewReader(reader, size)
	if err != nil {
		return nil, errors.Wrap(err, "invalid ZIP")
	}
	if len(z.File) > limits.Files {
		return nil, errors.Errorf("ZIP exceeds %d entries", limits.Files)
	}
	files := make(map[string]*zip.File)
	var total uint64
	for _, f := range z.File {
		n := strings.TrimSuffix(f.Name, "/")
		if len(n) > 1024 {
			return nil, errors.New("ZIP entry path exceeds 1024 bytes")
		}
		if n == "" || strings.ContainsAny(n, "\\:\x00") || strings.HasPrefix(n, "/") || path.Clean(n) != n || n == ".." || strings.HasPrefix(n, "../") || !fs.ValidPath(n) {
			return nil, errors.Errorf("unsafe ZIP path %q", f.Name)
		}
		if f.Mode()&(fs.ModeSymlink|fs.ModeDevice|fs.ModeNamedPipe|fs.ModeSocket) != 0 {
			return nil, errors.Errorf("special ZIP entry %q", n)
		}
		if f.FileInfo().IsDir() {
			continue
		}
		if _, exists := files[n]; exists {
			return nil, errors.Errorf("duplicate ZIP entry %q", n)
		}
		if f.UncompressedSize64 > limits.FileBytes || f.UncompressedSize64 > limits.TotalBytes-total {
			return nil, errors.Errorf("ZIP size limit exceeded at %q", n)
		}
		// Highly compressed legitimate text is allowed only inside the absolute limits.
		total += f.UncompressedSize64
		files[n] = f
	}
	return files, nil
}

func Bytes(f *zip.File, limit int64) ([]byte, error) {
	r, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	b, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit || uint64(len(b)) != f.UncompressedSize64 {
		return nil, errors.Errorf("invalid ZIP size for %q", f.Name)
	}
	return b, nil
}
