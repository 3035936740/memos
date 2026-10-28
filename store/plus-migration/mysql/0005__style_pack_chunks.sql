CREATE TABLE IF NOT EXISTS style_pack_resource_chunk (
 pack_id VARCHAR(32) NOT NULL, version VARCHAR(64) NOT NULL, name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 chunk_index INTEGER NOT NULL, content MEDIUMBLOB NOT NULL,
 PRIMARY KEY(pack_id, version, name, chunk_index)
);
