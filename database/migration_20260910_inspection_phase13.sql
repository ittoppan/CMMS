-- Migration: Inspection + Checklist Phase 13 — extended checklist item types, execution engine, dashboard views
-- Run via PHP runner (split on ';') against db cmms_tpt. Designed as run-once DDL; additive only.
-- NOTE: existing real history is preserved (only enum values are appended, no data deleted).

USE cmms_tpt;

SET FOREIGN_KEY_CHECKS = 0;

-- 1) inspection_template_items — extend item types + add options/photo/remark/pass-criteria/failure-action
ALTER TABLE `inspection_template_items`
  MODIFY COLUMN `type` ENUM('check','value','numeric','measurement','dropdown','date_time','yes_no','pass_fail','text') DEFAULT 'check';
ALTER TABLE `inspection_template_items`
  ADD COLUMN `options` JSON NULL AFTER `unit`,
  ADD COLUMN `photo_required` TINYINT(1) DEFAULT 0 AFTER `options`,
  ADD COLUMN `remark_required` TINYINT(1) DEFAULT 0 AFTER `photo_required`,
  ADD COLUMN `pass_criteria` VARCHAR(255) NULL AFTER `remark_required`,
  ADD COLUMN `failure_action` VARCHAR(100) NULL AFTER `pass_criteria`;

-- 2) inspection_schedules — priority, department/location, duration, inspector, start/completed timestamps
ALTER TABLE `inspection_schedules`
  ADD COLUMN `priority` ENUM('low','normal','high','critical') DEFAULT 'normal' AFTER `assignee_id`,
  ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `asset_id`,
  ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `department_id`,
  ADD COLUMN `estimated_duration_min` INT UNSIGNED NULL AFTER `period_end`,
  ADD COLUMN `inspector_id` INT UNSIGNED NULL AFTER `assignee_id`,
  ADD COLUMN `started_at` DATETIME NULL AFTER `due_date`,
  ADD COLUMN `draft_json` LONGTEXT NULL AFTER `notes`;
ALTER TABLE `inspection_schedules`
  MODIFY COLUMN `result` ENUM('pass','pass_with_warning','fail','critical_fail') NULL,
  ADD INDEX `idx_is_priority` (`priority`),
  ADD INDEX `idx_is_dept_loc` (`department_id`, `location_id`);
UPDATE `inspection_schedules` SET `inspector_id` = `assignee_id` WHERE `inspector_id` IS NULL;

-- 3) inspection_photos — evidence photos per inspection item
CREATE TABLE IF NOT EXISTS `inspection_photos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `schedule_id` INT UNSIGNED NOT NULL,
  `item_id` INT UNSIGNED NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_name` VARCHAR(255) NULL,
  `file_size` INT UNSIGNED NULL,
  `mime_type` VARCHAR(100) NULL,
  `uploaded_by` INT UNSIGNED NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `caption` VARCHAR(500) NULL,
  CONSTRAINT `fk_ip_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ip_item` FOREIGN KEY (`item_id`) REFERENCES `inspection_template_items`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ip_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_ip_schedule` (`schedule_id`),
  INDEX `idx_ip_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) inspection_measurements — numeric measurements with auto pass/fail vs range
CREATE TABLE IF NOT EXISTS `inspection_measurements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `schedule_id` INT UNSIGNED NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `value_numeric` DECIMAL(18,6) NOT NULL,
  `unit` VARCHAR(50) NULL,
  `min_value` DECIMAL(18,6) NULL,
  `max_value` DECIMAL(18,6) NULL,
  `passed` TINYINT(1) NULL,
  `photo_id` INT UNSIGNED NULL,
  `recorded_by` INT UNSIGNED NULL,
  `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_im_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `inspection_schedules`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_im_item` FOREIGN KEY (`item_id`) REFERENCES `inspection_template_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_im_photo` FOREIGN KEY (`photo_id`) REFERENCES `inspection_photos`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_im_user` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_im_schedule` (`schedule_id`),
  INDEX `idx_im_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) maintenance_requests — request model linked from inspection failures
CREATE TABLE IF NOT EXISTS `maintenance_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_code` VARCHAR(50) NOT NULL UNIQUE,
  `asset_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `priority` ENUM('low','normal','high','critical') DEFAULT 'normal',
  `status` ENUM('open','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled') DEFAULT 'open',
  `requested_by` INT UNSIGNED NOT NULL,
  `assigned_to` INT UNSIGNED NULL,
  `department_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `inspection_schedule_id` INT UNSIGNED NULL,
  `inspection_item_id` INT UNSIGNED NULL,
  `finding` TEXT NULL,
  `severity` ENUM('low','medium','high','critical') DEFAULT 'medium',
  `photo_path` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mr_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mr_requested` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mr_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_dept` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_loc` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mr_insp_sched` FOREIGN KEY (`inspection_schedule_id`) REFERENCES `inspection_schedules`(`id`) ON DELETE SET NULL,
  INDEX `idx_mr_asset` (`asset_id`),
  INDEX `idx_mr_status` (`status`),
  INDEX `idx_mr_insp` (`inspection_schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) inspection_fail_actions — link repair/request + severity + auto WO flag + actor
ALTER TABLE `inspection_fail_actions`
  ADD COLUMN `maintenance_request_id` INT UNSIGNED NULL AFTER `repair_id`,
  ADD COLUMN `severity` ENUM('low','medium','high','critical') DEFAULT 'medium' AFTER `action`,
  ADD COLUMN `auto_create_wo` TINYINT(1) DEFAULT 1 AFTER `severity`,
  ADD COLUMN `created_by` INT UNSIGNED NULL AFTER `auto_create_wo`,
  ADD CONSTRAINT `fk_ifa_mr` FOREIGN KEY (`maintenance_request_id`) REFERENCES `maintenance_requests`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ifa_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;

-- 7) inspection_results — traceability to measurement/photo; status extended with 'warn'
ALTER TABLE `inspection_results`
  MODIFY COLUMN `type` VARCHAR(20) NOT NULL DEFAULT 'check',
  MODIFY COLUMN `status` ENUM('pass','warn','fail') DEFAULT 'pass',
  ADD COLUMN `measurement_id` INT UNSIGNED NULL AFTER `note`,
  ADD COLUMN `photo_id` INT UNSIGNED NULL AFTER `measurement_id`,
  ADD CONSTRAINT `fk_ir_measurement` FOREIGN KEY (`measurement_id`) REFERENCES `inspection_measurements`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ir_photo` FOREIGN KEY (`photo_id`) REFERENCES `inspection_photos`(`id`) ON DELETE SET NULL;

-- 8) KPI view
CREATE OR REPLACE VIEW `v_inspection_dashboard_kpis` AS
SELECT
  COUNT(*) AS total_schedules,
  SUM(CASE WHEN `status` = 'pending' AND `due_date` = CURDATE() THEN 1 ELSE 0 END) AS due_today,
  SUM(CASE WHEN `status` = 'pending' AND `due_date` < CURDATE() THEN 1 ELSE 0 END) AS overdue,
  SUM(CASE WHEN `status` = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
  SUM(CASE WHEN `status` = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN `result` = 'pass' THEN 1 ELSE 0 END) AS passed,
  SUM(CASE WHEN `result` IN ('fail','critical_fail') THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN `result` = 'critical_fail' THEN 1 ELSE 0 END) AS critical_fail,
  CASE WHEN SUM(CASE WHEN `status` = 'completed' THEN 1 ELSE 0 END) > 0
       THEN ROUND(SUM(CASE WHEN `result` = 'pass' THEN 1 ELSE 0 END) / SUM(CASE WHEN `status` = 'completed' THEN 1 ELSE 0 END) * 100, 2)
       ELSE 0 END AS avg_score_pct,
  CASE WHEN COUNT(*) > 0
       THEN ROUND(SUM(CASE WHEN `status` = 'completed' THEN 1 ELSE 0 END) / COUNT(*) * 100, 2)
       ELSE 0 END AS compliance_pct
FROM `inspection_schedules`;

-- 9) Asset inspection-history view
CREATE OR REPLACE VIEW `v_asset_inspection_history` AS
SELECT
  `is`.`id` AS `schedule_id`, `is`.`asset_id`,
  `a`.`code` AS `asset_code`, `a`.`name` AS `asset_name`,
  `it`.`id` AS `template_id`, `it`.`code` AS `template_code`, `it`.`title` AS `template_title`,
  `is`.`due_date`, `is`.`started_at`, `is`.`completed_at`, `is`.`status`, `is`.`result`,
  `is`.`fail_count`, `is`.`priority`,
  `u`.`full_name` AS `inspector_name`, `u`.`username` AS `inspector_username`,
  (SELECT COUNT(*) FROM `inspection_results` `ir` WHERE `ir`.`schedule_id` = `is`.`id` AND `ir`.`status` = 'fail') AS `failed_items_count`,
  (SELECT GROUP_CONCAT(CONCAT(`ir`.`task`, ' (', `ir`.`value`, ')') SEPARATOR '; ')
   FROM `inspection_results` `ir` WHERE `ir`.`schedule_id` = `is`.`id` AND `ir`.`status` = 'fail') AS `failed_items_summary`,
  `wo`.`id` AS `work_order_id`, `wo`.`work_order_no` AS `work_order_code`,
  `mr`.`id` AS `maintenance_request_id`, `mr`.`request_code`
FROM `inspection_schedules` `is`
JOIN `asset_registry` `a` ON `a`.`id` = `is`.`asset_id`
JOIN `inspection_templates` `it` ON `it`.`id` = `is`.`template_id`
LEFT JOIN `users` `u` ON `u`.`id` = `is`.`inspector_id`
LEFT JOIN `inspection_fail_actions` `ifa` ON `ifa`.`schedule_id` = `is`.`id`
LEFT JOIN `repair` `wo` ON `wo`.`id` = `ifa`.`repair_id`
LEFT JOIN `maintenance_requests` `mr` ON `mr`.`id` = `ifa`.`maintenance_request_id`
WHERE `is`.`status` IN ('completed','overdue','skipped')
ORDER BY `is`.`completed_at` DESC, `is`.`due_date` DESC;

-- 10) item-type reference (UI dropdowns)
CREATE TABLE IF NOT EXISTS `inspection_item_types` (
  `code` VARCHAR(20) PRIMARY KEY,
  `label_th` VARCHAR(100) NOT NULL,
  `label_en` VARCHAR(100) NOT NULL,
  `has_options` TINYINT(1) DEFAULT 0,
  `has_numeric_range` TINYINT(1) DEFAULT 0,
  `has_unit` TINYINT(1) DEFAULT 0,
  `icon` VARCHAR(50) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `inspection_item_types` (`code`, `label_th`, `label_en`, `has_options`, `has_numeric_range`, `has_unit`, `icon`) VALUES
('yes_no', 'ใช่/ไม่ใช่', 'Yes/No', 0, 0, 0, 'check-circle'),
('pass_fail', 'ผ่าน/ไม่ผ่าน', 'Pass/Fail', 0, 0, 0, 'check-circle-2'),
('text', 'ข้อความ', 'Text', 0, 0, 0, 'type'),
('numeric', 'ตัวเลข', 'Numeric', 0, 1, 1, 'hash'),
('measurement', 'การวัด', 'Measurement', 0, 1, 1, 'ruler'),
('dropdown', 'เลือกจากรายการ', 'Dropdown', 1, 0, 0, 'chevron-down'),
('date_time', 'วันที่/เวลา', 'Date/Time', 0, 0, 0, 'calendar'),
('check', 'เช็ค', 'Check', 0, 0, 0, 'check');

SET FOREIGN_KEY_CHECKS = 1;