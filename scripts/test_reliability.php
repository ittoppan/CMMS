<?php
/**
 * scripts/test_reliability.php — behavioral harness for the Phase 37 Advanced
 * Reliability engine (src/helpers/reliability.php).
 *
 * Focus: the deterministic, side-effect-free core — config defaults, period
 * resolution (presets / clamp / custom / fallbacks), numeric helpers, id
 * predicates, unit conversion, percentiles, Weibull MLE math (h, solve, rankit,
 * curve, B10), observation hashing, bad-actor comparison + completeness, study
 * transition map, beta interpretation and the delete-safe study code generator.
 *
 * Runs against a THROWAWAY database = live DB name + "_reltest".
 *   php scripts/test_reliability.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);

function parseDotEnv(string $path): array {
    $out = [];
    if (!is_file($path)) return $out;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }
    return $out;
}

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_reltest';

if (!str_ends_with($scratch, '_reltest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx($a, $b, float $eps = 1e-6): bool {
    return $a !== null && $b !== null && is_numeric($a) && is_numeric($b) && abs((float)$a - (float)$b) <= $eps;
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Reliability harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo 'Cloned structure of ' . count($tables) . " tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/reliability.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ================================================================= 1. constants */
echo "\n[1] constants\n";
check('RL_VERSION', RL_VERSION === 'phase37.1');
check('5 bases', RL_BASES === ['production', 'declared', 'runtime', 'interval', 'calendar']);
check('3 repair bases', RL_REPAIR_BASES === ['work_to_complete', 'notify_to_restore', 'technician_labor']);
check('5 DQ verdicts', [RL_DQ_COMPLETE, RL_DQ_PARTIAL, RL_DQ_INVALID, RL_DQ_DUPLICATE, RL_DQ_NOT_ENOUGH]
    === ['COMPLETE', 'PARTIAL', 'INVALID', 'DUPLICATE', 'NOT_ENOUGH_DATA']);
check('5 study statuses', RL_STUDY_STATUSES === ['draft', 'in_review', 'approved', 'closed', 'cancelled']);

/* ================================================================= 2. config defaults */
echo "\n[2] rel_config() defaults\n";
$cfg = rel_config($pdo);
check('operating_basis production', $cfg['operating_basis'] === 'production');
check('repair_time_basis work_to_complete', $cfg['repair_time_basis'] === 'work_to_complete');
check('min_failures_for_mtbf 3', $cfg['min_failures_for_mtbf'] === 3);
check('min_sample_period_days 30', $cfg['min_sample_period_days'] === 30);
check('max_range_days 1825', $cfg['max_range_days'] === 1825);
check('weibull_min_failures 5', $cfg['weibull_min_failures'] === 5);
check('weibull_max_failures 5000', $cfg['weibull_max_failures'] === 5000);
check('trend_max_buckets 120', $cfg['trend_max_buckets'] === 120);
check('page_default_size 25', $cfg['page_default_size'] === 25);
check('calendar disabled by default', $cfg['calendar_allowed_now'] === false);
check('need_classification true', $cfg['need_classification'] === true);
check('cost_missing_display DATA_NOT_AVAILABLE', $cfg['cost_missing_display'] === 'DATA_NOT_AVAILABLE');

/* ================================================================= 3. numeric helpers */
echo "\n[3] numeric / id helpers\n";
check('rel_div 6/2 = 3', rel_div(6.0, 2.0) === 3.0);
check('rel_div by zero -> null', rel_div(1.0, 0.0) === null);
check('rel_div null num -> null', rel_div(null, 2.0) === null);
check('rel_div null den -> null', rel_div(2.0, null) === null);
check('rel_round 1.2345,2', rel_round(1.2345, 2) === 1.23);
check('rel_round null -> null', rel_round(null) === null);
check('rel_now shape', preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', rel_now()) === 1);
$u = rel_uuid();
check('rel_uuid v4 shape', preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $u) === 1, $u);
check('rel_uuid unique', rel_uuid() !== $u);

check('rel_id_in empty -> IN (NULL)', rel_id_in([], 'r.asset_id') === ' AND r.asset_id IN (NULL) ');
check('rel_id_in ints', rel_id_in([1, 2, 2, 3], 'a') === ' AND a IN (1,2,3) ');
check('rel_id_in coerces strings', rel_id_in(['7', 'x'], 'a') === ' AND a IN (7,0) ');

check('rel_quote_list basic', rel_quote_list(['a', 'b']) === "'a','b'");
check('rel_quote_list escapes quote', rel_quote_list(["a'b"]) === "'a''b'");
check('rel_quote_list empty', rel_quote_list([]) === "''");

check('unit h -> 1', rel_unit_to_hours('h') === 1.0);
check('unit minutes -> 1/60', approx(rel_unit_to_hours('minutes'), 1 / 60));
check('unit seconds -> 1/3600', approx(rel_unit_to_hours('s'), 1 / 3600));
check('unit unknown -> null', rel_unit_to_hours('bogus') === null);

check('percentile p0 -> min', rel_percentile([1, 2, 3, 4, 5], 0.0) === 1.0);
check('percentile p0.5', rel_percentile([1, 2, 3, 4, 5], 0.5) === 3.0);
check('percentile p0.25', rel_percentile([1, 2, 3, 4, 5], 0.25) === 2.0);
check('percentile p1 -> max', rel_percentile([1, 2, 3, 4, 5], 1.0) === 5.0);
check('percentile empty -> null', rel_percentile([], 0.5) === null);

/* ================================================================= 4. dq / split / ba */
echo "\n[4] misc pure helpers\n";
check('dq_source_table known', rel_dq_source_table('MISSING_RESTORATION_TS') === 'repair');
check('dq_source_table unknown -> empty', rel_dq_source_table('NOPE') === '');
$sp = rel_failure_split([
    ['id' => 1, 'valid' => true],
    ['id' => 2, 'valid' => false],
    ['id' => 3],
]);
check('failure_split valid count', count($sp['valid']) === 1);
check('failure_split invalid count', count($sp['invalid']) === 2);

check('ba_compare gte', rel_ba_compare(5.0, 'gte', 5.0) === true);
check('ba_compare gt false on equal', rel_ba_compare(5.0, 'gt', 5.0) === false);
check('ba_compare lte', rel_ba_compare(3.0, 'lte', 5.0) === true);
check('ba_compare eq epsilon', rel_ba_compare(5.0000000001, 'eq', 5.0) === true);
check('ba_compare unknown op -> false', rel_ba_compare(5.0, 'foo', 5.0) === false);
check('ba_compare null -> false', rel_ba_compare(null, 'gte', 0.0) === false);

check('ba_completeness all present', rel_bad_actor_completeness(['failure_count' => 1, 'downtime_hours' => 2.0, 'failure_rate_per_1000h' => 3.0]) === 100.0);
check('ba_completeness rate via availability', rel_bad_actor_completeness(['failure_count' => 1, 'downtime_hours' => 2.0, 'availability_pct' => 90.0]) === 100.0);
check('ba_completeness one third', rel_bad_actor_completeness(['failure_count' => 1]) === 33.33);
check('ba_completeness none', rel_bad_actor_completeness([]) === 0.0);

check('study transition draft->in_review', rel_study_transition_allowed('draft', 'in_review') === true);
check('study transition draft->approved false', rel_study_transition_allowed('draft', 'approved') === false);
check('study transition closed->anything false', rel_study_transition_allowed('closed', 'draft') === false);
check('study transition unknown-from false', rel_study_transition_allowed('zzz', 'draft') === false);

/* ================================================================= 5. period */
echo "\n[5] rel_period()\n";
$p = rel_period(['range' => 'rolling_12m'], $cfg);
check('rolling_12m preset', $p['preset'] === 'rolling_12m');
check('rolling_12m ~365d', $p['days'] >= 360 && $p['days'] <= 370, (string)$p['days']);
check('rolling_12m not clamped', $p['clamped'] === false);
check('rolling_12m start < end', $p['start_ts'] < $p['end_ts']);

$p3 = rel_period(['range' => 'rolling_3m'], $cfg);
check('rolling_3m ~2 months span', $p3['days'] >= 58 && $p3['days'] <= 66, (string)$p3['days']);
check('rolling_3m reports 3 months', $p3['months'] === 3);
$p6 = rel_period(['range' => 'rolling_6m'], $cfg);
check('rolling_6m reports 6 months', $p6['months'] === 6, (string)$p6['months']);
$p1 = rel_period(['range' => 'rolling_1m'], $cfg);
check('rolling_1m reports 1 month', $p1['months'] === 1);
$p30 = rel_period(['range' => 'rolling_30d'], $cfg);
check('rolling_30d = 30', $p30['days'] === 30, (string)$p30['days']);

$pc = rel_period(['range' => 'custom', 'from' => '2026-01-01', 'to' => '2026-01-31'], $cfg);
check('custom days 31', $pc['days'] === 31, (string)$pc['days']);
check('custom flag', $pc['custom'] === true);
$pswap = rel_period(['range' => 'custom', 'from' => '2026-01-31', 'to' => '2026-01-01'], $cfg);
check('custom swaps from>to', $pswap['start_ts'] < $pswap['end_ts'] && substr($pswap['start'], 0, 10) === '2026-01-01');

$pmiss = rel_period(['range' => 'custom'], $cfg);
check('custom incomplete falls back w/ note', $pmiss['note'] !== '' && $pmiss['days'] >= 360);

$pbig = rel_period(['range' => 'custom', 'from' => '2000-01-01', 'to' => date('Y-m-d')], $cfg);
check('huge range clamped', $pbig['clamped'] === true && $pbig['days'] === 1825, (string)$pbig['days']);
check('clamp note', str_contains($pbig['note'], 'clamped'));

$pdef = rel_period([], $cfg);
check('default preset rolling_12m', $pdef['preset'] === 'rolling_12m');

/* ================================================================= 6. kpi envelope */
echo "\n[6] KPI envelope / definitions on empty registry\n";
check('kpi_definition empty -> null', rel_kpi_definition($pdo, 'MTBF') === null);
check('kpi_definitions empty -> []', rel_kpi_definitions($pdo) === []);
$env = rel_kpi_envelope($pdo, 'MTBF', null);
check('envelope null value', $env['value'] === null);
check('envelope status NOT_ENOUGH', $env['status'] === RL_DQ_NOT_ENOUGH);
check('envelope definition null', $env['definition'] === null);

/* ================================================================= 7. Weibull math */
echo "\n[7] Weibull math\n";
$times = [1.0, 2.0, 3.0];
$failed = [true, true, true];
$h1 = rel_weibull_h(1.0, $times, $failed);
check('h(beta=1) known value', approx($h1, -0.816957, 1e-4), (string)$h1);
check('h no failures -> NAN', is_nan(rel_weibull_h(1.0, $times, [false, false, false])));

$sol = rel_weibull_solve([1.0], [true]);
check('solve single failure NOT_ENOUGH', $sol['status'] === RL_DQ_NOT_ENOUGH);
$solFlat = rel_weibull_solve([5.0, 5.0, 5.0], [true, true, true]);
check('solve identical times TIMES_TOO_CLOSE', $solFlat['status'] === 'TIMES_TOO_CLOSE');
$sol0 = rel_weibull_solve([], []);
check('solve empty NOT_ENOUGH', $sol0['status'] === RL_DQ_NOT_ENOUGH);

$data = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0];
$solOk = rel_weibull_solve($data, array_fill(0, 10, true));
check('solve OK', $solOk['status'] === 'OK', json_encode($solOk));
check('solve beta finite > 0', is_float($solOk['beta']) && $solOk['beta'] > 0);
check('solve eta finite > 0', is_float($solOk['eta']) && $solOk['eta'] > 0);
check('solve counts', $solOk['observations'] === 10 && $solOk['failures'] === 10 && $solOk['censored'] === 0);
check('solve rankit present', $solOk['rankit_beta'] !== null && $solOk['rankit_eta'] !== null);
check('solve lnl finite', is_finite((float)$solOk['lnl']));

$rank = rel_weibull_rankit($data, array_fill(0, 10, true));
check('rankit beta > 0', is_float($rank['beta']) && $rank['beta'] > 0);
check('rankit needs 3', rel_weibull_rankit([1.0, 2.0], [true, true])['beta'] === null);

$pts = rel_weibull_curve_points(1.0, 1000.0, 10, 1000.0);
check('curve 10 points', count($pts) === 10);
$last = $pts[count($pts) - 1];
check('curve last t = 1000', approx($last['t'], 1000.0));
check('curve last R = exp(-1)', approx($last['R'], exp(-1.0), 1e-5), (string)$last['R']);
check('curve last F = 1-exp(-1)', approx($last['F'], 1 - exp(-1.0), 1e-5));
check('curve default tMax = 3*eta', approx(rel_weibull_curve_points(1.0, 1000.0, 4)[3]['t'], 3000.0));
check('curve invalid -> []', rel_weibull_curve_points(0.0, 100.0) === []);

check('B10 (1,1000) = 105.3605', approx(rel_weibull_b10(1.0, 1000.0), 105.3605, 1e-3), (string)rel_weibull_b10(1.0, 1000.0));
check('B10 invalid -> null', rel_weibull_b10(0.0, 100.0) === null);

$hashA = rel_observation_hash($data, array_fill(0, 10, true));
$hashB = rel_observation_hash(array_reverse($data), array_fill(0, 10, true));
check('observation hash order-independent', $hashA === $hashB);
$hashC = rel_observation_hash($data, [true, true, true, true, true, true, true, true, true, false]);
check('observation hash changes with censoring', $hashA !== $hashC);

check('beta interp <1', str_contains(rel_beta_interpretation(0.5), 'early-life'));
check('beta interp ~1', str_contains(rel_beta_interpretation(1.0), 'random'));
check('beta interp >1', str_contains(rel_beta_interpretation(2.0), 'wear-out'));
check('beta interp >>1', str_contains(rel_beta_interpretation(5.0), 'very sharply'));
check('beta interp NAN -> empty', rel_beta_interpretation(NAN) === '');

/* ================================================================= 8. study code */
echo "\n[8] rel_study_next_code()\n";
$base = 'REL-' . date('Ymd') . '-';
$clear = fn() => $pdo->exec('DELETE FROM reliability_studies');
$ins = fn(string $code) => $pdo->prepare('INSERT INTO reliability_studies (study_code, title, period_start, period_end) VALUES (?,?,?,?)')
    ->execute([$code, 't', '2026-01-01', '2026-01-31']);
$clear();
check('empty -> 001', rel_study_next_code($pdo) === $base . '001', rel_study_next_code($pdo));
$clear(); $ins($base . '001'); $ins($base . '002'); $ins($base . '003');
check('001..003 -> 004', rel_study_next_code($pdo) === $base . '004', rel_study_next_code($pdo));
$pdo->prepare('DELETE FROM reliability_studies WHERE study_code = ?')->execute([$base . '002']);
check('delete middle -> 004 (no reuse)', rel_study_next_code($pdo) === $base . '004', rel_study_next_code($pdo));
$clear(); $ins($base . '999'); $ins($base . '998');
check('999 rollover -> 1000', rel_study_next_code($pdo) === $base . '1000', rel_study_next_code($pdo));
$clear(); $ins($base . '1000'); $ins($base . '999');
check('numeric compare 1000 > 999 -> 1001', rel_study_next_code($pdo) === $base . '1001', rel_study_next_code($pdo));
$clear();

/* ================================================================= 9. studies list */
echo "\n[9] rel_studies() (regression: users.full_name, not display_name)\n";
$clear(); $ins($base . '001');
$list = rel_studies($pdo);
check('studies list returns row', count($list) === 1, 'got ' . count($list));
check('studies limit clamp', is_array(rel_studies($pdo, ['limit' => 9999])));
$clear();

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
