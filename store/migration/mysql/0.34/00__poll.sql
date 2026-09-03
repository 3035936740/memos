CREATE TABLE `poll_vote` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `memo_id` INT NOT NULL,
  `user_id` INT NOT NULL DEFAULT 0,
  `option_id` VARCHAR(128) NOT NULL,
  `device_id` VARCHAR(128) NOT NULL DEFAULT '',
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  UNIQUE (`memo_id`, `user_id`, `device_id`, `option_id`),
  INDEX `idx_poll_vote_memo` (`memo_id`),
  INDEX `idx_poll_vote_user` (`user_id`, `memo_id`)
);
