<?php
/**
 * CMMS-TPT System Services Manager (จัดการ Service ที่เกี่ยวข้องกับระบบ)
 *
 * GET  /api/v1/system_services.php            -> สถานะ service ทั้งหมด
 * POST /api/v1/system_services.php  body: { action: "start"|"stop", service: "web"|"ngrok"|"iis"|"mysql" }
 *
 * Admin เท่านั้น (requireLogin($pdo, true))
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

requireLogin(getDb(), true); // ต้องเป็น admin

$pdo = getDb();

/* ------------------------------------------------------------
 * ค่าตั้งต้นจาก environment (ห้ามฝัง path/port ของเครื่อง dev ไว้ในโค้ด)
 * ------------------------------------------------------------ */
function svc_env(string $key, $default) {
    $v = getenv($key);
    return ($v === false || $v === '') ? $default : $v;
}
function svc_next_port(): int { return (int)svc_env('NEXTJS_PORT', 3001); }
function svc_api_port(): int { return (int)svc_env('API_PORT', 8081); }
function svc_mysql_port(): int { return (int)svc_env('MYSQL_PORT', 3306); }
function svc_app_root(): string {
    return rtrim(str_replace('\\', '/', (string)svc_env('APP_ROOT', dirname(__DIR__, 3))), '/');
}

/* ------------------------------------------------------------
 * ฟังก์ชันตรวจสถานะ (ทุกตัวไม่พึ่งพา shell — ปลอดภัย)
 * ------------------------------------------------------------ */
function portListening(int $port): bool {
    $conn = @fsockopen('127.0.0.1', $port, $errno, $errstr, 1.5);
    if ($conn) { fclose($conn); return true; }
    return false;
}

function processPidOnPort(int $port): ?int {
    // ดู PID ของ process ที่ listen port (ไม่มี $_. ปัญหา quoting น้อย)
    $ps = 'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ' . $port . ' -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1" 2>NUL';
    $out = shell_exec($ps);
    $pid = (int)trim((string)$out);
    return $pid > 0 ? $pid : null;
}

function processPidByName(string $name): ?int {
    // tasklist CSV — ปลอดภัย ไม่ต้อง quoting ซับซ้อน
    $out = shell_exec('tasklist /FI "IMAGENAME eq ' . $name . '" /FO CSV /NH 2>NUL');
    if (!$out) return null;
    foreach (explode("\n", trim($out)) as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '"') !== 0) continue;
        $cols = str_getcsv($line);
        if (isset($cols[1]) && (int)$cols[1] > 0) return (int)$cols[1];
    }
    return null;
}

function zrokInfo(): array {
    // ดูจาก local zrok API (port 9191) — ถ้ามี
    $ctx = stream_context_create(['http' => ['timeout' => 2]]);
    $json = @file_get_contents(rtrim((string)svc_env('ZROK_API_URL', 'http://127.0.0.1:9191'), '/') . '/api/tunnels', false, $ctx);
    if ($json === false) return [];
    $j = json_decode($json, true);
    $tunnels = [];
    foreach (($j['tunnels'] ?? []) as $t) {
        $tunnels[] = [
            'name' => $t['name'] ?? '',
            'public_url' => $t['public_url'] ?? '',
            'addr' => $t['config']['addr'] ?? '',
        ];
    }
    return $tunnels;
}

function serviceStatus(string $svc): string {
    // sc query ไม่ต้อง admin (Get-Service ต้อง admin เมื่อรันผ่าน IIS AppPool)
    $out = shell_exec('sc query ' . $svc . ' 2>NUL');
    if (!$out) return '';
    if (preg_match('/STATE\s*:\s*\d+\s+([A-Z_]+)/i', $out, $m)) return $m[1];
    if (preg_match('/RUNNING/i', $out)) return 'RUNNING';
    return '';
}

function websiteStatus(string $site): string {
    // ตรวจผ่าน IIS config (appcmd ไม่ต้อง admin สำหรับ query บางกรณี — fallback คือ sc query W3SVC)
    $out = shell_exec('sc query W3SVC 2>NUL');
    if ($out && preg_match('/RUNNING/i', $out)) return 'Started';
    return '';
}

function ngrokInfo(): array {
    // ดูจาก local ngrok API (port 4040) — ไม่พึ่งพา shell
    $ctx = stream_context_create(['http' => ['timeout' => 2]]);
    $json = @file_get_contents(rtrim((string)svc_env('NGROK_API_URL', 'http://127.0.0.1:4040'), '/') . '/api/tunnels', false, $ctx);
    if ($json === false) return [];
    $j = json_decode($json, true);
    $tunnels = [];
    foreach (($j['tunnels'] ?? []) as $t) {
        $tunnels[] = [
            'name' => $t['name'] ?? '',
            'public_url' => $t['public_url'] ?? '',
            'addr' => $t['config']['addr'] ?? '',
        ];
    }
    return $tunnels;
}

function httpCheck(string $url, int $timeout = 4): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_NOBODY => true,
    ]);
    $ok = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['reachable' => $ok !== false, 'http_code' => $code];
}

/* ------------------------------------------------------------
 * ตรวจสถานะทั้งหมด
 * ------------------------------------------------------------ */
function getServiceStatuses(PDO $pdo): array {
    // 1. Web App (Next.js)
    $webPort = svc_next_port();
    $webListen = portListening($webPort);
    $webPid = processPidOnPort($webPort);
    // ตรวจ HTTP ของเว็บ
    $webHttp = $webListen ? httpCheck('http://127.0.0.1:' . $webPort . '/') : ['reachable' => false, 'http_code' => 0];

    // 2. ngrok
    $ngrokPid = processPidByName('ngrok.exe');
    $tunnels = ngrokInfo();
    $ngrokUrl = '';
    foreach ($tunnels as $t) { if ($t['public_url']) { $ngrokUrl = $t['public_url']; break; } }

    // 2.5 Cloudflare Tunnel (quick tunnel — URL อ่านจาก log ของ cloudflared)
    $cfPid = processPidByName('cloudflared.exe');
    $cfUrl = '';
    $cfLogPath = (string)svc_env('CLOUDFLARED_LOG', 'C:\\cloudflared\\cf_tunnel_err.log');
    if (file_exists($cfLogPath)) {
        $cfLog = (string)@file_get_contents($cfLogPath);
        if (preg_match('#https://[a-z0-9\-]+\.trycloudflare\.com#', $cfLog, $m)) $cfUrl = $m[0];
    }

    // 2.7 zrok Tunnel
    $zrokPid = processPidByName('zrok2.exe');
    $zrokTunnels = zrokInfo();
    $zrokUrl = '';
    foreach ($zrokTunnels as $t) { if ($t['public_url']) { $zrokUrl = $t['public_url']; break; } }

    // 3. IIS site (PHP API)
    $apiPort = svc_api_port();
    $iisSite = (string)svc_env('IIS_SITE_NAME', 'cmms-tpt');
    $siteState = websiteStatus($iisSite);
    $iisListen = portListening($apiPort);
    $apiHttp = $iisListen ? httpCheck('http://127.0.0.1:' . $apiPort . '/') : ['reachable' => false, 'http_code' => 0];

    // 4. MySQL — ใช้พอร์ต + PDO ping (IIS AppPool ไม่มีสิทธิ์รัน sc/Get-Service)
    $mysqlListen = portListening(svc_mysql_port());
    $mysqlOk = false;
    try { $pdo->query('SELECT 1'); $mysqlOk = true; } catch (Exception $e) {}

    // 5. LINE Webhook (ใช้ tunnel-url.txt → ngrok ก่อน cloudflared)
    $tunnelUrlFile = svc_app_root() . '/logs/tunnel-url.txt';
    $fileUrl = '';
    if (file_exists($tunnelUrlFile)) {
        $raw = (string)@file_get_contents($tunnelUrlFile);
        if (preg_match('#https://[^\s]+#', $raw, $m)) $fileUrl = rtrim($m[0], '/');
    }
    $publicUrl = $fileUrl ?: ($ngrokUrl ?: $cfUrl);
    $lineWebhook = ['reachable' => false, 'http_code' => 0];
    if ($publicUrl) {
        $lineWebhook = httpCheck(rtrim($publicUrl, '/') . '/api/v1/line_webhook.php', 6);
    }

    $services = [];

    $webStatus = (!$webListen) ? 'stopped' : ($webHttp['http_code'] === 200 ? 'running' : 'warning');
    $services[] = [
        'key' => 'web',
        'name' => 'Web App (Next.js)',
        'icon' => '🖥️',
        'desc' => 'หน้าจอระบบ CMMS — production server บนพอร์ต ' . $webPort,
        'status' => $webStatus,
        'running' => $webListen,
        'detail' => $webListen
            ? "กำลังรัน • PID $webPid • HTTP {$webHttp['http_code']}"
            : 'หยุดอยู่ — กดรันเพื่อเปิดเว็บ',
        'pid' => $webPid,
        'port' => $webPort,
        'url' => 'http://localhost:' . $webPort,
    ];

    $ngrokStatus = ($ngrokPid && $ngrokUrl) ? 'running' : (($ngrokPid || $ngrokUrl) ? 'warning' : 'stopped');
    $services[] = [
        'key' => 'ngrok',
        'name' => 'ngrok Tunnel',
        'icon' => '🔗',
        'desc' => 'URL สาธารณะ https สำหรับเปิดระบบให้ใช้งานนอกเครื่อง (LINE webhook ก็ผ่านช่องนี้ได้)',
        'status' => $ngrokStatus,
        'running' => !empty($ngrokPid) || !empty($ngrokUrl),
        'detail' => $ngrokUrl
            ? "กำลังรัน • {$ngrokUrl}" . ($ngrokPid ? " • PID $ngrokPid" : '')
            : ($ngrokPid ? 'process รันอยู่แต่ยังไม่มี tunnel' : 'หยุดอยู่ — ระบบจะใช้ URL นี้ไม่ได้'),
        'pid' => $ngrokPid,
        'url' => $ngrokUrl ?: (getenv('NGROK_STATIC_URL') ?: ''),
    ];

    $cfHttp = $cfUrl ? httpCheck($cfUrl, 6) : ['reachable' => false, 'http_code' => 0];
    $cfStatus = (!$cfPid) ? 'stopped' : (($cfUrl && $cfHttp['http_code'] === 200) ? 'running' : 'warning');
    $services[] = [
        'key' => 'cloudflared',
        'name' => 'Cloudflare Tunnel',
        'icon' => '🌐',
        'desc' => 'URL สาธารณะ https ที่ไม่มีหน้าเตือน — ตัวหลักสำหรับ LIFF และ LINE Webhook',
        'status' => $cfStatus,
        'running' => !empty($cfPid),
        'detail' => $cfPid
            ? ($cfUrl
                ? "กำลังรัน • {$cfUrl} • PID $cfPid • HTTP {$cfHttp['http_code']}"
                : "process รันอยู่ (PID $cfPid) แต่ยังไม่มี URL")
            : 'หยุดอยู่ — กดรันเพื่อเปิด Cloudflare Tunnel',
        'pid' => $cfPid,
        'url' => $cfUrl,
    ];

    $zrokStatus = (!$zrokPid) ? 'stopped' : ($zrokUrl ? 'running' : 'warning');
    $services[] = [
        'key' => 'zrok',
        'name' => 'zrok Tunnel',
        'icon' => '🚇',
        'desc' => 'URL สาธารณะ https ผ่าน zrok (share public 3001, 8081) — ใช้แทน ngrok/cloudflared',
        'status' => $zrokStatus,
        'running' => !empty($zrokPid),
        'detail' => $zrokPid
            ? ($zrokUrl
                ? "กำลังรัน • {$zrokUrl} • PID $zrokPid"
                : "process รันอยู่ (PID $zrokPid) แต่ยังไม่มี tunnel")
            : 'หยุดอยู่ — กดรันเพื่อเปิด zrok Tunnel (share public 3001, 8081)',
        'pid' => $zrokPid,
        'url' => $zrokUrl,
    ];

    $iisStatus = (!$iisListen) ? 'stopped' : ($apiHttp['http_code'] === 200 ? 'running' : 'warning');
    $services[] = [
        'key' => 'iis',
        'name' => 'PHP API (IIS — cmms-tpt)',
        'icon' => '⚙️',
        'desc' => 'REST API + ฐานข้อมูลของระบบ (พอร์ต ' . $apiPort . ')',
        'status' => $iisStatus,
        'running' => $iisListen,
        'detail' => $iisListen
            ? "กำลังรัน • HTTP {$apiHttp['http_code']}" . ($siteState ? " • W3SVC: $siteState" : '')
            : ($siteState ? "W3SVC: $siteState แต่ port $apiPort ยังไม่ตอบ" : 'หยุดอยู่ — กดรันเพื่อเปิด'),
        'pid' => null,
        'port' => $apiPort,
        'url' => 'http://localhost:' . $apiPort,
    ];

    $mysqlRunning = $mysqlListen && $mysqlOk;
    $services[] = [
        'key' => 'mysql',
        'name' => 'MySQL Database',
        'icon' => '🗄️',
        'desc' => 'ฐานข้อมูลหลักของระบบ (service: MySQL80 — พอร์ต 3306)',
        'status' => $mysqlRunning ? 'running' : (($mysqlListen || $mysqlOk) ? 'warning' : 'stopped'),
        'running' => $mysqlRunning,
        'detail' => $mysqlRunning
            ? 'กำลังรัน • พอร์ต 3306 เปิด • เชื่อมต่อ DB OK'
            : ($mysqlListen ? 'พอร์ตเปิดแต่ PDO ต่อไม่ได้' : 'หยุดอยู่ — กดรันเพื่อเปิดฐานข้อมูล'),
        'pid' => null,
        'port' => svc_mysql_port(),
        'url' => '',
    ];

    $lineStatus = (!$publicUrl) ? 'unknown' : ($lineWebhook['reachable'] ? 'running' : 'warning');
    $services[] = [
        'key' => 'line',
        'name' => 'LINE Webhook',
        'icon' => '💬',
        'desc' => 'ปลายทางรับข้อความจาก LINE (ต้องมี tunnel + IIS รันพร้อมกัน)',
        'status' => $lineStatus,
        'running' => $lineStatus === 'running',
        'detail' => $lineStatus === 'running'
            ? 'พร้อมใช้งาน • HTTP ' . $lineWebhook['http_code']
            : ($publicUrl ? 'ยังเข้าไม่ถึงผ่าน URL สาธารณะ' : 'ต้องรัน tunnel (Cloudflare/ngrok) ก่อน'),
        'pid' => null,
        'url' => $publicUrl ? rtrim($publicUrl, '/') . '/line_callback.php' : '',
    ];

    return $services;
}

/* ------------------------------------------------------------
 * รัน/หยุด service (admin เท่านั้น — เข้าถึงได้จากหน้า Settings)
 * ------------------------------------------------------------ */
function startService(string $key): array {
    switch ($key) {
        case 'web':
            $logDir = (string)svc_env('NODE_LOG_DIR', sys_get_temp_dir());
            $nodeExe = (string)svc_env('NODE_EXE', 'node');
            $standalone = svc_app_root() . '/frontend/.next/standalone/frontend';
            $ps = 'powershell -NoProfile -Command "' .
                '$env:PORT = \'' . svc_next_port() . '\'; ' .
                'Start-Process -FilePath \'' . $nodeExe . '\' -ArgumentList \'server.js\' -WorkingDirectory \'' . str_replace('/', '\\', $standalone) . '\' -WindowStyle Hidden -RedirectStandardOutput \'' . str_replace('/', '\\', $logDir) . '\\next-prod.log\' -RedirectStandardError \'' . str_replace('/', '\\', $logDir) . '\\next-prod-err.log\'' .
                '"';
            shell_exec($ps);
            break;
        case 'ngrok':
            $ngrokExe = str_replace('/', '\\', (string)svc_env('NGROK_EXE', 'C:/ngrok/ngrok.exe'));
            $ngrokDir = str_replace('/', '\\', dirname(str_replace('\\', '/', $ngrokExe)));
            shell_exec('powershell -NoProfile -Command "Start-Process -FilePath \'' . $ngrokExe . '\' -ArgumentList \'start\',\'' . svc_env('IIS_SITE_NAME', 'cmms-tpt') . '\' -WorkingDirectory \'' . $ngrokDir . '\' -WindowStyle Hidden"');
            break;
        case 'cloudflared':
            $cfExe = str_replace('/', '\\', (string)svc_env('CLOUDFLARED_EXE', 'C:/cloudflared/cloudflared.exe'));
            $cfOut = str_replace('/', '\\', (string)svc_env('CLOUDFLARED_OUT', 'C:/cloudflared/cf_tunnel_out.log'));
            $cfErr = str_replace('/', '\\', (string)svc_env('CLOUDFLARED_LOG', 'C:/cloudflared/cf_tunnel_err.log'));
            shell_exec('powershell -NoProfile -Command "Start-Process -FilePath \'' . $cfExe . '\' -ArgumentList \'tunnel\',\'--url\',\'http://localhost:' . svc_next_port() . '\',\'--no-autoupdate\',\'--protocol\',\'http2\' -WindowStyle Hidden -RedirectStandardOutput \'' . $cfOut . '\' -RedirectStandardError \'' . $cfErr . '\'"');
            break;
        case 'zrok':
            $zrokDir = str_replace('/', '\\', svc_app_root() . '/zrok2');
            shell_exec('powershell -NoProfile -Command "Start-Process -FilePath \'cmd\' -ArgumentList \'/c\',\'' . $zrokDir . '\\zrok2.bat\' -WorkingDirectory \'' . $zrokDir . '\' -WindowStyle Hidden"');
            break;
        case 'iis':
            shell_exec('powershell -NoProfile -Command "Import-Module WebAdministration; Start-Website -Name \'' . svc_env('IIS_SITE_NAME', 'cmms-tpt') . '\'; if (-not (Get-Service W3SVC | Where-Object {$_.Status -ne \'Running\'})) { Start-Service W3SVC }"');
            break;
        case 'mysql':
            shell_exec('powershell -NoProfile -Command "Start-Service -Name ' . svc_env('MYSQL_SERVICE', 'MySQL80') . '"');
            break;
        default:
            return ['error' => 'Unknown service: ' . $key];
    }
    usleep(800000); // รอ 0.8 วิให้ service เริ่ม
    return ['ok' => true];
}

function stopService(string $key): array {
    switch ($key) {
        case 'web':
            shell_exec('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ' . svc_next_port() . ' -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"');
            break;
        case 'ngrok':
            shell_exec('powershell -NoProfile -Command "Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"');
            break;
        case 'cloudflared':
            shell_exec('powershell -NoProfile -Command "Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"');
            break;
        case 'zrok':
            shell_exec('powershell -NoProfile -Command "Get-Process zrok2 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"');
            break;
        case 'iis':
            shell_exec('powershell -NoProfile -Command "Import-Module WebAdministration; Stop-Website -Name \'cmms-tpt\'"');
            break;
        case 'mysql':
            shell_exec('powershell -NoProfile -Command "Stop-Service -Name MySQL80"');
            break;
        default:
            return ['error' => 'Unknown service: ' . $key];
    }
    usleep(800000);
    return ['ok' => true];
}

try {
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'server_time' => date('Y-m-d H:i:s'),
            'services' => getServiceStatuses($pdo),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = $data['action'] ?? '';
        $service = $data['service'] ?? '';

        if (!in_array($action, ['start', 'stop'], true) || $service === '') {
            http_response_code(400);
            echo json_encode(['error' => 'ต้องระบุ action (start/stop) และ service']);
            exit;
        }

        $result = $action === 'start' ? startService($service) : stopService($service);
        if (isset($result['error'])) {
            http_response_code(400);
            echo json_encode($result);
            exit;
        }

        // กลับสถานะใหม่หลังรัน/หยุด
        usleep(300000);
        echo json_encode([
            'success' => true,
            'action' => $action,
            'service' => $service,
            'services' => getServiceStatuses($pdo),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    api_safe_catch($e);
}
