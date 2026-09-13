<?php
/**
 * kpi.php — Central KPI engine (Phase 15 Dashboard + KPI)
 *
 * แหล่งเดียวของการคำนวณ KPI ทั้งระบบ:
 *   - Dashboards ตาม role (/dashboard, รายงานต่าง ๆ) เรียกจากที่นี่
 *   - supervisor.php action=kpis ถูก refactor ให้ใช้ฟังก์ชันชุดเดียวกัน
 *
 * ห้าม replicate formula ที่นี่ไปลงหน้า/ API อื่น
 *
 * นิยาม KPI (ใช้ timestamp จริง ไม่ใช่สถานะปัจจุบัน):
 *   - WO completion rate      = งานที่ completed ในช่วง / งานที่สร้างในช่วง × 100
 *   - PM compliance (on-time) = PM ที่ทำเสร็จทัน due / PM ที่ทำเสร็จในช่วง × 100
 *   - PM completion rate      = PM ที่ทำเสร็จในช่วง / PM ถึงกำหนด (due) ในช่วง × 100
 *   - SLA compliance          = ปิดงานทันกำหนด (completed_at ≤ due) / ปิดงานที่มีกำหนด × 100
 *                               due = COALESCE(sla_due_at, estimated_completion_date, planned_end_at)
 *   - MTTR                    = AVG(repair_time_minutes)/60 (งานปิด 30 วันล่าสุด; range ระบุได้)
 *   - MTBF                    = ค่าเฉลี่ยช่วงห่างระหว่างรอบซ่อมของเครื่องเดียวกัน (breakdown, 180 วัน)
 *   - Response time           = AVG(response_time_minutes)
 *   - Downtime                = SUM(downtime_minutes)
 *   - Maintenance cost        = cost_labor + cost_parts + cost_outsource
 *   - Material cost           = SUM(quantity_used × unit_price) จาก repair_spare_parts (snapshot จริง)
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/roles.php';

/* ───────────────────────── 1. ช่วงเวลา (time range) ───────────────────────── */

/**
 * แปลง range เป็น [start, end] ของเหตุการณ์ (Y-m-d H:i:s) ใช้ได้ทั้ง created_at / completed_at / due_date
 * คืน null เมื่อไม่มี range (หมายถึงทุกช่วงเวลา เช่น ค่า default เดิมของ supervisor)
 */
function kpi_parse_range(array $opts): ?array {
    $range = strtolower(trim((string)($opts['range'] ?? '')));
    $start = null;
    $end = null;

    switch ($range) {
        case 'today':
            $start = date('Y-m-d 00:00:00');
            $end   = date('Y-m-d 23:59:59');
            break;
        case 'yesterday':
            $start = date('Y-m-d 00:00:00', strtotime('-1 day'));
            $end   = date('Y-m-d 23:59:59', strtotime('-1 day'));
            break;
        case 'this_week':
            $start = date('Y-m-d 00:00:00', strtotime('monday this week'));
            $end   = date('Y-m-d 23:59:59');
            break;
        case 'last_week':
            $start = date('Y-m-d 00:00:00', strtotime('monday last week'));
            $end   = date('Y-m-d 23:59:59', strtotime('sunday last week'));
            break;
        case 'this_month':
            $start = date('Y-m-01 00:00:00');
            $end   = date('Y-m-d 23:59:59');
            break;
        case 'last_month':
            $start = date('Y-m-01 00:00:00', strtotime('first day of last month'));
            $end   = date('Y-m-t 23:59:59', strtotime('last day of last month'));
            break;
        case 'this_quarter':
            $m = (int)date('n');
            $qStart = [1, 4, 7, 10][intdiv($m - 1, 3)];
            $start = date(sprintf('Y-%02d-01 00:00:00', $qStart));
            $end   = date('Y-m-d 23:59:59');
            break;
        case 'last_quarter':
            $m = (int)date('n');
            $q = intdiv($m - 1, 3); // 0..3
            $lastQStart = [1, 4, 7, 10][$q === 0 ? 3 : $q - 1];
            $yearOffset = $q === 0 ? -1 : 0;
            $year = (int)date('Y') + $yearOffset;
            $start = date(sprintf('%04d-%02d-01 00:00:00', $year, $lastQStart));
            $startDt = new DateTime($start);
            $end = $startDt->modify('+3 months -1 second')->format('Y-m-d H:i:s');
            break;
        case 'this_year':
            $start = date('Y-01-01 00:00:00');
            $end   = date('Y-m-d 23:59:59');
            break;
        case 'last_year':
            $y = (int)date('Y') - 1;
            $start = sprintf('%04d-01-01 00:00:00', $y);
            $end   = sprintf('%04d-12-31 23:59:59', $y);
            break;
        case 'custom': {
            $s = trim((string)($opts['range_start'] ?? ''));
            $e = trim((string)($opts['range_end'] ?? ''));
            if ($s !== '' && $e !== '') {
                $start = date('Y-m-d 00:00:00', strtotime($s)) ?: null;
                $end   = date('Y-m-d 23:59:59', strtotime($e)) ?: null;
                if ($start === false) $start = null;
                if ($end === false) $end = null;
            }
            break;
        }
        default:
            return null;
    }
    if ($start === null || $end === null || $start === false || $end === false) return null;
    return ['start' => $start, 'end' => $end];
}

/** SQL fragment: เหตุการณ์ระหว่างช่วง (column รับ เช่น created_at / completed_at / due_date) */
function kpi_range_sql(?array $range, string $column): string {
    if (!$range) return '';
    return ' AND ' . $column . ' BETWEEN ? AND ? ';
}

/* ───────────────────────── 2. ตัวกรอง (filters) ───────────────────────── */

/**
 * สร้าง WHERE fragment บน repair (r.) + params จากตัวกรอง
 * ตัวกรอง: department_id, location_id, asset_id, asset_category, technician_id, source_type, priority, status
 */
function kpi_filters(PDO $pdo, array $opts): array {
    $sql = '';
    $params = [];
    $parts = [];

    $intFields = ['department_id', 'location_id', 'asset_id'];
    foreach ($intFields as $f) {
        if (isset($opts[$f]) && $opts[$f] !== '' && $opts[$f] !== null) {
            $v = (int)$opts[$f];
            if ($v > 0) {
                $parts[] = 'r.' . $f . ' = ?';
                $params[] = $v;
            }
        }
    }

    if (isset($opts['technician_id']) && $opts['technician_id'] !== '' && (int)$opts['technician_id'] > 0) {
        $parts[] = '(r.assigned_to = ? OR r.id IN (SELECT ref_id FROM work_assignees WHERE ref_type = "repair" AND user_id = ?))';
        $uid = (int)$opts['technician_id'];
        $params[] = $uid;
        $params[] = $uid;
    }

    if (isset($opts['source_type']) && $opts['source_type'] !== '') {
        $parts[] = 'r.source_type = ?';
        $params[] = (string)$opts['source_type'];
    }

    if (isset($opts['priority']) && $opts['priority'] !== '') {
        $parts[] = 'r.priority = ?';
        $params[] = (string)$opts['priority'];
    }

    if (isset($opts['status']) && $opts['status'] !== '') {
        $parts[] = 'r.status = ?';
        $params[] = (string)$opts['status'];
    }

    if (isset($opts['asset_category']) && $opts['asset_category'] !== '') {
        $parts[] = 'EXISTS (SELECT 1 FROM asset_registry aK WHERE aK.id = r.asset_id AND aK.category = ?)';
        $params[] = (string)$opts['asset_category'];
    }

    if ($parts) $sql = ' AND ' . implode(' AND ', $parts);
    return ['sql' => $sql, 'params' => $params];
}

/* ───────────────────────── 3. การกำหนดขอบเขตตาม role ───────────────────────── */

/** ปรับ scope ตาม role — คืน SQL + params เพิ่ม โดยไม่ให้ role ธรรมดาเห็นข้อมูลนอกสิทธิ์ */
function kpi_scope(PDO $pdo, int $roleId, int $uid, string $tableAlias = 'r'): array {
    if ($roleId === 3) { // Technician
        return [
            'sql' => ' AND (' . $tableAlias . '.assigned_to = ? OR ' . $tableAlias . '.id IN (SELECT ref_id FROM work_assignees WHERE ref_type = "repair" AND user_id = ?))',
            'params' => [$uid, $uid],
        ];
    }
    if ($roleId === 4 && $tableAlias === 'r') { // Operator — เห็นเฉพาะงานที่ตัวเองแจ้ง
        return ['sql' => ' AND ' . $tableAlias . '.created_by = ?', 'params' => [$uid]];
    }
    return ['sql' => '', 'params' => []];
}

/** คืนค่าบอกว่า role นี้เห็นข้อมูลต้นทุนได้ไหม (Manager/Admin/ASST Manager) */
function kpi_can_see_cost(int $roleId): bool {
    return in_array($roleId, [1, 2, 6], true);
}

/** แก้ resolve role จาก user row — กรณี role_id NULL ให้เดาจาก users.role / session */
function kpi_resolve_role(PDO $pdo, array $user): int {
    $rid = (int)($user['role_id'] ?? 0);
    if ($rid > 0) return $rid;
    $text = strtolower(trim((string)($user['role'] ?? '')));
    if ($text === '') {
        $text = strtolower(trim((string)(kpi_arr_get($_SESSION, 'role_name', kpi_arr_get($_SESSION, 'role', '')))));
    }
    $map = [
        'admin' => 1, 'administrator' => 1,
        'manager' => 2, 'asst manager' => 6, 'asst_manager' => 6, 'assistant manager' => 6,
        'foreman' => 7, 'technician' => 3, 'operate' => 3, 'ช่าง' => 3, 'ช่างซ่อมบำรุง' => 3,
        'operator' => 4, 'viewer' => 5,
    ];
    if (isset($map[$text])) return $map[$text];
    $st = $pdo->prepare('SELECT id FROM roles WHERE LOWER(name) = ? LIMIT 1');
    $st->execute([$text]);
    return (int)$st->fetchColumn();
}

function kpi_arr_get(array $a, string $k, $def = '') {
    return isset($a[$k]) ? $a[$k] : $def;
}

/** ชื่อ role สำหรับ Dashboard layout */
function kpi_dashboard_role(array $user): string {
    $roleId = (int)($user['role_id'] ?? 0);
    $name = strtolower((string)($user['role_name'] ?? ''));
    if (in_array($name, ['planner', 'engineer'], true)) return $name;
    switch ($roleId) {
        case 1:  return 'admin';
        case 2:  return 'manager';
        case 6:  return 'manager';   // ASST Manager → manager layout (ยังเห็นข้อมูลหัวหน้างาน)
        case 7:  return 'planner';   // Foreman → planner/supervisor layout
        case 3:  return 'technician';
        case 4:  return 'operator';
        case 5:  return 'manager';   // Viewer → อ่านอย่างเดียว ใช้ manager layout แบบ read-only
        default: return 'operator';
    }
}

/* ───────────────────────── 4. กลุ่มสถานะ ───────────────────────── */

function kpi_active_statuses(): array {
    return ['open', 'acknowledged', 'draft', 'pending_approval', 'approved', 'assigned', 'accepted',
        'in_progress', 'paused', 'waiting_parts', 'pending_parts', 'waiting_external', 'waiting_approval',
        'completed', 'pending_verification', 'resolved'];
}

function kpi_done_statuses(): array {
    return ['closed', 'cancelled', 'rejected', 'verified', 'done', 'skipped'];
}

/** WO ค้างเกินกำหนด (ดูจาก due date / SLA / เกณฑ์ open เกิน 7 วัน) — นิยามเดียวกับ supervisor */
function kpi_is_overdue(array $r): bool {
    if (in_array((string)($r['status'] ?? ''), kpi_done_statuses(), true)) return false;
    $now = time();
    foreach (['sla_due_at', 'estimated_completion_date'] as $f) {
        $v = trim((string)($r[$f] ?? ''));
        if ($v !== '' && $v !== '0000-00-00 00:00:00' && strcasecmp($v, 'NULL') !== 0) {
            $t = strtotime($v);
            if ($t !== false && $t < $now) return true;
        }
    }
    $created = strtotime((string)($r['created_at'] ?? ''));
    if ($created !== false && in_array((string)($r['status'] ?? ''), ['open', 'acknowledged', 'assigned', 'accepted', 'approved', 'pending_approval'], true)) {
        if (($now - $created) > 7 * 86400) return true;
    }
    return false;
}

function kpi_overdue_days(array $r): int {
    if (in_array((string)($r['status'] ?? ''), kpi_done_statuses(), true)) return 0;
    $now = time();
    foreach (['sla_due_at', 'estimated_completion_date'] as $f) {
        $v = trim((string)($r[$f] ?? ''));
        if ($v !== '' && $v !== '0000-00-00 00:00:00' && strcasecmp($v, 'NULL') !== 0) {
            $t = strtotime($v);
            if ($t !== false && $t < $now) return (int)ceil(($now - $t) / 86400);
        }
    }
    // ไม่มีกำหนดเวลา → ใช้เกณฑ์เปิดเกิน 7 วัน ให้ตรงกับ kpi_is_overdue
    $created = strtotime((string)($r['created_at'] ?? ''));
    if ($created !== false && in_array((string)($r['status'] ?? ''), ['open', 'acknowledged', 'assigned', 'accepted', 'approved', 'pending_approval'], true)) {
        if (($now - $created) > 7 * 86400) return (int)ceil(($now - $created) / 86400);
    }
    return 0;
}

/* ───────────────────────── 5. Core metrics ───────────────────────── */

/**
 * คำนวณชุด KPI หลักของงานซ่อม (repair work orders)
 *
 * @param array $opts  range / range_start / range_end / department_id / location_id / asset_id /
 *                     asset_category / technician_id / source_type / priority / status
 *                     + role_id, user_id สำหรับ scope
 */
function kpi_core_metrics(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $roleId = (int)($opts['role_id'] ?? 0);
    $uid = (int)($opts['user_id'] ?? 0);
    $scope = kpi_scope($pdo, $roleId, $uid);

    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $createdRange = kpi_range_sql($range, 'r.created_at');
    $completedRange = kpi_range_sql($range, 'r.completed_at');
    $params = array_merge($flt['params'], $scope['params']);

    // ---------- counts (เหมือน supervisor kpis แต่ scope ตาม role) ----------
    $role4 = ($roleId === 4);
    $cntRepair = function (string $cond) use ($pdo, $where, $params) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM repair r' . $where . $cond);
        $st->execute($params);
        return (int)$st->fetchColumn();
    };
    $requestsOpen = 0;
    if ($role4) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM maintenance_requests mr WHERE mr.status = "open" AND mr.requested_by = ?');
        $st->execute([$uid]);
        $requestsOpen = (int)$st->fetchColumn();
    } else {
        $requestsOpen = (int)$pdo->query("SELECT COUNT(*) FROM maintenance_requests WHERE status = 'open'")->fetchColumn();
    }

    $counts = [
        'requests_open' => $requestsOpen,
        'pending_approval' => $cntRepair(" AND r.status IN ('pending_approval','approved') AND r.assigned_to IS NULL"),
        'unassigned' => $cntRepair(" AND r.status IN ('open','acknowledged') AND r.assigned_to IS NULL"),
        'assigned' => $cntRepair(" AND r.status IN ('assigned','accepted')"),
        'active' => $cntRepair(" AND r.status IN ('in_progress','paused','waiting_parts','waiting_external','waiting_approval')"),
        'pending_verification' => $cntRepair(" AND r.status IN ('completed','pending_verification','resolved')"),
        'verified' => $cntRepair(" AND r.status IN ('verified','closed')"),
        'critical_active' => $cntRepair(" AND r.priority = 'critical' AND r.status IN ('open','acknowledged','pending_approval','approved','assigned','accepted','in_progress','paused','waiting_parts','waiting_external','waiting_approval')"),
        'completed_today' => $cntRepair(" AND r.completed_at >= CURDATE()"),
        'waiting_parts' => $cntRepair(" AND r.status IN ('waiting_parts','pending_parts')"),
        'waiting_external' => $cntRepair(" AND r.status = 'waiting_external'"),
    ];

    // ---------- backlog + overdue (นิยามเดียวกับ supervisor) ----------
    $sel = 'SELECT r.id, r.status, r.created_at, r.sla_due_at, r.estimated_completion_date FROM repair r';
    $st = $pdo->prepare($sel . $where . ' AND r.status IN ("' . implode('","', kpi_active_statuses()) . '")');
    $st->execute($params);
    $backlog = $st->fetchAll(PDO::FETCH_ASSOC);
    $overdueList = [];
    foreach ($backlog as $row) if (kpi_is_overdue($row)) $overdueList[] = $row;
    $counts['overdue'] = count($overdueList);

    // ---------- WO completion / breakdown (ใช้ range กับ created_at / completed_at) ----------
    $dynWhere = $where;
    $totalParams = array_merge($params, $range ? [$range['start'], $range['end']] : []);
    $st = $pdo->prepare('SELECT COUNT(*) AS cnt FROM repair r' . $dynWhere . $createdRange);
    $st->execute($totalParams);
    $totalCreated = (int)$st->fetchColumn();

    $breakdownParams = array_merge($params, $range ? [$range['start'], $range['end']] : []);
    $st = $pdo->prepare('SELECT COUNT(*) AS cnt FROM repair r' . $dynWhere . " AND r.source_type = 'breakdown'" . $createdRange);
    $st->execute($breakdownParams);
    $breakdownCreated = (int)$st->fetchColumn();

    // completed ในช่วง (นับเฉพาะที่ปิดจริง ไม่นับยกเลิก/ปฏิเสธ)
    $st = $pdo->prepare('SELECT COUNT(*) AS cnt FROM repair r' . $dynWhere .
        " AND r.status IN ('closed','verified','done','completed','resolved')" . $completedRange);
    $st->execute($totalParams);
    $completedInRange = (int)$st->fetchColumn();

    // ---------- MTTR (range หรือ 30 วันล่าสุด) ----------
    $mttr = null;
    $mttrSql = 'SELECT AVG(r.repair_time_minutes) AS v FROM repair r
                WHERE r.repair_time_minutes IS NOT NULL AND r.repair_time_minutes > 0
                  AND (r.status IN ("closed","verified") OR r.completed_at IS NOT NULL)';
    if ($range) {
        $mttrSql .= $completedRange;
    } else {
        $mttrSql .= ' AND r.completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }
    $mttrSql .= $scope['sql'];
    $mttrParams = array_merge($range ? ['start' => $range['start'], 'end' => $range['end']] : [], $scope['params']);
    $st = $pdo->prepare($mttrSql);
    $st->execute(array_values($mttrParams));
    $v = $st->fetchColumn();
    if ($v !== null && $v !== false) $mttr = round((float)$v / 60, 2);

    // ---------- MTBF (180 วัน, ระหว่างรอบซ่อมของเครื่องเดียวกัน) ----------
    $mtbf = null;
    $st = $pdo->prepare("SELECT asset_id, completed_at FROM repair
                         WHERE source_type='breakdown' AND completed_at IS NOT NULL
                           AND completed_at >= DATE_SUB(NOW(), INTERVAL 180 DAY)
                           AND status IN ('closed','verified','completed','resolved')" . $scope['sql'] . " ORDER BY asset_id, completed_at ASC");
    $st->execute($scope['params']);
    $byAsset = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $b) $byAsset[(int)$b['asset_id']][] = strtotime($b['completed_at']);
    $intervals = [];
    foreach ($byAsset as $times) {
        sort($times);
        for ($i = 1; $i < count($times); $i++) $intervals[] = ($times[$i] - $times[$i - 1]) / 3600;
    }
    if ($intervals) $mtbf = round(array_sum($intervals) / count($intervals), 2);

    // ---------- Response time (นาทีเฉลี่ย) ----------
    $respSql = 'SELECT AVG(r.response_time_minutes) FROM repair r WHERE r.response_time_minutes IS NOT NULL AND r.response_time_minutes > 0';
    $respParams = [];
    if ($range) { $respSql .= $createdRange; $respParams = array_merge($respParams, [$range['start'], $range['end']]); }
    $respSql .= $scope['sql'];
    $respParams = array_merge($respParams, $scope['params']);
    $st = $pdo->prepare($respSql);
    $st->execute($respParams);
    $resp = $st->fetchColumn();
    $avg_response_minutes = ($resp !== null && $resp !== false) ? round((float)$resp, 1) : null;

    // ---------- SLA compliance (% ปิดทันกำหนด, 30 วัน หรือตาม range) ----------
    $slaParams = [];
    $slaSql = 'SELECT r.completed_at, r.sla_due_at, r.estimated_completion_date, r.planned_end_at FROM repair r
               WHERE r.completed_at IS NOT NULL';
    if ($range) {
        $slaSql .= $completedRange;
        $slaParams = array_merge($slaParams, [$range['start'], $range['end']]);
    } else {
        $slaSql .= ' AND r.completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }
    $slaSql .= $scope['sql'];
    $slaParams = array_merge($slaParams, $scope['params']);
    $st = $pdo->prepare($slaSql);
    $st->execute($slaParams);
    $slaDone = 0; $slaTotal = 0;
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $due = $c['sla_due_at'] ?: ($c['estimated_completion_date'] ?: $c['planned_end_at']);
        if (!$due) continue;
        $slaTotal++;
        if (strtotime((string)$c['completed_at']) <= strtotime((string)$due)) $slaDone++;
    }
    $sla_compliance_pct = $slaTotal > 0 ? round($slaDone / $slaTotal * 100, 1) : null;

    // ---------- PM compliance (จาก inspection checklists) ----------
    $pmCompliance = null;
    try {
        $v = $pdo->query('SELECT compliance_pct FROM v_inspection_dashboard_kpis')->fetchColumn();
        if ($v !== null && $v !== false) $pmCompliance = round((float)$v, 1);
    } catch (Exception $e) { /* ข้าม */ }

    // ---------- Downtime / Cost ----------
    $st = $pdo->prepare('SELECT
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS downtime_minutes,
            COALESCE(SUM(COALESCE(r.cost_labor,0)),0) AS cost_labor,
            COALESCE(SUM(COALESCE(r.cost_parts,0)),0) AS cost_parts,
            COALESCE(SUM(COALESCE(r.cost_outsource,0)),0) AS cost_outsource,
            COALESCE(SUM(CASE WHEN aK.criticality = "A" THEN COALESCE(r.downtime_minutes,0) ELSE 0 END),0) AS critical_downtime_minutes
        FROM repair r LEFT JOIN asset_registry aK ON aK.id = r.asset_id' . $where . $createdRange);
    $costParams = array_merge($params, $range ? [$range['start'], $range['end']] : []);
    $st->execute($costParams);
    $agg = $st->fetch(PDO::FETCH_ASSOC);
    $downtime_minutes = (float)($agg['downtime_minutes'] ?? 0);
    $cost_labor = (float)($agg['cost_labor'] ?? 0);
    $cost_parts_field = (float)($agg['cost_parts'] ?? 0);
    $cost_outsource = (float)($agg['cost_outsource'] ?? 0);
    $critical_downtime = (float)($agg['critical_downtime_minutes'] ?? 0);

    $matCostParams = array_merge($params, $range ? [$range['start'], $range['end']] : []);
    $mat = $pdo->prepare('SELECT COALESCE(SUM(COALESCE(sp.quantity_used,0) * COALESCE(sp.unit_price,0)),0) AS v
                          FROM repair_spare_parts sp JOIN repair r ON r.id = sp.repair_id' . $where . $createdRange);
    $mat->execute($matCostParams);
    $material_cost = (float)$mat->fetchColumn();

    $cost_total = $cost_labor + $cost_parts_field + $cost_outsource;

    return [
        'counts' => $counts,
        'total_wo_created' => $totalCreated,
        'wo_completed_in_range' => $completedInRange,
        'wo_completion_rate' => $totalCreated > 0 ? round($completedInRange / $totalCreated * 100, 1) : null,
        'breakdown_count' => $breakdownCreated,
        'breakdown_rate' => $totalCreated > 0 ? round($breakdownCreated / $totalCreated * 100, 1) : null,
        'mttr_hours' => $mttr,
        'mtbf_hours' => $mtbf,
        'avg_response_minutes' => $avg_response_minutes,
        'sla_compliance_pct' => $sla_compliance_pct,
        'pm_compliance_pct' => $pmCompliance,
        'downtime_minutes' => round($downtime_minutes, 1),
        'cost_labor' => round($cost_labor, 2),
        'cost_parts_field' => round($cost_parts_field, 2),
        'cost_outsource' => round($cost_outsource, 2),
        'cost_total' => round($cost_total, 2),
        'material_cost' => round($material_cost, 2),
        'critical_asset_downtime_minutes' => round($critical_downtime, 1),
        'open_wo' => $counts['open_wo'] ?? $cntRepair(" AND r.status NOT IN ('cancelled','rejected','draft','done','skipped','closed','verified')"),
        'overdue_wo' => $counts['overdue'],
    ];
}

/* ───────────────────────── 6. Alerts (สิ่งที่ต้องสนใจ) ───────────────────────── */

function kpi_alerts(PDO $pdo, array $opts): array {
    $roleId = (int)($opts['role_id'] ?? 0);
    $uid = (int)($opts['user_id'] ?? 0);
    $scope = kpi_scope($pdo, $roleId, $uid);
    $flt = kpi_filters($pdo, $opts);

    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $params = array_merge($flt['params'], $scope['params']);

    $active = '"open","acknowledged","pending_approval","approved","assigned","accepted","in_progress","paused","waiting_parts","pending_parts","waiting_external","waiting_approval","completed","pending_verification","resolved"';

    $count = function (string $cond, array $p) use ($pdo, $where) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM repair r' . $where . $cond);
        $st->execute($p);
        return (int)$st->fetchColumn();
    };

    $critical = $count(' AND r.priority = "critical" AND r.status IN (' . $active . ')', $params);
    $overdueList = kpi_overdue_rows($pdo, $active, $where, $params);
    $overdue = count($overdueList);
    $waiting_parts = $count(' AND r.status IN ("waiting_parts","pending_parts")', $params);
    $waiting_external = $count(' AND r.status = "waiting_external"', $params);
    $pmOverdue = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status IN ('pending','in_progress') AND due_date < CURDATE()")->fetchColumn();
    $pmDueToday = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status IN ('pending','in_progress') AND DATE(due_date) = CURDATE()")->fetchColumn();

    // SLA at risk: ค้าง > 80% ของเวลาก่อน due ที่มี due ใน 24 ชม. แต่ยังไม่เกินกำหนด
    $riskParams = $params;
    $st = $pdo->prepare('SELECT r.sla_due_at, r.estimated_completion_date, r.planned_end_at FROM repair r' . $where .
        " AND r.status IN (" . $active . ") AND (r.sla_due_at IS NOT NULL OR r.estimated_completion_date IS NOT NULL OR r.planned_end_at IS NOT NULL)");
    $st->execute($riskParams);
    $atRisk = 0;
    $now = time();
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $due = $row['sla_due_at'] ?: ($row['estimated_completion_date'] ?: $row['planned_end_at']);
        if (!$due) continue;
        $dueT = strtotime((string)$due);
        if ($dueT === false) continue;
        if ($dueT >= $now && ($dueT - $now) <= 24 * 3600) $atRisk++;
    }

    return [
        'critical_open' => $critical,
        'overdue_open' => $overdue,
        'overdue_items' => array_slice($overdueList, 0, 8),
        'pm_overdue' => $pmOverdue,
        'pm_due_today' => $pmDueToday,
        'waiting_parts' => $waiting_parts,
        'waiting_external' => $waiting_external,
        'sla_at_risk' => $atRisk,
    ];
}

/** รายการ WO ค้างเกินกำหนด (สำหรับ queue ลงลึก) */
function kpi_overdue_rows(PDO $pdo, string $activeSql, string $where, array $params): array {
    $st = $pdo->prepare('SELECT r.id, r.status, r.created_at, r.sla_due_at, r.estimated_completion_date FROM repair r' . $where . ' AND r.status IN (' . $activeSql . ')');
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        if (kpi_is_overdue($r)) {
            $r['kpi_overdue_days'] = kpi_overdue_days($r);
            $out[] = $r;
        }
    }
    usort($out, function ($a, $b) { return $b['kpi_overdue_days'] <=> $a['kpi_overdue_days']; });
    return $out;
}

/**
 * งานค้างเกินกำหนดที่สำคัญที่สุด (สำหรับ header ของ supervisor / dashboard)
 * รูปแบบข้อมูลเดียวกันกับ top_overdue เดิม เพื่อไม่ให้หน้าเดิมพัง
 */
function kpi_top_overdue(PDO $pdo, array $opts, int $limit = 5): array {
    $list = kpi_wo_list($pdo, array_merge($opts, ['group' => 'overdue', 'limit' => $limit]));
    $out = [];
    foreach ($list['items'] as $it) {
        $out[] = [
            'id' => (int)$it['id'],
            'work_order_no' => $it['work_order_no'],
            'title' => $it['title'],
            'priority' => $it['priority'],
            'status' => $it['status'],
            'asset_code' => $it['asset_code'] ?? '',
            'overdue_days' => (int)$it['overdue_days'],
        ];
    }
    return $out;
}

/* ───────────────────────── 7. Drill-down: รายการงาน / PM ───────────────────────── */

function kpi_wo_list(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)($opts['role_id'] ?? 0), (int)($opts['user_id'] ?? 0));
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];

    // group ลงลึก: overdue / critical / waiting_parts / pending_verification / all / open
    $group = (string)($opts['group'] ?? 'all');
    $active = implode('","', kpi_active_statuses());
    $cond = '';
    switch ($group) {
        case 'overdue': $cond = " AND r.status IN ('" . implode("','", kpi_active_statuses()) . "')"; break; // filter หลัง fetch เฉพาะงานที่ยังไม่จบ
        case 'critical': $cond = " AND r.priority = 'critical'"; break;
        case 'waiting_parts': $cond = " AND r.status IN ('waiting_parts','pending_parts')"; break;
        case 'pending_verification': $cond = " AND r.status IN ('completed','pending_verification','resolved')"; break;
        case 'assigned': $cond = " AND r.status IN ('assigned','accepted')"; break;
        case 'active': $cond = " AND r.status IN ('in_progress','paused','waiting_parts','pending_parts','waiting_external','waiting_approval')"; break;
        case 'open': $cond = " AND r.status NOT IN ('cancelled','rejected','draft','done','skipped','closed','verified')"; break;
        default: $cond = " AND r.status NOT IN ('cancelled','rejected','draft','done','skipped')";
    }
    $dateSql = '';
    $dateParams = [];
    if (!empty($opts['date_field']) && $range) {
        $dateSql = kpi_range_sql($range, $opts['date_field']);
        $dateParams = [$range['start'], $range['end']];
    }

    $limit = min(300, max(1, (int)($opts['limit'] ?? 50)));
    $offset = max(0, (int)($opts['offset'] ?? 0));
    $overdue = ($group === 'overdue');

    // overdue: ต้องกรอง + เรียงตามจำนวนวันที่เกินกำหนดก่อนแบ่งหน้า จึงดึงทั้งชุด (สูงสุด 800) มากรองใน PHP
    $maxFetch = $overdue ? 800 : $limit;
    $sql = 'SELECT r.id, r.work_order_no, r.title, r.priority, r.status, r.source_type,
                   r.asset_id, r.department_id, r.created_at, r.completed_at,
                   r.sla_due_at, r.estimated_completion_date, r.planned_end_at,
                   a.code AS asset_code, a.name AS asset_name,
                   u.full_name AS assigned_name
            FROM repair r
            LEFT JOIN asset_registry a ON a.id = r.asset_id
            LEFT JOIN users u ON u.id = r.assigned_to' . $where . $cond . $dateSql . '
            ORDER BY r.created_at DESC LIMIT ' . $maxFetch . ($overdue ? '' : ' OFFSET ' . $offset);
    $st = $pdo->prepare($sql);
    $st->execute(array_merge($flt['params'], $scope['params'], $dateParams));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $it) {
        if ($overdue && !kpi_is_overdue($it)) continue;
        $out[] = [
            'id' => (int)$it['id'],
            'work_order_no' => $it['work_order_no'],
            'title' => $it['title'],
            'priority' => $it['priority'],
            'status' => $it['status'],
            'source_type' => $it['source_type'],
            'asset_id' => (int)$it['asset_id'],
            'asset_code' => $it['asset_code'],
            'asset_name' => $it['asset_name'],
            'assigned_name' => $it['assigned_name'],
            'created_at' => $it['created_at'],
            'completed_at' => $it['completed_at'],
            'due_at' => $it['sla_due_at'] ?: ($it['estimated_completion_date'] ?: $it['planned_end_at']),
            'overdue_days' => kpi_overdue_days($it),
        ];
    }

    if ($overdue) {
        usort($out, function ($a, $b) { return $b['overdue_days'] <=> $a['overdue_days']; });
        $total = count($out);
        $out = array_slice($out, $offset, $limit);
    } else {
        $countParams = array_merge($flt['params'], $scope['params'], $dateParams);
        $st = $pdo->prepare('SELECT COUNT(*) FROM repair r' . $where . $cond . $dateSql);
        $st->execute($countParams);
        $total = (int)$st->fetchColumn();
    }
    return ['items' => $out, 'total' => $total];
}

function kpi_pm_metrics(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $dueSql = kpi_range_sql($range, 'due_date');
    $doneSql = kpi_range_sql($range, 'completed_at');
    $params = []; $dueP = $range ? [$range['start'], $range['end']] : [];
    $doneP = $range ? [$range['start'], $range['end']] : [];

    $st = $pdo->prepare('SELECT
        SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) AS done_cnt,
        SUM(CASE WHEN status = "completed" AND completed_at IS NOT NULL AND completed_at <= due_date THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN status = "completed" AND completed_at IS NOT NULL AND completed_at > due_date THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status IN ("pending","in_progress") AND due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_pending
        FROM pm_am WHERE 1=1' . $doneSql . $dueSql);
    $st->execute(array_merge($doneP, $dueP));
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $dueTotal = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status IN ('pending','in_progress','completed') OR (status = 'overdue')")->fetchColumn();
    $doneCount = (int)($row['done_cnt'] ?? 0);
    $onTime = (int)($row['on_time'] ?? 0);
    $late = (int)($row['late'] ?? 0);
    $overduePending = (int)($row['overdue_pending'] ?? 0);

    $completion = $dueTotal > 0 ? round($doneCount / $dueTotal * 100, 1) : null;
    $onTimePct = $doneCount > 0 ? round($onTime / $doneCount * 100, 1) : null;

    return [
        'due_total' => $dueTotal,
        'completed' => $doneCount,
        'on_time' => $onTime,
        'late' => $late,
        'overdue_pending' => $overduePending,
        'completion_rate' => $completion,
        'on_time_pct' => $onTimePct,
    ];
}

function kpi_pm_list(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)($opts['role_id'] ?? 0), (int)($opts['user_id'] ?? 0), 'p');
    $dueSql = kpi_range_sql($range, 'p.due_date');
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);
    $group = (string)($opts['group'] ?? 'all');
    $cond = '';
    if ($group === 'overdue') $cond = " AND p.status IN ('pending','in_progress') AND p.due_date < CURDATE()";
    elseif ($group === 'completed') $cond = " AND p.status = 'completed'";
    elseif ($group === 'due_today') $cond = " AND p.status IN ('pending','in_progress') AND DATE(p.due_date) = CURDATE()";
    $limit = min(300, max(1, (int)($opts['limit'] ?? 50)));

    $sql = 'SELECT p.id, p.title, p.status, p.priority, p.due_date, p.completed_at,
                   a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
            FROM pm_am p
            LEFT JOIN asset_registry a ON a.id = p.asset_id
            LEFT JOIN users u ON u.id = p.assigned_to' . $where . $cond . $dueSql . '
            ORDER BY p.due_date ASC LIMIT ' . $limit;
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ───────────────────────── 8. Downtime / Cost / Failure / Asset ───────────────────────── */

function kpi_downtime(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)($opts['role_id'] ?? 0), (int)($opts['user_id'] ?? 0));
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $st = $pdo->prepare('SELECT
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS total_minutes,
            COALESCE(SUM(CASE WHEN r.downtime_minutes > 0 THEN 1 ELSE 0 END),0) AS events,
            COUNT(*) AS cnt
        FROM repair r' . $where . $dateSql);
    $st->execute($params);
    $sum = $st->fetch(PDO::FETCH_ASSOC);
    $total = (float)($sum['total_minutes'] ?? 0);

    $byAsset = [];
    $st = $pdo->prepare('SELECT a.id, a.code, a.name, a.criticality,
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt,
            COUNT(*) AS cnt
        FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id' . $where . $dateSql . '
        GROUP BY a.id, a.code, a.name, a.criticality
        HAVING dt > 0 ORDER BY dt DESC LIMIT 10');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byAsset[] = $r;

    $byDept = [];
    $st = $pdo->prepare('SELECT d.name AS department,
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt
        FROM repair r LEFT JOIN departments d ON d.id = r.department_id' . $where . $dateSql . '
        GROUP BY d.name HAVING dt > 0 ORDER BY dt DESC LIMIT 8');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byDept[] = $r;

    $byFailure = [];
    $st = $pdo->prepare('SELECT fc.code AS failure_code, fc.name AS failure_name,
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt, COUNT(*) AS cnt
        FROM repair r LEFT JOIN failure_codes fc ON fc.id = r.failure_code_id' . $where . $dateSql . '
        GROUP BY fc.code, fc.name HAVING dt > 0 ORDER BY dt DESC LIMIT 8');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byFailure[] = $r;

    return [
        'total_minutes' => round($total, 1),
        'events' => (int)($sum['events'] ?? 0),
        'avy_hours' => round($total / 60, 1),
        'by_asset' => $byAsset,
        'by_department' => $byDept,
        'by_failure_type' => $byFailure,
    ];
}

function kpi_cost(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)($opts['role_id'] ?? 0), (int)($opts['user_id'] ?? 0));
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $st = $pdo->prepare('SELECT
            COALESCE(SUM(COALESCE(r.cost_labor,0)),0) AS labor,
            COALESCE(SUM(COALESCE(r.cost_parts,0)),0) AS parts,
            COALESCE(SUM(COALESCE(r.cost_outsource,0)),0) AS outsource
        FROM repair r' . $where . $dateSql);
    $st->execute($params);
    $agg = $st->fetch(PDO::FETCH_ASSOC);
    $labor = (float)($agg['labor'] ?? 0);
    $parts = (float)($agg['parts'] ?? 0);
    $out = (float)($agg['outsource'] ?? 0);

    $mat = $pdo->prepare('SELECT COALESCE(SUM(COALESCE(sp.quantity_used,0)*COALESCE(sp.unit_price,0)),0) FROM repair_spare_parts sp JOIN repair r ON r.id = sp.repair_id' . $where . $dateSql);
    $mat->execute($params);
    $material = (float)$mat->fetchColumn();

    $byAsset = [];
    $st = $pdo->prepare('SELECT a.id, a.code, a.name,
            COALESCE(SUM(COALESCE(r.cost_labor,0) + COALESCE(r.cost_parts,0) + COALESCE(r.cost_outsource,0)),0) AS cost
        FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id' . $where . $dateSql . '
        GROUP BY a.id, a.code, a.name HAVING cost > 0 ORDER BY cost DESC LIMIT 10');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byAsset[] = $r;

    $byDept = [];
    $st = $pdo->prepare('SELECT d.name AS department,
            COALESCE(SUM(COALESCE(r.cost_labor,0) + COALESCE(r.cost_parts,0) + COALESCE(r.cost_outsource,0)),0) AS cost
        FROM repair r LEFT JOIN departments d ON d.id = r.department_id' . $where . $dateSql . '
        GROUP BY d.name HAVING cost > 0 ORDER BY cost DESC LIMIT 8');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byDept[] = $r;

    $topParts = [];
    $st = $pdo->prepare('SELECT spp.code, spp.name AS part_name, COALESCE(SUM(sp.quantity_used),0) AS qty, COALESCE(SUM(sp.quantity_used*sp.unit_price),0) AS cost
        FROM repair_spare_parts sp
        JOIN spare_parts spp ON spp.id = sp.spare_part_id
        JOIN repair r ON r.id = sp.repair_id' . $where . $dateSql . '
        GROUP BY spp.id, spp.code, spp.name HAVING cost > 0 ORDER BY cost DESC LIMIT 10');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $topParts[] = $r;

    return [
        'labor' => round($labor, 2),
        'parts' => round($parts, 2),
        'outsource' => round($out, 2),
        'material_cost' => round($material, 2),
        'total' => round($labor + $parts + $out, 2),
        'by_asset' => $byAsset,
        'by_department' => $byDept,
        'top_spare_parts' => $topParts,
    ];
}

function kpi_failure(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)($opts['role_id'] ?? 0), (int)($opts['user_id'] ?? 0));
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);
    $breakdown = " AND r.source_type = 'breakdown'";

    $byAsset = [];
    $st = $pdo->prepare('SELECT a.id, a.code, a.name,
            COUNT(*) AS cnt, COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt
        FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id' . $where . $breakdown . $dateSql . '
        GROUP BY a.id, a.code, a.name ORDER BY cnt DESC LIMIT 10');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byAsset[] = $r;

    $byType = [];
    $st = $pdo->prepare('SELECT fc.code AS failure_code, fc.name AS failure_name, COUNT(*) AS cnt
        FROM repair r LEFT JOIN failure_codes fc ON fc.id = r.failure_code_id' . $where . $breakdown . $dateSql . '
        GROUP BY fc.code, fc.name ORDER BY cnt DESC LIMIT 10');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $byType[] = $r;

    // repeated failures — เครื่องที่เสียซ้ำมากกว่า 1 ครั้งในช่วง
    $repeated = [];
    $st = $pdo->prepare('SELECT a.id, a.code, a.name, COUNT(*) AS cnt
        FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id' . $where . $breakdown . $dateSql . '
        GROUP BY a.id, a.code, a.name HAVING cnt > 1 ORDER BY cnt DESC LIMIT 10');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $repeated[] = $r;

    return [
        'by_asset' => $byAsset,
        'by_type' => $byType,
        'repeated_assets' => $repeated,
        'total_breakdown' => array_sum(array_column($byAsset, 'cnt')),
    ];
}

function kpi_asset_health(PDO $pdo): array {
    $total = (int)$pdo->query('SELECT COUNT(*) FROM asset_registry WHERE status <> "disposed"')->fetchColumn();
    $running = (int)$pdo->query('SELECT COUNT(*) FROM asset_registry WHERE status = "active"')->fetchColumn();
    $activeList = '"' . implode('","', kpi_active_statuses()) . '"';
    // down = เครื่องที่มีใบงานค้างอยู่ขณะนี้ (สถานะไม่จบ)
    $down = (int)$pdo->query("SELECT COUNT(DISTINCT asset_id) FROM repair WHERE asset_id IS NOT NULL AND status IN ($activeList)")->fetchColumn();
    $underMaintenance = (int)$pdo->query("SELECT COUNT(*) FROM asset_registry WHERE status = 'under_repair'")->fetchColumn();
    $critical = (int)$pdo->query("SELECT COUNT(*) FROM asset_registry WHERE criticality = 'A' AND status <> 'disposed'")->fetchColumn();
    $inactive = (int)$pdo->query("SELECT COUNT(*) FROM asset_registry WHERE status = 'inactive'")->fetchColumn();

    // repeated failure 90 วัน
    $repeated = (int)$pdo->query("SELECT COUNT(*) FROM (
            SELECT r.asset_id FROM repair r WHERE r.source_type='breakdown' AND r.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY r.asset_id HAVING COUNT(*) > 1) t")->fetchColumn();

    // high downtime 90 วัน
    $highDt = (int)$pdo->query("SELECT COUNT(*) FROM (
            SELECT r.asset_id FROM repair r WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY r.asset_id HAVING SUM(COALESCE(r.downtime_minutes,0)) >= 1440) t")->fetchColumn();

    // high cost 90 วัน
    $highCost = (int)$pdo->query("SELECT COUNT(*) FROM (
            SELECT r.asset_id FROM repair r WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            GROUP BY r.asset_id HAVING SUM(COALESCE(r.cost_labor,0)+COALESCE(r.cost_parts,0)+COALESCE(r.cost_outsource,0)) >= 50000) t")->fetchColumn();

    return [
        'total_assets' => $total,
        'running' => $running,
        'down' => $down,
        'under_maintenance' => $underMaintenance,
        'inactive' => $inactive,
        'critical_assets' => $critical,
        'repeated_failure_assets' => $repeated,
        'high_downtime_assets' => $highDt,
        'high_cost_assets' => $highCost,
    ];
}

function kpi_technician_workload(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = $range ? [$range['start'], $range['end']] : [];

    $active = implode('","', ['assigned', 'accepted', 'in_progress', 'paused', 'waiting_parts', 'pending_parts', 'waiting_external', 'waiting_approval', 'pending_verification', 'completed']);
    $sql = 'SELECT u.id AS user_id, u.full_name,
                SUM(CASE WHEN r.status IN ("assigned","accepted") THEN 1 ELSE 0 END) AS assigned_cnt,
                SUM(CASE WHEN r.status IN ("in_progress","paused") THEN 1 ELSE 0 END) AS in_progress_cnt,
                SUM(CASE WHEN r.status IN ("waiting_parts","pending_parts","waiting_external","waiting_approval") THEN 1 ELSE 0 END) AS waiting_cnt,
                SUM(CASE WHEN r.status IN ("completed","pending_verification") THEN 1 ELSE 0 END) AS pending_verify_cnt,
                COUNT(*) AS total
            FROM repair r
            LEFT JOIN users u ON u.id = r.assigned_to
            WHERE u.id IS NOT NULL' . $dateSql . '
            GROUP BY u.id, u.full_name
            ORDER BY total DESC LIMIT 25';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** รายการตัวกรองสำหรับหน้า dashboard (departments / locations / assets / technicians) */
function kpi_filter_options(PDO $pdo): array {
    $departments = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
    $locations = $pdo->query('SELECT id, name FROM locations ORDER BY name LIMIT 200')->fetchAll(PDO::FETCH_ASSOC);
    $assets = $pdo->query('SELECT id, code, name FROM asset_registry WHERE status <> "disposed" ORDER BY code LIMIT 500')->fetchAll(PDO::FETCH_ASSOC);
    $technicians = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 AND (role_id IN (3,7) OR LOWER(role) IN ("technician","operate","foreman")) ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC);
    $categories = $pdo->query('SELECT DISTINCT category FROM asset_registry WHERE category IS NOT NULL AND category <> "" ORDER BY category')->fetchAll(PDO::FETCH_COLUMN);
    return [
        'departments' => $departments,
        'locations' => $locations,
        'assets' => $assets,
        'technicians' => $technicians,
        'asset_categories' => $categories,
        'source_types' => ['breakdown', 'pm', 'modify', 'build'],
        'priorities' => ['low', 'medium', 'high', 'critical'],
    ];
}