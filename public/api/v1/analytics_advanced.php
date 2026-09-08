<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

/**
 * analytics_advanced.php — วิเคราะห์เจาะลึก (Drill-down Analytics)
 *
 * กลุ่มข้อมูล (ทั้งหมดคือข้อมูลจริงจากฐานข้อมูล ไม่มีการ mock):
 *   downtime    — เวลาหยุดและความพร้อมใช้งานรายเครื่อง + แนวโน้มรายเดือน
 *   cost        — ค่าใช้จ่ายรายเครื่อง/รายแผนก + แนวโน้ม + สัดส่วนหมวดค่าใช้จ่าย
 *   sla         — ความเร็วตอบสนอง / ปิดงานทันกำหนด / อัตรางานเปิดใหม่ (reopen)
 *   pm_breakdown— เปรียบเทียบ PM ครบ vs อัตรา Breakdown รายเครื่อง (PM คุ้มไหม)
 *   stock       — มูลค่าสต็อก / ซัพพลายเออร์ / หมวดหมู่ / รายการเกิน-ต่ำ
 *   tech        — ภาระงานและ MTTR รายช่าง
 *   inspection  — อัตราผ่าน/ไม่ผ่านการตรวจเช็ค + แนวโน้มรายเดือน
 *   calibration — ใกล้หมดอายุ/เกินกำหนด + ค่าใช้จ่ายสอบเทียบ
 *
 * ตารางบางตารางยังไม่มีข้อมูล (spare_part_transactions, requisitions,
 * repair_ratings) → ปล่อยเป็น [] อย่างปลอดภัย ไม่ทำ endpoint แตก
 */

try {
    $pdo = getDb();
    requireLogin($pdo);
    $year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
    $now  = date('Y-m-d H:i:s');

    $monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

    $months = static function () use ($monthNames) {
        $out = [];
        for ($i = 1; $i <= 12; $i++) $out[] = ['monthNum' => $i, 'month' => $monthNames[$i - 1]];
        return $out;
    };

    /* ============ 1. DOWNTIME & AVAILABILITY ============ */
    $downAsset = [];
    $overall = $pdo->prepare("
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(COALESCE(downtime_minutes,0)),0) AS total_min,
               COALESCE(SUM(CASE WHEN downtime_minutes > 0 THEN 1 ELSE 0 END),0) AS with_dt
        FROM repair WHERE YEAR(created_at) = ?
    ");
    $overall->execute([$year]);
    $ow = $overall->fetch(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare("
        SELECT a.id, a.code, a.name,
               COUNT(r.id) AS cnt,
               COALESCE(SUM(CASE WHEN r.source_type='breakdown' THEN 1 ELSE 0 END),0) AS breakdown_cnt,
               COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS total_min,
               COALESCE(ROUND(AVG(CASE WHEN r.downtime_minutes > 0 THEN r.downtime_minutes END)),0) AS avg_min
        FROM repair r
        LEFT JOIN asset_registry a ON a.id = r.asset_id
        WHERE YEAR(r.created_at) = ?
        GROUP BY a.id, a.code, a.name
        HAVING total_min > 0 OR cnt > 0
        ORDER BY total_min DESC
        LIMIT 15
    ");
    $stmt->execute([$year]);
    $downAsset = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // แนวโน้ม Downtime รายเดือน
    $dmt = $pdo->prepare("
        SELECT MONTH(created_at) m, SUM(COALESCE(downtime_minutes,0)) AS minutes, COUNT(*) AS cnt
        FROM repair WHERE YEAR(created_at) = ?
        GROUP BY MONTH(created_at)
    ");
    $dmt->execute([$year]);
    $dmtMap = [];
    foreach ($dmt->fetchAll(PDO::FETCH_ASSOC) as $r) $dmtMap[(int)$r['m']] = $r;
    $downtimeMonthly = [];
    foreach ($months() as $mo) {
        $r = $dmtMap[$mo['monthNum']] ?? ['minutes' => 0, 'cnt' => 0];
        $downtimeMonthly[] = ['month' => $mo['month'], 'minutes' => (int)$r['minutes'], 'cnt' => (int)$r['cnt']];
    }

    // ความพร้อมใช้งานรายเครื่อง จาก mtbf_mttr (operating_hours จริง)
    $avail = [];
    $st = $pdo->prepare("
        SELECT m.asset_id, a.code, a.name,
               COALESCE(SUM(m.operating_hours),0) AS op_hrs,
               COALESCE(SUM(m.total_downtime_minutes),0) AS dt_min,
               COALESCE(SUM(m.total_failures),0) AS fails
        FROM mtbf_mttr m
        LEFT JOIN asset_registry a ON a.id = m.asset_id
        WHERE m.year = ?
        GROUP BY m.asset_id, a.code, a.name
        HAVING op_hrs > 0
        ORDER BY (SUM(m.total_downtime_minutes) / NULLIF(SUM(m.operating_hours),0)) DESC
    ");
    $st->execute([$year]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $opHrs = (float)$r['op_hrs'];
        $dtHrs = ((float)$r['dt_min']) / 60;
        $avail[] = [
            'code' => $r['code'] ?? '-', 'name' => $r['name'] ?? '',
            'operating_hours' => (int)$opHrs,
            'downtime_hours' => round($dtHrs, 1),
            'failures' => (int)$r['fails'],
            'availability_pct' => round(($opHrs + $dtHrs) > 0 ? 100 * $opHrs / ($opHrs + $dtHrs) : 0, 2),
        ];
    }

    // ความพร้อมโรงงานรายเดือน จาก monthly_kpi_snapshot
    $plantAvail = [];
    $st = $pdo->prepare("SELECT month, availability_rate FROM monthly_kpi_snapshot WHERE year = ? ORDER BY month");
    $st->execute([$year]);
    $paMap = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $paMap[(int)$r['month']] = (float)$r['availability_rate'];
    foreach ($months() as $mo) {
        $plantAvail[] = ['month' => $mo['month'], 'availability_pct' => round($paMap[$mo['monthNum']] ?? 0, 2)];
    }

    /* ============ 2. COST ANALYSIS ============ */
    $costByAsset = [];
    $st = $pdo->prepare("
        SELECT a.code, a.name,
               COALESCE(SUM(COALESCE(r.cost_parts,0)),0) AS parts,
               COALESCE(SUM(COALESCE(r.cost_labor,0)),0) AS labor,
               COALESCE(SUM(COALESCE(r.cost_outsource,0)),0) AS outsource,
               COUNT(r.id) AS cnt
        FROM repair r
        LEFT JOIN asset_registry a ON a.id = r.asset_id
        WHERE YEAR(r.created_at) = ?
        GROUP BY a.code, a.name
        ORDER BY (SUM(COALESCE(r.cost_parts,0)) + SUM(COALESCE(r.cost_labor,0)) + SUM(COALESCE(r.cost_outsource,0))) DESC
        LIMIT 10
    ");
    $st->execute([$year]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $total = (float)$r['parts'] + (float)$r['labor'] + (float)$r['outsource'];
        $costByAsset[] = [
            'code' => $r['code'] ?? '-', 'name' => $r['name'] ?? '',
            'parts' => (float)$r['parts'], 'labor' => (float)$r['labor'],
            'outsource' => (float)$r['outsource'], 'total' => $total, 'cnt' => (int)$r['cnt'],
        ];
    }

    $costByDept = [];
    $st = $pdo->prepare("
        SELECT d.name, COUNT(r.id) AS cnt,
               COALESCE(SUM(COALESCE(r.cost_parts,0) + COALESCE(r.cost_labor,0) + COALESCE(r.cost_outsource,0)),0) AS total
        FROM repair r
        LEFT JOIN departments d ON d.id = r.department_id
        WHERE YEAR(r.created_at) = ?
        GROUP BY d.name
        ORDER BY total DESC
    ");
    $st->execute([$year]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $costByDept[] = ['name' => $r['name'] ?? '—', 'cnt' => (int)$r['cnt'], 'total' => (float)$r['total']];
    }

    $costMonthly = [];
    $st = $pdo->prepare("
        SELECT MONTH(created_at) m,
               SUM(COALESCE(cost_parts,0)) AS parts,
               SUM(COALESCE(cost_labor,0)) AS labor,
               SUM(COALESCE(cost_outsource,0)) AS outsource
        FROM repair WHERE YEAR(created_at) = ?
        GROUP BY MONTH(created_at)
    ");
    $st->execute([$year]);
    $cmMap = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $cmMap[(int)$r['m']] = $r;
    foreach ($months() as $mo) {
        $r = $cmMap[$mo['monthNum']] ?? ['parts' => 0, 'labor' => 0, 'outsource' => 0];
        $costMonthly[] = [
            'month' => $mo['month'],
            'parts' => (float)$r['parts'], 'labor' => (float)$r['labor'], 'outsource' => (float)$r['outsource'],
        ];
    }

    $costTotal = array_reduce($costByDept, fn($s, $d) => $s + $d['total'], 0);
    $stockQtyCost = 0;

    /* ============ 3. SLA & QUALITY ============ */
    $sla = ['total_completed' => 0, 'open' => 0, 'avg_response_minutes' => 0, 'response_ok_4h_pct' => 0, 'avg_repair_minutes' => 0, 'on_time_pct' => 0, 'reopen_count' => 0, 'pct_breakdown' => 0];
    $st = $pdo->prepare("
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS done,
               SUM(CASE WHEN status!='completed' THEN 1 ELSE 0 END) AS opencnt,
               COALESCE(AVG(COALESCE(response_time_minutes,0)),0) AS avg_resp,
               COALESCE(AVG(CASE WHEN status='completed' AND COALESCE(response_time_minutes,0)>0 THEN response_time_minutes END),0) AS avg_resp_done,
               COALESCE(AVG(CASE WHEN status='completed' AND COALESCE(response_time_minutes,0) BETWEEN 1 AND 240 THEN 1 ELSE 0 END),0) AS cnt_resp_ok,
               COALESCE(AVG(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) AS done_cnt,
               COALESCE(AVG(COALESCE(repair_time_minutes,0)),0) AS avg_repair,
               COALESCE(SUM(CASE WHEN status='completed' AND completed_at IS NOT NULL AND estimated_completion_date IS NOT NULL AND DATE(completed_at) <= estimated_completion_date THEN 1 ELSE 0 END),0) AS ontime,
               COALESCE(SUM(CASE WHEN status='completed' AND estimated_completion_date IS NOT NULL THEN 1 ELSE 0 END),0) AS ontime_denom,
               COALESCE(SUM(reopened),0) AS reopen,
               COALESCE(SUM(CASE WHEN source_type='breakdown' THEN 1 ELSE 0 END),0) AS breakdown_cnt
        FROM repair WHERE YEAR(created_at) = ?
    ");
    $st->execute([$year]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $done = (int)$row['done'];
        $sla = [
            'total_completed' => $done,
            'open' => (int)$row['opencnt'],
            'avg_response_minutes' => round((float)$row['avg_resp'], 1),
            'avg_response_minutes_done' => round((float)$row['avg_resp_done'], 1),
            'response_ok_4h_pct' => $done > 0 ? round(100 * (float)$row['cnt_resp_ok'] / $done, 1) : 0,
            'avg_repair_minutes' => round((float)$row['avg_repair'], 1),
            'on_time_pct' => (int)$row['ontime_denom'] > 0 ? round(100 * (int)$row['ontime'] / (int)$row['ontime_denom'], 1) : 0,
            'reopen_count' => (int)$row['reopen'],
            'breakdown_pct' => (int)$row['total'] > 0 ? round(100 * (int)$row['breakdown_cnt'] / (int)$row['total'], 1) : 0,
        ];
    }

    /* ============ 4. PM vs BREAKDOWN ============ */
    $pmBreak = [];
    $st = $pdo->prepare("
        SELECT a.code, a.name,
               COUNT(DISTINCT p.id) AS pm_cnt,
               COALESCE(SUM(CASE WHEN r.source_type='breakdown' THEN 1 ELSE 0 END),0) AS breakdown_cnt,
               COUNT(r.id) AS wo_cnt
        FROM asset_registry a
        LEFT JOIN pm_am p ON p.asset_id = a.id
        LEFT JOIN repair r ON r.asset_id = a.id AND YEAR(r.created_at) = ?
        GROUP BY a.id, a.code, a.name
        HAVING pm_cnt > 0 OR wo_cnt > 0
        ORDER BY breakdown_cnt DESC, pm_cnt DESC
    ");
    $st->execute([$year]);
    $pmBreak = $st->fetchAll(PDO::FETCH_ASSOC);

    // สรุป correlation: อัตรา breakdown เฉลี่ยของกลุ่มทำ PM แล้ว vs ไม่ได้ทำ
    $withPm = array_filter($pmBreak, fn($x) => (int)$x['pm_cnt'] > 0);
    $woPm   = array_filter($pmBreak, fn($x) => (int)$x['pm_cnt'] === 0);
    $rate = static function (array $set) {
        $wo = array_sum(array_map(fn($x) => (int)$x['wo_cnt'], $set));
        $bd = array_sum(array_map(fn($x) => (int)$x['breakdown_cnt'], $set));
        return $wo > 0 ? round(100 * $bd / $wo, 1) : 0;
    };
    $corr = [
        'with_pm_assets' => count($withPm), 'without_pm_assets' => count($woPm),
        'with_pm_breakdown_pct' => $rate($withPm), 'without_pm_breakdown_pct' => $rate($woPm),
        'with_pm_wo' => array_sum(array_map(fn($x) => (int)$x['wo_cnt'], $withPm)),
        'without_pm_wo' => array_sum(array_map(fn($x) => (int)$x['wo_cnt'], $woPm)),
    ];

    /* ============ 5. STOCK & SUPPLIERS ============ */
    $stockSummary = ['items' => 0, 'value' => 0, 'low' => 0, 'over' => 0, 'reserved' => 0];
    $stockBySupplier = [];
    $stockByCategory = [];
    $stockTopValue = [];
    $st = $pdo->query("
        SELECT COALESCE(SUM(stock_qty),0) AS qty,
               COALESCE(SUM(stock_qty * unit_price),0) AS val,
               COALESCE(SUM(CASE WHEN stock_qty < min_stock THEN 1 ELSE 0 END),0) AS low,
               COALESCE(SUM(CASE WHEN max_stock > 0 AND stock_qty > max_stock THEN 1 ELSE 0 END),0) AS over_count,
               COALESCE(SUM(reserved_qty),0) AS reserved,
               COUNT(*) AS cnt
        FROM spare_parts
    ");
    $sw = $st->fetch(PDO::FETCH_ASSOC);
    if ($sw) {
        $stockSummary = [
            'items' => (int)$sw['cnt'], 'qty' => (int)$sw['qty'], 'value' => (float)$sw['val'],
            'low' => (int)$sw['low'], 'over' => (int)$sw['over_count'], 'reserved' => (int)$sw['reserved'],
        ];

        $stockQtyCost = (float)$sw['val'];
    }

    $st = $pdo->query("
        SELECT COALESCE(s.name,'—') AS name, COUNT(p.id) AS cnt, COALESCE(SUM(p.stock_qty * p.unit_price),0) AS val
        FROM spare_parts p LEFT JOIN suppliers s ON s.id = p.supplier_id
        GROUP BY s.name ORDER BY val DESC
    ");
    $stockBySupplier = array_map(fn($r) => ['name' => $r['name'], 'cnt' => (int)$r['cnt'], 'value' => (float)$r['val']], $st->fetchAll(PDO::FETCH_ASSOC));

    $st = $pdo->query("
        SELECT COALESCE(category,'—') AS name, COUNT(*) AS cnt, COALESCE(SUM(stock_qty * unit_price),0) AS val
        FROM spare_parts GROUP BY category ORDER BY val DESC
    ");
    $stockByCategory = array_map(fn($r) => ['name' => $r['name'], 'cnt' => (int)$r['cnt'], 'value' => (float)$r['val']], $st->fetchAll(PDO::FETCH_ASSOC));

    $st = $pdo->query("
        SELECT code, name, stock_qty, unit_price, reserved_qty, min_stock, max_stock, category
        FROM spare_parts ORDER BY stock_qty * unit_price DESC LIMIT 8
    ");
    $stockTopValue = $st->fetchAll(PDO::FETCH_ASSOC);

    /* ============ 6. TECHNICIAN PERFORMANCE ============ */
    $tech = [];
    $transactions_ok = false;
    $st = $pdo->prepare("
        SELECT u.id, u.full_name,
               COUNT(r.id) AS jobs,
               COALESCE(SUM(CASE WHEN r.status='completed' THEN 1 ELSE 0 END),0) AS done,
               COALESCE(SUM(CASE WHEN r.status!='completed' THEN 1 ELSE 0 END),0) AS opencnt,
               COALESCE(AVG(CASE WHEN r.status='completed' THEN r.repair_time_minutes END),0) AS avg_repair_min,
               COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt_min,
               COALESCE(SUM(COALESCE(r.cost_parts,0)+COALESCE(r.cost_labor,0)+COALESCE(r.cost_outsource,0)),0) AS cost
        FROM users u
        LEFT JOIN repair r ON r.assigned_to = u.id AND YEAR(r.created_at) = ?
        WHERE u.is_active = 1 AND u.role IN ('admin','manager','technician')
        GROUP BY u.id, u.full_name
        HAVING jobs > 0
        ORDER BY done DESC
    ");
    $st->execute([$year]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $tech[] = [
            'name' => $r['full_name'], 'jobs' => (int)$r['jobs'], 'done' => (int)$r['done'],
            'open' => (int)$r['opencnt'],
            'avg_repair_min' => (int)round((float)$r['avg_repair_min']),
            'downtime_hours' => round((float)$r['dt_min'] / 60, 1),
            'cost' => (float)$r['cost'],
        ];
    }

    /* ============ 7. INSPECTION TREND ============ */
    $inspTrend = [];
    $inspSummary = ['pass' => 0, 'fail' => 0, 'total' => 0];
    $st = $pdo->prepare("
        SELECT MONTH(COALESCE(completed_at, due_date)) m,
               COALESCE(SUM(CASE WHEN result='pass' THEN 1 ELSE 0 END),0) AS pass,
               COALESCE(SUM(CASE WHEN result='fail' THEN 1 ELSE 0 END),0) AS fail,
               COUNT(*) AS total
        FROM inspection_schedules
        WHERE YEAR(COALESCE(completed_at, due_date)) = ?
        GROUP BY MONTH(COALESCE(completed_at, due_date))
    ");
    $st->execute([$year]);
    $itMap = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $itMap[(int)$r['m']] = $r;
    foreach ($months() as $mo) {
        $r = $itMap[$mo['monthNum']] ?? ['pass' => 0, 'fail' => 0, 'total' => 0];
        $inspTrend[] = ['month' => $mo['month'], 'pass' => (int)$r['pass'], 'fail' => (int)$r['fail'], 'total' => (int)$r['total']];
        $inspSummary['pass'] += (int)$r['pass'];
        $inspSummary['fail'] += (int)$r['fail'];
        $inspSummary['total'] += (int)$r['total'];
    }

    /* ============ 8. CALIBRATION ============ */
    $cal = ['overdue' => 0, 'due_30' => 0, 'due_60' => 0, 'latest_cost' => 0, 'recent' => [], 'overdue_list' => []];
    $st = $pdo->prepare("
        SELECT COUNT(*) c FROM calibration
        WHERE next_calibration_date IS NOT NULL AND next_calibration_date < CURDATE() AND status != 'completed'
    ");
    $st->execute();
    $cal['overdue'] = (int)$st->fetchColumn();

    $st = $pdo->prepare("SELECT COUNT(*) FROM calibration WHERE next_calibration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)");
    $st->execute();
    $cal['due_30'] = (int)$st->fetchColumn();

    $st = $pdo->prepare("SELECT COUNT(*) FROM calibration WHERE next_calibration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)");
    $st->execute();
    $cal['due_60'] = (int)$st->fetchColumn();

    $st = $pdo->prepare("SELECT COALESCE(SUM(total_cost),0) FROM calibration WHERE YEAR(calibration_date) = ?");
    $st->execute([$year]);
    $cal['latest_cost'] = (float)$st->fetchColumn();

    $st = $pdo->prepare("
        SELECT c.id, a.code, a.name, c.calibration_type, c.next_calibration_date, c.status, c.total_cost
        FROM calibration c LEFT JOIN asset_registry a ON a.id = c.asset_id
        ORDER BY c.next_calibration_date IS NULL, c.next_calibration_date ASC LIMIT 8
    ");
    $st->execute();
    $cal['recent'] = $st->fetchAll(PDO::FETCH_ASSOC);

    $st = $pdo->prepare("
        SELECT a.code, a.name, c.next_calibration_date, c.status
        FROM calibration c LEFT JOIN asset_registry a ON a.id = c.asset_id
        WHERE c.next_calibration_date IS NOT NULL AND c.next_calibration_date < CURDATE() AND c.status != 'completed'
        ORDER BY c.next_calibration_date ASC LIMIT 10
    ");
    $st->execute();
    $cal['overdue_list'] = $st->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'year' => $year,
        'data' => [
            'downtime' => [
                'by_asset' => $downAsset,
                'monthly' => $downtimeMonthly,
                'per_asset_availability' => $avail,
                'plant_monthly_availability' => $plantAvail,
                'summary' => [
                    'total_wo' => (int)($ow['cnt'] ?? 0),
                    'total_downtime_minutes' => (int)($ow['total_min'] ?? 0),
                    'with_downtime_wo' => (int)($ow['with_dt'] ?? 0),
                ],
            ],
            'cost' => [
                'by_asset' => $costByAsset,
                'by_department' => $costByDept,
                'monthly' => $costMonthly,
                'summary' => [
                    'total' => $costTotal,
                    'per_wo' => $costTotal > 0 && !empty($costByDept) ? round($costTotal / array_sum(array_map(fn($d) => $d['cnt'], $costByDept))) : 0,
                    'part_ratio' => $costTotal > 0 ? round(100 * array_sum(array_map(fn($m) => $m['parts'], $costMonthly)) / $costTotal, 1) : 0,
                ],
            ],
            'sla' => $sla,
            'pm_breakdown' => ['by_asset' => $pmBreak, 'correlation' => $corr],
            'stock' => [
                'summary' => $stockSummary,
                'by_supplier' => $stockBySupplier,
                'by_category' => $stockByCategory,
                'top_value' => $stockTopValue,
            ],
            'tech' => $tech,
            'inspection' => ['monthly' => $inspTrend, 'summary' => $inspSummary],
            'calibration' => $cal,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}