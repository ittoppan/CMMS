-- =====================================================================
-- migration_20260922_phase28_asset_reliability.sql  (Phase 28)
-- Asset Reliability & Lifecycle Management — แบบ ADDITIVE เท่านั้น
--
-- หมายเหตุ: ไฟล์นี้เป็น DOCUMENTATION ของ schema ที่ apply script สร้างให้
-- (scripts/apply_phase28_asset_reliability.php เป็นตัว execute ตัวจริง และ
--  มี logic idempotent ตรวจ information_schema — ห้ามรันไฟล์ SQL นี้ตรง ๆ
--  กับฐานข้อมูลที่ Apply script สร้างไว้แล้ว เพราะจะชนกับ object ที่มีอยู่)
-- =====================================================================

-- 1) EXTEND asset_registry -------------------------------------------------
ALTER TABLE asset_registry
  MODIFY COLUMN `criticality` ENUM('A','B','C','D') NOT NULL DEFAULT 'B'
  COMMENT 'A=สำคัญที่สุด … D=สำคัญน้อย (Phase 28)';

-- (extend เพิ่มคำนิยาม — ใช้กับความสำคัญประกอบ CM/รอบ PM/การเห็นข้อมูลรายงาน)

-- สถานะวงจรชีวิตของเครื่องจักร (ข้อมูลจริง ไม่ใช่การเดา)
ALTER TABLE asset_registry
  ADD COLUMN `lifecycle_status` ENUM('planned','procurement','installed','commissioned','operating','under_maintenance','overhauled','retired','disposed')
    NOT NULL DEFAULT 'operating'
    COMMENT 'สถานะวงจรชีวิต asset',
  ADD COLUMN `lifecycle_status_changed_at` DATETIME NULL,
  ADD COLUMN `lifecycle_status_reason` VARCHAR(500) NULL COMMENT 'เหตุผล/อ้างอิงตอนเปลี่ยน',
  ADD COLUMN `parent_asset_id` INT UNSIGNED NULL COMMENT 'เครื่องแม่ (self ref)',
  ADD COLUMN `installation_date` DATE NULL COMMENT 'วันที่ติดตั้ง',
  ADD COLUMN `commission_date` DATE NULL COMMENT 'วันที่เริ่มใช้งาน',
  ADD COLUMN `purchase_cost` DECIMAL(14,2) NULL,
  ADD COLUMN `installation_cost` DECIMAL(14,2) NULL,
  ADD COLUMN `expected_life_months` INT UNSIGNED NULL COMMENT 'อายุตามเอกสาร (ไม่ใช่ค่าคำนวณ)',
  ADD COLUMN `criticality_score` DECIMAL(6,2) NULL,
  ADD COLUMN `criticality_reviewed_at` DATETIME NULL,
  ADD COLUMN `next_criticality_review_date` DATE NULL;

ALTER TABLE asset_registry
  ADD KEY `idx_ar_lifecycle_status` (`lifecycle_status`),
  ADD KEY `idx_ar_parent_asset_id` (`parent_asset_id`),
  ADD KEY `idx_ar_criticality_score` (`criticality_score`),
  ADD KEY `idx_ar_next_criticality_review_date` (`next_criticality_review_date`),
  ADD KEY `idx_ar_installation_date` (`installation_date`);

-- 2) ประวัติวงจรชีวิต (append-only) -----------------------------------------
CREATE TABLE `asset_lifecycle_history` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`      INT UNSIGNED NOT NULL,
  `from_status`   VARCHAR(30) NULL,
  `to_status`     VARCHAR(30) NOT NULL,
  `reason`        VARCHAR(500) NULL,
  `changed_by`    INT UNSIGNED NULL,
  `source`        VARCHAR(30) NOT NULL DEFAULT 'manual' COMMENT 'manual|api|sage|auto',
  `reference`     VARCHAR(120) NULL COMMENT 'เลขอ้างอิง (เอกสาร/WO)',
  `changed_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alh_asset` (`asset_id`,`changed_at`),
  KEY `idx_alh_from_to` (`from_status`,`to_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) การประเมินความสำคัญ (version ต่อเนื่อง) --------------------------------
CREATE TABLE `asset_criticality` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`         INT UNSIGNED NOT NULL,
  `version`          INT UNSIGNED NOT NULL DEFAULT 1,
  `level`            ENUM('A','B','C','D') NOT NULL,
  `score`            DECIMAL(6,2) NULL,
  `factors_json`     JSON NULL COMMENT '{production,safety,quality,cost,downtime,frequency,redundancy}',
  `method`           VARCHAR(40) NOT NULL DEFAULT 'weighted',
  `review_note`      VARCHAR(500) NULL,
  `reviewed_by`      INT UNSIGNED NULL,
  `reviewed_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_review_date` DATE NULL,
  `is_current`       TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arc_asset_version` (`asset_id`,`version`),
  KEY `idx_arc_level` (`level`,`is_current`),
  KEY `idx_arc_current` (`asset_id`,`is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) ความสัมพันธ์ระหว่างเครื่องจักร ----------------------------------------
CREATE TABLE `asset_relationships` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`         INT UNSIGNED NOT NULL,
  `related_asset_id` INT UNSIGNED NOT NULL,
  `relation_type`    ENUM('parent','child','utility','support','connected','standby','linked') NOT NULL DEFAULT 'connected',
  `note`             VARCHAR(500) NULL,
  `created_by`       INT UNSIGNED NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arrel_pair` (`asset_id`,`related_asset_id`,`relation_type`),
  KEY `idx_arrel_related` (`related_asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) ส่วนประกอบของเครื่องจักร ---------------------------------------------
CREATE TABLE `asset_components` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`           INT UNSIGNED NOT NULL,
  `component_code`     VARCHAR(80) NOT NULL,
  `name`               VARCHAR(255) NOT NULL,
  `category`           VARCHAR(80) NULL,
  `manufacturer`       VARCHAR(120) NULL,
  `model`              VARCHAR(120) NULL,
  `serial_number`      VARCHAR(120) NULL,
  `position`           VARCHAR(120) NULL,
  `install_date`       DATE NULL,
  `expected_life_months` INT UNSIGNED NULL,
  `status`             ENUM('active','installed','repaired','replaced','retired') NOT NULL DEFAULT 'active',
  `notes`              TEXT NULL,
  `created_by`         INT UNSIGNED NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_arcmp_asset_code` (`asset_id`,`component_code`),
  KEY `idx_arcmp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) ประวัติการเปลี่ยนชิ้นส่วน (append-only) --------------------------------
CREATE TABLE `component_replacements` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `component_id`    INT UNSIGNED NOT NULL,
  `asset_id`        INT UNSIGNED NOT NULL,
  `replaced_at`     DATETIME NOT NULL,
  `reason`          VARCHAR(500) NULL,
  `old_serial`      VARCHAR(120) NULL,
  `new_serial`      VARCHAR(120) NULL,
  `cost`            DECIMAL(14,2) NULL,
  `warranty_expiry` DATE NULL,
  `wo_id`           INT UNSIGNED NULL,
  `performed_by`    INT UNSIGNED NULL,
  `reference_doc`   VARCHAR(120) NULL,
  `notes`           TEXT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_asset` (`asset_id`,`replaced_at`),
  KEY `idx_cr_component` (`component_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7) งานยกเครื่อง / Overhaul -----------------------------------------------
CREATE TABLE `asset_overhauls` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`       INT UNSIGNED NOT NULL,
  `overhaul_code`  VARCHAR(50) NOT NULL,
  `title`          VARCHAR(255) NOT NULL,
  `reason`         VARCHAR(500) NULL,
  `scope`          TEXT NULL,
  `planned_start`  DATETIME NULL,
  `actual_start`   DATETIME NULL,
  `planned_end`    DATETIME NULL,
  `actual_end`     DATETIME NULL,
  `cost`           DECIMAL(14,2) NULL,
  `status`         ENUM('planned','in_progress','completed','cancelled','on_hold') NOT NULL DEFAULT 'planned',
  `findings`       TEXT NULL,
  `recommendation` TEXT NULL,
  `verified_by`    INT UNSIGNED NULL,
  `verified_at`    DATETIME NULL,
  `wo_id`          INT UNSIGNED NULL,
  `created_by`     INT UNSIGNED NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oh_code` (`overhaul_code`),
  KEY `idx_oh_asset_status` (`asset_id`,`status`,`actual_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8) ค่าวัดสภาพ asset (manual — ไม่ซ้ำ inspection_measurements) -------------
CREATE TABLE `asset_measurements` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`      INT UNSIGNED NOT NULL,
  `parameter`     VARCHAR(255) NOT NULL,
  `value_numeric` DECIMAL(18,6) NOT NULL,
  `unit`          VARCHAR(50) NULL,
  `method`        VARCHAR(120) NULL,
  `measured_at`   DATETIME NOT NULL,
  `measured_by`   INT UNSIGNED NULL,
  `notes`         TEXT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_am_asset_param` (`asset_id`,`parameter`,`measured_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9) settings (เป็น seed — apply script upsert เอง) ------------------------
-- ar_criticality_w_* , ar_criticality_threshold_*, ar_criticality_review_days,
-- ar_criticality_auto_apply, ar_min_failures_for_mtbf, ar_reliability_window_months,
-- ar_health_window_months, ar_retirement_min_age_years, ar_overhaul_reminder_days,
-- ar_replacement_review_notes  -> ดู scripts/apply_phase28_asset_reliability.php

-- 10) notification_templates + menu_permissions -> ดู apply script เดียวกัน