<?php
/**
 * scripts/apply_phase33_spare_optimization.php — idempotent DB migration (Phase 33)
 *
 * Spare Parts Optimization & Warehouse Maintenance:
 *   1)  spare_warehouses            — CMMS maintenance registry keyed on Sage location code
 *                                     (NOT an independent warehouse master; Sage ICILOC stays authoritative)
 *   2)  spare_part_criticality      — versioned criticality assessment (manual or weighted, always reasoned)
 *   3)  spare_part_reservations     — real reservation entity (held/released/consumed/expired)
 *   4)  spare_part_reservation_events — append-only reservation timeline
 *   5)  spare_part_substitutes      — approved substitution with effective dates
 *   6)  spare_minmax_history        — append-only min/max/safety/reorder configuration history
 *   7)  spare_optimization_runs     — every analysis run records the exact inputs it used
 *   8)  spare_parts (additive cols)  — safety_stock / reorder_point / reorder_qty / lead_time_days /
 *                                     service_level / minmax_policy / minmax_locked / minmax_reason /
 *                                     minmax_updated_by / minmax_updated_at / warehouse_id /
 *                                     abc_class / last_movement_at
 *   9)  spare_part_transactions (additive cols) — CMMS movement ledger gains balance + provenance
 *   10) settings group spare_optimization (thresholds, methods, non-automation guards)
 *   11) notification_templates module spare_optimization
 *   12) menu_permissions: spare_parts/optimization + spare_parts/warehouses + spare_parts/criticality
 *
 * DATA OWNERSHIP (enforced by schema comments + engine, not by prose):
 *   Sage 300 (ICITEM / ICILOC / POPORH via src/helpers/sage300.php) is authoritative for
 *     item code, description, warehouse/location, on-hand, avg_cost, and inventory transactions.
 *   CMMS owns maintenance classification, criticality, min/max, safety stock, reorder policy,
 *     demand/usage analytics, reservations, readiness and risk. CMMS never authors Sage figures.
 *   `spare_part_transactions` is the CMMS MOVEMENT LEDGER (it already existed and is the only
 *   ledger shape in the schema). Phase 33 extends it additively and starts writing to it so that
 *   demand/usage analytics become computable from real recorded movements.
 *
 * NON-AUTOMATION GUARDS (settings, honoured by the engine — see src/helpers/spare_optimization.php):
 *   phase33_auto_procurement          = 0  (the engine only produces SUGGESTIONS; it never buys)
 *   phase33_auto_minmax_write         = 0  (derived min/max are PROPOSALS until a human confirms)
 *   phase33_auto_criticality          = 0  (criticality is never auto-scored without approved inputs)
 *   phase33_reservation_deducts_stock = 0  (a CMMS reservation is not a Sage stock movement)
 *
 * NOTE: DDL COMMENTs are ASCII-only because MySQL may reject multi-byte COMMENT strings on some
 * connections; Thai copy lives in PHP data seeds (parameterized INSERTs) and in docs/*.md.
 *
 * Run: php scripts/apply_phase33_spare_optimization.php (idempotent)
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

$hasFk = function (string $table, string $name) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                         WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?');
    $st->execute([$table, $name]);
    return (int)$st->fetchColumn() > 0;
};

/** Current COLUMN_TYPE of a column, or '' when it does not exist. */
$columnType = function (string $table, string $column) use ($pdo): string {
    $st = $pdo->prepare('SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (string)($st->fetchColumn() ?: '');
};

/**
 * Narrowing/widening helper for a seed value inside an ENUM.
 * A run that dies mid-analysis must not be reported as a finished analysis, so
 * 'running' has to be a real enum member rather than a lie told by the code.
 */
$ensureEnumValue = function (string $table, string $column, string $value, string $enumDef) use ($pdo, $columnType, $log, &$changed): void {
    $current = $columnType($table, $column);
    if ($current === '') {
        $log("~ $table.$column (column missing — skipped)");
        return;
    }
    if (preg_match("/'" . preg_quote($value, '/') . "'/", $current)) {
        $log("~ $table.$column (already accepts '$value')");
        return;
    }
    $pdo->exec("ALTER TABLE `$table` MODIFY COLUMN `$column` $enumDef");
    $log("+ $table.$column += '$value'");
    $changed++;
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

$addUnique = function (string $table, string $name, string $cols) use ($pdo, $hasIndex, $log, &$changed): void {
    if (!$hasIndex($table, $name)) {
        $pdo->exec("ALTER TABLE `$table` ADD UNIQUE KEY `$name` ($cols)");
        $log("+ $table.$name (unique)");
        $changed++;
    } else {
        $log("~ $table.$name (existed)");
    }
};

$addFk = function (string $table, string $name, string $col, string $refTable, string $refCol, string $onDelete) use ($pdo, $hasFk, $log, &$changed): void {
    if (!$hasFk($table, $name)) {
        $pdo->exec("ALTER TABLE `$table` ADD CONSTRAINT `$name`
                    FOREIGN KEY (`$col`) REFERENCES `$refTable` (`$refCol`) ON DELETE $onDelete");
        $log("+ $table.$name -> $refTable.$refCol");
        $changed++;
    } else {
        $log("~ $table.$name (existed)");
    }
};

/* ────────────────────────────────────────────────────────────────────────────
 * 1) spare_warehouses — CMMS maintenance registry, keyed on the Sage location code
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_warehouses', "CREATE TABLE `spare_warehouses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL COMMENT 'Sage warehouse/location code (ICILOC.LOCATION) - the identity key',
  `name` VARCHAR(150) NOT NULL,
  `source` ENUM('sage_sync','cmms') NOT NULL DEFAULT 'sage_sync' COMMENT 'sage_sync = discovered from Sage; cmms = created locally for a Sage-absent code',
  `sage_description` VARCHAR(255) NULL,
  `is_issue_point` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'CMMS may reserve/issue from this warehouse',
  `is_quarantine` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'quarantine/binned area - stock here is not issuable',
  `responsible_user_id` INT UNSIGNED NULL,
  `notes` VARCHAR(500) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_synced_at` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sw_code` (`code`),
  KEY `idx_sw_source` (`source`),
  KEY `idx_sw_active` (`is_active`),
  KEY `idx_sw_issue_point` (`is_issue_point`),
  CONSTRAINT `fk_sw_user` FOREIGN KEY (`responsible_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CMMS warehouse maintenance registry keyed on Sage location code (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 2) spare_part_criticality — versioned, always reasoned, never silently auto-scored
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_part_criticality', "CREATE TABLE `spare_part_criticality` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `spare_part_id` INT UNSIGNED NOT NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `level` ENUM('A','B','C','D') NOT NULL DEFAULT 'C' COMMENT 'A=critical, B=important, C=standard, D=non-critical',
  `method` ENUM('manual','weighted') NOT NULL DEFAULT 'manual' COMMENT 'manual = engineer decision; weighted = factors_json scored with approved weights',
  `score` DECIMAL(6,2) NULL,
  `factors_json` JSON NULL COMMENT 'only meaningful when method=weighted; stores the exact factor values used',
  `long_lead` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'long/irregular supply route',
  `single_source` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'sole-source item',
  `is_critical_spare` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'explicit critical-spare flag; level A also implies critical',
  `lead_time_days` INT UNSIGNED NULL,
  `reason` VARCHAR(500) NOT NULL COMMENT 'mandatory justification, shown verbatim in the UI',
  `is_current` TINYINT(1) NOT NULL DEFAULT 1,
  `current_guard` INT UNSIGNED GENERATED ALWAYS AS (IF(`is_current` = 1, `spare_part_id`, NULL)) VIRTUAL COMMENT 'unique guard: at most ONE current assessment per spare part',
  `assessed_by` INT UNSIGNED NULL,
  `assessed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spc_part_version` (`spare_part_id`,`version`),
  UNIQUE KEY `uk_spc_current` (`current_guard`),
  KEY `idx_spc_level` (`level`),
  KEY `idx_spc_current` (`is_current`),
  KEY `idx_spc_critical` (`is_critical_spare`),
  CONSTRAINT `fk_spc_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spc_user` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='versioned spare-part criticality assessment (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 3) spare_part_reservations — a real hold, distinct from a request or an issue
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_part_reservations', "CREATE TABLE `spare_part_reservations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reservation_no` VARCHAR(40) NOT NULL,
  `spare_part_id` INT UNSIGNED NOT NULL,
  `warehouse_id` INT UNSIGNED NULL,
  `source_type` ENUM('work_order','pm','project','other') NOT NULL DEFAULT 'work_order',
  `source_id` INT UNSIGNED NULL,
  `source_no` VARCHAR(50) NULL,
  `qty` DECIMAL(12,3) NOT NULL,
  `qty_consumed` DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `status` ENUM('held','partially_consumed','consumed','released','expired','cancelled') NOT NULL DEFAULT 'held',
  `needed_by` DATE NULL,
  `expires_at` DATETIME NULL,
  `note` VARCHAR(500) NULL,
  `released_by` INT UNSIGNED NULL,
  `released_at` DATETIME NULL,
  `release_reason` VARCHAR(500) NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_spr_no` (`reservation_no`),
  KEY `idx_spr_part_status` (`spare_part_id`,`status`),
  KEY `idx_spr_source` (`source_type`,`source_id`),
  KEY `idx_spr_status` (`status`),
  KEY `idx_spr_needed_by` (`needed_by`),
  KEY `idx_spr_expires` (`expires_at`),
  KEY `idx_spr_warehouse` (`warehouse_id`),
  CONSTRAINT `fk_spr_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spr_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `spare_warehouses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_spr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_spr_released_by` FOREIGN KEY (`released_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CMMS stock reservation (a hold - never a Sage stock movement) (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 4) spare_part_reservation_events — append-only timeline
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_part_reservation_events', "CREATE TABLE `spare_part_reservation_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reservation_id` INT UNSIGNED NOT NULL,
  `action` VARCHAR(40) NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NULL,
  `qty` DECIMAL(12,3) NULL,
  `description` VARCHAR(500) NULL,
  `performed_by` INT UNSIGNED NULL,
  `performed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_spre_reservation` (`reservation_id`),
  KEY `idx_spre_action` (`action`),
  CONSTRAINT `fk_spre_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `spare_part_reservations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spre_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only reservation timeline (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 5) spare_part_substitutes — approved substitution with effective dates
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_part_substitutes', "CREATE TABLE `spare_part_substitutes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `primary_spare_part_id` INT UNSIGNED NOT NULL,
  `substitute_spare_part_id` INT UNSIGNED NOT NULL,
  `ratio` DECIMAL(10,4) NOT NULL DEFAULT 1.0000 COMMENT 'substitute qty needed per 1 unit of primary',
  `status` ENUM('proposed','approved','rejected','expired') NOT NULL DEFAULT 'proposed',
  `reason` VARCHAR(500) NULL,
  `technical_note` TEXT NULL,
  `approved_by` INT UNSIGNED NULL,
  `approved_at` DATETIME NULL,
  `effective_from` DATE NULL,
  `effective_to` DATE NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sps_pair` (`primary_spare_part_id`,`substitute_spare_part_id`),
  KEY `idx_sps_primary` (`primary_spare_part_id`,`status`),
  KEY `idx_sps_substitute` (`substitute_spare_part_id`),
  KEY `idx_sps_effective` (`effective_from`,`effective_to`),
  CONSTRAINT `fk_sps_primary` FOREIGN KEY (`primary_spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sps_substitute` FOREIGN KEY (`substitute_spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sps_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='approved spare-part substitution (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 6) spare_minmax_history — append-only configuration history
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_minmax_history', "CREATE TABLE `spare_minmax_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `spare_part_id` INT UNSIGNED NOT NULL,
  `old_policy` VARCHAR(20) NULL,
  `old_min_stock` DECIMAL(12,3) NULL,
  `old_max_stock` DECIMAL(12,3) NULL,
  `old_safety_stock` DECIMAL(12,3) NULL,
  `old_reorder_point` DECIMAL(12,3) NULL,
  `old_reorder_qty` DECIMAL(12,3) NULL,
  `old_lead_time_days` INT UNSIGNED NULL,
  `old_service_level` DECIMAL(5,2) NULL,
  `new_policy` VARCHAR(20) NULL,
  `new_min_stock` DECIMAL(12,3) NULL,
  `new_max_stock` DECIMAL(12,3) NULL,
  `new_safety_stock` DECIMAL(12,3) NULL,
  `new_reorder_point` DECIMAL(12,3) NULL,
  `new_reorder_qty` DECIMAL(12,3) NULL,
  `new_lead_time_days` INT UNSIGNED NULL,
  `new_service_level` DECIMAL(5,2) NULL,
  `method` VARCHAR(40) NULL COMMENT 'manual | derived - how the new values were produced',
  `calculated_json` JSON NULL COMMENT 'the exact demand/lead-time/inputs used when method=derived',
  `run_id` INT UNSIGNED NULL COMMENT 'spare_optimization_runs.id when produced by an analysis run',
  `reason` VARCHAR(500) NOT NULL,
  `changed_by` INT UNSIGNED NULL,
  `changed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_smh_part` (`spare_part_id`,`changed_at`),
  KEY `idx_smh_method` (`method`),
  KEY `idx_smh_by` (`changed_by`),
  KEY `idx_smh_run` (`run_id`),
  CONSTRAINT `fk_smh_part` FOREIGN KEY (`spare_part_id`) REFERENCES `spare_parts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smh_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only min/max/reorder configuration history (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 7) spare_optimization_runs — transparency: which inputs produced which findings
 * ──────────────────────────────────────────────────────────────────────────── */
$createTable('spare_optimization_runs', "CREATE TABLE `spare_optimization_runs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_no` VARCHAR(40) NOT NULL,
  `scope` ENUM('full','category','warehouse','criticality','minmax','abc','obsolescence') NOT NULL DEFAULT 'full',
  `parts_analyzed` INT UNSIGNED NOT NULL DEFAULT 0,
  `parts_with_reliable_demand` INT UNSIGNED NOT NULL DEFAULT 0,
  `total_value` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `suggested_order_value` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `inputs_json` JSON NULL COMMENT 'thresholds + windows + sources actually used by this run',
  `findings_json` JSON NULL COMMENT 'counts and per-class aggregates produced by this run',
  `status` ENUM('ok','partial','failed') NOT NULL DEFAULT 'ok',
  `note` VARCHAR(500) NULL,
  `triggered_by` INT UNSIGNED NULL,
  `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` DATETIME NULL,
  `duration_ms` INT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sor_run_no` (`run_no`),
  KEY `idx_sor_scope` (`scope`),
  KEY `idx_sor_started` (`started_at`),
  KEY `idx_sor_by` (`triggered_by`),
  CONSTRAINT `fk_sor_user` FOREIGN KEY (`triggered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='optimization analysis runs with recorded inputs (Phase 33)'");

/* ────────────────────────────────────────────────────────────────────────────
 * 7b) spare_optimization_runs.status — add 'running'
 * ──────────────────────────────────────────────────────────────────────────── */
$ensureEnumValue('spare_optimization_runs', 'status', 'running',
    "ENUM('running','ok','partial','failed') NOT NULL DEFAULT 'running' COMMENT 'running = กำลังวิเคราะห์อยู่; ok/partial/failed = จบแล้ว'");

/* ────────────────────────────────────────────────────────────────────────────
 * 8) spare_parts — additive maintenance columns (never touches Sage-sourced columns)
 * ──────────────────────────────────────────────────────────────────────────── */
if ($hasTable('spare_parts')) {
    $addColumn('spare_parts', 'safety_stock',    "DECIMAL(12,3) NOT NULL DEFAULT 0.000 COMMENT 'CMMS safety stock (Phase 33)'");
    $addColumn('spare_parts', 'reorder_point',   "DECIMAL(12,3) NULL COMMENT 'NULL = derive from real demand; a number here is a human override'");
    $addColumn('spare_parts', 'reorder_qty',     "DECIMAL(12,3) NULL COMMENT 'suggested order quantity when below reorder point'");
    $addColumn('spare_parts', 'lead_time_days',  "INT UNSIGNED NULL COMMENT 'supplier lead time in days (CMMS input for reorder point)'");
    $addColumn('spare_parts', 'service_level',   "DECIMAL(5,2) NULL COMMENT 'target service level percent, e.g. 95.00'");
    $addColumn('spare_parts', 'minmax_policy',   "ENUM('manual','derived','unset') NOT NULL DEFAULT 'unset'");
    $addColumn('spare_parts', 'minmax_locked',   "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = never overwrite with a derived proposal'");
    $addColumn('spare_parts', 'minmax_reason',   "VARCHAR(500) NULL");
    $addColumn('spare_parts', 'minmax_updated_by', "INT UNSIGNED NULL");
    $addColumn('spare_parts', 'minmax_updated_at', "DATETIME NULL");
    $addColumn('spare_parts', 'warehouse_id',    "INT UNSIGNED NULL COMMENT 'default CMMS issue warehouse (registry id, not a Sage authority)'");
    $addColumn('spare_parts', 'abc_class',       "CHAR(1) NULL COMMENT 'A/B/C value class from the last completed analysis run'");
    $addColumn('spare_parts', 'last_movement_at', "DATETIME NULL COMMENT 'last REAL recorded movement (ledger), never a row-timestamp proxy'");

    $addIndex('spare_parts', 'idx_sp_minmax',        'minmax_policy, min_stock, max_stock');
    $addIndex('spare_parts', 'idx_sp_abc',           'abc_class');
    $addIndex('spare_parts', 'idx_sp_last_movement', 'last_movement_at');
    $addIndex('spare_parts', 'idx_sp_warehouse',     'warehouse_id');
    $addFk('spare_parts', 'fk_sp_warehouse', 'warehouse_id', 'spare_warehouses', 'id', 'SET NULL');
    $addFk('spare_parts', 'fk_sp_minmax_user', 'minmax_updated_by', 'users', 'id', 'SET NULL');
}

/* ────────────────────────────────────────────────────────────────────────────
 * 9) spare_part_transactions — extend the EXISTING ledger, never create a second one
 * ──────────────────────────────────────────────────────────────────────────── */
if ($hasTable('spare_part_transactions')) {
    $addColumn('spare_part_transactions', 'qty_before',        "DECIMAL(12,3) NULL COMMENT 'on-hand before this movement (from the CMMS cache at write time)'");
    $addColumn('spare_part_transactions', 'qty_after',         "DECIMAL(12,3) NULL COMMENT 'on-hand after this movement'");
    $addColumn('spare_part_transactions', 'warehouse_id',      "INT UNSIGNED NULL");
    $addColumn('spare_part_transactions', 'movement_date',     "DATE NULL COMMENT 'business date; defaults to created_at'");
    $addColumn('spare_part_transactions', 'balance_source',    "ENUM('sage_sync','stock_take','wo_usage','pm_usage','issue','return','adjustment') NOT NULL DEFAULT 'adjustment' COMMENT 'which code path moved the stock'");
    $addColumn('spare_part_transactions', 'confirmed_by_sage', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = movement was confirmed by a Sage document number'");
    $addColumn('spare_part_transactions', 'client_action_id',  "VARCHAR(64) NULL COMMENT 'offline/retry idempotency key (Phase 19 engine)'");

    $addIndex('spare_part_transactions', 'idx_spt_part_date',   'spare_part_id, created_at');
    $addIndex('spare_part_transactions', 'idx_spt_balance_src', 'balance_source');
    $addIndex('spare_part_transactions', 'idx_spt_movement',    'movement_date');
    $addUnique('spare_part_transactions', 'uk_spt_client_action', 'client_action_id');
    $addFk('spare_part_transactions', 'fk_spt_warehouse', 'warehouse_id', 'spare_warehouses', 'id', 'SET NULL');
}

/* ────────────────────────────────────────────────────────────────────────────
 * 10) settings — group spare_optimization
 * ──────────────────────────────────────────────────────────────────────────── */
$spSettings = [
    // ── demand analytics (real recorded movement only) ──
    'sp_demand_window_days' => ['365', 'หน้าต่างวิเคราะห์ความต้องการ (วัน) — นับจาก spare_part_transactions ที่บันทึกจริงเท่านั้น'],
    'sp_demand_min_movements' => ['3', 'จำนวน movement ขั้นต่ำในหน้าต่างก่อนถือว่าความต้องการเชื่อถือได้'],
    'sp_demand_min_days_span' => ['90', 'ระยะเวลาครอบคลุมของ movement ขั้นต่ำ (วัน) ก่อนถือว่าความต้องการเชื่อถือได้'],
    'sp_demand_reliable' => ['1', '1 = ใช้ความต้องการจริงในการคำนวณ reorder point เท่านั้น (ไม่เดาจาก min/max)'],
    // ── min/max / safety stock / reorder ──
    'sp_minmax_enforce' => ['1', '1 = บังคับ min_stock <= max_stock และปฏิเสธค่าติดลบ'],
    'sp_safety_stock_factor' => ['0.5', 'สัดส่วน safety stock เทียบกับ reorder point (ใช้เมื่อคำนวณแบบ derived เท่านั้น)'],
    'sp_default_lead_time_days' => ['30', 'lead time เริ่มต้น (วัน) เมื่อไม่ได้กำหนดไว้รายอะไหล่'],
    'sp_default_service_level' => ['95', 'service level เป้าหมายเริ่มต้น (%)'],
    'sp_reorder_qty_method' => ['eoq', 'วิธีคำนวณ reorder_qty: eoq | max_to_max | fixed'],
    'sp_order_cost' => ['500', 'ต้นทุนคงที่ต่อครั้งที่สั่ง (บาท) — ใช้คำนวณ EOQ'],
    'sp_holding_rate' => ['0.20', 'อัตราต้นทุนถือครองต่อปี (เช่น 0.20 = 20%) — ใช้คำนวณ EOQ'],
    'sp_minmax_apply_requires_confirm' => ['1', '1 = ค่าที่คำนวณได้เป็นเพียงข้อเสนอ ต้องมีผู้ยืนยันก่อนบันทึกจริง'],
    'sp_minmax_skip_locked' => ['1', '1 = ข้ามรายการที่ minmax_locked = 1 เสมอ'],
    'sp_minmax_skip_critical' => ['0', '1 = ข้ามรายการอะไหล่ critical (ระดับ A) ในการคำนวณอัตโนมัติ'],
    // ── criticality ──
    'sp_criticality_levels' => ['[{"key":"A","label":"วิกฤต (Critical)","critical":true},{"key":"B","label":"สำคัญ (Important)","critical":false},{"key":"C","label":"มาตรฐาน (Standard)","critical":false},{"key":"D","label":"ไม่วิกฤต (Non-critical)","critical":false}]', 'ระดับความสำคัญของอะไหล่'],
    'sp_criticality_methods' => ['[{"key":"manual","label":"กำหนดโดยผู้เชี่ยวชาญ (ต้องมีเหตุผล)"},{"key":"weighted","label":"คำนวณจากปัจจัยที่อนุมัติแล้ว (น้ำหนักตายตัว)"}]', 'วิธีกำหนดความสำคัญ'],
    'sp_criticality_factors' => ['[{"key":"asset_criticality","label":"ความสำคัญของเครื่องจักรที่ใช้","weight":4},{"key":"downtime_risk","label":"ความเสี่ยงจากการหยุดเครื่อง","weight":3},{"key":"lead_time","label":"ระยะเวลาจัดหา/นำเข้า","weight":3},{"key":"single_source","label":"มีผู้ผลิตรายเดียว","weight":2},{"key":"no_substitute","label":"ไม่มีอะไหล่ทดแทน","weight":2},{"key":"failure_history","label":"ความถี่จากประวัติเหตุขัดข้อง","weight":2},{"key":"stock_value","label":"มูลค่าสต็อก","weight":1}]', 'ปัจจัยและน้ำหนักของการประเมิน criticality (ใช้ได้เฉพาะ method=weighted)'],
    'sp_criticality_a_score' => ['70', 'คะแนนขั้นต่ำ (เต็ม 100) ที่จะได้ระดับ A'],
    'sp_criticality_b_score' => ['45', 'คะแนนขั้นต่ำ (เต็ม 100) ที่จะได้ระดับ B'],
    'sp_criticality_c_score' => ['20', 'คะแนนขั้นต่ำ (เต็ม 100) ที่จะได้ระดับ C'],
    'sp_criticality_auto' => ['0', '0 = ห้ามคะแนน criticality อัตโนมัติโดยไม่มีผู้ยืนยัน — ระบบเสนอค่า ผู้ใช้ยืนยันก่อนบันทึก'],
    'sp_criticality_reason_required' => ['1', '1 = บังคับให้มีเหตุผลประกอบทุกครั้งที่ประเมิน criticality'],
    // ── reservation ──
    'sp_reservation_default_days' => ['30', 'อายุการจองเริ่มต้น (วัน) เมื่อไม่ระบุ'],
    'sp_reservation_auto_expire' => ['1', '1 = ปล่อยการจองที่หมดอายุเป็น scheduled job ได้ (ไม่ลบ เพียงเปลี่ยนเป็น expired)'],
    'sp_reservation_blocks_issue' => ['1', '1 = เบิกอะไหล่ที่มีการจองค้างไม่ได้เกินจำนวนที่จอง'],
    'sp_reservation_overdraw' => ['0', '1 = อนุญาตจองเกินจำนวนคงเหลือ (ค่าเริ่มต้น 0 = ไม่อนุญาต)'],
    // ── ABC / obsolescence ──
    'sp_abc_a_pct' => ['80', 'สัดส่วนมูลค่าสะสมของกลุ่ม A (%)'],
    'sp_abc_b_pct' => ['95', 'สัดส่วนมูลค่าสะสมของกลุ่ม A+B (%)'],
    'sp_slow_moving_days' => ['180', 'ไม่มีการเคลื่อนไหวเกินกี่วันจึงถือว่าเคลื่อนไหวช้า'],
    'sp_dead_stock_days' => ['365', 'ไม่มีการเคลื่อนไหวเกินกี่วันจึงถือว่าสต็อกค้าง (นับจาก movement จริง ไม่ใช่ updated_at)'],
    'sp_dead_stock_min_value' => ['0', 'มูลค่าขั้นต่ำ (บาท) ของสต็อกค้างที่จะรายงาน'],
    'sp_excess_over_max_ratio' => ['1.0', 'สต็อกเกิน max_stock กี่เท่าจึงถือว่าเกิน (1.0 = เกินแค่ max_stock)'],
    'sp_critical_exempt_from_obsolete' => ['1', '1 = อะไหล่ critical (ระดับ A) ไม่ถูกจัดเป็นสต็อกค้าง/ล้างคลังอัตโนมัติ'],
    // ── substitutes ──
    'sp_substitute_require_approval' => ['1', '1 = ตัวแทนสามารถใช้ได้เฉพาะเมื่อสถานะ approved และอยู่ในช่วง effective'],
    'sp_substitute_require_dates' => ['1', '1 = บังคับระบุ effective_from และ effective_to'],
    // ── warehouse ──
    'sp_warehouse_allow_cmms_created' => ['0', '0 = ห้ามสร้างคลังใหม่ใน CMMS ถ้า Sage ไม่มี (คลังใน Sage คือ authoritative)'],
    'sp_warehouse_quarantine_blocks_issue' => ['1', '1 = ไม่ให้เบิกจากคลังกักกัน (is_quarantine = 1)'],
    // ── data freshness ──
    'sp_stale_sync_hours' => ['24', 'ข้อมูล Sage เก่ากว่ากี่ชั่วโมงแล้วถือว่าเป็น LAST KNOWN DATA'],
    'sp_stale_sync_blocks_minmax' => ['1', '1 = ห้ามคำนวณ/เสนอค่า min-max จากข้อมูล Sage ที่ล้าสมัยเกินกำหนด'],
    // ── explicit non-automation guards ──
    'phase33_auto_procurement' => ['0', '0 = เครื่องมือนี้ไม่สั่งซื้อ/ไม่สร้าง PO — เสนอเท่านั้น การจัดซื้อต้องผ่านขั้นตอนที่อนุมัติ'],
    'phase33_auto_minmax_write' => ['0', '0 = ค่า min/max ที่คำนวณได้เป็นข้อเสนอเท่านั้น ต้องยืนยันด้วยตนเองก่อนบันทึก'],
    'phase33_auto_criticality' => ['0', '0 = ไม่กำหนด criticality อัตโนมัติโดยไม่มีผู้ยืนยัน'],
    'phase33_reservation_deducts_stock' => ['0', '0 = การจองใน CMMS ไม่หักสต็อก Sage — สต็อกลดจริงเมื่อมีการเบิกจ่ายเท่านั้น'],
    'phase33_ai_scoring' => ['0', '0 = ไม่มีคะแนน AI/โมเดลซ่อน — ทุกค่าคำนวณมาจากสูตรที่แสดงได้และบันทึก inputs ไว้'],
    'phase33_applied_ver' => ['2026-09-28', 'เลขเวอร์ชัน migration Phase 33 ครั้งล่าสุด'],
];
foreach ($spSettings as $k => [$v, $desc]) {
    $exists = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $exists->execute([$k]);
    if ((int)$exists->fetchColumn() === 0) {
        $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "spare_optimization", ?)')
            ->execute([$k, $v, $desc]);
        $log("+ settings.$k");
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 11) notification_templates — module spare_optimization
 * ──────────────────────────────────────────────────────────────────────────── */
$ntpls = [
    ['spare_optimization', 'stockout_risk', 'เสี่ยงขาดสต็อก: {part_code}', "อะไหล่ {part_name} ({part_code}) {risk_level}\nคงเหลือ {available} / จุดสั่งซื้อ {reorder_point} (ข้อมูล Sage ณ {as_of})", 'high', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'minmax_review_due', 'ทบทวน Min/Max: {part_code}', "อะไหล่ {part_name} ({part_code}) ครบกำหนดทบทวน Min/Max\nวันที่ทบทวนล่าสุด: {reviewed_at}", 'medium', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'criticality_review_due', 'ทบทวนความสำคัญอะไหล่: {part_code}', "อะไหล่ {part_name} ({part_code}) ระดับ {level} ครบกำหนดทบทวน\nผู้ประเมิน: {assessed_by}", 'medium', '/spare_parts/criticality?part_id={spare_part_id}'],
    ['spare_optimization', 'reservation_created', 'จองอะไหล่แล้ว: {reservation_no}', "จอง {part_name} ({part_code}) จำนวน {qty} {unit} ไว้ให้ {source_no}\nคงเหลือหลังจอง: {available}", 'info', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'reservation_conflict', 'จองอะไหล่ไม่ได้: {part_code}', "อะไหล่ {part_name} ({part_code}) จองไม่ได้\nคงเหลือ {available} แต่คำขอ {qty} (กำลังจองอยู่ {already_reserved})", 'high', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'reservation_expiring', 'การจองใกล้หมดอายุ: {reservation_no}', "การจอง {part_name} ({part_code}) หมดอายุ {expires_at}\nอ้างอิงงาน: {source_no}", 'medium', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'reservation_released', 'ปล่อยการจองแล้ว: {reservation_no}', "ปล่อยการจอง {part_name} ({part_code}) จำนวน {qty}\nเหตุผล: {reason}", 'info', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'reservation_expired', 'การจองหมดอายุ: {reservation_no}', "ระบบปล่อยการจอง {part_name} ({part_code}) เนื่องจากหมดอายุ\nอ้างอิงงาน: {source_no}", 'medium', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'substitute_proposed', 'เสนออะไหล่ทดแทน: {part_code}', "เสนอใช้ {substitute_code} แทน {part_code} (อัตราส่วน {ratio})\nผู้เสนอ: {requester}", 'medium', '/spare_parts/criticality?part_id={spare_part_id}'],
    ['spare_optimization', 'substitute_decision', 'ผลการพิจารณาอะไหล่ทดแทน: {part_code}', "{substitute_code} แทน {part_code} — {decision}\nผู้พิจารณา: {approver}", 'medium', '/spare_parts/criticality?part_id={spare_part_id}'],
    ['spare_optimization', 'slow_moving_review', 'อะไหล่เคลื่อนไหวช้า: {part_code}', "อะไหล่ {part_name} ({part_code}) ไม่มีการเคลื่อนไหว {days} วัน\nมูลค่าคงเหลือ: {value} — ต้องทบทวน ไม่ใช่ตัดจำหน่ายอัตโนมัติ", 'medium', '/spare_parts/optimization?part_id={spare_part_id}'],
    ['spare_optimization', 'run_completed', 'ประมวลผลวิเคราะห์คลังอะไหล่เสร็จแล้ว: {run_no}', "วิเคราะห์ {parts_analyzed} รายการ (ใช้ข้อมูลที่เชื่อถือได้ {parts_reliable} รายการ)\nมูลค่าที่แนะนำสั่งซื้อ: {suggested_value} — เป็นข้อเสนอเท่านั้น", 'info', '/spare_parts/optimization'],
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

/* ────────────────────────────────────────────────────────────────────────────
 * 12) menu_permissions
 * ──────────────────────────────────────────────────────────────────────────── */
$menuMap = [
    'spare_parts/optimization' => [1, 2, 6, 7, 3, 5],
    'spare_parts/warehouses'   => [1, 2, 6, 7, 5],
    'spare_parts/criticality'   => [1, 2, 6, 7, 5],
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

$log(PHP_EOL . "Phase 33 migration done. changed=$changed");
