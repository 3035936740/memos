package store

import (
	"context"
	"io"
)

// StreamAttachmentBlob streams legacy database-backed attachments with bounded memory.
func (s *Store) StreamAttachmentBlob(ctx context.Context, id int32, w io.Writer) error {
	const size = 64 * 1024
	for start := 1; ; start += size {
		var chunk []byte
		if err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT SUBSTR(blob,?,?) FROM attachment WHERE id=?`), start, size, id).Scan(&chunk); err != nil {
			return err
		}
		if len(chunk) == 0 {
			return nil
		}
		if _, err := w.Write(chunk); err != nil {
			return err
		}
		if len(chunk) < size {
			return nil
		}
	}
}
