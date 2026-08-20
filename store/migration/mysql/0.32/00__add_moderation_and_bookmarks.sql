CREATE TABLE `moderation_report` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `creator_id` INT NOT NULL,
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` INT NOT NULL,
  `reason` TEXT NOT NULL,
  UNIQUE (`creator_id`, `target_type`, `target_id`),
  INDEX `idx_moderation_report_target` (`target_type`, `target_id`)
);

CREATE TABLE `moderation_quarantine` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` INT NOT NULL,
  `report_count` INT NOT NULL DEFAULT 0,
  `reason` TEXT NOT NULL,
  UNIQUE (`target_type`, `target_id`),
  INDEX `idx_moderation_quarantine_created_ts` (`created_ts`)
);

CREATE TABLE `memo_bookmark` (
  `user_id` INT NOT NULL,
  `memo_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  UNIQUE (`user_id`, `memo_id`),
  INDEX `idx_memo_bookmark_user` (`user_id`, `created_ts`)
);
