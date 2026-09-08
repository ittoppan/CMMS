-- Migration: import_history (audit trail สำหรับการนำเข้า Excel)
-- บันทึก "ใคร นำเข้าไฟล์ไหน ชุดข้อมูลอะไร เมื่อไหร่ ส่งข้อมูล กี่แถว" หลังนำเข้าสำเร็จ (same transaction)
-- วิธีใช้งาน: php database/apply_alter.php ไม่เกี่ยวกับตารางนี้ — import ผ่าน phpMyAdmin/CLI
--             หรือยกไปรันกับฐานข้อมูล cmms_tpt โดยตรง

CREATE TABLE IF NOT EXISTS import_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dataset VARCHAR(30) NOT NULL COMMENT 'repair / asset / pm_am / spare_parts / calibration',
    file_name VARCHAR(255) NULL COMMENT 'ชื่อไฟล์ .xlsx ที่นำเข้า',
    total INT UNSIGNED NOT NULL DEFAULT 0,
    inserted INT UNSIGNED NOT NULL DEFAULT 0,
    failed INT UNSIGNED NOT NULL DEFAULT 0,
    note VARCHAR(500) NULL,
    created_by INT UNSIGNED NULL COMMENT 'users.id ที่นำเข้า',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_import_history_created (created_at),
    INDEX idx_import_history_dataset (dataset),
    INDEX idx_import_history_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติการนำเข้าข้อมูล Excel (audit trail)';