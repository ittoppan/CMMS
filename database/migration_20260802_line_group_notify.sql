-- 2026-08-02: เพิ่มตั้งค่า LINE แจ้งเตือนงานใหม่เข้ากลุ่มช่าง
INSERT INTO settings (setting_key, setting_value, setting_group, description)
VALUES ('line_maintenance_group_id', '', 'notification', 'Group ID ของห้อง LINE กลุ่มช่าง (เมื่องานใหม่เข้า → push เข้ากลุ่ม)')
ON DUPLICATE KEY UPDATE setting_group = VALUES(setting_group), description = VALUES(description);
