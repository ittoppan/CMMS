<?php
/**
 * spare_image.php — รูปอะไหล่ (จริง หรือ placeholder อัตโนมัติ)
 *
 * อะไหล่ 1759 ตัวมีรูปจริงแค่ตัวเดียว — endpoint นี้การันตีว่าทุกตัวมีรูปเสมอ:
 *   - ?id=X          → ถ้ามี image_url จริง → serve ไฟล์นั้น / redirect ถ้าเป็น URL เต็ม
 *                      ถ้าไม่มี → สร้าง PNG placeholder (รหัสอะไหล่บนพื้นสีตาม code hash)
 *   - ?code=X&name=Y → สร้าง placeholder ตรงๆ (ไม่มี id เช่น จากหน้าอื่น)
 *
 * ใช้ร่วมกับ LINE Flex (การ์ดขอเบิก) — URL ผ่าน publicBaseUrl() จึงเป็น HTTPS
 * ที่ LINE เข้าถึงได้ + cache ถาวรที่ uploads/spares/placeholders/spare_<id>.png
 * (LINE cache รูปตาม URL — รูปคงที่ต่ออะไหล่ เปลี่ยนเองเมื่อมีรูปจริง)
 */

require_once __DIR__ . '/../../../src/config/db.php';

$id = (int)($_GET['id'] ?? 0);
$code = trim((string)($_GET['code'] ?? ''));
$name = trim((string)($_GET['name'] ?? ''));

/* ---------- 1) มี id → ตรวจ DB: รูปจริง / code / name ---------- */
if ($id > 0) {
    try {
        $pdo = getDb();
        $s = $pdo->prepare('SELECT code, name, image_url FROM spare_parts WHERE id = ?');
        $s->execute([$id]);
        $row = $s->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            if ($code === '') $code = trim((string)($row['code'] ?? ''));
            if ($name === '') $name = trim((string)($row['name'] ?? ''));
            $img = trim((string)($row['image_url'] ?? ''));
            if ($img !== '') {
                if (preg_match('#^https?://#i', $img)) {
                    header('Location: ' . $img, true, 302);
                    exit;
                }
                // path relative (uploads/...) → serve ไฟล์ตรง (LINE ตาม redirect ไม่ต้องพึ่ง)
                $file = __DIR__ . '/../../' . ltrim($img, '/');
                if (is_file($file)) {
                    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
                    $mime = [
                        'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
                        'gif' => 'image/gif', 'webp' => 'image/webp',
                    ];
                    header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
                    header('Cache-Control: public, max-age=86400');
                    readfile($file);
                    exit;
                }
                // ไฟล์หาย → ปล่อยให้สร้าง placeholder แทน
            }
        }
    } catch (Exception $e) {
        /* DB ไม่พร้อม — สร้าง placeholder ด้วย code ที่ส่งมา */
    }
}

/* ---------- 2) cache placeholder ถ้ามี id ---------- */
$cacheDir = __DIR__ . '/../../uploads/spares/placeholders';
$cacheFile = $id > 0 ? $cacheDir . '/spare_' . $id . '.png' : '';
if ($cacheFile !== '' && is_file($cacheFile)) {
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=86400');
    header('Content-Length: ' . filesize($cacheFile));
    readfile($cacheFile);
    exit;
}

/* ---------- 3) สร้าง PNG placeholder 480x480 ด้วย GD ---------- */
if (!extension_loaded('gd') || !function_exists('imagecreatetruecolor')) {
    http_response_code(404);
    exit;
}

$W = 480;
$H = 480;
$palette = [
    [[219, 234, 254], [30, 64, 175]],   // blue
    [[220, 252, 231], [22, 101, 52]],   // green
    [[254, 243, 199], [146, 64, 14]],   // amber
    [[255, 228, 230], [159, 18, 57]],   // rose
    [[243, 232, 255], [107, 33, 168]],  // purple
    [[254, 226, 226], [185, 28, 28]],   // red
    [[224, 242, 254], [12, 74, 110]],   // sky
];
$seed = abs(crc32($code !== '' ? $code : 'spare-' . $id));
$c = $palette[$seed % count($palette)];

$img = imagecreatetruecolor($W, $H);
$bg = imagecolorallocate($img, $c[0][0], $c[0][1], $c[0][2]);
$fg = imagecolorallocate($img, $c[1][0], $c[1][1], $c[1][2]);
imagefilledrectangle($img, 0, 0, $W, $H, $bg);

// กล่องกลางสีขาว + ขอบสีเข้ม
$white = imagecolorallocate($img, 255, 255, 255);
imagefilledrectangle($img, 80, 90, 400, 390, $white);
imagesetthickness($img, 4);
imagerectangle($img, 80, 90, 400, 390, $fg);

// ฟอนต์: พยายาม TTF (Windows/Linux) → fallback builtin
$fontBold = '';
$fontReg = '';
foreach (['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] as $f) {
    if (is_file($f)) { $fontBold = $f; break; }
}
foreach (['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] as $f) {
    if (is_file($f)) { $fontReg = $f; break; }
}

$useTtf = ($fontBold !== '' || $fontReg !== '');
$hasCode = ($code !== '');
$codeText = $hasCode ? $code : 'SPARE PART';

// ป้าย "SPARE PART" เล็กด้านบนกล่อง
$label = 'SPARE PART';
if ($useTtf && $fontReg !== '') {
    $lb = imagettfbbox(20, 0, $fontReg, $label);
    imagettftext($img, 20, 0, intdiv($W - ($lb[2] - $lb[0]), 2), 130, $fg, $fontReg, $label);
} else {
    imagestring($img, 3, intdiv($W - strlen($label) * 8, 2), 118, $label, $fg);
}

// code ใหญ่กลาง
if ($useTtf && $fontBold !== '') {
    $size = strlen($codeText) > 16 ? 40 : 52;
    $cb = imagettfbbox($size, 0, $fontBold, $codeText);
    $y = 250;
    imagettftext($img, $size, 0, intdiv($W - ($cb[2] - $cb[0]), 2), $y, $fg, $fontBold, $codeText);
} else {
    $y = 240;
    imagestring($img, 5, intdiv($W - strlen($codeText) * 9, 2), $y, $codeText, $fg);
}

// ชื่อ (wrap 2-3 บรรทัด)
if ($name !== '') {
    $lineMax = 26; // ตัวอักษรต่อบรรทัด
    $words = preg_split('/\s+/u', $name);
    $lines = [];
    $cur = '';
    foreach ($words as $w) {
        $try = $cur === '' ? $w : $cur . ' ' . $w;
        if (mb_strlen($try) <= $lineMax || $cur === '') {
            $cur = $try;
        } else {
            $lines[] = $cur;
            $cur = $w;
        }
    }
    if ($cur !== '') $lines[] = $cur;
    $lines = array_slice($lines, 0, 3);

    $startY = 300;
    if ($useTtf && $fontReg !== '') {
        foreach ($lines as $i => $ln) {
            $bb = imagettfbbox(24, 0, $fontReg, $ln);
            imagettftext($img, 24, 0, intdiv($W - ($bb[2] - $bb[0]), 2), $startY + $i * 36, $fg, $fontReg, $ln);
        }
    } else {
        foreach ($lines as $i => $ln) {
            imagestring($img, 3, intdiv($W - strlen($ln) * 8, 2), $startY + $i * 18, $ln, $fg);
        }
    }
}

/* ---------- 4) cache + serve ---------- */
if ($cacheFile !== '') {
    try {
        if (!is_dir($cacheDir)) mkdir($cacheDir, 0777, true);
        imagepng($img, $cacheFile);
    } catch (Exception $e) {
        /* cache ไม่ได้ — ยัง serve ได้ */
    }
}
header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
imagepng($img);
imagedestroy($img);
