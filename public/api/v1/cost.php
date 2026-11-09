<?php
/**
 * cost.php — Maintenance Cost & Budget API (Phase 26)
 *
 *   GET  /api/v1/cost.php?action=...   (เฉพาะ role ที่เห็นต้นทุน: 1,2,6)
 *     settings         — config/อัตราที่ใช้คำนวณ (currency, labor_rate, thresholds)
 *     summary          — สรุปต้นทุนรวมตามช่วง/ตัวกรอง + availability ของแต่ละคอมโพเนนต์
 *     work-order       — รายละเอียดต้นทุนใบสั่งซ่อมเดียว (?id=N) + เก็บ flag Not Available
 *     trend            — แนวโน้มรายเดือน (parts/labor/external/total)
 *     by-type          — preventive / corrective / improvement
 *     by-department    — ต้นทุนรายแผนก (Top N ตาม ?limit)
 *     by-asset         — ต้นทุนรายเครื่องจักร (Top N ตาม ?limit)
 *     high-assets      — เครื่องจักรต้นทุนสูง (เกณฑ์ ?high_cost_threshold=)
 *     parts            — อะไหล่ต้นทุนสูงสุด (Top N)
 *     repeat-parts     — อะไหล่ที่ใช้ซ้ำ ≥2 ใบงาน (สัญญาณเสียซ้ำ)
 *     pm               — PM vs Corrective (ค่าใช้จ่าย + ratio)
 *     breakdown        — ค่าใช้จ่ายงานเสีย (+ แยกตามเครื่อง)
 *     emergency        — งานฉุกเฉิน (critical + high)
 *     forecast         — พยากรณ์สิ้นปี (ใช้ข้อมูลจริงรายเดือนเท่านั้น)
 *     data-quality     — ช่องว่างข้อมูลที่ทำให้คอมโพเนนต์ Not Available
 *     filters          — ตัวเลือกตัวกรอง + maintenance_type + months
 *     budget           — รายการงบประมาณ + สถานะ/alert (?year=&department_id=)
 *     budget-vs-actual — series งบ vs ใช้จริงรายเดือน (?year=&department_id=)
 *
 *   POST (CSRF + เฉพาะ role 1,2,6 — audit ทุกรายการ)
 *     budget/create    { year, month, department_id?, allocated_budget, currency?, notes? }
 *     budget/update    { id, allocated_budget?, notes? }   (draft/submitted เท่านั้น)
 *     budget/submit    { id }
 *     budget/approve   { id }                              (submitted → active)
 *     budget/adjust    { id, adjustment_amount, reason, currency? } (active)
 *     budget/close     { id }                              (active → closed)
 *     budget/cancel    { id }                              (draft/submitted → cancelled)
 *
 * สิทธิ์บังคับฝั่ง server เสมอ ผ่าน kpi_can_see_cost() (roles 1,2,6)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
require_once __DIR__ . '/../../../src/helpers/cost.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/services/NotificationCenterService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $roleId = currentRoleId();
    $roleId = $roleId ?: (int)($_SESSION['role_id'] ?? 0);
    if (!$roleId) {
        $st = $pdo->prepare('SELECT role_id FROM users WHERE id = ?');
        $st->execute([$uid]);
        $roleId = (int)($st->fetchColumn() ?: 0);
    }

    $canSeeCost = kpi_can_see_cost($roleId);
    $canManageBudget = cost_can_manage_budget($roleId);

    /* ───────────────────────── GET ───────────────────────── */

    if ($method === 'GET') {
        requireRole($canSeeCost, 'ไม่มีสิทธิ์ดูข้อมูลต้นทุน');
        $action = (string)($_GET['action'] ?? 'summary');

        $opts = [
            'role_id' => $roleId,
            'user_id' => $uid,
            'range' => (string)($_GET['range'] ?? ''),
            'range_start' => (string)($_GET['range_start'] ?? ''),
            'range_end' => (string)($_GET['range_end'] ?? ''),
            'department_id' => (string)($_GET['department_id'] ?? ''),
            'asset_id' => (string)($_GET['asset_id'] ?? ''),
            'asset_category' => (string)($_GET['asset_category'] ?? ''),
            'source_type' => (string)($_GET['source_type'] ?? ''),
            'priority' => (string)($_GET['priority'] ?? ''),
            'status' => (string)($_GET['status'] ?? ''),
            'maintenance_type' => (string)($_GET['maintenance_type'] ?? ''),
        ];

        switch ($action) {
            case 'settings': {
                echo json_encode(['settings' => cost_config($pdo)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'summary': {
                echo json_encode([
                    'summary' => cost_summary($pdo, $opts),
                    'range' => kpi_parse_range($opts),
                    'filters_applied' => [
                        'department_id' => (int)($opts['department_id'] ?? 0),
                        'asset_id' => (int)($opts['asset_id'] ?? 0),
                        'asset_category' => $opts['asset_category'],
                        'source_type' => $opts['source_type'],
                        'priority' => $opts['priority'],
                        'status' => $opts['status'],
                        'maintenance_type' => $opts['maintenance_type'],
                    ],
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'work-order': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) {
                    api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id ของใบสั่งซ่อม');
                }
                echo json_encode(['work_order' => cost_wo_breakdown($pdo, $id)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'trend': {
                echo json_encode(['trend' => cost_trend($pdo, $opts)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'by-type': {
                echo json_encode(cost_by_type($pdo, $opts), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'by-department': {
                $limit = min(100, max(1, (int)($_GET['limit'] ?? 10)));
                echo json_encode(['items' => cost_by_department($pdo, $opts, $limit)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'by-asset': {
                $limit = min(250, max(1, (int)($_GET['limit'] ?? 10)));
                echo json_encode(['items' => cost_by_asset($pdo, $opts, $limit)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'high-assets': {
                if (isset($_GET['high_cost_threshold'])) $opts['high_cost_threshold'] = (float)$_GET['high_cost_threshold'];
                echo json_encode(cost_high_assets($pdo, $opts), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'parts': {
                $limit = min(100, max(1, (int)($_GET['limit'] ?? 10)));
                echo json_encode(['items' => cost_parts_list($pdo, $opts, $limit)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'repeat-parts': {
                $limit = min(100, max(1, (int)($_GET['limit'] ?? 10)));
                echo json_encode(['items' => cost_repeat_parts($pdo, $opts, $limit)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'pm': {
                echo json_encode(cost_pm($pdo, $opts), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'breakdown': {
                echo json_encode(cost_breakdown($pdo, $opts), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'emergency': {
                echo json_encode(cost_emergency($pdo, $opts), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'forecast': {
                $year = (int)($_GET['year'] ?? 0);
                echo json_encode(cost_forecast($pdo, $opts, $year > 0 ? $year : null), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'data-quality': {
                echo json_encode(cost_data_quality($pdo, $opts), JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'filters': {
                $options = kpi_filter_options($pdo);
                $options['maintenance_types'] = [
                    ['value' => 'preventive', 'label' => 'PM / เชิงป้องกัน'],
                    ['value' => 'corrective', 'label' => 'Corrective (ซ่อมเมื่อเสีย)'],
                    ['value' => 'improvement', 'label' => 'Improvement (ปรับปรุง)'],
                    ['value' => 'other', 'label' => 'อื่น ๆ'],
                ];
                $options['years'] = array_map('intval', (array)$pdo->query('SELECT DISTINCT YEAR(created_at) FROM repair ORDER BY 1 DESC')->fetchAll(PDO::FETCH_COLUMN));
                echo json_encode($options, JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget': {
                $opts['year'] = (int)($_GET['year'] ?? 0);
                $list = cost_budget_list($pdo, ['department_id' => (int)($opts['department_id'] ?? 0), 'year' => $opts['year'], 'user_id' => $uid]);
                $list['can_manage'] = (bool)$canManageBudget;
                echo json_encode($list, JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget-vs-actual': {
                $opts['year'] = (int)($_GET['year'] ?? 0);
                echo json_encode(cost_budget_vs_actual($pdo, ['year' => $opts['year'], 'department_id' => (int)($opts['department_id'] ?? 0)]), JSON_UNESCAPED_UNICODE);
                exit;
            }
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
    }

    /* ───────────────────────── POST ───────────────────────── */

    if ($method === 'POST') {
        enforceCsrf();
        requireRole($canManageBudget, 'ไม่มีสิทธิ์จัดการงบประมาณ');
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $action = trim((string)($data['action'] ?? ''));
        if ($action === '') $action = trim((string)($_GET['action'] ?? ''));
        $uName = (string)($_SESSION['user_name'] ?? '');
        $audit = function (string $resource, string|int $resourceId, string $desc, array $before = [], array $after = []) use ($pdo, $uName, $uid): void {
            audit_log($pdo, strtoupper($resource), 'budget', $resourceId, $desc . ' [' . $uName . ']', $before !== [] ? $before : null, $after !== [] ? $after : null);
        };

        $id = (int)($data['id'] ?? 0);

        switch ($action) {
            case 'budget/create': {
                $res = budget_create($pdo, $data, $uid);
                $audit('BUDGET_CREATE', $res['id'], 'สร้างงบประมาณ', ['action' => $action, 'year' => (int)($data['year'] ?? 0), 'month' => (int)($data['month'] ?? 0), 'allocated_budget' => $data['allocated_budget'] ?? null]);
                echo json_encode(['success' => true, 'id' => $res['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget/update': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $before = budget_find($pdo, $id);
                budget_update($pdo, $data, $uid);
                $after = budget_find($pdo, $id);
                $audit('BUDGET_UPDATE', $id, 'แก้ไขงบประมาณ', $before, $after);
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget/submit': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                budget_submit($pdo, $id, $uid);
                $audit('BUDGET_SUBMIT', $id, 'ส่งอนุมัติงบประมาณ');
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget/approve': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                budget_approve($pdo, $id, $uid);
                $audit('BUDGET_APPROVE', $id, 'อนุมัติงบประมาณ');
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget/adjust': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $before = budget_find($pdo, $id);
                $res = budget_adjust($pdo, $data, $uid);
                $audit('BUDGET_ADJUST', $id, 'ปรับงบประมาณ', ['allocated_budget' => $before['allocated_budget']], ['adjustment_amount' => $data['adjustment_amount'] ?? null, 'reason' => $data['reason'] ?? null]);
                echo json_encode(['success' => true, 'id' => $id, 'effective_budget' => $res['effective_budget']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget/close': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                budget_close($pdo, $id, $uid);
                $audit('BUDGET_CLOSE', $id, 'ปิดงบประมาณ');
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'budget/cancel': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                budget_cancel($pdo, $id, $uid);
                $audit('BUDGET_CANCEL', $id, 'ยกเลิกงบประมาณ');
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
    }

    api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');

} catch (DomainException $e) {
    api_fail(400, 'VALIDATION_ERROR', $e->getMessage());
} catch (Throwable $e) {
    api_safe_catch($e);
}