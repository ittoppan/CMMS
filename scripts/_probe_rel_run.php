<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
require __DIR__ . '/../src/config/db.php';
require __DIR__ . '/../src/helpers/reliability.php';
$pdo = getDb();

$scope = rel_scope($pdo, ['scope_type' => 'fleet']);
$period = rel_period(['range' => 'rolling_12m'], rel_config($pdo));
echo 'assets=' . $scope['asset_count'] . ' period=' . $period['start'] . '..' . $period['end'] . PHP_EOL;
echo 'id_in clause = ' . rel_id_in($scope['asset_ids'], 'asset_id') . PHP_EOL;

$sql = 'SELECT COALESCE(SUM(hours),0) AS h, COUNT(*) AS c, COUNT(DISTINCT asset_id) AS ac
           FROM production_hours
          WHERE record_date BETWEEN ? AND ?' . rel_id_in($scope['asset_ids'], 'asset_id');
try {
    $st = $pdo->prepare($sql);
    $st->execute([substr($period['start'], 0, 10), substr($period['end'], 0, 10)]);
    var_dump($st->fetch());
} catch (Throwable $e) {
    echo 'SQL ERROR: ' . $e->getMessage() . PHP_EOL;
}

$cfg = rel_config($pdo);
foreach (['production', 'declared'] as $basis) {
    $r = rel_operating_hours($pdo, $scope, $period, $basis, $cfg);
    echo $basis . ': hours=' . var_export($r['hours'], true) . ' rows=' . ($r['rows'] ?? '-')
        . ' status=' . $r['status'] . ' note="' . $r['note'] . '"' . PHP_EOL;
}

echo PHP_EOL . '-- rel_repair_rows / missing pairs --' . PHP_EOL;
$rows = rel_repair_rows($pdo, $scope, $period, 'work_to_complete', $cfg);
echo 'repair rows = ' . count($rows) . PHP_EOL;
echo 'missing pairs = ' . rel_repair_missing_pairs($pdo, $scope, $period, 'work_to_complete') . PHP_EOL;

echo PHP_EOL . '-- studies list (users.display_name?) --' . PHP_EOL;
var_dump(rel_studies($pdo, ['limit' => 3]));
echo PHP_EOL . '-- dq --' . PHP_EOL;
$dq = rel_dq_checks($pdo, $scope, $period, $cfg);
echo 'dq status=' . $dq['status'] . ' checks=' . count($dq['checks']) . PHP_EOL;
foreach ($dq['checks'] as $c) {
    echo '   ' . $c['check_code'] . ' n=' . $c['count'] . PHP_EOL;
}