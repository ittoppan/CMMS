<?php
/**
 * scripts/apply_phase27_failure_rca.php — idempotent DB migration (Phase 27)
 *
 * Failure Analysis & Root Cause Management (RCA):
 *   1) failure_types / failure_modes / failure_causes / root_cause_categories
 *      — taxonomy ควบคุมได้ (active/inactive, sort_order)
 *   2) failure_events           — เหตุการณ์ความเสียหาย (เชื่อม Asset / WO / Request)
 *   3) rca                      — Root Cause Analysis (workflow status)
 *   4) rca_why                  — 5 Why (จำนวนชั้นยืดหยุ่น, ไม่บังคับให้ครบ 5)
 *   5) rca_evidence             — หลักฐาน append-only (ไม่เขียนทับ)
 *   6) rca_measurements         — การวัด (บันทึกจริง — ไม่สวมว่าเป็น sensor)
 *   7) rca_actions              — Corrective/Preventive actions (owner/due/verify)
 *   8) rca_effectiveness_review — ทบทวนผล (ใช้ตัวเลขจริงก่อน/หลัง)
 *   9) rca_action_links         — PM Change → proposed → approved → applied
 *  10) settings rca_*           — เกณฑ์ trigger/repeat window/threshold
 *  11) notification_templates   — rca:assigned/overdue/action_&#42;/verification/reopened
 *  12) menu_permissions         — rca (1,2,6,7 / ช่าง read+evidence / viewer)
 *
 * แบบ additive เท่านั้น — ไม่แก้/ไม่ลบตารางเดิม (repair, rca_records, failure_codes
 * ใช้งานได้เหมือนเดิม) ตรวจข้อมูล schema ก่อนแก้ทุกขั้น — รันซ้ำได้ปลอดภัย
 *
 * วิธีเรียก:  php scripts/apply_phase27_failure_rca.php
 */

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$changed = 0;
$log = function (string $msg): void { echo $msg . PHP_EOL; };

$hasTable = function (string $table) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
};

$hasColumn = function (string $table, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
};

$createTable = function (string $name, string $sql) use ($pdo, $hasTable, $log, &$changed): void {
    if (!$hasTable($name)) {
        $pdo->exec($sql);
        $log("+ $name");
        $changed++;
    } else {
        $log("~ $name (existed)");
    }
};

// ---------- 1) Taxonomy ----------
$createTable('failure_types', "CREATE TABLE `failure_types` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$createTable('failure_modes', "CREATE TABLE `failure_modes` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`            VARCHAR(50)  NOT NULL,
  `name`            VARCHAR(255) NOT NULL,
  `description`     VARCHAR(500) NULL,
  `failure_type_id` INT UNSIGNED NULL,
  `component`       VARCHAR(255) NULL COMMENT 'ส่วนประกอบ เช่น Bearing/Belt/Motor (อนุกรม 1 ชั้น)',
  `sort_order`      INT NOT NULL DEFAULT 100,
  `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_failure_modes_code` (`code`),
  KEY `idx_fm_ftype` (`failure_type_id`),
  CONSTRAINT `fk_fm_type` FOREIGN KEY (`failure_type_id`) REFERENCES `failure_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$createTable('failure_causes', "CREATE TABLE `failure_causes` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$createTable('root_cause_categories', "CREATE TABLE `root_cause_categories` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 2) failure_events ----------
if (!$hasTable('failure_events')) {
    // ตรวจว่าตารางอ้างอิงมีจริง (schema บางที่ตั้งชื่อ asset_registry ต่างกัน — อย่าหมดพลังกลางคัน)
    $refMissing = [];
    foreach (['asset_registry', 'repair', 'maintenance_requests', 'users'] as $t) {
        if (!$hasTable($t)) $refMissing[] = $t;
    }
    if ($refMissing) {
        $log("! failure_events ข้าม — ไม่พบตารางอ้างอิง: " . implode(', ', $refMissing));
    } else {
        $pdo->exec("CREATE TABLE `failure_events` (
  `id`                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_code`             VARCHAR(50) NOT NULL,
  `asset_id`               INT UNSIGNED NULL,
  `repair_id`              INT UNSIGNED NULL,
  `maintenance_request_id` INT UNSIGNED NULL,
  `failure_date`           DATETIME NULL,
  `failure_type_id`        INT UNSIGNED NULL,
  `failure_mode_id`        INT UNSIGNED NULL,
  `cause_id`               INT UNSIGNED NULL,
  `severity`               VARCHAR(20) NOT NULL DEFAULT 'medium',
  `production_impact`      VARCHAR(40) NULL COMMENT 'line_stopped|slowdown|quality_defect|none|other',
  `downtime_minutes`       INT NULL,
  `description`            TEXT NULL,
  `symptom`                TEXT NULL COMMENT 'สิ่งที่สังเกตเห็น — ไม่ใช่สาเหตุ',
  `operating_condition`    TEXT NULL,
  `machine_state`          VARCHAR(255) NULL,
  `production_context`     VARCHAR(255) NULL,
  `reporter_id`            INT UNSIGNED NULL,
  `technician_id`          INT UNSIGNED NULL,
  `repeat_suspected`       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'คำนวณจากข้อมูลจริง — ไม่ยืนยันสาเหตุ',
  `rca_required`           TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'RCA trigger — คำนวณจากเงื่อนไข + รีวิวได้',
  `rca_id`                 INT UNSIGNED NULL,
  `created_by`             INT UNSIGNED NULL,
  `created_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        $log('+ failure_events');
        $changed++;
    }
} else {
    $log('~ failure_events (existed)');
}

// ---------- 3) rca ----------
if (!$hasTable('rca')) {
    $refMissing = [];
    foreach (['failures', 'failure_events', 'repair', 'users'] as $t) {
        if (!$hasTable($t) && $t !== 'failures') $refMissing[] = $t;
    }
    // failure_events อาจยังไม่เกิดถ้า ref tables หาย — ให้ rca ยังอ้างได้เฉพาะ repair/users
    $pdo->exec("CREATE TABLE `rca` (
  `id`                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_code`                VARCHAR(50) NOT NULL,
  `failure_event_id`        BIGINT UNSIGNED NULL,
  `repair_id`               INT UNSIGNED NULL,
  `title`                   VARCHAR(255) NOT NULL,
  `problem_statement`       TEXT NULL,
  `status`                  VARCHAR(30) NOT NULL DEFAULT 'open',
  `assignee_id`             INT UNSIGNED NULL,
  `assigned_by`             INT UNSIGNED NULL,
  `assigned_at`             DATETIME NULL,
  `trigger_reason`          VARCHAR(60) NULL,
  `due_date`                DATE NULL,
  `symptom_final`           TEXT NULL,
  `failure_mode_text`       VARCHAR(255) NULL,
  `cause_text`              VARCHAR(255) NULL,
  `root_cause_category_id`  INT UNSIGNED NULL,
  `root_cause_detail`       TEXT NULL,
  `root_cause_unknown`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ROOT CAUSE UNKNOWN คือสถานะที่ถูกต้อง',
  `corrective_action_summary` TEXT NULL,
  `preventive_action_summary` TEXT NULL,
  `verification_criteria`   TEXT NULL,
  `conclusion`              TEXT NULL,
  `started_at`              DATETIME NULL,
  `completed_at`            DATETIME NULL,
  `closed_by`               INT UNSIGNED NULL,
  `reopen_count`            INT NOT NULL DEFAULT 0,
  `created_by`              INT UNSIGNED NULL,
  `created_at`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $log('+ rca');
    $changed++;
} else {
    $log('~ rca (existed)');
}

// ---------- 4) rca_why ----------
$createTable('rca_why', "CREATE TABLE `rca_why` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 5) rca_evidence ----------
$createTable('rca_evidence', "CREATE TABLE `rca_evidence` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`        INT UNSIGNED NOT NULL,
  `evidence_type` VARCHAR(30) NOT NULL,
  `title`         VARCHAR(255) NULL,
  `description`   TEXT NULL,
  `source`        VARCHAR(100) NULL COMMENT 'repair_attachment|manual|inspection|...',
  `related_type`  VARCHAR(40) NULL,
  `related_id`    BIGINT UNSIGNED NULL,
  `file_path`     VARCHAR(500) NULL,
  `file_name`     VARCHAR(255) NULL,
  `file_type`     VARCHAR(50) NULL,
  `file_size`     BIGINT UNSIGNED NULL,
  `uploaded_by`   INT UNSIGNED NULL,
  `recorded_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ev_rca` (`rca_id`),
  KEY `idx_ev_related` (`related_type`,`related_id`),
  KEY `idx_ev_type` (`evidence_type`),
  CONSTRAINT `fk_ev_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ev_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 6) rca_measurements ----------
$createTable('rca_measurements', "CREATE TABLE `rca_measurements` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`           INT UNSIGNED NULL,
  `failure_event_id` BIGINT UNSIGNED NULL,
  `measurement_type` VARCHAR(30) NOT NULL,
  `value`            DECIMAL(18,6) NOT NULL,
  `unit`             VARCHAR(30) NULL,
  `instrument`       VARCHAR(150) NULL,
  `note`             VARCHAR(500) NULL,
  `recorded_by`      INT UNSIGNED NULL,
  `recorded_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rm_rca` (`rca_id`),
  KEY `idx_rm_event` (`failure_event_id`),
  CONSTRAINT `fk_rm_rca` FOREIGN KEY (`rca_id`) REFERENCES `rca`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_event` FOREIGN KEY (`failure_event_id`) REFERENCES `failure_events`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rm_user` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 7) rca_actions ----------
$createTable('rca_actions', "CREATE TABLE `rca_actions` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rca_id`              INT UNSIGNED NOT NULL,
  `action_type`         VARCHAR(20) NOT NULL DEFAULT 'corrective' COMMENT 'corrective|preventive',
  `title`               VARCHAR(255) NOT NULL,
  `description`         TEXT NULL,
  `owner_id`            INT UNSIGNED NULL,
  `priority`            VARCHAR(20) NOT NULL DEFAULT 'medium',
  `due_date`            DATE NULL,
  `status`              VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'open|in_progress|completed|verified|cancelled',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 8) rca_effectiveness_review ----------
$createTable('rca_effectiveness_review', "CREATE TABLE `rca_effectiveness_review` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 9) rca_action_links ----------
$createTable('rca_action_links', "CREATE TABLE `rca_action_links` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// ---------- 10) settings rca_* ----------
$settingDefaults = [
    'rca_repeat_window_days'    => '90',    // หน้าต่างตรวจจับการเสียซ้ำ (วัน)
    'rca_repeat_threshold'      => '2',     // จำนวนครั้ง ≥ threshold ใน window = สงสัยเสียซ้ำ
    'rca_trigger_critical_asset'=> '1',     // เครื่อง critical → ต้องทำ RCA
    'rca_trigger_safety'        => '1',     // เกี่ยวข้องความปลอดภัย → ต้องทำ RCA
    'rca_trigger_emergency'     => '1',     // เสียแบบ emergency/critical → ต้องทำ RCA
    'rca_trigger_high_downtime' => '1',     // downtime ≥ เกณฑ์ → ต้องทำ RCA
    'rca_high_downtime_minutes' => '240',   // downtime ที่ถือว่าสูง (นาที)
    'rca_trigger_high_cost'     => '1',     // ต้นทุนซ่อมรวม ≥ เกณฑ์ → ต้องทำ RCA
    'rca_high_cost_threshold'   => '100000', // ต้นทุนซ่อมที่ถือว่าสูง (บาท)
    'rca_trigger_repeat'        => '1',     // เสียซ้ำใน window → ต้องทำ RCA
    'rca_due_days'              => '14',    // เส้นตายเริ่มต้นของ RCA ที่ยังไม่กำหนด
    'rca_action_reminder_days'  => '3',     // เตือน action ใกล้กำหนดก่อนกี่วัน
];
$ins = $pdo->prepare('INSERT IGNORE INTO settings (setting_key, setting_value, setting_group)
                      VALUES (?, ?, ?)');
foreach ($settingDefaults as $key => $val) {
    $ins->execute([$key, $val, 'rca']);
    if ($ins->rowCount() > 0) { $log("+ settings $key = $val"); $changed++; }
    else { $log("~ settings $key (existed)"); }
}

// ---------- 11) notification templates rca ----------
if ($hasTable('notification_templates')) {
    $templates = [
        ['rca', 'assigned', 'high',     'RCA ถูกมอบหมาย: {rca_code}', 'เครื่อง: {asset_code}\nปัญหา: {problem}\nผู้วิเคราะห์: {assignee_name}\nครบกำหนด: {due_date}', '/rca/{rca_id}'],
        ['rca', 'overdue', 'critical',  'RCA เกินกำหนด: {rca_code}', 'เครื่อง: {asset_code}\nเกินจากกำหนด: {due_date} ({days_overdue} วัน)', '/rca/{rca_id}'],
        ['rca', 'action_assigned', 'medium', 'Action ถูกมอบหมาย: {action_title}', 'RCA: {rca_code}\nประเภท: {action_type}\nครบกำหนด: {due_date}', '/rca/{rca_id}'],
        ['rca', 'action_due', 'medium', 'Action ใกล้กำหนด: {action_title}', 'RCA: {rca_code}\nครบกำหนด: {due_date} (อีก {days} วัน)', '/rca/{rca_id}'],
        ['rca', 'action_overdue', 'high', 'Action เกินกำหนด: {action_title}', 'RCA: {rca_code}\nเกินจากกำหนด: {due_date} ({days_overdue} วัน)', '/rca/{rca_id}'],
        ['rca', 'verification_required', 'high', 'ต้องตรวจทานผลการแก้ไข: {rca_code}', 'เครื่อง: {asset_code}\nกรุณาตรวจผล action ก่อนปิด RCA', '/rca/{rca_id}'],
        ['rca', 'reopened', 'high', 'RCA ถูกเปิดใหม่: {rca_code}', 'เหตุผล: {reason}\nผู้เปิดใหม่: {reopened_by}', '/rca/{rca_id}'],
    ];
    $tplIns = $pdo->prepare('INSERT IGNORE INTO notification_templates (module, event, priority, title_template, message_template, url_template)
                             VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($templates as $t) {
        $tplIns->execute($t);
        if ($tplIns->rowCount() > 0) { $log("+ notif template {$t[0]}:{$t[1]}"); $changed++; }
        else { $log("~ notif template {$t[0]}:{$t[1]} (existed)"); }
    }
}

// ---------- 12) menu_permissions rca ----------
$menuRules = [
    'rca' => [1 => 1, 2 => 1, 3 => 0, 4 => 0, 5 => 0, 6 => 1, 7 => 1],
];
$mpIns = $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted)');
foreach ($menuRules as $menuKey => $rules) {
    foreach ($rules as $roleId => $granted) {
        $mpIns->execute([$roleId, $menuKey, $granted]);
        if ($mpIns->rowCount() > 0) { $log("+ menu_permissions $menuKey role $roleId = $granted"); $changed++; }
        else { $log("~ menu_permissions $menuKey role $roleId (unchanged)"); }
    }
}

echo ($changed === 0 ? "Phase 27: ไม่มีการเปลี่ยนแปลง (ตรวจแล้วครบ)" : "Phase 27: เปลี่ยนแปลง $changed รายการ") . PHP_EOL;