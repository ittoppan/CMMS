<?php
/**
 * reliability.php - Phase 37 Advanced Reliability Engineering engine
 *
 * Design contract (see docs/RELIABILITY_DATA_MODEL.md and
 * docs/RELIABILITY_ENGINEERING.md):
 *
 *  1. THIS MODULE OWNS NO TRANSACTION. Failure events, work orders, downtime,
 *     PM, RCA, engineering changes, IoT readings/alarms and maintenance cost
 *     already exist in other modules. This engine only READS them and writes
 *     its own analysis layer (definitions, findings, fits, scores, snapshots,
 *     studies, actions).
 *
 *  2. NULL MEANS "NOT COMPUTABLE", NEVER ZERO. Every KPI returned by this file
 *     carries a status (COMPLETE / PARTIAL / INVALID / DUPLICATE /
 *     NOT_ENOUGH_DATA) next to the number. A NULL value is a documented answer,
 *     not a missing one.
 *
 *  3. ONE KPI, ONE DEFINITION. Every number resolves through
 *     reliability_kpi_definitions (kpi_code + version). The legacy formulas in
 *     kpi.php / analytics.php / asset_reliability.php are NOT rewritten here;
 *     they are seeded as their own definition rows so history stays explainable.
 *
 *  4. THE OPERATING-TIME BASIS IS ALWAYS EXPLICIT. production / declared /
 *     runtime / interval / calendar. Calendar is an ASSUMPTION and ships
 *     disabled (reliability_allow_calendar_basis = 0).
 *
 *  5. NO CAUSAL CLAIMS FROM OBSERVATION. Growth analysis reports "observed
 *     after change", never "caused by change". PM effectiveness reports a
 *     direction, never an attribution.
 *
 * Screens: /reliability (overview), /reliability/mtbf-mttr, /reliability/
 * availability, /reliability/pareto, /reliability/weibull, /reliability/
 * bad-actors, /reliability/growth, /reliability/pm-effectiveness,
 * /reliability/studies, /reliability/data-quality, /reliability/kpi-registry
 *
 * Authorization is enforced in the API adapter with
 * requirePerm($pdo, 'reliability', <action>). UI hiding is not authorization.
 *
 * @package cmms
 */
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/kpi.php';

const RL_VERSION = 'phase37.1';

/** DQ verdict vocabulary shared by every calculation in this file. */
const RL_DQ_COMPLETE = 'COMPLETE';
const RL_DQ_PARTIAL = 'PARTIAL';
const RL_DQ_INVALID = 'INVALID';
const RL_DQ_DUPLICATE = 'DUPLICATE';
const RL_DQ_NOT_ENOUGH = 'NOT_ENOUGH_DATA';

/** Operating-time bases. Only the first four are evidence-based. */
const RL_BASES = ['production', 'declared', 'runtime', 'interval', 'calendar'];

/** MTTR bases. Each one is a different engineering question. */
const RL_REPAIR_BASES = ['work_to_complete', 'notify_to_restore', 'technician_labor'];

/** Availability flavours. Current data can only support observed. */
const RL_AVAILABILITY_FLAVOURS = ['observed'];

/** Work orders that are finished business events for MTTR purposes. */
const RL_DONE_STATUSES = ['completed', 'complete', 'closed', 'done', 'finished'];

/** Work orders that are NOT maintenance events at all. */
const RL_EXCLUDED_STATUSES = ['cancelled', 'canceled', 'rejected'];

/** Breakdown classification, kept identical to v_maintenance_cost.is_breakdown. */
const RL_BREAKDOWN_SQL = "((r.source_type = 'breakdown') OR (r.work_order_type IN ('breakdown','corrective','emergency','urgent')))";

/* ===========================================================================
 * 1. CONFIG
 * =========================================================================== */

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

    $dayStart = static fn(string $d): string => $d . ' 00:00:00';
    $dayEnd = static fn(string $d): string => $d . ' 23:59:59';

    if ($preset === 'rolling_12m') {
        $start = date('Y-m-d 00:00:00', strtotime('-12 months +1 day'));
        $end = date('Y-m-d 23:59:59');
    } elseif (str_starts_with($preset, 'rolling_')) {
        $digits = (int)substr($preset, 8);
        $unit = 'months';
        if (str_ends_with($preset, 'd')) {
            $digits = (int)substr($preset, 8, -1);
            $unit = 'days';
        }
        $digits = max(1, min(120, $digits));
        $start = $unit === 'days'
            ? date('Y-m-d 00:00:00', strtotime('-' . ($digits - 1) . ' day'))
            : date('Y-m-d 00:00:00', strtotime('-' . ($digits - 1) . ' month'));
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
        'months'         => max(1, (int)ceil($days / 30.44)),
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

/** Quoted, escaped IN-list for constant arrays. */
function rel_quote_list(array $values): string {
    $out = [];
    foreach ($values as $v) {
        $out[] = "'" . str_replace("'", "''", (string)$v) . "'";
    }
    return $out === [] ? "''" : implode(',', $out);
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

/**
 * Pareto analysis with an explicit ABC classification.
 *
 * A = cumulative share up to 80%, B = up to 95%, C = the tail. The cut points
 * are stated in the payload so a reader can disagree with them knowingly.
 */
function rel_pareto(PDO $pdo, array $ctx, string $metric = 'downtime', int $limit = 20): array {
    $modes = rel_failure_modes($pdo, $ctx);
    $metric = in_array($metric, ['downtime', 'count'], true) ? $metric : 'downtime';
    $items = $modes['modes'];

    $total = 0.0;
    foreach ($items as $it) {
        $total += (float)($metric === 'downtime' ? ($it['downtime_minutes'] ?? 0) : $it['count']);
    }

    // Re-sort on the chosen metric, then walk the cumulative share.
    usort($items, static function ($x, $y) use ($metric) {
        $a = (float)($metric === 'downtime' ? ($x['downtime_minutes'] ?? 0) : $x['count']);
        $b = (float)($metric === 'downtime' ? ($y['downtime_minutes'] ?? 0) : $y['count']);
        if ($a === $b) {
            return $y['count'] <=> $x['count'];
        }
        return $b <=> $a;
    });

    $cum = 0.0;
    $rows = [];
    foreach ($items as $it) {
        $v = (float)($metric === 'downtime' ? ($it['downtime_minutes'] ?? 0) : $it['count']);
        $cum += $v;
        $cumPct = $total > 0 ? ($cum / $total * 100.0) : null;
        $class = 'C';
        if ($cumPct !== null) {
            $prevCum = $cum - $v;
            $prevPct = $total > 0 ? ($prevCum / $total * 100.0) : 0.0;
            if ($prevPct < 80.0) {
                $class = 'A';
            } elseif ($prevPct < 95.0) {
                $class = 'B';
            }
        }
        $rows[] = [
            'mode_code'        => $it['mode_code'],
            'mode_name'        => $it['mode_name'],
            'classified'       => $it['classified'],
            'value'            => rel_round($v, 2),
            'share_pct'        => $total > 0 ? rel_round($v / $total * 100.0, 2) : null,
            'cumulative_pct'   => $cumPct === null ? null : rel_round($cumPct, 2),
            'abc'              => $class,
            'count'            => $it['count'],
            'downtime_hours'   => $it['downtime_hours'],
            'asset_count'      => $it['asset_count'],
        ];
    }

    $aCount = count(array_filter($rows, static fn($r) => $r['abc'] === 'A'));
    $bCount = count(array_filter($rows, static fn($r) => $r['abc'] === 'B'));

    return [
        'metric'            => $metric,
        'rows'              => array_slice($rows, 0, max(1, min(100, $limit))),
        'total'             => rel_round($total, 2),
        'abc_summary'       => ['A' => $aCount, 'B' => $bCount, 'C' => count($rows) - $aCount - $bCount],
        'cut_points_pct'    => ['A' => 80.0, 'B' => 95.0],
        'unclassified'      => $modes['unclassified'],
        'unclassified_pct'  => $modes['unclassified_pct'],
        'total_failures'    => $modes['total_failures'],
        'source'            => $ctx['source'],
        'status'            => $modes['status'],
        'note'              => $modes['note']
            . '. A/B/C cut points are 80% and 95% of the chosen metric and are an editorial choice, not a law.',
    ];
}

/* ===========================================================================
 * 11. TREND (server-side bucketing)
 * =========================================================================== */

/**
 * Monthly trend of the headline indicators.
 *
 * The bucket is computed in PHP from the SAME failure list and repair rows the
 * KPI functions use, so a chart can never disagree with the number above it.
 */
function rel_trend(PDO $pdo, array $ctx, int $maxBuckets = 0): array {
    $cfg = $ctx['cfg'];
    $maxBuckets = $maxBuckets > 0 ? $maxBuckets : (int)($cfg['trend_max_buckets'] ?? 120);
    $period = $ctx['period'];

    $cursor = new DateTime($period['start']);
    $buckets = [];
    while (true) {
        $key = $cursor->format('Y-m');
        $end = (clone $cursor)->modify('last day of this month')->setTime(23, 59, 59);
        $buckets[$key] = [
            'bucket'       => $key,
            'start'        => $cursor->format('Y-m-d H:i:s'),
            'end'          => $end->format('Y-m-d H:i:s'),
            'failures'     => 0,
            'downtime'     => 0.0,
            'repair_minutes' => [],
            'op_hours'     => null,
        ];
        if ($end->getTimestamp() >= $period['end_ts']) {
            break;
        }
        if (count($buckets) >= $maxBuckets) {
            break;
        }
        $cursor->modify('first day of next month');
    }
    if ($buckets === []) {
        return ['buckets' => [], 'status' => RL_DQ_NOT_ENOUGH, 'note' => 'window produced no month bucket'];
    }

    foreach ($ctx['failures_valid'] as $f) {
        if ($f['ts_ts'] === null) {
            continue;
        }
        $key = date('Y-m', $f['ts_ts']);
        if (isset($buckets[$key])) {
            $buckets[$key]['failures']++;
            $buckets[$key]['downtime'] += (float)($f['downtime_minutes'] ?? 0);
        }
    }

    foreach (rel_repair_rows($pdo, $ctx['scope'], $period, $ctx['repair_basis'], $cfg) as $r) {
        if (empty($r['valid']) || $r['completed_at'] === '') {
            continue;
        }
        $key = substr($r['completed_at'], 0, 7);
        if (isset($buckets[$key])) {
            $buckets[$key]['repair_minutes'][] = (float)$r['minutes'];
            if ($r['downtime_minutes'] !== null && $r['downtime_minutes'] > 0) {
                $buckets[$key]['downtime'] += (float)$r['downtime_minutes'];
            }
        }
    }

    // Uptime per bucket from the declared source only (never assumed).
    if ($ctx['basis'] === 'production' && ($ctx['scope']['asset_ids'] ?? []) !== []) {
        try {
            $st = $pdo->prepare('SELECT DATE_FORMAT(record_date, "%Y-%m") AS ym, COALESCE(SUM(hours),0) AS h
                                   FROM production_hours
                                  WHERE record_date BETWEEN ? AND ?' . rel_id_in($ctx['scope']['asset_ids'], 'asset_id') . '
                                  GROUP BY ym');
            $st->execute([substr($period['start'], 0, 10), substr($period['end'], 0, 10)]);
            foreach ($st->fetchAll() as $r) {
                $key = (string)$r['ym'];
                if (isset($buckets[$key])) {
                    $buckets[$key]['op_hours'] = (float)$r['h'];
                }
            }
        } catch (Throwable $e) {
            $buckets = $buckets;
        }
    }

    $rows = [];
    foreach ($buckets as $key => $b) {
        $minutes = $b['repair_minutes'];
        sort($minutes);
        $n = count($minutes);
        $op = $b['op_hours'];
        $rows[] = [
            'bucket'        => $key,
            'failures'      => $b['failures'],
            'downtime_minutes' => rel_round($b['downtime'], 2),
            'op_hours'      => $op === null ? null : rel_round($op, 2),
            'mtbf_hours'    => ($op === null || $op <= 0 || $b['failures'] === 0) ? null : rel_round($op / $b['failures'], 2),
            'mttr_hours'    => $n === 0 ? null : rel_round(array_sum($minutes) / $n / 60.0, 3),
            'availability_pct' => ($op === null || $op <= 0) ? null
                : rel_round($op / ($op + $b['downtime'] / 60.0) * 100.0, 3),
            'repairs_measured' => $n,
        ];
    }

    $anyOp = array_filter($rows, static fn($r) => $r['op_hours'] !== null);
    return [
        'buckets'   => $rows,
        'bucket_size' => 'month',
        'status'    => $rows === [] ? RL_DQ_NOT_ENOUGH : (count($anyOp) === 0 ? RL_DQ_NOT_ENOUGH : RL_DQ_PARTIAL),
        'note'      => count($anyOp) === 0
            ? 'no monthly operating-hours record, so MTBF/availability stay null in every bucket'
            : 'buckets without an operating-hours record keep MTBF and availability null instead of guessing',
        'truncated' => count($rows) >= $maxBuckets,
    ];
}

/* ===========================================================================
 * 12. ASSET MATRIX (server-side pagination)
 * =========================================================================== */

/**
 * Per-asset reliability table.
 *
 * Pagination and sorting happen here, in SQL, so the client never downloads the
 * whole fleet to draw a table.
 */
function rel_asset_matrix(PDO $pdo, array $opts, int $roleId = 0): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $ctx = rel_context($pdo, $opts, $cfg);

    $sort = strtolower(trim((string)($opts['sort'] ?? 'failures')));
    // ORDER BY can only reference the derived columns this statement actually
    // selects, so the metrics the UI sorts by are expressed over the joined
    // aggregates. The arithmetic mirrors the per-row formulas applied further
    // down (mtbf = op hours / failures, availability = op / (op + downtime h)).
    $sortMap = [
        'failures'     => 'failure_count',
        'downtime'     => 'dt.downtime_minutes',
        'mtbf'         => '(COALESCE(ph.op_hours, 0) / NULLIF(COALESCE(f.c, 0), 0))',
        'mttr'         => 'rp.mttr_minutes',
        'availability' => '(COALESCE(ph.op_hours, 0) / NULLIF(COALESCE(ph.op_hours, 0) + COALESCE(dt.downtime_minutes, 0) / 60.0, 0))',
        'cost'         => 'mc.cost',
        'code'         => 'a.code',
    ];
    $orderBy = $sortMap[$sort] ?? 'failure_count';
    $dir = strtoupper(trim((string)($opts['dir'] ?? 'DESC'))) === 'ASC' ? 'ASC' : 'DESC';
    $pageSize = (int)($opts['page_size'] ?? $cfg['page_default_size']);
    $pageSize = max(5, min(200, $pageSize));
    $page = max(1, (int)($opts['page'] ?? 1));
    $offset = ($page - 1) * $pageSize;

    $ids = $ctx['scope']['asset_ids'];
    if ($ids === []) {
        return [
            'meta' => rel_context_meta($ctx),
            'rows' => [], 'total' => 0, 'page' => $page, 'page_size' => $pageSize,
            'status' => RL_DQ_NOT_ENOUGH,
            'note' => 'scope contains no asset',
        ];
    }

    // Column reference must be unqualified here: the fragment is inlined into the
    // LEFT JOIN sub-selects below, where the outer asset alias is not in scope.
    $inIds = rel_id_in($ids, 'asset_id');
    $start = $ctx['period']['start'];
    $end = $ctx['period']['end'];
    $isFe = (($ctx['source']['table'] ?? '') === 'failure_events');
    $failSql = $isFe
        ? 'SELECT asset_id, COUNT(*) AS c FROM failure_events WHERE failure_date BETWEEN ? AND ?' . rel_id_in($ids, 'asset_id') . ' GROUP BY asset_id'
        : 'SELECT asset_id, COUNT(*) AS c FROM repair WHERE created_at BETWEEN ? AND ? AND ' . RL_BREAKDOWN_SQL
            . ' AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . rel_id_in($ids, 'asset_id') . ' GROUP BY asset_id';

    $dtStart = substr($start, 0, 10);
    $dtEnd = substr($end, 0, 10);

    $sql = 'SELECT a.id AS asset_id, a.code AS asset_code, a.name AS asset_name,
                   a.category, a.criticality, a.department_id, a.status,
                   COALESCE(f.c, 0) AS failure_count,
                   COALESCE(dt.downtime_minutes, 0) AS downtime_minutes,
                   ph.op_hours, rp.mttr_minutes, mc.cost, mc.cost_rows, mc.missing_price
              FROM asset_registry a
         LEFT JOIN (' . $failSql . ') f ON f.asset_id = a.id
          LEFT JOIN (SELECT asset_id,
                            SUM(CASE WHEN downtime_minutes > 0 THEN downtime_minutes ELSE 0 END) AS downtime_minutes
                       FROM repair
                      WHERE created_at BETWEEN ? AND ?
                        AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . rel_id_in($ids, 'asset_id') . '
                      GROUP BY asset_id) dt ON dt.asset_id = a.id
          LEFT JOIN (SELECT asset_id, COALESCE(SUM(hours),0) AS op_hours
                       FROM production_hours
                      WHERE record_date BETWEEN ? AND ?' . rel_id_in($ids, 'asset_id') . '
                      GROUP BY asset_id) ph ON ph.asset_id = a.id
          LEFT JOIN (SELECT asset_id,
                            AVG(CASE WHEN actual_start_at IS NOT NULL AND completed_at IS NOT NULL
                                     AND TIMESTAMPDIFF(MINUTE, actual_start_at, completed_at) >= 0
                                     THEN TIMESTAMPDIFF(MINUTE, actual_start_at, completed_at) END) AS mttr_minutes
                       FROM repair
                      WHERE completed_at BETWEEN ? AND ?
                        AND status IN (' . rel_quote_list(RL_DONE_STATUSES) . ')
                        AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')'
                        . $inIds . '
                      GROUP BY asset_id) rp ON rp.asset_id = a.id
         LEFT JOIN (SELECT asset_id,
                           SUM(COALESCE(cost_labor_recorded,0) + COALESCE(cost_outsource_recorded,0)
                               + COALESCE(parts_cost,0) + COALESCE(cost_parts_snapshot,0)) AS cost,
                           COUNT(*) AS cost_rows,
                           COALESCE(SUM(COALESCE(parts_missing_price,0)),0) AS missing_price
                      FROM v_maintenance_cost
                     WHERE created_at BETWEEN ? AND ?' . rel_id_in($ids, 'asset_id') . '
                     GROUP BY asset_id) mc ON mc.asset_id = a.id
             WHERE a.id IN (' . implode(',', array_map('intval', $ids)) . ')
             ORDER BY ' . $orderBy . ' ' . $dir . ', a.code ASC
             LIMIT ' . ($pageSize + 1) . ' OFFSET ' . $offset;

    $canSeeCost = in_array($roleId, rel_roles_cost(), true) || $roleId === 0;
    try {
        // Five scoped sub-selects, in the order they appear in the statement:
        // failures (dt), downtime (dt), production hours (date), repair time
        // (dt), maintenance cost (dt).
        $st = $pdo->prepare($sql);
        $st->execute(array_merge(
            [$start, $end],
            [$start, $end],
            [$dtStart, $dtEnd],
            [$start, $end],
            [$start, $end]
        ));
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        $rows = [];
    }

    $hasMore = count($rows) > $pageSize;
    $rows = array_slice($rows, 0, $pageSize);

    $out = [];
    foreach ($rows as $r) {
        $failCount = (int)($r['failure_count'] ?? 0);
        $dtMin = (float)($r['downtime_minutes'] ?? 0);
        $opH = ($r['op_hours'] === null || (float)$r['op_hours'] <= 0) ? null : (float)$r['op_hours'];
        $mttrMin = ($r['mttr_minutes'] === null) ? null : (float)$r['mttr_minutes'];
        $avail = null;
        if ($opH !== null && ($opH + $dtMin / 60.0) > 0) {
            $avail = rel_round($opH / ($opH + $dtMin / 60.0) * 100.0, 3);
        }
        $out[] = [
            'asset_id'          => (int)$r['asset_id'],
            'asset_code'        => (string)$r['asset_code'],
            'asset_name'        => (string)$r['asset_name'],
            'category'          => (string)($r['category'] ?? ''),
            'criticality'       => (string)($r['criticality'] ?? ''),
            'status'            => (string)($r['status'] ?? ''),
            'failure_count'     => $failCount,
            'mtbf_hours'        => ($opH === null || $failCount === 0) ? null : rel_round($opH / $failCount, 2),
            'mttr_hours'        => $mttrMin === null ? null : rel_round($mttrMin / 60.0, 3),
            'downtime_hours'    => rel_round($dtMin / 60.0, 3),
            'op_hours'          => $opH === null ? null : rel_round($opH, 2),
            'availability_pct'  => $avail,
            'maintenance_cost'  => $canSeeCost ? rel_round((float)($r['cost'] ?? 0), 2) : null,
            'cost_available'    => $canSeeCost && (int)($r['cost_rows'] ?? 0) > 0,
            'cost_lines_missing_price' => $canSeeCost ? (int)($r['missing_price'] ?? 0) : null,
        ];
    }

    return [
        'meta'       => rel_context_meta($ctx),
        'rows'       => $out,
        'has_more'   => $hasMore,
        'total'      => count($ids),
        'page'       => $page,
        'page_size'  => $pageSize,
        'sort'       => $sort,
        'dir'        => $dir,
        'cost_visible' => $canSeeCost,
        'status'     => RL_DQ_PARTIAL,
        'note'       => 'a null cell means "not computable from recorded data", never zero',
    ];
}

/* ===========================================================================
 * 13. WEIBULL (two-parameter, right-censored, MLE)
 *
 * The score equation solved below is the exact profile-likelihood condition:
 *
 *   h(beta) = SUM_all(t^beta ln t) / SUM_all(t^beta) - 1/beta - SUM_fail(ln t) / f = 0
 *   eta     = ( SUM_all(t^beta) / f ) ^ (1/beta)
 *
 * Right-censored observations (an asset that has not failed yet) enter the
 * SUM_all terms only. That is the whole point of including them: pretending an
 * unfinished life is a failure biases beta downward and eta upward.
 * =========================================================================== */

/**
 * Observations for a Weibull fit: times between failures plus right-censoring.
 *
 * @return array{times:array,failed:array,unit:string,origin:string,source:string,
 *               notes:array,censored:int,failures:int}
 */
function rel_weibull_observations(PDO $pdo, array $ctx, array $opts = []): array {
    $cfg = $ctx['cfg'];
    $origin = strtolower(trim((string)($opts['time_origin'] ?? $cfg['weibull_time_origin'])));
    $origin = in_array($origin, ['first_failure', 'inception', 'commission'], true) ? $origin : 'first_failure';
    $useCensored = ($opts['use_censored'] ?? null);
    $useCensored = ($useCensored === null) ? (bool)($cfg['weibull_use_censored'] ?? true) : (bool)$useCensored;

    $times = [];
    $failed = [];
    $notes = [];
    $inception = null;

    if ($origin === 'inception') {
        $inception = $ctx['period']['start_ts'];
    }

    // Failures: one observation per usable failure event, measured from the
    // previous event (or from the window start).
    $prevByAsset = [];
    foreach ($ctx['failures_valid'] as $f) {
        if ($f['ts_ts'] === null) {
            continue;
        }
        $aid = (int)($f['asset_id'] ?? 0);
        $from = $prevByAsset[$aid] ?? $inception ?? $ctx['period']['start_ts'];
        $t = ($f['ts_ts'] - $from) / 3600.0;
        $prevByAsset[$aid] = $f['ts_ts'];
        if ($t > 0) {
            $times[] = $t;
            $failed[] = true;
        } else {
            $notes[] = 'two failures share one timestamp - zero-length life dropped';
        }
    }

    // Right-censoring: from the last observed failure to the end of the window.
    if ($useCensored) {
        foreach ($prevByAsset as $aid => $lastTs) {
            $t = ($ctx['period']['end_ts'] - $lastTs) / 3600.0;
            if ($t > 0) {
                $times[] = $t;
                $failed[] = false;
            }
        }
        if ($inception !== null) {
            $assetsWithFailure = count($prevByAsset);
            $assetsTotal = (int)($ctx['scope']['asset_count'] ?? 0);
            $neverFailed = max(0, $assetsTotal - $assetsWithFailure);
            for ($i = 0; $i < $neverFailed; $i++) {
                $t = ($ctx['period']['end_ts'] - $inception) / 3600.0;
                if ($t > 0) {
                    $times[] = $t;
                    $failed[] = false;
                }
            }
            if ($neverFailed > 0) {
                $notes[] = $neverFailed . ' asset(s) with no failure in the window contributed a censored observation';
            }
        }
    } else {
        $notes[] = 'right-censored observations disabled by configuration (reliability_weibull_use_censored = 0)';
    }

    return [
        'times'    => $times,
        'failed'   => $failed,
        'unit'     => 'hours',
        'origin'   => $origin,
        'source'   => $ctx['source']['table'],
        'notes'    => $notes,
        'failures' => count(array_filter($failed)),
        'censored' => count($failed) - count(array_filter($failed)),
    ];
}

/** Score function h(beta); root is the MLE of the shape parameter. */
function rel_weibull_h(float $beta, array $times, array $failed): float {
    $s = 0.0;
    $sl = 0.0;
    $sf = 0.0;
    $f = 0;
    foreach ($times as $i => $t) {
        if ($t <= 0) {
            continue;
        }
        $p = $t ** $beta;
        $s += $p;
        $sl += $p * log($t);
        if (!empty($failed[$i])) {
            $sf += log($t);
            $f++;
        }
    }
    if ($s <= 0.0 || $f === 0) {
        return NAN;
    }
    return ($sl / $s) - (1.0 / $beta) - ($sf / $f);
}

/**
 * Solve the MLE by bracketing + bisection.
 *
 * Returns status OK / NOT_ENOUGH_DATA / INVALID / DEGENERATE / TIMES_TOO_CLOSE
 * so the caller never has to guess whether a fit exists.
 */
function rel_weibull_solve(array $times, array $failed): array {
    $n = count($times);
    $f = 0;
    foreach ($failed as $x) {
        if (!empty($x)) {
            $f++;
        }
    }
    $out = [
        'status' => RL_DQ_NOT_ENOUGH, 'note' => '', 'beta' => null, 'eta' => null,
        'failures' => $f, 'observations' => $n, 'censored' => $n - $f,
        'method' => 'mle', 'iterations' => 0,
        'beta_stderr' => null, 'rankit_beta' => null, 'rankit_eta' => null,
        'lnl' => null, 'auc' => null,
    ];

    if ($n === 0 || $f === 0) {
        $out['note'] = 'a Weibull fit needs at least one observed failure';
        return $out;
    }
    if ($f < 2) {
        $out['status'] = RL_DQ_NOT_ENOUGH;
        $out['note'] = 'a single failure does not identify both parameters';
        return $out;
    }

    // Distinct positive times only.
    $clean = [];
    $cleanF = [];
    foreach ($times as $i => $t) {
        if ($t > 0) {
            $clean[] = (float)$t;
            $cleanF[] = !empty($failed[$i]);
        }
    }
    $distinct = array_values(array_unique(array_map(static fn($v) => round($v, 9), $clean)));
    if (count($distinct) < 3) {
        $out['status'] = 'TIMES_TOO_CLOSE';
        $out['note'] = 'failure times are effectively identical; the likelihood is flat';
        return $out;
    }

    // Bracket the root of h(beta).
    $lo = 0.05;
    $hi = 20.0;
    $hLo = rel_weibull_h($lo, $clean, $cleanF);
    $hHi = rel_weibull_h($hi, $clean, $cleanF);
    $ok = is_finite($hLo) && is_finite($hHi);
    if ($ok && $hLo * $hHi > 0) {
        // Widen once before declaring the data unusable.
        $hi = 200.0;
        $hHi = rel_weibull_h($hi, $clean, $cleanF);
        $ok = is_finite($hHi) && ($hLo * $hHi <= 0);
    }
    if (!$ok) {
        $out['status'] = RL_DQ_INVALID;
        $out['note'] = 'the Weibull score function has no sign change on beta in (0.05, 200)';
        return $out;
    }

    $iter = 0;
    $beta = ($hLo < 0 && $hHi > 0) ? ($lo + $hi) / 2.0 : 1.0;
    for (; $iter < 200; $iter++) {
        $beta = ($lo + $hi) / 2.0;
        $h = rel_weibull_h($beta, $clean, $cleanF);
        if (!is_finite($h)) {
            break;
        }
        if (abs($h) < 1e-8) {
            break;
        }
        if ($h < 0) {
            $lo = $beta;
        } else {
            $hi = $beta;
        }
        if (abs($hi - $lo) < 1e-10) {
            break;
        }
    }

    $s = 0.0;
    foreach ($clean as $t) {
        $s += $t ** $beta;
    }
    $eta = ($f > 0 && $s > 0) ? ($s / $f) ** (1.0 / $beta) : null;
    if ($eta === null || !is_finite($eta) || $eta <= 0) {
        $out['status'] = RL_DQ_INVALID;
        $out['note'] = 'scale estimate failed';
        return $out;
    }

    // Profile log-likelihood at the solution (for comparing models later).
    $sf = 0.0;
    foreach ($clean as $i => $t) {
        if (!empty($cleanF[$i])) {
            $sf += log($t);
        }
    }
    $lnl = $f * log($beta) + ($beta - 1) * $sf - $f - $f * log($eta);

    // Asymptotic standard error of beta (documented approximation, NOT a
    // validated confidence interval).
    $s2 = 0.0;
    $s2l = 0.0;
    $s2ll = 0.0;
    foreach ($clean as $t) {
        $p = $t ** (2 * $beta);
        $s2 += $p;
        $s2l += $p * log($t);
        $s2ll += $p * log($t) * log($t);
    }
    $stderr = null;
    if ($f >= 3 && $s2 > 0) {
        $num = $s2ll - (($s2l * $s2l) / $f);
        $den = $sf * $sf;
        if ($num > 0 && $den > 0) {
            $stderr = sqrt($num / $den);
        }
    }

    $rank = rel_weibull_rankit($clean, $cleanF);

    $out['status'] = 'OK';
    $out['beta'] = round($beta, 6);
    $out['eta'] = round($eta, 6);
    $out['beta_stderr'] = $stderr === null ? null : round($stderr, 6);
    $out['rankit_beta'] = $rank['beta'];
    $out['rankit_eta'] = $rank['eta'];
    $out['lnl'] = round($lnl, 6);
    $out['iterations'] = $iter;
    $out['note'] = 'MLE on ' . count($clean) . ' observation(s), ' . $f . ' failure(s), '
        . ($n - $f) . ' right-censored. beta_stderr is an asymptotic approximation, not a validated CI.';
    return $out;
}

/** Rankit (Blom) regression, reported as a secondary estimate for comparison. */
function rel_weibull_rankit(array $times, array $failed): array {
    $t = [];
    foreach ($times as $i => $v) {
        if (!empty($failed[$i]) && $v > 0) {
            $t[] = (float)$v;
        }
    }
    sort($t);
    $n = count($t);
    if ($n < 3) {
        return ['beta' => null, 'eta' => null, 'note' => 'rankit needs at least 3 failures'];
    }
    $a = 0.375; // Blom
    $sx = 0.0; $sy = 0.0; $sxx = 0.0; $sxy = 0.0;
    $pts = [];
    foreach ($t as $i => $v) {
        $p = ($i + 1 - $a) / ($n + 1 - 2 * $a);
        $p = max(1e-6, min(1 - 1e-6, $p));
        $x = log($v);
        $y = log(-log(1 - $p));
        $sx += $x; $sy += $y; $sxx += $x * $x; $sxy += $x * $y;
        $pts[] = ['ln_t' => $x, 'ln_ln' => $y];
    }
    $den = ($n * $sxx) - ($sx * $sx);
    if (abs($den) < 1e-12) {
        return ['beta' => null, 'eta' => null, 'note' => 'rankit regression is degenerate', 'points' => $pts];
    }
    $beta = (($n * $sxy) - ($sx * $sy)) / $den;
    $alpha = (($sy * $sxx) - ($sx * $sxy)) / $den; // = ln eta
    if ($beta <= 0) {
        return ['beta' => round($beta, 6), 'eta' => null, 'note' => 'rankit produced a non-positive shape', 'points' => $pts];
    }
    return [
        'beta' => round($beta, 6),
        'eta'  => round(exp($alpha), 6),
        'note' => 'rankit (Blom) regression, shown only to compare against the MLE',
        'points' => $pts,
    ];
}

/** Weibull reliability R(t), failure F(t) and hazard h(t). */
function rel_weibull_curve_points(float $beta, float $eta, int $levels = 20, ?float $tMax = null): array {
    if ($beta <= 0 || $eta <= 0) {
        return [];
    }
    $tMax = $tMax !== null && $tMax > 0 ? $tMax : $eta * 3.0;
    $levels = max(4, min(200, $levels));
    $out = [];
    for ($i = 1; $i <= $levels; $i++) {
        $t = $tMax * ($i / $levels);
        $z = ($t / $eta) ** $beta;
        $out[] = [
            't'       => round($t, 4),
            'R'       => round(exp(-$z), 6),
            'F'       => round(1 - exp(-$z), 6),
            'hazard'  => round(($beta / $eta) * (($t / $eta) ** ($beta - 1)), 8),
        ];
    }
    return $out;
}

/** B10 life: the time at which reliability equals 90%. */
function rel_weibull_b10(float $beta, float $eta): ?float {
    if ($beta <= 0 || $eta <= 0) {
        return null;
    }
    return round($eta * ((-log(0.9)) ** (1.0 / $beta)), 4);
}

/** Stable hash of the observation set, so a stale fit is detectable. */
function rel_observation_hash(array $times, array $failed): string {
    $pairs = [];
    foreach ($times as $i => $t) {
        $pairs[] = sprintf('%.6f:%d', (float)$t, !empty($failed[$i]) ? 1 : 0);
    }
    sort($pairs);
    return hash('sha256', implode('|', $pairs));
}

/**
 * Public Weibull fit with caching.
 *
 * Cache key: scope + origin + observation hash. A changed observation set
 * produces a different hash, so a stale fit can never be served silently.
 */
function rel_weibull_fit(PDO $pdo, array $opts, ?array $ctx = null, int $userId = 0): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $ctx = $ctx ?: rel_context($pdo, $opts, $cfg);
    $obs = rel_weibull_observations($pdo, $ctx, $opts);
    $hash = rel_observation_hash($obs['times'], $obs['failed']);
    // Cast binds tighter than ??, so the key must be read before the cast or PHP
    // emits "Undefined array key" on every fit request.
    $minFailures = (int)($opts['min_failures'] ?? 0);
    $minFailures = $minFailures > 0 ? $minFailures : (int)($cfg['weibull_min_failures'] ?? 5);
    $ttl = (int)($cfg['weibull_cache_minutes'] ?? 360);

    $scopeKey = [
        'type'  => $ctx['scope']['type'],
        'id'    => (string)$ctx['scope']['id'],
        'ids'   => $ctx['scope']['asset_ids'],
        'start' => $ctx['period']['start'],
        'end'   => $ctx['period']['end'],
        'origin' => $obs['origin'],
    ];
    $scopeHash = substr(hash('sha256', json_encode($scopeKey)), 0, 32);

    $cached = null;
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_weibull_fits
                             WHERE observation_sha256 = ? AND status = "OK"
                               AND computed_at > (NOW() - INTERVAL ? MINUTE)
                             ORDER BY computed_at DESC LIMIT 1');
        $st->execute([$hash, $ttl]);
        $cached = $st->fetch() ?: null;
    } catch (Throwable $e) {
        $cached = null;
    }

    if ($cached !== null) {
        return [
            'fit'      => rel_weibull_fit_row($cached),
            'cached'   => true,
            'observations' => [
                'count'    => (int)$cached['observation_count'],
                'failures' => (int)$cached['failure_count'],
                'censored' => (int)$cached['censored_count'],
                'origin'   => (string)$cached['time_origin'],
                'hash'     => (string)$cached['observation_sha256'],
            ],
            'note'     => 'served from a fit computed on identical observations',
        ];
    }

    if ($obs['failures'] < $minFailures) {
        return [
            'fit'         => null,
            'cached'      => false,
            'status'      => RL_DQ_NOT_ENOUGH,
            'observations' => [
                'count' => count($obs['times']), 'failures' => $obs['failures'],
                'censored' => $obs['censored'], 'origin' => $obs['origin'], 'hash' => $hash,
            ],
            'note' => $obs['failures'] . ' failure(s) available; a two-parameter Weibull needs at least '
                . $minFailures . ' (reliability_weibull_min_failures). No shape parameter is reported.',
            'observations_notes' => $obs['notes'],
        ];
    }

    $solved = rel_weibull_solve($obs['times'], $obs['failed']);
    $levels = array_values(array_filter(array_map(
        static fn($v) => (int)trim($v),
        explode(',', (string)($cfg['weibull_risk_levels'] ?? '10,30,50,90'))
    )));
    $curve = [];
    if ($solved['status'] === 'OK') {
        $beta = (float)$solved['beta'];
        $eta = (float)$solved['eta'];
        $risk = [];
        foreach ($levels as $lv) {
            $lv = max(1, min(99, $lv));
            $t = $eta * ((-log($lv / 100.0)) ** (1.0 / $beta));
            $risk[] = ['reliability_pct' => $lv, 't' => round($t, 4), 'unit' => 'hours'];
        }
        $curve = [
            'points'       => rel_weibull_curve_points($beta, $eta, 20),
            'risk_levels'  => $risk,
            'b10_life'     => rel_weibull_b10($beta, $eta),
            'median_life'  => round($eta * ((-log(0.5)) ** (1.0 / $beta)), 4),
        ];
    }

    $fitUid = rel_uuid();
    $expires = date('Y-m-d H:i:s', time() + max(60, $ttl) * 60);
    $limitations = $obs['notes'];
    $stored = false;
    try {
        $ins = $pdo->prepare('INSERT INTO reliability_weibull_fits
            (fit_uid, scope_type, scope_id, scope_label, population_definition, time_origin,
             period_start, period_end, shape_beta, scale_eta, method, method_rankit_beta, method_rankit_eta,
             beta_stderr, failure_count, censored_count, observation_count, observation_sha256, unit,
             reliability_curve_json, status, status_note, data_quality, limitations, computed_by, expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $ins->execute([
            $fitUid,
            $ctx['scope']['type'],
            (string)$ctx['scope']['id'],
            $ctx['scope']['label'],
            'failure events in scope on source ' . $ctx['source']['table'] . '; DQ status ' . $ctx['dq']['status'],
            $obs['origin'],
            $ctx['period']['start'],
            $ctx['period']['end'],
            $solved['beta'],
            $solved['eta'],
            (string)$solved['method'],
            $solved['rankit_beta'],
            $solved['rankit_eta'],
            $solved['beta_stderr'],
            (int)$obs['failures'],
            (int)$obs['censored'],
            count($obs['times']),
            $hash,
            'hours',
            $curve === [] ? null : json_encode($curve, JSON_UNESCAPED_UNICODE),
            (string)$solved['status'],
            (string)$solved['note'],
            $ctx['dq']['status'],
            $limitations === [] ? null : json_encode($limitations, JSON_UNESCAPED_UNICODE),
            $userId > 0 ? $userId : null,
            $expires,
        ]);
        $stored = true;
    } catch (Throwable $e) {
        $stored = false;
    }

    return [
        'fit'         => [
            'fit_uid'      => $fitUid,
            'scope'        => ['type' => $ctx['scope']['type'], 'id' => $ctx['scope']['id'], 'label' => $ctx['scope']['label']],
            'time_origin'  => $obs['origin'],
            'period'       => ['start' => $ctx['period']['start'], 'end' => $ctx['period']['end']],
            'beta'         => $solved['beta'],
            'eta'          => $solved['eta'],
            'method'       => $solved['method'],
            'rankit_beta'  => $solved['rankit_beta'],
            'rankit_eta'   => $solved['rankit_eta'],
            'beta_stderr'  => $solved['beta_stderr'],
            'lnl'          => $solved['lnl'],
            'failures'     => $solved['failures'],
            'censored'     => $solved['censored'],
            'observations' => $solved['observations'],
            'status'       => $solved['status'],
            'note'         => $solved['note'],
            'curve'        => $curve,
            'data_quality' => $ctx['dq']['status'],
            'limitations'  => $limitations,
            'persisted'    => $stored,
        ],
        'cached'       => false,
        'observations' => [
            'count' => count($obs['times']), 'failures' => $obs['failures'],
            'censored' => $obs['censored'], 'origin' => $obs['origin'], 'hash' => $hash,
        ],
        'note'         => $solved['status'] === 'OK'
            ? 'shape beta ' . $solved['beta'] . ' ' . rel_beta_interpretation((float)$solved['beta'])
            : (string)$solved['note'],
    ];
}

/** Plain-language reading of the Weibull shape parameter. */
function rel_beta_interpretation(float $beta): string {
    if (!is_finite($beta)) {
        return '';
    }
    if ($beta < 0.95) {
        return '(beta < 1: early-life / infant mortality wear-in)';
    }
    if ($beta <= 1.05) {
        return '(beta ~= 1: random failures, constant hazard)';
    }
    if ($beta < 3.5) {
        return '(beta > 1: wear-out, the hazard grows with age)';
    }
    return '(beta >> 1: very sharply concentrated wear-out)';
}

/** Normalise a stored fit row into the API shape. */
function rel_weibull_fit_row(array $row): array {
    $curve = null;
    if (!empty($row['reliability_curve_json'])) {
        $decoded = json_decode((string)$row['reliability_curve_json'], true);
        $curve = is_array($decoded) ? $decoded : null;
    }
    $limits = [];
    if (!empty($row['limitations'])) {
        $decoded = json_decode((string)$row['limitations'], true);
        $limits = is_array($decoded) ? $decoded : [(string)$row['limitations']];
    }
    return [
        'fit_uid'      => (string)$row['fit_uid'],
        'scope'        => ['type' => (string)$row['scope_type'], 'id' => (string)$row['scope_id'], 'label' => (string)$row['scope_label']],
        'time_origin'  => (string)$row['time_origin'],
        'period'       => ['start' => $row['period_start'], 'end' => $row['period_end']],
        'beta'         => $row['shape_beta'] === null ? null : (float)$row['shape_beta'],
        'eta'          => $row['scale_eta'] === null ? null : (float)$row['scale_eta'],
        'method'       => (string)$row['method'],
        'rankit_beta'  => $row['method_rankit_beta'] === null ? null : (float)$row['method_rankit_beta'],
        'rankit_eta'   => $row['method_rankit_eta'] === null ? null : (float)$row['method_rankit_eta'],
        'beta_stderr'  => $row['beta_stderr'] === null ? null : (float)$row['beta_stderr'],
        'failures'     => (int)$row['failure_count'],
        'censored'     => (int)$row['censored_count'],
        'observations' => (int)$row['observation_count'],
        'status'       => (string)$row['status'],
        'note'         => (string)$row['status_note'],
        'curve'        => $curve,
        'data_quality' => (string)$row['data_quality'],
        'limitations'  => $limits,
        'computed_at'  => (string)$row['computed_at'],
    ];
}

/** Recent fits for a scope (so a reader can see history, not just the newest). */
function rel_weibull_history(PDO $pdo, int $limit = 20, string $scopeType = '', string $scopeId = ''): array {
    try {
        $sql = 'SELECT * FROM reliability_weibull_fits WHERE 1=1';
        $params = [];
        if ($scopeType !== '') {
            $sql .= ' AND scope_type = ?';
            $params[] = $scopeType;
        }
        if ($scopeId !== '') {
            $sql .= ' AND scope_id = ?';
            $params[] = $scopeId;
        }
        $sql .= ' ORDER BY computed_at DESC LIMIT ' . max(1, min(100, $limit));
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
    return array_map('rel_weibull_fit_row', $rows);
}

/* ===========================================================================
 * 14. RELIABILITY GROWTH (observation, never causation)
 * =========================================================================== */

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

/** List declared engineering-change / observation links. */
function rel_growth_links(PDO $pdo, array $opts = []): array {
    $limit = max(1, min(200, (int)($opts['limit'] ?? 50)));
    try {
        $sql = 'SELECT gl.*, ec.ecr_no, ec.title AS change_title, ec.status AS change_status,
                       ec.implemented_at, ec.change_type, a.code AS asset_code, a.name AS asset_name
                  FROM reliability_growth_links gl
             LEFT JOIN engineering_changes ec ON ec.id = gl.engineering_change_id
             LEFT JOIN asset_registry a ON a.id = gl.asset_id
             ORDER BY gl.created_at DESC LIMIT ' . $limit;
        return $pdo->query($sql)->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

/**
 * Declare a change-to-observation link.
 *
 * The engineer states the claim and the window. The engine refuses to invent a
 * link (reliability_growth_auto_claim = 0) and refuses to describe the result
 * as causation.
 */
function rel_growth_save_link(PDO $pdo, array $data, int $userId): array {
    $ecId = (int)($data['engineering_change_id'] ?? 0);
    $assetId = (int)($data['asset_id'] ?? 0);
    $effective = trim((string)($data['effective_from'] ?? ''));
    if ($ecId <= 0) {
        return ['ok' => false, 'error' => 'engineering_change_id is required: a reliability claim must point at a real change record'];
    }
    if ($effective === '' || strtotime($effective) === false) {
        return ['ok' => false, 'error' => 'effective_from is required: the engineer must state when the change took effect'];
    }
    $claim = trim((string)($data['claim'] ?? ''));
    if ($claim === '') {
        return ['ok' => false, 'error' => 'claim is required: state what you expect to observe, in your own words'];
    }

    $label = '';
    try {
        $st = $pdo->prepare('SELECT ecr_no, title FROM engineering_changes WHERE id = ?');
        $st->execute([$ecId]);
        $row = $st->fetch();
        if (!$row) {
            return ['ok' => false, 'error' => 'engineering change not found'];
        }
        $label = (string)$row['ecr_no'] . ' - ' . (string)$row['title'];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'engineering_changes table unavailable'];
    }

    try {
        $ins = $pdo->prepare('INSERT INTO reliability_growth_links
            (engineering_change_id, asset_id, change_label, effective_from, observation_end,
             baseline_start, baseline_end, claim, evidence_note, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)');
        $ins->execute([
            $ecId,
            $assetId > 0 ? $assetId : null,
            $label,
            substr($effective, 0, 10),
            substr((string)($data['observation_end'] ?? ''), 0, 10) ?: null,
            substr((string)($data['baseline_start'] ?? ''), 0, 10) ?: null,
            substr((string)($data['baseline_end'] ?? ''), 0, 10) ?: null,
            $claim,
            (string)($data['evidence_note'] ?? ''),
            $userId > 0 ? $userId : null,
        ]);
        return ['ok' => true, 'id' => (int)$pdo->lastInsertId()];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => 'insert failed: ' . $e->getMessage()];
    }
}

/**
 * Assess a declared link by comparing two observation windows.
 *
 * The result is deliberately phrased as "observed after change" / "observed
 * before change". Causation is a judgement a study makes, not a number.
 */
function rel_growth_analysis(PDO $pdo, array $opts = []): array {
    $links = rel_growth_links($pdo, $opts);
    $sourceTable = 'failure_events';
    $rows = [];

    foreach ($links as $gl) {
        $assetId = (int)($gl['asset_id'] ?? 0);
        $baselineStart = (string)($gl['baseline_start'] ?? '');
        $baselineEnd = (string)($gl['baseline_end'] ?? '');
        $postStart = (string)$gl['effective_from'];
        $postEnd = (string)($gl['observation_end'] ?? '');
        $label = $assetId > 0 ? (string)($gl['asset_code'] ?? ('asset#' . $assetId)) : (string)($gl['change_label'] ?? '');

        $row = [
            'link_id'          => (int)$gl['id'],
            'engineering_change_id' => (int)$gl['engineering_change_id'],
            'change_label'     => $label,
            'claim'            => (string)($gl['claim'] ?? ''),
            'assessment_stored' => (string)($gl['assessment'] ?? 'unassessed'),
            'asset_id'         => $assetId > 0 ? $assetId : null,
            'windows'          => [
                'baseline' => ['start' => $baselineStart, 'end' => $baselineEnd],
                'post'     => ['start' => $postStart, 'end' => $postEnd],
            ],
        ];

        if ($baselineStart === '' || $baselineEnd === '' || $postStart === '' || $postEnd === '') {
            $row['assessment'] = 'insufficient_data';
            $row['observed'] = null;
            $row['note'] = 'the engineer must declare both windows before any comparison is made';
            $rows[] = $row;
            continue;
        }
        if (strtotime($postEnd) <= strtotime($baselineStart)) {
            $row['assessment'] = 'insufficient_data';
            $row['note'] = 'the post-change window does not follow the baseline window';
            $rows[] = $row;
            continue;
        }

        $targets = $assetId > 0 ? [$assetId] : [];
        if ($targets === []) {
            $row['assessment'] = 'insufficient_data';
            $row['note'] = 'no asset scope declared for this change; a fleet-wide comparison is refused';
            $rows[] = $row;
            continue;
        }

        $beforeF = 0;
        $afterF = 0;
        $beforeH = null;
        $afterH = null;
        foreach ($targets as $tid) {
            $b = rel_asset_failure_count($pdo, $tid, $baselineStart . ' 00:00:00', $baselineEnd . ' 23:59:59', $sourceTable);
            $a = rel_asset_failure_count($pdo, $tid, $postStart . ' 00:00:00', $postEnd . ' 23:59:59', $sourceTable);
            $beforeF += $b['count'];
            $afterF += $a['count'];
            $beforeH = ($beforeH ?? 0) + (float)(rel_asset_op_hours($pdo, $tid, $baselineStart, $baselineEnd) ?? 0);
            $afterH = ($afterH ?? 0) + (float)(rel_asset_op_hours($pdo, $tid, $postStart, $postEnd) ?? 0);
        }
        $beforeH = ($beforeH > 0) ? $beforeH : null;
        $afterH = ($afterH > 0) ? $afterH : null;

        $beforeRate = ($beforeH !== null && $beforeH > 0) ? ($beforeF / $beforeH) * 1000.0 : null;
        $afterRate = ($afterH !== null && $afterH > 0) ? ($afterF / $afterH) * 1000.0 : null;

        $row['observed'] = [
            'failures_before'  => $beforeF,
            'failures_after'   => $afterF,
            'operating_hours_before' => rel_round($beforeH, 2),
            'operating_hours_after'  => rel_round($afterH, 2),
            'failure_rate_before'   => rel_round($beforeRate, 4),
            'failure_rate_after'    => rel_round($afterRate, 4),
            'failure_rate_delta_pct' => ($beforeRate !== null && $beforeRate > 0 && $afterRate !== null)
                ? rel_round((($afterRate - $beforeRate) / $beforeRate) * 100.0, 2)
                : null,
            'failure_source'   => $sourceTable,
        ];

        if ($beforeRate === null || $afterRate === null) {
            $row['assessment'] = 'insufficient_data';
            $row['note'] = 'no operating-hours record on one side of the comparison, so the rate cannot be computed';
            $rows[] = $row;
            continue;
        }
        if ($beforeF === 0 && $afterF === 0) {
            $row['assessment'] = 'no_change';
            $row['note'] = 'no failure recorded on either side of the change; this is an absence of evidence';
        } elseif ($afterRate < $beforeRate) {
            $row['assessment'] = 'improved';
            $row['note'] = 'failure rate observed LOWER after the change date. Observation only - this is not proof of causation.';
        } elseif ($afterRate > $beforeRate) {
            $row['assessment'] = 'degraded';
            $row['note'] = 'failure rate observed HIGHER after the change date. Observation only - this is not proof of causation.';
        } else {
            $row['assessment'] = 'no_change';
            $row['note'] = 'failure rate identical on both sides';
        }
        $rows[] = $row;
    }

    return [
        'links'   => $rows,
        'count'   => count($rows),
        'status'  => $rows === [] ? RL_DQ_NOT_ENOUGH : RL_DQ_PARTIAL,
        'note'    => 'every row is an observation over a declared window. "improved" means the numbers moved, '
            . 'not that the change caused it. A study may conclude otherwise, with its own evidence.',
        'auto_claim' => (bool)((rel_config($pdo)['growth_auto_claim'] ?? false)),
    ];
}

/* ===========================================================================
 * 15. PM EFFECTIVENESS (before / after, direction only)
 * =========================================================================== */

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

/** Criteria rows; enabled-only by default because zero enabled is a valid state. */
function rel_bad_actor_criteria(PDO $pdo, bool $enabledOnly = false): array {
    try {
        $sql = 'SELECT * FROM reliability_bad_actor_criteria';
        if ($enabledOnly) {
            $sql .= ' WHERE enabled = 1';
        }
        $sql .= ' ORDER BY sort_order ASC, id ASC';
        return $pdo->query($sql)->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

const RL_BA_METRICS = [
    'failure_count', 'failure_rate_per_1000h', 'downtime_hours', 'maintenance_cost',
    'repeat_failure_count', 'availability_pct', 'mttr_hours', 'emergency_wo_count',
];

/** Create or update one criterion. Validation is strict on purpose. */
function rel_bad_actor_save_criterion(PDO $pdo, array $data, int $userId): array {
    $code = preg_replace('/[^A-Z0-9_]/', '', strtoupper(trim((string)($data['criteria_code'] ?? '')))) ?? '';
    if ($code === '') {
        return ['ok' => false, 'error' => 'criteria_code is required'];
    }
    $metric = trim((string)($data['metric'] ?? ''));
    if (!in_array($metric, RL_BA_METRICS, true)) {
        return ['ok' => false, 'error' => 'metric must be one of: ' . implode(', ', RL_BA_METRICS)];
    }
    $cmp = trim((string)($data['comparator'] ?? 'gte'));
    if (!in_array($cmp, ['gte', 'gt', 'lte', 'lt', 'eq'], true)) {
        return ['ok' => false, 'error' => 'comparator must be gte|gt|lte|lt|eq'];
    }
    if (!isset($data['threshold']) || !is_numeric($data['threshold'])) {
        return ['ok' => false, 'error' => 'threshold must be numeric'];
    }

    try {
        $sel = $pdo->prepare('SELECT id FROM reliability_bad_actor_criteria WHERE criteria_code = ?');
        $sel->execute([$code]);
        $id = $sel->fetchColumn();
        $args = [
            $code,
            (string)($data['name_th'] ?? ''),
            $metric,
            $cmp,
            (float)$data['threshold'],
            (string)($data['unit'] ?? ''),
            (float)($data['weight'] ?? 1.0),
            (int)($data['min_evidence'] ?? 1),
            (int)($data['min_sample_period_days'] ?? 90),
            (int)(($data['enabled'] ?? 0) ? 1 : 0),
            (int)($data['sort_order'] ?? 100),
            (string)($data['note'] ?? ''),
        ];
        if ($id) {
            $up = $pdo->prepare('UPDATE reliability_bad_actor_criteria
                SET name_th = ?, metric = ?, comparator = ?, threshold = ?, unit = ?, weight = ?,
                    min_evidence = ?, min_sample_period_days = ?, enabled = ?, sort_order = ?, note = ?
                WHERE id = ?');
            $up->execute(array_slice($args, 1) . [(int)$id]);
            return ['ok' => true, 'id' => (int)$id, 'created' => false];
        }
        $ins = $pdo->prepare('INSERT INTO reliability_bad_actor_criteria
            (criteria_code, name_th, metric, comparator, threshold, unit, weight,
             min_evidence, min_sample_period_days, enabled, sort_order, note, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $ins->execute(array_merge($args, [$userId > 0 ? $userId : null]));
        return ['ok' => true, 'id' => (int)$pdo->lastInsertId(), 'created' => true];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

/** Compare a metric against a criterion threshold. A NULL metric never fires. */
function rel_ba_compare(?float $value, string $comparator, float $threshold): bool {
    if ($value === null) {
        return false;
    }
    return match ($comparator) {
        'gte' => $value >= $threshold,
        'gt'  => $value > $threshold,
        'lte' => $value <= $threshold,
        'lt'  => $value < $threshold,
        'eq'  => abs($value - $threshold) < 1e-9,
        default => false,
    };
}

/**
 * Score in-scope assets against the ENABLED criteria.
 *
 * The score is an ordering aid (sum of fired weights), never a verdict. Zero
 * enabled criteria is a legitimate state and the engine says so instead of
 * inventing a ranking.
 */
function rel_bad_actor_scores(PDO $pdo, array $opts, int $roleId = 0): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $ctx = rel_context($pdo, $opts, $cfg);
    $criteria = rel_bad_actor_criteria($pdo, true);
    $limit = max(1, min(200, (int)($opts['limit'] ?? 25)));
    $canSeeCost = in_array($roleId, rel_roles_cost(), true) || $roleId === 0;

    $out = [
        'meta'     => rel_context_meta($ctx),
        'criteria' => $criteria,
        'rows'     => [],
        'status'   => RL_DQ_NOT_ENOUGH,
        'note'     => '',
        'summary'  => ['assets_scored' => 0, 'assets_flagged' => 0, 'criteria_enabled' => count($criteria)],
    ];

    if ($criteria === []) {
        $out['status'] = 'NOT_CONFIGURED';
        $out['note'] = 'No bad-actor criterion is enabled. The system refuses to ship a universal bad-actor '
            . 'score, because "bad" depends on the plant: enable a criterion in Reliability > Config first.';
        return $out;
    }
    if ($ctx['period']['days'] < ($cfg['min_sample_period_days'] ?? 90)) {
        $out['note'] = 'window shorter than the configured minimum sample period; a ranking now would be noise';
    }

    $ids = $ctx['scope']['asset_ids'];
    if ($ids === []) {
        $out['note'] = 'scope contains no asset';
        return $out;
    }

    $inIds = rel_id_in($ids, 'asset_id');
    $isFe = (($ctx['source']['table'] ?? '') === 'failure_events');
    $failSql = $isFe
        ? 'SELECT asset_id, COUNT(*) AS c FROM failure_events WHERE failure_date BETWEEN ? AND ?' . $inIds . ' GROUP BY asset_id'
        : 'SELECT asset_id, COUNT(*) AS c FROM repair WHERE created_at BETWEEN ? AND ? AND ' . RL_BREAKDOWN_SQL
            . ' AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . $inIds . ' GROUP BY asset_id';
    $repeatSql = $isFe
        ? 'SELECT asset_id, COUNT(*) AS c FROM failure_events WHERE failure_date BETWEEN ? AND ? AND repeat_suspected = 1' . $inIds . ' GROUP BY asset_id'
        : 'SELECT asset_id, 0 AS c FROM failure_events WHERE 1=0 GROUP BY asset_id';

    $sql = 'SELECT a.id AS asset_id, a.code AS asset_code, a.name AS asset_name, a.criticality, a.category,
                   COALESCE(f.c,0) AS failure_count,
                   COALESCE(dt.dmin,0) AS downtime_minutes,
                   ph.op_hours,
                   rp.mttr_minutes, COALESCE(rp.repairs,0) AS repairs,
                   COALESCE(rp.emergency,0) AS emergency_wo,
                   COALESCE(rp.repeat_wo,0) AS repeat_wo,
                   mc.cost, mc.cost_rows, mc.missing_price
              FROM asset_registry a
         LEFT JOIN (' . $failSql . ') f ON f.asset_id = a.id
         LEFT JOIN (' . $repeatSql . ') rp2 ON rp2.asset_id = a.id
         LEFT JOIN (SELECT asset_id, SUM(CASE WHEN downtime_minutes > 0 THEN downtime_minutes ELSE 0 END) AS dmin
                      FROM repair WHERE created_at BETWEEN ? AND ?
                        AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . $inIds . '
                     GROUP BY asset_id) dt ON dt.asset_id = a.id
         LEFT JOIN (SELECT asset_id, COALESCE(SUM(hours),0) AS op_hours FROM production_hours
                     WHERE record_date BETWEEN ? AND ?' . $inIds . ' GROUP BY asset_id) ph ON ph.asset_id = a.id
         LEFT JOIN (SELECT asset_id,
                           AVG(CASE WHEN actual_start_at IS NOT NULL AND completed_at IS NOT NULL
                                    THEN TIMESTAMPDIFF(MINUTE, actual_start_at, completed_at) END) AS mttr_minutes,
                           COUNT(*) AS repairs,
                           SUM(CASE WHEN priority IN ("high","critical") OR work_order_type IN ("emergency","urgent") THEN 1 ELSE 0 END) AS emergency,
                           SUM(CASE WHEN reopened = 1 THEN 1 ELSE 0 END) AS repeat_wo
                      FROM repair
                     WHERE completed_at BETWEEN ? AND ?
                       AND status IN (' . rel_quote_list(RL_DONE_STATUSES) . ')
                       AND status NOT IN (' . rel_quote_list(RL_EXCLUDED_STATUSES) . ')' . $inIds . '
                     GROUP BY asset_id) rp ON rp.asset_id = a.id
         LEFT JOIN (SELECT asset_id,
                           SUM(COALESCE(cost_labor_recorded,0)+COALESCE(cost_outsource_recorded,0)
                               + COALESCE(parts_cost,0)+COALESCE(cost_parts_snapshot,0)) AS cost,
                           COUNT(*) AS cost_rows,
                           COALESCE(SUM(COALESCE(parts_missing_price,0)),0) AS missing_price
                      FROM v_maintenance_cost WHERE created_at BETWEEN ? AND ?' . $inIds . '
                     GROUP BY asset_id) mc ON mc.asset_id = a.id';

    $params = [$ctx['period']['start'], $ctx['period']['end']];
    if ($isFe) {
        $params[] = $ctx['period']['start'];
        $params[] = $ctx['period']['end'];
    }
    $params = array_merge($params, [
        $ctx['period']['start'], $ctx['period']['end'],
        $ctx['period']['start'], $ctx['period']['end'],
        $ctx['period']['start'], $ctx['period']['end'],
    ]);

    try {
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        $rows = [];
    }

    $rowsOut = [];
    foreach ($rows as $r) {
        $opH = ($r['op_hours'] === null || (float)$r['op_hours'] <= 0) ? null : (float)$r['op_hours'];
        $failCount = (int)$r['failure_count'];
        $dtMin = (float)$r['downtime_minutes'];
        $metrics = [
            'failure_count'        => (float)$failCount,
            'failure_rate_per_1000h' => ($opH !== null && $opH > 0) ? ($failCount / $opH) * 1000.0 : null,
            'downtime_hours'       => $dtMin / 60.0,
            'maintenance_cost'     => $canSeeCost ? (($r['cost'] === null) ? null : (float)$r['cost']) : null,
            'repeat_failure_count' => (float)(int)($r['repeat_wo'] ?? 0),
            'availability_pct'     => ($opH !== null && ($opH + $dtMin / 60.0) > 0)
                ? ($opH / ($opH + $dtMin / 60.0)) * 100.0 : null,
            'mttr_hours'           => ($r['mttr_minutes'] === null) ? null : ((float)$r['mttr_minutes']) / 60.0,
            'emergency_wo_count'   => (float)(int)($r['emergency_wo'] ?? 0),
        ];
        $evidence = [
            'failure_events'   => $failCount,
            'downtime_rows'    => $dtMin > 0 ? 1 : 0,
            'repairs_completed' => (int)($r['repairs'] ?? 0),
            'operating_hours'  => rel_round($opH, 2),
            'cost_rows'        => $canSeeCost ? (int)($r['cost_rows'] ?? 0) : null,
            'cost_lines_missing_price' => $canSeeCost ? (int)($r['missing_price'] ?? 0) : null,
        ];
        $completeness = rel_bad_actor_completeness($metrics);

        $hits = [];
        $score = 0.0;
        foreach ($criteria as $c) {
            $metric = (string)$c['metric'];
            $value = $metrics[$metric] ?? null;
            $evCount = (int)$evidence['failure_events'] + (int)$evidence['repairs_completed'];
            if ($metric === 'failure_count') {
                $evCount = $failCount;
            } elseif ($metric === 'downtime_hours') {
                $evCount = $dtMin > 0 ? 1 : 0;
            } elseif ($metric === 'maintenance_cost') {
                $evCount = (int)($evidence['cost_rows'] ?? 0);
            }
            $fired = $evCount >= (int)$c['min_evidence']
                && rel_ba_compare($value === null ? null : (float)$value, (string)$c['comparator'], (float)$c['threshold']);
            $hits[] = [
                'criteria_code' => (string)$c['criteria_code'],
                'metric'        => $metric,
                'value'         => $value === null ? null : rel_round((float)$value, 4),
                'comparator'    => (string)$c['comparator'],
                'threshold'     => (float)$c['threshold'],
                'unit'          => (string)($c['unit'] ?? ''),
                'evidence_rows' => $evCount,
                'min_evidence'  => (int)$c['min_evidence'],
                'fired'         => $fired,
            ];
            if ($fired) {
                $score += (float)$c['weight'];
            }
        }

        $rowsOut[] = [
            'asset_id'      => (int)$r['asset_id'],
            'asset_code'    => (string)$r['asset_code'],
            'asset_name'    => (string)$r['asset_name'],
            'criticality'   => (string)($r['criticality'] ?? ''),
            'category'      => (string)($r['category'] ?? ''),
            'score'         => round($score, 3),
            'criteria_hit'  => count(array_filter($hits, static fn($h) => $h['fired'])),
            'criteria_total' => count($criteria),
            'metrics'       => array_map(static fn($v) => $v === null ? null : rel_round((float)$v, 4), $metrics),
            'evidence'      => $hits,
            'failure_count' => $failCount,
            'downtime_hours' => rel_round($dtMin / 60.0, 3),
            'operating_hours' => rel_round($opH, 2),
            'maintenance_cost' => $canSeeCost ? rel_round((float)($r['cost'] ?? 0), 2) : null,
            'cost_available'   => $canSeeCost && (int)($r['cost_rows'] ?? 0) > 0,
            'data_completeness_pct' => $completeness,
            'status'        => ($completeness >= 50.0) ? RL_DQ_COMPLETE : RL_DQ_PARTIAL,
        ];
    }

    usort($rowsOut, static function ($x, $y) {
        if ($x['score'] === $y['score']) {
            return ($y['downtime_hours'] ?? 0) <=> ($x['downtime_hours'] ?? 0);
        }
        return $y['score'] <=> $x['score'];
    });

    $out['rows'] = array_slice($rowsOut, 0, $limit);
    $out['summary']['assets_scored'] = count($rowsOut);
    $out['summary']['assets_flagged'] = count(array_filter($rowsOut, static fn($r) => $r['criteria_hit'] > 0));
    $out['status'] = RL_DQ_PARTIAL;
    $out['note'] = 'score = sum of fired criterion weights; it ranks assets, it does not judge them. '
        . 'Every fired criterion keeps the number that fired it.';
    return $out;
}

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

/**
 * Persist the lineage of an expensive or exported KPI.
 *
 * The snapshot records the definition version, the filters, the inputs and the
 * DQ verdict, so the number can be re-explained after a formula change.
 */
function rel_snapshot_save(PDO $pdo, array $ctx, string $kpiCode, array $result, int $userId): array {
    $cfg = $ctx['cfg'];
    if (($cfg['snapshot_persist'] ?? true) !== true) {
        return ['saved' => false, 'reason' => 'snapshot persistence disabled (reliability_snapshot_persist_enabled = 0)'];
    }
    $def = rel_kpi_definition($pdo, $kpiCode);
    if ($def === null) {
        return ['saved' => false, 'reason' => 'no KPI definition row for ' . $kpiCode . '; nothing is invented here'];
    }

    $uid = rel_uuid();
    $ttl = max(1, (int)($cfg['snapshot_ttl_hours'] ?? 24));
    try {
        $st = $pdo->prepare('INSERT INTO reliability_calc_snapshots
            (calc_uid, kpi_code, kpi_definition_id, kpi_definition_version,
             scope_type, scope_id, scope_label, period_start, period_end, period_preset,
             operating_basis, repair_time_basis, availability_flavour,
             filters_json, inputs_json, result_value, result_unit,
             sample_size, population_size, data_quality, data_quality_json, calc_method,
             evidence_json, computed_by, expires_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute([
            $uid,
            $kpiCode,
            (int)$def['id'],
            (int)$def['version'],
            (string)$ctx['scope']['type'],
            (string)$ctx['scope']['id'],
            (string)$ctx['scope']['label'],
            $ctx['period']['start'],
            $ctx['period']['end'],
            (string)$ctx['period']['preset'],
            (string)$ctx['basis'],
            (string)$ctx['repair_basis'],
            'observed',
            json_encode([
                'opts'    => array_diff_key($ctx['opts'], ['__pdo' => 1]),
                'statuses' => $ctx['scope']['statuses'],
                'source'  => $ctx['source']['table'],
            ], JSON_UNESCAPED_UNICODE),
            json_encode($result['inputs'] ?? [], JSON_UNESCAPED_UNICODE),
            $result['value'] === null ? null : (float)$result['value'],
            (string)($result['unit'] ?? ''),
            (int)(is_array($result['inputs'] ?? null) ? (int)($result['inputs']['failures'] ?? 0) : 0),
            (int)$ctx['scope']['asset_count'],
            (string)($result['status'] ?? RL_DQ_NOT_ENOUGH),
            json_encode([
                'status' => $ctx['dq']['status'],
                'flags'  => $ctx['dq']['flags'],
                'checks' => array_map(
                    static fn($c) => ['code' => $c['check_code'], 'count' => $c['count'], 'severity' => $c['severity']],
                    $ctx['dq']['checks']
                ),
            ], JSON_UNESCAPED_UNICODE),
            (string)$def['formula_display'],
            json_encode(array_slice(array_map(
                static fn($f) => ['id' => $f['id'], 'ref' => $f['ref'], 'ts' => $f['ts'], 'asset_id' => $f['asset_id']],
                $ctx['failures_valid']
            ), 0, 20), JSON_UNESCAPED_UNICODE),
            $userId > 0 ? $userId : null,
            date('Y-m-d H:i:s', time() + $ttl * 3600),
        ]);
        return ['saved' => true, 'calc_uid' => $uid, 'expires_at' => date('Y-m-d H:i:s', time() + $ttl * 3600)];
    } catch (Throwable $e) {
        return ['saved' => false, 'reason' => $e->getMessage()];
    }
}

/** Snapshot history for the governance screen. */
function rel_snapshot_list(PDO $pdo, array $opts = []): array {
    $limit = max(1, min(200, (int)($opts['limit'] ?? 50)));
    try {
        $sql = 'SELECT id, calc_uid, kpi_code, kpi_definition_version, scope_type, scope_id, scope_label,
                       period_start, period_end, period_preset, operating_basis, result_value, result_unit,
                       sample_size, population_size, data_quality, computed_at, expires_at
                  FROM reliability_calc_snapshots WHERE 1=1';
        $params = [];
        if (($opts['kpi_code'] ?? '') !== '') {
            $sql .= ' AND kpi_code = ?';
            $params[] = (string)$opts['kpi_code'];
        }
        $sql .= ' ORDER BY computed_at DESC LIMIT ' . $limit;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

/** One snapshot with its full lineage payload. */
function rel_snapshot_get(PDO $pdo, string $calcUid): ?array {
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_calc_snapshots WHERE calc_uid = ? LIMIT 1');
        $st->execute([$calcUid]);
        $row = $st->fetch();
        if (!$row) {
            return null;
        }
        foreach (['filters_json', 'inputs_json', 'data_quality_json', 'evidence_json'] as $k) {
            if (!empty($row[$k])) {
                $decoded = json_decode((string)$row[$k], true);
                $row[$k] = is_array($decoded) ? $decoded : $row[$k];
            }
        }
        $row['result_value'] = $row['result_value'] === null ? null : (float)$row['result_value'];
        return $row;
    } catch (Throwable $e) {
        return null;
    }
}

/* ===========================================================================
 * 19. ENGINEERING STUDIES (documents, not transactions)
 * =========================================================================== */

/** Next study code, e.g. REL-20260924-003. */
function rel_study_next_code(PDO $pdo): string {
    $base = 'REL-' . date('Ymd') . '-';
    try {
        $st = $pdo->prepare('SELECT study_code FROM reliability_studies WHERE study_code LIKE ? ORDER BY study_code DESC LIMIT 1');
        $st->execute([$base . '%']);
        $max = (string)$st->fetchColumn();
        $seq = 1;
        if ($max !== '' && str_starts_with($max, $base)) {
            $seq = (int)substr($max, strlen($base)) + 1;
        }
        return $base . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);
    } catch (Throwable $e) {
        return $base . '001';
    }
}

const RL_STUDY_STATUSES = ['draft', 'in_review', 'approved', 'closed', 'cancelled'];

/** Allowed study transitions. Anything else is refused with the reason. */
function rel_study_transition_allowed(string $from, string $to): bool {
    return in_array($to, [
        'draft' => ['in_review', 'cancelled'],
        'in_review' => ['approved', 'draft', 'cancelled'],
        'approved' => ['closed', 'in_review', 'cancelled'],
        'closed' => [],
        'cancelled' => [],
    ][$from] ?? [], true);
}

/** Study list with the action counts a reviewer needs. */
function rel_studies(PDO $pdo, array $opts = []): array {
    $limit = max(1, min(200, (int)($opts['limit'] ?? 50)));
    $where = '1=1';
    $params = [];
    if (($opts['status'] ?? '') !== '') {
        $where .= ' AND s.status = ?';
        $params[] = (string)$opts['status'];
    }
    $q = trim((string)($opts['q'] ?? ''));
    if ($q !== '') {
        $where .= ' AND (s.title LIKE ? OR s.study_code LIKE ?)';
        $params[] = '%' . $q . '%';
        $params[] = '%' . $q . '%';
    }
    try {
        $sql = 'SELECT s.*,
                       (SELECT COUNT(*) FROM reliability_study_links l WHERE l.study_id = s.id) AS link_count,
                       (SELECT COUNT(*) FROM reliability_actions a WHERE a.study_id = s.id) AS action_count,
                       u.display_name AS analyst_name, rv.display_name AS reviewer_name
                  FROM reliability_studies s
             LEFT JOIN users u ON u.id = s.analyst_id
             LEFT JOIN users rv ON rv.id = s.reviewer_id
                 WHERE ' . $where . '
              ORDER BY s.created_at DESC LIMIT ' . $limit;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

/** One study with its links and review history. */
function rel_study_get(PDO $pdo, int $id): ?array {
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_studies WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            return null;
        }
        $row['links'] = rel_study_links($pdo, $id);
        $row['status_log'] = rel_study_status_log($pdo, $id);
        $st2 = $pdo->prepare('SELECT * FROM reliability_actions WHERE study_id = ? ORDER BY id ASC');
        $st2->execute([$id]);
        $row['actions'] = $st2->fetchAll() ?: [];
        return $row;
    } catch (Throwable $e) {
        return null;
    }
}

/** References a study makes to existing records (it never copies them). */
function rel_study_links(PDO $pdo, int $studyId): array {
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_study_links WHERE study_id = ? ORDER BY id ASC');
        $st->execute([$studyId]);
        return $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

/** Append-only review history. */
function rel_study_status_log(PDO $pdo, int $studyId): array {
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_study_status_log WHERE study_id = ? ORDER BY id ASC');
        $st->execute([$studyId]);
        return $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

const RL_STUDY_LINK_TYPES = [
    'asset', 'failure_event', 'work_order', 'rca', 'engineering_change',
    'condition', 'weibull_fit', 'report', 'document', 'pm',
];

/** Create or update a study document. */
function rel_study_save(PDO $pdo, array $data, int $userId): array {
    $id = (int)($data['id'] ?? 0);
    $title = trim((string)($data['title'] ?? ''));
    if ($title === '') {
        return ['ok' => false, 'error' => 'title is required'];
    }
    $periodStart = substr(trim((string)($data['period_start'] ?? '')), 0, 10);
    $periodEnd = substr(trim((string)($data['period_end'] ?? '')), 0, 10);
    if ($periodStart === '' || $periodEnd === '') {
        return ['ok' => false, 'error' => 'period_start and period_end are required: a study must declare its window'];
    }
    $status = strtolower(trim((string)($data['status'] ?? 'draft')));
    if (!in_array($status, RL_STUDY_STATUSES, true)) {
        return ['ok' => false, 'error' => 'status must be one of: ' . implode(', ', RL_STUDY_STATUSES)];
    }

    $fields = [
        $title,
        (string)($data['scope_description'] ?? ''),
        $data['asset_scope_json'] ?? null,
        (string)($data['asset_scope_note'] ?? ''),
        $periodStart,
        $periodEnd,
        (int)($data['analyst_id'] ?? 0) ?: null,
        (int)($data['reviewer_id'] ?? 0) ?: null,
        (string)($data['method'] ?? ''),
        (string)($data['method_note'] ?? ''),
        (string)($data['data_sources'] ?? ''),
        (string)($data['data_quality_note'] ?? ''),
        (string)($data['assumptions'] ?? ''),
        (string)($data['findings'] ?? ''),
        (string)($data['evidence_summary'] ?? ''),
        (string)($data['conclusion'] ?? ''),
        $status,
        (string)($data['priority'] ?? 'medium'),
    ];

    try {
        if ($id > 0) {
            $up = $pdo->prepare('UPDATE reliability_studies SET
                    title = ?, scope_description = ?, asset_scope_json = ?, asset_scope_note = ?,
                    period_start = ?, period_end = ?, analyst_id = ?, reviewer_id = ?, method = ?,
                    method_note = ?, data_sources = ?, data_quality_note = ?, assumptions = ?,
                    findings = ?, evidence_summary = ?, conclusion = ?, status = ?, priority = ?
                WHERE id = ?');
            $up->execute(array_merge($fields, [$id]));
            rel_rel_audit($pdo, 'RELIABILITY_STUDY_UPDATE', 'reliability_study', $id, 'study updated', $userId);
            return ['ok' => true, 'id' => $id, 'created' => false];
        }
        $code = rel_study_next_code($pdo);
        $ins = $pdo->prepare('INSERT INTO reliability_studies
            (study_code, title, scope_description, asset_scope_json, asset_scope_note,
             period_start, period_end, analyst_id, reviewer_id, method, method_note,
             data_sources, data_quality_note, assumptions, findings, evidence_summary,
             conclusion, status, priority, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $ins->execute(array_merge([$code], $fields, [$userId > 0 ? $userId : null]));
        $newId = (int)$pdo->lastInsertId();
        rel_rel_audit($pdo, 'RELIABILITY_STUDY_CREATE', 'reliability_study', $newId, $code . ' ' . $title, $userId);
        return ['ok' => true, 'id' => $newId, 'study_code' => $code, 'created' => true];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

/** Move a study through its review workflow, with an append-only log entry. */
function rel_study_transition(PDO $pdo, int $id, string $to, string $note, int $userId): array {
    try {
        $st = $pdo->prepare('SELECT status, study_code, title FROM reliability_studies WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            return ['ok' => false, 'error' => 'study not found'];
        }
        $from = (string)$row['status'];
        $to = strtolower(trim($to));
        if ($to === $from) {
            return ['ok' => false, 'error' => 'study is already ' . $from];
        }
        if (!rel_study_transition_allowed($from, $to)) {
            return ['ok' => false, 'error' => 'a study cannot move from ' . $from . ' to ' . $to];
        }

        $sets = ['status = ?'];
        $params = [$to];
        if ($to === 'in_review') {
            $sets[] = 'submitted_at = NOW()';
        }
        if ($to === 'approved') {
            $sets[] = 'approved_at = NOW()';
            $sets[] = 'approved_by = ?';
            $params[] = $userId > 0 ? $userId : null;
        }
        if ($to === 'closed') {
            $sets[] = 'closed_at = NOW()';
        }
        $params[] = $id;

        $up = $pdo->prepare('UPDATE reliability_studies SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $up->execute($params);

        $log = $pdo->prepare('INSERT INTO reliability_study_status_log
            (study_id, from_status, to_status, note, actor_id) VALUES (?,?,?,?,?)');
        $log->execute([$id, $from, $to, $note, $userId > 0 ? $userId : null]);

        rel_rel_audit($pdo, 'RELIABILITY_STUDY_STATUS', 'reliability_study', $id,
            $from . ' -> ' . $to, $userId);
        return ['ok' => true, 'from' => $from, 'to' => $to];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

/** Attach a reference to an existing record. The target is never copied. */
function rel_study_add_link(PDO $pdo, int $studyId, array $data, int $userId): array {
    $type = strtolower(trim((string)($data['link_type'] ?? '')));
    if (!in_array($type, RL_STUDY_LINK_TYPES, true)) {
        return ['ok' => false, 'error' => 'link_type must be one of: ' . implode(', ', RL_STUDY_LINK_TYPES)];
    }
    $targetId = trim((string)($data['target_id'] ?? ''));
    if ($targetId === '') {
        return ['ok' => false, 'error' => 'target_id is required: a study points at records, it does not invent them'];
    }
    try {
        $st = $pdo->prepare('INSERT INTO reliability_study_links
            (study_id, link_type, target_id, title, note, created_by) VALUES (?,?,?,?,?,?)');
        $st->execute([$studyId, $type, $targetId, (string)($data['title'] ?? ''), (string)($data['note'] ?? ''), $userId > 0 ? $userId : null]);
        return ['ok' => true, 'id' => (int)$pdo->lastInsertId()];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

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

/** Action list with its owning study. */
function rel_actions(PDO $pdo, array $opts = []): array {
    $limit = max(1, min(200, (int)($opts['limit'] ?? 50)));
    $where = '1=1';
    $params = [];
    if (($opts['status'] ?? '') !== '') {
        $where .= ' AND a.status = ?';
        $params[] = (string)$opts['status'];
    }
    if (($opts['study_id'] ?? '') !== '') {
        $where .= ' AND a.study_id = ?';
        $params[] = (int)$opts['study_id'];
    }
    try {
        $sql = 'SELECT a.*, s.study_code, s.title AS study_title, ar.code AS asset_code, ar.name AS asset_name
                  FROM reliability_actions a
             LEFT JOIN reliability_studies s ON s.id = a.study_id
             LEFT JOIN asset_registry ar ON ar.id = a.asset_id
                 WHERE ' . $where . '
              ORDER BY a.created_at DESC LIMIT ' . $limit;
        $st = $pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll() ?: [];
    } catch (Throwable $e) {
        return [];
    }
}

/**
 * Raise an action from a study.
 *
 * target_module is mandatory and is taken from RL_ACTION_TYPES: the action names
 * the module that owns execution and creates nothing there.
 */
function rel_action_create(PDO $pdo, array $data, int $userId): array {
    $type = strtolower(trim((string)($data['action_type'] ?? '')));
    if (!isset(RL_ACTION_TYPES[$type])) {
        return ['ok' => false, 'error' => 'action_type must be one of: ' . implode(', ', array_keys(RL_ACTION_TYPES))];
    }
    $title = trim((string)($data['title'] ?? ''));
    if ($title === '') {
        return ['ok' => false, 'error' => 'title is required'];
    }
    $studyId = (int)($data['study_id'] ?? 0);
    if ($studyId > 0 && rel_study_get($pdo, $studyId) === null) {
        return ['ok' => false, 'error' => 'study not found'];
    }
    try {
        $code = 'RELA-' . date('Ymd') . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 6));
        $ins = $pdo->prepare('INSERT INTO reliability_actions
            (action_code, study_id, action_type, target_module, title, description, asset_id,
             related_ref_type, related_ref_id, priority, due_date, status, requested_by, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $ins->execute([
            $code,
            $studyId > 0 ? $studyId : null,
            $type,
            RL_ACTION_TYPES[$type],
            $title,
            (string)($data['description'] ?? ''),
            (int)($data['asset_id'] ?? 0) ?: null,
            (string)($data['related_ref_type'] ?? ''),
            (string)($data['related_ref_id'] ?? ''),
            (string)($data['priority'] ?? 'medium'),
            substr((string)($data['due_date'] ?? ''), 0, 10) ?: null,
            'proposed',
            $userId > 0 ? $userId : null,
            $userId > 0 ? $userId : null,
        ]);
        $id = (int)$pdo->lastInsertId();
        rel_rel_audit($pdo, 'RELIABILITY_ACTION_CREATE', 'reliability_action', $id,
            $type . ' -> module ' . RL_ACTION_TYPES[$type] . ': ' . $title, $userId);
        return ['ok' => true, 'id' => $id, 'action_code' => $code, 'target_module' => RL_ACTION_TYPES[$type]];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

const RL_ACTION_FLOW = [
    'proposed'   => ['accepted', 'rejected', 'cancelled'],
    'accepted'   => ['in_progress', 'cancelled'],
    'in_progress' => ['completed', 'cancelled'],
    'completed'  => [],
    'cancelled'  => [],
    'rejected'   => [],
];

/**
 * Move an action through its lifecycle.
 *
 * Completing an action RECORDS evidence; it does not touch the target module.
 * The engineer still runs that module's own workflow.
 */
function rel_action_transition(PDO $pdo, int $id, string $to, string $note, string $evidence, int $userId): array {
    try {
        $st = $pdo->prepare('SELECT * FROM reliability_actions WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) {
            return ['ok' => false, 'error' => 'action not found'];
        }
        $from = (string)$row['status'];
        $to = strtolower(trim($to));
        if (!in_array($to, RL_ACTION_FLOW[$from] ?? [], true)) {
            return ['ok' => false, 'error' => 'an action cannot move from ' . $from . ' to ' . $to];
        }
        if ($to === 'completed' && trim($evidence) === '') {
            return ['ok' => false, 'error' => 'completion_evidence is required: "done" without evidence is a claim, not a result'];
        }

        $sets = ['status = ?'];
        $params = [$to];
        if ($to === 'accepted') {
            $sets[] = 'accepted_at = NOW()';
            $sets[] = 'accepted_by = ?';
            $params[] = $userId > 0 ? $userId : null;
        }
        if ($to === 'completed') {
            $sets[] = 'completed_at = NOW()';
            $sets[] = 'completion_evidence = ?';
            $params[] = $evidence;
        }
        if ($to === 'cancelled' || $to === 'rejected') {
            $sets[] = 'cancel_reason = ?';
            $params[] = $note;
        }
        $params[] = $id;

        $up = $pdo->prepare('UPDATE reliability_actions SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $up->execute($params);
        rel_rel_audit($pdo, 'RELIABILITY_ACTION_STATUS', 'reliability_action', $id, $from . ' -> ' . $to, $userId);
        return ['ok' => true, 'from' => $from, 'to' => $to,
            'note' => 'the target module was not modified; execute it through ' . (string)$row['target_module']];
    } catch (Throwable $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }
}

/* ===========================================================================
 * 21. REPORTS, DASHBOARD, FEATURE STATUS
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

/** Fleet reliability report: KPIs plus the worst assets, with lineage. */
function rel_report_summary(PDO $pdo, array $opts, int $roleId = 0): array {
    $ctx = rel_context($pdo, $opts);
    $bundle = rel_kpi_bundle($pdo, $ctx, $roleId);
    $matrix = rel_asset_matrix($pdo, array_merge($opts, ['page_size' => 20, 'sort' => 'downtime']), $roleId);
    $modes = rel_failure_modes($pdo, $ctx);
    return [
        'meta'     => rel_context_meta($ctx),
        'kpis'     => $bundle,
        'worst_assets' => array_slice($matrix['rows'], 0, 20),
        'failure_modes' => array_slice($modes['modes'], 0, 10),
        'definitions' => rel_kpi_definitions($pdo),
        'status'   => $ctx['dq']['status'],
        'note'     => 'export carries its definitions and its data-quality verdict so the file explains itself',
    ];
}

/**
 * Reliability overview payload.
 *
 * Every card states its own status, so a screen full of numbers is never
 * mistaken for a screen full of health.
 */
function rel_dashboard(PDO $pdo, array $opts, int $roleId = 0): array {
    $opts['__pdo'] = $pdo;
    $cfg = rel_config($pdo);
    $t0 = microtime(true);
    $ctx = rel_context($pdo, $opts, $cfg);
    $kpis = rel_kpi_bundle($pdo, $ctx, $roleId);
    $modes = rel_failure_modes($pdo, $ctx);
    $trend = rel_trend($pdo, $ctx);
    $condition = rel_condition_summary($pdo, $opts);

    $cards = [];
    foreach (['mtbf', 'mttr', 'failure_rate', 'availability', 'downtime', 'repeat_failure_rate', 'alarm_frequency', 'cost_per_op_hour'] as $code) {
        $k = $kpis[$code] ?? null;
        if ($k === null) {
            continue;
        }
        $cards[] = [
            'kpi_code' => (string)$k['kpi_code'],
            'value'    => $k['value'] ?? null,
            'unit'     => (string)($k['unit'] ?? ''),
            'status'   => (string)($k['status'] ?? RL_DQ_NOT_ENOUGH),
            'note'     => (string)($k['note'] ?? ''),
            'inputs'   => $k['inputs'] ?? [],
            'basis'    => $k['basis'] ?? null,
            'definition' => $k['definition'] ?? null,
        ];
    }

    $blocked = [];
    foreach ($cards as $c) {
        if ($c['status'] !== RL_DQ_COMPLETE) {
            $blocked[] = ['kpi_code' => $c['kpi_code'], 'status' => $c['status'], 'why' => $c['note']];
        }
    }

    return [
        'meta'      => rel_context_meta($ctx),
        'cards'     => $cards,
        'failure_modes' => array_slice($modes['modes'], 0, 8),
        'trend'     => array_slice($trend['buckets'], -12),
        'trend_status' => $trend['status'],
        'condition' => [
            'with_snapshot'  => $condition['with_snapshot'],
            'without_snapshot' => $condition['without_snapshot'],
            'by_severity'   => $condition['by_severity'],
            'active_alarms' => $condition['active_alarms'],
            'note'          => $condition['note'],
        ],
        'data_quality' => [
            'status'  => $ctx['dq']['status'],
            'checks'  => $ctx['dq']['checks'],
            'flags'   => $ctx['dq']['flags'],
            'note'    => $ctx['dq']['note'],
        ],
        'blocked'   => $blocked,
        'calc_ms'   => (int)round((microtime(true) - $t0) * 1000),
        'snapshot'  => rel_snapshot_should_persist($cfg, microtime(true) - $t0),
        'note'      => 'a card with status NOT_ENOUGH_DATA or PARTIAL is a statement about the records, not a failure of the system',
    ];
}

/** Whether an expensive calculation should leave a lineage record. */
function rel_snapshot_should_persist(array $cfg, float $elapsedSec): bool {
    if (($cfg['snapshot_persist'] ?? true) !== true) {
        return false;
    }
    return ($elapsedSec * 1000.0) >= (float)($cfg['snapshot_threshold_ms'] ?? 750);
}

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