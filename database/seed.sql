-- ============================================================
-- CMMS-TPT Seed Data
-- ============================================================

USE `cmms_tpt`;

-- -----------------------------------------------------------
-- roles
-- -----------------------------------------------------------
INSERT INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'Admin',       'ผู้ดูแลระบบ มีสิทธิ์ทั้งหมด'),
(2, 'Manager',     'ผู้จัดการฝ่ายซ่อมบำรุง'),
(3, 'Technician',  'ช่างซ่อมบำรุง'),
(4, 'Operator',    'ผู้ควบคุมเครื่องจักร'),
(5, 'Viewer',      'ผู้ดูรายงาน');

-- -----------------------------------------------------------
-- users
-- -----------------------------------------------------------
INSERT INTO `users` (`id`, `role_id`, `username`, `email`, `password`, `full_name`, `phone`, `is_active`) VALUES
(1, 1, 'admin',     'admin@cmms.local',     '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', ' administrator', '081-001-0001', 1),
(2, 2, 'manager',   'manager@cmms.local',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'สมชาย   จัดการดี', '081-002-0002', 1),
(3, 3, 'tech01',    'tech01@cmms.local',    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'สมศักดิ์ ช่างซ่อม',  '081-003-0003', 1),
(4, 3, 'tech02',    'tech02@cmms.local',    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'สมหญิง   ช่างกล',   '081-004-0004', 1),
(5, 4, 'operator',  'operator@cmms.local',  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'ประสิทธิ์ ผู้ควบคุม', '081-005-0005', 1);
-- Password for all users above is: password

-- -----------------------------------------------------------
-- suppliers
-- -----------------------------------------------------------
INSERT INTO `suppliers` (`id`, `code`, `name`, `contact_person`, `email`, `phone`, `tax_id`) VALUES
(1, 'SUP-001', 'บริษัท   ชิ้นส่วนอุตสาหกรรม จำกัด',   'คุณธานี',   'thanee@partco.th',   '02-111-1111', '1111111111111'),
(2, 'SUP-002', 'ห้างหุ้นส่วน   จำกัด เครื่องกลไทย',       'คุณประเสริฐ', 'prasert@machai.th',  '02-222-2222', '2222222222222'),
(3, 'SUP-003', 'บริษัท   คาลิเบรชั่นเซอร์วิส จำกัด',     'คุณสุภาพร', 'supaporn@cali.th',   '02-333-3333', '3333333333333');

-- -----------------------------------------------------------
-- asset_registry
-- -----------------------------------------------------------
INSERT INTO `asset_registry` (`id`, `code`, `name`, `description`, `category`, `location`, `department`, `manufacturer`, `model`, `serial_number`, `purchase_date`, `warranty_expiry`, `status`) VALUES
(1, 'MCH-001', 'เครื่องกลึง CNC รุ่น TL-2000',    'เครื่องกลึง CNC ขนาดกลาง',                        'Machine', 'อาคารผลิต ชั้น 1', 'ฝ่ายผลิต',     'HAAS',  'TL-2000', 'SN-MCH-001', '2023-01-15', '2026-01-15', 'active'),
(2, 'MCH-002', 'เครื่องเจาะแนวตั้ง',              'เครื่องเจาะ CNC แนวตั้ง',                         'Machine', 'อาคารผลิต ชั้น 1', 'ฝ่ายผลิต',     'Mazak', 'VCN-530', 'SN-MCH-002', '2022-06-20', '2025-06-20', 'active'),
(3, 'INS-001', 'เครื่องวัดความแม่นยำ 3 แกน',     'CMM สำหรับตรวจสอบชิ้นงาน',                         'Instrument', 'ห้อง QC',     'ฝ่ายQC',     'Mitutoyo', 'CRYSTA-Apex', 'SN-INS-001', '2023-03-01', '2026-03-01', 'active'),
(4, 'INS-002', 'เครื่องชั่งดิจิตอล 6000g',        'เครื่องชั่งความละเอียด 0.01g',                    'Instrument', 'ห้อง Lab',    'ฝ่ายQC',     'Sartorius', 'GD-6000', 'SN-INS-002', '2023-05-10', '2025-05-10', 'active'),
(5, 'VEH-001', 'รถโฟล์คลิฟท์ Toyota 3 ตัน',       'รถยกสินค้า ดีเซล',                                'Vehicle', 'ลานจอดรถโฟล์ค', 'ฝ่ายคลัง',    'Toyota',   '7FDU35', 'SN-VEH-001', '2021-11-01', '2025-11-01', 'active');

-- -----------------------------------------------------------
-- spare_parts
-- -----------------------------------------------------------
INSERT INTO `spare_parts` (`id`, `supplier_id`, `code`, `name`, `category`, `unit`, `stock_qty`, `min_stock`, `max_stock`, `location`, `unit_price`) VALUES
(1, 1, 'BRG-6205', 'ลูกปืน SKF 6205',          'Bearing', 'ชิ้น', 50, 10, 100, 'A-01', 250.00),
(2, 1, 'BRG-6308', 'ลูกปืน SKF 6308',          'Bearing', 'ชิ้น', 30, 10,  80, 'A-02', 480.00),
(3, 2, 'BEL-A55',  'สายพาน A-55',              'Belt',    'เส้น', 20,  5,  50, 'B-01', 180.00),
(4, 2, 'OIL-32',   'น้ำมันไฮดรอลิค Shell 32',  'Lubricant', 'ลิตร', 200, 50, 500, 'C-01', 85.00),
(5, 1, 'FIL-AIR',  'กรองอากาศ แผ่นกรอง',        'Filter',  'ชิ้น', 15,  5,  30, 'D-01', 350.00);

-- -----------------------------------------------------------
-- repair
-- -----------------------------------------------------------
INSERT INTO `repair` (`id`, `asset_id`, `assigned_to`, `created_by`, `priority`, `status`, `title`, `description`, `downtime_start`, `downtime_end`, `cost_parts`, `cost_labor`, `notes`) VALUES
(1, 1, 3, 2, 'high',   'resolved', 'เปลี่ยนลูกปืน主轴',  'เครื่องกลึงมีเสียงดังผิดปกติ', '2026-01-10 09:00:00', '2026-01-10 16:30:00', 1250.00, 2000.00, 'เปลี่ยนลูกปืน SKF 6205 ทั้ง 2 ด้าน'),
(2, 2, 3, 2, 'critical', 'closed', 'ไดรฟ์伺服เสีย',       'เครื่องเจาะหยุดทำงาน Error E-203', '2026-02-05 08:00:00', '2026-02-06 17:00:00', 15000.00, 4000.00, 'เปลี่ยนไดรฟ์伺服ใหม่'),
(3, 5, 4, 2, 'medium', 'in_progress', 'น้ำมันรั่วที่กระบอกไฮดรอลิค', 'รถโฟล์คลิฟท์มีน้ำมันไฮดรอลิครั่ว', '2026-03-15 10:00:00', NULL, 0, 1500.00, 'รออะไหล่ซีลกระบอกไฮดรอลิค');

-- repair_spare_parts
INSERT INTO `repair_spare_parts` (`repair_id`, `spare_part_id`, `quantity_used`, `unit_price`) VALUES
(1, 1, 2, 250.00),
(1, 4, 1, 85.00);

-- -----------------------------------------------------------
-- pm_am
-- -----------------------------------------------------------
INSERT INTO `pm_am` (`id`, `asset_id`, `assigned_to`, `title`, `frequency_type`, `frequency_interval`, `due_date`, `last_done_date`, `status`, `checklist`) VALUES
(1, 1, 3, 'ตรวจสอบและหล่อลื่นเครื่องกลึง CNC',   'monthly', 1, '2026-04-01', '2026-03-01', 'pending', '["ตรวจสอบระดับน้ำมัน", "ตรวจสอบสายพาน", "หล่อลื่น导轨", "ตรวจสอบระบบไฟฟ้า"]'),
(2, 2, 3, 'ตรวจสอบระบบไฮดรอลิคเครื่องเจาะ',      'monthly', 1, '2026-04-05', '2026-03-05', 'pending', '["ตรวจสอบระดับน้ำมันไฮดรอลิค", "ตรวจสอบท่อและข้อต่อ", "ตรวจสอบแรงดัน"]'),
(3, 5, 4, 'ตรวจสอบสภาพรถโฟล์คลิฟท์',              'weekly',  1, '2026-03-28', '2026-03-21', 'completed', '["ตรวจสอบยาง", "ตรวจสอบน้ำมันเครื่อง", "ตรวจสอบระบบเบรก", "ตรวจสอบไฟสัญญาณ"]');

-- -----------------------------------------------------------
-- calibration
-- -----------------------------------------------------------
INSERT INTO `calibration` (`id`, `asset_id`, `performed_by`, `calibration_date`, `next_calibration_date`, `standard_used`, `result`, `certificate_number`, `notes`) VALUES
(1, 3, 3, '2026-01-15', '2026-07-15', 'Gauge Block ระดับ 1', 'pass', 'CAL-2026-001', 'ค่าความแม่นยำอยู่ในเกณฑ์'),
(2, 4, 3, '2026-02-10', '2026-08-10', 'Standard Weight Class F1', 'pass', 'CAL-2026-002', 'ปรับเทียบเรียบร้อย');

-- -----------------------------------------------------------
-- equipment_borrowing
-- -----------------------------------------------------------
INSERT INTO `equipment_borrowing` (`id`, `asset_id`, `borrower_id`, `processed_by`, `borrow_date`, `expected_return_date`, `actual_return_date`, `purpose`, `condition_before`, `condition_after`, `status`) VALUES
(1, 4, 5, 3, '2026-03-20 09:00:00', '2026-03-22', '2026-03-22 16:00:00', 'ชั่งวัตถุดิบในแผนกผลิต', 'ปกติ', 'ปกติ', 'returned'),
(2, 3, 5, 3, '2026-03-25 08:00:00', '2026-03-28', NULL, 'วัดชิ้นงานใหม่', 'ปกติ', NULL, 'borrowed');

-- -----------------------------------------------------------
-- manuals
-- -----------------------------------------------------------
INSERT INTO `manuals` (`id`, `asset_id`, `title`, `file_path`, `file_type`, `version`, `uploaded_by`) VALUES
(1, 1, 'คู่มือการใช้งานเครื่องกลึง CNC TL-2000',  '/uploads/manuals/tl2000_manual.pdf',        'application/pdf', '1.0', 1),
(2, 1, 'แผนภาพวงจรไฟฟ้าเครื่องกลึง CNC',          '/uploads/manuals/tl2000_wiring.pdf',         'application/pdf', '1.1', 1),
(3, 3, 'คู่มือการใช้งาน CMM CRYSTA-Apex',        '/uploads/manuals/crysta_apex_manual.pdf',    'application/pdf', '2.0', 1);

-- -----------------------------------------------------------
-- mtbf_mttr
-- -----------------------------------------------------------
INSERT INTO `mtbf_mttr` (`id`, `asset_id`, `year`, `month`, `operating_hours`, `total_failures`, `total_downtime_minutes`, `mtbf_hours`, `mttr_minutes`) VALUES
(1, 1, 2026, 1, 480.0, 1, 450, 480.00, 450.00),
(2, 1, 2026, 2, 440.0, 0, 0, NULL, NULL),
(3, 2, 2026, 1, 460.0, 0, 0, NULL, NULL),
(4, 2, 2026, 2, 420.0, 1, 540, 420.00, 540.00);

-- -----------------------------------------------------------
-- settings
-- -----------------------------------------------------------
INSERT INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `description`) VALUES
('app_name',             'CMMS-TPT',               'general',   'ชื่อระบบ'),
('app_version',          '1.0.0',                  'general',   'เวอร์ชันระบบ'),
('company_name',         'บริษัท TPT จำกัด',       'company',   'ชื่อบริษัท'),
('company_address',      '123 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900', 'company', 'ที่อยู่บริษัท'),
('company_tax_id',       '0999999999999',           'company',   'เลขประจำตัวผู้เสียภาษี'),
('currency_symbol',      '฿',                      'general',   'สัญลักษณ์สกุลเงิน'),
('timezone',             'Asia/Bangkok',           'general',   'เขตเวลา'),
('maintenance_alert_days', '7',                   'notification', 'จำนวนวันแจ้งเตือนล่วงหน้าก่อนถึงกำหนดบำรุงรักษา'),
('low_stock_alert',       '1',                      'notification', 'แจ้งเตือนเมื่อสต็อกต่ำกว่าขั้นต่ำ (0=ปิด,1=เปิด)');
