package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/stylepack"
)

type StylePack struct {
	ID, NameJSON, ManifestJSON, Original, Compiled, Version string
	Enabled                                                 bool
	CreatedTs, UpdatedTs                                    int64
	InstalledBy                                             int32
}

func (s *Store) ListStylePacks(ctx context.Context, includeDisabled bool) ([]*StylePack, error) {
	q := `SELECT id,name_json,manifest_json,version,enabled,created_ts,updated_ts,installed_by FROM style_pack`
	if !includeDisabled {
		q += " WHERE enabled=1"
	}
	q += " ORDER BY id"
	rows, err := s.driver.GetDB().QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []*StylePack{}
	for rows.Next() {
		p := &StylePack{}
		if err = rows.Scan(&p.ID, &p.NameJSON, &p.ManifestJSON, &p.Version, &p.Enabled, &p.CreatedTs, &p.UpdatedTs, &p.InstalledBy); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}
func (s *Store) SaveStylePack(ctx context.Context, p *stylepack.Pack, userID int32, replace bool) error {
	s.stylePackMu.Lock()
	defer s.stylePackMu.Unlock()
	tx, err := s.driver.GetDB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var exists int
	var enabled bool
	err = tx.QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT 1,enabled FROM style_pack WHERE id=?`), p.Manifest.ID).Scan(&exists, &enabled)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if exists == 1 && !replace {
		return errors.New("style pack already installed; use update")
	}
	if exists == 0 && replace {
		return errors.New("style pack not installed")
	}
	manifest, _ := json.Marshal(p.Manifest)
	names, _ := json.Marshal(p.Manifest.Name)
	nowSec := time.Now().Unix()
	if exists == 1 {
		_, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE style_pack SET name_json=?,manifest_json=?,css_original=?,css_compiled=?,version=?,updated_ts=? WHERE id=?`), string(names), string(manifest), p.Original, p.Compiled, p.Version, nowSec, p.Manifest.ID)
	} else {
		_, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `INSERT INTO style_pack(id,name_json,manifest_json,css_original,css_compiled,version,enabled,created_ts,updated_ts,installed_by) VALUES (?,?,?,?,?,?,?,?,?,?)`), p.Manifest.ID, string(names), string(manifest), p.Original, p.Compiled, p.Version, 0, nowSec, nowSec, userID)
	}
	if err != nil {
		return err
	}
	// Retain old versions: immutable URLs must never start serving new bytes.
	assets := append([]stylepack.Asset{}, p.Assets...)
	assets = append(assets, stylepack.Asset{Name: "__original.zip", ContentType: "application/zip", Content: p.ZIP}, stylepack.Asset{Name: "__compiled.css", ContentType: "text/css; charset=utf-8", Content: []byte(p.Compiled)})
	for _, a := range assets {
		var n int
		err = tx.QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT 1 FROM style_pack_resource WHERE pack_id=? AND version=? AND name=?`), p.Manifest.ID, p.Version, a.Name).Scan(&n)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `INSERT INTO style_pack_resource(pack_id,version,name,content_type,content) VALUES (?,?,?,?,?)`), p.Manifest.ID, p.Version, a.Name, a.ContentType, a.Content); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) ChangeStylePack(ctx context.Context, id string, enabled bool, remove bool) error {
	s.stylePackMu.Lock()
	defer s.stylePackMu.Unlock()
	tx, err := s.driver.GetDB().BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var n int
	if err = tx.QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT 1 FROM style_pack WHERE id=?`), id).Scan(&n); err != nil {
		return errors.Wrap(err, "style pack not found")
	}
	if remove {
		if _, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `DELETE FROM style_pack_resource WHERE pack_id=?`), id); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `DELETE FROM style_pack WHERE id=?`), id)
	} else {
		flag := 0
		if enabled {
			flag = 1
		}
		_, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE style_pack SET enabled=?,updated_ts=? WHERE id=?`), flag, time.Now().Unix(), id)
	}
	if err != nil {
		return err
	}
	if !enabled || remove {
		var raw string
		err = tx.QueryRowContext(ctx, `SELECT value FROM system_setting WHERE name='GENERAL'`).Scan(&raw)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil {
			value := map[string]any{}
			if err = json.Unmarshal([]byte(raw), &value); err != nil {
				return err
			}
			changed := false
			for _, key := range []string{"firstVisitDefaultStyle", "first_visit_default_style"} {
				if value[key] == id {
					value[key] = "default"
					changed = true
				}
			}
			if changed {
				b, _ := json.Marshal(value)
				if _, err = tx.ExecContext(ctx, BindSQL(s.profile.Driver, `UPDATE system_setting SET value=? WHERE name='GENERAL'`), string(b)); err != nil {
					return err
				}
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	s.instanceSettingCache.Delete(ctx, "GENERAL")
	return nil
}
func (s *Store) StylePackResource(ctx context.Context, id, version, name string, admin bool) (*stylepack.Asset, error) {
	query := `SELECT r.content_type,r.content FROM style_pack_resource r JOIN style_pack p ON p.id=r.pack_id WHERE r.pack_id=? AND r.version=? AND r.name=?`
	if !admin {
		query += " AND p.enabled=1"
	}
	a := &stylepack.Asset{Name: name}
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, query), id, version, name).Scan(&a.ContentType, &a.Content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, errors.Wrap(err, "read style resource")
}
func (s *Store) IsStyleEnabled(ctx context.Context, id string) (bool, error) {
	if stylepack.IsBuiltin(id) || id == "" {
		return true, nil
	}
	var n int
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT 1 FROM style_pack WHERE id=? AND enabled=1`), id).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
