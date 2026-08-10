<?php
/**
 * CLI: สร้าง Rich Menu 2 ปุ่ม สำหรับ LINE Official Account
 *   ซ้าย: แจ้งซ่อมเครื่องจักร -> LIFF ฟอร์ม CMMS ใหม่ (/repair-request)
 *   ขวา: แจ้งซ่อม IT        -> LIFF ฟอร์ม IT เดิม
 *
 * วิธีรัน:
 *   php scripts/line_rich_menu.php
 *
 * ต้องการ:
 *   - .env: LINE_CHANNEL_ACCESS_TOKEN (Messaging API)
 */
require_once __DIR__ . '/../src/config/db.php'; // auto-load .env

$token = getenv('LINE_CHANNEL_ACCESS_TOKEN');
if (empty($token)) {
    fwrite(STDERR, "ERROR: LINE_CHANNEL_ACCESS_TOKEN ไม่พบใน .env\n");
    exit(1);
}

$apiBase = 'https://api.line.me/v2/bot/richmenu';
$uploadBase = 'https://api-data.line.me/v2/bot/richmenu';
$imagePath = __DIR__ . '/richmenu.png';
if (!file_exists($imagePath)) {
    fwrite(STDERR, "ERROR: ไม่พบภาพ $imagePath (สร้างก่อนด้วย PowerShell)\n");
    exit(1);
}

function lineApi(string $url, string $method, array $headers, string $body): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $resp = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$http, $resp];
}

$appUrl = 'https://ommatophorous-robert-fortifyingly.ngrok-free.app/repair-request';
$itUrl  = 'https://liff.line.me/2007374280-3ILSyHug';

$menu = [
    'size' => ['width' => 2500, 'height' => 843],
    'selected' => true,
    'name' => 'CMMS-Repair-Menu',
    'chatBarText' => 'แจ้งซ่อม',
    'areas' => [
        [
            'bounds' => ['x' => 0, 'y' => 0, 'width' => 1250, 'height' => 843],
            'action' => ['type' => 'uri', 'label' => 'แจ้งซ่อมเครื่องจักร', 'uri' => $appUrl],
        ],
        [
            'bounds' => ['x' => 1250, 'y' => 0, 'width' => 1250, 'height' => 843],
            'action' => ['type' => 'uri', 'label' => 'แจ้งซ่อม IT', 'uri' => $itUrl],
        ],
    ],
];

$auth = ['Content-Type: application/json', 'Authorization: Bearer ' . $token];

// 1) ลบ rich menu เก่าชื่อเดียวกัน (ถ้ามี)
[$http, $resp] = lineApi($apiBase . '/list', 'GET', $auth, '');
if ($http === 200) {
    $list = json_decode($resp, true)['richmenus'] ?? [];
    foreach ($list as $rm) {
        if (($rm['name'] ?? '') === 'CMMS-Repair-Menu') {
            lineApi($apiBase . '/' . $rm['richMenuId'], 'DELETE', $auth, '');
            echo "ลบ rich menu เดิม: {$rm['richMenuId']}\n";
        }
    }
}

// 2) สร้าง rich menu ใหม่
[$http, $resp] = lineApi($apiBase, 'POST', $auth, json_encode($menu, JSON_UNESCAPED_UNICODE));
if ($http !== 200) {
    fwrite(STDERR, "ERROR สร้าง rich menu: HTTP $http — $resp\n");
    exit(1);
}
$richMenuId = json_decode($resp, true)['richMenuId'] ?? '';
if (!$richMenuId) { fwrite(STDERR, "ERROR: ไม่มี richMenuId ใน response — $resp\n"); exit(1); }
echo "สร้าง rich menu: $richMenuId\n";

// 3) อัปโหลดภาพ
$img = file_get_contents($imagePath);
[$http, $resp] = lineApi("$uploadBase/$richMenuId/content", 'POST',
    ['Content-Type: image/png', 'Authorization: Bearer ' . $token], $img);
if ($http !== 200) {
    fwrite(STDERR, "ERROR อัปโหลดภาพ: HTTP $http — $resp\n");
    exit(1);
}
echo "อัปโหลดภาพสำเร็จ\n";

// 4) ตั้งเป็น default (ถ้ายังไม่ได้เป็น default อยู่แล้ว)
$alreadyDefault = false;
[$http, $resp] = lineApi($apiBase . '/list', 'GET', $auth, '');
if ($http === 200) {
    foreach (json_decode($resp, true)['richmenus'] ?? [] as $rm) {
        if (($rm['richMenuId'] ?? '') === $richMenuId && !empty($rm['selected'])) {
            $alreadyDefault = true;
            break;
        }
    }
}
if ($alreadyDefault) {
    echo "Rich menu ถูกตั้งเป็น default อยู่แล้ว ✅\n";
} else {
    [$http, $resp] = lineApi($apiBase . '/' . $richMenuId . '/default', 'POST', $auth, '');
    if ($http !== 200) {
        fwrite(STDERR, "ERROR ตั้ง default: HTTP $http — $resp\n");
        exit(1);
    }
    echo "ตั้งเป็น rich menu เริ่มต้นเรียบร้อย ✅\n";
}
