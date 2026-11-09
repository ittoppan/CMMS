<?php
/**
 * intelligence.php — Phase 23: Advanced CMMS Intelligence API (Executive Analytics)
 *
 * GET /api/v1/intelligence.php?section=...&range=...&filters...
 *
 * section:
 *   overview          — ภาพรวมผู้บริหาร (core KPI + reliability + fleet + คุณภาพข้อมูล)
 *   reliability       — MTBF/MTTR/availability จาก operating time จริง (mtbf_mttr) + รายเดือน
 *   trend             — แนวโน้มราย bucket (day/week/month/quarter)
 *   asset_health      — สถานะเครื่องรายตัว (อธิบายได้ แยกเหตุผลต่อคะแนน)
 *   repeat_failures   — การเสียซ้ำรายเครื่อง + เจาะลงใบงาน (asset_id=...)
 *   downtime_pareto   — Pareto downtime ตามเครื่อง (จาก mtbf_mttr จริง)
 *   priority          — คิวงานตามความเร่งด่วน + aging (ค้างเกินกำหนด)
 *   pm                — PM compliance + แยกตามแผน + รายการ
 *   planned_unplanned — สัดส่วนงานวางแผน vs ฉุกเฉิน (ข้อมูลจริงจากใบงาน)
 *   technicians       — ภาระงานช่าง + การทับซ้อน (ไม่จัดอันดับฝีมือ)
 *   spare             — สต็อก Sage (ของแท้) vs ประวัติการใช้จาก CMMS
 *   cost              — ต้นทุน (reuse kpi_cost) — เริ่มเห็นเฉพาะ role 1,2,6
 *   data_quality      — ความสมบูรณ์ของข้อมูล KPI สำคัญ + ข้อเตือน
 *
 * RBAC (บังคับ server-side):
 *   - ทุก section ต้อง login
 *   - Technician(3) / Operator(4) ถูก scoping โดย kpi_scope เหมือน dashboard
 *   - cost  เฉพาะ role ที่เห็นต้นทุน (kpi_can_see_cost: 1,2,6)
 *   - ทุก KPI ใช้สูตรกลาง kpi.php / analytics.php — ห้ามคำนวณซ้ำฝั่ง client
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
require_once __DIR__ . '/../../../src/helpers/analytics.php';
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
    $st = $pdo->prepare('SELECT id, username, full_name, role_id, role, employee_code FROM users WHERE id = ?');
    $st->execute([$uid]);
    $user = $st->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $roleId = kpi_resolve_role($pdo, $user);
    $roleName = (string)($_SESSION['role_name'] ?? $_SESSION['role'] ?? ($user['role'] ?: ''));
    $section = (string)($_GET['section'] ?? 'overview');
    $allowed = ['overview', 'reliability', 'trend', 'asset_health', 'repeat_failures',
        'downtime_pareto', 'priority', 'pm', 'planned_unplanned', 'technicians', 'spare', 'cost', 'data_quality'];
    if (!in_array($section, $allowed, true)) {
        http_response_code(400);
        echo json_encode(['error' => "Unknown section: {$section}"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // cost เริ่มเห็นเฉพาะ role ที่มีสิทธิ์ต้นทุน
    if ($section === 'cost' && !kpi_can_see_cost($roleId)) {
        http_response_code(403);
        echo json_encode(['error' => 'คุณไม่มีสิทธิ์ดูข้อมูลต้นทุน'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $q = $_GET;
    if (empty($q['range'])) $q['range'] = 'this_year';
    $opts = ana_opts($q);
    $opts['role_id'] = $roleId;
    $opts['user_id'] = $uid;

    $data = null;
    switch ($section) {
        case 'overview':          $data = ana_overview($pdo, $opts); break;
        case 'reliability':       $data = ana_reliability($pdo, $opts); break;
        case 'trend':             $data = ana_trend($pdo, $opts); break;
        case 'asset_health':      $data = ana_asset_health($pdo, $opts); break;
        case 'repeat_failures':   $data = ana_repeat_failures($pdo, $opts); break;
        case 'downtime_pareto':   $data = ana_downtime_pareto($pdo, $opts); break;
        case 'priority':          $data = ana_priority_analysis($pdo, $opts); break;
        case 'pm':                $data = ana_pm_compliance($pdo, $opts); break;
        case 'planned_unplanned': $data = ana_planned_unplanned($pdo, $opts); break;
        case 'technicians':       $data = ana_technician_analytics($pdo, $opts); break;
        case 'spare':             $data = ana_spare_analytics($pdo); break;
        case 'cost':              $data = ana_cost_analytics($pdo, $opts); break;
        case 'data_quality':      $data = ana_data_quality($pdo, $opts); break;
    }

    echo json_encode([
        'status' => 'success',
        'section' => $section,
        'data' => $data,
        'meta' => [
            'user' => ['id' => (int)$user['id'], 'full_name' => $user['full_name'], 'role_id' => $roleId, 'role_name' => $roleName],
            'range' => ['preset' => $q['range'], 'range_start' => $q['range_start'] ?? '', 'range_end' => $q['range_end'] ?? ''],
            'filters' => [
                'department_id' => $q['department_id'] ?? '', 'location_id' => $q['location_id'] ?? '',
                'asset_id' => $q['asset_id'] ?? '', 'asset_category' => $q['asset_category'] ?? '',
                'technician_id' => $q['technician_id'] ?? '', 'source_type' => $q['source_type'] ?? '',
                'priority' => $q['priority'] ?? '', 'status' => $q['status'] ?? '',
                'bucket' => $q['bucket'] ?? 'month', 'search' => $q['search'] ?? '',
            ],
            'can_cost' => kpi_can_see_cost($roleId),
            'generated_at' => date('Y-m-d H:i:s'),
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    api_safe_catch($e);
}