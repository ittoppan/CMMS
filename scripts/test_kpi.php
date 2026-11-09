<?php
/**
 * scripts/test_kpi.php — behavioral harness for the shared KPI helper (src/helpers/kpi.php).
 *
 * Covers: kpi_parse_range, kpi_range_sql, kpi_filters, kpi_scope, kpi_can_see_cost,
 * kpi_resolve_role, kpi_arr_get, kpi_dashboard_role, kpi_active_statuses,
 * kpi_done_statuses, kpi_is_overdue, kpi_overdue_days.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_kpitest".
 *   php scripts/test_kpi.php [--keep]
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
$scratch = $live . '_kpitest';

if (!str_ends_with($scratch, '_kpitest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "KPI harness on scratch DB: $scratch (live: $live)\n";
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

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
$_SESSION = [];

/* ================================================================= 1. parse_range */
echo "\n[1] kpi_parse_range()\n";
check('empty -> null', kpi_parse_range([]) === null);
check('unknown -> null', kpi_parse_range(['range' => 'bogus']) === null);
check('TODAY uppercase accepted', kpi_parse_range(['range' => 'TODAY']) !== null);

$r = kpi_parse_range(['range' => 'today']);
check('today start = 00:00:00', $r['start'] === date('Y-m-d 00:00:00'));
check('today end = 23:59:59', $r['end'] === date('Y-m-d 23:59:59'));

$r = kpi_parse_range(['range' => 'yesterday']);
check('yesterday bounds', $r['start'] === date('Y-m-d 00:00:00', strtotime('-1 day')) && $r['end'] === date('Y-m-d 23:59:59', strtotime('-1 day')));

$r = kpi_parse_range(['range' => 'this_month']);
check('this_month start = 1st', $r['start'] === date('Y-m-01 00:00:00'));

$r = kpi_parse_range(['range' => 'last_month']);
check('last_month start', $r['start'] === date('Y-m-01 00:00:00', strtotime('first day of last month')));
check('last_month end', $r['end'] === date('Y-m-t 23:59:59', strtotime('last day of last month')));

$r = kpi_parse_range(['range' => 'this_year']);
check('this_year start = Jan 1', $r['start'] === date('Y-01-01 00:00:00'));

$y = (int)date('Y') - 1;
$r = kpi_parse_range(['range' => 'last_year']);
check('last_year bounds', $r['start'] === sprintf('%04d-01-01 00:00:00', $y) && $r['end'] === sprintf('%04d-12-31 23:59:59', $y));

foreach (['this_week', 'last_week', 'this_quarter', 'last_quarter'] as $rng) {
    $r = kpi_parse_range(['range' => $rng]);
    check("$rng is a valid ordered range", $r !== null && $r['start'] <= $r['end'], json_encode($r));
}
$tq = kpi_parse_range(['range' => 'this_quarter']);
$lq = kpi_parse_range(['range' => 'last_quarter']);
check('last_quarter before this_quarter', $lq['start'] < $tq['start']);
$lqStart = new DateTime($lq['start']);
check('last_quarter end = start +3m -1s', $lq['end'] === $lqStart->modify('+3 months -1 second')->format('Y-m-d H:i:s'));
check('last_quarter start is a quarter month', in_array((int)date('n', strtotime($lq['start'])), [1, 4, 7, 10], true));

$r = kpi_parse_range(['range' => 'custom', 'range_start' => '2024-03-05', 'range_end' => '2024-03-10']);
check('custom start', $r['start'] === '2024-03-05 00:00:00');
check('custom end', $r['end'] === '2024-03-10 23:59:59');
check('custom missing end -> null', kpi_parse_range(['range' => 'custom', 'range_start' => '2024-03-05']) === null);

/* ================================================================= 2. range_sql */
echo "\n[2] kpi_range_sql()\n";
check('null range -> empty', kpi_range_sql(null, 'r.created_at') === '');
check('range -> BETWEEN clause', kpi_range_sql(['start' => 'x', 'end' => 'y'], 'r.due_date') === ' AND r.due_date BETWEEN ? AND ? ');

/* ================================================================= 3. filters */
echo "\n[3] kpi_filters()\n";
$f = kpi_filters($pdo, []);
check('empty -> no sql/params', $f['sql'] === '' && $f['params'] === []);
$f = kpi_filters($pdo, ['department_id' => 0]);
check('zero int filter skipped', $f['sql'] === '');
$f = kpi_filters($pdo, ['department_id' => '5', 'priority' => 'high']);
check('int + priority', str_contains($f['sql'], 'r.department_id = ?') && str_contains($f['sql'], 'r.priority = ?') && $f['params'] === [5, 'high'], json_encode($f));
$f = kpi_filters($pdo, ['technician_id' => 3]);
check('technician -> assigned OR work_assignees', str_contains($f['sql'], 'r.assigned_to = ?') && str_contains($f['sql'], 'work_assignees') && $f['params'] === [3, 3], json_encode($f));
$f = kpi_filters($pdo, ['asset_category' => 'pump']);
check('asset_category -> EXISTS subquery', str_contains($f['sql'], 'asset_registry') && $f['params'] === ['pump']);
$f = kpi_filters($pdo, ['department_id' => 2, 'location_id' => 4, 'asset_id' => 9, 'source_type' => 'pm', 'status' => 'open']);
check('combined param order', $f['params'] === [2, 4, 9, 'pm', 'open'], json_encode($f['params']));

/* ================================================================= 4. scope / roles */
echo "\n[4] kpi_scope() / kpi_can_see_cost()\n";
$s = kpi_scope($pdo, 3, 42);
check('technician scope', str_contains($s['sql'], '.assigned_to = ?') && $s['params'] === [42, 42]);
$s = kpi_scope($pdo, 4, 42);
check('operator scope (alias r)', str_contains($s['sql'], '.created_by = ?') && $s['params'] === [42]);
$s = kpi_scope($pdo, 4, 42, 'x');
check('operator scope non-r alias -> unrestricted', $s['sql'] === '');
$s = kpi_scope($pdo, 1, 42);
check('admin unrestricted', $s['sql'] === '');
check('can_see_cost 1,2,6', kpi_can_see_cost(1) && kpi_can_see_cost(2) && kpi_can_see_cost(6));
check('cannot see cost 3,4,5,7', !kpi_can_see_cost(3) && !kpi_can_see_cost(4) && !kpi_can_see_cost(5) && !kpi_can_see_cost(7));

/* ================================================================= 5. resolve role / helpers */
echo "\n[5] kpi_resolve_role() / kpi_arr_get() / kpi_dashboard_role()\n";
check('explicit role_id wins', kpi_resolve_role($pdo, ['role_id' => 7]) === 7);
check('map admin', kpi_resolve_role($pdo, ['role' => 'admin']) === 1);
check('map asst manager', kpi_resolve_role($pdo, ['role' => 'asst manager']) === 6);
check('map technician (thai)', kpi_resolve_role($pdo, ['role' => 'ช่าง']) === 3);
check('map operator', kpi_resolve_role($pdo, ['role' => 'operator']) === 4);
$_SESSION = ['role_name' => 'manager'];
check('session fallback', kpi_resolve_role($pdo, []) === 2);
$_SESSION = [];
check('unknown role text -> 0 (no roles row)', kpi_resolve_role($pdo, ['role' => 'nobody']) === 0);

check('arr_get present', kpi_arr_get(['a' => 5], 'a', 9) === 5);
check('arr_get default', kpi_arr_get([], 'a', 9) === 9);
check('arr_get null falls back', kpi_arr_get(['a' => null], 'a', 9) === 9);

check('dashboard name planner', kpi_dashboard_role(['role_name' => 'planner']) === 'planner');
check('dashboard name engineer', kpi_dashboard_role(['role_name' => 'Engineer']) === 'engineer');
check('dashboard role 1 -> admin', kpi_dashboard_role(['role_id' => 1]) === 'admin');
check('dashboard role 6 -> manager', kpi_dashboard_role(['role_id' => 6]) === 'manager');
check('dashboard role 7 -> planner', kpi_dashboard_role(['role_id' => 7]) === 'planner');
check('dashboard role 3 -> technician', kpi_dashboard_role(['role_id' => 3]) === 'technician');
check('dashboard role 4 -> operator', kpi_dashboard_role(['role_id' => 4]) === 'operator');
check('dashboard role 5 -> manager', kpi_dashboard_role(['role_id' => 5]) === 'manager');
check('dashboard unknown -> operator', kpi_dashboard_role(['role_id' => 99]) === 'operator');

/* ================================================================= 6. status groups */
echo "\n[6] kpi_active_statuses() / kpi_done_statuses()\n";
$active = kpi_active_statuses(); $done = kpi_done_statuses();
check('active has in_progress', in_array('in_progress', $active, true));
check('active has open', in_array('open', $active, true));
check('done has closed', in_array('closed', $done, true));
check('done has cancelled', in_array('cancelled', $done, true));
check('active/done disjoint', array_intersect($active, $done) === []);

/* ================================================================= 7. overdue */
echo "\n[7] kpi_is_overdue() / kpi_overdue_days()\n";
$past = date('Y-m-d H:i:s', time() - 86400);
$future = date('Y-m-d H:i:s', time() + 86400);
$old = date('Y-m-d H:i:s', time() - 10 * 86400);
$recent = date('Y-m-d H:i:s', time() - 3600);

check('closed never overdue', kpi_is_overdue(['status' => 'closed', 'sla_due_at' => $past]) === false);
check('sla in past -> overdue', kpi_is_overdue(['status' => 'in_progress', 'sla_due_at' => $past]) === true);
check('estimated in past -> overdue', kpi_is_overdue(['status' => 'in_progress', 'estimated_completion_date' => $past]) === true);
check('future due -> not overdue', kpi_is_overdue(['status' => 'in_progress', 'sla_due_at' => $future]) === false);
check('"NULL" literal ignored + old open -> overdue', kpi_is_overdue(['status' => 'open', 'sla_due_at' => 'NULL', 'created_at' => $old]) === true);
check('zero-date ignored', kpi_is_overdue(['status' => 'open', 'sla_due_at' => '0000-00-00 00:00:00', 'created_at' => date('Y-m-d H:i:s')]) === false);
check('old created_at + in_progress -> not open-age overdue', kpi_is_overdue(['status' => 'in_progress', 'created_at' => $old]) === false);
check('recent open -> not overdue', kpi_is_overdue(['status' => 'open', 'created_at' => $recent]) === false);

check('overdue_days closed -> 0', kpi_overdue_days(['status' => 'closed', 'sla_due_at' => $past]) === 0);
check('overdue_days sla 3d -> 3', kpi_overdue_days(['status' => 'in_progress', 'sla_due_at' => date('Y-m-d H:i:s', time() - 3 * 86400)]) === 3);
check('overdue_days sla precedence', kpi_overdue_days(['status' => 'in_progress', 'sla_due_at' => date('Y-m-d H:i:s', time() - 2 * 86400), 'estimated_completion_date' => date('Y-m-d H:i:s', time() - 5 * 86400)]) === 2);
check('overdue_days open-age fallback -> 10', kpi_overdue_days(['status' => 'open', 'created_at' => $old]) === 10);
check('overdue_days recent -> 0', kpi_overdue_days(['status' => 'open', 'created_at' => $recent]) === 0);

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
