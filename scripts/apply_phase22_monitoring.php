<?php
/**
 * scripts/apply_phase22_monitoring.php — idempotent DB migration (Phase 22)
 *
 * สร้าง/อัปเกรดโครงสร้างสำหรับ Post-Go-Live Monitoring & Continuous Improvement:
 *   1) system_errors      — centralized runtime error log (append-only)
 *   2) feedback           — lightweight user feedback
 *   3) idx_sage_sync_status_created — index (status, created_at) บน sage_sync_log
 *   4) menu_permissions   — 'system_health' (admin เท่านั้น) + 'feedback' (ทุกบทบาท)
 *
 * รันซ้ำได้ (idempotent) ไม่ทำลายข้อมูลเดิม
 *
 * วิธีเรียก:  php scripts/apply_phase22_monitoring.php
 *            (อ่าน DB creds จาก .env ผ่าน src/config/db.php)
 */

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// ---------- 1) system_errors ----------
$pdo->exec("CREATE TABLE IF NOT EXISTS `system_errors` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
echo "OK: system_errors\n";

// ---------- 2) feedback ----------
$pdo->exec("CREATE TABLE IF NOT EXISTS `feedback` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
echo "OK: feedback\n";

// ---------- 3) sage_sync_log composite index (guarded) ----------
$hasIndex = $pdo->query(
    "SELECT COUNT(*) FROM information_schema.STATISTICS " .
    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sage_sync_log' AND INDEX_NAME = 'idx_sage_sync_status_created'"
)->fetchColumn();
if ((int)$hasIndex === 0) {
    $pdo->exec("CREATE INDEX `idx_sage_sync_status_created` ON `sage_sync_log` (`status`, `created_at`)");
    echo "OK: sage_sync_log idx (status, created_at)\n";
} else {
    echo "SKIP: sage_sync_log index already exists\n";
}

// ---------- 4) menu_permissions (upsert) ----------
$permRows = [
    [1, 'system_health', 1], [2, 'system_health', 0], [3, 'system_health', 0],
    [4, 'system_health', 0], [5, 'system_health', 0], [6, 'system_health', 0], [7, 'system_health', 0],
    [1, 'feedback', 1], [2, 'feedback', 1], [3, 'feedback', 1], [4, 'feedback', 1],
    [5, 'feedback', 1], [6, 'feedback', 1], [7, 'feedback', 1],
];
$stmt = $pdo->prepare(
    "INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, ?) " .
    "ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted)"
);
foreach ($permRows as $r) { $stmt->execute($r); }
echo "OK: menu_permissions (" . count($permRows) . " rows upserted)\n";

echo "\nmigration_20260917_phase22_monitoring applied successfully!\n";