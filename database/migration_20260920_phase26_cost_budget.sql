-- ============================================================================
-- migration_20260920_phase26_cost_budget.sql
-- Phase 26 — Maintenance Cost & Budget Management
--
-- Additive only (ไม่แก้/ไม่ลบของเดิม):
--   1) ALTER budget_plan (additive)        — status workflow + currency/notes/ผู้บันทึก/ผู้อนุมัติ
--   2) budget_adjustment                   — บันทึกการปรับเพิ่ม/ลดงบประมาณ (เหตุผล + หลักฐาน)
--   3) v_maintenance_cost                  — fact view: cost ต่อใบสั่งซ่อมจากแหล่งจริงทั้งหมด
--                                            (repair snapshots + repair_spare_parts snapshot Sage)
--   4) settings (cost_*/budget_*)          — เกณฑ์ของราคาค่าแรง/เกณฑ์แจ้งเตือนงบประมาณ
--   5) notification_templates              — budget:alert / budget:over
--   6) menu_permissions                    — cost / budget เฉพาะ role ที่เห็นต้นทุน (1,2,6)
--
-- หมายเหตุ: ไฟล์นี้เป็นเอกสารประกอบ (run-once) — ตัวที่ใช้จริงคือ
--   scripts/apply_phase26_cost_budget.php (idempotent, ตรวจ information_schema ก่อนแก้)
-- ============================================================================

-- 1) ขยาย budget_plan (additive) — workflow: draft → submitted → active → closed / cancelled
ALTER TABLE `budget_plan`
  ADD COLUMN `status`         VARCHAR(20)  NOT NULL DEFAULT 'draft' COMMENT 'draft|submitted|active|closed|cancelled' AFTER `allocated_budget`,
  ADD COLUMN `currency`       VARCHAR(8)   NOT NULL DEFAULT 'THB' AFTER `status`,
  ADD COLUMN `notes`          VARCHAR(500) NULL AFTER `currency`,
  ADD COLUMN `created_by`     INT UNSIGNED NULL AFTER `notes`,
  ADD COLUMN `approved_by`    INT UNSIGNED NULL AFTER `created_by`,
  ADD COLUMN `approved_at`    DATETIME NULL AFTER `approved_by`,
  ADD COLUMN `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

-- ข้อมูลงบประมาณที่ seed ไว้แล้ว (12 แถว) ให้เป็น "ใช้งานจริง" ต่อไป (ไม่แตะการอ่านที่มีอยู่)
UPDATE `budget_plan` SET `status` = 'active' WHERE `status` = 'draft';

-- 2) ตารางปรับงบประมาณ (บวก/ลบ พร้อมเหตุผล — audit ได้)
CREATE TABLE IF NOT EXISTS `budget_adjustment` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_id`          INT NOT NULL,
  `adjustment_amount`  DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'บวก(+) / ลด(-)',
  `reason`             VARCHAR(500) NULL,
  `currency`           VARCHAR(8) NOT NULL DEFAULT 'THB',
  `created_by`         INT UNSIGNED NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_budgetadj_budget` (`budget_id`),
  KEY `idx_budgetadj_created` (`created_at`),
  CONSTRAINT `fk_budgetadj_budget` FOREIGN KEY (`budget_id`) REFERENCES `budget_plan` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Fact view ต้นทุนต่อใบสั่งซ่อม (แหล่งเดียวกับ Dashboard/report/export — ห้ามคำนวณต่างที่)
--    parts_cost          = exact จาก repair_spare_parts (snapshot ราคา Sage ถึงวันใช้งาน)
--    parts_lines/qty     = จำนวนรายการ/จำนวนที่ใช้งาน
--    parts_missing_price = รายการที่ใช้งานแล้วแต่ไม่มีราคา (แสดง Not Available ระดับรายการ)
--    maintenance_type    = preventive (PM) / corrective (เสียซ่อม) / improvement / other
CREATE OR REPLACE VIEW `v_maintenance_cost` AS
SELECT
  r.id                                                          AS repair_id,
  r.work_order_no                                               AS work_order_no,
  r.asset_id                                                    AS asset_id,
  a.code                                                        AS asset_code,
  a.name                                                        AS asset_name,
  COALESCE(r.department_id, a.department_id)                    AS department_id,
  d.name                                                        AS department_name,
  COALESCE(a.location, '')                                      AS location,
  r.priority                                                    AS priority,
  r.status                                                      AS status,
  r.source_type                                                 AS source_type,
  r.work_order_type                                             AS work_order_type,
  CASE
    WHEN r.work_order_type IN ('breakdown','corrective','emergency','urgent') THEN 'corrective'
    WHEN r.work_order_type IN ('preventive','pm','am','inspection','calendar') THEN 'preventive'
    WHEN r.pm_am_id IS NOT NULL OR r.pm_plan_id IS NOT NULL THEN 'preventive'
    WHEN r.source_type = 'breakdown' THEN 'corrective'
    WHEN r.source_type IN ('modify','modification','build') THEN 'improvement'
    ELSE 'other'
  END                                                           AS maintenance_type,
  CASE
    WHEN r.source_type = 'breakdown' OR r.work_order_type IN ('breakdown','corrective','emergency','urgent') THEN 1
    ELSE 0
  END                                                           AS is_breakdown,
  r.created_at                                                  AS created_at,
  r.completed_at                                                AS completed_at,
  r.planned_start_at                                            AS planned_start_at,
  r.planned_end_at                                              AS planned_end_at,
  COALESCE(r.downtime_minutes, 0)                               AS downtime_minutes,
  COALESCE(r.repair_time_minutes, 0)                            AS repair_time_minutes,
  COALESCE(r.cost_parts, 0)                                     AS cost_parts_snapshot,
  COALESCE(r.cost_labor, 0)                                     AS cost_labor_recorded,
  COALESCE(r.cost_outsource, 0)                                 AS cost_outsource_recorded,
  COALESCE(r.outsource_by, '')                                  AS outsource_by,
  COALESCE(rsp.parts_cost, 0)                                   AS parts_cost,
  COALESCE(rsp.parts_qty, 0)                                    AS parts_qty,
  COALESCE(rsp.parts_lines, 0)                                  AS parts_lines,
  COALESCE(rsp.parts_missing_price, 0)                          AS parts_missing_price
FROM `repair` r
LEFT JOIN `asset_registry` a ON a.id = r.asset_id
LEFT JOIN `departments` d ON d.id = COALESCE(r.department_id, a.department_id)
LEFT JOIN (
  SELECT repair_id,
         SUM(quantity_used * unit_price) AS parts_cost,
         SUM(quantity_used)              AS parts_qty,
         COUNT(*)                        AS parts_lines,
         SUM(CASE WHEN unit_price IS NULL OR unit_price <= 0 THEN 1 ELSE 0 END) AS parts_missing_price
  FROM repair_spare_parts
  GROUP BY repair_id
) rsp ON rsp.repair_id = r.id;

-- 4) เกณฑ์ของหลัก (defaults ถูก insert ใน apply script / settings_defaults.php)
--    cost_labor_enabled      — 1/0 คำนวณค่าแรงจากเวลา × อัตรา (ปิด = ไม่แสดงคอมโพเนนต์ค่าแรง)
--    cost_labor_rate_source  — configured (standard_labor_rate)  ยังไม่ผูกตัวจับเวลาจริง
--    budget_warning_pct      — ใช้ร้อยละเท่าไรของงบถึงเกณฑ์ WARNING
--    budget_exceed_pct       — ใช้ร้อยละเท่าไรของงบถึงเกณฑ์ EXCEEDED
--    budget_dept_filter_enabled — อนุญาต filter ตามแผนก (เปิดตาม requirement — ปิดได้จาก Settings)

-- 5) เทมเพลตแจ้งเตือนงบประมาณ (INSERT IGNORE — สำรองเพิ่มใน NotificationCenterService::defaultTemplates())
-- INSERT IGNORE INTO notification_templates
--   (module, event, priority, title_template, message_template, url_template)
-- VALUES
--   ('budget','alert','high', 'งบประมาณ {month_name} ใกล้ถึงเกณฑ์แล้ว', 'งบ {year} เดือน {month}: ใช้ไป {used} จาก {budget} ({pct}%)\nแผนก: {department}', '/budget'),
--   ('budget','over', 'critical','งบประมาณ {month_name} เกินกำหนดแล้ว', 'งบ {year} เดือน {month}: ใช้ไป {used} จาก {budget} ({pct}%)\nแผนก: {department}', '/budget');

-- 6) สิทธิ์เมนู cost / budget (1,2,6 — ผูกกับ kpi_can_see_cost เดิม ไม่สร้างสิทธิ์ขนาน)
-- INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES
--   (1,'cost',1),(2,'cost',1),(3,'cost',0),(4,'cost',0),(5,'cost',0),(6,'cost',1),(7,'cost',0),
--   (1,'budget',1),(2,'budget',1),(3,'budget',0),(4,'budget',0),(5,'budget',0),(6,'budget',1),(7,'budget',0);