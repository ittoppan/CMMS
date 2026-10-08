<?php
/**
 * public/api/v1/asset_criticality.php — การประเมินความสำคัญ (A–D) Phase 28
 *
 * GET  ?id=<assetId>   → ปัจจุบัน + history + factor defaults
 *      ?due=1|0        → ตรวจสอบว่าเครื่องไหนถึงกำหนดทบทวน (list)
 * POST action=assess   → บันทึกการประเมิน { asset_id, factors{...}, note, method, apply, next_review_date }
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
        if (!$id) {
            // รายการที่ถึงกำหนดทบทวน
            $cfg = ar_config($pdo);
            $st = $pdo->query("SELECT a.id, a.code, a.name, a.criticality, a.criticality_score, a.next_criticality_review_date, a.criticality_reviewed_at
                    FROM asset_registry a WHERE a.status <> 'disposed'
                    ORDER BY COALESCE(a.next_criticality_review_date, DATE_ADD(COALESCE(a.criticality_reviewed_at, a.created_at), INTERVAL " . (int)$cfg['ar_criticality_review_days'] . " DAY)) ASC");
            $rows = [];
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $due = ar_criticality_due($pdo, $r);
                if ($due['due']) $rows[] = $r + $due;
            }
            echo json_encode(['assets' => $rows], JSON_UNESCAPED_UNICODE);
            return;
        }
        $asset = ar_asset($pdo, $id);
        if (!$asset) api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องจักร');
        echo json_encode([
            'asset' => $asset,
            'current' => ['level' => $asset['criticality'], 'score' => $asset['criticality_score'] !== null ? (float)$asset['criticality_score'] : null],
            'due' => ar_criticality_due($pdo, $asset),
            'history' => ar_criticality_history($pdo, $id),
            'factors' => ar_criticality_factor_defaults(),
            'config' => ar_config($pdo),
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (($data['action'] ?? '') === 'assess') {
            $assetId = (int)($data['asset_id'] ?? 0);
            if (!$assetId) api_fail(400, 'MISSING_ID', 'ระบุ asset id');
            echo json_encode(ar_criticality_assess($pdo, $assetId, $data, (int)$_SESSION['user_id']), JSON_UNESCAPED_UNICODE);
            return;
        }
        api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}