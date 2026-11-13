<?php
/**
 * pm_meter.php — สถานะ CBM (Condition Based Maintenance) จากค่ามิเตอร์จริง
 *
 * ใช้ร่วมกันระหว่าง API (pm_plans.php) และหน้าจอเครื่องจักร — ห้ามคัดลอก
 * ตรรกะจับคู่หน่วยมิเตอร์ (parameter/unit กับ meter_unit ของแผน) ไปไว้ที่อื่น
 *
 * แหล่งค่ามิเตอร์จริง: ตาราง asset_measurements
 * เป้าหมายของรอบ: baseline (ค่าตอนปิดรอบล่าสุด) + meter_interval ของแผน
 */

/** ค่ามิเตอร์ล่าสุดของเครื่อง ณ วันที่กำหนด (null = ล่าสุดเสมอ) */
function pm_meter_reading(PDO $pdo, int $assetId, string $unit, ?string $untilDate = null): ?float
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
 * baseline ของมิเตอร์ = ค่าที่บันทึกตอนปิดรอบล่าสุด (meter_reading)
 * ถ้ารอบนั้นไม่มีการบันทึกค่า ใช้ค่าวัดที่ใกล้ที่สุด ณ วันปิดรอบ
 *
 * @return array{value: ?float, source: string, since: ?string}
 */
function pm_meter_baseline(PDO $pdo, int $assetId, int $planId, string $unit): array
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
    $m = pm_meter_reading($pdo, $assetId, $unit, $since);
    if ($m !== null) return ['value' => $m, 'source' => 'measurement', 'since' => $since];
    return ['value' => null, 'source' => 'none', 'since' => $since];
}

/**
 * สถานะ CBM ของเครื่องหนึ่งเครื่อง — หนึ่งแถวต่อหนึ่งแผน PM ตามมิเตอร์ที่ใช้งานอยู่
 *
 * status: due (ถึงเป้าหมายแล้ว) | near (ใช้ไป ≥ 90% ของรอบ) | ok |
 *         no_reading (ยังไม่มีค่าวัด) | no_baseline (ยังไม่เคยปิดรอบจึงไม่มีจุดเริ่ม)
 */
function pm_meter_asset_status(PDO $pdo, int $assetId): array
{
    $st = $pdo->prepare("SELECT p.id, p.code, p.name, p.meter_unit, p.meter_interval
                         FROM pm_am_plans p
                         JOIN pm_am_plan_assets pa ON pa.plan_id = p.id
                         WHERE pa.asset_id = ?
                           AND p.frequency_type = 'meter_based'
                           AND p.meter_unit IS NOT NULL AND p.meter_unit <> ''
                           AND p.meter_interval IS NOT NULL AND p.meter_interval > 0
                           AND COALESCE(p.is_active, 1) = 1
                           AND COALESCE(p.status, 'active') <> 'cancelled'
                         ORDER BY p.code ASC");
    $st->execute([$assetId]);

    $items = [];
    $summary = ['plans' => 0, 'due' => 0, 'near' => 0, 'ok' => 0, 'no_reading' => 0, 'no_baseline' => 0];

    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $planId = (int)$p['id'];
        $unit = trim((string)$p['meter_unit']);
        $interval = (float)$p['meter_interval'];

        $current = pm_meter_reading($pdo, $assetId, $unit);
        $base = pm_meter_baseline($pdo, $assetId, $planId, $unit);
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

        $items[] = [
            'plan_id' => $planId,
            'plan_code' => $p['code'],
            'plan_name' => $p['name'],
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

        $summary['plans']++;
        if (isset($summary[$status])) $summary[$status]++;
    }

    return ['asset_id' => $assetId, 'items' => $items, 'summary' => $summary];
}
