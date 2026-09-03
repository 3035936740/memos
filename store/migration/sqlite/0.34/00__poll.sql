CREATE TABLE poll_vote (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memo_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 0,
  option_id TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(memo_id, user_id, device_id, option_id)
);
CREATE INDEX idx_poll_vote_memo ON poll_vote(memo_id);
CREATE INDEX idx_poll_vote_user ON poll_vote(user_id, memo_id);
