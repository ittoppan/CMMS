CREATE TABLE IF NOT EXISTS `lubrication_points` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `asset_id` INT UNSIGNED NULL,
  `interval_days` INT UNSIGNED NOT NULL DEFAULT 30,
  `last_done` DATE NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_lub_asset` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lubrication_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `point_id` INT UNSIGNED NOT NULL,
  `done_date` DATE NOT NULL,
  `notes` TEXT NULL,
  `done_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_lublog_point` (`point_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
