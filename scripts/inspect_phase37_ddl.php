<?php
/** scripts/inspect_phase37_ddl.php — READ-ONLY DDL dump for Phase 37 source tables */
require __DIR__ . '/../src/config/db.php';
$pdo = getDb();

$want = array_slice($argv, 1);
if (!$want) {
    $want = ['asset_registry','repair','mtbf_mttr','production_hours','failure_events',
        'failure_modes','failure_causes','failure_types','root_cause_categories','failure_codes',
        'rca','rca_actions','v_maintenance_cost','pm_am','pm_am_plans','pm_am_plan_assets',
        'iot_devices','iot_points','iot_readings','iot_alarms','iot_threshold_rules',
        'iot_alarm_events','iot_rollups','iot_retention_policies','iot_sensor_data',
        'engineering_changes','audit_logs','menu_permissions','settings','roles',
        'asset_criticality','inspection_results','asset_condition_snapshots','asset_measurements'];
}
foreach ($want as $t) {
    try {
        $st = $pdo->query("SHOW CREATE TABLE `$t`");
        $r = $st->fetch(PDO::FETCH_NUM);
        echo "\n" . str_repeat('=', 90) . "\n### $t\n" . $r[1] . ";\n";
    } catch (Throwable $e) {
        echo "\n### $t -> MISSING/ERR: " . $e->getMessage() . "\n";
    }
}