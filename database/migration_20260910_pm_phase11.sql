-- Migration: PM Phase 11 — Preventive Maintenance (PM) master plans + WO linkage
-- ปลอดภัย: เฉพาะ ALTER ADD / MODIFY enum — ห้าม DROP ตาราง/คอลัมน์/ข้อมูลเดิม
-- วิธีใช้: รันผ่าน php database/apply_alter.php หรือ phpMyAdmin/CLI กับ db cmms_tpt
-- (ห้ามแก้ schema.sql — ถึงกำหนดออกจะ regenerate แยก)

-- ── 1) pm_am_plans: เพิ่มฟิลด์แผนงาน PM ตาม spec (priority, ระยะเวลา, วันที่, สถานะ, ผู้รับผิดชอบ, location) ──
ALTER TABLE `pm_am_plans`
    ADD COLUMN `priority` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium' AFTER `description`,
    ADD COLUMN `estimated_duration_minutes` INT UNSIGNED NULL AFTER `priority`,
    ADD COLUMN `start_date` DATE NULL AFTER `estimated_duration_minutes`,
    ADD COLUMN `end_date` DATE NULL AFTER `start_date`,
    ADD COLUMN `instructions` TEXT NULL AFTER `description`,
    ADD COLUMN `status` ENUM('draft','active','cancelled') NOT NULL DEFAULT 'active' AFTER `is_active`,
    ADD COLUMN `responsible_user_id` INT UNSIGNED NULL AFTER `status`,
    ADD COLUMN `department_id` INT UNSIGNED NULL AFTER `responsible_user_id`,
    ADD COLUMN `location_id` INT UNSIGNED NULL AFTER `department_id`,
    ADD COLUMN `work_zone_id` INT UNSIGNED NULL AFTER `location_id`,
    ADD KEY `idx_pm_plans_status` (`status`),
    ADD KEY `idx_pm_plans_responsible` (`responsible_user_id`);

-- ── 2) pm_am_plans: เพิ่มความถี่ Semi-Annual (ทุก 6 เดือน) ──
ALTER TABLE `pm_am_plans` MODIFY COLUMN `frequency_type` ENUM('daily','weekly','monthly','quarterly','yearly','semi_annual','custom','meter_based') NOT NULL DEFAULT 'monthly';

-- ── 3) pm_am: เพิ่มฟิลด์รอบ PM (priority, semi_annual, meter-based, สถานะ cancelled) ──
ALTER TABLE `pm_am`
    MODIFY COLUMN `frequency_type` ENUM('daily','weekly','monthly','quarterly','yearly','semi_annual','custom','meter_based') NOT NULL DEFAULT 'monthly',
    MODIFY COLUMN `status` ENUM('pending','in_progress','completed','overdue','skipped','cancelled') NOT NULL DEFAULT 'pending',
    ADD COLUMN `priority` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium' AFTER `frequency_interval`,
    ADD COLUMN `estimated_duration_minutes` INT UNSIGNED NULL AFTER `priority`,
    ADD COLUMN `meter_reading` DECIMAL(12,2) NULL AFTER `estimated_duration_minutes`,
    ADD COLUMN `meter_unit` VARCHAR(50) NULL AFTER `meter_reading`;

-- ── 4) repair: ลิงก์ WO ← PM (source_type='pm' จะระบุ pm_am_id / pm_plan_id) ──
ALTER TABLE `repair`
    ADD COLUMN `pm_am_id` INT UNSIGNED NULL AFTER `source_type`,
    ADD COLUMN `pm_plan_id` INT UNSIGNED NULL AFTER `pm_am_id`,
    ADD KEY `idx_repair_pm_am` (`pm_am_id`),
    ADD KEY `idx_repair_pm_plan` (`pm_plan_id`);

-- ── 5) checklist_template_items: เพิ่ม photo_required ตาม spec checklist ──
ALTER TABLE `checklist_template_items`
    ADD COLUMN `photo_required` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_required`;