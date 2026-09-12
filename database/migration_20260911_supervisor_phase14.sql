-- Migration: Supervisor + Planner Workflow Phase 14 — maintenance request review, WO planning/assignment,
-- pause/resume, supervisor verification, SLA timestamps, pause audit log.
-- Run via PHP runner (split on ';') against db cmms_tpt. Designed as run-once DDL; additive only.
-- NOTE: existing data preserved — new status values are APPENDED to enums (no DROP, no data deleted).
-- repair.status is varchar(50) → no enum change needed there.

USE cmms_tpt;

SET FOREIGN_KEY_CHECKS = 0;

-- 1) maintenance_requests.status — append 'approved' / 'rejected' (keep existing values intact)
ALTER TABLE `maintenance_requests`
  MODIFY COLUMN `status` ENUM('open','in_progress','waiting_parts','waiting_approval','approved','rejected','resolved','closed','cancelled') DEFAULT 'open';
ALTER TABLE `maintenance_requests`
  ADD COLUMN `work_order_id` INT UNSIGNED NULL AFTER `assigned_to`,
  ADD COLUMN `reviewed_by` INT UNSIGNED NULL AFTER `severity`,
  ADD COLUMN `reviewed_at` DATETIME NULL AFTER `reviewed_by`,
  ADD COLUMN `review_note` TEXT NULL AFTER `reviewed_at`,
  ADD COLUMN `rejected_reason` TEXT NULL AFTER `review_note`,
  ADD CONSTRAINT `fk_mr_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `repair`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_mr_reviewed` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;

-- 2) repair — planning / review / SLA / verification columns (additive)
ALTER TABLE `repair`
  ADD COLUMN `work_order_type` VARCHAR(50) NULL AFTER `source_type`,
  ADD COLUMN `planned_start_at` DATETIME NULL AFTER `pm_plan_id`,
  ADD COLUMN `planned_end_at` DATETIME NULL AFTER `planned_start_at`,
  ADD COLUMN `estimated_duration_minutes` INT UNSIGNED NULL AFTER `planned_end_at`,
  ADD COLUMN `required_skill` VARCHAR(200) NULL AFTER `estimated_duration_minutes`,
  ADD COLUMN `required_tools` TEXT NULL AFTER `required_skill`,
  ADD COLUMN `safety_requirement` TEXT NULL AFTER `required_tools`,
  ADD COLUMN `instructions` TEXT NULL AFTER `safety_requirement`,
  ADD COLUMN `sla_due_at` DATETIME NULL AFTER `acknowledged_at`,
  ADD COLUMN `reviewed_by` INT UNSIGNED NULL AFTER `rejection_note`,
  ADD COLUMN `reviewed_at` DATETIME NULL AFTER `reviewed_by`,
  ADD COLUMN `review_note` TEXT NULL AFTER `reviewed_at`,
  ADD COLUMN `approval_note` TEXT NULL AFTER `review_note`,
  ADD COLUMN `planner_id` INT UNSIGNED NULL AFTER `approval_note`,
  ADD COLUMN `paused_at` DATETIME NULL AFTER `planner_id`,
  ADD COLUMN `pause_reason` VARCHAR(100) NULL AFTER `paused_at`,
  ADD COLUMN `wait_reason` VARCHAR(100) NULL AFTER `pause_reason`,
  ADD COLUMN `verified_by` INT UNSIGNED NULL AFTER `wait_reason`,
  ADD COLUMN `verified_at` DATETIME NULL AFTER `verified_by`,
  ADD COLUMN `verify_note` TEXT NULL AFTER `verified_at`,
  ADD COLUMN `closed_by` INT UNSIGNED NULL AFTER `verify_note`,
  ADD COLUMN `closed_at` DATETIME NULL AFTER `closed_by`,
  ADD COLUMN `status_changed_at` DATETIME NULL AFTER `closed_at`,
  ADD CONSTRAINT `fk_r_reviewed` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_r_planner` FOREIGN KEY (`planner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_r_verified` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_r_closed` FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;
-- Indexes (run-once — MySQL 5.7/8.0 without IF NOT EXISTS support; skip if already created)
CREATE INDEX `idx_repair_status` ON `repair` (`status`);
CREATE INDEX `idx_repair_planned` ON `repair` (`planned_start_at`, `planned_end_at`);
CREATE INDEX `idx_repair_sla` ON `repair` (`sla_due_at`);

-- 3) work_pause_logs — pause/resume history (start / pause / resume / duration / reason / user breaks)
CREATE TABLE IF NOT EXISTS `work_pause_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `repair_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `action` ENUM('pause','resume') NOT NULL,
  `reason` VARCHAR(100) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_wpl_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wpl_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_wpl_repair` (`repair_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) maintenance_request_activity — review trail per request (user/action/old/new/datetime)
CREATE TABLE IF NOT EXISTS `maintenance_request_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `action` VARCHAR(50) NOT NULL,
  `description` TEXT NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mra_request` FOREIGN KEY (`request_id`) REFERENCES `maintenance_requests`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mra_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_mra_request` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) menu_permissions — supervisor section visible to Admin/Manager/ASST Manager/Foreman, hidden for Operate/Operator/Viewer
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
  (1, 'supervisor', 1), (2, 'supervisor', 1), (6, 'supervisor', 1), (7, 'supervisor', 1),
  (1, 'supervisor/queue', 1), (2, 'supervisor/queue', 1), (6, 'supervisor/queue', 1), (7, 'supervisor/queue', 1),
  (1, 'supervisor/review', 1), (2, 'supervisor/review', 1), (6, 'supervisor/review', 1), (7, 'supervisor/review', 1),
  (1, 'supervisor/plan', 1), (2, 'supervisor/plan', 1), (6, 'supervisor/plan', 1), (7, 'supervisor/plan', 1),
  (1, 'supervisor/verify', 1), (2, 'supervisor/verify', 1), (6, 'supervisor/verify', 1), (7, 'supervisor/verify', 1),
  (3, 'supervisor', 0), (4, 'supervisor', 0), (5, 'supervisor', 0),
  (3, 'supervisor/queue', 0), (4, 'supervisor/queue', 0), (5, 'supervisor/queue', 0),
  (3, 'supervisor/review', 0), (4, 'supervisor/review', 0), (5, 'supervisor/review', 0),
  (3, 'supervisor/plan', 0), (4, 'supervisor/plan', 0), (5, 'supervisor/plan', 0),
  (3, 'supervisor/verify', 0), (4, 'supervisor/verify', 0), (5, 'supervisor/verify', 0)
ON DUPLICATE KEY UPDATE `is_granted` = VALUES(`is_granted`);

SET FOREIGN_KEY_CHECKS = 1;