<?php
/**
 * cost.php — Phase 26 Maintenance Cost & Budget engine (single source)
 *
 * ทุกหน้าจอ (dashboard / /cost / /budget / report / export) ต้องใช้สูตรจากไฟล์นี้
 * ห้ามคำนวณยอดต่างที่ (Phase 26 Do.D.) — แหล่งข้อมูลจริง:
 *   parts    = v_maintenance_cost.parts_cost   (repair_spare_parts snapshot ราคา Sage)
 *              + fallback manual เมื่อ WO มี cost_parts แต่ไม่มีรายการอะไหล่ (import/เก่า)
 *   labor    = cost_labor_recorded (ถ้ากรอก) หรือ repair_time_minutes/60 × standard_labor_rate
 *              (ปิดได้: cost_labor_enabled=0)
 *   external = cost_outsource_recorded (บันทึกในใบสั่งซ่อม — wo_response)
 *   other    = ยังไม่มีช่องบันทึก → แสดง Not Available เสมอ (documented, implement ภายหลัง)
 *
 * Budget:
 *   effective budget = allocated_budget + Σ budget_adjustment
 *   utilization      = actual / effective × 100
 *   alert            = NORMAL (< warning) | WARNING (≥ warning, < exceed) | EXCEEDED (≥ exceed)
 *
 * สิทธิ์: cost_* + budget_* ทั้งหมดต้องถูก gate ด้วย kpi_can_see_cost($roleId)
 *        (API เป็นผู้บังคับ — ฟังก์ชันที่นี่ไม่ตรวจเอง)
 */
require_once __DIR__ . '/kpi.php';

/* ═══════════════════════ 1. CONFIG / สิทธิ์ ═══════════════════════ */

function cost_config(PDO $pdo): array {
    $get = function (string $k, string $d) use ($pdo): string {
        static $cache = [];
        if (array_key_exists($k, $cache)) return $cache[$k];
        $st = $pdo->prepare('SELECT setting_value FROM settings WHERE setting_key = ?');
        $st->execute([$k]);
        $v = $st->fetchColumn();
        if ($v === null || $v === false || $v === '') { $cache[$k] = $d; return $d; }
        $cache[$k] = (string)$v;
        return $cache[$k];
    };
    return [
        'currency_symbol'   => $get('currency_symbol', '฿'),
        'system_currency'   => $get('system_currency', '฿ THB'),
        'labor_enabled'     => $get('cost_labor_enabled', '1') === '1',
        'labor_rate'        => (float)$get('standard_labor_rate', '250'),
        'labor_rate_source' => $get('cost_labor_rate_source', 'configured'),
        'external_source'   => $get('cost_external_source', 'wo_response'),
        'warning_pct'       => max(0.0, (float)$get('budget_warning_pct', '80')),
        'exceed_pct'        => max(0.0, (float)$get('budget_exceed_pct', '100')),
        'dept_filter_enabled' => $get('budget_dept_filter_enabled', '1') === '1',
        'other_available'   => false,
    ];
}

/** ผู้จัดการงบประมาณ — ผูกกับชุดเดิม kpi_can_see_cost (1,2,6) ไม่สร้างสิทธิ์ขนาน */
function cost_can_manage_budget(int $roleId): bool {
    return in_array($roleId, [1, 2, 6], true);
}

function cost_money($v): float {
    $f = (float)$v;
    return round($f, 2);
}

/* ── SQL fragment ของคอมโพเนนต์ต้นทุน (ใช้กับ v_maintenance_cost alias r) ── */

/**
 * คืน [ 'parts' => sql, 'manual' => sql, 'labor' => sql, 'external' => sql, 'total' => sql ]
 * คอมโพเนนต์คำนวณจากคอลัมน์จริงของ view (ห้ามแก้ที่อื่น)
 */
function cost_comp_sql(PDO $pdo, string $r = 'r'): array {
    $cfg = cost_config($pdo);
    $parts = "({$r}.parts_cost + IF({$r}.parts_lines = 0 AND {$r}.cost_parts_snapshot > 0, {$r}.cost_parts_snapshot, 0))";
    $manual = "IF({$r}.parts_lines = 0 AND {$r}.cost_parts_snapshot > 0, {$r}.cost_parts_snapshot, 0)";
    if ($cfg['labor_enabled'] && $cfg['labor_rate'] > 0) {
        $rate = sprintf('%.2f', $cfg['labor_rate']);
        $labor = "IF({$r}.cost_labor_recorded > 0, {$r}.cost_labor_recorded, IF({$r}.repair_time_minutes > 0, {$r}.repair_time_minutes / 60.0 * {$rate}, 0))";
    } else {
        $labor = '0';
    }
    $external = "COALESCE({$r}.cost_outsource_recorded, 0)";
    $total = "(($parts) + ($labor) + ($external))";
    return [
        'parts'    => $parts,
        'manual'   => $manual,
        'labor'    => $labor,
        'external' => $external,
        'total'    => $total,
    ];
}

/** WHERE fragment สำหรับ view (alias r) — เดียวกับ kpi_filters แต่รองรับ maintenance_type */
function cost_filters(PDO $pdo, array $opts): array {
    $sql = '';
    $params = [];
    $parts = [];

    foreach (['department_id', 'asset_id'] as $f) {
        if (!empty($opts[$f]) && (int)$opts[$f] > 0) {
            $parts[] = 'r.' . $f . ' = ?';
            $params[] = (int)$opts[$f];
        }
    }
    if (!empty($opts['asset_category'])) {
        $parts[] = 'EXISTS (SELECT 1 FROM asset_registry aK WHERE aK.id = r.asset_id AND aK.category = ?)';
        $params[] = (string)$opts['asset_category'];
    }
    foreach (['source_type', 'priority', 'status', 'maintenance_type'] as $f) {
        if (isset($opts[$f]) && $opts[$f] !== '') {
            $parts[] = 'r.' . $f . ' = ?';
            $params[] = (string)$opts[$f];
        }
    }
    if ($parts) $sql = ' WHERE ' . implode(' AND ', $parts);
    return ['sql' => $sql, 'params' => $params];
}

/** SQL fragment + params รวม filter + ช่วงเวลา (คอลัมน์ created_at ของ view) */
function cost_where(array $flt, ?array $range): array {
    $sql = $flt['sql'];
    $params = $flt['params'];
    if ($range) {
        $sql .= ($sql === '' ? ' WHERE ' : ' AND ') . 'r.created_at BETWEEN ? AND ?';
        $params[] = $range['start'];
        $params[] = $range['end'];
    }
    return ['sql' => $sql, 'params' => $params];
}

/** cost_where() สำหรับ query ที่มี WHERE 1=1 อยู่แล้ว — เปลี่ยน lead WHERE → AND */
function cost_parts_where(array $wh): string {
    $sql = preg_replace('/^ WHERE\s+/', ' AND ', (string)($wh['sql'] ?? ''));
    return $sql === ' AND ' ? '' : $sql;
}

/* ═══════════════════════ 2. WO DETAIL ═══════════════════════ */

/** รายการอะไหล่ของ WO + สถานะราคา (missing = ไม่มีราคา snap → Not Available ระดับรายการ) */
function cost_wo_parts(PDO $pdo, int $woId): array {
    $st = $pdo->prepare("SELECT id, spare_part_id, sage_item_code, item_description, unit, quantity_used, unit_price, created_at
                         FROM repair_spare_parts WHERE repair_id = ? ORDER BY created_at ASC, id ASC");
    $st->execute([$woId]);
    $lines = [];
    $missing = 0;
    $total = 0.0;
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $qty = (float)$row['quantity_used'];
        $price = (float)($row['unit_price'] ?? 0);
        $hasPrice = $price > 0;
        if (!$hasPrice) $missing++;
        $lineTotal = $hasPrice ? $qty * $price : 0.0;
        $total += $lineTotal;
        $lines[] = [
            'id' => (int)$row['id'],
            'spare_part_id' => $row['spare_part_id'] ? (int)$row['spare_part_id'] : null,
            'item_code' => $row['sage_item_code'] ?: ($row['spare_part_id'] ? '#' . $row['spare_part_id'] : '-'),
            'description' => $row['item_description'] ?: '(ไม่ระบุชื่อ)',
            'unit' => $row['unit'] ?: 'pcs',
            'qty' => $qty,
            'unit_price' => cost_money($price),
            'cost' => cost_money($lineTotal),
            'cost_missing' => !$hasPrice,
            'created_at' => $row['created_at'],
        ];
    }
    return [
        'lines' => $lines,
        'total' => cost_money($total),
        'lines_count' => count($lines),
        'missing_price_lines' => $missing,
        'available' => $missing === 0,
    ];
}

/** รายละเอียดต้นทุนของใบสั่งซ่อมเดียว (พร้อม flag Not Available ของแต่ละคอมโพเนนต์) */
function cost_wo_breakdown(PDO $pdo, int $woId): array {
    $cfg = cost_config($pdo);
    $st = $pdo->prepare("SELECT * FROM v_maintenance_cost WHERE repair_id = ?");
    $st->execute([$woId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new DomainException('ไม่พบใบสั่งซ่อมนี้');
    }
    $parts = cost_wo_parts($pdo, $woId);
    $partsValue = $parts['total'];

    // labor
    $minutes = (float)$row['repair_time_minutes'];
    $laborRecorded = (float)$row['cost_labor_recorded'];
    if ($cfg['labor_enabled'] && $cfg['labor_rate'] > 0) {
        $laborValue = $laborRecorded > 0 ? $laborRecorded : ($minutes > 0 ? ($minutes / 60.0) * $cfg['labor_rate'] : 0.0);
        $labor = [
            'value' => cost_money($laborValue),
            'available' => $minutes > 0 || $laborRecorded > 0,
            'reason' => $minutes <= 0 ? ['repair_time_not_recorded'] : [],
            'base' => $laborRecorded > 0 ? 'recorded' : 'minutes',
        ];
    } else {
        $reasons = [];
        if (!$cfg['labor_enabled']) $reasons[] = 'labor_cost_disabled';
        if ($cfg['labor_rate'] <= 0) $reasons[] = 'labor_rate_not_configured';
        $labor = ['value' => 0.0, 'available' => false, 'reason' => $reasons, 'base' => 'none'];
    }

    // external
    $externalValue = (float)$row['cost_outsource_recorded'];
    $outsourceBy = trim((string)$row['outsource_by']);
    if ($externalValue > 0) {
        $external = ['value' => cost_money($externalValue), 'available' => true, 'reason' => [], 'outsource_by' => $outsourceBy];
    } elseif ($outsourceBy !== '') {
        $external = ['value' => 0.0, 'available' => false, 'reason' => ['external_cost_not_recorded'], 'outsource_by' => $outsourceBy];
    } else {
        $external = ['value' => 0.0, 'available' => true, 'reason' => [], 'outsource_by' => ''];
    }

    // other — ยังไม่มีแหล่งข้อมูล (documented) → Not Available เสมอ
    $other = ['value' => 0.0, 'available' => false, 'reason' => ['other_cost_not_recorded']];

    $totalValue = $partsValue + $labor['value'] + $externalValue;
    $unavailable = [];
    foreach (['parts' => $parts['available'], 'labor' => $labor['available'], 'external' => $external['available'], 'other' => $other['available']] as $k => $ok) {
        if (!$ok) $unavailable[] = $k;
    }

    return [
        'repair_id' => (int)$row['repair_id'],
        'work_order_no' => $row['work_order_no'],
        'asset' => ['id' => $row['asset_id'] ? (int)$row['asset_id'] : null, 'code' => $row['asset_code'], 'name' => $row['asset_name']],
        'department' => ['id' => $row['department_id'] ? (int)$row['department_id'] : null, 'name' => $row['department_name']],
        'maintenance_type' => $row['maintenance_type'],
        'is_breakdown' => (int)$row['is_breakdown'] === 1,
        'status' => $row['status'],
        'created_at' => $row['created_at'],
        'completed_at' => $row['completed_at'],
        'downtime_minutes' => (float)$row['downtime_minutes'],
        'repair_time_minutes' => (float)$row['repair_time_minutes'],
        'config' => [
            'labor_rate' => $cfg['labor_rate'],
            'labor_enabled' => $cfg['labor_enabled'],
            'currency_symbol' => $cfg['currency_symbol'],
        ],
        'parts' => $parts,
        'labor' => $labor,
        'external' => $external,
        'other' => $other,
        'total' => cost_money($totalValue),
        'unavailable_components' => $unavailable,
        'unavailable' => count($unavailable) > 0,
    ];
}

/* ═══════════════════════ 3. AGGREGATES (view) ═══════════════════════ */

/** สรุปต้นทุนรวมตามช่วง/ตัวกรอง — คอมโพเนนต์ + availability + (ใช้ร่วม dashboard/report/export) */
function cost_summary(PDO $pdo, array $opts): array {
    $cfg = cost_config($pdo);
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);

    $st = $pdo->prepare("SELECT
        COUNT(*)                                               AS wo_count,
        SUM(CASE WHEN completed_at IS NOT NULL OR status = 'completed' OR status = 'closed' THEN 1 ELSE 0 END) AS wo_completed,
        SUM(CASE WHEN {$c['total']} > 0 THEN 1 ELSE 0 END)     AS wo_with_cost,
        SUM({$c['parts']})                                     AS parts,
        SUM({$c['manual']})                                    AS parts_manual,
        SUM({$c['labor']})                                     AS labor,
        SUM({$c['external']})                                  AS external,
        SUM({$c['total']})                                     AS total,
        SUM(r.parts_qty)                                       AS material_qty,
        SUM(r.downtime_minutes)                                AS downtime_minutes,
        SUM(CASE WHEN r.parts_lines > 0 AND r.parts_missing_price > 0 THEN 1 ELSE 0 END) AS wo_parts_missing_price,
        SUM(CASE WHEN r.parts_lines > 0 THEN 1 ELSE 0 END)     AS wo_with_parts,
        SUM(CASE WHEN r.cost_labor_recorded > 0 AND r.repair_time_minutes > 0 THEN 1 ELSE 0 END) AS wo_labor_recorded,
        SUM(CASE WHEN r.repair_time_minutes > 0 AND r.cost_labor_recorded = 0 THEN 1 ELSE 0 END) AS wo_labor_from_time,
        SUM(CASE WHEN r.outsource_by <> '' AND r.cost_outsource_recorded = 0 THEN 1 ELSE 0 END) AS wo_outsource_missing_cost,
        SUM(CASE WHEN COALESCE(r.cost_outsource_recorded,0) > 0 THEN 1 ELSE 0 END) AS wo_with_external
        FROM v_maintenance_cost r" . $wh['sql']);
    $st->execute($wh['params']);
    $a = $st->fetch(PDO::FETCH_ASSOC);

    $woCount = (int)$a['wo_count'];
    $parts = cost_money($a['parts'] ?? 0);
    $partsManual = cost_money($a['parts_manual'] ?? 0);
    $labor = cost_money($a['labor'] ?? 0);
    $external = cost_money($a['external'] ?? 0);
    $total = cost_money($a['total'] ?? 0);

    $woLaborTime = (int)$a['wo_labor_from_time'];
    $missingPriceWos = (int)$a['wo_parts_missing_price'];
    $outsourceMissing = (int)$a['wo_outsource_missing_cost'];

    return [
        'currency' => $cfg['currency_symbol'],
        'wo_count' => $woCount,
        'wo_completed' => (int)$a['wo_completed'],
        'wo_with_cost' => (int)$a['wo_with_cost'],
        'parts' => $parts,
        'parts_from_spare_usage' => cost_money($parts - $partsManual),
        'parts_from_manual_record' => $partsManual,
        'labor' => $labor,
        'external' => $external,
        'other' => 0.0,
        'total' => $total,
        'avg_per_wo' => $woCount > 0 ? cost_money($total / $woCount) : 0.0,
        'material_qty' => (float)($a['material_qty'] ?? 0),
        'downtime_minutes' => (float)($a['downtime_minutes'] ?? 0),
        'availability' => [
            'parts' => [
                'available' => $missingPriceWos === 0,
                'wos_with_parts' => (int)$a['wo_with_parts'],
                'wos_missing_price' => $missingPriceWos,
                'reason' => $missingPriceWos > 0 ? ['parts_price_not_recorded'] : [],
            ],
            'labor' => [
                'available' => $cfg['labor_enabled'] && $cfg['labor_rate'] > 0,
                'wos_from_recorded' => (int)$a['wo_labor_recorded'],
                'wos_from_time' => $woLaborTime,
                'reason' => (!$cfg['labor_enabled'] ? ['labor_cost_disabled'] : []) + ($cfg['labor_rate'] <= 0 ? ['labor_rate_not_configured'] : []),
            ],
            'external' => [
                'available' => $outsourceMissing === 0,
                'wos_with_external' => (int)$a['wo_with_external'],
                'wos_missing_cost' => $outsourceMissing,
                'reason' => $outsourceMissing > 0 ? ['external_cost_not_recorded'] : [],
            ],
            'other' => [
                'available' => false,
                'reason' => ['other_cost_not_recorded'],
            ],
        ],
        'config' => [
            'labor_rate' => $cfg['labor_rate'],
            'labor_enabled' => $cfg['labor_enabled'],
            'labor_rate_source' => $cfg['labor_rate_source'],
            'external_source' => $cfg['external_source'],
            'warning_pct' => $cfg['warning_pct'],
            'exceed_pct' => $cfg['exceed_pct'],
        ],
    ];
}

/** แนวโน้มรายเดือน (มี/ไม่มีช่วงระบุ — ถ้าไม่มีใช้ย้อนหลัง เท่า range เดิม/12 เดือน) */
function cost_trend(PDO $pdo, array $opts, ?array $range = null): array {
    $cfg = cost_config($pdo);
    $range = $range ?? kpi_parse_range($opts);

    $flt = cost_filters($pdo, $opts);
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);

    $st = $pdo->prepare("SELECT
        YEAR(r.created_at) AS y, MONTH(r.created_at) AS m,
        COUNT(*) AS wo_count,
        SUM({$c['parts']}) AS parts,
        SUM({$c['manual']}) AS parts_manual,
        SUM({$c['labor']}) AS labor,
        SUM({$c['external']}) AS external,
        SUM({$c['total']}) AS total
        FROM v_maintenance_cost r" . $wh['sql'] . "
        GROUP BY y, m ORDER BY y ASC, m ASC");
    $st->execute($wh['params']);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    // ถ้าไม่มีช่วง ให้เรียง 6 เดือนล่าสุด (หรือทั้งหมดถ้า data สั้น)
    if (!$range) {
        $months = [];
        foreach ($rows as $r) $months[] = sprintf('%04d-%02d', (int)$r['y'], (int)$r['m']);
        if (count($months) < 6 && $rows) {
            $lastDate = end($rows);
            $startDate = sprintf('%04d-%02d-01 00:00:00', (int)$lastDate['y'], (int)$lastDate['m']);
            for ($i = 5; $i >= 1; $i--) {
                array_unshift($months, date('Y-m', strtotime("-$i month", strtotime($startDate))));
            }
        }
        $byKey = [];
        foreach ($rows as $r) $byKey[sprintf('%04d-%02d', $r['y'], $r['m'])] = $r;
        $months = array_values(array_unique($months));
        $out = [];
        foreach ($months as $key) {
            $r = $byKey[$key] ?? null;
            $out[] = [
                'label' => date('M Y', strtotime($key . '-01')),
                'month' => $key,
                'wo_count' => (int)($r['wo_count'] ?? 0),
                'parts' => cost_money($r['parts'] ?? 0),
                'labor' => cost_money($r['labor'] ?? 0),
                'external' => cost_money($r['external'] ?? 0),
                'other' => 0.0,
                'total' => cost_money($r['total'] ?? 0),
            ];
        }
        return $out;
    }

    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'label' => date('M Y', strtotime(sprintf('%04d-%02d-01', (int)$r['y'], (int)$r['m']))),
            'month' => sprintf('%04d-%02d', (int)$r['y'], (int)$r['m']),
            'wo_count' => (int)$r['wo_count'],
            'parts' => cost_money($r['parts']),
            'labor' => cost_money($r['labor']),
            'external' => cost_money($r['external']),
            'other' => 0.0,
            'total' => cost_money($r['total']),
        ];
    }
    return $out;
}

/** ต้นทุนแยกประเภทงาน (PM/AM vs Corrective vs Improvement) — ratio PM ทั้งหมด */
function cost_by_type(PDO $pdo, array $opts): array {
    $cfg = cost_config($pdo);
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);

    $st = $pdo->prepare("SELECT
        r.maintenance_type AS mt,
        COUNT(*) AS wo_count,
        SUM({$c['parts']}) AS parts,
        SUM({$c['labor']}) AS labor,
        SUM({$c['external']}) AS external,
        SUM({$c['total']}) AS total
        FROM v_maintenance_cost r" . $wh['sql'] . "
        GROUP BY r.maintenance_type ORDER BY total DESC");
    $st->execute($wh['params']);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $labels = ['preventive' => 'PM / เชิงป้องกัน', 'corrective' => 'Corrective (ซ่อมเมื่อเสีย)', 'improvement' => 'Improvement (ปรับปรุง)', 'other' => 'อื่น ๆ'];
    $out = [];
    $preventiveTotal = 0.0;
    $correctiveTotal = 0.0;
    foreach ($rows as $r) {
        $t = cost_money($r['total']);
        if ($r['mt'] === 'preventive') $preventiveTotal = $t;
        if ($r['mt'] === 'corrective') $correctiveTotal = $t;
        $out[] = [
            'type' => $r['mt'],
            'label' => $labels[$r['mt']] ?? $r['mt'],
            'wo_count' => (int)$r['wo_count'],
            'parts' => cost_money($r['parts']),
            'labor' => cost_money($r['labor']),
            'external' => cost_money($r['external']),
            'other' => 0.0,
            'total' => $t,
        ];
    }
    $sumBoth = $preventiveTotal + $correctiveTotal;
    return [
        'items' => $out,
        'preventive_total' => cost_money($preventiveTotal),
        'corrective_total' => cost_money($correctiveTotal),
        'pm_ratio' => $sumBoth > 0 ? round($preventiveTotal / $sumBoth * 100, 1) : null,
    ];
}

/** ต้นทุนแยกแผนก */
function cost_by_department(PDO $pdo, array $opts, int $limit = 10): array {
    $cfg = cost_config($pdo);
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);

    $st = $pdo->prepare("SELECT
        r.department_id AS dept_id, COALESCE(r.department_name, '(ไม่ระบุแผนก)') AS dept_name,
        COUNT(*) AS wo_count,
        SUM({$c['parts']}) AS parts,
        SUM({$c['labor']}) AS labor,
        SUM({$c['external']}) AS external,
        SUM({$c['total']}) AS total
        FROM v_maintenance_cost r" . $wh['sql'] . "
        GROUP BY r.department_id, r.department_name ORDER BY total DESC LIMIT " . (int)$limit);
    $st->execute($wh['params']);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'department_id' => $r['dept_id'] ? (int)$r['dept_id'] : null,
            'department_name' => $r['dept_name'],
            'wo_count' => (int)$r['wo_count'],
            'parts' => cost_money($r['parts']),
            'labor' => cost_money($r['labor']),
            'external' => cost_money($r['external']),
            'other' => 0.0,
            'total' => cost_money($r['total']),
        ];
    }
    return $out;
}

/** ต้นทุนแยกเครื่องจักร (จัดอันดับ) */
function cost_by_asset(PDO $pdo, array $opts, int $limit = 10): array {
    $cfg = cost_config($pdo);
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);

    $st = $pdo->prepare("SELECT
        r.asset_id AS aid, COALESCE(r.asset_code, '(ไม่ระบุเครื่อง)') AS acode, COALESCE(r.asset_name, '') AS aname,
        COUNT(*) AS wo_count,
        SUM(COALESCE(r.downtime_minutes,0)) AS downtime_minutes,
        SUM({$c['parts']}) AS parts,
        SUM({$c['labor']}) AS labor,
        SUM({$c['external']}) AS external,
        SUM({$c['total']}) AS total
        FROM v_maintenance_cost r" . $wh['sql'] . "
        GROUP BY r.asset_id, r.asset_code, r.asset_name ORDER BY total DESC LIMIT " . (int)$limit);
    $st->execute($wh['params']);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'asset_id' => $r['aid'] ? (int)$r['aid'] : null,
            'asset_code' => $r['acode'],
            'asset_name' => $r['aname'],
            'wo_count' => (int)$r['wo_count'],
            'downtime_minutes' => (float)$r['downtime_minutes'],
            'parts' => cost_money($r['parts']),
            'labor' => cost_money($r['labor']),
            'external' => cost_money($r['external']),
            'other' => 0.0,
            'total' => cost_money($r['total']),
        ];
    }
    return $out;
}

/** เครื่องจักรต้นทุนสูง — เกณฑ์จาก opts['high_cost_threshold'] (default 50000) */
function cost_high_assets(PDO $pdo, array $opts): array {
    $cfg = cost_config($pdo);
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);
    $threshold = max(0.0, (float)($opts['high_cost_threshold'] ?? 50000));

    $st = $pdo->prepare("SELECT
        r.asset_id AS aid, COALESCE(r.asset_code, '(ไม่ระบุเครื่อง)') AS acode, COALESCE(r.asset_name, '') AS aname,
        COUNT(*) AS wo_count,
        SUM({$c['total']}) AS total
        FROM v_maintenance_cost r" . $wh['sql'] . "
        GROUP BY r.asset_id, r.asset_code, r.asset_name
        HAVING total >= ? ORDER BY total DESC LIMIT 25");
    $st->execute(array_merge($wh['params'], [$threshold]));
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'asset_id' => $r['aid'] ? (int)$r['aid'] : null,
            'asset_code' => $r['acode'],
            'asset_name' => $r['aname'],
            'wo_count' => (int)$r['wo_count'],
            'total' => cost_money($r['total']),
        ];
    }
    return ['threshold' => cost_money($threshold), 'items' => $out];
}

/** maintenance_type เป็นคอลัมน์คำนวณใน view เท่านั้น — แปลงเป็น subquery เมื่อ query ตาราง repair */
function cost_parts_filter(PDO $pdo, array $opts): array {
    $flt = cost_filters($pdo, $opts);
    if (!empty($opts['maintenance_type'])) {
        $flt['sql'] = preg_replace(
            '/r\.maintenance_type = \?/',
            'EXISTS (SELECT 1 FROM v_maintenance_cost vm WHERE vm.repair_id = r.id AND vm.maintenance_type = ?)',
            $flt['sql'],
            1,
            $count
        );
        if (!$count) throw new LogicException('maintenance_type filter ไม่ถูกต้อง');
    }
    return $flt;
}

/** อะไหล่ที่ใช้ต้นทุนสูงสุด (JOIN spare_parts เพื่อได้ sage_item/category) */
function cost_parts_list(PDO $pdo, array $opts, int $limit = 10): array {
    $range = kpi_parse_range($opts);
    $flt = cost_parts_filter($pdo, $opts);
    $wh = cost_where($flt, $range);

    $st = $pdo->prepare("SELECT
        COALESCE(rsp.sage_item_code, sp.sage_item_no, sp.code, CONCAT('#', rsp.spare_part_id)) AS item_code,
        COALESCE(rsp.item_description, sp.name) AS item_name,
        COALESCE(sp.category, '') AS category,
        COALESCE(rsp.unit, sp.unit) AS unit,
        SUM(rsp.quantity_used) AS qty,
        SUM(rsp.quantity_used * rsp.unit_price) AS cost,
        COUNT(DISTINCT rsp.repair_id) AS wo_count
        FROM repair_spare_parts rsp
        LEFT JOIN repair r ON r.id = rsp.repair_id
        LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id
        LEFT JOIN asset_registry a2 ON a2.id = r.asset_id
        WHERE 1=1" . cost_parts_where($wh) . "
        GROUP BY rsp.sage_item_code, sp.sage_item_no, sp.code, rsp.spare_part_id, rsp.item_description, sp.name, sp.category, rsp.unit, sp.unit
        ORDER BY cost DESC LIMIT " . (int)$limit);
    $st->execute($wh['params']);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'item_code' => $r['item_code'],
            'item_name' => $r['item_name'],
            'category' => $r['category'],
            'unit' => $r['unit'],
            'qty' => (float)$r['qty'],
            'cost' => cost_money($r['cost']),
            'wo_count' => (int)$r['wo_count'],
        ];
    }
    return $out;
}

/** อะไหล่ที่ใช้ซ้ำข้ามใบงาน (>= 2 WO ในช่วง) — สัญญาณเสียซ้ำ / สต็อกชิ้นส่วนบ่อย */
function cost_repeat_parts(PDO $pdo, array $opts, int $limit = 10): array {
    $range = kpi_parse_range($opts);
    $flt = cost_parts_filter($pdo, $opts);
    $wh = cost_where($flt, $range);

    $st = $pdo->prepare("SELECT
        COALESCE(rsp.sage_item_code, sp.sage_item_no, sp.code, CONCAT('#', rsp.spare_part_id)) AS item_code,
        COALESCE(rsp.item_description, sp.name) AS item_name,
        COUNT(DISTINCT rsp.repair_id) AS wo_count,
        SUM(rsp.quantity_used) AS qty,
        SUM(rsp.quantity_used * rsp.unit_price) AS cost
        FROM repair_spare_parts rsp
        LEFT JOIN repair r ON r.id = rsp.repair_id
        LEFT JOIN spare_parts sp ON sp.id = rsp.spare_part_id
        LEFT JOIN asset_registry a2 ON a2.id = r.asset_id
        WHERE 1=1" . cost_parts_where($wh) . "
        GROUP BY rsp.sage_item_code, sp.sage_item_no, sp.code, rsp.spare_part_id, rsp.item_description, sp.name
        HAVING wo_count >= 2
        ORDER BY wo_count DESC, cost DESC LIMIT " . (int)$limit);
    $st->execute($wh['params']);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'item_code' => $r['item_code'],
            'item_name' => $r['item_name'],
            'wo_count' => (int)$r['wo_count'],
            'qty' => (float)$r['qty'],
            'cost' => cost_money($r['cost']),
        ];
    }
    return $out;
}

/** ต้นทุน PM/AM (เชิงป้องกัน) vs ต้นทุน Corrective — ตัดเฉพาะ maintenance_type */
function cost_pm(PDO $pdo, array $opts): array {
    $o = $opts;
    $o['maintenance_type'] = 'preventive';
    $prev = cost_summary($pdo, $o);
    $o2 = $opts;
    $o2['maintenance_type'] = 'corrective';
    $corr = cost_summary($pdo, $o2);
    $prevTotal = $prev['total'];
    $corrTotal = $corr['total'];
    return [
        'preventive' => $prev,
        'corrective' => $corr,
        'preventive_total' => cost_money($prevTotal),
        'corrective_total' => cost_money($corrTotal),
        'preventive_ratio' => ($prevTotal + $corrTotal) > 0 ? round($prevTotal / ($prevTotal + $corrTotal) * 100, 1) : null,
    ];
}

/** ต้นทุนงานเสีย (breakdown) — รวม cost + downtime + จำนวนครั้ง */
function cost_breakdown(PDO $pdo, array $opts): array {
    $o = $opts;
    $o['maintenance_type'] = 'corrective';
    $summary = cost_summary($pdo, $o);
    // ทุบเฉพาะแผงสาเหตุ: breakdown โดยตรง + urgency — ใช้ is_breakdown ตรง ๆ
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $isBreakdown = true;
    $flt['sql'] .= (strpos($flt['sql'], 'WHERE') === false ? ' WHERE r.is_breakdown = 1' : ' AND r.is_breakdown = 1');
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);
    $st = $pdo->prepare("SELECT
        COUNT(*) AS wo_count,
        SUM({$c['total']}) AS total,
        SUM(r.downtime_minutes) AS downtime_minutes
        FROM v_maintenance_cost r" . $wh['sql']);
    $st->execute($wh['params']);
    $a = $st->fetch(PDO::FETCH_ASSOC);
    return [
        'wo_count' => (int)($a['wo_count'] ?? 0),
        'total' => cost_money($a['total'] ?? 0),
        'downtime_minutes' => (float)($a['downtime_minutes'] ?? 0),
        'by_asset' => cost_breakdown_by_asset($pdo, $opts),
        'breakdown_flag' => $isBreakdown,
    ];
}

function cost_breakdown_by_asset(PDO $pdo, array $opts, int $limit = 10): array {
    $range = kpi_parse_range($opts);
    $flt = cost_filters($pdo, $opts);
    $flt['sql'] .= (strpos($flt['sql'], 'WHERE') === false ? ' WHERE r.is_breakdown = 1' : ' AND r.is_breakdown = 1');
    $wh = cost_where($flt, $range);
    $c = cost_comp_sql($pdo);
    $st = $pdo->prepare("SELECT
        r.asset_id AS aid, COALESCE(r.asset_code, '(ไม่ระบุเครื่อง)') AS acode, COALESCE(r.asset_name, '') AS aname,
        COUNT(*) AS wo_count,
        SUM({$c['total']}) AS total,
        SUM(r.downtime_minutes) AS downtime_minutes
        FROM v_maintenance_cost r" . $wh['sql'] . "
        GROUP BY r.asset_id, r.asset_code, r.asset_name ORDER BY total DESC LIMIT " . (int)$limit);
    $st->execute($wh['params']);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'asset_id' => $r['aid'] ? (int)$r['aid'] : null,
            'asset_code' => $r['acode'],
            'asset_name' => $r['aname'],
            'wo_count' => (int)$r['wo_count'],
            'total' => cost_money($r['total']),
            'downtime_minutes' => (float)$r['downtime_minutes'],
        ];
    }
    return $out;
}

/** ต้นทุนงานฉุกเฉิน (priority = high/critical) */
function cost_emergency(PDO $pdo, array $opts): array {
    $o = $opts;
    $o['priority'] = 'critical';
    $crit = cost_summary($pdo, $o);
    $o2 = $opts;
    $o2['priority'] = 'high';
    $high = cost_summary($pdo, $o2);
    $critTotal = $crit['total'];
    $highTotal = $high['total'];
    return [
        'critical' => $crit,
        'high' => $high,
        'critical_total' => cost_money($critTotal),
        'high_total' => cost_money($highTotal),
        'total' => cost_money($critTotal + $highTotal),
        'wo_count' => $crit['wo_count'] + $high['wo_count'],
    ];
}

/** พยากรณ์รายปี (YTD → คาดการณ์สิ้นปี) — ใช้ค่าน้อยของเดือนจริงเท่านั้น (ไม่เดาข้อมูล) */
function cost_forecast(PDO $pdo, array $opts, ?int $year = null): array {
    $cfg = cost_config($pdo);
    $year = $year ?: (int)date('Y');
    $today = (int)date('n');

    // YTD จากปีนั้น
    $monthly = cost_trend($pdo, ['range' => 'custom', 'range_start' => "$year-01-01", 'range_end' => "$year-12-31"] + $opts);
    $ytdTotal = 0.0;
    $monthlyByMonth = [];
    foreach ($monthly as $m) {
        $mm = (int)substr($m['month'], 5, 2);
        $monthlyByMonth[$mm] = $m;
        if ($mm <= $today) $ytdTotal += $m['total'];
    }
    $avgPerMonth = $today > 0 ? $ytdTotal / $today : 0.0;
    $fullYearProjection = $avgPerMonth * 12;

    return [
        'year' => $year,
        'month' => $today,
        'currency' => $cfg['currency_symbol'],
        'ytd_total' => cost_money($ytdTotal),
        'monthly_avg' => cost_money($avgPerMonth),
        'full_year_projection' => cost_money($fullYearProjection),
        'months_remaining' => 12 - $today,
        'projection_remaining' => cost_money($avgPerMonth * (12 - $today)),
        'monthly' => $monthly,
        'n_month_hint' => 'projection ใช้ข้อมูลจริงรายเดือนเท่านั้น — ชี้แจงในตัวเลข monthly_avg',
    ];
}

/** คุณภาพข้อมูลต้นทุน — คั​วช่องว่างที่ทำให้คอมโพเนนต์ Not Available */
function cost_data_quality(PDO $pdo, array $opts): array {
    $summary = cost_summary($pdo, $opts);
    $av = $summary['availability'];
    return [
        'currency' => $summary['currency'],
        'wo_count' => $summary['wo_count'],
        'warnings' => [
            [
                'component' => 'parts',
                'title' => 'อะไหล่ที่ใช้งานแล้วยังไม่มีราคา (snapshot)',
                'detail' => 'มี ' . $av['parts']['wos_missing_price'] . ' ใบงาน ที่ใช้ ' . $av['parts']['wos_with_parts'] . ' ใบงาน',
                'ok' => $av['parts']['available'],
            ],
            [
                'component' => 'labor',
                'title' => 'ค่าแรงถูกคำนวณจากเวลา × อัตราที่ตั้งค่าไว้ (standard_labor_rate)',
                'detail' => $av['labor']['available']
                    ? ($av['labor']['wos_from_recorded'] . ' ใบงานบันทึกค่าแรงตรง + ' . $av['labor']['wos_from_time'] . ' ใบงานคำนวณจากเวลา')
                    : 'ค่าแรงปิดใช้งานหรือยังไม่ได้ตั้งอัตรา — ' . implode(', ', $av['labor']['reason']),
                'ok' => $av['labor']['available'],
            ],
            [
                'component' => 'external',
                'title' => 'งานจ้างภายนอกที่ยังไม่ได้บันทึกค่าจ้าง',
                'detail' => 'มี ' . $av['external']['wos_missing_cost'] . ' ใบงาน ที่ระบุผู้รับจ้างแต่ยังไม่มีค่าใช้จ่าย',
                'ok' => $av['external']['available'],
            ],
            [
                'component' => 'other',
                'title' => 'ค่าใช้จ่ายอื่น (ค่าวัสดุสิ้นเปลือง, ค่าขนส่ง ...)',
                'detail' => 'ระบบยังไม่มีช่องบันทึกค่าใช้จ่ายอื่น — แสดงเป็น Not Available เสมอ',
                'ok' => false,
            ],
        ],
        'overall_ok' => $av['parts']['available'] && $av['labor']['available'] && $av['external']['available'],
    ];
}

/* ═══════════════════════ 4. BUDGET ═══════════════════════ */

const BUDGET_STATUSES = ['draft', 'submitted', 'active', 'closed', 'cancelled'];

function budget_effective(PDO $pdo, int $budgetId, float $allocated): float {
    $st = $pdo->prepare('SELECT COALESCE(SUM(adjustment_amount), 0) FROM budget_adjustment WHERE budget_id = ?');
    $st->execute([$budgetId]);
    return cost_money($allocated + (float)$st->fetchColumn());
}

/** คำนวณสถานะการใช้งบ — alert: NORMAL / WARNING / EXCEEDED / NO_BUDGET */
function budget_state(array $cfg, ?float $budget, float $actual): array {
    $budget = $budget !== null ? cost_money($budget) : null;
    $actual = cost_money($actual);
    if ($budget === null || $budget <= 0) {
        return [
            'budget' => 0.0, 'actual' => $actual, 'pct' => $actual > 0 ? null : 0.0,
            'remaining' => $actual > 0 ? cost_money(0 - $actual) : 0.0,
            'alert' => $actual > 0 ? 'EXCEEDED' : 'NO_BUDGET', 'label' => 'ไม่มีงบประมาณ',
        ];
    }
    $pct = $budget > 0 ? round($actual / $budget * 100, 1) : 0.0;
    $remaining = cost_money($budget - $actual);
    if ($pct >= $cfg['exceed_pct']) {
        $alert = 'EXCEEDED';
    } elseif ($pct >= $cfg['warning_pct']) {
        $alert = 'WARNING';
    } else {
        $alert = 'NORMAL';
    }
    return [
        'budget' => $budget,
        'actual' => $actual,
        'pct' => $pct,
        'remaining' => $remaining,
        'alert' => $alert,
        'label' => $alert === 'NORMAL' ? 'ปกติ' : ($alert === 'WARNING' ? 'ใกล้ถึงเกณฑ์' : 'เกินงบประมาณ'),
    ];
}

/** actual (ต้นทุนจริง) ของหนึ่งงบ (ปี/เดือน/แผนก) จาก view */
function budget_actual(PDO $pdo, int $year, int $month, ?int $deptId): float {
    $c = cost_comp_sql($pdo);
    $sql = "SELECT SUM({$c['total']}) FROM v_maintenance_cost r WHERE YEAR(r.created_at) = ? AND MONTH(r.created_at) = ?";
    $params = [$year, $month];
    if ($deptId !== null && $deptId > 0) {
        $sql .= ' AND r.department_id = ?';
        $params[] = $deptId;
    }
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return cost_money($st->fetchColumn() ?? 0);
}

/** รายการงบประมาณทั้งหมด + สถานะ (ใช้หน้า /budget) — บันทึก alert ผ่าน notify ถ้าข้ามเกณฑ์ */
function cost_budget_list(PDO $pdo, array $opts): array {
    $cfg = cost_config($pdo);
    $deptFilter = (int)($opts['department_id'] ?? 0);
    $yearFilter = (int)($opts['year'] ?? 0);

    $sql = "SELECT b.*, d.name AS department_name,
            (SELECT COALESCE(SUM(adjustment_amount), 0) FROM budget_adjustment ba WHERE ba.budget_id = b.id) AS adjustments
            FROM budget_plan b
            LEFT JOIN departments d ON d.id = b.department_id
            WHERE 1=1";
    $params = [];
    if ($yearFilter > 0) { $sql .= ' AND b.year = ?'; $params[] = $yearFilter; }
    if ($deptFilter > 0) { $sql .= ' AND b.department_id = ?'; $params[] = $deptFilter; }
    $sql .= ' ORDER BY b.year DESC, b.month ASC, b.department_id ASC';
    $st = $pdo->prepare($sql);
    $st->execute($params);

    $items = [];
    $alertCounter = ['NORMAL' => 0, 'WARNING' => 0, 'EXCEEDED' => 0, 'NO_BUDGET' => 0];
    $triggered = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $b) {
        $budgetId = (int)$b['id'];
        $allocated = (float)$b['allocated_budget'];
        $adjustments = (float)($b['adjustments'] ?? 0);
        $effective = cost_money($allocated + $adjustments);
        $deptId = $b['department_id'] ? (int)$b['department_id'] : null;
        $actual = budget_actual($pdo, (int)$b['year'], (int)$b['month'], $deptId);
        $state = budget_state($cfg, $effective, $actual);
        $alertCounter[$state['alert']]++;

        $items[] = [
            'id' => $budgetId,
            'year' => (int)$b['year'],
            'month' => (int)$b['month'],
            'month_name' => date('F Y', strtotime(sprintf('%04d-%02d-01', (int)$b['year'], (int)$b['month']))),
            'department_id' => $deptId,
            'department_name' => $deptId === null ? '(บริษัท)' : ($b['department_name'] ?? ''),
            'status' => $b['status'],
            'currency' => $b['currency'] ?? 'THB',
            'notes' => $b['notes'],
            'allocated_budget' => cost_money($allocated),
            'adjustments' => cost_money($adjustments),
            'effective_budget' => $effective,
            'actual' => $state['actual'],
            'utilization_pct' => $state['pct'],
            'remaining' => $state['remaining'],
            'alert' => $state['alert'],
            'alert_label' => $state['label'],
            'approved_by' => $b['approved_by'] ? (int)$b['approved_by'] : null,
            'approved_at' => $b['approved_at'],
        ];

        // แจ้งเตือนเมื่อข้ามเกณฑ์ (dedup 24 ชม. ใน NotificationCenterService)
        if (in_array($state['alert'], ['WARNING', 'EXCEEDED'], true)
            && $state['actual'] > 0
            && in_array($b['status'], ['active', 'submitted'], true)
            && $state['pct'] !== null) {
            $key = "budget:{$state['alert']}:" . $b['year'] . ':' . $b['month'] . ':' . ($deptId ?: 0);
            if (!in_array($key, $triggered, true)) {
                $triggered[] = $key;
                if (class_exists('NotificationCenterService')) {
                    NotificationCenterService::notify($pdo, [
                        'module' => 'budget',
                        'event' => $state['alert'] === 'WARNING' ? 'alert' : 'over',
                        'title' => $state['alert'] === 'WARNING' ? 'งบประมาณเดือน ' . $items[count($items) - 1]['month_name'] . ' ใกล้ถึงเกณฑ์แล้ว' : 'งบประมาณเดือน ' . $items[count($items) - 1]['month_name'] . ' เกินกำหนดแล้ว',
                        'message' => 'งบปี ' . (int)$b['year'] . ': ใช้ไป ' . number_format($state['actual']) . ' จาก ' . number_format($effective) . ' (' . $state['pct'] . '%)\nแผนก: ' . ($deptId === null ? '(บริษัท)' : ($b['department_name'] ?? '')),
                        'roles' => [1, 2, 6],
                        'channels' => ['app'],
                        'url' => '/budget',
                        'event_key' => $key,
                        'ref_type' => 'budget',
                        'ref_id' => $budgetId,
                        'source_user_id' => (int)($opts['user_id'] ?? 0),
                    ]);
                }
            }
        }
    }

    return [
        'currency' => $cfg['currency_symbol'],
        'items' => $items,
        'alerts' => [
            'counts' => $alertCounter,
            'has_warning' => $alertCounter['WARNING'] > 0,
            'has_exceeded' => $alertCounter['EXCEEDED'] > 0,
        ],
        'config' => ['warning_pct' => $cfg['warning_pct'], 'exceed_pct' => $cfg['exceed_pct']],
    ];
}

/** series งบ vs ใช้จริง รายเดือน (รวมทุกแผนกหรือ filter แผนก — ตาม budget_dept_filter_enabled) */
function cost_budget_vs_actual(PDO $pdo, array $opts): array {
    $cfg = cost_config($pdo);
    $years = [];
    $it = $pdo->query("SELECT DISTINCT year FROM budget_plan ORDER BY year ASC")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($it as $y) $years[] = (int)$y;
    $baseYear = $years ? $years[0] : (int)date('Y');
    $year = (int)($opts['year'] ?? max($years) ?: (int)date('Y'));
    if ($year < $baseYear) $year = $baseYear;

    $months = 1 <= (int)date('n') && (int)date('n') <= 12 ? 12 : 12;
    $deptFilter = (int)($opts['department_id'] ?? 0);

    $series = [];
    for ($m = 1; $m <= 12; $m++) {
        $budgetSum = 0.0;
        $adjSum = 0.0;
        $rows = $pdo->prepare("SELECT allocated_budget, (SELECT COALESCE(SUM(adjustment_amount),0) FROM budget_adjustment ba WHERE ba.budget_id = b.id) AS adj
                               FROM budget_plan b WHERE b.year = ? AND b.month = ? AND b.status IN ('active','submitted','closed')
                               " . ($deptFilter > 0 ? 'AND b.department_id = ?' : '') . "");
        $rp = [$year, $m];
        if ($deptFilter > 0) $rp[] = $deptFilter;
        $rows->execute($rp);
        $buckets = $rows->fetchAll(PDO::FETCH_ASSOC);
        foreach ($buckets as $r) {
            if ($deptFilter > 0) {
                $budgetSum += (float)$r['allocated_budget'];
                $adjSum += (float)$r['adj'];
            } else {
                $budgetSum += (float)$r['allocated_budget'];
                $adjSum += (float)$r['adj'];
            }
        }
        $effective = cost_money($budgetSum + $adjSum);
        $actual = budget_actual($pdo, $year, $m, $deptFilter > 0 ? $deptFilter : null);
        $state = budget_state($cfg, $effective, $actual);
        $series[] = [
            'month' => sprintf('%04d-%02d', $year, $m),
            'month_name' => date('M Y', strtotime(sprintf('%04d-%02d-01', $year, $m))),
            'budget' => $state['budget'],
            'actual' => $state['actual'],
            'utilization_pct' => $state['pct'],
            'alert' => $state['alert'],
            'remaining' => $state['remaining'],
        ];
    }

    return [
        'currency' => $cfg['currency_symbol'],
        'years' => $years,
        'year' => $year,
        'series' => $series,
        'config' => ['warning_pct' => $cfg['warning_pct'], 'exceed_pct' => $cfg['exceed_pct'], 'dept_filter_enabled' => $cfg['dept_filter_enabled']],
    ];
}

/* ── mutations (API เป็นผู้ enforce CSRF + requireRole + audit — ฟังก์ชันนี้ทำเป็น transaction เอง) ── */

function budget_find(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT b.*, d.name AS department_name FROM budget_plan b LEFT JOIN departments d ON d.id = b.department_id WHERE b.id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new DomainException('ไม่พบงบประมาณนี้');
    return $row;
}

function budget_create(PDO $pdo, array $in, int $uid): array {
    $year = (int)($in['year'] ?? 0);
    $month = (int)($in['month'] ?? 0);
    $allocated = (float)($in['allocated_budget'] ?? 0);
    $deptId = (int)($in['department_id'] ?? 0);
    $currency = trim((string)($in['currency'] ?? 'THB')) ?: 'THB';
    $notes = trim((string)($in['notes'] ?? ''));

    if ($year < 2000 || $year > 2100) throw new DomainException('ปีงบประมาณต้องอยู่ระหว่าง 2000-2100');
    if ($month < 1 || $month > 12) throw new DomainException('เดือนต้องอยู่ระหว่าง 1-12');
    if ($allocated < 0) throw new DomainException('งบประมาณต้องไม่ติดลบ');

    $dup = $pdo->prepare('SELECT id FROM budget_plan WHERE year = ? AND month = ? AND department_id = ?');
    $dup->execute([$year, $month, $deptId > 0 ? $deptId : null]);
    if ($dup->fetchColumn()) throw new DomainException('งบประมาณของเดือน/แผนกนี้มีอยู่แล้ว');

    $stmt = $pdo->prepare('INSERT INTO budget_plan (year, month, department_id, allocated_budget, currency, notes, status, created_by)
                           VALUES (?, ?, ?, ?, ?, ?, "draft", ?)');
    $stmt->execute([$year, $month, $deptId > 0 ? $deptId : null, $allocated, $currency, $notes !== '' ? mb_substr($notes, 0, 500) : null, $uid]);
    return ['id' => (int)$pdo->lastInsertId()];
}

function budget_update(PDO $pdo, array $in, int $uid): void {
    $id = (int)$in['id'];
    $row = budget_find($pdo, $id);
    if (!in_array($row['status'], ['draft', 'submitted'], true)) throw new DomainException('แก้ไขได้เฉพาะงบในสถานะ draft/submitted');

    $allocated = (float)($in['allocated_budget'] ?? (float)$row['allocated_budget']);
    if ($allocated < 0) throw new DomainException('งบประมาณต้องไม่ติดลบ');
    $notes = array_key_exists('notes', $in) ? trim((string)$in['notes']) : (string)$row['notes'];

    $pdo->prepare('UPDATE budget_plan SET allocated_budget = ?, notes = ? WHERE id = ?')
        ->execute([$allocated, $notes !== '' ? mb_substr($notes, 0, 500) : null, $id]);
}

function budget_submit(PDO $pdo, int $id, int $uid): void {
    $row = budget_find($pdo, $id);
    if ($row['status'] !== 'draft') throw new DomainException('ต้องเป็นสถานะ draft ก่อนส่งอนุมัติ');
    $pdo->prepare('UPDATE budget_plan SET status = "submitted", updated_at = NOW() WHERE id = ?')->execute([$id]);
}

function budget_approve(PDO $pdo, int $id, int $uid): void {
    $row = budget_find($pdo, $id);
    if (!in_array($row['status'], ['submitted', 'draft'], true)) throw new DomainException('ต้อส่งอนุมัติก่อน (สถานะ submitted)');
    $pdo->prepare('UPDATE budget_plan SET status = "active", approved_by = ?, approved_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$uid, $id]);
    NotificationCenterService::notify($pdo, [
        'module' => 'budget', 'event' => 'approved',
        'title' => 'งบประมาณเดือน ' . date('F Y', strtotime(sprintf('%04d-%02d-01', (int)$row['year'], (int)$row['month']))) . ' อนุมัติแล้ว',
        'message' => 'งบปี ' . (int)$row['year'] . ' แผนก: ' . ($row['department_id'] ? $row['department_name'] : '(บริษัท)'),
        'roles' => [1, 2, 6], 'channels' => ['app'],
        'url' => '/budget', 'ref_type' => 'budget', 'ref_id' => $id,
        'event_key' => 'budget:approved:' . $id, 'source_user_id' => $uid,
    ]);
}

function budget_adjust(PDO $pdo, array $in, int $uid): array {
    $id = (int)$in['id'];
    $row = budget_find($pdo, $id);
    if (!in_array($row['status'], ['active', 'submitted'], true)) throw new DomainException('ปรับงบได้เฉพาะงบที่ใช้งานอยู่/ส่งอนุมัติแล้ว');
    $amount = (float)($in['adjustment_amount'] ?? 0);
    $reason = trim((string)($in['reason'] ?? ''));
    if ($reason === '') throw new DomainException('ต้องระบุเหตุผลการปรับงบ');
    $pdo->prepare('INSERT INTO budget_adjustment (budget_id, adjustment_amount, reason, currency, created_by) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, $amount, mb_substr($reason, 0, 500), $row['currency'] ?: ($in['currency'] ?? 'THB'), $uid]);
    $effective = budget_effective($pdo, $id, (float)$row['allocated_budget']);
    return ['budget_id' => $id, 'effective_budget' => $effective];
}

function budget_close(PDO $pdo, int $id, int $uid): void {
    $row = budget_find($pdo, $id);
    if ($row['status'] !== 'active') throw new DomainException('ปิดงบได้เฉพาะงบที่ใช้งานอยู่');
    $pdo->prepare('UPDATE budget_plan SET status = "closed", updated_at = NOW() WHERE id = ?')->execute([$id]);
}

function budget_cancel(PDO $pdo, int $id, int $uid): void {
    $row = budget_find($pdo, $id);
    if (!in_array($row['status'], ['draft', 'submitted'], true)) throw new DomainException('ยกเลิกได้เฉพาะงบ draft/submitted');
    $pdo->prepare('UPDATE budget_plan SET status = "cancelled", updated_at = NOW() WHERE id = ?')->execute([$id]);
}