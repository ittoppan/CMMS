<?php
/**
 * GET /api/v1/user_lookup.php?employee_code=E01117
 * Public minimal lookup สำหรับหน้า register (ผูกบัญชี LINE):
 * คืนเฉพาะข้อมูลน้อยที่สุดที่จำเป็นเพื่อยืนยันตัวตน — ไม่มี email/phone/role/permission
 * รูป: avatar_path จาก users ก่อน, ไม่มี → fallback ไฟล์ชื่อรหัสใน /uploads/avatars/{code}.{jpg|png|webp}
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
    http_response_code(405);
    echo json_encode(['error' => 'GET only']);
    exit;
}

$code = strtoupper(trim((string)($_GET['employee_code'] ?? '')));
if (!preg_match('/^[A-Z0-9]{3,10}$/', $code)) {
    http_response_code(422);
    echo json_encode(['error' => 'รูปแบบรหัสพนักงานไม่ถูกต้อง']);
    exit;
}

try {
    $pdo = getDb();
    // Rate limit (endpoint นี้ public — กัน enumeration ชื่อพนักงาน): 30 ครั้ง/IP/นาที, 10 ครั้ง/รหัส/นาที
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    foreach ([['user_lookup_ip:' . $ip, 30], ['user_lookup_code:' . $code, 10]] as [$scope, $limit]) {
        $rl = iot_rate_check($pdo, $scope, $limit);
        if (empty($rl['ok']) && ($rl['error'] ?? '') === 'RATE_LIMITED') {
            http_response_code(429);
            echo json_encode(['error' => 'rate_limited']);
            exit;
        }
    }
    header('Cache-Control: no-store, max-age=0'); // ข้อมูลส่วนบุคคล — ห้าม cache ที่ shared proxy
    $stmt = $pdo->prepare("SELECT u.id, u.employee_code, u.full_name, u.position, u.avatar_path, u.avatar, d.name AS department
                            FROM users u LEFT JOIN departments d ON d.id = u.department_id
                            WHERE u.employee_code = ? AND u.is_active = 1 LIMIT 1");
    $stmt->execute([$code]);
    $u = $stmt->fetch();
    if (!$u) { http_response_code(404); echo json_encode(['error' => 'not_found']); exit; }

    $photo = null;
    $uploadsBase = __DIR__ . '/../..';
    if (!empty($u['avatar_path']) && preg_match('#^/uploads/avatars/[A-Za-z0-9_.-]+$#', $u['avatar_path'])
        && is_file($uploadsBase . $u['avatar_path'])) {
        $photo = $u['avatar_path'];
    } elseif (!empty($u['avatar']) && preg_match('#^data:image/(jpeg|png|webp);base64,#', (string)$u['avatar'], $m)) {
        // รูปถูกเซฟเป็น base64 ใน users.avatar (หน้า profile) — materialize เป็นไฟล์ครั้งเดียว
        // จากนั้น avatar_path ครอบครองทุก feature ที่อ่าน path และลดขนาด DB
        $bin = base64_decode(substr((string)$u['avatar'], strpos((string)$u['avatar'], ',') + 1), true);
        if ($bin !== false && strlen($bin) > 100) {
            $rel = '/uploads/avatars/avatar_u' . (int)$u['id'] . '_' . bin2hex(random_bytes(4))
                 . '.' . ($m[1] === 'jpeg' ? 'jpg' : $m[1]);
            if (@file_put_contents($uploadsBase . $rel, $bin) !== false) {
                $upd = $pdo->prepare("UPDATE users SET avatar_path = ?, avatar = NULL WHERE id = ? AND (avatar_path IS NULL OR avatar_path = '')");
                $upd->execute([$rel, (int)$u['id']]);
                if ($upd->rowCount() > 0) {
                    $photo = $rel;
                } else {
                    // มี process อื่นแปลงไปแล้ว — อ่านค่าล่าสุด
                    $fresh = $pdo->prepare("SELECT avatar_path FROM users WHERE id = ?");
                    $fresh->execute([(int)$u['id']]);
                    $p = (string)$fresh->fetchColumn();
                    if ($p !== '' && is_file($uploadsBase . $p)) $photo = $p;
                    else @unlink($uploadsBase . $rel);
                }
            }
        }
    }
    if (!$photo) {
        foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
            $rel = '/uploads/avatars/' . $code . '.' . $ext;
            if (is_file($uploadsBase . $rel)) { $photo = $rel; break; }
        }
    }

    echo json_encode([
        'full_name' => $u['full_name'],
        'employee_code' => $u['employee_code'],
        'position' => $u['position'] ?? null,
        'department' => $u['department'] ?? null,
        'avatar_path' => $photo,
    ]);
} catch (Throwable $e) {
    error_log('user_lookup error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'internal']);
}
