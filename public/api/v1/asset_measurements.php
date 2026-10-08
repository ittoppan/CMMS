<?php
/**
 * public/api/v1/asset_measurements.php — ค่าวัดสภาพ asset (manual, Phase 28)
 *
 * GET  ?asset_id=<id>&parameter=<p>   → ประวัติค่าวัด
 * POST action=add                     → { asset_id, parameter, value_numeric, unit, method, measured_at, notes }
 * DELETE ?id=<mid>
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/asset_reliability.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) enforceCsrf();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)$_SESSION['user_id'];

    if ($method === 'GET') {
        requirePerm($pdo, 'asset', 'view');
        $assetId = (int)($_GET['asset_id'] ?? 0);
        if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
        echo json_encode(['measurements' => ar_measurements($pdo, $assetId, $_GET)], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (($data['action'] ?? '') === 'add') {
            $assetId = (int)($data['asset_id'] ?? 0);
            if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
            echo json_encode(ar_measurement_add($pdo, $assetId, $data, $uid), JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    if ($method === 'DELETE') {
        requirePerm($pdo, 'asset', 'edit');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) api_fail(400, 'MISSING_ID', 'ระบุ id');
        ar_measurement_delete($pdo, $id, $uid);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}