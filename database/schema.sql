-- ============================================================
-- CMMS-TPT Database Schema
-- Computerized Maintenance Management System
-- 12 Modules with Foreign Key Relationships
-- ============================================================

CREATE DATABASE IF NOT EXISTS `cmms_tpt`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `cmms_tpt`;

-- -----------------------------------------------------------
-- 1. roles
-- -----------------------------------------------------------
CREATE TABLE `roles` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2. users
-- -----------------------------------------------------------
CREATE TABLE `users` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `role_id`    INT UNSIGNED NULL,
  `username`   VARCHAR(50) NOT NULL,
  `email`      VARCHAR(255) NOT NULL,
  `password`   VARCHAR(255) NOT NULL,
  `full_name`  VARCHAR(200) NOT NULL,
  `phone`      VARCHAR(20) NULL,
  `avatar`     VARCHAR(500) NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_users_username` (`username`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `fk_users_role_id` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3. suppliers
-- -----------------------------------------------------------
CREATE TABLE `suppliers` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`           VARCHAR(50) NOT NULL,
  `name`           VARCHAR(255) NOT NULL,
  `contact_person` VARCHAR(200) NULL,
  `email`          VARCHAR(255) NULL,
  `phone`          VARCHAR(20) NULL,
  `address`        TEXT NULL,
  `tax_id`         VARCHAR(50) NULL,
  `is_active`      TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_suppliers_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4. asset_registry
-- -----------------------------------------------------------
CREATE TABLE `asset_registry` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`            VARCHAR(50) NOT NULL,
  `name`            VARCHAR(255) NOT NULL,
  `description`     TEXT NULL,
  `category`        VARCHAR(100) NULL,
  `location`        VARCHAR(255) NULL,
  `department`      VARCHAR(100) NULL,
  `manufacturer`    VARCHAR(200) NULL,
  `model`           VARCHAR(200) NULL,
  `serial_number`   VARCHAR(200) NULL,
  `purchase_date`   DATE NULL,
  `warranty_expiry` DATE NULL,
  `status`          ENUM('active','inactive','disposed','under_repair') NOT NULL DEFAULT 'active',
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_asset_code` (`code`),
  UNIQUE KEY `uk_asset_serial` (`serial_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 5. spare_parts
-- -----------------------------------------------------------
CREATE TABLE `spare_parts` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `supplier_id`  INT UNSIGNED NULL,
  `code`         VARCHAR(50) NOT NULL,
  `name`         VARCHAR(255) NOT NULL,
  `description`  TEXT NULL,
  `category`     VARCHAR(100) NULL,
  `unit`         VARCHAR(30) NOT NULL DEFAULT 'ชิ้น',
  `stock_qty`    DECIMAL(10,2) NOT NULL DEFAULT 0,
  `min_stock`    DECIMAL(10,2) NOT NULL DEFAULT 0,
  `max_stock`    DECIMAL(10,2) NOT NULL DEFAULT 0,
  `location`     VARCHAR(100) NULL,
  `unit_price`   DECIMAL(12,2) NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_spare_parts_code` (`code`),
  KEY `fk_spare_parts_supplier_id` (`supplier_id`),
  CONSTRAINT `fk_spare_parts_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 6. repair (Work Orders)
-- -----------------------------------------------------------
CREATE TABLE `repair` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`       INT UNSIGNED NOT NULL,
  `assigned_to`    INT UNSIGNED NULL,
  `created_by`     INT UNSIGNED NULL,
  `priority`       ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status`         ENUM('open','in_progress','waiting_parts','resolved','closed','cancelled') NOT NULL DEFAULT 'open',
  `title`          VARCHAR(255) NOT NULL,
  `description`    TEXT NULL,
  `failure_report` TEXT NULL,
  `diagnosis`      TEXT NULL,
  `resolution`     TEXT NULL,
  `downtime_start` DATETIME NULL,
  `downtime_end`   DATETIME NULL,
  `cost_parts`     DECIMAL(12,2) NOT NULL DEFAULT 0,
  `cost_labor`     DECIMAL(12,2) NOT NULL DEFAULT 0,
  `notes`          TEXT NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_repair_asset_id` (`asset_id`),
  KEY `fk_repair_assigned_to` (`assigned_to`),
  KEY `fk_repair_created_by` (`created_by`),
  CONSTRAINT `fk_repair_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_repair_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 7. pm_am (Preventive / Predictive Maintenance)
-- -----------------------------------------------------------
CREATE TABLE `pm_am` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`         INT UNSIGNED NOT NULL,
  `assigned_to`      INT UNSIGNED NULL,
  `title`            VARCHAR(255) NOT NULL,
  `description`      TEXT NULL,
  `frequency_type`   ENUM('daily','weekly','monthly','quarterly','yearly','custom') NOT NULL DEFAULT 'monthly',
  `frequency_interval` INT UNSIGNED NOT NULL DEFAULT 1,
  `due_date`         DATE NULL,
  `last_done_date`   DATE NULL,
  `status`           ENUM('pending','in_progress','completed','overdue','skipped') NOT NULL DEFAULT 'pending',
  `checklist`        JSON NULL,
  `notes`            TEXT NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_pm_am_asset_id` (`asset_id`),
  KEY `fk_pm_am_assigned_to` (`assigned_to`),
  CONSTRAINT `fk_pm_am_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pm_am_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 8. calibration
-- -----------------------------------------------------------
CREATE TABLE `calibration` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`            INT UNSIGNED NOT NULL,
  `performed_by`        INT UNSIGNED NULL,
  `calibration_date`    DATE NOT NULL,
  `next_calibration_date` DATE NULL,
  `standard_used`       VARCHAR(255) NULL,
  `result`              ENUM('pass','fail','conditional') NOT NULL DEFAULT 'pass',
  `measurement_values`  JSON NULL,
  `certificate_number`  VARCHAR(100) NULL,
  `notes`               TEXT NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_calibration_asset_id` (`asset_id`),
  KEY `fk_calibration_performed_by` (`performed_by`),
  CONSTRAINT `fk_calibration_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_calibration_performer` FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 9. equipment_borrowing
-- -----------------------------------------------------------
CREATE TABLE `equipment_borrowing` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`            INT UNSIGNED NOT NULL,
  `borrower_id`         INT UNSIGNED NOT NULL,
  `processed_by`        INT UNSIGNED NULL,
  `borrow_date`         DATETIME NOT NULL,
  `expected_return_date` DATE NULL,
  `actual_return_date`  DATETIME NULL,
  `purpose`             TEXT NULL,
  `condition_before`    TEXT NULL,
  `condition_after`     TEXT NULL,
  `status`              ENUM('borrowed','returned','overdue','lost') NOT NULL DEFAULT 'borrowed',
  `notes`               TEXT NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_borrowing_asset_id` (`asset_id`),
  KEY `fk_borrowing_borrower_id` (`borrower_id`),
  KEY `fk_borrowing_processed_by` (`processed_by`),
  CONSTRAINT `fk_borrowing_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_borrowing_borrower` FOREIGN KEY (`borrower_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_borrowing_processor` FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 10. manuals
-- -----------------------------------------------------------
CREATE TABLE `manuals` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`    INT UNSIGNED NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `file_path`   VARCHAR(500) NOT NULL,
  `file_type`   VARCHAR(50) NULL,
  `version`     VARCHAR(30) NULL,
  `uploaded_by` INT UNSIGNED NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_manuals_asset_id` (`asset_id`),
  KEY `fk_manuals_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_manuals_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_manuals_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 11. mtbf_mttr (Reliability Metrics)
-- -----------------------------------------------------------
CREATE TABLE `mtbf_mttr` (
  `id`                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`              INT UNSIGNED NOT NULL,
  `year`                  SMALLINT UNSIGNED NOT NULL,
  `month`                 TINYINT UNSIGNED NOT NULL,
  `operating_hours`       DECIMAL(10,2) NOT NULL DEFAULT 0,
  `total_failures`        INT UNSIGNED NOT NULL DEFAULT 0,
  `total_downtime_minutes` INT UNSIGNED NOT NULL DEFAULT 0,
  `mtbf_hours`            DECIMAL(10,2) NULL,
  `mttr_minutes`          DECIMAL(10,2) NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_mtbf_asset_period` (`asset_id`, `year`, `month`),
  CONSTRAINT `fk_mtbf_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 12. settings
-- -----------------------------------------------------------
CREATE TABLE `settings` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `setting_key`   VARCHAR(100) NOT NULL,
  `setting_value` TEXT NULL,
  `setting_group` VARCHAR(100) NOT NULL DEFAULT 'general',
  `description`   TEXT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_settings_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- Pivot: repair_spare_parts (repair ↔ spare_parts)
-- -----------------------------------------------------------
CREATE TABLE `repair_spare_parts` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `repair_id`     INT UNSIGNED NOT NULL,
  `spare_part_id` INT UNSIGNED NOT NULL,
  `quantity_used` DECIMAL(10,2) NOT NULL DEFAULT 1,
  `unit_price`    DECIMAL(12,2) NULL,
  KEY `fk_rsp_repair_id` (`repair_id`),
  KEY `fk_rsp_spare_part_id` (`spare_part_id`),
  CONSTRAINT `fk_rsp_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rsp_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- Pivot: pm_am_spare_parts (pm_am ↔ spare_parts)
-- -----------------------------------------------------------
CREATE TABLE `pm_am_spare_parts` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `pm_am_id`      INT UNSIGNED NOT NULL,
  `spare_part_id` INT UNSIGNED NOT NULL,
  `quantity_used` DECIMAL(10,2) NOT NULL DEFAULT 1,
  `unit_price`    DECIMAL(12,2) NULL,
  KEY `fk_psp_pm_am_id` (`pm_am_id`),
  KEY `fk_psp_spare_part_id` (`spare_part_id`),
  CONSTRAINT `fk_psp_pm_am` FOREIGN KEY (`pm_am_id`) REFERENCES `pm_am`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_psp_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
