-- migration_20261114_sla_priority.sql
-- เพิ่มค่า SLA ตามระดับความสำคัญของใบงานซ่อม (ใช้โดย src/helpers/sla.php)
--
-- ผลลัพธ์: หน้า /settings (กลุ่ม repair_config) จะมีช่องให้แก้ชั่วโมง SLA ของแต่ละ priority
--          และเปิด/ปิดการประทับ sla_due_at + estimated_completion_date อัตโนมัติเมื่อจ่ายงาน
--
-- ปลอดภัยต่อการรันซ้ำ: settings.setting_key มี UNIQUE (uk_settings_key) → INSERT IGNORE
-- ไม่ลบ/ไม่แก้ค่าที่มีอยู่แล้ว (ถ้าผู้ดูแลตั้งค่าเองไว้ ค่านั้นจะคงอยู่)

INSERT IGNORE INTO settings (setting_key, setting_value, setting_group, description) VALUES
  ('sla_hours_critical', '4',   'repair_config', 'SLA (ชั่วโมง) ของงาน priority=critical นับจากเวลาจ่ายงาน'),
  ('sla_hours_high',     '24',  'repair_config', 'SLA (ชั่วโมง) ของงาน priority=high นับจากเวลาจ่ายงาน'),
  ('sla_hours_medium',   '72',  'repair_config', 'SLA (ชั่วโมง) ของงาน priority=medium นับจากเวลาจ่ายงาน'),
  ('sla_hours_low',      '168', 'repair_config', 'SLA (ชั่วโมง) ของงาน priority=low นับจากเวลาจ่ายงาน'),
  ('sla_auto_apply',     '1',   'repair_config', 'ประทับ sla_due_at/estimated_completion_date อัตโนมัติเมื่อจ่ายงาน (1=เปิด)');
