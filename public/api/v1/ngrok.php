<?php
/**
 * API ngrok control - start/stop/status ของ tunnel cmms-tpt (static domain)
 * GET  -> status: รันอยู่ไหม, public URL, reachable check
 * POST { action: start | stop }
 */
session_start();
require_once __DIR__ . '/../../../src/config/db.php';

header('Content-Type: application/json; charset=utf-8');

// --- auth: ต้อง login แล้ว ---
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

const NGROK_EXE   = 'C:\ngrok\ngrok.exe';
const TUNNEL_NAME = 'cmms-tpt';
const STATIC_URL  = 'https://ommatophorous-robert-fortifyingly.ngrok-free.app';
const API_PORT    = '4040';

function is_ngrok_running(): bool {
    // 1) process ยังมี?
    $out = [];
    exec('tasklist /FI "IMAGENAME eq ngrok.exe" /FO CSV /NH 2>NUL', $out);
    $proc = array_filter($out, function ($l) { return stripos($l, 'ngrok.exe') !== false; });
    if (empty($proc)) return false;
    // 2) local API ตอบไหม
    $ch = @curl_init('http://127.0.0.1:' . API_PORT . '/api/tunnels');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3, CURLOPT_CONNECTTIMEOUT => 2]);
    $body = @curl_exec($ch);
    curl_close($ch);
    return is_string($body) && stripos($body, 'public_url') !== false;
}

function get_tunnel_url(): ?string {
    $ch = @curl_init('http://127.0.0.1:' . API_PORT . '/api/tunnels');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3, CURLOPT_CONNECTTIMEOUT => 2]);
    $body = @curl_exec($ch);
    curl_close($ch);
    if (!$body) return null;
    $j = json_decode($body, true);
    foreach (($j['tunnels'] ?? []) as $t) {
        if (isset($t['public_url']) && strpos($t['public_url'], 'ngrok-free.app') !== false) {
            return $t['public_url'];
        }
    }
    return null;
}

function check_reachable(string $url): bool {
    $ch = @curl_init($url . '/line_callback.php');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => ['ngrok-skip-browser-warning: 1'],
    ]);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $body = @curl_exec($ch);
    curl_close($ch);
    return $code > 0 && $code < 500; // 200/302/404 = server ตอบกลับแล้ว
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $running = is_ngrok_running();
    $url = $running ? (get_tunnel_url() ?: STATIC_URL) : null;
    echo json_encode([
        'running'      => $running,
        'url'          => $url,
        'static_url'   => STATIC_URL,
        'tunnel_name'  => TUNNEL_NAME,
        'reachable'    => $url ? check_reachable($url) : null,
        'exe'          => is_file(NGROK_EXE) ? NGROK_EXE : null,
    ]);
    exit;
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $data['action'] ?? '';

    if ($action === 'start') {
        if (is_ngrok_running()) {
            echo json_encode(['success' => true, 'message' => 'ngrok กำลังรันอยู่แล้ว', 'url' => get_tunnel_url() ?: STATIC_URL]);
            exit;
        }
        if (!is_file(NGROK_EXE)) {
            http_response_code(500);
            echo json_encode(['error' => 'ไม่พบ ngrok.exe ที่ ' . NGROK_EXE]);
            exit;
        }
        // เปิดแบบ background (detach) - ใช้ cmd start เพื่อไม่ค้าง process
        $cmd = 'cmd /C start "" /B "' . NGROK_EXE . '" start ' . TUNNEL_NAME . ' >NUL 2>&1';
        exec($cmd, $o, $rc);
        // รอ 4 วิ ให้ tunnel ขึ้น
        sleep(4);
        $running = is_ngrok_running();
        $url = get_tunnel_url();
        echo json_encode([
            'success' => $running,
            'url'     => $running ? ($url ?: STATIC_URL) : null,
            'static_url' => STATIC_URL,
            'message' => $running ? 'ngrok เปิดแล้ว: ' . ($url ?: STATIC_URL) : 'เริ่ม ngrok ไม่สำเร็จ (rc=' . $rc . ') ลองเปิดด้วยตัวเอง',
        ]);
        exit;
    }

    if ($action === 'stop') {
        exec('taskkill /IM ngrok.exe /F 2>NUL', $o, $rc);
        sleep(2);
        $running = is_ngrok_running();
        echo json_encode(['success' => !$running, 'message' => $running ? 'ยังปิดไม่สำเร็จ' : 'ปิด ngrok แล้ว']);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'action ต้องเป็น start | stop']);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
