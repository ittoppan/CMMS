<?php
/**
 * scripts/test_spare_optimization.php — behavioral harness for the Phase-33
 * Spare Parts Optimization engine.
 *
 * Covers src/helpers/spare_optimization.php:
 *   - pure helpers: spO_typeSign / spO_rowDelta / spO_isConsumption /
 *     spO_daysSince / spO_isStale / spO_clampInt / spO_clampFloat /
 *     spO_cfg* / spO_cfgJson / spO_guards / spO_configSchema /
 *     spO_inputBool / spO_zForServiceLevel / spO_r
 *   - spO_setConfig()        whitelist + clamp + persist + reject bad input
 *   - spO_deriveReorderPoint() safety stock / ROP from RELIABLE demand only
 *   - spO_availability()     status ladder, risk level, shortfall, staleness,
 *                            manual-over-derived precedence
 *   - spO_recordMovement()   snapshot + ledger write + stock sync + dedupe +
 *                            negative-stock guard + validation
 *   - spO_heldQty() / spO_recomputeReservedQty()  derived reserved_qty cache
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_spotest".
 *
 *   php scripts/test_spare_optimization.php [--keep]
 *
 * SAFETY: refuses to run unless the scratch name ends in "_spotest", differs
 * from the live DB name, and SELECT DATABASE() is verified after connecting.
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
$scratch = $live . '_spotest';

if (!str_ends_with($scratch, '_spotest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx(float $a, float $b, float $eps = 0.002): bool { return abs($a - $b) <= $eps; }
function throws(string $label, callable $fn, ?int $code = null): void {
    try { $fn(); check($label, false, 'no exception thrown'); }
    catch (DomainException $e) { check($label, $code === null || $e->getCode() === $code, 'code=' . $e->getCode()); }
    catch (Throwable $e) { check($label, false, get_class($e) . ': ' . $e->getMessage()); }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

echo "Spare-optimization harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
$cloned = 0;
foreach ($tables as $t) {
    $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
    $cloned++;
}
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo "Cloned structure of $cloned tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/spare_optimization.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$nowStr = date('Y-m-d H:i:s');
$ago = fn(int $h) => date('Y-m-d H:i:s', time() - $h * 3600);

/* ================================================================= 1. pure helpers */
echo "\n[1] movement primitives\n";
check('typeSign receipt = +1', spO_typeSign('receipt') === 1);
check('typeSign return = +1', spO_typeSign('return') === 1);
check('typeSign withdrawal = -1', spO_typeSign('withdrawal') === -1);
check('typeSign scrap = -1', spO_typeSign('scrap') === -1);
check('typeSign adjustment = null', spO_typeSign('adjustment') === null);
check('typeSign unknown = null', spO_typeSign('nonsense') === null);

check('rowDelta prefers before/after', spO_rowDelta(['qty_before' => 10, 'qty_after' => 7, 'type' => 'receipt', 'quantity' => 99]) === -3.0);
check('rowDelta before 0 after 5 = +5', spO_rowDelta(['qty_before' => 0, 'qty_after' => 5]) === 5.0);
check('rowDelta withdrawal qty 4 = -4', spO_rowDelta(['type' => 'withdrawal', 'quantity' => 4]) === -4.0);
check('rowDelta receipt qty 4 = +4', spO_rowDelta(['type' => 'receipt', 'quantity' => 4]) === 4.0);
check('rowDelta receipt negative qty = negative', spO_rowDelta(['type' => 'receipt', 'quantity' => -4]) === -4.0);
check('rowDelta adjustment no balances = null', spO_rowDelta(['type' => 'adjustment', 'quantity' => 4]) === null);
check('rowDelta empty type = null', spO_rowDelta(['quantity' => 4]) === null);
check('rowDelta empty before falls back to type', spO_rowDelta(['qty_before' => '', 'qty_after' => 5, 'type' => 'withdrawal', 'quantity' => 2]) === -2.0);

check('isConsumption negative delta = true', spO_isConsumption(['qty_before' => 5, 'qty_after' => 1]) === true);
check('isConsumption positive delta = false', spO_isConsumption(['qty_before' => 1, 'qty_after' => 5]) === false);
check('isConsumption unknown delta = false', spO_isConsumption(['type' => 'adjustment']) === false);

/* ================================================================= 2. dates / stale */
echo "\n[2] spO_daysSince / spO_isStale\n";
check('daysSince null from = null', spO_daysSince(null) === null);
check('daysSince empty from = null', spO_daysSince('') === null);
check('daysSince 0000 date = null', spO_daysSince('0000-00-00 00:00:00') === null);
check('daysSince invalid = null', spO_daysSince('not-a-date') === null);
check('daysSince 10 days = 10', spO_daysSince(date('Y-m-d H:i:s', time() - 10 * 86400)) === 10);
check('daysSince future clamps to 0', spO_daysSince(date('Y-m-d H:i:s', time() + 5 * 86400)) === 0);

check('isStale missing sync = true', spO_isStale([], []) === true);
check('isStale empty sync = true', spO_isStale(['last_synced_at' => ''], []) === true);
check('isStale 0000 sync = true', spO_isStale(['last_synced_at' => '0000-00-00 00:00:00'], []) === true);
check('isStale invalid sync = true', spO_isStale(['last_synced_at' => 'garbage'], []) === true);
check('isStale fresh (now) = false', spO_isStale(['last_synced_at' => $nowStr], []) === false);
check('isStale 23h default 24 = false', spO_isStale(['last_synced_at' => $ago(23)], []) === false);
check('isStale 25h default 24 = true', spO_isStale(['last_synced_at' => $ago(25)], []) === true);
check('isStale custom 1h window at 2h = true', spO_isStale(['last_synced_at' => $ago(2)], ['sp_stale_sync_hours' => '1']) === true);

/* ================================================================= 3. clamps / cfg */
echo "\n[3] clamps / config coercion\n";
check('clampInt mid', spO_clampInt(5, 1, 10) === 5);
check('clampInt low', spO_clampInt(0, 1, 10) === 1);
check('clampInt high', spO_clampInt(20, 1, 10) === 10);
check('clampFloat mid', spO_clampFloat(5.5, 0.0, 10.0) === 5.5);
check('clampFloat low', spO_clampFloat(-1.0, 0.0, 10.0) === 0.0);
check('clampFloat NAN -> min', spO_clampFloat(NAN, 2.0, 10.0) === 2.0);
check('clampFloat INF -> min', spO_clampFloat(INF, 2.0, 10.0) === 2.0);

check('cfgInt missing -> default', spO_cfgInt([], 'k', 42) === 42);
check('cfgInt empty -> default', spO_cfgInt(['k' => ''], 'k', 42) === 42);
check('cfgInt rounds', spO_cfgInt(['k' => '5.6'], 'k', 0) === 6);
check('cfgFloat parses', spO_cfgFloat(['k' => '2.5'], 'k', 0.0) === 2.5);
check('cfgFloat empty -> default', spO_cfgFloat(['k' => ''], 'k', 3.0) === 3.0);
check('cfgBool missing -> default', spO_cfgBool([], 'k', true) === true);
check('cfgBool on = true', spO_cfgBool(['k' => 'on'], 'k') === true);
check('cfgBool 0 = false', spO_cfgBool(['k' => '0'], 'k', true) === false);
check('cfgBool garbage = false', spO_cfgBool(['k' => 'garbage'], 'k', true) === false);
check('cfgJson parses array', spO_cfgJson(['k' => '["a","b"]'], 'k') === ['a', 'b']);
check('cfgJson empty -> []', spO_cfgJson(['k' => ''], 'k') === []);
check('cfgJson malformed -> []', spO_cfgJson(['k' => 'notjson'], 'k') === []);
check('cfgJson scalar -> []', spO_cfgJson(['k' => '123'], 'k') === []);

/* ================================================================= 4. guards / schema */
echo "\n[4] guards / config schema\n";
$guards = spO_guards([]);
check('guards auto_procurement off', $guards['auto_procurement'] === false);
check('guards auto_minmax_write off', $guards['auto_minmax_write'] === false);
check('guards auto_criticality off', $guards['auto_criticality'] === false);
check('guards reservation_deducts_stock off', $guards['reservation_deducts_stock'] === false);
check('guards ai_scoring off', $guards['ai_scoring'] === false);
$schema = spO_configSchema();
check('schema has demand window key', isset($schema['sp_demand_window_days']));
check('schema omits phase33 guard key', !array_key_exists('phase33_auto_procurement', $schema));

echo "\n[5] spO_inputBool strict coercion\n";
check('inputBool true -> 1', spO_inputBool(true, 'k') === '1');
check('inputBool false -> 0', spO_inputBool(false, 'k') === '0');
check('inputBool 1 -> 1', spO_inputBool(1, 'k') === '1');
check('inputBool 0 -> 0', spO_inputBool(0, 'k') === '0');
check('inputBool YES -> 1', spO_inputBool('YES', 'k') === '1');
check('inputBool off -> 0', spO_inputBool('off', 'k') === '0');
throws('inputBool typo rejected', fn() => spO_inputBool('flase', 'k'), 400);

echo "\n[6] spO_zForServiceLevel\n";
check('z 50 = 0', approx(spO_zForServiceLevel(50.0), 0.0000));
check('z 95 = 1.6449', approx(spO_zForServiceLevel(95.0), 1.6449));
check('z 97.5 = 1.9600', approx(spO_zForServiceLevel(97.5), 1.9600));
check('z 85 = 1.0364', approx(spO_zForServiceLevel(85.0), 1.0364));
check('z below range clamps to 50', approx(spO_zForServiceLevel(40.0), 0.0000));
check('z above range clamps to 99.5', approx(spO_zForServiceLevel(99.9), 2.5758));
check('z interpolates 92.5 -> 1.4633', approx(spO_zForServiceLevel(92.5), 1.4633));
check('r rounds to 3dp', spO_r(1.2346, 3) === 1.235);

/* ================================================================= 7. setConfig (DB) */
echo "\n[7] spO_setConfig whitelist + persist\n";
$pdo->prepare("INSERT INTO settings (setting_key, setting_group, setting_value) VALUES ('sp_demand_window_days','spare_optimization','365')")->execute();
$pdo->prepare("INSERT INTO settings (setting_key, setting_group, setting_value) VALUES ('sp_demand_reliable','spare_optimization','0')")->execute();
$cfgDb = spO_getConfig($pdo);
check('getConfig reads rows', ($cfgDb['sp_demand_window_days'] ?? null) === '365');

throws('setConfig unknown key rejected', fn() => spO_setConfig($pdo, $cfgDb, ['phase33_auto_procurement' => '1'], 1), 400);
throws('setConfig bad bool rejected', fn() => spO_setConfig($pdo, $cfgDb, ['sp_demand_reliable' => 'flase'], 1), 400);

$changed = spO_setConfig($pdo, $cfgDb, ['sp_demand_window_days' => '99999', 'sp_demand_reliable' => true], 1);
check('setConfig reports 2 changed', $changed === 2);
$stored = (string)$pdo->query("SELECT setting_value FROM settings WHERE setting_key='sp_demand_window_days'")->fetchColumn();
check('setConfig clamps int to max 3650', $stored === '3650');
$storedBool = (string)$pdo->query("SELECT setting_value FROM settings WHERE setting_key='sp_demand_reliable'")->fetchColumn();
check('setConfig stores bool as 1', $storedBool === '1');
$changed2 = spO_setConfig($pdo, spO_getConfig($pdo), ['sp_demand_window_days' => '3650'], 1);
check('setConfig no-op reports 0', $changed2 === 0);

/* ================================================================= 8. deriveReorderPoint */
echo "\n[8] spO_deriveReorderPoint (reliable demand only)\n";
$cfg = [
    'sp_safety_stock_factor' => '0.5', 'sp_default_lead_time_days' => '30',
    'sp_default_service_level' => '95', 'sp_excess_over_max_ratio' => '1.0',
    'sp_stale_sync_hours' => '24', 'sp_stale_sync_blocks_minmax' => 'true',
];
$demand = ['reliable' => true, 'avg_daily_demand' => 2.0, 'std_dev_daily' => 1.0, 'movements' => 10, 'days_span' => 100];
check('derive null demand -> null', spO_deriveReorderPoint([], $cfg, null) === null);
check('derive unreliable demand -> null', spO_deriveReorderPoint([], $cfg, ['reliable' => false]) === null);

$d = spO_deriveReorderPoint(['lead_time_days' => 30, 'service_level' => 95], $cfg, $demand);
check('derive safety stock ~4.505', approx($d['safety_stock'], 4.505));
check('derive reorder point ~64.505', approx($d['reorder_point'], 64.505));
check('derive inputs z_score', approx($d['inputs']['z_score'], 1.6449));
check('derive inputs lead 30', $d['inputs']['lead_time_days'] === 30);
check('derive inputs factor 0.5', approx($d['inputs']['safety_stock_factor'], 0.5));

$d0 = spO_deriveReorderPoint(['lead_time_days' => 30, 'service_level' => 95], array_merge($cfg, ['sp_safety_stock_factor' => '0']), $demand);
check('derive factor 0 keeps raw safety ~9.009', approx($d0['safety_stock'], 9.009));

$dLead = spO_deriveReorderPoint(['lead_time_days' => 0, 'service_level' => 95], $cfg, $demand);
check('derive lead 0 -> cfg default 30', $dLead['inputs']['lead_time_days'] === 30);

$dSl = spO_deriveReorderPoint(['lead_time_days' => 30, 'service_level' => 0], array_merge($cfg, ['sp_default_service_level' => '90']), $demand);
check('derive service 0 -> cfg default 90', approx($dSl['inputs']['service_level'], 90.0));

/* ================================================================= 9. availability (pure) */
echo "\n[9] spO_availability status ladder\n";
$fresh = ['last_synced_at' => $nowStr];
$a = spO_availability(array_merge(['stock_qty' => 0], $fresh), $cfg);
check('out_of_stock status', $a['status'] === 'out_of_stock' && $a['risk_level'] === 'critical', json_encode($a['status']));

$a = spO_availability(array_merge(['stock_qty' => 4, 'safety_stock' => 5, 'is_critical_spare' => 1], $fresh), $cfg);
check('below_safety + critical -> high risk', $a['status'] === 'below_safety' && $a['risk_level'] === 'high');

$a = spO_availability(array_merge(['stock_qty' => 4, 'safety_stock' => 5], $fresh), $cfg);
check('below_safety non-critical -> medium', $a['status'] === 'below_safety' && $a['risk_level'] === 'medium');

$a = spO_availability(array_merge(['stock_qty' => 8, 'reorder_point' => 10], $fresh), $cfg);
check('below_reorder + manual source', $a['status'] === 'below_reorder' && $a['reorder_point_source'] === 'manual');
check('below_reorder shortfall 2', approx($a['shortfall'], 2.0));

$a = spO_availability(array_merge(['stock_qty' => 4, 'min_stock' => 5], $fresh), $cfg);
check('below_min status', $a['status'] === 'below_min' && $a['risk_level'] === 'low');

$a = spO_availability(array_merge(['stock_qty' => 11, 'max_stock' => 10], $fresh), $cfg);
check('excess status', $a['status'] === 'excess' && $a['risk_level'] === 'low');

$a = spO_availability(array_merge(['stock_qty' => 100], $fresh), $cfg);
check('ok status', $a['status'] === 'ok' && $a['risk_level'] === 'low');

$a = spO_availability(array_merge(['stock_qty' => 10, 'reserved_qty' => 1, 'reserved_from_ledger' => 4], $fresh), $cfg);
check('reserved prefers ledger over cache', $a['reserved'] === 4.0 && $a['available'] === 6.0);

$a = spO_availability(array_merge(['stock_qty' => 100, 'reorder_point' => 20, 'lead_time_days' => 30, 'service_level' => 95], $fresh), $cfg, $demand);
check('manual reorder_point wins over derived', $a['reorder_point_source'] === 'manual' && $a['reorder_point'] === 20.0);

$a = spO_availability(array_merge(['stock_qty' => 100, 'lead_time_days' => 30, 'service_level' => 95], $fresh), $cfg, $demand);
check('derived reorder_point from reliable demand', $a['reorder_point_source'] === 'derived' && approx($a['reorder_point'], 64.505));
check('derived_safety_stock exposed', approx((float)$a['derived_safety_stock'], 4.505));

$a = spO_availability(['stock_qty' => 100, 'lead_time_days' => 30, 'service_level' => 95, 'last_synced_at' => $ago(72)], $cfg, $demand);
check('stale blocks derived min/max', $a['reorder_point_source'] === 'none' && $a['minmax_blocked_stale'] === true);
check('stale flags last_known_data', $a['last_known_data'] === true);

$a = spO_availability(['stock_qty' => 100, 'lead_time_days' => 30, 'service_level' => 95, 'last_synced_at' => $ago(72)], array_merge($cfg, ['sp_stale_sync_blocks_minmax' => 'false']), $demand);
check('stale but not blocking -> derived still computed', $a['reorder_point_source'] === 'derived' && $a['last_known_data'] === true);

$a = spO_availability(array_merge(['stock_qty' => 100, 'lead_time_days' => 30, 'service_level' => 95], $fresh), $cfg, ['reliable' => false]);
check('unreliable demand -> no reorder point', $a['reorder_point_source'] === 'none');

/* ================================================================= 10. recordMovement (DB) */
echo "\n[10] spO_recordMovement ledger + stock sync\n";
$pdo->prepare("INSERT INTO spare_parts (code, name, stock_qty, unit_price, last_synced_at) VALUES ('SP-T1','Test Bearing',0,7.25,?)")
    ->execute([$nowStr]);
$p2 = (int)$pdo->lastInsertId();

$m1 = spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'receipt', 'quantity' => 10, 'warehouse_id' => null]);
check('receipt inserted', $m1['inserted'] === true && $m1['duplicate'] === false);
$row = $pdo->query("SELECT * FROM spare_part_transactions WHERE id = {$m1['id']}")->fetch();
check('ledger snapshots qty_before=0', (float)$row['qty_before'] === 0.0);
check('ledger snapshots qty_after=10', (float)$row['qty_after'] === 10.0);
check('ledger stores abs(quantity)', (float)$row['quantity'] === 10.0);
check('ledger unit_price falls back to part', (float)$row['unit_price'] === 7.25);
$stock = (float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $p2")->fetchColumn();
check('part stock synced to 10', $stock === 10.0);
$lmv = $pdo->query("SELECT last_movement_at FROM spare_parts WHERE id = $p2")->fetchColumn();
check('last_movement_at stamped', $lmv !== null && $lmv !== '0000-00-00 00:00:00');

$m2 = spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'receipt', 'quantity' => 5, 'unit_price' => 3.33], 'dup-1');
check('movement with action id inserted', $m2['inserted'] === true);
$row2 = $pdo->query("SELECT unit_price FROM spare_part_transactions WHERE id = {$m2['id']}")->fetchColumn();
check('explicit unit_price overrides fallback', (float)$row2 === 3.33);
$m3 = spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'receipt', 'quantity' => 5], 'dup-1');
check('duplicate client_action_id deduped', $m3['duplicate'] === true && $m3['id'] === $m2['id'] && $m3['inserted'] === false);
$stock = (float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $p2")->fetchColumn();
check('deduped call did not double-apply stock (15)', $stock === 15.0);

throws('negative stock rejected by default', fn() => spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'withdrawal', 'quantity' => 999]), 409);
$stock = (float)$pdo->query("SELECT stock_qty FROM spare_parts WHERE id = $p2")->fetchColumn();
check('rejected movement left stock untouched (15)', $stock === 15.0);

$m4 = spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'withdrawal', 'quantity' => 999, 'allow_negative' => true]);
$row4 = $pdo->query("SELECT qty_after FROM spare_part_transactions WHERE id = {$m4['id']}")->fetchColumn();
check('allow_negative permits negative balance', (float)$row4 === -984.0);

$m5 = spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'adjustment', 'quantity' => 0, 'qty_after' => 20]);
$row5 = $pdo->query("SELECT qty_after FROM spare_part_transactions WHERE id = {$m5['id']}")->fetchColumn();
check('adjustment honours explicit qty_after', (float)$row5 === 20.0);

throws('bad movement type rejected', fn() => spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'nonsense', 'quantity' => 1]), 400);
throws('zero qty without qty_after rejected', fn() => spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'adjustment', 'quantity' => 0]), 400);
throws('bad movement_date rejected', fn() => spO_recordMovement($pdo, ['spare_part_id' => $p2, 'type' => 'receipt', 'quantity' => 1, 'movement_date' => '2026/01/05']), 400);
throws('missing part rejected', fn() => spO_recordMovement($pdo, ['spare_part_id' => 999999, 'type' => 'receipt', 'quantity' => 1]), 404);
throws('zero part id rejected', fn() => spO_recordMovement($pdo, ['spare_part_id' => 0, 'type' => 'receipt', 'quantity' => 1]), 400);

/* ================================================================= 11. reservations (DB) */
echo "\n[11] spO_heldQty / spO_recomputeReservedQty\n";
$pdo->prepare("INSERT INTO spare_parts (code, name, stock_qty, reserved_qty) VALUES ('SP-T2','Reserved Part',20,99)")->execute();
$p3 = (int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO spare_parts (code, name, stock_qty, reserved_qty) VALUES ('SP-T3','No Holds',5,50)")->execute();
$p4 = (int)$pdo->lastInsertId();

$insRes = $pdo->prepare("INSERT INTO spare_part_reservations (reservation_no, spare_part_id, qty, qty_consumed, status) VALUES (?,?,?,?,?)");
$insRes->execute(['RSV-1', $p3, 5, 0, 'held']);
$insRes->execute(['RSV-2', $p3, 3, 1, 'partially_consumed']);
$insRes->execute(['RSV-3', $p3, 4, 0, 'consumed']);
$insRes->execute(['RSV-4', $p3, 4, 0, 'released']);
$insRes->execute(['RSV-5', $p3, 4, 0, 'cancelled']);
$insRes->execute(['RSV-6', $p3, 4, 0, 'expired']);

$held = spO_heldQty($pdo, $p3);
check('heldQty sums active holds (5 + 2)', $held['qty'] === 7.0);
check('heldQty counts 2 active', $held['active'] === 2);

$rec = spO_recomputeReservedQty($pdo, $p3);
check('recompute reports part held 7', approx((float)($rec['parts'][$p3] ?? -1), 7.0));
$cached = (float)$pdo->query("SELECT reserved_qty FROM spare_parts WHERE id = $p3")->fetchColumn();
check('recompute writes cache reserved_qty=7', $cached === 7.0);

$recNone = spO_recomputeReservedQty($pdo, $p4);
check('recompute resets part with no holds to 0', !isset($recNone['parts'][$p4]));
$cached4 = (float)$pdo->query("SELECT reserved_qty FROM spare_parts WHERE id = $p4")->fetchColumn();
check('stale cache reset to 0', $cached4 === 0.0);

$recAll = spO_recomputeReservedQty($pdo);
check('global recompute includes part 3', approx((float)($recAll['parts'][$p3] ?? -1), 7.0));

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) {
    echo "Failures:\n";
    foreach ($failures as $f) echo "  - $f\n";
}
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
