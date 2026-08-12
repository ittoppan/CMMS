-- Migration: notification_logs table
-- แยก log การแจ้งเตือนออกจาก sage_sync_log (เดิม NotificationService เขียนปนกัน)
-- รันด้วย: php database/apply_alter.php หรือ import ผ่าน phpMyAdmin/CLI

CREATE TABLE IF NOT EXISTS notification_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel VARCHAR(20) NOT NULL DEFAULT 'LINE' COMMENT 'LINE / EMAIL / TELEGRAM',
    status VARCHAR(30) NOT NULL COMMENT 'SENT / FAILED / PENDING_CONFIG',
    content VARCHAR(500) NULL,
    raw_response VARCHAR(2000) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_logs_created (created_at),
    INDEX idx_notification_logs_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log การส่งการแจ้งเตือน';
