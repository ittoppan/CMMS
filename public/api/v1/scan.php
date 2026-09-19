<?php
/**
 * scan.php — QR/Barcode resolve API (Phase 24 — Mobile Field Workflow)
 *
 * GET  /api/v1/scan.php?code=<payload>&source=camera|manual&context=<page>
 *        → resolve เป้าหมาย (asset/work_order/pm/spare/unknown) + บันทึก scan_events
 * GET  /api/v1/scan.php?action=history&limit=20
 *        → ประวัติการสแกนล่าสุดของผู้ใช้
 * GET  /api/v1/scan.php?action=labels
 *        → รายการเครื่องจักร + QR payload สำหรับพิมพ์ฉลาก (เฉพาะผู้มีสิทธิ์ asset:view)
 * POST /api/v1/scan.php?action=report_unknown   { code, note }
 *        → แจ้งรหัสที่ระบบไม่รู้จัก (สร้าง scan_event + audit)
 * POST /api/v1/scan.php?action=print_log        { asset_ids: [], template }
 *        → บันทึกประวัติการพิมพ์ฉลาก
 * POST /api/v1/scan.php?action=purge&days=180   → ลบประวัติเก่า (admin เท่านั้น)
 *
 * หมายเหตุ: payload จาก QR = untrusted input — resolve ผ่านสิทธิ์ทุกครั้ง, QR ไม่ใช่ auth
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/scan.php';

header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    $user = requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string)($_GET['action'] ?? 'resolve');
    $uid = (int)$user['id'];

    if ($method === 'GET') {
        switch ($action) {
            case 'resolve':
            case '': {
                $raw = (string)($_GET['code'] ?? $_GET['q'] ?? '');
                if (trim($raw) === '') {
                    api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุรหัสที่ต้องการสแกน');
                }
                $result = scan_resolve($pdo, $raw, $user);
                $assetId = null;
                if (($result['type'] ?? '') === 'asset' && !empty($result['data']['asset']['id'])) {
                    $assetId = (int)$result['data']['asset']['id'];
                } elseif (($result['type'] ?? '') === 'work_order' && !empty($result['data']['work_order']['asset_id'])) {
                    $assetId = (int)$result['data']['work_order']['asset_id'];
                }
                $resolvedId = null;
                if (($result['type'] ?? '') === 'work_order') $resolvedId = (int)($result['data']['work_order']['id'] ?? 0) ?: null;
                elseif (($result['type'] ?? '') === 'pm') $resolvedId = (int)($result['data']['pm']['id'] ?? 0) ?: null;
                elseif (($result['type'] ?? '') === 'spare') $resolvedId = (int)($result['data']['spare']['id'] ?? 0) ?: null;
                elseif (($result['type'] ?? '') === 'asset') $resolvedId = $assetId;

                scan_log_event(
                    $pdo,
                    $uid,
                    $raw,
                    (string)($result['type'] ?? 'unknown'),
                    $resolvedId,
                    $assetId,
                    (string)($_GET['source'] ?? 'camera'),
                    isset($_GET['context']) ? (string)$_GET['context'] : null
                );

                echo json_encode([
                    'success' => true,
                    'type' => $result['type'] ?? 'unknown',
                    'restricted' => (bool)($result['restricted'] ?? false),
                    'data' => $result['data'] ?? null,
                    'meta' => [
                        'raw' => mb_substr($raw, 0, 255),
                        'can_cost' => kpi_can_see_cost_local(),
                        'generated_at' => date('Y-m-d H:i:s'),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                break;
            }
            case 'history': {
                $limit = (int)($_GET['limit'] ?? 20);
                echo json_encode([
                    'success' => true,
                    'items' => scan_recent($pdo, $uid, $limit),
                ], JSON_UNESCAPED_UNICODE);
                break;
            }
            case 'labels': {
                requirePerm($pdo, 'asset', 'view', 'ไม่มีสิทธิ์ดูรายการเครื่องจักร');
                $rows = $pdo->query('SELECT id, code, name, department, criticality, status, qr_token
                                     FROM asset_registry ORDER BY code ASC LIMIT 2000')->fetchAll(PDO::FETCH_ASSOC);
                $items = array_map(function (array $r): array {
                    return [
                        'id' => (int)$r['id'],
                        'code' => (string)$r['code'],
                        'name' => (string)$r['name'],
                        'department' => $r['department'],
                        'criticality' => $r['criticality'],
                        'status' => $r['status'],
                        'payload' => scan_asset_payload($r),
                    ];
                }, $rows);
                echo json_encode(['success' => true, 'items' => $items], JSON_UNESCAPED_UNICODE);
                break;
            }
            default:
                api_fail(400, 'VALIDATION_ERROR', 'action ไม่ถูกต้อง');
        }
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
        switch ($action) {
            case 'report_unknown': {
                $code = trim((string)($data['code'] ?? ''));
                if ($code === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุรหัสที่สแกนได้');
                scan_log_event($pdo, $uid, $code, 'unknown', null, null, (string)($data['source'] ?? 'camera'), 'report_unknown');
                audit_log($pdo, 'SCAN_UNKNOWN_REPORTED', 'asset', mb_substr($code, 0, 60),
                    'ผู้ใช้แจ้งรหัส QR ที่ระบบไม่รู้จัก', null,
                    ['code' => $code, 'note' => mb_substr((string)($data['note'] ?? ''), 0, 500)], 'warning');
                echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
                break;
            }
            case 'print_log': {
                requirePerm($pdo, 'asset', 'view', 'ไม่มีสิทธิ์ดูรายการเครื่องจักร');
                $ids = is_array($data['asset_ids'] ?? null) ? $data['asset_ids'] : [];
                $template = mb_substr((string)($data['template'] ?? 'a4-sheet'), 0, 60);
                $count = 0;
                if ($ids) {
                    $st = $pdo->prepare('INSERT INTO qr_print_log (asset_id, printed_by, template, qr_count) VALUES (?,?,?,1)');
                    foreach ($ids as $id) {
                        $aid = (int)$id;
                        if ($aid > 0) { $st->execute([$aid, $uid, $template]); $count++; }
                    }
                    audit_log($pdo, 'QR_LABEL_PRINTED', 'asset', (string)$count,
                        "พิมพ์ฉลาก QR $count รายการ", null, ['count' => $count, 'template' => $template], 'info');
                }
                echo json_encode(['success' => true, 'logged' => $count], JSON_UNESCAPED_UNICODE);
                break;
            }
            case 'purge': {
                if ((int)$user['role_id'] !== 1) api_forbidden($pdo, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบ');
                $days = (int)($data['days'] ?? 180);
                $removed = scan_purge_old($pdo, $days);
                echo json_encode(['success' => true, 'removed' => $removed], JSON_UNESCAPED_UNICODE);
                break;
            }
            default:
                api_fail(400, 'VALIDATION_ERROR', 'action ไม่ถูกต้อง');
        }
        exit;
    }

    api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
} catch (Exception $e) {
    api_safe_catch($e);
}

/** ตรวจสิทธิ์ดูต้นทุนแบบเบา (ไม่ผูกกับ kpi.php เพื่อลด dependency) */
function kpi_can_see_cost_local(): bool {
    return in_array((int)($_SESSION['role_id'] ?? 0), [1, 2, 6], true);
}
