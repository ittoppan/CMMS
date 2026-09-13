<?php
/**
 * dashboard.php — Enterprise CMMS Dashboard + KPI API (Phase 15)
 *
 * GET /api/v1/dashboard.php?action=...
 *
 * เป็น API กลางสำหรับแดชบอร์ดตาม role ทั้งหมด:
 *   overview — KPI หลัก + alerts + ตัวเลือกตัวกรอง ตาม role ของผู้ใช้
 *   wo       — รายการงาน (drill-down) พร้อม group: overdue/critical/waiting_parts/...
 *   pm       — รายการ PM (drill-down) พร้อม group: overdue/completed/due_today
 *   downtime — Downtime ตาม asset/department/failure type
 *   cost     — ค่าใช้จ่าย (เฉพาะ role ที่เห็นต้นทุน: 1,2,6)
 *   failure  — Failure ตาม asset/type + เครื่องที่เสียซ้ำ
 *   assets   — Asset Health
 *   tech     — Workload รายช่าง (planner/manager/admin)
 *   options  — ตัวเลือกตัวกรอง (departments/locations/assets/technicians/...)
 *
 * Permission (server-side บังคับเสมอ — ดู src/helpers/kpi.php):
 *   - Technician (3)     → เห็นเฉพาะงานที่ตนเป็น lead/ทีม
 *   - Operator (4)       → เห็นเฉพาะงานที่ตนเองแจ้ง
 *   - Viewer (5)         → อ่านอย่างเดียว (แต่ไม่เห็นต้นทุน)
 *   - Cost endpoint      → เฉพาะ role 1,2,6
 *
 * ทุก KPI คำนวณจาก Formula กลางใน src/helpers/kpi.php (ห้าม replicate วิธีคำนวณ)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $uid = (int)($_SESSION['user_id'] ?? 0);
    $roleId = currentRoleId();
    $action = (string)($_GET['action'] ?? 'overview');

    $user = null;
    if ($uid) {
        $st = $pdo->prepare('SELECT id, username, full_name, role_id, role, employee_code FROM users WHERE id = ?');
        $st->execute([$uid]);
        $user = $st->fetch(PDO::FETCH_ASSOC);
    }
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $roleId = kpi_resolve_role($pdo, $user);
    $roleName = (string)($_SESSION['role_name'] ?? $_SESSION['role'] ?? ($user['role'] ?: ''));
    $opts = [
        'role_id' => $roleId,
        'user_id' => $uid,
        'range' => (string)($_GET['range'] ?? ''),
        'range_start' => (string)($_GET['range_start'] ?? ''),
        'range_end' => (string)($_GET['range_end'] ?? ''),
        'department_id' => (string)($_GET['department_id'] ?? ''),
        'location_id' => (string)($_GET['location_id'] ?? ''),
        'asset_id' => (string)($_GET['asset_id'] ?? ''),
        'asset_category' => (string)($_GET['asset_category'] ?? ''),
        'technician_id' => (string)($_GET['technician_id'] ?? ''),
        'source_type' => (string)($_GET['source_type'] ?? ''),
        'priority' => (string)($_GET['priority'] ?? ''),
        'status' => (string)($_GET['status'] ?? ''),
    ];

    $base = [
        'user' => [
            'id' => (int)$user['id'],
            'full_name' => $user['full_name'],
            'role_id' => $roleId,
            'role_name' => $roleName,
        ],
        'dashboard_role' => kpi_dashboard_role(['role_id' => $roleId, 'role_name' => $roleName]),
        'can' => [
            'cost' => kpi_can_see_cost($roleId),
            'supervisor' => canSupervisor(),
            'review' => canReviewRequest(),
            'plan' => canPlanWork(),
            'verify' => canVerifyWork(),
            'tech' => isTechnician(),
        ],
        'last_updated' => date('Y-m-d H:i:s'),
    ];

    switch ($action) {
        case 'overview': {
            $core = kpi_core_metrics($pdo, $opts);
            $payload = $base;
            $payload['range'] = kpi_parse_range($opts);
            $payload['core'] = $core;
            $payload['alerts'] = kpi_alerts($pdo, $opts);
            $payload['pm'] = kpi_pm_metrics($pdo, $opts);
            $payload['assets'] = kpi_asset_health($pdo);
            if (in_array($roleId, [1, 2, 6, 7], true)) {
                $payload['tech_workload'] = kpi_technician_workload($pdo, $opts);
            }
            if ($roleId === 4 || $roleId === 3) {
                $payload['my_requests'] = dash_my_requests($pdo, $roleId, $uid);
            }
            $payload['options'] = kpi_filter_options($pdo);
            echo json_encode($payload, JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'wo': {
            $opts['group'] = (string)($_GET['group'] ?? 'all');
            $opts['limit'] = (int)($_GET['limit'] ?? 50);
            $opts['offset'] = (int)($_GET['offset'] ?? 0);
            $opts['date_field'] = (string)($_GET['date_field'] ?? '');
            echo json_encode(array_merge($base, kpi_wo_list($pdo, $opts)), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'pm': {
            $opts['group'] = (string)($_GET['group'] ?? 'all');
            $opts['limit'] = (int)($_GET['limit'] ?? 50);
            echo json_encode(array_merge($base, ['items' => kpi_pm_list($pdo, $opts)]), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'downtime': {
            echo json_encode(array_merge($base, kpi_downtime($pdo, $opts)), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'cost': {
            requireRole(kpi_can_see_cost($roleId), 'ไม่มีสิทธิ์ดูข้อมูลต้นทุน');
            echo json_encode(array_merge($base, kpi_cost($pdo, $opts)), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'failure': {
            echo json_encode(array_merge($base, kpi_failure($pdo, $opts)), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'assets': {
            echo json_encode(array_merge($base, ['assets' => kpi_asset_health($pdo)]), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'tech': {
            requireRole(in_array($roleId, [1, 2, 6, 7], true), 'ไม่มีสิทธิ์ดูภาระงานช่าง');
            echo json_encode(array_merge($base, ['items' => kpi_technician_workload($pdo, $opts)]), JSON_UNESCAPED_UNICODE);
            exit;
        }
        case 'options': {
            echo json_encode(array_merge($base, ['options' => kpi_filter_options($pdo)]), JSON_UNESCAPED_UNICODE);
            exit;
        }
        default:
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
exit;

/* ───────────────────────── helpers ───────────────────────── */

/** งาน/คำขอของฉัน สำหรับ Operator / Technician */
function dash_my_requests(PDO $pdo, int $roleId, int $uid): array {
    if ($roleId === 4) {
        $st = $pdo->prepare('SELECT id, request_code, title, priority, status, asset_id, created_at
                             FROM maintenance_requests WHERE requested_by = ? ORDER BY created_at DESC LIMIT 20');
        $st->execute([$uid]);
        return array_map(function ($r) use ($pdo) {
            if ((int)$r['asset_id'] > 0) {
                $a = $pdo->prepare('SELECT code FROM asset_registry WHERE id = ?');
                $a->execute([(int)$r['asset_id']]);
                $r['asset_code'] = (string)$a->fetchColumn();
            } else {
                $r['asset_code'] = null;
            }
            return $r;
        }, $st->fetchAll(PDO::FETCH_ASSOC));
    }
    if ($roleId === 3) {
        $st = $pdo->prepare('SELECT r.id, r.work_order_no, r.title, r.priority, r.status, r.created_at, r.sla_due_at
                             FROM repair r
                             WHERE (r.assigned_to = ? OR r.id IN (SELECT ref_id FROM work_assignees WHERE ref_type = "repair" AND user_id = ?))
                               AND r.status NOT IN ("cancelled","rejected","draft","done","skipped","closed","verified")
                             ORDER BY r.created_at DESC LIMIT 20');
        $st->execute([$uid, $uid]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }
    return [];
}