CREATE TABLE emoji_group (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE emoji (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  name TEXT NOT NULL,
  filename TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  storage_type TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  storage_id TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL DEFAULT '',
  blob BLOB DEFAULT NULL,
  UNIQUE(group_id, name)
);
CREATE INDEX idx_emoji_group_id ON emoji(group_id, id);
