CREATE TABLE moderation_report_adjustment (
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  adjustment INTEGER NOT NULL DEFAULT 0,
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  UNIQUE(target_type, target_id)
);
