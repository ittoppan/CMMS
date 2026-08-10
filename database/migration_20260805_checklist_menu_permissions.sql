-- ============================================================
-- CMMS-TPT Migration 20260805b · Checklist Engine — เมนูตามบทบาท
--   Admin (1) / Manager (2) : เห็นหมด (ไม่มีแถว = default เห็น)
--   Technician (3)          : ทำตรวจได้ แต่ไม่แก้ Template
--   Operator (4)            : ทำตรวจได้ (หน้างาน) แต่ไม่แก้ Template
--   Viewer (5)              : ไม่เห็นโมดูลตรวจเช็ค
-- ============================================================

USE `cmms_tpt`;

INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
(3, 'inspections', 1),
(3, 'inspections/templates', 0),
(4, 'inspections', 1),
(4, 'inspections/templates', 0),
(5, 'inspections', 0),
(5, 'inspections/templates', 0)
ON DUPLICATE KEY UPDATE `is_granted` = VALUES(`is_granted`);
