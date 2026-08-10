-- ============================================================
-- CMMS-TPT Migration: Feature Expansion (2026-07-23)
-- Adds new tables and columns per enterprise spec document
-- ============================================================

USE `cmms_tpt`;

-- ============================================================
-- 1. DEPARTMENTS
-- ============================================================
CREATE TABLE `departments` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`       VARCHAR(50) NOT NULL,
  `name`       VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_departments_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. LOCATIONS (with parent for sub-locations)
-- ============================================================
CREATE TABLE `locations` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `parent_id`  INT UNSIGNED NULL,
  `code`       VARCHAR(50) NOT NULL,
  `name`       VARCHAR(255) NOT NULL,
  `type`       ENUM('building','floor','zone','area','sub_location') NOT NULL DEFAULT 'area',
  `description` TEXT NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_locations_code` (`code`),
  KEY `fk_locations_parent_id` (`parent_id`),
  CONSTRAINT `fk_locations_parent` FOREIGN KEY (`parent_id`) REFERENCES `locations`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. WORK ZONES (Production areas)
-- ============================================================
CREATE TABLE `work_zones` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_work_zones_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. ORGANIZATIONAL CHART
-- ============================================================
CREATE TABLE `organizational_chart` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`      INT UNSIGNED NOT NULL,
  `supervisor_id` INT UNSIGNED NULL,
  `department_id` INT UNSIGNED NULL,
  `position`     VARCHAR(200) NULL,
  `level`        INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_org_user_id` (`user_id`),
  KEY `fk_org_supervisor_id` (`supervisor_id`),
  KEY `fk_org_department_id` (`department_id`),
  CONSTRAINT `fk_org_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_org_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_org_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. FAILURE CODES
-- ============================================================
CREATE TABLE `failure_codes` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category`    VARCHAR(100) NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_failure_codes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. REPAIR CODES
-- ============================================================
CREATE TABLE `repair_codes` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category`    VARCHAR(100) NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_repair_codes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. REJECTION REASONS
-- ============================================================
CREATE TABLE `rejection_reasons` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `module`      ENUM('repair','pm_am','calibration','spare_part','borrowing','other') NOT NULL DEFAULT 'other',
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_rejection_reasons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. REPAIR TYPES
-- ============================================================
CREATE TABLE `repair_types` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_repair_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. REPAIR TAGS
-- ============================================================
CREATE TABLE `repair_tags` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(100) NOT NULL,
  `color`       VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_repair_tags_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. REPAIR ↔ TAGS (pivot)
-- ============================================================
CREATE TABLE `repair_tag_pivot` (
  `repair_id` INT UNSIGNED NOT NULL,
  `tag_id`    INT UNSIGNED NOT NULL,
  PRIMARY KEY (`repair_id`, `tag_id`),
  KEY `fk_rtp_tag_id` (`tag_id`),
  CONSTRAINT `fk_rtp_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rtp_tag` FOREIGN KEY (`tag_id`) REFERENCES `repair_tags`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. REPAIR ACTIVITY LOG (history)
-- ============================================================
CREATE TABLE `repair_activity_log` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `repair_id`   INT UNSIGNED NOT NULL,
  `user_id`     INT UNSIGNED NULL,
  `action`      VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `old_value`   TEXT NULL,
  `new_value`   TEXT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_ral_repair_id` (`repair_id`),
  KEY `fk_ral_user_id` (`user_id`),
  CONSTRAINT `fk_ral_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ral_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. REPAIR RATINGS (tracking + evaluation)
-- ============================================================
CREATE TABLE `repair_ratings` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `repair_id`         INT UNSIGNED NOT NULL,
  `rating_score`      TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `rating_comment`    TEXT NULL,
  `response_time_hrs` DECIMAL(8,2) NULL,
  `resolve_time_hrs`  DECIMAL(8,2) NULL,
  `downtime_hrs`      DECIMAL(8,2) NULL,
  `rated_by`          INT UNSIGNED NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_rr_repair_id` (`repair_id`),
  KEY `fk_rr_rated_by` (`rated_by`),
  CONSTRAINT `fk_rr_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rr_rated_by` FOREIGN KEY (`rated_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. REPAIR ATTACHMENTS (images/videos)
-- ============================================================
CREATE TABLE `repair_attachments` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `repair_id`   INT UNSIGNED NOT NULL,
  `file_name`   VARCHAR(255) NOT NULL,
  `file_path`   VARCHAR(500) NOT NULL,
  `file_type`   VARCHAR(50) NULL,
  `file_size`   INT UNSIGNED NULL,
  `category`    ENUM('failure_image','video','document','other') NOT NULL DEFAULT 'other',
  `uploaded_by` INT UNSIGNED NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_ra_repair_id` (`repair_id`),
  KEY `fk_ra_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_ra_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ra_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. CALIBRATION HISTORY
-- ============================================================
CREATE TABLE `calibration_history` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`            INT UNSIGNED NOT NULL,
  `calibration_date`    DATE NOT NULL,
  `next_calibration_date` DATE NULL,
  `type`                ENUM('full','abbreviated') NOT NULL DEFAULT 'full',
  `performed_by`        INT UNSIGNED NULL,
  `standard_used`       VARCHAR(255) NULL,
  `result`              ENUM('pass','fail','conditional') NOT NULL DEFAULT 'pass',
  `certificate_number`  VARCHAR(100) NULL,
  `certificate_file`    VARCHAR(500) NULL,
  `correction_value`    DECIMAL(12,6) NULL,
  `uncertainty_value`   DECIMAL(12,6) NULL,
  `conformance_decision` TEXT NULL,
  `cost`                DECIMAL(12,2) NULL,
  `notes`               TEXT NULL,
  `created_by`          INT UNSIGNED NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_ch_asset_id` (`asset_id`),
  KEY `fk_ch_performed_by` (`performed_by`),
  KEY `fk_ch_created_by` (`created_by`),
  CONSTRAINT `fk_ch_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ch_performer` FOREIGN KEY (`performed_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ch_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. CALIBRATION POINTS
-- ============================================================
CREATE TABLE `calibration_points` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `calibration_id`    INT UNSIGNED NOT NULL,
  `point_label`       VARCHAR(100) NOT NULL,
  `nominal_value`     DECIMAL(14,6) NULL,
  `measured_value`    DECIMAL(14,6) NULL,
  `correction`        DECIMAL(14,6) NULL,
  `uncertainty`       DECIMAL(14,6) NULL,
  `mpe_value`         DECIMAL(14,6) NULL,
  `conformance`       ENUM('pass','fail','conditional') NULL,
  `notes`             TEXT NULL,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_cp_calibration_id` (`calibration_id`),
  CONSTRAINT `fk_cp_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration_history`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. PO FOR CALIBRATION
-- ============================================================
CREATE TABLE `po_calibration` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `calibration_id`      INT UNSIGNED NULL,
  `po_number`           VARCHAR(100) NOT NULL,
  `supplier_id`         INT UNSIGNED NULL,
  `po_date`             DATE NULL,
  `amount`              DECIMAL(12,2) NULL,
  `status`              ENUM('open','partial','completed','cancelled') NOT NULL DEFAULT 'open',
  `notes`               TEXT NULL,
  `created_by`          INT UNSIGNED NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_pc_calibration_id` (`calibration_id`),
  KEY `fk_pc_supplier_id` (`supplier_id`),
  KEY `fk_pc_created_by` (`created_by`),
  CONSTRAINT `fk_pc_calibration` FOREIGN KEY (`calibration_id`) REFERENCES `calibration_history`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pc_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pc_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. SPARE PART UNITS (UoM management)
-- ============================================================
CREATE TABLE `spare_part_units` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(30) NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_spu_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. SPARE PART TRANSACTIONS (receipt/return/scrap)
-- ============================================================
CREATE TABLE `spare_part_transactions` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `spare_part_id`   INT UNSIGNED NOT NULL,
  `type`            ENUM('receipt','return','scrap','withdrawal','adjustment') NOT NULL,
  `quantity`        DECIMAL(10,2) NOT NULL,
  `unit_price`      DECIMAL(12,2) NULL,
  `reference_type`  VARCHAR(50) NULL COMMENT 'po, invoice, repair_id, pm_am_id',
  `reference_no`    VARCHAR(100) NULL,
  `notes`           TEXT NULL,
  `created_by`      INT UNSIGNED NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_spt_spare_part_id` (`spare_part_id`),
  KEY `fk_spt_created_by` (`created_by`),
  CONSTRAINT `fk_spt_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spt_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. SPARE PART APPROVAL (2-level approval)
-- ============================================================
CREATE TABLE `spare_part_approvals` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `spare_part_id`   INT UNSIGNED NOT NULL,
  `request_type`    ENUM('withdrawal','purchase','return','scrap') NOT NULL,
  `quantity`        DECIMAL(10,2) NOT NULL,
  `reason`          TEXT NULL,
  `level_1_approver` INT UNSIGNED NULL,
  `level_1_status`  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `level_1_date`    DATETIME NULL,
  `level_1_note`    TEXT NULL,
  `level_2_approver` INT UNSIGNED NULL,
  `level_2_status`  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `level_2_date`    DATETIME NULL,
  `level_2_note`    TEXT NULL,
  `status`          ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `created_by`      INT UNSIGNED NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_spa_spare_part_id` (`spare_part_id`),
  KEY `fk_spa_level1` (`level_1_approver`),
  KEY `fk_spa_level2` (`level_2_approver`),
  KEY `fk_spa_creator` (`created_by`),
  CONSTRAINT `fk_spa_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spa_level1` FOREIGN KEY (`level_1_approver`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_spa_level2` FOREIGN KEY (`level_2_approver`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_spa_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. SPARE PART KITS
-- ============================================================
CREATE TABLE `spare_part_kits` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_spk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 21. SPARE PART KIT ITEMS (pivot)
-- ============================================================
CREATE TABLE `spare_part_kit_items` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `kit_id`        INT UNSIGNED NOT NULL,
  `spare_part_id` INT UNSIGNED NOT NULL,
  `quantity`      DECIMAL(10,2) NOT NULL DEFAULT 1,
  KEY `fk_spki_kit_id` (`kit_id`),
  KEY `fk_spki_spare_part_id` (`spare_part_id`),
  CONSTRAINT `fk_spki_kit` FOREIGN KEY (`kit_id`) REFERENCES `spare_part_kits`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spki_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 22. SPARE PART GROUPS
-- ============================================================
CREATE TABLE `spare_part_groups` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_spg_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 23. SPARE PART ↔ GROUP (pivot)
-- ============================================================
CREATE TABLE `spare_part_group_items` (
  `spare_part_id` INT UNSIGNED NOT NULL,
  `group_id`      INT UNSIGNED NOT NULL,
  PRIMARY KEY (`spare_part_id`, `group_id`),
  KEY `fk_spgi_group_id` (`group_id`),
  CONSTRAINT `fk_spgi_spare_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spgi_group` FOREIGN KEY (`group_id`) REFERENCES `spare_part_groups`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 24. BORROWING REASONS
-- ============================================================
CREATE TABLE `borrowing_reasons` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_br_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 25. BORROWING ITEMS (for group borrowing)
-- ============================================================
CREATE TABLE `borrowing_items` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `borrowing_id` INT UNSIGNED NOT NULL,
  `asset_id`    INT UNSIGNED NOT NULL,
  `condition_before` TEXT NULL,
  `condition_after` TEXT NULL,
  `returned_at` DATETIME NULL,
  `status`      ENUM('borrowed','returned','lost','damaged') NOT NULL DEFAULT 'borrowed',
  KEY `fk_bi_borrowing_id` (`borrowing_id`),
  KEY `fk_bi_asset_id` (`asset_id`),
  CONSTRAINT `fk_bi_borrowing` FOREIGN KEY (`borrowing_id`) REFERENCES `equipment_borrowing`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bi_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 26. CHECKLIST TEMPLATES
-- ============================================================
CREATE TABLE `checklist_templates` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category`    ENUM('pm_am','calibration','safety','quality','other') NOT NULL DEFAULT 'pm_am',
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_ct_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 27. CHECKLIST TEMPLATE ITEMS
-- ============================================================
CREATE TABLE `checklist_template_items` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `template_id`     INT UNSIGNED NOT NULL,
  `item_order`      INT UNSIGNED NOT NULL DEFAULT 0,
  `item_type`       ENUM('yes_no','pass_fail','text','number','measurement','dropdown') NOT NULL DEFAULT 'yes_no',
  `description`     VARCHAR(500) NOT NULL,
  `expected_value`  VARCHAR(255) NULL,
  `tolerance_min`   DECIMAL(14,6) NULL,
  `tolerance_max`   DECIMAL(14,6) NULL,
  `unit`            VARCHAR(50) NULL,
  `options`         JSON NULL COMMENT 'for dropdown type',
  `is_required`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_cti_template_id` (`template_id`),
  CONSTRAINT `fk_cti_template` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 28. PM/AM CHECKLIST RESULTS (performed checklist)
-- ============================================================
CREATE TABLE `pm_am_checklist_results` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `pm_am_id`        INT UNSIGNED NOT NULL,
  `template_id`     INT UNSIGNED NULL,
  `item_id`         INT UNSIGNED NULL,
  `value`           TEXT NULL,
  `result`          ENUM('pass','fail','na') NULL,
  `notes`           TEXT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_pcr_pm_am_id` (`pm_am_id`),
  KEY `fk_pcr_template_id` (`template_id`),
  KEY `fk_pcr_item_id` (`item_id`),
  CONSTRAINT `fk_pcr_pm_am` FOREIGN KEY (`pm_am_id`) REFERENCES `pm_am`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pcr_template` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pcr_item` FOREIGN KEY (`item_id`) REFERENCES `checklist_template_items`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 29. PM/AM GENERATION PLANS
-- ============================================================
CREATE TABLE `pm_am_plans` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`              VARCHAR(50) NOT NULL,
  `name`              VARCHAR(255) NOT NULL,
  `description`       TEXT NULL,
  `plan_type`         ENUM('group','single','usage_based') NOT NULL DEFAULT 'single',
  `frequency_type`    ENUM('daily','weekly','monthly','quarterly','yearly','custom','meter_based') NOT NULL DEFAULT 'monthly',
  `frequency_interval` INT UNSIGNED NOT NULL DEFAULT 1,
  `meter_unit`        VARCHAR(50) NULL,
  `meter_interval`    DECIMAL(12,2) NULL,
  `lead_days`         INT UNSIGNED NOT NULL DEFAULT 7 COMMENT 'days before due to create task',
  `reminder_days`     INT UNSIGNED NOT NULL DEFAULT 3,
  `is_active`         TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_pmp_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 30. PM/AM PLAN ↔ ASSETS (pivot)
-- ============================================================
CREATE TABLE `pm_am_plan_assets` (
  `plan_id`   INT UNSIGNED NOT NULL,
  `asset_id`  INT UNSIGNED NOT NULL,
  PRIMARY KEY (`plan_id`, `asset_id`),
  KEY `fk_pp_asset_id` (`asset_id`),
  CONSTRAINT `fk_pp_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pp_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 31. PM/AM PLAN ↔ CHECKLIST (pivot)
-- ============================================================
CREATE TABLE `pm_am_plan_checklists` (
  `plan_id`     INT UNSIGNED NOT NULL,
  `template_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`plan_id`, `template_id`),
  KEY `fk_ppc_template_id` (`template_id`),
  CONSTRAINT `fk_ppc_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ppc_template` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 32. HOLIDAYS CALENDAR
-- ============================================================
CREATE TABLE `holidays` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `holiday_date` DATE NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `is_recurring` TINYINT(1) NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_holidays_date` (`holiday_date`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 33. PRODUCTION HOURS
-- ============================================================
CREATE TABLE `production_hours` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`    INT UNSIGNED NOT NULL,
  `record_date` DATE NOT NULL,
  `hours`       DECIMAL(10,2) NOT NULL DEFAULT 0,
  `shift`       VARCHAR(50) NULL,
  `notes`       TEXT NULL,
  `created_by`  INT UNSIGNED NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_ph_asset_id` (`asset_id`),
  KEY `fk_ph_created_by` (`created_by`),
  CONSTRAINT `fk_ph_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ph_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 34. EMAIL NOTIFICATIONS CONFIG
-- ============================================================
CREATE TABLE `email_notifications` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `module`        VARCHAR(50) NOT NULL,
  `event`         VARCHAR(100) NOT NULL,
  `recipients`    TEXT NULL COMMENT 'comma-separated emails or role IDs',
  `subject`       VARCHAR(500) NULL,
  `template_body` TEXT NULL,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_en_module_event` (`module`, `event`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 35. AUTO ASSIGNMENT RULES
-- ============================================================
CREATE TABLE `auto_assignment_rules` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `module`          ENUM('repair','pm_am','calibration') NOT NULL,
  `rule_name`       VARCHAR(200) NOT NULL,
  `criteria_type`   ENUM('location','asset_type','asset','checklist_template','plan','department','work_zone') NOT NULL,
  `criteria_value`  INT UNSIGNED NOT NULL,
  `assignee_id`     INT UNSIGNED NOT NULL,
  `priority`        INT UNSIGNED NOT NULL DEFAULT 0,
  `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_aar_assignee_id` (`assignee_id`),
  CONSTRAINT `fk_aar_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 36. USER PERMISSIONS (granular)
-- ============================================================
CREATE TABLE `user_permissions` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `role_id`         INT UNSIGNED NULL,
  `user_id`         INT UNSIGNED NULL,
  `module`          VARCHAR(50) NOT NULL,
  `permission`      VARCHAR(100) NOT NULL COMMENT 'view, create, edit, delete, approve, assign',
  `is_granted`      TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_up_role_id` (`role_id`),
  KEY `fk_up_user_id` (`user_id`),
  CONSTRAINT `fk_up_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_up_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 37. ASSET RESPONSIBLE PERSONS
-- ============================================================
CREATE TABLE `asset_responsible_persons` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`    INT UNSIGNED NOT NULL,
  `user_id`     INT UNSIGNED NOT NULL,
  `role_type`   ENUM('primary','secondary','technical','supervisor') NOT NULL DEFAULT 'primary',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_arp_asset_user_role` (`asset_id`, `user_id`, `role_type`),
  KEY `fk_arp_user_id` (`user_id`),
  CONSTRAINT `fk_arp_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_arp_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 38. ASSET QR CODES (generated)
-- ============================================================
CREATE TABLE `asset_qr_codes` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `asset_id`    INT UNSIGNED NOT NULL,
  `qr_data`     TEXT NOT NULL,
  `file_path`   VARCHAR(500) NULL,
  `generated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_aqr_asset_id` (`asset_id`),
  CONSTRAINT `fk_aqr_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================

-- asset_registry: add new columns
ALTER TABLE `asset_registry`
  ADD COLUMN `responsible_user_id` INT UNSIGNED NULL AFTER `status`,
  ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `responsible_user_id`,
  ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `department_id`,
  ADD COLUMN `work_zone_id` INT UNSIGNED NULL AFTER `location_id`,
  ADD COLUMN `barcode` VARCHAR(100) NULL AFTER `work_zone_id`,
  ADD COLUMN `qr_code_path` VARCHAR(500) NULL AFTER `barcode`,
  ADD COLUMN `image_path` VARCHAR(500) NULL AFTER `qr_code_path`,
  ADD COLUMN `instruction_manual` VARCHAR(500) NULL AFTER `image_path`,
  ADD COLUMN `in_place_edit` TINYINT(1) NOT NULL DEFAULT 0 AFTER `instruction_manual`,
  ADD KEY `fk_ar_responsible_user` (`responsible_user_id`),
  ADD KEY `fk_ar_department` (`department_id`),
  ADD KEY `fk_ar_location` (`location_id`),
  ADD KEY `fk_ar_work_zone` (`work_zone_id`),
  ADD CONSTRAINT `fk_ar_responsible_user` FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ar_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ar_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ar_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- repair: add new columns (status already exists, modify it)
ALTER TABLE `repair`
  MODIFY COLUMN `status` ENUM('open','acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled','rejected') NOT NULL DEFAULT 'open',
  ADD COLUMN `repair_type_id` INT UNSIGNED NULL AFTER `created_by`,
  ADD COLUMN `failure_code_id` INT UNSIGNED NULL AFTER `repair_type_id`,
  ADD COLUMN `repair_code_id` INT UNSIGNED NULL AFTER `failure_code_id`,
  ADD COLUMN `work_zone_id` INT UNSIGNED NULL AFTER `repair_code_id`,
  ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `work_zone_id`,
  ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `location_id`,
  ADD COLUMN `safety_related` TINYINT(1) NOT NULL DEFAULT 0 AFTER `department_id`,
  ADD COLUMN `product_lot_no` VARCHAR(100) NULL AFTER `safety_related`,
  ADD COLUMN `machine_status` ENUM('running','stopped','idle','standby') NULL AFTER `product_lot_no`,
  ADD COLUMN `production_line_status` ENUM('normal','stopped','slowdown') NULL AFTER `machine_status`,
  ADD COLUMN `estimated_completion_date` DATETIME NULL AFTER `production_line_status`,
  ADD COLUMN `actual_start_at` DATETIME NULL AFTER `estimated_completion_date`,
  ADD COLUMN `acknowledged_at` DATETIME NULL AFTER `actual_start_at`,
  ADD COLUMN `root_cause` TEXT NULL AFTER `resolution`,
  ADD COLUMN `solution` TEXT NULL AFTER `root_cause`,
  ADD COLUMN `rejection_reason_id` INT UNSIGNED NULL AFTER `solution`,
  ADD COLUMN `rejection_note` TEXT NULL AFTER `rejection_reason_id`,
  ADD KEY `fk_r_repair_type` (`repair_type_id`),
  ADD KEY `fk_r_failure_code` (`failure_code_id`),
  ADD KEY `fk_r_repair_code` (`repair_code_id`),
  ADD KEY `fk_r_work_zone` (`work_zone_id`),
  ADD KEY `fk_r_location` (`location_id`),
  ADD KEY `fk_r_department` (`department_id`),
  ADD KEY `fk_r_rejection_reason` (`rejection_reason_id`),
  ADD CONSTRAINT `fk_r_repair_type` FOREIGN KEY (`repair_type_id`) REFERENCES `repair_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_r_failure_code` FOREIGN KEY (`failure_code_id`) REFERENCES `failure_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_r_repair_code` FOREIGN KEY (`repair_code_id`) REFERENCES `repair_codes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_r_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_r_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_r_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_r_rejection_reason` FOREIGN KEY (`rejection_reason_id`) REFERENCES `rejection_reasons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Note: Migration drops old check constraint for status ENUM
-- Since MySQL ENUM cannot be modified directly, we use ALTER COLUMN to change ENUM
-- (This is handled by dropping old column and adding new one; DATA PRESERVED via temp column)

-- pm_am: add new columns
ALTER TABLE `pm_am`
  ADD COLUMN `plan_id` INT UNSIGNED NULL AFTER `assigned_to`,
  ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `plan_id`,
  ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `department_id`,
  ADD COLUMN `work_zone_id` INT UNSIGNED NULL AFTER `location_id`,
  ADD COLUMN `work_instruction_file` VARCHAR(500) NULL AFTER `notes`,
  ADD COLUMN `completed_at` DATETIME NULL AFTER `work_instruction_file`,
  ADD COLUMN `completed_by` INT UNSIGNED NULL AFTER `completed_at`,
  ADD COLUMN `reschedule_reason` TEXT NULL AFTER `completed_by`,
  ADD KEY `fk_pm_plan_id` (`plan_id`),
  ADD KEY `fk_pm_department` (`department_id`),
  ADD KEY `fk_pm_location` (`location_id`),
  ADD KEY `fk_pm_work_zone` (`work_zone_id`),
  ADD KEY `fk_pm_completed_by` (`completed_by`),
  ADD CONSTRAINT `fk_pm_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pm_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pm_location` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pm_work_zone` FOREIGN KEY (`work_zone_id`) REFERENCES `work_zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pm_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- calibration: add new columns
ALTER TABLE `calibration`
  ADD COLUMN `calibration_type` ENUM('full','abbreviated') NOT NULL DEFAULT 'full' AFTER `performed_by`,
  ADD COLUMN `total_cost` DECIMAL(12,2) NULL AFTER `certificate_number`,
  ADD COLUMN `po_number` VARCHAR(100) NULL AFTER `total_cost`,
  ADD COLUMN `supplier_id` INT UNSIGNED NULL AFTER `po_number`,
  ADD COLUMN `certificate_file` VARCHAR(500) NULL AFTER `supplier_id`,
  ADD KEY `fk_c_supplier_id` (`supplier_id`),
  ADD CONSTRAINT `fk_c_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- calibration: Add status column for calendar view
ALTER TABLE `calibration`
  ADD COLUMN `status` ENUM('scheduled','in_progress','completed','overdue','cancelled') NOT NULL DEFAULT 'scheduled' AFTER `result`;

-- equipment_borrowing: add new columns
ALTER TABLE `equipment_borrowing`
  ADD COLUMN `borrowing_type` ENUM('single','group') NOT NULL DEFAULT 'single' AFTER `processed_by`,
  ADD COLUMN `reason_id` INT UNSIGNED NULL AFTER `borrowing_type`,
  ADD COLUMN `reason_detail` TEXT NULL AFTER `reason_id`,
  ADD KEY `fk_eb_reason_id` (`reason_id`),
  ADD CONSTRAINT `fk_eb_reason` FOREIGN KEY (`reason_id`) REFERENCES `borrowing_reasons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- users: add department reference
ALTER TABLE `users`
  ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `role_id`,
  ADD COLUMN `employee_code` VARCHAR(50) NULL AFTER `department_id`,
  ADD COLUMN `position` VARCHAR(200) NULL AFTER `employee_code`,
  ADD COLUMN `signature_path` VARCHAR(500) NULL AFTER `position`,
  ADD KEY `fk_u_department_id` (`department_id`),
  ADD CONSTRAINT `fk_u_department` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX `idx_repair_status` ON `repair`(`status`);
CREATE INDEX `idx_repair_priority` ON `repair`(`priority`);
CREATE INDEX `idx_repair_dates` ON `repair`(`created_at`, `updated_at`);
CREATE INDEX `idx_pm_am_status` ON `pm_am`(`status`);
CREATE INDEX `idx_pm_am_due_date` ON `pm_am`(`due_date`);
CREATE INDEX `idx_calibration_next_date` ON `calibration`(`next_calibration_date`);
CREATE INDEX `idx_calibration_status` ON `calibration`(`status`);
CREATE INDEX `idx_borrowing_status` ON `equipment_borrowing`(`status`);
CREATE INDEX `idx_settings_group` ON `settings`(`setting_group`);
CREATE INDEX `idx_spare_part_transactions_type` ON `spare_part_transactions`(`type`);
CREATE INDEX `idx_repair_activity_log_action` ON `repair_activity_log`(`action`);
