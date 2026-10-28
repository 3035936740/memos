CREATE TABLE IF NOT EXISTS attachment_cleanup (
 attachment_id INTEGER PRIMARY KEY, snapshot TEXT NOT NULL, attempted_ts BIGINT NOT NULL DEFAULT 0
);
