<?php
/**
 * READ-ONLY inspection of what the Phase 36 migration left behind in the live database.
 * This script performs no writes. It is here so the effect of an unintended run can be
 * reported precisely rather than guessed at.
 */
declare(strict_types=1);
require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$db  = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
echo "database: {$db}" . PHP_EOL . PHP_EOL;

$p36 = ['iot_sources','iot_gateways','iot_devices','iot_points','iot_readings','iot_rollups',
        'iot_threshold_rules','iot_alarms','iot_alarm_events','iot_connectors','iot_ingest_log',
        'iot_rate_limits','asset_condition_snapshots','iot_retention_policies'];

echo "--- Phase 36 tables ---" . PHP_EOL;
$st = $pdo->prepare("SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME FROM information_schema.TABLES
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (" .
                     implode(',', array_fill(0, count($p36), '?')) . ') ORDER BY TABLE_NAME');
$st->execute(array_merge([$db], $p36));
$rows = $st->fetchAll(PDO::FETCH_ASSOC);
$present = [];
foreach ($rows as $r) {
    $present[] = $r['TABLE_NAME'];
    printf("  %-32s rows~%-8s created %s\n", $r['TABLE_NAME'], $r['TABLE_ROWS'], $r['CREATE_TIME'] ?? '-');
}
$missing = array_values(array_diff($p36, $present));
echo '  present: ' . count($present) . ' / ' . count($p36) .
     (count($missing) ? '  MISSING: ' . implode(', ', $missing) : '  (all present)') . PHP_EOL . PHP_EOL;

echo "--- legacy data that must be untouched ---" . PHP_EOL;
foreach (['iot_devices' => 'legacy device rows', 'iot_sensor_data' => 'legacy sensor readings'] as $t => $label) {
    try {
        $c = $pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
        printf("  %-16s %-26s %s\n", $t, $label, $c);
    } catch (Throwable $e) {
        printf("  %-16s %-26s ERROR %s\n", $t, $label, $e->getMessage());
    }
}

echo PHP_EOL . "--- columns added to pre-existing iot_devices ---" . PHP_EOL;
$st = $pdo->prepare("SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                     FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'iot_devices' ORDER BY ORDINAL_POSITION");
$st->execute([$db]);
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $c) {
    printf("  %-26s %-16s null=%-3s default=%s\n",
        $c['COLUMN_NAME'], $c['COLUMN_TYPE'], $c['IS_NULLABLE'],
        $c['COLUMN_DEFAULT'] === null ? 'NULL' : $c['COLUMN_DEFAULT']);
}

echo PHP_EOL . "--- foreign keys introduced by the migration ---" . PHP_EOL;
$st = $pdo->prepare("SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                     FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
                       AND CONSTRAINT_NAME LIKE 'fk_iot%'
                     ORDER BY TABLE_NAME, CONSTRAINT_NAME");
$st->execute([$db]);
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) {
    printf("  %-28s %-26s %s -> %s.%s\n", $f['TABLE_NAME'], $f['CONSTRAINT_NAME'],
        $f['COLUMN_NAME'], $f['REFERENCED_TABLE_NAME'], $f['REFERENCED_COLUMN_NAME']);
}

echo PHP_EOL . "--- settings / permissions / templates seeded ---" . PHP_EOL;
foreach ([
    ['settings',    "SELECT COUNT(*) FROM settings WHERE setting_key LIKE 'iot_%'"],
    ['permissions', "SELECT COUNT(*) FROM permissions WHERE module = 'iot'"],
    ['retention',   'SELECT COUNT(*) FROM iot_retention_policies'],
] as [$label, $sql]) {
    try {
        printf("  %-12s %s\n", $label, $pdo->query($sql)->fetchColumn());
    } catch (Throwable $e) {
        printf("  %-12s ERROR %s\n", $label, $e->getMessage());
    }
}

echo PHP_EOL . "--- rows in the new tables (should all be 0 on a fresh install) ---" . PHP_EOL;
foreach ($p36 as $t) {
    if (!in_array($t, $present, true)) { continue; }
    try {
        $c = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
        if ($c > 0) { printf("  %-32s %d\n", $t, $c); }
    } catch (Throwable $e) {
        printf("  %-32s ERROR %s\n", $t, $e->getMessage());
    }
}
echo "  (only non-zero counts listed above)" . PHP_EOL;

echo PHP_EOL . "--- active alarm engine state ---" . PHP_EOL;
try {
    $st = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key = 'iot_enabled'");
    $st->execute();
    var_export($st->fetch(PDO::FETCH_ASSOC));
    echo PHP_EOL;
} catch (Throwable $e) {
    echo '  ERROR ' . $e->getMessage() . PHP_EOL;
}