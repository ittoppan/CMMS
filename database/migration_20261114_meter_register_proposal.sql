-- migration_20261114_meter_register_proposal.sql
-- PROPOSAL ONLY — DO NOT RUN WITHOUT EXPLICIT APPROVAL.
-- Purpose: full meter register for water/electricity/other meters, multi-meter per asset,
--          linkable to meter-based PM plans, and foundation for import/automated readings.
-- Notes:
--   - Review column types/collation/engine against existing schema (assets, pm_am_plans, users).
--   - Adjust FK names/actions to match conventions; ensure referenced tables/columns exist.
--   - Consider backward compatibility with asset_measurements and src/helpers/pm_meter.php.
--   - Perform backup and staging verification before applying in production.

-- 1) Meter registry per asset
CREATE TABLE IF NOT EXISTS `asset_meters` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id` INT NOT NULL,
  `meter_code` VARCHAR(64) NOT NULL,
  `meter_type` VARCHAR(32) NOT NULL COMMENT 'electric|water|runtime_hours|other',
  `name` VARCHAR(191) NOT NULL,
  `serial_number` VARCHAR(191) NULL,
  `location_note` VARCHAR(255) NULL,
  `unit` VARCHAR(32) NOT NULL COMMENT 'e.g. kWh, m³, ชั่วโมง',
  `reading_mode` VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'manual|import|sensor',
  `multiplier` DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  `rollover_value` DECIMAL(18,4) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `installed_at` DATE NULL,
  `retired_at` DATE NULL,
  `metadata_json` JSON NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_asset_meters_asset_active` (`asset_id`, `is_active`),
  KEY `idx_asset_meters_type` (`meter_type`),
  UNIQUE KEY `uq_asset_meters_asset_code` (`asset_id`, `meter_code`)
  -- ,CONSTRAINT `fk_asset_meters_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE
  -- ,CONSTRAINT `fk_asset_meters_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) (Optional, recommended) Dedicated meter readings linked to registry
CREATE TABLE IF NOT EXISTS `asset_meter_readings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `meter_id` INT UNSIGNED NOT NULL,
  `asset_id` INT NOT NULL,
  `reading_value` DECIMAL(18,4) NOT NULL,
  `delta_value` DECIMAL(18,4) NULL,
  `unit` VARCHAR(32) NOT NULL,
  `read_at` DATETIME NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'manual|import|api',
  `source_ref` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `recorded_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_meter_readings_meter_readat` (`meter_id`, `read_at`),
  KEY `idx_meter_readings_asset_readat` (`asset_id`, `read_at`)
  -- ,CONSTRAINT `fk_meter_readings_meter` FOREIGN KEY (`meter_id`) REFERENCES `asset_meters`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) (Optional) Import batches for traceability
CREATE TABLE IF NOT EXISTS `asset_meter_import_batches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_name` VARCHAR(191) NULL,
  `file_name` VARCHAR(255) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending|completed|failed|partial',
  `total_rows` INT NOT NULL DEFAULT 0,
  `ok_rows` INT NOT NULL DEFAULT 0,
  `error_rows` INT NOT NULL DEFAULT 0,
  `summary_json` JSON NULL,
  `created_by` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Link PM plans to registered meter (nullable for backward compatibility)
-- ALTER TABLE `pm_am_plans`
--   ADD COLUMN `meter_id` INT UNSIGNED NULL AFTER `meter_unit`,
--   ADD KEY `idx_pm_am_plans_meter_id` (`meter_id`);
--   -- ADD CONSTRAINT `fk_pm_am_plans_meter` FOREIGN KEY (`meter_id`) REFERENCES `asset_meters`(`id`) ON DELETE SET NULL;

-- 5) Backfill / application logic (to be implemented separately, with validation):
--   - Infer/create asset_meters from existing meter-based plans (group by asset_id + meter_unit/type).
--   - Set pm_am_plans.meter_id where unambiguous; leave NULL where manual review required.
--   - Update src/helpers/pm_meter.php and related APIs/UI to prefer meter_id, fallback to legacy matching.
--   - Decide dual-write/read strategy with asset_measurements during transition.
-- END PROPOSAL
