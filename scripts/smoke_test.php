<?php
/**
 * smoke_test.php — ตรวจสุขภาพเว็บหลัง deploy (รันบนเครื่อง production)
 *
 * วิธีใช้:  php scripts/smoke_test.php
 *   - สร้าง session จำลอง (admin) ชั่วคราว แล้ว crawl หน้าหลัก PHP + PWA + API
 *   - พบ status นอกช่วง [200,301,302,304] → นับเป็น failure
 *   - exit 0 = ผ่านทั้งหมด, exit 1 = มีหน้า/API พัง (ใช้กับ CI/หลัง deploy)
 */

$BASE = 'http://127.0.0.1:8081'; // PHP (Apache)
$PWA  = 'http://127.0.0.1:3001'; // Next.js
$SAVE_PATH = 'C:\Windows\Temp';   // ตรงกับ session.save_path ของ Apache (FastCGI)

// ---------- 1. สร้าง session จำลอง ----------
// ต้องใช้ ID ความยาวตาม session.sid_length (ค่าเริ่มต้น 26) ไม่งั้น PHP 8.x จะ reject session_id()
$sid = bin2hex(random_bytes(13)); // 26 hex chars
ini_set('session.save_path', $SAVE_PATH);
session_id($sid);
session_start();
$_SESSION['user_id'] = 1;
$_SESSION['user_name'] = 'admin';
$_SESSION['role_id'] = 1;
$_SESSION['full_name'] = 'Smoke Test';
session_write_close();

$sessFile = rtrim($SAVE_PATH, '\\/') . DIRECTORY_SEPARATOR . 'sess_' . $sid;
// Apache (FastCGI) รันเป็น NT AUTHORITY\IUSR — ต้องให้สิทธิ์อ่าน session ที่ CLI สร้าง
// ใช้ SID S-1-5-17 (IUSR) ป้องกันปัญหา account name ต่างเครื่อง/ภาษาของ Windows
@shell_exec('icacls "' . $sessFile . '" /grant "*S-1-5-17:(F)" 2>nul');

// ---------- 2. helper ----------
$results = [];
$failCount = 0;

function probe(string $url, array $cookies): int {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_COOKIE, implode('; ', $cookies));
    curl_setopt($ch, CURLOPT_USERAGENT, 'CMMS-SmokeTest/1.0');
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code;
}

function runCheck(string $url, string $label, array $cookies): void {
    global $results, $failCount;
    $code = probe($url, $cookies);
    $ok = in_array($code, [200, 301, 302, 304], true);
    if (!$ok) $failCount++;
    $results[] = sprintf("  %-5s %-55s %s", $ok ? 'OK' : 'FAIL', $label, $code);
    if (!$ok) error_log("SMOKE FAIL: $label -> $code");
}

$cookie = ["PHPSESSID=$sid"];

// ---------- 3. หน้าหลัก PHP (:8081) ----------
echo "== PHP (Apache :8081) ==\n";
$phpPages = [
    '/login.php',
    '/index.php',
    '/pages/repair/index.php',
    '/pages/pm_am/index.php',
    '/pages/spare_parts/index.php',
    '/pages/asset_registry/index.php',
    '/pages/settings/line_config.php',
    '/pages/approval/center.php',
    '/pages/reports/export.php?type=repair',
    '/approve.php',
];
foreach ($phpPages as $p) {
    runCheck($BASE . $p, 'PHP' . $p, $cookie);
}

// ---------- 4. API (:8081) ----------
echo "== API (:8081) ==\n";
$apis = [
    '/api/v1/index.php?resource=work-orders',
    '/api/v1/index.php?resource=assets',
    '/api/v1/index.php?resource=low-stock',
    '/api/v1/approval.php',
    '/api/v1/analytics_monthly.php?year=' . date('Y'),
    '/api/v1/repair.php',
    '/api/v1/notifications_log.php',
    '/api/v1/workload.php',
    '/api/v1/suppliers.php',
    '/api/v1/pm_ical.php',
];
foreach ($apis as $a) {
    runCheck($BASE . $a, 'API' . $a, $cookie);
}

// ---------- 5. หน้า PWA (:3001) ----------
echo "== PWA (Next.js :3001) ==\n";
$pwaPages = [
    '/login',
    '/dashboard',
    '/approval',
    '/iot/monitor',
    '/assets',
    '/asset_registry',
    '/pm_am/calendar',
    '/repair/kanban',
    '/repair/tracking',
    '/repair/my_tasks',
    '/repair/workload',
    '/safety/work_permit',
    '/spare_parts',
    '/users',
    '/manifest.webmanifest',
];
foreach ($pwaPages as $p) {
    runCheck($PWA . $p, 'PWA' . $p, $cookie);
}

// ---------- 6. สรุป + cleanup ----------
@unlink($sessFile);

echo "\n== สรุป ==";
foreach ($results as $r) echo "\n$r";
$total = count($results);
echo "\n\nผ่าน {$total} ตรวจ, พัง {$failCount} รายการ\n";

exit($failCount > 0 ? 1 : 0);
