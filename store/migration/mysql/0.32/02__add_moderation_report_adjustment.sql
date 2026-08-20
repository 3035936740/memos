CREATE TABLE `moderation_report_adjustment` (
  `target_type` VARCHAR(32) NOT NULL,
  `target_id` INT NOT NULL,
  `adjustment` INT NOT NULL DEFAULT 0,
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  UNIQUE (`target_type`, `target_id`)
);
