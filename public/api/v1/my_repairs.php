<?php
/**
 * my_repairs.php — "ติดตามงานของฉัน" สำหรับผู้แจ้งซ่อม (LIFF rich menu ปุ่มที่ 2)
 *
 * GET /api/v1/my_repairs.php?limit=30  (header: X-LIFF-Id-Token จาก liff.getIDToken())
 *   → งานที่ผู้ใช้ LINE ที่ token ยืนยันแล้วเคยแจ้ง (repair.created_by) + สรุปจำนวน
 *
 * GET + มี session → งานที่ผู้ใช้ที่ล็อกอินแจ้งไว้
 *
 * ความปลอดภัย:
 *  - ตัวตนมาจาก LIFF ID token ที่ตรวจกับ LINE (src/helpers/liff.php) หรือ session เท่านั้น
 *  - **ไม่รับ `line_user_id` จาก client อีกต่อไป** (ใครรู้ LINE user id ของคนอื่นก็อ่านงานเขาได้)
 *  - ไม่คืนข้อมูลต้นทุน/อะไหล่ — เฉพาะสิ่งที่ผู้แจ้งควรเห็น
 *  - อ่านอย่างเดียว (GET) ไม่ต้อง CSRF
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/my_repairs.php';
require_once __DIR__ . '/../../../src/helpers/liff.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    api_fail(405, 'METHOD_NOT_ALLOWED', 'รองรับเฉพาะ GET');
}

session_start();

try {
    $pdo = getDb();
    $limit = (int)($_GET['limit'] ?? 30);

    // ตัวตน: session ผู้ใช้ระบบ หรือ LIFF ID token ที่ตรวจกับ LINE แล้ว (ไม่ใช้ line_user_id จาก query)
    $identity = liff_request_identity($pdo, null, currentUser($pdo));
    if (!$identity['ok'] && $identity['code'] !== 'MISSING_ID_TOKEN') {
        api_fail(401, 'UNAUTHORIZED', $identity['error'] !== '' ? $identity['error'] : 'ตรวจสอบตัวตนผู้ใช้ LINE ไม่ผ่าน');
    }
    $claimed = trim((string)($_GET['line_user_id'] ?? ''));
    if ($claimed !== '' && $claimed !== $identity['line_user_id']) {
        error_log('my_repairs: ignored client-supplied line_user_id');
    }

    $user = $identity['user'] ?? null;
    $viaSession = $identity['source'] === 'session';

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
