<?php
/**
 * my_repairs.php — "ติดตามงานของฉัน" สำหรับผู้แจ้งซ่อม (LIFF rich menu ปุ่มที่ 2)
 *
 * GET /api/v1/my_repairs.php?line_user_id=<U...>&limit=30
 *   → งานที่ผู้ใช้ LINE คนนี้เคยแจ้ง (repair.created_by) + สรุปจำนวน
 *
 * GET (ไม่ส่ง line_user_id) + มี session → งานที่ผู้ใช้ที่ล็อกอินแจ้งไว้
 *
 * ความปลอดภัย:
 *  - ระบุตัวตนด้วย line_user_id ที่ผูกกับ users และ is_active เท่านั้น (QR/URL ไม่ใช่ auth)
 *  - ไม่คืนข้อมูลต้นทุน/อะไหล่ — เฉพาะสิ่งที่ผู้แจ้งควรเห็น
 *  - อ่านอย่างเดียว (GET) ไม่ต้อง CSRF
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/my_repairs.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    api_fail(405, 'METHOD_NOT_ALLOWED', 'รองรับเฉพาะ GET');
}

session_start();

try {
    $pdo = getDb();
    $lineUserId = trim((string)($_GET['line_user_id'] ?? ''));
    $limit = (int)($_GET['limit'] ?? 30);

    $user = $lineUserId !== '' ? my_repairs_user($pdo, $lineUserId) : null;
    $viaSession = false;
    if (!$user) {
        $sessionUser = currentUser($pdo);
        if ($sessionUser) {
            $user = $sessionUser;
            $viaSession = true;
        }
    }

    if (!$user) {
        // ยังไม่ผูกบัญชี LINE: หน้าเว็บจะบอกให้แอดมินเพิ่มผู้ใช้
        echo json_encode(['success' => true, 'registered' => false], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $rows = my_repairs_list($pdo, (int)$user['id'], $limit);

    echo json_encode([
        'success' => true,
        'registered' => true,
        'via_session' => $viaSession,
        'user' => [
            'full_name' => (string)($user['full_name'] ?? ''),
            'employee_code' => (string)($user['employee_code'] ?? ''),
        ],
        'counts' => my_repairs_counts($rows),
        'items' => $rows,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('my_repairs: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'โหลดรายการงานไม่สำเร็จ'], JSON_UNESCAPED_UNICODE);
}
