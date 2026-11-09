<?php
/* Split from src/helpers/reliability.php (2026-10-17) - always loaded via reliability.php */

/** Run a COUNT query, returning -1 when the table is unavailable. */
function rel_dq_count(PDO $pdo, string $sql, array $params): int {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return (int)$st->fetchColumn();
    } catch (Throwable $e) {
        return -1;
    }
}


/** Fetch up to $n offending primary keys for the UI drill-down. */
function rel_dq_sample(PDO $pdo, string $sql, array $params, int $n = 5): array {
    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $out = [];
        foreach ($st->fetchAll() as $row) {
            $out[] = array_values($row)[0];
        }
        return array_slice($out, 0, $n);
    } catch (Throwable $e) {
        return [];
    }
}


/**
 * Data-quality gate for a period/scope.
 *
 * Every check answers: "which rows would distort which KPI, and how many are
 * there". Rows that would distort a KPI are EXCLUDED from the KPI and
 * REPORTED here - never silently dropped.
 *
 * @return array{status:string,flags:array,checks:array,critical:int,warning:int,info:int,
 *               excluded:int,failures_in_scope:int}
 */
function rel_dq_checks(PDO $pdo, array $scope, array $period, array $cfg = []): array {
    $cfg = $cfg ?: [];
    $start = $period['start'];
    $end = $period['end'];
    $dStart = substr($start, 0, 10);
    $dEnd = substr($end, 0, 10);
    $ids = $scope['asset_ids'] ?? [];
    $inScope = rel_id_in($ids, 'asset_id');
    $inScopeA = rel_id_in($ids, 'a.id');

    $checks = [];
    $add = static function (string $code, string $severity, int $count, string $kpi, string $detail, array $sample = [], bool $excluded = true) use (&$checks): void {
        if ($count <= 0) {
            return;
        }
        $checks[] = [
            'check_code'   => $code,
            'severity'     => $severity,
            'count'        => $count,
            'affected_kpi' => $kpi,
            'detail'       => $detail,
            'sample_ids'   => $sample,
            'excluded'     => $excluded,
        ];
    };

    $failuresInScope = (int)rel_dq_count(
        $pdo,
        "SELECT COUNT(*) FROM failure_events WHERE failure_date BETWEEN ? AND ?" . $inScope,
        [$start, $end]
    );

    if ($failuresInScope < 0) {
        return [
            'status' => RL_DQ_NOT_ENOUGH,
            'flags'  => [],
            'checks' => [],
            'critical' => 0, 'warning' => 0, 'info' => 0, 'excluded' => 0,
            'failures_in_scope' => 0,
            'note' => 'failure_events table unavailable',
        ];
    }

    // 1) failure event without an asset - cannot belong to any scope
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM failure_events WHERE created_at BETWEEN ? AND ? AND asset_id IS NULL',
        [$start, $end]
    );
    $add('FAILURE_NO_ASSET', 'critical', $c, 'MTBF,FAILURE_RATE',
        'failure events raised without an asset cannot be attributed',
        rel_dq_sample($pdo, 'SELECT id FROM failure_events WHERE created_at BETWEEN ? AND ? AND asset_id IS NULL',
            [$start, $end]));

    // 2) failure event with no timestamp - MTBF cannot use a row without a time
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM failure_events WHERE created_at BETWEEN ? AND ? AND failure_date IS NULL',
        [$start, $end]
    );
    $add('MISSING_FAILURE_TS', 'warning', $c, 'MTBF,FAILURE_FREQUENCY',
        'failure events without failure_date are excluded from time-based KPIs',
        rel_dq_sample($pdo, 'SELECT id FROM failure_events WHERE created_at BETWEEN ? AND ? AND failure_date IS NULL',
            [$start, $end]));

    // 3) unclassified failure - cannot be attributed to a failure mode
    if (($cfg['need_classification'] ?? true) === true) {
        $c = (int)rel_dq_count(
            $pdo,
            "SELECT COUNT(*) FROM failure_events WHERE failure_date BETWEEN ? AND ?" . $inScope . ' AND failure_mode_id IS NULL',
            [$start, $end]
        );
        $add('FAILURE_NO_CLASSIFICATION', 'warning', $c, 'FAILURE_MODE_MIX,REPEAT_FAILURE_RATE',
            'failures without failure_mode_id are reported as unclassified, never as "none"',
            rel_dq_sample($pdo, 'SELECT id FROM failure_events WHERE failure_date BETWEEN ? AND ?' . $inScope . ' AND failure_mode_id IS NULL',
                [$start, $end]));
    }

    // 4) linked repair never restored - failure with no restoration timestamp
    $inScopeFe = rel_id_in($ids, 'fe.asset_id');
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM failure_events fe
           JOIN repair r ON r.id = fe.repair_id
          WHERE fe.failure_date BETWEEN ? AND ?' . $inScopeFe . ' AND r.completed_at IS NULL',
        [$start, $end]
    );
    $add('MISSING_RESTORATION_TS', 'critical', $c, 'MTTR,AVAILABILITY_OBSERVED',
        'failures whose linked work order has no completed_at - repair time is unknowable',
        rel_dq_sample($pdo, 'SELECT fe.id FROM failure_events fe JOIN repair r ON r.id = fe.repair_id
              WHERE fe.failure_date BETWEEN ? AND ?' . $inScopeFe . ' AND r.completed_at IS NULL',
            [$start, $end]));

    // 5) impossible time sequence
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM repair
          WHERE created_at BETWEEN ? AND ?' . $inScope . '
            AND ((actual_start_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at < actual_start_at)
                 OR (downtime_start IS NOT NULL AND downtime_end IS NOT NULL AND downtime_end < downtime_start))',
        [$start, $end]
    );
    $add('INVALID_TIME_SEQUENCE', 'critical', $c, 'MTTR,DOWNTIME',
        'work orders whose end timestamp precedes their start - excluded from time KPIs',
        rel_dq_sample($pdo, 'SELECT id FROM repair WHERE created_at BETWEEN ? AND ?' . $inScope . '
              AND ((actual_start_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at < actual_start_at)
                 OR (downtime_start IS NOT NULL AND downtime_end IS NOT NULL AND downtime_end < downtime_start))',
            [$start, $end]));

    // 6) negative downtime
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM repair WHERE created_at BETWEEN ? AND ?' . $inScope . ' AND downtime_minutes < 0',
        [$start, $end]
    );
    $add('NEGATIVE_DOWNTIME', 'critical', $c, 'DOWNTIME,AVAILABILITY_OBSERVED',
        'negative downtime would inflate availability',
        rel_dq_sample($pdo, 'SELECT id FROM repair WHERE created_at BETWEEN ? AND ?' . $inScope . ' AND downtime_minutes < 0',
            [$start, $end]));

    // 7) duplicated failure events (same asset, instant and mode)
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COALESCE(SUM(cnt - 1), 0) FROM (
            SELECT COUNT(*) AS cnt FROM failure_events
             WHERE failure_date BETWEEN ? AND ?' . $inScope . '
             GROUP BY asset_id, failure_date, failure_mode_id
            HAVING COUNT(*) > 1
         ) d',
        [$start, $end]
    );
    $add('DUPLICATE_FAILURE_EVENT', 'warning', $c, 'MTBF,FAILURE_FREQUENCY',
        'duplicate failure rows inflate the failure count and shrink MTBF',
        [], false);

    // 8) duplicated work-order numbers inside one asset
    $c = (int)rel_dq_count(
        $pdo,
        "SELECT COALESCE(SUM(cnt - 1), 0) FROM (
            SELECT COUNT(*) AS cnt FROM repair
             WHERE work_order_no IS NOT NULL AND work_order_no <> ''
             GROUP BY asset_id, work_order_no
            HAVING COUNT(*) > 1
         ) d",
        []
    );
    $add('DUPLICATE_WORK_ORDER', 'info', $c, 'DOWNTIME,MAINT_COST_PER_OP_HOUR',
        'repeated work-order numbers - kept, because the id is the real identity',
        [], false);

    // 9) closed work order with no completion timestamp
    $doneList = "'" . implode("','", RL_DONE_STATUSES) . "'";
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM repair
          WHERE status IN (' . $doneList . ') AND created_at BETWEEN ? AND ?' . $inScope . ' AND completed_at IS NULL',
        [$start, $end]
    );
    $add('CLOSED_WO_NO_COMPLETION_TS', 'warning', $c, 'MTTR',
        'finished work orders without completed_at - MTTR counts only rows with both timestamps',
        rel_dq_sample($pdo, 'SELECT id FROM repair WHERE status IN (' . $doneList . ')
              AND created_at BETWEEN ? AND ?' . $inScope . ' AND completed_at IS NULL',
            [$start, $end]));

    // 10) alarm pointing at a failure event of another asset
    $c = (int)rel_dq_count(
        $pdo,
        'SELECT COUNT(*) FROM iot_alarms al
           JOIN failure_events fe ON fe.id = al.linked_failure_event_id
          WHERE al.first_detected_at BETWEEN ? AND ?
            AND (fe.asset_id IS NULL OR fe.asset_id <> al.asset_id)',
        [$start, $end]
    );
    $add('WRONG_ASSET_ASSOCIATION', 'critical', $c, 'ALARM_FREQUENCY,FAILURE_FREQUENCY',
        'alarms linked to another asset\'s failure event',
        rel_dq_sample($pdo, 'SELECT al.id FROM iot_alarms al JOIN failure_events fe ON fe.id = al.linked_failure_event_id
              WHERE al.first_detected_at BETWEEN ? AND ?
                AND (fe.asset_id IS NULL OR fe.asset_id <> al.asset_id)',
            [$start, $end]));

    // 11) breakdown events with no production impact recorded
    $c = (int)rel_dq_count(
        $pdo,
        "SELECT COUNT(*) FROM failure_events
          WHERE failure_date BETWEEN ? AND ?" . $inScope . '
            AND production_impact IS NULL',
        [$start, $end]
    );
    $add('MISSING_DOWNTIME_REASON', 'warning', $c, 'DOWNTIME,AVAILABILITY_OBSERVED',
        'failures without production_impact - downtime can exist without a reason code',
        rel_dq_sample($pdo, 'SELECT id FROM failure_events WHERE failure_date BETWEEN ? AND ?' . $inScope . ' AND production_impact IS NULL',
            [$start, $end]));

    // 12) in-scope assets with no operating-hours record at all
    if ($ids !== []) {
        $whereScope = implode(' AND ', $scope['where']);
        $paramsScope = $scope['params'];
        $c = (int)rel_dq_count(
            $pdo,
            'SELECT COUNT(*) FROM asset_registry a
              WHERE ' . $whereScope . '
                AND NOT EXISTS (SELECT 1 FROM production_hours ph
                                 WHERE ph.asset_id = a.id AND ph.record_date BETWEEN ? AND ?)',
            array_merge($paramsScope, [$dStart, $dEnd])
        );
        $add('MISSING_OPERATING_HOURS', 'warning', $c, 'MTBF,FAILURE_RATE,AVAILABILITY_OBSERVED',
            'assets in scope with no production_hours record in the window - excluded from uptime KPIs',
            [], false);
    }

    $critical = 0;
    $warning = 0;
    $info = 0;
    $excluded = 0;
    $flags = [];
    foreach ($checks as $ck) {
        if ($ck['severity'] === 'critical') {
            $critical += $ck['count'];
        } elseif ($ck['severity'] === 'warning') {
            $warning += $ck['count'];
        } else {
            $info += $ck['count'];
        }
        if ($ck['excluded']) {
            $excluded += $ck['count'];
        }
        if (in_array($ck['check_code'], ['DUPLICATE_FAILURE_EVENT', 'DUPLICATE_WORK_ORDER'], true)) {
            $flags[] = RL_DQ_DUPLICATE;
        }
    }
    $flags = array_values(array_unique($flags));

    if ($checks === []) {
        $status = RL_DQ_COMPLETE;
    } elseif ($critical > 0 || $warning > 0) {
        $status = RL_DQ_PARTIAL;
    } else {
        $status = RL_DQ_COMPLETE;
    }

    return [
        'status'            => $status,
        'flags'             => $flags,
        'checks'            => $checks,
        'critical'          => $critical,
        'warning'           => $warning,
        'info'              => $info,
        'excluded'          => $excluded,
        'failures_in_scope' => $failuresInScope,
        'note'              => $excluded > 0
            ? $excluded . ' row(s) excluded from at least one KPI and listed here'
            : 'no data-quality problem detected in this window',
    ];
}


/**
 * Persist DQ findings for this run so an engineer can drill from a KPI into the
 * offending rows later. Bounded by reliability_dq_max_findings.
 */
function rel_store_dq_findings(PDO $pdo, array $dq, array $scope, array $period, array $cfg = []): int {
    $cfg = $cfg ?: [];
    if (($cfg['dq_store_findings'] ?? true) !== true) {
        return 0;
    }
    $max = (int)($cfg['dq_max_findings'] ?? 500);
    $runUid = rel_uuid();
    $st = $pdo->prepare('INSERT INTO reliability_data_quality_findings
        (run_uid, check_code, severity, source_table, source_id, asset_id, affected_kpi, detail, observed_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $written = 0;
    try {
        foreach ($dq['checks'] ?? [] as $ck) {
            $table = rel_dq_source_table((string)$ck['check_code']);
            $ids = $ck['sample_ids'] ?? [];
            $rows = $ids !== [] ? $ids : [''];
            foreach ($rows as $rid) {
                if ($written >= $max) {
                    break 2;
                }
                $st->execute([
                    $runUid,
                    (string)$ck['check_code'],
                    (string)$ck['severity'],
                    $table,
                    (string)$rid,
                    null,
                    (string)$ck['affected_kpi'],
                    (string)$ck['detail'],
                    'count=' . (string)$ck['count'],
                ]);
                $written++;
            }
        }
    } catch (Throwable $e) {
        // A missing findings table must never break the calculation itself.
        return $written;
    }
    return $written;
}


/** Which physical table a DQ check reads from (for the drill-down link). */
function rel_dq_source_table(string $checkCode): string {
    $map = [
        'FAILURE_NO_ASSET'            => 'failure_events',
        'MISSING_FAILURE_TS'          => 'failure_events',
        'FAILURE_NO_CLASSIFICATION'   => 'failure_events',
        'MISSING_RESTORATION_TS'      => 'repair',
        'INVALID_TIME_SEQUENCE'       => 'repair',
        'NEGATIVE_DOWNTIME'           => 'repair',
        'DUPLICATE_FAILURE_EVENT'     => 'failure_events',
        'DUPLICATE_WORK_ORDER'        => 'repair',
        'CLOSED_WO_NO_COMPLETION_TS'  => 'repair',
        'WRONG_ASSET_ASSOCIATION'     => 'iot_alarms',
        'MISSING_DOWNTIME_REASON'     => 'failure_events',
        'MISSING_OPERATING_HOURS'     => 'production_hours',
    ];
    return $map[$checkCode] ?? '';
}

/* ===========================================================================
 * 5. OPERATING TIME (the denominator every rate depends on)
 * =========================================================================== */


/** Share of the criteria inputs that actually exist for an asset (0-100). */
function rel_bad_actor_completeness(array $metrics): float {
    $have = 0;
    $total = 3;
    if (($metrics['failure_count'] ?? null) !== null) {
        $have++;
    }
    if (($metrics['downtime_hours'] ?? null) !== null) {
        $have++;
    }
    if (($metrics['failure_rate_per_1000h'] ?? null) !== null || ($metrics['availability_pct'] ?? null) !== null) {
        $have++;
    }
    return round(($have / $total) * 100.0, 2);
}

/* ===========================================================================
 * 18. CALCULATION LINEAGE (snapshots)
 * =========================================================================== */


/** Persisted DQ findings, newest first, with the KPI each one would distort. */
function rel_report_data_quality(PDO $pdo, array $opts = []): array {
    $limit = max(1, min(1000, (int)($opts['limit'] ?? 200)));
    $openOnly = (bool)($opts['open_only'] ?? true);
    try {
        $sql = 'SELECT f.*, a.code AS asset_code, a.name AS asset_name
                  FROM reliability_data_quality_findings f
             LEFT JOIN asset_registry a ON a.id = f.asset_id
                 WHERE 1=1';
        $params = [];
        if ($openOnly) {
            $sql .= ' AND f.resolved_at IS NULL';
        }
        if (($opts['check_code'] ?? '') !== '') {
            $sql .= ' AND f.check_code = ?';
            $params[] = (string)$opts['check_code'];
        }
        $sql .= ' ORDER BY f.detected_at DESC LIMIT ' . $limit;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return ['rows' => [], 'status' => RL_DQ_NOT_ENOUGH, 'note' => 'findings table unavailable'];
    }
    return [
        'rows'   => $rows,
        'count'  => count($rows),
        'by_check' => array_count_values(array_map(static fn($r) => (string)$r['check_code'], $rows)),
        'status' => $rows === [] ? RL_DQ_COMPLETE : RL_DQ_PARTIAL,
        'note'   => 'each finding is drillable to the offending source row',
    ];
}


