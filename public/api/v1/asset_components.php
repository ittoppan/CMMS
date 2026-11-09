<?php
/**
 * public/api/v1/asset_components.php — ส่วนประกอบ + การเปลี่ยนชิ้นส่วน (Phase 28)
 *
 * GET  ?asset_id=<id>            → รายการ components + replacements
 * POST action=add                → เพิ่ม component { asset_id, component_code, name, ... }
 *      action=replace            → บันทึกการเปลี่ยน { component_id, replaced_at, reason, new_serial, cost, wo_id, reference_doc, notes }
 * DELETE ?asset_id=<id>&component_id=<cid>
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
        echo json_encode([
            'components' => ar_components($pdo, $assetId),
            'replacements' => ar_component_replacements($pdo, $assetId),
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = (string)($data['action'] ?? '');
        if ($action === 'add') {
            $assetId = (int)($data['asset_id'] ?? 0);
            if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
            echo json_encode(ar_component_add($pdo, $assetId, $data, $uid), JSON_UNESCAPED_UNICODE);
            return;
        }
        if ($action === 'replace') {
            $componentId = (int)($data['component_id'] ?? 0);
            if (!$componentId) api_fail(400, 'MISSING_ID', 'ระบุ component_id');
            echo json_encode(ar_component_replace($pdo, $componentId, $data, $uid), JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    if ($method === 'DELETE') {
        requirePerm($pdo, 'asset', 'edit');
        $cid = (int)($_GET['component_id'] ?? 0);
        if (!$cid) api_fail(400, 'MISSING_ID', 'ระบุ component_id');
        ar_component_delete($pdo, $cid, $uid);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}