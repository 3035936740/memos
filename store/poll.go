package store

import (
	"context"
	"errors"
)

var (
	ErrPollNotFound       = errors.New("poll not found")
	ErrPollPermission     = errors.New("poll permission denied")
	ErrPollClosed         = errors.New("poll is not accepting votes")
	ErrPollInvalidChoices = errors.New("invalid poll choices")
)

// PollVote is one selected poll option. A row is unique per user and option.
type PollVote struct {
	MemoID   int32
	UserID   int32
	OptionID string
	DeviceID string
}

// PollVoter contains one sampled participant and their selected choices.
type PollVoter struct {
	UserID    int32
	OptionIDs []string
}

// ListPollVotesByVoter fetches only the current viewer's ballot.
func (s *Store) ListPollVotesByVoter(ctx context.Context, memoID, userID int32, deviceID string) ([]*PollVote, error) {
	if memoID <= 0 {
		return nil, errors.New("memo id is required")
	}
	if userID <= 0 && deviceID == "" {
		return nil, nil
	}
	return s.driver.ListPollVotesByVoter(ctx, memoID, userID, deviceID)
}

// CountPollVotes aggregates choices in the database without loading voter records.
func (s *Store) CountPollVotes(ctx context.Context, memoID int32) (map[string]int32, error) {
	if memoID <= 0 {
		return nil, errors.New("memo id is required")
	}
	return s.driver.CountPollVotes(ctx, memoID)
}

// SamplePollVoters fetches at most eleven unique participants to detect overflow.
func (s *Store) SamplePollVoters(ctx context.Context, memoID int32, limit int) ([]*PollVoter, error) {
	if memoID <= 0 {
		return nil, errors.New("memo id is required")
	}
	if limit < 1 || limit > 11 {
		return nil, errors.New("poll participant sample must be between 1 and 11")
	}
	return s.driver.SamplePollVoters(ctx, memoID, limit)
}

// ReplacePollVotes replaces all choices submitted by one user atomically.
type ReplacePollVotes struct {
	MemoID    int32
	UserID    int32
	OptionIDs []string
	DeviceID  string
}

func (s *Store) ListPollVotes(ctx context.Context, memoID int32) ([]*PollVote, error) {
	if memoID <= 0 {
		return nil, errors.New("memo id is required")
	}
	return s.driver.ListPollVotes(ctx, memoID)
}

func (s *Store) ReplacePollVotes(ctx context.Context, replace *ReplacePollVotes) error {
	if replace == nil || replace.MemoID <= 0 || replace.UserID < 0 {
		return errors.New("poll vote replacement requires memo and voter")
	}
	if replace.UserID == 0 && replace.DeviceID == "" {
		return errors.New("guest poll vote requires device")
	}
	if len(replace.OptionIDs) == 0 {
		return ErrPollInvalidChoices
	}
	return s.driver.ReplacePollVotes(ctx, replace)
}

func (s *Store) ClearPollVotes(ctx context.Context, memoID int32) error {
	if memoID <= 0 {
		return errors.New("memo id is required")
	}
	return s.driver.ClearPollVotes(ctx, memoID)
}
