<?php
/**
 * CLI: สร้าง Rich Menu 2 ปุ่ม สำหรับ LINE Official Account
 *   ซ้าย: ติดตั้งแอป CMMS -> {APP_URL}/install?src=line
 *   ขวา: แจ้งซ่อม IT     -> LIFF ฟอร์ม IT เดิม
 *
 * วิธีรัน:
 *   php scripts/line_rich_menu.php                          # ใช้ APP_URL จาก env/settings
 *   php scripts/line_rich_menu.php https://cmms.toppan.local # ระบุ origin เอง (ทดสอบก่อนตั้ง .env)
 *   php scripts/line_rich_menu.php --dry-run                # พิมพ์ payload แล้วจบ (ไม่เรียก LINE API)
 *
 * ต้องการ:
 *   - APP_URL (env) หรือ settings.app_url — **ห้าม hardcode URL ในไฟล์นี้**
 *   - LINE_CHANNEL_ACCESS_TOKEN (env) หรือ settings.line_channel_access_token
 *   - ภาพ scripts/richmenu.png (2500x843)
 *
 * หมายเหตุ: ภาพต้องวาดใหม่ให้ตรงกับปุ่ม (ซ้าย = ติดตั้งแอป) ก่อนใช้งานจริง
 */
require_once __DIR__ . '/../src/config/db.php'; // auto-load .env

// ── helpers ──────────────────────────────────────────────────────────────

function linePhpSetting(PDO $pdo, string $key): string {
    try {
        $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
        $st->execute([$key]);
        return trim((string)($st->fetchColumn() ?: ''));
    } catch (Throwable $e) {
        return '';
    }
}

/** env มาก่อน แล้วค่อย settings (ค่าลับ/ค่าที่เปลี่ยนตามที่ติดตั้ง ไม่ควรอยู่ในโค้ด) */
function linePhpConfig(PDO $pdo, string $envKey, string $settingKey): string {
    $v = trim((string)getenv($envKey));
    return $v !== '' ? $v : linePhpSetting($pdo, $settingKey);
}

/**
 * ฐาน URL ของแอป (ไม่มี trailing slash) — จาก APP_URL เท่านั้น
 * URL ที่ฝังตายตัวทำให้ PWA/ลิงก์ตายเมื่อที่อยู่เปลี่ยน (บทเรียนจาก tunnel ngrok)
 */
function linePhpAppBaseUrl(PDO $pdo, string $override = ''): string {
    $raw = $override !== '' ? $override : linePhpConfig($pdo, 'APP_URL', 'app_url');
    if ($raw === '') {
        fwrite(STDERR, "ERROR: ไม่พบ APP_URL — ตั้งใน .env เช่น APP_URL=https://cmms.toppan.local\n");
        fwrite(STDERR, "       (หรือใส่เป็น argument: php scripts/line_rich_menu.php https://cmms.toppan.local)\n");
        exit(1);
    }
    $raw = rtrim($raw, '/');
    $parts = parse_url($raw);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || empty($parts['host'])) {
        fwrite(STDERR, "ERROR: APP_URL ไม่ใช่ URL ที่ถูกต้อง: $raw\n");
        exit(1);
    }
    if ($scheme !== 'https') {
        fwrite(STDERR, "WARNING: APP_URL ยังเป็น http — PWA จะติดตั้งไม่ได้และ LINE จะเตือนว่าไม่ปลอดภัย\n");
    }
    if (preg_match('/(ngrok|zrok|trycloudflare|localtunnel)/i', (string)$parts['host'])) {
        fwrite(STDERR, "WARNING: APP_URL ชี้ไป tunnel ชั่วคราว ({$parts['host']}) — PWA ที่ติดตั้งจะเปิดไม่ขึ้นเมื่อ URL เปลี่ยน\n");
    }
    return $raw;
}

// ── config ───────────────────────────────────────────────────────────────

$args = array_slice($argv, 1);
$dryRun = in_array('--dry-run', $args, true);
$originArg = '';
foreach ($args as $a) {
    if ($a !== '' && !str_starts_with($a, '--')) { $originArg = $a; break; }
}

$pdo = getDb();
$token = linePhpConfig($pdo, 'LINE_CHANNEL_ACCESS_TOKEN', 'line_channel_access_token');
if ($token === '') {
    fwrite(STDERR, "ERROR: LINE_CHANNEL_ACCESS_TOKEN ไม่พบ (env หรือ settings)\n");
    exit(1);
}

$imagePath = __DIR__ . '/richmenu.png';
if (!file_exists($imagePath) && !$dryRun) {
    fwrite(STDERR, "ERROR: ไม่พบภาพ $imagePath (สร้างก่อนด้วย PowerShell)\n");
    exit(1);
}

$appUrl = linePhpAppBaseUrl($pdo, $originArg);
$installUrl = $appUrl . '/install?src=line';
// ช่องทางของระบบ IT (LIFF คนละตัวกับ CMMS) — อ่านจาก settings ก่อน ถ้าไม่มีใช้ค่าที่ลงทะเบียนไว้
$itLiffId = linePhpConfig($pdo, 'LINE_IT_LIFF_ID', 'line_it_liff_id') ?: '2007374280-3ILSyHug';
$itUrl = 'https://liff.line.me/' . $itLiffId;

$menu = [
    'size' => ['width' => 2500, 'height' => 843],
    'selected' => true,
    'name' => 'CMMS-Repair-Menu', // ต้องคงชื่อเดิมไว้ ไม่งั้นสคริปต์จะลบตัวเก่าไม่เจอ → rich menu ซ้ำ
    'chatBarText' => 'CMMS-TOPPAN',
    'areas' => [
        [
            'bounds' => ['x' => 0, 'y' => 0, 'width' => 1250, 'height' => 843],
            'action' => ['type' => 'uri', 'label' => 'ติดตั้งแอป CMMS', 'uri' => $installUrl],
        ],
        [
            'bounds' => ['x' => 1250, 'y' => 0, 'width' => 1250, 'height' => 843],
            'action' => ['type' => 'uri', 'label' => 'แจ้งซ่อม IT', 'uri' => $itUrl],
        ],
    ],
];

echo "APP_URL:     $appUrl\n";
echo "ปุ่มติดตั้ง:   $installUrl\n";
echo "ปุ่มแจ้งซ่อม IT: $itUrl\n";

if ($dryRun) {
    echo "\n[dry-run] payload ที่จะส่งไป LINE:\n";
    echo json_encode($menu, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    echo "\n[dry-run] ไม่ได้เรียก LINE API — ภาพ richmenu.png ต้องวาดใหม่ให้ตรงกับปุ่มก่อนรันจริง\n";
    exit(0);
}

$apiBase = 'https://api.line.me/v2/bot/richmenu';
$uploadBase = 'https://api-data.line.me/v2/bot/richmenu';

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

$auth = ['Content-Type: application/json', 'Authorization: Bearer ' . $token];

// 1) ลบ rich menu เก่าชื่อเดียวกัน (ถ้ามี)
[$http, $resp] = lineApi($apiBase . '/list', 'GET', $auth, '');
if ($http === 200) {
    $list = json_decode($resp, true)['richmenus'] ?? [];
    foreach ($list as $rm) {
        if (($rm['name'] ?? '') === $menu['name']) {
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
