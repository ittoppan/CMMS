<?php
/**
 * One-shot live repair of the malformed iot_rollups table (Phase 36).
 *
 * Build-then-swap: the correct DDL is created as iot_rollups_rebuild first, so nothing is
 * dropped until that CREATE has actually succeeded. Only then is the broken table dropped and
 * the good one renamed into place.
 */
chdir(dirname(__DIR__));
require_once 'src/config/db.php';
$pdo = getDb();

const REBUILD = 'iot_rollups_rebuild';

$rows = (int)$pdo->query('SELECT COUNT(*) FROM iot_rollups')->fetchColumn();
echo "existing iot_rollups rows = {$rows}" . PHP_EOL;
if ($rows !== 0) {
    exit("ABORT: iot_rollups is not empty; refusing to drop data." . PHP_EOL);
}

$pdo->exec('DROP TABLE IF EXISTS `' . REBUILD . '`');

$ddl = <<<'SQL'
CREATE TABLE `iot_rollups_rebuild` (
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
SQL;

$pdo->exec($ddl);
echo "created " . REBUILD . " OK" . PHP_EOL;

// Only now is it safe to discard the broken table.
$pdo->exec('DROP TABLE `iot_rollups`');
echo "dropped broken iot_rollups" . PHP_EOL;

$pdo->exec('RENAME TABLE `' . REBUILD . '` TO `iot_rollups`');
echo "renamed into place" . PHP_EOL;

$cols = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iot_rollups'
                     ORDER BY ORDINAL_POSITION")->fetchAll(PDO::FETCH_COLUMN);
echo 'columns (' . count($cols) . '): ' . implode(', ', $cols) . PHP_EOL;

$idx = $pdo->query("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'iot_rollups'")->fetchAll(PDO::FETCH_COLUMN);
echo 'indexes: ' . implode(', ', $idx) . PHP_EOL;

$fk = $pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'iot_rollups'")->fetchAll(PDO::FETCH_COLUMN);
echo 'foreign keys: ' . (count($fk) ? implode(', ', $fk) : 'NONE') . PHP_EOL;