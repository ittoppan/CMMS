<?php
/**
 * scripts/test_misc_helpers.php — behavioral harness for the remaining DB helpers:
 *   src/helpers/assignees.php   (work team assignment)
 *   src/helpers/idempotency.php (client-action idempotency, Phase 19)
 *
 * Covers: getWorkAssignees, setWorkAssignees (replace/lead-append/dedupe/diff),
 * isWorkAssignee, attachWorkTeams, acceptWorkAssignment, teamLeadName,
 * clientActionKeyFromRequest, clientActionBegin (new/duplicate/replay/replay_failed),
 * clientActionFinish, clientActionUncertain (child process).
 *
 * Runs against a THROWAWAY database named <live>_misctest.
 *   php scripts/test_misc_helpers.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
ob_start();

$KEEP = in_array('--keep', $argv ?? [], true);

if (in_array('--uncertain-child', $argv ?? [], true)) {
    require_once __DIR__ . '/../src/helpers/idempotency.php';
    clientActionUncertain();
    echo 'REACHED_END';
    exit(0);
}

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
$scratch = $live . '_misctest';

if (!str_ends_with($scratch, '_misctest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Misc-helpers harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/assignees.php';
require_once __DIR__ . '/../src/helpers/idempotency.php';

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

$U1 = ins($pdo, 'users', ['username' => 'a1', 'email' => 'a1@x.io', 'password' => 'x', 'full_name' => 'Alpha One', 'role_id' => 3]);
$U2 = ins($pdo, 'users', ['username' => 'b2', 'email' => 'b2@x.io', 'password' => 'x', 'full_name' => 'Bravo Two', 'role_id' => 3]);
$U3 = ins($pdo, 'users', ['username' => 'c3', 'email' => 'c3@x.io', 'password' => 'x', 'full_name' => 'Charlie Three', 'role_id' => 3]);
$U4 = ins($pdo, 'users', ['username' => 'd4', 'email' => 'd4@x.io', 'password' => 'x', 'full_name' => 'Delta Four', 'role_id' => 4]);

/* ================================================================= 1. setWorkAssignees */
echo "\n[1] setWorkAssignees()\n";
$res = setWorkAssignees($pdo, 'repair', 1, [$U1, $U2], $U2, $U4);
check('team returned', $res['team'] === [$U1, $U2], json_encode($res));
check('lead returned', $res['lead'] === $U2, json_encode($res));
check('added both', $res['added'] === [$U1, $U2], json_encode($res));
check('removed none', $res['removed'] === [], json_encode($res));
$rows = getWorkAssignees($pdo, 'repair', 1);
check('two rows stored', count($rows) === 2, (string)count($rows));
check('lead ordered first', $rows[0]['role'] === 'lead' && (int)$rows[0]['user_id'] === $U2, json_encode($rows));
check('team member second', $rows[1]['role'] === 'team' && (int)$rows[1]['user_id'] === $U1, json_encode($rows));
check('full_name joined', $rows[0]['full_name'] === 'Bravo Two');
check('assigned_by stored', (int)$rows[0]['assigned_by'] === $U4, (string)$rows[0]['assigned_by']);
check('default status pending', $rows[0]['status'] === 'pending');

/* replace: [U3] only → U1,U2 removed */
$res2 = setWorkAssignees($pdo, 'repair', 1, [$U3]);
check('added U3', $res2['added'] === [$U3], json_encode($res2));
check('removed U1,U2', $res2['removed'] === [$U1, $U2], json_encode($res2));
check('lead null when not given', $res2['lead'] === null, json_encode($res2));
check('stored single team row', count(getWorkAssignees($pdo, 'repair', 1)) === 1);

/* lead not in list gets appended */
$res3 = setWorkAssignees($pdo, 'repair', 2, [$U1], $U4, $U1);
check('lead appended to team', $res3['team'] === [$U1, $U4], json_encode($res3));
check('appended lead role', getWorkAssignees($pdo, 'repair', 2)[0]['role'] === 'lead');

/* dedupe + filter non-positive */
$res4 = setWorkAssignees($pdo, 'pm_am', 5, [$U1, $U1, 0, -5, $U2]);
check('dedupe/filter → [U1,U2]', $res4['team'] === [$U1, $U2], json_encode($res4));

/* ================================================================= 2. isWorkAssignee / acceptWorkAssignment */
echo "\n[2] isWorkAssignee() / acceptWorkAssignment()\n";
check('U1 assigned', isWorkAssignee($pdo, 'repair', 2, $U1) === true);
check('U3 not assigned', isWorkAssignee($pdo, 'repair', 2, $U3) === false);
check('wrong ref not assigned', isWorkAssignee($pdo, 'repair', 999, $U1) === false);
check('accept first time true', acceptWorkAssignment($pdo, 'repair', 2, $U1) === true);
$st = $pdo->query("SELECT status, accepted_at FROM work_assignees WHERE ref_type='repair' AND ref_id=2 AND user_id=$U1")->fetch(PDO::FETCH_ASSOC);
check('status accepted', $st['status'] === 'accepted');
check('accepted_at set', !empty($st['accepted_at']));
check('accept twice → false', acceptWorkAssignment($pdo, 'repair', 2, $U1) === false);

/* ================================================================= 3. attachWorkTeams */
echo "\n[3] attachWorkTeams()\n";
$list = [
    ['id' => 2, 'assigned_to' => null, 'title' => 'A'],
    ['id' => 1, 'assigned_to' => 99, 'title' => 'B'],
    ['id' => 77, 'assigned_to' => null, 'title' => 'C'],
];
attachWorkTeams($list, 'repair');
check('ref2 filled lead from team', (int)$list[0]['assigned_to'] === $U4, json_encode($list[0]));
check('ref2 has team', count($list[0]['team']) === 2, json_encode($list[0]));
check('ref2 team_ids', $list[0]['team_ids'] === [$U4, $U1], json_encode($list[0]['team_ids']));
check('ref1 keeps assigned_to', (int)$list[1]['assigned_to'] === 99, json_encode($list[1]));
check('ref1 has team', count($list[1]['team']) === 1, json_encode($list[1]));
check('ref77 no team', $list[2]['team'] === [] && $list[2]['team_ids'] === [], json_encode($list[2]));
check('ref77 assigned_to stays null', $list[2]['assigned_to'] === null, json_encode($list[2]));
$empty = []; attachWorkTeams($empty, 'repair'); check('empty list no-op', $empty === []);

/* ================================================================= 4. teamLeadName */
echo "\n[4] teamLeadName()\n";
check('picks lead', teamLeadName([['role' => 'team', 'full_name' => 'X'], ['role' => 'lead', 'full_name' => 'Y']]) === 'Y');
check('falls back to first', teamLeadName([['role' => 'team', 'full_name' => 'X']]) === 'X');
check('empty → empty string', teamLeadName([]) === '');
check('lead without name → empty', teamLeadName([['role' => 'lead']]) === '');

/* ================================================================= 5. clientActionKeyFromRequest */
echo "\n[5] clientActionKeyFromRequest()\n";
check('from body', clientActionKeyFromRequest(['client_action_id' => '  body-key  ']) === 'body-key');
check('empty body → empty', clientActionKeyFromRequest([]) === '');
$_SERVER['HTTP_X_CLIENT_ACTION_ID'] = 'hdr-key';
check('from server header', clientActionKeyFromRequest([]) === 'hdr-key');
$_SERVER['HTTP_X_CLIENT_ACTION_ID'] = 'keep';
check('body wins over header', clientActionKeyFromRequest(['client_action_id' => 'from-body']) === 'from-body');
unset($_SERVER['HTTP_X_CLIENT_ACTION_ID']);
check('truncated to 64', strlen(clientActionKeyFromRequest(['client_action_id' => str_repeat('z', 100)])) === 64);

/* ================================================================= 6. clientActionBegin / Finish */
echo "\n[6] clientActionBegin()/clientActionFinish()\n";
$k = 'act-' . bin2hex(random_bytes(4));
check('first begin new', clientActionBegin($pdo, $k, 'POST', '/api/v1/repair.php')['status'] === 'new');
check('second begin duplicate_processing', clientActionBegin($pdo, $k, 'POST', '/api/v1/repair.php')['status'] === 'duplicate_processing');
clientActionFinish($pdo, $k, 'success', 'repair', 123, 201);
$rep = clientActionBegin($pdo, $k, 'POST', '/api/v1/repair.php');
check('after success → replay', $rep['status'] === 'replay', json_encode($rep));
check('replay ref_type', $rep['ref_type'] === 'repair');
check('replay ref_id', (int)$rep['ref_id'] === 123);
check('replay https_status', (int)$rep['https_status'] === 201, json_encode($rep));

$k2 = 'act-' . bin2hex(random_bytes(4));
clientActionBegin($pdo, $k2, 'PUT', '/x');
clientActionFinish($pdo, $k2, 'failed', null, null, 500);
$rf = clientActionBegin($pdo, $k2, 'PUT', '/x');
check('failed → replay_failed', $rf['status'] === 'replay_failed', json_encode($rf));
check('replay_failed outcome', $rf['outcome'] === 'failed');

$k3 = 'act-' . bin2hex(random_bytes(4));
clientActionBegin($pdo, $k3, 'PUT', '/y');
clientActionFinish($pdo, $k3, 'conflict', null, null, 409);
check('conflict → replay_failed', clientActionBegin($pdo, $k3, 'PUT', '/y')['status'] === 'replay_failed');

check('empty key begin → new', clientActionBegin($pdo, '', 'POST', '/x')['status'] === 'new');
clientActionFinish($pdo, '', 'success'); // no-op, must not throw
check('empty key finish no-op', true);

/* invalid outcome coerces to failed, default status 500 */
$k4 = 'act-' . bin2hex(random_bytes(4));
clientActionBegin($pdo, $k4, 'POST', '/z');
clientActionFinish($pdo, $k4, 'weird');
$row = $pdo->query("SELECT outcome, https_status, finished_at FROM client_action_log WHERE client_action_id='$k4'")->fetch(PDO::FETCH_ASSOC);
check('invalid outcome → failed', $row['outcome'] === 'failed', json_encode($row));
check('default status 500 for non-success', (int)$row['https_status'] === 500, json_encode($row));
check('finished_at set', !empty($row['finished_at']));

/* default success status 200 */
$k5 = 'act-' . bin2hex(random_bytes(4));
clientActionBegin($pdo, $k5, 'POST', '/w');
clientActionFinish($pdo, $k5, 'success');
check('default success status 200', (int)$pdo->query("SELECT https_status FROM client_action_log WHERE client_action_id='$k5'")->fetchColumn() === 200);

/* finish only touches a 'processing' row */
$k6 = 'act-' . bin2hex(random_bytes(4));
clientActionBegin($pdo, $k6, 'POST', '/v');
clientActionFinish($pdo, $k6, 'success', 'repair', 1, 200);
clientActionFinish($pdo, $k6, 'failed', 'repair', 2, 500); // should be ignored (no longer processing)
$row6 = $pdo->query("SELECT outcome, ref_id FROM client_action_log WHERE client_action_id='$k6'")->fetch(PDO::FETCH_ASSOC);
check('second finish ignored', $row6['outcome'] === 'success' && (int)$row6['ref_id'] === 1, json_encode($row6));

/* ================================================================= 7. clientActionUncertain (child) */
echo "\n[7] clientActionUncertain() — child process\n";
$outFile = tempnam(sys_get_temp_dir(), 'unc');
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' --uncertain-child > ' . escapeshellarg($outFile) . ' 2>&1';
exec($cmd, $o, $rc);
$out = (string)file_get_contents($outFile);
@unlink($outFile);
check('emits CLIENT_ACTION_UNCERTAIN', str_contains($out, 'CLIENT_ACTION_UNCERTAIN'), $out);
check('did not reach end (exited)', !str_contains($out, 'REACHED_END'), $out);

/* ------------------------------------------------------------------ done */
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }

if (!$KEEP) {
    try {
        $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
        echo "Dropped scratch DB $scratch\n";
    } catch (Throwable $e) { fwrite(STDERR, 'drop failed: ' . $e->getMessage() . "\n"); }
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}

ob_end_flush();
exit($fail_count > 0 ? 1 : 0);
