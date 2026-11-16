<?php
/**
 * scripts/apply_phase35_shutdown.php - idempotent DB migration (Phase 35)
 *
 * Shutdown / Turnaround Management - a COORDINATION LAYER. It owns nothing that
 * another phase already owns. See the DATA OWNERSHIP block below.
 *
 *   1) sd_shutdowns        - the shutdown header + backend-controlled lifecycle
 *   2) sd_assets           - which assets are inside this shutdown (membership, not a register)
 *   3) sd_scopes           - the shutdown WBS; parent_id is the hierarchy, repair_id LINKS to
 *                            the one real work order store (a shutdown is NOT a second WO system)
 *   4) sd_dependencies     - predecessor/successor links (FS/SS/FF/SF + lag). Without these
 *                            there is no critical path, only a duration list.
 *   5) sd_baselines        - IMMUTABLE plan snapshots. A baseline row is never UPDATEd; a new
 *                            plan creates a new version and only is_current flips.
 *   6) sd_readiness_checks - explainable pass/fail/waived rows with a reason code each.
 *                            There is NO numeric readiness score in this phase.
 *   7) sd_startup_checks   - startup gates per asset. Records a LOTO block; it never releases
 *                            a lock. Removal stays in Phase 30 wp_remove_loto_point().
 *   8) sd_planned_parts    - material PLAN lines only. reserved/issued/used/returned are read
 *                            live from Phase 33 so this table can never drift from the ledger.
 *   9) sd_activity         - append-only shutdown activity trail
 *  10) settings group shutdown
 *  11) notification_templates module shutdown
 *
 * DATA OWNERSHIP (enforced by schema comments + src/helpers/shutdown.php):
 *   repair + work_assignees              = the ONE work order + assignment store (Phase 14/25)
 *   work_permits + permit_loto_points    = the ONE PTW + LOTO store (Phase 30)
 *   spare_parts / spare_part_reservations / spare_issue_request_items / repair_spare_parts
 *                                        = the ONE material store (Phase 33)
 *   asset_registry / asset_lifecycle_history / asset_overhauls = asset master (Phase 27/28)
 *   users + departments                  = the ONE person + organization master
 *   audit_logs                           = cross-phase audit trail (audit_log())
 *   client_action_log                    = the ONE offline replay idempotency store (Phase 19)
 *
 * NON-NEGOTIABLE GUARDS:
 *   The Startup gate blocks on live LOTO in CODE, not behind a setting. There is deliberately
 *   no shutdown_* setting that can disable it, because Phase 30's wp_remove_loto_point()
 *   already has no internal authorization check and safety:execute reaches role 3. The only
 *   safe interlock left is the reader side, so it is hard-coded.
 *
 * NOT BUILT (honest gaps - do not fake them):
 *   - no cost ledger      -> cost is computed from repair via cost_comp_sql()
 *   - no timesheet        -> actual hours come from repair.actual_start_at/completed_at/
 *                            repair_time_minutes + work_pause_logs
 *   - no PO / on-order    -> material readiness reports on_hand + reserved only
 *   - no readiness score  -> explicit rows with reason codes instead
 *
 * NOTE: DDL COMMENTs are ASCII-only because MySQL may reject multi-byte COMMENT strings on
 * some connections; Thai copy lives in PHP data seeds and in docs/*.md.
 *
 * Run: php scripts/apply_phase35_shutdown.php (idempotent)
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

$hasIndex = function (string $table, string $index) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $st->execute([$table, $index]);
    return (int)$st->fetchColumn() > 0;
};

$hasColumn = function (string $table, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
};

/*
 * Additive reconciliation. createTable() is all-or-nothing, so a schema that was created
 * by an EARLIER revision of this script would otherwise keep the old shape forever. Every
 * later column/index this script depends on is declared here instead, so re-running the
 * migration after an edit converges rather than reporting "(existed)" and doing nothing.
 */
$addColumn = function (string $table, string $column, string $definition) use ($pdo, $hasColumn, $log, &$changed): void {
    if (!$hasColumn($table, $column)) {
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
        $log("~ $table.$column (added)");
        $changed++;
    }
};

$addIndex = function (string $table, string $index, string $columns) use ($pdo, $hasTable, $hasIndex, $log, &$changed): void {
    if ($hasTable($table) && !$hasIndex($table, $index)) {
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `$index` ($columns)");
        $log("~ $table.$index (added)");
        $changed++;
    }
};

$createTable = function (string $name, string $ddl) use ($pdo, $hasTable, $log, &$changed): void {
    if ($hasTable($name)) { $log("~ $name (existed)"); return; }
    $pdo->exec($ddl);
    $log("+ $name");
    $changed++;
};

/*
 * 1) sd_shutdowns - the shutdown / turnaround header.
 *    The status enum IS the lifecycle. src/helpers/shutdown.php owns the transition
 *    map; this column only stores the current value.
 */
$createTable('sd_shutdowns', <<<'SQL'
CREATE TABLE sd_shutdowns (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_no      VARCHAR(40) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  shutdown_type    ENUM('planned','unplanned','turnaround','inspection') NOT NULL DEFAULT 'planned',
  facility         VARCHAR(200) NOT NULL DEFAULT '',
  objective        TEXT NULL,
  status           ENUM('draft','planning','scope_freeze','ready','execution','startup','closeout','completed','cancelled')
                   NOT NULL DEFAULT 'draft',
  risk_level       ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  department_id    INT UNSIGNED NULL,
  owner_user_id    INT UNSIGNED NULL,
  planned_start_at DATETIME NULL,
  planned_end_at   DATETIME NULL,
  actual_start_at  DATETIME NULL,
  actual_end_at    DATETIME NULL,
  is_baselined     TINYINT(1) NOT NULL DEFAULT 0,
  baseline_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  closeout_outcome ENUM('completed','partial','cancelled') NULL,
  downtime_minutes INT UNSIGNED NULL COMMENT 'reported actual downtime, never derived',
  lessons          TEXT NULL,
  notes            TEXT NULL,
  created_by       INT UNSIGNED NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdsh_no (shutdown_no),
  KEY idx_sdsh_status (status, planned_start_at),
  KEY idx_sdsh_dept (department_id),
  KEY idx_sdsh_owner (owner_user_id),
  KEY idx_sdsh_window (planned_start_at, planned_end_at),
  CONSTRAINT fk_sdsh_dept FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL,
  CONSTRAINT fk_sdsh_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_sdsh_created FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 2) sd_assets - scope MEMBERSHIP. isolation_required is plan intent only;
 *    LOTO truth is always permit_loto_points.status, read at runtime.
 */
$createTable('sd_assets', <<<'SQL'
CREATE TABLE sd_assets (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id        INT UNSIGNED NOT NULL,
  asset_id           INT UNSIGNED NOT NULL,
  is_critical        TINYINT(1) NOT NULL DEFAULT 0,
  isolation_required TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'plan intent, not LOTO truth',
  loto_permit_id     INT NULL COMMENT 'optional PTW link (work_permits.id is signed INT), hint only',
  status             ENUM('pending','isolated','worked','released') NOT NULL DEFAULT 'pending',
  sort               SMALLINT NOT NULL DEFAULT 0,
  note               VARCHAR(500) NOT NULL DEFAULT '',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdsa_shutdown_asset (shutdown_id, asset_id),
  KEY idx_sdsa_asset (asset_id),
  KEY idx_sdsa_permit (loto_permit_id),
  CONSTRAINT fk_sdsa_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdsa_asset FOREIGN KEY (asset_id) REFERENCES asset_registry (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdsa_permit FOREIGN KEY (loto_permit_id) REFERENCES work_permits (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 3) sd_scopes - the shutdown WBS. self-FK parent_id gives the hierarchy;
 *    repair_id / permit_id LINK to the existing stores rather than copying them.
 */
$createTable('sd_scopes', <<<'SQL'
CREATE TABLE sd_scopes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id      INT UNSIGNED NOT NULL,
  parent_id        INT UNSIGNED NULL,
  seq              SMALLINT NOT NULL DEFAULT 0,
  wbs_code         VARCHAR(40) NOT NULL DEFAULT '',
  title            VARCHAR(255) NOT NULL,
  description      TEXT NULL,
  discipline       VARCHAR(60) NOT NULL DEFAULT '',
  owner_user_id    INT UNSIGNED NULL,
  repair_id        INT UNSIGNED NULL COMMENT 'link to the ONE work order store',
  permit_id        INT NULL COMMENT 'link to the ONE PTW store (work_permits.id is signed INT)',
  estimate_hours   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  planned_start_at DATETIME NULL,
  planned_end_at   DATETIME NULL,
  actual_start_at  DATETIME NULL,
  actual_end_at    DATETIME NULL,
  progress_pct     SMALLINT NOT NULL DEFAULT 0,
  progress_source  ENUM('manual','work_order') NOT NULL DEFAULT 'manual',
  status           ENUM('planned','ready','in_progress','done','on_hold','cancelled') NOT NULL DEFAULT 'planned',
  sort             SMALLINT NOT NULL DEFAULT 0,
  notes            TEXT NULL,
  created_by       INT UNSIGNED NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sdsc_shutdown (shutdown_id, sort),
  KEY idx_sdsc_parent (parent_id),
  KEY idx_sdsc_repair (repair_id),
  KEY idx_sdsc_permit (permit_id),
  KEY idx_sdsc_status (shutdown_id, status),
  CONSTRAINT fk_sdsc_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdsc_parent FOREIGN KEY (parent_id) REFERENCES sd_scopes (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdsc_repair FOREIGN KEY (repair_id) REFERENCES repair (id) ON DELETE SET NULL,
  CONSTRAINT fk_sdsc_permit FOREIGN KEY (permit_id) REFERENCES work_permits (id) ON DELETE SET NULL,
  CONSTRAINT fk_sdsc_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 4) sd_dependencies - real precedence links. sd_scopes_save_dependency() refuses
 *    any edge that would create a cycle, so the graph stays a DAG for the CPM pass.
 */
$createTable('sd_dependencies', <<<'SQL'
CREATE TABLE sd_dependencies (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id          INT UNSIGNED NOT NULL,
  predecessor_scope_id INT UNSIGNED NOT NULL,
  successor_scope_id   INT UNSIGNED NOT NULL,
  dep_type             ENUM('FS','SS','FF','SF') NOT NULL DEFAULT 'FS',
  lag_hours            DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  is_mandatory         TINYINT(1) NOT NULL DEFAULT 1,
  note                 VARCHAR(500) NOT NULL DEFAULT '',
  created_by           INT UNSIGNED NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdd_pair (predecessor_scope_id, successor_scope_id),
  KEY idx_sdd_shutdown (shutdown_id),
  KEY idx_sdd_successor (successor_scope_id),
  CONSTRAINT fk_sdd_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdd_pred FOREIGN KEY (predecessor_scope_id) REFERENCES sd_scopes (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdd_succ FOREIGN KEY (successor_scope_id) REFERENCES sd_scopes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 5) sd_baselines - IMMUTABLE. sd_baseline_create() only ever INSERTs, then flips
 *    the single is_current flag on the previous row. snapshot_json is frozen.
 */
$createTable('sd_baselines', <<<'SQL'
CREATE TABLE sd_baselines (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id          INT UNSIGNED NOT NULL,
  version              SMALLINT UNSIGNED NOT NULL,
  baseline_at          DATETIME NOT NULL,
  scope_count          INT UNSIGNED NOT NULL DEFAULT 0,
  total_estimate_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  critical_path_hours  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  project_hours        DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'longest path if all work ran in parallel',
  scope_count_estimated INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'scopes still missing estimate_hours',
  snapshot_json        LONGTEXT NOT NULL COMMENT 'frozen scopes + dependencies + critical path',
  note                 VARCHAR(500) NOT NULL DEFAULT '',
  is_current           TINYINT(1) NOT NULL DEFAULT 0,
  created_by           INT UNSIGNED NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdb_version (shutdown_id, version),
  KEY idx_sdb_current (shutdown_id, is_current),
  CONSTRAINT fk_sdb_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 6) sd_readiness_checks - explainable gates, one row per (target, check_key).
 *
 * TARGET MODEL. A gate can hang off the shutdown, a scope, or a scoped ASSET, so the two
 * target columns are part of the natural key:
 *     scope_id    = 0  -> shutdown level
 *     sd_asset_id = 0  -> not an asset target
 * The identity is (shutdown_id, scope_id, sd_asset_id, check_key).
 *
 * WHY NO FOREIGN KEY ON THE TARGET COLUMNS. A 0 sentinel is required rather than NULL,
 * because MySQL treats NULLs as distinct inside a UNIQUE key, which would let duplicate
 * shutdown-level gates through. An FK to sd_scopes(sd_assets) would then reject every 0.
 * A nullable FK cannot express "shutdow-level" either. So the targets are plain indexed
 * columns and sd_readiness_refresh() is the only writer, and it only ever passes an id it
 * has just read back from sd_scopes / sd_assets for this same shutdown_id.
 */
$createTable('sd_readiness_checks', <<<'SQL'
CREATE TABLE sd_readiness_checks (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id        INT UNSIGNED NOT NULL,
  scope_id           INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = shutdown-level gate',
  sd_asset_id        INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'sd_assets.id, 0 = not an asset gate',
  category           VARCHAR(40) NOT NULL DEFAULT 'general',
  check_key          VARCHAR(60) NOT NULL,
  check_label        VARCHAR(200) NOT NULL DEFAULT '',
  state              ENUM('pending','pass','fail','waived','na') NOT NULL DEFAULT 'pending',
  reason_code        VARCHAR(60) NOT NULL DEFAULT '',
  detail             VARCHAR(500) NOT NULL DEFAULT '',
  evidence_ref_type  VARCHAR(40) NOT NULL DEFAULT '',
  evidence_ref_id    INT UNSIGNED NULL,
  is_blocking        TINYINT(1) NOT NULL DEFAULT 1,
  evaluated_at       DATETIME NULL,
  evaluated_by       INT UNSIGNED NULL,
  waived_by          INT UNSIGNED NULL,
  waiver_reason      VARCHAR(500) NOT NULL DEFAULT '',
  waiver_reason_code VARCHAR(60) NOT NULL DEFAULT '',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdrc_key (shutdown_id, scope_id, sd_asset_id, check_key),
  KEY idx_sdrc_shutdown (shutdown_id, state),
  KEY idx_sdrc_scope (scope_id),
  KEY idx_sdrc_asset (sd_asset_id),
  KEY idx_sdrc_category (shutdown_id, category),
  CONSTRAINT fk_sdrc_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 7) sd_startup_checks - startup gates per asset. blocking_point_id references the
 *    exact permit_loto_points row that is still live. Nothing in this phase writes
 *    to permit_loto_points, so startup can report a lock but can never clear one.
 */
$createTable('sd_startup_checks', <<<'SQL'
CREATE TABLE sd_startup_checks (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id       INT UNSIGNED NOT NULL,
  sd_asset_id       INT UNSIGNED NOT NULL,
  category          VARCHAR(40) NOT NULL DEFAULT 'general',
  check_key         VARCHAR(60) NOT NULL,
  check_label       VARCHAR(200) NOT NULL DEFAULT '',
  state             ENUM('pending','pass','fail','waived','na') NOT NULL DEFAULT 'pending',
  reason_code       VARCHAR(60) NOT NULL DEFAULT '',
  detail            VARCHAR(500) NOT NULL DEFAULT '',
  blocking_point_id INT UNSIGNED NULL COMMENT 'permit_loto_points.id that is still live',
  is_blocking       TINYINT(1) NOT NULL DEFAULT 1,
  evaluated_at      DATETIME NULL,
  evaluated_by      INT UNSIGNED NULL,
  waived_by         INT UNSIGNED NULL,
  waiver_reason     VARCHAR(500) NOT NULL DEFAULT '',
  waiver_reason_code VARCHAR(60) NOT NULL DEFAULT '' COMMENT 'required on any waiver; audited',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdsck_key (shutdown_id, sd_asset_id, check_key),
  KEY idx_sdsck_shutdown (shutdown_id, state),
  KEY idx_sdsck_point (blocking_point_id),
  CONSTRAINT fk_sdsck_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdsck_asset FOREIGN KEY (sd_asset_id) REFERENCES sd_assets (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdsck_point FOREIGN KEY (blocking_point_id) REFERENCES permit_loto_points (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 8) sd_planned_parts - PLAN lines only. Deliberately holds NO reserved/issued/used
 *    columns: those are read from spare_part_reservations, spare_issue_request_items
 *    and repair_spare_parts at read time, so this table cannot drift from Phase 33.
 *
 *    scope_id uses the same 0 = shutdown-level sentinel as sd_readiness_checks and
 *    therefore carries no FK either; a shutdown-wide material need is a real case
 *    (consumables that are not tied to one WBS line) and must not be forced into a scope.
 */
$createTable('sd_planned_parts', <<<'SQL'
CREATE TABLE sd_planned_parts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id   INT UNSIGNED NOT NULL,
  scope_id      INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = shutdown-level need',
  spare_part_id INT UNSIGNED NOT NULL,
  planned_qty   DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  needed_by     DATE NULL,
  note          VARCHAR(500) NOT NULL DEFAULT '',
  created_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sdpp_key (shutdown_id, scope_id, spare_part_id),
  KEY idx_sdpp_part (spare_part_id),
  KEY idx_sdpp_scope (scope_id),
  CONSTRAINT fk_sdpp_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE,
  CONSTRAINT fk_sdpp_part FOREIGN KEY (spare_part_id) REFERENCES spare_parts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 9) sd_activity - append-only. audit_logs is the cross-phase trail; this is the
 *    shutdown-local read model so the detail page does not have to filter audit rows.
 */
$createTable('sd_activity', <<<'SQL'
CREATE TABLE sd_activity (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shutdown_id  INT UNSIGNED NOT NULL,
  scope_id     INT UNSIGNED NULL,
  user_id      INT UNSIGNED NULL,
  action       VARCHAR(48) NOT NULL,
  from_status  VARCHAR(40) NOT NULL DEFAULT '',
  to_status    VARCHAR(40) NOT NULL DEFAULT '',
  description  VARCHAR(500) NOT NULL DEFAULT '',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sdact_shutdown (shutdown_id, id),
  KEY idx_sdact_scope (scope_id),
  CONSTRAINT fk_sdact_shutdown FOREIGN KEY (shutdown_id) REFERENCES sd_shutdowns (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);

/*
 * 9b) Reconcile any table that already existed with an EARLIER revision of this script.
 *     Only additive statements, so this is safe to re-run and never rewrites existing rows.
 */
$addColumn('sd_readiness_checks', 'sd_asset_id', 'INT UNSIGNED NOT NULL DEFAULT 0 COMMENT \'sd_assets.id, 0 = not an asset gate\'');
$addColumn('sd_startup_checks', 'waiver_reason_code', 'VARCHAR(60) NOT NULL DEFAULT \'\'');
$addColumn('sd_readiness_checks', 'waiver_reason_code', 'VARCHAR(60) NOT NULL DEFAULT \'\'');
$addIndex('sd_readiness_checks', 'idx_sdrc_asset', 'sd_asset_id');

/*
 * 10) settings group shutdown.
 *     shutdown_report_labor_money defaults to 0 on purpose: inspection found a single
 *     global settings.standard_labor_rate = 250, no per-person rate, no timesheet, and
 *     repair_time_minutes containing 720-hour outliers. Until a trustworthy hours source
 *     exists the cost panel reports HOURS, not money.
 */
$settings = [
    ['shutdown_block_on_readiness', '1', '1 = READY requires every blocking readiness check to be PASS (a waiver counts only when shutdown_allow_waive_blocking = 1); 0 = readiness is advisory and only reported'],
    ['shutdown_allow_waive_blocking', '0', '1 = an authorised approver may waive a FAILING blocking readiness check with a reason code; 0 = blocking failures can never be waived'],
    ['shutdown_require_reason_scope', '1', '1 = every shutdown scope status change and every waiver must carry a reason of at least 10 characters'],
    ['shutdown_progress_source', 'work_order', 'work_order = progress is derived from the linked repair row (actual_start_at/completed_at/repair_time_minutes); manual = progress_pct is entered by the owner and labelled as such'],
    ['shutdown_report_labor_money', '0', '0 = report labour as HOURS only (no trustworthy rate exists yet); 1 = also multiply by the global standard_labor_rate and label the result as an estimate'],
    ['shutdown_material_availability_source', 'reservation', 'reservation = material coverage uses spare_part_reservations + spare_parts.stock_qty; b = asset BOM only. There is no on-order source in this codebase, so on-order is never reported'],
    ['shutdown_reservation_expiry_days', '14', 'when sd_parts_reserve() creates a Phase 33 hold, write an explicit expires_at. spO_expireReservations() silently drops holds past expires_at and is enabled in settings'],
    ['shutdown_readiness_warn_hours', '48', 'readiness warning window before planned_start_at'],
    ['shutdown_scope_min_estimate_hours', '0.01', 'estimates below this are treated as "not estimated" and block a critical-path claim instead of being counted as zero-length tasks'],
    ['shutdown_max_baseline_versions', '20', 'safety cap so a runaway re-baseline loop cannot fill the table'],
];
foreach ($settings as [$k, $v, $desc]) {
    $exists = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $exists->execute([$k]);
    if ((int)$exists->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "shutdown", ?)')
            ->execute([$k, $v, $desc]);
        $log("+ settings.$k");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

/*
 * 11) notification_templates module shutdown.
 *     Dedupe is server-side via notification_events.event_key inside
 *     NotificationCenterService::notify(), so repeated status events do not spam.
 */
$ntpls = [
    ['shutdown', 'created', 'เปิดการหยุดเครื่อง: {shutdown_no}', '{title} ({shutdown_type}) สถานที่ {facility} ความเสี่ยง {risk_level}', 'info', '/shutdowns/{shutdown_id}'],
    ['shutdown', 'status_changed', 'เปลี่ยนสถานะการหยุดเครื่อง: {shutdown_no}', 'สถานะ: {from_status} → {to_status}', 'info', '/shutdowns/{shutdown_id}'],
    ['shutdown', 'baseline_created', 'บันทึก Baseline การหยุดเครื่อง: {shutdown_no}', 'เวอร์ชัน {baseline_version} · เส้นทางวิกฤต {critical_path_hours} ชม.', 'medium', '/shutdowns/{shutdown_id}/planning'],
    ['shutdown', 'readiness_blocked', 'การหยุดเครื่องยังไม่พร้อม: {shutdown_no}', 'รายการที่ยังไม่ผ่าน {blocking_count} รายการ: {blocking_list}', 'high', '/shutdowns/{shutdown_id}/readiness'],
    ['shutdown', 'ready', 'การหยุดเครื่องพร้อมเริ่มงาน: {shutdown_no}', 'ผ่านการตรวจความพร้อมครบทุกรายการ (ไม่มีคะแนนรวม แสดงเหตุผลรายข้อ)', 'medium', '/shutdowns/{shutdown_id}/execution'],
    ['shutdown', 'execution_started', 'เริ่มปฏิบัติงานการหยุดเครื่อง: {shutdown_no}', 'เริ่มจริง {actual_start_at}', 'high', '/shutdowns/{shutdown_id}/execution'],
    ['shutdown', 'startup_blocked', 'หยุดเครื่องติดขัดขั้นตอน STARTUP: {shutdown_no}', 'ปิดกั้นอยู่ {blocking_count} รายการ: {blocking_list}', 'critical', '/shutdowns/{shutdown_id}/startup'],
    ['shutdown', 'startup_ready', 'พร้อม STARTUP: {shutdown_no}', 'ผ่านทุกประตู Startup (ระบบไม่ปลด LOTO อัตโนมัติ ต้องปลดผ่าน Phase 30)', 'high', '/shutdowns/{shutdown_id}/startup'],
    ['shutdown', 'completed', 'ปิดการหยุดเครื่องเรียบร้อย: {shutdown_no}', 'จบจริง {actual_end_at} · ผลลัพธ์ {closeout_outcome}', 'info', '/shutdowns/{shutdown_id}/closeout'],
    ['shutdown', 'cancelled', 'ยกเลิกการหยุดเครื่อง: {shutdown_no}', 'เหตุผล: {reason}', 'warning', '/shutdowns/{shutdown_id}'],
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

/*
 * 12) menu_permissions.
 *     Keys must mirror the PERMISSION_MATRIX actions added to
 *     src/helpers/permissions.php, otherwise a role passes the API check but never
 *     sees the entry, or sees an entry it cannot open.
 */
$menuMap = [
    'shutdown'            => [1, 2, 3, 6, 7, 5],
    'shutdown/planning'   => [1, 2, 6, 7],
    'shutdown/readiness'  => [1, 2, 3, 6, 7],
    'shutdown/execution'  => [1, 2, 3, 6, 7],
    'shutdown/startup'    => [1, 2, 6, 7],
    'shutdown/closeout'   => [1, 2, 6],
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

/*
 * Reconcile: the map above is authoritative. Insert-only seeding would leave a grant
 * behind forever whenever a role is later removed from a key. Only rows this migration
 * owns (menu_key LIKE 'shutdown%') are touched.
 */
$allowed = [];
foreach ($menuMap as $key => $roles) foreach ($roles as $rid) $allowed[(string)$rid . '|' . $key] = true;

$granted = $pdo->query("SELECT role_id, menu_key FROM menu_permissions
                        WHERE menu_key LIKE 'shutdown%' AND is_granted = 1")->fetchAll(PDO::FETCH_ASSOC);
foreach ($granted as $row) {
    $k = (string)$row['role_id'] . '|' . (string)$row['menu_key'];
    if (isset($allowed[$k])) continue;
    $pdo->prepare('DELETE FROM menu_permissions WHERE role_id = ? AND menu_key = ?')
        ->execute([(int)$row['role_id'], (string)$row['menu_key']]);
    $log("- menu_permissions: {$row['menu_key']} role={$row['role_id']} (revoked, not in map)");
    $changed++;
}

$log(PHP_EOL . "Phase 35 migration done. changed=$changed");
