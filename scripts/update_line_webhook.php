<?php
/**
 * update_line_webhook.php — ตั้ง Webhook URL ของ LINE Messaging API อัตโนมัติ
 *
 * อ่าน public URL ปัจจุบันจาก logs/tunnel-url.txt (เขียนโดย tunnel-quick.ps1)
 * แล้ว PUT endpoint ไปยัง LINE API ถ้า URL เปลี่ยนจากครั้งก่อน
 * (trycloudflare เปลี่ยน subdomain ทุกครั้งที่ restart tunnel)
 *
 * รันโดย: scripts/watchdog.ps1 ทุกเช็ค (รอบละ 1 นาที) — ทำงานเท่านั้นเมื่อ URL เปลี่ยน
 *
 * exit 0 = ไม่ต้องเปลี่ยน / เปลี่ยนสำเร็จ, exit 1 = ล้มเหลว (แจ้ง LINE แล้ว)
 *
 * LINE API: PUT https://api.line.me/v2/bot/channel/webhook/endpoint
 */
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/notification.php';

$root = __DIR__ . '/..';
$urlFile = $root . '/logs/tunnel-url.txt';

function lineToken(): string {
    try {
        $t = getDb()->query("SELECT setting_value FROM settings WHERE setting_key = 'line_channel_access_token'")->fetchColumn();
        return $t ?: (getenv('LINE_CHANNEL_ACCESS_TOKEN') ?: '');
    } catch (Exception $e) { return getenv('LINE_CHANNEL_ACCESS_TOKEN') ?: ''; }
}

// 1. อ่าน URL ปัจจุบันจาก tunnel-url.txt (ถ้าไม่มี -> ลอง cloudflared.log)
$publicUrl = '';
if (is_file($urlFile)) {
    $raw = trim((string)file_get_contents($urlFile));
    $first = preg_split('/\s+/', $raw)[0] ?? '';
    if (preg_match('#^https://[a-z0-9.-]+\.trycloudflare\.com/?$#', $first)) {
        $publicUrl = rtrim($first, '/');
    }
}
if ($publicUrl === '' && is_file($root . '/logs/cloudflared.log')) {
    $log = (string)@file_get_contents($root . '/logs/cloudflared.log');
    if (preg_match_all('#https://[a-z0-9-]+\.trycloudflare\.com#', $log, $mm)) {
        $publicUrl = rtrim(end($mm[0]), '/');
    }
}
if ($publicUrl === '') {
    // ไม่มี tunnel URL -> ยังไม่ทำอะไร (ระบบใช้ web local อยู่)
    exit(0);
}

// ตรวจว่า URL ยัง alive ก่อนตั้ง (กันตั้ง webhook ชี้ URL ตาย)
$alive = false;
$ch = curl_init($publicUrl . '/login');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['ngrok-skip-browser-warning: 1']);
curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$alive = in_array($code, [200, 301, 302], true);
if (!$alive) {
    error_log("[line_webhook] tunnel URL ไม่ alive ($publicUrl -> HTTP $code) ข้ามการตั้ง webhook");
    exit(1);
}

$endpoint = $publicUrl . '/api/v1/line_webhook.php';

try {
    $pdo = getDb();
    $stored = (string)$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_webhook_url'")->fetchColumn();
    if ($stored === $endpoint) {
        exit(0); // URL เดิม — ไม่ต้องเปลี่ยน
    }

    $token = lineToken();
    if ($token === '') {
        error_log("[line_webhook] no channel access token");
        exit(1);
    }

    // 2. PUT endpoint ไป LINE API
    $ch = curl_init('https://api.line.me/v2/bot/channel/webhook/endpoint');
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['endpoint' => $endpoint]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $token,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $resp = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($http !== 200) {
        // แจ้งเตือนว่าไม่สามารถอัปเดต webhook ได้
        try {
            sendLinePushMessage(getDb()->query("SELECT line_user_id FROM users WHERE id = 1")->fetchColumn() ?: '', "⚠️ ตั้ง Webhook LINE ไม่สำเร็จ (HTTP $http)", "ระบบเปลี่ยน tunnel URL เป็น:\n$endpoint\nแต่ LINE API ปฏิเสธ — ตรวจ Channel Access Token / ไปตั้งเองที่ LINE Developer Console\n\nResponse: " . mb_substr((string)$resp, 0, 300));
        } catch (Exception $e) {}
        error_log("[line_webhook] set endpoint failed HTTP $http: $resp");
        echo "FAIL HTTP $http\n";
        exit(1);
    }

    // 3. บันทึก URL ใหม่ลง settings
    $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES ('line_webhook_url', ?, 'notification', 'Webhook URL LINE ล่าสุด (อัปเดตอัตโนมัติตาม tunnel)') ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
        ->execute([$endpoint]);

    // 4. แจ้งเตือน LINE ว่าอัปเดต webhook แล้ว
    $msg = "✅ LINE Webhook อัปเดตอัตโนมัติ\n\nURL ใหม่:\n$endpoint\n\nตอนนี้บอท LINE ตอบคำถามผ่าน URL นี้แล้ว";
    $notified = false;
    try {
        $uids = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($uids as $uid) {
            if (sendLinePushMessage((string)$uid, '🔗 LINE Webhook อัปเดตแล้ว', $msg)) $notified = true;
        }
    } catch (Exception $e) {}

    echo "updated: $endpoint" . ($notified ? ' (notified)' : '') . "\n";
    exit(0);
} catch (Exception $e) {
    error_log("[line_webhook] " . $e->getMessage());
    echo "ERROR " . $e->getMessage() . "\n";
    exit(1);
}
