CREATE TABLE moderation_user_ban (
  user_id INTEGER PRIMARY KEY,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  expires_ts BIGINT NOT NULL DEFAULT 0,
  strike_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_moderation_user_ban_expiry ON moderation_user_ban(active, expires_ts);
