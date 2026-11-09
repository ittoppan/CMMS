<?php
/**
 * scripts/test_iot.php — behavioral harness for the IoT engine
 * (src/helpers/iot.php + iot_ingest.php + iot_alarm.php + iot_condition.php).
 *
 * Focus:
 *   1) pure helpers (lifecycle maps, unit conversion, timestamp/coercion, severity,
 *      rule-band hysteresis, rollup bucketing)
 *   2) regression for a cluster of list functions that were missing ->execute()
 *      (iot_gateway_list, iot_connector_list, iot_retention_policies,
 *       iot_alarm_counts, iot_sweep_offline_devices).
 *
 * Runs against a THROWAWAY database = live DB name + "_iotest".
 *   php scripts/test_iot.php [--keep]
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
$scratch = $live . '_iotest';

if (!str_ends_with($scratch, '_iotest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "IoT harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/iot.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ================================================================= 1. pure maps */
echo "\n[1] lifecycle maps / transitions\n";
check('7 alarm statuses', count(iot_alarm_statuses()) === 7);
check('alarm can detected->acknowledged', iot_alarm_can_transition('detected', 'acknowledged') === true);
check('alarm cannot closed->detected', iot_alarm_can_transition('closed', 'detected') === false);
check('alarm cannot detected->closed', iot_alarm_can_transition('detected', 'closed') === false);
check('alarm unknown from -> false', iot_alarm_can_transition('bogus', 'closed') === false);
check('6 device lifecycle states', count(iot_device_lifecycle()) === 6);
check('device active->maintenance', iot_device_can_transition('active', 'maintenance') === true);
check('device retired terminal', iot_device_can_transition('retired', 'active') === false);
check('device registered->retired (decommission)', iot_device_can_transition('registered', 'retired') === true);
check('15 signal types', count(iot_signal_types()) === 15);
check('6 point types', count(iot_point_types()) === 6);
check('6 alarm categories', count(iot_alarm_categories()) === 6);
check('7 resolution codes', count(iot_resolution_codes()) === 7);
check('9 quality states', count(iot_quality_states()) === 9);
check('15 alarm event types', count(iot_alarm_event_types()) === 15);
check('4 rollup buckets', count(iot_rollup_bucket_set()) === 4);
check('4 retention targets', count(iot_retention_targets()) === 4);
check('category for max -> threshold', iot_alarm_category_for_metric('max') === 'threshold');
check('category for rate_of_change', iot_alarm_category_for_metric('rate_of_change') === 'rate_of_change');
check('category for missing_data', iot_alarm_category_for_metric('missing_data') === 'missing_data');
check('category fallback -> threshold', iot_alarm_category_for_metric('zzz') === 'threshold');
check('freshness label fresh', iot_freshness_label('fresh') === 'เป็นปัจจุบัน');
check('freshness label passthrough', iot_freshness_label('weird') === 'weird');

/* ================================================================= 2. units */
echo "\n[2] iot_convert_unit / iot_known_units\n";
$r = iot_convert_unit('degC', 'degF', 100.0);
check('100C -> 212F', $r['ok'] && abs($r['value'] - 212.0) < 1e-6, json_encode($r));
$r = iot_convert_unit('kPa', 'psi', 100.0);
check('100kPa -> ~14.5038psi', $r['ok'] && abs($r['value'] - 14.50377377) < 1e-4, json_encode($r));
$r = iot_convert_unit('mm/s', 'm/s', 5.0);
check('5 mm/s -> 0.005 m/s', $r['ok'] && abs($r['value'] - 0.005) < 1e-9, json_encode($r));
$r = iot_convert_unit('degC', 'degC', 7.0);
check('identity conversion', $r['ok'] && $r['path'] === 'identity' && $r['value'] === 7.0);
$r = iot_convert_unit('degC', 'bananas', 1.0);
check('unknown pair -> no_exact_conversion', $r['ok'] === false && $r['reason'] === 'no_exact_conversion', json_encode($r));
$r = iot_convert_unit('', 'kPa', 1.0);
check('undeclared unit -> unit_not_declared', $r['ok'] === false && $r['reason'] === 'unit_not_declared');
$u = iot_known_units();
check('known units contains degC & kPa', in_array('degC', $u, true) && in_array('kPa', $u, true));
check('known units sorted', $u === array_values(array_unique($u)) && $u[0] === min($u));

/* ================================================================= 3. time/coerce */
echo "\n[3] timestamps / coercion / errors\n";
check('parse null -> null', iot_parse_ts(null) === null);
check('parse "" -> null', iot_parse_ts('') === null);
check('parse unix seconds', iot_parse_ts(1700000000) === date('Y-m-d H:i:s', 1700000000));
check('parse unix millis', iot_parse_ts(1700000000000) === date('Y-m-d H:i:s', 1700000000));
check('parse tiny number -> null', iot_parse_ts(5) === null);
check('parse ISO string', iot_parse_ts('2026-03-02T10:00:00+07:00') === (new DateTimeImmutable('2026-03-02T10:00:00+07:00'))->format('Y-m-d H:i:s'));
check('parse garbage -> null', iot_parse_ts('not-a-date') === null);
check('age null -> null', iot_age_sec(null) === null);
check('age future clamps to 0', iot_age_sec(date('Y-m-d H:i:s', time() + 3600)) === 0);
check('age 60s ago ~60', abs((iot_age_sec(date('Y-m-d H:i:s', time() - 60)) ?? -1) - 60) <= 2);
check('int_or_null "" -> null', iot_int_or_null('') === null);
check('int_or_null "12" -> 12', iot_int_or_null('12') === 12);
check('int_or_null "x" -> null', iot_int_or_null('x') === null);
check('num_or_null "1.5" -> 1.5', iot_num_or_null('1.5') === 1.5);
check('num_or_null "x" -> null', iot_num_or_null('x') === null);
check('clean_str trims + caps', iot_clean_str('  abcdef  ', 3) === 'abc');
$e = iot_err('CODE', 'msg', ['a' => 1]);
check('err shape', $e === ['error' => 'CODE', 'message' => 'msg', 'a' => 1], json_encode($e));

/* ================================================================= 4. severity/rule */
echo "\n[4] severity + rule bands\n";
check('rank critical=2', iot_severity_rank('critical') === 2);
check('rank warning=1', iot_severity_rank('Warning') === 1);
check('rank info/empty/bogus=0', iot_severity_rank('info') === 0 && iot_severity_rank('') === 0 && iot_severity_rank('zzz') === 0);
check('hit max >= crit -> critical', iot_rule_hit_severity('max', 100.0, ['warn_limit' => 80, 'critical_limit' => 100]) === 'critical');
check('hit max >= warn -> warning', iot_rule_hit_severity('max', 85.0, ['warn_limit' => 80, 'critical_limit' => 100]) === 'warning');
check('hit max below warn -> ""', iot_rule_hit_severity('max', 70.0, ['warn_limit' => 80, 'critical_limit' => 100]) === '');
check('hit min <= crit -> critical', iot_rule_hit_severity('min', 5.0, ['warn_limit' => 20, 'critical_limit' => 10]) === 'critical');
check('hit min <= warn -> warning', iot_rule_hit_severity('min', 15.0, ['warn_limit' => 20, 'critical_limit' => 10]) === 'warning');
check('hit range above crit -> critical', iot_rule_hit_severity('range', 101.0, ['warn_limit' => 20, 'critical_limit' => 100]) === 'critical');
check('hit range below warn -> warning', iot_rule_hit_severity('range', 10.0, ['warn_limit' => 20, 'critical_limit' => 100]) === 'warning');
check('hit NAN -> ""', iot_rule_hit_severity('max', NAN, ['warn_limit' => 1, 'critical_limit' => 2]) === '');
check('hit INF -> ""', iot_rule_hit_severity('max', INF, ['warn_limit' => 1, 'critical_limit' => 2]) === '');
check('effective: hit "" + rule warning -> warning', iot_rule_effective_severity('warning', '') === 'warning');
check('effective: hit "" + rule "" -> warning', iot_rule_effective_severity('', '') === 'warning');
check('effective: rule critical + hit warning -> critical', iot_rule_effective_severity('critical', 'warning') === 'critical');
check('effective: hit critical wins', iot_rule_effective_severity('warning', 'critical') === 'critical');
check('effective: rule warning + hit warning -> warning', iot_rule_effective_severity('warning', 'warning') === 'warning');

$rule = ['warn_limit' => 80, 'critical_limit' => 100, 'hysteresis' => 5];
check('back_in_band max 90 (below 95) -> true', iot_rule_back_in_band('max', 90.0, $rule) === true);
check('back_in_band max 96 (inside band) -> false', iot_rule_back_in_band('max', 96.0, $rule) === false);
check('back_in_band max 94 -> true', iot_rule_back_in_band('max', 94.0, $rule) === true);
$minRule = ['warn_limit' => 20, 'critical_limit' => 10, 'hysteresis' => 2];
check('back_in_band min 25 -> true', iot_rule_back_in_band('min', 25.0, $minRule) === true);
check('back_in_band min 11 -> false (<= 12)', iot_rule_back_in_band('min', 11.0, $minRule) === false);
check('back_in_band range inside -> true', iot_rule_back_in_band('range', 50.0, ['warn_limit' => 20, 'critical_limit' => 100, 'hysteresis' => 2]) === true);
check('back_in_band NAN -> false', iot_rule_back_in_band('max', NAN, $rule) === false);

/* ================================================================= 5. rollup (pure) */
echo "\n[5] iot_rollup_group_rows (pure aggregation)\n";
$buckets = ['minute_1' => ['minutes' => 1, 'retention_days' => 7]];
$rows = [
    ['received_at' => '2026-03-02 10:00:10', 'point_id' => 5, 'asset_id' => 1, 'quality' => 'VALID', 'value_num' => 10],
    ['received_at' => '2026-03-02 10:00:50', 'point_id' => 5, 'asset_id' => 1, 'quality' => 'VALID', 'value_num' => 20],
    ['received_at' => '2026-03-02 10:00:55', 'point_id' => 5, 'asset_id' => 1, 'quality' => 'INVALID', 'value_num' => null],
    ['received_at' => '2026-03-02 10:00:05', 'point_id' => 5, 'asset_id' => 1, 'quality' => 'VALID', 'value_num' => 30],
];
$g = iot_rollup_group_rows($rows, $buckets);
check('one bucket group', count($g) === 1, json_encode(array_keys($g)));
$grp = reset($g);
$start = date('Y-m-d H:i:s', (int)(floor(strtotime('2026-03-02 10:00:10') / 60) * 60));
check('bucket start floors to minute', ($grp['start'] ?? null) === $start, (string)($grp['start'] ?? 'null'));
check('valid samples collected (10,20,30)', count($grp['values']) === 3 && array_sum($grp['values']) === 60.0, json_encode($grp['values']));
check('invalid counted', $grp['invalid'] === 1);
check('last_ts = newest sample even if invalid', $grp['last_ts'] === '2026-03-02 10:00:55', (string)$grp['last_ts']);
check('last_value = newest VALID value (20)', $grp['last_value'] === 20.0, var_export($grp['last_value'], true));
$twoPts = iot_rollup_group_rows([
    ['received_at' => '2026-03-02 10:00:10', 'point_id' => 5, 'asset_id' => 1, 'quality' => 'VALID', 'value_num' => 1],
    ['received_at' => '2026-03-02 10:00:10', 'point_id' => 6, 'asset_id' => 1, 'quality' => 'VALID', 'value_num' => 2],
], $buckets);
check('separate points -> separate buckets', count($twoPts) === 2, json_encode(array_keys($twoPts)));
$bogus = iot_rollup_group_rows([['received_at' => 'nonsense', 'point_id' => 1, 'quality' => 'VALID', 'value_num' => 1]], $buckets);
check('unparseable ts skipped', $bogus === []);

/* ================================================================= 6. list regressions */
echo "\n[6] missing-execute() regressions\n";
$pdo->prepare('INSERT INTO iot_sources (source_code, name) VALUES (?,?)')->execute(['SRC-1', 'Main PLC']);
$srcId = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO iot_gateways (gateway_code, name) VALUES (?,?)')->execute(['GW-1', 'Gateway 1']);
$gwId = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO iot_connectors (connector_code, name, source_id, connector_type, secret_ref) VALUES (?,?,?,?,?)')
    ->execute(['CON-1', 'Connector 1', $srcId, 'http_pull', 'SECRET_NAME']);
$pdo->prepare('INSERT INTO asset_registry (code, name) VALUES (?,?)')->execute(['AST-1', 'Pump']);
$assetId = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO iot_devices (device_code, sensor_name, asset_id, source_id, gateway_id, lifecycle_status, last_ping) VALUES (?,?,?,?,?,?,?)')
    ->execute(['DEV-1', 'Sensor 1', $assetId, $srcId, $gwId, 'commissioned', date('Y-m-d H:i:s')]);
$devId = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO iot_points (device_id, point_code, name, signal_type) VALUES (?,?,?,?)')
    ->execute([$devId, 'PT-1', 'Bearing temp', 'temperature']);
$pointId = (int)$pdo->lastInsertId();

$gw = iot_gateway_list($pdo);
check('iot_gateway_list returns the gateway (was always empty)', count($gw) === 1 && $gw[0]['gateway_code'] === 'GW-1', json_encode($gw));
check('gateway device_count=1', (int)$gw[0]['device_count'] === 1, json_encode($gw[0]['device_count'] ?? null));

$con = iot_connector_list($pdo);
check('iot_connector_list returns the connector', count($con) === 1 && $con[0]['connector_code'] === 'CON-1', json_encode($con));
check('connector joins source', ($con[0]['source_code'] ?? null) === 'SRC-1');

$pdo->prepare('INSERT INTO iot_retention_policies (policy_code, name, data_class, retention_days) VALUES (?,?,?,?)')
    ->execute(['RET-1', 'Raw 90d', 'raw_readings', 90]);
$pol = iot_retention_policies($pdo);
check('iot_retention_policies returns the policy', count($pol) === 1 && $pol[0]['policy_code'] === 'RET-1', json_encode($pol));

$pdo->prepare('INSERT INTO iot_alarms (alarm_uid, device_id, point_id, asset_id, severity, status, first_detected_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)')
    ->execute(['A1', $devId, $pointId, $assetId, 'critical', 'detected', date('Y-m-d H:i:s'), date('Y-m-d H:i:s')]);
$pdo->prepare('INSERT INTO iot_alarms (alarm_uid, device_id, point_id, asset_id, severity, status, first_detected_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)')
    ->execute(['A2', $devId, $pointId, $assetId, 'warning', 'detected', date('Y-m-d H:i:s'), date('Y-m-d H:i:s')]);
$pdo->prepare('INSERT INTO iot_alarms (alarm_uid, device_id, point_id, asset_id, severity, status, first_detected_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?)')
    ->execute(['A3', $devId, $pointId, $assetId, 'warning', 'resolved', date('Y-m-d H:i:s'), date('Y-m-d H:i:s')]);
$cnt = iot_alarm_counts($pdo);
check('alarm_counts by_status detected=2', (int)$cnt['by_status']['detected'] === 2, json_encode($cnt['by_status']));
check('alarm_counts by_status resolved=1', (int)$cnt['by_status']['resolved'] === 1);
check('alarm_counts by_severity warning=2 critical=1', (int)$cnt['by_severity']['warning'] === 2 && (int)$cnt['by_severity']['critical'] === 1, json_encode($cnt['by_severity']));
check('alarm_counts open_total=2', (int)$cnt['open_total'] === 2, (string)$cnt['open_total']);

$pdo->prepare('INSERT INTO iot_devices (device_code, sensor_name, asset_id, source_id, gateway_id, lifecycle_status, last_ping) VALUES (?,?,?,?,?,?,?)')
    ->execute(['DEV-OLD', 'Sensor old', $assetId, $srcId, $gwId, 'commissioned', date('Y-m-d H:i:s', time() - 3600)]);
$pdo->prepare('INSERT INTO iot_devices (device_code, sensor_name, asset_id, source_id, gateway_id, lifecycle_status, last_ping) VALUES (?,?,?,?,?,?,?)')
    ->execute(['DEV-NONE', 'Sensor none', $assetId, $srcId, $gwId, 'commissioned', null]);
$sw = iot_sweep_offline_devices($pdo);
check('sweep flags exactly 2 offline (old + never-pinged)', (int)$sw['offline_count'] === 2, json_encode($sw));
$codes = array_column($sw['devices'], 'device_code');
check('sweep includes DEV-OLD and DEV-NONE', in_array('DEV-OLD', $codes, true) && in_array('DEV-NONE', $codes, true), json_encode($codes));
check('sweep excludes fresh DEV-1', !in_array('DEV-1', $codes, true), json_encode($codes));
check('sweep threshold default 300', (int)$sw['threshold_sec'] === 300, (string)$sw['threshold_sec']);

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
