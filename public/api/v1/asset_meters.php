<?php
/**
 * public/api/v1/asset_meters.php — ทะเบียนมิเตอร์ (เตรียมรองรับ)
 *
 * GET  ?asset_id=<id>          → รายการมิเตอร์ของเครื่อง (ถ้ายังไม่มี schema: สังเคราะห์จากข้อมูลเดิม/fallback)
 * POST action=create|update|retire → ต้องรอ migration (asset_meters) — ตอนนี้คืน MIGRATION_REQUIRED
 *
 * อ่าน/ใช้ร่วมกับข้อมูลเดิมได้; การสร้าง/แก้ไขทะเบียนถาวรต้องรอ migration
 * ทุก write ต้องผ่าน CSRF (บังคับด้านล่างสำหรับ non-GET)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/meter_register.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) enforceCsrf();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        requirePerm($pdo, 'asset', 'view');
        $assetId = (int)($_GET['asset_id'] ?? 0);
        if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
        $data = meter_list_for_asset($pdo, $assetId, ['active_only' => !empty($_GET['active_only'])]);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = (string)($data['action'] ?? 'create');
        $schema = meter_schema_state($pdo);
        if (!$schema['register_ready']) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'error_code' => 'MIGRATION_REQUIRED',
                'message' => 'การสร้าง/แก้ไข/เลิกใช้ทะเบียนมิเตอร์ต้องรอการรัน migration (asset_meters) ก่อน — ขณะนี้ระบบรองรับการอ่านรายการแบบสังเคราะห์จากข้อมูลเดิมและบันทึกค่าผ่าน asset_measurements ได้',
                'migration_dependent' => true,
                'schema' => $schema,
            ], JSON_UNESCAPED_UNICODE);
            return;
        }
        // หลัง migration: จุดเชื่อมสำหรับ CRUD จริง (ยังไม่ implement เต็มในงานนี้)
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error_code' => 'NOT_IMPLEMENTED',
            'message' => 'พบ schema ทะเบียนมิเตอร์แล้ว แต่ CRUD เต็มรูปแบบยังไม่ถูกเปิดใช้งานในเวอร์ชันนี้ — โปรดอัปเดตโค้ดส่วนจัดการทะเบียนมิเตอร์',
            'migration_dependent' => false,
            'schema' => $schema,
            'action' => $action,
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}
