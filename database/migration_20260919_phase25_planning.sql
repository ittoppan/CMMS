-- ============================================================================
-- migration_20260919_phase25_planning.sql
-- Phase 25 — Advanced Maintenance Planning & Scheduling
--
-- Additive only (ไม่แก้/ไม่ลบของเดิม):
--   1) technician_skills        — ทักษะ/ใบรับรอง/ระดับความชำนาญของช่าง (ต่อผู้ใช้)
--   2) repair_schedule_log      — บันทึกการเปลี่ยนตาราง/มอบหมาย/ลำดับความสำคัญ
--                                (audit trail — ทุกการ schedule/assign/priority ต้องมีแถว)
--   3) settings (planning_*)    — เกณฑ์ของหลักที่ใช้คำนวณ capacity/conflict/SLA risk
--                                (ไม่มีค่าให้เดาเป็นนโยบาย — ตั้งค่าผ่านหน้า Settings)
--   4) notification_templates   — repair:planned / repair:rescheduled / repair:emergency
--   5) menu_permissions         — planning / planning/calendar เฉพาะผู้วางแผน (1,2,6,7),
--                                field/plan (MY PLAN) สำหรับทุกบทบาทที่รับงานได้ (1,2,3,6,7)
--
-- หมายเหตุ: ไฟล์นี้เป็นเอกสารประกอบ (run-once) — ตัวที่ใช้จริงคือ
--   scripts/apply_phase25_planning.php (idempotent, ตรวจ information_schema ก่อนแก้)
-- ============================================================================

-- 1) ทักษะของช่าง (skill_name unique ต่อผู้ใช้ — ห้าม master data ซ้ำ)
CREATE TABLE IF NOT EXISTS `technician_skills` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED NOT NULL,
  `skill_name`  VARCHAR(120) NOT NULL,
  `skill_level` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=เริ่มต้น ... 5=เชี่ยวชาญ',
  `certification` VARCHAR(120) NULL,
  `valid_until` DATE NULL,
  `area`        VARCHAR(120) NULL COMMENT 'พื้นที่/สายการผลิตที่รับผิดชอบ',
  `notes`       VARCHAR(255) NULL,
  `created_by`  INT UNSIGNED NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_techskill_user_skill` (`user_id`, `skill_name`),
  KEY `idx_techskill_user` (`user_id`),
  KEY `idx_techskill_name` (`skill_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Audit trail ของการวางแผน/เปลี่ยนตาราง/มอบหมาย/ลำดับความสำคัญ
CREATE TABLE IF NOT EXISTS `repair_schedule_log` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `repair_id`        INT UNSIGNED NOT NULL,
  `action`           ENUM('schedule','reschedule','assign','priority','emergency','bulk') NOT NULL,
  `old_start_at`     DATETIME NULL,
  `new_start_at`     DATETIME NULL,
  `old_end_at`       DATETIME NULL,
  `new_end_at`       DATETIME NULL,
  `old_assignee_id`  INT UNSIGNED NULL,
  `new_assignee_id`  INT UNSIGNED NULL,
  `old_priority`     VARCHAR(20) NULL,
  `new_priority`     VARCHAR(20) NULL,
  `reason`           VARCHAR(255) NULL,
  `changed_by`       INT UNSIGNED NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedlog_repair` (`repair_id`),
  KEY `idx_schedlog_created` (`created_at`),
  KEY `idx_schedlog_user` (`changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) เกณฑ์ของหลัก (defaults ถูก insert ใน apply script / settings_defaults.php)
--    planning_shift_start        เช่น 08:00 — จุดเริ่มกะทำงาน (ไว้คำนวณความพร้อมช่วงกลางวัน)
--    planning_shift_hours        เช่น 8    — ชั่วโมงทำงานต่อวัน (fallback: work_hours_per_day)
--    planning_working_days       เช่น 1,2,3,4,5 — วันทำงานในสัปดาห์ (1=จันทร์ ... 7=อาทิตย์)
--    planning_sla_risk_hours     เช่น 24   — เหลือเวลา SLA ภายในกี่ชั่วโมงจึงถือว่า "At Risk"
--    planner_break_hour          เช่น 12.5 — ช่วงพักกลางวันที่ buffer ใหญ่สุด (0 = ไม่นับ)

-- 4) เทมเพลตแจ้งเตือน planning (INSERT IGNORE — สำรองเพิ่มใน NotificationCenterService::defaultTemplates())
-- INSERT IGNORE INTO notification_templates
--   (module, event, priority, title_template, message_template, url_template)
-- VALUES
--   ('repair','planned',      'medium', 'งาน {work_order_no} ถูกวางแผนแล้ว', 'เครื่อง: {asset_code} - {asset_name}\nเวลาเริ่ม: {planned_start_at}\nทักษะที่ต้องการ: {required_skill}', '/repair/view?id={ref_id}'),
--   ('repair','rescheduled',  'high',   'เลื่อนกำหนดงาน {work_order_no}', 'งาน: {title}\nเครื่อง: {asset_code}\nเวลาใหม่: {planned_start_at} → {planned_end_at}\nเหตุผล: {reason}', '/repair/view?id={ref_id}'),
--   ('repair','emergency',    'critical','งานฉุกเฉิน {work_order_no}', 'เครื่อง: {asset_code} - {asset_name}\nงาน: {title}\nเหตุผล: {reason}', '/repair/view?id={ref_id}');