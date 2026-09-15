<?php
/**
 * reports.php — Report Center API (Phase 17)
 *
 * GET /api/v1/reports.php?resource=center&range=30d&department_id=1
 * GET /api/v1/reports.php?resource=work-orders&status=open&limit=50&offset=0
 * GET /api/v1/reports.php?resource=cost&export=csv
 * GET /api/v1/reports.php?resource=spare-parts&export=xlsx
 *
 * เต้ารับเดียวของทุกหน้าจอ Report Center:
 *   - resource: center | work-orders | requests | pm | inspections | assets
 *               | spare-parts | cost | downtime | technicians | sla | mttr-mtbf
 *   - การคำนวณ + scope + filter อยู่ที่ src/helpers/reports.php (server-side เสมอ)
 *   - export=csv / export=xlsx ส่งออกไฟล์จริง + บันทึก report_audit_log
 *
 * Permission (server-side บังคับ — ดู rpt_permitted):
 *   - cost        → เฉพาะ role 1,2,6
 *   - technicians → เฉพาะ role 1,2,6,7
 *   - นอกนั้นทุก role เห็นตาม scope ของตน (tech=งานตัวเอง, operator=คำขอตัวเอง)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
require_once __DIR__ . '/../../../src/helpers/reports.php';

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
    $resource = (string)($_GET['resource'] ?? '');
    $export = (string)($_GET['export'] ?? '');
    if ($resource === '') $resource = 'center';

    $st = $pdo->prepare('SELECT id, username, full_name, role_id, role, employee_code FROM users WHERE id = ?');
    $st->execute([$uid]);
    $user = $st->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* กาเครื่องหมาย index ที่จำเป็นก่อนเรียกจริง (idempotent) */
    rpt_ensure_indexes($pdo);

    $opts = rpt_opts();
    if ($export !== '') $opts['export'] = $export;

    if ($export === 'csv') {
        rpt_export_csv($pdo, $user, $resource, $opts, '');
    }
    if ($export === 'xlsx') {
        rpt_export_xlsx($pdo, $user, $resource, $opts, '');
    }

    $data = rpt_dispatch($pdo, $user, $resource, $opts);
    $meta = rpt_meta($pdo, $user, $resource);

    echo json_encode(array_merge($meta, $data), JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Report error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}