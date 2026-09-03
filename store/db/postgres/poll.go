package postgres

import (
	"context"
	"database/sql"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

func (d *DB) ListPollVotes(ctx context.Context, memoID int32) ([]*store.PollVote, error) {
	rows, err := d.db.QueryContext(ctx, "SELECT memo_id, user_id, option_id, device_id FROM poll_vote WHERE memo_id = $1 ORDER BY id ASC", memoID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list poll votes")
	}
	defer rows.Close()
	return scanPollVotes(rows)
}

// ListPollVotesByVoter returns only the ballot matching this identity.
func (d *DB) ListPollVotesByVoter(ctx context.Context, memoID, userID int32, deviceID string) ([]*store.PollVote, error) {
	rows, err := d.db.QueryContext(ctx, "SELECT memo_id, user_id, option_id, device_id FROM poll_vote WHERE memo_id = $1 AND user_id = $2 AND device_id = $3 ORDER BY id", memoID, userID, deviceID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get voter ballot")
	}
	defer rows.Close()
	return scanPollVotes(rows)
}

// CountPollVotes aggregates counts without returning individual ballots.
func (d *DB) CountPollVotes(ctx context.Context, memoID int32) (map[string]int32, error) {
	rows, err := d.db.QueryContext(ctx, "SELECT option_id, COUNT(*) FROM poll_vote WHERE memo_id = $1 GROUP BY option_id", memoID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to count poll votes")
	}
	defer rows.Close()
	counts := make(map[string]int32)
	for rows.Next() {
		var option string
		var count int32
		if err := rows.Scan(&option, &count); err != nil {
			return nil, errors.Wrap(err, "failed to scan poll count")
		}
		counts[option] = count
	}
	return counts, errors.Wrap(rows.Err(), "failed to iterate poll counts")
}

// SamplePollVoters samples unique users before fetching their selected choices.
func (d *DB) SamplePollVoters(ctx context.Context, memoID int32, limit int) ([]*store.PollVoter, error) {
	rows, err := d.db.QueryContext(ctx, `
     SELECT votes.user_id, votes.option_id
     FROM poll_vote AS votes
     JOIN (
       SELECT user_id FROM poll_vote
       WHERE memo_id = $1 AND user_id > 0
       GROUP BY user_id ORDER BY RANDOM() LIMIT $2
     ) AS sampled ON sampled.user_id = votes.user_id
     WHERE votes.memo_id = $3
     ORDER BY votes.user_id, votes.id`, memoID, limit, memoID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to sample poll participants")
	}
	defer rows.Close()
	voters := make([]*store.PollVoter, 0, limit)
	byID := make(map[int32]*store.PollVoter, limit)
	for rows.Next() {
		var userID int32
		var optionID string
		if err := rows.Scan(&userID, &optionID); err != nil {
			return nil, errors.Wrap(err, "failed to scan sampled participant")
		}
		voter := byID[userID]
		if voter == nil {
			voter = &store.PollVoter{UserID: userID}
			voters = append(voters, voter)
			byID[userID] = voter
		}
		voter.OptionIDs = append(voter.OptionIDs, optionID)
	}
	return voters, errors.Wrap(rows.Err(), "failed to iterate sampled participants")
}

func scanPollVotes(rows *sql.Rows) ([]*store.PollVote, error) {
	votes := make([]*store.PollVote, 0)
	for rows.Next() {
		vote := &store.PollVote{}
		if err := rows.Scan(&vote.MemoID, &vote.UserID, &vote.OptionID, &vote.DeviceID); err != nil {
			return nil, errors.Wrap(err, "failed to scan poll vote")
		}
		votes = append(votes, vote)
	}
	if err := rows.Err(); err != nil {
		return nil, errors.Wrap(err, "failed to iterate poll votes")
	}
	return votes, nil
}

func (d *DB) ReplacePollVotes(ctx context.Context, replace *store.ReplacePollVotes) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return errors.Wrap(err, "failed to begin poll vote transaction")
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, "DELETE FROM poll_vote WHERE memo_id = $1 AND user_id = $2 AND device_id = $3", replace.MemoID, replace.UserID, replace.DeviceID); err != nil {
		return errors.Wrap(err, "failed to clear poll votes")
	}
	for _, optionID := range replace.OptionIDs {
		if _, err := tx.ExecContext(ctx, "INSERT INTO poll_vote (memo_id, user_id, option_id, device_id) VALUES ($1, $2, $3, $4)", replace.MemoID, replace.UserID, optionID, replace.DeviceID); err != nil {
			return errors.Wrap(err, "failed to insert poll vote")
		}
	}
	if err := tx.Commit(); err != nil {
		return errors.Wrap(err, "failed to commit poll vote transaction")
	}
	return nil
}

func (d *DB) ClearPollVotes(ctx context.Context, memoID int32) error {
	if _, err := d.db.ExecContext(ctx, "DELETE FROM poll_vote WHERE memo_id = $1", memoID); err != nil {
		return errors.Wrap(err, "failed to clear poll votes")
	}
	return nil
}
