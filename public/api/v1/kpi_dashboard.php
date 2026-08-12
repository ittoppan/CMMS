<?php
/**
 * kpi_dashboard.php — ข้อมูล KPI ผู้บริหาร
 *
 * GET /api/v1/kpi_dashboard.php?months=12
 * คืนข้อมูลรวม: MTTR/MTBF (ล่าสุด + เทรนด์), %PM ทันกำหนด, %งานปิดใน SLA,
 * ค่าใช้จ่ายซ่อมรายเดือน, จำนวนงาน/สถานะ
 *
 * นิยาม SLA (ตาม sla_control.php):
 *   - Response Time < 15 นาที (created_at -> acknowledged_at)
 *   - Resolution Time < 120 นาที (created_at -> completed_at)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $months = max(1, min(36, (int)($_GET['months'] ?? 12)));
    $since = date('Y-m-01', strtotime("-" . ($months - 1) . " months"));

    $out = ['period_months' => $months, 'since' => $since];

    // ---------- MTBF / MTTR: ค่าล่าสุด + เทรนด์ ----------
    $latest = $pdo->query("
        SELECT year, month, ROUND(AVG(mtbf_hours),1) AS mtbf, ROUND(AVG(mttr_minutes),1) AS mttr,
               SUM(total_failures) AS failures, SUM(total_downtime_minutes) AS downtime
        FROM mtbf_mttr
        GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 1
    ")->fetch();
    $trend = $pdo->query("
        SELECT CONCAT(year, '-', LPAD(month, 2, '0')) AS ym,
               ROUND(AVG(mtbf_hours),1) AS mtbf, ROUND(AVG(mttr_minutes),1) AS mttr
        FROM mtbf_mttr
        GROUP BY year, month ORDER BY year ASC, month ASC LIMIT 12
    ")->fetchAll();
    $out['mtbf_mttr'] = ['latest' => $latest ?: null, 'trend' => $trend];

    // ---------- PM: ทันกำหนด ----------
    $pm = $pdo->query("
        SELECT
            COUNT(*) AS total_completed,
            SUM(CASE WHEN completed_at IS NOT NULL AND completed_at <= due_date THEN 1 ELSE 0 END) AS on_time,
            SUM(CASE WHEN completed_at IS NOT NULL AND completed_at > due_date THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN status = 'pending' AND due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_pending
        FROM pm_am
        WHERE status = 'completed' OR (status = 'pending' AND due_date >= '$since')
    ")->fetch();
    $out['pm'] = $pm ?: ['total_completed' => 0, 'on_time' => 0, 'late' => 0, 'overdue_pending' => 0];

    // ---------- Repair: หัวข้อหลัก + SLA + ค่าใช้จ่าย ----------
    $closed = "status IN ('resolved','closed','completed')";
    $openStatus = "status NOT IN ('resolved','closed','completed','cancelled','rejected')";
    $headline = $pdo->query("
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN $closed THEN 1 ELSE 0 END) AS closed_cnt,
            SUM(CASE WHEN $openStatus THEN 1 ELSE 0 END) AS open_cnt,
            SUM(CASE WHEN $openStatus AND estimated_completion_date IS NOT NULL AND estimated_completion_date < NOW() THEN 1 ELSE 0 END) AS overdue,
            ROUND(SUM(CASE WHEN $closed AND completed_at IS NOT NULL AND TIMESTAMPDIFF(MINUTE, created_at, completed_at) <= 120 THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN $closed AND completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) * 100, 1) AS sla_pct,
            ROUND(SUM(COALESCE(cost_parts,0) + COALESCE(cost_labor,0) + COALESCE(cost_outsource,0)), 2) AS cost_total
        FROM repair WHERE created_at >= '$since'
    ")->fetch();
    $out['headline'] = $headline ?: [];

    // ค่าใช้จ่ายรายเดือน (12 เดือน)
    $cost = $pdo->query("
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym,
               COUNT(*) AS cnt,
               ROUND(SUM(COALESCE(cost_parts,0) + COALESCE(cost_labor,0) + COALESCE(cost_outsource,0)), 2) AS cost
        FROM repair WHERE created_at >= '$since'
        GROUP BY ym ORDER BY ym
    ")->fetchAll();
    $out['cost_trend'] = $cost;

    // SLA % รายเดือน (งานปิดใน <=120 นาที)
    $sla = $pdo->query("
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym,
               COUNT(*) AS total,
               SUM(CASE WHEN completed_at IS NOT NULL AND TIMESTAMPDIFF(MINUTE, created_at, completed_at) <= 120 THEN 1 ELSE 0 END) AS on_sla
        FROM repair
        WHERE $closed AND created_at >= '$since'
        GROUP BY ym ORDER BY ym
    ")->fetchAll();
    foreach ($sla as &$s) {
        $s['sla_pct'] = $s['total'] > 0 ? round($s['on_sla'] / $s['total'] * 100, 1) : null;
    }
    unset($s);
    $out['sla_trend'] = $sla;

    // สถานะงานปัจจุบัน
    $statuses = $pdo->query("SELECT status, COUNT(*) AS cnt FROM repair GROUP BY status ORDER BY cnt DESC")->fetchAll();
    $out['status_dist'] = $statuses;

    // ค่าใช้จ่ายรายเดือนล่าสุด
    $out['headline']['cost_month'] = $out['cost_trend'] ? (float)end($out['cost_trend'])['cost'] : 0;

    echo json_encode($out, JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
