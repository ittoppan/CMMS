<?php
/**
 * CMMS-TPT Inspection History API — Phase 13
 *
 *  GET /api/v1/inspection_history.php?asset=12          -> ประวัติตรวจเฉพาะเครื่อง
 *  GET /api/v1/inspection_history.php                    -> ประวัติล่าสุดทั้งหมด (มีตัวกรอง optional)
 *      &template_id / &result / &date_from / &date_to / &department_id / &location_id / &limit
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

requireLogin(getDb());

try {
    $pdo = getDb();
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $where = [];
    $args = [];
    if (isset($_GET['asset']) && (int)$_GET['asset'] > 0) {
        $where[] = 'asset_id = ?';
        $args[] = (int)$_GET['asset'];
    }
    if (isset($_GET['template_id']) && (int)$_GET['template_id'] > 0) {
        $where[] = 'template_id = ?';
        $args[] = (int)$_GET['template_id'];
    }
    if (isset($_GET['result']) && in_array($_GET['result'], ['pass', 'pass_with_warning', 'fail', 'critical_fail'], true)) {
        $where[] = 'result = ?';
        $args[] = $_GET['result'];
    }
    if (isset($_GET['date_from']) && $_GET['date_from'] !== '') { $where[] = 'due_date >= ?'; $args[] = $_GET['date_from']; }
    if (isset($_GET['date_to']) && $_GET['date_to'] !== '')     { $where[] = 'due_date <= ?'; $args[] = $_GET['date_to']; }

    // กองกลางใกล้ตัว (department ที่ผู้ใช้อยู่ในช่วงนี้) ใช้ได้เฉพาะ supervisor/admin
    $sup = in_array(currentRoleId(), [1, 2, 6, 7], true);

    $limit = min((int)($_GET['limit'] ?? 100), 500);
    if ($limit <= 0) $limit = 100;

    $sql = 'SELECT schedule_id, asset_id, asset_code, asset_name,
                   template_id, template_code, template_title,
                   due_date, started_at, completed_at, status, result,
                   fail_count, priority, inspector_name,
                   failed_items_count, failed_items_summary,
                   work_order_id, work_order_code,
                   maintenance_request_id, request_code
            FROM v_asset_inspection_history';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY completed_at DESC, due_date DESC LIMIT ' . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    $rows = $stmt->fetchAll();

    // ผลรวมแบบกลุ่ม (ฝั่ง client ใช้ได้โดยไม่ต้อง query ซ้ำ)
    $stats = null;
    $asset = isset($_GET['asset']) ? (int)$_GET['asset'] : 0;
    if ($asset > 0) {
        $qs = $pdo->prepare(
            'SELECT COUNT(*) AS total, SUM(CASE WHEN result IN ("pass","pass_with_warning") THEN 1 ELSE 0 END) AS passed,
                    SUM(CASE WHEN result="fail" THEN 1 ELSE 0 END) AS failed,
                    SUM(CASE WHEN result="critical_fail" THEN 1 ELSE 0 END) AS critical_failed
             FROM v_asset_inspection_history WHERE asset_id = ?'
        );
        $qs->execute([$asset]);
        $stats = $qs->fetch();
    }

    echo json_encode([
        'count'   => count($rows),
        'asset'   => $asset,
        'stats'   => $stats,
        'history' => $rows,
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}