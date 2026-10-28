package store

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/usememos/memos/proto/gen/store"
)

type attachmentCleanupSnapshot struct {
	Attachment *Attachment     `json:"attachment"`
	Payload    json.RawMessage `json:"payload,omitempty"`
}

// EnqueueAttachmentCleanup keeps external object deletion retryable after database commit.
func EnqueueAttachmentCleanup(ctx context.Context, tx SQLExecutor, driver string, attachments []*Attachment) error {
	for _, a := range attachments {
		snapshot := *a
		snapshot.Blob = nil
		snapshot.Policy = nil
		snapshot.Payload = nil
		var payload []byte
		var err error
		if a.Payload != nil {
			payload, err = protojson.Marshal(a.Payload)
			if err != nil {
				return err
			}
		}
		data, err := json.Marshal(attachmentCleanupSnapshot{Attachment: &snapshot, Payload: payload})
		if err != nil {
			return err
		}
		query := `INSERT INTO attachment_cleanup(attachment_id,snapshot,attempted_ts) VALUES (?,?,0)`
		if driver == "mysql" {
			query += ` ON DUPLICATE KEY UPDATE snapshot=VALUES(snapshot)`
		} else {
			query += ` ON CONFLICT(attachment_id) DO NOTHING`
		}
		if _, err := tx.ExecContext(ctx, BindSQL(driver, query), a.ID, string(data)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) acknowledgeAttachmentCleanup(ctx context.Context, id int32) error {
	_, err := s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, `DELETE FROM attachment_cleanup WHERE attachment_id=?`), id)
	return err
}

// RetryAttachmentCleanup retries a bounded batch of failed local/S3 deletions.
func (s *Store) RetryAttachmentCleanup(ctx context.Context) {
	rows, err := s.driver.GetDB().QueryContext(ctx, `SELECT attachment_id,snapshot FROM attachment_cleanup ORDER BY attempted_ts,attachment_id LIMIT 100`)
	if err != nil {
		slog.Warn("attachment cleanup queue lookup failed", "error", err)
		return
	}
	defer rows.Close()
	type pending struct {
		id   int32
		data string
	}
	batch := []pending{}
	for rows.Next() {
		var item pending
		if err := rows.Scan(&item.id, &item.data); err != nil {
			rows.Close()
			slog.Warn("attachment cleanup queue scan failed", "error", err)
			return
		}
		batch = append(batch, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return
	}
	for _, item := range batch {
		if ctx.Err() != nil {
			return
		}
		var snapshot attachmentCleanupSnapshot
		if err := json.Unmarshal([]byte(item.data), &snapshot); err != nil || snapshot.Attachment == nil {
			slog.Warn("invalid attachment cleanup snapshot", "id", item.id, "error", err)
			continue
		}
		a := snapshot.Attachment
		if len(snapshot.Payload) > 0 {
			a.Payload = &storepb.AttachmentPayload{}
			if err := protojson.Unmarshal(snapshot.Payload, a.Payload); err != nil {
				slog.Warn("invalid attachment cleanup payload", "id", item.id, "error", err)
				continue
			}
		}
		// A filename-only storage template may reuse a path after deletion. Never
		// remove a new live attachment that now owns the old snapshot's path.
		var reused int
		if err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT COUNT(*) FROM attachment WHERE reference=? AND id<>?`), a.Reference, a.ID).Scan(&reused); err != nil {
			continue
		}
		if reused > 0 {
			_ = s.acknowledgeAttachmentCleanup(ctx, a.ID)
			continue
		}
		if err := s.DeleteAttachmentStorage(ctx, a); err != nil {
			slog.Warn("attachment storage cleanup failed; will retry", "attachment_id", a.ID, "error", err)
			_, _ = s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE attachment_cleanup SET attempted_ts=? WHERE attachment_id=?`), time.Now().Unix(), a.ID)
		}
	}
}

// PurgeDeletedMemo is a trusted runner operation, independent of a deleted author's login status.
func (s *Store) PurgeDeletedMemo(ctx context.Context, id int32) (*DeleteMemoWithPolicyResult, error) {
	return s.driver.PurgeDeletedMemo(ctx, id)
}
