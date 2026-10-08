<?php
/**
 * public/api/v1/asset_overhauls.php — งานยกเครื่อง / Overhaul (Phase 28)
 *
 * GET  ?asset_id=<id>     → รายการ overhaul ของเครื่อง
 *      ?id=<ohid>         → รายละเอียดเดียว
 * POST action=create      → { asset_id, title, reason, scope, planned_start, planned_end, status, wo_id }
 *      action=update      → { id, ...fields, status, verified }
 * DELETE ?id=<ohid>
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
        $ohId = (int)($_GET['id'] ?? 0);
        if ($ohId) {
            $st = $pdo->prepare('SELECT * FROM asset_overhauls WHERE id = ?');
            $st->execute([$ohId]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if (!$row) api_fail(404, 'NOT_FOUND', 'ไม่พบงานยกเครื่อง');
            echo json_encode($row, JSON_UNESCAPED_UNICODE);
            return;
        }
        $assetId = (int)($_GET['asset_id'] ?? 0);
        if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
        echo json_encode(['overhauls' => ar_overhauls($pdo, $assetId)], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = (string)($data['action'] ?? '');
        if ($action === 'create') {
            $assetId = (int)($data['asset_id'] ?? 0);
            if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset_id');
            echo json_encode(ar_overhaul_create($pdo, $assetId, $data, $uid), JSON_UNESCAPED_UNICODE);
            return;
        }
        if ($action === 'update') {
            $id = (int)($data['id'] ?? 0);
            if (!$id) api_fail(400, 'MISSING_ID', 'ระบุ id');
            echo json_encode(ar_overhaul_update($pdo, $id, $data, $uid), JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    if ($method === 'DELETE') {
        requirePerm($pdo, 'asset', 'edit');
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) api_fail(400, 'MISSING_ID', 'ระบุ id');
        ar_overhaul_delete($pdo, $id, $uid);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}