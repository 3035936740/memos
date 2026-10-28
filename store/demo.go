package store

import (
	"context"
	"encoding/binary"
	"io/fs"
	"log/slog"
	"math"
	"slices"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/usememos/memos/proto/gen/store"
)

// ResetDemo atomically resets only an explicitly configured SQLite demo database.
// IDs are never recycled for visitors; their old tokens cannot authenticate as new users.
func (s *Store) ResetDemo(ctx context.Context) error {
	if !s.profile.Demo || s.profile.Driver != "sqlite" {
		return errors.New("demo reset requires explicit SQLite demo mode")
	}
	files, err := fs.Glob(seedFS, s.getSeedBasePath()+"*.sql")
	if err != nil {
		return err
	}
	slices.Sort(files)
	tx, err := s.driver.GetDB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	dailySeed, err := ensureDailyQuestionSeedSQL(ctx, tx, "sqlite")
	if err != nil {
		return errors.Wrap(err, "preserve demo daily question seed")
	}
	// Persist cleanup metadata before removing rows, including objects whose deletion fails.
	rows, err := tx.QueryContext(ctx, "SELECT id,uid,storage_type,reference,payload FROM attachment")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		a := &Attachment{}
		var payload, storageType string
		if err := rows.Scan(&a.ID, &a.UID, &storageType, &a.Reference, &payload); err != nil {
			rows.Close()
			return err
		}
		a.StorageType = storepb.AttachmentStorageType(storepb.AttachmentStorageType_value[storageType])
		a.Payload = &storepb.AttachmentPayload{}
		if err := protojson.Unmarshal([]byte(payload), a.Payload); err != nil {
			rows.Close()
			return err
		}
		if err := EnqueueAttachmentCleanup(ctx, tx, "sqlite", []*Attachment{a}); err != nil {
			rows.Close()
			return err
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	rows, err = tx.QueryContext(ctx, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	if err != nil {
		return err
	}
	defer rows.Close()
	tables := []string{}
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			rows.Close()
			return err
		}
		tables = append(tables, table)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, table := range tables {
		switch table {
		case "system_setting", "memos_plus_migration", "idp", "attachment_cleanup":
			continue
		default:
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM "`+strings.ReplaceAll(table, `"`, `""`)+`"`); err != nil {
			return err
		}
	}
	// Retain instance secrets and deployment access/SSO configuration across resets.
	if _, err := tx.ExecContext(ctx, "DELETE FROM system_setting WHERE name NOT IN ('BASIC','ACCESS')"); err != nil {
		return err
	}
	if err := s.seedTx(ctx, tx, files); err != nil {
		return err
	}
	if err := retainDemoDailyQuestionSeed(ctx, tx, dailySeed); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE attachment SET blob=? WHERE uid='plus-demo-loop'", DemoLoopWAV()); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.instanceSettingCache.Clear(ctx)
	s.userCache.Clear(ctx)
	s.userSettingCache.Clear(ctx)
	s.RetryAttachmentCleanup(ctx)
	slog.Info("Memos Plus demo reset completed", "next_reset", "24 hours")
	return nil
}

// DemoLoopWAV is a small, original seamless eight-second ambient chord.
// Generated locally, it requires no external media service or third-party license.
func DemoLoopWAV() []byte {
	const rate = 16000
	const samples = rate * 8
	data := make([]byte, 44+samples*2)
	copy(data, "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], rate)
	binary.LittleEndian.PutUint32(data[28:], rate*2)
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], samples*2)
	for i := range samples {
		t := float64(i) / rate
		// Integral cycles per loop and a slow amplitude envelope meet at both ends.
		v := .06 * (math.Sin(2*math.Pi*220*t) + .7*math.Sin(2*math.Pi*275*t) + .45*math.Sin(2*math.Pi*330*t)) * (.8 + .2*math.Cos(2*math.Pi*t/8))
		binary.LittleEndian.PutUint16(data[44+i*2:], uint16(int16(v*32767)))
	}
	return data
}
