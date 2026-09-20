<?php
/**
 * security_check.php — การตรวจสอบความปลอดภัยหลัง Phase 18 (รันกับ app จริงบน localhost:8081)
 *
 * วิธีรัน:
 *   php scripts/security_check.php                # ตรวจทั้งหมด
 *   php scripts/security_check.php --http-only    # ตรวจเฉพาะ HTTP 401/403 (ไม่ยุ่ง DB)
 *
 * ออกจากโปรแกรมด้วย exit code = จำนวนข้อผิดพลาด (0 = ผ่านทั้งหมด)
 */
error_reporting(E_ALL);
ini_set('display_errors', '1');

$HTTP_ONLY = in_array('--http-only', $argv, true);
$BASE = 'http://localhost:8081';
$PASS = 0;
$FAIL = 0;

function ok(string $msg): void { global $PASS; $PASS++; echo "  [PASS] {$msg}\n"; }
function bad(string $msg): void { global $FAIL; $FAIL++; echo "  [FAIL] {$msg}\n"; }

function http_request(string $url, string $method = 'GET', array $headers = [], string $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST   => $method,
        CURLOPT_HEADER          => true,
        CURLOPT_TIMEOUT         => 20,
        CURLOPT_SSL_VERIFYPEER  => false,
    ]);
    if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw = (string)curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);
    return [$code, $raw, $curlErr];
}

function json_body(string $raw): array {
    if (preg_match("/\r?\n\r?\n/", $raw, $m, PREG_OFFSET_CAPTURE)) {
        $raw = substr($raw, $m[0][1] + strlen($m[0][0]));
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

echo "=" . str_repeat('=', 76) . "\n";
echo "  CMMS-TPT Security Check (Phase 18)  —  base: {$BASE}\n";
echo "=" . str_repeat('=', 76) . "\n\n";

/* ───────────── 1) ทุก endpoint ที่ต้อง login ต้องตอบ 401 UNAUTHENTICATED (ไม่มี session) ───────────── */
echo "[1] Auth enforcement (no session → 401)\n";
$protected = [
    '/api/v1/audit_logs.php',
    '/api/v1/settings.php?defaults', // หน้า login เปิดอ่าน public theme keys ได้ (by design) — protected read = ต้อง 401
    '/api/v1/line_notify.php',
    '/api/v1/email_notify.php',
    '/api/v1/users.php',
    '/api/v1/roles.php',
    '/api/v1/menu_permissions.php',
    '/api/v1/profile.php',
    '/api/v1/reports.php',
    '/api/v1/supervisor.php',
    '/api/v1/planning.php',
    '/api/v1/pwa_settings.php',
    '/api/v1/import_excel.php?action=history',
];
foreach ($protected as $path) {
    [$code, $raw] = http_request($BASE . $path);
    $body = json_body($raw);
    if ($code === 401 && ($body['code'] ?? '') === 'UNAUTHENTICATED') {
        ok("{$path} → 401 UNAUTHENTICATED");
    } elseif ($code === 403 && ($body['code'] ?? '') !== '') {
        ok("{$path} → 403 (no-session, CSRF/perm path ตอบ 403)"); // ไม่ใช่ 200 = ยังไหลเข้ามา
    } else {
        bad("{$path} → status={$code} (คาดหวัง 401) body=" . mb_substr($raw, 0, 120));
    }
}

/* ───────────── 2) POST โดยไม่มี CSRF token ต้องถูกปฏิเสธ (403/401 ≠ 200) ───────────── */
echo "\n[2] CSRF enforcement (POST without token → not 200)\n";
$postEndpoints = [
    '/api/v1/import_excel.php?action=validate',
    '/api/v1/settings.php',
    '/api/v1/line_notify.php',
    '/api/v1/profile.php',
    '/api/v1/planning.php', // PUT/POST ต้อง CSRF (enforceCsrf ครอบทุก non-GET)
];
foreach ($postEndpoints as $path) {
    [$code, $raw] = http_request($BASE . $path, 'POST', ['Content-Type: application/json'], '{}');
    if ($code === 403 || $code === 401) {
        ok("{$path} POST → {$code} (ถูกปฏิเสธ)");
    } else {
        bad("{$path} POST → status={$code} (ควร 403/401 ไม่ใช่ 200)");
    }
}

/* ───────────── 3) ตรวจหา CORS wildcard `*` ในโค้ดที่ serve ───────────── */
echo "\n[3] No CORS wildcard (Access-Control-Allow-Origin: *) in served code\n";
$found = [];
if ($HTTP_ONLY) {
    ok('(skip source scan — --http-only)');
} else {
    $root = __DIR__ . '/..';
    $scanPaths = [realpath($root . '/public'), realpath($root . '/src')];
    foreach ($scanPaths as $dir) {
        if (!$dir) continue;
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if (!in_array(strtolower($f->getExtension()), ['php'], true)) continue;
            $content = file_get_contents($f->getPathname());
            if (preg_match("/header\s*\(\s*['\"]Access-Control-Allow-Origin\s*:\s*\*/i", $content)) {
                $found[] = str_replace($root . DIRECTORY_SEPARATOR, '', $f->getPathname());
            }
        }
    }
    if (empty($found)) { ok('ไม่พบ Access-Control-Allow-Origin: * ใน public/ และ src/'); }
    else { foreach ($found as $f) bad("พบ wildcard CORS ใน: {$f}"); }
}

/* ───────────── 4) ตรวจ secret ไม่ถูกเปิดเผยใน response ที่ไม่ใช่ 401 ───────────── */
echo "\n[4] Secret masking helper works (unit)\n";
if ($HTTP_ONLY) {
    ok('(skip — --http-only)');
} else {
    require_once __DIR__ . '/../src/helpers/api.php';
    $masked = apiMaskSecret('supersecret_token_123');
    if ($masked === '••••••••') ok('apiMaskSecret() → sentinel');
    else bad('apiMaskSecret() กาง mask (' . $masked . ')');

    $row = apiMaskSettingsRows([['setting_key' => 'telegram_bot_token', 'setting_value' => 'abc']]);
    if (($row[0]['setting_value'] ?? '') === '••••••••') ok('apiMaskSettingsRows() mask secret key');
    else bad('apiMaskSettingsRows() ไม่ mask');
    $row2 = apiMaskSettingsRows([['setting_key' => 'lang_default', 'setting_value' => 'th']]);
    if (($row2[0]['setting_value'] ?? '') === 'th' && ($row2[0]['masked'] ?? true) === false) ok('apiMaskSettingsRows() ไม่ mask key ธรรมดา');
    else bad('apiMaskSettingsRows() mask wrong key');
}

/* ───────────── 5) permission matrix (DB) ───────────── */
echo "\n[5] Permission matrix (DB)\n";
if ($HTTP_ONLY) {
    ok('(skip — --http-only)');
} else {
    require_once __DIR__ . '/../src/config/db.php';
    require_once __DIR__ . '/../src/helpers/permissions.php';
    $pdo = getDb();
    $cases = [
        'admin(1) audit_log view'   => perm_allowed($pdo, 1, 'audit_log', 'view'),
        'manager(2) audit_log view' => perm_allowed($pdo, 2, 'audit_log', 'view'),
        'asst_mgr(6) audit_log view'=> perm_allowed($pdo, 6, 'audit_log', 'view'),
        'tech(3) audit_log view'    => !perm_allowed($pdo, 3, 'audit_log', 'view'),
        'tech(3) repair complete'   => perm_allowed($pdo, 3, 'repair', 'complete'),
        'viewer(5) settings manage' => !perm_allowed($pdo, 5, 'settings', 'manage'),
        'viewer(5) dashboard view'  => perm_allowed($pdo, 5, 'dashboard', 'view'),
        'tech(3) settings manage'   => !perm_allowed($pdo, 3, 'settings', 'manage'),
        'admin(1) settings manage'  => perm_allowed($pdo, 1, 'settings', 'manage'),
    ];
    foreach ($cases as $label => $expectPass) {
        ($expectPass ? ok("{$label} ถูกต้อง") : bad("{$label} ผิดพลาด (deny-gate ผ่าน)"));
    }

    /* ───────────── 6) audit write/read-back ───────────── */
    echo "\n[6] Audit log write + read-back (DB)\n";
    require_once __DIR__ . '/../src/helpers/audit.php';
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    $_SERVER['HTTP_USER_AGENT'] = 'security-check';
    $_SESSION = ['user_id' => 1, 'user_name' => 'SecurityCheck', 'role_id' => 1];
    $before = (int)$pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action = 'SECURITY_CHECK'")->fetchColumn();
    audit_log($pdo, 'SECURITY_CHECK', 'system', 'check', 'security_check.php smoke run', ['k' => 'v'], 'done', 'info');
    $after = (int)$pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action = 'SECURITY_CHECK'")->fetchColumn();
    if ($after > $before) ok('audit_log() เขียนได้ (SECURITY_CHECK)');
    else bad('audit_log() เขียนล้มเหลว');

    $row = $pdo->query("SELECT severity, resource_type, ip_address FROM audit_logs WHERE action = 'SECURITY_CHECK' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if ($row && ($row['severity'] ?? '') === 'info' && ($row['resource_type'] ?? '') === 'system' && !empty($row['ip_address'])) {
        ok('คอลัมน์ severity/resource_type/ip_address บันทึกถูกต้อง');
    } else {
        bad('คอลัมน์ audit ผิด (' . json_encode($row, JSON_UNESCAPED_UNICODE) . ')');
    }
    $pdo->prepare("DELETE FROM audit_logs WHERE action = 'SECURITY_CHECK'")->execute();
    ok('ล้าง test rows เรียบร้อย (SECURITY_CHECK)');
}

/* ───────────── summary ───────────── */
echo "\n" . str_repeat('-', 76) . "\n";
echo "  SUMMARY: {$PASS} passed, {$FAIL} failed\n";
echo str_repeat('-', 76) . "\n";
if ($FAIL === 0) {
    echo "RESULT: PASS — system ผ่านการตรวจปลอดภัยขั้นพื้นฐาน\n";
} else {
    echo "RESULT: FAIL — แก้ {$FAIL} รายการที่ระบุก่อน push\n";
}
exit($FAIL > 0 ? 1 : 0);