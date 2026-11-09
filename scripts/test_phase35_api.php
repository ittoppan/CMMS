<?php
/**
 * scripts/test_phase35_api.php — Phase 35 HTTP smoke test for public/api/v1/shutdown.php
 *
 *   php scripts/test_phase35_api.php [--keep]
 *
 * Why a built-in server instead of IIS: the Phase 35 tables must NOT exist in the live DB
 * yet (migration is pending approval). This harness therefore:
 *   1. builds a throwaway DB named <live>_sdtest via scripts/test_phase35_shutdown.php --keep,
 *   2. boots `php -S` on a loopback port with `variables_order=EGPCS` + a seeded process env
 *      (so db.php skips .env and uses the scratch DB) and a pinned session save path,
 *   3. drives the real endpoint over HTTP (requireLogin, requirePerm, enforceCsrf, idempotency),
 *   4. stops the server and (unless --keep) drops the scratch DB.
 *
 * SAFETY: refuses to run unless the scratch name ends in "_sdtest" and differs from the live DB.
 * Nothing here ever connects the endpoint to the live database.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');
ob_start(); // keep progress echo from marking HTTP headers as sent before fake sessions start

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
$scratch = $live . '_sdtest';

if (!str_ends_with($scratch, '_sdtest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function ok(string $label, bool $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

echo "Phase 35 API smoke on scratch DB: $scratch (live: $live)\n";

/* --------------------------------------------------------- 1. build scratch DB */
echo "\n[1] Building scratch DB via engine harness --keep\n";
$harness = dirname(__DIR__) . '/scripts/test_phase35_shutdown.php';
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($harness) . ' --keep 2>&1';
exec($cmd, $hOut, $hRc);
$hTail = implode("\n", array_slice($hOut, -4));
if ($hRc !== 0) {
    fwrite(STDERR, "GUARD: engine harness failed (rc=$hRc)\n$hTail\n");
    exit(2);
}
echo "  $hTail\n";

/* --------------------------------------------------------- 2. fixtures lookup */
$adminPdo = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$adminPdo->exec("USE `$scratch`");
$uid = (int)$adminPdo->query("SELECT id FROM users WHERE username = 'sd35admin' LIMIT 1")->fetchColumn();
if ($uid <= 0) {
    $adminPdo->prepare("INSERT INTO users (username, email, password, full_name, role_id, role, is_active)
                        VALUES ('sd35admin','sd35@example.test','x','SD35 Admin',1,'admin',1)")->execute();
    $uid = (int)$adminPdo->lastInsertId();
}
echo "  fixture user_id = $uid\n";

/* --------------------------------------------------------- 3. server + sessions */
// NOTE: PHP's `-d key=value` truncates the value at a `~` (Windows 8.3 short names like
// ADMINI~1). sys_get_temp_dir() often contains one, which silently breaks session.save_path,
// so use a clean directory (same one scripts/test_phase32_api.php uses).
$tempRoot = (DIRECTORY_SEPARATOR === '\\') ? 'C:\\Windows\\Temp' : sys_get_temp_dir();
$sessDir = rtrim($tempRoot, '\\/') . DIRECTORY_SEPARATOR . 'sd35_api_sess_' . bin2hex(random_bytes(4));
@mkdir($sessDir, 0777, true);
$logPath = $sessDir . DIRECTORY_SEPARATOR . 'server.log';
$httpPort = 8173;

$docroot = dirname(__DIR__) . '/public';
// Paths are passed unquoted to php -S; refuse if either contains a space (Windows quoting would
// otherwise leak into the -d / -t value).
if (str_contains($sessDir, ' ') || str_contains($docroot, ' ')) {
    fwrite(STDERR, "GUARD: temp/docroot path contains spaces; cannot pass unquoted to php -S\n");
    exit(2);
}

// Seed $_ENV from the process environment (variables_order=EGPCS) so db.php does NOT load the
// live .env. The child process env carries the scratch DB creds; session settings come via -d.
$serverEnv = getenv();
foreach (['DB_HOST' => $host, 'DB_PORT' => $port, 'DB_USER' => $user, 'DB_PASS' => $pass, 'DB_NAME' => $scratch] as $k => $v) {
    $serverEnv[$k] = (string)$v;
}
$serverCmd = escapeshellarg(PHP_BINARY)
    . ' -d variables_order=EGPCS'
    . ' -d session.save_path=' . $sessDir
    . ' -d session.use_strict_mode=0'
    . ' -S 127.0.0.1:' . $httpPort . ' -t ' . $docroot;
// Detach fully: stdin from NUL, output to a log file, no cmd.exe wrapper, so the parent
// process can exit/terminate without Windows waiting on an inherited console handle.
$nul = (DIRECTORY_SEPARATOR === '\\') ? 'NUL' : '/dev/null';
$descriptors = [0 => ['file', $nul, 'r'], 1 => ['file', $logPath, 'a'], 2 => ['file', $logPath, 'a']];
$proc = proc_open($serverCmd, $descriptors, $pipes, dirname(__DIR__), $serverEnv, ['bypass_shell' => true]);
if (!is_resource($proc)) {
    fwrite(STDERR, "GUARD: could not start php -S\n");
    exit(2);
}

/* fake session in the same save path the server reads */
function fakeSession(int $roleId, int $userId, string $sessDir): array {
    ini_set('session.save_path', $sessDir);
    ini_set('session.use_strict_mode', '0');
    ini_set('session.use_cookies', '0');
    $sid = bin2hex(random_bytes(13));
    session_id($sid);
    if (!session_start()) throw new RuntimeException('session_start failed');
    $_SESSION = [
        'user_id' => $userId, 'user_name' => 'sd35', 'role_id' => $roleId,
        'full_name' => 'Phase35 API (role ' . $roleId . ')',
        'csrf_token' => bin2hex(random_bytes(16)),
        'last_activity' => time(), 'last_regenerated' => time(),
    ];
    $csrf = (string)$_SESSION['csrf_token'];
    session_write_close();
    $file = rtrim($sessDir, '\\/') . DIRECTORY_SEPARATOR . 'sess_' . $sid;
    if (!is_file($file)) throw new RuntimeException('session file missing: ' . $file);
    return ['cookie' => 'PHPSESSID=' . $sid, 'csrf' => $csrf, 'file' => $file];
}

$BASE = 'http://127.0.0.1:' . $httpPort;
$URL = $BASE . '/api/v1/shutdown.php';

/* wait for the server to accept connections */
$ready = false;
for ($i = 0; $i < 60; $i++) {
    $ch = curl_init($URL . '?action=config');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 2]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code > 0) { $ready = true; break; }
    usleep(250000);
}
if (!$ready) {
    fwrite(STDERR, "GUARD: server did not become ready\n" . @file_get_contents($logPath) . "\n");
    proc_terminate($proc); proc_close($proc);
    exit(2);
}

function req(string $url, ?array $payload = null, ?array $session = null): array {
    $ch = curl_init($url);
    $headers = [];
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    }
    if ($session !== null) {
        curl_setopt($ch, CURLOPT_COOKIE, (string)$session['cookie']);
        if (!empty($session['csrf']) && $payload !== null) $headers[] = 'X-CSRF-Token: ' . $session['csrf'];
    }
    if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 25]);
    $raw = (string)curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $body = $raw;
    if (($p = strpos($raw, "\r\n\r\n")) !== false) $body = substr($raw, $p + 4);
    $json = json_decode($body, true);
    return ['code' => $code, 'json' => is_array($json) ? $json : null, 'raw' => $body, 'err' => $err];
}

$sAdmin = $sManager = $sForeman = $sViewer = $sNone = null;
$scratchIds = [];

try {
    $sAdmin = fakeSession(1, $uid, $sessDir);
    $sManager = fakeSession(2, $uid, $sessDir);
    $sForeman = fakeSession(7, $uid, $sessDir);
    $sViewer = fakeSession(5, $uid, $sessDir);
    $sNone = fakeSession(4, $uid, $sessDir);

    echo "\n[2] auth / csrf\n";
    $r = req($URL . '?action=config');
    ok('ไม่มี session -> 401', $r['code'] === 401 && ($r['json']['code'] ?? '') === 'UNAUTHENTICATED', (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=config', null, $sAdmin);
    ok('admin config 200', $r['code'] === 200 && ($r['json']['permission_module'] ?? '') === 'shutdown', $r['raw']);
    ok('config exposes can.*', isset($r['json']['can']['view'], $r['json']['can']['startup'], $r['json']['can']['closeout']));
    $r = req($URL . '?action=list', null, $sNone);
    ok('role 4 (no access) -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=list', null, $sViewer);
    ok('role 5 (view) list 200', $r['code'] === 200 && is_array($r['json']['rows'] ?? null), (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=save', ['action' => 'save', 'title' => 'viewer must fail'], $sViewer);
    ok('role 5 POST save -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=save', ['action' => 'save', 'title' => 'x']); // admin session cookie missing + no csrf
    ok('POST ไม่มี session/csrf -> 401/403', in_array($r['code'], [401, 403], true), (string)$r['code'] . ' ' . $r['raw']);
    $sNoCsrf = $sAdmin; $sNoCsrf['csrf'] = '';
    $r = req($URL . '?action=save', ['action' => 'save', 'title' => 'no csrf'], $sNoCsrf);
    // admin cookie present but no csrf header/origin -> 403 CSRF
    ok('POST ขาด CSRF -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=nope', null, $sAdmin);
    ok('GET action ไม่รู้จัก -> 404', $r['code'] === 404, (string)$r['code'] . ' ' . $r['raw']);

    echo "\n[3] create / read / validation\n";
    $r = req($URL . '?action=save', ['action' => 'save', 'title' => 'API Shutdown', 'shutdown_type' => 'turnaround',
        'risk_level' => 'high', 'facility' => 'Line 2'], $sAdmin);
    ok('admin สร้าง shutdown ได้', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
    $sid = (int)($r['json']['id'] ?? 0);
    $scratchIds[] = $sid;
    ok('ได้ id และเลข SD-YYYYMM-NNN', $sid > 0 && (bool)preg_match('/^SD-\d{6}-\d+$/', (string)($r['json']['shutdown_no'] ?? '')), $r['raw']);
    ok('สถานะเริ่มต้น draft', (string)($r['json']['status'] ?? '') === 'draft', $r['raw']);
    $r = req($URL . '?action=detail&id=' . $sid, null, $sAdmin);
    ok('GET detail ตรงกับ id', $r['code'] === 200 && (int)($r['json']['id'] ?? 0) === $sid, $r['raw']);
    $r = req($URL . '?action=save', ['action' => 'save', 'title' => 'bad', 'shutdown_type' => 'warp'], $sAdmin);
    ok('shutdown_type ผิด -> 400 VALIDATION_ERROR', $r['code'] === 400 && ($r['json']['code'] ?? '') === 'VALIDATION_ERROR', (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=detail&id=99999999', null, $sAdmin);
    ok('detail ไม่มีจริง -> 404 NOT_FOUND', $r['code'] === 404 && ($r['json']['code'] ?? '') === 'NOT_FOUND', (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=detail', null, $sAdmin);
    ok('detail ไม่ระบุ id -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);

    echo "\n[4] RBAC ต่อ action (role 7 = สร้าง/วางแผนได้ แต่ startup/closeout/cancel ไม่ได้)\n";
    $r = req($URL . '?action=scope_save', ['action' => 'scope_save', 'shutdown_id' => $sid,
        'title' => 'Remove rotor', 'estimate_hours' => 8], $sForeman);
    ok('role 7 scope_save ได้ (plan)', $r['code'] === 200 && ($r['json']['id'] ?? 0) > 0, $r['raw']);
    $scopeId = (int)($r['json']['id'] ?? 0);
    $r = req($URL . '?action=transition', ['action' => 'transition', 'id' => $sid, 'to' => 'startup'], $sForeman);
    ok('role 7 transition->startup -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=transition', ['action' => 'transition', 'id' => $sid, 'to' => 'cancelled', 'reason' => 'ทดสอบ'], $sForeman);
    ok('role 7 transition->cancelled -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=transition', ['action' => 'transition', 'id' => $sid, 'to' => 'planning'], $sForeman);
    ok('role 7 transition->planning ได้', $r['code'] === 200 && (string)($r['json']['status'] ?? '') === 'planning', $r['raw']);

    echo "\n[5] lifecycle -> HTTP mapping\n";
    $r = req($URL . '?action=transition', ['action' => 'transition', 'id' => $sid, 'to' => 'ready'], $sAdmin);
    ok('planning -> ready (ข้ามขั้น) -> 409 INVALID_TRANSITION', $r['code'] === 409 && ($r['json']['code'] ?? '') === 'INVALID_TRANSITION', (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=transition', ['action' => 'transition', 'id' => $sid, 'to' => 'scope_freeze'], $sAdmin);
    ok('planning -> scope_freeze ได้ (auto baseline)', $r['code'] === 200 && (string)($r['json']['status'] ?? '') === 'scope_freeze', $r['raw']);
    $r = req($URL . '?action=transition', ['action' => 'transition', 'id' => $sid, 'to' => 'ready'], $sAdmin);
    ok('scope_freeze -> ready ติด Readiness -> 409 READINESS_BLOCKED', $r['code'] === 409 && ($r['json']['code'] ?? '') === 'READINESS_BLOCKED', (string)$r['code'] . ' ' . $r['raw']);

    echo "\n[6] reads\n";
    $r = req($URL . '?action=readiness&id=' . $sid, null, $sAdmin);
    ok('readiness 200 (stored + live)', $r['code'] === 200 && isset($r['json']['stored'], $r['json']['live']), $r['raw']);
    $r = req($URL . '?action=dashboard', null, $sAdmin);
    ok('dashboard 200', $r['code'] === 200 && isset($r['json']['by_status']), (string)$r['code'] . ' ' . $r['raw']);
    $r = req($URL . '?action=baselines&id=' . $sid, null, $sAdmin);
    ok('baselines 200 มี >=1 จาก scope_freeze', $r['code'] === 200 && count($r['json']['baselines'] ?? []) >= 1, $r['raw']);
    $r = req($URL . '?action=options', null, $sAdmin);
    ok('options 200 พร้อม reference data', $r['code'] === 200 && isset($r['json']['assets'], $r['json']['spare_parts'], $r['json']['options']), (string)$r['code'] . ' ' . $r['raw']);

    echo "\n[7] idempotency\n";
    $key = 'p35-test-' . bin2hex(random_bytes(4));
    $body = ['action' => 'save', 'client_action_id' => $key, 'title' => 'Idem Shutdown ' . $key, 'shutdown_type' => 'inspection'];
    $r = req($URL . '?action=save', $body, $sManager);
    $idemId = (int)($r['json']['id'] ?? 0);
    ok('manager สร้างครั้งแรกได้ id', $r['code'] === 200 && $idemId > 0, $r['raw']);
    $scratchIds[] = $idemId;
    $r = req($URL . '?action=save', $body, $sManager);
    ok('ส่งซ้ำ client_action_id เดิม -> dedup', $r['code'] === 200 && ($r['json']['dedup'] ?? false) === true && (int)($r['json']['id'] ?? 0) === $idemId, $r['raw']);
    $n = (int)$adminPdo->query("SELECT COUNT(*) FROM sd_shutdowns WHERE title = " . $adminPdo->quote('Idem Shutdown ' . $key))->fetchColumn();
    ok('มีเพียง 1 แถวหลังส่งซ้ำ', $n === 1, "rows=$n");
} catch (Throwable $e) {
    $fail_count++;
    echo "  FATAL " . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() . "\n";
} finally {
    echo "\n== cleanup ==\n";
    $st = proc_get_status($proc);
    $serverPid = (int)($st['pid'] ?? 0);
    proc_terminate($proc);
    if ($serverPid > 0) exec('taskkill /F /T /PID ' . $serverPid . ' 2>&1');
    proc_close($proc);
    foreach ([$sAdmin, $sManager, $sForeman, $sViewer, $sNone] as $s) {
        if (is_array($s) && isset($s['file'])) @unlink($s['file']);
    }
    @unlink($logPath);
    @rmdir($sessDir);

    $adminPdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $validIds = array_values(array_filter(array_map('intval', $scratchIds)));
    if ($validIds) {
        $in = implode(',', $validIds);
        foreach (['sd_activity', 'sd_readiness_checks', 'sd_startup_checks', 'sd_planned_parts',
                  'sd_dependencies', 'sd_baselines', 'sd_assets', 'sd_scopes'] as $t) {
            try { $adminPdo->exec("DELETE FROM `$t` WHERE shutdown_id IN ($in)"); } catch (Throwable $e) {}
        }
        $adminPdo->exec("DELETE FROM sd_shutdowns WHERE id IN ($in)");
    }
    try { $adminPdo->exec("DELETE FROM client_action_log WHERE client_action_id LIKE 'p35-test-%'"); } catch (Throwable $e) {}

    if (!$KEEP) {
        $adminPdo = null;
        $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
        echo "Dropped scratch DB $scratch\n";
    } else {
        echo "Kept scratch DB $scratch (--keep)\n";
    }

    printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
    if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
    exit($fail_count > 0 ? 1 : 0);
}
