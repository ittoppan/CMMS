<?php
/**
 * scripts/apply_phase36_iot_condition.php - idempotent DB migration (Phase 36)
 *
 * IoT & Condition Monitoring - an INTAKE + CONDITION LAYER for the CMMS.
 * It owns telemetry intake, point definitions, threshold rules, alarms and an
 * explainable per-asset condition snapshot. It owns NOTHING that another phase owns.
 *
 *   1) iot_sources        - a data source identity (auth, rate limit, payload budget)
 *   2) iot_gateways       - edge collectors that publish on behalf of devices
 *   3) iot_devices        - LEGACY table, reconciled additively (never rewritten)
 *   4) iot_points         - measurement points (tags) per device: unit + scaling + range
 *   5) iot_readings       - raw readings. Dedupe key, source_ts vs received_at, quality
 *   6) iot_rollups        - pre-aggregated buckets so raw readings can expire
 *   7) iot_threshold_rules- versioned, effective-dated rules (warn/critical, ROC, missing)
 *   8) iot_alarms         - alarm instances with a real lifecycle
 *   9) iot_alarm_events   - append-only alarm history
 *  10) iot_connectors     - connector registry + observable run status
 *  11) iot_ingest_log     - per-batch intake audit (accepted/duplicate/out_of_order/...)
 *  12) iot_rate_limits    - fixed-window intake counters (per source)
 *  13) asset_condition_snapshots - EXPLAINABLE condition indicator per asset (no score)
 *  14) iot_retention_policies    - data-class retention, operator-runnable and retryable
 *  15) settings group iot
 *  16) notification_templates module iot
 *  17) menu_permissions for the new IoT routes
 *
 * DATA OWNERSHIP (enforced by schema comments + src/helpers/iot.php)
 *   asset_registry                     = asset master. iot_devices.asset_id is a LINK.
 *   repair + work_assignees            = the ONE work order store. iot_alarms.linked_repair_id is a LINK.
 *   failure_events + rca_records       = the ONE RCA store. An alarm links, it never duplicates.
 *   calibration_instruments            = instrument calibration. An instrument may back a point.
 *   asset_measurements                 = MANUAL condition measurements. A point links to an
 *                                        asset; this phase does NOT write manual rows.
 *   users + departments                = the ONE person + organization master
 *   audit_logs                         = cross-phase audit trail (audit_log())
 *   notification_events / inbox        = NotificationCenterService::notify() dedupe + delivery
 *
 * NON-NEGOTIABLE GUARDS
 *   1) NO BROWSER-TO-PLC. There is no column, table or code path that stores an
 *      industrial protocol address as something a browser may dial. protocol/ip/port
 *      are CONNECTOR attributes, and connectors authenticate as their own source.
 *   2) NO SECRET VALUES IN THIS SCHEMA. auth_secret_ref stores the NAME of an
 *      environment variable or settings key. The value never enters this database.
 *   3) NO INVENTED CONDITION NUMBER. asset_condition_snapshots has no score column.
 *      It stores completeness + worst severity + an explainable indicator list.
 *   4) NOTHING DESTRUCTIVE. Every statement is CREATE TABLE IF NOT EXISTS or
 *      ALTER TABLE ... ADD. Legacy rows in iot_devices are never rewritten, and
 *      iot_sensor_data is never read as if it were live telemetry.
 *
 * HONEST GAPS recorded by this migration (see docs/PHASE_36_REPORT.md)
 *   - iot_devices.asset_id is `INT` (signed) while asset_registry.id is `INT UNSIGNED`,
 *     so a real FK cannot be created without rewriting the legacy column type. This
 *     migration adds an index and the engine validates the asset in PHP instead. The
 *     mismatch is documented, not silently ignored.
 *   - iot_devices.vibration_threshold / temp_threshold stay as LEGACY display hints.
 *     They are never evaluated. Rule evaluation reads iot_threshold_rules only, because
 *     a column that looks like a limit but is never enforced is worse than no column.
 *   - iot_sensor_data keeps its 12 stale rows. It is deprecated and read-only, exposed
 *     only through iot_legacy_readings() with a deprecation label.
 *
 * NOTE: DDL COMMENTs are ASCII-only because MySQL may reject multi-byte COMMENT strings on
 * some connections; Thai copy lives in PHP data seeds and in docs/*.md.
 *
 * Run: php scripts/apply_phase36_iot_condition.php --apply
 *   --dry-run   print every statement that would run, touch nothing
 *   --apply     execute (requires --yes, or a non-production database name)
 *   --yes       acknowledge that this writes to the live schema
 *   --help      usage only
 *
 * The flag is mandatory on purpose. This script alters a live schema, and an earlier
 * revision of it ran with no argument parsing at all - passing --help executed the
 * migration and was then killed by a truncated shell pipeline, leaving the live database
 * holding a partial set of tables. Requiring an explicit --apply means a stray argument,
 * an IDE "run", or a mistyped command prints usage instead of writing.
 */

$argvFlags = [];
foreach (array_slice($argv ?? [], 1) as $arg) {
    $argvFlags[ltrim((string)$arg, '-')] = true;
}
if (isset($argvFlags['help']) || isset($argvFlags['h'])) {
    echo "Usage:\n";
    echo "  php scripts/apply_phase36_iot_condition.php --dry-run\n";
    echo "  php scripts/apply_phase36_iot_condition.php --apply [--yes]\n\n";
    echo "This migration writes to the database schema. Nothing runs without --apply.\n";
    exit(0);
}
if (!isset($argvFlags['apply'])) {
    fwrite(STDERR, "Refusing to run: this migration writes to the schema.\n"
        . "Use --dry-run to preview, or --apply to execute.\n");
    exit(2);
}

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$targetDb = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
$isProdLike = (bool)preg_match('/^(cmms|cmms_|cmmstpt)/i', $targetDb)
    || !preg_match('/(_sdtest|_test|_dev|_scratch|_tmp)$/i', $targetDb);
if ($isProdLike && !isset($argvFlags['yes'])) {
    fwrite(STDERR, "Refusing to run: target database '{$targetDb}' looks like production.\n"
        . "Re-run with --yes to confirm you want to alter this schema.\n"
        . "Scratch databases ending in _sdtest/_test/_dev do not need --yes.\n");
    exit(3);
}
echo "target database: {$targetDb}" . PHP_EOL;

$DRY_RUN = !empty($argvFlags['dry-run']) && empty($argvFlags['apply-dry']);
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

$hasFk = function (string $table, string $fk) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                           AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = "FOREIGN KEY"');
    $st->execute([$table, $fk]);
    return (int)$st->fetchColumn() > 0;
};

/*
 * Additive reconciliation. createTable() is all-or-nothing, so a schema created by an
 * EARLIER revision of this script would otherwise keep the old shape forever. Every later
 * column/index this script depends on is declared here, so re-running converges.
 */
$addColumn = function (string $table, string $column, string $definition) use ($pdo, $hasColumn, $hasTable, $log, &$changed, &$DRY_RUN): void {
    if (!$hasTable($table)) { $log("- $table missing, skipped column $column"); return; }
    if (!$hasColumn($table, $column)) {
        if (!empty($GLOBALS['DRY_RUN']) || !empty($DRY_RUN)) {
            $log("~ $table.$column (would be added)");
            return;
        }
        $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
        $log("~ $table.$column (added)");
        $changed++;
    }
};

$addIndex = function (string $table, string $index, string $cols) use ($pdo, $hasIndex, $hasTable, $log, &$changed, &$DRY_RUN): void {
    if (!$hasTable($table)) { $log("- $table missing, skipped index $index"); return; }
    if (!$hasIndex($table, $index)) {
        if (!empty($GLOBALS['DRY_RUN']) || !empty($DRY_RUN)) {
            $log("~ $table.$index (would be added)");
            return;
        }
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `$index` ($cols)");
        $log("~ $table.$index (added)");
        $changed++;
    }
};

$addFk = function (string $table, string $fk, string $definition) use ($pdo, $hasFk, $hasTable, $log, &$changed, &$DRY_RUN): void {
    if (!$hasTable($table)) { $log("- $table missing, skipped fk $fk"); return; }
    if (!$hasFk($table, $fk)) {
        if (!empty($GLOBALS['DRY_RUN']) || !empty($DRY_RUN)) {
            $log("~ $table.$fk (would be added)");
            return;
        }
        $pdo->exec("ALTER TABLE `$table` ADD CONSTRAINT `$fk` $definition");
        $log("~ $table.$fk (added)");
        $changed++;
    }
};

$createTable = function (string $name, string $sql) use ($pdo, $hasTable, $log, &$changed, &$DRY_RUN): void {
    if ($hasTable($name)) {
        $log("~ $name (existed)");
        return;
    }
    if (!empty($GLOBALS['DRY_RUN']) || !empty($DRY_RUN)) {
        $log("+ $name (would be created)");
        return;
    }
    $pdo->exec($sql);
    $log("+ $name");
    $changed++;
};

/* ============================================================
 * 1) iot_sources - who is allowed to push telemetry
 * ============================================================ */
$createTable('iot_sources', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_sources (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_code         VARCHAR(60) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  source_type         ENUM('http','mqtt','scheduled','file_import','manual','edge') NOT NULL DEFAULT 'http',
  protocol            VARCHAR(40) NOT NULL DEFAULT '',
  base_url            VARCHAR(255) NOT NULL DEFAULT '',
  auth_type           ENUM('none','api_key','bearer','hmac','mtls','basic') NOT NULL DEFAULT 'api_key',
  auth_secret_ref     VARCHAR(160) NOT NULL DEFAULT '' COMMENT 'NAME of an env var or settings key. Never the secret value.',
  enabled             TINYINT(1) NOT NULL DEFAULT 1,
  is_trusted          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = readings are accepted without per-point confirmation',
  rate_limit_per_min  INT UNSIGNED NOT NULL DEFAULT 600,
  max_batch_readings  INT UNSIGNED NOT NULL DEFAULT 500,
  max_payload_bytes   INT UNSIGNED NOT NULL DEFAULT 262144,
  timezone            VARCHAR(64) NOT NULL DEFAULT 'Asia/Bangkok',
  last_seen_at        DATETIME NULL,
  last_status         ENUM('never','ok','degraded','error','disabled') NOT NULL DEFAULT 'never',
  last_error          VARCHAR(500) NOT NULL DEFAULT '',
  notes               TEXT NULL,
  created_by          INT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_src_code (source_code),
  KEY idx_iot_src_seen (last_seen_at),
  CONSTRAINT fk_iot_src_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 2) iot_gateways - edge collectors
 * ============================================================ */
$createTable('iot_gateways', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_gateways (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id           INT UNSIGNED NULL,
  gateway_code        VARCHAR(60) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  location            VARCHAR(255) NOT NULL DEFAULT '',
  protocol            VARCHAR(40) NOT NULL DEFAULT '',
  firmware_version    VARCHAR(60) NOT NULL DEFAULT '',
  ip_address          VARCHAR(45) NOT NULL DEFAULT '',
  port                INT UNSIGNED NULL,
  lifecycle_status    ENUM('registered','configured','commissioned','active','maintenance','retired') NOT NULL DEFAULT 'registered',
  last_heartbeat_at   DATETIME NULL,
  commissioned_at     DATETIME NULL,
  commissioned_by     INT UNSIGNED NULL,
  notes               TEXT NULL,
  created_by          INT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_gw_code (gateway_code),
  KEY idx_iot_gw_source (source_id),
  KEY idx_iot_gw_hb (last_heartbeat_at),
  CONSTRAINT fk_iot_gw_source FOREIGN KEY (source_id) REFERENCES iot_sources (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_gw_commissioner FOREIGN KEY (commissioned_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_gw_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 3) iot_devices - LEGACY table, reconciled additively
 *
 * Existing shape (created outside every migration, never rewritten here):
 *   id INT, asset_id INT, device_code, sensor_name,
 *   vibration_threshold FLOAT, temp_threshold FLOAT, status, last_ping
 *
 * `vibration_threshold` / `temp_threshold` are KEPT but demoted to legacy display
 * hints. Nothing evaluates them; a limit that is never enforced must not look enforced.
 * ============================================================ */
$createTable('iot_devices', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_devices (
  id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  asset_id          INT NOT NULL,
  device_code       VARCHAR(50) NOT NULL,
  sensor_name       VARCHAR(100) NOT NULL,
  status            VARCHAR(50) NULL DEFAULT 'normal',
  last_ping         DATETIME NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

$addColumn('iot_devices', 'device_type', 'VARCHAR(60) NOT NULL DEFAULT \'\' COMMENT \'vibration|temperature|multisensor|gateway|energy|generic\'');
$addColumn('iot_devices', 'manufacturer', 'VARCHAR(160) NOT NULL DEFAULT \'\'');
$addColumn('iot_devices', 'model', 'VARCHAR(160) NOT NULL DEFAULT \'\'');
$addColumn('iot_devices', 'serial_number', 'VARCHAR(160) NOT NULL DEFAULT \'\'');
$addColumn('iot_devices', 'firmware_version', 'VARCHAR(60) NOT NULL DEFAULT \'\'');
$addColumn('iot_devices', 'source_id', 'INT UNSIGNED NULL');
$addColumn('iot_devices', 'gateway_id', 'INT UNSIGNED NULL');
$addColumn('iot_devices', 'install_location', 'VARCHAR(255) NOT NULL DEFAULT \'\'');
$addColumn('iot_devices', 'timezone', 'VARCHAR(64) NOT NULL DEFAULT \'Asia/Bangkok\'');
$addColumn('iot_devices', 'sample_interval_sec', 'INT UNSIGNED NOT NULL DEFAULT 60');
$addColumn('iot_devices', 'calibration_instrument_id', "INT UNSIGNED NULL COMMENT 'calibration_instruments.id when this device is a measuring instrument'");
$addColumn('iot_devices', 'lifecycle_status', 'ENUM(\'registered\',\'configured\',\'commissioned\',\'active\',\'maintenance\',\'retired\') NOT NULL DEFAULT \'registered\'');
$addColumn('iot_devices', 'commissioned_at', 'DATETIME NULL');
$addColumn('iot_devices', 'retired_at', 'DATETIME NULL');
$addColumn('iot_devices', 'notes', 'TEXT NULL');
$addColumn('iot_devices', 'created_by', 'INT UNSIGNED NULL');
$addColumn('iot_devices', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
$addColumn('iot_devices', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
$addIndex('iot_devices', 'idx_iot_dev_asset', 'asset_id');
$addIndex('iot_devices', 'idx_iot_dev_source', 'source_id');
$addIndex('iot_devices', 'idx_iot_dev_gateway', 'gateway_id');
$addIndex('iot_devices', 'idx_iot_dev_lifecycle', 'lifecycle_status');
$addFk('iot_devices', 'fk_iot_dev_source', 'FOREIGN KEY (source_id) REFERENCES iot_sources (id) ON DELETE SET NULL');
$addFk('iot_devices', 'fk_iot_dev_gateway', 'FOREIGN KEY (gateway_id) REFERENCES iot_gateways (id) ON DELETE SET NULL');
$addFk('iot_devices', 'fk_iot_dev_instr', 'FOREIGN KEY (calibration_instrument_id) REFERENCES calibration_instruments (id) ON DELETE SET NULL');
$addFk('iot_devices', 'fk_iot_dev_creator', 'FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL');

// device_code uniqueness only when the legacy data actually is unique. A duplicate legacy
// code must not abort the migration; it is reported and the engine checks uniqueness on write.
$dupCodes = $pdo->query('SELECT device_code, COUNT(*) c FROM iot_devices GROUP BY device_code HAVING c > 1')->fetchAll(PDO::FETCH_ASSOC);
if ($dupCodes) {
    $log('- iot_devices.device_code has legacy duplicates; unique index NOT created (engine enforces on write)');
    foreach ($dupCodes as $d) {
        $log('    duplicate device_code: ' . $d['device_code'] . ' x' . $d['c']);
    }
} elseif ($hasIndex('iot_devices', 'uk_iot_dev_code')) {
    $log('~ iot_devices.uk_iot_dev_code (existed)');
} else {
    $pdo->exec('ALTER TABLE `iot_devices` ADD UNIQUE INDEX `uk_iot_dev_code` (device_code)');
    $log('~ iot_devices.uk_iot_dev_code (added)');
    $changed++;
}

/* ============================================================
 * 4) iot_points - the measurement definition (tag)
 * ============================================================ */
$createTable('iot_points', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_points (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id             INT NOT NULL,
  point_code            VARCHAR(60) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  point_type            ENUM('analog','digital','state','counter','energy','multi_state') NOT NULL DEFAULT 'analog',
  signal_type           ENUM('temperature','vibration','pressure','humidity','power','energy','runtime','cycle_count','current','voltage','speed','flow','level','oil_quality','other') NOT NULL DEFAULT 'other',
  engineering_unit      VARCHAR(40) NOT NULL DEFAULT '',
  raw_unit              VARCHAR(40) NOT NULL DEFAULT '',
  scale_factor          DECIMAL(20,10) NOT NULL DEFAULT 1.0000000000,
  offset_value          DECIMAL(20,10) NOT NULL DEFAULT 0.0000000000,
  decimals              TINYINT UNSIGNED NOT NULL DEFAULT 2,
  min_eng_value         DECIMAL(20,6) NULL COMMENT 'engineering range floor for a VALID reading',
  max_eng_value         DECIMAL(20,6) NULL COMMENT 'engineering range ceiling for a VALID reading',
  sample_interval_sec   INT UNSIGNED NOT NULL DEFAULT 60,
  stale_after_sec       INT UNSIGNED NOT NULL DEFAULT 900 COMMENT 'no reading inside this window = STALE, never zero',
  is_alarm_capable      TINYINT(1) NOT NULL DEFAULT 1,
  enabled               TINYINT(1) NOT NULL DEFAULT 1,
  description           VARCHAR(500) NOT NULL DEFAULT '',
  created_by            INT UNSIGNED NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_point_code (device_id, point_code),
  KEY idx_iot_point_signal (signal_type),
  KEY idx_iot_point_enabled (enabled),
  CONSTRAINT fk_iot_point_device FOREIGN KEY (device_id) REFERENCES iot_devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_point_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 5) iot_readings - raw intake
 *
 * event_uid is ALWAYS filled: the source event id when supplied, otherwise a
 * deterministic hash of point + source_ts + raw value. That is what makes
 * replay-safe ingestion possible without trusting the source to be idempotent.
 * UNIQUE (point_id, event_uid) is the deduplication barrier.
 * ============================================================ */
$createTable('iot_readings', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_readings (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  point_id          INT UNSIGNED NOT NULL,
  device_id         INT NOT NULL,
  asset_id          INT UNSIGNED NOT NULL COMMENT 'denormalised from iot_devices for fast asset queries',
  source_id         INT UNSIGNED NULL,
  event_uid         VARCHAR(160) NOT NULL COMMENT 'source event id, or sha1(point|source_ts|raw)',
  source_ts         DATETIME(3) NULL COMMENT 'time the source claims; NULL when never supplied',
  received_at       DATETIME(3) NOT NULL COMMENT 'server receive time - never taken from the payload',
  value_num         DECIMAL(20,6) NULL,
  value_text        VARCHAR(255) NULL,
  value_bool        TINYINT(1) NULL,
  raw_value         VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'original evidence, kept verbatim',
  raw_unit          VARCHAR(40) NOT NULL DEFAULT '',
  eng_unit          VARCHAR(40) NOT NULL DEFAULT '',
  quality           ENUM('VALID','INVALID','STALE','DUPLICATE','OUT_OF_ORDER','SOURCE_UNAVAILABLE','UNIT_MISMATCH','MAPPING_ERROR','PROCESSING_ERROR') NOT NULL DEFAULT 'VALID',
  quality_reason    VARCHAR(160) NOT NULL DEFAULT '',
  source_payload    TEXT NULL COMMENT 'redacted source envelope for replay audit',
  UNIQUE KEY uk_iot_read_event (point_id, event_uid),
  KEY idx_iot_read_point_ts (point_id, source_ts),
  KEY idx_iot_read_point_recv (point_id, received_at),
  KEY idx_iot_read_asset_recv (asset_id, received_at),
  KEY idx_iot_read_device_recv (device_id, received_at),
  KEY idx_iot_read_quality (quality, received_at),
  CONSTRAINT fk_iot_read_point FOREIGN KEY (point_id) REFERENCES iot_points (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_read_device FOREIGN KEY (device_id) REFERENCES iot_devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_read_source FOREIGN KEY (source_id) REFERENCES iot_sources (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 6) iot_rollups - pre-aggregation so raw readings can expire
 * ============================================================ */
$createTable('iot_rollups', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_rollups (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  point_id      INT UNSIGNED NOT NULL,
  asset_id      INT UNSIGNED NOT NULL,
  bucket_size   ENUM('minute_1','minute_5','hourly','daily') NOT NULL,
  bucket_start  DATETIME NOT NULL,
  sample_count  INT UNSIGNED NOT NULL DEFAULT 0,
  valid_count   INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_count INT UNSIGNED NOT NULL DEFAULT 0,
  min_value     DECIMAL(20,6) NULL,
  max_value     DECIMAL(20,6) NULL,
  avg_value     DECIMAL(20,6) NULL,
  sum_value     DECIMAL(24,6) NULL,
  `last_value`  DECIMAL(20,6) NULL,
  last_ts       DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_rollup_bucket (point_id, bucket_size, bucket_start),
  KEY idx_iot_rollup_asset (asset_id, bucket_size, bucket_start),
  CONSTRAINT fk_iot_rollup_point FOREIGN KEY (point_id) REFERENCES iot_points (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 7) iot_threshold_rules - versioned + effective dated
 * ============================================================ */
$createTable('iot_threshold_rules', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_threshold_rules (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  point_id                  INT UNSIGNED NOT NULL,
  rule_code                 VARCHAR(60) NOT NULL,
  name                      VARCHAR(255) NOT NULL DEFAULT '',
  metric                    ENUM('min','max','range','rate_of_change','missing_data','deviation') NOT NULL DEFAULT 'max',
  severity                  ENUM('warning','critical') NOT NULL DEFAULT 'warning',
  warn_limit                DECIMAL(20,6) NULL,
  critical_limit            DECIMAL(20,6) NULL,
  unit                      VARCHAR(40) NOT NULL DEFAULT '',
  duration_seconds          INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'breach must persist this long',
  consecutive_count         INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'breaching samples in a row',
  debounce_seconds          INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'quiet window after detection',
  hysteresis                DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'clear only past limit +/- hysteresis',
  rate_per_minute           DECIMAL(20,6) NULL COMMENT 'rate_of_change threshold',
  missing_timeout_seconds   INT UNSIGNED NULL COMMENT 'missing_data threshold',
  notification_dedup_seconds INT UNSIGNED NOT NULL DEFAULT 3600,
  effective_from            DATETIME NULL,
  effective_to              DATETIME NULL,
  version                   INT UNSIGNED NOT NULL DEFAULT 1,
  is_current                TINYINT(1) NOT NULL DEFAULT 1,
  enabled                   TINYINT(1) NOT NULL DEFAULT 1,
  notes                     VARCHAR(500) NOT NULL DEFAULT '',
  created_by                INT UNSIGNED NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_rule_version (point_id, rule_code, version),
  KEY idx_iot_rule_current (point_id, is_current, enabled),
  KEY idx_iot_rule_effective (effective_from, effective_to),
  CONSTRAINT fk_iot_rule_point FOREIGN KEY (point_id) REFERENCES iot_points (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_rule_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 8) iot_alarms - lifecycle instances
 * ============================================================ */
$createTable('iot_alarms', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_alarms (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alarm_uid               VARCHAR(80) NOT NULL COMMENT 'stable identity for dedupe/grouping across restarts',
  device_id               INT NOT NULL,
  point_id                INT UNSIGNED NOT NULL,
  asset_id                INT UNSIGNED NOT NULL,
  rule_id                 INT UNSIGNED NULL,
  rule_version            INT UNSIGNED NULL COMMENT 'rule version that fired THIS alarm - an old alarm must be explainable after the limit changes',
  category                ENUM('threshold','missing_data','rate_of_change','device_offline','quality','mapping') NOT NULL DEFAULT 'threshold',
  severity                ENUM('warning','critical') NOT NULL DEFAULT 'warning',
  status                  ENUM('detected','acknowledged','investigating','action_required','resolved','closed','suppressed') NOT NULL DEFAULT 'detected',
  message                 VARCHAR(500) NOT NULL DEFAULT '',
  metric_value            DECIMAL(20,6) NULL,
  threshold_value         DECIMAL(20,6) NULL,
  peak_value              DECIMAL(20,6) NULL COMMENT 'worst value seen while this alarm stayed open',
  occurrence_count        INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'how many breaching samples this open alarm has absorbed - one fault stays ONE alarm',
  unit                    VARCHAR(40) NOT NULL DEFAULT '',
  breach_started_at       DATETIME NULL COMMENT 'when the breach first became true',
  breach_cleared_at       DATETIME NULL COMMENT 'value returned to band. NOT a resolution - closure is still a human decision',
  first_detected_at       DATETIME NOT NULL,
  last_seen_at            DATETIME NOT NULL,
  detected_by_user_id     INT UNSIGNED NULL,
  acknowledged_by         INT UNSIGNED NULL,
  acknowledged_at         DATETIME NULL,
  acknowledged_note       VARCHAR(500) NOT NULL DEFAULT '',
  investigation_note      VARCHAR(500) NOT NULL DEFAULT '',
  resolved_by             INT UNSIGNED NULL,
  resolved_at             DATETIME NULL,
  resolution_code         VARCHAR(60) NOT NULL DEFAULT '',
  resolution_note         VARCHAR(500) NOT NULL DEFAULT '',
  closed_by               INT UNSIGNED NULL,
  closed_at               DATETIME NULL,
  closure_note            VARCHAR(500) NOT NULL DEFAULT '',
  suppressed_until        DATETIME NULL,
  escalation_level        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  escalated_at            DATETIME NULL,
  notification_last_sent_at DATETIME NULL,
  notification_count      INT UNSIGNED NOT NULL DEFAULT 0,
  last_reading_id         BIGINT UNSIGNED NULL,
  linked_repair_id        INT UNSIGNED NULL COMMENT 'repair.id - a LINK, repair stays the ONE work order store',
  linked_failure_event_id BIGINT UNSIGNED NULL,
  linked_rca_id           INT UNSIGNED NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_alarm_uid (alarm_uid),
  KEY idx_iot_alarm_board (status, severity, first_detected_at),
  KEY idx_iot_alarm_asset (asset_id, status),
  KEY idx_iot_alarm_point (point_id, status),
  KEY idx_iot_alarm_device (device_id, status),
  KEY idx_iot_alarm_repair (linked_repair_id),
  CONSTRAINT fk_iot_alarm_device FOREIGN KEY (device_id) REFERENCES iot_devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_alarm_point FOREIGN KEY (point_id) REFERENCES iot_points (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_alarm_rule FOREIGN KEY (rule_id) REFERENCES iot_threshold_rules (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_alarm_repair FOREIGN KEY (linked_repair_id) REFERENCES repair (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_alarm_failure FOREIGN KEY (linked_failure_event_id) REFERENCES failure_events (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_alarm_rca FOREIGN KEY (linked_rca_id) REFERENCES rca_records (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_alarm_ack_user FOREIGN KEY (acknowledged_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_alarm_resolved_user FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_alarm_closed_user FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 9) iot_alarm_events - append-only history
 * ============================================================ */
$createTable('iot_alarm_events', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_alarm_events (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alarm_id       BIGINT UNSIGNED NOT NULL,
  event_type     ENUM('detected','cleared','escalated','acknowledged','note','investigating','action_required','work_order_linked','rca_linked','resolved','reopened','closed','suppressed','unsuppressed','notification_sent') NOT NULL,
  from_status    VARCHAR(40) NOT NULL DEFAULT '',
  to_status      VARCHAR(40) NOT NULL DEFAULT '',
  severity       ENUM('warning','critical') NOT NULL DEFAULT 'warning',
  note           VARCHAR(500) NOT NULL DEFAULT '',
  actor_type     ENUM('user','system','connector') NOT NULL DEFAULT 'system',
  actor_user_id  INT UNSIGNED NULL,
  actor_name     VARCHAR(150) NOT NULL DEFAULT '',
  payload_json   TEXT NULL,
  created_at     DATETIME NOT NULL,
  KEY idx_iot_evt_alarm (alarm_id, id),
  KEY idx_iot_evt_type (event_type, created_at),
  CONSTRAINT fk_iot_evt_alarm FOREIGN KEY (alarm_id) REFERENCES iot_alarms (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_evt_user FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 10) iot_connectors - registry + observable run status
 * config_json holds NON-SECRET configuration only. Secrets go to secret_ref.
 * ============================================================ */
$createTable('iot_connectors', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_connectors (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  connector_code        VARCHAR(60) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  connector_type        ENUM('http_pull','mqtt_sub','scheduled','file_import','manual') NOT NULL DEFAULT 'http_pull',
  source_id             INT UNSIGNED NULL,
  enabled               TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ships DISABLED - a connector must be commissioned, not auto-enabled',
  config_json           TEXT NULL COMMENT 'non-secret configuration only',
  secret_ref            VARCHAR(160) NOT NULL DEFAULT '' COMMENT 'env var NAME holding the secret',
  schedule_cron         VARCHAR(60) NOT NULL DEFAULT '',
  last_run_at           DATETIME NULL,
  last_finished_at      DATETIME NULL,
  last_status           ENUM('never','ok','error','disabled') NOT NULL DEFAULT 'never',
  last_error            VARCHAR(500) NOT NULL DEFAULT '',
  last_duration_ms      INT UNSIGNED NULL,
  success_count         INT UNSIGNED NOT NULL DEFAULT 0,
  error_count           INT UNSIGNED NOT NULL DEFAULT 0,
  consecutive_failures  INT UNSIGNED NOT NULL DEFAULT 0,
  notes                 VARCHAR(500) NOT NULL DEFAULT '',
  created_by            INT UNSIGNED NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_conn_code (connector_code),
  KEY idx_iot_conn_status (enabled, last_status),
  CONSTRAINT fk_iot_conn_source FOREIGN KEY (source_id) REFERENCES iot_sources (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_conn_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 11) iot_ingest_log - per-batch intake audit
 * ============================================================ */
$createTable('iot_ingest_log', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_ingest_log (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id           INT UNSIGNED NULL,
  connector_id        INT UNSIGNED NULL,
  batch_uid           VARCHAR(80) NOT NULL,
  received_at         DATETIME NOT NULL COMMENT 'batch receipt time; second precision is enough for an audit log',
  finished_at         DATETIME NULL,
  status              ENUM('accepted','partial','rejected','error') NOT NULL DEFAULT 'accepted',
  payload_count       INT UNSIGNED NOT NULL DEFAULT 0,
  accepted_count      INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count     INT UNSIGNED NOT NULL DEFAULT 0,
  out_of_order_count  INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_count       INT UNSIGNED NOT NULL DEFAULT 0,
  error_count         INT UNSIGNED NOT NULL DEFAULT 0,
  alarm_count         INT UNSIGNED NOT NULL DEFAULT 0,
  payload_bytes       INT UNSIGNED NOT NULL DEFAULT 0,
  http_status         INT UNSIGNED NULL,
  error_code          VARCHAR(60) NOT NULL DEFAULT '',
  error_detail        VARCHAR(500) NOT NULL DEFAULT '',
  remote_ip           VARCHAR(45) NOT NULL DEFAULT '',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_batch (batch_uid),
  KEY idx_iot_ing_src_time (source_id, received_at),
  KEY idx_iot_ing_status (status, received_at),
  CONSTRAINT fk_iot_ing_source FOREIGN KEY (source_id) REFERENCES iot_sources (id) ON DELETE SET NULL,
  CONSTRAINT fk_iot_ing_connector FOREIGN KEY (connector_id) REFERENCES iot_connectors (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 12) iot_rate_limits - fixed-window intake counters
 * ============================================================ */
$createTable('iot_rate_limits', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_rate_limits (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope_key    VARCHAR(120) NOT NULL,
  window_start DATETIME NOT NULL,
  event_count  INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_rl (scope_key, window_start),
  KEY idx_iot_rl_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 13) asset_condition_snapshots - EXPLAINABLE condition indicator
 *
 * There is NO score column on purpose. A single number cannot say WHICH point is
 * degrading or whether the data was fresh enough to judge. This stores the inputs
 * (completeness, worst severity, active alarm counts) plus an indicator list, and
 * the UI shows the list.
 * ============================================================ */
$createTable('asset_condition_snapshots', <<<'SQL'
CREATE TABLE IF NOT EXISTS asset_condition_snapshots (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id              INT UNSIGNED NOT NULL,
  snapshot_at           DATETIME NOT NULL,
  window_minutes        INT UNSIGNED NOT NULL DEFAULT 60,
  point_count           INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'points mapped to this asset',
  valid_point_count     INT UNSIGNED NOT NULL DEFAULT 0,
  fresh_point_count     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'inside the declared sample interval',
  stale_point_count     INT UNSIGNED NOT NULL DEFAULT 0,
  missing_point_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'never reported - a data gap, NOT a value of zero',
  invalid_point_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'received but failed validation - excluded from condition',
  disabled_point_count  INT UNSIGNED NOT NULL DEFAULT 0,
  worst_severity        ENUM('unknown','normal','warning','critical') NOT NULL DEFAULT 'unknown',
  active_alarm_count    INT UNSIGNED NOT NULL DEFAULT 0,
  warning_alarm_count   INT UNSIGNED NOT NULL DEFAULT 0,
  critical_alarm_count  INT UNSIGNED NOT NULL DEFAULT 0,
  data_completeness     DECIMAL(5,2) NULL COMMENT '0.00-100.00 = fresh VALID points / mapped points',
  indicators_json       TEXT NULL COMMENT 'explainable per-point indicators with value + state + age',
  note                  VARCHAR(500) NOT NULL DEFAULT '',
  created_by            INT UNSIGNED NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_iot_cond_asset (asset_id, snapshot_at),
  KEY idx_iot_cond_time (snapshot_at),
  CONSTRAINT fk_iot_cond_asset FOREIGN KEY (asset_id) REFERENCES asset_registry (id) ON DELETE CASCADE,
  CONSTRAINT fk_iot_cond_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 14) iot_retention_policies - data-class retention
 * Deliberately operator-runnable: iot_retention_run() reports what it would
 * delete, deletes inside a loop with LIMIT batches, and records what it removed.
 * ============================================================ */
$createTable('iot_retention_policies', <<<'SQL'
CREATE TABLE IF NOT EXISTS iot_retention_policies (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  policy_code           VARCHAR(60) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  data_class            ENUM('raw_readings','rollups','ingest_log','alarm_events') NOT NULL,
  retention_days        INT UNSIGNED NOT NULL DEFAULT 90,
  keep_rollup_buckets   VARCHAR(120) NOT NULL DEFAULT 'minute_1,minute_5,hourly,daily' COMMENT 'bucket sizes rebuilt before raw rows expire',
  enabled               TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ships DISABLED - retention is never automatic until an operator enables it',
  last_run_at           DATETIME NULL,
  last_deleted_rows     INT UNSIGNED NOT NULL DEFAULT 0,
  last_run_note         VARCHAR(500) NOT NULL DEFAULT '',
  updated_by            INT UNSIGNED NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_iot_pol_code (policy_code),
  KEY idx_iot_pol_class (data_class, enabled),
  CONSTRAINT fk_iot_pol_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);

/* ============================================================
 * 15) settings group iot
 *
 * Every default here is deliberately CONSERVATIVE and is explained in docs.
 * iot_alarm_on_critical_notify default 1 because a critical threshold breach is the
 * one case where a CMMS must speak up; everything noisier ships off.
 * ============================================================ */
$settings = [
    ['iot_enabled', '1', '0 = the whole IoT intake surface refuses writes and the UI shows the module as disabled; 1 = intake enabled. Devices, points, thresholds and alarms remain readable when 0'],
    ['iot_ingest_require_source_auth', '1', '1 = /api/v1/iot_ingest.php requires a source credential (API key / bearer / HMAC). Never set to 0 on an internet-reachable host'],
    ['iot_ingest_rate_limit_per_min', '600', 'default per-source intake ceiling in readings per minute. A source row may lower it; this is only the fallback'],
    ['iot_ingest_max_payload_bytes', '262144', 'hard payload ceiling per request, checked before JSON parsing'],
    ['iot_ingest_max_batch_readings', '500', 'hard ceiling on readings in one batch. Oversized batches are rejected, not truncated silently'],
    ['iot_ingest_max_clock_skew_sec', '300', 'source_ts further than this from server time is stored as OUT_OF_ORDER, never silently accepted as current'],
    ['iot_ingest_accept_future_sec', '60', 'source_ts up to this far in the future is tolerated; beyond it the reading is rejected as PROCESSING_ERROR'],
    ['iot_ingest_stale_fallback_sec', '900', 'point.stale_after_sec fallback when a point does not define its own staleness window'],
    ['iot_alarm_on_critical_notify', '1', '1 = a critical alarm notifies through the Notification Center; warning alarms do not unless a rule asks for it'],
    ['iot_alarm_notify_roles', '1,2,6', 'roles notified for a critical alarm. This is a starting point an operator must confirm, not a validated distribution list'],
    ['iot_alarm_escalate_after_min', '60', 'an unacknowledged alarm escalates after this; 0 = never escalate'],
    ['iot_alarm_suppress_default_min', '240', 'default suppression window when an operator suppresses an alarm'],
    ['iot_alarm_require_note_on_resolve', '1', '1 = resolving an alarm needs a note and a resolution code; 0 = both optional'],
    ['iot_alarm_auto_work_order', '0', '0 = an alarm NEVER creates a work order by itself. Creating one stays a human action through repair:create'],
    ['iot_condition_snapshot_minutes', '60', 'default window used when building an asset condition snapshot'],
    ['iot_condition_min_points', '2', 'below this many mapped points a condition snapshot is reported INSUFFICIENT_DATA instead of a verdict'],
    ['iot_condition_stale_multiplier', '3', 'a point is stale after stale_after_sec x this, so a single late sample never flips the indicator'],
    ['iot_rollup_enabled', '1', '1 = accepted readings are folded into iot_rollups so raw rows can expire'],
    ['iot_rollup_buckets', 'minute_1,minute_5,hourly,daily', 'bucket sizes maintained by the rollup job'],
    ['iot_retention_enabled', '0', '0 = retention never runs automatically. An operator must enable the per-class policy in the UI or call the script'],
    ['iot_retention_raw_readings_days', '90', 'suggested raw retention. Kept OFF by default because deleting telemetry is an operator decision'],
    ['iot_ingest_log_days', '60', 'suggested retention for iot_ingest_log'],
    ['iot_device_offline_after_sec', '300', 'no reading for an ACTIVE device inside this window reports device_offline as a real observation, not a guess'],
];
foreach ($settings as [$k, $v, $desc]) {
    $exists = $pdo->prepare('SELECT COUNT(*) FROM settings WHERE setting_key = ?');
    $exists->execute([$k]);
    if ((int)$exists->fetchColumn() === 0) {
        if ($DRY_RUN) {
            $log("~ settings.$k (would add)");
        } else {
            $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "iot", ?)')
                ->execute([$k, $v, $desc]);
            $log("+ settings.$k");
        }
        $changed++;
    } else {
        $log("~ settings.$k (existed)");
    }
}

/* ============================================================
 * 16) notification_templates module iot
 * Dedupe is server-side via notification_events.event_key inside
 * NotificationCenterService::notify(), so a flapping point cannot spam the inbox.
 * ============================================================ */
$ntpls = [
    ['iot', 'alarm_detected', 'แจ้งเตือน IoT: {point_name} ({severity})', "เครื่อง: {asset_code} - {asset_name}\nค่า: {metric_value} {unit} (เกณฑ์ {threshold_value} {unit})\nประเภท: {category}\nเวลา: {detected_at}", 'critical', '/iot/alarms/{alarm_id}'],
    ['iot', 'alarm_escalated', 'IoT แจ้งเตือนเลขระดับสูงขึ้น: {point_name}', "เครื่อง: {asset_code}\nค่า: {metric_value} {unit}\nยังไม่ได้รับทราบ เวลา: {detected_at}", 'critical', '/iot/alarms/{alarm_id}'],
    ['iot', 'alarm_acknowledged', 'รับทราบ IoT แจ้งเตือนแล้ว: {point_name}', "เครื่อง: {asset_code}\nผู้รับทราบ: {actor_name}\nเวลา: {resolved_at}", 'warning', '/iot/alarms/{alarm_id}'],
    ['iot', 'alarm_resolved', 'IoT แจ้งเตือนกลับสู่ปกติ (รอปิด): {point_name}', "เครื่อง: {asset_code}\nค่าล่าสุด: {metric_value} {unit}\nผู้ปิด: {actor_name}", 'warning', '/iot/alarms/{alarm_id}'],
    ['iot', 'alarm_closed', 'ปิด IoT แจ้งเตือน: {point_name}', "เครื่อง: {asset_code}\nผู้ปิด: {actor_name}\nเวลา: {resolved_at}", 'info', '/iot/alarms/{alarm_id}'],
    ['iot', 'device_offline', 'อุปกรณ์ IoT หลุดการเชื่อมต่อ: {device_code}', "เครื่อง: {asset_code}\nอุปกรณ์: {device_name}\nไม่มีข้อมูลตั้งแต่: {last_seen_at}", 'warning', '/iot/devices/{device_id}'],
    ['iot', 'point_stale', 'จุดวัดไม่ส่งข้อมูล: {point_name}', "เครื่อง: {asset_code}\nไม่มีค่าที่ใช้งานได้เกิน {stale_after_sec} วินาที (ห้ามถือว่าเป็น 0)", 'warning', '/iot/devices/{device_id}'],
    ['iot', 'connector_failed', 'ตัวเชื่อมต่อ IoT ทำงานไม่สำเร็จ: {connector_name}', "ประเภท: {connector_type}\nข้อผิดพลาด: {error_detail}\nครั้งที่ล้มเหลวติดต่อกัน: {consecutive_failures}", 'high', '/iot/integrations'],
];
foreach ($ntpls as [$mod, $evt, $title, $msg, $prio, $url]) {
    $st = $pdo->prepare('SELECT id FROM notification_templates WHERE module = ? AND event = ?');
    $st->execute([$mod, $evt]);
    if (!$st->fetchColumn()) {
        if ($DRY_RUN) {
            $log("~ notification_templates.$mod:$evt (would add)");
        } else {
            $pdo->prepare('INSERT INTO notification_templates (module, event, title_template, message_template, priority, url_template) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$mod, $evt, $title, $msg, $prio, $url]);
            $log("+ notification_templates.$mod:$evt");
        }
        $changed++;
    } else {
        $log("~ notification_templates.$mod:$evt (existed)");
    }
}

/* ============================================================
 * 17) menu_permissions for the new IoT routes
 * Read boards follow iot/monitor (roles 1-5). Management pages follow
 * asset_reliability/config (roles 1,2,6) so a viewer cannot reach a config screen.
 * ============================================================ */
$menuSeeds = [
    ['iot/devices', [1, 2, 3, 4, 5]],
    ['iot/alarms', [1, 2, 3, 4, 5]],
    ['iot/condition', [1, 2, 3, 4, 5]],
    ['iot/thresholds', [1, 2, 6]],
    ['iot/integrations', [1, 2, 6]],
];
foreach ($menuSeeds as [$key, $roles]) {
    foreach ($roles as $roleId) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE role_id = ? AND menu_key = ?');
        $st->execute([$roleId, $key]);
        if ((int)$st->fetchColumn() === 0) {
            if ($DRY_RUN) {
                $log("~ menu_permissions.$key (role $roleId, would grant)");
            } else {
                $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')
                    ->execute([$roleId, $key]);
                $log("+ menu_permissions.$key (role $roleId)");
            }
            $changed++;
        }
    }
}

/* ============================================================
 * 18) retention policy seeds - present but DISABLED
 * ============================================================ */
$pol = [
    ['raw_readings_default', 'Raw readings', 'raw_readings', 90, 'minute_1,minute_5,hourly,daily'],
    ['rollups_default', 'Pre-aggregated buckets', 'rollups', 730, ''],
    ['ingest_log_default', 'Ingestion batches', 'ingest_log', 60, ''],
    ['alarm_events_default', 'Alarm history', 'alarm_events', 1095, ''],
];
foreach ($pol as [$code, $name, $class, $days, $buckets]) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM iot_retention_policies WHERE policy_code = ?');
    $st->execute([$code]);
    if ((int)$st->fetchColumn() === 0) {
        if ($DRY_RUN) {
            $log("~ iot_retention_policies.$code (would add, disabled)");
        } else {
            $pdo->prepare('INSERT INTO iot_retention_policies (policy_code, name, data_class, retention_days, keep_rollup_buckets, enabled)
                           VALUES (?, ?, ?, ?, ?, 0)')->execute([$code, $name, $class, $days, $buckets]);
            $log("+ iot_retention_policies.$code (disabled)");
        }
        $changed++;
    } else {
        $log("~ iot_retention_policies.$code (existed)");
    }
}

$log('');
$log("Phase 36 IoT & Condition Monitoring migration complete. changes=$changed");
$log('Retained: iot_sensor_data (12 legacy rows, deprecated, read-only via iot_legacy_readings())');