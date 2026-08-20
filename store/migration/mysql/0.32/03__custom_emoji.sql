CREATE TABLE `emoji_group` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `name` VARCHAR(128) NOT NULL UNIQUE
);

CREATE TABLE `emoji` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `name` VARCHAR(128) NOT NULL,
  `filename` VARCHAR(320) NOT NULL UNIQUE,
  `type` VARCHAR(128) NOT NULL,
  `size` BIGINT NOT NULL DEFAULT 0,
  `storage_type` VARCHAR(32) NOT NULL,
  `reference` TEXT NOT NULL,
  `storage_id` VARCHAR(256) NOT NULL DEFAULT '',
  `storage_key` TEXT NOT NULL,
  `blob` MEDIUMBLOB,
  UNIQUE (`group_id`, `name`),
  INDEX `idx_emoji_group_id` (`group_id`, `id`)
);
