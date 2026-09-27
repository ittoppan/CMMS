<?php
/**
 * scripts/apply_phase32_engineering_change.php — idempotent DB migration (Phase 32)
 *
 * Engineering Change Management & Maintenance Standard Management:
 *   1) controlled_documents      — controlled document master (doc_no, type, owner, lifecycle)
 *   2) document_revisions        — IMMUTABLE revisions (approved history is never overwritten)
 *   3) document_approvals        — configurable sequential approval chain per revision
 *   4) document_impacts          — impact assessment per revision (impact areas)
 *   5) document_acknowledgements — revision-scoped read acknowledgement (per user)
 *   6) document_training         — training requirement attached to a revision
 *   7) document_training_results — per-user training outcome (NOT auto-completed)
 *   8) document_links            — traceability to asset/PM/WO/RCA/BOM/spare/ECR
 *   9) document_activity         — append-only timeline + audit of every action
 *  10) engineering_changes       — ECR master (state machine, one-way transitions)
 *  11) engineering_change_impacts— impact assessment per ECR (per impact area)
 *  12) engineering_change_approvals — ECR approval chain (mirrors permit_approvals shape)
 *  13) engineering_change_links  — ECR traceability to entity + released revision
 *  14) engineering_change_verifications — implementation verification (PASS/FAIL/PARTIAL)
 *  15) engineering_change_activity — append-only ECR timeline
 *  16) settings group engineering_change + notification_templates modules
 *  17) menu_permissions: engineering_change/overview + document_control/overview
 *
 * DESIGN RULES enforced by schema + engine (not just UI):
 *   - document_revisions is append-only; a revision row is never UPDATEd after it
 *     leaves DRAFT except for controlled status/timestamp columns.
 *   - only one EFFECTIVE revision per document, enforced in the schema by the
 *     virtual column effective_guard + UNIQUE uk_dr_effective (NULLs are not
 *     compared by MySQL, so any number of non-effective revisions coexist).
 *   - no FK from controlled_documents into PM/BOM/Sage/RCA: Phase 32 never mutates
 *     master data. Links are explicit, optional, and auditable.
 *   - legacy `manuals` is NOT migrated or altered; adoption is opt-in per row via
 *     source_manual_id so user-guide manuals stay in the legacy /manuals module.
 *
 * NOTE: DDL COMMENTs are ASCII-only because MySQL may reject multi-byte COMMENT
 * strings on some connections; Thai copy lives in PHP data seeds (parameterized
 * INSERTs) and in docs/*.md.
 *
 * Run: php scripts/apply_phase32_engineering_change.php (idempotent)
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

$indexHasColumn = function (string $table, string $index, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $index, $column]);
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

$addIndex = function (string $table, string $name, string $cols) use ($pdo, $hasIndex, $log, &$changed): void {
    if (!$hasIndex($table, $name)) {
        $pdo->exec("ALTER TABLE `$table` ADD KEY `$name` ($cols)");
        $log("+ $table.$name");
        $changed++;
    } else {
        $log("~ $table.$name (existed)");
    }
};

// ---------- 1) controlled_documents ----------
$createTable('controlled_documents', "CREATE TABLE `controlled_documents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `doc_no` VARCHAR(60) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `doc_type` ENUM('drawing','manual','sop','work_instruction','maintenance_standard','checklist','specification','engineering_standard','other') NOT NULL DEFAULT 'other',
  `description` TEXT NULL,
  `owner_id` INT UNSIGNED NULL COMMENT 'document owner user_id',
  `department_id` INT UNSIGNED NULL,
  `asset_id` INT UNSIGNED NULL COMMENT 'optional primary asset (reference only, never modified)',
  `status` ENUM('draft','active','superseded_partially','obsolete','archived') NOT NULL DEFAULT 'draft',
  `current_effective_revision_id` INT UNSIGNED NULL COMMENT 'the single EFFECTIVE revision',
  `confidentiality` ENUM('internal','restricted','confidential') NOT NULL DEFAULT 'internal',
  `requires_acknowledgement` TINYINT(1) NOT NULL DEFAULT 0,
  `requires_training` TINYINT(1) NOT NULL DEFAULT 0,
  `review_cycle_days` INT UNSIGNED NULL,
  `next_review_date` DATE NULL,
  `superseded_on` DATE NULL,
  `obsolete_on` DATE NULL,
  `obsolete_reason` VARCHAR(500) NULL,
  `source_manual_id` INT UNSIGNED NULL COMMENT 'opt-in adoption of one legacy manuals row',
  `qr_token` VARCHAR(32) NULL COMMENT 'opaque QR token CMMS-D-<token>',
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cd_doc_no` (`doc_no`),
  UNIQUE KEY `uk_cd_qr_token` (`qr_token`),
  UNIQUE KEY `uk_cd_source_manual` (`source_manual_id`),
  KEY `idx_cd_status` (`status`),
  KEY `idx_cd_type` (`doc_type`),
  KEY `idx_cd_owner` (`owner_id`),
  KEY `idx_cd_department` (`department_id`),
  KEY `idx_cd_asset` (`asset_id`),
  KEY `idx_cd_review` (`next_review_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='controlled document master (Phase 32)'");

// legacy bridge column only if manuals already exists (additive, no data movement)
if ($hasTable('manuals')) {
    $addColumn('controlled_documents', 'source_manual_id', "INT UNSIGNED NULL COMMENT 'opt-in adoption of one legacy manuals row'");
}

// ---------- 2) document_revisions ----------
$createTable('document_revisions', "CREATE TABLE `document_revisions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id` INT UNSIGNED NOT NULL,
  `revision_no` VARCHAR(30) NOT NULL COMMENT 'semantic: 1.0 / 1.1 / 2.0',
  `revision_major` INT UNSIGNED NOT NULL DEFAULT 1,
  `revision_minor` INT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('draft','under_review','pending_approval','approved','effective','superseded','obsolete','rejected') NOT NULL DEFAULT 'draft',
  `effective_guard` INT UNSIGNED GENERATED ALWAYS AS (IF(`status` = 'effective', `document_id`, NULL)) VIRTUAL COMMENT 'unique guard: enforces AT MOST ONE effective revision per document (NULL rows are not compared by MySQL unique indexes)',
  `title` VARCHAR(255) NULL COMMENT 'revision title override',
  `change_summary` TEXT NULL,
  `change_reason` VARCHAR(500) NULL,
  `file_path` VARCHAR(500) NULL,
  `file_name` VARCHAR(255) NULL,
  `file_type` VARCHAR(120) NULL,
  `file_size` BIGINT UNSIGNED NULL,
  `content_hash` VARCHAR(64) NULL COMMENT 'sha256 of file content (integrity)',
  `effective_date` DATE NULL,
  `next_review_date` DATE NULL,
  `submitted_at` DATETIME NULL,
  `submitted_by` INT UNSIGNED NULL,
  `approved_at` DATETIME NULL,
  `approved_by` INT UNSIGNED NULL,
  `effective_at` DATETIME NULL,
  `effective_by` INT UNSIGNED NULL,
  `superseded_at` DATETIME NULL,
  `superseded_by_revision_id` INT UNSIGNED NULL,
  `obsolete_at` DATETIME NULL,
  `obsolete_reason` VARCHAR(500) NULL,
  `rejected_at` DATETIME NULL,
  `reject_reason` VARCHAR(500) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dr_doc_rev` (`document_id`,`revision_no`),
  UNIQUE KEY `uk_dr_effective` (`effective_guard`),
  KEY `idx_dr_status` (`status`),
  KEY `idx_dr_doc` (`document_id`,`created_at`),
  KEY `idx_dr_effective_date` (`effective_date`),
  KEY `idx_dr_review` (`next_review_date`),
  KEY `idx_dr_approved_by` (`approved_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='immutable document revisions (approved history never overwritten)'");

// ---------- 3) document_approvals ----------
$createTable('document_approvals', "CREATE TABLE `document_approvals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision_id` INT UNSIGNED NOT NULL,
  `step` TINYINT UNSIGNED NOT NULL,
  `step_key` VARCHAR(40) NOT NULL COMMENT 'author_review|technical_review|approver|final_approval',
  `approver_user_id` INT UNSIGNED NULL,
  `approver_role_id` INT UNSIGNED NULL,
  `decision` ENUM('pending','approved','rejected','skipped') NOT NULL DEFAULT 'pending',
  `comment` VARCHAR(1000) NULL,
  `decided_at` DATETIME NULL,
  `decided_by` INT UNSIGNED NULL,
  `due_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_da_rev_step` (`revision_id`,`step`),
  KEY `idx_da_pending` (`decision`,`approver_user_id`),
  KEY `idx_da_step_key` (`step_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='document revision approval chain (sequential, per revision)'");

// ---------- 4) document_impacts ----------
$createTable('document_impacts', "CREATE TABLE `document_impacts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision_id` INT UNSIGNED NOT NULL,
  `impact_area` ENUM('safety','quality','production','maintenance','cost','document','training','spare_parts','layout','utilities','other') NOT NULL DEFAULT 'other',
  `severity` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `description` VARCHAR(1000) NOT NULL,
  `required_action` VARCHAR(1000) NULL,
  `owner_id` INT UNSIGNED NULL,
  `due_date` DATE NULL,
  `status` ENUM('open','in_progress','completed','not_applicable') NOT NULL DEFAULT 'open',
  `completed_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_di_revision` (`revision_id`,`status`),
  KEY `idx_di_area` (`impact_area`),
  KEY `idx_di_severity` (`severity`),
  KEY `idx_di_owner` (`owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='impact assessment per document revision'");

// ---------- 5) document_acknowledgements ----------
$createTable('document_acknowledgements', "CREATE TABLE `document_acknowledgements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id` INT UNSIGNED NOT NULL,
  `revision_id` INT UNSIGNED NOT NULL COMMENT 'acknowledgement is revision-scoped',
  `user_id` INT UNSIGNED NOT NULL,
  `status` ENUM('pending','acknowledged','exception') NOT NULL DEFAULT 'pending',
  `method` ENUM('read','quiz','signature','training','system') NOT NULL DEFAULT 'read',
  `based_on_revision_id` INT UNSIGNED NULL COMMENT 'revision read at the time (offline replay guard)',
  `notes` VARCHAR(500) NULL,
  `due_at` DATETIME NULL,
  `assigned_by` INT UNSIGNED NULL,
  `acknowledged_at` DATETIME NULL,
  `exception_reason` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dack_user_rev` (`revision_id`,`user_id`),
  KEY `idx_dack_doc` (`document_id`,`status`),
  KEY `idx_dack_user` (`user_id`,`status`),
  KEY `idx_dack_due` (`due_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='revision-scoped read acknowledgement (never auto-completed)'");

// ---------- 6) document_training ----------
$createTable('document_training', "CREATE TABLE `document_training` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id` INT UNSIGNED NOT NULL,
  `revision_id` INT UNSIGNED NOT NULL,
  `course_code` VARCHAR(60) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `pass_score` TINYINT UNSIGNED NULL,
  `due_days` INT UNSIGNED NOT NULL DEFAULT 30,
  `validity_days` INT UNSIGNED NULL COMMENT 're-training interval',
  `is_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dt_rev_course` (`revision_id`,`course_code`),
  KEY `idx_dt_doc` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='training requirement attached to a revision'");

// ---------- 7) document_training_results ----------
$createTable('document_training_results', "CREATE TABLE `document_training_results` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `training_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `status` ENUM('pending','in_progress','passed','failed','expired','not_required') NOT NULL DEFAULT 'pending',
  `score` TINYINT UNSIGNED NULL,
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `completed_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `recorded_by` INT UNSIGNED NULL,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dtr_user` (`training_id`,`user_id`),
  KEY `idx_dtr_user` (`user_id`,`status`),
  KEY `idx_dtr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='per-user training outcome (only recorded by an explicit action)'");

// ---------- 8) document_links ----------
$createTable('document_links', "CREATE TABLE `document_links` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id` INT UNSIGNED NOT NULL,
  `revision_id` INT UNSIGNED NULL COMMENT 'null = applies to the whole document',
  `entity_type` ENUM('asset','pm','work_order','rca','bom','spare_part','engineering_change','failure_event','manual') NOT NULL,
  `entity_id` INT UNSIGNED NOT NULL,
  `link_type` ENUM('governs','supersedes','implements','affects','evidenced_by','reference') NOT NULL DEFAULT 'reference',
  `note` VARCHAR(500) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revision_guard` INT UNSIGNED AS (COALESCE(`revision_id`,0)) VIRTUAL COMMENT 'MySQL unique index ignores NULL -> coalesce so document-wide links cannot duplicate',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dl_link` (`document_id`,`revision_guard`,`entity_type`,`entity_id`,`link_type`),
  KEY `idx_dl_entity` (`entity_type`,`entity_id`),
  KEY `idx_dl_doc` (`document_id`),
  KEY `idx_dl_rev` (`revision_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='document traceability links (no master data is ever modified)'");

// ---------- 8b) repair uk_dl_link on an already-migrated DB ----------
// revision_id NULL ไม่ถูกนับซ้ำใน UNIQUE index ของ MySQL -> link ระดับทั้งเอกสารจะซ้ำได้
if ($hasIndex('document_links', 'uk_dl_link') && !$indexHasColumn('document_links', 'uk_dl_link', 'revision_guard')) {
    $hasRevGuard = $hasColumn('document_links', 'revision_guard');
    if (!$hasRevGuard) {
        // ลบข้อมูลซ้ำก่อน (เก็บ id ต่ำสุดไว้) เพื่อไม่ให้สร้าง index ไม่ได้
        $pdo->exec("DELETE l1 FROM `document_links` l1
                    JOIN `document_links` l2
                      ON l2.document_id = l1.document_id
                     AND COALESCE(l2.revision_id, 0) = COALESCE(l1.revision_id, 0)
                     AND l2.entity_type = l1.entity_type
                     AND l2.entity_id = l1.entity_id
                     AND l2.link_type = l1.link_type
                     AND l2.id < l1.id");
        $pdo->exec("ALTER TABLE `document_links`
            ADD COLUMN `revision_guard` INT UNSIGNED AS (COALESCE(`revision_id`,0)) VIRTUAL
            COMMENT 'MySQL unique index ignores NULL -> coalesce so document-wide links cannot duplicate'");
        $log('ALTER document_links ADD COLUMN revision_guard'); $changed++;
    }
    $pdo->exec("ALTER TABLE `document_links`
        ADD UNIQUE KEY `uk_dl_link_v2` (`document_id`,`revision_guard`,`entity_type`,`entity_id`,`link_type`)");
    $pdo->exec("ALTER TABLE `document_links` DROP INDEX `uk_dl_link`");
    $pdo->exec("ALTER TABLE `document_links` RENAME INDEX `uk_dl_link_v2` TO `uk_dl_link`");
    $log('ALTER document_links replace uk_dl_link with revision_guard based unique key'); $changed++;
}

// ---------- 9) document_activity ----------
$createTable('document_activity', "CREATE TABLE `document_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id` INT UNSIGNED NULL,
  `revision_id` INT UNSIGNED NULL,
  `action` VARCHAR(60) NOT NULL,
  `description` VARCHAR(1000) NULL,
  `old_status` VARCHAR(40) NULL,
  `new_status` VARCHAR(40) NULL,
  `performed_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dact_doc` (`document_id`,`created_at`),
  KEY `idx_dact_rev` (`revision_id`,`created_at`),
  KEY `idx_dact_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='document timeline + audit (append-only)'");

// ---------- 10) engineering_changes ----------
$createTable('engineering_changes', "CREATE TABLE `engineering_changes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ecr_no` VARCHAR(60) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `change_type` ENUM('design_change','process_change','standard_change','spare_part_change','layout_change','utilities_change','software_change','other') NOT NULL DEFAULT 'other',
  `description` TEXT NULL,
  `reason` TEXT NULL,
  `priority` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status` ENUM('draft','submitted','under_review','impact_assessment','pending_approval','approved','rejected','implementation','verification','completed','cancelled') NOT NULL DEFAULT 'draft',
  `requested_by` INT UNSIGNED NULL,
  `department_id` INT UNSIGNED NULL,
  `asset_id` INT UNSIGNED NULL,
  `requested_date` DATE NULL,
  `required_by_date` DATE NULL,
  `submitted_at` DATETIME NULL,
  `review_started_at` DATETIME NULL,
  `approved_at` DATETIME NULL,
  `approved_by` INT UNSIGNED NULL,
  `rejected_at` DATETIME NULL,
  `reject_reason` VARCHAR(1000) NULL,
  `implementation_started_at` DATETIME NULL,
  `planned_completion_date` DATE NULL,
  `implemented_at` DATETIME NULL,
  `verification_result` ENUM('pass','fail','partial') NULL,
  `verified_at` DATETIME NULL,
  `verified_by` INT UNSIGNED NULL,
  `closed_at` DATETIME NULL,
  `closed_by` INT UNSIGNED NULL,
  `close_summary` TEXT NULL,
  `cancelled_at` DATETIME NULL,
  `cancel_reason` VARCHAR(1000) NULL,
  `ecr_year` SMALLINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ecr_no` (`ecr_no`),
  KEY `idx_ecr_status` (`status`),
  KEY `idx_ecr_type` (`change_type`),
  KEY `idx_ecr_asset` (`asset_id`),
  KEY `idx_ecr_requester` (`requested_by`),
  KEY `idx_ecr_priority` (`priority`),
  KEY `idx_ecr_required_by` (`required_by_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='engineering change request master (Phase 32)'");

// ---------- 11) engineering_change_impacts ----------
$createTable('engineering_change_impacts', "CREATE TABLE `engineering_change_impacts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ecr_id` INT UNSIGNED NOT NULL,
  `impact_area` ENUM('safety','quality','production','maintenance','cost','document','training','spare_parts','layout','utilities','other') NOT NULL DEFAULT 'other',
  `severity` ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `description` VARCHAR(1000) NOT NULL,
  `target_type` ENUM('asset','pm','work_order','rca','bom','spare_part','document','department','none') NOT NULL DEFAULT 'none',
  `target_id` INT UNSIGNED NULL,
  `required_action` VARCHAR(1000) NULL,
  `action_taken` VARCHAR(1000) NULL COMMENT 'what was really done (never assumed)',
  `owner_id` INT UNSIGNED NULL,
  `due_date` DATE NULL,
  `status` ENUM('open','in_progress','completed','not_applicable') NOT NULL DEFAULT 'open',
  `completed_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eci_ecr` (`ecr_id`,`status`),
  KEY `idx_eci_area` (`impact_area`),
  KEY `idx_eci_severity` (`severity`),
  KEY `idx_eci_target` (`target_type`,`target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR impact assessment per area and target'");

// ---------- 12) engineering_change_approvals ----------
$createTable('engineering_change_approvals', "CREATE TABLE `engineering_change_approvals` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ecr_id` INT UNSIGNED NOT NULL,
  `step` TINYINT UNSIGNED NOT NULL,
  `step_key` VARCHAR(40) NOT NULL COMMENT 'technical_review|engineering_approval|management_approval',
  `approver_user_id` INT UNSIGNED NULL,
  `approver_role_id` INT UNSIGNED NULL,
  `decision` ENUM('pending','approved','rejected','skipped') NOT NULL DEFAULT 'pending',
  `comment` VARCHAR(1000) NULL,
  `decided_at` DATETIME NULL,
  `decided_by` INT UNSIGNED NULL,
  `due_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_eca_ecr_step` (`ecr_id`,`step`),
  KEY `idx_eca_pending` (`decision`,`approver_user_id`),
  KEY `idx_eca_step_key` (`step_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR approval chain (sequential, one decision per step)'");

// ---------- 13) engineering_change_links ----------
$createTable('engineering_change_links', "CREATE TABLE `engineering_change_links` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ecr_id` INT UNSIGNED NOT NULL,
  `link_type` ENUM('asset','pm','work_order','rca','bom','spare_part','document','revision','failure_event','department') NOT NULL,
  `entity_id` INT UNSIGNED NOT NULL,
  `action_required` VARCHAR(500) NULL COMMENT 'what this ECR requires of the target',
  `action_status` ENUM('not_started','in_progress','done','not_applicable') NOT NULL DEFAULT 'not_started',
  `action_done_at` DATETIME NULL,
  `note` VARCHAR(500) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ecl_link` (`ecr_id`,`link_type`,`entity_id`),
  KEY `idx_ecl_entity` (`link_type`,`entity_id`),
  KEY `idx_ecl_status` (`action_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR traceability + required actions (master data never modified)'");

// ---------- 14) engineering_change_verifications ----------
$createTable('engineering_change_verifications', "CREATE TABLE `engineering_change_verifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ecr_id` INT UNSIGNED NOT NULL,
  `round` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `result` ENUM('pass','fail','partial') NOT NULL,
  `verification_method` ENUM('functional_test','inspection','document_review','trial_run','measurement','other') NOT NULL DEFAULT 'inspection',
  `notes` TEXT NULL,
  `failure_reason` VARCHAR(1000) NULL,
  `follow_up_required` TINYINT(1) NOT NULL DEFAULT 0,
  `verified_by` INT UNSIGNED NULL,
  `verified_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ecv_round` (`ecr_id`,`round`),
  KEY `idx_ecv_result` (`result`),
  KEY `idx_ecv_verified_by` (`verified_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='implementation verification rounds (fail keeps the ECR visible)'");

// ---------- 15) engineering_change_activity ----------
$createTable('engineering_change_activity', "CREATE TABLE `engineering_change_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ecr_id` INT UNSIGNED NOT NULL,
  `action` VARCHAR(60) NOT NULL,
  `description` VARCHAR(1000) NULL,
  `old_status` VARCHAR(40) NULL,
  `new_status` VARCHAR(40) NULL,
  `performed_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ecact_ecr` (`ecr_id`,`created_at`),
  KEY `idx_ecact_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ECR timeline + audit (append-only)'");

// ---------- 16) settings: engineering_change + document_control ----------
$ecSettings = [
    // ── document types ──
    'document_types' => ['[{"key":"drawing","label":"แบบ Drawing/แบบแปลน","requires_approval":true},{"key":"manual","label":"คู่มือการใช้งานเครื่องจักร","requires_approval":true},{"key":"sop","label":"SOP ขั้นตอนการทำงาน","requires_approval":true},{"key":"work_instruction","label":"วิธีทำงาน (Work Instruction)","requires_approval":true},{"key":"maintenance_standard","label":"มาตรฐานการบำรุงรักษา","requires_approval":true},{"key":"checklist","label":"Checklist ตรวจสอบ","requires_approval":true},{"key":"specification","label":"สเปก/ข้อกำหนดทางเทคนิค","requires_approval":true},{"key":"engineering_standard","label":"มาตรฐานวิศวกรรม","requires_approval":true},{"key":"other","label":"เอกสารอื่น ๆ","requires_approval":false}]', 'ประเภทเอกสารควบคุม (doc_type)'],
    // ── impact areas ──
    'impact_areas' => ['[{"key":"safety","label":"ความปลอดภัย","weight":3},{"key":"quality","label":"คุณภาพ","weight":3},{"key":"production","label":"การผลิต","weight":3},{"key":"maintenance","label":"การบำรุงรักษา","weight":2},{"key":"cost","label":"ต้นทุน","weight":2},{"key":"document","label":"เอกสาร/มาตรฐาน","weight":2},{"key":"training","label":"การฝึกอบรม","weight":2},{"key":"spare_parts","label":"อะไหล่/เครื่องมือ","weight":2},{"key":"layout","label":"ผังพื้นที่/ตำแหน่งเครื่อง","weight":1},{"key":"utilities","label":"ระบบสาธารณูปโภค (ไฟ/น้ำ/อากาศ)","weight":2},{"key":"other","label":"อื่น ๆ","weight":1}]', 'ด้านที่ได้รับผลกระทบ (impact_area) พร้อมน้ำหนัก'],
    // ── revision status labels ──
    'document_revision_status_labels' => ['{"draft":"ร่าง","under_review":"อยู่ระหว่างตรวจทาน","pending_approval":"รออนุมัติ","approved":"อนุมัติแล้ว (ยังไม่มีผล)","effective":"มีผลบังคับใช้","superseded":"ถูกแทนที่","obsolete":"เลิกใช้","rejected":"ไม่ผ่าน"}', 'ป้ายสถานะ revision (UI)'],
    'document_status_labels' => ['{"draft":"ร่าง","active":"ใช้งาน","superseded_partially":"บางส่วนถูกแทนที่","obsolete":"เลิกใช้","archived":"เก็บถาวร"}', 'ป้ายสถานะเอกสาร (UI)'],
    'document_confidentiality_labels' => ['{"internal":"ภายใน","restricted":"จำกัดการเข้าถึง","confidential":"ลับมาก"}', 'ป้ายระดับการเข้าถึง'],
    // ── approval chain ──
    'document_approval_chain' => ['[{"step":1,"key":"author_review","label":"ผู้จัดทำตรวจทาน","module":"document","action":"revise","due_days":2},{"step":2,"key":"technical_review","label":"ผู้ตรวจทานด้านเทคนิค","module":"document","action":"review","due_days":3},{"step":3,"key":"approver","label":"ผู้อนุมัติเอกสาร","module":"document","action":"approve","due_days":5},{"step":4,"key":"final_approval","label":"ผู้อนุมัติขั้นสุดท้าย","module":"document","action":"publish","due_days":3}]', 'ลำดับขั้นอนุมัติเอกสาร (configurable)'],
    'ecr_approval_chain' => ['[{"step":1,"key":"technical_review","label":"ผู้ตรวจทานด้านเทคนิค","module":"engineering_change","action":"review","due_days":3},{"step":2,"key":"engineering_approval","label":"หัวหน้าฝ่ายวิศวกรรม","module":"engineering_change","action":"approve","due_days":5},{"step":3,"key":"management_approval","label":"ผู้บริหาร","module":"engineering_change","action":"approve","due_days":5}]', 'ลำดับขั้นอนุมัติ ECR (configurable)'],
    'document_approval_roles' => ['{"author_review":[1,2,6,7],"technical_review":[1,2,6,7],"approver":[1,2,6],"final_approval":[1,2]}', 'role ที่อนุมัติแต่ละขั้น'],
    'ecr_approval_roles' => ['{"technical_review":[1,2,6,7],"engineering_approval":[1,2,6],"management_approval":[1,2]}', 'role ที่อนุมัติ ECR แต่ละขั้น'],
    // ── effective date rules ──
    'document_effective_date_rules' => ['{"mode":"configurable","default_offset_days":0,"allow_backdate":false,"allow_future":true,"max_future_days":365,"note":"effective_date ต้อง >= approved_at และอยู่ในช่วงที่อนุญาต"}', 'กฎการกำหนดวันที่มีผล'],
    // ── review cycle ──
    'document_review_cycle_days' => ['{"drawing":365,"manual":365,"sop":730,"work_instruction":730,"maintenance_standard":730,"checklist":365,"specification":730,"engineering_standard":1095,"other":365}', 'รอบทบทวนเอกสารแต่ละประเภท (วัน)'],
    'document_review_due_days' => ['30', 'เตือนล่วงหน้ากี่วันก่อนครบกำหนดทบทวน'],
    // ── acknowledgement / training ──
    'document_ack_methods' => ['[{"key":"read","label":"อ่านแล้วรับทราบ"},{"key":"quiz","label":"ทดสอบความเข้าใจ (แบบสอบถาม)"},{"key":"signature","label":"ลงนามรับรอง"},{"key":"training","label":"ผ่านการฝึกอบรม"},{"key":"system","label":"บันทึกจากระบบ (เช่น เชื่อมกับ PM)"}]', 'วิธีรับทราบเอกสาร'],
    'document_ack_default_due_days' => ['14', 'กำหนดรับทราบภายในกี่วัน (นับจากวันที่ revision มีผล)'],
    'document_ack_overdue_reminder_days' => ['[3,7,14]', 'เตือนซ้ำทุกกี่วันหลังครบกำหนด'],
    'document_training_pass_score' => ['80', 'คะแนนผ่านขั้นต่ำ (%)'],
    'document_training_default_validity_days' => ['365', 'อายุใบรับรองการฝึกอบรม (วัน)'],
    'document_ack_blocks_work' => ['0', '1 = ผู้ที่ยังไม่รับทราบ revision ที่มีผล จะถูกกันไม่ให้ปิดงานที่เกี่ยวข้อง'],
    // ── change types / ECR rules ──
    'ecr_change_types' => ['[{"key":"design_change","label":"การเปลี่ยนแบบ/การออกแบบ"},{"key":"process_change","label":"การเปลี่ยนกระบวนการ"},{"key":"standard_change","label":"การเปลี่ยนมาตรฐาน/ขั้นตอน"},{"key":"spare_part_change","label":"การเปลี่ยนอะไหล่/อุปกรณ์"},{"key":"layout_change","label":"การเปลี่ยนผังพื้นที่"},{"key":"utilities_change","label":"การเปลี่ยนระบบสาธารณูปโภค"},{"key":"software_change","label":"การเปลี่ยนซอฟต์แวร์/ตั้งค่าเครื่อง"},{"key":"other","label":"อื่น ๆ"}]', 'ประเภทการเปลี่ยนแปลง (ECR)'],
    'ecr_status_labels' => ['{"draft":"ร่าง","submitted":"ส่งแล้ว","under_review":"อยู่ระหว่างตรวจทาน","impact_assessment":"กำลังประเมินผลกระทบ","pending_approval":"รออนุมัติ","approved":"อนุมัติแล้ว","rejected":"ไม่ผ่าน","implementation":"อยู่ระหว่างดำเนินการ","verification":"อยู่ระหว่างตรวจสอบผล","completed":"ปิดงานแล้ว","cancelled":"ยกเลิก"}', 'ป้ายสถานะ ECR (UI)'],
    'ecr_priority_labels' => ['{"low":"ต่ำ","medium":"ปานกลาง","high":"สูง","critical":"วิกฤต"}', 'ป้ายระดับความสำคัญ/ความรุนแรง'],
    'ecr_link_types' => ['[{"key":"asset","label":"เครื่องจักร/อุปกรณ์","table":"asset_registry"},{"key":"pm","label":"แผนงานบำรุงรักษา (PM)","table":"pm_am"},{"key":"work_order","label":"ใบงานซ่อม","table":"repair"},{"key":"rca","label":"รายงาน RCA","table":"rca"},{"key":"bom","label":"BOM เครื่องจักร","table":"machine_bom"},{"key":"spare_part","label":"อะไหล่","table":"spare_parts"},{"key":"document","label":"เอกสารควบคุม","table":"controlled_documents"},{"key":"revision","label":"revision เอกสาร","table":"document_revisions"},{"key":"failure_event","label":"เหตุขัดข้อง","table":"failure_events"},{"key":"department","label":"แผนก","table":"departments"}]', 'ประเภทสิ่งที่ ECR เชื่อมโยง (ไม่แก้ข้อมูลต้นทางอัตโนมัติ)'],
    'ecr_impact_target_types' => ['[{"key":"none","label":"ไม่ระบุ"},{"key":"asset","label":"เครื่องจักร/อุปกรณ์"},{"key":"pm","label":"แผนงานบำรุงรักษา (PM)"},{"key":"work_order","label":"ใบงานซ่อม"},{"key":"rca","label":"รายงาน RCA"},{"key":"bom","label":"BOM เครื่องจักร"},{"key":"spare_part","label":"อะไหล่"},{"key":"document","label":"เอกสารควบคุม"},{"key":"department","label":"แผนก"}]', 'ประเภทเป้าหมายของผลกระทบ ECR'],
    'ecr_verification_methods' => ['[{"key":"functional_test","label":"ทดสอบการทำงาน"},{"key":"inspection","label":"ตรวจสอบจากการตรวจ (Inspection)"},{"key":"document_review","label":"ตรวจทานเอกสาร"},{"key":"trial_run","label":"ทดลองใช้งาน (Trial Run)"},{"key":"measurement","label":"วัดค่า/ผลการวัด"},{"key":"other","label":"อื่น ๆ"}]', 'วิธีตรวจสอบผล ECR'],
    'ecr_impact_action_status_labels' => ['{"open":"ยังไม่เริ่ม","in_progress":"กำลังดำเนินการ","completed":"ดำเนินการแล้ว","not_applicable":"ไม่เกี่ยวข้อง"}', 'ป้ายสถานะการดำเนินการตามผลกระทบ'],
    'ecr_link_action_status_labels' => ['{"not_started":"ยังไม่เริ่ม","in_progress":"กำลังดำเนินการ","done":"ดำเนินการแล้ว","not_applicable":"ไม่เกี่ยวข้อง"}', 'ป้ายสถานะการดำเนินการตามลิงก์ ECR'],
    'ecr_transitions' => ['{"submit":["draft"],"start_review":["submitted"],"start_impact":["under_review"],"request_approval":["impact_assessment"],"approve":["pending_approval"],"reject":["under_review","impact_assessment","pending_approval"],"start_implementation":["approved"],"mark_implemented":["implementation"],"record_verification":["verification"],"close":["verification"],"rework":["verification"],"reopen":["rejected"],"cancel":["draft","submitted","under_review","impact_assessment","pending_approval","approved","rejected"]}', 'แผนผังสถานะ ECR (อ้างอิงสำหรับ API/UI)'],
    'ecr_impact_required_before_approval' => ['1', '1 = ต้องประเมินผลกระทบครบทุกด้านก่อนขออนุมัติ'],
    'ecr_impact_min_critical' => ['1', 'ต้องมี impact ระดับ critical อย่างน้อยกี่รายการถึงบังคับใช้ (0 = ไม่บังคับ) — เมื่อถึงเกณฑ์ ทุก impact ระดับ critical ต้องมี owner + required_action และต้องผ่านขั้น engineering_approval'],
    'ecr_critical_impact_guards' => ['["owner_required","action_required"]', 'เงื่อนไขบังคับสำหรับ impact ระดับ critical'],
    'ecr_blocks_completion_on_fail' => ['1', 'ผลตรวจสอบ = fail ต้องไม่ปิดงาน ECR และต้องเปิด ECR ต่อเนื่อง/แก้ไข'],
    'ecr_requires_document_revisions' => ['0', '1 = ต้องผูกอย่างน้อย 1 document revision ก่อนอนุมัติ'],
    'ecr_sla_days' => ['{"review":5,"approval":10,"implementation":30,"verification":7}', 'SLA วันต่อขั้น (เตือนล่วงหน้า)'],
    // ── explicit non-automation rule (documented, not just prose) ──
    'phase32_master_data_automation' => ['0', '0 = ห้ามระบบแก้ไขข้อมูลหลัก (PM/BOM/Sage/RCA) อัตโนมัติ — Phase 32 บันทึกผลกระทบเป็นข้อเสนอเท่านั้น'],
    'ecr_rca_causation_note' => ['ECR ไม่เป็นสาเหตุของ RCA โดยอัตโนมัติ — ต้องมีผู้ตรวจสอบยืนยันและบันทึกใน RCA เท่านั้น', 'หมายเหตุเรื่องความเชื่อมโยง ECR ↔ RCA'],
    'document_legacy_manual_bridge' => ['adopt_on_request', 'วิธีนำคู่มือจาก /manuals (legacy) เข้า controlled_documents: opt-in ทีละรายการ (source_manual_id)'],
    'document_qr_prefix' => ['CMMS-D-', 'prefix ของ QR เอกสารควบคุม'],
    'document_default_confidentiality' => ['internal', 'ระดับการเข้าถึงเริ่มต้น'],
    // ── hard guards on the effective transition (documented + enforced) ──
    'document_effective_requires_impacts_closed' => ['1', '1 = revision ทุกตัวต้องปิดผลกระทบ (completed/not_applicable) ก่อนมีผลบังคับใช้'],
    'document_effective_requires_training' => ['0', '1 = เอกสารที่ตั้ง requires_training ต้องมีหลักสูตรอย่างน้อย 1 หลักสูตรก่อนมีผล'],
    'document_ack_assign_roles' => ['[3,4]', 'role ที่ได้รับ assignment ให้รับทราบโดยอัตโนมัติเมื่อ revision มีผล'],
    'document_ack_assign_extra_users' => ['[]', 'user_id เพิ่มเติมที่ต้องรับทราบ (เกิน role ข้างบน)'],
    'document_ack_blocks_ecr_close' => ['1', '1 = ECR ที่อ้างอิงเอกสาร revision ที่มีผล จะปิดไม่ได้ถ้ายังรับทราบไม่ครบ'],
    'document_max_file_size_mb' => ['25', 'ขนาดไฟล์สูงสุด (MB)'],
    'document_allowed_file_types' => ['["application/pdf","image/png","image/jpeg","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]', 'MIME ที่อนุญาต (ฝั่ง server บังคับซ้ำอีกชั้น)'],
    'phase32_applied_ver' => ['2026-09-26', 'เลขเวอร์ชัน migration Phase 32 ครั้งล่าสุด'],
];
foreach ($ecSettings as $k => [$v, $desc]) {
    $exists = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $exists->execute([$k]);
    if ((int)$exists->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "engineering_change", ?)')
            ->execute([$k, $v, $desc]);
        $log("+ settings.$k");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

// ---------- 17) notification_templates ----------
$ntpls = [
    // ── document control ──
    ['document', 'revision_submitted', 'ส่งตรวจทานเอกสาร: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) ส่ง revision {revision_no} เข้าตรวจทาน\nผู้จัดทำ: {requester}", 'medium', '/documents/{document_id}'],
    ['document', 'review_required', 'รอตรวจทานเอกสาร: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} รอผู้ตรวจทานด้านเทคนิค\nขั้นที่: {step_key}", 'medium', '/documents/{document_id}'],
    ['document', 'approval_required', 'รออนุมัติเอกสาร: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} รอผู้อนุมัติ\nขั้นที่: {step_key}", 'high', '/documents/{document_id}'],
    ['document', 'revision_approved', 'อนุมัติเอกสารแล้ว: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} อนุมัติแล้ว (ยังไม่มีผล)\nวันที่มีผล: {effective_date}", 'medium', '/documents/{document_id}'],
    ['document', 'revision_effective', 'เอกสารฉบับใหม่มีผล: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} มีผลบังคับใช้ {effective_date}\nแทนที่ rev.{superseded_revision_no}", 'high', '/documents/{document_id}'],
    ['document', 'revision_superseded', 'เอกสารถูกแทนที่: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} ถูกแทนที่โดย rev.{new_revision_no} เมื่อ {superseded_at}", 'medium', '/documents/{document_id}'],
    ['document', 'revision_rejected', 'เอกสารไม่ผ่าน: {doc_no} rev.{revision_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} ไม่ผ่านการอนุมัติ\nเหตุผล: {reason}", 'high', '/documents/{document_id}'],
    ['document', 'revision_obsolete', 'เอกสารเลิกใช้: {doc_no}', "เอกสาร {title} ({doc_no}) ถูกทำเครื่องหมายเลิกใช้\nเหตุผล: {reason}", 'medium', '/documents/{document_id}'],
    ['document', 'ack_assigned', 'ต้องรับทราบเอกสาร: {doc_no} rev.{revision_no}', "คุณต้องอ่านและรับทราบเอกสาร {title} ({doc_no}) rev.{revision_no}\nกำหนด: {due_at}", 'medium', '/documents/{document_id}'],
    ['document', 'ack_overdue', 'รับทราบเอกสารเกินกำหนด: {doc_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} ยังไม่ได้รับทราบ (เกินกำหนด {overdue_days} วัน)", 'high', '/documents/{document_id}'],
    ['document', 'ack_completed', 'รับทราบเอกสารครบแล้ว: {doc_no}', "เอกสาร {title} ({doc_no}) rev.{revision_no} — รับทราบครบ {acked}/{total} คน", 'info', '/documents/{document_id}'],
    ['document', 'ack_exception', 'มีผู้ไม่สามารถรับทราบ: {doc_no}', "เอกสาร {title} ({doc_no}) มีผู้รายงานว่าไม่สามารถปฏิบัติตาม\nผู้รายงาน: {user} — {reason}", 'high', '/documents/{document_id}'],
    ['document', 'training_due', 'ถึงกำหนดอบรม: {doc_no}', "หลักสูตร {course_title} ({course_code}) จากเอกสาร {title} ({doc_no}) ถึงกำหนด\nคงเหลือ: {pending} คน", 'medium', '/documents/{document_id}'],
    ['document', 'training_expiring', 'ใบรับรองการอบรมใกล้หมดอายุ: {course_code}', "หลักสูตร {course_title} ของ {user} หมดอายุ {expires_at}", 'medium', '/documents/{document_id}'],
    ['document', 'review_due', 'ถึงกำหนดทบทวนเอกสาร: {doc_no}', "เอกสาร {title} ({doc_no}) ครบกำหนดทบทวน {next_review_date}", 'medium', '/documents/{document_id}'],
    ['document', 'review_overdue', 'เอกสารเกินกำหนดทบทวน: {doc_no}', "เอกสาร {title} ({doc_no}) เกินกำหนดทบทวนแล้ว {overdue_days} วัน", 'high', '/documents/{document_id}'],
    // ── engineering change ──
    ['engineering_change', 'submitted', 'ส่ง ECR แล้ว: {ecr_no}', "ECR {ecr_no} — {title}\nผู้ขอ: {requester} | ประเภท: {change_type}", 'medium', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'review_required', 'รอตรวจทาน ECR: {ecr_no}', "ECR {ecr_no} — {title} รอผู้ตรวจทาน\nขั้นที่: {step_key}", 'medium', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'impact_assessment', 'รอประเมินผลกระทบ: {ecr_no}', "ECR {ecr_no} — {title} ต้องประเมินผลกระทบก่อนเข้าสู่ขั้นอนุมัติ", 'medium', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'approval_required', 'รออนุมัติ ECR: {ecr_no}', "ECR {ecr_no} — {title} รอผู้อนุมัติ\nขั้นที่: {step_key}", 'high', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'approved', 'อนุมัติ ECR แล้ว: {ecr_no}', "ECR {ecr_no} — {title} อนุมัติแล้ว\nกำหนดดำเนินการ: {required_by_date}", 'high', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'rejected', 'ไม่ผ่าน ECR: {ecr_no}', "ECR {ecr_no} — {title} ไม่ผ่านการอนุมัติ\nเหตุผล: {reason}", 'high', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'implementation_due', 'ใกล้ครบกำหนดดำเนินการ: {ecr_no}', "ECR {ecr_no} — {title} ใกล้ครบกำหนด {planned_completion_date} (เกินไป {overdue_days} วัน)", 'high', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'implemented', 'ECR รอตรวจสอบผล: {ecr_no}', "ECR {ecr_no} — {title} ดำเนินการเสร็จแล้ว รอตรวจสอบผล", 'high', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'verification_pass', 'ตรวจสอบผลผ่าน: {ecr_no}', "ECR {ecr_no} — {title} ตรวจสอบผลผ่าน ({method})\nหมายเหตุ: {notes}", 'medium', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'verification_fail', 'ตรวจสอบผลไม่ผ่าน: {ecr_no}', "ECR {ecr_no} — {title} ตรวจสอบผลไม่ผ่าน\nเหตุผล: {reason}\nECR จะไม่ถูกปิด", 'critical', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'verification_partial', 'ตรวจสอบผลผ่านบางส่วน: {ecr_no}', "ECR {ecr_no} — {title} ตรวจสอบผลผ่านบางส่วน ต้องติดตามต่อ", 'high', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'completed', 'ปิด ECR แล้ว: {ecr_no}', "ECR {ecr_no} — {title} ปิดงานแล้ว\nสรุป: {summary}", 'info', '/engineering-changes/{ecr_id}'],
    ['engineering_change', 'cancelled', 'ยกเลิก ECR: {ecr_no}', "ECR {ecr_no} — {title} ถูกยกเลิก\nเหตุผล: {reason}", 'medium', '/engineering-changes/{ecr_id}'],
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

// ---------- 18) menu_permissions ----------
$menuMap = [
    'engineering_change/overview' => [1, 2, 6, 7, 3, 5],
    'document_control/overview'    => [1, 2, 6, 7, 3, 4, 5],
];
foreach ($menuMap as $key => $roles) {
    foreach ($roles as $rid) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE menu_key = ? AND role_id = ?');
        $st->execute([$key, $rid]);
        if ((int)$st->fetchColumn() === 0) {
            $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')->execute([$rid, $key]);
            $log("+ menu_permissions: $key role=$rid");
            $changed++;
        }
    }
}

$log(PHP_EOL . "Phase 32 migration done. changed=$changed");
