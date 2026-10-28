CREATE TABLE IF NOT EXISTS style_pack (
 id VARCHAR(32) PRIMARY KEY, name_json TEXT NOT NULL, manifest_json TEXT NOT NULL,
 css_original TEXT NOT NULL, css_compiled TEXT NOT NULL, version VARCHAR(64) NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0, created_ts BIGINT NOT NULL, updated_ts BIGINT NOT NULL,
 installed_by INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS style_pack_resource (
 pack_id VARCHAR(32) NOT NULL, version VARCHAR(64) NOT NULL, name VARCHAR(255) NOT NULL,
 content_type VARCHAR(64) NOT NULL, content BYTEA NOT NULL, PRIMARY KEY(pack_id, version, name)
);
CREATE TABLE IF NOT EXISTS memo_import_job (
 id VARCHAR(64) PRIMARY KEY, user_id INTEGER NOT NULL, state VARCHAR(16) NOT NULL,
 source VARCHAR(255) NOT NULL, report TEXT NOT NULL, created_ts BIGINT NOT NULL,
 updated_ts BIGINT NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memo_import_lock (
 user_id INTEGER PRIMARY KEY, job_id VARCHAR(64) NOT NULL
);
CREATE TABLE IF NOT EXISTS memo_import_record (
 user_id INTEGER NOT NULL, source_hash VARCHAR(64) NOT NULL, source_id_hash VARCHAR(64) NOT NULL,
 source TEXT NOT NULL, source_id TEXT NOT NULL, memo_id INTEGER NOT NULL, job_id VARCHAR(64) NOT NULL,
 created_ts BIGINT NOT NULL, PRIMARY KEY(user_id, source_hash, source_id_hash)
);

CREATE INDEX idx_memo_import_job_lease ON memo_import_job(state, updated_ts);
