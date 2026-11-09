<?php
/* Split from src/helpers/reliability.php (2026-10-17) - always loaded via reliability.php */

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


/** Next study code, e.g. REL-20260924-003. */
function rel_study_next_code(PDO $pdo): string {
    $base = 'REL-' . date('Ymd') . '-';
    try {
        // เทียบเฉพาะเลขท้ายแบบตัวเลข — ORDER BY study_code DESC แบบ lexical จะเรียง
        // '...-999' เกิน '...-1000' ทำให้ออกรหัสซ้ำ (study_code มี UNIQUE)
        $st = $pdo->prepare('SELECT MAX(CAST(SUBSTRING(study_code, ?) AS UNSIGNED)) FROM reliability_studies WHERE study_code LIKE ?');
        $st->execute([strlen($base) + 1, $base . '%']);
        $max = $st->fetchColumn();
        $seq = ($max === null || $max === false) ? 1 : ((int)$max + 1);
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
                       u.full_name AS analyst_name, rv.full_name AS reviewer_name
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


