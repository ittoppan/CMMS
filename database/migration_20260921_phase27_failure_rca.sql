-- ============================================================================
-- migration_20260921_phase27_failure_rca.sql
-- Phase 27 — Failure Analysis & Root Cause Management (RCA)
--
-- Additive only (ไม่แก้/ไม่ลบของเดิม; ไม่แตะ repair / asset / WO / parts / PM):
--   1) failure_types / failure_modes / failure_causes / root_cause_categories
--      — taxonomy ควบคุมได้ (parent + sort_order + is_active, ห้ามลบของประวัติ)
--   2) failure_events           — เหตุการณ์ความเสียหาย (เชื่อม WO / Asset)
--   3) rca                      — Root Cause Analysis (workflow status)
--   4) rca_why                  — 5 Why (กี่ชั้นก็ได้ ไม่บังคับ 5)
--   5) rca_evidence             — หลักฐาน (append-only, ระบุ source/time/user/entity)
--   6) rca_measurements         — การวัดเชิงโครงสร้าง (ค่า/หน่วย/เครื่องมือ/ช่าง)
--   7) rca_actions              — Corrective / Preventive actions (owner/due/verify)
--   8) rca_effectiveness_review — ทบทวนผลหลังลงมือ (ก่อน/หลัง จริง ไม่แต่งข้อมูล)
--   9) rca_action_links         — PM Change → Review → Approve → Apply
--  10) settings (rca_*)         — เกณฑ์ trigger / window / threshold
--  11) notification_templates   — rca:assigned/overdue/action_&#42;/verification/reopened
--  12) menu_permissions         — rca (failure analysis)
--
-- หมายเหตุ: ไฟล์นี้เป็นเอกสารประกอบ (run-once) — ตัวที่ใช้จริงคือ
--   scripts/apply_phase27_failure_rca.php (idempotent, ตรวจ information_schema ก่อนแก้)
-- ============================================================================

-- -----------------------------------------------------------
-- 1) Taxonomy (ควบคุมโดย Admin/Engineer)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `failure_types` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)  NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` VARCHAR(500) NULL,
  `sort_order`  INT NOT NULL DEFAULT 100,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `failure_modes` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`           VARCHAR(50)  NOT NULL,
  `name`           VARCHAR(255) NOT NULL,
  `description`    VARCHAR(500) NULL,
  `failure_type_id` INT UNSIGNED NULL,
  `component`      VARCHAR(255) NULL COMMENT 'ส่วนประกอบ เช่น Bearing/Belt/Motor (อนุกรม 1 ชั้น)',
  `sort_order`     INT NOT NULL DEFAULT 100,
  `is_active`      TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_modes_code` (`code`),
  KEY `idx_fm_ftype` (`failure_type_id`),
  CONSTRAINT `fk_fm_type` FOREIGN KEY (`failure_type_id`) REFERENCES `failure_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `failure_causes` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)  NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` VARCHAR(500) NULL,
  `sort_order`  INT NOT NULL DEFAULT 100,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_causes_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `root_cause_categories` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)  NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `description` VARCHAR(500) NULL,
  `sort_order`  INT NOT NULL DEFAULT 100,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_root_cause_categories_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2) Failure Event (เหตุการณ์ความเสียหาย — เชื่อม Asset / WO / Request)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `failure_events` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_code`            VARCHAR(50) NOT NULL,
  `asset_id`              INT UNSIGNED NULL,
  `repair_id`             INT UNSIGNED NULL,
  `maintenance_request_id` INT UNSIGNED NULL,
  `failure_date`          DATETIME NULL,
  `failure_type_id`       INT UNSIGNED NULL,
  `failure_mode_id`       INT UNSIGNED NULL,
  `cause_id`              INT UNSIGNED NULL,
  `severity`              ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `production_impact`     VARCHAR(40) NULL COMMENT 'line_stopped|slowdown|quality_defect|none|other',
  `downtime_minutes`      INT NULL,
  `description`           TEXT NULL,
  `symptom`               TEXT NULL COMMENT 'สิ่งที่สังเกตเห็น — ไม่ใช่สาเหตุ',
  `operating_condition`   TEXT NULL,
  `machine_state`         VARCHAR(255) NULL,
  `production_context`    VARCHAR(255) NULL,
  `reporter_id`           INT UNSIGNED NULL,
  `technician_id`         INT UNSIGNED NULL,
  `repeat_suspected`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'คำนวณจากข้อมูลจริง — ไม่ยืนยันสาเหตุ',
  `rca_required`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'RCA trigger — คำนวณจากเงื่อนไข + รีวิวได้',
  `rca_id`                INT UNSIGNED NULL,
  `created_by`            INT UNSIGNED NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_events_code` (`event_code`),
  KEY `idx_fe_asset` (`asset_id`),
  KEY `idx_fe_repair` (`repair_id`),
  KEY `idx_fe_date` (`failure_date`),
  KEY `idx_fe_type` (`failure_type_id`),
  KEY `idx_fe_mode` (`failure_mode_id`),
  KEY `idx_fe_rca` (`rca_id`),
  CONSTRAINT `fk_fe_asset` FOREIGN KEY (`asset_id`) REFERENCES `asset_registry`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_request` FOREIGN KEY (`maintenance_request_id`) REFERENCES `maintenance_requests`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_type` FOREIGN KEY (`failure_type_id`) REFERENCES `failure_types`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_mode` FOREIGN KEY (`failure_mode_id`) REFERENCES `failure_modes`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_cause` FOREIGN KEY (`cause_id`) REFERENCES `failure_causes`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_technician` FOREIGN KEY (`technician_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3) RCA — workorder วิเคราะห์หาสาเหตุรากเหง้า
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_code`              VARCHAR(50) NOT NULL,
  `failure_event_id`      BIGINT UNSIGNED NULL,
  `repair_id`             INT UNSIGNED NULL,
  `title`                 VARCHAR(255) NOT NULL,
  `problem_statement`     TEXT NULL,
  `status`                VARCHAR(30) NOT NULL DEFAULT 'open',
  `assignee_id`           INT UNSIGNED NULL,
  `assigned_by`           INT UNSIGNED NULL,
  `assigned_at`           DATETIME NULL,
  `trigger_reason`        VARCHAR(60) NULL,
  `due_date`              DATE NULL,
  `symptom_final`         TEXT NULL,
  `failure_mode_text`     VARCHAR(255) NULL,
  `cause_text`            VARCHAR(255) NULL,
  `root_cause_category_id` INT UNSIGNED NULL,
  `root_cause_detail`     TEXT NULL,
  `root_cause_unknown`    TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ROOT CAUSE UNKNOWN คือสถานะที่ถูกต้อง',
  `corrective_action_summary` TEXT NULL,
  `preventive_action_summary` TEXT NULL,
  `verification_criteria` TEXT NULL,
  `conclusion`            TEXT NULL,
  `started_at`            DATETIME NULL,
  `completed_at`          DATETIME NULL,
  `closed_by`             INT UNSIGNED NULL,
  `reopen_count`          INT NOT NULL DEFAULT 0,
  `created_by`            INT UNSIGNED NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rca_code` (`rca_code`),
  KEY `idx_rca_status` (`status`),
  KEY `idx_rca_event` (`failure_event_id`),
  KEY `idx_rca_repair` (`repair_id`),
  KEY `idx_rca_assignee` (`assignee_id`),
  KEY `idx_rca_due` (`due_date`),
  KEY `idx_rca_rootcat` (`root_cause_category_id`),
  CONSTRAINT `fk_rca_event` FOREIGN KEY (`failure_event_id`) REFERENCES `failure_events`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_repair` FOREIGN KEY (`repair_id`) REFERENCES `repair`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_rootcat` FOREIGN KEY (`root_cause_category_id`) REFERENCES `root_cause_categories`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rca_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4) 5 Why (จำนวนชั้นยืดหยุ่น — อย่าใช้ตรรกะ "ต้องครบ 5")
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca_why` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`     INT UNSIGNED NOT NULL,
  `level`      INT NOT NULL,
  `statement`  TEXT NOT NULL,
  `is_root`    TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rca_why_level` (`rca_id`,`level`),
  KEY `idx_rw_rca` (`rca_id`),
  CONSTRAINT `fk_rw_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 5) หลักฐาน (append-only — เพิ่มหลักฐานใหม่, ไม่เขียนทับเงียบ ๆ)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca_evidence` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`       INT UNSIGNED NOT NULL,
  `evidence_type` VARCHAR(30) NOT NULL,
  `title`        VARCHAR(255) NULL,
  `description`  TEXT NULL,
  `source`       VARCHAR(100) NULL COMMENT 'repair_attachment|manual|inspection|...',
  `related_type` VARCHAR(40) NULL,
  `related_id`   BIGINT UNSIGNED NULL,
  `file_path`    VARCHAR(500) NULL,
  `file_name`    VARCHAR(255) NULL,
  `file_type`    VARCHAR(50) NULL,
  `file_size`    BIGINT UNSIGNED NULL,
  `uploaded_by`  INT UNSIGNED NULL,
  `recorded_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ev_rca` (`rca_id`),
  KEY `idx_ev_related` (`related_type`,`related_id`),
  KEY `idx_ev_type` (`evidence_type`),
  CONSTRAINT `fk_ev_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ev_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 6) การวัด (records ที่บันทึกจริง — ไม่สร้างข้อมูลสวมว่าเป็น sensor)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca_measurements` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`          INT UNSIGNED NULL,
  `failure_event_id` BIGINT UNSIGNED NULL,
  `measurement_type` VARCHAR(30) NOT NULL,
  `value`           DECIMAL(18,6) NOT NULL,
  `unit`            VARCHAR(30) NULL,
  `instrument`      VARCHAR(150) NULL,
  `note`            VARCHAR(500) NULL,
  `recorded_by`     INT UNSIGNED NULL,
  `recorded_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rm_rca` (`rca_id`),
  KEY `idx_rm_event` (`failure_event_id`),
  CONSTRAINT `fk_rm_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_event` FOREIGN KEY (`failure_event_id`) REFERENCES `failure_events`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_user` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 7) Corrective / Preventive action
--    status: open / in_progress / completed / verified / cancelled
--    overdue เป็นค่าคำนวณจาก due_date (ไม่เก็บ)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca_actions` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`              INT UNSIGNED NOT NULL,
  `action_type`         ENUM('corrective','preventive') NOT NULL,
  `title`               VARCHAR(255) NOT NULL,
  `description`         TEXT NULL,
  `owner_id`            INT UNSIGNED NULL,
  `priority`            ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `due_date`            DATE NULL,
  `status`              VARCHAR(20) NOT NULL DEFAULT 'open',
  `is_mandatory`        TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'ต้องเสร็จ/verify ก่อนปิด RCA',
  `completion_evidence` TEXT NULL,
  `completed_by`        INT UNSIGNED NULL,
  `completed_at`        DATETIME NULL,
  `verified_by`         INT UNSIGNED NULL,
  `verified_at`         DATETIME NULL,
  `verify_note`         TEXT NULL,
  `created_by`          INT UNSIGNED NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_act_rca` (`rca_id`),
  KEY `idx_act_owner` (`owner_id`),
  KEY `idx_act_status` (`status`),
  KEY `idx_act_due` (`due_date`),
  CONSTRAINT `fk_act_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_act_owner` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 8) ทบทวนประสิทธิผล (ใช้ตัวเลขจริงก่อน/หลัง — ไม่อ้างอัตโนมัติว่า "หายขาด")
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca_effectiveness_review` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`          INT UNSIGNED NOT NULL,
  `effectiveness`   VARCHAR(25) NOT NULL COMMENT 'effective|partially_effective|not_effective|insufficient_data',
  `remarks`         TEXT NULL,
  `before_failures` INT NULL,
  `after_failures`  INT NULL,
  `before_months`   INT NULL,
  `after_months`    INT NULL,
  `reviewed_by`     INT UNSIGNED NULL,
  `reviewed_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eff_rca` (`rca_id`),
  CONSTRAINT `fk_eff_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eff_user` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 9) PM Change / Action Links — Proposed → Review → Approve → Apply
--    ไม่เปลี่ยนแปลง PM จริงโดยอัตโนมัติ
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rca_action_links` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`           INT UNSIGNED NOT NULL,
  `action_id`        INT UNSIGNED NULL,
  `link_type`        VARCHAR(40) NOT NULL COMMENT 'pm_plan_change|checklist_change|inspection_point|work_order|asset_modification|spare_part_change|training_record|engineering_change|other',
  `title`            VARCHAR(255) NOT NULL,
  `description`      TEXT NULL,
  `proposed_change`  TEXT NULL,
  `status`           VARCHAR(20) NOT NULL DEFAULT 'proposed' COMMENT 'proposed|approved|applied|rejected|cancelled',
  `target_type`      VARCHAR(40) NULL,
  `target_id`        BIGINT UNSIGNED NULL,
  `approved_by`      INT UNSIGNED NULL,
  `approved_at`      DATETIME NULL,
  `applied_by`       INT UNSIGNED NULL,
  `applied_at`       DATETIME NULL,
  `rejected_by`      INT UNSIGNED NULL,
  `rejected_at`      DATETIME NULL,
  `created_by`       INT UNSIGNED NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_al_rca` (`rca_id`),
  KEY `idx_al_action` (`action_id`),
  KEY `idx_al_status` (`status`),
  CONSTRAINT `fk_al_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_al_action` FOREIGN KEY (`action_id`) REFERENCES `rca_actions`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 10) settings (ค่าเริ่มต้นถูก insert ใน apply script / settings_defaults.php)
--     rca_repeat_window_days    — หน้าต่างที่ใช้ตรวจจับการเสียซ้ำ (เช่น 90 วัน)
--     rca_repeat_threshold      — จำนวนครั้ง ≥ threshold ในหน้าต่าง = สงสัยเสียซ้ำ
--     rca_trigger_*             — ปิด/เปิดเงื่อนไข RCA trigger
--     rca_high_downtime_minutes —  downtime เกินเท่าไร = ต้องทำ RCA
--     rca_high_cost_threshold   —  ต้นทุนซ่อมรวมเกินเท่าไร = ต้องทำ RCA
--     rca_due_days              — กำหนดเส้นตายเริ่มต้น
--     rca_action_reminder_days  — เตือน action ใกล้กำหนดก่อนกี่วัน
-- -----------------------------------------------------------

-- -----------------------------------------------------------
-- 11) เทมเพลตแจ้งเตือน RCA (INSERT IGNORE — สำรองเพิ่มใน
--     NotificationCenterService::defaultTemplates())
-- -----------------------------------------------------------
-- INSERT INTO notification_templates (module, event, priority, title_template, message_template, url_template) VALUES
--   ('rca','assigned','high','RCA ถูกมอบหมาย: {rca_code}','เครื่อง: {asset_code}\nปัญหา: {problem}\nผู้วิเคราะห์: {assignee_name}\nครบกำหนด: {due_date}', '/rca/{rca_id}'),
--   ('rca','overdue','critical','RCA เกินกำหนด: {rca_code}','เครื่อง: {asset_code}\nเกินจากกำหนด: {due_date} ({days_overdue} วัน)', '/rca/{rca_id}'),
--   ('rca','action_assigned','medium','Action ถูกมอบหมาย: {action_title}','RCA: {rca_code}\nประเภท: {action_type}\nครบกำหนด: {due_date}', '/rca/{rca_id}'),
--   ('rca','action_due','medium','Action ใกล้กำหนด: {action_title}','RCA: {rca_code}\nครบกำหนด: {due_date} (อีก {days} วัน)', '/rca/{rca_id}'),
--   ('rca','action_overdue','high','Action เกินกำหนด: {action_title}','RCA: {rca_code}\nเกินจากกำหนด: {due_date} ({days_overdue} วัน)', '/rca/{rca_id}'),
--   ('rca','verification_required','high','ต้องตรวจทานผลการแก้ไข: {rca_code}','เครื่อง: {asset_code}\nกรุณาตรวจผล action ก่อนปิด RCA', '/rca/{rca_id}'),
--   ('rca','reopened','high','RCA ถูกเปิดใหม่: {rca_code}','เหตุผล: {reason}\nผู้เปิดใหม่: {reopened_by}', '/rca/{rca_id}');

-- -----------------------------------------------------------
-- 12) สิทธิ์เมนู rca (1,2,6,7 = จัดการวิเคราะห์; 3 = ช่างดู+บันทึกหลักฐาน; 5 = อ่าน)
--     INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES
--       (1,'rca',1),(2,'rca',1),(3,'rca',0),(4,'rca',0),(5,'rca',0),(6,'rca',1),(7,'rca',1);