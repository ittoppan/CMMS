-- migration_20261118_pm_reminders_dedupe_proposal.sql
-- PROPOSAL ONLY — DO NOT RUN WITHOUT EXPLICIT APPROVAL.
-- Purpose: schema-backed dedupe for PM reminders (scripts/pm_reminders.php / pm_reminders.php API)
--          so a daily Task Scheduler run does not send the same cycle twice.
--
-- อ้างอิงการออกแบบ: docs/pm-reminders-dedupe-design.md
--
-- IMPORTANT — อ่านก่อนรัน:
--   1) ตรวจสภาพจริงก่อน (read-only) — ห้ามเดา:
--        SHOW COLUMNS FROM pm_am;
--        SHOW INDEX FROM pm_am;
--   2) MySQL ไม่รองรับ ADD COLUMN IF NOT EXISTS (MariaDB รองรับ) — ถ้าคอลัมน์มีอยู่แล้ว
--      ให้ข้ามรายการนั้น อย่ารันทั้งบล็อกซ้ำ
--   3) additive ทั้งหมด: ไม่มี DROP / ไม่แก้ชนิดคอลัมน์เดิม / ไม่แตะข้อมูลธุรกิจ
--   4) Deploy ลำดับ: schema ก่อน แล้วจึง deploy โค้ด (โค้ดใหม่ query คอลัมน์นี้)
--   5) Backup ก่อนรัน และทดสอบบน staging ก่อน production (docs/DATABASE_RECOVERY.md)

-- ============================================================================
-- 0) PRE-CHECK (รันแยก อ่านผลก่อนตัดสินใจ)
-- ============================================================================
-- ต้องได้ 0 แถวถ้ายังไม่เคย migrate:
SELECT COLUMN_NAME
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME   = 'pm_am'
   AND COLUMN_NAME IN ('last_notified_at', 'last_notified_kind', 'notify_count');

-- ============================================================================
-- 1) คอลัมน์ dedupe บนรอบ PM
--    last_notified_at  NULL = ยังไม่เคยแจ้ง (ไม่ต้อง backfill)
-- ============================================================================
ALTER TABLE `pm_am`
  ADD COLUMN `last_notified_at`   DATETIME NULL
      COMMENT 'เวลาที่ส่งแจ้งเตือนรอบนี้สำเร็จครั้งล่าสุด (NULL = ยังไม่เคยแจ้ง)',
  ADD COLUMN `last_notified_kind` ENUM('due_today','overdue') NULL
      COMMENT 'ประเภทการเตือนครั้งล่าสุด',
  ADD COLUMN `notify_count`       SMALLINT UNSIGNED NOT NULL DEFAULT 0
      COMMENT 'จำนวนครั้งที่เตือนรอบนี้แล้ว';

-- ============================================================================
-- 2) Index สำหรับสแกนรายวัน (dedupe filter: due_date + assigned_to + last_notified_at)
--    ตารางปัจจุบันยังเล็ก — index นี้เพื่อกันการสแกนเต็มตารางเมื่อข้อมูลโต
-- ============================================================================
ALTER TABLE `pm_am`
  ADD KEY `idx_pm_am_reminder_scan` (`due_date`, `assigned_to`, `last_notified_at`);

-- ============================================================================
-- 3) VERIFY หลังรัน
-- ============================================================================
-- SHOW CREATE TABLE `pm_am`;
-- SELECT COUNT(*) AS total_cycles,
--        SUM(last_notified_at IS NULL) AS never_notified
--   FROM `pm_am`;
-- ต้องได้ never_notified = total_cycles ทั้งหมดในครั้งแรก

-- ============================================================================
-- 4) ROLLBACK (ใช้เมื่อต้องถอย schema จริง ๆ — โค้ดเวอร์ชันใหม่จะ error ถ้าถอยก่อน deploy โค้ดเก่า)
-- ============================================================================
-- ALTER TABLE `pm_am`
--   DROP KEY `idx_pm_am_reminder_scan`,
--   DROP COLUMN `notify_count`,
--   DROP COLUMN `last_notified_kind`,
--   DROP COLUMN `last_notified_at`;

-- ============================================================================
-- 5) หมายเหตุการตั้งค่า (ไม่ใช่ DDL)
-- ============================================================================
-- cooldown อ่านจาก settings key `pm_reminder_cooldown_hours` (default 20)
--   - 20 ชม. < 24 ชม. → cron วันละครั้งผ่านทุกวัน แม้เวลารันคลาดเคลื่อน
--   - ต้องการเตือน 2 ครั้ง/วัน → ตั้ง 10
-- insert ค่าเริ่มต้น (ทำผ่านหน้า Settings หรือ SQL นี้ ถ้ายังไม่มี key):
-- INSERT INTO `settings` (`setting_key`, `setting_value`)
-- SELECT 'pm_reminder_cooldown_hours', '20'
--  WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `setting_key` = 'pm_reminder_cooldown_hours');
