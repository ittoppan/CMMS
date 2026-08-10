-- ============================================================
-- CMMS-TPT Migration 20260802 · เมนู PWA ตามบทบาท (Role-based Menu)
-- ตาราง menu_permissions: กำหนดว่า role ใดเห็นเมนูใดใน PWA
--   default (ไม่มีแถว) = เห็นเมนู (ปลอดภัย ไม่กวนฟีเจอร์เดิม)
--   is_granted = 0 → ซ่อนเมนูจากบทบาทนั้น
-- ============================================================

USE `cmms_tpt`;

CREATE TABLE IF NOT EXISTS `menu_permissions` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `role_id`    INT UNSIGNED NOT NULL,
  `menu_key`   VARCHAR(100) NOT NULL,
  `is_granted` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_mp_role_menu` (`role_id`, `menu_key`),
  KEY `fk_mp_role_id` (`role_id`),
  CONSTRAINT `fk_mp_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed เริ่มต้น: คีย์เมนู = เส้นทางหน้าใน PWA
--   Admin (1)    : เห็นทุกเมนู (INSERT ทุกคู่ = 1)
--   Manager (2)  : เห็นทุกเมนู ยกเว้น users / settings (จัดการหัวหน้า)
--   Technician(3): งานช่าง — ไม่เห็นงานหัวหน้า/สร้างแผน/BI/ตั้งค่า
--   Operator (4) : ผู้คุมเครื่อง — แจ้งซ่อม/QR/ติดตาม/แดชบอร์ด
--   Viewer (5)   : ดูรายงานเท่านั้น
-- ============================================================

-- ---- Admin: ทุกเมนูเปิด ----
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
(1, 'dashboard', 1),
(1, 'repair/request', 1),
(1, 'repair/assign', 1),
(1, 'repair/my_tasks', 1),
(1, 'repair/tracking', 1),
(1, 'repair/kanban', 1),
(1, 'repair/history', 1),
(1, 'pm_am/calendar', 1),
(1, 'pm_am/create', 1),
(1, 'pm_am/batch_schedule', 1),
(1, 'pm_am/checksheet', 1),
(1, 'asset_registry', 1),
(1, 'qr-sheet', 1),
(1, 'asset_registry/bom_tree', 1),
(1, 'asset_registry/criticality', 1),
(1, 'equipment_borrowing', 1),
(1, 'calibration', 1),
(1, 'spare_parts', 1),
(1, 'spare_parts/issue_center', 1),
(1, 'spare_parts/sage_po', 1),
(1, 'spare_parts/optimization', 1),
(1, 'analytics', 1),
(1, 'reports/monthly_pdf', 1),
(1, 'reports/export_excel', 1),
(1, 'safety/work_permit', 1),
(1, 'iot/monitor', 1),
(1, 'notifications', 1),
(1, 'settings/notifications', 1),
(1, 'register', 1),
(1, 'users', 1),
(1, 'settings', 1);

-- ---- Manager (หัวหน้า): เห็นทุกเมนูยกเว้น users/settings ----
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
(2, 'dashboard', 1),
(2, 'repair/request', 1),
(2, 'repair/assign', 1),
(2, 'repair/my_tasks', 1),
(2, 'repair/tracking', 1),
(2, 'repair/kanban', 1),
(2, 'repair/history', 1),
(2, 'pm_am/calendar', 1),
(2, 'pm_am/create', 1),
(2, 'pm_am/batch_schedule', 1),
(2, 'pm_am/checksheet', 1),
(2, 'asset_registry', 1),
(2, 'qr-sheet', 1),
(2, 'asset_registry/bom_tree', 1),
(2, 'asset_registry/criticality', 1),
(2, 'equipment_borrowing', 1),
(2, 'calibration', 1),
(2, 'spare_parts', 1),
(2, 'spare_parts/issue_center', 1),
(2, 'spare_parts/sage_po', 1),
(2, 'spare_parts/optimization', 1),
(2, 'analytics', 1),
(2, 'reports/monthly_pdf', 1),
(2, 'reports/export_excel', 1),
(2, 'safety/work_permit', 1),
(2, 'iot/monitor', 1),
(2, 'notifications', 1),
(2, 'settings/notifications', 1),
(2, 'register', 1),
(2, 'users', 0),
(2, 'settings', 0);

-- ---- Technician (ช่าง): งานช่าง + เบิกอะไหล่ ----
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
(3, 'dashboard', 1),
(3, 'repair/request', 1),
(3, 'repair/assign', 0),
(3, 'repair/my_tasks', 1),
(3, 'repair/tracking', 1),
(3, 'repair/kanban', 1),
(3, 'repair/history', 1),
(3, 'pm_am/calendar', 1),
(3, 'pm_am/create', 0),
(3, 'pm_am/batch_schedule', 0),
(3, 'pm_am/checksheet', 1),
(3, 'asset_registry', 1),
(3, 'qr-sheet', 1),
(3, 'asset_registry/bom_tree', 1),
(3, 'asset_registry/criticality', 1),
(3, 'equipment_borrowing', 1),
(3, 'calibration', 1),
(3, 'spare_parts', 1),
(3, 'spare_parts/issue_center', 1),
(3, 'spare_parts/sage_po', 0),
(3, 'spare_parts/optimization', 0),
(3, 'analytics', 0),
(3, 'reports/monthly_pdf', 0),
(3, 'reports/export_excel', 0),
(3, 'safety/work_permit', 1),
(3, 'iot/monitor', 1),
(3, 'notifications', 1),
(3, 'settings/notifications', 0),
(3, 'register', 1),
(3, 'users', 0),
(3, 'settings', 0);

-- ---- Operator (ผู้ควบคุมเครื่อง): แจ้งซ่อม/QR/ติดตาม/แดชบอร์ด ----
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
(4, 'dashboard', 1),
(4, 'repair/request', 1),
(4, 'repair/assign', 0),
(4, 'repair/my_tasks', 0),
(4, 'repair/tracking', 1),
(4, 'repair/kanban', 0),
(4, 'repair/history', 0),
(4, 'pm_am/calendar', 0),
(4, 'pm_am/create', 0),
(4, 'pm_am/batch_schedule', 0),
(4, 'pm_am/checksheet', 0),
(4, 'asset_registry', 0),
(4, 'qr-sheet', 1),
(4, 'asset_registry/bom_tree', 0),
(4, 'asset_registry/criticality', 0),
(4, 'equipment_borrowing', 0),
(4, 'calibration', 0),
(4, 'spare_parts', 0),
(4, 'spare_parts/issue_center', 0),
(4, 'spare_parts/sage_po', 0),
(4, 'spare_parts/optimization', 0),
(4, 'analytics', 0),
(4, 'reports/monthly_pdf', 0),
(4, 'reports/export_excel', 0),
(4, 'safety/work_permit', 0),
(4, 'iot/monitor', 0),
(4, 'notifications', 1),
(4, 'settings/notifications', 0),
(4, 'register', 1),
(4, 'users', 0),
(4, 'settings', 0);

-- ---- Viewer (ผู้ดูรายงาน) ----
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
(5, 'dashboard', 1),
(5, 'repair/request', 0),
(5, 'repair/assign', 0),
(5, 'repair/my_tasks', 0),
(5, 'repair/tracking', 0),
(5, 'repair/kanban', 0),
(5, 'repair/history', 0),
(5, 'pm_am/calendar', 0),
(5, 'pm_am/create', 0),
(5, 'pm_am/batch_schedule', 0),
(5, 'pm_am/checksheet', 0),
(5, 'asset_registry', 0),
(5, 'qr-sheet', 0),
(5, 'asset_registry/bom_tree', 0),
(5, 'asset_registry/criticality', 0),
(5, 'equipment_borrowing', 0),
(5, 'calibration', 0),
(5, 'spare_parts', 0),
(5, 'spare_parts/issue_center', 0),
(5, 'spare_parts/sage_po', 0),
(5, 'spare_parts/optimization', 0),
(5, 'analytics', 1),
(5, 'reports/monthly_pdf', 1),
(5, 'reports/export_excel', 1),
(5, 'safety/work_permit', 0),
(5, 'iot/monitor', 0),
(5, 'notifications', 1),
(5, 'settings/notifications', 0),
(5, 'register', 0),
(5, 'users', 0),
(5, 'settings', 0);
