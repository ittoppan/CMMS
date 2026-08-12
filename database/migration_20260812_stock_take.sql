-- Migration: stock_take + stock_take_items
-- โมดูลนับสต็อกจริง (Stock Take): สร้างรอบนับ -> กรอกจำนวนที่พบจริง -> ปรับ stock_qty พร้อมประวัติ
-- รันด้วย: php database/apply_alter.php หรือ import ผ่าน phpMyAdmin/CLI

CREATE TABLE IF NOT EXISTS stock_take (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL COMMENT 'รหัสรอบนับ เช่น ST-20260812-001',
    note VARCHAR(255) NULL,
    status ENUM('draft','completed','cancelled') NOT NULL DEFAULT 'draft' COMMENT 'draft=กำลังนับ, completed=ปรับสต็อกแล้ว',
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    completed_by INT UNSIGNED NULL,
    UNIQUE KEY uq_stock_take_code (code),
    INDEX idx_stock_take_status (status),
    INDEX idx_stock_take_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รอบการนับสต็อก';

CREATE TABLE IF NOT EXISTS stock_take_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    stock_take_id INT UNSIGNED NOT NULL,
    spare_part_id INT UNSIGNED NOT NULL,
    system_qty DECIMAL(12,3) NOT NULL DEFAULT 0 COMMENT 'จำนวนในระบบตอนสร้างรอบ',
    counted_qty DECIMAL(12,3) NULL COMMENT 'จำนวนที่พบจริง (NULL = ยังไม่นับ)',
    note VARCHAR(255) NULL COMMENT 'หมายเหตุ เช่น สินค้าชำรุด/วางผิดตำแหน่ง',
    updated_at DATETIME NULL,
    UNIQUE KEY uq_stock_take_item (stock_take_id, spare_part_id),
    INDEX idx_stock_take_item_part (spare_part_id),
    CONSTRAINT fk_sti_take FOREIGN KEY (stock_take_id) REFERENCES stock_take(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รายการอะไหล่ในรอบนับสต็อก';
