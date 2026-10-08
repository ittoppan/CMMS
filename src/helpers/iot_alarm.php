<?php
/**
 * src/helpers/iot_alarm.php - Phase 36 alarms: evaluation, lifecycle and CMMS linking.
 *
 * What this file will not do, because each of these is a claim the evidence cannot carry:
 *
 *   - It does not close an alarm when a value returns to normal. A cleared breach means
 *     "the condition stopped", not "the problem is solved". A human closes the alarm, and
 *     iot_alarm_can_transition() enforces that.
 *   - It does not diagnose. A tripped limit says a limit was crossed. Deciding what that
 *     means, and whether it deserves a repair, is a person's job in the RCA workflow.
 *   - It does not create work orders. iot_alarm_link_work_order() records a link to a
 *     repair someone already decided to raise; it never fabricates one.
 *   - It does not fire on a value it cannot trust. INVALID, STALE, DUPLICATE and
 *     OUT_OF_ORDER readings never reach the evaluator, because an alarm nobody can
 *     explain is worse than no alarm.
 *
 * The state machine is deliberately small and explicit so the UI never has to guess an
 * arrow, and so every transition is auditable.
 */

declare(strict_types=1);

/* ============================================================
 * EVALUATION
 * ============================================================ */

/**
 * Evaluate one VALID reading against the rules in force for the point.
 *
 * @return array<int,array> breach descriptors, one per rule crossed.
 */
function iot_rule_evaluate(PDO $pdo, int $pointId, float $value, int $readingId): array {
    $cfg   = iot_config($pdo);
    $point = iot_point_get($pdo, $pointId);
    if (!empty($point['error']) || (int)$point['enabled'] !== 1 || (int)$point['is_alarm_capable'] !== 1) {
        return [];
    }
    // A retired or under-maintenance device is not evidence about the asset right now.
    if (in_array((string)$point['device_lifecycle'], ['retired', 'maintenance'], true)) {
        return [];
    }

    $breaches = [];
    foreach (iot_rule_effective_now($pdo, $pointId) as $rule) {
        $b = iot_rule_check($pdo, $point, $rule, $value, $readingId, $cfg);
        if ($b !== null) {
            $breaches[] = $b;
        }
    }
    return $breaches;
}

/** One rule against one value. Returns null when the limit is not crossed. */
function iot_rule_check(PDO $pdo, array $point, array $rule, float $value, int $readingId, array $cfg): ?array {
$metric      = (string)$rule['metric'];
    $severity    = (string)$rule['severity'];
    $ruleId      = (int)$rule['id'];
    $warn        = $rule['warn_limit'] !== null ? (float)$rule['warn_limit'] : null;
    $crit        = $rule['critical_limit'] !== null ? (float)$rule['critical_limit'] : null;
    $needConsec  = max(1, (int)($rule['consecutive_count'] ?? 1));
    $needSeconds = (int)($rule['duration_seconds'] ?? 0);
    $debounce    = (int)($rule['debounce_seconds'] ?? 0);

    $breached = false;
    $measured = $value;
    $detail   = '';

    switch ($metric) {
        case 'max':
            $breached = ($crit !== null && $value >= $crit) || ($warn !== null && $value >= $warn);
            $limit    = ($crit !== null && $value >= $crit) ? $crit : $warn;
            $detail   = "ค่าสูงสุด {$value} เทียบกับ {$limit} " . (string)($rule['unit'] ?: $point['engineering_unit']);
            break;

        case 'min':
            $breached = ($crit !== null && $value <= $crit) || ($warn !== null && $value <= $warn);
            $limit    = ($crit !== null && $value <= $crit) ? $crit : $warn;
            $detail   = "ค่าต่ำสุด {$value} เทียบกับ {$limit} " . (string)($rule['unit'] ?: $point['engineering_unit']);
            break;

        case 'range':
            $breached = $value < (float)$warn || $value > (float)$crit;
            $detail   = "ค่า {$value} อยู่นอกช่วง {$warn}..{$crit}";
            break;

        case 'rate_of_change':
            $ratePerMin = (float)$rule['rate_per_minute'];
            $prev = iot_point_previous_valid($pdo, (int)$point['id'], $readingId);
            if ($prev === null) {
                return null;    // nothing to compare against yet - no invention here
            }
            $gapSec = max(1, (int)(strtotime((string)$prev['received_at']) === false
                ? 60 : time() - strtotime((string)$prev['received_at'])));
            $rate = ($value - (float)$prev['value_num']) / ($gapSec / 60.0);
            $measured = round($rate, 6);
            $breached = abs($rate) >= ($crit ?? $ratePerMin);
            $detail   = "อัตราเปลี่ยนแปลง {$measured} ต่อนาที เทียบกับ " . ($crit ?? $ratePerMin);
            break;

        case 'deviation':
            $baseline = iot_point_baseline($pdo, (int)$point['id']);
            if ($baseline === null) {
                return null;    // no trustworthy baseline - report nothing rather than guess
            }
            $dev = abs($value - $baseline);
            $measured = round($dev, 6);
            $breached = ($crit !== null && $dev >= $crit) || ($warn !== null && $dev >= $warn);
            $detail   = "ค่าเบี่ยงเบนจากค่าฐาน {$baseline} อยู่ที่ {$measured}";
            break;

        default:
            // missing_data is driven by the freshness sweep, not by a value.
            return null;
    }

    if (!$breached) {
        iot_rule_breach_cleared($pdo, $point, $rule, $value, $measured);
        return null;
    }

// Which limit did the value cross? That, not the row default, sets the severity -
// with the rule's own configured severity acting as the ceiling.
$severity = iot_rule_effective_severity($severity, iot_rule_hit_severity($metric, $measured, $rule));

    // Durability gates. A single spike is not a breach of a rule that asks for three.
    if ($needConsec > 1 || $needSeconds > 0) {
        if (!iot_rule_window_satisfied($pdo, $ruleId, $needConsec, $needSeconds, $metric, $measured, $warn, $crit)) {
            return null;
        }
    }
    // Debounce stops one physical fault from producing fifty alarms in five minutes.
    if ($debounce > 0 && iot_alarm_in_debounce($pdo, $point, $rule, $debounce)) {
        return null;
    }

    iot_alarm_raise($pdo, $point, $rule, $severity, $measured, $detail, $readingId);

    return [
        'rule_id'    => $ruleId,
        'severity'   => $severity,
        'metric'     => $metric,
        'measured'   => $measured,
        'detail'     => $detail,
        'reading_id' => $readingId,
    ];
}

/**
 * Are there enough recent BREACHING readings, spread over enough time, for a rule that
 * demands persistence to be considered breached?
 *
 * Counting valid samples is not enough: a rule asking for three samples in five minutes
 * would fire on two healthy samples plus one spike. So each of the recent samples is
 * re-tested against the same condition, and all of them must have breached.
 *
 * rate_of_change is excluded on purpose - "consecutive" has no meaning for a derived
 * per-minute rate, and its own comparison already requires a prior sample.
 *
 * The readings are the durable evidence; no state is carried in memory, so the gate
 * behaves the same on the next request as it did on the last one.
 */
function iot_rule_window_satisfied(PDO $pdo, int $ruleId, int $needConsec, int $needSeconds,
                                  string $metric, float $measured, ?float $warn, ?float $crit): bool {
    $needConsec = max(1, $needConsec);
    if ($metric === 'rate_of_change' || $metric === 'missing_data') {
        // Fall back to the sample-count gate: these metrics cannot be re-tested here.
        $st = $pdo->prepare('SELECT source_ts, received_at FROM iot_readings r
                             JOIN iot_threshold_rules tr ON tr.point_id = r.point_id
                             WHERE tr.id = ? AND r.quality = "VALID" AND r.value_num IS NOT NULL
                             ORDER BY r.received_at DESC, r.id DESC LIMIT ?');
        $st->execute([$ruleId, $needConsec]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        if (count($rows) < $needConsec) {
            return false;
        }
        $stamp = static function (array $r): int {
            $t = strtotime((string)($r['source_ts'] ?: $r['received_at']));
            return $t === false ? time() : $t;
        };
        $span = $stamp($rows[0]) - $stamp($rows[$needConsec - 1]);
        return $needSeconds <= 0 || $span >= $needSeconds;
    }

    // Re-test the recent samples against this rule's own condition.
    $st = $pdo->prepare('SELECT r.source_ts, r.received_at, r.value_num FROM iot_readings r
                         JOIN iot_threshold_rules tr ON tr.point_id = r.point_id
                         WHERE tr.id = ? AND r.quality = "VALID" AND r.value_num IS NOT NULL
                         ORDER BY r.received_at DESC, r.id DESC LIMIT ?');
    $st->execute([$ruleId, $needConsec]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) < $needConsec) {
        return false;
    }
    foreach ($rows as $r) {
        $v = (float)$r['value_num'];
        $hit = match ($metric) {
            'max'  => ($crit !== null && $v >= $crit) || ($warn !== null && $v >= $warn),
            'min'  => ($crit !== null && $v <= $crit) || ($warn !== null && $v <= $warn),
            'range'=> ($warn !== null && $crit !== null) && ($v < $warn || $v > $crit),
            // deviation/rate are absolute magnitudes; the current measured value is the
            // best available proxy for the comparison the caller just made.
            'deviation'    => ($crit !== null && $measured >= $crit) || ($warn !== null && $measured >= $warn),
            default        => false,
        };
        if (!$hit) {
            return false;    // one healthy sample inside the window means not yet a breach
        }
    }
    // Prefer the source's own clock, since the rule window describes the physical event.
    $stamp = static function (array $r): int {
        $t = strtotime((string)($r['source_ts'] ?: $r['received_at']));
        return $t === false ? time() : $t;
    };
    $span = $stamp($rows[0]) - $stamp($rows[$needConsec - 1]);
    return $needSeconds <= 0 || $span >= $needSeconds;
}

/** Is there an alarm for this rule inside its debounce window? */
function iot_alarm_in_debounce(PDO $pdo, array $point, array $rule, int $debounceSec): bool {
    if ($debounceSec <= 0) {
        return false;
    }
    $st = $pdo->prepare('SELECT COUNT(*) FROM iot_alarms
                         WHERE point_id = ? AND rule_id = ?
                           AND first_detected_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
                           AND status NOT IN ("closed","resolved")');
    $st->execute([(int)$point['id'], (int)$rule['id'], $debounceSec]);
    return ((int)$st->fetchColumn()) > 0;
}

/**
 * Record that a previously breached limit is back inside its band.
 *
 * This never closes the alarm. It appends a 'cleared' event and stamps breach_cleared_at,
 * so the history shows the fault stopped while the alarm stays open for a human to judge.
 */
/**
 * The breach stopped. This does NOT close the alarm: it stamps breach_cleared_at and adds
 * a 'cleared' event so a person can see the condition ended and decide the outcome.
 *
 * Hysteresis is honoured here because the migration documents it as "clear only past
 * limit +/- hysteresis". Without that band a value hovering a hair above the limit would
 * flap between cleared and breaching on every single sample.
 */
function iot_rule_breach_cleared(PDO $pdo, array $point, array $rule, float $value, float $measured): void {
    $st = $pdo->prepare('SELECT id, status, severity FROM iot_alarms
                         WHERE point_id = ? AND rule_id = ? AND status NOT IN ("closed","resolved")
                         ORDER BY first_detected_at DESC LIMIT 1');
    $st->execute([(int)$point['id'], (int)$rule['id']]);
    $alarm = $st->fetch(PDO::FETCH_ASSOC);
    if (!$alarm) {
        return;
    }

    $metric = (string)($rule['metric'] ?? '');
    $hyst   = max(0.0, (float)($rule['hysteresis'] ?? 0));
    if (!iot_rule_back_in_band($metric, $measured, $rule)) {
        return;     // still inside the deadband - leave the alarm open and untouched
    }

    $pdo->prepare('UPDATE iot_alarms SET last_seen_at = NOW(), breach_cleared_at = NOW() WHERE id = ?')
        ->execute([(int)$alarm['id']]);
    iot_alarm_event($pdo, (int)$alarm['id'], 'cleared', null,
        "ค่ากลับเข้าสู่ช่วงปกติ (ค่าล่าสุด {$value}"
        . ($hyst > 0 ? ", ผ่านช่วงหน่วง ±{$hyst}" : '')
        . ') — ยังไม่ปิดเคส ต้องให้ผู้ใช้ตัดสินใจ',
        (string)$alarm['severity']);
}

/** The last VALID reading before the one just stored, for rate-of-change maths. */
function iot_point_previous_valid(PDO $pdo, int $pointId, int $beforeReadingId): ?array {
    $st = $pdo->prepare('SELECT value_num, source_ts, received_at FROM iot_readings
                         WHERE point_id = ? AND quality = "VALID" AND value_num IS NOT NULL AND id <> ?
                         ORDER BY received_at DESC, id DESC LIMIT 1');
    $st->execute([$pointId, $beforeReadingId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Rolling baseline (median of recent VALID values) used by the deviation metric. */
function iot_point_baseline(PDO $pdo, int $pointId, int $window = 50): ?float {
    $st = $pdo->prepare('SELECT value_num FROM iot_readings
                         WHERE point_id = ? AND quality = "VALID" AND value_num IS NOT NULL
                         ORDER BY received_at DESC, id DESC LIMIT ?');
    $st->execute([$pointId, max(2, min(500, $window))]);
    $vals = array_map('floatval', $st->fetchAll(PDO::FETCH_COLUMN));
    if (count($vals) < 5) {
        return null;
    }
    sort($vals);
    $mid = (int)floor(count($vals) / 2);
    $median = (count($vals) % 2 === 0) ? ($vals[$mid - 1] + $vals[$mid]) / 2 : $vals[$mid];
    return round($median, 6);
}

/**
 * Raise an alarm. Debounced duplicates extend the existing alarm instead of creating a
 * second one, so one physical fault stays one story.
 */
/**
 * Raise an alarm.
 *
 * A fault that is still open stays ONE alarm. Repeat breaches of the same rule bump
 * occurrence_count, update peak_value and refresh last_seen_at instead of stacking new
 * rows, so a chattering sensor produces one story with a count rather than fifty
 * identical alarms.
 *
 * alarm_uid is the stable dedupe identity: same point + rule + open status. It is unique,
 * so a concurrent second insert cannot create a twin.
 */
function iot_alarm_raise(PDO $pdo, array $point, array $rule, string $severity,
                         float $measured, string $detail, ?int $readingId): array {
    $cfg     = iot_config($pdo);
    $pointId = (int)$point['id'];
    $ruleId  = (int)$rule['id'];

    $st = $pdo->prepare('SELECT id, severity, metric_value, peak_value, occurrence_count,
                             notification_last_sent_at, notification_count
                     FROM iot_alarms
                     WHERE point_id = ? AND rule_id = ? AND status NOT IN ("closed","resolved")
                     ORDER BY first_detected_at DESC LIMIT 1');
    $st->execute([$pointId, $ruleId]);
    $open = $st->fetch(PDO::FETCH_ASSOC);

    if ($open) {
        // NAN means "there is no value" (no-data rule), so it must never reach a DECIMAL
        // column and must never be compared as if it were a measurement.
        $hasValue = is_finite($measured);

        // "Worst" depends on the metric: for a max/deviation rule the worst observation is the
        // HIGHEST, for a min rule it is the LOWEST. Keeping the largest number for a min rule
        // would hide the actual excursion from everyone reading the record later.
        $lowerIsWorse = in_array((string)($rule['metric'] ?? ''), ['min'], true);
        if ($hasValue) {
            $peakCase = $lowerIsWorse
                ? 'CASE WHEN peak_value IS NULL THEN ? WHEN ? < peak_value THEN ? ELSE peak_value END'
                : 'CASE WHEN peak_value IS NULL THEN ? WHEN ? > peak_value THEN ? ELSE peak_value END';
        } else {
            $peakCase = 'peak_value';
        }

        $sets = ['occurrence_count = occurrence_count + 1', 'last_seen_at = NOW()',
                 'breach_cleared_at = NULL'];
        $args = [];
        if ($hasValue) {
            $sets[] = 'metric_value = ?';
            $args[] = $measured;
        }
        $sets[] = $peakCase;
        if ($hasValue) {
            $args[] = $measured;
            $args[] = $measured;
            $args[] = $measured;
        }

        // An episode that was opened as a warning can genuinely worsen. Without this the row
        // keeps saying "warning" while the engine notifies as if it were critical, so the
        // history understates what actually happened.
        $escalated = iot_severity_rank($severity) > iot_severity_rank((string)$open['severity']);
        if ($escalated) {
            $sets[] = 'severity = ?';
            $args[] = $severity;
            $thrNew = $severity === 'critical'
                ? ($rule['critical_limit'] !== null ? (float)$rule['critical_limit'] : null)
                : ($rule['warn_limit'] !== null ? (float)$rule['warn_limit'] : null);
            if ($thrNew !== null) {
                $sets[] = 'threshold_value = ?';
                $args[] = $thrNew;
            }
        }

        $sets[] = 'WHERE id = ?';
        $args[] = (int)$open['id'];
        $pdo->prepare('UPDATE iot_alarms SET ' . implode(', ', $sets))->execute($args);

        if ($escalated) {
            iot_alarm_event($pdo, (int)$open['id'], 'escalated', null,
                "ระดับความรุนแรงเพิ่มจาก {$open['severity']} เป็น {$severity}: {$detail}",
                $severity);
        }

        // Re-notify only after the dedup window, so a persistent critical alarm still
        // reaches someone without becoming a notification storm.
        $dedup   = max(0, (int)($rule['notification_dedup_seconds'] ?? $cfg['iot_alarm_dedup_sec']));
        $lastSent = $open['notification_last_sent_at'] !== null
            ? iot_age_sec((string)$open['notification_last_sent_at']) : null;
        if ($severity === 'critical' && $cfg['iot_alarm_on_critical_notify']
            && ($lastSent === null || $lastSent >= $dedup)) {
            if (iot_alarm_notify($pdo, (int)$open['id'])) {
                $pdo->prepare('UPDATE iot_alarms SET notification_last_sent_at = NOW(),
                               notification_count = notification_count + 1 WHERE id = ?')
                    ->execute([(int)$open['id']]);
            }
        }
        return ['id' => (int)$open['id'], 'merged' => true];
    }

    $assetId = iot_int_or_null($point['asset_id'] ?? null);
    // Unique per episode. The minute keeps a retry from duplicating the same breach while
    // a random tail keeps two genuine breaches in the same minute from colliding.
    $uidSeed = $pointId . ':' . $ruleId . ':' . (int)($rule['version'] ?? 1) . ':' . date('YmdHi');
    $alarmUid = substr(sha1($uidSeed . '|' . bin2hex(random_bytes(6))), 0, 40);
    $thr = $severity === 'critical'
        ? ($rule['critical_limit'] !== null ? (float)$rule['critical_limit'] : null)
        : ($rule['warn_limit'] !== null ? (float)$rule['warn_limit'] : null);

    $isFinite = is_finite($measured);
    try {
        $pdo->prepare('INSERT INTO iot_alarms
            (alarm_uid, device_id, point_id, asset_id, rule_id, rule_version, category, severity, status,
             message, metric_value, threshold_value, peak_value, occurrence_count, unit,
             breach_started_at, first_detected_at, last_seen_at, last_reading_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, "detected", ?, ?, ?, ?, 1, ?, NOW(), NOW(), NOW(), ?)')
            ->execute([
                $alarmUid, (int)$point['device_id'], $pointId, (int)$assetId, $ruleId,
                (int)($rule['version'] ?? 1),
                iot_alarm_category_for_metric((string)$rule['metric']), $severity,
                mb_substr($detail, 0, 500),
                $isFinite ? $measured : null,
                $thr,
                $isFinite ? $measured : null,
                iot_clean_str($rule['unit'] ?: $point['engineering_unit'], 40),
                $readingId,
            ]);
    } catch (Throwable $e) {
        error_log('[iot] alarm raise failed: ' . $e->getMessage());
        return iot_err('DB', 'บันทึกแจ้งเตือนไม่สำเร็จ');
    }
    $id = (int)$pdo->lastInsertId();
    iot_alarm_event($pdo, $id, 'detected', null, "ตรวจพบการเกินเกณฑ์: {$detail}", $severity);

    if ($severity === 'critical' && $cfg['iot_alarm_on_critical_notify'] && iot_alarm_notify($pdo, $id)) {
        $pdo->prepare('UPDATE iot_alarms SET notification_last_sent_at = NOW(),
                       notification_count = notification_count + 1 WHERE id = ?')->execute([$id]);
    }
    return ['id' => $id, 'merged' => false];
}

function iot_alarm_category_for_metric(string $metric): string {
    return [
        'min' => 'threshold', 'max' => 'threshold', 'range' => 'threshold', 'deviation' => 'threshold',
        'rate_of_change' => 'rate_of_change', 'missing_data' => 'missing_data',
    ][$metric] ?? 'threshold';
}

/* ============================================================
 * EVENTS  (append-only; the alarm row is the summary, these are the story)
 * ============================================================ */

function iot_alarm_event_types(): array {
    return [
        'detected'         => 'ตรวจพบการเกินเกณฑ์',
        'cleared'          => 'ค่ากลับเข้าสู่ช่วงปกติ (ยังไม่ปิดเคส)',
        'escalated'        => 'ส่งต่อผู้รับผิดชอบเพิ่มเติม',
        'acknowledged'     => 'รับทราบแล้ว',
        'note'             => 'บันทึกเพิ่มเติม',
        'investigating'    => 'กำลังตรวจสอบ',
        'action_required'  => 'ต้องดำเนินการ',
        'work_order_linked'=> 'เชื่อมโยงใบงานซ่อม (โดยผู้ใช้ ไม่ได้สร้างอัตโนมัติ)',
        'rca_linked'       => 'เชื่อมโยงบันทึก RCA',
        'resolved'         => 'คืนสู่ปกติ (รอปิด)',
        'reopened'         => 'เปิดเคสใหม่',
        'closed'           => 'ปิดเคส',
        'suppressed'       => 'ระงับชั่วคราว',
        'unsuppressed'     => 'ยกเลิกการระงับ',
        'notification_sent'=> 'ส่งการแจ้งเตือนแล้ว',
    ];
}

/**
 * Append one history row. from_status/to_status default to '' (the columns are NOT NULL)
 * and created_at is written explicitly because the column carries no default.
 *
 * @return int event id, or 0 when the write failed. History is best effort and never
 *         blocks or rolls back the alarm transition it is describing.
 */
function iot_alarm_event(PDO $pdo, int $alarmId, string $eventType, ?int $actorId, string $note,
                         string $severity = 'warning', ?int $actorType = null): int {
    $type = array_key_exists($eventType, iot_alarm_event_types()) ? $eventType : 'note';
    $sev  = $severity === 'critical' ? 'critical' : 'warning';
    try {
        $pdo->prepare('INSERT INTO iot_alarm_events
            (alarm_id, event_type, from_status, to_status, severity, note, actor_type, actor_user_id, created_at)
            VALUES (?, ?, "", "", ?, ?, ?, ?, NOW())')
            ->execute([
                $alarmId, $type, $sev, mb_substr($note, 0, 500),
                $actorId === null ? 'system' : 'user',
                $actorId,
            ]);
        return (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[iot] alarm event write failed: ' . $e->getMessage());
        return 0;
    }
}

/* ============================================================
 * NOTIFICATION
 *
 * Notification is best-effort and never blocks or fails the alarm. If the notification
 * centre is unavailable the alarm is still real and still recorded.
 * ============================================================ */

/**
 * Notification is best-effort and never blocks or fails the alarm. If the notification
 * centre is unavailable the alarm is still real, still recorded, and the failure is
 * visible in the log rather than silently swallowed.
 *
 * @return bool whether a notification was actually sent.
 */
function iot_alarm_notify(PDO $pdo, int $alarmId): bool {
    try {
        require_once __DIR__ . '/../services/NotificationCenterService.php';
        $st = $pdo->prepare('SELECT a.alarm_uid, a.severity, a.message, a.unit, a.metric_value,
                                    a.occurrence_count,
                                    d.device_code, ar.name AS asset_name
                             FROM iot_alarms a
                             LEFT JOIN iot_devices d ON d.id = a.device_id
                             LEFT JOIN asset_registry ar ON ar.id = d.asset_id
                             WHERE a.id = ?');
        $st->execute([$alarmId]);
        $a = $st->fetch(PDO::FETCH_ASSOC);
        if (!$a) {
            return false;
        }
        $cfg   = iot_config($pdo);
        $title = 'แจ้งเตือน IoT ' . strtoupper((string)$a['severity']) . ' : ' . $a['alarm_uid'];
        $body  = sprintf('%s | อุปกรณ์ %s | เครื่องจักร %s | ค่าล่าสุด %s%s (พบครั้งที่ %d)',
                    $a['message'], $a['device_code'], $a['asset_name'] ?: '-',
                    $a['metric_value'] !== null ? (string)$a['metric_value'] : '-',
                    $a['unit'] !== '' ? ' ' . $a['unit'] : '',
                    (int)$a['occurrence_count']);

        // notify() is static, takes a single spec array and returns the number of inbox
        // rows created (0 also when its own dedup suppressed the send).
        $roles = array_values(array_filter(array_map('intval',
            (array)($cfg['iot_alarm_notify_roles'] ?? [])), static fn($r) => $r > 0));
        $made  = NotificationCenterService::notify($pdo, [
            'module'      => 'iot',
            'event'       => 'alarm_' . strtolower((string)$a['severity']),
            'type'        => 'maintenance',
            'priority'    => ((string)$a['severity'] === 'critical') ? 'critical' : 'high',
            'ref_type'    => 'iot_alarm',
            'ref_id'      => $alarmId,
            'title'       => $title,
            'message'     => $body,
            'url'         => 'iot/alarms?id=' . $alarmId,
            'roles'       => $roles,
            'event_key'   => 'iot_alarm_' . $a['alarm_uid'],
            'dedup_hours' => 0,
            'payload'     => ['alarm_id' => $alarmId, 'severity' => $a['severity'],
                              'device_code' => $a['device_code']],
        ]);
        return $made > 0;
    } catch (Throwable $e) {
        error_log('[iot] alarm notify failed (alarm still recorded): ' . $e->getMessage());
        return false;
    }
}

/* ============================================================
 * ALARM QUERY
 * ============================================================ */

function iot_alarm_list(PDO $pdo, array $f = []): array {
    $sql = 'SELECT a.*, d.device_code, ar.code AS asset_code, ar.name AS asset_name,
                   p.point_code, p.name AS point_name, p.engineering_unit AS point_unit,
                   r.rule_code, r.metric, r.version AS rule_version_current
            FROM iot_alarms a
            LEFT JOIN iot_devices d ON d.id = a.device_id
            LEFT JOIN asset_registry ar ON ar.id = a.asset_id
            LEFT JOIN iot_points p ON p.id = a.point_id
            LEFT JOIN iot_threshold_rules r ON r.id = a.rule_id
            WHERE 1 = 1';
    $args = [];
    if (!empty($f['status'])) {
        $statuses = is_array($f['status']) ? $f['status'] : [$f['status']];
        $sql .= ' AND a.status IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')';
        array_push($args, ...$statuses);
    }
    if (!empty($f['severity'])) {
        $sql .= ' AND a.severity = ?';
        $args[] = (string)$f['severity'];
    }
    if (!empty($f['device_id'])) {
        $sql .= ' AND a.device_id = ?';
        $args[] = (int)$f['device_id'];
    }
    if (!empty($f['asset_id'])) {
        $sql .= ' AND a.asset_id = ?';
        $args[] = (int)$f['asset_id'];
    }
    if (!empty($f['category'])) {
        $sql .= ' AND a.category = ?';
        $args[] = (string)$f['category'];
    }
    if (!empty($f['open_only'])) {
        $sql .= ' AND a.status NOT IN ("closed","resolved")';
    }
    if (!empty($f['from'])) {
        $sql .= ' AND a.first_detected_at >= ?';
        $args[] = (string)$f['from'];
    }
    $order = strtoupper((string)($f['order'] ?? 'DESC')) === 'ASC' ? 'ASC' : 'DESC';
    $sql .= ' ORDER BY a.first_detected_at ' . $order . ', a.id ' . $order . ' LIMIT '
          . max(1, min(500, (int)($f['limit'] ?? 100)));
    $st = $pdo->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$r) {
        $r = iot_alarm_decorate($pdo, $r);
    }
    unset($r);
    return $rows;
}

function iot_alarm_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT a.*, d.device_code, ar.code AS asset_code, ar.name AS asset_name,
                                ar.location AS asset_location, p.point_code, p.name AS point_name,
                                p.engineering_unit AS point_unit, r.rule_code, r.metric, r.name AS rule_name,
                                r.warn_limit, r.critical_limit, r.unit AS rule_unit, r.version AS rule_version_current
                         FROM iot_alarms a
                         LEFT JOIN iot_devices d ON d.id = a.device_id
                         LEFT JOIN asset_registry ar ON ar.id = a.asset_id
                         LEFT JOIN iot_points p ON p.id = a.point_id
                         LEFT JOIN iot_threshold_rules r ON r.id = a.rule_id
                         WHERE a.id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return iot_err('NOT_FOUND', 'ไม่พบแจ้งเตือน');
    }
    $row = iot_alarm_decorate($pdo, $row);
    $ev = $pdo->prepare('SELECT e.*, u.username AS actor_name FROM iot_alarm_events e
                         LEFT JOIN users u ON u.id = e.actor_user_id
                         WHERE e.alarm_id = ? ORDER BY e.id ASC');
    $ev->execute([$id]);
    $row['events'] = $ev->fetchAll(PDO::FETCH_ASSOC);
    $row['rule_version_note'] = $row['rule_version'] !== null
        ? 'แจ้งเตือนนี้เกิดจากเกณฑ์เวอร์ชัน ' . $row['rule_version']
          . ' — เกณฑ์อาจถูกปรับแล้ว แต่ค่าที่ใช้ตัดสินคือค่าของเวอร์ชันนี้'
        : 'ไม่ทราบเวอร์ชันเกณฑ์ที่ใช้ (แจ้งเตือนที่มาจากการสแกนไม่มีข้อมูล)';
    return $row;
}

function iot_alarm_decorate(PDO $pdo, array $row): array {
    $row['silent_for_sec'] = iot_age_sec((string)($row['last_seen_at'] ?: $row['first_detected_at']));
    $row['open_duration_sec'] = iot_age_sec((string)$row['first_detected_at']);
    $row['breach_cleared'] = !empty($row['breach_cleared_at']);
    $row['breach_note'] = $row['breach_cleared']
        ? 'ค่ากลับสู่ช่วงปกติแล้ว แต่เคสยังไม่ถูกปิด'
        : 'ยังพบค่าที่เกินเกณฑ์ ณ เวลาล่าสุด';
    $row['status_label']   = iot_alarm_statuses()[(string)$row['status']] ?? $row['status'];
    $row['severity_label'] = $row['severity'] === 'critical' ? 'วิกฤต' : 'เตือน';
    $row['category_label'] = iot_alarm_categories()[(string)$row['category']] ?? $row['category'];
    $row['next_actions'] = iot_alarm_transitions()[(string)$row['status']] ?? [];
    $row['suppression_active'] = !empty($row['suppressed_until'])
        && strtotime((string)$row['suppressed_until']) > time();
    // A stopped breach is the strongest nudge toward resolving, but it stays a hint to a
    // human - the transition still has to go through iot_alarm_transition().
    $row['suggested_action'] = $row['breach_cleared'] && !in_array($row['status'], ['resolved', 'closed'], true)
        ? 'ค่ากลับสู่ช่วงปกติแล้ว พิจารณาปิดเคสหลังตรวจสาเหตุ' : null;
    return $row;
}

/** Counts for the overview, plus the honest note about what is NOT counted. */
function iot_alarm_counts(PDO $pdo): array {
    $st = $pdo->prepare('SELECT status, severity, COUNT(*) AS n FROM iot_alarms GROUP BY status, severity');
    $byStatus = [];
    $bySeverity = [];
    foreach (array_keys(iot_alarm_statuses()) as $s) {
        $byStatus[$s] = 0;
    }
    foreach (['warning' => 0, 'critical' => 0] as $s => $_) {
        $bySeverity[$s] = 0;
    }
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $byStatus[(string)$r['status']] = (int)$r['n'];
        $bySeverity[(string)$r['severity']] = ($bySeverity[(string)$r['severity']] ?? 0) + (int)$r['n'];
    }
    $openStatuses = ['detected', 'acknowledged', 'investigating', 'action_required', 'suppressed'];
    $open = 0;
    foreach ($openStatuses as $s) {
        $open += $byStatus[$s];
    }
    return [
        'by_status'    => $byStatus,
        'by_severity'  => $bySeverity,
        'open_total'   => $open,
        'resolved_pending_close' => $byStatus['resolved'],
        'note' => 'นับเฉพาะแจ้งเตือนที่ระบบตรวจพบจากข้อมูลจริง ไม่มีการสร้างเตือนตัวอย่างเพื่อให้ตัวเลขดูดี',
    ];
}

/* ============================================================
 * LIFECYCLE TRANSITIONS
 * ============================================================ */

/** Every status change goes through here: validated, event-logged, audited. */
function iot_alarm_transition(PDO $pdo, int $alarmId, string $to, string $note, ?int $actorId, array $opts = []): array {
    $cfg = iot_config($pdo);
    $st = $pdo->prepare('SELECT * FROM iot_alarms WHERE id = ?');
    $st->execute([$alarmId]);
    $a = $st->fetch(PDO::FETCH_ASSOC);
    if (!$a) {
        return iot_err('NOT_FOUND', 'ไม่พบแจ้งเตือน');
    }
    $from = (string)$a['status'];
    if ($from === $to) {
        return iot_err('NO_CHANGE', 'แจ้งเตือนอยู่ในสถานะนี้อยู่แล้ว');
    }
    if (!array_key_exists($to, iot_alarm_statuses())) {
        return iot_err('VALIDATION', 'สถานะปลายทางไม่ถูกต้อง');
    }
    if (!iot_alarm_can_transition($from, $to)) {
        return iot_err('INVALID_TRANSITION', "เปลี่ยนสถานะจาก {$from} ไป {$to} ไม่ได้",
            ['allowed' => iot_alarm_transitions()[$from] ?? []]);
    }
    $severity = (string)$a['severity'];

    // Resolving is a judgement. If the org requires a written reason, enforce it here
    // rather than trusting the UI to have asked for one.
    if ($to === 'resolved') {
        $code = iot_clean_str($opts['resolution_code'] ?? '', 40);
        if ($code !== '' && !array_key_exists($code, iot_resolution_codes())) {
            return iot_err('VALIDATION', 'resolution_code ไม่ถูกต้อง',
                ['allowed' => array_keys(iot_resolution_codes())]);
        }
        if ($cfg['iot_alarm_require_note_on_resolve'] && trim($note) === '') {
            return iot_err('VALIDATION', 'การปิดเคสต้องระบุสาเหตุและการดำเนินการ');
        }
    }

    $sets   = ['status = ?'];
    $args   = [$to];
    if (in_array($to, ['acknowledged', 'investigating', 'action_required'], true)) {
        $sets[] = 'acknowledged_by = COALESCE(acknowledged_by, ?)';
        $args[] = $actorId;
        $sets[] = 'acknowledged_at = COALESCE(acknowledged_at, NOW())';
        $sets[] = 'acknowledged_note = CASE WHEN acknowledged_note = "" THEN ? ELSE acknowledged_note END';
        $args[] = mb_substr(trim($note), 0, 500);
    }
    if ($to === 'investigating') {
        $sets[] = 'investigation_note = ?';
        $args[] = mb_substr(trim($note), 0, 500);
    }
    if ($to === 'resolved') {
        $sets[] = 'resolved_at = NOW()';
        $sets[] = 'resolved_by = ?';
        $args[] = $actorId;
        $sets[] = 'resolution_code = ?';
        $args[] = iot_clean_str($opts['resolution_code'] ?? '', 40);
        $sets[] = 'resolution_note = ?';
        $args[] = mb_substr(trim($note), 0, 500);
        $// Never fabricate closure: a resolution that claims the machine is back to normal
        // while the value is still out of band would be a lie in the record.
        $sets[] = 'breach_cleared_at = COALESCE(breach_cleared_at, NOW())';
    }
    if ($to === 'closed') {
        $sets[] = 'closed_at = NOW()';
        $sets[] = 'closed_by = ?';
        $args[] = $actorId;
        $sets[] = 'closure_note = ?';
        $args[] = mb_substr(trim($note), 0, 500);
    }
    if ($to === 'suppressed') {
        $min = max(1, (int)($opts['suppress_minutes'] ?? $cfg['iot_alarm_suppress_default_min']));
        if (!empty($opts['until'])) {
            $sets[] = 'suppressed_until = ?';
            $args[] = iot_parse_ts($opts['until']);
        } else {
            $sets[] = 'suppressed_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)';
            $args[] = $min;
        }
    } else {
        $sets[] = 'suppressed_until = NULL';
    }

    $args[] = $alarmId;
    $pdo->prepare('UPDATE iot_alarms SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);

    $eventType = $to;
    if (!array_key_exists($eventType, iot_alarm_event_types())) {
        $eventType = 'note';
    }
    iot_alarm_event($pdo, $alarmId, $eventType, $actorId,
        trim($note) !== '' ? $note : 'เปลี่ยนสถานะโดยระบบ', $severity);
    audit_log($pdo, 'transition', 'iot_alarm', $alarmId,
        "แจ้งเตือน {$a['alarm_uid']}: {$from} -> {$to}"
        . (trim($note) !== '' ? " ({$note})" : ''),
        ['status' => $from], ['status' => $to]);
    return ['id' => $alarmId, 'from' => $from, 'to' => $to];
}

/** Acknowledgement is a common first action and is intentionally its own helper. */
function iot_alarm_acknowledge(PDO $pdo, int $alarmId, int $actorId, string $note = ''): array {
    return iot_alarm_transition($pdo, $alarmId, 'acknowledged',
        $note !== '' ? $note : 'ผู้ใช้รับทราบแจ้งเตือน', $actorId);
}

/**
 * Link an alarm to a repair that a person already decided to raise. This NEVER creates a
 * repair: the whole point is that the decision stays with the planner.
 */
function iot_alarm_link_work_order(PDO $pdo, int $alarmId, int $repairId, string $note, int $actorId): array {
    $ex = $pdo->prepare('SELECT COUNT(*) FROM repair WHERE id = ?');
    $ex->execute([$repairId]);
    if (((int)$ex->fetchColumn()) === 0) {
        return iot_err('VALIDATION', 'ไม่พบใบงานซ่อมนี้');
    }
    $pdo->prepare('UPDATE iot_alarms SET linked_repair_id = ? WHERE id = ?')->execute([$repairId, $alarmId]);
    iot_alarm_event($pdo, $alarmId, 'work_order_linked', $actorId,
        "เชื่อมโยงกับใบงานซ่อม #{$repairId}: {$note}", 'warning');
    audit_log($pdo, 'link_work_order', 'iot_alarm', $alarmId,
        "ผูกแจ้งเตือนกับใบงานซ่อม #{$repairId}", null, ['linked_repair_id' => $repairId]);
    return ['id' => $alarmId, 'linked_repair_id' => $repairId];
}

/** Same principle for RCA: a person links the analysis, the engine never infers it. */
function iot_alarm_link_rca(PDO $pdo, int $alarmId, ?int $rcaId, string $note, int $actorId): array {
    if ($rcaId !== null) {
        $ex = $pdo->prepare('SELECT COUNT(*) FROM rca_records WHERE id = ?');
        $ex->execute([$rcaId]);
        if (((int)$ex->fetchColumn()) === 0) {
            return iot_err('VALIDATION', 'ไม่พบบันทึก RCA นี้');
        }
    }
    $pdo->prepare('UPDATE iot_alarms SET linked_rca_id = ? WHERE id = ?')->execute([$rcaId, $alarmId]);
    iot_alarm_event($pdo, $alarmId, 'rca_linked', $actorId, $note !== '' ? $note : 'เชื่อมโยงบันทึก RCA');
    audit_log($pdo, 'link_rca', 'iot_alarm', $alarmId, 'ผูกแจ้งเตือนกับ RCA', null, ['linked_rca_id' => $rcaId]);
    return ['id' => $alarmId, 'linked_rca_id' => $rcaId];
}

/* ============================================================
 * FRESHNESS SWEEP
 *
 * Missing data IS a condition worth surfacing. Silence is turned into an explicit
 * missing_data alarm with the timeout the rule declares - never into a value of zero.
 * ============================================================ */

/**
 * Find points that should be reporting and are not. Intended to be called on a schedule
 * (cron / scheduled job). Returns what it did; it invents no readings.
 */
function iot_sweep_missing_data(PDO $pdo, int $limit = 200): array {
    $rules = $pdo->prepare('SELECT r.*, p.device_id, p.point_code, p.engineering_unit, d.device_code,
                                   d.lifecycle_status, d.asset_id
                            FROM iot_threshold_rules r
                            JOIN iot_points p ON p.id = r.point_id
                            JOIN iot_devices d ON d.id = p.device_id
                            WHERE r.metric = "missing_data" AND r.is_current = 1 AND r.enabled = 1
                              AND p.enabled = 1 AND d.lifecycle_status IN ("commissioned","active")
                            LIMIT ?');
    $rules->execute([max(1, min(1000, $limit))]);

    $raised = $checked = $skipped = 0;
    foreach ($rules->fetchAll(PDO::FETCH_ASSOC) as $rule) {
        $checked++;
        $timeout = (int)($rule['missing_timeout_seconds'] ?? 0);
        if ($timeout < 10) {
            $skipped++;
            continue;
        }
        $last = $pdo->prepare('SELECT received_at FROM iot_readings
                               WHERE point_id = ? ORDER BY received_at DESC, id DESC LIMIT 1');
        $last->execute([(int)$rule['point_id']]);
        $lastRow = $last->fetch(PDO::FETCH_ASSOC);
        $age = $lastRow !== null ? iot_age_sec((string)$lastRow['received_at']) : null;
        if (($age ?? PHP_INT_MAX) <= $timeout) {
            continue;
        }

        // Do not stack missing-data alarms on a point that already has an open one.
        $open = $pdo->prepare('SELECT id FROM iot_alarms
                               WHERE point_id = ? AND status NOT IN ("closed","resolved") LIMIT 1');
        $open->execute([(int)$rule['point_id']]);
        if ($open->fetchColumn()) {
            continue;
        }
        $detail = $lastRow === null
            ? "ไม่เคยได้รับข้อมูลจากจุดวัดเลย (เกิน {$timeout} วินาที) — ไม่ถือว่าค่าเป็น 0"
            : "ไม่มีข้อมูลใหม่เกิน {$timeout} วินาที (ครั้งล่าสุด " . (string)$lastRow['received_at']
              . ') — ไม่ถือว่าค่าเป็น 0';

        $point = iot_point_get($pdo, (int)$rule['point_id']);
        if (!empty($point['error'])) {
            continue;
        }
        // No reading means no value: metric_value stays NULL rather than a fabricated 0.
        iot_alarm_raise($pdo, $point, $rule, 'critical', NAN, $detail, null);
        $raised++;
    }
    return [
        'points_checked' => $checked,
        'alarms_raised'  => $raised,
        'rules_skipped'  => $skipped,
        'note'           => 'ตรวจเฉพาะจุดวัดที่มีกฎ no-data และอยู่ในสถานะใช้งาน ไม่มีการสร้างค่าทดแทน',
    ];
}

/** Devices that stopped answering. Reachability only - never labelled a machine fault. */
function iot_sweep_offline_devices(PDO $pdo): array {
    $cfg = iot_config($pdo);
    $st = $pdo->prepare('SELECT d.id, d.device_code, d.asset_id, d.last_ping,
                                (SELECT MAX(r.received_at) FROM iot_readings r WHERE r.device_id = d.id) AS last_reading
                         FROM iot_devices d
                         WHERE d.lifecycle_status IN ("commissioned","active")');
    $offline = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $d) {
        // last_ping is updated by intake; last_reading is the raw-data truth. Prefer the
        // newer of the two so a source that only sends errors is not called unreachable.
        $stamps = array_filter([$d['last_ping'], $d['last_reading']]);
        $newest = $stamps ? max(array_map('strtotime', array_map('strval', $stamps))) : false;
        $age    = $newest === false ? null : max(0, time() - $newest);
        if ($age === null || $age > $cfg['iot_device_offline_after_sec']) {
            $offline[] = [
                'device_id'   => (int)$d['id'],
                'device_code' => (string)$d['device_code'],
                'asset_id'    => $d['asset_id'] !== null ? (int)$d['asset_id'] : null,
                'last_ping'   => $d['last_ping'],
                'last_reading'=> $d['last_reading'],
                'silent_sec'  => $age,
                'meaning'     => 'อุปกรณ์ไม่ส่งข้อมูลเข้ามา — เป็นปัญหาการสื่อสาร/การจ่ายไฟ ไม่ใช่หลักฐานว่าเครื่องจักรเสีย',
            ];
        }
    }
    return ['offline_count' => count($offline), 'devices' => $offline,
            'threshold_sec' => $cfg['iot_device_offline_after_sec']];
}