<?php
/**
 * asset_hub.php — ข้อมูลหน้าเครื่องจักรสำหรับ QR ที่ติดบนตัวเครื่อง (LIFF)
 *
 * GET /api/v1/asset_hub.php?code=<A-BM06 | CMMS-A-token | ลิงก์ LIFF>&line_user_id=<U...>
 *
 * ใช้กับหน้า /repair/request?asset_code=… (LIFF endpoint) — แสดง
 *   • ข้อมูลเครื่อง + งานซ่อมที่ยังเปิดอยู่
 *   • PM ที่ถึงกำหนด / ค้างอยู่ของเครื่องนี้
 *   • ประวัติการซ่อมที่ปิดแล้ว (ซ่อมอะไรมาบ้าง ใครซ่อม เมื่อไร)
 *
 * ความปลอดภัย:
 *  - QR ไม่ใช่ auth: ต้องเป็นผู้ใช้ที่ผูก LINE แล้ว (line_user_id ตรงกับ users และ is_active)
 *    หรือผู้ใช้ที่ล็อกอินอยู่และมีสิทธิ์ asset:view
 *  - ผู้ที่ยังไม่ผูกบัญชีได้แค่ "มี/ไม่มีเครื่องนี้" ไม่ได้ข้อมูลประวัติ
 *  - อ่านเท่านั้น (GET) จึงไม่ต้องใช้ CSRF
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/asset_hub.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    api_fail(405, 'METHOD_NOT_ALLOWED', 'รองรับเฉพาะ GET');
}

session_start();

try {
    $pdo = getDb();
    $rawCode = trim((string)($_GET['code'] ?? $_GET['asset_code'] ?? ''));
    $lineUserId = trim((string)($_GET['line_user_id'] ?? ''));

    if ($rawCode === '') {
        api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุรหัสเครื่อง (code)');
    }

    $viewer = $lineUserId !== '' ? asset_hub_user_for_line($pdo, $lineUserId) : null;
    $isStaff = false;
    if (!$viewer) {
        $sessionUser = currentUser($pdo);
        if ($sessionUser && canPerm($pdo, 'asset', 'view')) {
            $viewer = $sessionUser;
            $isStaff = true;
        }
    }

    $asset = asset_hub_find_asset($pdo, $rawCode);
    if (!$asset) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'ไม่พบเครื่องจักรนี้ในระบบ — ตรวจรหัสบนสติกเกอร์อีกครั้ง หรือแจ้งผู้ดูแลระบบ',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!$viewer) {
        // ยังไม่ผูกบัญชี: บอกได้แค่ว่าเครื่องนี้มีอยู่ เพื่อให้หน้า LIFF แนะนำให้แอดมินเพิ่มผู้ใช้
        echo json_encode([
            'success' => true,
            'registered' => false,
            'asset' => ['code' => $asset['code'], 'name' => $asset['name']],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $payload = asset_hub_payload($pdo, $asset, $viewer);
    echo json_encode(
        array_merge(['success' => true, 'registered' => true, 'staff' => $isStaff], $payload),
        JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $e) {
    error_log('asset_hub: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'โหลดข้อมูลเครื่องจักรไม่สำเร็จ'], JSON_UNESCAPED_UNICODE);
}
