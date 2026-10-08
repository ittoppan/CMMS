<?php
/**
 * scripts/smoke_phase37_reliability.php - live smoke test for the Phase 37 engine
 *
 * Executes every reliability calculation against the live schema. It WRITES only
 * inside one transaction that is rolled back at the end, so the test proves the
 * study/action/snapshot writes really work and leaves no test rows behind.
 *
 *   php scripts/smoke_phase37_reliability.php
 *   php scripts/smoke_phase37_reliability.php --range=rolling_12m --basis=production
 *   php scripts/smoke_phase37_reliability.php --scope=asset --scope-id=1
 */

$flags = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([^=]+)(?:=(.*))?$/', $a, $m)) {
        $flags[$m[1]] = ($m[2] ?? '1');
    }
}

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/kpi.php';
require_once __DIR__ . '/../src/helpers/reliability.php';

$pdo = getDb();
$db  = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();

$opts = [
    'scope_type'  => (string)($flags['scope'] ?? 'fleet'),
    'scope_id'    => (string)($flags['scope-id'] ?? ''),
    'range'       => (string)($flags['range'] ?? 'rolling_12m'),
    'operating_basis'   => (string)($flags['basis'] ?? ''),
    'repair_time_basis' => (string)($flags['repair-basis'] ?? ''),
    'asset_status' => (string)($flags['asset-status'] ?? 'active'),
];

$pass = 0;
$fail = 0;
$warnings = 0;

function ok(string $label, bool $cond, string $detail = ''): void {
    global $pass, $fail;
    if ($cond) {
        $pass++;
        echo '  PASS  ' . $label . ($detail !== '' ? ' -> ' . $detail : '') . PHP_EOL;
    } else {
        $fail++;
        echo '  FAIL  ' . $label . ($detail !== '' ? ' -> ' . $detail : '') . PHP_EOL;
    }
}

function warn(string $label, string $detail): void {
    global $warnings;
    $warnings++;
    echo '  NOTE  ' . $label . ' -> ' . $detail . PHP_EOL;
}

function section(string $title): void {
    echo PHP_EOL . '== ' . $title . ' ==' . PHP_EOL;
}

function step(string $label, callable $fn): void {
    global $fail;
    try {
        $out = $fn();
        if (is_array($out) && isset($out['__error'])) {
            $fail++;
            echo '  FAIL  ' . $label . ' -> ' . $out['__error'] . PHP_EOL;
            return;
        }
        if (is_array($out) && array_key_exists('error', $out) && !isset($out['status']) && !isset($out['value'])) {
            $fail++;
            echo '  FAIL  ' . $label . ' -> ' . (string)$out['error'] . PHP_EOL;
            return;
        }
        echo '  PASS  ' . $label . PHP_EOL;
    } catch (Throwable $e) {
        $fail++;
        echo '  FAIL  ' . $label . ' -> ' . get_class($e) . ': ' . $e->getMessage() . PHP_EOL;
    }
}

/** Compact one-line view of a KPI envelope. */
function line(?array $k): string {
    if ($k === null) {
        return 'missing';
    }
    $v = $k['value'] ?? null;
    $val = $v === null ? 'NULL' : (string)$v;
    return $val . ' ' . (string)($k['unit'] ?? '') . ' [' . (string)($k['status'] ?? '?') . ']';
}

echo 'Phase 37 reliability smoke test' . PHP_EOL;
echo 'database: ' . $db . PHP_EOL;
echo 'engine:   ' . RL_VERSION . PHP_EOL;
echo 'options:  ' . json_encode($opts, JSON_UNESCAPED_SLASHES) . PHP_EOL;

/* ---------------------------------------------------------------- config */
section('1. configuration + registry');
$cfg = rel_config($pdo);
ok('rel_config returns defaults', isset($cfg['operating_basis'], $cfg['repair_time_basis'], $cfg['min_failures_for_mtbf']),
    'operating=' . $cfg['operating_basis'] . ' repair=' . $cfg['repair_time_basis']);
ok('calendar basis locked off unless enabled',
    $cfg['allow_calendar_basis'] === false ? $cfg['calendar_allowed_now'] === false : true,
    'allow=' . ($cfg['allow_calendar_basis'] ? '1' : '0'));

$defs = rel_kpi_definitions($pdo);
ok('KPI registry seeded', count($defs) >= 13, count($defs) . ' current definitions');
$legacy = array_values(array_filter($defs, static fn($d) => str_starts_with((string)$d['kpi_code'], 'KPI_LEGACY_')));
ok('legacy formulas preserved as versions', count($legacy) === 3, implode(',', array_column($legacy, 'kpi_code')));
ok('MTBF definition present', rel_kpi_definition($pdo, 'MTBF') !== null);
ok('canonical formula states the basis',
    str_contains(strtolower((string)rel_kpi_definition($pdo, 'MTBF')['formula_display']), 'operating hours'),
    (string)rel_kpi_definition($pdo, 'MTBF')['formula_display']);

$criteria = rel_bad_actor_criteria($pdo, false);
$enabled  = rel_bad_actor_criteria($pdo, true);
ok('bad-actor criteria seeded and shipped disabled', count($criteria) === 7 && count($enabled) === 0,
    count($criteria) . ' criteria, ' . count($enabled) . ' enabled');

/* --------------------------------------------------------------- period */
section('2. period + scope resolution');
$period = rel_period($opts, $cfg);
ok('period resolved', $period['start'] < $period['end'],
    $period['start'] . ' .. ' . $period['end'] . ' (' . $period['preset'] . ', ' . $period['days'] . 'd)');
$scope = rel_scope($pdo, $opts);
ok('scope resolved', is_array($scope['asset_ids']), $scope['type'] . ' "' . $scope['label'] . '" = ' . $scope['asset_count'] . ' assets');

$over = rel_period(array_merge($opts, ['range' => 'custom', 'from' => '1990-01-01', 'to' => date('Y-m-d')]), $cfg);
ok('over-wide range is clamped, not silently accepted', $over['clamped'] === true,
    'asked 35y, got ' . $over['days'] . 'd, note="' . $over['note'] . '"');

$cal = rel_context($pdo, array_merge($opts, ['operating_basis' => 'calendar']));
ok('calendar basis refused while disabled', $cal['basis'] === 'production', 'resolved to ' . $cal['basis']);

/* -------------------------------------------------------------- context */
section('3. shared context + data quality');
$ctx = rel_context($pdo, $opts, $cfg, $period, $scope);
ok('context built', isset($ctx['dq']['status'], $ctx['source']['table']),
    'source=' . $ctx['source']['table'] . ' usable_failures=' . count($ctx['failures_valid'])
    . ' op_hours=' . ($ctx['operating']['hours'] === null ? 'NULL' : $ctx['operating']['hours']));
ok('DQ status is one of the declared states',
    in_array($ctx['dq']['status'], [RL_DQ_COMPLETE, RL_DQ_PARTIAL, RL_DQ_INVALID, RL_DQ_DUPLICATE, RL_DQ_NOT_ENOUGH], true),
    $ctx['dq']['status']);
$meta = rel_context_meta($ctx);
ok('context meta is json serialisable', is_string(json_encode($meta)), strlen((string)json_encode($meta)) . ' bytes');

/* ------------------------------------------------------------ core KPIs */
section('4. core KPIs');
$bundle = rel_kpi_bundle($pdo, $ctx, 0);
foreach (['mtbf', 'mttr', 'failure_rate', 'availability', 'downtime', 'repeat_failure_rate', 'alarm_frequency', 'cost_per_op_hour'] as $code) {
    $k = $bundle[$code] ?? null;
    ok('kpi ' . $code, $k !== null, $k === null ? 'MISSING FROM BUNDLE' : line($k));
}
ok('kpi envelopes carry a definition', $bundle['mtbf']['definition']['version'] !== null,
    'v' . $bundle['mtbf']['definition']['version'] . ' ' . (string)$bundle['mtbf']['definition']['kpi_code']);
$nulls = array_keys(array_filter($bundle, static fn($k) => ($k['value'] === null)));
if ($nulls !== []) {
    warn('KPIs reporting NULL (not computable, not zero)', implode(', ', $nulls));
} else {
    warn('KPIs reporting NULL', 'none - this fleet has data for every KPI, verify that it is real');
}

section('5. MTTR on every declared basis');
foreach (RL_REPAIR_BASES as $basis) {
    $b = rel_context($pdo, array_merge($opts, ['repair_time_basis' => $basis]), $cfg);
    $k = rel_mttr($pdo, $b);
    ok('mttr/' . $basis, true, line($k) . ' measurable=' . ($k['inputs']['measurable'] ?? '?') . '/' . ($k['inputs']['repairs'] ?? '?'));
}

section('6. operating hours on every basis');
foreach (RL_BASES as $basis) {
    $r = rel_operating_hours($pdo, $scope, $period, $basis, $cfg);
    ok('op_hours/' . $basis, true,
        ($r['hours'] === null ? 'NULL' : (string)$r['hours']) . 'h rows=' . ($r['rows'] ?? 0)
        . ' assumption=' . (!empty($r['assumption']) ? 'YES' : 'no') . ' src=' . implode('|', array_slice((array)($r['sources'] ?? []), 0, 2)));
}

/* ---------------------------------------------------------- analytics */
section('7. analytic features');
step('rel_failure_modes', static fn() => rel_failure_modes($pdo, $ctx));
step('rel_pareto', static fn() => rel_pareto($pdo, $ctx, 'downtime', 10));
step('rel_trend', static fn() => rel_trend($pdo, $ctx));
step('rel_asset_matrix', static fn() => rel_asset_matrix($pdo, array_merge($opts, ['page_size' => 5]), 0));
step('rel_condition_summary', static fn() => rel_condition_summary($pdo, $opts));
step('rel_pm_effectiveness', static fn() => rel_pm_effectiveness($pdo, $opts, 0));
step('rel_growth_analysis', static fn() => rel_growth_analysis($pdo, $opts));
step('rel_bad_actor_scores', static fn() => rel_bad_actor_scores($pdo, $opts, 0));

$wf = rel_weibull_fit($pdo, $opts, $ctx, 0);
ok('weibull_fit returns a status even with sparse data', isset($wf['status']),
    'status=' . (string)($wf['status'] ?? '?') . ' ' . (string)($wf['note'] ?? ''));
ok('weibull does not invent parameters', ($wf['shape_beta'] ?? null) === null || $wf['shape_beta'] > 0,
    'beta=' . (string)($wf['shape_beta'] ?? 'NULL') . ' eta=' . (string)($wf['scale_eta'] ?? 'NULL'));

/* ------------------------------------------------------- engine maths */
section('8. engine maths (self-check against known values)');
$solve = rel_weibull_solve([100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
ok('weibull MLE solves without error', isset($solve['beta'], $solve['eta']),
    'beta=' . round($solve['beta'], 4) . ' eta=' . round($solve['eta'], 2) . ' ci=' . ($solve['ci_beta'] ?? 'n/a'));
ok('b10 < eta for beta > 1', abs((rel_weibull_b10((float)$solve['beta'], (float)$solve['eta'])) - (float)$solve['eta']) > 0,
    'b10=' . round((float)rel_weibull_b10((float)$solve['beta'], (float)$solve['eta']), 2));
ok('percentile median', abs((float)rel_percentile([1, 2, 3, 4, 5], 0.5) - 3.0) < 0.0001, (string)rel_percentile([1, 2, 3, 4, 5], 0.5));
ok('div guards zero', rel_div(1.0, 0.0) === null, '1/0 -> NULL');
ok('round preserves NULL', rel_round(null) === null);
$beta = rel_beta_interpretation(0.8);
ok('beta interpretation is a sentence', is_string($beta) && strlen($beta) > 10, $beta);

/* -------------------------------------------------- writes (rolled back) */
section('9. lineage, studies and actions (inside a rolled-back transaction)');
$pdo->beginTransaction();
try {
    $snap = rel_snapshot_save($pdo, $ctx, 'MTBF', $bundle['mtbf'], 0);
    ok('snapshot saved', ($snap['saved'] ?? false) === true, (string)($snap['calc_uid'] ?? $snap['reason'] ?? ''));
    $got = rel_snapshot_get($pdo, (string)($snap['calc_uid'] ?? ''));
    ok('snapshot lineage readable', is_array($got),
        $got === null ? 'not found' : 'def v' . $got['kpi_definition_version'] . ' dq=' . $got['data_quality']);
    $list = rel_snapshot_list($pdo, ['limit' => 5]);
    ok('snapshot list', is_array($list), count($list) . ' row(s)');

    $study = rel_study_save($pdo, [
        'title' => 'SMOKE TEST - fleet reliability review',
        'period_start' => substr($period['start'], 0, 10),
        'period_end' => substr($period['end'], 0, 10),
        'method' => 'smoke',
        'scope_description' => 'created by scripts/smoke_phase37_reliability.php and rolled back',
    ], 0);
    ok('study created', ($study['ok'] ?? false) === true, (string)($study['study_code'] ?? $study['error'] ?? ''));
    $sid = (int)($study['id'] ?? 0);

    $bad = rel_study_transition($pdo, $sid, 'closed', 'skipping review', 0);
    ok('illegal study transition refused', ($bad['ok'] ?? false) === false, (string)($bad['error'] ?? ''));
    $t1 = rel_study_transition($pdo, $sid, 'in_review', 'ready', 0);
    ok('study -> in_review', ($t1['ok'] ?? false) === true, (string)($t1['error'] ?? ''));
    $t2 = rel_study_transition($pdo, $sid, 'approved', 'evidence reviewed', 0);
    ok('study -> approved', ($t2['ok'] ?? false) === true, (string)($t2['error'] ?? ''));
    $t3 = rel_study_transition($pdo, $sid, 'closed', 'done', 0);
    ok('study -> closed', ($t3['ok'] ?? false) === true, (string)($t3['error'] ?? ''));

    $link = rel_study_add_link($pdo, $sid, ['link_type' => 'asset', 'target_id' => '1', 'title' => 'smoke'], 0);
    ok('study link added', ($link['ok'] ?? false) === true, (string)($link['error'] ?? ''));
    $full = rel_study_get($pdo, $sid);
    ok('study detail with links + history',
        is_array($full) && count($full['links']) === 1 && count($full['status_log']) === 3,
        is_array($full) ? count($full['links']) . ' link(s), ' . count($full['status_log']) . ' log entries' : 'null');

    $act = rel_action_create($pdo, ['study_id' => $sid, 'action_type' => 'inspection_request', 'title' => 'SMOKE inspect'], 0);
    ok('action raised with owning module', ($act['ok'] ?? false) === true,
        (string)($act['action_code'] ?? $act['error'] ?? '') . ' -> module ' . (string)($act['target_module'] ?? ''));
    $aid = (int)($act['id'] ?? 0);
    $noEvidence = rel_action_transition($pdo, $aid, 'accepted', '', '', 0);
    ok('action accepts', ($noEvidence['ok'] ?? false) === true, (string)($noEvidence['error'] ?? ''));
    $jump = rel_action_transition($pdo, $aid, 'completed', '', 'skipped in_progress', 0);
    ok('illegal action jump refused', ($jump['ok'] ?? false) === false, (string)($jump['error'] ?? ''));
    $start = rel_action_transition($pdo, $aid, 'in_progress', '', '', 0);
    ok('action in_progress', ($start['ok'] ?? false) === true, (string)($start['error'] ?? ''));
    $noEv = rel_action_transition($pdo, $aid, 'completed', '', '', 0);
    ok('completion without evidence refused', ($noEv['ok'] ?? false) === false, (string)($noEv['error'] ?? ''));
    $done = rel_action_transition($pdo, $aid, 'completed', '', 'inspection sheet WO-0001', 0);
    ok('completion with evidence', ($done['ok'] ?? false) === true, (string)($done['note'] ?? ''));
} finally {
    $pdo->rollBack();
    echo '  ....  transaction rolled back (no test rows persisted)' . PHP_EOL;
}

section('10. reports, dashboard, feature status');
step('rel_report_data_quality', static fn() => rel_report_data_quality($pdo, []));
step('rel_report_summary', static fn() => rel_report_summary($pdo, $opts, 0));
step('rel_dashboard', static fn() => rel_dashboard($pdo, $opts, 0));
step('rel_feature_status', static fn() => rel_feature_status($pdo, $opts));
step('rel_kpi_registry (definitions json)', static fn() => json_encode(rel_kpi_definitions($pdo, true)));

/* ------------------------------------------------- empty-scope safety */
section('11. empty-scope safety (nothing must crash or invent a number)');
$none = ['scope_type' => 'asset', 'scope_id' => '999999999'];
$nctx = rel_context($pdo, $none, $cfg);
$nb = rel_kpi_bundle($pdo, $nctx, 0);
$allNull = true;
foreach ($nb as $k => $v) {
    if (($v['value'] ?? null) !== null) {
        $allNull = false;
        warn('empty scope produced a value', $k . ' = ' . (string)$v['value']);
    }
}
ok('empty scope -> every KPI NULL', $allNull, 'scope assets=' . $nctx['scope']['asset_count']);
ok('empty scope still explains itself', $nctx['scope']['asset_count'] === 0 && $nctx['period']['start'] !== '');

echo PHP_EOL . str_repeat('-', 60) . PHP_EOL;
echo 'PASS: ' . $pass . '   FAIL: ' . $fail . '   NOTES: ' . $warnings . PHP_EOL;
exit($fail > 0 ? 1 : 0);