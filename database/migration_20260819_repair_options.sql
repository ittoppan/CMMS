-- ============================================================
-- Migration: repair_options table
-- เก็บตัวเลือก dropdown สำหรับฟอร์มแจ้งซ่อม
-- ============================================================

CREATE TABLE IF NOT EXISTS `repair_options` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `option_type`   VARCHAR(50) NOT NULL COMMENT 'ประเภทตัวเลือก: department, machine_code, machine_name, job_type, job_description, machine_status, job_status, root_cause, note, contaminate_check, operator',
  `option_value`  VARCHAR(255) NOT NULL COMMENT 'ค่า (value) ที่เก็บในระบบ',
  `option_label`  VARCHAR(255) NOT NULL COMMENT 'ชื่อที่แสดงใน dropdown',
  `option_label_en` VARCHAR(255) NULL COMMENT 'ชื่อภาษาอังกฤษ',
  `option_emoji`  VARCHAR(10) NULL COMMENT 'ไอคอน/อีโมจิ สำหรับแสดงผล',
  `sort_order`    INT NOT NULL DEFAULT 0 COMMENT 'ลำดับการแสดงผล',
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'เปิด/ปิดใช้งาน',
  `description`   TEXT NULL COMMENT 'คำอธิบายเพิ่มเติม',
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_repair_option_type_value` (`option_type`, `option_value`),
  KEY `idx_repair_option_type` (`option_type`),
  KEY `idx_repair_option_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed data: ค่าเริ่มต้นสำหรับตัวเลือกต่างๆ
-- ============================================================

-- 1. Department (แผนก)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('department', 'PROD', 'ฝ่ายผลิต', 'Production', '🏭', 1, 1),
('department', 'MAINT', 'ฝ่ายซ่อมบำรุง', 'Maintenance', '🔧', 2, 1),
('department', 'QUAL', 'ฝ่ายคุณภาพ', 'Quality', '✅', 3, 1),
('department', 'WH', 'ฝ่ายคลังสินค้า', 'Warehouse', '📦', 4, 1),
('department', 'ENG', 'ฝ่ายวิศวกรรม', 'Engineering', '⚙️', 5, 1),
('department', 'ADMIN', 'ฝ่ายบริหาร', 'Administration', '📋', 6, 1);

-- 2. Job Type (ประเภทงาน)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('job_type', 'Machinery', 'เครื่องจักร', 'Machinery', '⚙️', 1, 1),
('job_type', 'Equipment Support', 'อุปกรณ์สนับสนุน', 'Equipment Support', '🛠️', 2, 1),
('job_type', 'Facilities', 'โครงสร้างพื้นฐาน', 'Facilities', '🏭', 3, 1),
('job_type', 'Other', 'อื่นๆ', 'Other', '📦', 4, 1);

-- 3. Job Description (ลักษณะงาน)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('job_description', 'Maintenance', 'ซ่อมบำรุง', 'Maintenance', '🔧', 1, 1),
('job_description', 'PM', 'บำรุงเชิงป้องกัน', 'PM / Preventive', '📋', 2, 1),
('job_description', 'Modify', 'ปรับปรุง / ดัดแปลง', 'Modify', '🔄', 3, 1),
('job_description', 'Build', 'สร้าง / จัดทำใหม่', 'Build', '🏗️', 4, 1);

-- 4. Machine Status (สถานะเครื่องจักร)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('machine_status', 'breakdown', 'Break Down', 'Break Down', '🔴', 1, 1),
('machine_status', 'wait', 'Wait for Maintenance', 'Wait for Maintenance', '🟡', 2, 1),
('machine_status', 'running', 'Still working', 'Still working', '🟢', 3, 1);

-- 5. Job Status (สถานะงาน)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('job_status', 'pending', 'รอดำเนินการ', 'Pending', '⏳', 1, 1),
('job_status', 'in_progress', 'กำลังดำเนินการ', 'In Progress', '🔄', 2, 1),
('job_status', 'waiting_parts', 'รออะไหล่', 'Waiting for Parts', '📦', 3, 1),
('job_status', 'completed', 'เสร็จสิ้น', 'Completed', '✅', 4, 1),
('job_status', 'cancelled', 'ยกเลิก', 'Cancelled', '❌', 5, 1);

-- 6. Root Cause (สาเหตุของปัญหา)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('root_cause', 'wear', 'สึกหรอ', 'Wear', '📉', 1, 1),
('root_cause', 'electrical', 'ไฟฟ้า', 'Electrical', '⚡', 2, 1),
('root_cause', 'mechanical', 'กลไก', 'Mechanical', '⚙️', 3, 1),
('root_cause', 'hydraulic', 'ไฮดรอลิก', 'Hydraulic', '💧', 4, 1),
('root_cause', 'pneumatic', 'นิวเมติก', 'Pneumatic', '🌬️', 5, 1),
('root_cause', 'operator_error', 'ความผิดพลาดของผู้ใช้งาน', 'Operator Error', '👤', 6, 1),
('root_cause', 'material_defect', 'วัสดุบกพร่อง', 'Material Defect', '🔍', 7, 1),
('root_cause', 'design_flaw', 'การออกแบบ', 'Design Flaw', '📐', 8, 1),
('root_cause', 'other', 'อื่นๆ', 'Other', '❓', 9, 1);

-- 7. Contaminate Check (ตรวจสอบการปนเปื้อน)
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('contaminate_check', 'not_checked', 'ยังไม่ตรวจ', 'Not Checked', '❓', 1, 1),
('contaminate_check', 'clean', 'ไม่พบการปนเปื้อน (ผ่าน)', 'Clean', '✅', 2, 1),
('contaminate_check', 'contaminated', 'พบการปนเปื้อน', 'Contaminated', '⚠️', 3, 1),
('contaminate_check', 'not_applicable', 'ไม่เกี่ยวข้องกับงานนี้', 'Not Applicable', '➖', 4, 1);

-- 8. Operator (ผู้ปฏิบัติงาน) - ตัวอย่าง
INSERT INTO `repair_options` (`option_type`, `option_value`, `option_label`, `option_label_en`, `option_emoji`, `sort_order`, `is_active`) VALUES
('operator', 'own_team', 'ทีมซ่อมบำรุงภายใน', 'Internal Maintenance Team', '👥', 1, 1),
('operator', 'outsourced', 'ผู้รับเหมาภายนอก', 'Outsourced Contractor', '🏢', 2, 1);
