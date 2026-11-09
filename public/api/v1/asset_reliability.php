<?php
/**
 * public/api/v1/asset_reliability.php — Asset Reliability & Lifecycle (Phase 28)
 *
 * GET  ?id=<assetId>          → Unified Asset Reliability Profile (หน้าเดียวรวมทุกส่วน)
 *      ?action=list           → รายชื่อ asset พร้อมสรุป reliability/health
 *      ?action=dashboard      → KPI + กลุ่ม โดย criticality/lifecycle/health
 *      ?action=critical       → Critical assets ranking (ข้อมูลจริง — ไม่แนะนำให้เปลี่ยน)
 *      ?action=aging          → เครื่องที่ถึงเกณฑ์พิจารณาตามอายุ
 *      ?action=config         → อ่านค่า config (ar_*)
 * POST ?action=config         → บันทึก config (admin/manager)
 *
 * RBAC: ใช้ module เดิม 'asset' (view/create/edit/delete) — ผูกกับ menu_permissions
 * โดยหน้า Phase 28 อ่านสิทธิ์ผ่าน requirePerm($pdo,'asset',...)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/asset_reliability.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        requirePerm($pdo, 'asset', 'view');
        $action = (string)($_GET['action'] ?? '');
        if ($action === '') {
            $id = (int)($_GET['id'] ?? 0);
            if ($id > 0) {
                echo json_encode(ar_profile($pdo, $id, ['months' => (int)($_GET['months'] ?? 0)]), JSON_UNESCAPED_UNICODE);
            } else {
                // default: list (ย้อนหลัง compatible — GET ไม่มี id → list)
                echo json_encode(['assets' => ar_asset_list($pdo, $_GET), 'total' => count(ar_asset_list($pdo, $_GET))], JSON_UNESCAPED_UNICODE);
            }
            return;
        }
        switch ($action) {
            case 'list':
                echo json_encode(['assets' => ar_asset_list($pdo, $_GET), 'total' => count(ar_asset_list($pdo, $_GET))], JSON_UNESCAPED_UNICODE);
                break;
            case 'dashboard':
                echo json_encode(ar_dashboard_summary($pdo), JSON_UNESCAPED_UNICODE);
                break;
            case 'critical':
                echo json_encode(['assets' => ar_critical_assets($pdo, (int)($_GET['limit'] ?? 20))], JSON_UNESCAPED_UNICODE);
                break;
            case 'aging':
                echo json_encode(['assets' => ar_aging_assets($pdo, (int)($_GET['limit'] ?? 20)), 'config' => ar_config($pdo)], JSON_UNESCAPED_UNICODE);
                break;
            case 'config':
                requirePerm($pdo, 'asset', 'view');
                echo json_encode(['config' => ar_config($pdo), 'factors' => ar_criticality_factor_defaults()], JSON_UNESCAPED_UNICODE);
                break;
            default:
                api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
        }
        return;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'asset', 'edit');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = (string)($data['action'] ?? $_GET['action'] ?? '');
        switch ($action) {
            case 'config':
                requirePerm($pdo, 'settings', 'edit');
                $allowed = array_keys(ar_config($pdo));
                $updates = 0;
                foreach ($data['values'] ?? [] as $k => $v) {
                    if (!in_array($k, $allowed, true)) continue;
                    $st = $pdo->prepare('UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?');
                    $st->execute([(string)$v, $k]);
                    $updates += $st->rowCount();
                }
                audit_log($pdo, 'ASSET_RELIABILITY_CONFIG', 'settings', '', "แก้ไข config reliability/criticality ({$updates} ค่า)", null, array_keys((array)($data['values'] ?? [])), 'notice');
                echo json_encode(['success' => true, 'updated' => $updates], JSON_UNESCAPED_UNICODE);
                break;
            default:
                api_fail(400, 'BAD_ACTION', 'action ไม่ถูกต้อง');
        }
        return;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    api_safe_catch($e);
}