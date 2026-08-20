CREATE TABLE `moderation_user_ban` (
  `user_id` INT NOT NULL PRIMARY KEY,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `expires_ts` BIGINT NOT NULL DEFAULT 0,
  `strike_count` INT NOT NULL DEFAULT 0,
  `source` VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX `idx_moderation_user_ban_expiry` (`active`, `expires_ts`)
);
