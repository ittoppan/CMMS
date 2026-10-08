<?php
/**
 * public/api/v1/asset_lifecycle.php — Lifecycle ของ Asset (Phase 28)
 *
 * GET  ?id=<assetId>    → สถานะปัจจุบัน + transitions + history
 * POST action=change    → เปลี่ยนสถานะ { asset_id, to, reason, reference }
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

    if ($method === 'GET') {
        requirePerm($pdo, 'asset', 'view');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) api_fail(400, 'MISSING_ID', 'ระบุ asset id');
        $asset = ar_asset($pdo, $id);
        if (!$asset) api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องจักร');
        echo json_encode([
            'asset' => $asset,
            'current' => $asset['lifecycle_status'],
            'current_label' => AR_LIFECYCLE_LABELS[$asset['lifecycle_status']] ?? $asset['lifecycle_status'],
            'transitions' => ar_lifecycle_transitions(),
            'history' => ar_lifecycle_history($pdo, $id),
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = (string)($data['action'] ?? '');
        if ($action === 'change') {
            $assetId = (int)($data['asset_id'] ?? 0);
            $to = (string)($data['to'] ?? '');
            $reason = (string)($data['reason'] ?? '');
            $reference = (string)($data['reference'] ?? '');
            echo json_encode(ar_lifecycle_change($pdo, $assetId, $to, (int)$_SESSION['user_id'], $reason, $reference, (string)($data['source'] ?? 'manual')), JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}