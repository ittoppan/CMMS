<?php
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$ids = $pdo->query("SELECT id FROM users WHERE username LIKE 'e2e_%'")->fetchAll(PDO::FETCH_COLUMN);
$in = $ids ? implode(',', array_map('intval', $ids)) : 'NULL';
$total = 0;
if ($in !== 'NULL') {
    $cols = ['created_by','recorded_by','done_by','requested_by','reported_by','uploaded_by','initiated_by','opened_by'];
    $inCols = "'" . implode("','", $cols) . "'";
    $stmt = $pdo->query("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ($inCols)");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $n = (int)$pdo->query("SELECT COUNT(*) FROM `".$r['TABLE_NAME']."` WHERE `".$r['COLUMN_NAME']."` IN ($in)")->fetchColumn();
        if ($n > 0) { echo "RESIDUE ".$r['TABLE_NAME'].".".$r['COLUMN_NAME']."=$n\n"; $total += $n; }
    }
    $n = (int)$pdo->query("SELECT COUNT(*) FROM audit_logs WHERE user_id IN ($in) OR user_name LIKE 'e2e_%'")->fetchColumn();
    if ($n > 0) { echo "RESIDUE audit_logs=$n\n"; $total += $n; }
    $n = (int)$pdo->query("SELECT COUNT(*) FROM notifications WHERE user_id IN ($in)")->fetchColumn();
    if ($n > 0) { echo "RESIDUE notifications=$n\n"; $total += $n; }
    $n = (int)$pdo->query("SELECT COUNT(*) FROM stock_take_items WHERE stock_take_id IN (SELECT id FROM stock_take WHERE created_by IN ($in))")->fetchColumn();
    if ($n > 0) { echo "RESIDUE stock_take_items=$n\n"; $total += $n; }
    $n = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE created_by IN ($in)")->fetchColumn();
    if ($n > 0) { echo "RESIDUE repair=$n\n"; $total += $n; }
}
if ($total > 0) {
    echo "TOTAL_RESIDUE=$total\n";
    exit(1);
}
echo "residue=0\n";