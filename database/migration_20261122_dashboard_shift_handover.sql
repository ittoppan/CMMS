-- Shift Handover table (idempotent)
CREATE TABLE IF NOT EXISTS `shift_handovers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `shift_date` DATE NOT NULL,
  `shift_code` VARCHAR(20) NOT NULL DEFAULT 'day',
  `pending_jobs` TEXT NULL,
  `incidents` TEXT NULL,
  `machines_watch` TEXT NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_shift_handovers_date` (`shift_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
