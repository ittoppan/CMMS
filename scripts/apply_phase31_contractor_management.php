<?php
/**
 * scripts/apply_phase31_contractor_management.php — idempotent DB migration (Phase 31)
 *
 * Contractor Management & External Service Management:
 *   1) EXTEND contractors (master Phase 30 — additive only, never delete legacy cols)
 *   2) contractor_contacts          — multiple contacts per contractor
 *   3) contractor_qualifications    — qualification rounds (append-only)
 *   4) contractor_documents         — documents w/ versioning (archive old, no delete)
 *   5) contractor_contracts         — contracts (lifecycle + expiring detection)
 *   6) contractor_assignments       — external work linked to WO + PTW + SLA
 *   7) contractor_acceptance        — acceptance results (append-only per round)
 *   8) contractor_reviews           — periodic performance reviews
 *   9) contractor_corrective_actions— corrective actions (open/completed/verified)
 *  10) contractor_activity          — timeline + audit of every action
 *  11) settings group contractor + notification_templates module contractor
 *  12) menu_permissions: contractor/overview + contractor/work
 *
 * NOTE: DDL COMMENTs are ASCII-only because MySQL may reject multi-byte
 * COMMENT strings on some connections; Thai copy lives in PHP data seeds
 * (parameterized INSERTs) and in docs/*.md.
 *
 * Run: php scripts/apply_phase31_contractor_management.php (idempotent)
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

// ---------- 0) guard: contractors base exists (Phase 30) ----------
if (!$hasTable('contractors')) {
    $pdo->exec("CREATE TABLE `contractors` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `company_name` VARCHAR(200) NOT NULL,
      `contact_person` VARCHAR(120) NULL,
      `phone` VARCHAR(40) NULL,
      `email` VARCHAR(120) NULL,
      `license_no` VARCHAR(80) NULL,
      `safety_training_expiry` DATE NULL,
      `is_active` TINYINT(1) NOT NULL DEFAULT 1,
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_ctr_company` (`company_name`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='contractor master (Phase 31)'");
    $log("+ contractors (created base)");
    $changed++;
}

// ---------- 1) EXTEND contractors (additive) ----------
$addColumn('contractors', 'code',              "VARCHAR(24) NULL COMMENT 'CON-YYYY-NNN generated'");
$addColumn('contractors', 'legal_name',        "VARCHAR(200) NULL COMMENT 'legal/registered name'");
$addColumn('contractors', 'registration_no',   "VARCHAR(60) NULL");
$addColumn('contractors', 'tax_id',            "VARCHAR(40) NULL");
$addColumn('contractors', 'address',           "VARCHAR(500) NULL");
$addColumn('contractors', 'internal_owner_id', "INT UNSIGNED NULL COMMENT 'internal owner user_id'");
$addColumn('contractors', 'status',            "ENUM('draft','pending_qualification','qualified','conditional','suspended','expired','blocked','inactive') NOT NULL DEFAULT 'draft'");
$addColumn('contractors', 'qualified_at',      "DATETIME NULL");
$addColumn('contractors', 'status_reason',     "VARCHAR(500) NULL");
$addColumn('contractors', 'status_changed_by', "INT UNSIGNED NULL");
$addColumn('contractors', 'status_changed_at', "DATETIME NULL");
$addColumn('contractors', 'block_start_date',  "DATE NULL");
$addColumn('contractors', 'block_review_date', "DATE NULL");
$addColumn('contractors', 'notes',             "VARCHAR(1000) NULL");
$addColumn('contractors', 'service_categories_json', "JSON NULL COMMENT 'service category keys'");

$st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND INDEX_NAME = ?");
$st->execute(['idx_ctr_status']);
if ((int)$st->fetchColumn() === 0) {
    $pdo->exec('ALTER TABLE contractors ADD KEY idx_ctr_status (status)');
    $log("+ contractors.idx_ctr_status");
    $changed++;
}
$st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND INDEX_NAME = ?");
$st->execute(['idx_ctr_owner']);
if ((int)$st->fetchColumn() === 0) {
    $pdo->exec('ALTER TABLE contractors ADD KEY idx_ctr_owner (internal_owner_id)');
    $log("+ contractors.idx_ctr_owner");
    $changed++;
}

// ---------- 2) contractor_contacts ----------
$createTable('contractor_contacts', "CREATE TABLE `contractor_contacts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `role` VARCHAR(80) NULL,
  `phone` VARCHAR(40) NULL,
  `email` VARCHAR(120) NULL,
  `line_id` VARCHAR(80) NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ctc_contractor` (`contractor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='contractor contacts (soft delete only)'");

// ---------- 3) contractor_qualifications ----------
$createTable('contractor_qualifications', "CREATE TABLE `contractor_qualifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `round` INT NOT NULL DEFAULT 1,
  `status` ENUM('draft','under_review','approved','conditional','rejected','expired') NOT NULL DEFAULT 'draft',
  `assessed_by` INT UNSIGNED NULL,
  `assessed_at` DATETIME NULL,
  `valid_until` DATE NULL,
  `result_score` DECIMAL(5,2) NULL,
  `dimensions_json` JSON NULL,
  `summary` VARCHAR(1000) NULL,
  `evidence_json` JSON NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cq_contractor` (`contractor_id`,`round`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='qualification rounds (append-only)'");

// ---------- 4) contractor_documents ----------
$createTable('contractor_documents', "CREATE TABLE `contractor_documents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `doc_type` VARCHAR(40) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_original_name` VARCHAR(255) NULL,
  `doc_no` VARCHAR(80) NULL,
  `issue_date` DATE NULL,
  `expiry_date` DATE NULL,
  `version` INT NOT NULL DEFAULT 1,
  `status` ENUM('active','archived') NOT NULL DEFAULT 'active',
  `notes` VARCHAR(500) NULL,
  `uploaded_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cd_contractor` (`contractor_id`,`doc_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='documents w/ versioning (old = archived)'");

// ---------- 5) contractor_contracts ----------
$createTable('contractor_contracts', "CREATE TABLE `contractor_contracts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `contract_no` VARCHAR(80) NULL,
  `title` VARCHAR(200) NOT NULL,
  `contract_type` ENUM('master','annual','per_job','fixed_turnkey','labor_only','rental') NOT NULL DEFAULT 'per_job',
  `status` ENUM('draft','active','expiring','expired','suspended','closed') NOT NULL DEFAULT 'draft',
  `amount` DECIMAL(14,2) NULL,
  `currency` VARCHAR(5) NOT NULL DEFAULT 'THB',
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `renewal_reminder_days` INT NULL,
  `terms_json` JSON NULL,
  `notes` VARCHAR(1000) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cc_contractor` (`contractor_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='contracts (expiring computed from settings)'");

// ---------- 6) contractor_assignments ----------
$createTable('contractor_assignments', "CREATE TABLE `contractor_assignments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_no` VARCHAR(32) NULL,
  `contractor_id` INT UNSIGNED NOT NULL,
  `work_order_id` INT UNSIGNED NULL,
  `work_order_no` VARCHAR(60) NULL,
  `asset_id` INT UNSIGNED NULL,
  `service_category` VARCHAR(40) NULL,
  `title` VARCHAR(300) NOT NULL,
  `scope` TEXT NULL,
  `status` ENUM('requested','contractor_selected','assigned','safety_review','permit_ready','work_started','work_completed','inspection','rework','accepted','invoiced','closed','cancelled') NOT NULL DEFAULT 'requested',
  `quote_ref` VARCHAR(120) NULL,
  `quoted_amount` DECIMAL(14,2) NULL,
  `approved_amount` DECIMAL(14,2) NULL,
  `currency` VARCHAR(5) NOT NULL DEFAULT 'THB',
  `selection_reason` VARCHAR(500) NULL,
  `internal_owner_id` INT UNSIGNED NULL,
  `permit_id` INT UNSIGNED NULL,
  `permit_required` TINYINT(1) NOT NULL DEFAULT 0,
  `priority` ENUM('low','medium','high','critical','emergency') NOT NULL DEFAULT 'medium',
  `planned_start` DATE NULL,
  `planned_end` DATE NULL,
  `confidence_pct` INT NULL,
  `end_condition` VARCHAR(300) NULL,
  `sla_due_at` DATETIME NULL,
  `sla_response_at` DATETIME NULL,
  `sla_started_at` DATETIME NULL,
  `sla_completed_at` DATETIME NULL,
  `failure_id` INT NULL,
  `rca_id` INT NULL,
  `notes` VARCHAR(1000) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ca_contractor` (`contractor_id`,`status`),
  KEY `idx_ca_wo` (`work_order_id`),
  KEY `idx_ca_permit` (`permit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='external work assignments'");

// ---------- 7) contractor_acceptance ----------
$createTable('contractor_acceptance', "CREATE TABLE `contractor_acceptance` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_id` INT UNSIGNED NOT NULL,
  `round` INT NOT NULL DEFAULT 1,
  `result` ENUM('pass','conditional','reject') NOT NULL,
  `checked_by` INT UNSIGNED NULL,
  `checked_at` DATETIME NULL,
  `defect` VARCHAR(500) NULL,
  `rework_required` TINYINT(1) NOT NULL DEFAULT 0,
  `rework_due_date` DATE NULL,
  `checklist_json` JSON NULL,
  `evidence_json` JSON NULL,
  `notes` VARCHAR(1000) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_arct_asgn` (`assignment_id`,`round`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='acceptance results (append-only per round)'");

// ---------- 8) contractor_reviews ----------
$createTable('contractor_reviews', "CREATE TABLE `contractor_reviews` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `period` ENUM('monthly','quarterly','semi_annual','annual') NOT NULL DEFAULT 'quarterly',
  `period_start` DATE NULL,
  `period_end` DATE NULL,
  `result` VARCHAR(20) NULL,
  `score` DECIMAL(5,2) NULL,
  `comment` VARCHAR(1000) NULL,
  `reviewed_by` INT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_contractor` (`contractor_id`,`period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='periodic performance reviews'");

// ---------- 9) contractor_corrective_actions ----------
$createTable('contractor_corrective_actions', "CREATE TABLE `contractor_corrective_actions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `action_no` VARCHAR(24) NULL,
  `contractor_id` INT UNSIGNED NOT NULL,
  `assignment_id` INT UNSIGNED NULL,
  `issue` VARCHAR(500) NOT NULL,
  `root_cause` VARCHAR(500) NULL,
  `action` VARCHAR(500) NULL,
  `owner_id` INT UNSIGNED NULL,
  `due_date` DATE NULL,
  `status` ENUM('open','completed','verified','cancelled') NOT NULL DEFAULT 'open',
  `evidence_json` JSON NULL,
  `verified_by` INT UNSIGNED NULL,
  `verified_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cca_contractor` (`contractor_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='corrective actions (verified before close)'");

// ---------- 10) contractor_activity ----------
$createTable('contractor_activity', "CREATE TABLE `contractor_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NULL,
  `assignment_id` INT UNSIGNED NULL,
  `action` VARCHAR(60) NOT NULL,
  `description` VARCHAR(1000) NULL,
  `old_status` VARCHAR(40) NULL,
  `new_status` VARCHAR(40) NULL,
  `performed_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cact_contractor` (`contractor_id`,`created_at`),
  KEY `idx_cact_assignment` (`assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='contractor timeline + audit (append-only)'");

// ---------- 11) settings: contractor ----------
$ctrSettings = [
    'contractor_service_categories' => ['[{"key":"mechanical","label":"งานกลศาสตร์/ซ่อมเครื่องจักร","enabled":true,"requires_cert_codes":[]},{"key":"electrical","label":"งานไฟฟ้า","enabled":true,"requires_cert_codes":["ELEC"]},{"key":"welding","label":"งานเชื่อม/ตัด","enabled":true,"requires_cert_codes":["SAFETY-TRAIN","WELD"]},{"key":"fabrication","label":"งานช่างประกอบ/โครงสร้าง","enabled":true,"requires_cert_codes":[]},{"key":"civil","label":"งานโยธา/ปรับปรุงอาคาร","enabled":true,"requires_cert_codes":[]},{"key":"piping","label":"งานท่อ/ประปา/สปริงเกอร์","enabled":true,"requires_cert_codes":[]},{"key":"hvac","label":"งานระบบปรับอากาศ","enabled":true,"requires_cert_codes":[]},{"key":"painting","label":"งานพ่นสี/ทาสี/กันสนิม","enabled":true,"requires_cert_codes":[]},{"key":"cleaning","label":"งานทำความสะอาดโรงงาน","enabled":true,"requires_cert_codes":[]},{"key":"landscaping","label":"งานจัดสวน/พื้นที่สีเขียว","enabled":true,"requires_cert_codes":[]},{"key":"scaffolding","label":"งานนั่งร้าน/โครงสำหรับงานสูง","enabled":true,"requires_cert_codes":["WORK_AT_HEIGHT","SAFETY-TRAIN"]},{"key":"confined_space","label":"งานเข้า-ออกอับอากาศ","enabled":true,"requires_cert_codes":["CONFINED_SPACE"]},{"key":"refrigeration","label":"งานแช่เย็น/ห้องเย็น","enabled":true,"requires_cert_codes":[]},{"key":"specialized_inspection","label":"งานตรวจสอบเฉพาะทาง","enabled":true,"requires_cert_codes":[]}]', 'หมวดงานที่ผู้รับเหมาให้บริการ (configurable)'],
    'contractor_doc_types' => ['[{"key":"registration","label":"ทะเบียนนิติบุคคล/หนังสือรับรอง","expiry_required":false,"reminder_days":60},{"key":"insurance","label":"ประกันภัยอุบัติเหตุ/บุคคลที่สาม","expiry_required":true,"reminder_days":45},{"key":"certification","label":"ใบรับรองความสามารถหลัก","expiry_required":true,"reminder_days":60},{"key":"license","label":"ใบอนุญาตประกอบกิจการ","expiry_required":true,"reminder_days":60},{"key":"safety_certificate","label":"หนังสือกรมแรงงาน/อบรมความปลอดภัย","expiry_required":true,"reminder_days":30},{"key":"safety_training","label":"หลักฐานการอบรมความปลอดภัย (ssp/ลูกจ้าง)","expiry_required":true,"reminder_days":30},{"key":"contract","label":"สัญญา/ใบเสนอราคา","expiry_required":false,"reminder_days":60},{"key":"nda","label":"NDA/บันทึกข้อตกลง","expiry_required":false,"reminder_days":60},{"key":"other","label":"อื่น ๆ","expiry_required":false,"reminder_days":30}]', 'ประเภทเอกสาร (expiry_required + reminder_days)'],
    'contractor_qual_dimensions' => ['[{"key":"service_capability","label":"ความสามารถในการให้บริการ","weight":1},{"key":"experience","label":"ประสบการณ์/ผลงานที่ผ่านมา","weight":1},{"key":"technical_competency","label":"ความเชี่ยวชาญทางเทคนิค","weight":1},{"key":"safety","label":"มาตรฐานความปลอดภัย","weight":1},{"key":"documents","label":"ความครบถ้วนของเอกสาร","weight":1},{"key":"insurance","label":"ความคุ้มครองประกัน","weight":1},{"key":"certification","label":"ใบรับรอง/ใบอนุญาต","weight":1},{"key":"training","label":"การฝึกอบรม/วุฒิบัตร","weight":1},{"key":"past_performance","label":"ผลการปฏิบัติงานย้อนหลัง","weight":1}]', 'มิติคะแนนคุณสมบัติ (weight)'],
    'contractor_status_labels' => ['{"draft":"ร่าง","pending_qualification":"รอประเมินคุณสมบัติ","qualified":"ผ่านคุณสมบัติ","conditional":"ผ่านมีเงื่อนไข","suspended":"พักการว่าจ้าง","expired":"คุณสมบัติหมดอายุ","blocked":"ถูกบล็อก","inactive":"ยกเลิกความร่วมมือ"}', 'ป้ายสถานะ (UI)'],
    'contractor_blacklist_label' => ['ถูกบล็อก', 'คำที่ UI ใช้แทน "บล็อก"'],
    'contractor_reminder_days' => ['{"document":30,"insurance":60,"certificate":60,"contract":45,"qualification":90,"safety_training":30}', 'กี่วันก่อนหมดอายุให้เตือน'],
    'contractor_sla_metrics' => ['[{"code":"response","label":"ตอบรับงาน","target_minutes":240,"enabled":true},{"code":"start_after_assignment","label":"เริ่มงานหลังมอบหมาย","target_hours":48,"enabled":true},{"code":"completion","label":"แล้วเสร็จตามแผน","target_days":0,"enabled":true,"note":"0 = ตาม planned_end"},{"code":"emergency_response","label":"ตอบรับงานฉุกเฉิน","target_minutes":60,"enabled":true}]', 'SLA targets (configurable)'],
    'contractor_score_min_jobs' => ['3', 'ขั้นต่ำงานที่เสร็จ ต่อช่วงเวลา (ไม่พอ → INSUFFICIENT_DATA)'],
    'contractor_performance_window_days' => ['365', 'ช่วงเวลาถอยหลัง (วัน) สำหรับ performance/analytics'],
    'contractor_repeat_failure_gap_days' => ['90', 'failure โหมดซ้ำในเครื่องเดียวกันภายในกี่วัน → repeat-failure-suspected'],
    'contractor_min_qualified_to_work' => ['qualified', 'สถานะขั้นต่ำที่ว่าจ้างงานภายนอกได้'],
    'contractor_phase31_applied_ver' => ['2026-09-25', 'เลขเวอร์ชัน migration Phase 31 ครั้งล่าสุด'],
];
foreach ($ctrSettings as $k => [$v, $desc]) {
    $another = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $another->execute([$k]);
    if ((int)$another->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "contractor", ?)')->execute([$k, $v, $desc]);
        $log("+ settings.$k");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

// ---------- 12) notification_templates: contractor ----------
$ntpls = [
    ['contractor', 'qualifying_required', 'ต้องการประเมินคุณสมบัติผู้รับเหมา: {company_name}', "ผู้รับเหมา {company_name} ({contractor_no}) อยู่ในสถานะ {status} — ต้องประเมินคุณสมบัติก่อนว่าจ้าง", 'medium', '/contractors/{contractor_id}'],
    ['contractor', 'qual_result', 'ผลการประเมินคุณสมบัติ: {company_name}', "การประเมินคุณสมบัติ {company_name} ผ่านสถานะ {result} (คะแนน {score}) ถึง {valid_until}", 'high', '/contractors/{contractor_id}'],
    ['contractor', 'qual_expiring', 'คุณสมบัติใกล้หมด: {company_name}', "คุณสมบัติผู้รับเหมา {company_name} จะหมด {valid_until} — เตรียมประเมินใหม่", 'medium', '/contractors/{contractor_id}'],
    ['contractor', 'doc_expiring', 'เอกสารใกล้หมด: {company_name}', "เอกสาร {doc_type} ของ {company_name} ({doc_no}) จะหมดวันที่ {expiry_date}", 'medium', '/contractors/{contractor_id}'],
    ['contractor', 'doc_expired', 'เอกสารหมดอายุ: {company_name}', "เอกสาร {doc_type} ของ {company_name} ({doc_no}) หมดอายุแล้ว {expiry_date}", 'high', '/contractors/{contractor_id}'],
    ['contractor', 'cert_expiring', 'ใบรับรองคนงานใกล้หมด: {worker}', "ใบรับรอง {certification_code} ({worker}) {company_name} จะหมด {expiry_date}", 'medium', '/contractors/{contractor_id}'],
    ['contractor', 'assignment_assigned', 'มอบหมายงานภายนอก: {assignment_no}', "มอบหมายงาน {title} ให้ {company_name} ({assignment_no}) WO: {work_order_no} | กำหนดเสร็จ: {planned_end}", 'high', '/contractors/work?assignment={assignment_id}'],
    ['contractor', 'assignment_status', 'สถานะงานภายนอกเปลี่ยน: {assignment_no}', "งาน {assignment_no} — {title} เปลี่ยนจาก {old_status} เป็น {new_status} หมายเหตุ: {note}", 'medium', '/contractors/work?assignment={assignment_id}'],
    ['contractor', 'sla_breach', 'งานภายนอกเกิน SLA: {assignment_no}', "งาน {assignment_no} — {title} ยังไม่ผ่านขั้น {step} เกินกำหนด SLA ({due_at})", 'high', '/contractors/work?assignment={assignment_id}'],
    ['contractor', 'permit_required', 'งานภายนอกรอใบอนุญาต: {assignment_no}', "งาน {assignment_no} — {title} ต้องมีใบอนุญาต (PTW) ที่ approved/active ก่อนเริ่มงาน", 'high', '/contractors/work?assignment={assignment_id}'],
    ['contractor', 'acceptance_result', 'ผลตรวจรับงานภายนอก: {assignment_no}', "รอบที่ {round} ตรวจงาน {assignment_no} — {title}: {result} {note}", 'medium', '/contractors/work?assignment={assignment_id}'],
    ['contractor', 'contract_expiring', 'สัญญาผู้รับเหมาใกล้หมด: {contract_no}', "สัญญา {contract_no} — {title} ({company_name}) หมด {end_date}", 'medium', '/contractors/{contractor_id}'],
    ['contractor', 'blocked', 'ผู้รับเหมาถูกบล็อก: {company_name}', "ผู้รับเหมา {company_name} ({contractor_no}) ถูกบล็อก เหตุผล: {reason} ทบทวนภายใน: {review_date}", 'critical', '/contractors/{contractor_id}'],
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

// ---------- 13) menu_permissions ----------
$menuKeys = ['contractor/overview', 'contractor/work'];
$menuRoles = [
    [1, 2, 6, 7, 3, 5],
    [1, 2, 6, 7, 3],
];
foreach ($menuKeys as $i => $key) {
    foreach ($menuRoles[$i] as $rid) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE menu_key = ? AND role_id = ?');
        $st->execute([$key, $rid]);
        if ((int)$st->fetchColumn() === 0) {
            $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')->execute([$rid, $key]);
            $log("+ menu_permissions: $key role=$rid");
            $changed++;
        }
    }
}

$log(PHP_EOL . "Phase 31 migration done. changed=$changed");