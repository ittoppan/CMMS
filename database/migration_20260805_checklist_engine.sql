-- ============================================================
-- CMMS-TPT Migration 20260805 · Checklist Engine (ตรวจเช็ครอบ)
-- ครอบคลุมแบบฟอร์ม F-EN-07/08/09/14/15/19/26/33/49/50/53/54/58/59/60/61/62/63
--   - inspection_templates      : template เช็คกลาง (อิสระจากแผน PM)
--   - inspection_template_items : รายการตรวจภายใน template
--   - inspection_schedules      : รอบตรวจ (template + เครื่อง + due)
--   - inspection_results        : ผลตรวจรายข้อ
--   - inspection_fail_actions   : งานซ่อมที่ระบบสร้างอัตโนมัติจากรายการ Fail
-- ============================================================

USE `cmms_tpt`;

-- ------------------------------------------------------------
-- 1. Templates (หัวข้อเช็ค เช่น "CCTV รายวัน", "Fire Pump Check", "แก๊สหุงต้ม")
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspection_templates` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`        VARCHAR(50)  NOT NULL,
  `title`       VARCHAR(255) NOT NULL,
  `category`    VARCHAR(100) NULL,
  `description` TEXT NULL,
  `frequency`   ENUM('daily','weekly','monthly','quarterly','yearly','one_time') NOT NULL DEFAULT 'monthly',
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`  INT UNSIGNED NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_it_code` (`code`),
  KEY `fk_it_created_by` (`created_by`),
  CONSTRAINT `fk_it_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. รายการตรวจใน template (ข้อความตรวจ / ค่าตัวเลขพร้อมเกณฑ์)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspection_template_items` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `template_id` INT UNSIGNED NOT NULL,
  `seq`         INT UNSIGNED NOT NULL DEFAULT 0,
  `task`        VARCHAR(500) NOT NULL,
  `type`        ENUM('check','value') NOT NULL DEFAULT 'check',
  `standard`    VARCHAR(255) NULL,
  `min_value`   DECIMAL(12,2) NULL,
  `max_value`   DECIMAL(12,2) NULL,
  `unit`        VARCHAR(20) NULL,
  `is_required` TINYINT(1) NOT NULL DEFAULT 1,
  KEY `fk_iti_template` (`template_id`),
  CONSTRAINT `fk_iti_template` FOREIGN KEY (`template_id`) REFERENCES `inspection_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. รอบตรวจ (schedule) — หนึ่งรอบ = template + เครื่อง + กำหนดทำ
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspection_schedules` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `template_id`  INT UNSIGNED NOT NULL,
  `asset_id`     INT UNSIGNED NOT NULL,
  `assignee_id`  INT UNSIGNED NULL,
  `due_date`     DATE NULL,
  `period_start` DATE NULL,
  `period_end`   DATE NULL,
  `status`       ENUM('pending','in_progress','completed','overdue','skipped') NOT NULL DEFAULT 'pending',
  `result`       ENUM('pass','fail') NULL,
  `fail_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  `completed_by` INT UNSIGNED NULL,
  `completed_at` DATETIME NULL,
  `notes`        TEXT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_is_template` (`template_id`),
  KEY `fk_is_asset` (`asset_id`),
  KEY `fk_is_assignee` (`assignee_id`),
  KEY `fk_is_completed_by` (`completed_by`),
  KEY `idx_is_status_due` (`status`, `due_date`),
  CONSTRAINT `fk_is_template` FOREIGN KEY (`template_id`) REFERENCES `inspection_templates`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_is_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_is_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_is_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. ผลตรวจรายข้อ (สำเนาข้อความตอนทำจริง — audit trail)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspection_results` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `schedule_id` INT UNSIGNED NOT NULL,
  `item_id`     INT UNSIGNED NULL,
  `seq`         INT UNSIGNED NOT NULL DEFAULT 0,
  `task`        VARCHAR(500) NOT NULL,
  `type`        ENUM('check','value') NOT NULL DEFAULT 'check',
  `status`      ENUM('pass','fail') NOT NULL,
  `value`       VARCHAR(100) NULL,
  `note`        TEXT NULL,
  KEY `fk_ir_schedule` (`schedule_id`),
  CONSTRAINT `fk_ir_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. งานซ่อมที่สร้างอัตโนมัติจากรายการ Fail
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspection_fail_actions` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `schedule_id` INT UNSIGNED NOT NULL,
  `repair_id`   INT UNSIGNED NULL,
  `action`      ENUM('create_work_order','notify') NOT NULL DEFAULT 'create_work_order',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `fk_ifa_schedule` (`schedule_id`),
  KEY `fk_ifa_repair` (`repair_id`),
  CONSTRAINT `fk_ifa_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ifa_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
