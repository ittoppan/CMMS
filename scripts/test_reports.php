<?php
/**
 * scripts/test_reports.php — behavioral harness for the reporting engine
 * (src/helpers/reports.php).
 *
 * Covers: rpt_opts, rpt_month_buckets, __rpt_month_th, rpt_permitted,
 * rpt_scope_label, rpt_meta, rpt_audit_filter_json, rpt_log_audit, rpt_kpi,
 * rpt_chart, rpt_col, rpt_page_params, rpt_num, rpt_export_columns/rows,
 * if_e, rpt_repair_where, rpt_request_where, cf_status_counts,
 * cf_pm_status_counts, rpt_build_center, rpt_dispatch.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_rpttest".
 *   php scripts/test_reports.php [--keep]
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
$scratch = $live . '_rpttest';

if (!str_ends_with($scratch, '_rpttest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Reports harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$views = $admin->query("SELECT TABLE_NAME FROM information_schema.VIEWS
                        WHERE TABLE_SCHEMA = " . $admin->quote($live) . " ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
$admin->exec("USE `$scratch`");
$viewCount = 0; $viewErrs = [];
foreach ($views as $v) {
    $ddl = $admin->query("SHOW CREATE VIEW `$live`.`$v`")->fetch(PDO::FETCH_ASSOC)['Create View'] ?? '';
    if ($ddl === '') continue;
    $ddl = preg_replace('/DEFINER=\S+ /', '', $ddl);
    $ddl = str_replace("`$live`.", '', $ddl);
    try { $admin->exec($ddl); $viewCount++; } catch (Throwable $e) { $viewErrs[] = "$v: " . $e->getMessage(); }
}
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo 'Cloned structure of ' . count($tables) . ' tables and ' . $viewCount . ' of ' . count($views) . " views.\n";
foreach ($viewErrs as $e) echo "  view-clone-warn: $e\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/reports.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

function ins(PDO $pdo, string $table, array $data): int {
    $cols = array_keys($data);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES ('
        . implode(',', array_fill(0, count($cols), '?')) . ')';
    $pdo->prepare($sql)->execute(array_values($data));
    return (int)$pdo->lastInsertId();
}

/* ================================================================= fixtures */
$NOW = time();
$D = fn(int $days) => date('Y-m-d H:i:s', $NOW + $days * 86400);

$DEPT = ins($pdo, 'departments', ['code' => 'MAINT', 'name' => 'Maintenance']);
$A1 = ins($pdo, 'asset_registry', ['code' => 'PMP-1', 'name' => 'Feed Pump', 'category' => 'pump', 'criticality' => 'A', 'status' => 'active', 'department_id' => $DEPT]);
$A2 = ins($pdo, 'asset_registry', ['code' => 'MTR-1', 'name' => 'Drive Motor', 'category' => 'motor', 'criticality' => 'B', 'status' => 'active']);
$U1 = ins($pdo, 'users', ['username' => 'somsri', 'email' => 'somsri@x.io', 'password' => 'x', 'full_name' => 'Somsri K', 'role_id' => 3]);

/* repairs for cf_status_counts (no range → all time) */
ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-1', 'title' => 'Seal leak', 'source_type' => 'breakdown', 'status' => 'open', 'created_at' => $D(-5)]);
ins($pdo, 'repair', ['asset_id' => $A1, 'work_order_no' => 'WO-2', 'title' => 'Vib', 'source_type' => 'breakdown', 'status' => 'open', 'created_at' => $D(-4)]);
ins($pdo, 'repair', ['asset_id' => $A2, 'work_order_no' => 'WO-3', 'title' => 'PM', 'source_type' => 'pm', 'status' => 'closed', 'created_at' => $D(-3)]);

/* pm_am for cf_pm_status_counts */
ins($pdo, 'pm_am', ['asset_id' => $A1, 'title' => 'PM A', 'status' => 'completed']);
ins($pdo, 'pm_am', ['asset_id' => $A1, 'title' => 'PM B', 'status' => 'pending']);
ins($pdo, 'pm_am', ['asset_id' => $A2, 'title' => 'PM C', 'status' => 'pending']);

/* maintenance_requests for request-scope + center meta */
ins($pdo, 'maintenance_requests', ['request_code' => 'MR-1', 'asset_id' => $A1, 'title' => 'Req 1', 'status' => 'open', 'requested_by' => $U1, 'created_at' => $D(-2)]);
ins($pdo, 'maintenance_requests', ['request_code' => 'MR-2', 'asset_id' => $A2, 'title' => 'Req 2', 'status' => 'closed', 'requested_by' => $U1, 'created_at' => $D(-1)]);

/* ================================================================= 1. pure helpers */
echo "\n[1] pure helpers\n";
check('rpt_num 1234.5', rpt_num(1234.5) === '1234.5', rpt_num(1234.5));
check('rpt_num 1000', rpt_num(1000) === '1000', rpt_num(1000));
check('rpt_num 12.00', rpt_num(12.00) === '12', rpt_num(12.00));
check('rpt_num -3.10', rpt_num(-3.10) === '-3.1', rpt_num(-3.10));
check('rpt_num string passthrough', rpt_num('abc') === 'abc', rpt_num('abc'));
check('rpt_num 0', rpt_num(0) === '0', rpt_num(0));
check('rpt_num numeric-string', rpt_num('12.50') === '12.5', rpt_num('12.50'));

check('if_e true', if_e(true, ['a' => 1]) === ['a' => 1]);
check('if_e false', if_e(false, ['a' => 1]) === null);

$kpi = rpt_kpi('k', 'l', 5, 'ใบ', 'red', 'number');
check('rpt_kpi keys', array_keys($kpi) === ['key', 'label', 'value', 'unit', 'tone', 'fmt']);
check('rpt_kpi fmt default', rpt_kpi('k', 'l', 1)['fmt'] === 'number');

$ch = rpt_chart('id', 't', 'bar', 'key', [['key' => 'c']], [[1]], 'd');
check('rpt_chart keys', array_keys($ch) === ['id', 'title', 'kind', 'xKey', 'keys', 'data', 'desc']);
check('rpt_chart desc default', rpt_chart('id', 't', 'bar', 'k', [], [])['desc'] === '');

$col = rpt_col('c', 'C');
check('rpt_col defaults', $col === ['key' => 'c', 'label' => 'C', 'align' => 'left', 'type' => 'text']);

check('__rpt_month_th 03', __rpt_month_th('03') === 'มี.ค.', __rpt_month_th('03'));
check('__rpt_month_th 3', __rpt_month_th('3') === 'มี.ค.', __rpt_month_th('3'));
check('__rpt_month_th 12', __rpt_month_th('12') === 'ธ.ค.', __rpt_month_th('12'));
check('__rpt_month_th 13 passthrough', __rpt_month_th('13') === '13', __rpt_month_th('13'));

/* ================================================================= 2. month buckets */
echo "\n[2] rpt_month_buckets()\n";
$b = rpt_month_buckets(null, 12);
check('12 buckets (no range)', count($b) === 12, (string)count($b));
check('last bucket = current month', array_key_last($b) === date('Y-m'), array_key_last($b));
check('first bucket = -11 months', array_key_first($b) === date('Y-m', strtotime('-11 months')), array_key_first($b));
$b1 = rpt_month_buckets(null, 1);
check('1 bucket', count($b1) === 1 && array_key_first($b1) === date('Y-m'), (string)count($b1));
$br = rpt_month_buckets(['start' => '2024-01-15', 'end' => '2024-03-20'], 12);
check('range 3 buckets', count($br) === 3, (string)count($br));
check('range keys', array_keys($br) === ['2024-01', '2024-02', '2024-03'], implode(',', array_keys($br)));
check('range label', $br['2024-01']['label'] === 'ม.ค. 2024', $br['2024-01']['label']);
$bs = rpt_month_buckets(['start' => '2024-05-01', 'end' => '2024-05-31'], 12);
check('same-month range = 1', count($bs) === 1, (string)count($bs));

/* ================================================================= 3. permission / scope labels */
echo "\n[3] permissions + labels\n";
check('cost role1', rpt_permitted('cost', 1) === true);
check('cost role2', rpt_permitted('cost', 2) === true);
check('cost role6', rpt_permitted('cost', 6) === true);
check('cost role3 denied', rpt_permitted('cost', 3) === false);
check('cost role7 denied', rpt_permitted('cost', 7) === false);
check('technicians role7 ok', rpt_permitted('technicians', 7) === true);
check('technicians role5 denied', rpt_permitted('technicians', 5) === false);
check('center any role ok', rpt_permitted('center', 5) === true && rpt_permitted('center', 3) === true);
check('scope label 3', rpt_scope_label(3) === 'เฉพาะงานที่มอบหมาย / เข้าร่วม (Technician)', rpt_scope_label(3));
check('scope label 4', rpt_scope_label(4) === 'เฉพาะงานที่ตนเองแจ้ง (Operator)', rpt_scope_label(4));
check('scope label 5', rpt_scope_label(5) === 'ดูได้ทุกหน่วยงาน (อ่านอย่างเดียว)', rpt_scope_label(5));
check('scope label default', rpt_scope_label(1) === 'ภาพรวมทุกหน่วยงาน', rpt_scope_label(1));

/* ================================================================= 4. page params */
echo "\n[4] rpt_page_params()\n";
$_GET = [];
$p = rpt_page_params([]);
check('page default limit', $p['limit'] === 50, (string)$p['limit']);
check('page default offset', $p['offset'] === 0);
check('page default group_by', $p['group_by'] === '');
$_GET = ['limit' => '999', 'offset' => '10', 'group_by' => 'day'];
$p = rpt_page_params([]);
check('limit clamped to 300', $p['limit'] === 300, (string)$p['limit']);
check('offset 10', $p['offset'] === 10);
check('group_by day', $p['group_by'] === 'day');
$_GET = ['limit' => '0', 'offset' => '-5'];
$p = rpt_page_params([]);
check('limit 0 → 1', $p['limit'] === 1, (string)$p['limit']);
check('offset negative → 0', $p['offset'] === 0);
$_GET = ['limit' => '75'];
check('limit custom', rpt_page_params([], 20, 100)['limit'] === 75);
$_GET = ['limit' => '1000'];
check('limit custom max', rpt_page_params([], 20, 100)['limit'] === 100);
$_GET = [];

/* ================================================================= 5. export helpers */
echo "\n[5] export helpers\n";
check('export columns empty', rpt_export_columns(['columns' => []]) === []);
check('export columns no table', rpt_export_columns(['foo' => 1]) === []);
$tbl = ['columns' => [
    rpt_col('a', 'A'),
    rpt_col('_href', 'H'),
    rpt_col('b', 'B', 'right', 'money'),
]];
$cols = rpt_export_columns($tbl);
check('export columns drops _href', count($cols) === 2 && $cols[0]['key'] === 'a' && $cols[1]['key'] === 'b', (string)count($cols));
$rows = rpt_export_rows(
    [['a' => 'x', 'b' => 1234.5, 'c' => 50, 'd' => '2024-01-02', 'e' => null]],
    [rpt_col('a', 'A'), rpt_col('b', 'B', 'right', 'money'), rpt_col('c', 'C', 'right', 'pct'),
     rpt_col('d', 'D', 'left', 'date'), rpt_col('e', 'E')]
);
check('export row money fmt', $rows[0][1] === '1234.5', (string)$rows[0][1]);
check('export row pct fmt', $rows[0][2] === '50%', (string)$rows[0][2]);
check('export row date passthrough', $rows[0][3] === '2024-01-02');
check('export row null → empty', $rows[0][4] === '');
check('export row text', $rows[0][0] === 'x');

/* ================================================================= 6. where builders */
echo "\n[6] where builders\n";
$_SESSION = ['role_id' => 1, 'user_id' => 0];
$_GET = [];
$w = rpt_repair_where($pdo, rpt_opts());
check('repair where base', str_contains($w['where'], 'WHERE 1=1'), $w['where']);
check('repair where params array', is_array($w['params']));

$opts3 = ['role_id' => 3, 'user_id' => $U1, 'range' => '', 'range_start' => '', 'range_end' => '',
    'department_id' => '', 'location_id' => '', 'asset_id' => '', 'asset_category' => '',
    'technician_id' => '', 'source_type' => '', 'priority' => '', 'status' => ''];
$rw3 = rpt_request_where($pdo, $opts3);
check('request scope role3 adds requested_by', str_contains($rw3['where'], 'mr.requested_by = ?'), $rw3['where']);
check('request scope role3 param uid', in_array($U1, $rw3['params'], false), implode(',', $rw3['params']));
$rw1 = rpt_request_where($pdo, rpt_opts());
check('request scope role1 no requested_by', !str_contains($rw1['where'], 'mr.requested_by'));

/* ================================================================= 7. meta + audit */
echo "\n[7] rpt_meta + audit log\n";
$_SESSION = ['role_id' => 2, 'user_id' => 1, 'role_name' => 'Manager'];
$m = rpt_meta($pdo, ['id' => 1, 'full_name' => 'Mgr', 'role_id' => 2], 'center');
check('meta user id', $m['user']['id'] === 1);
check('meta role_name from session', $m['user']['role_name'] === 'Manager', $m['user']['role_name']);
check('meta can_cost role2', $m['scope']['can_cost'] === true);
check('meta perm supervisor role2', $m['perm']['supervisor'] === true);
check('meta perm review role2', $m['perm']['review'] === true);
check('meta generated_at set', $m['generated_at'] !== '');

$_SESSION = ['role_id' => 3, 'user_id' => 9, 'role_name' => 'Technician'];
$m3 = rpt_meta($pdo, ['id' => 9, 'full_name' => 'Tech', 'role_id' => 3], 'center');
check('meta role3 no cost', $m3['scope']['can_cost'] === false);
check('meta role3 no supervisor', $m3['perm']['supervisor'] === false);
check('meta role3 no review', $m3['perm']['review'] === false);
check('meta role3 label', $m3['scope']['label'] === rpt_scope_label(3));

$_GET = [];
check('audit json empty → empty object/array', json_decode(rpt_audit_filter_json(), true) === [], rpt_audit_filter_json());
$_GET = ['range' => '2025', 'status' => 'open', 'noise' => 'x'];
$aj = json_decode(rpt_audit_filter_json(), true);
check('audit json keeps range', ($aj['range'] ?? null) === '2025');
check('audit json keeps status', ($aj['status'] ?? null) === 'open');
check('audit json drops unknown', !array_key_exists('noise', $aj));

$before = (int)$pdo->query('SELECT COUNT(*) FROM report_audit_log')->fetchColumn();
rpt_log_audit($pdo, 1, 'Admin', 'center', 'csv', 7);
$after = (int)$pdo->query('SELECT COUNT(*) FROM report_audit_log')->fetchColumn();
check('audit log inserted', $after === $before + 1, "{$before} to {$after}");
$last = $pdo->query('SELECT * FROM report_audit_log ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
check('audit log report', $last['report'] === 'center');
check('audit log export_type', $last['export_type'] === 'csv');
check('audit log row_count', (int)$last['row_count'] === 7);

/* ================================================================= 8. aggregate counts */
echo "\n[8] cf_status_counts / cf_pm_status_counts\n";
$_SESSION = ['role_id' => 1, 'user_id' => 0];
$_GET = [];
$sc = cf_status_counts($pdo, rpt_opts());
$scMap = [];
foreach ($sc as $r) $scMap[$r['key']] = (int)$r['cnt'];
check('status open = 2', ($scMap['open'] ?? 0) === 2, json_encode($scMap, JSON_UNESCAPED_UNICODE));
check('status closed = 1', ($scMap['closed'] ?? 0) === 1, json_encode($scMap, JSON_UNESCAPED_UNICODE));
check('status counts ordered desc', (int)$sc[0]['cnt'] >= (int)$sc[count($sc) - 1]['cnt']);

$pc = cf_pm_status_counts($pdo, rpt_opts());
$pcMap = [];
foreach ($pc as $r) $pcMap[$r['key']] = (int)$r['cnt'];
check('pm pending = 2', ($pcMap['pending'] ?? 0) === 2, json_encode($pcMap, JSON_UNESCAPED_UNICODE));
check('pm completed = 1', ($pcMap['completed'] ?? 0) === 1, json_encode($pcMap, JSON_UNESCAPED_UNICODE));

/* ================================================================= 9. build_center */
echo "\n[9] rpt_build_center()\n";
try {
    $center = rpt_build_center($pdo, ['id' => 1, 'full_name' => 'Admin', 'role_id' => 1], rpt_opts());
    check('center resource', ($center['resource'] ?? '') === 'center');
    check('center title_th', isset($center['title_th']) && $center['title_th'] !== '');
    check('center kpi array', is_array($center['kpi']) && count($center['kpi']) > 0, (string)count($center['kpi'] ?? []));
    check('center kpi no nulls (if_e filtered)', !in_array(null, $center['kpi'], true));
    check('center charts count 3', count($center['charts']) === 3, (string)count($center['charts']));
    check('center table null', $center['table'] === null);
    check('center meta requests', isset($center['meta']['requests']['total']));
    check('center meta requests total = 2', (int)$center['meta']['requests']['total'] === 2, (string)($center['meta']['requests']['total'] ?? '?'));
    $hasCost = false;
    foreach ($center['kpi'] as $k) if ($k['key'] === 'cost_total') $hasCost = true;
    check('center cost kpi present for role1', $hasCost);
} catch (Throwable $e) {
    check('build_center did not throw', false, $e->getMessage());
}

/* role 3 (no cost) should omit cost kpi */
$_SESSION = ['role_id' => 3, 'user_id' => 9];
try {
    $center3 = rpt_build_center($pdo, ['id' => 9, 'full_name' => 'Tech', 'role_id' => 3], rpt_opts());
    $hasCost3 = false;
    foreach ($center3['kpi'] as $k) if ($k['key'] === 'cost_total') $hasCost3 = true;
    check('center omits cost kpi for role3', $hasCost3 === false);
} catch (Throwable $e) {
    check('build_center role3 did not throw', false, $e->getMessage());
}

/* ================================================================= 10. dispatch */
echo "\n[10] rpt_dispatch()\n";
$_SESSION = ['role_id' => 1, 'user_id' => 0];
$d = rpt_dispatch($pdo, ['id' => 1, 'full_name' => 'Admin', 'role_id' => 1], 'center', rpt_opts());
check('dispatch center resource', ($d['resource'] ?? '') === 'center');

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
