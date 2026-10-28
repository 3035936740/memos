ALTER TABLE memo ADD COLUMN deleted_ts BIGINT DEFAULT NULL;
ALTER TABLE memo ADD COLUMN last_editor_id INTEGER DEFAULT NULL;
CREATE INDEX idx_memo_deleted_creator ON memo(deleted_ts, creator_id, id);
CREATE TABLE IF NOT EXISTS memo_revision (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, memo_id INTEGER NOT NULL, editor_id INTEGER NOT NULL,
 saved_by INTEGER NOT NULL, created_ts BIGINT NOT NULL,
 content TEXT NOT NULL, payload TEXT NOT NULL, visibility VARCHAR(32) NOT NULL
);
CREATE INDEX idx_memo_revision_memo ON memo_revision(memo_id, created_ts DESC, id DESC);
CREATE INDEX idx_space_access_id ON space(access_mode, id);
