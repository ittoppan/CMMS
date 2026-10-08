<?php
/**
 * scripts/apply_phase34_workforce.php — idempotent DB migration (Phase 34)
 *
 * Maintenance Resource & Workforce Management:
 *   1)  wf_skills                 — normalized skill catalog (skill ≠ certification ≠ training ≠ authorization)
 *   2)  technician_skills (additive) — skill_id FK backfilled by name; skill_name kept for planning.php back-compat
 *   3)  worker_certifications (additive) — status / evidence / verification; subject_type already covers contractor
 *   4)  wf_skill_requirements     — which skill a work context requires, and whether a certification/authorization is mandatory
 *   5)  wf_authorizations         — company permission to act (distinct from holding a credential)
 *   6)  wf_courses + wf_training_records — workforce training (document_training stays the document-compliance path)
 *   7)  wf_crews + wf_crew_members — teams/crews (NOT a duplicate of work_assignees; work_assignees is per-work-order)
 *   8)  wf_shift_assignments      — per-technician planned shift; global default stays in planning_* settings
 *   9)  wf_leave                  — planned unavailability (the only leave concept; there is no attendance table)
 *  10)  wf_capacity_snapshots     — dated capacity/utilization history for trend reporting
 *  11)  wf_qualification_evidence — append-only evidence trail for every skill/cert/authorization decision
 *  12) settings group workforce
 *  13) notification_templates module workforce
 *  14) menu_permissions: workforce keys
 *
 * DATA OWNERSHIP (enforced by schema comments + src/helpers/workforce.php, not by prose):
 *   users + departments            = the ONE person and organization master. No employees/technicians table.
 *   repair + work_assignees        = the ONE work order and resource-assignment store (Phase 14/25).
 *   technician_skills              = skill evidence (competency). Free-text name is legacy but still read
 *                                    by src/helpers/planning.php:174 — so it is preserved, not replaced.
 *   worker_certifications          = external verifiable credentials (Phase 31 contractor + Phase 24 safety reuse it).
 *   document_training(_results)    = document-compliance training. Workforce courses are a separate catalog
 *                                    because document_training.document_id is NOT NULL; they are NOT merged.
 *   holidays + planning_* settings = working calendar. There is NO attendance system in this codebase, so
 *                                    Phase 34 reports PLANNED availability only and never claims actual attendance.
 *   repair.actual_start_at/completed_at/repair_time_minutes + work_pause_logs = the ONLY actual-hours source.
 *   contractor_workers             = contractor personnel. They are never inserted into `users`.
 *
 * NON-AUTOMATION GUARDS (settings, honoured by the engine):
 *   workforce_auto_assign          = 0  (the engine proposes candidates with reasons; it never assigns)
 *   workforce_block_unqualified    = 1  (block unqualified assignment by default; 0 = report only)
 *   workforce_require_reason       = 1  (every skill/cert/auth change needs a reason)
 *
 * NOTE: DDL COMMENTs are ASCII-only because MySQL may reject multi-byte COMMENT strings on some
 * connections; Thai copy lives in PHP data seeds (parameterized INSERTs) and in docs/*.md.
 *
 * Run: php scripts/apply_phase34_workforce.php (idempotent)
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

$hasIndex = function (string $table, string $index) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $st->execute([$table, $index]);
    return (int)$st->fetchColumn() > 0;
};

$hasFk = function (string $table, string $name) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?');
    $st->execute([$table, $name]);
    return (int)$st->fetchColumn() > 0;
};

$addColumn = function (string $table, string $column, string $definition) use ($pdo, $hasTable, $hasColumn, $log, &$changed): void {
    if (!$hasTable($table)) { $log("~ $table (table missing — skipped $column)"); return; }
    if ($hasColumn($table, $column)) { $log("~ $table.$column (existed)"); return; }
    $pdo->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
    $log("+ $table.$column");
    $changed++;
};

$addIndex = function (string $table, string $index, string $columns) use ($pdo, $hasTable, $hasIndex, $log, &$changed): void {
    if (!$hasTable($table)) { $log("~ $table (table missing — skipped $index)"); return; }
    if ($hasIndex($table, $index)) { $log("~ $index (existed)"); return; }
    $pdo->exec("ALTER TABLE `$table` ADD INDEX `$index` ($columns)");
    $log("+ index $index");
    $changed++;
};

$addFk = function (string $table, string $name, string $column, string $refTable, string $refColumn) use ($pdo, $hasTable, $hasFk, $log, &$changed): void {
    if (!$hasTable($table) || !$hasTable($refTable)) { $log("~ fk $name (table missing)"); return; }
    if ($hasFk($table, $name)) { $log("~ fk $name (existed)"); return; }
    $pdo->exec("ALTER TABLE `$table` ADD CONSTRAINT `$name` FOREIGN KEY (`$column`) REFERENCES `$refTable` (`$refColumn`)");
    $log("+ fk $name");
    $changed++;
};

$createTable = function (string $table, string $ddl) use ($pdo, $hasTable, $log, &$changed): void {
    if ($hasTable($table)) { $log("~ $table (existed)"); return; }
    $pdo->exec($ddl);
    $log("+ $table");
    $changed++;
};

/**
 * Widen an ENUM on an existing table without touching rows.
 *
 * information_schema.COLUMN_TYPE holds only the type ("enum('a','b')") and never
 * the NOT NULL/DEFAULT clause, so a substring match against the full DDL would
 * never match and the ALTER would re-run on every invocation. Compare the set of
 * declared values instead.
 *
 * @param string[] $values the enum values the column must contain
 */
$widenEnum = function (string $table, string $column, array $values, string $default = '') use ($pdo, $hasTable, $log, &$changed): void {
    if (!$hasTable($table)) return;
    $st = $pdo->prepare('SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    $current = (string)($st->fetchColumn() ?: '');
    if ($current === '') return;

    $missing = [];
    foreach ($values as $v) {
        if (stripos($current, "'" . $v . "'") === false) $missing[] = $v;
    }
    if (!$missing) {
        $log("~ $table.$column (enum already complete)");
        return;
    }
    $list = "'" . implode("','", $values) . "'";
    $ddl  = "ENUM($list) NOT NULL" . ($default !== '' ? " DEFAULT '$default'" : '');
    $pdo->exec("ALTER TABLE `$table` MODIFY `$column` $ddl");
    $log("~ widened $table.$column (added: " . implode(',', $missing) . ')');
    $changed++;
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 1) wf_skills — the normalized skill catalog
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_skills', <<<'SQL'
CREATE TABLE wf_skills (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(40)  NOT NULL COMMENT 'stable key used to resolve legacy free-text required_skill',
  name_th       VARCHAR(160) NOT NULL,
  name_en       VARCHAR(160) NOT NULL DEFAULT '',
  category      VARCHAR(60)  NOT NULL DEFAULT 'general' COMMENT 'mechanical/electrical/instrument/safety/general',
  description   TEXT,
  min_level     TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=aware 2=can do with guidance 3=independent 4=advanced 5=expert',
  is_certification_required TINYINT(1) NOT NULL DEFAULT 0,
  is_authorization_required TINYINT(1) NOT NULL DEFAULT 0,
  required_certification_code VARCHAR(60) NOT NULL DEFAULT '',
  required_authorization_code VARCHAR(60) NOT NULL DEFAULT '',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wf_skills_code (code),
  KEY idx_wf_skills_cat (category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 2) technician_skills (additive) — link the live legacy table to the catalog
 *    planning.php:174 pln_get_skills() still reads skill_name, so it stays.
 * ═══════════════════════════════════════════════════════════════════════════ */
$addColumn('technician_skills', 'skill_id', 'INT UNSIGNED NULL COMMENT "FK wf_skills.id — NULL until mapped"');
$addColumn('technician_skills', 'evidence_type', "ENUM('assessed','certified','trained','experience') NOT NULL DEFAULT 'assessed'");
$addColumn('technician_skills', 'evidence_note', 'VARCHAR(500) NOT NULL DEFAULT ""');
$addColumn('technician_skills', 'verified_by', 'INT UNSIGNED NULL');
$addColumn('technician_skills', 'verified_at', 'DATETIME NULL');
$addIndex('technician_skills', 'idx_ts_skill_id', 'skill_id, user_id');
$addFk('technician_skills', 'fk_ts_skill_id', 'skill_id', 'wf_skills', 'id');

/* ═══════════════════════════════════════════════════════════════════════════
 * 3) worker_certifications (additive) — already covers internal + contractor
 * ═══════════════════════════════════════════════════════════════════════════ */
$addColumn('worker_certifications', 'certificate_no', 'VARCHAR(100) NOT NULL DEFAULT ""');
$addColumn('worker_certifications', 'status', "ENUM('active','expired','revoked','pending_verification') NOT NULL DEFAULT 'active'");
$addColumn('worker_certifications', 'evidence_path', 'VARCHAR(500) NOT NULL DEFAULT ""');
$addColumn('worker_certifications', 'verified_by', 'INT UNSIGNED NULL');
$addColumn('worker_certifications', 'verified_at', 'DATETIME NULL');
$addColumn('worker_certifications', 'notes', 'VARCHAR(500) NOT NULL DEFAULT ""');
$addIndex('worker_certifications', 'idx_wc_user_code', 'user_id, certification_code');
$addIndex('worker_certifications', 'idx_wc_contractor', 'contractor_worker_id');

/* ═══════════════════════════════════════════════════════════════════════════
 * 4) wf_skill_requirements — what a work context demands
 *
 * Scope vocabulary is derived from masters that already exist:
 *   asset_registry.id / .category / .criticality, repair_types.id,
 *   work_zones.id, departments.id, and the global catch-all.
 * asset_registry has no asset_type_id column, so asset grouping uses the
 * asset's own attributes rather than inventing a parallel asset-type master.
 * Text scopes (category, criticality) live in scope_text; numeric scopes in
 * scope_value.
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_skill_requirements', <<<'SQL'
CREATE TABLE wf_skill_requirements (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope_type     ENUM('global','asset','asset_category','asset_criticality','repair_type','work_zone','department') NOT NULL DEFAULT 'global',
  scope_value    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'asset/repair_type/work_zone/department id; 0 when unused',
  scope_text     VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'asset category or criticality code; empty when unused',
  skill_id       INT UNSIGNED NOT NULL,
  min_level      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  require_any_of TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = one qualified team member suffices, 0 = all members',
  is_mandatory   TINYINT(1) NOT NULL DEFAULT 1,
  notes          VARCHAR(500) NOT NULL DEFAULT "",
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_by     INT UNSIGNED,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wfr_scope (scope_type, scope_value, scope_text, skill_id),
  KEY idx_wfr_skill (skill_id, is_active),
  KEY idx_wfr_lookup (scope_type, is_active),
  CONSTRAINT fk_wfr_skill FOREIGN KEY (skill_id) REFERENCES wf_skills (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

// The scope vocabulary changed after the first draft; widen in place if an older
// copy of this table already exists anywhere.
$widenEnum('wf_skill_requirements', 'scope_type',
    ['global', 'asset', 'asset_category', 'asset_criticality', 'repair_type', 'work_zone', 'department'],
    'global');
$addColumn('wf_skill_requirements', 'scope_text', "VARCHAR(100) NOT NULL DEFAULT '' COMMENT 'asset category or criticality code; empty when unused'");

// The old unique key did not include scope_text, which would let two text scopes
// collide. Rebuild it when the live index is the narrower one.
$oldUk = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_skill_requirements'
                          AND INDEX_NAME = 'uk_wfr_scope' AND COLUMN_NAME = 'scope_text'");
$oldUk->execute();
if ((int)$oldUk->fetchColumn() === 0) {
    $pdo->exec('ALTER TABLE `wf_skill_requirements` DROP INDEX `uk_wfr_scope`');
    $pdo->exec('ALTER TABLE `wf_skill_requirements` ADD UNIQUE KEY `uk_wfr_scope` (scope_type, scope_value, scope_text, skill_id)');
    $log('~ rebuilt uk_wfr_scope to include scope_text');
    $changed++;
}
$addIndex('wf_skill_requirements', 'idx_wfr_lookup', 'scope_type, is_active');

/* ═══════════════════════════════════════════════════════════════════════════
 * 5) wf_authorizations — company permission to act (NOT a credential)
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_authorizations', <<<'SQL'
CREATE TABLE wf_authorizations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  code          VARCHAR(60) NOT NULL COMMENT 'e.g. HV_SWITCHING, WORK_AT_HEIGHT, LOTO_APPLY',
  name_th       VARCHAR(160) NOT NULL,
  name_en       VARCHAR(160) NOT NULL DEFAULT '',
  granted_by    INT UNSIGNED NULL,
  granted_at    DATE NULL,
  valid_until   DATE NULL,
  status        ENUM('active','expired','revoked','suspended') NOT NULL DEFAULT 'active',
  notes         VARCHAR(500) NOT NULL DEFAULT "",
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wfa_user_code (user_id, code),
  KEY idx_wfa_status (status, valid_until),
  CONSTRAINT fk_wfa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 6) wf_courses + wf_training_records — workforce training catalog
 *    document_training is NOT reused: its document_id is NOT NULL (document compliance).
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_courses', <<<'SQL'
CREATE TABLE wf_courses (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(40) NOT NULL,
  name_th       VARCHAR(200) NOT NULL,
  name_en       VARCHAR(200) NOT NULL DEFAULT '',
  description   TEXT,
  provider      VARCHAR(160) NOT NULL DEFAULT '',
  duration_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  pass_score    TINYINT UNSIGNED NOT NULL DEFAULT 80,
  validity_days INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = never expires',
  grants_skill_id INT UNSIGNED NULL COMMENT 'completing this course evidences this skill',
  grants_level  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_mandatory  TINYINT(1) NOT NULL DEFAULT 0,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wf_courses_code (code),
  KEY idx_wf_courses_active (is_active),
  CONSTRAINT fk_wfc_skill FOREIGN KEY (grants_skill_id) REFERENCES wf_skills (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

$createTable('wf_training_records', <<<'SQL'
CREATE TABLE wf_training_records (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  course_id     INT UNSIGNED NOT NULL,
  status        ENUM('planned','in_progress','passed','failed','expired','cancelled') NOT NULL DEFAULT 'planned',
  score         TINYINT UNSIGNED NULL,
  scheduled_date DATE NULL,
  completed_at  DATE NULL,
  expires_at    DATE NULL,
  evidence_path VARCHAR(500) NOT NULL DEFAULT "",
  instructor    VARCHAR(160) NOT NULL DEFAULT '',
  notes         VARCHAR(500) NOT NULL DEFAULT '',
  recorded_by   INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wtr_user_course (user_id, course_id),
  KEY idx_wtr_status (status, expires_at),
  KEY idx_wtr_user (user_id, status),
  CONSTRAINT fk_wtr_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_wtr_course FOREIGN KEY (course_id) REFERENCES wf_courses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 7) wf_crews + wf_crew_members — teams (planning groups, not work assignments)
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_crews', <<<'SQL'
CREATE TABLE wf_crews (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(40) NOT NULL,
  name_th       VARCHAR(160) NOT NULL,
  name_en       VARCHAR(160) NOT NULL DEFAULT '',
  department_id INT UNSIGNED NULL,
  lead_user_id  INT UNSIGNED NULL,
  default_shift_start TIME NOT NULL DEFAULT '08:00:00',
  default_shift_end   TIME NOT NULL DEFAULT '17:00:00',
  notes         VARCHAR(500) NOT NULL DEFAULT '',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wf_crews_code (code),
  KEY idx_wf_crews_dept (department_id, is_active),
  CONSTRAINT fk_wfc_dept FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL,
  CONSTRAINT fk_wfc_lead FOREIGN KEY (lead_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

$createTable('wf_crew_members', <<<'SQL'
CREATE TABLE wf_crew_members (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  crew_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  member_role ENUM('lead','member') NOT NULL DEFAULT 'member',
  joined_at   DATE NULL,
  left_at     DATE NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wcm_crew_user (crew_id, user_id),
  KEY idx_wcm_user (user_id, is_active),
  CONSTRAINT fk_wcm_crew FOREIGN KEY (crew_id) REFERENCES wf_crews (id) ON DELETE CASCADE,
  CONSTRAINT fk_wcm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 8) wf_shift_assignments — per-technician PLANNED shift.
 *    The global default remains planning_shift_start / planning_shift_hours.
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_shift_assignments', <<<'SQL'
CREATE TABLE wf_shift_assignments (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  shift_start  TIME NOT NULL DEFAULT '08:00:00',
  shift_end    TIME NOT NULL DEFAULT '17:00:00',
  break_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  work_days    VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5' COMMENT 'ISO dow list, comma separated',
  effective_from DATE NULL COMMENT 'NULL = always in effect',
  effective_to   DATE NULL,
  overtime_allowed TINYINT(1) NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_by   INT UNSIGNED,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wfsa_user (user_id, is_active),
  CONSTRAINT fk_wfsa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 9) wf_leave — planned unavailability (there is no attendance table anywhere)
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_leave', <<<'SQL'
CREATE TABLE wf_leave (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  leave_type  ENUM('annual','sick','unpaid','training','other') NOT NULL DEFAULT 'other',
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      VARCHAR(500) NOT NULL DEFAULT '',
  status      ENUM('planned','approved','rejected','cancelled') NOT NULL DEFAULT 'planned',
  created_by  INT UNSIGNED,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wfl_user_dates (user_id, start_date, end_date),
  KEY idx_wfl_status (status, start_date),
  CONSTRAINT fk_wfl_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 10) wf_capacity_snapshots — dated capacity history for trend reporting
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_capacity_snapshots', <<<'SQL'
CREATE TABLE wf_capacity_snapshots (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  snapshot_date     DATE NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  capacity_minutes  INT UNSIGNED NOT NULL DEFAULT 0,
  planned_minutes   INT UNSIGNED NOT NULL DEFAULT 0,
  actual_minutes    INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'from repair.actual_start_at/completed_at only',
  active_jobs       INT UNSIGNED NOT NULL DEFAULT 0,
  utilization_pct   SMALLINT NOT NULL DEFAULT 0,
  has_shift_data    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 = capacity fell back to global planning_* settings',
  computed_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wfcs_date_user (snapshot_date, user_id),
  KEY idx_wfcs_date (snapshot_date),
  CONSTRAINT fk_wfcs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 11) wf_qualification_evidence — append-only decision trail
 * ═══════════════════════════════════════════════════════════════════════════ */
$createTable('wf_qualification_evidence', <<<'SQL'
CREATE TABLE wf_qualification_evidence (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_type ENUM('user','contractor_worker') NOT NULL DEFAULT 'user',
  subject_id   INT UNSIGNED NOT NULL,
  kind         ENUM('skill','certification','training','authorization','shift','leave') NOT NULL,
  ref_table    VARCHAR(60) NOT NULL DEFAULT '',
  ref_id       INT UNSIGNED NULL,
  result       ENUM('pass','fail','expired','revoked','info') NOT NULL DEFAULT 'info',
  detail       VARCHAR(500) NOT NULL DEFAULT '',
  evidence_by  INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wfqe_subject (subject_type, subject_id, kind),
  KEY idx_wfqe_ref (ref_table, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/* ═══════════════════════════════════════════════════════════════════════════
 * 12) settings group workforce
 * ═══════════════════════════════════════════════════════════════════════════ */
$settings = [
    ['workforce_auto_assign', '0', '0 = ระบบเสนอผู้สมัครพร้อมเหตุผลเท่านั้น ไม่มอบหมายให้อัตโนมัติ (ห้าม auto-assign)'],
    ['workforce_block_unqualified', '1', '1 = บล็อกการมอบหมายคนที่ไม่ผ่านคุณสมบัติจริง (ค่าเริ่มต้นปลอดภัย), 0 = บันทึก gap เป็นคำเตือนแล้วอนุญาต'],
    ['workforce_require_reason', '1', 'บังคับใส่เหตุผลทุกครั้งที่แก้ทักษะ/ใบรับรอง/สิทธิ์'],
    ['workforce_expiry_warning_days', '30', 'เตือนใบรับรองใกล้หมดอายุล่วงหน้ากี่วัน'],
    ['workforce_capacity_warn_pct', '85', 'ค่ายอด % ที่เริ่มเตือนว่าช่างทำงานหนัก'],
    ['workforce_capacity_over_pct', '100', 'ค่ายอด % ที่ถือว่าเกิน capacity'],
    ['workforce_overtime_requires_reason', '1', 'งานนอกเวลาต้องมีเหตุผล'],
    ['workforce_skill_levels', '[{"key":1,"label":"มีความรู้"},{"key":2,"label":"ทำได้ภายใต้การดูแล"},{"key":3,"label":"ทำได้ด้วยตัวเอง"},{"key":4,"label":"ชำนาญ"},{"key":5,"label":"ผู้เชี่ยวชาญ"}]', 'ระดับทักษะ 1-5'],
    ['workforce_lead_in_trend_days', '5', 'ระยะเวลาเตือนใบรับรองหมดอายุล่วงหน้า'],
];
foreach ($settings as [$k, $v, $desc]) {
    $exists = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $exists->execute([$k]);
    if ((int)$exists->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "workforce", ?)')
            ->execute([$k, $v, $desc]);
        $log("+ settings.$k");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

/*
 * Safety reconciliation. Phase 34 was never released, so any existing
 * workforce_block_unqualified = '0' row comes from the old permissive seed, not
 * from an administrator's deliberate choice. Promote it to the safe default once.
 */
$st = $pdo->prepare("UPDATE settings SET setting_value = '1', description = ?
                    WHERE setting_key = 'workforce_block_unqualified' AND setting_value = '0'");
$st->execute(['1 = บล็อกการมอบหมายคนที่ไม่ผ่านคุณสมบัติจริง (ค่าเริ่มต้นปลอดภัย), 0 = บันทึก gap เป็นคำเตือนแล้วอนุญาต']);
if ($st->rowCount() > 0) {
    $log('~ settings.workforce_block_unqualified promoted to the safe default (1)');
    $changed++;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 13) notification_templates module workforce
 * ═══════════════════════════════════════════════════════════════════════════ */
$ntpls = [
    ['workforce', 'certification_expiring', 'ใบรับรองใกล้หมดอายุ: {full_name}', "{certification_name} ของ {full_name} หมดอายุ {expiry_date}\nยังเหลืออีก {days_left} วัน", 'high', '/workforce/certifications?user_id={user_id}'],
    ['workforce', 'certification_expired', 'ใบรับรองหมดอายุ: {full_name}', "{certification_name} ของ {full_name} หมดอายุแล้ว ({expiry_date})\nงานที่ต้องใช้ทักษะนี้จะรายงาน CERTIFICATION_EXPIRED", 'critical', '/workforce/certifications?user_id={user_id}'],
    ['workforce', 'training_due', 'ถึงกำหนดอบรม: {full_name}', "หลักสูตร {course_name} ของ {full_name} ถึงกำหนด {due_date}", 'medium', '/workforce/training?user_id={user_id}'],
    ['workforce', 'shift_assigned', 'กำหนดกะแล้ว: {full_name}', "กะ {shift_start} - {shift_end} (วันทำงาน {work_days})\nมีผลตั้งแต่ {effective_from}", 'info', '/workforce/shifts?user_id={user_id}'],
    ['workforce', 'capacity_warning', 'ช่างทำงานหนัก: {full_name}', "ใช้ capacity {utilization_pct}% ในสัปดาห์ {week_start}\nงานที่ยังค้าง {active_jobs} งาน", 'medium', '/workforce/capacity?user_id={user_id}'],
    ['workforce', 'skill_assigned', 'บันทึกทักษะแล้ว: {skill_name}', "{full_name} — ระดับ {level_label}\nผู้บันทึก: {recorded_by}", 'info', '/workforce/skills?user_id={user_id}'],
    ['workforce', 'crew_created', 'สร้างทีมงานแล้ว: {crew_name}', "ทีม {crew_name} มีสมาชิก {member_count} คน\nหัวหน้าทีม: {lead_name}", 'info', '/workforce/crews?crew_id={crew_id}'],
    ['workforce', 'assignment_conflict', 'มอบหมายชนข้อกำหนด: {work_order_no}', "ไม่สามารถมอบหมาย {full_name} ได้\nเหตุผล: {reasons}\nยังไม่ได้บันทึกการมอบหมายใด ๆ", 'high', '/workforce/conflicts?work_order_id={work_order_id}'],
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

/* ═══════════════════════════════════════════════════════════════════════════
 * 14) menu_permissions
 * ═══════════════════════════════════════════════════════════════════════════ */
/*
 * Menu keys must mirror the action matrix in src/helpers/permissions.php, otherwise
 * a role can pass the API permission check but never see the module in the UI.
 * Role 3 (Operate) holds workforce view + capacity_view, so it needs the read-only
 * keys; roles 4 and above-locked roles get none.
 */
$menuMap = [
    // Role 5 (Viewer) holds workforce.view, so it can load the overview page. The root
    // key MUST be granted to it as well, otherwise the page is reachable by URL but has
    // no sidebar entry - the menu/API parity bug this comment warns about.
    'workforce'            => [1, 2, 3, 5, 6, 7],
    'workforce/technicians' => [1, 2, 3, 6, 7, 5],
    'workforce/skills'      => [1, 2, 3, 6, 7, 5],
    'workforce/certifications' => [1, 2, 3, 6, 7, 5],
    'workforce/training'    => [1, 2, 3, 6, 7, 5],
    'workforce/crews'       => [1, 2, 6, 7],
    'workforce/shifts'      => [1, 2, 6, 7],
    'workforce/capacity'    => [1, 2, 3, 6, 7, 5],
    'workforce/workload'    => [1, 2, 3, 6, 7, 5],
    'workforce/conflicts'   => [1, 2, 6, 7],
    // workforce.reports is NOT granted to role 5: action=report requires the
    // `analytics` capability, which role 5 does not hold. Seeding the menu key for a
    // role that cannot call the API would only produce a dead menu entry.
    'workforce/reports'     => [1, 2, 3, 6, 7],
];
foreach ($menuMap as $key => $roles) {
    foreach ($roles as $rid) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE menu_key = ? AND role_id = ?');
        $st->execute([$key, $rid]);
        if ((int)$st->fetchColumn() === 0) {
            $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')->execute([$rid, $key]);
            $log("+ menu_permissions: $key role=$rid");
            $changed++;
        } else {
            $log("~ menu_permissions: $key role=$rid (existed)");
        }
    }
}

// Reconcile: the map above is authoritative. Insert-only seeding would leave a grant
// behind forever whenever a role is later removed from a key (e.g. role 5 losing
// workforce/reports once it was found to lack the `analytics` capability), which would
// quietly resurrect a dead menu entry on every later run. Only rows this migration
// owns (menu_key LIKE 'workforce%') are touched; other modules are left alone.
$allowed = [];
foreach ($menuMap as $key => $roles) foreach ($roles as $rid) $allowed[(string)$rid . '|' . $key] = true;

$granted = $pdo->query("SELECT role_id, menu_key FROM menu_permissions
                        WHERE menu_key LIKE 'workforce%' AND is_granted = 1")->fetchAll(PDO::FETCH_ASSOC);
foreach ($granted as $row) {
    $k = (string)$row['role_id'] . '|' . (string)$row['menu_key'];
    if (isset($allowed[$k])) continue;
    $pdo->prepare('DELETE FROM menu_permissions WHERE role_id = ? AND menu_key = ?')
        ->execute([(int)$row['role_id'], (string)$row['menu_key']]);
    $log("- menu_permissions: {$row['menu_key']} role={$row['role_id']} (revoked, not in map)");
    $changed++;
}

$log(PHP_EOL . "Phase 34 migration done. changed=$changed");
