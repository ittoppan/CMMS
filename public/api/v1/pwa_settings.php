<?php
/**
 * CMMS-TPT PWA Settings API — ตั้งค่าไอคอน PWA
 *
 * GET  /api/v1/pwa_settings.php
 *   -> { success, icons: {192: {...}, 512: {...}}, sw: {frontend: "v7", php: "v4"} }
 *      (ข้อมูลไอคอนปัจจุบัน + cache version ของ Service Worker)
 *
 * POST /api/v1/pwa_settings.php   (multipart/form-data: icon=<file>)
 *   -> รับไฟล์ภาพ (PNG/JPEG/WebP) → GD resize เป็น 192x192 + 512x512 (cover center crop)
 *      → เขียนทับทั้ง PHP PWA (public/icons) และ Next PWA (frontend/public/icons)
 *      → bump SW cache version ทั้ง 2 ตัว (ให้ activate ล้าง cache เก่า + precache ไอคอนใหม่)
 *   -> { success, message, icons, sw }
 *
 * ต้องเป็น Admin (role_id = 1) เท่านั้น
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


define('CMMS_ROOT', dirname(__DIR__, 3)); // C:\inetpub\wwwroot\cmms-tpt

// ตำแหน่งไฟล์ไอคอนทั้ง 2 ชุด (PHP PWA + Next PWA)
const ICON_PATHS = [
    'php' => [
        '192' => CMMS_ROOT . '/public/icons/icon-192.png',
        '512' => CMMS_ROOT . '/public/icons/icon-512.png',
    ],
    'next' => [
        '192' => CMMS_ROOT . '/frontend/public/icons/icon-192.png',
        '512' => CMMS_ROOT . '/frontend/public/icons/icon-512.png',
    ],
];
const SW_PATHS = [
    'php'      => CMMS_ROOT . '/public/sw.js',
    'frontend' => CMMS_ROOT . '/frontend/public/sw.js',
];

function iconFileInfo(string $absPath): ?array {
    if (!is_file($absPath)) return null;
    $sz = @getimagesize($absPath);
    return [
        // Browser URL — ทั้ง PHP (public/icons) และ Next (frontend/public/icons)
        // serve ไอคอนที่ path เดียวกัน: /icons/<name>
        'path'   => '/icons/' . basename($absPath),
        'mtime'  => filemtime($absPath),
        'width'  => $sz ? $sz[0] : null,
        'height' => $sz ? $sz[1] : null,
        'bytes'  => filesize($absPath),
    ];
}

/** อ่าน cache version ล่าสุดจาก sw.js (cmms-tpt-*-vN) */
function swVersion(string $swAbsPath): string {
    if (!is_file($swAbsPath)) return '-';
    $src = @file_get_contents($swAbsPath);
    if ($src === false) return '-';
    if (preg_match_all('/-v(\d+)/', $src, $m)) {
        return 'v' . max(array_map('intval', $m[1]));
    }
    return 'v1';
}

/** bump ทุก -vN ใน sw.js ขึ้น 1 (บังคับให้ activate ล้าง cache เก่า) */
function bumpSwVersion(string $swAbsPath): bool {
    if (!is_file($swAbsPath)) return false;
    $src = @file_get_contents($swAbsPath);
    if ($src === false) return false;
    $new = preg_replace_callback('/-v(\d+)/', fn($m) => '-v' . ((int)$m[1] + 1), $src);
    if ($new === null || $new === $src) return false;
    return file_put_contents($swAbsPath, $new) !== false;
}

/** cover crop ตรงกลางเป็น square แล้ว resize — คง transparency ไว้ (PNG) */
function resizeSquare(string $srcAbsPath, int $size): ?string {
    $img = @imagecreatefromstring((string)file_get_contents($srcAbsPath));
    if (!$img) return null;
    $w = imagesx($img);
    $h = imagesy($img);
    $side = min($w, $h);
    $srcX = (int)(($w - $side) / 2);
    $srcY = (int)(($h - $side) / 2);

    $canvas = imagecreatetruecolor($size, $size);
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
    imagefill($canvas, 0, 0, $transparent);
    imagecopyresampled($canvas, $img, 0, 0, $srcX, $srcY, $size, $size, $side, $side);

    ob_start();
    $ok = imagepng($canvas, null, 9);
    $png = ob_get_clean();
    imagedestroy($img);
    imagedestroy($canvas);
    return $ok ? $png : null;
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            requireLogin($pdo, true);
            $icons = ['192' => null, '512' => null];
            foreach (['192', '512'] as $s) {
                // ข้อมูลเดียวกันทั้ง 2 ชุด (เขียนทับพร้อมกันตอน POST) — ใช้ PHP copy เป็นตัวแทน
                $info = iconFileInfo(ICON_PATHS['php'][$s]);
                if ($info) $icons[$s] = $info;
            }
            echo json_encode([
                'success' => true,
                'icons'   => $icons,
                'sw'      => [
                    'frontend' => swVersion(SW_PATHS['frontend']),
                    'php'      => swVersion(SW_PATHS['php']),
                ],
                'note' => 'POST ด้วย multipart/form-data field "icon" (PNG/JPEG/WebP) เพื่อเปลี่ยนไอคอน',
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            requireLogin($pdo, true);

            // ---- รับไฟล์: multipart ($_FILES['icon']) หรือ base64 JSON (icon_data) ----
            $tmpFile = null;
            if (!empty($_FILES['icon']['tmp_name']) && is_uploaded_file($_FILES['icon']['tmp_name'])) {
                $tmpFile = $_FILES['icon']['tmp_name'];
                $origName = $_FILES['icon']['name'] ?? 'icon';
            } else {
                $data = json_decode(file_get_contents('php://input'), true) ?? [];
                if (!empty($data['icon_data'])) {
                    $b64 = (string)$data['icon_data'];
                    if (str_contains($b64, 'base64,')) {
                        $b64 = substr($b64, strpos($b64, 'base64,') + 7);
                    }
                    $bin = base64_decode($b64, true);
                    if ($bin === false || $bin === '') {
                        http_response_code(400);
                        echo json_encode(['error' => 'icon_data เป็น base64 ที่ไม่ถูกต้อง']);
                        exit;
                    }
                    $tmpFile = tempnam(sys_get_temp_dir(), 'cmms_icon_');
                    file_put_contents($tmpFile, $bin);
                    $origName = 'icon-upload.png';
                }
            }
            if (!$tmpFile) {
                http_response_code(400);
                echo json_encode(['error' => 'ต้องส่งไฟล์ภาพใน field "icon" (multipart/form-data)']);
                exit;
            }

            // ---- ตรวจว่าเป็นภาพจริง (ป้องกันไฟล์ปลอม) ----
            $info = @getimagesize($tmpFile);
            $allowed = [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP];
            if (!$info || !in_array($info[2], $allowed, true)) {
                if (isset($_FILES['icon'])) { /* multipart: PHP จัดการ tmp ให้ */ } else { @unlink($tmpFile); }
                http_response_code(400);
                echo json_encode(['error' => 'ไฟล์ต้องเป็นภาพ PNG/JPEG/WebP เท่านั้น']);
                exit;
            }

            // ---- resize เป็น 192 + 512 (cover center crop, PNG) ----
            $out192 = resizeSquare($tmpFile, 192);
            $out512 = resizeSquare($tmpFile, 512);
            if (isset($_FILES['icon'])) { /* multipart tmp */ } else { @unlink($tmpFile); }
            if ($out192 === null || $out512 === null) {
                http_response_code(400);
                echo json_encode(['error' => 'แปลงภาพไม่สำเร็จ (GD resize ล้มเหลว)']);
                exit;
            }

            // ---- เขียนทับทั้ง 2 ชุด PWA ----
            $written = [];
            foreach (['php', 'next'] as $app) {
                foreach (['192' => $out192, '512' => $out512] as $s => $png) {
                    $abs = ICON_PATHS[$app][$s];
                    if (@file_put_contents($abs, $png) !== false) {
                        $written[] = str_replace('\\', '/', substr($abs, strlen(CMMS_ROOT)));
                    }
                }
            }
            if (count($written) < 4) {
                http_response_code(500);
                echo json_encode(['error' => 'เขียนไฟล์ไอคอนไม่ครบ 4 ตำแหน่ง', 'written' => $written]);
                exit;
            }

            // ---- bump SW cache version ทั้ง 2 ตัว (ล้าง cache เก่า + precache ใหม่) ----
            $swBumped = [];
            foreach (['frontend', 'php'] as $app) {
                if (bumpSwVersion(SW_PATHS[$app])) {
                    $swBumped[$app] = swVersion(SW_PATHS[$app]);
                }
            }

            echo json_encode([
                'success' => true,
                'message' => 'เปลี่ยนไอคอน PWA สำเร็จ (192px + 512px) — SW cache bumped แล้ว รีเฟรชหน้าเพื่อให้เห็นผล',
                'icons'   => [
                    '192' => iconFileInfo(ICON_PATHS['php']['192']),
                    '512' => iconFileInfo(ICON_PATHS['php']['512']),
                ],
                'sw'      => [
                    'frontend' => $swBumped['frontend'] ?? swVersion(SW_PATHS['frontend']),
                    'php'      => $swBumped['php'] ?? swVersion(SW_PATHS['php']),
                ],
            ], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
