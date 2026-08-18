-- Migration: Add urgent repair notification settings
-- Date: 2026-08-18

-- เพิ่มการตั้งค่าแจ้งซ่อมด่วน (urgent repair notification)
INSERT IGNORE INTO settings (setting_key, setting_value, setting_group, description) VALUES
('urgent_repair_notify_telegram', '1', 'repair_config', 'ส่ง Telegram แจ้งเตือนเมื่อมีงานซ่อมด่วน (0=ปิด, 1=เปิด)'),
('urgent_repair_notify_line', '1', 'repair_config', 'ส่ง LINE แจ้งเตือนเมื่อมีงานซ่อมด่วน (0=ปิด, 1=เปิด)'),
('urgent_repair_escalation_hours', '2', 'repair_config', 'แจ้งเตือนซ้ำงานซ่อมด่วนที่ยังไม่ได้รับงานหลังจากกี่ชั่วโมง'),
('urgent_repair_auto_priority', '1', 'repair_config', 'ตั้ง priority เป็น critical อัตโนมัติเมื่อสถานะเครื่องเป็น Break Down (0=ปิด, 1=เปิด)');
