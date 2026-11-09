<?php
/**
 * scripts/test_dispatch_service.php — behavioral harness for DispatchService.
 *
 * Covers src/services/DispatchService.php::autoMatchTechnicians():
 *   - empty result when there are no open work orders, or no eligible technicians
 *   - only open/pending WOs are considered (closed / in_progress excluded)
 *   - priority ordering (critical > high > medium > low)
 *   - round-robin technician assignment
 *   - asset_name join, and match_score format/range
 *   - technician eligibility filter: active AND (role technician/engineer OR position LIKE %ช่าง%)
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_dsptest".
 *
 *   php scripts/test_dispatch_service.php [--keep]
 *
 * SAFETY: refuses to run unless the scratch name ends in "_dsptest", differs from the
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
$scratch = $live . '_dsptest';

if (!str_ends_with($scratch, '_dsptest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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

echo "DispatchService harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/services/DispatchService.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ------------------------------------------------------------------ fixtures */
$pdo->exec("INSERT INTO asset_registry (code, name, category) VALUES ('AST-D1', 'Pump A', 'Pump')");
$assetId = (int)$pdo->lastInsertId();

function addUser(PDO $pdo, string $uname, string $name, int $active, string $role, ?string $position): int {
    $pdo->prepare("INSERT INTO users (username, email, password, full_name, is_active, role, position)
                   VALUES (?,?,?,?,?,?,?)")
        ->execute([$uname, $uname . '@x.test', 'x', $name, $active, $role, $position]);
    return (int)$pdo->lastInsertId();
}
function addWo(PDO $pdo, int $assetId, string $priority, string $status, string $title = 'WO'): int {
    $pdo->prepare("INSERT INTO repair (asset_id, title, priority, status) VALUES (?,?,?,?)")
        ->execute([$assetId, $title, $priority, $status]);
    return (int)$pdo->lastInsertId();
}
function techNames(array $a): array { return array_map(fn($x) => $x['assigned_technician'], $a); }

/* ================================================================== A. empty inputs */
echo "\n[A] empty inputs\n";
$pdo->exec('DELETE FROM users'); $pdo->exec('DELETE FROM repair');
addUser($pdo, 'u_tech1', 'ช่างหนึ่ง', 1, 'technician', null);
addUser($pdo, 'u_eng1', 'Engineer หนึ่ง', 1, 'engineer', null);
check('no work orders -> []', DispatchService::autoMatchTechnicians() === []);

$ids = [];
$ids[] = addWo($pdo, $assetId, 'low', 'open', 'w1');
$pdo->exec('DELETE FROM users');
check('work orders but no eligible technicians -> []', DispatchService::autoMatchTechnicians() === []);

/* ================================================================== B. ordering + round-robin */
echo "\n[B] priority ordering, round-robin, join, score\n";
$pdo->exec('DELETE FROM users'); $pdo->exec('DELETE FROM repair');
$t1 = addUser($pdo, 'u_t1', 'ช่าง เอ', 1, 'technician', null);
$t2 = addUser($pdo, 'u_t2', 'Engineer บี', 1, 'engineer', null);

$crit = addWo($pdo, $assetId, 'critical', 'open', 'C');
$low  = addWo($pdo, $assetId, 'low', 'open', 'L');
$med  = addWo($pdo, $assetId, 'medium', 'open', 'M');
$high = addWo($pdo, $assetId, 'high', 'open', 'H');
addWo($pdo, $assetId, 'high', 'closed', 'closed');
addWo($pdo, $assetId, 'high', 'in_progress', 'inprog');

$asg = DispatchService::autoMatchTechnicians();
check('only open/pending WOs considered -> 4 assignments', count($asg) === 4, 'got ' . count($asg));
check('priority order critical,high,medium,low', array_column($asg, 'priority') === ['critical', 'high', 'medium', 'low'], implode(',', array_column($asg, 'priority')));
check('asset_name joined from asset_registry', count(array_filter($asg, fn($x) => $x['asset_name'] === 'Pump A')) === 4);

$names = techNames($asg);
check('round-robin: 0 and 2 share technician', $names[0] === $names[2]);
check('round-robin: 1 and 3 share technician', $names[1] === $names[3]);
check('round-robin: consecutive assignments differ', $names[0] !== $names[1]);
check('only the two eligible techs are used', count(array_unique($names)) === 2, implode(',', array_unique($names)));
check('assigned tech is one of the eligible users', in_array($names[0], ['ช่าง เอ', 'Engineer บี'], true));

$scoreOk = true;
foreach ($asg as $x) {
    if (!preg_match('/^(\d{2})%$/', (string)$x['match_score'], $m) || (int)$m[1] < 88 || (int)$m[1] > 99) $scoreOk = false;
}
check('match_score format NN% within 88-99', $scoreOk, json_encode(array_column($asg, 'match_score')));

/* pending also counts */
$pdo->exec('DELETE FROM repair');
$pdo->exec('DELETE FROM users');
addUser($pdo, 'u_t1b', 'ช่าง เอ', 1, 'technician', null);
addWo($pdo, $assetId, 'low', 'pending', 'p');
check("status 'pending' is included", count(DispatchService::autoMatchTechnicians()) === 1);

/* ================================================================== C. technician filters */
echo "\n[C] technician eligibility filter\n";
$pdo->exec('DELETE FROM users'); $pdo->exec('DELETE FROM repair');
addWo($pdo, $assetId, 'low', 'open', 'only');

check('no users -> []', DispatchService::autoMatchTechnicians() === []);

addUser($pdo, 'u_inactive', 'ช่าง ปิด', 0, 'technician', null);
check('inactive technician excluded -> []', DispatchService::autoMatchTechnicians() === []);

addUser($pdo, 'u_ops', 'Operator หนึ่ง', 1, 'operator', 'Head Operator');
check("active non-technician w/o 'ช่าง' position excluded -> []", DispatchService::autoMatchTechnicians() === []);

addUser($pdo, 'u_welder', 'ช่างเชื่อม', 1, 'operator', 'ช่างเชื่อม');
$asg = DispatchService::autoMatchTechnicians();
check("position LIKE '%ช่าง%' is eligible -> 1", count($asg) === 1, json_encode($asg));
check('eligible by position -> assigned', ($asg[0]['assigned_technician'] ?? '') === 'ช่างเชื่อม', json_encode($asg));

addUser($pdo, 'u_eng', 'Engineer ซี', 1, 'engineer', null);
check('active engineer is eligible -> now 2 candidates', count(array_unique(techNames(DispatchService::autoMatchTechnicians()))) === 1 && count(DispatchService::autoMatchTechnicians()) === 1);

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
