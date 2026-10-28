CREATE TABLE IF NOT EXISTS style_pack_resource_chunk (
 pack_id VARCHAR(32) NOT NULL, version VARCHAR(64) NOT NULL, name TEXT NOT NULL,
 chunk_index INTEGER NOT NULL, content BLOB NOT NULL,
 PRIMARY KEY(pack_id, version, name, chunk_index)
);
