package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/dailyquestion"
	storepb "github.com/usememos/memos/proto/gen/store"
)

// prepareDailyQuestionSetting runs for both normal and authentication-safe GENERAL writes.
func prepareDailyQuestionSetting(setting *storepb.InstanceGeneralSetting) error {
	if setting == nil {
		return errors.New("GENERAL setting is required")
	}
	if err := dailyquestion.ValidateSeed(setting.DailyQuestionSeed); err != nil {
		return err
	}
	questions, _, err := dailyquestion.NormalizeQuestions(setting.DailyQuestionsJson)
	if err != nil {
		return err
	}
	setting.DailyQuestionsJson = questions
	if setting.DailyQuestionSeed == "" {
		setting.DailyQuestionSeed, err = dailyquestion.NewSeed()
		if err != nil {
			return err
		}
	}
	return nil
}

func dailyQuestionSeedJSON(raw string) (map[string]json.RawMessage, string, error) {
	values := map[string]json.RawMessage{}
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil, "", errors.Wrap(err, "decode GENERAL for daily question seed")
	}
	if values == nil {
		return nil, "", errors.New("GENERAL must be a JSON object")
	}
	for _, key := range []string{"dailyQuestionSeed", "daily_question_seed"} {
		if value, ok := values[key]; ok {
			var seed string
			if err := json.Unmarshal(value, &seed); err != nil {
				return nil, "", errors.Wrap(err, "decode daily question seed")
			}
			if seed != "" {
				return values, seed, nil
			}
		}
	}
	return values, "", nil
}

// ensureDailyQuestionSeedSQL preserves all unrelated JSON fields and uses a
// compare-and-swap write, so concurrent initializers agree on one durable seed.
func ensureDailyQuestionSeedSQL(ctx context.Context, db SQLExecutor, driver string) (string, error) {
	for range 8 {
		var raw string
		err := db.QueryRowContext(ctx, `SELECT value FROM system_setting WHERE name='GENERAL'`).Scan(&raw)
		missing := errors.Is(err, sql.ErrNoRows)
		if err != nil && !missing {
			return "", err
		}
		if missing {
			raw = "{}"
		}
		values, seed, err := dailyQuestionSeedJSON(raw)
		if err != nil {
			return "", err
		}
		if seed != "" {
			return seed, nil
		}
		seed, err = dailyquestion.NewSeed()
		if err != nil {
			return "", err
		}
		encodedSeed, _ := json.Marshal(seed)
		delete(values, "daily_question_seed")
		values["dailyQuestionSeed"] = encodedSeed
		value, err := json.Marshal(values)
		if err != nil {
			return "", err
		}
		if missing {
			query := `INSERT INTO system_setting(name,value,description) VALUES ('GENERAL',?,'') ON CONFLICT(name) DO NOTHING`
			if driver == "mysql" {
				query = `INSERT IGNORE INTO system_setting(name,value,description) VALUES ('GENERAL',?,'')`
			}
			result, e := db.ExecContext(ctx, BindSQL(driver, query), string(value))
			if e != nil {
				return "", e
			}
			count, e := result.RowsAffected()
			if e != nil {
				return "", e
			}
			if count == 1 {
				return seed, nil
			}
		} else {
			query := `UPDATE system_setting SET value=? WHERE name='GENERAL' AND value=?`
			if driver == "mysql" {
				query = `UPDATE system_setting SET value=? WHERE name='GENERAL' AND BINARY value=BINARY ?`
			}
			result, e := db.ExecContext(ctx, BindSQL(driver, query), string(value), raw)
			if e != nil {
				return "", e
			}
			count, e := result.RowsAffected()
			if e != nil {
				return "", e
			}
			if count == 1 {
				return seed, nil
			}
		}
	}
	return "", errors.New("GENERAL changed repeatedly while initializing daily question seed")
}

func (s *Store) initializeDailyQuestionSeed(ctx context.Context) error {
	_, err := ensureDailyQuestionSeedSQL(ctx, s.driver.GetDB(), s.profile.Driver)
	s.instanceSettingCache.Delete(ctx, "GENERAL")
	return errors.Wrap(err, "initialize daily question seed")
}

func retainDemoDailyQuestionSeed(ctx context.Context, tx SQLExecutor, seed string) error {
	var raw string
	if err := tx.QueryRowContext(ctx, `SELECT value FROM system_setting WHERE name='GENERAL'`).Scan(&raw); err != nil {
		return err
	}
	values, _, err := dailyQuestionSeedJSON(raw)
	if err != nil {
		return err
	}
	encoded, _ := json.Marshal(seed)
	delete(values, "daily_question_seed")
	values["dailyQuestionSeed"] = encoded
	value, err := json.Marshal(values)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE system_setting SET value=? WHERE name='GENERAL'`, string(value))
	return errors.Wrap(err, "retain demo daily question seed")
}
