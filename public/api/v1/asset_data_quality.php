<?php
/**
 * public/api/v1/asset_data_quality.php — data quality ของ asset (Phase 28)
 *
 * GET  ?asset_id=<id> → ตรวจเช็คของ asset เดียว
 *      (ไม่มี id)      → สรุปทั้งระบบ (reuse ana_data_quality สำหรับ fleet)
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
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); return; }
    requirePerm($pdo, 'asset', 'view');
    $assetId = (int)($_GET['asset_id'] ?? 0);
    if ($assetId > 0) {
        echo json_encode(['asset_id' => $assetId, 'quality' => ar_data_quality_asset($pdo, $assetId)], JSON_UNESCAPED_UNICODE);
        return;
    }
    // fleet summary — reuse ana_data_quality (ตัวเดิมที่แทรก score ไว้ด้วย)
    $res = ana_data_quality($pdo, ['role_id' => (int)($_SESSION['role_id'] ?? 0), 'user_id' => (int)$_SESSION['user_id']]);
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    api_safe_catch($e);
}