<?php
/**
 * my_permissions.php — สิทธิ์ระดับ action ของผู้ใช้ปัจจุบัน (ใช้ตัดสินการแสดงปุ่มใน UI)
 *
 * GET /api/v1/my_permissions.php?module=spare_parts
 * => { "module": "spare_parts", "actions": { "view": true, "manage": false, ... } }
 *
 * ไม่คืนข้อมูลอื่นใดนอกจากสิทธิ์ของตัวเอง — ไม่มี PII
 */

require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/ui_permissions.php';

// session_start() ที่นี่ — requireLogin() อ่าน $_SESSION['user_id'] (เดิมไม่มี → 401 ทุกครั้ง)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');

try {
    $pdo = getDb();
    requireLogin($pdo);

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $module = trim((string)($_GET['module'] ?? ''));
    if ($module === '' || !preg_match('/^[a-z_]+$/', $module)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'ต้องระบุ module (a-z, _)'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $perm = ui_perm_for($pdo, $module);
    if ($perm['actions'] === []) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'ไม่รู้จัก module นี้'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode($perm, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('my_permissions: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Internal error'], JSON_UNESCAPED_UNICODE);
}
