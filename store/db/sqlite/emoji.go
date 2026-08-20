package sqlite

import (
	"context"
	"strings"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateEmojiGroup(ctx context.Context, group *store.EmojiGroup) (*store.EmojiGroup, error) {
	err := d.db.QueryRowContext(ctx, `INSERT INTO emoji_group(name) VALUES(?) RETURNING id,created_ts,updated_ts`, group.Name).
		Scan(&group.ID, &group.CreatedTs, &group.UpdatedTs)
	return group, err
}

func (d *DB) ListEmojiGroups(ctx context.Context, find *store.FindEmojiGroup) ([]*store.EmojiGroup, error) {
	query, args := `SELECT id,created_ts,updated_ts,name FROM emoji_group`, []any{}
	if find != nil && find.ID != nil {
		query += ` WHERE id=?`
		args = append(args, *find.ID)
	}
	query += ` ORDER BY id`
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []*store.EmojiGroup{}
	for rows.Next() {
		group := &store.EmojiGroup{}
		if err := rows.Scan(&group.ID, &group.CreatedTs, &group.UpdatedTs, &group.Name); err != nil {
			return nil, err
		}
		result = append(result, group)
	}
	return result, rows.Err()
}

func (d *DB) DeleteEmojiGroup(ctx context.Context, id int32) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM emoji WHERE group_id=?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM emoji_group WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) CreateEmoji(ctx context.Context, emoji *store.Emoji) (*store.Emoji, error) {
	err := d.db.QueryRowContext(ctx, `INSERT INTO emoji(group_id,name,filename,type,size,storage_type,reference,storage_id,storage_key,blob)
		VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id,created_ts,updated_ts`, emoji.GroupID, emoji.Name, emoji.Filename, emoji.Type,
		emoji.Size, emoji.StorageType, emoji.Reference, emoji.StorageID, emoji.StorageKey, emoji.Blob).
		Scan(&emoji.ID, &emoji.CreatedTs, &emoji.UpdatedTs)
	return emoji, err
}

func (d *DB) ListEmojis(ctx context.Context, find *store.FindEmoji) ([]*store.Emoji, error) {
	fields := []string{"id", "group_id", "created_ts", "updated_ts", "name", "filename", "type", "size", "storage_type", "reference", "storage_id", "storage_key"}
	if find != nil && find.GetBlob {
		fields = append(fields, "blob")
	}
	where, args := []string{}, []any{}
	if find != nil {
		if find.ID != nil {
			where, args = append(where, "id=?"), append(args, *find.ID)
		}
		if find.GroupID != nil {
			where, args = append(where, "group_id=?"), append(args, *find.GroupID)
		}
		if find.Filename != nil {
			where, args = append(where, "filename=?"), append(args, *find.Filename)
		}
	}
	query := "SELECT " + strings.Join(fields, ",") + " FROM emoji"
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY group_id,id"
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []*store.Emoji{}
	for rows.Next() {
		emoji := &store.Emoji{}
		dests := []any{&emoji.ID, &emoji.GroupID, &emoji.CreatedTs, &emoji.UpdatedTs, &emoji.Name, &emoji.Filename, &emoji.Type, &emoji.Size, &emoji.StorageType, &emoji.Reference, &emoji.StorageID, &emoji.StorageKey}
		if find != nil && find.GetBlob {
			dests = append(dests, &emoji.Blob)
		}
		if err := rows.Scan(dests...); err != nil {
			return nil, errors.Wrap(err, "failed to scan emoji")
		}
		result = append(result, emoji)
	}
	return result, rows.Err()
}

func (d *DB) DeleteEmoji(ctx context.Context, id int32) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM emoji WHERE id=?`, id)
	return err
}
