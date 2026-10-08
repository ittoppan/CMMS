<?php
/**
 * src/helpers/iot_condition.php - Phase 36 condition: snapshots, rollups, trends,
 * retention, readings query and the device overview.
 *
 * WHY THERE IS NO CONDITION SCORE
 *
 * A single number between 0 and 100 for "machine health" is the most requested and least
 * defensible thing in this domain. Computing it requires weighting signals against each
 * other, and that weighting is always a judgement call dressed as a measurement. The
 * alternatives below are honest about what produced them:
 *
 *   completeness      how much of the expected data actually arrived
 *   freshness         how far behind the newest reading is, against the declared interval
 *   worst_severity    the highest alarm severity currently open (a real recorded fact)
 *   indicators        itemised, per-signal explanations a technician can act on
 *   cmms_signal       the existing manual asset_measurements picture, clearly labelled as
 *                     manual so it is never mistaken for telemetry
 *
 * Nothing here predicts failure, estimates remaining life, or claims to know a machine is
 * healthy. If the data cannot support a statement, the statement is UNAVAILABLE with a
 * reason, not a plausible number.
 *
 * Manual condition measurements stay manual. This module reads them for context and never
 * writes an asset_measurements row, so two sources of truth cannot silently merge.
 */

declare(strict_types=1);

/* ============================================================
 * ROLLUPS  (mean/min/max per bucket - aggregates, never substituted for raw data)
 * ============================================================ */

function iot_rollup_bucket_set(): array {
    return [
        'minute_1' => ['minutes' => 1,   'retention_days' => 7],
        'minute_5' => ['minutes' => 5,   'retention_days' => 30],
        'hourly'   => ['minutes' => 60,  'retention_days' => 365],
        'daily'    => ['minutes' => 1440, 'retention_days' => 1095],
    ];
}

/**
 * Aggregate raw readings into buckets. A bucket is only written when it holds VALID data,
 * so gaps stay gaps and the chart shows the outage instead of bridging over it.
 *
 * AVG/COUNT over the bucket is a SUMMARY of a window, not a measurement: the raw rows
 * remain the authority, and retention will not delete a raw row whose rollup does not
 * exist yet.
 */
/**
 * Fold raw readings into one aggregate row per (point, bucket size, bucket start).
 *
 * Pure: no DB, no clock. The input order does NOT matter, which is the point - readings are
 * fetched by id but must be ordered by received_at, otherwise a backfilled out-of-order sample
 * becomes "last". last_ts is the newest SAMPLE in the bucket; last_value is the value of the
 * newest VALID sample, because an invalid sample carries no value to report.
 *
 * Returns buckets keyed by "point|size|start", each with values[] plus the counts the
 * caller writes. A bucket with no VALID sample is still returned so the caller can count it
 * as skipped rather than silently dropping it.
 */
function iot_rollup_group_rows(array $rows, array $buckets): array {
    $groups = [];
    foreach ($rows as $r) {
        $ts = strtotime((string)($r['received_at'] ?? ''));
        if ($ts === false) {
            continue;
        }
        $ts        = (int)$ts;
        $pointId   = (int)($r['point_id'] ?? 0);
        $isValid   = ((string)($r['quality'] ?? '') === 'VALID' && ($r['value_num'] ?? null) !== null);
        $value     = $isValid ? (float)$r['value_num'] : null;

        foreach ($buckets as $name => $b) {
            $sec   = max(1, ((int)$b['minutes']) * 60);
            $start = date('Y-m-d H:i:s', (int)(floor($ts / $sec) * $sec));
            $key   = $pointId . '|' . $name . '|' . $start;

            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'point_id' => $pointId, 'asset_id' => (int)($r['asset_id'] ?? 0),
                    'size'     => $name, 'start' => $start,
                    'values'   => [], 'invalid' => 0,
                    'last_ts'  => null, 'last_value' => null, 'last_epoch' => null,
                ];
            }
            if ($isValid) {
                $groups[$key]['values'][] = $value;
            } else {
                $groups[$key]['invalid']++;
            }
            if ($groups[$key]['last_epoch'] === null || $ts >= $groups[$key]['last_epoch']) {
                $groups[$key]['last_epoch'] = $ts;
                $groups[$key]['last_ts']    = (string)$r['received_at'];
                if ($isValid) {
                    $groups[$key]['last_value'] = $value;
                }
            }
        }
    }
    return $groups;
}

function iot_rollup_compute(PDO $pdo, ?int $pointId = null, int $sinceMinutes = 1440): array {
    $cfg = iot_config($pdo);
    if (!$cfg['iot_rollup_enabled']) {
        return ['enabled' => false, 'written' => 0, 'note' => 'การคำนวณ rollup ปิดใช้งานอยู่'];
    }
    $buckets = iot_rollup_bucket_set();
    $since   = max(60, min(60 * 24 * 90, $sinceMinutes));

    $sql = 'SELECT r.id, r.point_id, r.device_id, r.asset_id, r.value_num, r.quality, r.received_at
            FROM iot_readings r
            WHERE r.received_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)';
    $args = [$since];
    if ($pointId !== null) {
        $sql .= ' AND r.point_id = ?';
        $args[] = $pointId;
    }
    $sql .= ' ORDER BY r.id ASC LIMIT 200000';
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $written = 0;
    $skippedInvalid = 0;
    try {
        // Recompute each touched bucket from scratch. A one-sample-per-row upsert would
        // make avg_value equal to the last value seen, which is simply wrong.
        $ins = $pdo->prepare('INSERT INTO iot_rollups (point_id, asset_id, bucket_size, bucket_start,
                              sample_count, valid_count, invalid_count, min_value, max_value,
                              avg_value, sum_value, `last_value`, last_ts)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                              ON DUPLICATE KEY UPDATE sample_count = VALUES(sample_count),
                                valid_count = VALUES(valid_count), invalid_count = VALUES(invalid_count),
                                min_value = VALUES(min_value), max_value = VALUES(max_value),
                                avg_value = VALUES(avg_value), sum_value = VALUES(sum_value),
                                `last_value` = VALUES(`last_value`), last_ts = VALUES(last_ts)');

        $groups = iot_rollup_group_rows($rows, $buckets);

        foreach ($groups as $g) {
            $vals = $g['values'];
            $n    = count($vals);
            if ($n === 0) {
                // A bucket containing only invalid samples gets no numeric aggregate.
                // Writing zeros here would invent data.
                $skippedInvalid++;
                continue;
            }
            $sum = array_sum($vals);
            $ins->execute([
                $g['point_id'], $g['asset_id'], $g['size'], $g['start'],
                $n, $n, $g['invalid'],
                min($vals), max($vals), round($sum / $n, 6), round($sum, 6),
                $g['last_value'], $g['last_ts'],
            ]);
            $written++;
        }
    } catch (Throwable $e) {
        error_log('[iot] rollup_compute failed: ' . $e->getMessage());
        return ['enabled' => true, 'written' => $written, 'error' => 'ROLLUP_FAILED',
                'message' => $e->getMessage()];
    }
    return ['enabled' => true, 'written' => $written, 'buckets_scanned' => count($groups ?? []),
            'invalid_only_buckets_skipped' => $skippedInvalid,
            'note' => 'ค่าเฉลี่ย/ต่ำสุด/สูงสุดเป็นค่าสรุปของช่วงเวลา ไม่ได้แทนค่าดิบ และช่วงที่ไม่มีค่าที่ใช้ได้จะไม่ถูกเติม'];
}

/**
 * Time series for a chart. Rolls up for long windows so the response stays small, and
 * reports which resolution it actually used instead of silently downsampling.
 */
function iot_point_series(PDO $pdo, int $pointId, string $from, string $to, ?string $bucket = null): array {
    $pFrom = strtotime($from) ?: (time() - 86400);
    $pTo   = strtotime($to) ?: time();
    if ($pFrom >= $pTo) {
        return iot_err('VALIDATION', 'ช่วงเวลาไม่ถูกต้อง');
    }
    $spanSec = $pTo - $pFrom;

    $point = iot_point_get($pdo, $pointId);
    if (!empty($point['error'])) {
        return $point;
    }

    $buckets = iot_rollup_bucket_set();
    if ($bucket !== null && !array_key_exists($bucket, $buckets)) {
        return iot_err('VALIDATION', 'ไม่รู้จักขนาดช่วงเวลานี้', ['allowed' => array_keys($buckets)]);
    }
    if ($bucket === null) {
        // Pick a resolution from the span rather than truncating silently.
        $bucket = $spanSec > 30 * 86400 ? 'daily'
                : ($spanSec > 3 * 86400 ? 'hourly'
                : ($spanSec > 3600 ? 'minute_5'
                : ($spanSec > 300 ? 'minute_1' : null)));
    }

    $from = date('Y-m-d H:i:s', $pFrom);
    $to   = date('Y-m-d H:i:s', $pTo);

    if ($bucket === null) {
        $st = $pdo->prepare('SELECT received_at, value_num FROM iot_readings
                             WHERE point_id = ? AND quality = "VALID" AND value_num IS NOT NULL
                               AND received_at >= ? AND received_at <= ?
                             ORDER BY received_at ASC LIMIT 5000');
        $st->execute([$pointId, $from, $to]);
        $pts = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $pts[] = ['t' => $r['received_at'], 'v' => (float)$r['value_num']];
        }
        $res = ['resolution' => 'raw', 'bucket' => null, 'points' => $pts];
    } else {
        $sec = $buckets[$bucket]['minutes'] * 60;
        $st = $pdo->prepare('SELECT bucket_start, avg_value, min_value, max_value, sample_count
                             FROM iot_rollups
                             WHERE point_id = ? AND bucket_size = ? AND bucket_start >= ? AND bucket_start <= ?
                             ORDER BY bucket_start ASC LIMIT 5000');
        $st->execute([$pointId, $bucket, $from, $to]);
        $pts = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $pts[] = ['t' => $r['bucket_start'],
                      'v' => $r['avg_value'] !== null ? (float)$r['avg_value'] : null,
                      'min' => $r['min_value'] !== null ? (float)$r['min_value'] : null,
                      'max' => $r['max_value'] !== null ? (float)$r['max_value'] : null,
                      'n'   => (int)$r['sample_count']];
        }
        $res = ['resolution' => 'rollup', 'bucket' => $bucket, 'points' => $pts];
    }

    // Gaps are reported, not bridged. A chart that draws a straight line across an outage
    // claims the machine was fine, which is exactly the wrong thing to imply.
    $gaps = [];
    $expected = $bucket === null ? max(60, (int)($point['sample_interval_sec'] ?? 60)) : $sec;
    for ($i = 1; $i < count($res['points']); $i++) {
        $a = strtotime((string)$res['points'][$i - 1]['t']);
        $b = strtotime((string)$res['points'][$i]['t']);
        if ($a !== false && $b !== false && ($b - $a) > $expected * 3) {
            $gaps[] = ['from' => $res['points'][$i - 1]['t'], 'to' => $res['points'][$i]['t'],
                       'seconds' => $b - $a];
        }
    }
    $res['count']     = count($res['points']);
    $res['point']     = [
        'id' => $pointId, 'point_code' => $point['point_code'], 'name' => $point['name'],
        'unit' => $point['engineering_unit'], 'signal_type' => $point['signal_type'],
        'freshness' => $point['freshness'], 'freshness_note' => $point['freshness_note'],
    ];
    $res['gaps']      = $gaps;
    $res['gap_note']  = count($gaps) > 0
        ? 'มีช่วงที่ไม่มีข้อมูล ' . count($gaps) . ' ช่วง — ไม่ได้เติมค่าให้'
        : 'ไม่พบช่วงข้อมูลขาดหายในช่วงที่ขอ';
    $res['no_data']   = count($res['points']) === 0;
    $res['from']      = $from;
    $res['to']        = $to;
    $res['interval_expect_sec'] = $expected;
    return $res;
}

/* ============================================================
 * CONDITION SNAPSHOT
 *
 * A snapshot is a dated, itemised record. It deliberately carries no score column, and
 * the column list below is enforced here so a future field cannot quietly introduce one.
 * ============================================================ */

/**
 * @return array snapshot row, or an explicit UNAVAILABLE with a reason.
 */
function iot_condition_snapshot(PDO $pdo, int $assetId): array {
    $cfg = iot_config($pdo);
    $ar = $pdo->prepare('SELECT id, code, name FROM asset_registry WHERE id = ?');
    $ar->execute([$assetId]);
    $asset = $ar->fetch(PDO::FETCH_ASSOC);
    if (!$asset) {
        return iot_err('NOT_FOUND', 'ไม่พบเครื่องจักร');
    }

    $points = $pdo->prepare('SELECT p.id, p.point_code, p.name, p.signal_type, p.engineering_unit,
                                    p.sample_interval_sec, p.stale_after_sec, p.is_alarm_capable,
                                    d.id AS device_id, d.device_code, d.lifecycle_status
                             FROM iot_points p JOIN iot_devices d ON d.id = p.device_id
                             WHERE d.asset_id = ? AND p.enabled = 1');
    $points->execute([$assetId]);
    $pointRows = $points->fetchAll(PDO::FETCH_ASSOC);

    $expectedPoints = count($pointRows);
    $indicators = [];
    $validPoints  = 0;
    $freshPoints  = 0;
    $stalePoints  = 0;
    $invalidPoints = 0;
    $noDataPoints = 0;
    $worstSeverity = null;
    $alarmCounts = ['critical' => 0, 'warning' => 0];

    foreach ($pointRows as $p) {
        $pid = (int)$p['id'];
        $last = $pdo->prepare('SELECT value_num, value_text, value_bool, quality, quality_reason,
                                      source_ts, received_at
                               FROM iot_readings WHERE point_id = ?
                               ORDER BY received_at DESC, id DESC LIMIT 1');
        $last->execute([$pid]);
        $r = $last->fetch(PDO::FETCH_ASSOC);

        $dec = iot_point_decorate($pdo, $p + ['id' => $pid]);
        $state = 'no_data';
        $text  = null;
        $value = null;
        if ($r !== null) {
            $value = $r['value_num'] !== null ? (float)$r['value_num']
                   : ($r['value_bool'] !== null ? (bool)$r['value_bool'] : (string)($r['value_text'] ?? ''));
            $text  = $r['value_num'] !== null
                ? rtrim(rtrim(number_format((float)$r['value_num'], (int)$p['decimals'] ?? 2, '.', ''), '0'), '.')
                  . ' ' . (string)$p['engineering_unit']
                : (string)($r['value_text'] ?? ($r['value_bool'] !== null ? ($r['value_bool'] ? '1' : '0') : ''));
            $state = (string)$dec['freshness'];
            if ((string)$r['quality'] !== 'VALID') {
                $invalidPoints++;
            } else {
                $validPoints++;
            }
        } else {
            $noDataPoints++;
        }
        if ($state === 'fresh' || $state === 'ageing') {
            $freshPoints++;
        } elseif ($state === 'stale') {
            $stalePoints++;
        }

        $al = $pdo->prepare('SELECT severity, COUNT(*) AS n FROM iot_alarms
                             WHERE point_id = ? AND status NOT IN ("closed","resolved")
                             GROUP BY severity');
        $al->execute([$pid]);
        $pAlarms = ['warning' => 0, 'critical' => 0];
        foreach ($al->fetchAll(PDO::FETCH_ASSOC) as $a) {
            $pAlarms[(string)$a['severity']] = (int)$a['n'];
            $alarmCounts[(string)$a['severity']] += (int)$a['n'];
            if ((string)$a['severity'] === 'critical' || $worstSeverity === null) {
                if ((string)$a['severity'] === 'critical') {
                    $worstSeverity = 'critical';
                } elseif ($worstSeverity !== 'critical') {
                    $worstSeverity = 'warning';
                }
            }
        }

        $indicators[] = [
            'point_id'       => $pid,
            'point_code'     => $p['point_code'],
            'name'           => $p['name'],
            'signal_type'    => $p['signal_type'],
            'unit'           => $p['engineering_unit'],
            'value'          => $value,
            'display'        => $text,
            'state'          => $state,
            'state_label'    => iot_freshness_label((string)$state),
            'explanation'    => $dec['freshness_note'],
            'quality'        => $r !== null ? (string)$r['quality'] : null,
            'quality_reason' => $r !== null ? ($r['quality_reason'] ?: null) : null,
            'last_reading_at'=> $r !== null ? (string)$r['received_at'] : null,
            'source_ts'      => $r !== null ? $r['source_ts'] : null,
            'age_sec'        => $dec['latest_age_sec'],
            'open_alarms'    => $pAlarms,
        ];
    }

    $need = max(1, $cfg['iot_condition_min_points']);
    $complete = $expectedPoints >= $need;

    $manual = iot_manual_condition_context($pdo, $assetId);

    // The gate: too little trusted data and the engine says so instead of summarising.
    $available = $complete && $validPoints >= $need;

    $summary = $available
        ? sprintf('มีข้อมูลที่เชื่อถือได้ %d/%d จุดวัด%s', $validPoints, $expectedPoints,
                  $worstSeverity === 'critical' ? ' มีแจ้งเตือนระดับวิกฤต'
                  : ($worstSeverity === 'warning' ? ' มีแจ้งเตือนระดับเตือน' : ' ยังไม่มีแจ้งเตือน'))
        : sprintf('ข้อมูลไม่พอสรุปสภาพ (ต้องการอย่างน้อย %d จุดวัดที่มีค่าใช้งานได้ มี %d จุดวัดที่ตั้งไว้ มีค่าใช้งานได้ %d)',
                  $need, $expectedPoints, $validPoints);

    return [
        'asset_id'          => $assetId,
        'asset_code'        => $asset['code'],
        'asset_name'        => $asset['name'],
        'captured_at'       => iot_now(),
        'available'         => $available,
        'summary'           => $summary,
        'expected_points'   => $expectedPoints,
        'valid_points'      => $validPoints,
        'fresh_points'      => $freshPoints,
        'stale_points'      => $stalePoints,
        'invalid_points'    => $invalidPoints,
        'no_data_points'    => $noDataPoints,
        // Percentage, matching the DECIMAL(5,2) column, not a 0-1 fraction.
        'data_completeness' => $expectedPoints > 0
            ? round(($validPoints / $expectedPoints) * 100, 2) : null,
        'worst_severity'    => $worstSeverity ?? 'unknown',
        'alarm_counts'      => $alarmCounts,
        'active_alarm_count'=> $alarmCounts['critical'] + $alarmCounts['warning'],
        'indicators'        => $indicators,
        'manual_context'    => $manual,
        'no_score_reason'   => 'ระบบไม่คำนวณคะแนนสภาพรวม (0-100) เพราะต้องการการชั่งน้ำหนักระหว่างสัญญาณซึ่งเป็นดุลยพินิจ ไม่ใช่ค่าที่วัดได้ — ใช้รายการด้านล่างแทน',
    ];
}

/**
 * Persist the snapshot so there is a dated history rather than only a live view.
 * Best effort: a snapshot failure must not break the condition read the UI is waiting on.
 */
function iot_condition_snapshot_store(PDO $pdo, array $s, ?int $uid = null): int {
    try {
        $pdo->prepare('INSERT INTO asset_condition_snapshots
            (asset_id, snapshot_at, window_minutes, point_count, valid_point_count, fresh_point_count,
             stale_point_count, missing_point_count, invalid_point_count, worst_severity,
             active_alarm_count, warning_alarm_count, critical_alarm_count, data_completeness,
             indicators_json, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                (int)$s['asset_id'],
                date('Y-m-d H:i:s', strtotime((string)$s['captured_at'])),
                60,
                (int)$s['expected_points'],
                (int)$s['valid_points'],
                (int)$s['fresh_points'],
                (int)$s['stale_points'],
                (int)$s['no_data_points'],
                (int)$s['invalid_points'],
                (string)($s['worst_severity'] ?? 'unknown'),
                (int)$s['active_alarm_count'],
                (int)$s['alarm_counts']['warning'],
                (int)$s['alarm_counts']['critical'],
                $s['data_completeness'],
                json_encode($s['indicators'], JSON_UNESCAPED_UNICODE),
                mb_substr((string)$s['summary'], 0, 500),
                $uid,
            ]);
        return (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[iot] snapshot store failed: ' . $e->getMessage());
        return 0;
    }
}

function iot_condition_history(PDO $pdo, int $assetId, int $limit = 50): array {
    $st = $pdo->prepare('SELECT id, snapshot_at, point_count, valid_point_count, fresh_point_count,
                                stale_point_count, missing_point_count, invalid_point_count,
                                worst_severity, active_alarm_count, warning_alarm_count,
                                critical_alarm_count, data_completeness, note
                         FROM asset_condition_snapshots WHERE asset_id = ?
                         ORDER BY snapshot_at DESC LIMIT ?');
    $st->execute([$assetId, max(1, min(500, $limit))]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/** Existing manual condition, clearly labelled so it is never read as telemetry. */
function iot_manual_condition_context(PDO $pdo, int $assetId): array {
    try {
        $st = $pdo->prepare('SELECT m.*, mp.name AS param_name, mp.unit, mp.category
                             FROM asset_measurements m
                             LEFT JOIN measurement_params mp ON mp.id = m.param_id
                             WHERE m.asset_id = ? ORDER BY m.measured_at DESC LIMIT 20');
        $st->execute([$assetId]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) {
            return ['available' => false, 'count' => 0,
                    'note' => 'ไม่พบการวัดแบบกำหนดเอง (asset_measurements) สำหรับเครื่องจักรนี้'];
        }
        return [
            'available'  => true,
            'count'      => count($rows),
            'measurements' => $rows,
            'label'      => 'ข้อมูลจากการตรวจแบบกำหนดเอง (CMMS) ไม่ใช่ข้อมูลจากเซนเซอร์',
            'merged'     => false,
            'note'       => 'แสดงคู่กันเพื่อให้ผู้ใช้เทียบได้ แต่ไม่ถูกนำมารวมเป็นคะแนนเดียว',
        ];
    } catch (Throwable $e) {
        return ['available' => false, 'count' => 0, 'note' => 'อ่านข้อมูลการวัดแบบกำหนดเองไม่สำเร็จ'];
    }
}

function iot_freshness_label(string $state): string {
    return [
        'fresh'      => 'เป็นปัจจุบัน',
        'ageing'     => 'เกินรอบเล็กน้อย',
        'stale'      => 'ข้อมูลเก่า',
        'not_valid'  => 'ค่าไม่ผ่านการตรวจสอบ',
        'no_data'    => 'ยังไม่มีข้อมูล',
    ][$state] ?? $state;
}

/* ============================================================
 * OVERVIEW
 * ============================================================ */

function iot_overview(PDO $pdo): array {
    $cfg = iot_config($pdo);
    $devSt = $pdo->prepare('SELECT COUNT(*) AS n,
                                   SUM(lifecycle_status IN ("commissioned","active")) AS in_service
                            FROM iot_devices');
    $devSt->execute();
    $dev = $devSt->fetch(PDO::FETCH_ASSOC) ?: ['n' => 0, 'in_service' => 0];

    $ptSt = $pdo->prepare('SELECT COUNT(*) AS n, SUM(enabled = 1) AS active FROM iot_points');
    $ptSt->execute();
    $pt = $ptSt->fetch(PDO::FETCH_ASSOC) ?: ['n' => 0, 'active' => 0];

    $offline = iot_sweep_offline_devices($pdo);
    $alarms  = iot_alarm_counts($pdo);
    $quality = iot_data_quality_summary($pdo, 24);

    $rdSt = $pdo->prepare('SELECT COUNT(*) AS n, MAX(received_at) AS latest FROM iot_readings
                           WHERE received_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    $rdSt->execute();
    $rd = $rdSt->fetch(PDO::FETCH_ASSOC) ?: ['n' => 0, 'latest' => null];

    $srcSt = $pdo->prepare('SELECT COUNT(*) AS n, SUM(enabled = 1) AS enabled FROM iot_sources');
    $srcSt->execute();
    $src = $srcSt->fetch(PDO::FETCH_ASSOC) ?: ['n' => 0, 'enabled' => 0];

    return [
        'generated_at'      => iot_now(),
        'configured'        => $cfg['iot_enabled'],
        'devices'           => [
            'total'        => (int)$dev['n'],
            'in_service'   => (int)($dev['in_service'] ?? 0),
            'unreachable'  => $offline['offline_count'],
            'note'         => 'อุปกรณ์ที่หลุดการเชื่อมต่อไม่เท่ากับเครื่องจักรที่เสีย — เป็นปัญหาการสื่อสารจนกว่าจะยืนยัน',
        ],
        'points'            => ['total' => (int)$pt['n'], 'enabled' => (int)($pt['active'] ?? 0)],
        'sources'           => ['total' => (int)$src['n'], 'enabled' => (int)($src['enabled'] ?? 0)],
        'readings_24h'      => ['count' => (int)$rd['n'], 'latest_at' => $rd['latest']],
        'alarms'            => $alarms,
        'data_quality'      => $quality,
        'offline_devices'   => $offline,
        'legacy_note'       => 'หน้าภาพรวมนี้แสดงเฉพาะสิ่งที่วัดได้จริง ไม่มีค่าตัวอย่างหรือค่าจำลองเพื่อให้กราฟดูสมบูรณ์',
    ];
}

/* ============================================================
 * RETENTION
 *
 * Off by default and driven by iot_retention_policies, which ship DISABLED. A dry run is
 * the default so an operator sees the row counts before anything disappears.
 *
 * One hard rule: raw readings are only deleted when a rollup already covers the row's
 * window. History may be summarised; it may not simply evaporate. Policies that would
 * delete raw rows without rollup coverage are reported as BLOCKED, not executed.
 * ============================================================ */

/** data_class -> [table, time column, what must exist first]. */
function iot_retention_targets(): array {
    return [
        'raw_readings' => ['table' => 'iot_readings',   'column' => 'received_at',
                           'requires' => ['iot_rollups'], 'label' => 'ค่าดิบจากเซนเซอร์'],
        'rollups'      => ['table' => 'iot_rollups',    'column' => 'bucket_start',
                           'requires' => [], 'label' => 'ค่าสรุปตามช่วงเวลา'],
        'ingest_log'   => ['table' => 'iot_ingest_log', 'column' => 'received_at',
                           'requires' => [], 'label' => 'บันทึกการรับข้อมูล'],
        'alarm_events' => ['table' => 'iot_alarm_events','column' => 'created_at',
                           'requires' => [], 'label' => 'ประวัติเหตุการณ์แจ้งเตือน'],
    ];
}

function iot_retention_policies(PDO $pdo): array {
    try {
        $st = $pdo->prepare('SELECT * FROM iot_retention_policies ORDER BY policy_code ASC');
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        return [];
    }
    $targets = iot_retention_targets();
    foreach ($rows as &$r) {
        $cls = (string)$r['data_class'];
        $r['target'] = $targets[$cls] ?? null;
        $r['runnable'] = $r['target'] !== null;
        $r['state_note'] = $r['target'] === null
            ? 'ไม่รู้จักชนิดข้อมูลนี้ — ไม่ดำเนินการ'
            : (((int)$r['enabled'] === 1) ? 'เปิดใช้งาน' : 'ปิดใช้งาน');
    }
    unset($r);
    return $rows;
}

function iot_retention_run(PDO $pdo, bool $dryRun = true): array {
    $cfg = iot_config($pdo);
    if (!$cfg['iot_retention_enabled']) {
        return ['ran' => false, 'reason' => 'RETENTION_DISABLED',
                'note' => 'การล้างข้อมูลตามอายุถูกปิดใช้งานอยู่ — ต้องเปิดใช้งานอย่างเจตนา'];
    }
    $pol = iot_retention_policies($pdo);
    $enabled = array_values(array_filter($pol, static fn($p) => (int)$p['enabled'] === 1 && $p['runnable']));
    if (!$enabled) {
        return ['ran' => false, 'reason' => 'NO_POLICIES',
                'note' => 'ยังไม่มีนโยบายเก็บรักษาที่เปิดใช้งานและชนิดข้อมูลถูกต้อง'];
    }

    $report = [];
    foreach ($enabled as $p) {
        $t     = $p['target'];
        $days  = max(1, (int)$p['retention_days']);
        $table = (string)$t['table'];
        $col   = (string)$t['column'];
        $entry = ['policy_code' => $p['policy_code'], 'data_class' => $p['data_class'],
                  'label' => $t['label'], 'retention_days' => $days,
                  'deleted' => 0, 'blocked' => null];

        // The guard that matters: raw readings may only go once a rollup actually covers them.
        // A containing bucket STARTS AT OR BEFORE the reading and ends after it, so the
        // comparison has to be "bucket_start <= received_at < bucket_start + width".
        if ((string)$p['data_class'] === 'raw_readings') {
            $cov = $pdo->prepare('SELECT COUNT(*) FROM iot_readings r
                                 WHERE r.received_at < DATE_SUB(NOW(), INTERVAL ? DAY)
                                   AND NOT EXISTS (SELECT 1 FROM iot_rollups u
                                                   WHERE u.point_id = r.point_id
                                                     AND u.bucket_start <= r.received_at
                                                     AND DATE_ADD(u.bucket_start, INTERVAL CASE u.bucket_size
                                                           WHEN "minute_1" THEN 60
                                                           WHEN "minute_5" THEN 300
                                                           WHEN "hourly"   THEN 3600
                                                           WHEN "daily"    THEN 86400
                                                           ELSE 0 END SECOND) > r.received_at)');
            $cov->execute([$days]);
            $uncovered = (int)$cov->fetchColumn();
            if ($uncovered > 0) {
                $entry['blocked'] = 'ROLLOUP_MISSING';
                $entry['message'] = "มีข้อมูลดิบที่เก่ากว่า {$days} วัน แต่ยังไม่มี rollup ครอบคลุม {$uncovered} แถว "
                                  . '— ไม่ลบ เพราะการล้างโดยไม่มีค่าสรุปทดแทนคือการทำให้ประวัติหาย';
            }
        }

        $cnt = $pdo->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$col}` < DATE_SUB(NOW(), INTERVAL ? DAY)");
        $cnt->execute([$days]);
        $entry['rows_affected'] = (int)$cnt->fetchColumn();

        if ($entry['blocked'] === null && $entry['rows_affected'] > 0 && !$dryRun) {
            try {
                // Batched deletes: a single unbounded DELETE on a large table can hold
                // locks long enough to stall intake.
                $del = $pdo->prepare("DELETE FROM `{$table}` WHERE `{$col}` < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 10000");
                $del->execute([$days]);
                $entry['deleted'] = $del->rowCount();
            } catch (Throwable $e) {
                error_log('[iot] retention delete failed on ' . $table . ': ' . $e->getMessage());
                $entry['error'] = 'DELETE_FAILED';
            }
        }

        // Record that the policy ran even when nothing qualified. Without this, "never
        // ran" and "ran and found nothing to delete" look identical in the audit trail.
        if (!$dryRun) {
            $note = $entry['deleted'] > 0
                ? 'deleted ' . $entry['deleted'] . ' rows of ' . $table
                : ($entry['blocked'] !== null
                    ? 'skipped ' . $table . ': ' . $entry['blocked']
                    : 'nothing older than ' . $days . ' days in ' . $table);
            $pdo->prepare('UPDATE iot_retention_policies SET last_run_at = NOW(), last_deleted_rows = ?,
                           last_run_note = ?, updated_by = ? WHERE id = ?')
                ->execute([$entry['deleted'], $note, $p['updated_by'], $p['id']]);
        }
        $report[] = $entry;
    }
    return ['ran' => true, 'dry_run' => $dryRun, 'policies' => $report,
            'note' => 'ค่าดิบถูกล้างเมื่อมี rollup ของช่วงเวลาเดียวกันแล้วเท่านั้น เพื่อไม่ให้ประวัติหายโดยไม่มีสิ่งที่ทดแทน'];
}

/* ============================================================
 * READINGS  (raw query for inspection / export)
 * ============================================================ */

function iot_readings_list(PDO $pdo, array $f = []): array {
    $sql = 'SELECT r.*, p.point_code, p.name AS point_name, d.device_code, ar.code AS asset_code
            FROM iot_readings r
            LEFT JOIN iot_points p ON p.id = r.point_id
            LEFT JOIN iot_devices d ON d.id = r.device_id
            LEFT JOIN asset_registry ar ON ar.id = d.asset_id
            WHERE 1 = 1';
    $args = [];
    foreach (['point_id' => 'r.point_id', 'device_id' => 'r.device_id', 'source_id' => 'r.source_id'] as $k => $col) {
        if (!empty($f[$k])) {
            $sql .= " AND {$col} = ?";
            $args[] = (int)$f[$k];
        }
    }
    if (!empty($f['asset_id'])) {
        $sql .= ' AND d.asset_id = ?';
        $args[] = (int)$f['asset_id'];
    }
    if (!empty($f['quality'])) {
        $sql .= ' AND r.quality = ?';
        $args[] = (string)$f['quality'];
    }
    if (!empty($f['from'])) {
        $sql .= ' AND r.received_at >= ?';
        $args[] = (string)$f['from'];
    }
    if (!empty($f['to'])) {
        $sql .= ' AND r.received_at <= ?';
        $args[] = (string)$f['to'];
    }
    $sql .= ' ORDER BY r.received_at DESC, r.id DESC LIMIT ' . max(1, min(2000, (int)($f['limit'] ?? 200)));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function iot_rollup_list(PDO $pdo, int $pointId, string $bucket, string $from, string $to, int $limit = 1000): array {
    $st = $pdo->prepare('SELECT point_id, bucket_size, bucket_start, sample_count, valid_count,
                                invalid_count, min_value, max_value, avg_value, sum_value,
                                `last_value`, last_ts
                         FROM iot_rollups
                         WHERE point_id = ? AND bucket_size = ? AND bucket_start >= ? AND bucket_start <= ?
                         ORDER BY bucket_start ASC LIMIT ?');
    $st->execute([$pointId, $bucket, $from, $to, max(1, min(5000, $limit))]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}