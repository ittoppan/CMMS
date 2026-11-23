<?php
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$ids = $pdo->query("SELECT id FROM users WHERE username LIKE 'e2e_%'")->fetchAll(PDO::FETCH_COLUMN);
$in = $ids ? implode(',', array_map('intval', $ids)) : 'NULL';

if ($in !== 'NULL') {
    // repair children first
    $repairIds = $pdo->query("SELECT id FROM repair WHERE created_by IN ($in)")->fetchAll(PDO::FETCH_COLUMN);
    $inRepairs = $repairIds ? implode(',', array_map('intval', $repairIds)) : 'NULL';
    if ($inRepairs !== 'NULL') {
        foreach (['repair_activity_log','repair_attachments','repair_ratings','repair_schedule_log','repair_spare_parts','repair_tag_pivot','failure_events','rca','rca_records','requisitions','work_pause_logs','work_permits','inspection_fail_actions','calibration_oot_events','sd_scopes'] as $t) {
            $pdo->exec("DELETE FROM `$t` WHERE repair_id IN ($inRepairs)");
        }
    }
    $pdo->exec("DELETE FROM repair WHERE created_by IN ($in)");

    // stock_take children
    $stockIds = $pdo->query("SELECT id FROM stock_take WHERE created_by IN ($in)")->fetchAll(PDO::FETCH_COLUMN);
    $inStock = $stockIds ? implode(',', array_map('intval', $stockIds)) : 'NULL';
    if ($inStock !== 'NULL') {
        $pdo->exec("DELETE FROM stock_take_items WHERE stock_take_id IN ($inStock)");
        $pdo->exec("DELETE FROM stock_take WHERE id IN ($inStock)");
    }

    // generic tables where an e2e user appears as creator/owner
    $cols = ['created_by','recorded_by','done_by','requested_by','reported_by','uploaded_by','initiated_by','opened_by'];
    $inCols = "'" . implode("','", $cols) . "'";
    $stmt = $pdo->query("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ($inCols)");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $pdo->exec("DELETE FROM `".$r['TABLE_NAME']."` WHERE `".$r['COLUMN_NAME']."` IN ($in)");
    }

    $pdo->exec("DELETE FROM audit_logs WHERE user_id IN ($in) OR user_name LIKE 'e2e_%'");
    $pdo->exec("DELETE FROM notifications WHERE user_id IN ($in)");
}

$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "cleaned\n";