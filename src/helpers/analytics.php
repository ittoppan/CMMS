<?php
/**
 * src/helpers/analytics.php — Phase 23: Advanced CMMS Intelligence & Analytics engine
 *
 * หลักการ (บังคับ):
 *   - KPI ทั้งหมดที่ "มีอยู่แล้ว" ใน src/helpers/kpi.php ให้ REUSE ผ่านเรียกฟังก์ชันเดิม
 *     ห้ามเขียนสูตรซ้ำ (kpi_core_metrics / kpi_downtime / kpi_cost / kpi_failure /
 *     kpi_technician_workload / kpi_filters / kpi_scope / kpi_parse_range / kpi_range_sql /
 *     kpi_is_overdue / kpi_can_see_cost / kpi_active_statuses / kpi_asset_health)
 *   - ตัวเลขทุกตัวมาจากข้อมูลจริงเท่านั้น — ไม่อนุญาตค่าแต่ง / mock / สมมุติ (ยกเลิกพลังงาน mock แล้ว)
 *   - KPI ใหม่ที่เพิ่ม (ยังไม่มีใน kpi.php) ต้องนิยามไว้ใน docs/KPI_DEFINITIONS.md
 *
 * ฟังก์ชันใหม่ Phase 23:
 *   ana_opts           — normalize query → opts (ชุดเดียวกับ dashboard.php)
 *   ana_paginate       — pagination helper
 *   ana_reliability    — MTBF/MTTR/availability จาก operating hours จริง (ตาราง mtbf_mttr)
 *   ana_trend          — แนวโน้มราย bucket (day/week/month/quarter) + reliability ต่อเดือน
 *   ana_asset_health   — สถานะเครื่องรายตัว (HEALTHY/WATCH/ATTENTION/CRITICAL/INSUFFICIENT_DATA) แบบอธิบายได้
 *   ana_repeat_failures— วิเคราะห์การเสียซ้ำ + เจาะลงถึงใบงาน
 *   ana_downtime_pareto— Pareto ตามเครื่อง (จาก mtbf_mttr จริงเป็นหลัก)
 *   ana_priority_analysis — วิเคราะห์ความเร่งด่วน + อายุงานค้าง (aging) ของคิว
 *   ana_pm_compliance  — PM compliance + แยกตามแผน + รายการ
 *   ana_planned_unplanned — สัดส่วนงานวางแผน vs งานฉุกเฉิน
 *   ana_technician_analytics — ภาระงานช่าง + การทับซ้อนของงาน (ไม่จัดลำดับ "ฝีมือ")
 *   ana_spare_analytics — สต็อก (Sage = แหล่งจริง) vs ประวัติการใช้จาก CMMS
 *   ana_cost_analytics — ต้นทุน (reuse kpi_cost) + ตรวจคุณภาพข้อมูลต้นทุน
 *   ana_data_quality   — ตรวจสอบความสมบูรณ์ของข้อมูลสำหรับตัวชี้วัดสำคัญ
 *   ana_overview       — ภาพรวมผู้บริหาร (รวม core KPI + reliability + คุณภาพข้อมูล)
 */

/* ─────────── ตัวกรอง / util ─────────── */

/**
 * normalize query string → opts สำหรับ kpi.php และ ana_*
 * keys: role_id, user_id, range, range_start, range_end,
 *       department_id, location_id, asset_id, asset_category, technician_id,
 *       source_type, priority, status, failure_category, bucket, search,
 *       limit, offset
 */
function ana_opts(array $q): array {
    $get = function ($k) use ($q) {
        return (string)($q[$k] ?? '');
    };
    return [
        'role_id' => (int)($q['role_id'] ?? $q['__role_id'] ?? 0),
        'user_id' => (int)($q['user_id'] ?? $q['__user_id'] ?? 0),
        'range' => $get('range'),
        'range_start' => $get('range_start'),
        'range_end' => $get('range_end'),
        'department_id' => $get('department_id'),
        'location_id' => $get('location_id'),
        'asset_id' => $get('asset_id'),
        'asset_category' => $get('asset_category'),
        'technician_id' => $get('technician_id'),
        'source_type' => $get('source_type'),
        'priority' => $get('priority'),
        'status' => $get('status'),
        'failure_category' => $get('failure_category'),
        'bucket' => $get('bucket'),
        'search' => $get('search'),
        'limit' => (int)($q['limit'] ?? 50),
        'offset' => (int)($q['offset'] ?? 0),
    ];
}

function ana_paginate(array $rows, int $limit, int $offset): array {
    $limit = max(1, min(200, $limit));
    $offset = max(0, $offset);
    $slice = array_slice(array_values($rows), $offset, $limit);
    return [
        'rows' => $slice,
        'total' => count($rows),
        'page' => intdiv($offset, $limit) + 1,
        'page_size' => $limit,
        'has_more' => $offset + count($slice) < count($rows),
    ];
}

/** SQL/params กรองปี-เดือนของ mtbf_mttr / monthly_kpi_snapshot ให้อยู่ภายในช่วง date */
function ana_mtbf_range_sql(?array $range): array {
    if (!$range) return ['', []];
    $sql = " AND DATE(CONCAT(year,'-',LPAD(month,2,'0'),'-01')) BETWEEN ? AND ? ";
    $from = substr($range['start'], 0, 10);
    $to = substr($range['end'], 0, 10);
    return [$sql, [$from, $to]];
}

/** คำนวณ MTBF(h)/MTTR(min)/Availability(%) จาก operating hours + failures + downtime ตามปกติ */
function ana_reliability_calc(PDO $pdo, ?array $range): array {
    [$rangeSql, $params] = ana_mtbf_range_sql($range);
    $sql = "SELECT
                SUM(total_failures) AS failures,
                SUM(operating_hours) AS op_hours,
                SUM(total_downtime_minutes) AS dt_min,
                COUNT(*) AS rows_cnt,
                COUNT(DISTINCT asset_id) AS assets_cnt
            FROM mtbf_mttr WHERE 1=1" . $rangeSql;
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $failures = (int)($row['failures'] ?? 0);
    $op = (float)($row['op_hours'] ?? 0);
    $dtMin = (float)($row['dt_min'] ?? 0);
    $dtHours = $dtMin / 60;

    $out = [
        'failures' => $failures,
        'operating_hours' => round($op, 1),
        'downtime_minutes' => $dtMin,
        'rows' => (int)($row['rows_cnt'] ?? 0),
        'assets_covered' => (int)($row['assets_cnt'] ?? 0),
        'mtbf_hours' => $failures > 0 && $op > 0 ? round($op / $failures, 1) : null,
        'mttr_minutes' => $failures > 0 ? round($dtMin / $failures, 1) : null,
        'availability_pct' => $op + $dtHours > 0 ? round(100 * $op / ($op + $dtHours), 2) : null,
        'source' => 'mtbf_mttr',
        'source_note' => 'คำนวณจาก operating hours + failures + downtime_minutes ที่บันทึกจริงประจำเดือน (ตาราง mtbf_mttr)',
    ];
    if ($out['mtbf_hours'] === null && $out['mttr_minutes'] === null && $failures === 0) {
        $out['insufficient'] = true;
        $out['note'] = 'ยังไม่มีข้อมูล operating time / failures ในช่วงที่เลือก — แสดง INSUFFICIENT DATA ไม่ใช่ศูนย์';
    }
    return $out;
}

/* ─────────── 1. Reliability (MTBF / MTTR / Availability) ─────────── */

function ana_reliability(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $months = [];
    if ($range) {
        [$rangeSql, $params] = ana_mtbf_range_sql($range);
        $sql = "SELECT year, month,
                    SUM(total_failures) AS failures,
                    SUM(operating_hours) AS op_hours,
                    SUM(total_downtime_minutes) AS dt_min,
                    COUNT(DISTINCT asset_id) AS assets_cnt
                FROM mtbf_mttr WHERE 1=1" . $rangeSql . "
                GROUP BY year, month ORDER BY year, month";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $failures = (int)$r['failures'];
            $op = (float)$r['op_hours'];
            $dtMin = (float)$r['dt_min'];
            $months[] = [
                'ym' => sprintf('%04d-%02d', (int)$r['year'], (int)$r['month']),
                'failures' => $failures,
                'operating_hours' => round($op, 1),
                'downtime_minutes' => $dtMin,
                'mtbf_hours' => $failures > 0 && $op > 0 ? round($op / $failures, 1) : null,
                'mttr_minutes' => $failures > 0 ? round($dtMin / $failures, 1) : null,
                'availability_pct' => $op + $dtMin / 60 > 0 ? round(100 * $op / ($op + $dtMin / 60), 2) : null,
                'assets_covered' => (int)$r['assets_cnt'],
            ];
        }
    }
    $summary = ana_reliability_calc($pdo, $range);
    // 1 เดือนที่ล่าสุดในข้อมูล (แสดง "ถึงเดือนอะไร")
    $latest = end($months) ?: null;
    return [
        'summary' => $summary,
        'months' => $months,
        'latest' => $latest ? ['ym' => $latest['ym'], 'failures' => $latest['failures'], 'downtime_minutes' => $latest['downtime_minutes']] : null,
        'coverage_label' => $latest ? 'ข้อมูลถึง ' . $latest['ym'] : 'ยังไม่มีข้อมูล',
    ];
}

/* ─────────── 2. แนวโน้ม (trend) ─────────── */

function ana_trend(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $bucket = (string)($opts['bucket'] ?? 'month');
    if (!in_array($bucket, ['day', 'week', 'month', 'quarter'], true)) $bucket = 'month';
    switch ($bucket) {
        case 'day':
            $expr = "DATE_FORMAT(r.created_at,'%Y-%m-%d')";
            $keyFmt = 'Y-m-d';
            break;
        case 'week':
            $expr = "DATE_FORMAT(DATE_SUB(r.created_at, INTERVAL WEEKDAY(r.created_at) DAY),'%Y-%m-%d')";
            $keyFmt = 'Y-m-d';
            break;
        case 'quarter':
            $expr = "CONCAT(YEAR(r.created_at),'-Q',QUARTER(r.created_at))";
            $keyFmt = 'Y-\Qn';
            break;
        default:
            $expr = "DATE_FORMAT(r.created_at,'%Y-%m')";
            $keyFmt = 'Y-m';
    }

    $st = $pdo->prepare("SELECT $expr AS bk,
            COUNT(*) AS total,
            SUM(r.source_type='breakdown') AS breakdown,
            SUM(r.status IN ('closed','verified','done','completed','resolved')) AS completed,
            SUM(COALESCE(r.downtime_minutes,0)) AS dt_min,
            ROUND(AVG(NULLIF(r.repair_time_minutes,0)),1) AS mttr_min
        FROM repair r" . $where . $dateSql . "
        GROUP BY bk ORDER BY bk ASC LIMIT 400");
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['total'] = (int)$r['total'];
        $r['breakdown'] = (int)$r['breakdown'];
        $r['completed'] = (int)$r['completed'];
        $r['dt_min'] = (float)$r['dt_min'];
        $r['mttr_min'] = $r['mttr_min'] !== null ? (float)$r['mttr_min'] : null;
    }
    unset($r);

    // เติมช่องว่างรายเดือน + reliability จาก mtbf_mttr เฉพาะ bucket=month
    if ($bucket === 'month' && $range) {
        $byMonth = [];
        foreach ($rows as $r) $byMonth[$r['bk'] . '-01'] = $r;
        $mapRel = [];
        foreach (ana_reliability($pdo, $opts)['months'] as $m) {
            $mapRel[$m['ym']] = $m;
        }
        $filled = [];
        $cur = new DateTime(substr($range['start'], 0, 10));
        $endD = new DateTime(substr($range['end'], 0, 10));
        while ($cur <= $endD) {
            $ym = $cur->format('Y-m');
            $k = $ym . '-01';
            $base = $byMonth[$k] ?? ['bk' => $ym, 'total' => 0, 'breakdown' => 0, 'completed' => 0, 'dt_min' => 0, 'mttr_min' => null];
            $base['total'] = (int)$base['total'];
            $base['breakdown'] = (int)$base['breakdown'];
            $base['completed'] = (int)$base['completed'];
            $base['dt_min'] = (float)$base['dt_min'];
            if (isset($mapRel[$ym])) {
                $rel = $mapRel[$ym];
                $base['rel_failures'] = $rel['failures'];
                $base['rel_mtbf_hours'] = $rel['mtbf_hours'];
                $base['rel_mttr_minutes'] = $rel['mttr_minutes'];
                $base['rel_downtime_minutes'] = $rel['downtime_minutes'];
            }
            $filled[] = $base;
            $cur->modify('+1 month');
        }
        $rows = $filled;
    }

    return [
        'bucket' => $bucket,
        'rows' => $rows,
    ];
}

/* ─────────── 3. Asset Health (รายตัว, อธิบายได้) ─────────── */

function ana_asset_filters(array $opts): array {
    $sql = '';
    $params = [];
    $c = trim((string)($opts['asset_category'] ?? ''));
    if ($c !== '') {
        $sql .= ' AND a.category = ? ';
        $params[] = $c;
    }
    $d = trim((string)($opts['department_id'] ?? ''));
    if ($d !== '' && ctype_digit($d)) {
        $sql .= ' AND a.department_id = ? ';
        $params[] = (int)$d;
    }
    $s = trim((string)($opts['search'] ?? ''));
    if ($s !== '') {
        $sql .= ' AND (a.code LIKE ? OR a.name LIKE ?) ';
        $like = '%' . $s . '%';
        $params[] = $like;
        $params[] = $like;
    }
    $aid = trim((string)($opts['asset_id'] ?? ''));
    if ($aid !== '' && ctype_digit($aid)) {
        $sql .= ' AND a.id = ? ';
        $params[] = (int)$aid;
    }
    return [$sql, $params];
}

function ana_asset_health(PDO $pdo, array $opts): array {
    [$assetSql, $assetParams] = ana_asset_filters($opts);
    $st = $pdo->prepare("SELECT a.id, a.code, a.name, a.category, a.criticality, a.status,
                a.location, a.department, a.department_id, a.running_hours_month,
                d.name AS dept_name
            FROM asset_registry a
            LEFT JOIN departments d ON d.id = a.department_id
            WHERE a.status <> 'disposed'" . $assetSql . "
            ORDER BY a.criticality ASC, a.code ASC");
    $st->execute($assetParams);
    $assets = $st->fetchAll(PDO::FETCH_ASSOC);
    if (!$assets) {
        return ['assets' => [], 'summary' => ['total' => 0, 'by_health' => []], 'insufficient_count' => 0, 'method_note' => ''];
    }

    $d90 = date('Y-m-d 00:00:00', strtotime('-90 days'));
    $d180 = date('Y-m-d 00:00:00', strtotime('-180 days'));
    $d3m = date('Y-m-01', strtotime('-5 months')); // วันแรกของเดือน 6 ย้อนหลัง (รวมเดือนนี้)
    $activeSet = '"' . implode('","', kpi_active_statuses()) . '"';

    // สัญญาณรวม GROUP BY asset_id (ทำ batch เพื่อไม่วน query ต่อเครื่อง)
    $agg = function (string $sql, array $p = []) use ($pdo) {
        $st = $pdo->prepare($sql);
        $st->execute($p);
        $out = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $out[(int)$r['asset_id']] = $r;
        return $out;
    };
    $wk90 = $agg("SELECT asset_id, COUNT(*) AS failures FROM repair WHERE asset_id IS NOT NULL AND source_type='breakdown' AND created_at >= ? GROUP BY asset_id", [$d90]);
    $wk180 = $agg("SELECT asset_id, COUNT(*) AS failures FROM repair WHERE asset_id IS NOT NULL AND source_type='breakdown' AND created_at >= ? GROUP BY asset_id", [$d180]);
    $dtRepair = $agg("SELECT asset_id, SUM(COALESCE(downtime_minutes,0)) AS dt FROM repair WHERE asset_id IS NOT NULL AND created_at >= ? GROUP BY asset_id", [$d180]);
    $relAgg = $agg("SELECT asset_id, SUM(total_downtime_minutes) AS dt, SUM(total_failures) AS failures
                    FROM mtbf_mttr WHERE DATE(CONCAT(year,'-',LPAD(month,2,'0'),'-01')) >= ? GROUP BY asset_id", [$d3m]);
    $activeWoAgg = [];
    $overdueWoAgg = [];
    $stA = $pdo->prepare("SELECT asset_id, status, sla_due_at, estimated_completion_date, planned_end_at, created_at
                    FROM repair WHERE asset_id IS NOT NULL AND status IN ($activeSet)");
    $stA->execute();
    foreach ($stA->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $aid = (int)$r['asset_id'];
        $activeWoAgg[$aid] = ($activeWoAgg[$aid] ?? 0) + 1;
        if (kpi_is_overdue($r)) {
            $overdueWoAgg[$aid] = ($overdueWoAgg[$aid] ?? 0) + 1;
        }
    }
    $pmOverdue = $agg("SELECT asset_id, COUNT(*) AS cnt FROM pm_am
                    WHERE asset_id IS NOT NULL AND status IN ('pending','in_progress','overdue') AND due_date < CURDATE() GROUP BY asset_id");
    $insFail = $agg("SELECT asset_id, COUNT(*) AS cnt FROM inspection_schedules
                    WHERE asset_id IS NOT NULL AND result IN ('fail','critical_fail') AND completed_at >= ? GROUP BY asset_id", [$d180]);
    $lastDone = $agg("SELECT asset_id, MAX(completed_at) AS last_done FROM repair
                    WHERE asset_id IS NOT NULL AND source_type='breakdown' AND completed_at IS NOT NULL GROUP BY asset_id");

    $results = [];
    foreach ($assets as $a) {
        $aid = (int)$a['id'];
        $f90 = (int)($wk90[$aid]['failures'] ?? 0);
        $f180 = (int)($wk180[$aid]['failures'] ?? 0);
        $downtime = max((float)($dtRepair[$aid]['dt'] ?? 0), (float)($relAgg[$aid]['dt'] ?? 0));
        $relFail = (int)($relAgg[$aid]['failures'] ?? 0);
        $actCnt = (int)($activeWoAgg[$aid] ?? 0);
        $odCnt = (int)($overdueWoAgg[$aid] ?? 0);
        $pmOd = (int)($pmOverdue[$aid]['cnt'] ?? 0);
        $ins = (int)($insFail[$aid]['cnt'] ?? 0);
        $last = $lastDone[$aid]['last_done'] ?? null;
        $hasAnyData = ($f180 > 0 || $relFail > 0 || $actCnt > 0 || $last !== null);

        $score = 100.0;
        $reasons = [];

        // ความถี่การเสีย (90 วัน)
        if ($f90 >= 3) { $score -= 25; $reasons[] = "เสีย {$f90} ครั้งใน 90 วัน (-25)"; }
        elseif ($f90 === 2) { $score -= 12; $reasons[] = "เสีย 2 ครั้งใน 90 วัน (-12)"; }
        elseif ($f90 === 1) { $score -= 6; $reasons[] = "เสีย 1 ครั้งใน 90 วัน (-6)"; }

        // ประวัติการเสีย 180 วัน (เสริมความไวของสัญญาณ — เครื่องเสียบ่อยแต่เว้น 90 วัน)
        $histPenalty = $f180 >= 5 ? 18 : ($f180 >= 3 ? 10 : ($f180 >= 2 ? 5 : 0));
        if ($histPenalty > 0 && $f90 === 0) {
            $score -= $histPenalty;
            $reasons[] = "เสียรวม {$f180} ครั้งใน 180 วัน (-{$histPenalty})";
        }

        // Downtime (180 วัน) — ใช้ค่าสูงสุดระหว่าง repair กับ mtbf_mttr
        if ($downtime >= 1440) { $score -= 25; $reasons[] = "Downtime {$downtime} นาทีใน 180 วัน (-25)"; }
        elseif ($downtime >= 720) { $score -= 18; $reasons[] = "Downtime {$downtime} นาทีใน 180 วัน (-18)"; }
        elseif ($downtime >= 120) { $score -= 8; $reasons[] = "Downtime {$downtime} นาทีใน 180 วัน (-8)"; }

        // ใบงานค้างเกินกำหนด
        $odPenalty = min(30, $odCnt * 15);
        if ($odCnt > 0) { $score -= $odPenalty; $reasons[] = "ใบงานค้างเกินกำหนด {$odCnt} ใบ (-{$odPenalty})"; }

        // เสียซ้ำใน 90 วัน
        if ($f90 >= 2) { $score -= 10; $reasons[] = 'เสียซ้ำใน 90 วัน (-10)'; }

        // PM ค้าง (overdue)
        if ($pmOd > 0) { $score -= 10; $reasons[] = "PM ค้างกำหนด {$pmOd} รายการ (-10)"; }

        // Inspection ไม่ผ่าน
        if ($ins > 0) { $score -= 12; $reasons[] = "Inspection ไม่ผ่าน {$ins} ครั้งใน 180 วัน (-12)"; }

        $score = max(0, (int)round($score));
        $insuff = !$hasAnyData;
        $health = !$insuff ? ($score >= 80 ? 'HEALTHY' : ($score >= 60 ? 'WATCH' : ($score >= 40 ? 'ATTENTION' : 'CRITICAL'))) : 'INSUFFICIENT_DATA';

        $results[] = [
            'asset_id' => $aid,
            'code' => $a['code'],
            'name' => $a['name'],
            'category' => $a['category'] ?: '',
            'criticality' => $a['criticality'] ?: '',
            'status' => $a['status'],
            'location' => $a['location'] ?: '',
            'department' => $a['dept_name'] ?: ($a['department'] ?: ''),
            'running_hours_month' => $a['running_hours_month'] !== null ? (float)$a['running_hours_month'] : null,
            'health' => $health,
            'score' => $insuff ? null : $score,
            'factors' => [
                'breakdown_failures_90d' => $f90,
                'breakdown_failures_180d' => $f180,
                'downtime_minutes_180d' => (int)$downtime,
                'active_wos' => $actCnt,
                'overdue_active_wos' => $odCnt,
                'pm_overdue' => $pmOd,
                'inspection_fail_180d' => $ins,
            ],
            'last_breakdown_completed_at' => $last,
            'reasons' => $insuff ? ['ยังไม่มีข้อมูลงานซ่อม / PM / inspection ที่จะประเมินได้'] : (($reasons ?: ['ข้อมูลปกติ'])),
        ];
    }

    $byHealth = [];
    foreach ($results as $r) $byHealth[$r['health']] = ($byHealth[$r['health']] ?? 0) + 1;
    krsort($byHealth);
    $order = ['CRITICAL', 'ATTENTION', 'WATCH', 'HEALTHY', 'INSUFFICIENT_DATA'];
    $summary = ['total' => count($results), 'by_health' => []];
    foreach ($order as $h) if (isset($byHealth[$h])) $summary['by_health'][$h] = $byHealth[$h];

    return [
        'assets' => $results,
        'summary' => $summary,
        'insufficient_count' => (int)($byHealth['INSUFFICIENT_DATA'] ?? 0),
        'method_note' => 'คะแนนจากข้อมูลจริงในช่วง 90–180 วัน (ความถี่การเสีย, downtime, งานค้าง, PM ค้าง, inspection ไม่ผ่าน) — ไม่ใช่การพยากรณ์',
    ];
}

/* ─────────── 4. การเสียซ้ำ (Repeat Failures) ─────────── */

function ana_repeat_failures(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $together = "SELECT r.asset_id, a.code, a.name, a.criticality,
            COUNT(*) AS cnt,
            MIN(r.created_at) AS first_wo,
            MAX(r.created_at) AS last_wo,
            SUM(r.source_type='breakdown') AS breakdown_cnt,
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt_min
        FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id" . $where . $dateSql . "
        GROUP BY r.asset_id, a.code, a.name, a.criticality
        HAVING cnt > 1
        ORDER BY cnt DESC, a.criticality ASC
        LIMIT 200";
    $st = $pdo->prepare($together);
    $st->execute($params);
    $assets = $st->fetchAll(PDO::FETCH_ASSOC);

    // ระยะห่างเฉลี่ยระหว่างการเสีย (ชั่วโมง) — ประมวลใน PHP
    $timelineSql = "SELECT r.asset_id, r.created_at FROM repair r" . $where . $dateSql . "
        AND r.created_at IS NOT NULL ORDER BY r.asset_id, r.created_at ASC LIMIT 2000";
    $tst = $pdo->prepare($timelineSql);
    $tst->execute($params);
    $timeline = [];
    foreach ($tst->fetchAll(PDO::FETCH_ASSOC) as $t) $timeline[(int)$t['asset_id']][] = strtotime($t['created_at']);

    $drill = [];
    foreach ($assets as &$r) {
        $aid = (int)$r['asset_id'];
        $r['cnt'] = (int)$r['cnt'];
        $r['breakdown_cnt'] = (int)$r['breakdown_cnt'];
        $r['dt_min'] = (float)$r['dt_min'];
        $times = $timeline[$aid] ?? [];
        $gaps = [];
        sort($times);
        for ($i = 1; $i < count($times); $i++) $gaps[] = round(($times[$i] - $times[$i - 1]) / 3600, 1);
        $r['avg_gap_hours'] = $gaps ? round(array_sum($gaps) / count($gaps), 1) : null;
        $r['min_gap_hours'] = $gaps ? min($gaps) : null;
        $r['last_wo'] = $r['last_wo'] ?? null;
        $r['first_wo'] = $r['first_wo'] ?? null;
    }
    unset($r);

    // เจาะลงใบงานของเครื่องใดเครื่องหนึ่ง (asset_id ระบุชัด)
    $detailRows = null;
    if (!empty($opts['asset_id']) && ctype_digit((string)$opts['asset_id'])) {
        $w = 'r.asset_id = ?' . $scope['sql'];
        $dp = [(int)$opts['asset_id']];
        $dp = array_merge($dp, $scope['params']);
        $dst = $pdo->prepare("SELECT r.id, r.work_order_no, r.title, r.status, r.priority, r.source_type,
                    r.created_at, r.completed_at, r.downtime_minutes, r.repair_time_minutes,
                    fc.name AS failure_name
                FROM repair r LEFT JOIN failure_codes fc ON fc.id = r.failure_code_id
                WHERE $w ORDER BY r.created_at DESC LIMIT 300");
        $dst->execute($dp);
        $detailRows = $dst->fetchAll(PDO::FETCH_ASSOC);
    }

    return [
        'assets' => $assets,
        'detail' => $detailRows,
        'note' => 'เครื่องที่ใบงานมากกว่า 1 ใบในช่วงที่เลือก — กด "ใบงาน" เพื่อเจาะถึงรายการจริง',
        'total_repeat_assets' => count($assets),
    ];
}

/* ─────────── 5. Downtime Pareto ─────────── */

function ana_downtime_pareto(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $rows = [];
    if ($range) {
        [$rangeSql, $params] = ana_mtbf_range_sql($range);
        $st = $pdo->prepare("SELECT a.id, a.code, a.name,
                    SUM(m.total_downtime_minutes) AS dt_min,
                    SUM(m.total_failures) AS failures
                FROM mtbf_mttr m
                LEFT JOIN asset_registry a ON a.id = m.asset_id
                WHERE 1=1" . $rangeSql . "
                GROUP BY a.id, a.code, a.name
                HAVING dt_min > 0
                ORDER BY dt_min DESC");
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    }
    $totalMin = array_sum(array_column($rows, 'dt_min'));
    $cumul = 0.0;
    $pareto = [];
    foreach ($rows as $r) {
        $dt = (float)$r['dt_min'];
        $pct = $totalMin > 0 ? round(100 * $dt / $totalMin, 1) : 0;
        $cumul += $pct;
        $pareto[] = [
            'asset_id' => (int)$r['id'],
            'code' => $r['code'] ?? '',
            'name' => $r['name'] ?? '',
            'downtime_minutes' => $dt,
            'downtime_hours' => round($dt / 60, 1),
            'failures' => (int)$r['failures'],
            'pct' => $pct,
            'cumulative_pct' => round($cumul, 1),
        ];
    }
    return [
        'rows' => $pareto,
        'total_downtime_minutes' => $totalMin,
        'source' => 'mtbf_mttr',
        'note' => 'แหล่งจริงจากตาราง mtbf_mttr (บันทึก downtime รายเดือนต่อเครื่อง) — repair.downtime_minutes ยังถูกบันทึกน้อยมาก',
    ];
}

/* ─────────── 6. วิเคราะห์ความเร่งด่วน + Aging ─────────── */

function ana_priority_analysis(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $activeSet = '"' . implode('","', kpi_active_statuses()) . '"';
    $st = $pdo->prepare("SELECT r.id, r.priority, r.status, r.title, r.asset_id, a.code AS asset_code,
                r.created_at, r.sla_due_at, r.estimated_completion_date, r.planned_end_at,
                TIMESTAMPDIFF(DAY, r.created_at, NOW()) AS age_days,
                d.name AS dept_name
            FROM repair r
            LEFT JOIN asset_registry a ON a.id = r.asset_id
            LEFT JOIN departments d ON d.id = r.department_id" . $where . $dateSql . "
            AND r.status IN ($activeSet)
            ORDER BY FIELD(r.priority,'critical','high','medium','low'), r.created_at ASC");
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $queue = [];
    foreach ($rows as $r) {
        $ov = kpi_is_overdue($r);
        $set = ['id' => (int)$r['id'], 'title' => $r['title'], 'status' => $r['status'],
            'priority' => $r['priority'], 'asset_code' => $r['asset_code'], 'dept_name' => $r['dept_name'],
            'created_at' => $r['created_at'], 'age_days' => (int)$r['age_days'], 'overdue' => $ov];
        if ($ov) $set['needs_at'] = $r['sla_due_at'] ?: ($r['estimated_completion_date'] ?: $r['planned_end_at']);
        $queue[] = $set;
    }

    $byPriority = [];
    foreach (['critical', 'high', 'medium', 'low'] as $p) {
        $items = array_values(array_filter($queue, fn($q) => $q['priority'] === $p));
        $ages = array_column($items, 'age_days');
        $byPriority[$p] = [
            'active' => count($items),
            'overdue' => count(array_filter($items, fn($q) => $q['overdue'])),
            'avg_age_days' => $ages ? round(array_sum($ages) / count($ages), 1) : 0,
            'max_age_days' => $ages ? max($ages) : 0,
        ];
    }
    $aging = ['0_7' => 0, '7_14' => 0, '14_30' => 0, '30_plus' => 0];
    foreach ($queue as $q) {
        $d = $q['age_days'];
        if ($d >= 30) $aging['30_plus']++;
        elseif ($d >= 14) $aging['14_30']++;
        elseif ($d >= 7) $aging['7_14']++;
        else $aging['0_7']++;
    }

    return [
        'summary' => [
            'total_active' => count($queue),
            'total_overdue' => count(array_filter($queue, fn($q) => $q['overdue'])),
            'overdue_pct' => count($queue) ? round(100 * count(array_filter($queue, fn($q) => $q['overdue'])) / count($queue), 1) : 0,
        ],
        'by_priority' => $byPriority,
        'aging' => $aging,
        'queue' => array_slice($queue, 0, 200),
    ];
}

/* ─────────── 7. PM Compliance ─────────── */

function ana_pm_compliance(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $c = [];
    $conds = ' 1=1 ';
    $assetFlt = '';
    if (!empty($opts['asset_id']) && ctype_digit((string)$opts['asset_id'])) {
        $assetFlt = ' AND p.asset_id = ? ';
        $c[] = (int)$opts['asset_id'];
        $conds .= $assetFlt;
    }
    if ($range) {
        $conds .= ' AND p.completed_at BETWEEN ? AND ? ';
        $c[] = $range['start'];
        $c[] = $range['end'];
    }
    $conds .= ' AND p.status IN ("completed","closed") ';
    if ((int)$opts['role_id'] === 3 && !empty($opts['user_id'])) {
        // ช่างเห็นเฉพาะ PM ของตนเอง (เช่นเดียวกับ scope ทั่วไปของระบบ)
        $conds .= ' AND p.assigned_to = ? ';
        $c[] = (int)$opts['user_id'];
    }

    $st = $pdo->prepare("SELECT p.id, p.title, p.asset_id, p.due_date, p.completed_at, p.status,
                p.is_outsource, p.cost_outsource, p.frequency_type,
                pl.code AS plan_code, pl.name AS plan_name,
                a.code AS asset_code, a.name AS asset_name
            FROM pm_am p
            LEFT JOIN pm_am_plans pl ON pl.id = p.plan_id
            LEFT JOIN asset_registry a ON a.id = p.asset_id
            WHERE" . $conds . "
            ORDER BY p.due_date DESC");
    $st->execute($c);
    $done = $st->fetchAll(PDO::FETCH_ASSOC);

    $onTime = 0;
    $list = [];
    foreach ($done as $r) {
        $late = $r['completed_at'] && $r['due_date'] && substr($r['completed_at'], 0, 10) > $r['due_date'];
        if (!$late) $onTime++;
        $list[] = [
            'id' => (int)$r['id'], 'title' => $r['title'], 'asset_code' => $r['asset_code'],
            'due_date' => $r['due_date'], 'completed_at' => $r['completed_at'],
            'on_time' => !$late, 'is_outsource' => (bool)$r['is_outsource'],
            'cost_outsource' => (float)$r['cost_outsource'],
            'plan_code' => $r['plan_code'] ?: '', 'plan_name' => $r['plan_name'] ?: '',
        ];
    }

    // งานค้าง/ค้างกำหนด (active) — ปรับ scope ตาม role
    $odParams = [];
    $odConds = " p.status IN ('pending','in_progress','overdue') AND p.due_date < CURDATE()" . $assetFlt;
    if ((int)$opts['role_id'] === 3 && !empty($opts['user_id'])) {
        $odConds .= ' AND p.assigned_to = ? ';
        $odParams[] = (int)$opts['user_id'];
    }
    if ($assetFlt !== '') array_unshift($odParams, (int)$opts['asset_id']);
    $overdueSt = $pdo->prepare("SELECT p.id, p.title, p.due_date, p.status, p.asset_id,
                a.code AS asset_code, pl.code AS plan_code, pl.name AS plan_name
            FROM pm_am p
            LEFT JOIN pm_am_plans pl ON pl.id = p.plan_id
            LEFT JOIN asset_registry a ON a.id = p.asset_id
            WHERE" . $odConds . "
            ORDER BY p.due_date ASC LIMIT 200");
    $overdueSt->execute($odParams);
    $overdueActive = $overdueSt->fetchAll(PDO::FETCH_ASSOC);

    $compliance = count($done) > 0 ? round(100 * $onTime / count($done), 1) : null;

    return [
        'summary' => [
            'done' => count($done),
            'on_time' => $onTime,
            'late' => count($done) - $onTime,
            'compliance_pct' => $compliance,
            'overdue_active' => count($overdueActive),
            'note' => $compliance === null ? 'ยังไม่มี PM ที่เสร็จในช่วงที่เลือก' : 'compliance = PM เสร็จทันกำหนด (completed_at ≤ due_date) / PM เสร็จทั้งหมด',
        ],
        'list' => $list,
        'overdue_active' => $overdueActive,
    ];
}

/* ─────────── 8. งานวางแผน vs งานฉุกเฉิน ─────────── */

function ana_planned_unplanned(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $st = $pdo->prepare("SELECT r.source_type, COUNT(*) AS cnt
        FROM repair r" . $where . $dateSql . "
        GROUP BY r.source_type ORDER BY cnt DESC");
    $st->execute($params);
    $rows = []; foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $rows[$r['source_type']] = (int)$r['cnt'];

    $total = array_sum($rows);
    $breakdown = (int)($rows['breakdown'] ?? 0);
    $pm = (int)($rows['pm'] ?? 0);
    $planned = $pm;
    $unplanned = $breakdown;
    $other = $total - $pm - $breakdown;

    return [
        'summary' => [
            'total_wo' => $total,
            'planned_pm' => $pm,
            'unplanned_breakdown' => $unplanned,
            'other' => $other,
            'unplanned_pct' => $total > 0 ? round(100 * $unplanned / $total, 1) : 0,
            'planned_pct' => $total > 0 ? round(100 * $planned / $total, 1) : 0,
        ],
        'by_source' => [
            ['source_type' => 'breakdown', 'label' => 'ฉุกเฉิน (breakdown)', 'cnt' => $breakdown],
            ['source_type' => 'pm', 'label' => 'วางแผน (PM)', 'cnt' => $pm],
            ['source_type' => 'other', 'label' => 'อื่นๆ (modify/build)', 'cnt' => $other],
        ],
        'note' => 'สัดส่วนจากใบงานจริงในระบบ ณ ช่วงที่เลือก — กรณีระบบใช้ breakdown ล้วนสัดส่วนฉุกเฉิน 100% แสดงตามจริง',
    ];
}

/* ─────────── 9. ช่าง: ภาระงาน + การทับซ้อน ─────────── */

function ana_technician_analytics(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $st = $pdo->prepare("SELECT u.id AS user_id, u.full_name,
            COUNT(*) AS total,
            SUM(r.status IN ('open','acknowledged','assigned','accepted')) AS open_cnt,
            SUM(r.status IN ('in_progress','paused','waiting_parts','waiting_external','waiting_approval')) AS active_cnt,
            SUM(r.status IN ('in_progress','paused','waiting_parts','waiting_external','waiting_approval') AND r.priority IN ('critical','high')) AS active_high_cnt,
            SUM(r.status IN ('closed','verified','done','completed','resolved')) AS done_cnt,
            SUM(r.priority = 'critical') AS critical_cnt,
            ROUND(AVG(NULLIF(r.repair_time_minutes,0)),1) AS avg_repair_min,
            COALESCE(SUM(COALESCE(r.downtime_minutes,0)),0) AS dt_min,
            SUM(r.status IN ('open','acknowledged','assigned','accepted') AND r.sla_due_at IS NOT NULL AND r.sla_due_at < NOW()) AS overdue_sla_cnt
        FROM repair r
        LEFT JOIN users u ON u.id = r.assigned_to" . $where . $dateSql . "
        GROUP BY u.id, u.full_name
        HAVING u.id IS NOT NULL
        ORDER BY active_cnt DESC, total DESC LIMIT 50");
    $st->execute($params);

    $techs = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $active = (int)$r['active_cnt'];
        $techs[] = [
            'user_id' => (int)$r['user_id'],
            'full_name' => $r['full_name'],
            'total' => (int)$r['total'],
            'open_cnt' => (int)$r['open_cnt'],
            'active_cnt' => $active,
            'active_high_cnt' => (int)$r['active_high_cnt'],
            'done_cnt' => (int)$r['done_cnt'],
            'critical_cnt' => (int)$r['critical_cnt'],
            'avg_repair_min' => $r['avg_repair_min'] !== null ? (float)$r['avg_repair_min'] : null,
            'downtime_minutes' => (float)$r['dt_min'],
            'overdue_sla_cnt' => (int)$r['overdue_sla_cnt'],
            // การทับซ้อน: มีงาน active ≥2 ที่ high/critical พร้อมกัน (สัญญาณ overload — ไม่ใช่การจัดอันดับฝีมือ)
            'overlap_active_high' => $active >= 2 && (int)$r['active_high_cnt'] >= 2,
        ];
    }

    return [
        'technicians' => $techs,
        'totals' => [
            'technicians' => count($techs),
            'active_wos' => array_sum(array_column($techs, 'active_cnt')),
            'overlap_techs' => count(array_filter($techs, fn($t) => $t['overlap_active_high'])),
        ],
        'note' => 'แสดงภาระงานจริง ไม่อิงการจัดอันดับฝีมือ — overlap_active_high เตือนเมื่อช่างมีงาน active ระดับสูง/วิกฤต ≥2 ใบพร้อมกัน',
    ];
}

/* ─────────── 10. อะไหล่: สต็อก (Sage) vs การใช้งาน (CMMS) ─────────── */

function ana_spare_analytics(PDO $pdo): array {
    $st = $pdo->query("SELECT
            COUNT(*) AS items,
            SUM(COALESCE(stock_qty,0)) AS stock_qty,
            SUM(COALESCE(stock_qty,0)*COALESCE(unit_price,0)) AS stock_value,
            SUM(CASE WHEN COALESCE(stock_qty,0) > 0 AND stock_qty <= COALESCE(min_stock,0) THEN 1 ELSE 0 END) AS low_stock,
            SUM(CASE WHEN COALESCE(stock_qty,0) <= 0 AND COALESCE(min_stock,0) > 0 THEN 1 ELSE 0 END) AS out_of_stock,
            SUM(CASE WHEN COALESCE(stock_qty,0)*COALESCE(unit_price,0) >= 50000 THEN 1 ELSE 0 END) AS high_value,
            MAX(updated_at) AS last_synced
        FROM spare_parts");
    $agg = $st->fetch(PDO::FETCH_ASSOC);

    $low = $pdo->query("SELECT code, name, stock_qty, min_stock, unit_price, category
        FROM spare_parts
        WHERE COALESCE(stock_qty,0) <= COALESCE(min_stock,0)
        ORDER BY (COALESCE(min_stock,0)-COALESCE(stock_qty,0)) DESC
        LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);

    $usage = [
        'repair_spare_parts_rows' => (int)$pdo->query('SELECT COUNT(*) FROM repair_spare_parts')->fetchColumn(),
        'pm_spare_parts_rows' => (int)$pdo->query('SELECT COUNT(*) FROM pm_am_spare_parts')->fetchColumn(),
        'issue_items_total_qty' => (float)$pdo->query('SELECT COALESCE(SUM(qty_issued),0) FROM spare_issue_items')->fetchColumn(),
        'note' => 'ประวัติการใช้อะไหล่ผูกกับใบงานยังไม่มีข้อมูล (ตารางผูกใบงาน/เบิกเป็น 0) — แสดงตามจริง ไม่ประมาณค่า',
    ];

    return [
        'summary' => [
            'items' => (int)$agg['items'],
            'stock_qty' => (float)$agg['stock_qty'],
            'stock_value' => (float)$agg['stock_value'],
            'low_stock' => (int)$agg['low_stock'],
            'out_of_stock' => (int)$agg['out_of_stock'],
            'high_value_items' => (int)$agg['high_value'],
            'last_synced' => $agg['last_synced'],
            'source' => 'Sage 300 (spare_parts) — stock_qty × unit_price',
        ],
        'low_stock' => $low,
        'usage' => $usage,
        'note' => 'ยอดสต็อก/มูลค่า = แหล่งจริงจาก Sage 300; ประวัติการใช้งานจาก CMMS จะแสดงเมื่อมีการผูกอะไหล่กับใบงานจริง',
    ];
}

/* ─────────── 11. ต้นทุน (reuse kpi_cost + ตรวจคุณภาพ) ─────────── */

function ana_cost_analytics(PDO $pdo, array $opts): array {
    $cost = kpi_cost($pdo, $opts);
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);
    $st = $pdo->prepare("SELECT
            COUNT(*) AS wos,
            SUM(CASE WHEN COALESCE(r.cost_parts,0)+COALESCE(r.cost_labor,0)+COALESCE(r.cost_outsource,0) > 0 THEN 1 ELSE 0 END) AS with_cost
        FROM repair r" . $where . $dateSql);
    $st->execute($params);
    $cov = $st->fetch(PDO::FETCH_ASSOC);
    $withCost = (int)($cov['with_cost'] ?? 0);

    return [
        'cost' => $cost,
        'coverage' => [
            'wos' => (int)($cov['wos'] ?? 0),
            'with_cost_gt_0' => $withCost,
            'insufficient' => $withCost === 0,
            'note' => $withCost === 0
                ? 'ยังไม่มีใบงานที่บันทึกต้นทุน (cost_labor/cost_parts/cost_outsource = 0 ทุกใบ) — รอการบันทึกจริงก่อนจึงเชื่อถือได้'
                : 'ต้นทุนจากข้อมูลจริงของใบงานที่บันทึก cost อย่างน้อย 1 ชุด',
        ],
    ];
}

/* ─────────── 12. คุณภาพข้อมูล ─────────── */

function ana_data_quality(PDO $pdo, array $opts): array {
    $range = kpi_parse_range($opts);
    $flt = kpi_filters($pdo, $opts);
    $scope = kpi_scope($pdo, (int)$opts['role_id'], (int)$opts['user_id']);
    $where = ' WHERE 1=1 ' . $flt['sql'] . $scope['sql'];
    $dateSql = kpi_range_sql($range, 'r.created_at');
    $params = array_merge($flt['params'], $scope['params'], $range ? [$range['start'], $range['end']] : []);

    $st = $pdo->prepare("SELECT COUNT(*) AS total,
            SUM(COALESCE(r.downtime_minutes,0) > 0) AS downtime,
            SUM(COALESCE(r.repair_time_minutes,0) > 0) AS repair_time,
            SUM(COALESCE(r.response_time_minutes,0) > 0) AS response_time,
            SUM(COALESCE(r.cost_parts,0)+COALESCE(r.cost_labor,0)+COALESCE(r.cost_outsource,0) > 0) AS cost,
            SUM(r.failure_code_id IS NOT NULL) AS failure_code,
            SUM(r.rca_category IS NOT NULL) AS rca,
            SUM(r.planned_start_at IS NOT NULL) AS planned
        FROM repair r" . $where . $dateSql);
    $st->execute($params);
    $q = $st->fetch(PDO::FETCH_ASSOC);
    $total = (int)$q['total'] ?? 0;

    $fields = [];
    $defs = [
        'downtime' => 'downtime_minutes', 'repair_time' => 'repair_time_minutes', 'response_time' => 'response_time_minutes',
        'cost' => 'cost fields', 'failure_code' => 'failure_code_id', 'rca' => 'rca_category', 'planned' => 'planned_start_at',
    ];
    foreach ($defs as $key => $label) {
        $filled = (int)$q[$key];
        if (strpos($key, 'cost') === 0) $label = 'ต้นทุน (แรง/อะไหล่/จ้าง)';
        elseif ($key === 'repair_time') $label = 'เวลาซ่อมจริง';
        elseif ($key === 'downtime') $label = 'Downtime';
        elseif ($key === 'response_time') $label = 'เวลาตอบสนอง';
        elseif ($key === 'failure_code') $label = 'สาเหตุการเสีย (failure code)';
        elseif ($key === 'rca') $label = 'RCA Category';
        else $label = 'การวางแผน (planned start)';
        $fields[] = [
            'key' => $key,
            'label' => $label,
            'filled' => $filled,
            'total' => $total,
            'pct' => $total > 0 ? round(100 * $filled / $total, 1) : 0,
        ];
    }

    [$relSql, $relParams] = ana_mtbf_range_sql($range);
    $rel = $pdo->prepare("SELECT COUNT(*) AS months, COUNT(DISTINCT asset_id) AS assets FROM mtbf_mttr WHERE 1=1" . $relSql);
    $rel->execute($relParams);
    $relRow = $rel->fetch(PDO::FETCH_ASSOC);

    $reliability = [
        'months_covered' => (int)$relRow['months'],
        'assets_covered' => (int)$relRow['assets'],
        'usage_rows' => (int)$pdo->query('SELECT COUNT(*) FROM repair_spare_parts')->fetchColumn(),
        'pm_rows' => (int)$pdo->query('SELECT COUNT(*) FROM pm_am')->fetchColumn(),
    ];

    $warnings = [];
    if ($total > 0) {
        $warn = fn($f) => $f['filled'] < $f['total'] * 0.5;
        foreach ($fields as $f) {
            if ($f['total'] > 0 && $f['pct'] < 50) {
                $warnings[] = "{$f['label']} กรอกเพียง {$f['pct']}% ({$f['filled']}/{$f['total']} ใบ) — KPI ที่พึ่งพาข้อมูลนี้อาจเบี่ยงเบน";
            }
        }
        if ($total === 0) $warnings[] = 'ไม่มีใบงานในช่วงที่เลือก';
    }
    if ($reliability['months_covered'] === 0) $warnings[] = 'ยังไม่มีข้อมูล operating hours/failures รายเดือน (mtbf_mttr) — MTBF/MTTR/availability แสดง INSUFFICIENT DATA';
    if ($reliability['usage_rows'] === 0) $warnings[] = 'ยังไม่มีการผูกอะไหล่กับใบงาน — ต้นทุนวัสดุและปริมาณการใช้อะไหล่ยังไม่สามารถวิเคราะห์ได้';

    return [
        'range' => $range ? ['start' => $range['start'], 'end' => $range['end']] : null,
        'total_wos' => $total,
        'fields' => $fields,
        'reliability' => $reliability,
        'warnings' => $warnings,
    ];
}

/* ─────────── 13. ภาพรวมผู้บริหาร ─────────── */

function ana_overview(PDO $pdo, array $opts): array {
    $core = kpi_core_metrics($pdo, $opts);
    $reli = ana_reliability($pdo, $opts);
    $fleet = kpi_asset_health($pdo);
    $mix = ana_planned_unplanned($pdo, $opts);
    $dq = ana_data_quality($pdo, $opts);
    $fail = kpi_failure($pdo, $opts);
    $trend = ana_trend($pdo, $opts + ['bucket' => 'month']);
    $pm = ana_pm_compliance($pdo, $opts);
    $spare = ana_spare_analytics($pdo);

    return [
        'core' => $core,
        'reliability' => $reli,
        'fleet' => $fleet,
        'planned_unplanned' => $mix['summary'],
        'repeat_total' => (int)$fail['total_breakdown'],
        'repeat_assets' => count($fail['repeated_assets']),
        'pm' => $pm['summary'],
        'spare_low_stock' => (int)$spare['summary']['low_stock'],
        'trend' => array_slice($trend['rows'], -12),
        'quality_warnings' => array_slice($dq['warnings'], 0, 6),
        'quality' => [
            'total_wos' => $dq['total_wos'],
            'reliability_months' => $dq['reliability']['months_covered'],
            'reliability_assets' => $dq['reliability']['assets_covered'],
        ],
    ];
}