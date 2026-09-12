<?php
/**
 * CMMS-TPT Inspection Dashboard API — Phase 13
 *
 *  GET /api/v1/inspection_dashboard.php?filters=1
 *      -> KPI ตามตัวกรอง (department_id / location_id / date_from / date_to)
 *      + รายการ schedule แยกตามสถานะ (due_today / overdue / in_progress / completed / all)
 *  GET /api/v1/inspection_dashboard.php?week=1  -> แนวโน้มย้อนหลัง 12 สัปดาห์ (due + completed)
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

    if (isset($_GET['week'])) {
        weeklyTrend($pdo);
        exit;
    }
    if (isset($_GET['locations'])) {
        $rows = $pdo->query('SELECT id, name FROM locations ORDER BY name')->fetchAll();
        echo json_encode($rows, JSON_UNESCAPED_UNICODE);
        exit;
    }
    dashboard($pdo);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

/** KPI + รายการตามสถานะ (รองรับตัวกรอง) */
function dashboard(PDO $pdo): void {
    $f = [
        'department_id' => isset($_GET['department_id']) && $_GET['department_id'] !== '' ? (int)$_GET['department_id'] : null,
        'location_id'   => isset($_GET['location_id']) && $_GET['location_id'] !== '' ? (int)$_GET['location_id'] : null,
        'date_from'     => trim((string)($_GET['date_from'] ?? '')),
        'date_to'       => trim((string)($_GET['date_to'] ?? '')),
    ];

    $where = [];
    $args = [];
    if ($f['department_id']) { $where[] = 's.department_id = ?'; $args[] = $f['department_id']; }
    if ($f['location_id'])   { $where[] = 's.location_id = ?';   $args[] = $f['location_id']; }
    if ($f['date_from'])     { $where[] = 's.due_date >= ?';     $args[] = $f['date_from']; }
    if ($f['date_to'])       { $where[] = 's.due_date <= ?';     $args[] = $f['date_to']; }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $hasFilter = (bool)$where;
    if ($hasFilter) {
        $q = "SELECT
                COUNT(*) AS total_schedules,
                SUM(CASE WHEN `s`.`status`='pending' AND `s`.`due_date`=CURDATE() THEN 1 ELSE 0 END) AS due_today,
                SUM(CASE WHEN `s`.`status`='pending' AND `s`.`due_date`<CURDATE() THEN 1 ELSE 0 END) AS overdue,
                SUM(CASE WHEN `s`.`status`='in_progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN `s`.`status`='completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN `s`.`result`='pass' THEN 1 ELSE 0 END) AS passed,
                SUM(CASE WHEN `s`.`result` IN ('fail','critical_fail') THEN 1 ELSE 0 END) AS failed,
                SUM(CASE WHEN `s`.`result`='critical_fail' THEN 1 ELSE 0 END) AS critical_fail,
                CASE WHEN SUM(CASE WHEN `s`.`status`='completed' THEN 1 ELSE 0 END)>0
                     THEN ROUND(SUM(CASE WHEN `s`.`result`='pass' THEN 1 ELSE 0 END)/SUM(CASE WHEN `s`.`status`='completed' THEN 1 ELSE 0 END)*100,2)
                     ELSE 0 END AS avg_score_pct,
                CASE WHEN COUNT(*)>0
                     THEN ROUND(SUM(CASE WHEN `s`.`status`='completed' THEN 1 ELSE 0 END)/COUNT(*)*100,2)
                     ELSE 0 END AS compliance_pct
              FROM inspection_schedules s$whereSql";
        $st = $pdo->prepare($q);
        $st->execute($args);
        $kpi = $st->fetch();
        $kpi['filtered'] = true;
    } else {
        $kpi = $pdo->query('SELECT * FROM v_inspection_dashboard_kpis')->fetch();
        $kpi['filtered'] = false;
    }

    // รายการ schedule ตามสถานะ
    $scope = trim((string)($_GET['scope'] ?? 'all'));
    $scopeWhere = [
        'due_today'   => "(s.status='pending' AND s.due_date=CURDATE())",
        'overdue'     => "(s.status='pending' AND s.due_date<CURDATE())",
        'in_progress' => "(s.status='in_progress')",
        'completed'   => "(s.status='completed')",
    ];
    if (!isset($scopeWhere[$scope])) {
        $scopeWhere[$scope] = "(s.status=" . $pdo->quote($scope) . ")";
    }
    $listSql = 'SELECT s.id, s.template_id, s.asset_id, s.due_date, s.started_at, s.completed_at, s.status, s.result,
                    s.fail_count, s.priority, s.estimated_duration_min,
                    t.title AS template_title, t.frequency,
                    a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
                    d.name AS department_name, l.name AS location_name, u.full_name AS inspector_name
                FROM inspection_schedules s
                LEFT JOIN inspection_templates t ON t.id = s.template_id
                LEFT JOIN asset_registry a ON a.id = s.asset_id
                LEFT JOIN departments d ON d.id = s.department_id
                LEFT JOIN locations l ON l.id = s.location_id
                LEFT JOIN users u ON u.id = s.inspector_id ' .
                $whereSql . ' AND ' . $scopeWhere[$scope] . '
                ORDER BY s.due_date ASC, s.id DESC LIMIT 500';
    $st = $pdo->prepare($listSql);
    $st->execute($args);
    $list = $st->fetchAll();

    echo json_encode([
        'kpis'        => $kpi,
        'filters'     => $f,
        'scope'       => $scope,
        'schedules'   => $list,
        'count'       => count($list),
    ], JSON_UNESCAPED_UNICODE);
}

/** แนวโน้มรายสัปดาห์ ย้อนหลัง 12 สัปดาห์ */
function weeklyTrend(PDO $pdo): void {
    $rows = $pdo->query(
        'SELECT YEARWEEK(s.due_date, 3) AS yw,
                MIN(s.due_date) AS week_start,
                COUNT(*) AS due,
                SUM(CASE WHEN s.status="completed" THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN s.result IN ("fail","critical_fail") THEN 1 ELSE 0 END) AS failed
         FROM inspection_schedules s
         WHERE s.due_date >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
         GROUP BY YEARWEEK(s.due_date, 3)
         ORDER BY yw ASC'
    )->fetchAll();
    echo json_encode(['weeks' => $rows], JSON_UNESCAPED_UNICODE);
}