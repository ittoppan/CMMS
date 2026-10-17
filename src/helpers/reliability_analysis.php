<?php
/* Split from src/helpers/reliability.php (2026-10-17) - always loaded via reliability.php */

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


