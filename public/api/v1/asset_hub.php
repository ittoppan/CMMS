<?php
/**
 * asset_hub.php — ข้อมูลหน้าเครื่องจักรสำหรับ QR ที่ติดบนตัวเครื่อง (LIFF)
 *
 * GET  /api/v1/asset_hub.php?code=<A-BM06 | CMMS-A-token | ลิงก์ LIFF>
 *      header: X-LIFF-Id-Token: <liff.getIDToken()>   (หรือ Authorization: Bearer <token>)
 * POST /api/v1/asset_hub.php   body JSON: { "code": "...", "id_token": "..." }
 *
 * ใช้กับหน้า /repair/request?asset_code=… (LIFF endpoint) — แสดง
 *   • ข้อมูลเครื่อง + งานซ่อมที่ยังเปิดอยู่
 *   • PM ที่ถึงกำหนด / ค้างอยู่ของเครื่องนี้
 *   • ประวัติการซ่อมที่ปิดแล้ว (ซ่อมอะไรมาบ้าง ใครซ่อม เมื่อไร)
 *
 * ความปลอดภัย:
 *  - ไม่รับ `line_user_id` จาก client อีกต่อไป (ใครรู้ LINE user ID ก็ปลอมได้)
 *    ตัวตนผู้ใช้ LINE มาจาก LIFF ID token ที่ตรวจกับ LINE ฝั่งเซิร์ฟเวอร์เท่านั้น
 *  - token ไม่ผ่าน / ไม่ถูกต้อง → 401 (ไม่ fallback ไปใช้ session หรือ query)
 *  - ผู้ใช้เว็บที่ล็อกอินอยู่และมีสิทธิ์ asset:view ยังดูได้เหมือนเดิม (ไม่ต้องมี token)
 *  - ผู้ที่ยังไม่ผูกบัญชีได้แค่ "มี/ไม่มีเครื่องนี้" ไม่ได้ข้อมูลประวัติ
 *  - อ่านเท่านั้น (GET/POST ที่ไม่เขียนข้อมูล) จึงไม่ต้องใช้ CSRF — และผู้ใช้ LIFF ไม่มี session
 *    ให้ผูก CSRF token; ไม่มีการใช้ cookie เป็นหลักฐานยืนยันตัวตนในเส้นทางนี้
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/liff.php';
require_once __DIR__ . '/../../../src/helpers/asset_hub.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (!in_array($method, ['GET', 'POST'], true)) {
    api_fail(405, 'METHOD_NOT_ALLOWED', 'รองรับเฉพาะ GET และ POST');
}

session_start();

try {
    $pdo = getDb();

    // POST รองรับ JSON body (LIFF แนบ token มากับ body ได้) — อ่านอย่างเดียว ไม่เขียนข้อมูล
    $input = $_GET;
    if ($method === 'POST') {
        $rawBody = (string)file_get_contents('php://input');
        $jsonBody = json_decode($rawBody, true);
        if (is_array($jsonBody)) {
            $input = array_merge($input, $jsonBody);
        } elseif (!empty($_POST)) {
            $input = array_merge($input, $_POST);
        }
    }

    $rawCode = trim((string)($input['code'] ?? $input['asset_code'] ?? ''));

    if ($rawCode === '') {
        api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุรหัสเครื่อง (code)');
    }

    // ── ตัวตนผู้ใช้ LINE: ตรวจ LIFF ID token เท่านั้น (header มาก่อน แล้วจึง body) ──
    $idToken = trim((string)($_SERVER['HTTP_X_LIFF_ID_TOKEN'] ?? ''));
    if ($idToken === '') {
        $authHeader = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
        if ($authHeader !== '' && preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
            $idToken = trim($m[1]);
        }
    }
    if ($idToken === '' && isset($input['id_token'])) {
        $idToken = trim((string)$input['id_token']);
    }

    $viewer = null;
    $isStaff = false;

    if ($idToken !== '') {
        $verified = liff_verify_id_token($idToken);
        if (!$verified['ok']) {
            api_fail(401, 'LIFF_TOKEN_' . ($verified['code'] !== '' ? $verified['code'] : 'INVALID'), $verified['error']);
        }
        $viewer = asset_hub_user_for_line($pdo, $verified['line_user_id']);
    } else {
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
