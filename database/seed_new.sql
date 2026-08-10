-- ============================================================
-- CMMS-TPT Seed Data for New Tables (2026-07-23)
-- ============================================================

USE `cmms_tpt`;

-- Departments
INSERT INTO `departments` (`id`, `code`, `name`, `description`) VALUES
(1, 'DP-PROD', 'ฝ่ายผลิต', 'Production Department'),
(2, 'DP-MAINT', 'ฝ่ายซ่อมบำรุง', 'Maintenance Department'),
(3, 'DP-QC', 'ฝ่ายควบคุมคุณภาพ', 'Quality Control Department'),
(4, 'DP-WH', 'ฝ่ายคลังสินค้า', 'Warehouse Department'),
(5, 'DP-ADMIN', 'ฝ่ายบริหาร', 'Administration Department');

-- Locations
INSERT INTO `locations` (`id`, `parent_id`, `code`, `name`, `type`) VALUES
(1, NULL, 'BLDG-A', 'อาคารผลิต A', 'building'),
(2, 1, 'FL-A1', 'ชั้น 1 อาคารผลิต A', 'floor'),
(3, 1, 'FL-A2', 'ชั้น 2 อาคารผลิต A', 'floor'),
(4, NULL, 'BLDG-B', 'อาคาร QC และ Lab', 'building'),
(5, 4, 'FL-B1', 'ห้อง QC', 'area'),
(6, 4, 'FL-B2', 'ห้อง Lab', 'area');

-- Work Zones
INSERT INTO `work_zones` (`id`, `code`, `name`, `description`) VALUES
(1, 'ZN-MCH', 'โซนเครื่องจักร', 'Machine Area'),
(2, 'ZN-ASM', 'โซนประกอบ', 'Assembly Area'),
(3, 'ZN-QC', 'โซนตรวจสอบ', 'QC Inspection Area'),
(4, 'ZN-WH', 'โซนคลังสินค้า', 'Warehouse Zone');

-- Failure Codes
INSERT INTO `failure_codes` (`id`, `code`, `name`, `category`, `description`) VALUES
(1, 'FC-MEC', 'เชิงกล', 'Mechanical', 'ความเสียหายทางกล'),
(2, 'FC-ELE', 'ไฟฟ้า', 'Electrical', 'ความเสียหายทางไฟฟ้า'),
(3, 'FC-HYD', 'ไฮดรอลิค', 'Hydraulic', 'ปัญหาเกี่ยวกับระบบไฮดรอลิค'),
(4, 'FC-PNU', 'นิวเมติกส์', 'Pneumatic', 'ปัญหาเกี่ยวกับระบบลม'),
(5, 'FC-SFW', 'ซอฟต์แวร์', 'Software', 'ปัญหาเกี่ยวกับซอฟต์แวร์'),
(6, 'FC-OTR', 'อื่นๆ', 'Other', 'อื่นๆ');

-- Repair Codes
INSERT INTO `repair_codes` (`id`, `code`, `name`, `category`, `description`) VALUES
(1, 'RC-RPL', 'เปลี่ยนอะไหล่', 'Replacement', 'เปลี่ยนชิ้นส่วนที่เสียหาย'),
(2, 'RC-ADJ', 'ปรับแต่ง', 'Adjustment', 'ปรับแต่ง/เซ็ตค่า'),
(3, 'RC-CLN', 'ทำความสะอาด', 'Cleaning', 'ทำความสะอาดชิ้นส่วน'),
(4, 'RC-LUB', 'หล่อลื่น', 'Lubrication', 'เติม/เปลี่ยนน้ำมันหล่อลื่น'),
(5, 'RC-WLD', 'เชื่อมซ่อม', 'Welding', 'เชื่อมซ่อมแซม'),
(6, 'RC-CAL', 'ปรับเทียบ', 'Calibration', 'ปรับเทียบความแม่นยำ');

-- Rejection Reasons
INSERT INTO `rejection_reasons` (`id`, `code`, `name`, `module`) VALUES
(1, 'RR-NOP', 'อะไหล่ไม่พร้อม', 'repair'),
(2, 'RR-BUD', 'ไม่มีงบประมาณ', 'repair'),
(3, 'RR-OUT', 'จ้างข้างนอกดำเนินการ', 'repair'),
(4, 'RR-DUP', 'งานซ้ำซ้อน', 'repair'),
(5, 'RR-OTH', 'อื่นๆ', 'repair'),
(6, 'RR-SP-NSP', 'ไม่ผ่านการตรวจสอบ', 'spare_part'),
(7, 'RR-SP-EXP', 'เลยกำหนดส่ง', 'spare_part');

-- Repair Types
INSERT INTO `repair_types` (`id`, `code`, `name`, `description`) VALUES
(1, 'CM', 'Corrective Maintenance', 'ซ่อมแก้ไขเมื่อเสีย'),
(2, 'PM', 'Preventive Maintenance', 'ซ่อมบำรุงเชิงป้องกัน'),
(3, 'PD', 'Predictive Maintenance', 'ซ่อมบำรุงตามสภาพ'),
(4, 'EM', 'Emergency Maintenance', 'ซ่อมฉุกเฉิน'),
(5, 'DM', 'Deferred Maintenance', 'ซ่อมเลื่อนออกไป');

-- Repair Tags
INSERT INTO `repair_tags` (`id`, `name`, `color`) VALUES
(1, 'Safety', '#EF4444'),
(2, 'Quality', '#3B82F6'),
(3, 'Production', '#10B981'),
(4, 'Electrical', '#F59E0B'),
(5, 'Urgent', '#EC4899');

-- Borrowing Reasons
INSERT INTO `borrowing_reasons` (`id`, `code`, `name`) VALUES
(1, 'BR-PROD', 'ใช้งานในกระบวนการผลิต'),
(2, 'BR-QC', 'ตรวจสอบคุณภาพ'),
(3, 'BR-CAL', ' calibration'),
(4, 'BR-TRAIN', 'ฝึกอบรม'),
(5, 'BR-OTHER', 'อื่นๆ');

-- Checklist Templates
INSERT INTO `checklist_templates` (`id`, `code`, `name`, `description`, `category`) VALUES
(1, 'CL-MCH-DAILY', 'ตรวจสอบเครื่องจักรประจำวัน', 'รายการตรวจสอบเครื่องจักรทุกวัน', 'pm_am'),
(2, 'CL-MCH-MONTHLY', 'ตรวจสอบเครื่องจักรประจำเดือน', 'รายการตรวจสอบเครื่องจักรประจำเดือน', 'pm_am'),
(3, 'CL-HYD', 'ตรวจสอบระบบไฮดรอลิค', 'รายการตรวจสอบระบบไฮดรอลิค', 'pm_am'),
(4, 'CL-SFTY', 'ตรวจสอบความปลอดภัย', 'รายการตรวจสอบความปลอดภัย', 'safety');

-- Checklist Template Items
INSERT INTO `checklist_template_items` (`id`, `template_id`, `item_order`, `item_type`, `description`, `is_required`) VALUES
-- Daily machine check
(1, 1, 1, 'yes_no', 'ตรวจสอบระดับน้ำมันหล่อลื่น', 1),
(2, 1, 2, 'yes_no', 'ตรวจสอบสายพานและโซ่', 1),
(3, 1, 3, 'yes_no', 'ตรวจสอบระบบไฟฟ้า', 1),
(4, 1, 4, 'text', 'บันทึกค่าแรงดันลม', 0),
-- Monthly machine check
(5, 2, 1, 'yes_no', 'ตรวจสอบและเปลี่ยนกรองอากาศ', 1),
(6, 2, 2, 'yes_no', 'ตรวจสอบสภาพสายพาน', 1),
(7, 2, 3, 'measurement', 'วัดค่าสั่นสะเทือน', 1),
-- Hydraulic check
(8, 3, 1, 'yes_no', 'ตรวจสอบระดับน้ำมันไฮดรอลิค', 1),
(9, 3, 2, 'yes_no', 'ตรวจสอบท่อและข้อต่อรั่ว', 1),
(10, 3, 3, 'measurement', 'วัดแรงดันระบบไฮดรอลิค', 1),
-- Safety check
(11, 4, 1, 'yes_no', 'ตรวจสอบปุ่มหยุดฉุกเฉิน', 1),
(12, 4, 2, 'yes_no', 'ตรวจสอบ guards และ covers', 1),
(13, 4, 3, 'yes_no', 'ตรวจสอบป้ายเตือน', 1);

-- PM/AM Plans
INSERT INTO `pm_am_plans` (`id`, `code`, `name`, `description`, `plan_type`, `frequency_type`, `frequency_interval`, `lead_days`, `reminder_days`) VALUES
(1, 'PLN-MCH-DAILY', 'ตรวจสอบเครื่องจักรประจำวัน', 'แผนตรวจสอบประจำวันสำหรับเครื่องจักรทุกเครื่อง', 'group', 'daily', 1, 1, 1),
(2, 'PLN-MCH-MONTHLY', 'ตรวจสอบเครื่องจักรประจำเดือน', 'แผนตรวจสอบประจำเดือน', 'single', 'monthly', 1, 7, 3),
(3, 'PLN-HYD-MONTHLY', 'ตรวจสอบระบบไฮดรอลิค', 'แผนตรวจสอบระบบไฮดรอลิค', 'single', 'monthly', 1, 7, 3);

-- PM/AM Plan → Assets
INSERT INTO `pm_am_plan_assets` (`plan_id`, `asset_id`) VALUES
(1, 1), (1, 2), (1, 5),
(2, 1), (2, 2),
(3, 1), (3, 2), (3, 5);

-- PM/AM Plan → Checklists
INSERT INTO `pm_am_plan_checklists` (`plan_id`, `template_id`) VALUES
(1, 1), (1, 4),
(2, 2), (2, 3),
(3, 3);

-- Holidays 2026
INSERT INTO `holidays` (`id`, `holiday_date`, `name`, `is_recurring`) VALUES
(1, '2026-01-01', 'วันขึ้นปีใหม่', 1),
(2, '2026-04-06', 'วันจักรี', 1),
(3, '2026-04-13', 'วันสงกรานต์', 1),
(4, '2026-04-14', 'วันสงกรานต์', 1),
(5, '2026-04-15', 'วันสงกรานต์', 1),
(6, '2026-05-01', 'วันแรงงาน', 1),
(7, '2026-05-04', 'วันฉัตรมงคล', 1),
(8, '2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ', 1),
(9, '2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', 1),
(10, '2026-08-12', 'วันแม่แห่งชาติ', 1),
(11, '2026-10-13', 'วันคล้ายวันสวรรคต ร.9', 1),
(12, '2026-10-23', 'วันปิยมหาราช', 1),
(13, '2026-12-05', 'วันพ่อแห่งชาติ', 1),
(14, '2026-12-10', 'วันรัฐธรรมนูญ', 1),
(15, '2026-12-31', 'วันสิ้นปี', 1);

-- Spare Part Units
INSERT INTO `spare_part_units` (`id`, `code`, `name`) VALUES
(1, 'PC', 'ชิ้น'),
(2, 'SET', 'ชุด'),
(3, 'M', 'เมตร'),
(4, 'L', 'ลิตร'),
(5, 'KG', 'กิโลกรัม'),
(6, 'RL', 'ม้วน'),
(7, 'BX', 'กล่อง');

-- Spare Part Groups
INSERT INTO `spare_part_groups` (`id`, `code`, `name`, `description`) VALUES
(1, 'GRP-BRG', 'กลุ่มลูกปืน', 'Bearing Group'),
(2, 'GRP-BEL', 'กลุ่มสายพาน', 'Belt Group'),
(3, 'GRP-FIL', 'กลุ่มกรอง', 'Filter Group'),
(4, 'GRP-LUB', 'กลุ่มน้ำมันหล่อลื่น', 'Lubricant Group'),
(5, 'GRP-ELC', 'กลุ่มอุปกรณ์ไฟฟ้า', 'Electrical Group');

-- Spare Part Group Items
INSERT INTO `spare_part_group_items` (`spare_part_id`, `group_id`) VALUES
(1, 1), (2, 1),  -- bearings
(3, 2),           -- belt
(4, 4),           -- lubricant
(5, 3);           -- filter

-- Production Hours
INSERT INTO `production_hours` (`id`, `asset_id`, `record_date`, `hours`, `shift`, `notes`) VALUES
(1, 1, '2026-07-01', 8.0, 'เช้า', ''),
(2, 1, '2026-07-01', 8.0, 'บ่าย', ''),
(3, 2, '2026-07-01', 8.0, 'เช้า', ''),
(4, 2, '2026-07-01', 8.0, 'บ่าย', ''),
(5, 1, '2026-07-02', 8.0, 'เช้า', ''),
(6, 1, '2026-07-02', 8.0, 'บ่าย', '');

-- Spare Part Transactions
INSERT INTO `spare_part_transactions` (`id`, `spare_part_id`, `type`, `quantity`, `unit_price`, `reference_type`, `reference_no`, `notes`) VALUES
(1, 1, 'receipt', 50, 250.00, 'po', 'PO-2025-001', 'รับเข้าครั้งแรก'),
(2, 3, 'receipt', 20, 180.00, 'po', 'PO-2025-002', 'รับเข้าครั้งแรก'),
(3, 1, 'withdrawal', 2, 250.00, 'repair_id', '1', 'ใช้ซ่อม MCH-001'),
(4, 4, 'withdrawal', 1, 85.00, 'repair_id', '1', 'ใช้ซ่อม MCH-001'),
(5, 2, 'return', 5, 480.00, 'po', 'PO-2025-003', 'คืนสินค้าคุณภาพไม่ตรง spec');

-- User Permissions
INSERT INTO `user_permissions` (`id`, `role_id`, `module`, `permission`, `is_granted`) VALUES
(1, 1, 'repair', 'view', 1), (2, 1, 'repair', 'create', 1), (3, 1, 'repair', 'edit', 1), (4, 1, 'repair', 'delete', 1), (5, 1, 'repair', 'approve', 1), (6, 1, 'repair', 'assign', 1),
(7, 2, 'repair', 'view', 1), (8, 2, 'repair', 'create', 1), (9, 2, 'repair', 'edit', 1), (10, 2, 'repair', 'delete', 0), (11, 2, 'repair', 'approve', 1), (12, 2, 'repair', 'assign', 1),
(13, 3, 'repair', 'view', 1), (14, 3, 'repair', 'edit', 1),
(15, 1, 'pm_am', 'view', 1), (16, 1, 'pm_am', 'create', 1), (17, 1, 'pm_am', 'edit', 1), (18, 1, 'pm_am', 'delete', 1),
(19, 1, 'calibration', 'view', 1), (20, 1, 'calibration', 'create', 1), (21, 1, 'calibration', 'edit', 1), (22, 1, 'calibration', 'delete', 1),
(23, 1, 'spare_parts', 'view', 1), (24, 1, 'spare_parts', 'create', 1), (25, 1, 'spare_parts', 'edit', 1), (26, 1, 'spare_parts', 'delete', 1),
(27, 1, 'settings', 'view', 1), (28, 1, 'settings', 'edit', 1),
(29, 1, 'users', 'view', 1), (30, 1, 'users', 'create', 1), (31, 1, 'users', 'edit', 1), (32, 1, 'users', 'delete', 1),
(33, 1, 'suppliers', 'view', 1), (34, 1, 'suppliers', 'create', 1), (35, 1, 'suppliers', 'edit', 1), (36, 1, 'suppliers', 'delete', 1),
(37, 1, 'asset_registry', 'view', 1), (38, 1, 'asset_registry', 'create', 1), (39, 1, 'asset_registry', 'edit', 1), (40, 1, 'asset_registry', 'delete', 1);

-- Additional Settings
INSERT INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `description`) VALUES
('default_repair_priority', 'medium', 'repair_config', ' priority เริ่มต้น'),
('auto_assign_repair', '0', 'repair_config', ' assign งานซ่อมอัตโนมัติ'),
('require_approval_repair', '0', 'repair_config', 'ต้องอนุมัติงานซ่อม'),
('default_pm_frequency', 'monthly', 'pm_config', 'PM frequency เริ่มต้น'),
('auto_assign_pm', '0', 'pm_config', ' assign PM อัตโนมัติ'),
('pm_lead_days', '7', 'pm_config', 'PM lead days'),
('pm_reminder_days', '3', 'pm_config', 'PM reminder days'),
('calibration_alert_days', '30', 'calibration_config', ' calibration แจ้งเตือนล่วงหน้า'),
('auto_assign_calibration', '0', 'calibration_config', ' assign calibration อัตโนมัติ'),
('spare_require_approval', '0', 'spare_config', 'ต้องอนุมัติเบิกอะไหล่'),
('spare_approval_level', '1', 'spare_config', 'ระดับการอนุมัติ (1 หรือ 2)'),
('org_chart_enabled', '1', 'general', 'เปิดใช้งานผังองค์กร'),
('qr_code_enabled', '1', 'general', 'เปิดใช้งาน QR Code'),
('calendar_view_default', 'month', 'general', ' มุมมองปฏิทินเริ่มต้น');

-- Asset Responsible Persons
INSERT INTO `asset_responsible_persons` (`id`, `asset_id`, `user_id`, `role_type`) VALUES
(1, 1, 3, 'primary'),
(2, 2, 3, 'primary'),
(3, 5, 4, 'primary'),
(4, 3, 3, 'primary'),
(5, 4, 4, 'primary'),
(6, 1, 2, 'supervisor'),
(7, 2, 2, 'supervisor');

-- Email Notifications
INSERT INTO `email_notifications` (`id`, `module`, `event`, `recipients`, `subject`, `is_active`) VALUES
(1, 'repair', 'created', 'admin@cmms.local,manager@cmms.local', 'แจ้งงานซ่อมใหม่: {title}', 1),
(2, 'repair', 'assigned', '{assignee_email}', 'คุณได้รับมอบหมายงานซ่อม: {title}', 1),
(3, 'repair', 'resolved', 'admin@cmms.local', 'งานซ่อม {title} เสร็จสมบูรณ์', 1),
(4, 'pm_am', 'due_soon', 'admin@cmms.local,manager@cmms.local', 'PM ถึงกำหนด: {title}', 1),
(5, 'calibration', 'due_soon', 'admin@cmms.local,manager@cmms.local', 'Calibration ถึงกำหนด: {asset_name}', 1);

-- Auto Assignment Rules
INSERT INTO `auto_assignment_rules` (`id`, `module`, `rule_name`, `criteria_type`, `criteria_value`, `assignee_id`, `priority`) VALUES
(1, 'repair', ' ช่างประจำเครื่อง MCH-001', 'asset', 1, 3, 1),
(2, 'repair', ' ช่างประจำเครื่อง MCH-002', 'asset', 2, 3, 1),
(3, 'repair', ' ช่างประจำรถโฟล์ค', 'asset', 5, 4, 1),
(4, 'pm_am', 'PM ประจำโซนเครื่องจักร', 'work_zone', 1, 3, 1);

-- Repair Activity Log (for history)
INSERT INTO `repair_activity_log` (`id`, `repair_id`, `user_id`, `action`, `description`, `old_value`, `new_value`) VALUES
(1, 1, 2, 'created', ' เปิดงานซ่อม', NULL, NULL),
(2, 1, 2, 'assigned', ' มอบหมายให้สมศักดิ์', NULL, 'tech01'),
(3, 1, 3, 'acknowledged', ' รับทราบงาน', NULL, NULL),
(4, 1, 3, 'in_progress', ' เริ่มดำเนินการ', NULL, NULL),
(5, 1, 3, 'resolved', ' ซ่อมเสร็จ', NULL, NULL),
(6, 1, 2, 'closed', ' ปิดงานซ่อม', NULL, NULL);
