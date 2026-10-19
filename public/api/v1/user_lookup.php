<?php
/**
 * GET /api/v1/user_lookup.php?employee_code=E01117
 * Public minimal lookup สำหรับหน้า register (ผูกบัญชี LINE):
 * คืนเฉพาะข้อมูลน้อยที่สุดที่จำเป็นเพื่อยืนยันตัวตน — ไม่มี email/phone/role/permission
 * รูป: avatar_path จาก users ก่อน, ไม่มี → fallback ไฟล์ชื่อรหัสใน /uploads/avatars/{code}.{jpg|png|webp}
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
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
    $stmt = $pdo->prepare("SELECT u.employee_code, u.full_name, u.position, u.avatar_path, d.name AS department
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
    } else {
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
