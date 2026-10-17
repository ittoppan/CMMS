<?php
/* Split from src/helpers/reliability.php (2026-10-17) - always loaded via reliability.php */

/**
 * Reliability calculation configuration (settings group 'reliability').
 *
 * Every value has a hard default in code, so the engine still behaves
 * correctly on a database where the Phase 37 settings have not been seeded.
 */
function rel_config(PDO $pdo): array {
    static $cache = [];
    if (isset($cache['cfg'])) {
        return $cache['cfg'];
    }

    $rows = [];
    try {
        $st = $pdo->query("SELECT setting_key, setting_value FROM settings
                           WHERE setting_group = 'reliability'");
        foreach ($st->fetchAll() as $r) {
            $rows[(string)$r['setting_key']] = (string)($r['setting_value'] ?? '');
        }
    } catch (Throwable $e) {
        $rows = [];
    }

    $get = function (string $key, string $default) use ($rows): string {
        $v = $rows[$key] ?? '';
        return ($v === '' ? $default : $v);
    };
    $int = function (string $key, int $default) use ($get): int {
        $v = $get($key, (string)$default);
        return is_numeric($v) ? (int)$v : $default;
    };
    $bool = function (string $key, bool $default) use ($get): bool {
        $v = $get($key, $default ? '1' : '0');
        return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    };

    $cfg = [
        'operating_basis'          => $get('reliability_operating_basis_default', 'production'),
        'allow_calendar_basis'     => $bool('reliability_allow_calendar_basis', false),
        'repair_time_basis'        => $get('reliability_repair_time_basis_default', 'work_to_complete'),
        'min_failures_for_mtbf'    => max(1, $int('reliability_min_failures_for_mtbf', 3)),
        'min_sample_period_days'   => max(1, $int('reliability_min_sample_period_days', 30)),
        'max_range_days'           => max(31, $int('reliability_max_range_days', 1825)),
        'availability_min_events'  => max(1, $int('reliability_availability_min_downtime_events', 1)),
        'need_classification'      => $bool('reliability_failures_need_classification', true),
        'bad_actor_auto_enable'    => $bool('reliability_bad_actor_auto_enable', false),
        'weibull_min_failures'     => max(3, $int('reliability_weibull_min_failures', 5)),
        'weibull_max_failures'     => max(10, $int('reliability_weibull_max_failures', 5000)),
        'weibull_use_censored'     => $bool('reliability_weibull_use_censored', true),
        'weibull_time_origin'      => $get('reliability_weibull_time_origin', 'first_failure'),
        'weibull_cache_minutes'    => max(0, $int('reliability_weibull_cache_ttl_minutes', 360)),
        'weibull_risk_levels'      => $get('reliability_weibull_risk_levels', '10,30,50,90'),
        'trend_max_buckets'        => max(6, $int('reliability_trend_max_buckets', 120)),
        'rolling_default_months'   => max(1, $int('reliability_rolling_default_months', 3)),
        'snapshot_ttl_hours'       => max(1, $int('reliability_snapshot_ttl_hours', 24)),
        'snapshot_threshold_ms'    => max(0, $int('reliability_snapshot_persist_threshold_ms', 750)),
        'snapshot_persist'         => $bool('reliability_snapshot_persist_enabled', true),
        'cost_missing_display'     => $get('reliability_cost_missing_display', 'DATA_NOT_AVAILABLE'),
        'warn_mixed_bases'         => $bool('reliability_comparability_warn_bases', true),
        'alarm_window_days'        => max(1, $int('reliability_alarm_to_failure_window_days', 7)),
        'alarm_as_failure'         => $bool('reliability_alarm_auto_treated_as_failure', false),
        'growth_auto_claim'        => $bool('reliability_growth_auto_claim', false),
        'dq_store_findings'        => $bool('reliability_dq_store_findings', true),
        'dq_max_findings'          => max(10, $int('reliability_dq_max_findings', 500)),
        'export_row_limit'         => max(100, $int('reliability_export_row_limit', 50000)),
        'page_default_size'        => max(5, $int('reliability_page_default_size', 25)),
    ];

    $cfg['operating_basis'] = in_array($cfg['operating_basis'], RL_BASES, true)
        ? $cfg['operating_basis'] : 'production';
    $cfg['repair_time_basis'] = in_array($cfg['repair_time_basis'], RL_REPAIR_BASES, true)
        ? $cfg['repair_time_basis'] : 'work_to_complete';
    if (!$cfg['allow_calendar_basis']) {
        // Calendar stays off until an operator turns it on AND states why.
        $cfg['calendar_allowed_now'] = false;
    } else {
        $cfg['calendar_allowed_now'] = true;
    }

    $cache['cfg'] = $cfg;
    return $cfg;
}

/* ===========================================================================
 * 2. PERIOD + SCOPE
 * =========================================================================== */


/**
 * Resolve the observation window.
 *
 * Supported presets: today, yesterday, this_week, last_week, this_month,
 * last_month, this_quarter, last_quarter, this_year, last_year,
 * rolling_Nm (rolling N months, inclusive of today), rolling_Nd (rolling N
 * days), custom (from/to).
 *
 * The window is hard-capped by reliability_max_range_days. A request that asks
 * for more is CLAMPED and says so, rather than silently scanning five years.
 */
function rel_period(array $opts, array $cfg = []): array {
    $cfg = $cfg ?: rel_configSafe($opts);
    $preset = strtolower(trim((string)($opts['range'] ?? ($opts['period'] ?? 'rolling_12m'))));
    $preset = preg_replace('/[^a-z0-9_]/', '', $preset) ?: 'rolling_12m';

    $start = null;
    $end = null;
    $note = '';
    $custom = false;
    $presetMonths = null;

    $dayStart = static fn(string $d): string => $d . ' 00:00:00';
    $dayEnd = static fn(string $d): string => $d . ' 23:59:59';

    if (str_starts_with($preset, 'rolling_')) {
        $digits = (int)substr($preset, 8);
        $unit = 'months';
        if (str_ends_with($preset, 'd')) {
            $digits = (int)substr($preset, 8, -1);
            $unit = 'days';
        }
        $digits = max(1, min(120, $digits));
        if ($unit === 'days') {
            $start = date('Y-m-d 00:00:00', strtotime('-' . ($digits - 1) . ' day'));
        } else {
            // rolling_Nm must span N full months (same shape as rolling_12m).
            // The old "-(N-1) months" made rolling_1m a single day and
            // rolling_6m a ~5-month window.
            $presetMonths = $digits;
            $start = date('Y-m-d 00:00:00', strtotime('-' . $digits . ' month +1 day'));
        }
        $end = date('Y-m-d 23:59:59');
    } elseif ($preset === 'custom') {
        $custom = true;
        $s = trim((string)($opts['from'] ?? $opts['range_start'] ?? ''));
        $e = trim((string)($opts['to'] ?? $opts['range_end'] ?? ''));
        if ($s === '' || $e === '') {
            $start = date('Y-m-d 00:00:00', strtotime('-12 months +1 day'));
            $end = date('Y-m-d 23:59:59');
            $note = 'custom range incomplete, fell back to rolling_12m';
        } else {
            $ts = strtotime($s);
            $te = strtotime($e);
            if ($ts === false || $te === false) {
                $start = date('Y-m-d 00:00:00', strtotime('-12 months +1 day'));
                $end = date('Y-m-d 23:59:59');
                $note = 'custom range unparseable, fell back to rolling_12m';
            } else {
                $start = date('Y-m-d 00:00:00', min($ts, $te));
                $end = date('Y-m-d 23:59:59', max($ts, $te));
            }
        }
    } else {
        $mapped = [
            'today'        => 'today',
            'yesterday'    => 'yesterday',
            'this_week'    => 'this_week',
            'last_week'    => 'last_week',
            'this_month'   => 'this_month',
            'last_month'   => 'last_month',
            'this_quarter' => 'this_quarter',
            'last_quarter' => 'last_quarter',
            'this_year'    => 'this_year',
            'last_year'    => 'last_year',
        ];
        $legacy = kpi_parse_range(['range' => $mapped[$preset] ?? 'this_month']);
        if ($legacy) {
            $start = $legacy['start'];
            $end = $legacy['end'];
        } else {
            $start = date('Y-m-d 00:00:00', strtotime('-12 months +1 day'));
            $end = date('Y-m-d 23:59:59');
            $note = 'unknown range, fell back to rolling_12m';
        }
    }

    $startTs = strtotime($start);
    $endTs = strtotime($end);
    if ($startTs === false || $endTs === false || $endTs < $startTs) {
        $startTs = strtotime('-12 months');
        $endTs = time();
        $note = 'invalid window, fell back to rolling_12m';
        $start = date('Y-m-d 00:00:00', $startTs);
        $end = date('Y-m-d 23:59:59', $endTs);
    }

    $maxDays = (int)($cfg['max_range_days'] ?? 1825);
    $days = (int)floor(($endTs - $startTs) / 86400) + 1;
    $clamped = false;
    if ($days > $maxDays) {
        $startTs = $endTs - ($maxDays - 1) * 86400;
        $start = date('Y-m-d 00:00:00', $startTs);
        $days = $maxDays;
        $clamped = true;
        $note = trim($note . ' window clamped to reliability_max_range_days');
    }

    return [
        'start'          => $start,
        'end'            => $end,
        'preset'         => $preset,
        'custom'         => $custom,
        'days'           => $days,
        'clamped'        => $clamped,
        'note'           => $note,
        'start_ts'       => $startTs,
        'end_ts'         => $endTs,
        'months'         => (!$clamped && $presetMonths !== null) ? $presetMonths : max(1, (int)ceil($days / 30.44)),
    ];
}


/**
 * Config accessor for callers that only hold request options.
 * Uses a static PDO if one was published by rel_config(), otherwise the
 * caller must pass $cfg explicitly.
 */
function rel_configSafe(array $opts): array {
    $pdo = $opts['__pdo'] ?? null;
    return ($pdo instanceof PDO) ? rel_config($pdo) : [
        'max_range_days' => 1825,
    ];
}


/**
 * Resolve the population scope.
 *
 * scope_type: fleet (all active assets) | asset | department | location |
 *             category | criticality
 *
 * Returns the asset ids plus a human label. An empty id list is NOT an error:
 * it is a scope with no members, and every KPI then reports NOT_ENOUGH_DATA.
 */
function rel_scope(PDO $pdo, array $opts): array {
    $type = strtolower(trim((string)($opts['scope_type'] ?? 'fleet')));
    $type = preg_replace('/[^a-z_]/', '', $type) ?: 'fleet';
    $idRaw = (string)($opts['scope_id'] ?? '');
    $id = ctype_digit($idRaw) ? (int)$idRaw : 0;

    $where = ['1=1'];
    $params = [];
    $label = 'All active assets';
    $assetIds = [];

    switch ($type) {
        case 'asset':
            if ($id <= 0) {
                $type = 'fleet';
                break;
            }
            $where[] = 'a.id = ?';
            $params[] = $id;
            $label = 'Asset #' . $id;
            break;
        case 'department':
            if ($id <= 0) {
                $type = 'fleet';
                break;
            }
            $where[] = 'a.department_id = ?';
            $params[] = $id;
            $label = 'Department #' . $id;
            break;
        case 'location':
            if ($id <= 0) {
                $type = 'fleet';
                break;
            }
            $where[] = 'a.location_id = ?';
            $params[] = $id;
            $label = 'Location #' . $id;
            break;
        case 'category':
            $cat = trim((string)($opts['category'] ?? ''));
            if ($cat === '') {
                $type = 'fleet';
                break;
            }
            $where[] = 'a.category = ?';
            $params[] = $cat;
            $label = 'Category ' . $cat;
            break;
        case 'criticality':
            $lvl = strtoupper(trim((string)($opts['criticality'] ?? '')));
            if ($lvl === '' || !in_array($lvl, ['A', 'B', 'C', 'D'], true)) {
                $type = 'fleet';
                break;
            }
            $where[] = 'a.criticality = ?';
            $params[] = $lvl;
            $label = 'Criticality ' . $lvl;
            break;
        default:
            $type = 'fleet';
    }

    $statusFilter = strtolower(trim((string)($opts['asset_status'] ?? 'active')));
    $statuses = ($statusFilter === 'all')
        ? ['active', 'inactive', 'under_repair', 'disposed']
        : ($statusFilter === 'operating'
            ? ['active', 'under_repair']
            : [$statusFilter]);
    $statuses = array_values(array_filter(array_map('strval', $statuses), static fn($s) => $s !== ''));
    if ($statuses === []) {
        $statuses = ['active'];
    }
    $inStatus = implode(',', array_fill(0, count($statuses), '?'));
    $where[] = "a.status IN ($inStatus)";
    foreach ($statuses as $s) {
        $params[] = $s;
    }

    $limit = 5000;
    $sql = 'SELECT a.id, a.code, a.name, a.category, a.criticality, a.department_id,
                   a.location_id, a.running_hours_month, a.status
            FROM asset_registry a
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY a.code ASC
            LIMIT ' . $limit;
    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll();
    } catch (Throwable $e) {
        $rows = [];
    }

    foreach ($rows as $r) {
        $assetIds[] = (int)$r['id'];
    }

    return [
        'type'         => $type,
        'id'           => $id,
        'label'        => $label,
        'where'        => $where,
        'params'       => $params,
        'asset_ids'    => $assetIds,
        'asset_count'  => count($assetIds),
        'assets'       => $rows,
        'statuses'     => $statuses,
        'truncated'    => count($assetIds) >= $limit,
    ];
}


/** SQL IN-list of scope asset ids (empty list -> "no asset", never "all"). */
function rel_asset_in(array $scope, string $column = 'asset_id'): string {
    if (empty($scope['asset_ids'])) {
        return ' AND 1=0 ';
    }
    $ids = array_map('intval', $scope['asset_ids']);
    return ' AND ' . $column . ' IN (' . implode(',', $ids) . ') ';
}


/** Role ids allowed to read cost-derived reliability KPIs. */
function rel_roles_cost(): array {
    return [1, 2, 6];
}

/* ===========================================================================
 * 3. KPI DEFINITION REGISTRY
 * =========================================================================== */


/** NULL-if-not-computable division helper: never returns a fabricated 0. */
function rel_div(?float $num, ?float $den): ?float {
    if ($num === null || $den === null) {
        return null;
    }
    if (abs($den) < 1e-12) {
        return null;
    }
    return $num / $den;
}


/** Round for display, keeping NULL as NULL. */
function rel_round(?float $v, int $digits = 2): ?float {
    return $v === null ? null : round($v, $digits);
}


/** ISO timestamp helper. */
function rel_now(): string {
    return date('Y-m-d H:i:s');
}


/** uuid v4 without external dependencies. */
function rel_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}


/**
 * Scope predicate for a list of int ids.
 *
 * The result is a COMPLETE boolean predicate including its leading "AND", so a
 * call site can append it directly after any WHERE expression. An empty scope
 * yields "IN (NULL)", which matches nothing: a report about no assets must not
 * quietly widen into a report about the whole fleet.
 *
 * $column must be table-qualified ("r.asset_id") whenever the query joins a
 * second table that also has an asset_id, otherwise MySQL rejects the row as
 * ambiguous.
 */
function rel_id_in(array $ids, string $column): string {
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if ($ids === []) {
        return ' AND ' . $column . ' IN (NULL) ';
    }
    return ' AND ' . $column . ' IN (' . implode(',', $ids) . ') ';
}

/* ===========================================================================
 * 4. DATA QUALITY
 *
 * A reliability number is only as trustworthy as the rows behind it. These
 * checks run BEFORE any KPI and their verdict travels with the result.
 * =========================================================================== */


/** Convert a recorded runtime unit into hours; NULL when the unit is unknown. */
function rel_unit_to_hours(string $unit): ?float {
    $u = strtolower(trim($unit));
    return match ($u) {
        'h', 'hr', 'hrs', 'hour', 'hours'       => 1.0,
        'min', 'mins', 'minute', 'minutes'       => 1.0 / 60.0,
        's', 'sec', 'secs', 'second', 'seconds'  => 1.0 / 3600.0,
        default                                   => null,
    };
}


/** Quoted, escaped IN-list for constant arrays. */
function rel_quote_list(array $values): string {
    $out = [];
    foreach ($values as $v) {
        $out[] = "'" . str_replace("'", "''", (string)$v) . "'";
    }
    return $out === [] ? "''" : implode(',', $out);
}


/** Percentile of a sorted numeric list (linear-free nearest-rank). */
function rel_percentile(array $sorted, float $p): ?float {
    $n = count($sorted);
    if ($n === 0) {
        return null;
    }
    $idx = (int)ceil($p * $n) - 1;
    $idx = max(0, min($n - 1, $idx));
    return (float)$sorted[$idx];
}

/* ===========================================================================
 * 9. KPI IMPLEMENTATIONS (each one states its basis and its verdict)
 * =========================================================================== */


/**
 * Feature-level status for the delivery report.
 *
 * PASS = implemented AND computable from recorded data.
 * PARTIAL = implemented but limited, and the limit is named.
 * BLOCKED = implemented but cannot run on this data.
 * NOT IMPLEMENTED = deliberately out of scope.
 */
function rel_feature_status(PDO $pdo, array $opts = []): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $ctx = rel_context($pdo, $opts, $cfg);
    $rows = [];

    $feCount = count($ctx['failures_valid']);
    $woCount = (int)rel_dq_count($pdo,
        'SELECT COUNT(*) FROM repair WHERE completed_at BETWEEN ? AND ?' . rel_id_in($ctx['scope']['asset_ids'], 'asset_id')
        . ' AND status IN (' . rel_quote_list(RL_DONE_STATUSES) . ')',
        [$ctx['period']['start'], $ctx['period']['end']]);
    $alarmCount = (int)rel_dq_count($pdo,
        'SELECT COUNT(*) FROM iot_alarms WHERE first_detected_at BETWEEN ? AND ?' . rel_id_in($ctx['scope']['asset_ids'], 'asset_id'),
        [$ctx['period']['start'], $ctx['period']['end']]);
    $ecrCount = (int)rel_dq_count($pdo,
        'SELECT COUNT(*) FROM engineering_changes WHERE implemented_at IS NOT NULL', []);
    $conditionCount = (int)rel_dq_count($pdo,
        'SELECT COUNT(*) FROM asset_condition_snapshots', []);

    $mtbf = rel_mtbf($pdo, $ctx);
    $mttr = rel_mttr($pdo, $ctx);
    $avail = rel_availability($pdo, $ctx);
    $modes = rel_failure_modes($pdo, $ctx);

    $rows[] = rel_feature_row('Canonical MTBF', $mtbf['status'], $mtbf['note'],
        'operating hours on the declared basis / usable failure events');
    $rows[] = rel_feature_row('Canonical MTTR (3 bases)', $mttr['status'], $mttr['note'],
        'work_to_complete / notify_to_restore / technician_labor, each stated');
    $rows[] = rel_feature_row('Observed availability', $avail['status'], $avail['note'],
        'uptime / (uptime + recorded downtime); inherent availability deliberately not computed');
    $rows[] = rel_feature_row('Failure mode mix + Pareto',
        $modes['total_failures'] > 0 ? $modes['status'] : RL_DQ_NOT_ENOUGH,
        $modes['note'], 'unclassified failures always appear as their own bucket');
    $rows[] = rel_feature_row('Weibull 2-parameter MLE',
        $feCount >= (int)$cfg['weibull_min_failures'] ? 'OK' : RL_DQ_NOT_ENOUGH,
        $feCount . ' usable failure(s); needs ' . (int)$cfg['weibull_min_failures'] . ' for an identified two-parameter fit',
        'right-censored observations included, hash-keyed cache');
    $rows[] = rel_feature_row('Bad actors (configured rules)',
        rel_bad_actor_criteria($pdo, true) === [] ? 'NOT_CONFIGURED' : 'OK',
        'criteria ship disabled; the engine has no built-in verdict',
        'score ranks, evidence explains');
    $rows[] = rel_feature_row('Reliability growth (change link)',
        $ecrCount > 0 ? RL_DQ_PARTIAL : RL_DQ_NOT_ENOUGH,
        $ecrCount . ' engineering change(s) with an implementation date',
        'observation only, never causation');
    $rows[] = rel_feature_row('PM effectiveness (before/after)',
        'READY_REQUIRES_WINDOWS', 'requires an engineer-declared baseline and after window',
        'direction reported, causation refused');
    $rows[] = rel_feature_row('IoT condition + alarm reliability',
        $alarmCount > 0 || $conditionCount > 0 ? RL_DQ_PARTIAL : RL_DQ_NOT_ENOUGH,
        $alarmCount . ' alarm(s), ' . $conditionCount . ' condition snapshot(s)',
        'alarms are never counted as failures');
    $rows[] = rel_feature_row('Maintenance cost per operating hour',
        ($woCount > 0) ? RL_DQ_PARTIAL : RL_DQ_NOT_ENOUGH,
        $woCount . ' completed work order(s) in the window', 'missing part prices are reported, never zero-filled');
    $rows[] = rel_feature_row('Inherent availability (Ai)', 'NOT IMPLEMENTED',
        'needs planned delay / quality loss / logistics delay records that do not exist in this schema',
        'deliberately out of scope rather than estimated');
    $rows[] = rel_feature_row('Life-cycle cost (LCC)', 'NOT IMPLEMENTED',
        'needs acquisition cost completeness plus discount policy', 'deliberately out of scope');

    return [
        'features' => $rows,
        'meta'     => rel_context_meta($ctx),
        'note'     => 'PASS means implemented AND computable from recorded data; PARTIAL names the limit',
    ];
}


/** One feature-status row. */
function rel_feature_row(string $feature, string $status, string $note, string $evidence): array {
    return [
        'feature'  => $feature,
        'status'   => $status,
        'note'     => $note,
        'evidence' => $evidence,
    ];
}

