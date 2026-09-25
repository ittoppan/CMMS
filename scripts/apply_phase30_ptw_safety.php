<?php
/**
 * scripts/apply_phase30_ptw_safety.php — idempotent DB migration (Phase 30)
 *
 * Permit to Work & Maintenance Safety:
 *   1) EXTEND work_permits (มีอยู่ live DB แต่ไม่มี migration ใน repo)
 *      - เพิ่มคอลัมน์ requirement/workflow (additive เท่านั้น)
 *      - ไม่แตะคอลัมน์เดิมของ legacy table
 *   2) permit_types          — configurable permit type (Admin/Safety configure)
 *   3) permit_type_requirements — requirement engine ต่อ type
 *   4) permit_approvals      — approval chain (step/role/decision/comment/time)
 *   5) permit_risk_assessments + permit_hazard_controls — risk matrix rows + control measures
 *   6) permit_loto_points    — isolation points (energy type / method / lock&tag / status)
 *   7) permit_zero_energy_verifications — ตรวจ zero energy ก่อนเริ่มงาน (ไม่ถือผ่านอัตโนมัติ)
 *   8) permit_gas_tests      — gas test (O2/LEL/H2S/CO/other) เชื่อม calibration
 *   9) permit_ppe_confirmations — PPE requirement ยืนยันโดยคนทำงาน
 *  10) permit_workers        — worker authorization + confined-space entry/exit
 *  11) contractors / contractor_workers / worker_certifications
 *  12) work_permit_checklists — pre-work/post-work checklist (reuse requirement engine)
 *  13) permit_suspensions    — suspend/resume + re-verification
 *  14) stop_work_reports     — emergency stop work
 *  15) safety_actions        — safety action engine (risk/stopwork/inspection)
 *  16) work_permit_activity  — timeline/audit ฝั่ง permit (ทุก safety action)
 *  17) settings wp_* + risk matrix config
 *  18) notification_templates module work_permit + menu_permissions
 *
 * รัน: php scripts/apply_phase30_ptw_safety.php (แก้ได้เรื่อย ๆ — idempotent)
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

$addColumn = function (string $table, string $name, string $def) use ($pdo, $hasColumn, $log, &$changed): void {
    if (!$hasColumn($table, $name)) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$name` $def");
        $log("+ $table.$name");
        $changed++;
    } else {
        $log("~ $table.$name (existed)");
    }
};

// ---------- 0) guard: ต้องมี work_permits (สร้างถ้าไม่เคยมีเลย) ----------
if (!$hasTable('work_permits')) {
    $pdo->exec("CREATE TABLE `work_permits` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `permit_no` VARCHAR(50) NULL,
      `repair_id` INT NULL,
      `permit_type` ENUM('hot_work','confined_space','high_work','electrical','chemical') NOT NULL DEFAULT 'hot_work',
      `location` VARCHAR(255) NULL,
      `requested_by` INT NULL,
      `safety_officer_id` INT NULL,
      `loto_electrical` TINYINT(1) NOT NULL DEFAULT 0,
      `loto_pneumatic` TINYINT(1) NOT NULL DEFAULT 0,
      `loto_hydraulic` TINYINT(1) NOT NULL DEFAULT 0,
      `loto_chemical` TINYINT(1) NOT NULL DEFAULT 0,
      `safety_signature` LONGTEXT NULL,
      `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
      `valid_from` DATETIME NULL,
      `valid_until` DATETIME NULL,
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ใบอนุญาตทำงานความปลอดภัย (Phase 30 PTW)'");
    $log("+ work_permits (created)");
    $changed++;
}

// ---------- 1) EXTEND work_permits (additive) ----------
$addColumn('work_permits', 'updated_at',         "DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
$addColumn('work_permits', 'asset_id',           "INT UNSIGNED NULL COMMENT 'FK asset_registry (เครื่องที่ทำงาน)'");
$addColumn('work_permits', 'location_id',        "INT UNSIGNED NULL COMMENT 'FK locations — พื้นที่ทำงาน'");
$addColumn('work_permits', 'department_id',      "INT UNSIGNED NULL COMMENT 'FK departments'");
$addColumn('work_permits', 'work_source',        "ENUM('internal','contractor') NOT NULL DEFAULT 'internal'");
$addColumn('work_permits', 'contractor_id',      "INT UNSIGNED NULL");
$addColumn('work_permits', 'permit_type_code',   "VARCHAR(40) NULL COMMENT 'key ของ permit_types (configurable)'");
$addColumn('work_permits', 'work_description',   "TEXT NULL");
$addColumn('work_permits', 'supervisor_id',      "INT UNSIGNED NULL");
$addColumn('work_permits', 'safety_reviewer_id', "INT UNSIGNED NULL");
$addColumn('work_permits', 'area_owner_id',      "INT UNSIGNED NULL");
$addColumn('work_permits', 'requester_id',       "INT UNSIGNED NULL");
$addColumn('work_permits', 'risk_level',         "ENUM('low','medium','high','critical') NULL COMMENT 'คำนวณจาก risk matrix ฝั่ง backend'");
$addColumn('work_permits', 'start_at',           "DATETIME NULL");
$addColumn('work_permits', 'end_at',             "DATETIME NULL");
$addColumn('work_permits', 'isolation_required', "TINYINT(1) NOT NULL DEFAULT 0");
$addColumn('work_permits', 'gas_test_required',  "TINYINT(1) NOT NULL DEFAULT 0");
$addColumn('work_permits', 'ppe_required',       "TINYINT(1) NOT NULL DEFAULT 0");
$addColumn('work_permits', 'worker_auth_required', "TINYINT(1) NOT NULL DEFAULT 1");
$addColumn('work_permits', 'isolation_done',     "TINYINT(1) NOT NULL DEFAULT 0");
$addColumn('work_permits', 'zero_energy_done',   "TINYINT(1) NOT NULL DEFAULT 0");
$addColumn('work_permits', 'last_stop_work_id',  "INT UNSIGNED NULL");
$addColumn('work_permits', 'requested_at',       "DATETIME NULL");
$addColumn('work_permits', 'risk_reviewed_at',   "DATETIME NULL");
$addColumn('work_permits', 'approved_at',        "DATETIME NULL");
$addColumn('work_permits', 'activated_at',       "DATETIME NULL");
$addColumn('work_permits', 'suspended_at',       "DATETIME NULL");
$addColumn('work_permits', 'resumed_at',         "DATETIME NULL");
$addColumn('work_permits', 'completed_at',       "DATETIME NULL");
$addColumn('work_permits', 'closed_at',          "DATETIME NULL");
$addColumn('work_permits', 'cancelled_at',       "DATETIME NULL");
$addColumn('work_permits', 'cancel_reason',      "VARCHAR(500) NULL");
$addColumn('work_permits', 'rejected_reason',    "VARCHAR(500) NULL");

// index สำหรับ query phase 30
foreach (['status', 'asset_id', 'risk_level', 'valid_until', 'permit_type_code'] as $col) {
    if (!$hasColumn('work_permits', $col)) continue;
    $name = 'idx_wp_' . preg_replace('/_at$/', '', preg_replace('/valid_/', 'exp_', $col));
    $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_permits' AND INDEX_NAME = ?");
    $st->execute([$name]);
    if ((int)$st->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE work_permits ADD KEY `$name` (`$col`)");
        $log("+ work_permits.$name");
        $changed++;
    }
}
// index ชื่อเดิมที่อาจเคยสร้าง (ไม่รวมชื่อใหม่ที่เพิ่งสร้าง — กันวนซ้ำ)
foreach (['idx_wp_asset', 'idx_wp_risk', 'idx_wp_type'] as $old) {
    $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_permits' AND INDEX_NAME = ?");
    $st->execute([$old]);
    if ((int)$st->fetchColumn() === 0) continue;
    $pdo->exec("ALTER TABLE work_permits DROP INDEX `$old`");
    $log("- work_permits.$old (renamed)");
}

// ---------- 2) permit_types (configurable) ----------
$createTable('permit_types', "CREATE TABLE `permit_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(40) NOT NULL,
  `name_th` VARCHAR(120) NOT NULL,
  `name_en` VARCHAR(120) NULL,
  `description` VARCHAR(500) NULL,
  `default_valid_hours` INT NOT NULL DEFAULT 8,
  `requires_risk_review` TINYINT(1) NOT NULL DEFAULT 1,
  `requires_isolation` TINYINT(1) NOT NULL DEFAULT 0,
  `requires_gas_test` TINYINT(1) NOT NULL DEFAULT 0,
  `requires_ppe` TINYINT(1) NOT NULL DEFAULT 1,
  `requires_worker_auth` TINYINT(1) NOT NULL DEFAULT 1,
  `requires_area_owner` TINYINT(1) NOT NULL DEFAULT 0,
  `approval_flow_json` JSON NULL COMMENT 'ลำดับขั้นอนุมัติ [{step,role_key,label}]',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pt_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประเภทใบอนุญาต — Admin/Safety configure ได้ (ห้าม hard-code กฎหมาย)'");

// seed เริ่มต้น (ถ้ายังว่าง)
$ptc = $pdo->query('SELECT COUNT(*) FROM permit_types')->fetchColumn();
if ((int)$ptc === 0) {
    $flowSupervisor = '[{"step":1,"role_key":"supervisor","label":"หัวหน้างาน"},{"step":2,"role_key":"safety","label":"เจ้าหน้าที่ความปลอดภัย"},{"step":3,"role_key":"area_owner","label":"เจ้าของพื้นที่"}]';
    $ptSeeds = [
        ['general_work', 'งานทั่วไป (General Work)', 'General Work Permit', 8, 1, 0, 0, 1, 1, 0, '["supervisor","safety"]'],
        ['hot_work', 'งานเชื่อม/ตัด (Hot Work)', 'Hot Work Permit', 4, 1, 0, 1, 1, 1, 0, '["supervisor","safety"]'],
        ['electrical', 'งานไฟฟ้า (Electrical Work)', 'Electrical Work Permit', 4, 1, 1, 0, 1, 1, 1, '["supervisor","safety","area_owner"]'],
        ['work_at_height', 'งานบนที่สูง (Work at Height)', 'Work at Height', 8, 1, 0, 0, 1, 1, 0, '["supervisor","safety"]'],
        ['confined_space', 'งานในอับอากาศ (Confined Space)', 'Confined Space Entry', 4, 1, 1, 1, 1, 1, 1, '["supervisor","safety","area_owner"]'],
        ['excavation', 'งานขุด/เจาะดิน (Excavation)', 'Excavation Permit', 8, 1, 0, 0, 1, 1, 0, '["supervisor","safety"]'],
        ['chemical', 'งานสารเคมี (Chemical Work)', 'Chemical Work Permit', 4, 1, 0, 0, 1, 1, 1, '["supervisor","safety"]'],
        ['line_breaking', 'ตัดต่อท่อ/สาย (Line Breaking)', 'Line Breaking Permit', 4, 1, 1, 0, 1, 1, 1, '["supervisor","safety","area_owner"]'],
        ['lifting', 'งานยกของหนัก (Lifting Work)', 'Lifting Work Permit', 8, 1, 0, 0, 1, 1, 0, '["supervisor","safety"]'],
        ['other', 'อื่น ๆ (Other)', 'Other Permit', 8, 1, 0, 0, 1, 1, 0, '["supervisor","safety"]'],
    ];
    foreach ($ptSeeds as $i => $row) {
        [$code, $th, $en, $hours, $risk, $iso, $gas, $ppe, $wAuth, $area, $flow] = $row;
        $st = $pdo->prepare('INSERT INTO permit_types
            (code, name_th, name_en, description, default_valid_hours, requires_risk_review, requires_isolation,
             requires_gas_test, requires_ppe, requires_worker_auth, requires_area_owner, approval_flow_json, is_active, sort)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)');
        $st->execute([$code, $th, $en, null, $hours, $risk, $iso, $gas, $ppe, $wAuth, $area, $flow, $i]);
        $log("+ permit_types:$code");
        $changed++;
    }
} else {
    $log("~ permit_types (has $ptc rows — seed skip)");
}

// ---------- 3) permit_type_requirements ----------
$createTable('permit_type_requirements', "CREATE TABLE `permit_type_requirements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_type_id` INT UNSIGNED NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `label_th` VARCHAR(160) NOT NULL,
  `category` ENUM('ppe','equipment','control','check','gas','emergency','admin') NOT NULL DEFAULT 'check',
  `is_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_ptr_type` (`permit_type_id`,`sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='requirement ต่อ permit type (configurable — ห้าม hard-code กฎหมาย>'");

// ---------- 4) permit_approvals ----------
$createTable('permit_approvals', "CREATE TABLE `permit_approvals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `step` INT NOT NULL DEFAULT 1,
  `step_key` VARCHAR(40) NOT NULL DEFAULT 'supervisor',
  `step_label` VARCHAR(80) NULL,
  `approver_user_id` INT UNSIGNED NULL,
  `decision` ENUM('pending','approved','rejected','revision_requested') NOT NULL DEFAULT 'pending',
  `comment` VARCHAR(500) NULL,
  `decided_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpa_permit` (`permit_id`,`step`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='สายอนุมัติใบอนุญาต — backend verify ฝั่ง API ทุกครั้ง'");

// ---------- 5) permit_risk_assessments ----------
$createTable('permit_risk_assessments', "CREATE TABLE `permit_risk_assessments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `seq` INT NOT NULL DEFAULT 1,
  `hazard` VARCHAR(300) NOT NULL,
  `cause` VARCHAR(300) NULL,
  `consequence` VARCHAR(300) NULL,
  `existing_control` VARCHAR(300) NULL,
  `likelihood` INT NOT NULL,
  `severity` INT NOT NULL,
  `risk_score` INT NULL COMMENT 'L*S คำนวณ backend',
  `risk_level` ENUM('low','medium','high','critical') NULL COMMENT 'map ตาม risk matrix config',
  `additional_controls` TEXT NULL COMMENT 'JSON [] ของ control เพิ่มเติม',
  `residual_likelihood` INT NULL,
  `residual_severity` INT NULL,
  `residual_score` INT NULL,
  `residual_level` ENUM('low','medium','high','critical') NULL,
  `responsible_user_id` INT UNSIGNED NULL,
  `is_validated` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpra_permit` (`permit_id`,`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='hazard/risk ของใบอนุญาต — ไม่คำนวณ score จากข้อมูลที่ไม่มี'");

// ---------- 6) permit_hazard_controls ----------
$createTable('permit_hazard_controls', "CREATE TABLE `permit_hazard_controls` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `risk_assessment_id` INT UNSIGNED NULL,
  `control_type` ENUM('elimination','substitution','engineering','administrative','ppe') NOT NULL DEFAULT 'administrative',
  `description` VARCHAR(300) NOT NULL,
  `owner_user_id` INT UNSIGNED NULL,
  `verification_method` VARCHAR(160) NULL,
  `status` ENUM('planned','in_progress','verified','closed') NOT NULL DEFAULT 'planned',
  `verified_by` INT UNSIGNED NULL,
  `verified_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wphc_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='มาตรการควบคุม — หนึ่ง hazard หลาย control'");

// ---------- 7) permit_loto_points ----------
$createTable('permit_loto_points', "CREATE TABLE `permit_loto_points` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `seq` INT NOT NULL DEFAULT 1,
  `point_label` VARCHAR(160) NOT NULL COMMENT 'ตำแหน่งจุดตัดพลังงาน',
  `energy_type` ENUM('electrical','mechanical','hydraulic','pneumatic','steam','gas','chemical','thermal','gravity','other') NOT NULL DEFAULT 'electrical',
  `isolation_method` ENUM('loto','valve','breaker','blank','disconnect','other') NOT NULL DEFAULT 'loto',
  `lock_no` VARCHAR(40) NULL,
  `tag_no` VARCHAR(40) NULL,
  `status` ENUM('open','locked','tagged','isolated','verified','removed') NOT NULL DEFAULT 'open',
  `responsible_user_id` INT UNSIGNED NULL,
  `locked_by` INT UNSIGNED NULL,
  `locked_at` DATETIME NULL,
  `verified_at` DATETIME NULL,
  `removed_by` INT UNSIGNED NULL,
  `removed_at` DATETIME NULL,
  `removal_authorized_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wplp_permit` (`permit_id`,`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='จุดตัดพลังงาน/LOTO — energy type configurable'");

// ---------- 8) permit_zero_energy_verifications ----------
$createTable('permit_zero_energy_verifications', "CREATE TABLE `permit_zero_energy_verifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `loto_point_id` INT UNSIGNED NULL,
  `verification_method` VARCHAR(120) NOT NULL COMMENT 'เช่น voltage check / pressure check',
  `result` ENUM('pass','fail','na') NOT NULL DEFAULT 'na',
  `instrument_id` INT UNSIGNED NULL COMMENT 'FK calibration_instruments (ถ้าวัดด้วยเครื่อง)',
  `instrument_status` VARCHAR(10) NULL COMMENT 'GREEN/AMBER/RED snapshot ตอนตรวจ',
  `verifier_user_id` INT UNSIGNED NOT NULL,
  `note` VARCHAR(300) NULL,
  `evidence_photo` VARCHAR(255) NULL,
  `verified_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpze_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='zero energy verification — ห้ามถือว่าผ่านอัตโนมัติ'");

// ---------- 9) permit_gas_tests ----------
$createTable('permit_gas_tests', "CREATE TABLE `permit_gas_tests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `gas_type` ENUM('oxygen','lel','h2s','co','other') NOT NULL DEFAULT 'oxygen',
  `instrument_id` INT UNSIGNED NULL COMMENT 'FK calibration_instruments',
  `instrument_status` VARCHAR(10) NULL COMMENT 'GREEN/AMBER/RED ตอนใช้งาน',
  `reading` DECIMAL(10,4) NULL,
  `unit` VARCHAR(10) NULL,
  `acceptable_min` DECIMAL(10,4) NULL,
  `acceptable_max` DECIMAL(10,4) NULL,
  `result` ENUM('pass','fail','na') NOT NULL DEFAULT 'na',
  `tester_user_id` INT UNSIGNED NOT NULL,
  `test_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` VARCHAR(300) NULL,
  `evidence_photo` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wpgt_permit` (`permit_id`,`test_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='gas test — อุปกรณ์ต้องผ่าน calibration (block/warn ตาม policy)'");

// ---------- 10) permit_ppe_confirmations ----------
$createTable('permit_ppe_confirmations', "CREATE TABLE `permit_ppe_confirmations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `ppe_code` VARCHAR(40) NOT NULL,
  `ppe_label` VARCHAR(120) NOT NULL,
  `worker_user_id` INT UNSIGNED NULL,
  `contractor_worker_id` INT UNSIGNED NULL,
  `confirmed_by` INT UNSIGNED NOT NULL,
  `confirmed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wppc_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='PPE ที่คนทำงานยืนยันสวม/พร้อม'");

// ---------- 11) permit_workers ----------
$createTable('permit_workers', "CREATE TABLE `permit_workers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `worker_type` ENUM('internal','contractor') NOT NULL DEFAULT 'internal',
  `user_id` INT UNSIGNED NULL,
  `contractor_worker_id` INT UNSIGNED NULL,
  `task` VARCHAR(160) NULL,
  `certification_status` ENUM('authorized','pending','not_authorized','na') NOT NULL DEFAULT 'pending',
  `authorized_by` INT UNSIGNED NULL,
  `authorized_at` DATETIME NULL,
  `has_entry` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'confined space: เข้า',
  `has_exit` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'confined space: ออก',
  `entry_at` DATETIME NULL,
  `exit_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wpwk_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='คนทำงานบนใบอนุญาต — ห้าม worker หมด cert ผ่าน (NOT AUTHORIZED)'");

// ---------- 12) contractors ----------
$createTable('contractors', "CREATE TABLE `contractors` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_name` VARCHAR(160) NOT NULL,
  `contact_person` VARCHAR(120) NULL,
  `phone` VARCHAR(40) NULL,
  `email` VARCHAR(120) NULL,
  `license_no` VARCHAR(80) NULL,
  `safety_training_expiry` DATE NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_contractor_name` (`company_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='บริษัทผู้รับจ้าง (contractor master)'");

// ---------- 13) contractor_workers ----------
$createTable('contractor_workers', "CREATE TABLE `contractor_workers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `full_name` VARCHAR(160) NOT NULL,
  `id_number` VARCHAR(40) NULL,
  `role` VARCHAR(120) NULL,
  `phone` VARCHAR(40) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_cw_contractor` (`contractor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='คนงานของผู้รับจ้าง'");

// ---------- 14) worker_certifications ----------
$createTable('worker_certifications', "CREATE TABLE `worker_certifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subject_type` ENUM('internal','contractor') NOT NULL DEFAULT 'internal',
  `user_id` INT UNSIGNED NULL,
  `contractor_worker_id` INT UNSIGNED NULL,
  `certification_code` VARCHAR(60) NOT NULL,
  `certification_name` VARCHAR(160) NOT NULL,
  `issued_date` DATE NULL,
  `expiry_date` DATE NULL,
  `issuing_body` VARCHAR(120) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_wcert_subj` (`subject_type`,`user_id`,`contractor_worker_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ใบรับรอง/อบรมของคนทำงาน — หมดอายุ = NOT AUTHORIZED'");

// ---------- 15) work_permit_checklists ----------
$createTable('work_permit_checklists', "CREATE TABLE `work_permit_checklists` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `phase` ENUM('pre_work','post_work') NOT NULL DEFAULT 'pre_work',
  `requirement_code` VARCHAR(50) NOT NULL,
  `label` VARCHAR(160) NOT NULL,
  `category` VARCHAR(20) NOT NULL DEFAULT 'check',
  `result` ENUM('pass','fail','na') NULL,
  `evidence_photo` VARCHAR(255) NULL,
  `comment` VARCHAR(300) NULL,
  `acted_by` INT UNSIGNED NOT NULL,
  `acted_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpcl_permit` (`permit_id`,`phase`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='checklist ก่อน/หลังงาน — รายการจาก requirement engine'");

// ---------- 16) permit_suspensions ----------
$createTable('permit_suspensions', "CREATE TABLE `permit_suspensions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `suspended_by` INT UNSIGNED NOT NULL,
  `reason_type` ENUM('unsafe_condition','weather','emergency','equipment_change','isolation_lost','expired','other') NOT NULL DEFAULT 'other',
  `reason` VARCHAR(500) NOT NULL,
  `evidence_photo` VARCHAR(255) NULL,
  `suspended_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resumed_at` DATETIME NULL,
  `resume_verified_by` INT UNSIGNED NULL,
  `resume_verified_at` DATETIME NULL,
  `resume_note` VARCHAR(300) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wpsp_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ระงับ/กลับมาทำงาน — resume ต้อง re-verification ตาม policy'");

// ---------- 17) stop_work_reports ----------
$createTable('stop_work_reports', "CREATE TABLE `stop_work_reports` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `reported_by` INT UNSIGNED NOT NULL,
  `reason_type` ENUM('unsafe_condition','hazard','accident','weather','equipment_failure','other') NOT NULL DEFAULT 'unsafe_condition',
  `reason` VARCHAR(500) NOT NULL,
  `condition_desc` VARCHAR(500) NULL,
  `evidence_photo` VARCHAR(255) NULL,
  `reported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `review_status` ENUM('open','reviewing','resolved','cancelled') NOT NULL DEFAULT 'open',
  `safety_reviewer_id` INT UNSIGNED NULL,
  `corrective_action` VARCHAR(800) NULL,
  `review_note` VARCHAR(500) NULL,
  `review_at` DATETIME NULL,
  `resume_approved_by` INT UNSIGNED NULL,
  `resume_approved_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_swr_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Emergency Stop Work — ห้าม resume อัตโนมัติ'");

// ---------- 18) safety_actions ----------
$createTable('safety_actions', "CREATE TABLE `safety_actions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_type` ENUM('risk_assessment','stop_work','permit','inspection','manual') NOT NULL DEFAULT 'permit',
  `source_id` INT UNSIGNED NULL,
  `permit_id` INT UNSIGNED NULL,
  `description` VARCHAR(500) NOT NULL,
  `owner_user_id` INT UNSIGNED NULL,
  `due_date` DATE NULL,
  `priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status` ENUM('open','in_progress','completed','verified','closed','cancelled') NOT NULL DEFAULT 'open',
  `evidence` VARCHAR(500) NULL,
  `verified_by` INT UNSIGNED NULL,
  `verified_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sact_permit` (`permit_id`),
  KEY `idx_sact_owner` (`owner_user_id`,`status`),
  KEY `idx_sact_due` (`due_date`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Safety action (จาก risk/stopwork/inspection/manual)'");

// ---------- 19) work_permit_activity ----------
$createTable('work_permit_activity', "CREATE TABLE `work_permit_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permit_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `action` ENUM('created','submitted','risk_reviewed','approved','rejected','revision_requested','activated','suspended','resumed','stopped','resume_approved','completed','closed','cancelled','worker_added','loto_locked','loto_removed','gas_test','zero_energy','checklist','ppe_confirmed','note') NOT NULL DEFAULT 'note',
  `description` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wpact_permit` (`permit_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='timeline ของใบอนุญาต — ทุก safety action'");

// ---------- 19b) seed permit_type_requirements (configurable — กลุ่มจริง, ยังเพิ่ม/แก้ได้) ----------
$reqSeeds = [
    'hot_work' => [
        ['fire_extinguisher', 'มีถังดับเพลิงพร้อมใช้งาน', 'equipment', 1],
        ['fire_watch', 'มีคนเฝ้าระวังอัคคีภัย (Fire Watch)', 'control', 1],
        ['combustible_check', 'ตรวจสอบวัสดุติดไฟรอบพื้นที่', 'check', 1],
        ['gas_test', 'ตรวจแก๊ส (ถ้ากำหนด)', 'gas', 0],
        ['spark_containment', 'มีอุปกรณ์กั้นประกายไฟ', 'equipment', 1],
        ['area_inspection', 'ตรวจสอบพื้นที่ก่อนเริ่มงาน', 'check', 1],
        ['emergency_plan', 'แผนฉุกเฉิน/เส้นทางหนีไฟ', 'emergency', 1],
    ],
    'confined_space' => [
        ['gas_test', 'ตรวจแก๊ส (O2/LEL/H2S/CO)', 'gas', 1],
        ['ventilation', 'ระบบระบายอากาศทำงาน', 'engineering', 1],
        ['attendant', 'มีคนคุมภายนอก (Attendant)', 'control', 1],
        ['rescue_plan', 'แผนกู้ภัย/อุปกรณ์กู้ภัย', 'emergency', 1],
        ['communication', 'ระบบสื่อสารเข้าออก', 'equipment', 1],
        ['entry_exit_log', 'บันทึกเวลาเข้า-ออกทุกคน', 'admin', 1],
        ['watchman', 'อุปกรณ์ PPE + ระบบยึดหน่วง', 'ppe', 1],
    ],
    'electrical' => [
        ['isolation', 'ตัดแหล่งจ่ายไฟฟ้า', 'control', 1],
        ['loto', 'ล็อก-แท็ก (LOTO)', 'control', 1],
        ['voltage_verify', 'ตรวจสอบแรงดัน Remain 0 (Zero Energy)', 'check', 1],
        ['authorized_person', 'ผู้ปฏิบัติงานได้รับอนุญาตสำหรับงานไฟฟ้า', 'admin', 1],
        ['insulated_ppe', 'PPE งานไฟฟ้า (ถุงมือ/รองเท้าฉนวน)', 'ppe', 1],
    ],
    'work_at_height' => [
        ['harness', 'สายรัดนิรภัย (Harness)', 'ppe', 1],
        ['anchor_point', 'จุดยึด Anchor ตรวจสอบแล้ว', 'control', 1],
        ['scaffold_ladder', 'นั่งร้าน/บันไดตรวจสอบตามคู่มือ', 'check', 1],
        ['rescue_plan', 'แผนช่วยเหลือผู้ตกจากที่สูง', 'emergency', 1],
        ['barricade', 'เขตกั้น/ป้ายเตือน', 'admin', 1],
    ],
    'general_work' => [
        ['ppp_standard', 'PPE มาตรฐาน (หมวก/รองเท้า/เสื้อ)', 'ppe', 1],
        ['work_area_clean', 'พื้นที่ทำงานสะอาด/ปลอดภัย', 'check', 1],
        ['warning_sign', 'ป้ายเตือนงานกำลังดำเนินการ', 'admin', 0],
    ],
    'chemical' => [
        ['msds', 'มี SDS ของสารเคมี', 'admin', 1],
        ['spill_kit', 'อุปกรณ์เก็บสารเคมีรั่วไหล', 'equipment', 1],
        ['ventilation', 'ระบบระบายอากาศ', 'engineering', 1],
        ['chemical_ppe', 'PPE กันสารเคมี (ชุด/ถุงมือ/หน้ากาก)', 'ppe', 1],
        ['emergency_shower', 'จุดล้างตา/ฝักบัวฉุกเฉินพร้อมใช้', 'emergency', 0],
    ],
    'line_breaking' => [
        ['isolation', 'ตัด/ปิดแหล่งพลังงานและสาร', 'control', 1],
        ['loto', 'ล็อก-แท็ก (LOTO)', 'control', 1],
        ['pressure_relief', 'ปล่อยแรงดัน/ระบาย (Zero Energy)', 'check', 1],
        ['gas_test', 'ตรวจแก๊ส/ไอระเหย', 'gas', 0],
        ['containment', 'เตรียมภาชนะรองรับ', 'equipment', 1],
    ],
    'excavation' => [
        ['utility_check', 'ตรวจสอบท่อ/สายใต้ดินก่อนขุด', 'check', 1],
        ['shoring', 'ระบบกันพัง (Shoring/Battening)', 'engineering', 1],
        ['barricade', 'เขตกั้น/ป้ายเตือนพื้นที่ขุด', 'admin', 1],
        ['rescue_plan', 'แผนกู้ภัยในร่องขุด', 'emergency', 0],
    ],
    'lifting' => [
        ['rigging_plan', 'แผนการยก/จุดยก', 'control', 1],
        ['equipment_cert', 'อุปกรณ์ยกตรวจสอบ/ใบรับรอง', 'admin', 1],
        ['operator_cert', 'พนักงานขับ/สลิงเกอร์มีใบรับรอง', 'admin', 1],
        ['barricade', 'เขตกั้นพื้นที่ยก', 'admin', 1],
    ],
];
$ptByCode = [];
foreach ($pdo->query("SELECT id, code FROM permit_types")->fetchAll(PDO::FETCH_ASSOC) as $pt) {
    $ptByCode[$pt['code']] = (int)$pt['id'];
}
foreach ($reqSeeds as $ptCode => $items) {
    $ptId = $ptByCode[$ptCode] ?? null;
    if (!$ptId) continue;
    $st = $pdo->prepare('SELECT COUNT(*) FROM permit_type_requirements WHERE permit_type_id = ?');
    $st->execute([$ptId]);
    if ((int)$st->fetchColumn() > 0) { $log("~ req:$ptCode (existed)"); continue; }
    foreach ($items as $i => [$code, $label, $cat, $mandatory]) {
        $pdo->prepare('INSERT INTO permit_type_requirements (permit_type_id, code, label_th, category, is_mandatory, sort) VALUES (?,?,?,?,?,?)')
            ->execute([$ptId, $code, $label, $cat, $mandatory, $i]);
        $log("+ req:$ptCode/$code");
        $changed++;
    }
}

// ---------- 20) settings: work_permit + risk matrix ----------
$wpSettings = [
    // work_permit
    'wp_require_approval'       => ['1', 'ต้องผ่าน approval chain ก่อน activate (1=บังคับ)'],
    'wp_require_risk_review'    => ['1', 'ใบอนุญาตทุกใบต้องมี risk assessment + ยืนยันก่อน approve (1=บังคับ)'],
    'wp_expiry_policy'          => ['expire', 'นโยบายเมื่อหมดเวลา: expire (ปิด>EXPIRED) หรือ review (เปลี่ยนเป็น REQUIRES_REVIEW)'],
    'wp_auto_expire_enabled'    => ['1', 'ระบบเปลี่ยน permit ที่หมดเวลาจาก Active เป็น EXPIRED อัตโนมัติ ตาม policy'],
    'wp_gas_block_red'          => ['1', 'ห้ามบันทึก gas test ผ่านด้วยเครื่อง calibration สถานะ RED (1=block, 0=เตือน)'],
    'wp_gas_warn_amber'         => ['1', 'เตือนเมื่อใช้เครื่อง calibration สถานะ AMBER'],
    'wp_cert_expired_block'     => ['1', 'ห้ามเพิ่มคนทำงานที่ certification หมดอายุ (1=block, 0=เตือน)'],
    'wp_require_final_inspection'=> ['1', 'บังคับ checklist post_work + final inspection ก่อน close'],
    'wp_valid_hours_default'    => ['8', 'อายุใบอนุญาตเริ่มต้น (ชั่วโมง) ถ้า permit type ไม่ได้ระบุ'],
    'wp_permit_no_prefix'       => ['PTW', 'คำนำหน้าหมายเลขใบอนุญาต (รูปแบบ {prefix}-{YYYYMM}-{NNN})'],
    'wp_high_risk_approval'     => ['manager', 'ใบอนุญาตระดับ High/Critical ต้องมีขั้นอนุมัติเพิ่ม: role_key (เช่น manager)'],
    // risk matrix
    'risk_matrix_likelihood'    => ['[1,2,3,4,5]', 'ทางเลือก Likelihood scale (1-5)'],
    'risk_matrix_severity'      => ['[1,2,3,4,5]', 'ทางเลือก Severity scale (1-5)'],
    'risk_matrix_thresholds'    => ['[{"level":"low","max":4},{"level":"medium","max":9},{"level":"high","max":15},{"level":"critical","max":25}]', 'ช่วงคะแนน L*S → ระดับ (เรียงจากน้อยไปมาก)'],
    'risk_matrix_required_approval' => ['{"critical":["manager"],"high":["manager"]}', 'ระดับเสี่ยงต้องมี role ใดอนุมัติเพิ่ม'],
];
foreach ($wpSettings as $k => [$v, $desc]) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $st->execute([$k]);
    if ((int)$st->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "work_permit", ?)')->execute([$k, $v, $desc]);
        $log("+ settings.$k");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

// ---------- 21) notification_templates ----------
$ntpls = [
    ['work_permit', 'requested',          'ใบอนุญาตใหม่: {permit_no}', "ขอใบอนุญาต {permit_type} — {permit_no}\nเครื่อง: {asset_name}\nโดย: {requester}\nรอขั้น: {approval_step}", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'approval_required',  'รออนุมัติใบอนุญาต: {permit_no}', "ใบอนุญาต {permit_type} — {permit_no} ถึงขั้น {approval_step} ของคุณแล้วกรุณาอนุมัติ/พิจารณา", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'approved',           'อนุมัติใบอนุญาต: {permit_no}', "ใบอนุญาต {permit_type} — {permit_no} อนุมัติครบแล้ว รอเริ่มงานได้", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'rejected',           'ไม่อนุมัติใบอนุญาต: {permit_no}', "ใบอนุญาต {permit_type} — {permit_no} ถูกปฏิเสธ\nเหตุผล: {reason}", 'medium', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'activated',          'ใบอนุญาตเริ่มงาน: {permit_no}', "ใบอนุญาต {permit_no} เริ่มงานแล้ว (จนถึง {valid_until})", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'expiring',           'ใบอนุญาตใกล้หมด: {permit_no}', "ใบอนุญาต {permit_no} จะหมดเวลา {valid_until} — โปรดประเมินต่ออายุ/ปิดงาน", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'expired',            'ใบอนุญาตหมดเวลา: {permit_no}', "ใบอนุญาต {permit_no} หมดเวลาแล้ว ({valid_until}) — ระบบปิด/requires review ตาม policy", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'suspended',          'ระงับใบอนุญาต: {permit_no}', "ใบอนุญาต {permit_no} ถูกระงับ\nเหตุผล: {reason}", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'resumed',            'กลับมาทำงาน: {permit_no}', "ใบอนุญาต {permit_no} กลับมาทำงานต่อ หลัง re-verification", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'closed',             'ปิดใบอนุญาต: {permit_no}', "ใบอนุญาต {permit_type} — {permit_no} ถูกปิดเรียบร้อย (การตรวจหลังงานผ่าน)", 'high', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'stop_work',          '⚠ STOP WORK — ใบอนุญาต {permit_no}', "หยุดงานทันที! ใบอนุญาต {permit_no}\nเหตุผล: {reason}\nผู้รายงาน: {reporter}", 'critical', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'high_risk',          'ใบอนุญาตความเสี่ยงสูง: {permit_no}', "ใบอนุญาต {permit_type} — {permit_no} ระดับ {risk_level} รอการอนุมัติของผู้มีอำนาจ", 'critical', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'cert_expired',       'Certification หมดอายุ: {worker}', "คนทำงาน {worker} (ใบอนุญาต {permit_no}) มี certification หมดอายุ — ไม่ผ่าน authorization", 'medium', '/safety/work_permit/{permit_id}'],
    ['work_permit', 'gas_red_block',      'แก๊ส/Calibration RED: {permit_no}', "เครื่องตรวจแก๊ส {instrument} สถานะ RED — บันทึก gas test {permit_no} ถูกบล็อกตาม policy", 'high', '/safety/work_permit/{permit_id}'],
];
foreach ($ntpls as [$mod, $ev, $title, $msg, $prio, $url]) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM notification_templates WHERE module = ? AND event = ?');
    $st->execute([$mod, $ev]);
    if ((int)$st->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO notification_templates (module, event, title_template, message_template, priority, url_template, enabled) VALUES (?,?,?,?,?,?,1)')
            ->execute([$mod, $ev, $title, $msg, $prio, $url]);
        $log("+ nt: $mod/$ev");
        $changed++;
    } else {
        $log("~ nt: $mod/$ev (existed)");
    }
}

// ---------- 22) menu_permissions ----------
$menuKeys = [
    'safety/work_permit', 'safety/permits', 'safety/loto', 'safety/dashboard',
    'safety/stop_work', 'safety/actions', 'safety/risk_matrix', 'safety/reports',
];
$roles = [[1, 2, 6, 7, 3, 4, 5], [1, 2, 6, 7, 3], [1, 2, 6, 7, 3], [1, 2, 6], [1, 2, 6, 7, 3], [1, 2, 6, 7, 3], [1, 2, 6], [1, 2, 6, 5]];
foreach ($menuKeys as $i => $key) {
    $grantRoles = $roles[$i];
    foreach ($grantRoles as $rid) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE menu_key = ? AND role_id = ?');
        $st->execute([$key, $rid]);
        if ((int)$st->fetchColumn() === 0) {
            $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')->execute([$rid, $key]);
            $log("+ menu_permissions: $key role=$rid");
            $changed++;
        }
    }
}

// ---------- 23) version marker ----------
$verSt = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = \'wp_phase30_applied_ver\'');
$verSt->execute();
if ((int)$verSt->fetchColumn() === 0) {
    $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES ('wp_phase30_applied_ver', '2026-09-24', 'work_permit', 'เลขเวอร์ชัน migration Phase 30 ครั้งล่าสุด')")->execute();
    $log("+ settings.wp_phase30_applied_ver");
} else {
    $pdo->prepare("UPDATE settings SET setting_value = '2026-09-24', updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'wp_phase30_applied_ver'")->execute();
    $log("~ settings.wp_phase30_applied_ver (updated)");
}

$log(PHP_EOL . "Phase 30 migration done. changed=$changed");