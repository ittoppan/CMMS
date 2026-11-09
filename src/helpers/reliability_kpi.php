<?php
/* Split from src/helpers/reliability.php (2026-10-17) - always loaded via reliability.php */

/**
 * Read a KPI definition (current version unless $version is given).
 * Returns null when the code is unknown - callers must then report
 * NOT_ENOUGH_DATA rather than inventing a formula.
 */
function rel_kpi_definition(PDO $pdo, string $kpiCode, ?int $version = null): ?array {
    try {
        if ($version !== null && $version > 0) {
            $st = $pdo->prepare('SELECT * FROM reliability_kpi_definitions
                                 WHERE kpi_code = ? AND version = ? LIMIT 1');
            $st->execute([$kpiCode, $version]);
        } else {
            $st = $pdo->prepare('SELECT * FROM reliability_kpi_definitions
                                 WHERE kpi_code = ? AND is_current = 1 LIMIT 1');
            $st->execute([$kpiCode]);
        }
        $row = $st->fetch();
        return $row ? $row : null;
    } catch (Throwable $e) {
        return null;
    }
}


/** Full definition list, current versions first. */
function rel_kpi_definitions(PDO $pdo, bool $allVersions = false): array {
    try {
        $sql = 'SELECT * FROM reliability_kpi_definitions';
        if (!$allVersions) {
            $sql .= ' WHERE is_current = 1';
        }
        $sql .= ' ORDER BY kpi_code ASC, version DESC';
        return $pdo->query($sql)->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}


/**
 * Attach a definition to a KPI result so the UI can always answer
 * "which formula produced this number".
 */
function rel_kpi_envelope(PDO $pdo, string $kpiCode, ?array $result): array {
    $def = rel_kpi_definition($pdo, $kpiCode);
    if ($result === null) {
        return [
            'kpi_code'   => $kpiCode,
            'value'      => null,
            'unit'       => '',
            'status'     => RL_DQ_NOT_ENOUGH,
            'note'       => 'definition or data unavailable',
            'definition' => $def ? [
                'id'                 => (int)$def['id'],
                'version'            => (int)$def['version'],
                'name_en'            => $def['name_en'],
                'name_th'            => $def['name_th'],
                'formula_display'    => $def['formula_display'],
                'unit'               => $def['unit'],
                'numerator'          => $def['numerator'],
                'denominator'        => $def['denominator'],
                'data_sources'       => $def['data_sources'],
                'population'         => $def['population'],
                'exclusions'         => $def['exclusions'],
                'date_basis'         => $def['date_basis'],
                'operating_basis'    => $def['operating_basis'],
                'repair_time_basis'  => $def['repair_time_basis'],
                'limitations'        => $def['limitations'],
            ] : null,
        ];
    }
    $result['definition'] = $def ? [
        'id'                => (int)$def['id'],
        'version'           => (int)$def['version'],
        'name_en'           => $def['name_en'],
        'name_th'           => $def['name_th'],
        'formula_display'   => $def['formula_display'],
        'unit'              => $def['unit'],
        'numerator'         => $def['numerator'],
        'denominator'       => $def['denominator'],
        'data_sources'      => $def['data_sources'],
        'population'        => $def['population'],
        'exclusions'        => $def['exclusions'],
        'date_basis'        => $def['date_basis'],
        'operating_basis'   => $def['operating_basis'],
        'repair_time_basis' => $def['repair_time_basis'],
        'limitations'       => $def['limitations'],
    ] : null;
    return $result;
}


/**
 * Operating hours for the declared basis.
 *
 * Result contract: hours is NULL when no source can support the basis. `rows`
 * is the number of source rows behind it, `assumption` marks a number that
 * depends on a stated assumption rather than a record.
 */
function rel_operating_hours(PDO $pdo, array $scope, array $period, string $basis, array $cfg = [], ?array $downtime = null): array {
    $cfg = $cfg ?: [];
    $basis = in_array($basis, RL_BASES, true) ? $basis : ($cfg['operating_basis'] ?? 'production');
    $ids = $scope['asset_ids'] ?? [];
    $start = $period['start'];
    $end = $period['end'];
    $dStart = substr($start, 0, 10);
    $dEnd = substr($end, 0, 10);
    $periodHours = max(0.0, (($period['end_ts'] - $period['start_ts']) / 3600) + (3600 / 86400));

    $out = [
        'basis'        => $basis,
        'hours'        => null,
        'rows'         => 0,
        'assumption'   => false,
        'assets_covered' => 0,
        'assets_in_scope' => count($ids),
        'sources'      => [],
        'note'         => '',
        'status'       => RL_DQ_NOT_ENOUGH,
    ];

    if ($ids === []) {
        $out['note'] = 'scope contains no asset';
        return $out;
    }
    $inScope = rel_id_in($ids, 'asset_id');

    switch ($basis) {
        case 'production':
            $rows = 0;
            $hours = 0.0;
            try {
                $st = $pdo->prepare('SELECT COALESCE(SUM(hours),0) AS h, COUNT(*) AS c,
                                            COUNT(DISTINCT asset_id) AS ac
                                     FROM production_hours
                                    WHERE record_date BETWEEN ? AND ?' . $inScope);
                $st->execute([$dStart, $dEnd]);
                $r = $st->fetch() ?: [];
                $hours = (float)($r['h'] ?? 0);
                $rows = (int)($r['c'] ?? 0);
                $out['assets_covered'] = (int)($r['ac'] ?? 0);
            } catch (Throwable $e) {
                $out['note'] = 'production_hours unavailable';
                return $out;
            }
            $out['hours'] = $hours > 0 ? $hours : null;
            $out['rows'] = $rows;
            $out['sources'] = ['production_hours.hours'];
            $out['status'] = ($out['hours'] === null) ? RL_DQ_NOT_ENOUGH : RL_DQ_COMPLETE;
            $out['note'] = $rows === 0
                ? 'no production_hours recorded in this window'
                : 'recorded production hours';
            return $out;

        case 'declared':
            $y1 = (int)substr($start, 0, 4);
            $m1 = (int)substr($start, 5, 2);
            $y2 = (int)substr($end, 0, 4);
            $m2 = (int)substr($end, 5, 2);
            $hours = 0.0;
            $rows = 0;
            try {
                $st = $pdo->prepare('SELECT COALESCE(SUM(operating_hours),0) AS h, COUNT(*) AS c,
                                            COUNT(DISTINCT asset_id) AS ac
                                     FROM mtbf_mttr
                                    WHERE (year * 100 + month) BETWEEN ? AND ?' . $inScope);
                $st->execute([$y1 * 100 + $m1, $y2 * 100 + $m2]);
                $r = $st->fetch() ?: [];
                $hours = (float)($r['h'] ?? 0);
                $rows = (int)($r['c'] ?? 0);
                $out['assets_covered'] = (int)($r['ac'] ?? 0);
            } catch (Throwable $e) {
                $out['note'] = 'mtbf_mttr unavailable';
                return $out;
            }
            $out['hours'] = $hours > 0 ? $hours : null;
            $out['rows'] = $rows;
            $out['sources'] = ['mtbf_mttr.operating_hours'];
            $out['status'] = ($out['hours'] === null) ? RL_DQ_NOT_ENOUGH : RL_DQ_PARTIAL;
            $out['note'] = 'monthly declared operating hours; partial month boundaries are counted whole';
            return $out;

        case 'runtime':
            $factorChecks = [];
            try {
                $st = $pdo->prepare(
                    'SELECT p.id, p.engineering_unit, p.raw_unit, p.signal_type,
                            (SELECT r.last_value FROM iot_rollups r
                              WHERE r.point_id = p.id AND r.bucket_size = "daily"
                                AND r.bucket_start BETWEEN ? AND ?
                              ORDER BY r.bucket_start DESC LIMIT 1) AS end_val,
                            (SELECT r.last_value FROM iot_rollups r
                              WHERE r.point_id = p.id AND r.bucket_size = "daily"
                                AND r.bucket_start < ?
                              ORDER BY r.bucket_start DESC LIMIT 1) AS base_val
                       FROM iot_points p
                       JOIN iot_devices d ON d.id = p.device_id
                      WHERE p.enabled = 1 AND p.signal_type IN ("runtime","cycle_count")'
                        . ' AND d.asset_id IN (' . implode(',', array_map('intval', $ids)) . ')'
                );
                $st->execute([$start, $end, $start]);
                $points = $st->fetchAll();
            } catch (Throwable $e) {
                $points = [];
            }
            $hours = 0.0;
            $used = 0;
            $assets = [];
            foreach ($points as $p) {
                $f = rel_unit_to_hours((string)($p['engineering_unit'] ?: ''))
                    ?? rel_unit_to_hours((string)($p['raw_unit'] ?? ''));
                if ($f === null || $p['end_val'] === null) {
                    continue;
                }
                $base = ($p['base_val'] === null) ? 0.0 : (float)$p['base_val'];
                $delta = ((float)$p['end_val']) - $base;
                if ($delta <= 0) {
                    continue;
                }
                $hours += $delta * $f;
                $used++;
                $factorChecks[] = [
                    'point_id' => (int)$p['id'],
                    'unit'     => (string)($p['engineering_unit'] ?: $p['raw_unit']),
                    'delta'    => $delta,
                    'hours'    => round($delta * $f, 4),
                ];
            }
            $out['hours'] = $hours > 0 ? $hours : null;
            $out['rows'] = $used;
            $out['sources'] = ['iot_rollups.last_value', 'iot_points.signal_type=runtime'];
            $out['evidence'] = array_slice($factorChecks, 0, 20);
            $out['status'] = ($out['hours'] === null) ? RL_DQ_NOT_ENOUGH : RL_DQ_PARTIAL;
            $out['assumption'] = $out['hours'] !== null;
            $out['note'] = $out['hours'] === null
                ? 'no runtime counter series covering this window'
                : 'runtime read as a cumulative counter; if the device reports per-interval increments this basis is wrong and must be switched to declared';
            return $out;

        case 'interval':
            $dt = is_array($downtime) ? (float)($downtime['hours'] ?? 0) : 0.0;
            $hasDt = is_array($downtime) && (int)($downtime['rows'] ?? 0) > 0;
            if ($hasDt) {
                $uptime = $periodHours - $dt;
                $out['hours'] = $uptime > 0 ? $uptime : null;
                $out['rows'] = (int)($downtime['rows'] ?? 0);
                $out['sources'] = ['repair.downtime_minutes'];
                $out['status'] = $out['hours'] === null ? RL_DQ_NOT_ENOUGH : RL_DQ_PARTIAL;
                $out['note'] = 'interval basis: observation window minus recorded downtime; assumes the asset ran whenever it was not recorded down';
                return $out;
            }
            $out['note'] = 'no recorded downtime in this window, so an interval basis cannot separate uptime from idle time';
            return $out;

        case 'calendar':
            if (($cfg['calendar_allowed_now'] ?? false) !== true) {
                $out['note'] = 'calendar basis is an ASSUMPTION and is disabled (reliability_allow_calendar_basis = 0)';
                return $out;
            }
            $out['hours'] = $periodHours * count($ids);
            $out['rows'] = count($ids);
            $out['sources'] = ['ASSUMPTION: calendar window x asset count'];
            $out['status'] = RL_DQ_PARTIAL;
            $out['assumption'] = true;
            $out['note'] = 'ASSUMPTION: 100% uptime across the whole calendar window. Not a measurement.';
            return $out;
    }

    $out['note'] = 'unknown operating basis';
    return $out;
}

/* ===========================================================================
 * 6. FAILURE SOURCE
 *
 * failure_events (Phase 27) is the authoritative failure record. When it is
 * empty the engine falls back to breakdown work orders and SAYS SO in every
 * result. The two sources are never merged.
 * =========================================================================== */


/** Decide which failure source is available for this scope and window. */
function rel_failure_source(PDO $pdo, array $scope, array $period): array {
    $start = $period['start'];
    $end = $period['end'];
    $inScope = rel_id_in($scope['asset_ids'] ?? [], 'asset_id');
    $out = [
        'table'       => 'failure_events',
        'is_fallback' => false,
        'label'       => 'failure_events (Phase 27)',
        'count'       => 0,
        'note'        => '',
    ];

    $fe = (int)rel_dq_count($pdo,
        'SELECT COUNT(*) FROM failure_events WHERE failure_date BETWEEN ? AND ?' . $inScope,
        [$start, $end]);

    if ($fe > 0) {
        $out['count'] = $fe;
        $out['note'] = 'primary failure source in use';
        return $out;
    }

    $bd = (int)rel_dq_count($pdo,
        'SELECT COUNT(*) FROM repair
          WHERE created_at BETWEEN ? AND ? AND ' . RL_BREAKDOWN_SQL
            . ' AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . $inScope,
        [$start, $end]);

    if ($bd > 0) {
        $out['table'] = 'repair';
        $out['is_fallback'] = true;
        $out['label'] = 'repair breakdown work orders (fallback)';
        $out['count'] = $bd;
        $out['note'] = 'no failure event recorded in this window; breakdown work orders are used as the failure population and the KPI is marked as a fallback';
        return $out;
    }

    $out['count'] = 0;
    $out['note'] = $fe < 0
        ? 'failure_events table unavailable'
        : 'no failure event and no breakdown work order in this window';
    return $out;
}


/**
 * Normalised failure rows for the scope and window.
 *
 * Every consumer (MTBF, MTTR, Pareto, Weibull, bad actors, trend) reads the
 * same list, so no two screens can disagree about "which failures".
 */
function rel_failure_events(PDO $pdo, array $scope, array $period, array $source, array $cfg = []): array {
    $cfg = $cfg ?: [];
    $start = $period['start'];
    $end = $period['end'];
    $ids = $scope['asset_ids'] ?? [];
    $limit = (int)($cfg['weibull_max_failures'] ?? 5000);
    $limit = max(1, min($limit, (int)($cfg['export_row_limit'] ?? 50000)));

    if ($ids === []) {
        return [];
    }

    $rows = [];
    try {
        if (($source['table'] ?? '') === 'repair') {
            $inScope = rel_id_in($ids, 'r.asset_id');
            $sql = 'SELECT r.id AS id, r.id AS ref, r.asset_id AS asset_id, a.code AS asset_code,
                           r.work_order_no AS event_code,
                           COALESCE(r.downtime_start, r.actual_start_at, r.created_at) AS ts,
                           COALESCE(r.downtime_end, r.completed_at) AS restored_at,
                           fc.code AS mode_code, fc.name AS mode_name,
                           NULL AS type_code, NULL AS cause_code,
                           r.priority AS severity,
                           NULL AS production_impact,
                           r.downtime_minutes AS downtime_minutes,
                           0 AS repeat_suspected, 0 AS rca_required,
                           r.id AS repair_id, r.completed_at AS repair_completed_at,
                           r.actual_start_at AS started_at
                      FROM repair r
                      JOIN asset_registry a ON a.id = r.asset_id
                 LEFT JOIN failure_codes fc ON fc.id = r.failure_code_id
                     WHERE r.created_at BETWEEN ? AND ? AND ' . RL_BREAKDOWN_SQL
                       . ' AND r.status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')'
                       . $inScope . '
                     ORDER BY ts ASC
                     LIMIT ' . $limit;
            $st = $pdo->prepare($sql);
            $st->execute([$start, $end]);
        } else {
            $inScope = rel_id_in($ids, 'fe.asset_id');
            $sql = 'SELECT fe.id AS id, fe.id AS ref, fe.asset_id AS asset_id, a.code AS asset_code,
                           fe.event_code AS event_code, fe.failure_date AS ts,
                           r.completed_at AS restored_at,
                           fm.code AS mode_code, fm.name AS mode_name,
                           ft.code AS type_code, fcs.code AS cause_code,
                           fe.severity AS severity, fe.production_impact AS production_impact,
                           fe.downtime_minutes AS downtime_minutes,
                           fe.repeat_suspected AS repeat_suspected, fe.rca_required AS rca_required,
                           fe.repair_id AS repair_id, r.completed_at AS repair_completed_at,
                           r.actual_start_at AS started_at
                      FROM failure_events fe
                 LEFT JOIN asset_registry a ON a.id = fe.asset_id
                 LEFT JOIN failure_modes fm ON fm.id = fe.failure_mode_id
                 LEFT JOIN failure_types ft ON ft.id = fe.failure_type_id
                 LEFT JOIN failure_causes fcs ON fcs.id = fe.cause_id
                 LEFT JOIN repair r ON r.id = fe.repair_id
                     WHERE fe.failure_date BETWEEN ? AND ?' . $inScope . '
                     ORDER BY fe.failure_date ASC
                     LIMIT ' . $limit;
            $st = $pdo->prepare($sql);
            $st->execute([$start, $end]);
        }
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }

    $out = [];
    foreach ($rows as $r) {
        $ts = (string)($r['ts'] ?? '');
        $tsTs = $ts === '' ? false : strtotime($ts);
        $restored = (string)($r['restored_at'] ?? '');
        $restTs = $restored === '' ? false : strtotime($restored);
        $downtime = $r['downtime_minutes'] === null ? null : (int)$r['downtime_minutes'];

        $issues = [];
        if ($ts === '' || $tsTs === false) {
            $issues[] = 'MISSING_FAILURE_TS';
        }
        if ($tsTs !== false && $tsTs > $period['end_ts']) {
            $issues[] = 'OUT_OF_WINDOW';
        }
        if ($restTs !== false && $tsTs !== false && $restTs < $tsTs) {
            $issues[] = 'INVALID_TIME_SEQUENCE';
        }
        if ($downtime !== null && $downtime < 0) {
            $issues[] = 'NEGATIVE_DOWNTIME';
        }

        $out[] = [
            'id'                => (int)$r['id'],
            'ref'               => (string)($r['event_code'] ?? ''),
            'asset_id'          => $r['asset_id'] === null ? null : (int)$r['asset_id'],
            'asset_code'        => (string)($r['asset_code'] ?? ''),
            'ts'                => $ts,
            'ts_ts'             => $tsTs === false ? null : $tsTs,
            'restored_at'       => $restored,
            'restored_ts'       => $restTs === false ? null : $restTs,
            'mode_code'         => (string)($r['mode_code'] ?? ''),
            'mode_name'         => (string)($r['mode_name'] ?? ''),
            'type_code'         => (string)($r['type_code'] ?? ''),
            'cause_code'        => (string)($r['cause_code'] ?? ''),
            'severity'          => (string)($r['severity'] ?? ''),
            'production_impact' => (string)($r['production_impact'] ?? ''),
            'downtime_minutes'  => $downtime,
            'repeat_suspected'  => (int)($r['repeat_suspected'] ?? 0),
            'rca_required'      => (int)($r['rca_required'] ?? 0),
            'repair_id'         => $r['repair_id'] === null ? null : (int)$r['repair_id'],
            'started_at'        => (string)($r['started_at'] ?? ''),
            'classified'        => ((string)($r['mode_code'] ?? '')) !== '',
            'issues'            => $issues,
            'valid'             => $issues === [],
        ];
    }
    return $out;
}


/** Split a failure list into usable rows and rows dropped by DQ. */
function rel_failure_split(array $failures): array {
    $valid = [];
    $invalid = [];
    foreach ($failures as $f) {
        if (!empty($f['valid'])) {
            $valid[] = $f;
        } else {
            $invalid[] = $f;
        }
    }
    return ['valid' => $valid, 'invalid' => $invalid];
}

/* ===========================================================================
 * 7. CORE KPIs
 * =========================================================================== */


/**
 * Build the shared calculation context. Every public KPI function takes this
 * so a screen never recomputes the denominator differently from another screen.
 */
function rel_context(PDO $pdo, array $opts = [], ?array $cfg = null, ?array $period = null, ?array $scope = null): array {
    $opts['__pdo'] = $pdo;
    $cfg = $cfg ?: rel_config($pdo);
    $period = $period ?: rel_period($opts, $cfg);
    $scope = $scope ?: rel_scope($pdo, $opts);

    $basis = strtolower(trim((string)($opts['operating_basis'] ?? $cfg['operating_basis'])));
    if (!in_array($basis, RL_BASES, true)) {
        $basis = (string)$cfg['operating_basis'];
    }
    if ($basis === 'calendar' && ($cfg['calendar_allowed_now'] ?? false) !== true) {
        $basis = 'production';
    }

    $repairBasis = strtolower(trim((string)($opts['repair_time_basis'] ?? $cfg['repair_time_basis'])));
    if (!in_array($repairBasis, RL_REPAIR_BASES, true)) {
        $repairBasis = (string)$cfg['repair_time_basis'];
    }

    $source = rel_failure_source($pdo, $scope, $period);
    $failures = rel_failure_events($pdo, $scope, $period, $source, $cfg);
    $split = rel_failure_split($failures);
    $dq = rel_dq_checks($pdo, $scope, $period, $cfg);
    $downtime = rel_downtime_aggregate($pdo, $scope, $period, $cfg);
    $op = rel_operating_hours($pdo, $scope, $period, $basis, $cfg, $downtime);

    return [
        'pdo'             => $pdo,
        'opts'            => $opts,
        'cfg'             => $cfg,
        'period'          => $period,
        'scope'           => $scope,
        'basis'           => $basis,
        'repair_basis'    => $repairBasis,
        'source'          => $source,
        'failures'        => $failures,
        'failures_valid'  => $split['valid'],
        'failures_invalid' => $split['invalid'],
        'dq'              => $dq,
        'downtime'        => $downtime,
        'operating'       => $op,
    ];
}


/** Reduce a context to a serialisable payload (used by the API + snapshots). */
function rel_context_meta(array $ctx): array {
    return [
        'period'       => [
            'start'   => $ctx['period']['start'],
            'end'     => $ctx['period']['end'],
            'preset'  => $ctx['period']['preset'],
            'days'    => $ctx['period']['days'],
            'clamped' => $ctx['period']['clamped'],
            'note'    => $ctx['period']['note'],
        ],
        'scope'        => [
            'type'   => $ctx['scope']['type'],
            'id'     => $ctx['scope']['id'],
            'label'  => $ctx['scope']['label'],
            'assets' => $ctx['scope']['asset_count'],
        ],
        'basis'        => [
            'operating'      => $ctx['basis'],
            'repair_time'    => $ctx['repair_basis'],
            'availability'   => 'observed',
            'assumption'     => (bool)($ctx['operating']['assumption'] ?? false),
        ],
        'failure_source' => $ctx['source'],
        'data_quality'  => [
            'status'   => $ctx['dq']['status'],
            'flags'    => $ctx['dq']['flags'],
            'excluded' => $ctx['dq']['excluded'],
            'critical' => $ctx['dq']['critical'],
            'warning'  => $ctx['dq']['warning'],
        ],
        'operating_hours' => [
            'hours'  => rel_round($ctx['operating']['hours'], 4),
            'rows'   => (int)($ctx['operating']['rows'] ?? 0),
            'note'   => (string)($ctx['operating']['note'] ?? ''),
            'source' => (string)($ctx['operating']['sources'][0] ?? ''),
        ],
        'downtime'     => [
            'hours' => rel_round($ctx['downtime']['hours'], 4),
            'rows'  => (int)($ctx['downtime']['rows'] ?? 0),
        ],
        'failures'     => [
            'total'   => count($ctx['failures']),
            'usable'  => count($ctx['failures_valid']),
            'dropped' => count($ctx['failures_invalid']),
            'classified' => count(array_filter($ctx['failures_valid'], static fn($f) => !empty($f['classified']))),
        ],
        'engine'       => RL_VERSION,
    ];
}

/* ===========================================================================
 * 8. DOWNTIME + REPAIR DURATION (raw aggregates)
 * =========================================================================== */


/**
 * Recorded downtime for the window.
 *
 * Downtime is taken from work orders, plus failure events that have their own
 * downtime record AND no linked work order - so a downtime figure is never
 * counted twice for one event.
 */
function rel_downtime_aggregate(PDO $pdo, array $scope, array $period, array $cfg = []): array {
    $ids = $scope['asset_ids'] ?? [];
    $start = $period['start'];
    $end = $period['end'];
    $inScope = rel_id_in($ids, 'asset_id');
    $out = [
        'minutes' => null, 'hours' => null, 'rows' => 0,
        'wo_minutes' => 0.0, 'event_minutes' => 0.0,
        'wo_rows' => 0, 'event_rows' => 0,
        'sources' => ['repair.downtime_minutes', 'failure_events.downtime_minutes (unlinked only)'],
        'note' => '',
    ];
    if ($ids === []) {
        $out['note'] = 'scope contains no asset';
        return $out;
    }
    try {
        $st = $pdo->prepare('SELECT COALESCE(SUM(CASE WHEN downtime_minutes > 0 THEN downtime_minutes ELSE 0 END),0) AS m,
                                    COUNT(CASE WHEN downtime_minutes > 0 THEN 1 END) AS c
                               FROM repair
                              WHERE created_at BETWEEN ? AND ?
                                AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . $inScope);
        $st->execute([$start, $end]);
        $r = $st->fetch() ?: [];
        $out['wo_minutes'] = (float)($r['m'] ?? 0);
        $out['wo_rows'] = (int)($r['c'] ?? 0);

        $st2 = $pdo->prepare('SELECT COALESCE(SUM(CASE WHEN fe.downtime_minutes > 0 THEN fe.downtime_minutes ELSE 0 END),0) AS m,
                                     COUNT(CASE WHEN fe.downtime_minutes > 0 THEN 1 END) AS c
                                FROM failure_events fe
                               WHERE fe.failure_date BETWEEN ? AND ?
                                 AND fe.repair_id IS NULL' . $inScope);
        $st2->execute([$start, $end]);
        $r2 = $st2->fetch() ?: [];
        $out['event_minutes'] = (float)($r2['m'] ?? 0);
        $out['event_rows'] = (int)($r2['c'] ?? 0);
    } catch (Throwable $e) {
        $out['note'] = 'downtime sources unavailable';
        return $out;
    }

    $out['minutes'] = $out['wo_minutes'] + $out['event_minutes'];
    $out['hours'] = $out['minutes'] / 60.0;
    $out['rows'] = $out['wo_rows'] + $out['event_rows'];
    $out['note'] = $out['rows'] === 0
        ? 'no downtime recorded in this window (a missing record, not zero downtime)'
        : 'recorded downtime';
    return $out;
}


/**
 * Repair work orders with a duration computed on the declared MTTR basis.
 *
 * basis:
 *   work_to_complete    completed_at - actual_start_at   (work actually on the machine)
 *   notify_to_restore   completed_at - acknowledged_at|created_at
 *   technician_labor    repair_time_minutes (as recorded by the technician)
 *
 * A row is only measurable when the basis needs a timestamp pair it actually has.
 */
function rel_repair_rows(PDO $pdo, array $scope, array $period, string $basis, array $cfg = []): array {
    $ids = $scope['asset_ids'] ?? [];
    $start = $period['start'];
    $end = $period['end'];
    if ($ids === []) {
        return [];
    }
    $inScope = rel_id_in($ids, 'r.asset_id');
    $doneList = rel_quote_list(RL_DONE_STATUSES);
    $skipList = rel_quote_list(RL_EXCLUDED_STATUSES);

    $fromExpr = match ($basis) {
        'notify_to_restore' => 'r.acknowledged_at',
        'technician_labor'  => 'NULL',
        default             => 'r.actual_start_at',
    };

    $sql = 'SELECT r.id, r.work_order_no, r.asset_id, a.code AS asset_code, r.status, r.priority,
                   r.source_type, r.work_order_type, r.created_at, r.acknowledged_at,
                   r.actual_start_at, r.completed_at, r.repair_time_minutes,
                   r.downtime_minutes, r.downtime_start, r.downtime_end,
                   TIMESTAMPDIFF(MINUTE, ' . $fromExpr . ', r.completed_at) AS basis_minutes
              FROM repair r
              JOIN asset_registry a ON a.id = r.asset_id
             WHERE r.completed_at BETWEEN ? AND ?
               AND r.status IN (' . $doneList . ')
               AND r.status NOT IN (' . $skipList . ')
               AND ' . RL_BREAKDOWN_SQL
               . $inScope . '
             ORDER BY r.completed_at ASC
             LIMIT ' . (int)max(1, min(5000, (int)($cfg['weibull_max_failures'] ?? 5000)));

    try {
        $st = $pdo->prepare($sql);
        $st->execute([$start, $end]);
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }

    $out = [];
    foreach ($rows as $r) {
        $issues = [];
        $minutes = null;
        $from = $r['actual_start_at'] ?? null;
        if ($basis === 'notify_to_restore') {
            $from = $r['acknowledged_at'] ?: $r['created_at'];
        }
        if ($basis === 'technician_labor') {
            if ($r['repair_time_minutes'] === null) {
                $issues[] = 'MISSING_LABOUR_TIME';
            } else {
                $minutes = (float)$r['repair_time_minutes'];
            }
        } else {
            if ($from === null || $r['completed_at'] === null) {
                $issues[] = 'MISSING_TIMESTAMP_PAIR';
            } else {
                $minutes = (float)$r['basis_minutes'];
            }
        }
        if ($minutes !== null && $minutes < 0) {
            $issues[] = 'INVALID_TIME_SEQUENCE';
            $minutes = null;
        }
        if (($r['downtime_minutes'] !== null) && (int)$r['downtime_minutes'] < 0) {
            $issues[] = 'NEGATIVE_DOWNTIME';
        }
        $out[] = [
            'id'               => (int)$r['id'],
            'wo'               => (string)($r['work_order_no'] ?? ''),
            'asset_id'         => (int)$r['asset_id'],
            'asset_code'       => (string)($r['asset_code'] ?? ''),
            'status'           => (string)$r['status'],
            'priority'         => (string)($r['priority'] ?? ''),
            'completed_at'     => (string)($r['completed_at'] ?? ''),
            'minutes'          => $minutes,
            'downtime_minutes' => $r['downtime_minutes'] === null ? null : (int)$r['downtime_minutes'],
            'issues'           => $issues,
            'valid'            => $issues === [],
        ];
    }
    return $out;
}


/**
 * Work orders that are finished but cannot be measured on the given basis.
 *
 * A row is only measurable when the basis has the timestamps it needs:
 *   work_to_complete    -> actual_start_at IS NOT NULL
 *   notify_to_restore   -> acknowledged_at IS NOT NULL
 *   technician_labor    -> repair_time_minutes IS NOT NULL
 * The count is reported as a data-quality note; the row is never dropped
 * silently and never treated as a zero-minute repair.
 */
function rel_repair_missing_pairs(PDO $pdo, array $scope, array $period, string $basis): int {
    $ids = $scope['asset_ids'] ?? [];
    if ($ids === []) {
        return 0;
    }
    $inScope = rel_id_in($ids, 'r.asset_id');
    $needColumn = match ($basis) {
        'notify_to_restore' => 'r.acknowledged_at',
        'technician_labor'  => 'r.repair_time_minutes',
        default             => 'r.actual_start_at',
    };
    $zeroTest = ($basis === 'technician_labor') ? ' OR r.repair_time_minutes <= 0' : '';

    $sql = 'SELECT COUNT(*) FROM repair r
             WHERE r.completed_at BETWEEN ? AND ?
               AND r.status IN (' . rel_quote_list(RL_DONE_STATUSES) . ')
               AND r.status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')
               AND ' . RL_BREAKDOWN_SQL
               . ' AND (' . $needColumn . ' IS NULL' . $zeroTest . ')'
               . $inScope;

    $n = rel_dq_count($pdo, $sql, [$period['start'], $period['end']]);
    return $n < 0 ? 0 : $n;
}


/** Mean time between failures = operating hours / usable failure events. */
function rel_mtbf(PDO $pdo, array $ctx): array {
    $cfg = $ctx['cfg'];
    $failures = $ctx['failures_valid'];
    $count = count($failures);
    $hours = $ctx['operating']['hours'];
    $minFailures = (int)($cfg['min_failures_for_mtbf'] ?? 3);

    $result = [
        'kpi_code' => 'MTBF',
        'unit'     => 'hours',
        'inputs'   => [
            'operating_hours' => rel_round($hours, 4),
            'operating_basis' => $ctx['basis'],
            'failures'        => $count,
            'failure_source'  => $ctx['source']['table'],
            'period_days'     => $ctx['period']['days'],
            'scope_assets'    => $ctx['scope']['asset_count'],
        ],
    ];

    if ($hours === null) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no operating time recorded on basis "' . $ctx['basis'] . '": ' . (string)($ctx['operating']['note'] ?? '');
        return rel_kpi_envelope($pdo, 'MTBF', $result);
    }
    if ($count === 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no usable failure event in the window on source ' . $ctx['source']['label'];
        return rel_kpi_envelope($pdo, 'MTBF', $result);
    }

    $ratio = $hours / $count;
    $result['provisional_value'] = rel_round($ratio, 2);
    $result['value'] = rel_round($ratio, 2);

    if ($count < $minFailures) {
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'only ' . $count . ' usable failure(s); MTBF is published as provisional until '
            . $minFailures . ' are available (reliability_min_failures_for_mtbf)';
    } else {
        $result['status'] = $ctx['dq']['status'] === RL_DQ_COMPLETE ? RL_DQ_COMPLETE : RL_DQ_PARTIAL;
        $result['note'] = 'total operating hours / usable failure events';
        if ($ctx['basis'] === 'declared') {
            $result['note'] .= ' - declared monthly hours, partial months counted whole';
        }
        if ($ctx['basis'] === 'interval') {
            $result['note'] .= ' - interval basis depends on recorded downtime being complete';
        }
    }
    return rel_kpi_envelope($pdo, 'MTBF', $result);
}


/** Mean time to repair on the declared basis, with the distribution attached. */
function rel_mttr(PDO $pdo, array $ctx): array {
    $basis = $ctx['repair_basis'];
    $rows = rel_repair_rows($pdo, $ctx['scope'], $ctx['period'], $basis, $ctx['cfg']);
    $usable = array_values(array_filter($rows, static fn($r) => !empty($r['valid']) && $r['minutes'] !== null));
    $dropped = count($rows) - count($usable);
    $missingPairs = rel_repair_missing_pairs($pdo, $ctx['scope'], $ctx['period'], $basis);
    $values = array_map(static fn($r) => (float)$r['minutes'], $usable);
    sort($values);

    $result = [
        'kpi_code' => 'MTTR',
        'unit'     => 'hours',
        'basis'    => $basis,
        'inputs'   => [
            'repairs_measured' => count($usable),
            'repairs_dropped'  => $dropped,
            'finished_without_needed_timestamp' => $missingPairs,
            'period_days'      => $ctx['period']['days'],
        ],
        'distribution' => null,
    ];

    if ($usable === []) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = $basis === 'technician_labor'
            ? 'no work order in this window recorded repair_time_minutes'
            : 'no completed breakdown work order in this window has both timestamps for basis "' . $basis . '"';
        return rel_kpi_envelope($pdo, 'MTTR', $result);
    }

    $sum = array_sum($values);
    $n = count($values);
    $result['value'] = rel_round($sum / $n / 60.0, 3);
    $result['distribution'] = [
        'count' => $n,
        'mean_hours'   => rel_round($sum / $n / 60.0, 3),
        'median_hours' => rel_round((float)rel_percentile($values, 0.5) / 60.0, 3),
        'p90_hours'    => rel_round((float)rel_percentile($values, 0.9) / 60.0, 3),
        'min_hours'    => rel_round($values[0] / 60.0, 3),
        'max_hours'    => rel_round($values[$n - 1] / 60.0, 3),
        'total_hours'  => rel_round($sum / 60.0, 3),
    ];

    $status = RL_DQ_COMPLETE;
    $notes = ['mean of ' . $n . ' completed repair(s) on basis "' . $basis . '"'];
    if ($dropped > 0 || $missingPairs > 0) {
        $status = RL_DQ_PARTIAL;
        $notes[] = $dropped . ' row(s) excluded and ' . $missingPairs
            . ' finished work order(s) lack the timestamps this basis needs';
    }
    if ($basis !== 'work_to_complete') {
        $status = ($status === RL_DQ_COMPLETE) ? RL_DQ_PARTIAL : $status;
        $notes[] = 'MTTR basis is "' . $basis . '", which is not the same question as work_to_complete';
    }
    $result['status'] = $status;
    $result['note'] = implode('; ', $notes);
    return rel_kpi_envelope($pdo, 'MTTR', $result);
}


/** Failure frequency and failure rate. */
function rel_failure_rate(PDO $pdo, array $ctx): array {
    $count = count($ctx['failures_valid']);
    $hours = $ctx['operating']['hours'];
    $periodDays = max(1, (int)$ctx['period']['days']);

    $result = [
        'kpi_code' => 'FAILURE_RATE',
        'unit'     => 'per_1000_operating_hours',
        'inputs'   => [
            'failures'        => $count,
            'operating_hours' => rel_round($hours, 4),
            'operating_basis' => $ctx['basis'],
            'period_days'     => $periodDays,
        ],
        'frequency' => [
            'count'          => $count,
            'per_day'        => rel_round($count / $periodDays, 4),
            'per_month'      => rel_round($count / max(1, $ctx['period']['months']), 4),
        ],
    ];

    if ($count === 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no usable failure event in the window';
        return rel_kpi_envelope($pdo, 'FAILURE_RATE', $result);
    }
    if ($hours === null || $hours <= 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no operating hours on basis "' . $ctx['basis'] . '", so a rate cannot be computed';
        return rel_kpi_envelope($pdo, 'FAILURE_RATE', $result);
    }

    $per1000 = ($count / $hours) * 1000.0;
    $result['value'] = rel_round($per1000, 4);
    $result['per_operating_hour'] = rel_round($count / $hours, 8);
    $result['status'] = $ctx['dq']['status'] === RL_DQ_COMPLETE ? RL_DQ_COMPLETE : RL_DQ_PARTIAL;
    $result['note'] = ($count / $hours) . ' failures per operating hour, expressed per 1000 h';
    return rel_kpi_envelope($pdo, 'FAILURE_RATE', $result);
}


/**
 * Observed availability = uptime / (uptime + downtime).
 *
 * Inherent availability (Ai) is NOT computed: the data to separate planned
 * delay, quality loss and logistics delay does not exist in this system.
 */
function rel_availability(PDO $pdo, array $ctx): array {
    $uptime = $ctx['operating']['hours'];
    $downtime = $ctx['downtime']['hours'];
    $downRows = (int)($ctx['downtime']['rows'] ?? 0);
    $minEvents = (int)($ctx['cfg']['availability_min_events'] ?? 1);

    $result = [
        'kpi_code' => 'AVAILABILITY_OBSERVED',
        'unit'     => 'percent',
        'flavour'  => 'observed',
        'inputs'   => [
            'uptime_hours'   => rel_round($uptime, 4),
            'downtime_hours' => rel_round($downtime, 4),
            'downtime_rows'  => $downRows,
            'uptime_basis'   => $ctx['basis'],
            'period_days'    => $ctx['period']['days'],
        ],
    ];

    if ($uptime === null) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'uptime needs an operating-hours record; availability is never assumed to be 100%';
        return rel_kpi_envelope($pdo, 'AVAILABILITY_OBSERVED', $result);
    }
    if ($downtime === null || $downRows < $minEvents) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no downtime record in this window, so observed availability cannot be stated';
        return rel_kpi_envelope($pdo, 'AVAILABILITY_OBSERVED', $result);
    }

    $total = $uptime + (float)$downtime;
    $value = rel_div($uptime, $total);
    $result['value'] = $value === null ? null : rel_round($value * 100.0, 3);
    $result['status'] = $ctx['basis'] === 'production' ? RL_DQ_COMPLETE : RL_DQ_PARTIAL;
    $result['note'] = 'observed availability on uptime basis "' . $ctx['basis'] . '". '
        . 'Inherent availability is not computable from recorded data. '
        . 'Downtime includes every recorded downtime minute, planned or unplanned.';
    if ($downRows > 0 && $downtime == 0.0) {
        $result['status'] = RL_DQ_PARTIAL;
        $result['note'] .= ' Zero downtime was recorded across ' . $downRows . ' row(s); treat with suspicion.';
    }
    return rel_kpi_envelope($pdo, 'AVAILABILITY_OBSERVED', $result);
}


/** Total recorded downtime. */
function rel_downtime_kpi(PDO $pdo, array $ctx): array {
    $dt = $ctx['downtime'];
    $result = [
        'kpi_code' => 'DOWNTIME',
        'unit'     => 'minutes',
        'inputs'   => [
            'work_order_minutes' => rel_round((float)$dt['wo_minutes'], 2),
            'unlinked_event_minutes' => rel_round((float)$dt['event_minutes'], 2),
            'rows'                => (int)$dt['rows'],
            'period_days'         => $ctx['period']['days'],
        ],
    ];
    if ((int)$dt['rows'] === 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no downtime recorded in this window';
        return rel_kpi_envelope($pdo, 'DOWNTIME', $result);
    }
    $result['value'] = rel_round((float)$dt['minutes'], 2);
    $result['status'] = RL_DQ_PARTIAL;
    $result['note'] = 'sum of recorded downtime minutes; negative values excluded and reported by DQ check NEGATIVE_DOWNTIME';
    return rel_kpi_envelope($pdo, 'DOWNTIME', $result);
}


/** Repeat-failure rate, only over classified failures. */
function rel_repeat_failure_rate(PDO $pdo, array $ctx): array {
    $valid = $ctx['failures_valid'];
    $classified = array_values(array_filter($valid, static fn($f) => !empty($f['classified'])));
    $repeat = count(array_filter($classified, static fn($f) => !empty($f['repeat_suspected'])));
    $unclassified = count($valid) - count($classified);

    $result = [
        'kpi_code' => 'REPEAT_FAILURE_RATE',
        'unit'     => 'percent',
        'inputs'   => [
            'classified_failures' => count($classified),
            'repeat_suspected'    => $repeat,
            'unclassified'        => $unclassified,
            'failure_source'      => $ctx['source']['table'],
        ],
    ];
    if (count($classified) === 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = ($ctx['source']['table'] === 'repair')
            ? 'breakdown work orders carry no failure_mode_id, so repeat failure cannot be measured on this source'
            : 'no classified failure event in the window';
        return rel_kpi_envelope($pdo, 'REPEAT_FAILURE_RATE', $result);
    }
    $result['value'] = rel_round(($repeat / count($classified)) * 100.0, 2);
    $result['status'] = ($unclassified > 0) ? RL_DQ_PARTIAL : RL_DQ_COMPLETE;
    $result['note'] = $repeat . ' of ' . count($classified) . ' classified failures are flagged repeat-suspected';
    if ($unclassified > 0) {
        $result['note'] .= '; ' . $unclassified . ' unclassified failure(s) excluded from the denominator, never counted as non-repeat';
    }
    return rel_kpi_envelope($pdo, 'REPEAT_FAILURE_RATE', $result);
}


/** Alarm frequency from Phase 36 IoT alarms (never merged into failures). */
function rel_alarm_frequency(PDO $pdo, array $ctx): array {
    $ids = $ctx['scope']['asset_ids'] ?? [];
    $inScope = rel_id_in($ids, 'asset_id');
    $result = [
        'kpi_code' => 'ALARM_FREQUENCY',
        'unit'     => 'count',
        'by_severity' => [],
        'by_status'   => [],
        'inputs'   => ['period_days' => $ctx['period']['days']],
    ];
    if ($ids === []) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'scope contains no asset';
        return rel_kpi_envelope($pdo, 'ALARM_FREQUENCY', $result);
    }
    $total = 0;
    try {
        $st = $pdo->prepare('SELECT severity, status, COUNT(*) AS c, COALESCE(SUM(occurrence_count),0) AS occ
                               FROM iot_alarms
                              WHERE first_detected_at BETWEEN ? AND ?' . $inScope . '
                              GROUP BY severity, status');
        $st->execute([$ctx['period']['start'], $ctx['period']['end']]);
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        $rows = [];
    }
    $bySev = [];
    $byStatus = [];
    $occTotal = 0;
    $suppressed = 0;
    foreach ($rows as $r) {
        $c = (int)$r['c'];
        $total += $c;
        $occTotal += (int)$r['occ'];
        $bySev[(string)$r['severity']] = ($bySev[(string)$r['severity']] ?? 0) + $c;
        $byStatus[(string)$r['status']] = ($byStatus[(string)$r['status']] ?? 0) + $c;
        if ((string)$r['status'] === 'suppressed') {
            $suppressed += $c;
        }
    }
    $result['by_severity'] = $bySev;
    $result['by_status'] = $byStatus;
    $result['occurrence_total'] = $occTotal;
    $result['suppressed'] = $suppressed;
    $result['inputs']['occurrences'] = $occTotal;

    if ($total === 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'no IoT alarm detected in this window (no alarm is not "zero risk", it is an absence of records)';
        return rel_kpi_envelope($pdo, 'ALARM_FREQUENCY', $result);
    }
    $result['value'] = $total;
    $result['per_day'] = rel_round($total / max(1, (int)$ctx['period']['days']), 4);
    $result['status'] = RL_DQ_PARTIAL;
    $result['note'] = $total . ' alarm instance(s), ' . $occTotal . ' breaching sample(s)'
        . ($suppressed > 0 ? '; ' . $suppressed . ' suppressed alarm(s) reported separately' : '')
        . '. An alarm is NOT a failure event and is never counted as one.';
    return rel_kpi_envelope($pdo, 'ALARM_FREQUENCY', $result);
}


/** Maintenance cost per operating hour, with the cost-completeness caveat. */
function rel_cost_per_op_hour(PDO $pdo, array $ctx, int $roleId = 0): array {
    $cfg = $ctx['cfg'];
    $result = [
        'kpi_code' => 'MAINT_COST_PER_OP_HOUR',
        'unit'     => 'currency_per_hour',
        'inputs'   => ['operating_hours' => rel_round($ctx['operating']['hours'], 4)],
    ];
    if (!in_array($roleId, rel_roles_cost(), true) && $roleId !== 0) {
        $result['value'] = null;
        $result['status'] = 'FORBIDDEN';
        $result['note'] = 'cost-derived reliability is restricted';
        return rel_kpi_envelope($pdo, 'MAINT_COST_PER_OP_HOUR', $result);
    }
    $ids = $ctx['scope']['asset_ids'] ?? [];
    if ($ids === []) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'scope contains no asset';
        return rel_kpi_envelope($pdo, 'MAINT_COST_PER_OP_HOUR', $result);
    }
    $inScope = rel_id_in($ids, 'asset_id');
    try {
        $st = $pdo->prepare('SELECT COALESCE(SUM(COALESCE(cost_labor_recorded,0) + COALESCE(cost_outsource_recorded,0)
                                    + COALESCE(parts_cost,0) + COALESCE(cost_parts_snapshot,0)),0) AS cost,
                                   COUNT(*) AS c,
                                   COALESCE(SUM(COALESCE(parts_missing_price,0)),0) AS missing
                              FROM v_maintenance_cost
                             WHERE created_at BETWEEN ? AND ?' . $inScope);
        $st->execute([$ctx['period']['start'], $ctx['period']['end']]);
        $r = $st->fetch() ?: [];
    } catch (Throwable $e) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'v_maintenance_cost unavailable';
        return rel_kpi_envelope($pdo, 'MAINT_COST_PER_OP_HOUR', $result);
    }

    $cost = (float)($r['cost'] ?? 0);
    $rows = (int)($r['c'] ?? 0);
    $missingPrice = (int)($r['missing'] ?? 0);
    $hours = $ctx['operating']['hours'];
    $result['inputs']['cost_rows'] = $rows;
    $result['inputs']['total_cost'] = rel_round($cost, 2);
    $result['inputs']['lines_missing_price'] = $missingPrice;
    $result['total_cost'] = rel_round($cost, 2);

    if ($rows === 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = (string)($cfg['cost_missing_display'] ?? 'DATA_NOT_AVAILABLE');
        return rel_kpi_envelope($pdo, 'MAINT_COST_PER_OP_HOUR', $result);
    }
    if ($hours === null || $hours <= 0) {
        $result['value'] = null;
        $result['status'] = RL_DQ_NOT_ENOUGH;
        $result['note'] = 'cost recorded but no operating hours on basis "' . $ctx['basis'] . '"';
        return rel_kpi_envelope($pdo, 'MAINT_COST_PER_OP_HOUR', $result);
    }

    $result['value'] = rel_round($cost / $hours, 4);
    $result['status'] = $missingPrice > 0 ? RL_DQ_PARTIAL : RL_DQ_COMPLETE;
    $result['note'] = $rows . ' work order(s) with recorded cost';
    if ($missingPrice > 0) {
        $result['note'] .= '; ' . $missingPrice . ' spare-part line(s) have no price, so this cost is understated';
    }
    if ($ctx['basis'] !== 'production') {
        $result['note'] .= '; denominator uses basis "' . $ctx['basis'] . '"';
    }
    return rel_kpi_envelope($pdo, 'MAINT_COST_PER_OP_HOUR', $result);
}


/**
 * The KPI set every reliability screen is allowed to show, each one with its
 * own status, basis and definition attached.
 */
function rel_kpi_bundle(PDO $pdo, array $ctx, int $roleId = 0): array {
    return [
        'meta'        => rel_context_meta($ctx),
        'mtbf'        => rel_mtbf($pdo, $ctx),
        'mttr'        => rel_mttr($pdo, $ctx),
        'failure_rate' => rel_failure_rate($pdo, $ctx),
        'availability' => rel_availability($pdo, $ctx),
        'downtime'    => rel_downtime_kpi($pdo, $ctx),
        'repeat_failure_rate' => rel_repeat_failure_rate($pdo, $ctx),
        'alarm_frequency' => rel_alarm_frequency($pdo, $ctx),
        'cost_per_op_hour' => rel_cost_per_op_hour($pdo, $ctx, $roleId),
    ];
}

/* ===========================================================================
 * 10. FAILURE MODE MIX + PARETO
 * =========================================================================== */


/**
 * Failure-mode mix.
 *
 * Unclassified failures are always their own bucket. They are never folded into
 * "other" and never quietly dropped, because that is how a Pareto chart starts
 * lying about where the losses are.
 */
function rel_failure_modes(PDO $pdo, array $ctx): array {
    $rows = $ctx['failures_valid'];
    $buckets = [];
    $unclassified = 0;
    $unclassifiedDowntime = 0.0;

    foreach ($rows as $f) {
        $key = $f['classified'] ? (($f['mode_code'] !== '' ? $f['mode_code'] : '#' . $f['mode_name'])) : '__UNCLASSIFIED__';
        if (!isset($buckets[$key])) {
            $buckets[$key] = [
                'key'             => $key,
                'mode_code'       => $f['mode_code'],
                'mode_name'       => $f['mode_name'],
                'count'           => 0,
                'downtime_minutes' => 0.0,
                'downtime_rows'   => 0,
                'assets'          => [],
                'causes'          => [],
                'severity_high'   => 0,
                'repeat'          => 0,
                'classified'      => (bool)$f['classified'],
            ];
        }
        $buckets[$key]['count']++;
        if ($f['downtime_minutes'] !== null && $f['downtime_minutes'] > 0) {
            $buckets[$key]['downtime_minutes'] += (float)$f['downtime_minutes'];
            $buckets[$key]['downtime_rows']++;
        }
        if ($f['asset_id'] !== null) {
            $buckets[$key]['assets'][(int)$f['asset_id']] = true;
        }
        if ($f['cause_code'] !== '') {
            $buckets[$key]['causes'][$f['cause_code']] = ($buckets[$key]['causes'][$f['cause_code']] ?? 0) + 1;
        }
        if (in_array(strtolower((string)$f['severity']), ['high', 'critical'], true)) {
            $buckets[$key]['severity_high']++;
        }
        if (!empty($f['repeat_suspected'])) {
            $buckets[$key]['repeat']++;
        }
        if (!$f['classified']) {
            $unclassified++;
            $unclassifiedDowntime += (float)($f['downtime_minutes'] ?? 0);
        }
    }

    $total = count($rows);
    $totalDowntime = 0.0;
    foreach ($buckets as $k => $b) {
        $totalDowntime += (float)$b['downtime_minutes'];
    }

    $out = [];
    foreach ($buckets as $k => $b) {
        $out[] = [
            'key'              => $b['key'],
            'mode_code'        => $b['mode_code'],
            'mode_name'        => ($b['classified'] ? ($b['mode_name'] !== '' ? $b['mode_name'] : $b['mode_code']) : 'Unclassified'),
            'classified'       => $b['classified'],
            'count'            => $b['count'],
            'share_pct'        => $total > 0 ? rel_round($b['count'] / $total * 100.0, 2) : null,
            'downtime_minutes' => rel_round($b['downtime_minutes'], 2),
            'downtime_hours'   => rel_round($b['downtime_minutes'] / 60.0, 3),
            'downtime_share_pct' => $totalDowntime > 0 ? rel_round($b['downtime_minutes'] / $totalDowntime * 100.0, 2) : null,
            'asset_count'      => count($b['assets']),
            'cause_mix'        => $b['causes'],
            'high_severity'    => $b['severity_high'],
            'repeat_suspected' => $b['repeat'],
        ];
    }

    usort($out, static function ($x, $y) {
        if ($x['downtime_minutes'] === $y['downtime_minutes']) {
            return $y['count'] <=> $x['count'];
        }
        return ($y['downtime_minutes'] ?? 0) <=> ($x['downtime_minutes'] ?? 0);
    });

    return [
        'modes'          => $out,
        'total_failures' => $total,
        'unclassified'   => $unclassified,
        'unclassified_pct' => $total > 0 ? rel_round($unclassified / $total * 100.0, 2) : null,
        'total_downtime_minutes' => rel_round($totalDowntime, 2),
        'source'         => $ctx['source'],
        'status'         => ($total === 0) ? RL_DQ_NOT_ENOUGH : $ctx['dq']['status'],
        'note'           => ($total === 0)
            ? 'no usable failure event in the window'
            : 'ordered by recorded downtime; a mode with no downtime record still appears with null downtime',
    ];
}


/** Failure count for one asset inside an explicit window. */
function rel_asset_failure_count(PDO $pdo, int $assetId, string $start, string $end, string $sourceTable): array {
    try {
        if ($sourceTable === 'repair') {
            $st = $pdo->prepare('SELECT COUNT(*) FROM repair
                                  WHERE asset_id = ? AND created_at BETWEEN ? AND ? AND ' . RL_BREAKDOWN_SQL
                                    . ' AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')');
            $st->execute([$assetId, $start, $end]);
        } else {
            $st = $pdo->prepare('SELECT COUNT(*) FROM failure_events
                                  WHERE asset_id = ? AND failure_date BETWEEN ? AND ?');
            $st->execute([$assetId, $start, $end]);
        }
        return ['count' => (int)$st->fetchColumn(), 'source' => $sourceTable];
    } catch (Throwable $e) {
        return ['count' => 0, 'source' => $sourceTable];
    }
}


/** Recorded operating hours for one asset inside an explicit window. */
function rel_asset_op_hours(PDO $pdo, int $assetId, string $start, string $end): ?float {
    try {
        $st = $pdo->prepare('SELECT COALESCE(SUM(hours),0) FROM production_hours
                              WHERE asset_id = ? AND record_date BETWEEN ? AND ?');
        $st->execute([$assetId, substr($start, 0, 10), substr($end, 0, 10)]);
        $v = (float)$st->fetchColumn();
        return $v > 0 ? $v : null;
    } catch (Throwable $e) {
        return null;
    }
}


/**
 * PM effectiveness over two explicitly declared windows.
 *
 * The windows are never derived from the data: a comparison the engineer did
 * not declare is not made.
 */
function rel_pm_effectiveness(PDO $pdo, array $opts, int $roleId = 0): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $bStart = substr(trim((string)($opts['baseline_start'] ?? '')), 0, 10);
    $bEnd = substr(trim((string)($opts['baseline_end'] ?? '')), 0, 10);
    $aStart = substr(trim((string)($opts['after_start'] ?? '')), 0, 10);
    $aEnd = substr(trim((string)($opts['after_end'] ?? '')), 0, 10);

    if ($bStart === '' || $bEnd === '' || $aStart === '' || $aEnd === '') {
        return [
            'status' => RL_DQ_NOT_ENOUGH,
            'rows'   => [],
            'note'   => 'baseline_start, baseline_end, after_start and after_end are all required. '
                . 'This analysis is not run on a window the system invented.',
            'definition' => rel_kpi_definition($pdo, 'PM_EFFECTIVENESS'),
        ];
    }
    if (strtotime($aStart) <= strtotime($bEnd)) {
        return [
            'status' => RL_DQ_INVALID,
            'rows'   => [],
            'note'   => 'the after window must start after the baseline window ends',
            'definition' => rel_kpi_definition($pdo, 'PM_EFFECTIVENESS'),
        ];
    }

    $scopeOpts = $opts;
    $scopeOpts['from'] = $bStart;
    $scopeOpts['to'] = $aEnd;
    $scopeOpts['range'] = 'custom';
    $scope = rel_scope($pdo, $scopeOpts);
    $ids = $scope['asset_ids'];
    if ($ids === []) {
        return [
            'status' => RL_DQ_NOT_ENOUGH,
            'rows'   => [],
            'note'   => 'scope contains no asset',
            'definition' => rel_kpi_definition($pdo, 'PM_EFFECTIVENESS'),
        ];
    }

    $inIds = rel_id_in($ids, 'asset_id');
    $pmRows = [];
    try {
        $st = $pdo->prepare('SELECT asset_id,
                                    COUNT(CASE WHEN status = "completed" AND completed_at BETWEEN ? AND ? THEN 1 END) AS pm_after,
                                    COUNT(CASE WHEN status = "completed" AND completed_at BETWEEN ? AND ? THEN 1 END) AS pm_before,
                                    COUNT(*) AS pm_total,
                                    SUM(CASE WHEN status IN ("pending","overdue") THEN 1 ELSE 0 END) AS pm_open
                               FROM pm_am
                              WHERE ((completed_at BETWEEN ? AND ?) OR (due_date BETWEEN ? AND ?))' . $inIds . '
                              GROUP BY asset_id');
        $st->execute([
            $aStart . ' 00:00:00', $aEnd . ' 23:59:59',
            $bStart . ' 00:00:00', $bEnd . ' 23:59:59',
            $bStart . ' 00:00:00', $aEnd . ' 23:59:59',
            $bStart, $aEnd,
        ]);
        $pmRows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        $pmRows = [];
    }
    $pmBy = [];
    foreach ($pmRows as $r) {
        $pmBy[(int)$r['asset_id']] = $r;
    }

    $sourceTable = 'failure_events';
    $rows = [];
    $assetMeta = [];
    foreach ($scope['assets'] as $a) {
        $assetMeta[(int)$a['id']] = $a;
    }

    foreach ($ids as $aid) {
        $bF = rel_asset_failure_count($pdo, $aid, $bStart . ' 00:00:00', $bEnd . ' 23:59:59', $sourceTable);
        $aF = rel_asset_failure_count($pdo, $aid, $aStart . ' 00:00:00', $aEnd . ' 23:59:59', $sourceTable);
        $bH = rel_asset_op_hours($pdo, $aid, $bStart, $bEnd);
        $aH = rel_asset_op_hours($pdo, $aid, $aStart, $aEnd);
        $pm = $pmBy[$aid] ?? ['pm_after' => 0, 'pm_before' => 0, 'pm_total' => 0, 'pm_open' => 0];
        $bDays = max(1, (int)floor((strtotime($bEnd) - strtotime($bStart)) / 86400) + 1);
        $aDays = max(1, (int)floor((strtotime($aEnd) - strtotime($aStart)) / 86400) + 1);

        $beforeRate = ($bH !== null && $bH > 0) ? ($bF['count'] / $bH) * 1000.0 : null;
        $afterRate = ($aH !== null && $aH > 0) ? ($aF['count'] / $aH) * 1000.0 : null;

        $status = RL_DQ_PARTIAL;
        $note = 'failure rate observed before vs after the declared windows';
        if ($beforeRate === null || $afterRate === null) {
            $status = RL_DQ_NOT_ENOUGH;
            $note = 'no operating-hours record on one side, so the comparison cannot be stated';
        } elseif ((int)$pm['pm_total'] === 0) {
            $note .= '; no PM task exists for this asset, so this is a control group rather than a PM result';
        }

        $direction = 'unknown';
        if ($beforeRate !== null && $afterRate !== null) {
            if ($afterRate < $beforeRate * 0.95) {
                $direction = 'better_after';
            } elseif ($afterRate > $beforeRate * 1.05) {
                $direction = 'worse_after';
            } else {
                $direction = 'flat';
            }
        }

        $rows[] = [
            'asset_id'        => $aid,
            'asset_code'      => (string)($assetMeta[$aid]['code'] ?? ''),
            'asset_name'      => (string)($assetMeta[$aid]['name'] ?? ''),
            'criticality'     => (string)($assetMeta[$aid]['criticality'] ?? ''),
            'pm_completed_after'  => (int)$pm['pm_after'],
            'pm_completed_before' => (int)$pm['pm_before'],
            'pm_open'             => (int)$pm['pm_open'],
            'baseline' => [
                'days' => $bDays, 'failures' => $bF['count'], 'operating_hours' => rel_round($bH, 2),
                'failure_rate_per_1000h' => rel_round($beforeRate, 4),
            ],
            'after' => [
                'days' => $aDays, 'failures' => $aF['count'], 'operating_hours' => rel_round($aH, 2),
                'failure_rate_per_1000h' => rel_round($afterRate, 4),
            ],
            'direction'   => $direction,
            'status'      => $status,
            'note'        => $note,
        ];
    }

    usort($rows, static function ($x, $y) {
        $a = $x['after']['failure_rate_per_1000h'];
        $b = $y['after']['failure_rate_per_1000h'];
        if ($a === $b) {
            return 0;
        }
        if ($a === null) {
            return 1;
        }
        if ($b === null) {
            return -1;
        }
        return $a <=> $b;
    });

    return [
        'status'     => RL_DQ_PARTIAL,
        'windows'    => ['baseline' => [$bStart, $bEnd], 'after' => [$aStart, $aEnd]],
        'rows'       => $rows,
        'count'      => count($rows),
        'failure_source' => $sourceTable,
        'note'       => 'the direction of the change is reported; PM is never claimed to have caused it. '
            . 'A study must supply the confounding evidence (production mix, season, other changes).',
        'definition' => rel_kpi_definition($pdo, 'PM_EFFECTIVENESS'),
    ];
}

/* ===========================================================================
 * 16. CONDITION MONITORING CROSS-READ (Phase 36)
 * =========================================================================== */


/** Latest condition snapshot per in-scope asset, with the data-completeness gap. */
function rel_condition_summary(PDO $pdo, array $opts): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $scope = rel_scope($pdo, $opts);
    $ids = $scope['asset_ids'];

    $out = [
        'assets' => 0, 'with_snapshot' => 0, 'without_snapshot' => 0,
        'by_severity' => [], 'active_alarms' => 0, 'critical_alarms' => 0,
        'low_completeness' => [], 'status' => RL_DQ_NOT_ENOUGH, 'note' => '',
        'rows' => [],
    ];
    if ($ids === []) {
        $out['note'] = 'scope contains no asset';
        return $out;
    }
    $inIds = rel_id_in($ids, 'asset_id');
    $rows = [];
    try {
        $st = $pdo->prepare('SELECT cs.asset_id, cs.snapshot_at, cs.worst_severity, cs.data_completeness,
                                    cs.active_alarm_count, cs.critical_alarm_count,
                                    cs.fresh_point_count, cs.stale_point_count, cs.missing_point_count,
                                    a.code AS asset_code, a.name AS asset_name
                               FROM asset_condition_snapshots cs
                               JOIN asset_registry a ON a.id = cs.asset_id
                              WHERE cs.asset_id IN (' . implode(',', array_map('intval', $ids)) . ')
                              ORDER BY cs.snapshot_at DESC
                              LIMIT ' . (count($ids) * 4));
        $st->execute();
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        $rows = [];
    }

    $seen = [];
    foreach ($rows as $r) {
        $aid = (int)$r['asset_id'];
        if (isset($seen[$aid])) {
            continue;
        }
        $seen[$aid] = true;
        $sev = (string)$r['worst_severity'];
        $out['by_severity'][$sev] = ($out['by_severity'][$sev] ?? 0) + 1;
        $out['active_alarms'] += (int)$r['active_alarm_count'];
        $out['critical_alarms'] += (int)$r['critical_alarm_count'];
        $comp = $r['data_completeness'] === null ? null : (float)$r['data_completeness'];
        if ($comp !== null && $comp < 50.0) {
            $out['low_completeness'][] = [
                'asset_code' => (string)$r['asset_code'],
                'data_completeness' => $comp,
            ];
        }
        $out['rows'][] = [
            'asset_id'          => $aid,
            'asset_code'        => (string)$r['asset_code'],
            'asset_name'        => (string)$r['asset_name'],
            'snapshot_at'       => (string)$r['snapshot_at'],
            'worst_severity'    => $sev,
            'data_completeness' => rel_round($comp, 2),
            'active_alarms'     => (int)$r['active_alarm_count'],
            'critical_alarms'   => (int)$r['critical_alarm_count'],
            'fresh_points'      => (int)$r['fresh_point_count'],
            'stale_points'      => (int)$r['stale_point_count'],
            'missing_points'    => (int)$r['missing_point_count'],
        ];
    }
    $out['assets'] = count($ids);
    $out['with_snapshot'] = count($out['rows']);
    $out['without_snapshot'] = max(0, count($ids) - count($out['rows']));
    $out['status'] = $out['rows'] === [] ? RL_DQ_NOT_ENOUGH : RL_DQ_PARTIAL;
    $out['note'] = $out['rows'] === []
        ? 'no condition snapshot has ever been computed for this scope'
        : $out['without_snapshot'] . ' asset(s) in scope have no condition snapshot, which is a data gap and not a healthy reading';
    return $out;
}

/* ===========================================================================
 * 17. BAD ACTORS (configured criteria, no hard-coded verdict)
 * =========================================================================== */


/** Audit helper that degrades quietly when the audit table is missing. */
function rel_rel_audit(PDO $pdo, string $action, string $resourceType, $resourceId, string $description, int $userId): void {
    if (function_exists('audit_log')) {
        audit_log($pdo, $action, $resourceType, $resourceId, $description, null, null, 'info');
    }
}

/* ===========================================================================
 * 20. ENGINEERING ACTIONS (raised by a study, executed elsewhere)
 * =========================================================================== */

const RL_ACTION_TYPES = [
    'inspection_request'              => 'inspection',
    'pm_review'                      => 'pm_am',
    'engineering_change_request'     => 'engineering_change',
    'rca_request'                    => 'failure',
    'condition_monitoring_request'   => 'iot',
    'spare_part_review'              => 'spare_parts',
    'training_request'               => 'training',
];


