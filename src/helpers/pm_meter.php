<?php
/**
 * pm_meter.php — สถานะ CBM (Condition Based Maintenance) จากค่ามิเตอร์จริง
 *
 * ใช้ร่วมกันระหว่าง API (pm_plans.php) และหน้าจอ — ห้ามคัดลอก
 * ตรรกะจับคู่หน่วยมิเตอร์ (parameter/unit กับ meter_unit ของแผน) ไปไว้ที่อื่น
 *
 * แหล่งค่ามิเตอร์จริง (fallback เดิม): ตาราง asset_measurements
 * รองรับทะเบียนมิเตอร์ (เตรียมไว้): ถ้ามี schema/meter_id หลัง migration จะ prefer ข้อมูลจากทะเบียน
 * ส่วนที่ต้องรอ migration: asset_meters, asset_meter_readings, pm_am_plans.meter_id และการผูกทะเบียนจริง
 */

require_once __DIR__ . '/meter_register.php';

/** ค่ามิเตอร์ล่าสุดของเครื่อง ณ วันที่กำหนด (legacy: จับคู่ parameter/unit กับหน่วย) */
function pm_meter_reading_legacy(PDO $pdo, int $assetId, string $unit, ?string $untilDate = null): ?float
{
    $unit = trim($unit);
    if ($unit === '') return null;
    $sql = 'SELECT value_numeric FROM asset_measurements WHERE asset_id = ? AND (parameter = ? OR unit = ?)';
    $args = [$assetId, $unit, $unit];
    if ($untilDate !== null && $untilDate !== '') {
        $sql .= ' AND DATE(measured_at) <= DATE(?)';
        $args[] = $untilDate;
    }
    $sql .= ' ORDER BY measured_at DESC, id DESC LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $v = $st->fetchColumn();
    return ($v === false || $v === null || $v === '') ? null : (float)$v;
}

/**
 * ค่ามิเตอร์ล่าสุด: prefer ทะเบียน/reading table เมื่อมี meter_id และ schema พร้อม
 * มิฉะนั้น fallback การจับคู่ parameter/unit แบบเดิม (ทำงานร่วมกับข้อมูลเดิมได้)
 */
function pm_meter_reading(PDO $pdo, int $assetId, string $unit, ?string $untilDate = null, ?int $meterId = null): ?float
{
    if ($meterId) {
        $schema = meter_schema_state($pdo);
        if ($schema['readings_ready']) {
            $v = meter_latest_reading_registered($pdo, $meterId, $untilDate);
            if ($v !== null) return $v;
        }
        $meter = meter_find_registered($pdo, $meterId);
        if ($meter && !empty($meter['unit'])) {
            $v = pm_meter_reading_legacy($pdo, $assetId, (string)$meter['unit'], $untilDate);
            if ($v !== null) return $v;
        }
    }
    return pm_meter_reading_legacy($pdo, $assetId, $unit, $untilDate);
}

/**
 * baseline ของมิเตอร์ = ค่าที่บันทึกตอนปิดรอบล่าสุด (meter_reading)
 * ถ้ารอบนั้นไม่มีการบันทึกค่า ใช้ค่าวัดที่ใกล้ที่สุด ณ วันปิดรอบ
 */
function pm_meter_baseline(PDO $pdo, int $assetId, int $planId, string $unit, ?int $meterId = null): array
{
    $st = $pdo->prepare("SELECT id, last_done_date, completed_at, meter_reading FROM pm_am
                         WHERE plan_id = ? AND asset_id = ? AND status = 'completed'
                         ORDER BY COALESCE(last_done_date, DATE(completed_at)) DESC, id DESC LIMIT 1");
    $st->execute([$assetId, $planId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) return ['value' => null, 'source' => 'none', 'since' => null];

    $since = $row['last_done_date'] ?: ($row['completed_at'] ? substr((string)$row['completed_at'], 0, 10) : null);
    if ($row['meter_reading'] !== null && $row['meter_reading'] !== '') {
        return ['value' => (float)$row['meter_reading'], 'source' => 'pm_record', 'since' => $since];
    }
    $m = pm_meter_reading($pdo, $assetId, $unit, $since, $meterId);
    if ($m !== null) return ['value' => $m, 'source' => 'measurement', 'since' => $since];
    return ['value' => null, 'source' => 'none', 'since' => $since];
}

function pm_meter_row(PDO $pdo, int $assetId, array $plan): array
{
    $planId = (int)$plan['id'];
    $unit = trim((string)($plan['meter_unit'] ?? ''));
    $interval = (float)($plan['meter_interval'] ?? 0);
    $meterId = isset($plan['meter_id']) && $plan['meter_id'] !== null && $plan['meter_id'] !== '' ? (int)$plan['meter_id'] : null;

    $meter = null;
    $schema = meter_schema_state($pdo);
    if ($meterId && $schema['register_ready']) {
        $meter = meter_find_registered($pdo, $meterId);
        if ($meter && $unit === '' && !empty($meter['unit'])) $unit = (string)$meter['unit'];
    }

    $current = pm_meter_reading($pdo, $assetId, $unit, null, $meterId);
    $base = pm_meter_baseline($pdo, $assetId, $planId, $unit, $meterId);
    $baseline = $base['value'];
    $target = $baseline !== null ? $baseline + $interval : null;
    $used = ($current !== null && $baseline !== null) ? max(0.0, $current - $baseline) : null;
    $remaining = ($current !== null && $target !== null) ? max(0.0, $target - $current) : null;
    $pct = ($used !== null && $interval > 0) ? round(min(100.0, 100 * $used / $interval), 1) : null;

    if ($current === null) $status = 'no_reading';
    elseif ($baseline === null) $status = 'no_baseline';
    elseif ($target !== null && $current >= $target) $status = 'due';
    elseif ($pct !== null && $pct >= 90) $status = 'near';
    else $status = 'ok';

    $openSt = $pdo->prepare("SELECT id, status, due_date FROM pm_am
                             WHERE plan_id = ? AND asset_id = ?
                               AND status IN ('pending','in_progress','overdue')
                             ORDER BY due_date ASC, id ASC LIMIT 1");
    $openSt->execute([$planId, $assetId]);
    $open = $openSt->fetch(PDO::FETCH_ASSOC) ?: null;

    $out = [
        'plan_id' => $planId,
        'plan_code' => $plan['code'] ?? null,
        'plan_name' => $plan['name'] ?? null,
        'meter_unit' => $unit,
        'meter_interval' => $interval,
        'status' => $status,
        'current' => $current,
        'baseline' => $baseline,
        'baseline_source' => $base['source'],
        'baseline_since' => $base['since'],
        'target' => $target,
        'used' => $used,
        'remaining' => $remaining,
        'used_pct' => $pct,
        'open_pm_id' => $open ? (int)$open['id'] : null,
        'open_pm_status' => $open['status'] ?? null,
        'open_pm_due_date' => $open['due_date'] ?? null,
    ];
    return meter_attach_info_to_cbm_row($out, $meter);
}

function pm_meter_summary_seed(): array
{
    return ['pairs' => 0, 'due' => 0, 'near' => 0, 'ok' => 0, 'no_reading' => 0, 'no_baseline' => 0];
}

function pm_meter_asset_status(PDO $pdo, int $assetId): array
{
    $schema = meter_schema_state($pdo);
    $meterSelect = $schema['plan_meter_id'] ? ', p.meter_id' : ', NULL AS meter_id';
    $st = $pdo->prepare("SELECT p.id, p.code, p.name, p.meter_unit, p.meter_interval{$meterSelect}
                         FROM pm_am_plans p
                         JOIN pm_am_plan_assets pa ON pa.plan_id = p.id
                         WHERE pa.asset_id = ?
                           AND p.frequency_type = 'meter_based'
                           AND ((p.meter_unit IS NOT NULL AND p.meter_unit <> '') OR " . ($schema['plan_meter_id'] ? "p.meter_id IS NOT NULL" : "0") . ")
                           AND p.meter_interval IS NOT NULL AND p.meter_interval > 0
                           AND COALESCE(p.is_active, 1) = 1
                           AND COALESCE(p.status, 'active') <> 'cancelled'
                         ORDER BY p.code ASC");
    $st->execute([$assetId]);

    $items = [];
    $summary = pm_meter_summary_seed();
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $row = pm_meter_row($pdo, $assetId, $p);
        $items[] = $row;
        $summary['pairs']++;
        if (isset($summary[$row['status']])) $summary[$row['status']]++;
    }

    return ['asset_id' => $assetId, 'items' => $items, 'summary' => $summary];
}

function pm_meter_plant_status(PDO $pdo, array $opts = []): array
{
    $only = (string)($opts['only'] ?? 'all');
    if (!in_array($only, ['all', 'due', 'near', 'actionable'], true)) $only = 'all';
    $schema = meter_schema_state($pdo);
    $meterSelect = $schema['plan_meter_id'] ? ', p.meter_id' : ', NULL AS meter_id';

    $st = $pdo->prepare("SELECT p.id, p.code, p.name, p.meter_unit, p.meter_interval{$meterSelect},
                                a.id AS asset_id, a.code AS asset_code, a.name AS asset_name
                         FROM pm_am_plans p
                         JOIN pm_am_plan_assets pa ON pa.plan_id = p.id
                         JOIN asset_registry a ON a.id = pa.asset_id
                         WHERE p.frequency_type = 'meter_based'
                           AND ((p.meter_unit IS NOT NULL AND p.meter_unit <> '') OR " . ($schema['plan_meter_id'] ? "p.meter_id IS NOT NULL" : "0") . ")
                           AND p.meter_interval IS NOT NULL AND p.meter_interval > 0
                           AND COALESCE(p.is_active, 1) = 1
                           AND COALESCE(p.status, 'active') <> 'cancelled'
                           AND COALESCE(a.status, 'active') <> 'disposed'
                         ORDER BY a.code ASC, p.code ASC");
    $st->execute();

    $rows = [];
    $summary = pm_meter_summary_seed();
    $max = min(500, max(1, (int)($opts['limit'] ?? 500)));
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $row = pm_meter_row($pdo, (int)$p['asset_id'], $p);
        $row['asset_id'] = (int)$p['asset_id'];
        $row['asset_code'] = $p['asset_code'];
        $row['asset_name'] = $p['asset_name'];

        $summary['pairs']++;
        if (isset($summary[$row['status']])) $summary[$row['status']]++;

        if ($only === 'due' && $row['status'] !== 'due') continue;
        if ($only === 'near' && $row['status'] !== 'near') continue;
        if ($only === 'actionable' && !in_array($row['status'], ['due', 'near'], true)) continue;

        if (count($rows) < $max) $rows[] = $row;
    }

    $rank = ['due' => 0, 'near' => 1, 'ok' => 2, 'no_baseline' => 3, 'no_reading' => 4];
    usort($rows, function ($a, $b) use ($rank) {
        $ra = $rank[$a['status']] ?? 9;
        $rb = $rank[$b['status']] ?? 9;
        if ($ra !== $rb) return $ra <=> $rb;
        return strcmp((string)$a['asset_code'], (string)$b['asset_code']);
    });

    return ['items' => $rows, 'summary' => $summary, 'counts' => count($rows)];
}
