<?php
/**
 * public/api/v1/asset_relationships.php — ความสัมพันธ์ระหว่างเครื่องจักร (Phase 28)
 *
 * GET  ?asset_id=<id>        → รายการความสัมพันธ์
 * POST action=add            → { asset_id, related_asset_id, relation_type, note }
 * DELETE ?asset_id=<id>&rel_id=<rid>
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
        echo json_encode(['relationships' => ar_relationships($pdo, $assetId)], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (($data['action'] ?? '') === 'add') {
            $assetId = (int)($data['asset_id'] ?? 0);
            if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
            echo json_encode(ar_relationship_add($pdo, $assetId, $data, $uid), JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    if ($method === 'DELETE') {
        requirePerm($pdo, 'asset', 'edit');
        $assetId = (int)($_GET['asset_id'] ?? 0);
        $relId = (int)($_GET['rel_id'] ?? 0);
        if (!$assetId || !$relId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id และ rel_id');
        ar_relationship_delete($pdo, $assetId, $relId, $uid);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}