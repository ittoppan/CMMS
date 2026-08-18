-- migration_20260818_must_change_password.sql
-- บังคับเปลี่ยนรหัสผ่านครั้งแรก (first-login): บัญชีที่ตั้งรหัสเริ่มต้น
-- ต้องเปลี่ยนรหัสก่อนใช้งาน — 1 = บังคับ, 0 = ปกติ
ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0
  AFTER lang;
