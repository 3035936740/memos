CREATE TABLE moderation_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  creator_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  UNIQUE(creator_id, target_type, target_id)
);

CREATE INDEX idx_moderation_report_target ON moderation_report(target_type, target_id);

CREATE TABLE moderation_quarantine (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  report_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  UNIQUE(target_type, target_id)
);

CREATE INDEX idx_moderation_quarantine_created_ts ON moderation_quarantine(created_ts DESC);

CREATE TABLE memo_bookmark (
  user_id INTEGER NOT NULL,
  memo_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, memo_id)
);

CREATE INDEX idx_memo_bookmark_user ON memo_bookmark(user_id, created_ts DESC);
