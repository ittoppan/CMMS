-- Migration: Enterprise Reports + Analytics Phase 17
-- - report_audit_log (รายงานที่ถูก Export เก็บไว้สำหรับตรวจสอบ)
-- - menu_permissions สำหรับหน้า Report Center / Report แต่ละหมวด
-- ปลอดภัย: ADDITIVE เท่านั้น (CREATE TABLE IF NOT EXISTS / INSERT ... ON DUPLICATE KEY UPDATE)
-- วิธีใช้: รันผ่าน php database/apply_alter.php หรือ CLI กับ db cmms_tpt

USE cmms_tpt;

SET FOREIGN_KEY_CHECKS = 0;

-- 1) audit log สำหรับการ Export รายงาน (ข้อมูลสำคัญ user/report/filter/type/time)
CREATE TABLE IF NOT EXISTS `report_audit_log` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`     INT UNSIGNED NULL,
  `user_name`   VARCHAR(255) NULL,
  `report`      VARCHAR(60) NOT NULL,
  `filters`     TEXT NULL,
  `export_type` VARCHAR(10) NOT NULL DEFAULT 'view',
  `row_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_rpt_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_ral_report` (`report`),
  INDEX `idx_ral_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) menu_permissions — Report Center สรุปส่วนกลางให้ทุก role
--    รายงาน Cost ❌ เฉพาะ 1/2/6 (Manager/Admin/ASST Manager), Technician ❌ 1/2/6/7
INSERT INTO `menu_permissions` (`role_id`, `menu_key`, `is_granted`) VALUES
  (1, 'reports/report-center', 1), (2, 'reports/report-center', 1), (3, 'reports/report-center', 1),
  (4, 'reports/report-center', 1), (5, 'reports/report-center', 1), (6, 'reports/report-center', 1), (7, 'reports/report-center', 1),
  (1, 'reports/work-orders', 1), (2, 'reports/work-orders', 1), (3, 'reports/work-orders', 1),
  (4, 'reports/work-orders', 1), (5, 'reports/work-orders', 1), (6, 'reports/work-orders', 1), (7, 'reports/work-orders', 1),
  (1, 'reports/requests', 1), (2, 'reports/requests', 1), (3, 'reports/requests', 1),
  (4, 'reports/requests', 1), (5, 'reports/requests', 1), (6, 'reports/requests', 1), (7, 'reports/requests', 1),
  (1, 'reports/pm', 1), (2, 'reports/pm', 1), (3, 'reports/pm', 1),
  (4, 'reports/pm', 1), (5, 'reports/pm', 1), (6, 'reports/pm', 1), (7, 'reports/pm', 1),
  (1, 'reports/inspections', 1), (2, 'reports/inspections', 1), (3, 'reports/inspections', 1),
  (4, 'reports/inspections', 1), (5, 'reports/inspections', 1), (6, 'reports/inspections', 1), (7, 'reports/inspections', 1),
  (1, 'reports/assets', 1), (2, 'reports/assets', 1), (3, 'reports/assets', 1),
  (4, 'reports/assets', 1), (5, 'reports/assets', 1), (6, 'reports/assets', 1), (7, 'reports/assets', 1),
  (1, 'reports/spare-parts', 1), (2, 'reports/spare-parts', 1), (3, 'reports/spare-parts', 1),
  (4, 'reports/spare-parts', 1), (5, 'reports/spare-parts', 1), (6, 'reports/spare-parts', 1), (7, 'reports/spare-parts', 1),
  (1, 'reports/downtime', 1), (2, 'reports/downtime', 1), (3, 'reports/downtime', 1),
  (4, 'reports/downtime', 1), (5, 'reports/downtime', 1), (6, 'reports/downtime', 1), (7, 'reports/downtime', 1),
  (1, 'reports/sla', 1), (2, 'reports/sla', 1), (3, 'reports/sla', 1),
  (4, 'reports/sla', 1), (5, 'reports/sla', 1), (6, 'reports/sla', 1), (7, 'reports/sla', 1),
  (1, 'reports/mttr-mtbf', 1), (2, 'reports/mttr-mtbf', 1), (3, 'reports/mttr-mtbf', 1),
  (4, 'reports/mttr-mtbf', 1), (5, 'reports/mttr-mtbf', 1), (6, 'reports/mttr-mtbf', 1), (7, 'reports/mttr-mtbf', 1),
  (1, 'reports/scheduled', 1), (2, 'reports/scheduled', 1), (3, 'reports/scheduled', 1),
  (4, 'reports/scheduled', 1), (5, 'reports/scheduled', 1), (6, 'reports/scheduled', 1), (7, 'reports/scheduled', 1),
  -- Cost Report — เฉพาะผู้เห็นต้นทุน (1 Admin / 2 Manager / 6 ASST Manager)
  (1, 'reports/cost', 1), (2, 'reports/cost', 1), (6, 'reports/cost', 1),
  (3, 'reports/cost', 0), (4, 'reports/cost', 0), (5, 'reports/cost', 0), (7, 'reports/cost', 0),
  -- Technician Performance — ฝ่ายบริหาร/วางแผนเท่านั้น (1/2/6/7)
  (1, 'reports/technicians', 1), (2, 'reports/technicians', 1), (6, 'reports/technicians', 1), (7, 'reports/technicians', 1),
  (3, 'reports/technicians', 0), (4, 'reports/technicians', 0), (5, 'reports/technicians', 0)
ON DUPLICATE KEY UPDATE `is_granted` = VALUES(`is_granted`);

SET FOREIGN_KEY_CHECKS = 1;