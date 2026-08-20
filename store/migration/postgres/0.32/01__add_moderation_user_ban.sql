CREATE TABLE moderation_user_ban (
  user_id INTEGER PRIMARY KEY,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  expires_ts BIGINT NOT NULL DEFAULT 0,
  strike_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_moderation_user_ban_expiry ON moderation_user_ban(active, expires_ts);
