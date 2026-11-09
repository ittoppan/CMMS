<?php
/**
 * scripts/test_auth.php — behavioral harness for src/auth.php
 * (session hardening, currentUser, requireLogin, session lifecycle).
 *
 * Covers: cmms_secure_session, cmms_session_timeout_mins, currentUser,
 * requireLogin (CSRF on mutating verbs, 401 unauth, 403 admin gate),
 * cmms_enforce_session_lifecycle (idle timeout + periodic regenerate).
 *
 * api_fail()/enforceCsrf() exit(), so failure paths run in a child process.
 * Runs against a THROWAWAY database named <live>_authtest.
 *   php scripts/test_auth.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
ob_start();

$KEEP = in_array('--keep', $argv ?? [], true);

/* ---- child mode: run an exit()ing auth scenario, env provided by parent ---- */
$childScenario = null;
foreach ($argv ?? [] as $a) {
    if (str_starts_with($a, '--auth-child=')) { $childScenario = substr($a, strlen('--auth-child=')); }
}
if ($childScenario !== null) {
    foreach (['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME'] as $k) {
        $v = getenv($k);
        if ($v !== false) { $_ENV[$k] = $v; putenv("$k=$v"); }
    }
    require_once __DIR__ . '/../src/config/db.php';
    require_once __DIR__ . '/../src/auth.php';
    $pdo = getDb();
    @session_start();
    $_SERVER['REQUEST_METHOD'] = 'GET';
    unset($_SERVER['HTTP_ORIGIN'], $_SERVER['HTTP_REFERER'], $_SERVER['HTTP_X_CSRF_TOKEN'], $_SERVER['CONTENT_TYPE']);
    $adminUid   = (int)getenv('T_ADMIN_UID');
    $techUid    = (int)getenv('T_TECH_UID');
    $inactiveId = (int)getenv('T_INACTIVE_UID');
    switch ($childScenario) {
        case 'csrf':     $_SERVER['REQUEST_METHOD'] = 'POST'; $_SESSION = ['user_id' => $adminUid]; requireLogin($pdo); break;
        case 'nologin':  $_SESSION = []; requireLogin($pdo); break;
        case 'nouser':   $_SESSION = ['user_id' => 999999]; requireLogin($pdo); break;
        case 'inactive': $_SESSION = ['user_id' => $inactiveId]; requireLogin($pdo); break;
        case 'admin':    $_SESSION = ['user_id' => $techUid]; requireLogin($pdo, true); break;
        case 'expired':  $_SESSION = ['user_id' => $adminUid, 'last_activity' => time() - 3600]; requireLogin($pdo); break;
        case 'ok':       $_SESSION = ['user_id' => $adminUid]; $u = requireLogin($pdo); echo 'USER:' . ($u['id'] ?? '?'); break;
        case 'timeout':  echo 'TIMEOUT:' . cmms_session_timeout_mins($pdo); break;
        default:         echo 'UNKNOWN_SCENARIO'; exit(3);
    }
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
$scratch = $live . '_authtest';

if (!str_ends_with($scratch, '_authtest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Auth harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/auth.php';

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

$ADMIN = ins($pdo, 'users', ['username' => 'admin', 'email' => 'a@x.io', 'password' => 'x', 'full_name' => 'Admin', 'role_id' => 1, 'is_active' => 1]);
$TECH  = ins($pdo, 'users', ['username' => 'tech',  'email' => 't@x.io', 'password' => 'x', 'full_name' => 'Tech',  'role_id' => 3, 'is_active' => 1]);
$INACT = ins($pdo, 'users', ['username' => 'off',   'email' => 'o@x.io', 'password' => 'x', 'full_name' => 'Off',   'role_id' => 3, 'is_active' => 0]);
putenv("T_ADMIN_UID=$ADMIN"); putenv("T_TECH_UID=$TECH"); putenv("T_INACTIVE_UID=$INACT");
$_ENV['T_ADMIN_UID'] = (string)$ADMIN; $_ENV['T_TECH_UID'] = (string)$TECH; $_ENV['T_INACTIVE_UID'] = (string)$INACT;

/* ================================================================= 1. secure session + timeout default */
echo "\n[1] cmms_secure_session() / cmms_session_timeout_mins()\n";
cmms_secure_session();
check('session active after secure_session', session_status() === PHP_SESSION_ACTIVE);
check('use_strict_mode enabled', (int)ini_get('session.use_strict_mode') === 1, (string)ini_get('session.use_strict_mode'));
check('timeout default 60 when setting absent', cmms_session_timeout_mins($pdo) === 60, (string)cmms_session_timeout_mins($pdo));

/* ================================================================= 2. currentUser */
echo "\n[2] currentUser()\n";
$_SESSION = [];
check('no session user → null', currentUser($pdo) === null);
$_SESSION = ['user_id' => $ADMIN];
$cu = currentUser($pdo);
check('active user returned', is_array($cu) && (int)$cu['id'] === $ADMIN, json_encode($cu));
check('full_name present', ($cu['full_name'] ?? '') === 'Admin');
check('role_id present', (int)$cu['role_id'] === 1);
$_SESSION = ['user_id' => $INACT];
check('inactive user → null', currentUser($pdo) === null);
$_SESSION = ['user_id' => 999999];
check('missing user → null', currentUser($pdo) === null);
$_SESSION = [];

/* ================================================================= 3. lifecycle (in-process) */
echo "\n[3] cmms_enforce_session_lifecycle()\n";
$_SESSION = ['last_activity' => time(), 'last_regenerated' => 0];
cmms_enforce_session_lifecycle($pdo);
check('last_regenerated initialised', (int)($_SESSION['last_regenerated'] ?? 0) > 0);
$before = session_id();
$_SESSION['last_regenerated'] = time() - 1000;
cmms_enforce_session_lifecycle($pdo);
check('session id regenerated after window', session_id() !== $before, $before . ' -> ' . session_id());
check('last_regenerated refreshed', (int)$_SESSION['last_regenerated'] > time() - 5);

/* ================================================================= 4. requireLogin success (GET) */
echo "\n[4] requireLogin() success paths\n";
unset($_SERVER['HTTP_ORIGIN'], $_SERVER['HTTP_REFERER'], $_SERVER['HTTP_X_CSRF_TOKEN']);
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SESSION = ['user_id' => $ADMIN];
$u = requireLogin($pdo);
check('GET returns active user (no CSRF)', is_array($u) && (int)$u['id'] === $ADMIN, json_encode($u));
check('lifecycle set last_activity', (int)($_SESSION['last_activity'] ?? 0) > 0);
$u2 = requireLogin($pdo, true);
check('adminOnly true + admin → ok', (int)$u2['id'] === $ADMIN);
$_SESSION = ['user_id' => $TECH];
check('non-admin non-required → ok', (int)requireLogin($pdo)['id'] === $TECH);

/* ================================================================= 5. failure paths (child) */
echo "\n[5] failure paths — child process\n";
$run = function (string $scenario) use ($host, $port, $user, $pass) {
    $outFile = tempnam(sys_get_temp_dir(), 'auth');
    $cmd = escapeshellarg(PHP_BINARY) . ' -d display_errors=1 ' . escapeshellarg(__FILE__) . ' --auth-child=' . $scenario
        . ' > ' . escapeshellarg($outFile) . ' 2>&1';
    exec($cmd, $o, $rc);
    $out = (string)file_get_contents($outFile);
    @unlink($outFile);
    return $out;
};
$csrfOut = $run('csrf');
check('POST without CSRF → 403 CSRF error', str_contains($csrfOut, 'CSRF validation failed'), $csrfOut);
check('CSRF path exits before end', !str_contains($csrfOut, 'REACHED_END'), $csrfOut);

$noLogin = $run('nologin');
check('no session → UNAUTHENTICATED', str_contains($noLogin, 'UNAUTHENTICATED'), $noLogin);
check('no session exits', !str_contains($noLogin, 'REACHED_END'), $noLogin);

$noUser = $run('nouser');
check('missing user → UNAUTHENTICATED', str_contains($noUser, 'UNAUTHENTICATED'), $noUser);

$inactive = $run('inactive');
check('inactive user → UNAUTHENTICATED', str_contains($inactive, 'UNAUTHENTICATED'), $inactive);

$adminOnly = $run('admin');
check('non-admin + adminOnly → FORBIDDEN', str_contains($adminOnly, 'FORBIDDEN'), $adminOnly);
check('adminOnly path exits', !str_contains($adminOnly, 'REACHED_END'), $adminOnly);

/* cmms_session_timeout_mins() value handling (fresh process per value) */
$setTimeout = function ($v) use ($pdo) {
    $pdo->prepare("DELETE FROM settings WHERE setting_key = 'session_timeout_mins'")->execute();
    if ($v !== null) {
        $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group) VALUES ('session_timeout_mins', ?, 'security')")->execute([$v]);
    }
};
$setTimeout(null);
check('timeout absent → 60 (fail-closed)', str_contains($run('timeout'), 'TIMEOUT:60'), $run('timeout'));
$setTimeout('0');
check('timeout explicit 0 → disabled', str_contains($run('timeout'), 'TIMEOUT:0'), $run('timeout'));
$setTimeout('30');
check('timeout explicit 30 → 30', str_contains($run('timeout'), 'TIMEOUT:30'), $run('timeout'));
$setTimeout('-5');
check('timeout negative → 60', str_contains($run('timeout'), 'TIMEOUT:60'), $run('timeout'));
$setTimeout('   ');
check('timeout blank → 60', str_contains($run('timeout'), 'TIMEOUT:60'), $run('timeout'));

/* idle timeout: seed a 1-minute timeout, last_activity an hour ago */
$setTimeout('1');
$expired = $run('expired');
check('idle timeout → SESSION_EXPIRED', str_contains($expired, 'SESSION_EXPIRED'), $expired);

$ok = $run('ok');
check('child success path reaches end', str_contains($ok, 'REACHED_END'), $ok);
check('child success returns user id', str_contains($ok, 'USER:' . $ADMIN), $ok);

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
