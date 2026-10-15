<?php
/**
 * scripts/test_csrf.php — behavioral harness for src/csrf.php
 * (origin/referer trust, token extraction, check + enforcement).
 *
 * Covers: csrfCurrentHost, csrfTrustedOrigin (same-host / loopback / RFC1918 /
 * ALLOWED_ORIGINS wildcard+exact / settings fallback / bad scheme), csrfToken,
 * csrfField, csrfSubmittedToken (header + POST), csrfCheckPasses (token/origin/
 * referer), and enforceCsrf() (pass-through vs 403+exit, via a child process).
 *
 * Uses a THROWAWAY database named <live>_csrftest (only for the settings fallback).
 *   php scripts/test_csrf.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
ob_start(); // keep CLI from "sending headers" before session_start()

$KEEP = in_array('--keep', $argv ?? [], true);

/* ---- child mode: exercise enforceCsrf()'s exit path in isolation ---- */
$childMode = null;
foreach ($argv ?? [] as $a) {
    if (str_starts_with($a, '--csrf-child=')) { $childMode = substr($a, strlen('--csrf-child=')); }
}
if ($childMode !== null) {
    require_once __DIR__ . '/../src/csrf.php';
    $_SERVER['HTTP_HOST'] = 'cmms.example.com';
    unset($_SERVER['HTTP_ORIGIN'], $_SERVER['HTTP_REFERER'], $_SERVER['HTTP_X_CSRF_TOKEN']);
    putenv('ALLOWED_ORIGINS=https://allowed.example.com');
    if ($childMode === 'pass') {
        $_SERVER['HTTP_ORIGIN'] = 'https://cmms.example.com';
    }
    enforceCsrf();
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
$scratch = $live . '_csrftest';

if (!str_ends_with($scratch, '_csrftest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "CSRF harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/csrf.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }

/* ================================================================= 1. csrfCurrentHost */
echo "\n[1] csrfCurrentHost()\n";
$_SERVER['HTTP_HOST'] = 'cmms.example.com:8080';
check('strips port', csrfCurrentHost() === 'cmms.example.com', csrfCurrentHost());
$_SERVER['HTTP_HOST'] = 'CM.EXAMPLE.COM';
check('lowercases', csrfCurrentHost() === 'cm.example.com', csrfCurrentHost());
unset($_SERVER['HTTP_HOST']);
check('missing host → empty', csrfCurrentHost() === '', csrfCurrentHost());
$_SERVER['HTTP_HOST'] = '[::1]:8080';
check('strips IPv6 brackets', csrfCurrentHost() === '::1', csrfCurrentHost());
$_SERVER['HTTP_HOST'] = 'cmms.example.com';

/* ================================================================= 2. csrfTrustedOrigin */
echo "\n[2] csrfTrustedOrigin()\n";
putenv('ALLOWED_ORIGINS=*.ngrok-free.app,app.cmms.io');
$tr = [
    ['https://cmms.example.com/page', true, 'same host'],
    ['http://localhost:3000', true, 'localhost'],
    ['http://127.0.0.1:8081', true, 'loopback v4'],
    ['http://[::1]:3000', true, 'loopback v6'],
    ['http://10.0.0.5', true, 'RFC1918 10/8'],
    ['http://192.168.1.10', true, 'RFC1918 192.168/16'],
    ['http://172.16.0.1', true, 'RFC1918 172.16'],
    ['http://172.31.255.255', true, 'RFC1918 172.31'],
    ['http://172.15.0.1', false, '172.15 is public'],
    ['http://172.32.0.1', false, '172.32 is public'],
    ['https://foo.ngrok-free.app', true, 'wildcard suffix'],
    ['https://ngrok-free.app', true, 'wildcard apex'],
    ['https://notngrok-free.app', false, 'wildcard must not over-match'],
    ['https://app.cmms.io', true, 'exact allowlisted'],
    ['https://evil.example.com', false, 'unknown host'],
    ['ftp://cmms.example.com', false, 'bad scheme'],
    ['//cmms.example.com', false, 'no scheme'],
    ['https://', false, 'no host'],
    ['not-a-url', false, 'garbage'],
];
foreach ($tr as $case) {
    check("origin '{$case[0]}' → " . ($case[1] ? 'trusted' : 'untrusted'), csrfTrustedOrigin($case[0]) === $case[1]);
}

/* same-host IPv6 (bracketed) must compare equal to a bracketed HTTP_HOST */
$_SERVER['HTTP_HOST'] = '[::1]:8080';
check('same-host IPv6 origin trusted', csrfTrustedOrigin('http://[::1]:3000') === true);
$_SERVER['HTTP_HOST'] = 'cmms.example.com';

/* settings-table fallback when ALLOWED_ORIGINS is unset */
putenv('ALLOWED_ORIGINS');
$pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group) VALUES ('allowed_origins', ?, 'security')")
    ->execute(['tunnel.cmms.dev, *.trycloudflare.com']);
check('unset env → settings exact', csrfTrustedOrigin('https://tunnel.cmms.dev') === true);
check('unset env → settings wildcard', csrfTrustedOrigin('https://x.trycloudflare.com') === true);
check('unset env → non-listed false', csrfTrustedOrigin('https://evil.example.com') === false);

/* ================================================================= 3. token + field */
echo "\n[3] csrfToken() / csrfField() / csrfSubmittedToken()\n";
$tok = csrfToken();
check('token 64 hex', (bool)preg_match('/^[0-9a-f]{64}$/', $tok), $tok);
check('stable across calls', csrfToken() === $tok);
check('stored in session', ($_SESSION['csrf_token'] ?? '') === $tok);
$field = csrfField();
check('field name _csrf', str_contains($field, 'name="_csrf"'), $field);
check('field carries token', str_contains($field, 'value="' . $tok . '"'));

unset($_SERVER['HTTP_X_CSRF_TOKEN'], $_SERVER['CONTENT_TYPE']);
$_POST = [];
check('no token → empty', csrfSubmittedToken() === '', csrfSubmittedToken());
$_SERVER['HTTP_X_CSRF_TOKEN'] = 'htok';
check('header token wins', csrfSubmittedToken() === 'htok');
unset($_SERVER['HTTP_X_CSRF_TOKEN']);
$_POST = ['_csrf' => 'ptok'];
check('POST _csrf', csrfSubmittedToken() === 'ptok');
$_POST = ['csrf_token' => 'ptok2'];
check('POST csrf_token', csrfSubmittedToken() === 'ptok2');
$_POST = [];

/* ================================================================= 4. csrfCheckPasses */
echo "\n[4] csrfCheckPasses()\n";
if (session_status() !== PHP_SESSION_ACTIVE) @session_start();
$_SESSION['csrf_token'] = 'abc123';
unset($_SERVER['HTTP_ORIGIN'], $_SERVER['HTTP_REFERER'], $_SERVER['HTTP_X_CSRF_TOKEN']);

$_SERVER['HTTP_X_CSRF_TOKEN'] = 'abc123';
check('valid token passes', csrfCheckPasses() === true);
$_SERVER['HTTP_X_CSRF_TOKEN'] = 'wrong';
check('wrong token, no origin → fail', csrfCheckPasses() === false);
unset($_SERVER['HTTP_X_CSRF_TOKEN']);
$_SERVER['HTTP_ORIGIN'] = 'https://evil.example.com';
check('untrusted origin alone → fail', csrfCheckPasses() === false);
$_SERVER['HTTP_ORIGIN'] = 'https://cmms.example.com';
check('trusted origin passes (no token)', csrfCheckPasses() === true);
unset($_SERVER['HTTP_ORIGIN']);
$_SERVER['HTTP_REFERER'] = 'https://cmms.example.com/some/page';
check('trusted referer passes (no token)', csrfCheckPasses() === true);
$_SERVER['HTTP_REFERER'] = 'https://evil.example.com/x';
check('untrusted referer alone → fail', csrfCheckPasses() === false);
unset($_SERVER['HTTP_REFERER']);
check('nothing at all → fail', csrfCheckPasses() === false);

/* ================================================================= 5. enforceCsrf (child) */
echo "\n[5] enforceCsrf() — child process\n";
$self = __FILE__;
$run = function (string $mode) use ($self): array {
    $outFile = tempnam(sys_get_temp_dir(), 'csrf');
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($self) . ' --csrf-child=' . $mode . ' > ' . escapeshellarg($outFile) . ' 2>&1';
    exec($cmd, $o, $rc);
    $out = (string)file_get_contents($outFile);
    @unlink($outFile);
    return ['rc' => $rc, 'out' => $out];
};
$failRun = $run('fail');
check('fail: JSON error emitted', str_contains($failRun['out'], 'CSRF validation failed'), $failRun['out']);
check('fail: did not reach end', !str_contains($failRun['out'], 'REACHED_END'), $failRun['out']);
$passRun = $run('pass');
check('pass: reached end (no exit)', str_contains($passRun['out'], 'REACHED_END'), $passRun['out']);
check('pass: no error JSON', !str_contains($passRun['out'], 'CSRF validation failed'), $passRun['out']);

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
