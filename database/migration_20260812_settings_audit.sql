-- Migration: settings_audit_log table
-- ประวัติการแก้ไขค่าตั้งค่าระบบ: ใคร แก้ key ไหน เมื่อไหร่ จากค่าเดิมเป็นค่าใหม่
-- รันด้วย: php database/apply_alter.php หรือ import ผ่าน phpMyAdmin/CLI

CREATE TABLE IF NOT EXISTS settings_audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL COMMENT 'ผู้แก้ไข (users.id)',
    user_name VARCHAR(150) NULL COMMENT 'ชื่อผู้แก้ไข ณ ตอนนั้น (กันลบ user แล้วข้อมูลหาย)',
    setting_key VARCHAR(100) NOT NULL COMMENT 'key ที่แก้ไข',
    old_value TEXT NULL COMMENT 'ค่าก่อนแก้',
    new_value TEXT NULL COMMENT 'ค่าหลังแก้',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_settings_audit_created (created_at),
    INDEX idx_settings_audit_key (setting_key),
    INDEX idx_settings_audit_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit log การแก้ไข settings';
