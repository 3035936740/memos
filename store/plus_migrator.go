package store

import (
	"context"
	"database/sql"
	"embed"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/errors"
)

// Plus migrations have their own ledger; upstream schema versions remain upstream versions.
//
//go:embed plus-migration
var plusMigrationFS embed.FS

// BindSQL adapts trusted SQL templates to the configured database dialect.
// Values must always be supplied separately as query arguments.
func BindSQL(driver, query string) string {
	if driver != "postgres" {
		return query
	}
	query = strings.ReplaceAll(query, "`", `"`)
	var b strings.Builder
	n := 0
	for _, c := range query {
		if c == '?' {
			n++
			b.WriteString("$")
			b.WriteString(strconv.Itoa(n))
		} else {
			b.WriteRune(c)
		}
	}
	return b.String()
}

func (s *Store) plusMigrationFiles() ([]string, error) {
	paths, err := fs.Glob(plusMigrationFS, "plus-migration/"+s.profile.Driver+"/*.sql")
	slices.Sort(paths)
	return paths, err
}

func (s *Store) initPlusLedger(ctx context.Context, fresh bool) error {
	if _, err := s.driver.GetDB().ExecContext(ctx, `CREATE TABLE IF NOT EXISTS memos_plus_migration (version VARCHAR(128) PRIMARY KEY, applied_ts BIGINT NOT NULL)`); err != nil {
		return err
	}
	if !fresh {
		return nil
	}
	paths, err := s.plusMigrationFiles()
	if err != nil {
		return err
	}
	for _, path := range paths {
		if _, err := s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, `INSERT INTO memos_plus_migration(version, applied_ts) VALUES (?, ?)`), filepath.Base(path), time.Now().Unix()); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) applyPlusMigrations(ctx context.Context) error {
	if err := s.initPlusLedger(ctx, false); err != nil {
		return err
	}
	paths, err := s.plusMigrationFiles()
	if err != nil {
		return err
	}
	for _, path := range paths {
		var name string
		err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, `SELECT version FROM memos_plus_migration WHERE version = ?`), filepath.Base(path)).Scan(&name)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		data, err := plusMigrationFS.ReadFile(path)
		if err != nil {
			return err
		}
		// MySQL DDL commits implicitly. Inspect each column/index before applying so
		// a restart after an interrupted migration can safely finish the same file.
		for _, statement := range strings.Split(string(data), ";") {
			statement = strings.TrimSpace(statement)
			if statement == "" {
				continue
			}
			words := strings.Fields(statement)
			if len(words) >= 7 && words[0] == "ALTER" && words[1] == "TABLE" && words[3] == "ADD" && words[4] == "COLUMN" {
				exists, err := s.plusColumnExists(ctx, words[2], words[5])
				if err != nil {
					return err
				}
				if exists {
					continue
				}
			}
			if len(words) >= 4 && words[0] == "CREATE" && words[1] == "INDEX" {
				exists, err := s.plusIndexExists(ctx, words[2])
				if err != nil {
					return err
				}
				if exists {
					continue
				}
			}
			if _, err := s.driver.GetDB().ExecContext(ctx, statement); err != nil {
				return errors.Wrapf(err, "Plus migration %s failed; pre-upgrade backup is in %s", path, s.profile.Data)
			}
		}
		if filepath.Base(path) == "0004__daily_question.sql" {
			if err := s.initializeDailyQuestionSeed(ctx); err != nil {
				return err
			}
		}
		if _, err := s.driver.GetDB().ExecContext(ctx, BindSQL(s.profile.Driver, `INSERT INTO memos_plus_migration(version, applied_ts) VALUES (?, ?)`), filepath.Base(path), time.Now().Unix()); err != nil {
			return err
		}
		slog.Info("Memos Plus migration applied", "migration", filepath.Base(path))
	}
	return nil
}

func (s *Store) plusColumnExists(ctx context.Context, table, column string) (bool, error) {
	var n int
	var query string
	switch s.profile.Driver {
	case "sqlite":
		query = `SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`
	case "mysql":
		query = `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`
	default:
		query = `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=? AND column_name=?`
	}
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, query), table, column).Scan(&n)
	return n > 0, err
}

func (s *Store) plusIndexExists(ctx context.Context, name string) (bool, error) {
	var query string
	switch s.profile.Driver {
	case "sqlite":
		query = `SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?`
	case "mysql":
		query = `SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND index_name=?`
	default:
		query = `SELECT COUNT(*) FROM pg_indexes WHERE schemaname=current_schema() AND indexname=?`
	}
	var n int
	err := s.driver.GetDB().QueryRowContext(ctx, BindSQL(s.profile.Driver, query), name).Scan(&n)
	return n > 0, err
}

func (s *Store) backupBeforeMigration(ctx context.Context) error {
	initialized, err := s.driver.IsInitialized(ctx)
	if err != nil {
		return err
	}
	if !initialized {
		return nil
	}
	paths, err := s.plusMigrationFiles()
	if err != nil {
		return err
	}
	var applied int
	ledgerErr := s.driver.GetDB().QueryRowContext(ctx, `SELECT COUNT(*) FROM memos_plus_migration`).Scan(&applied)
	basic, err := s.GetInstanceBasicSetting(ctx)
	if err != nil {
		return err
	}
	latest, err := s.GetCurrentSchemaVersion()
	if err != nil {
		return err
	}
	if ledgerErr == nil && applied == len(paths) && basic.SchemaVersion == latest {
		return nil
	}
	if s.profile.Driver != "sqlite" {
		slog.Warn("Back up the database before upgrading Memos Plus using mysqldump or pg_dump", "driver", s.profile.Driver)
		return nil
	}
	if s.profile.Data == "" {
		return errors.New("SQLite migration backup requires a data directory")
	}
	name := filepath.Join(s.profile.Data, "memos_prod.db.before-"+latest+"-"+time.Now().UTC().Format("20060102T150405.000000000")+".bak")
	if err := s.SnapshotSQLite(ctx, name); err != nil {
		return errors.Wrap(err, "migration stopped because automatic SQLite backup failed")
	}
	slog.Info("SQLite pre-upgrade backup created", "path", name)
	backups, _ := filepath.Glob(filepath.Join(s.profile.Data, "memos_prod.db.before-*.bak"))
	slices.SortFunc(backups, func(a, b string) int {
		ai, ae := os.Stat(a)
		bi, be := os.Stat(b)
		if ae != nil || be != nil {
			return strings.Compare(a, b)
		}
		return ai.ModTime().Compare(bi.ModTime())
	})
	for len(backups) > 3 {
		if err := os.Remove(backups[0]); err != nil {
			slog.Warn("Cannot remove old migration backup", "path", backups[0], "error", err)
		}
		backups = backups[1:]
	}
	return nil
}

// SnapshotSQLite writes a consistent SQLite snapshot to a new file.
func (s *Store) SnapshotSQLite(ctx context.Context, path string) error {
	if s.profile.Driver != "sqlite" {
		return errors.New("database snapshots are only supported for SQLite")
	}
	if _, err := s.driver.GetDB().ExecContext(ctx, `VACUUM INTO ?`, path); err != nil {
		_ = os.Remove(path)
		return err
	}
	if err := os.Chmod(path, 0600); err != nil {
		_ = os.Remove(path)
		return err
	}
	return nil
}
