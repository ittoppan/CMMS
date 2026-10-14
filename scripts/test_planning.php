<?php
/**
 * scripts/test_planning.php — behavioral harness for the Phase-25 planning engine.
 *
 * Covers src/helpers/planning.php:
 *   - pln_group()               queue classification (workorder + request kinds)
 *   - pln_sla_risk()            safe / at_risk / breached
 *   - pln_skill_match()         qualified / missing skills (pure)
 *   - pln_priority_explanation() reason weights + level + rule
 *   - pln_duration_estimate()   historical estimate with clause precedence
 *   - pln_detect_conflicts()    technician / asset / pm overlaps + self-exclude
 *   - pln_readiness()           READY / PARTIAL / BLOCKED across 4 checks
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_plntest".
 *
 *   php scripts/test_planning.php [--keep]
 *
 * SAFETY: refuses to run unless the scratch name ends in "_plntest", differs from the
 * live DB name, and SELECT DATABASE() is verified after connecting.
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
$scratch = $live . '_plntest';

if (!str_ends_with($scratch, '_plntest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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

echo "Planning harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
$cloned = 0;
foreach ($tables as $t) {
    $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
    $cloned++;
}
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo "Cloned structure of $cloned tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/notification.php'; // getSettingValue()
require_once __DIR__ . '/../src/helpers/roles.php';
require_once __DIR__ . '/../src/helpers/kpi.php';
require_once __DIR__ . '/../src/helpers/assignees.php';
require_once __DIR__ . '/../src/helpers/planning.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$now = time();
$H = fn(int $h) => date('Y-m-d H:i:s', $now + $h * 3600);
$cfg = ['sla_risk_hours' => 24];

/* ================================================================== 1. pln_group */
echo "\n[1] pln_group()\n";
$g = fn(array $r, string $kind = 'workorder') => pln_group($r, $cfg, $kind);
check('done status -> done', $g(['status' => 'closed']) === 'done');
check('overdue SLA -> overdue', $g(['status' => 'open', 'sla_due_at' => $H(-24)]) === 'overdue');
check('SLA within risk window -> at_risk', $g(['status' => 'open', 'sla_due_at' => $H(10)]) === 'at_risk');
check('planned window -> scheduled', $g(['status' => 'open', 'planned_start_at' => $H(48), 'planned_end_at' => $H(50)]) === 'scheduled');
check('approved w/o window -> unplanned', $g(['status' => 'approved']) === 'unplanned');
check('draft w/o window -> unplanned', $g(['status' => 'draft']) === 'unplanned');
check('open w/o window/sla -> unscheduled', $g(['status' => 'open']) === 'unscheduled');
check('request kind: open -> new_request', $g(['status' => 'open'], 'request') === 'new_request');
check('request kind: approved -> scheduled', $g(['status' => 'approved'], 'request') === 'scheduled');
check('request kind: rejected -> done', $g(['status' => 'rejected'], 'request') === 'done');

/* ================================================================== 2. pln_sla_risk */
echo "\n[2] pln_sla_risk()\n";
check('done -> safe', pln_sla_risk(['status' => 'closed', 'sla_due_at' => $H(-100)]) === 'safe');
check('past SLA active -> breached', pln_sla_risk(['status' => 'open', 'sla_due_at' => $H(-1)]) === 'breached');
check('SLA within window -> at_risk', pln_sla_risk(['status' => 'open', 'sla_due_at' => $H(10)], 24) === 'at_risk');
check('SLA beyond window -> safe', pln_sla_risk(['status' => 'open', 'sla_due_at' => $H(100)], 24) === 'safe');
check('no SLA -> safe', pln_sla_risk(['status' => 'open']) === 'safe');

/* ================================================================== 3. pln_skill_match */
echo "\n[3] pln_skill_match()\n";
$skills = [
    7 => [['skill_name' => 'Mechanical', 'skill_level' => 3], ['skill_name' => 'Electrical', 'skill_level' => 2]],
    8 => [['skill_name' => 'Welding', 'skill_level' => 1]],
];
$m = pln_skill_match($skills, [7], '');
check('no required skill -> qualified', $m['qualified'] === true && $m['required'] === []);
$m = pln_skill_match($skills, [7], 'Mechanical');
check('single match -> qualified', $m['qualified'] === true, json_encode($m));
$m = pln_skill_match($skills, [7], 'mechanical');
check('case-insensitive match -> qualified', $m['qualified'] === true);
$m = pln_skill_match($skills, [7], 'Mechanical, Welding');
check('one missing -> not qualified', $m['qualified'] === false && $m['missing'] === ['Welding'], json_encode($m['missing']));
$m = pln_skill_match($skills, [7, 8], 'Mechanical, Welding');
check('team coverage across members -> qualified', $m['qualified'] === true);
$m = pln_skill_match($skills, [], 'Mechanical');
check('empty team + required -> all missing', $m['qualified'] === false && $m['missing'] === ['Mechanical']);
$m = pln_skill_match($skills, [7], ' Mechanical , Electrical ');
check('trims whitespace in required list', $m['qualified'] === true && count($m['required']) === 2);
$m = pln_skill_match($skills, [7, 8], 'Mechanical');
check('team_levels keyed by user id', isset($m['team_levels'][7]) && isset($m['team_levels'][8]));

/* ================================================================== 4. pln_priority_explanation */
echo "\n[4] pln_priority_explanation()\n";
$p = pln_priority_explanation($pdo, ['priority' => 'critical']);
check('critical priority -> level HIGH', $p['level'] === 'HIGH', $p['level']);
check('critical priority -> rule priority_critical', $p['rule'] === 'priority_critical');
$p = pln_priority_explanation($pdo, ['priority' => 'critical', 'asset_criticality' => 'A']);
check('critical + criticality A -> CRITICAL', $p['level'] === 'CRITICAL', $p['level']);
$p = pln_priority_explanation($pdo, ['priority' => 'low', 'work_order_type' => 'pm', 'created_at' => date('Y-m-d H:i:s')]);
check('non-breakdown routine row -> LOW with routine reason', $p['level'] === 'LOW' && $p['reasons'][0]['key'] === 'routine', json_encode($p));
$p = pln_priority_explanation($pdo, ['priority' => 'low', 'created_at' => date('Y-m-d H:i:s')]);
check('missing work_order_type defaults to breakdown', in_array('breakdown', array_column($p['reasons'], 'key'), true));
$p = pln_priority_explanation($pdo, ['priority' => 'low', 'sla_due_at' => $H(-1)]);
check('overdue SLA reason present', in_array('overdue_sla', array_column($p['reasons'], 'key'), true));
check('overdue SLA drives CRITICAL', $p['level'] === 'CRITICAL', $p['level']);
$p = pln_priority_explanation($pdo, ['priority' => 'low', 'work_order_type' => 'breakdown']);
check('breakdown -> rule priority_critical', $p['rule'] === 'priority_critical');
check('breakdown reason present', in_array('breakdown', array_column($p['reasons'], 'key'), true));

/* ================================================================== 5. pln_duration_estimate */
echo "\n[5] pln_duration_estimate()\n";
$pdo->exec("INSERT INTO asset_registry (code, name, category) VALUES ('AST-P1', 'Pump P', 'Pump')");
$assetId = (int)$pdo->lastInsertId();
$insRepair = function (array $cols) use ($pdo): int {
    $keys = array_keys($cols);
    $ph = implode(',', array_fill(0, count($keys), '?'));
    $pdo->prepare('INSERT INTO repair (' . implode(',', $keys) . ') VALUES (' . $ph . ')')->execute(array_values($cols));
    return (int)$pdo->lastInsertId();
};
$insRepair(['asset_id' => $assetId, 'title' => 'h1', 'status' => 'closed', 'failure_code_id' => 5, 'repair_time_minutes' => 30]);
$insRepair(['asset_id' => $assetId, 'title' => 'h2', 'status' => 'verified', 'failure_code_id' => 5, 'repair_time_minutes' => 60]);
check('no history -> source none', pln_duration_estimate($pdo, ['failure_code_id' => 999, 'asset_id' => 999])['source'] === 'none');
$d = pln_duration_estimate($pdo, ['failure_code_id' => 5]);
check('failure-code history -> source history', $d['source'] === 'history', json_encode($d));
check('failure-code history count=2', $d['count'] === 2);
check('failure-code avg=45', (int)$d['avg_minutes'] === 45, (string)$d['avg_minutes']);
check('min/max captured', (int)$d['min'] === 30 && (int)$d['max'] === 60);
$d = pln_duration_estimate($pdo, ['asset_id' => $assetId]);
check('asset clause fallback works', $d['source'] === 'history' && $d['count'] === 2);

/* ================================================================== 6. pln_detect_conflicts */
echo "\n[6] pln_detect_conflicts()\n";
$pdo->exec("INSERT INTO users (username, email, password, full_name, is_active) VALUES ('t_conf', 'tc@x.test','x','ช่าง คอน',1)");
$tech1 = (int)$pdo->lastInsertId();
$s = '2026-01-05 10:00:00'; $e = '2026-01-05 12:00:00';
$woA = $insRepair(['asset_id' => $assetId, 'title' => 'A', 'status' => 'open', 'assigned_to' => $tech1,
    'planned_start_at' => $s, 'planned_end_at' => $e, 'source_type' => 'breakdown', 'work_order_no' => 'EN-X-001']);
check('invalid range -> []', pln_detect_conflicts($pdo, $e, $s) === []);
$c = pln_detect_conflicts($pdo, '2026-01-05 11:00:00', '2026-01-05 13:00:00', [$tech1]);
check('technician overlap detected', count($c) === 1 && $c[0]['type'] === 'technician', json_encode($c));
check('overlap window clamped to [11:00,12:00]', $c[0]['overlap_from'] === '2026-01-05 11:00:00' && $c[0]['overlap_to'] === '2026-01-05 12:00:00');
check('no overlap when disjoint', pln_detect_conflicts($pdo, '2026-01-05 13:00:00', '2026-01-05 14:00:00', [$tech1]) === []);
check('excludeRepairId skips self', pln_detect_conflicts($pdo, '2026-01-05 11:00:00', '2026-01-05 13:00:00', [$tech1], $woA) === []);
$c = pln_detect_conflicts($pdo, '2026-01-05 11:00:00', '2026-01-05 12:30:00', null, 0, $assetId);
check('asset overlap detected', count($c) === 1 && $c[0]['type'] === 'asset', json_encode($c));

$insRepair(['asset_id' => $assetId, 'title' => 'PM', 'status' => 'open',
    'planned_start_at' => $s, 'planned_end_at' => $e, 'source_type' => 'pm', 'work_order_no' => 'PM-001']);
$c = pln_detect_conflicts($pdo, '2026-01-05 10:30:00', '2026-01-05 11:30:00', null, 0, $assetId);
$types = array_column($c, 'type');
check('pm overlap flagged as type pm', in_array('pm', $types, true), json_encode($types));
check('asset query ignores pm-source WOs', !in_array('asset', array_map(fn($x) => $x['type'], array_filter($c, fn($x) => $x['wo']['work_order_no'] === 'PM-001')), true));

/* ================================================================== 7. pln_readiness */
echo "\n[7] pln_readiness()\n";
$r = ['id' => 999999, 'planned_start_at' => $H(1), 'planned_end_at' => $H(3), 'assigned_to' => $tech1, 'required_skill' => ''];
$rd = pln_readiness($pdo, $r);
check('fully-ready row -> READY', $rd['state'] === 'READY', $rd['state']);
check('4 checks reported', count($rd['checks']) === 4);
$r2 = ['id' => 999999, 'planned_start_at' => $H(1), 'assigned_to' => $tech1, 'required_skill' => ''];
$rd2 = pln_readiness($pdo, $r2);
check('missing planned end -> PARTIAL', $rd2['state'] === 'PARTIAL', $rd2['state']);
$r3 = ['id' => 999999, 'assigned_to' => 0, 'required_skill' => ''];
$rd3 = pln_readiness($pdo, $r3);
check('missing schedule + assignee -> BLOCKED', $rd3['state'] === 'BLOCKED', $rd3['state']);

$woWithParts = $insRepair(['asset_id' => $assetId, 'title' => 'parts', 'status' => 'open']);
$pdo->prepare("INSERT INTO spare_issue_requests (work_order_id, requested_by, request_type, status)
               VALUES (?,?,?,?)")->execute([$woWithParts, $tech1, 'withdrawal', 'pending']);
$rd4 = pln_readiness($pdo, ['id' => $woWithParts, 'planned_start_at' => $H(1), 'planned_end_at' => $H(2), 'assigned_to' => $tech1, 'required_skill' => '']);
$partsCheck = null;
foreach ($rd4['checks'] as $chk) if ($chk['key'] === 'parts') $partsCheck = $chk;
check('pending spare request blocks parts check', $partsCheck !== null && $partsCheck['ok'] === false, json_encode($partsCheck));
check('blocked parts -> PARTIAL', $rd4['state'] === 'PARTIAL', $rd4['state']);

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) {
    echo "Failures:\n";
    foreach ($failures as $f) echo "  - $f\n";
}
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
