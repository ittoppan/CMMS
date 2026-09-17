-- Migration: Phase 22 — Post-Go-Live Monitoring & Continuous Improvement
-- (2026-09-17) Additive only; run-once via scripts/apply_phase22_monitoring.php.
-- 1) system_errors — centralized, append-only runtime error log (Phase 22 §4)
-- 2) feedback — lightweight user feedback (Phase 22 §5)
-- 3) index on sage_sync_log(status, created_at) — admin health dashboard queries
-- 4) menu_permissions rows for 'system_health' (admin only) and 'feedback' (all roles)

USE cmms_tpt;

SET FOREIGN_KEY_CHECKS = 0;

-- 1) system_errors — append-only; no UPDATE/DELETE paths in the app.
CREATE TABLE IF NOT EXISTS `system_errors` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `module` VARCHAR(60) NOT NULL DEFAULT 'api',
  `endpoint` VARCHAR(255) NULL,
  `method` VARCHAR(10) NULL,
  `user_id` INT UNSIGNED NULL,
  `user_name` VARCHAR(150) NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'EXCEPTION',
  `error_code` VARCHAR(100) NULL,
  `technical_message` TEXT NULL,
  `user_message` VARCHAR(500) NULL,
  `request_id` VARCHAR(64) NULL,
  `ip_address` VARCHAR(45) NULL,
  INDEX `idx_se_created` (`created_at`),
  INDEX `idx_se_module_created` (`module`, `created_at`),
  INDEX `idx_se_category_created` (`category`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) feedback — user-submitted feedback; admin manages status/assigned_to.
CREATE TABLE IF NOT EXISTS `feedback` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `user_name` VARCHAR(150) NULL,
  `module` VARCHAR(60) NULL,
  `screen` VARCHAR(120) NULL,
  `category` ENUM('bug','ux','slow','missing_function','incorrect_data','training','enhancement','other') NOT NULL DEFAULT 'other',
  `description` TEXT NOT NULL,
  `priority` ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  `status` ENUM('new','triaged','in_progress','resolved','rejected') NOT NULL DEFAULT 'new',
  `assigned_to` INT UNSIGNED NULL,
  `screenshot_path` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` DATETIME NULL,
  INDEX `idx_fb_status_created` (`status`, `created_at`),
  INDEX `idx_fb_user` (`user_id`),
  CONSTRAINT `fk_fb_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fb_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) sage_sync_log — missing composite index used by health dashboard / sync history
CREATE INDEX `idx_sage_sync_status_created` ON `sage_sync_log` (`status`, `created_at`);

-- 4) menu_permissions — system_health: admin (role 1) only; feedback: all roles
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
  (1, 'system_health', 1), (2, 'system_health', 0), (3, 'system_health', 0),
  (4, 'system_health', 0), (5, 'system_health', 0), (6, 'system_health', 0), (7, 'system_health', 0),
  (1, 'feedback', 1), (2, 'feedback', 1), (3, 'feedback', 1), (4, 'feedback', 1),
  (5, 'feedback', 1), (6, 'feedback', 1), (7, 'feedback', 1)
ON DUPLICATE KEY UPDATE `is_granted` = VALUES(`is_granted`);

SET FOREIGN_KEY_CHECKS = 1;