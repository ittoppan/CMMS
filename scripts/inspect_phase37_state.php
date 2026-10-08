<?php
/**
 * scripts/inspect_phase37_state.php
 * Phase 37 pre-inspection: dump live schema + row counts for reliability source tables.
 * READ-ONLY. Safe to run anytime.
 */
require __DIR__ . '/../src/config/db.php';
$pdo = getDb();

$tables = [
    'asset_registry','repair','mtbf_mttr','failure_events','failure_event_links',
    'failure_codes','failure_taxonomy','rca','rca_actions','rca_whys','rca_links',
    'rca_evidence','rca_measurements','production_hours','v_maintenance_cost',
    'pm_am','pm_plans','inspections','iot_points','iot_readings','iot_alarms',
    'iot_rules','iot_condition_snapshots','iot_rollups_daily','iot_rollups_hourly',
    'engineering_changes','audit_logs','menu_permissions','settings','roles',
    'departments','users','monthly_kpi_snapshot','asset_criticality',
    'asset_lifecycle_history','document_control','documents','notifications',
];

echo "=== TABLE PRESENCE + ROW COUNT ===\n";
foreach ($tables as $t) {
    try {
        $st = $pdo->query("SELECT COUNT(*) c FROM `$t`");
        $c = (int)$st->fetch(PDO::FETCH_ASSOC)['c'];
        printf("%-32s EXISTS rows=%d\n", $t, $c);
    } catch (Throwable $e) {
        printf("%-32s MISSING\n", $t);
    }
}

echo "\n=== ALL TABLES (prefix scan) ===\n";
$st = $pdo->query("SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME");
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
    printf("%-40s ~%s\n", $r['TABLE_NAME'], $r['TABLE_ROWS']);
}