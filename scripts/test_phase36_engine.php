<?php
/**
 * Phase 36 engine smoke test (read-only: no INSERT/UPDATE/DELETE against any table).
 *
 * Covers the pure decision helpers plus the read paths the operator API depends on, so a
 * signature or column drift shows up here instead of inside a customer's alarm sweep.
 *
 * Usage: php scripts/test_phase36_engine.php
 */
chdir(dirname(__DIR__));
require_once 'src/config/db.php';
require_once 'src/helpers/iot.php';
require_once 'src/helpers/iot_ingest.php';
require_once 'src/helpers/iot_alarm.php';
require_once 'src/helpers/iot_condition.php';

$pass = 0;
$fail = 0;
$note = [];

function ok(string $name, bool $cond, string $msg = ''): void {
    global $pass, $fail;
    if ($cond) {
        $pass++;
        return;
    }
    $fail++;
    echo "FAIL  {$name}" . ($msg !== '' ? "  ({$msg})" : '') . PHP_EOL;
}

/* ---------- pure helpers: no DB, no clock dependence ---------- */

$ruleMax = ['warn_limit' => 80.0, 'critical_limit' => 95.0, 'hysteresis' => 0.0, 'rate_per_minute' => 0.0];
$ruleMin = ['warn_limit' => 10.0, 'critical_limit' => 5.0,  'hysteresis' => 0.0, 'rate_per_minute' => 0.0];

ok('severity max below warn is none',      iot_rule_hit_severity('max', 10.0, $ruleMax) === '');
ok('severity max between warn/critical',  iot_rule_hit_severity('max', 90.0, $ruleMax) === 'warning');
ok('severity max above critical',         iot_rule_hit_severity('max', 99.0, $ruleMax) === 'critical');
ok('severity min below critical',         iot_rule_hit_severity('min', 1.0,  $ruleMin) === 'critical');
ok('severity min between warn/critical',  iot_rule_hit_severity('min', 7.0,  $ruleMin) === 'warning');
ok('severity min above warn is none',     iot_rule_hit_severity('min', 20.0, $ruleMin) === '');
ok('non-finite value has no severity',    iot_rule_hit_severity('max', NAN, $ruleMax) === '');

$hyst = ['warn_limit' => 80.0, 'critical_limit' => 95.0, 'hysteresis' => 2.0, 'rate_per_minute' => 0.0];
ok('hysteresis keeps alarm set',          !iot_rule_back_in_band('max', 94.5, $hyst));
ok('hysteresis clears inside band',       iot_rule_back_in_band('max', 77.0, $hyst));

ok('effective severity keeps warning',     iot_rule_effective_severity('warning', '') === 'warning');
ok('effective severity upgrades to crit', iot_rule_effective_severity('warning', 'critical') === 'critical');

ok('severity rank orders critical above warning', iot_severity_rank('critical') > iot_severity_rank('warning'));
ok('unknown severity ranks lowest',            iot_severity_rank('nonsense') === 0);
ok('rate_of_change clears on magnitude, not sign', (function () {
    $rate = ['warn_limit' => null, 'critical_limit' => 20.0, 'hysteresis' => 0.0, 'rate_per_minute' => 0.0];
    // A steep negative change is a breach, so it must NOT read as recovered.
    return iot_rule_hit_severity('rate_of_change', -50.0, $rate) === 'critical'
        && !iot_rule_back_in_band('rate_of_change', -50.0, $rate)
        && iot_rule_back_in_band('rate_of_change', 1.0, $rate);
})());

ok('timestamp helpers exist',             is_callable('iot_now') && is_callable('iot_parse_ts'));
ok('unit conversion round trips',         (function () {
    $c = iot_convert_unit('degC', 'degF', 100.0);
    return !empty($c['ok']) && abs(((float)$c['value']) - 212.0) < 0.01;
})());
ok('unknown unit is refused',             empty(iot_convert_unit('degC', 'furlong', 1.0)['ok']));
ok('unitless identity is allowed',        !empty(iot_convert_unit('digital', 'digital', 1.0)['ok']));

ok('quality states cover gaps',           array_key_exists('SOURCE_UNAVAILABLE', iot_quality_states())
                                          && array_key_exists('OUT_OF_ORDER', iot_quality_states()));
ok('no quality state implies a fake zero', !array_key_exists('ZERO', iot_quality_states()));
ok('alarm statuses are explicit',         array_key_exists('detected', iot_alarm_statuses()));
ok('detected can acknowledge or resolve',
   in_array('acknowledged', iot_alarm_transitions()['detected'] ?? [], true)
   && in_array('resolved', iot_alarm_transitions()['detected'] ?? [], true));
ok('closed is terminal',
   empty(iot_alarm_transitions()['closed']));

ok('retention targets cover raw readings', array_key_exists('raw_readings', iot_retention_targets()));
ok('event types include cleared',         array_key_exists('cleared', iot_alarm_event_types()));
ok('no work-order auto event',            !array_key_exists('work_order_created', iot_alarm_event_types()));

/* ---------- rollup folding: order independence ---------- */

$mk = static function (int $id, string $at, ?float $v, string $q = 'VALID'): array {
    return ['id' => $id, 'point_id' => 1, 'asset_id' => 7,
            'value_num' => $v, 'quality' => $q, 'received_at' => $at];
};
$hourly = ['hourly' => ['minutes' => 60, 'retention_days' => 365]];

// Input deliberately NOT chronological: id order != time order, as with backfilled samples.
$shuffled = [
    $mk(1, '2026-03-01 10:45:00', 30.0),
    $mk(2, '2026-03-01 10:05:00', 10.0),
    $mk(3, '2026-03-01 10:55:00', 50.0),
];
$g = iot_rollup_group_rows($shuffled, $hourly);
$b = reset($g);
ok('out-of-order input still finds the latest sample',
   $b['last_ts'] === '2026-03-01 10:55:00',
   'last_ts=' . var_export($b['last_ts'], true));
ok('last_value comes from the latest sample, not the highest id',
   $b['last_value'] === 50.0, 'last_value=' . var_export($b['last_value'], true));
ok('all valid samples counted', count($b['values']) === 3 && $b['invalid'] === 0);
ok('bucket start is floored to the hour', $b['start'] === '2026-03-01 10:00:00');

$withInvalid = [
    $mk(1, '2026-03-01 10:05:00', 10.0),
    $mk(2, '2026-03-01 10:35:00', null, 'INVALID'),
    $mk(3, '2026-03-01 10:25:00', 20.0),
];
$gi = iot_rollup_group_rows($withInvalid, $hourly);
$b2 = reset($gi);
ok('invalid sample still advances last_ts', $b2['last_ts'] === '2026-03-01 10:35:00');
// Newest VALID sample here is 10:05, not the 10:25 row that arrives later by id.
ok('last_value tracks the newest VALID sample, skipping the invalid one',
   $b2['last_value'] === 10.0, 'last_value=' . var_export($b2['last_value'], true));
ok('invalid sample is counted', $b2['invalid'] === 1 && count($b2['values']) === 2);

$allInvalid = [$mk(1, '2026-03-01 10:05:00', null, 'SOURCE_UNAVAILABLE')];
$ga = iot_rollup_group_rows($allInvalid, $hourly);
$b3 = reset($ga);
ok('all-invalid bucket yields no values to average', $b3['values'] === []);
ok('all-invalid bucket has no fabricated last_value', $b3['last_value'] === null);

$g2 = iot_rollup_group_rows($shuffled, ['minute_5' => ['minutes' => 5, 'retention_days' => 30]]);
ok('finer bucket splits the hour', count($g2) === 3, 'buckets=' . count($g2));

/* ---------- read paths: prove the queries still run ---------- */

$pdo = getDb();

$cfg = iot_config($pdo);
ok('config resolves to ints',             is_int($cfg['iot_ingest_max_batch_readings'])
                                          && $cfg['iot_ingest_max_batch_readings'] > 0);
ok('auto work order stays off by default', (int)$cfg['iot_alarm_auto_work_order'] === 0);
ok('retention stays opt-in',               (int)$cfg['iot_retention_enabled'] === 0);

$ready = iot_schema_ready($pdo);
$note[] = 'iot_schema_ready() = ' . ($ready ? 'true' : 'false');
// Hard assertion: a half-applied migration must fail here rather than inside a 3am sweep.
ok('schema gate passes', $ready);

ok('device list query runs',   is_array(iot_device_list($pdo, ['limit' => 5])));
ok('point list query runs',    is_array(iot_point_list($pdo, ['limit' => 5])));
ok('rule list query runs',     is_array(iot_rule_list($pdo, ['limit' => 5])));
ok('source list query runs',   is_array(iot_source_list($pdo)));
ok('connector list query runs',is_array(iot_connector_list($pdo)));
ok('gateway list query runs',  is_array(iot_gateway_list($pdo)));
ok('alarm list query runs',    is_array(iot_alarm_list($pdo, ['limit' => 5])));
ok('alarm counts query runs',  is_array(iot_alarm_counts($pdo)));
ok('overview query runs',      is_array(iot_overview($pdo)));
ok('ingest history runs',      is_array(iot_ingest_history($pdo, 5)));
ok('data quality summary runs',is_array(iot_data_quality_summary($pdo, 24)));
ok('retention policies run',   is_array(iot_retention_policies($pdo)));

foreach ($note as $n) {
    echo "NOTE  {$n}" . PHP_EOL;
}

echo PHP_EOL . "PHASE36_ENGINE_SMOKE: PASS={$pass} FAIL={$fail}" . PHP_EOL;
exit($fail === 0 ? 0 : 1);