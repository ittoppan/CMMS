<?php
/**
 * scripts/test_safety.php — behavioral harness for the Work Permit / safety engine.
 *
 * Covers src/helpers/safety.php:
 *   - wp_statuses / wp_roles_* / wp_valid_transitions / wp_timestamp_col (pure)
 *   - wp_risk_level()             default matrix (parent) + custom matrix (child)
 *   - wp_next_permit_no()         per-day sequential permit no (>999 rollover)
 *   - wp_activity()               action whitelist coercion
 *
 * Runs against a THROWAWAY database = live DB name + "_saftest".
 *   php scripts/test_safety.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);
$CHILD = in_array('--child', $argv ?? [], true);

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

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

/* ───────────────────────── child: custom risk matrix ───────────────────────── */
if ($CHILD) {
    $_ENV['DB_HOST'] = getenv('DB_HOST') ?: '127.0.0.1';
    $_ENV['DB_PORT'] = getenv('DB_PORT') ?: '3306';
    $_ENV['DB_USER'] = getenv('DB_USER') ?: 'root';
    $_ENV['DB_PASS'] = getenv('DB_PASS') ?: '';
    $_ENV['DB_NAME'] = getenv('DB_NAME') ?: '';
    require_once __DIR__ . '/../src/config/db.php';
    require_once __DIR__ . '/../src/helpers/audit.php';
    require_once __DIR__ . '/../src/helpers/safety.php';

    $pdo = getDb();
    $db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($db !== (string)$_ENV['DB_NAME']) { fwrite(STDERR, "CHILD GUARD: connected to '$db'\n"); exit(2); }

    echo "[child] custom risk matrix thresholds\n";
    $pdo->prepare("DELETE FROM settings WHERE setting_key = 'risk_matrix_thresholds'")->execute();
    $pdo->prepare("INSERT INTO settings (setting_key, setting_group, setting_value) VALUES ('risk_matrix_thresholds','safety',?)")
        ->execute(['[{"level":"low","max":4},{"level":"medium","max":9},{"level":"extreme","max":100}]']);

    $r = wp_risk_level($pdo, 1, 1);
    check('custom: 1x1 -> low', $r['level'] === 'low' && $r['score'] === 1, json_encode($r));
    $r = wp_risk_level($pdo, 2, 3);
    check('custom: 2x3 -> medium', $r['level'] === 'medium' && $r['score'] === 6, json_encode($r));
    $r = wp_risk_level($pdo, 5, 5);
    check('custom: 5x5 -> extreme (custom label)', $r['level'] === 'extreme' && $r['score'] === 25, json_encode($r));

    echo "CHILDSUM PASS $pass_count FAIL $fail_count\n";
    exit($fail_count > 0 ? 1 : 0);
}

/* ───────────────────────── parent: build scratch DB ───────────────────────── */
$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_saftest';

if (!str_ends_with($scratch, '_saftest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Safety/WP harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/audit.php';
require_once __DIR__ . '/../src/helpers/safety.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ================================================================= 1. statuses */
echo "\n[1] wp_statuses()\n";
$st = wp_statuses();
check('12 statuses', count($st) === 12, (string)count($st));
foreach (['draft', 'requested', 'risk_review', 'approved', 'active', 'suspended', 'expired', 'requires_review', 'completed', 'closed', 'cancelled', 'rejected'] as $k) {
    check("has status '$k'", isset($st[$k]));
}
check('all labels non-empty', !in_array('', $st, true));

/* ================================================================= 2. roles */
echo "\n[2] wp_roles_*()\n";
check('edit roles', wp_roles_edit() === [1, 2, 6, 7]);
check('manage roles', wp_roles_manage() === [1, 2, 6]);
check('approve roles', wp_roles_approve() === [1, 2, 6, 7]);
check('safety roles', wp_roles_safety() === [1, 2, 6]);

/* ================================================================= 3. transitions */
echo "\n[3] wp_valid_transitions()\n";
$tr = wp_valid_transitions();
$statusKeys = array_keys(wp_statuses());
check('transition keys == status keys', array_keys($tr) === $statusKeys, json_encode(array_diff(array_keys($tr), $statusKeys)));
$allTargetsOk = true;
foreach ($tr as $from => $tos) { foreach ($tos as $to) { if (!in_array($to, $statusKeys, true)) $allTargetsOk = false; } }
check('all targets are known statuses', $allTargetsOk);
check('terminal closed', $tr['closed'] === []);
check('terminal cancelled', $tr['cancelled'] === []);
check('terminal rejected', $tr['rejected'] === []);
check('draft -> requested/cancelled', $tr['draft'] === ['requested', 'cancelled']);
check('active -> can suspend/complete/expire', in_array('suspended', $tr['active'], true) && in_array('completed', $tr['active'], true) && in_array('expired', $tr['active'], true));
check('suspended -> can resume to active', in_array('active', $tr['suspended'], true));
check('completed -> closed', in_array('closed', $tr['completed'], true));

/* ================================================================= 4. timestamp col */
echo "\n[4] wp_timestamp_col()\n";
check('requested -> requested_at', wp_timestamp_col('requested') === 'requested_at');
check('approved -> approved_at', wp_timestamp_col('approved') === 'approved_at');
check('active -> activated_at', wp_timestamp_col('active') === 'activated_at');
check('expired -> null', wp_timestamp_col('expired') === null);
check('unknown -> null', wp_timestamp_col('bogus') === null);

/* ================================================================= 5. risk level (defaults) */
echo "\n[5] wp_risk_level() default matrix\n";
$cases = [[1, 1, 'low', 1], [2, 2, 'low', 4], [2, 3, 'medium', 6], [3, 3, 'medium', 9], [3, 4, 'high', 12], [4, 4, 'critical', 16], [5, 5, 'critical', 25]];
foreach ($cases as [$l, $s, $lvl, $score]) {
    $r = wp_risk_level($pdo, $l, $s);
    check("{$l}x{$s} -> $lvl", $r['level'] === $lvl && $r['score'] === $score, json_encode($r));
}

/* ================================================================= 6. permit number */
echo "\n[6] wp_next_permit_no()\n";
$clear = fn() => $pdo->exec('DELETE FROM work_permits');
$ins = fn(string $no) => $pdo->prepare('INSERT INTO work_permits (permit_no) VALUES (?)')->execute([$no]);
$next = fn() => wp_next_permit_no($pdo);
$base = 'PTW-' . date('Ymd') . '-';

$clear();
check('empty -> 001', $next() === $base . '001');
$clear(); $ins($base . '001');
check('001 -> 002', $next() === $base . '002');
$clear(); $ins($base . '099');
check('099 -> 100', $next() === $base . '100');
$clear(); $ins($base . '999');
check('999 -> 1000', $next() === $base . '1000');
$clear(); $ins($base . '999'); $ins($base . '1000');
check('999,1000 -> 1001 (no duplicate)', $next() === $base . '1001');
$clear(); $ins($base . '1000');
check('1000 alone -> 1001', $next() === $base . '1001');
$clear();

/* ================================================================= 7. activity */
echo "\n[7] wp_activity()\n";
$pdo->prepare('INSERT INTO work_permits (permit_no) VALUES (?)')->execute([$base . '900']);
$pid = (int)$pdo->lastInsertId();
wp_activity($pdo, $pid, 5, 'created', 'desc');
wp_activity($pdo, $pid, 5, 'bogus_action', 'desc');
$acts = $pdo->query("SELECT action FROM work_permit_activity WHERE permit_id = $pid ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
check('valid action stored as-is', ($acts[0] ?? '') === 'created');
check('invalid action coerced to note', ($acts[1] ?? '') === 'note', json_encode($acts));

/* ================================================================= 8. child: custom matrix */
echo "\n[8] wp_risk_level() custom matrix (child process)\n";
$cmd = '"' . PHP_BINARY . '" ' . escapeshellarg(__FILE__) . ' --child 2>&1';
$childLines = [];
$rc = 0;
exec($cmd, $childLines, $rc);
$childSum = '';
foreach ($childLines as $ln) {
    if (preg_match('/^\s*(PASS|FAIL)\s+(.*)$/', $ln, $m)) { check('child: ' . trim($m[2]), $m[1] === 'PASS'); }
    if (str_starts_with($ln, 'CHILDSUM')) $childSum = $ln;
}
check('custom-matrix child exited 0', $rc === 0, "rc=$rc");
check('child summary present', str_contains($childSum, 'FAIL 0'), $childSum);

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
