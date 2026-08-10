-- ============================================================
-- CMMS-TPT Migration 2026-08-02: Email Notification Templates + SMTP
-- Adds:
--  1) SMTP settings keys in `settings`
--  2) Seed/update `email_notifications` rows with designable templates
--     (module/event pairs mapped to the 5 LINE template events)
-- Safe to run multiple times (upserts).
-- ============================================================

-- 1) SMTP + email settings -------------------------------------------------
INSERT INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `description`) VALUES
('smtp_enabled',      '0',    'notification', 'ใช้ SMTP ในการส่งอีเมล (0=ใช้ mail() ของ PHP, 1=ใช้ SMTP)'),
('smtp_host',         '',     'notification', 'SMTP Host เช่น smtp.gmail.com / smtp.office365.com'),
('smtp_port',         '587',  'notification', 'SMTP Port เช่น 587 (STARTTLS), 465 (SSL), 25'),
('smtp_encryption',   'tls',  'notification', 'การเข้ารหัส SMTP: none / tls / ssl'),
('smtp_user',         '',     'notification', 'SMTP Username (อีเมลผู้ส่ง)'),
('smtp_pass',         '',     'notification', 'SMTP Password / App Password'),
('smtp_from_email',   '',     'notification', 'อีเมลผู้ส่ง (From) — ว่าง = ใช้ smtp_user'),
('smtp_from_name',    'CMMS-TPT', 'notification', 'ชื่อผู้ส่ง (From Name)'),
('email_notify_enabled', '0', 'notification', 'เปิด/ปิดการแจ้งเตือนผ่านอีเมล')
ON DUPLICATE KEY UPDATE `setting_group` = VALUES(`setting_group`), `description` = VALUES(`description`);

-- 2) Email templates (5 events, mapped to LINE template keys) ---------------
-- template_body stores JSON: {"header_color","body_html","btn_label","btn_url","enabled"}
INSERT INTO `email_notifications` (`module`, `event`, `recipients`, `subject`, `template_body`, `is_active`) VALUES
('repair', 'created', 'admin@cmms.local,manager@cmms.local', '🚨 แจ้งซ่อมด่วน #{work_order_id}: {title}', '{"header_color":"#dc2626","body_html":"เครื่องจักร: <b>{asset_code}</b> - {asset_name}<br>อาการเสีย: {title}<br>ความเร่งด่วน: <b>{priority}</b> | สถานะ: {status}<br>ผู้แจ้งซ่อม: {reporter_name}","btn_label":"เปิดดูใบแจ้งซ่อม","btn_url":"","enabled":"1"}', 1),
('pm_am', 'due_soon', 'admin@cmms.local,manager@cmms.local', '📋 แผน PM ถึงกำหนด/เกินกำหนด: {title}', '{"header_color":"#d97706","body_html":"เครื่องจักร: <b>{asset_code}</b><br>รายการ: {title}<br>กำหนดชำระ: {due_date} (เกินมา {days_overdue} วัน)","btn_label":"เปิดเช็คชีท PM","btn_url":"","enabled":"1"}', 1),
('inventory', 'low_stock', 'admin@cmms.local', '📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ: {item_name}', '{"header_color":"#7c3aed","body_html":"รหัสอะไหล่: <b>{item_code}</b><br>ชื่ออะไหล่: {item_name}<br>คงเหลือ: {qty} (ขั้นต่ำ: {min_stock})","btn_label":"สั่งซื้อ/เบิกจ่าย","btn_url":"","enabled":"1"}', 1),
('repair', 'resolved', 'admin@cmms.local', '✅ ซ่อมเสร็จเรียบร้อย #{work_order_id}', '{"header_color":"#16a34a","body_html":"เครื่องจักร: <b>{asset_code}</b> - {asset_name}<br>Downtime: {downtime_hours} ชม.<br>ค่าซ่อมรวม: {total_cost} บาท<br>ช่างผู้ปิดงาน: {assigned_name}","btn_label":"ประเมินผลงาน","btn_url":"","enabled":"1"}', 1),
('sage', 'approval', 'admin@cmms.local', '📑 ขออนุมัติเบิกอะไหล่ #{requisition_no}', '{"header_color":"#7c3aed","body_html":"รายการ: {items_summary}<br>ผู้ขอเบิก: {requester_name}<br>รวมมูลค่า: <b>{total_amount} บาท</b>","btn_label":"อนุมัติการเบิก","btn_url":"","enabled":"1"}', 1)
ON DUPLICATE KEY UPDATE
  `recipients` = VALUES(`recipients`),
  `subject` = VALUES(`subject`),
  `template_body` = IF(`template_body` IS NULL OR `template_body` = '', VALUES(`template_body`), `template_body`),
  `is_active` = VALUES(`is_active`);
