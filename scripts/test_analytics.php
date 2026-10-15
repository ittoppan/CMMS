<?php
/**
 * scripts/test_analytics.php — behavioral harness for the Phase 23 analytics engine
 * (src/helpers/analytics.php).
 *
 * Covers: ana_opts, ana_paginate, ana_mtbf_range_sql, ana_reliability_calc,
 * ana_reliability, ana_trend, ana_asset_health, ana_repeat_failures,
 * ana_downtime_pareto, ana_priority_analysis, ana_pm_compliance,
 * ana_planned_unplanned, ana_technician_analytics, ana_spare_analytics,
 * ana_cost_analytics, ana_data_quality, ana_overview.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_anatest".
 *   php scripts/test_analytics.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);

function parseDotEnv(string $path): array {
    $out = [];
    if (!is_file($path)) return $out;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }
    return $out;
}

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_anatest';

if (!str_ends_with($scratch, '_anatest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx($a, $b, float $eps = 0.05): bool { return $a !== null && $b !== null && abs((float)$a - (float)$b) <= $eps; }

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Analytics harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo 'Cloned structure of ' . count($tables) . " tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/kpi.php';
require_once __DIR__ . '/../src/helpers/analytics.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
$_SESSION = [];

function ins(PDO $pdo, string $table, array $data): int {
    $cols = array_keys($data);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES ('
        . implode(',', array_fill(0, count($cols), '?')) . ')';
    $pdo->prepare($sql)->execute(array_values($data));
    return (int)$pdo->lastInsertId();
}

$NOW = time();
$D = fn(int $days) => date('Y-m-d H:i:s', $NOW + $days * 86400);

/* ================================================================= fixtures */
$DEPT = ins($pdo, 'departments', ['code' => 'MAINT', 'name' => 'Maintenance']);

$A1 = ins($pdo, 'asset_registry', ['code' => 'PMP-1', 'name' => 'Feed Pump', 'category' => 'pump', 'criticality' => 'A', 'status' => 'active', 'department_id' => $DEPT]);
$A2 = ins($pdo, 'asset_registry', ['code' => 'MTR-1', 'name' => 'Drive Motor', 'category' => 'motor', 'criticality' => 'B', 'status' => 'active']);
$A3 = ins($pdo, 'asset_registry', ['code' => 'OLD-1', 'name' => 'Retired Unit', 'category' => 'pump', 'criticality' => 'C', 'status' => 'disposed']);
$A9 = ins($pdo, 'asset_registry', ['code' => 'AUX-1', 'name' => 'Aux Unit', 'category' => 'pump', 'criticality' => 'B', 'status' => 'active']);
$A4 = ins($pdo, 'asset_registry', ['code' => 'CLN-1', 'name' => 'Clean Unit', 'category' => 'pump', 'criticality' => 'C', 'status' => 'active']);

$U1 = ins($pdo, 'users', ['username' => 'somsri', 'email' => 'somsri@x.io', 'password' => 'x', 'full_name' => 'Somsri K']);
$U2 = ins($pdo, 'users', ['username' => 'somchai', 'email' => 'somchai@x.io', 'password' => 'x', 'full_name' => 'Somchai P']);
$FC = ins($pdo, 'failure_codes', ['code' => 'F-BRG', 'name' => 'Bearing failure']);

$PLAN = ins($pdo, 'pm_am_plans', ['code' => 'PMP-A', 'name' => 'Pump A Plan']);

/* mtbf_mttr — reliability + pareto + data quality (in 2025 custom range) */
ins($pdo, 'mtbf_mttr', ['asset_id' => $A1, 'year' => 2025, 'month' => 1, 'total_failures' => 2, 'operating_hours' => 1000, 'total_downtime_minutes' => 120]);
ins($pdo, 'mtbf_mttr', ['asset_id' => $A1, 'year' => 2025, 'month' => 2, 'total_failures' => 1, 'operating_hours' => 800, 'total_downtime_minutes' => 60]);
ins($pdo, 'mtbf_mttr', ['asset_id' => $A2, 'year' => 2025, 'month' => 3, 'total_failures' => 3, 'operating_hours' => 900, 'total_downtime_minutes' => 300]);
ins($pdo, 'mtbf_mttr', ['asset_id' => $A2, 'year' => 2024, 'month' => 12, 'total_failures' => 5, 'operating_hours' => 500, 'total_downtime_minutes' => 300]);

/* repair rows inside the 2025 custom range (trend / planned-unplanned / tech / dq / cost) */
$R1 = ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-1', 'title' => 'Seal leak', 'source_type' => 'breakdown', 'status' => 'closed', 'priority' => 'high', 'assigned_to' => $U1, 'created_at' => '2025-01-10 08:00:00', 'completed_at' => '2025-01-11 08:00:00', 'downtime_minutes' => 60, 'repair_time_minutes' => 30, 'response_time_minutes' => 15, 'cost_parts' => 100, 'cost_labor' => 50, 'failure_code_id' => $FC, 'rca_category' => 'Machine', 'planned_start_at' => '2025-01-10 07:00:00']);
$R2 = ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-2', 'title' => 'PM check', 'source_type' => 'pm', 'status' => 'closed', 'priority' => 'low', 'assigned_to' => $U1, 'created_at' => '2025-01-20 08:00:00', 'completed_at' => '2025-01-20 10:00:00']);
$R3 = ins($pdo, 'repair', ['asset_id' => $A2, 'work_order_no' => 'WO-3', 'title' => 'Vibration', 'source_type' => 'breakdown', 'status' => 'in_progress', 'priority' => 'critical', 'assigned_to' => $U1, 'created_at' => '2025-02-05 08:00:00', 'downtime_minutes' => 90, 'repair_time_minutes' => 45]);
$R4 = ins($pdo, 'repair', ['asset_id' => $A2, 'work_order_no' => 'WO-4', 'title' => 'Modify guard', 'source_type' => 'modify', 'status' => 'open', 'priority' => 'medium', 'assigned_to' => $U2, 'created_at' => '2025-03-15 08:00:00']);
/* outside range */
ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-0', 'title' => 'Old', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => '2024-12-31 08:00:00']);

/* asset health: last-90/180-day breakdowns for A1 (status closed → not active) */
ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-A1', 'title' => 'B1', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => $D(-10), 'completed_at' => $D(-9), 'downtime_minutes' => 200]);
ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-A2', 'title' => 'B2', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => $D(-20), 'completed_at' => $D(-19), 'downtime_minutes' => 200]);
ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-A3', 'title' => 'B3', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => $D(-30), 'completed_at' => $D(-29), 'downtime_minutes' => 200]);

/* repeat failures on A2 in June 2025 (separate window) */
ins($pdo, 'repair', ['asset_id' => $A2, 'work_order_no' => 'WO-R1', 'title' => 'R1', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => '2025-06-01 08:00:00']);
ins($pdo, 'repair', ['asset_id' => $A2, 'work_order_no' => 'WO-R2', 'title' => 'R2', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => '2025-06-02 08:00:00']);
ins($pdo, 'repair', ['asset_id' => $A2, 'work_order_no' => 'WO-R3', 'title' => 'R3', 'source_type' => 'breakdown', 'status' => 'closed', 'created_at' => '2025-06-05 08:00:00']);

/* priority analysis: active WOs (now-relative) on A9, unassigned */
ins($pdo, 'repair', ['asset_id' => $A9, 'work_order_no' => 'WO-P1', 'title' => 'P1', 'source_type' => 'breakdown', 'status' => 'open', 'priority' => 'critical', 'created_at' => $D(-2), 'sla_due_at' => $D(-1)]);
ins($pdo, 'repair', ['asset_id' => $A9, 'work_order_no' => 'WO-P2', 'title' => 'P2', 'source_type' => 'breakdown', 'status' => 'in_progress', 'priority' => 'high', 'created_at' => $D(-10), 'sla_due_at' => $D(5)]);
ins($pdo, 'repair', ['asset_id' => $A9, 'work_order_no' => 'WO-P3', 'title' => 'P3', 'source_type' => 'breakdown', 'status' => 'open', 'priority' => 'low', 'created_at' => $D(-40)]);

/* pm_am: on-time/late/overdue (on A9 to avoid perturbing A1) */
ins($pdo, 'pm_am', ['asset_id' => $A9, 'plan_id' => $PLAN, 'title' => 'PM ontime', 'status' => 'completed', 'due_date' => '2025-01-10', 'completed_at' => '2025-01-09 10:00:00']);
ins($pdo, 'pm_am', ['asset_id' => $A9, 'plan_id' => $PLAN, 'title' => 'PM late', 'status' => 'completed', 'due_date' => '2025-02-10', 'completed_at' => '2025-02-15 10:00:00']);
ins($pdo, 'pm_am', ['asset_id' => $A9, 'plan_id' => $PLAN, 'title' => 'PM ontime2', 'status' => 'completed', 'due_date' => '2025-03-01', 'completed_at' => '2025-03-01 09:00:00']);
ins($pdo, 'pm_am', ['asset_id' => $A9, 'plan_id' => $PLAN, 'title' => 'PM overdue', 'status' => 'pending', 'due_date' => '2026-01-01']);

/* inspection_schedules: one fail for A1 within 180 days (asset health) */
ins($pdo, 'inspection_schedules', ['template_id' => 1, 'asset_id' => $A1, 'status' => 'completed', 'result' => 'fail', 'fail_count' => 1, 'completed_at' => $D(-30)]);

/* spare parts */
$SP1 = ins($pdo, 'spare_parts', ['code' => 'SP1', 'name' => 'Seal', 'stock_qty' => 10, 'min_stock' => 5, 'unit_price' => 100]);
$SP2 = ins($pdo, 'spare_parts', ['code' => 'SP2', 'name' => 'Bearing', 'stock_qty' => 2, 'min_stock' => 5, 'unit_price' => 200]);
$SP3 = ins($pdo, 'spare_parts', ['code' => 'SP3', 'name' => 'Gasket', 'stock_qty' => 0, 'min_stock' => 5, 'unit_price' => 0]);
$SP4 = ins($pdo, 'spare_parts', ['code' => 'SP4', 'name' => 'Motor', 'stock_qty' => 1000, 'min_stock' => 10, 'unit_price' => 100]);
ins($pdo, 'repair_spare_parts', ['repair_id' => $R1, 'spare_part_id' => $SP1, 'quantity_used' => 2, 'unit_price' => 100]);
ins($pdo, 'spare_issue_items', ['request_id' => 1, 'spare_part_id' => $SP2, 'qty_issued' => 3]);

/* ================================================================= 1. ana_opts */
echo "\n[1] ana_opts()\n";
$o = ana_opts(['role_id' => 5, 'user_id' => 9, 'range' => 'custom', 'asset_id' => '7']);
check('role_id int', $o['role_id'] === 5);
check('user_id int', $o['user_id'] === 9);
check('string field kept', $o['range'] === 'custom' && $o['asset_id'] === '7');
check('default limit 50', $o['limit'] === 50);
check('default offset 0', $o['offset'] === 0);
check('missing string field empty', $o['status'] === '' && $o['bucket'] === '');
$o2 = ana_opts(['__role_id' => 2, '__user_id' => 3, 'limit' => 10]);
check('__role_id fallback', $o2['role_id'] === 2 && $o2['user_id'] === 3 && $o2['limit'] === 10);

/* ================================================================= 2. ana_paginate */
echo "\n[2] ana_paginate()\n";
$rows = range(1, 10);
$pg = ana_paginate($rows, 2, 0);
check('page1 slice', $pg['rows'] === [1, 2] && $pg['total'] === 10 && $pg['page'] === 1 && $pg['has_more'] === true);
$pg = ana_paginate($rows, 2, 8);
check('page5 slice', $pg['rows'] === [9, 10] && $pg['page'] === 5 && $pg['has_more'] === false);
check('limit clamped low', ana_paginate($rows, 0, 0)['page_size'] === 1);
check('limit clamped high', ana_paginate($rows, 999, 0)['page_size'] === 200);
check('negative offset -> 0', ana_paginate($rows, 3, -5)['rows'] === [1, 2, 3]);

/* ================================================================= 3. ana_mtbf_range_sql */
echo "\n[3] ana_mtbf_range_sql()\n";
check('null range -> empty', ana_mtbf_range_sql(null) === ['', []]);
[$sql, $p] = ana_mtbf_range_sql(['start' => '2025-01-01 00:00:00', 'end' => '2025-03-31 23:59:59']);
check('range sql has CONCAT date', str_contains($sql, "CONCAT(year,'-',LPAD(month,2,'0'),'-01')") && str_contains($sql, 'BETWEEN ? AND ?'));
check('range params truncated to date', $p === ['2025-01-01', '2025-03-31']);

/* ================================================================= 4. reliability */
echo "\n[4] ana_reliability_calc() / ana_reliability()\n";
$RANGE = ana_opts(['role_id' => 1, 'range' => 'custom', 'range_start' => '2025-01-01', 'range_end' => '2025-03-31']);
$calc = ana_reliability_calc($pdo, kpi_parse_range($RANGE));
check('calc failures sum', $calc['failures'] === 6, (string)$calc['failures']);
check('calc operating hours', approx($calc['operating_hours'], 2700.0), (string)$calc['operating_hours']);
check('calc downtime minutes', (float)$calc['downtime_minutes'] === 480.0);
check('calc mtbf = op/failures', approx($calc['mtbf_hours'], 450.0), (string)$calc['mtbf_hours']);
check('calc mttr = dt/failures', approx($calc['mttr_minutes'], 80.0), (string)$calc['mttr_minutes']);
check('calc availability', approx($calc['availability_pct'], 99.7), (string)$calc['availability_pct']);
check('calc rows/assets', $calc['rows'] === 3 && $calc['assets_covered'] === 2);
check('calc source', $calc['source'] === 'mtbf_mttr');
check('calc not insufficient', empty($calc['insufficient']));

$rel = ana_reliability($pdo, $RANGE);
check('rel months count 3', count($rel['months']) === 3);
check('rel month order asc', array_column($rel['months'], 'ym') === ['2025-01', '2025-02', '2025-03']);
check('rel jan mtbf 500', approx($rel['months'][0]['mtbf_hours'], 500.0), (string)$rel['months'][0]['mtbf_hours']);
check('rel mar mttr 100', approx($rel['months'][2]['mttr_minutes'], 100.0), (string)$rel['months'][2]['mttr_minutes']);
check('rel latest = 2025-03', $rel['latest']['ym'] === '2025-03');
check('rel coverage label', $rel['coverage_label'] === 'ข้อมูลถึง 2025-03');

$calcAll = ana_reliability_calc($pdo, null);
check('calc no-range includes 2024-12', $calcAll['rows'] === 4 && $calcAll['failures'] === 11, json_encode([$calcAll['rows'], $calcAll['failures']]));

$relEmpty = ana_reliability_calc($pdo, ['start' => '2000-01-01 00:00:00', 'end' => '2000-12-31 23:59:59']);
check('calc insufficient when empty', !empty($relEmpty['insufficient']) && $relEmpty['failures'] === 0 && $relEmpty['mtbf_hours'] === null);

/* ================================================================= 5. trend */
echo "\n[5] ana_trend()\n";
$tr = ana_trend($pdo, $RANGE + ['bucket' => 'month']);
check('trend bucket month', $tr['bucket'] === 'month');
check('trend filled 3 months', count($tr['rows']) === 3, (string)count($tr['rows']));
$by = [];
foreach ($tr['rows'] as $r) $by[$r['bk']] = $r;
check('trend jan total 2', $by['2025-01']['total'] === 2, (string)$by['2025-01']['total']);
check('trend jan breakdown 1', $by['2025-01']['breakdown'] === 1);
check('trend jan completed 2', $by['2025-01']['completed'] === 2);
check('trend jan mttr 30', approx($by['2025-01']['mttr_min'], 30.0), (string)$by['2025-01']['mttr_min']);
check('trend feb total 1', $by['2025-02']['total'] === 1);
check('trend mar breakdown 0', $by['2025-03']['breakdown'] === 0);
check('trend rel merge jan', isset($by['2025-01']['rel_mtbf_hours']) && approx($by['2025-01']['rel_mtbf_hours'], 500.0));
check('trend bucket validation', ana_trend($pdo, array_merge($RANGE, ['bucket' => 'bogus']))['bucket'] === 'month');
check('trend day bucket', ana_trend($pdo, array_merge($RANGE, ['bucket' => 'day']))['bucket'] === 'day');

/* ================================================================= 6. asset health */
echo "\n[6] ana_asset_health()\n";
$ah = ana_asset_health($pdo, ana_opts(['role_id' => 1]));
$amap = [];
foreach ($ah['assets'] as $a) $amap[$a['code']] = $a;
check('disposed excluded', !isset($amap['OLD-1']));
check('A1 present', isset($amap['PMP-1']));
check('A1 f90 = 3', $amap['PMP-1']['factors']['breakdown_failures_90d'] === 3);
check('A1 downtime 180d = 600', $amap['PMP-1']['factors']['downtime_minutes_180d'] === 600);
check('A1 inspection fail = 1', $amap['PMP-1']['factors']['inspection_fail_180d'] === 1);
check('A1 score 45', $amap['PMP-1']['score'] === 45, (string)$amap['PMP-1']['score']);
check('A1 health ATTENTION', $amap['PMP-1']['health'] === 'ATTENTION', $amap['PMP-1']['health']);
check('A2 score 85 (one overdue active WO)', $amap['MTR-1']['score'] === 85, (string)$amap['MTR-1']['score']);
check('A2 health HEALTHY', $amap['MTR-1']['health'] === 'HEALTHY', $amap['MTR-1']['health']);
check('A4 no data -> INSUFFICIENT', $amap['CLN-1']['health'] === 'INSUFFICIENT_DATA', $amap['CLN-1']['health']);
check('A4 score null', $amap['CLN-1']['score'] === null);
check('summary total includes non-disposed', $ah['summary']['total'] === 4, (string)$ah['summary']['total']);
check('insufficient_count 1', $ah['insufficient_count'] === 1, (string)$ah['insufficient_count']);

/* ================================================================= 7. repeat failures */
echo "\n[7] ana_repeat_failures()\n";
$RANGE_JUN = ana_opts(['role_id' => 1, 'range' => 'custom', 'range_start' => '2025-06-01', 'range_end' => '2025-06-30']);
$rp = ana_repeat_failures($pdo, $RANGE_JUN);
check('repeat 1 asset', $rp['total_repeat_assets'] === 1, (string)$rp['total_repeat_assets']);
$ra = $rp['assets'][0];
check('repeat cnt 3', (int)$ra['cnt'] === 3);
check('repeat avg gap 48h', approx($ra['avg_gap_hours'], 48.0), (string)$ra['avg_gap_hours']);
check('repeat min gap 24h', approx($ra['min_gap_hours'], 24.0), (string)$ra['min_gap_hours']);
$rpD = ana_repeat_failures($pdo, array_merge($RANGE_JUN, ['asset_id' => (string)$A2]));
check('repeat detail returned', is_array($rpD['detail']) && count($rpD['detail']) >= 3, (string)(is_array($rpD['detail']) ? count($rpD['detail']) : -1));
check('repeat no detail without asset_id', $rp['detail'] === null);

/* ================================================================= 8. downtime pareto */
echo "\n[8] ana_downtime_pareto()\n";
$dp = ana_downtime_pareto($pdo, $RANGE);
check('pareto 2 rows', count($dp['rows']) === 2, (string)count($dp['rows']));
check('pareto total 480', (float)$dp['total_downtime_minutes'] === 480.0);
check('pareto desc order', $dp['rows'][0]['asset_id'] === $A2, json_encode(array_column($dp['rows'], 'asset_id')));
check('pareto top pct 62.5', approx($dp['rows'][0]['pct'], 62.5), (string)$dp['rows'][0]['pct']);
check('pareto cumulative ends 100', approx($dp['rows'][1]['cumulative_pct'], 100.0), (string)$dp['rows'][1]['cumulative_pct']);
check('pareto source', $dp['source'] === 'mtbf_mttr');

/* ================================================================= 9. priority + aging */
echo "\n[9] ana_priority_analysis()\n";
$pa = ana_priority_analysis($pdo, ana_opts(['role_id' => 1]));
check('priority total_active 5', $pa['summary']['total_active'] === 5, (string)$pa['summary']['total_active']);
check('priority total_overdue 3', $pa['summary']['total_overdue'] === 3, (string)$pa['summary']['total_overdue']);
check('priority overdue pct 60', approx($pa['summary']['overdue_pct'], 60.0), (string)$pa['summary']['overdue_pct']);
check('priority critical active 2', $pa['by_priority']['critical']['active'] === 2, (string)$pa['by_priority']['critical']['active']);
check('priority high active 1', $pa['by_priority']['high']['active'] === 1);
check('priority low active 1', $pa['by_priority']['low']['active'] === 1);
check('aging 0_7 =1', $pa['aging']['0_7'] === 1, json_encode($pa['aging']));
check('aging 7_14 =1', $pa['aging']['7_14'] === 1);
check('aging 30_plus =3', $pa['aging']['30_plus'] === 3, json_encode($pa['aging']));
check('queue overdue entries carry needs_at key', count(array_filter($pa['queue'], fn($q) => array_key_exists('needs_at', $q))) === 3);

/* ================================================================= 10. PM compliance */
echo "\n[10] ana_pm_compliance()\n";
$pm = ana_pm_compliance($pdo, $RANGE);
check('pm done 3', $pm['summary']['done'] === 3, (string)$pm['summary']['done']);
check('pm on_time 2', $pm['summary']['on_time'] === 2, (string)$pm['summary']['on_time']);
check('pm late 1', $pm['summary']['late'] === 1);
check('pm compliance 66.7', approx($pm['summary']['compliance_pct'], 66.7), (string)$pm['summary']['compliance_pct']);
check('pm overdue active 1', $pm['summary']['overdue_active'] === 1, (string)$pm['summary']['overdue_active']);

/* ================================================================= 11. planned vs unplanned */
echo "\n[11] ana_planned_unplanned()\n";
$pu = ana_planned_unplanned($pdo, $RANGE);
check('pu total 4', $pu['summary']['total_wo'] === 4, (string)$pu['summary']['total_wo']);
check('pu breakdown 2', $pu['summary']['unplanned_breakdown'] === 2);
check('pu pm 1', $pu['summary']['planned_pm'] === 1);
check('pu other 1', $pu['summary']['other'] === 1);
check('pu unplanned pct 50', approx($pu['summary']['unplanned_pct'], 50.0), (string)$pu['summary']['unplanned_pct']);
check('pu by_source 3 entries', count($pu['by_source']) === 3);

/* ================================================================= 12. technician */
echo "\n[12] ana_technician_analytics()\n";
$ta = ana_technician_analytics($pdo, $RANGE);
$tmap = [];
foreach ($ta['technicians'] as $t) $tmap[$t['full_name']] = $t;
check('tech Somsri present', isset($tmap['Somsri K']));
check('Somsri total 3', $tmap['Somsri K']['total'] === 3, (string)$tmap['Somsri K']['total']);
check('Somsri active 1', $tmap['Somsri K']['active_cnt'] === 1);
check('Somsri done 2', $tmap['Somsri K']['done_cnt'] === 2);
check('Somsri avg repair 37.5', approx($tmap['Somsri K']['avg_repair_min'], 37.5), (string)$tmap['Somsri K']['avg_repair_min']);
check('Somsri downtime 150', approx($tmap['Somsri K']['downtime_minutes'], 150.0), (string)$tmap['Somsri K']['downtime_minutes']);
check('Sonchai open 1', $tmap['Somchai P']['open_cnt'] === 1);
check('no overlap (1 active)', $tmap['Somsri K']['overlap_active_high'] === false);
check('tech totals count', $ta['totals']['technicians'] === 2, (string)$ta['totals']['technicians']);

/* ================================================================= 13. spare analytics */
echo "\n[13] ana_spare_analytics()\n";
$sp = ana_spare_analytics($pdo);
check('spare items 4', $sp['summary']['items'] === 4, (string)$sp['summary']['items']);
check('spare stock_qty 1012', approx($sp['summary']['stock_qty'], 1012.0), (string)$sp['summary']['stock_qty']);
check('spare stock_value 101400', approx($sp['summary']['stock_value'], 101400.0), (string)$sp['summary']['stock_value']);
check('spare low_stock 1', $sp['summary']['low_stock'] === 1, (string)$sp['summary']['low_stock']);
check('spare out_of_stock 1', $sp['summary']['out_of_stock'] === 1);
check('spare high_value 1', $sp['summary']['high_value_items'] === 1);
check('spare source sage', str_contains($sp['summary']['source'], 'Sage'));
check('spare usage repair rows 1', $sp['usage']['repair_spare_parts_rows'] === 1);
check('spare usage issue qty 3', approx($sp['usage']['issue_items_total_qty'], 3.0), (string)$sp['usage']['issue_items_total_qty']);
check('spare low list includes SP3 first', $sp['low_stock'][0]['code'] === 'SP3', json_encode(array_column($sp['low_stock'], 'code')));

/* ================================================================= 14. cost analytics */
echo "\n[14] ana_cost_analytics()\n";
$ca = ana_cost_analytics($pdo, $RANGE);
check('cost coverage wos 4', $ca['coverage']['wos'] === 4, (string)$ca['coverage']['wos']);
check('cost coverage with_cost 1', $ca['coverage']['with_cost_gt_0'] === 1, (string)$ca['coverage']['with_cost_gt_0']);
check('cost not insufficient', $ca['coverage']['insufficient'] === false);
check('cost reused kpi_cost present', isset($ca['cost']));

/* ================================================================= 15. data quality */
echo "\n[15] ana_data_quality()\n";
$dq = ana_data_quality($pdo, $RANGE);
check('dq total 4', $dq['total_wos'] === 4, (string)$dq['total_wos']);
check('dq 7 fields', count($dq['fields']) === 7, (string)count($dq['fields']));
$fmap = [];
foreach ($dq['fields'] as $f) $fmap[$f['key']] = $f;
check('dq cost filled 1', $fmap['cost']['filled'] === 1, (string)$fmap['cost']['filled']);
check('dq failure_code filled 1', $fmap['failure_code']['filled'] === 1);
check('dq downtime filled 2', $fmap['downtime']['filled'] === 2, (string)$fmap['downtime']['filled']);
check('dq pct = filled/total', approx($fmap['cost']['pct'], 25.0), (string)$fmap['cost']['pct']);
check('dq reliability months 3', $dq['reliability']['months_covered'] === 3, (string)$dq['reliability']['months_covered']);
check('dq reliability assets 2', $dq['reliability']['assets_covered'] === 2);
check('dq usage_rows 1', $dq['reliability']['usage_rows'] === 1);
check('dq warnings non-empty', count($dq['warnings']) > 0, (string)count($dq['warnings']));

/* ================================================================= 16. overview */
echo "\n[16] ana_overview()\n";
try {
    $ov = ana_overview($pdo, $RANGE);
    check('overview has core', isset($ov['core']));
    check('overview has reliability', isset($ov['reliability']['summary']));
    check('overview planned_unplanned', isset($ov['planned_unplanned']['total_wo']));
    check('overview pm summary', isset($ov['pm']['done']));
    check('overview quality_warnings array', is_array($ov['quality_warnings']));
    check('overview trend <= 12', count($ov['trend']) <= 12);
} catch (Throwable $e) {
    check('overview did not throw', false, $e->getMessage());
}

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
