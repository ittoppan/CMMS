<?php
/**
 * reports.php — Enterprise Report Engine (Phase 17)
 *
 * แหล่งข้อมูลเดียวของระบบ Report Center ทุกรายงาน:
 *   - ใช้ข้อมูลจริงจากฐานข้อมูลเท่านั้น (ห้าม mock)
 *   - KPI ทั้งหมดเรียกจาก src/helpers/kpi.php (สูตรเดียวกับ Dashboard — ตัวเลขต้องตรงกัน)
 *   - ตัวกรอง + ขอบเขต (scope) ตาม role ทำที่ฝั่ง server เสมอ
 *   - Aggregation / pagination / sorting ทำใน SQL ไม่ง้อ frontend กรองหน้าหลัง
 *
 * รูปแบบ response กลาง (canonical payload) ที่หน้า Report ใช้ render ตรง:
 *   'kpi'    => [ ['key','label','value','unit','tone','fmt'], ... ]
 *   'charts' => [ ['id','title','kind','xKey','keys','data'], ... ]
 *   'table'  => ['columns'=>[['key','label','align','type']], 'rows'=>[], 'total','page','page_size', 'group_by'?]
 *   'scope'  => ['label','can_cost','role_id']
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/roles.php';
require_once __DIR__ . '/kpi.php';
require_once __DIR__ . '/xlsx.php';

/* ───────────────────────── 0. Indexes (performance) ───────────────────────── */

function rpt_ensure_indexes(PDO $pdo): void {
    $want = [
        ['repair', ['status']],
        ['repair', ['created_at']],
        ['repair', ['completed_at']],
        ['maintenance_requests', ['created_at']],
        ['repair_spare_parts', ['created_at']],
        ['pm_am', ['due_date']],
        ['pm_am', ['completed_at']],
        ['inspection_schedules', ['completed_at']],
    ];
    foreach ($want as [$table, $cols]) {
        $name = 'idx_rpt_' . $table . '_' . implode('_', $cols);
        $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?");
        $st->execute([$table, $name]);
        if ((int)$st->fetchColumn() > 0) continue;
        try {
            $pdo->exec("ALTER TABLE `$table` ADD INDEX `$name` (`" . implode('`,`', $cols) . "`)");
        } catch (Throwable $e) {
            error_log('[reports] index skip: ' . $e->getMessage());
        }
    }
}

/* ───────────────────────── 1. Options / Scope ───────────────────────── */

/** แปลง $_GET เป็น opts สำหรับ kpi.php เดียวกับ dashboard (สูตรเดิมเป๊ะ) */
function rpt_opts(array $exclude = []): array {
    $out = [
        'role_id' => (int)($_SESSION['role_id'] ?? 0),
        'user_id' => (int)($_SESSION['user_id'] ?? 0),
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
    foreach ($exclude as $k) unset($out[$k]);
    return $out;
}

/** เงื่อนไข WHERE บน repair (r.) + params — ใช้ kpi_filters + kpi_scope เดียวกับ dashboard */
function rpt_repair_where(PDO $pdo, array $opts): array {
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)($opts['role_id'] ?? 0), (int)($opts['user_id'] ?? 0));
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $params = array_merge($flt['params'], $scope['params']);
    return ['where' => $where, 'params' => $params];
}

/** เงื่อนไข WHERE บน maintenance_requests (mr.) พร้อม scope: operator/technician เห็นเฉพาะที่ตนแจ้ง */
function rpt_request_where(PDO $pdo, array $opts): array {
    $roleId = (int)($opts['role_id'] ?? 0);
    $uid = (int)($opts['user_id'] ?? 0);
    $flt = kpi_filters($pdo, $opts);
    $parts = [];
    $params = [];
    if (isset($opts['department_id']) && (int)$opts['department_id'] > 0) {
        $parts[] = 'mr.department_id = ?';
        $params[] = (int)$opts['department_id'];
    }
    if (isset($opts['location_id']) && (int)$opts['location_id'] > 0) {
        $parts[] = 'mr.location_id = ?';
        $params[] = (int)$opts['location_id'];
    }
    if (isset($opts['asset_id']) && (int)$opts['asset_id'] > 0) {
        $parts[] = 'mr.asset_id = ?';
        $params[] = (int)$opts['asset_id'];
    }
    if (isset($opts['priority']) && $opts['priority'] !== '') {
        $parts[] = 'mr.priority = ?';
        $params[] = (string)$opts['priority'];
    }
    if (isset($opts['status']) && $opts['status'] !== '') {
        $parts[] = 'mr.status = ?';
        $params[] = (string)$opts['status'];
    }
    if ($roleId === 3 || $roleId === 4) {
        $parts[] = 'mr.requested_by = ?';
        $params[] = $uid;
    }
    $sql = $parts ? ' WHERE 1=1 AND ' . implode(' AND ', $parts) : ' WHERE 1=1 ';
    return ['where' => $sql, 'params' => $params];
}

/** กลุ่มเดือน x ใบสำหรับเทรนด์ (ตาม range หรือ 12 เดือนล่าสุด) */
function rpt_month_buckets(?array $range, int $n = 12): array {
    if ($range) {
        $start = date('Y-m', strtotime($range['start']));
        $end = date('Y-m', strtotime($range['end']));
    } else {
        $end = date('Y-m');
        $start = date('Y-m', strtotime('-' . ($n - 1) . ' months'));
    }
    $out = [];
    $cur = $start;
    while ($cur <= $end) {
        [$y, $m] = array_map('intval', explode('-', $cur));
        $out[$cur] = ['ym' => $cur, 'label' => sprintf('%s %04d', __rpt_month_th((string)$m), $y)];
        $cur = date('Y-m', strtotime($cur . '-01 +1 month'));
        if (count($out) > 60) break;
    }
    return $out;
}

function __rpt_month_th(string $m): string {
    static $map = ['1' => 'ม.ค.', '2' => 'ก.พ.', '3' => 'มี.ค.', '4' => 'เม.ย.', '5' => 'พ.ค.', '6' => 'มิ.ย.',
        '7' => 'ก.ค.', '8' => 'ส.ค.', '9' => 'ก.ย.', '10' => 'ต.ค.', '11' => 'พ.ย.', '12' => 'ธ.ค.'];
    return $map[ltrim($m, '0')] ?? $m;
}

/* ───────────────────────── 2. Permission / Meta ───────────────────────── */

function rpt_permitted(string $resource, int $roleId): bool {
    switch ($resource) {
        case 'cost':            return kpi_can_see_cost($roleId); // 1,2,6
        case 'technicians':     return in_array($roleId, [1, 2, 6, 7], true);
        default:                return true;
    }
}

function rpt_scope_label(int $roleId): string {
    switch ($roleId) {
        case 3:  return 'เฉพาะงานที่มอบหมาย / เข้าร่วม (Technician)';
        case 4:  return 'เฉพาะงานที่ตนเองแจ้ง (Operator)';
        case 5:  return 'ดูได้ทุกหน่วยงาน (อ่านอย่างเดียว)';
        default: return 'ภาพรวมทุกหน่วยงาน';
    }
}

function rpt_meta(PDO $pdo, array $user, string $resource): array {
    $roleId = kpi_resolve_role($pdo, $user);
    $roleName = (string)($_SESSION['role_name'] ?? $_SESSION['role'] ?? ($user['role'] ?? ''));
    return [
        'user' => ['id' => (int)$user['id'], 'full_name' => $user['full_name'], 'role_id' => $roleId, 'role_name' => $roleName],
        'scope' => ['label' => rpt_scope_label($roleId), 'can_cost' => kpi_can_see_cost($roleId)],
        'perm' => [
            'cost' => kpi_can_see_cost($roleId),
            'supervisor' => canSupervisor(),
            'plan' => canPlanWork(),
            'review' => canReviewRequest(),
        ],
        'generated_at' => date('Y-m-d H:i:s'),
    ];
}

function rpt_audit_filter_json(): string {
    $keys = ['range', 'range_start', 'range_end', 'department_id', 'location_id', 'asset_id', 'asset_category',
        'technician_id', 'source_type', 'priority', 'status', 'group_by', 'year', 'month'];
    $out = [];
    foreach ($keys as $k) {
        if (isset($_GET[$k]) && $_GET[$k] !== '') $out[$k] = $_GET[$k];
    }
    return json_encode($out, JSON_UNESCAPED_UNICODE);
}

function rpt_log_audit(PDO $pdo, int $uid, string $name, string $report, string $exportType, int $rows): void {
    try {
        $st = $pdo->prepare('INSERT INTO report_audit_log (user_id, user_name, report, filters, export_type, row_count) VALUES (?,?,?,?,?,?)');
        $st->execute([$uid ?: null, $name, $report, rpt_audit_filter_json(), $exportType, $rows]);
    } catch (Throwable $e) {
        error_log('[reports] audit: ' . $e->getMessage());
    }
}

/* ───────────────────────── 3. Canonical builders ───────────────────────── */

function rpt_kpi(string $key, string $label, $value, string $unit = '', string $tone = '', string $fmt = 'number'): array {
    return ['key' => $key, 'label' => $label, 'value' => $value, 'unit' => $unit, 'tone' => $tone, 'fmt' => $fmt];
}

function rpt_chart(string $id, string $title, string $kind, string $xKey, array $keys, array $data, string $desc = ''): array {
    return ['id' => $id, 'title' => $title, 'kind' => $kind, 'xKey' => $xKey, 'keys' => $keys, 'data' => $data, 'desc' => $desc];
}

function rpt_col(string $key, string $label, string $align = 'left', string $type = 'text'): array {
    return ['key' => $key, 'label' => $label, 'align' => $align, 'type' => $type];
}

function rpt_page_params(array $opts, int $default = 50, int $max = 300): array {
    $limit = min($max, max(1, (int)($_GET['limit'] ?? $default)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $groupBy = (string)($_GET['group_by'] ?? '');
    return ['limit' => $limit, 'offset' => $offset, 'group_by' => $groupBy];
}

/* ═══════════ CENTER (Report Center summary) ═══════════ */

function rpt_build_center(PDO $pdo, array $user, array $opts): array {
    $roleId = kpi_resolve_role($pdo, $user);
    $canCost = kpi_can_see_cost($roleId);
    $core = kpi_core_metrics($pdo, $opts);
    $pm = kpi_pm_metrics($pdo, $opts);
    $assets = kpi_asset_health($pdo);
    $range = kpi_parse_range($opts);

    $req = rpt_request_where($pdo, $opts);
    $reqWhere = $req['where'];
    $reqParams = $req['params'];
    $reqRange = kpi_range_sql($range, 'mr.created_at');
    $reqParams = array_merge($reqParams, $range ? [$range['start'], $range['end']] : []);
    $st = $pdo->prepare('SELECT COUNT(*) AS total,
            SUM(CASE WHEN mr.status = "open" THEN 1 ELSE 0 END) AS open_cnt,
            SUM(CASE WHEN mr.work_order_id IS NOT NULL THEN 1 ELSE 0 END) AS converted
        FROM maintenance_requests mr' . $reqWhere . $reqRange);
    $st->execute($reqParams);
    $reqAgg = $st->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'open_cnt' => 0, 'converted' => 0];

    $insp = [];
    try {
        $insp = $pdo->query('SELECT * FROM v_inspection_dashboard_kpis')->fetch(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) { $insp = []; }
    $passWithWarning = 0;
    try {
        $passWithWarning = (int)$pdo->query("SELECT COUNT(*) FROM inspection_schedules WHERE result = 'pass_with_warning'")->fetchColumn();
    } catch (Throwable $e) {}

    $mtbfLatest = $pdo->query("SELECT year, month, ROUND(AVG(mtbf_hours),1) AS mtbf, ROUND(AVG(mttr_minutes),1) AS mttr FROM mtbf_mttr GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 1")->fetch() ?: null;

    $kpi = [
        rpt_kpi('open_wo', 'งานค้างเปิด', (int)($core['open_wo'] ?? 0), 'ใบ', ((int)($core['open_wo'] ?? 0)) > 0 ? 'amber' : '', 'number'),
        rpt_kpi('overdue_wo', 'ค้างเกินกำหนด', (int)($core['overdue_wo'] ?? 0), 'ใบ', ($core['overdue_wo'] ?? 0) > 0 ? 'red' : 'green', 'number'),
        rpt_kpi('completion', 'อัตราปิดงาน', $core['wo_completion_rate'], '%', 'blue', 'pct'),
        rpt_kpi('pm_compliance', 'PM ทันกำหนด', $pm['on_time_pct'], '%', 'green', 'pct'),
        rpt_kpi('requests', 'คำขอแจ้งซ่อม', (int)$reqAgg['total'], 'รายการ', '', 'number'),
        if_e($canCost, rpt_kpi('cost_total', 'ค่าใช้จ่ายรวม', $core['cost_total'], 'บาท', 'cyan', 'money')),
        rpt_kpi('downtime', 'เวลาหยุดรวม', round(((float)($core['downtime_minutes'] ?? 0)) / 60, 1), 'ชม.', 'amber', 'number'),
        rpt_kpi('mttr', 'MTTR', $core['mttr_hours'], 'ชม.', 'blue', 'number'),
        rpt_kpi('mtbf', 'MTBF', $core['mtbf_hours'], 'ชม.', 'green', 'number'),
        rpt_kpi('tangassets', 'เครื่องจักรทั้งหมด', (int)($assets['total_assets'] ?? 0), 'เครื่อง', '', 'number'),
    ];

    $charts = [
        rpt_chart('wo_status', 'สถานะงานซ่อมปัจจุบัน', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวนใบ', 'tone' => 'primary']], cf_status_counts($pdo, $opts)),
        rpt_chart('pm_status', 'สถานะ PM/AM', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'info']], cf_pm_status_counts($pdo, $opts)),
        rpt_chart('inspection', 'ผลการตรวจเช็ค (สะสม)', 'bar', 'key', [
            ['key' => 'pass', 'name' => 'ผ่าน', 'tone' => 'success'],
            ['key' => 'warning', 'name' => 'ผ่านมีข้อสังเกต', 'tone' => 'warning'],
            ['key' => 'fail', 'name' => 'ไม่ผ่าน', 'tone' => 'danger'],
        ], [
            ['key' => 'ผ่าน', 'pass' => (int)($insp['passed'] ?? 0), 'warning' => $passWithWarning, 'fail' => (int)($insp['failed'] ?? 0)],
        ]),
    ];

    return [
        'resource' => 'center',
        'title_th' => 'ภาพรวมระบบซ่อมบำรุง (Report Center)', 'title_en' => 'Maintenance Report Center Overview',
        'kpi' => array_values(array_filter($kpi)),
        'charts' => $charts,
        'table' => null,
        'meta' => [
            'requests' => ['total' => (int)$reqAgg['total'], 'open' => (int)$reqAgg['open_cnt'], 'converted' => (int)$reqAgg['converted']],
            'inspection' => $insp,
            'mtbf_mttr_latest' => $mtbfLatest,
            'assets' => $assets,
            'stock_source_label' => 'Stock from Sage 300',
        ],
    ];
}

/** ตัด item ที่มีค่า null/ว่างออกจาก array ตามเงื่อนไข */
function if_e(bool $cond, array $item): ?array { return $cond ? $item : null; }

function cf_status_counts(PDO $pdo, array $opts): array {
    $w = rpt_repair_where($pdo, $opts);
    $range = kpi_parse_range($opts);
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);
    $st = $pdo->prepare('SELECT r.status AS `key`, COUNT(*) AS cnt FROM repair r' . $w['where'] . $rangeSql . ' GROUP BY r.status ORDER BY cnt DESC');
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function cf_pm_status_counts(PDO $pdo, array $opts): array {
    $st = $pdo->query("SELECT p.status AS `key`, COUNT(*) AS cnt FROM pm_am p GROUP BY p.status ORDER BY cnt DESC");
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ═══════════ WORK ORDERS ═══════════ */

function rpt_build_work_orders(PDO $pdo, array $user, array $opts): array {
    $roleId = kpi_resolve_role($pdo, $user);
    $canCost = kpi_can_see_cost($roleId);
    $core = kpi_core_metrics($pdo, $opts);
    $range = kpi_parse_range($opts);
    $w = rpt_repair_where($pdo, $opts);
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);

    $kpi = [
        rpt_kpi('total', 'ใบสั่งงานสร้าง', (int)$core['total_wo_created'], 'ใบ', '', 'number'),
        rpt_kpi('open', 'ค้างเปิด', (int)$core['open_wo'], 'ใบ', '', 'number'),
        rpt_kpi('overdue', 'ค้างเกินกำหนด', (int)$core['overdue_wo'], 'ใบ', (int)$core['overdue_wo'] > 0 ? 'red' : 'green', 'number'),
        rpt_kpi('completion', 'อัตราปิดงาน', $core['wo_completion_rate'], '%', 'blue', 'pct'),
        rpt_kpi('breakdown', 'งาน Breakdown', (int)$core['breakdown_count'], 'ใบ', '', 'number'),
        rpt_kpi('downtime', 'เวลาหยุดรวม', round(((float)($core['downtime_minutes'] ?? 0)) / 60, 1), 'ชม.', 'amber', 'number'),
        if_e($canCost, rpt_kpi('cost', 'ค่าใช้จ่ายรวม', $core['cost_total'], 'บาท', 'cyan', 'money')),
        rpt_kpi('mttr', 'MTTR', $core['mttr_hours'], 'ชม.', '', 'number'),
    ];

    $charts = [
        rpt_chart('status', 'แยกตามสถานะ', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวนใบ', 'tone' => 'primary']], cf_status_counts($pdo, $opts)),
        rpt_chart('source', 'แยกตามประเภทงาน', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวนใบ', 'tone' => 'info']],
            cf_group($pdo, $w, $range, $params, 'r.source_type', 'key', 'cnt')),
        rpt_chart('priority', 'แยกตามความเร่งด่วน', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวนใบ', 'tone' => 'warning']],
            cf_group($pdo, $w, $range, $params, 'r.priority', 'key', 'cnt')),
        rpt_chart('monthly', 'เปิดใหม่ vs ปิด (รายเดือน)', 'bar', 'label', [
            ['key' => 'created', 'name' => 'เปิดใหม่', 'tone' => 'primary'],
            ['key' => 'closed', 'name' => 'ปิดงาน', 'tone' => 'success'],
        ], cf_monthly_wo($pdo, $w, $range, $params, $range)),
    ];

    $pg = rpt_page_params($opts);
    $table = null;

    if ($pg['group_by'] !== '') {
        $dimSql = [
            'asset' => 'a.code AS dim_label',
            'department' => 'd.name AS dim_label',
            'technician' => 'u.full_name AS dim_label',
            'status' => 'r.status AS dim_label',
            'priority' => 'r.priority AS dim_label',
            'type' => 'r.source_type AS dim_label',
            'location' => 'l.name AS dim_label',
        ][$pg['group_by']] ?? 'r.id AS dim_label';
        $join = ' LEFT JOIN asset_registry a ON a.id = r.asset_id' .
            ' LEFT JOIN departments d ON d.id = r.department_id' .
            ' LEFT JOIN users u ON u.id = r.assigned_to' .
            ' LEFT JOIN locations l ON l.id = r.location_id';
        $order = 'cnt DESC';
        $st = $pdo->prepare('SELECT ' . $dimSql . ', COUNT(*) AS cnt,
                COALESCE(SUM(CASE WHEN r.downtime_minutes > 0 THEN 1 ELSE 0 END),0) AS dt_events,
                COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt_minutes,
                COALESCE(SUM(COALESCE(r.cost_labor,0)+COALESCE(r.cost_parts,0)+COALESCE(r.cost_outsource,0)),0) AS cost,
                ROUND(COALESCE(AVG(NULLIF(r.repair_time_minutes,0)),0),0) AS avg_repair_min
            FROM repair r' . $join . $w['where'] . $rangeSql . ' GROUP BY dim_label ORDER BY ' . $order);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $cols = [
            rpt_col('dim_label', 'กลุ่ม', 'left', 'text'),
            rpt_col('cnt', 'จำนวนใบ', 'center', 'number'),
            rpt_col('dt_events', 'งานมี Downtime', 'center', 'number'),
            rpt_col('dt_minutes', 'Downtime (ชม.)', 'right', 'hours'),
            rpt_col('avg_repair_min', 'เวลาซ่อมเฉลี่ย (นาที)', 'right', 'number'),
            if_e($canCost, rpt_col('cost', 'ค่าใช้จ่าย', 'right', 'money')),
        ];
        $table = ['columns' => array_values(array_filter($cols)), 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)];
    } else {
        $cols = [
            rpt_col('work_order_no', 'เลขที่ใบสั่งงาน', 'left', 'link'),
            rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
            rpt_col('title', 'ปัญหา / หัวข้อ', 'left', 'text'),
            rpt_col('priority', 'ความสำคัญ', 'center', 'status'),
            rpt_col('assigned_name', 'ช่าง', 'left', 'text'),
            rpt_col('status', 'สถานะ', 'center', 'status'),
            rpt_col('created_at', 'วันที่แจ้ง', 'center', 'datetime'),
            rpt_col('started_at', 'เริ่มงาน', 'center', 'datetime'),
            rpt_col('completed_at', 'เสร็จงาน', 'center', 'datetime'),
            rpt_col('dt_h', 'Downtime (ชม.)', 'right', 'hours'),
            if_e($canCost, rpt_col('cost', 'ค่าใช้จ่าย', 'right', 'money')),
        ];
        $sel = 'SELECT r.id, r.work_order_no, a.code AS asset_code, a.name AS asset_name, r.title,
                r.priority, r.status, r.source_type, u.full_name AS assigned_name,
                r.created_at, r.actual_start_at AS started_at, r.completed_at,
                ROUND(COALESCE(r.downtime_minutes,0)/60,2) AS dt_h,
                COALESCE(r.cost_labor,0)+COALESCE(r.cost_parts,0)+COALESCE(r.cost_outsource,0) AS cost
            FROM repair r
            LEFT JOIN asset_registry a ON a.id = r.asset_id
            LEFT JOIN users u ON u.id = r.assigned_to' . $w['where'] . $rangeSql . '
            ORDER BY r.created_at DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $st = $pdo->prepare($sel);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) $r['_href'] = '/repair/view?id=' . (int)$r['id'];
        unset($r);

        $cnt = $pdo->prepare('SELECT COUNT(*) FROM repair r' . $w['where'] . $rangeSql);
        $cnt->execute($params);
        $total = (int)$cnt->fetchColumn();

        $cols = array_values(array_filter($cols));
        foreach ($cols as &$c) if ($c['key'] === 'work_order_no') $c['type'] = 'link';
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => $total, 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']];
    }

    return [
        'resource' => 'work-orders',
        'title_th' => 'รายงานใบสั่งซ่อม (Work Order)', 'title_en' => 'Work Order Report',
        'kpi' => array_values(array_filter($kpi)), 'charts' => $charts, 'table' => $table,
        'groupByOptions' => [
            ['value' => 'asset', 'label' => 'ตามเครื่องจักร'], ['value' => 'department', 'label' => 'ตามแผนก'],
            ['value' => 'technician', 'label' => 'ตามช่าง'], ['value' => 'location', 'label' => 'ตามสถานที่'],
            ['value' => 'status', 'label' => 'ตามสถานะ'], ['value' => 'priority', 'label' => 'ตามความเร่งด่วน'],
            ['value' => 'type', 'label' => 'ตามประเภทงาน'],
        ],
    ];
}

/** GROUP BY ง่าย ๆ (key => label mapping ผ่าน alias) */
function cf_group(PDO $pdo, array $w, ?array $range, array $params, string $expr, string $alias, string $cntAlias): array {
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $st = $pdo->prepare('SELECT ' . $expr . ' AS `' . $alias . '`, COUNT(*) AS `' . $cntAlias . '` FROM repair r' . $w['where'] . $rangeSql . ' GROUP BY ' . $expr . ' ORDER BY `' . $cntAlias . '` DESC');
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** เทรนด์เปิด/ปิดงานรายเดือน */
function cf_monthly_wo(PDO $pdo, array $w, ?array $range, array $params, ?array $rangeFull): array {
    $buckets = rpt_month_buckets($rangeFull);
    $createdSql = kpi_range_sql($range, 'r.created_at');
    $closedSql = kpi_range_sql($range, 'r.completed_at');
    $stC = $pdo->prepare('SELECT DATE_FORMAT(r.created_at, "%Y-%m") AS ym, COUNT(*) AS cnt FROM repair r' . $w['where'] . $createdSql . ' GROUP BY ym');
    $stC->execute($params);
    $cMap = [];
    foreach ($stC->fetchAll(PDO::FETCH_ASSOC) as $r) $cMap[$r['ym']] = (int)$r['cnt'];
    $stD = $pdo->prepare('SELECT DATE_FORMAT(r.completed_at, "%Y-%m") AS ym, COUNT(*) AS cnt FROM repair r' . $w['where'] . ' AND r.completed_at IS NOT NULL' . $closedSql . ' GROUP BY ym');
    $stD->execute($params);
    $dMap = [];
    foreach ($stD->fetchAll(PDO::FETCH_ASSOC) as $r) $dMap[$r['ym']] = (int)$r['cnt'];
    $out = [];
    foreach ($buckets as $ym => $b) {
        $out[] = ['label' => $b['label'], 'created' => $cMap[$ym] ?? 0, 'closed' => $dMap[$ym] ?? 0];
    }
    return $out;
}

/* ═══════════ REQUESTS (Maintenance Request) ═══════════ */

function rpt_build_requests(PDO $pdo, array $user, array $opts): array {
    $range = kpi_parse_range($opts);
    $w = rpt_request_where($pdo, $opts);
    $rangeSql = kpi_range_sql($range, 'mr.created_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);
    $whereFull = $w['where'] . $rangeSql;

    $aggSql = 'SELECT COUNT(*) AS total,
        SUM(CASE WHEN mr.status = "open" THEN 1 ELSE 0 END) AS new_cnt,
        SUM(CASE WHEN mr.status = "approved" THEN 1 ELSE 0 END) AS approved_cnt,
        SUM(CASE WHEN mr.status = "rejected" THEN 1 ELSE 0 END) AS rejected_cnt,
        SUM(CASE WHEN mr.work_order_id IS NOT NULL THEN 1 ELSE 0 END) AS converted_cnt,
        SUM(CASE WHEN mr.status IN ("resolved","completed","closed") THEN 1 ELSE 0 END) AS completed_cnt,
        SUM(CASE WHEN mr.status = "closed" THEN 1 ELSE 0 END) AS closed_cnt,
        ROUND(AVG(CASE WHEN mr.reviewed_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, mr.created_at, mr.reviewed_at) END),0) AS avg_response_min
        FROM maintenance_requests mr' . $whereFull;
    $st = $pdo->prepare($aggSql);
    $st->execute($params);
    $a = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    $total = (int)($a['total'] ?? 0);
    $converted = (int)($a['converted_cnt'] ?? 0);

    $kpi = [
        rpt_kpi('total', 'คำขอทั้งหมด', $total, 'รายการ', '', 'number'),
        rpt_kpi('new', 'รอพิจารณา (New)', (int)($a['new_cnt'] ?? 0), 'รายการ', '', 'number'),
        rpt_kpi('approved', 'อนุมัติแล้ว', (int)($a['approved_cnt'] ?? 0), 'รายการ', '', 'number'),
        rpt_kpi('rejected', 'ไม่ผ่าน', (int)($a['rejected_cnt'] ?? 0), 'รายการ', (int)($a['rejected_cnt'] ?? 0) > 0 ? 'red' : '', 'number'),
        rpt_kpi('converted', 'เปลี่ยนเป็นใบสั่งงาน', $converted, 'รายการ', 'blue', 'number'),
        rpt_kpi('conversion', 'Conversion Rate', $total > 0 ? round($converted / $total * 100, 1) : null, '%', 'green', 'pct'),
        rpt_kpi('completed', 'เสร็จสิ้น', (int)($a['completed_cnt'] ?? 0), 'รายการ', '', 'number'),
        rpt_kpi('avg_response', 'เวลาตอบสนองเฉลี่ย', ($a['avg_response_min'] ?? null) !== null ? (int)$a['avg_response_min'] : null, 'นาที', '', 'number'),
    ];

    $statusMap = ['open' => 'รอพิจารณา', 'in_progress' => 'กำลังดำเนินการ', 'waiting_parts' => 'รออะไหล่', 'waiting_approval' => 'รออนุมัติ',
        'approved' => 'อนุมัติแล้ว', 'rejected' => 'ไม่ผ่าน', 'resolved' => 'แก้ไขแล้ว', 'closed' => 'ปิด', 'cancelled' => 'ยกเลิก'];
    $charts = [
        rpt_chart('status', 'แยกตามสถานะ', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'primary']], cf_req_group($pdo, $w, $range, $params, 'mr.status', 'key')),
    ];

    $pg = rpt_page_params($opts);
    $sel = 'SELECT mr.id, mr.request_code, mr.title, mr.priority, mr.status,
                a.code AS asset_code, a.name AS asset_name, d.name AS department,
                u.full_name AS requested_by, mr.created_at, mr.reviewed_at,
                wo.work_order_no, wo.id AS wo_id
            FROM maintenance_requests mr
            LEFT JOIN asset_registry a ON a.id = mr.asset_id
            LEFT JOIN departments d ON d.id = mr.department_id
            LEFT JOIN users u ON u.id = mr.requested_by
            LEFT JOIN repair wo ON wo.id = mr.work_order_id' . $whereFull . '
            ORDER BY mr.created_at DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
    $st = $pdo->prepare($sel);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['priority_lbl'] = $r['priority'];
        $r['_href'] = $r['wo_id'] ? '/repair/view?id=' . (int)$r['wo_id'] : null;
    }
    unset($r);
    $cnt = $pdo->prepare('SELECT COUNT(*) FROM maintenance_requests mr' . $whereFull);
    $cnt->execute($params);
    $totalAll = (int)$cnt->fetchColumn();

    $cols = [
        rpt_col('request_code', 'รหัสคำขอ', 'left', 'link'),
        rpt_col('title', 'หัวข้อ', 'left', 'text'),
        rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
        rpt_col('priority', 'ความสำคัญ', 'center', 'status'),
        rpt_col('status', 'สถานะ', 'center', 'status'),
        rpt_col('requested_by', 'ผู้แจ้ง', 'left', 'text'),
        rpt_col('department', 'แผนก', 'left', 'text'),
        rpt_col('created_at', 'วันที่แจ้ง', 'center', 'datetime'),
        rpt_col('reviewed_at', 'วันที่พิจารณา', 'center', 'datetime'),
        rpt_col('work_order_no', 'WO ที่แปลง', 'left', 'link'),
    ];
    foreach ($cols as &$c) $c['type'] = $c['key'] === 'request_code' || $c['key'] === 'work_order_no' ? 'link' : $c['type'];

    return [
        'resource' => 'requests',
        'title_th' => 'รายงานคำขอแจ้งซ่อม (Maintenance Request)', 'title_en' => 'Maintenance Request Report',
        'kpi' => $kpi, 'charts' => $charts,
        'table' => ['columns' => $cols, 'rows' => $rows, 'total' => $totalAll, 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']],
        'note' => 'Conversion Rate = คำขอที่ถูกแปลงเป็นใบสั่งงาน ÷ คำขอทั้งหมดในช่วงนี้ — ใช้ร่วมกับ New/Rejected ในการประเมินกระบวนการรับงาน',
    ];
}

function cf_req_group(PDO $pdo, array $w, ?array $range, array $params, string $expr, string $alias): array {
    $rangeSql = kpi_range_sql($range, 'mr.created_at');
    $st = $pdo->prepare('SELECT ' . $expr . ' AS `' . $alias . '`, COUNT(*) AS cnt FROM maintenance_requests mr' . $w['where'] . $rangeSql . ' GROUP BY ' . $expr . ' ORDER BY cnt DESC');
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ═══════════ PM ═══════════ */

function rpt_build_pm(PDO $pdo, array $user, array $opts): array {
    $pm = kpi_pm_metrics($pdo, $opts);
    $range = kpi_parse_range($opts);

    $kpi = [
        rpt_kpi('due', 'ถึงกำหนด (Due)', (int)$pm['due_total'], 'รายการ', '', 'number'),
        rpt_kpi('completed', 'ทำเสร็จ', (int)$pm['completed'], 'รายการ', '', 'number'),
        rpt_kpi('on_time', 'เสร็จตามกำหนด', (int)$pm['on_time'], 'รายการ', 'green', 'number'),
        rpt_kpi('late', 'เสร็จช้า', (int)$pm['late'], 'รายการ', 'amber', 'number'),
        rpt_kpi('overdue', 'ค้างเกินกำหนด', (int)$pm['overdue_pending'], 'รายการ', (int)$pm['overdue_pending'] > 0 ? 'red' : '', 'number'),
        rpt_kpi('compliance', 'PM Compliance (ทันกำหนด)', $pm['on_time_pct'], '%', 'blue', 'pct'),
        rpt_kpi('completion', 'Completion Rate', $pm['completion_rate'], '%', 'green', 'pct'),
    ];

    $st = $pdo->query("SELECT p.status AS `key`, COUNT(*) AS cnt FROM pm_am p GROUP BY p.status");
    $statusDist = $st->fetchAll(PDO::FETCH_ASSOC);
    $charts = [
        rpt_chart('status', 'แยกตามสถานะ', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'info']], $statusDist),
        rpt_chart('freq', 'แยกตามรอบ PM', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'primary']],
            $pdo->query("SELECT p.frequency_type AS `key`, COUNT(*) AS cnt FROM pm_am p GROUP BY p.frequency_type ORDER BY cnt DESC")->fetchAll(PDO::FETCH_ASSOC)),
    ];

    $pg = rpt_page_params($opts);
    $groupBy = $pg['group_by'];

    if ($groupBy !== '') {
        $dimSql = [
            'asset' => 'COALESCE(a.code, "ไม่ระบุ") AS dim_label',
            'status' => 'p.status AS dim_label',
            'pm_type' => 'p.frequency_type AS dim_label',
            'technician' => 'COALESCE(u.full_name, "ไม่ระบุ") AS dim_label',
            'department' => 'COALESCE(a.department, "ไม่ระบุ") AS dim_label',
            'period' => 'DATE_FORMAT(p.due_date, "%Y-%m") AS dim_label',
        ][$groupBy] ?? 'p.status AS dim_label';
        $st = $pdo->prepare('SELECT ' . $dimSql . ',
                COUNT(*) AS cnt,
                SUM(CASE WHEN p.status = "completed" THEN 1 ELSE 0 END) AS done_cnt,
                SUM(CASE WHEN p.status = "completed" AND p.completed_at IS NOT NULL AND p.completed_at <= p.due_date THEN 1 ELSE 0 END) AS on_time,
                SUM(CASE WHEN p.status IN ("pending","in_progress") AND p.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue
            FROM pm_am p
            LEFT JOIN asset_registry a ON a.id = p.asset_id
            LEFT JOIN users u ON u.id = p.assigned_to
            GROUP BY dim_label ORDER BY cnt DESC');
        $st->execute();
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $cols = [
            rpt_col('dim_label', 'กลุ่ม', 'left', 'text'),
            rpt_col('cnt', 'ทั้งหมด', 'center', 'number'),
            rpt_col('done_cnt', 'ทำเสร็จ', 'center', 'number'),
            rpt_col('on_time', 'ทันกำหนด', 'center', 'number'),
            rpt_col('overdue', 'ค้างเกินกำหนด', 'center', 'number'),
        ];
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)];
    } else {
        $sel = 'SELECT p.id, p.title, p.frequency_type, p.priority, p.status, p.due_date, p.completed_at,
                    a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
                FROM pm_am p
                LEFT JOIN asset_registry a ON a.id = p.asset_id
                LEFT JOIN users u ON u.id = p.assigned_to' . ($range ? str_replace('r.', 'p.', kpi_range_sql($range, 'p.due_date')) : '') . '
                ORDER BY p.due_date ASC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $pms = [];
        if ($range) {
            $st = $pdo->prepare($sel);
            $st->execute([$range['start'], $range['end']]);
            $pms = $st->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $pms = $pdo->query($sel)->fetchAll(PDO::FETCH_ASSOC);
        }
        $cols = [
            rpt_col('title', 'งาน PM/AM', 'left', 'text'),
            rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
            rpt_col('frequency_type', 'รอบ', 'center', 'text'),
            rpt_col('priority', 'ความสำคัญ', 'center', 'status'),
            rpt_col('status', 'สถานะ', 'center', 'status'),
            rpt_col('due_date', 'กำหนดเสร็จ', 'center', 'date'),
            rpt_col('completed_at', 'เสร็จจริง', 'center', 'date'),
            rpt_col('assigned_name', 'ผู้รับผิดชอบ', 'left', 'text'),
        ];
        $total = (int)$pdo->query('SELECT COUNT(*) FROM pm_am')->fetchColumn();
        $table = ['columns' => $cols, 'rows' => $pms, 'total' => $total, 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']];
    }

    return [
        'resource' => 'pm',
        'title_th' => 'รายงาน PM / AM', 'title_en' => 'Preventive Maintenance Report',
        'kpi' => $kpi, 'charts' => $charts, 'table' => $table,
        'groupByOptions' => [
            ['value' => 'asset', 'label' => 'ตามเครื่องจักร'], ['value' => 'department', 'label' => 'ตามแผนก (เครื่องจักร)'],
            ['value' => 'technician', 'label' => 'ตามช่าง'], ['value' => 'pm_type', 'label' => 'ตามรอบ PM'],
            ['value' => 'status', 'label' => 'ตามสถานะ'], ['value' => 'period', 'label' => 'ตามเดือนกำหนด'],
        ],
    ];
}

/* ═══════════ INSPECTIONS ═══════════ */

function rpt_build_inspections(PDO $pdo, array $user, array $opts): array {
    $range = kpi_parse_range($opts);
    $w = rpt_repair_where($pdo, ['asset_id' => $opts['asset_id'] ?? '', 'role_id' => -1]);
    $doneSql = kpi_range_sql($range, 's.completed_at');
    $params = $range ? [$range['start'], $range['end']] : [];

    $assetWhere = '';
    $assetParams = [];
    if (!empty($opts['asset_id']) && (int)$opts['asset_id'] > 0) {
        $assetWhere = ' AND s.asset_id = ?';
        $assetParams = [(int)$opts['asset_id']];
    }
    $aggSql = 'SELECT COUNT(*) AS total,
            SUM(CASE WHEN s.status = "completed" THEN 1 ELSE 0 END) AS completed_cnt,
            SUM(CASE WHEN s.status = "completed" AND s.result = "pass" THEN 1 ELSE 0 END) AS pass_cnt,
            SUM(CASE WHEN s.status = "completed" AND s.result = "pass_with_warning" THEN 1 ELSE 0 END) AS warn_cnt,
            SUM(CASE WHEN s.status = "completed" AND s.result = "fail" THEN 1 ELSE 0 END) AS fail_cnt,
            SUM(CASE WHEN s.status = "completed" AND s.result = "critical_fail" THEN 1 ELSE 0 END) AS critical_cnt,
            ROUND(100 * SUM(CASE WHEN s.status = "completed" AND s.result = "pass" THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN s.status = "completed" THEN 1 ELSE 0 END),0),1) AS avg_score
        FROM inspection_schedules s WHERE 1=1' . $assetWhere . $doneSql;
    $st = $pdo->prepare($aggSql);
    $st->execute(array_merge($assetParams, $params));
    $a = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    $completed = (int)($a['completed_cnt'] ?? 0);
    $fail = (int)($a['fail_cnt'] ?? 0);
    $critical = (int)($a['critical_cnt'] ?? 0);

    $kpi = [
        rpt_kpi('completed', 'ตรวจแล้ว (Completed)', $completed, 'ครั้ง', '', 'number'),
        rpt_kpi('pass', 'ผ่าน', (int)($a['pass_cnt'] ?? 0), 'ครั้ง', 'green', 'number'),
        rpt_kpi('warning', 'ผ่านมีข้อสังเกต', (int)($a['warn_cnt'] ?? 0), 'ครั้ง', 'amber', 'number'),
        rpt_kpi('fail', 'ไม่ผ่าน', $fail, 'ครั้ง', ($fail > 0 ? 'red' : ''), 'number'),
        rpt_kpi('critical', 'วิกฤต (Critical Fail)', $critical, 'ครั้ง', $critical > 0 ? 'red' : '', 'number'),
        rpt_kpi('avg_score', 'คะแนนเฉลี่ย (ผ่าน/ทั้งหมด)', $completed > 0 ? round(100 * (int)($a['pass_cnt'] ?? 0) / $completed, 1) : null, '%', 'blue', 'pct'),
    ];

    $monthly = [];
    $st = $pdo->prepare('SELECT DATE_FORMAT(s.completed_at, "%Y-%m") AS ym,
            SUM(CASE WHEN s.result = "pass" THEN 1 ELSE 0 END) AS pass,
            SUM(CASE WHEN s.result = "pass_with_warning" THEN 1 ELSE 0 END) AS warning,
            SUM(CASE WHEN s.result = "fail" THEN 1 ELSE 0 END) AS fail,
            SUM(CASE WHEN s.result = "critical_fail" THEN 1 ELSE 0 END) AS critical
        FROM inspection_schedules s WHERE s.status = "completed" AND s.completed_at IS NOT NULL' . $assetWhere . $doneSql . ' GROUP BY ym ORDER BY ym');
    $st->execute(array_merge($assetParams, $params));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        [$y, $m] = array_map('intval', explode('-', $r['ym']));
        $monthly[] = ['label' => __rpt_month_th((string)$m) . ' ' . $y, 'pass' => (int)$r['pass'], 'warning' => (int)$r['warning'], 'fail' => (int)$r['fail'], 'critical' => (int)$r['critical']];
    }
    $charts = [
        rpt_chart('monthly', 'ผลตรวจรายเดือน', 'stacked', 'label', [
            ['key' => 'pass', 'name' => 'ผ่าน', 'tone' => 'success'],
            ['key' => 'warning', 'name' => 'ข้อสังเกต', 'tone' => 'warning'],
            ['key' => 'fail', 'name' => 'ไม่ผ่าน', 'tone' => 'danger'],
        ], $monthly),
        rpt_chart('result', 'ผลรวม', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'info']], [
            ['key' => 'ผ่าน', 'cnt' => (int)($a['pass_cnt'] ?? 0)],
            ['key' => 'ข้อสังเกต', 'cnt' => (int)($a['warn_cnt'] ?? 0)],
            ['key' => 'ไม่ผ่าน', 'cnt' => $fail],
            ['key' => 'วิกฤต', 'cnt' => $critical],
        ]),
    ];

    $pg = rpt_page_params($opts);
    $sel = 'SELECT s.id, a.code AS asset_code, a.name AS asset_name, t.code AS template_code, t.title AS template_title,
                s.due_date, s.started_at, s.completed_at, s.status, s.result, s.fail_count,
                u.full_name AS inspector_name,
                (SELECT COUNT(*) FROM inspection_results ir WHERE ir.schedule_id = s.id AND ir.status = "fail") AS failed_items,
                wo.work_order_no, wo.id AS wo_id, mr.request_code, mr.id AS mr_id
            FROM inspection_schedules s
            LEFT JOIN asset_registry a ON a.id = s.asset_id
            LEFT JOIN inspection_templates t ON t.id = s.template_id
            LEFT JOIN users u ON u.id = s.inspector_id
            LEFT JOIN inspection_fail_actions ifa ON ifa.schedule_id = s.id
            LEFT JOIN repair wo ON wo.id = ifa.repair_id
            LEFT JOIN maintenance_requests mr ON mr.id = ifa.maintenance_request_id
            WHERE 1=1' . $assetWhere . $doneSql . '
            ORDER BY s.completed_at DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
    $st = $pdo->prepare($sel);
    $st->execute(array_merge($assetParams, $params));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) $r['_href'] = $r['wo_id'] ? '/repair/view?id=' . (int)$r['wo_id'] : null;
    unset($r);
    $cnt = $pdo->prepare('SELECT COUNT(*) FROM inspection_schedules s WHERE 1=1' . $assetWhere . $doneSql);
    $cnt->execute(array_merge($assetParams, $params));
    $cols = [
        rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
        rpt_col('template_title', 'รายการตรวจ', 'left', 'text'),
        rpt_col('result', 'ผล', 'center', 'status'),
        rpt_col('fail_count', 'รายการไม่ผ่าน', 'center', 'number'),
        rpt_col('inspector_name', 'ผู้ตรวจ', 'left', 'text'),
        rpt_col('due_date', 'กำหนด', 'center', 'date'),
        rpt_col('completed_at', 'ตรวจเสร็จ', 'center', 'datetime'),
        rpt_col('work_order_no', 'WO ที่สร้าง', 'left', 'link'),
    ];
    return [
        'resource' => 'inspections',
        'title_th' => 'รายงานการตรวจเช็ค (Inspection)', 'title_en' => 'Inspection Report',
        'kpi' => $kpi, 'charts' => $charts,
        'table' => ['columns' => $cols, 'rows' => $rows, 'total' => (int)$cnt->fetchColumn(), 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']],
        'note' => 'คำเตือน: ผล "ไม่ผ่าน" และ "Critical" ควรถูกติดตามด้วยใบสั่งงาน/คำขอที่สร้างต่อทันที (ดูคอลัมน์ WO ที่สร้าง)',
    ];
}

/* ═══════════ ASSETS ═══════════ */

function rpt_build_assets(PDO $pdo, array $user, array $opts): array {
    $h = kpi_asset_health($pdo);
    $range = kpi_parse_range($opts);
    $rangeSql = $range ? ' AND r.created_at BETWEEN ? AND ?' : '';
    $params = $range ? [$range['start'], $range['end']] : [];
    $canCost = kpi_can_see_cost(kpi_resolve_role($pdo, $user));

    $kpi = [
        rpt_kpi('total', 'เครื่องจักรทั้งหมด', (int)$h['total_assets'], 'เครื่อง', '', 'number'),
        rpt_kpi('running', 'เดินปกติ', (int)$h['running'], 'เครื่อง', 'green', 'number'),
        rpt_kpi('down', 'มีงานค้าง', (int)$h['down'], 'เครื่อง', (int)$h['down'] > 0 ? 'amber' : '', 'number'),
        rpt_kpi('under_maint', 'ระหว่างซ่อม', (int)$h['under_maintenance'], 'เครื่อง', 'red', 'number'),
        rpt_kpi('critical', 'ชั้นวิกฤต A', (int)$h['critical_assets'], 'เครื่อง', '', 'number'),
        rpt_kpi('repeated_fail', 'เสียซ้ำ (90 วัน)', (int)$h['repeated_failure_assets'], 'เครื่อง', (int)$h['repeated_failure_assets'] > 0 ? 'red' : '', 'number'),
    ];

    $statusChart = $pdo->query("SELECT status AS `key`, COUNT(*) AS cnt FROM asset_registry GROUP BY status ORDER BY cnt DESC")->fetchAll(PDO::FETCH_ASSOC);
    $critChart = $pdo->query("SELECT criticality AS `key`, COUNT(*) AS cnt FROM asset_registry WHERE criticality IS NOT NULL GROUP BY criticality ORDER BY cnt DESC")->fetchAll(PDO::FETCH_ASSOC);
    $charts = [
        rpt_chart('status', 'แยกตามสถานะ', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'primary']], $statusChart),
        rpt_chart('criticality', 'แยกตามความวิกฤต', 'bar', 'key', [['key' => 'cnt', 'name' => 'จำนวน', 'tone' => 'warning']], $critChart),
    ];

    $pg = rpt_page_params($opts, 50, 200);
    $sel = 'SELECT a.id, a.code, a.name, a.criticality, a.status, a.category, a.location, a.department,
                (SELECT COUNT(*) FROM repair r WHERE r.asset_id = a.id AND r.source_type = "breakdown"' . $rangeSql . ') AS failure_cnt,
                (SELECT COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) FROM repair r WHERE r.asset_id = a.id' . $rangeSql . ') AS dt_minutes,
                (SELECT COALESCE(SUM(COALESCE(r.cost_labor,0)+COALESCE(r.cost_parts,0)+COALESCE(r.cost_outsource,0)),0) FROM repair r WHERE r.asset_id = a.id' . $rangeSql . ') AS cost,
                (SELECT COUNT(*) FROM pm_am p WHERE p.asset_id = a.id AND p.status = "completed") AS pm_done,
                (SELECT COUNT(*) FROM pm_am p WHERE p.asset_id = a.id AND p.status = "completed" AND p.completed_at <= p.due_date) AS pm_ontime,
                (SELECT isc.result FROM inspection_schedules isc WHERE isc.asset_id = a.id AND isc.status = "completed" ORDER BY isc.completed_at DESC LIMIT 1) AS last_insp
            FROM asset_registry a
            ORDER BY a.code ASC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
    $st = $pdo->prepare($sel);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['failure_cnt'] = (int)$r['failure_cnt'];
        $r['dt_hours'] = round(((float)$r['dt_minutes']) / 60, 1);
        $r['pm_compliance'] = ($r['pm_done'] > 0) ? round(100 * (int)$r['pm_ontime'] / (int)$r['pm_done']) : null;
        $score = 100;
        if ((int)$r['failure_cnt'] > 1) $score -= 25;
        if ((float)$r['dt_hours'] >= 24) $score -= 20;
        if (in_array($r['last_insp'], ['fail', 'critical_fail'], true)) $score -= 25;
        $r['health'] = $score >= 80 ? 'แข็งแรง' : ($score >= 50 ? 'เฝ้าระวัง' : 'เสี่ยง');
        $r['_href'] = null;
    }
    unset($r);
    $total = (int)$pdo->query('SELECT COUNT(*) FROM asset_registry')->fetchColumn();
    $cols = array_values(array_filter([
        rpt_col('code', 'รหัส', 'left', 'link'),
        rpt_col('name', 'ชื่อเครื่อง', 'left', 'text'),
        rpt_col('criticality', 'วิกฤต', 'center', 'status'),
        rpt_col('status', 'สถานะ', 'center', 'status'),
        rpt_col('failure_cnt', 'เสีย (ครั้ง)', 'center', 'number'),
        rpt_col('dt_hours', 'Downtime (ชม.)', 'right', 'hours'),
        if_e($canCost, rpt_col('cost', 'ค่าซ่อม', 'right', 'money')),
        rpt_col('pm_compliance', 'PM ทันกำหนด (%)', 'center', 'pct'),
        rpt_col('last_insp', 'ตรวจล่าสุด', 'center', 'status'),
        rpt_col('health', 'สถานะสุขภาพ', 'center', 'status'),
    ]));
    return [
        'resource' => 'assets',
        'title_th' => 'รายงานสถานะเครื่องจักร / Asset Health', 'title_en' => 'Asset Report',
        'kpi' => $kpi, 'charts' => $charts,
        'table' => ['columns' => $cols, 'rows' => $rows, 'total' => $total, 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']],
        'note' => 'Asset Health (คะแนน 100) ประเมินจาก จำนวน Breakdown, ชั่วโมง Downtime และผลการตรวจล่าสุด — ใช้เพื่อจัดลำดับการดูแล ไม่ใช่การประเมินบุคคล',
    ];
}

/* ═══════════ SPARE PARTS USAGE ═══════════ */

function rpt_build_spare_parts(PDO $pdo, array $user, array $opts): array {
    $range = kpi_parse_range($opts);
    $w = rpt_repair_where($pdo, $opts);
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);
    $canCost = kpi_can_see_cost(kpi_resolve_role($pdo, $user));

    $agg = 'SELECT COUNT(DISTINCT sp.id) AS parts_used,
            COALESCE(SUM(rsp.quantity_used),0) AS qty_used,
            COALESCE(SUM(rsp.quantity_used * rsp.unit_price),0) AS material_cost,
            COUNT(rsp.id) AS line_count
        FROM repair_spare_parts rsp
        JOIN repair r ON r.id = rsp.repair_id
        LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id' . $w['where'] . $rangeSql;
    $st = $pdo->prepare($agg);
    $st->execute($params);
    $a = $st->fetch(PDO::FETCH_ASSOC) ?: [];

    $stockSummary = $pdo->query('SELECT COUNT(*) AS items, COALESCE(SUM(stock_qty * unit_price),0) AS value, MAX(last_synced_at) AS last_synced FROM spare_parts')->fetch() ?: [];

    $kpi = [
        rpt_kpi('parts_used', 'อะไหล่ที่ใช้', (int)($a['parts_used'] ?? 0), 'รายการ', '', 'number'),
        rpt_kpi('qty_used', 'จำนวนที่ใช้', (float)($a['qty_used'] ?? 0), 'หน่วย', '', 'number'),
        if_e($canCost, rpt_kpi('material_cost', 'ค่าวัสดุ', round((float)($a['material_cost'] ?? 0), 2), 'บาท', 'cyan', 'money')),
        rpt_kpi('stock_items', 'รายการสต็อก (ยอดปัจจุบัน)', (int)($stockSummary['items'] ?? 0), 'รายการ', '', 'number'),
        rpt_kpi('stock_value', 'มูลค่าสต็อก (ยอดปัจจุบัน)', round((float)($stockSummary['value'] ?? 0), 2), 'บาท', '', 'money'),
    ];

    $charts = [
        rpt_chart('top_used', 'อะไหล่ถูกใช้มากสุด', 'bar', 'label', [['key' => 'qty', 'name' => 'จำนวน', 'tone' => 'primary']],
            rpt_top_parts($pdo, $w, $range, $params, 'qty')),
        rpt_chart('top_cost', 'อะไหล่ค่าวัสดุสูงสุด', 'bar', 'label', [['key' => 'cost', 'name' => 'บาท', 'tone' => 'danger']],
            rpt_top_parts($pdo, $w, $range, $params, 'cost')),
    ];

    $pg = rpt_page_params($opts);
    $groupBy = $pg['group_by'];
    if ($groupBy === 'asset') {
        $sel = 'SELECT a.code AS asset_code, a.name AS asset_name,
                COUNT(DISTINCT rsp.spare_part_id) AS parts_cnt, COALESCE(SUM(rsp.quantity_used),0) AS qty,
                COALESCE(SUM(rsp.quantity_used*rsp.unit_price),0) AS cost
            FROM repair_spare_parts rsp
            JOIN repair r ON r.id = rsp.repair_id
            LEFT JOIN asset_registry a ON a.id = r.asset_id' . $w['where'] . $rangeSql . '
            GROUP BY a.id, a.code, a.name ORDER BY qty DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $cols = [rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'), rpt_col('parts_cnt', 'ประเภทอะไหล่', 'center', 'number'), rpt_col('qty', 'จำนวนใช้', 'right', 'number'),
            if_e($canCost, rpt_col('cost', 'ค่าวัสดุ', 'right', 'money'))];
    } elseif ($groupBy === 'work_order') {
        $sel = 'SELECT r.work_order_no, a.code AS asset_code, COUNT(DISTINCT rsp.spare_part_id) AS parts_cnt,
                COALESCE(SUM(rsp.quantity_used),0) AS qty, COALESCE(SUM(rsp.quantity_used*rsp.unit_price),0) AS cost
            FROM repair_spare_parts rsp
            JOIN repair r ON r.id = rsp.repair_id
            LEFT JOIN asset_registry a ON a.id = r.asset_id' . $w['where'] . $rangeSql . '
            GROUP BY r.id, r.work_order_no, a.code ORDER BY qty DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $cols = [rpt_col('work_order_no', 'ใบสั่งงาน', 'left', 'link'), rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
            rpt_col('parts_cnt', 'ประเภทอะไหล่', 'center', 'number'), rpt_col('qty', 'จำนวนใช้', 'right', 'number'),
            if_e($canCost, rpt_col('cost', 'ค่าวัสดุ', 'right', 'money'))];
    } else {
        $sel = 'SELECT COALESCE(rsp.sage_item_code, sp.sage_item_no, sp.code, CONCAT("#", rsp.spare_part_id)) AS item_code,
                COALESCE(rsp.item_description, sp.name, "-") AS description,
                COALESCE(rsp.unit, sp.unit) AS unit,
                SUM(rsp.quantity_used) AS qty,
                SUM(rsp.quantity_used*rsp.unit_price) AS cost,
                COUNT(DISTINCT r.id) AS wo_cnt,
                MAX(rsp.created_at) AS last_used
            FROM repair_spare_parts rsp
            JOIN repair r ON r.id = rsp.repair_id
            LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id' . $w['where'] . $rangeSql . '
            GROUP BY rsp.sage_item_code, sp.sage_item_no, sp.code, rsp.spare_part_id, rsp.item_description, sp.name, rsp.unit, sp.unit
            ORDER BY qty DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $cols = [rpt_col('item_code', 'รหัสอะไหล่', 'left', 'text'), rpt_col('description', 'ชื่อ', 'left', 'text'),
            rpt_col('unit', 'หน่วย', 'center', 'text'), rpt_col('qty', 'จำนวนใช้', 'right', 'number'),
            rpt_col('wo_cnt', 'จำนวนใบงาน', 'center', 'number'), rpt_col('last_used', 'ใช้ล่าสุด', 'center', 'date'),
            if_e($canCost, rpt_col('cost', 'ค่าวัสดุ', 'right', 'money'))];
    }
    $st = $pdo->prepare($sel);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) if (!empty($r['work_order_no'])) { /* link หา work_order ไม่ได้จาก id ในกลุ่มนี้ */ }
    unset($r);

    return [
        'resource' => 'spare-parts',
        'title_th' => 'รายงานการใช้อะไหล่บำรุงรักษา (Spare Parts Usage)', 'title_en' => 'Spare Parts Usage Report',
        'kpi' => array_values(array_filter($kpi)),
        'charts' => $charts,
        'table' => ['columns' => array_values(array_filter($cols)), 'rows' => $rows, 'total' => count($rows), 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']],
        'groupByOptions' => [
            ['value' => 'part', 'label' => 'ตามอะไหล่'], ['value' => 'asset', 'label' => 'ตามเครื่องจักร'],
            ['value' => 'work_order', 'label' => 'ตามใบสั่งงาน'],
        ],
        'stock_note' => ['label' => 'Stock from Sage 300', 'detail' => 'ข้อมูลคลัง (ยอดคงเหลือ/ราคา) เป็นข้อมูลต้นทางจาก Sage 300 — CMMS ใช้เพื่อวิเคราะห์การใช้งานในการบำรุงรักษา ไม่ใช่ Stock Master', 'last_synced' => (string)($stockSummary['last_synced'] ?? '')],
    ];
}

function rpt_top_parts(PDO $pdo, array $w, ?array $range, array $params, string $by): array {
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $st = $pdo->prepare('SELECT COALESCE(rsp.item_description, sp.name, "-") AS label,
            SUM(rsp.quantity_used) AS qty, SUM(rsp.quantity_used*rsp.unit_price) AS cost
        FROM repair_spare_parts rsp
        JOIN repair r ON r.id = rsp.repair_id
        LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id' . $w['where'] . $rangeSql . '
        GROUP BY rsp.item_description, sp.name, rsp.spare_part_id
        ORDER BY ' . ($by === 'qty' ? 'qty' : 'cost') . ' DESC LIMIT 10');
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/* ═══════════ COST ═══════════ */

function rpt_build_cost(PDO $pdo, array $user, array $opts): array {
    $c = kpi_cost($pdo, $opts);
    $range = kpi_parse_range($opts);
    $w = rpt_repair_where($pdo, $opts);
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);

    $kpi = [
        rpt_kpi('total', 'ค่าใช้จ่ายรวม', round((float)$c['total'], 2), 'บาท', 'cyan', 'money'),
        rpt_kpi('labor', 'ค่าแรง', round((float)$c['labor'], 2), 'บาท', 'blue', 'money'),
        rpt_kpi('parts', 'ค่าอะไหล่ (บันทึก)', round((float)$c['parts'], 2), 'บาท', 'green', 'money'),
        rpt_kpi('material', 'ค่าวัสดุ (จากใบเบิก)', round((float)$c['material_cost'], 2), 'บาท', 'amber', 'money'),
        rpt_kpi('outsource', 'งานภายนอก', round((float)$c['outsource'], 2), 'บาท', 'red', 'money'),
    ];

    $monthly = rpt_cost_monthly($pdo, $w, $range, $params);
    $charts = [
        rpt_chart('monthly', 'แนวโน้มค่าใช้จ่ายรายเดือน', 'stacked', 'label', [
            ['key' => 'parts', 'name' => 'ค่าอะไหล่', 'tone' => 'primary'],
            ['key' => 'labor', 'name' => 'ค่าแรง', 'tone' => 'info'],
            ['key' => 'outsource', 'name' => 'งานภายนอก', 'tone' => 'warning'],
        ], $monthly),
        rpt_chart('top_asset', 'เครื่องจักรค่าใช้จ่ายสูงสุด', 'bar', 'label', [['key' => 'cost', 'name' => 'บาท', 'tone' => 'danger']],
            array_map(fn($r) => ['label' => ($r['code'] ?? '-'), 'cost' => (float)$r['cost']], array_slice($c['by_asset'], 0, 10))),
    ];

    $pg = rpt_page_params($opts);
    $groupBy = $pg['group_by'];
    if ($groupBy === 'department') {
        $sel = 'SELECT COALESCE(d.name, "ไม่ระบุ") AS dim_label, COUNT(*) AS cnt,
                COALESCE(SUM(COALESCE(r.cost_labor,0)),0) AS labor, COALESCE(SUM(COALESCE(r.cost_parts,0)),0) AS parts,
                COALESCE(SUM(COALESCE(r.cost_outsource,0)),0) AS outsource
            FROM repair r LEFT JOIN departments d ON d.id = r.department_id' . $w['where'] . $rangeSql . '
            GROUP BY d.name ORDER BY (labor+parts+outsource) DESC LIMIT ' . $pg['limit'];
        $cols = [rpt_col('dim_label', 'แผนก', 'left', 'text'), rpt_col('cnt', 'ใบงาน', 'center', 'number'),
            rpt_col('labor', 'ค่าแรง', 'right', 'money'), rpt_col('parts', 'ค่าอะไหล่', 'right', 'money'), rpt_col('outsource', 'งานภายนอก', 'right', 'money')];
        $st = $pdo->prepare($sel);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)];
    } elseif ($groupBy === 'technician') {
        $sel = 'SELECT COALESCE(u.full_name, "ไม่ระบุ") AS dim_label, COUNT(*) AS cnt,
                COALESCE(SUM(COALESCE(r.cost_labor,0)),0) AS labor, COALESCE(SUM(COALESCE(r.cost_parts,0)),0) AS parts,
                COALESCE(SUM(COALESCE(r.cost_outsource,0)),0) AS outsource
            FROM repair r LEFT JOIN users u ON u.id = r.assigned_to' . $w['where'] . $rangeSql . '
            GROUP BY u.full_name ORDER BY (labor+parts+outsource) DESC LIMIT ' . $pg['limit'];
        $cols = [rpt_col('dim_label', 'ช่าง', 'left', 'text'), rpt_col('cnt', 'ใบงาน', 'center', 'number'),
            rpt_col('labor', 'ค่าแรง', 'right', 'money'), rpt_col('parts', 'ค่าอะไหล่', 'right', 'money'), rpt_col('outsource', 'งานภายนอก', 'right', 'money')];
        $st = $pdo->prepare($sel);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)];
    } elseif ($groupBy === 'month') {
        $rows = array_map(fn($r) => ['dim_label' => $r['label'], 'cnt' => (int)$r['cnt'], 'labor' => $r['labor'], 'parts' => $r['parts'], 'outsource' => $r['outsource']], $monthly);
        $cols = [rpt_col('dim_label', 'เดือน', 'left', 'text'), rpt_col('cnt', 'ใบงาน', 'center', 'number'),
            rpt_col('labor', 'ค่าแรง', 'right', 'money'), rpt_col('parts', 'ค่าอะไหล่', 'right', 'money'), rpt_col('outsource', 'งานภายนอก', 'right', 'money')];
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)];
    } else {
        $sel = 'SELECT r.id, r.work_order_no, a.code AS asset_code, a.name AS asset_name,
                COALESCE(r.cost_labor,0) AS labor, COALESCE(r.cost_parts,0) AS parts, COALESCE(r.cost_outsource,0) AS outsource,
                COALESCE(r.cost_labor,0)+COALESCE(r.cost_parts,0)+COALESCE(r.cost_outsource,0) AS total,
                r.created_at
            FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id' . $w['where'] . $rangeSql . '
            ORDER BY total DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $cols = [
            rpt_col('work_order_no', 'ใบสั่งงาน', 'left', 'link'),
            rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
            rpt_col('labor', 'ค่าแรง', 'right', 'money'), rpt_col('parts', 'ค่าอะไหล่', 'right', 'money'),
            rpt_col('outsource', 'งานภายนอก', 'right', 'money'), rpt_col('total', 'รวม', 'right', 'money'),
            rpt_col('created_at', 'วันที่แจ้ง', 'center', 'datetime'),
        ];
        $st = $pdo->prepare($sel);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) $r['_href'] = '/repair/view?id=' . (int)$r['id'];
        unset($r);
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM repair r' . $w['where'] . $rangeSql);
        $cnt->execute($params);
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => (int)$cnt->fetchColumn(), 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']];
    }

    return [
        'resource' => 'cost',
        'title_th' => 'รายงานค่าใช้จ่ายซ่อมบำรุง (Maintenance Cost)', 'title_en' => 'Maintenance Cost Report',
        'kpi' => $kpi, 'charts' => $charts, 'table' => $table,
        'groupByOptions' => [
            ['value' => 'asset', 'label' => 'ตามใบสั่งงาน'], ['value' => 'department', 'label' => 'ตามแผนก'],
            ['value' => 'technician', 'label' => 'ตามช่าง'], ['value' => 'month', 'label' => 'ตามเดือน'],
        ],
    ];
}

function rpt_cost_monthly(PDO $pdo, array $w, ?array $range, array $params): array {
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $st = $pdo->prepare('SELECT DATE_FORMAT(r.created_at, "%Y-%m") AS ym, COUNT(*) AS cnt,
            COALESCE(SUM(COALESCE(r.cost_parts,0)),0) AS parts,
            COALESCE(SUM(COALESCE(r.cost_labor,0)),0) AS labor,
            COALESCE(SUM(COALESCE(r.cost_outsource,0)),0) AS outsource
        FROM repair r' . $w['where'] . $rangeSql . ' GROUP BY ym ORDER BY ym');
    $st->execute($params);
    $map = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $map[$r['ym']] = $r;
    $out = [];
    foreach (rpt_month_buckets($range) as $ym => $b) {
        $r = $map[$ym] ?? ['cnt' => 0, 'parts' => 0, 'labor' => 0, 'outsource' => 0];
        $out[] = ['label' => $b['label'], 'cnt' => (int)$r['cnt'], 'parts' => (float)$r['parts'], 'labor' => (float)$r['labor'], 'outsource' => (float)$r['outsource']];
    }
    return $out;
}

/* ═══════════ DOWNTIME ═══════════ */

function rpt_build_downtime(PDO $pdo, array $user, array $opts): array {
    $d = kpi_downtime($pdo, $opts);
    $core = kpi_core_metrics($pdo, $opts);
    $range = kpi_parse_range($opts);
    $w = rpt_repair_where($pdo, $opts);
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);

    $hours = round(((float)($d['total_minutes'] ?? 0)) / 60, 1);
    $kpi = [
        rpt_kpi('total', 'เวลาหยุดรวม', $hours, 'ชม.', 'amber', 'number'),
        rpt_kpi('events', 'รอบที่หยุด', (int)($d['events'] ?? 0), 'ครั้ง', '', 'number'),
        rpt_kpi('critical', 'Downtime เครื่องวิกฤต', round(((float)($core['critical_asset_downtime_minutes'] ?? 0)) / 60, 1), 'ชม.', 'red', 'number'),
        rpt_kpi('mttr', 'MTTR (เวลาซ่อมเฉลี่ย)', $core['mttr_hours'], 'ชม.', 'blue', 'number'),
        rpt_kpi('avy', 'เฉลี่ยต่อรอบ', (int)($d['events'] ?? 0) > 0 ? round(((float)($d['total_minutes'] ?? 0)) / (int)$d['events'], 0) : null, 'นาที/ครั้ง', '', 'number'),
    ];

    $monthlyMap = [];
    $st = $pdo->prepare('SELECT DATE_FORMAT(r.created_at, "%Y-%m") AS ym, COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS minutes FROM repair r' . $w['where'] . $rangeSql . ' GROUP BY ym');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $monthlyMap[$r['ym']] = (float)$r['minutes'];
    $monthly = [];
    foreach (rpt_month_buckets($range) as $ym => $b) $monthly[] = ['label' => $b['label'], 'hours' => round(($monthlyMap[$ym] ?? 0) / 60, 1)];

    $charts = [
        rpt_chart('monthly', 'Downtime รายเดือน (ชม.)', 'bar', 'label', [['key' => 'hours', 'name' => 'ชั่วโมง', 'tone' => 'danger']], $monthly),
        rpt_chart('asset', 'เครื่องจักร Downtime สูงสุด', 'bar', 'label', [['key' => 'dt', 'name' => 'ชั่วโมง', 'tone' => 'warning']],
            array_map(fn($r) => ['label' => ($r['code'] ?? '-'), 'dt' => round((float)$r['dt'] / 60, 1)], array_slice($d['by_asset'], 0, 10))),
        rpt_chart('failure', 'แยกตามประเภทความเสียหาย', 'bar', 'label', [['key' => 'dt', 'name' => 'ชั่วโมง', 'tone' => 'info']],
            array_map(fn($r) => ['label' => ($r['failure_code'] ?? $r['failure_name'] ?? '-'), 'dt' => round((float)$r['dt'] / 60, 1)], array_slice($d['by_failure_type'], 0, 8))),
    ];

    $pg = rpt_page_params($opts);
    $groupBy = $pg['group_by'];
    if ($groupBy === 'asset') {
        $st = $pdo->prepare('SELECT a.code AS code, a.name AS name, COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS minutes,
                SUM(CASE WHEN r.downtime_minutes > 0 THEN 1 ELSE 0 END) AS events
            FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id' . $w['where'] . $rangeSql . '
            GROUP BY a.id, a.code, a.name HAVING minutes > 0 ORDER BY minutes DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset']);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) { $r['dt_hours'] = round((float)$r['minutes'] / 60, 1); $r['_href'] = '/reports/downtime?asset_id='; }
        unset($r);
        $cols = [rpt_col('code', 'รหัสเครื่อง', 'left', 'text'), rpt_col('name', 'ชื่อ', 'left', 'text'),
            rpt_col('events', 'รอบที่หยุด', 'center', 'number'), rpt_col('dt_hours', 'Downtime (ชม.)', 'right', 'hours')];
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)];
    } else {
        $sel = 'SELECT r.id, r.work_order_no, a.code AS asset_code, a.name AS asset_name, r.title,
                ROUND(COALESCE(r.downtime_minutes,0)/60,2) AS dt_hours,
                fc.code AS failure_code, fc.name AS failure_name, r.rca_category AS root_cause,
                LEFT(r.description, 120) AS maintenance_action, r.created_at, r.status
            FROM repair r
            LEFT JOIN asset_registry a ON a.id = r.asset_id
            LEFT JOIN failure_codes fc ON fc.id = r.failure_code_id' . $w['where'] . ' AND r.downtime_minutes > 0' . $rangeSql . '
            ORDER BY r.downtime_minutes DESC LIMIT ' . $pg['limit'] . ' OFFSET ' . $pg['offset'];
        $st = $pdo->prepare($sel);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) $r['_href'] = '/repair/view?id=' . (int)$r['id'];
        unset($r);
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM repair r' . $w['where'] . ' AND r.downtime_minutes > 0' . $rangeSql);
        $cnt->execute($params);
        $cols = [
            rpt_col('work_order_no', 'ใบสั่งงาน', 'left', 'link'),
            rpt_col('asset_code', 'เครื่องจักร', 'left', 'text'),
            rpt_col('title', 'หัวข้อ', 'left', 'text'),
            rpt_col('dt_hours', 'Downtime (ชม.)', 'right', 'hours'),
            rpt_col('failure_code', 'Failure Code', 'center', 'text'),
            rpt_col('root_cause', 'Root Cause', 'left', 'text'),
            rpt_col('maintenance_action', 'การแก้ไข', 'left', 'text'),
            rpt_col('created_at', 'วันที่แจ้ง', 'center', 'datetime'),
        ];
        $table = ['columns' => $cols, 'rows' => $rows, 'total' => (int)$cnt->fetchColumn(), 'page' => (int)($pg['offset'] / max(1, $pg['limit'])), 'page_size' => $pg['limit']];
    }

    return [
        'resource' => 'downtime',
        'title_th' => 'รายงาน Downtime / เวลาหยุดเครื่องจักร', 'title_en' => 'Downtime Report',
        'kpi' => $kpi, 'charts' => $charts, 'table' => $table,
        'groupByOptions' => [
            ['value' => 'work_order', 'label' => 'ตามใบสั่งงาน'], ['value' => 'asset', 'label' => 'ตามเครื่องจักร'],
        ],
    ];
}

/* ═══════════ TECHNICIANS ═══════════ */

function rpt_build_technicians(PDO $pdo, array $user, array $opts): array {
    $range = kpi_parse_range($opts);
    $rangeSql = kpi_range_sql($range, 'r.created_at');
    $params = $range ? [$range['start'], $range['end']] : [];

    $techSt = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 AND (role_id IN (3,7) OR LOWER(role) IN ("technician","operate","foreman")) ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC);
    $techIds = array_column($techSt, 'id');
    $idList = $techIds ? implode(',', array_map('intval', $techIds)) : '0';

    $doneSql = kpi_range_sql($range, 'r.completed_at');
    $safeRange = $range ? ' AND r.created_at BETWEEN ? AND ?' : '';
    $safeDone = $range ? ' AND r.completed_at BETWEEN ? AND ?' : '';
    $safeParams = $range ? [$range['start'], $range['end']] : [];

    $sel = 'SELECT r.assigned_to AS uid, u.full_name,
            COUNT(*) AS assigned,
            SUM(CASE WHEN r.status IN ("closed","verified","done","completed","resolved") OR r.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN r.status NOT IN ("closed","cancelled","rejected","draft","done","skipped","verified") THEN 1 ELSE 0 END) AS workload_open,
            ROUND(AVG(CASE WHEN r.response_time_minutes > 0 THEN r.response_time_minutes END),0) AS avg_response_min,
            ROUND(AVG(CASE WHEN r.repair_time_minutes > 0 THEN r.repair_time_minutes END),0) AS avg_repair_min,
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt_minutes
        FROM repair r
        LEFT JOIN users u ON u.id = r.assigned_to
        WHERE r.assigned_to IN (' . $idList . ')' . $safeRange . '
        GROUP BY r.assigned_to, u.full_name';
    $st = $pdo->prepare($sel);
    $st->execute($safeParams);
    $agg = $st->fetchAll(PDO::FETCH_ASSOC);
    $byId = [];
    foreach ($agg as $r) $byId[(int)$r['uid']] = $r;

    // overdue — ใช้ kpi_is_overdue เดียวกับระบบ (ดึงเฉพาะใบที่ยังไม่จบ)
    $odList = $pdo->prepare('SELECT id, status, created_at, sla_due_at, estimated_completion_date, planned_end_at, assigned_to FROM repair WHERE assigned_to IN (' . $idList . ')' . $safeRange);
    $odList->execute($safeParams);
    $overdue = [];
    foreach ($odList->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (kpi_is_overdue($r)) $overdue[(int)$r['assigned_to']] = ($overdue[(int)$r['assigned_to']] ?? 0) + 1;
    }

    // PM + inspection completion
    $pmDone = $pdo->query('SELECT assigned_to, COUNT(*) AS cnt FROM pm_am WHERE status = "completed" AND assigned_to IS NOT NULL GROUP BY assigned_to')->fetchAll(PDO::FETCH_ASSOC);
    $pmMap = [];
    foreach ($pmDone as $r) $pmMap[(int)$r['assigned_to']] = (int)$r['cnt'];
    $inspDone = $pdo->query('SELECT inspector_id, COUNT(*) AS cnt FROM inspection_schedules WHERE status = "completed" AND inspector_id IS NOT NULL GROUP BY inspector_id')->fetchAll(PDO::FETCH_ASSOC);
    $inspMap = [];
    foreach ($inspDone as $r) $inspMap[(int)$r['inspector_id']] = (int)$r['cnt'];

    $rows = [];
    $tot = ['assigned' => 0, 'done' => 0, 'overdue' => 0];
    foreach ($techSt as $t) {
        $id = (int)$t['id'];
        $a = $byId[$id] ?? null;
        $assigned = (int)($a['assigned'] ?? 0);
        $done = (int)($a['done'] ?? 0);
        $od = (int)($overdue[$id] ?? 0);
        $tot['assigned'] += $assigned;
        $tot['done'] += $done;
        $tot['overdue'] += $od;
        $rows[] = [
            'name' => (string)($a['full_name'] ?? $t['full_name']),
            'assigned' => $assigned,
            'done' => $done,
            'overdue' => $od,
            'workload_open' => (int)($a['workload_open'] ?? 0),
            'avg_response_min' => isset($a['avg_response_min']) && $a['avg_response_min'] !== null ? (int)$a['avg_response_min'] : null,
            'avg_repair_min' => isset($a['avg_repair_min']) && $a['avg_repair_min'] !== null ? (int)$a['avg_repair_min'] : null,
            'pm_done' => (int)($pmMap[$id] ?? 0),
            'inspection_done' => (int)($inspMap[$id] ?? 0),
            'downtime_hours' => round(((float)($a['dt_minutes'] ?? 0)) / 60, 1),
        ];
    }
    usort($rows, fn($x, $y) => $y['assigned'] <=> $x['assigned']);

    $avgResp = null;
    $st = $pdo->prepare('SELECT ROUND(AVG(CASE WHEN response_time_minutes > 0 THEN response_time_minutes END)) FROM repair WHERE assigned_to IN (' . $idList . ')' . $safeRange);
    $st->execute($safeParams);
    $avgResp = $st->fetchColumn();

    $kpi = [
        rpt_kpi('techs', 'ช่างทั้งหมด', count($rows), 'คน', '', 'number'),
        rpt_kpi('assigned', 'งานที่มอบหมาย', $tot['assigned'], 'ใบ', 'blue', 'number'),
        rpt_kpi('completed', 'งานเสร็จ', $tot['done'], 'ใบ', 'green', 'number'),
        rpt_kpi('overdue', 'งานค้างเกินกำหนด', $tot['overdue'], 'ใบ', $tot['overdue'] > 0 ? 'red' : '', 'number'),
        rpt_kpi('avg_response', 'เวลาตอบสนองเฉลี่ย', $avgResp !== null ? (int)$avgResp : null, 'นาที', '', 'number'),
    ];

    $charts = [
        rpt_chart('workload', 'ภาระงานค้างรายช่าง', 'bar', 'label', [['key' => 'open', 'name' => 'ใบ', 'tone' => 'primary']],
            array_map(fn($r) => ['label' => $r['name'], 'open' => (int)$r['workload_open']], array_slice(array_filter($rows, fn($r) => $r['workload_open'] > 0), 0, 10))),
        rpt_chart('repair', 'เวลาซ่อมเฉลี่ยรายช่าง (นาที)', 'bar', 'label', [['key' => 'v', 'name' => 'นาที', 'tone' => 'info']],
            array_map(fn($r) => ['label' => $r['name'], 'v' => (int)$r['avg_repair_min']], array_filter($rows, fn($r) => $r['avg_repair_min'] !== null))),
    ];

    $cols = [
        rpt_col('name', 'ช่าง', 'left', 'text'),
        rpt_col('assigned', 'งานที่มอบหมาย', 'center', 'number'),
        rpt_col('done', 'เสร็จแล้ว', 'center', 'number'),
        rpt_col('overdue', 'เกินกำหนด', 'center', 'number'),
        rpt_col('workload_open', 'ภาระงานค้าง', 'center', 'number'),
        rpt_col('avg_response_min', 'ตอบสนองเฉลี่ย (นาที)', 'right', 'number'),
        rpt_col('avg_repair_min', 'ซ่อมเฉลี่ย (นาที)', 'right', 'number'),
        rpt_col('pm_done', 'PM เสร็จ', 'center', 'number'),
        rpt_col('inspection_done', 'ตรวจเสร็จ', 'center', 'number'),
        rpt_col('downtime_hours', 'Downtime (ชม.)', 'right', 'hours'),
    ];

    return [
        'resource' => 'technicians',
        'title_th' => 'รายงานสมรรถนะช่างซ่อมบำรุง (Operational Performance)', 'title_en' => 'Technician Performance Report',
        'kpi' => $kpi, 'charts' => $charts,
        'table' => ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)],
        'note' => 'ข้อมูลนี้คือ Operational Performance สำหรับผู้บริหารใช้ประเมินภาพรวมร่วมกับ Workload และความซับซ้อนของงาน ห้ามใช้เป็นเครื่องลงโทษรายบุคคลอัตโนมัติ',
    ];
}

/* ═══════════ SLA ═══════════ */

function rpt_build_sla(PDO $pdo, array $user, array $opts): array {
    $core = kpi_core_metrics($pdo, $opts);
    $alerts = kpi_alerts($pdo, $opts);
    $range = kpi_parse_range($opts);
    $w = rpt_repair_where($pdo, $opts);
    $doneSql = kpi_range_sql($range, 'r.completed_at');
    $params = array_merge($w['params'], $range ? [$range['start'], $range['end']] : []);

    $br = 0;
    $st = $pdo->prepare('SELECT r.completed_at, COALESCE(r.sla_due_at, r.estimated_completion_date, r.planned_end_at) AS due FROM repair r' . $w['where'] . ' AND r.completed_at IS NOT NULL' . $doneSql);
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (!$r['due']) continue;
        if (strtotime((string)$r['completed_at']) > strtotime((string)$r['due'])) $br++;
    }

    $resSql = 'SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, r.created_at, r.completed_at)),1) FROM repair r' . $w['where'] . ' AND r.completed_at IS NOT NULL' . $doneSql;
    $st = $pdo->prepare($resSql);
    $st->execute($params);
    $avgRes = $st->fetchColumn();

    $kpi = [
        rpt_kpi('compliance', 'SLA Compliance (ปิดทันกำหนด)', $core['sla_compliance_pct'], '%', 'green', 'pct'),
        rpt_kpi('at_risk', 'ตามเสี่ยง (due ใน 24 ชม.)', (int)($alerts['sla_at_risk'] ?? 0), 'ใบ', (int)($alerts['sla_at_risk'] ?? 0) > 0 ? 'amber' : '', 'number'),
        rpt_kpi('breached', 'เกินกำหนด (Breached)', $br, 'ใบ', $br > 0 ? 'red' : '', 'number'),
        rpt_kpi('avg_response', 'เวลาตอบสนองเฉลี่ย', $core['avg_response_minutes'], 'นาที', 'blue', 'number'),
        rpt_kpi('avg_resolution', 'เวลาสำเร็จงานเฉลี่ย', $avgRes !== null ? (float)$avgRes : null, 'นาที', '', 'number'),
    ];

    $dim = (string)($_GET['dim'] ?? 'priority');
    $dimExpr = [
        'priority' => 'r.priority',
        'department' => 'COALESCE(d.name, "ไม่ระบุ")',
        'asset' => 'COALESCE(a.code, "ไม่ระบุ")',
        'technician' => 'COALESCE(u.full_name, "ไม่ระบุ")',
        'month' => 'DATE_FORMAT(r.completed_at, "%Y-%m")',
    ][$dim] ?? 'r.priority';
    $join = ' LEFT JOIN departments d ON d.id = r.department_id LEFT JOIN asset_registry a ON a.id = r.asset_id LEFT JOIN users u ON u.id = r.assigned_to';

    $sel = 'SELECT ' . $dimExpr . ' AS dim_label,
            COUNT(*) AS done_total,
            SUM(CASE WHEN r.completed_at <= COALESCE(r.sla_due_at, r.estimated_completion_date, r.planned_end_at) THEN 1 ELSE 0 END) AS on_time,
            SUM(CASE WHEN r.completed_at > COALESCE(r.sla_due_at, r.estimated_completion_date, r.planned_end_at) THEN 1 ELSE 0 END) AS breached,
            ROUND(AVG(CASE WHEN r.response_time_minutes > 0 THEN r.response_time_minutes END),0) AS avg_response_min,
            ROUND(AVG(CASE WHEN r.completed_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, r.created_at, r.completed_at) END),0) AS avg_resolution_min
        FROM repair r' . $join . $w['where'] . ' AND r.completed_at IS NOT NULL' . $doneSql . '
        GROUP BY dim_label ORDER BY done_total DESC';
    $st = $pdo->prepare($sel);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r['compliance_pct'] = (int)$r['done_total'] > 0 ? round(100 * (int)$r['on_time'] / (int)$r['done_total'], 1) : null;
    }
    unset($r);

    $cols = [
        rpt_col('dim_label', 'กลุ่ม', 'left', 'text'),
        rpt_col('done_total', 'ปิดงาน', 'center', 'number'),
        rpt_col('on_time', 'ทันกำหนด', 'center', 'number'),
        rpt_col('breached', 'เกินกำหนด', 'center', 'number'),
        rpt_col('compliance_pct', 'Compliance (%)', 'center', 'pct'),
        rpt_col('avg_response_min', 'ตอบสนองเฉลี่ย (นาที)', 'right', 'number'),
        rpt_col('avg_resolution_min', 'สำเร็จเฉลี่ย (นาที)', 'right', 'number'),
    ];

    $monthly = [];
    $st = $pdo->prepare('SELECT DATE_FORMAT(r.completed_at, "%Y-%m") AS ym,
            COUNT(*) AS total,
            SUM(CASE WHEN r.completed_at <= COALESCE(r.sla_due_at, r.estimated_completion_date, r.planned_end_at) THEN 1 ELSE 0 END) AS on_time
        FROM repair r' . $w['where'] . ' AND r.completed_at IS NOT NULL' . $doneSql . ' GROUP BY ym ORDER BY ym');
    $st->execute($params);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        [$y, $m] = array_map('intval', explode('-', $r['ym']));
        $monthly[] = ['label' => __rpt_month_th((string)$m) . ' ' . $y, 'value' => (int)$r['total'] > 0 ? round(100 * (int)$r['on_time'] / (int)$r['total'], 1) : 0];
    }
    $charts = [
        rpt_chart('monthly', 'SLA Compliance รายเดือน (%)', 'line', 'label', [['key' => 'value', 'name' => '%', 'tone' => 'success']], $monthly),
    ];

    return [
        'resource' => 'sla',
        'title_th' => 'รายงานการปฏิบัติตาม SLA', 'title_en' => 'SLA Report',
        'kpi' => $kpi, 'charts' => $charts,
        'table' => ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)],
        'dimOptions' => [
            ['value' => 'priority', 'label' => 'ตามความสำคัญ'], ['value' => 'department', 'label' => 'ตามแผนก'],
            ['value' => 'asset', 'label' => 'ตามเครื่องจักร'], ['value' => 'technician', 'label' => 'ตามช่าง'],
            ['value' => 'month', 'label' => 'ตามเดือน'],
        ],
        'note' => 'นิยามเดียวกับ Dashboard: due = COALESCE(sla_due_at, estimated_completion_date, planned_end_at); compliance = ปิดงานทันกำหนด ÷ งานปิดทั้งหมดในช่วง',
    ];
}

/* ═══════════ MTTR / MTBF ═══════════ */

function rpt_build_mttr_mtbf(PDO $pdo, array $user, array $opts): array {
    $core = kpi_core_metrics($pdo, $opts);
    $latest = $pdo->query("SELECT year, month, ROUND(AVG(mtbf_hours),1) AS mtbf, ROUND(AVG(mttr_minutes),1) AS mttr,
            SUM(total_failures) AS failures, SUM(total_downtime_minutes) AS downtime
        FROM mtbf_mttr GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 1")->fetch() ?: null;
    $trend = $pdo->query("SELECT CONCAT(year, '-', LPAD(month, 2, '0')) AS ym,
            ROUND(AVG(mtbf_hours),1) AS mtbf, ROUND(AVG(mttr_minutes),1) AS mttr
        FROM mtbf_mttr GROUP BY year, month ORDER BY year ASC, month ASC LIMIT 12")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($trend as &$t) {
        [$y, $m] = explode('-', $t['ym']);
        $t['label'] = __rpt_month_th($m) . ' ' . $y;
    }
    unset($t);

    $kpi = [
        rpt_kpi('mtbf', 'MTBF (เฉลี่ย 180 วัน)', $core['mtbf_hours'], 'ชม.', 'green', 'number'),
        rpt_kpi('mttr', 'MTTR (เฉลี่ย)', $core['mttr_hours'], 'ชม.', 'blue', 'number'),
        rpt_kpi('mtbf_latest', 'MTBF รายเดือนล่าสุด', ($latest['mtbf'] ?? null) !== null ? (float)$latest['mtbf'] : null, 'ชม.', '', 'number'),
        rpt_kpi('mttr_latest', 'MTTR รายเดือนล่าสุด', ($latest['mttr'] ?? null) !== null ? (float)$latest['mttr'] : null, 'นาที', '', 'number'),
        rpt_kpi('failures', 'จำนวนเหตุการณ์ล่าสุด', (int)($latest['failures'] ?? 0), 'ครั้ง', '', 'number'),
        rpt_kpi('downtime', 'Downtime ล่าสุด', round(((float)($latest['downtime'] ?? 0)) / 60, 1), 'ชม.', 'amber', 'number'),
    ];

    $charts = [
        rpt_chart('trend', 'แนวโน้ม MTBF / MTTR รายเดือน (ข้อมูล mtbf_mttr)', 'composed', 'label', [
            ['key' => 'mtbf', 'name' => 'MTBF (ชม.)', 'tone' => 'primary', 'axis' => 'l'],
            ['key' => 'mttr', 'name' => 'MTTR (นาที)', 'tone' => 'danger', 'axis' => 'r'],
        ], $trend),
    ];

    $year = (int)($_GET['year'] ?? date('Y'));
    $sel = 'SELECT m.asset_id, a.code, a.name,
            COALESCE(SUM(m.operating_hours),0) AS operating_hours,
            COALESCE(SUM(m.total_failures),0) AS failures,
            COALESCE(SUM(m.total_downtime_minutes),0) AS dt_min,
            ROUND(AVG(m.mtbf_hours),1) AS mtbf, ROUND(AVG(m.mttr_minutes),1) AS mttr
        FROM mtbf_mttr m LEFT JOIN asset_registry a ON a.id = m.asset_id
        WHERE m.year = ? GROUP BY m.asset_id, a.code, a.name ORDER BY failures DESC LIMIT 50';
    $st = $pdo->prepare($sel);
    $st->execute([$year]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $op = (float)$r['operating_hours'];
        $dt = (float)$r['dt_min'];
        $r['availability_pct'] = round(($op + $dt) > 0 ? 100 * $op / ($op + $dt) : 0, 2);
        $r['dt_hours'] = round($dt / 60, 1);
        $r['mtbf_text'] = $r['mtbf'] !== null ? $r['mtbf'] : '-';
    }
    unset($r);

    $cols = [
        rpt_col('code', 'รหัสเครื่อง', 'left', 'text'),
        rpt_col('name', 'ชื่อ', 'left', 'text'),
        rpt_col('operating_hours', 'ชั่วโมงเดินเครื่อง', 'right', 'number'),
        rpt_col('failures', 'จำนวนเสีย', 'center', 'number'),
        rpt_col('mtbf', 'MTBF (ชม.)', 'right', 'number'),
        rpt_col('mttr', 'MTTR (นาที)', 'right', 'number'),
        rpt_col('dt_hours', 'Downtime (ชม.)', 'right', 'hours'),
        rpt_col('availability_pct', 'ความพร้อมใช้งาน (%)', 'center', 'pct'),
    ];

    return [
        'resource' => 'mttr-mtbf',
        'title_th' => 'รายงานความเชื่อถือได้ของเครื่องจักร (MTTR / MTBF)', 'title_en' => 'MTTR / MTBF Reliability Report',
        'kpi' => $kpi, 'charts' => $charts,
        'table' => ['columns' => $cols, 'rows' => $rows, 'total' => count($rows), 'page' => 0, 'page_size' => count($rows)],
        'year' => $year,
        'note' => 'MTTR = AVG(repair_time_minutes)/60 ชม. (งานปิด 30 วัน/ตามช่วง), MTBF = ค่าเฉลี่ยช่วงระหว่างรอบซ่อมของเครื่องเดียวกัน (breakdown, 180 วัน) — สูตรเดียวกับ Dashboard',
    ];
}

/* ───────────────────────── 4. Export ───────────────────────── */

/** คอลัมน์ที่ต้องการส่งออก (รองรับ type ต่าง ๆ → ลำดับ/หัวเรื่องของ CSV/XLSX) */
function rpt_export_columns(array $table): array {
    if (!$table || empty($table['columns'])) return [];
    $out = [];
    foreach ($table['columns'] as $c) {
        if ($c['key'] === '_href') continue;
        $out[] = $c;
    }
    return $out;
}

function rpt_export_rows(array $rows, array $cols): array {
    $out = [];
    foreach ($rows as $r) {
        $row = [];
        foreach ($cols as $c) {
            $k = $c['key'];
            $v = $r[$k] ?? null;
            if ($v === null) { $row[] = ''; continue; }
            switch ($c['type'] ?? 'text') {
                case 'money': $row[] = rpt_num($v); break;
                case 'pct':   $row[] = rpt_num($v) . '%'; break;
                case 'hours': $row[] = rpt_num($v); break;
                case 'datetime':
                case 'date':  $row[] = $v; break;
                default: $row[] = $v;
            }
        }
        $out[] = $row;
    }
    return $out;
}

function rpt_num($v): string {
    return is_numeric($v) ? rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.') : (string)$v;
}

/** CSV แบบ stream ฝั่ง server — เคารพ scope/filters เดียวกับตอนแสดงผล */
function rpt_export_csv(PDO $pdo, array $user, string $resource, array $opts, string $titleTh): void {
    $data = rpt_dispatch($pdo, $user, $resource, $opts);
    $table = $data['table'] ?? null;
    if (!$table) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'รายงานนี้ไม่มีตารางสำหรับส่งออก'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $cols = rpt_export_columns($table);
    $rows = rpt_export_rows($table['rows'], $cols);
    rpt_log_audit($pdo, (int)$user['id'], $user['full_name'] ?? '', $resource, 'csv', count($rows));

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $resource . '_' . date('Ymd_His') . '.csv"');
    $out = fopen('php://output', 'w');
    fprintf($out, chr(0xEF) . chr(0xBB) . chr(0xBF));
    fputcsv($out, array_column($cols, 'label'));
    foreach ($rows as $row) fputcsv($out, $row);
    fclose($out);
    exit;
}

function rpt_export_xlsx(PDO $pdo, array $user, string $resource, array $opts, string $titleTh): void {
    $data = rpt_dispatch($pdo, $user, $resource, $opts);
    $table = $data['table'] ?? null;
    if (!$table) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'รายงานนี้ไม่มีตารางสำหรับส่งออก'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $cols = rpt_export_columns($table);
    $headers = array_column($cols, 'label');
    $rows = rpt_export_rows($table['rows'], $cols);
    rpt_log_audit($pdo, (int)$user['id'], $user['full_name'] ?? '', $resource, 'xlsx', count($rows));
    xlsx_download($resource . '_' . date('Ymd_His') . '.xlsx', $headers, $rows);
}

/* ───────────────────────── 5. Dispatch ───────────────────────── */

function rpt_dispatch(PDO $pdo, array $user, string $resource, array $opts): array {
    $roleId = kpi_resolve_role($pdo, $user);
    if (!rpt_permitted($resource, $roleId)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'ไม่มีสิทธิ์ดูรายงานนี้ (Report Permission)'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    switch ($resource) {
        case 'center':       return rpt_build_center($pdo, $user, $opts);
        case 'work-orders':  return rpt_build_work_orders($pdo, $user, $opts);
        case 'requests':     return rpt_build_requests($pdo, $user, $opts);
        case 'pm':           return rpt_build_pm($pdo, $user, $opts);
        case 'inspections':  return rpt_build_inspections($pdo, $user, $opts);
        case 'assets':       return rpt_build_assets($pdo, $user, $opts);
        case 'spare-parts':  return rpt_build_spare_parts($pdo, $user, $opts);
        case 'cost':         return rpt_build_cost($pdo, $user, $opts);
        case 'downtime':     return rpt_build_downtime($pdo, $user, $opts);
        case 'technicians':  return rpt_build_technicians($pdo, $user, $opts);
        case 'sla':          return rpt_build_sla($pdo, $user, $opts);
        case 'mttr-mtbf':    return rpt_build_mttr_mtbf($pdo, $user, $opts);
        default:
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Unknown report resource'], JSON_UNESCAPED_UNICODE);
            exit;
    }
}