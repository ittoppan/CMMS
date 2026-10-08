<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
require __DIR__ . '/../src/config/db.php';
$pdo = getDb();

$tables = [
    'production_hours', 'mtbf_mttr', 'iot_rollups', 'iot_points', 'iot_alarms',
    'failure_events', 'failure_modes', 'rca', 'engineering_changes',
    'asset_condition_snapshots', 'v_maintenance_cost', 'pm_am', 'users', 'settings',
];
foreach ($tables as $t) {
    $st = $pdo->prepare('SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                          ORDER BY ORDINAL_POSITION');
    $st->execute([$t]);
    $cols = $st->fetchAll();
    if ($cols === []) {
        echo "== $t : MISSING" . PHP_EOL;
        continue;
    }
    echo '== ' . $t . ' (' . count($cols) . ' cols): '
        . implode(', ', array_map(static fn($c) => $c['COLUMN_NAME'] . ':' . $c['DATA_TYPE'], $cols)) . PHP_EOL;
}

echo PHP_EOL . '== data dates ==' . PHP_EOL;
foreach (['production_hours' => 'record_date', 'mtbf_mttr' => 'NULL'] as $t => $col) {
    if ($col === 'NULL') {
        $r = $pdo->query("SELECT MIN(year*100+month) a, MAX(year*100+month) b, COUNT(*) c FROM $t")->fetch();
        echo "  $t: {$r['a']} .. {$r['b']} rows={$r['c']}" . PHP_EOL;
        continue;
    }
    $r = $pdo->query("SELECT MIN($col) a, MAX($col) b, COUNT(*) c FROM $t")->fetch();
    echo "  $t: {$r['a']} .. {$r['b']} rows={$r['c']}" . PHP_EOL;
}