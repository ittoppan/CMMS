<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');
require __DIR__ . '/../src/config/db.php';
$pdo = getDb();

echo "repair joined to asset_registry.status:\n";
foreach ($pdo->query('SELECT a.status, COUNT(*) c, MIN(r.created_at) minc, MAX(r.created_at) maxc
                       FROM repair r JOIN asset_registry a ON a.id = r.asset_id
                      GROUP BY a.status')->fetchAll() as $x) {
    echo '  ' . $x['status'] . ' n=' . $x['c'] . ' created ' . $x['minc'] . ' .. ' . $x['maxc'] . "\n";
}

$q = function (string $sql) use ($pdo): int {
    $st = $pdo->prepare($sql);
    $st->execute();
    return (int)$st->fetchColumn();
};

echo "\nwindow = last 365 days, scope = active assets\n";
echo '  all repair rows in scope           = ' . $q("SELECT COUNT(*) FROM repair r JOIN asset_registry a ON a.id=r.asset_id WHERE a.status='active' AND r.created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)") . "\n";
echo '  completed WOs (done statuses)      = ' . $q("SELECT COUNT(*) FROM repair r JOIN asset_registry a ON a.id=r.asset_id WHERE a.status='active' AND r.completed_at >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND r.status IN ('completed','closed')") . "\n";
echo '  ... with actual_start_at           = ' . $q("SELECT COUNT(*) FROM repair r JOIN asset_registry a ON a.id=r.asset_id WHERE a.status='active' AND r.completed_at >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND r.status IN ('completed','closed') AND r.actual_start_at IS NOT NULL") . "\n";
echo '  ... with labour minutes > 0        = ' . $q("SELECT COUNT(*) FROM repair r JOIN asset_registry a ON a.id=r.asset_id WHERE a.status='active' AND r.completed_at >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND r.repair_time_minutes > 0") . "\n";
echo '  ... breakdown source_type          = ' . $q("SELECT COUNT(*) FROM repair r JOIN asset_registry a ON a.id=r.asset_id WHERE a.status='active' AND r.completed_at >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND r.status IN ('completed','closed') AND r.source_type='breakdown'") . "\n";
echo '  downtime rows in scope             = ' . $q("SELECT COUNT(*) FROM repair r JOIN asset_registry a ON a.id=r.asset_id WHERE a.status='active' AND r.created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND r.downtime_minutes > 0") . "\n";
echo '  production_hours rows in scope     = ' . $q("SELECT COUNT(*) FROM production_hours ph JOIN asset_registry a ON a.id=ph.asset_id WHERE a.status='active' AND ph.record_date >= DATE_SUB(NOW(), INTERVAL 365 DAY)") . "\n";
echo '  mtbf_mttr rows in scope            = ' . $q("SELECT COUNT(*) FROM mtbf_mttr m JOIN asset_registry a ON a.id=m.asset_id WHERE a.status='active'") . "\n";
echo '  NULL asset_id rows (all repair)    = ' . $q("SELECT COUNT(*) FROM repair WHERE asset_id IS NULL") . "\n";