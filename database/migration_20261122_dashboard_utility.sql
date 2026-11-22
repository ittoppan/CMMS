CREATE TABLE IF NOT EXISTS `utility_readings` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `utility_type` VARCHAR(30) NOT NULL,
  `reading_date` DATE NOT NULL,
  `value` DECIMAL(18,4) NOT NULL,
  `unit` VARCHAR(20) NULL,
  `notes` TEXT NULL,
  `recorded_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_utility_date` (`reading_date`),
  KEY `idx_utility_type` (`utility_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
