-- ============================================================
-- CMMS-TPT Migration 2026-11-17: Support contact settings
-- Adds:
--  1) `support_phone` / `support_email` — ช่องทางติดต่อแอดมินที่แสดงให้ผู้ใช้
--     (หน้า /repair/request และ /register ตอนยังไม่ผูกบัญชี)
-- เหตุผล: เดิมใช้ company_phone และ smtp_from_email ซึ่งเป็นเบอร์ seed ปลอม
-- และอีเมลผู้ส่งของระบบ — แอดมินแก้ From ของ SMTP แล้วช่องทางติดต่อผู้ใช้เปลี่ยนตาม
-- ค่าว่าง = settings_support_contact() fallback ไป company_phone / smtp_from_email
-- Safe to run multiple times (upserts, ไม่ทับค่าที่ตั้งไว้แล้ว)
-- ============================================================

INSERT INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `description`) VALUES
('support_phone', '', 'company', 'เบอร์ติดต่อแอดมินสำหรับผู้ใช้ (ว่าง = ใช้ company_phone)'),
('support_email', '', 'company', 'อีเมลติดต่อแอดมินสำหรับผู้ใช้ (ว่าง = ใช้ smtp_from_email)')
ON DUPLICATE KEY UPDATE `setting_group` = VALUES(`setting_group`), `description` = VALUES(`description`);
