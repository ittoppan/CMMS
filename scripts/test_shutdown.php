<?php
/**
 * scripts/test_shutdown.php — behavioral harness for the Phase 35 Shutdown /
 * Turnaround engine (src/helpers/shutdown.php).
 *
 * The sd_* tables are NOT in the live schema yet, so this harness reuses
 * scripts/apply_phase35_shutdown.php to create them in the THROWAWAY database
 * = live DB name + "_sdtest".
 *
 *   php scripts/test_shutdown.php [--keep]
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
$scratch = $live . '_sdtest';

if (!str_ends_with($scratch, '_sdtest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Shutdown harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
// Views are not copied by CREATE TABLE ... LIKE, but shutdown cost reads the Phase 26
// read-model v_maintenance_cost, so recreate the live views in the scratch DB too.
$views = $admin->query("SELECT TABLE_NAME FROM information_schema.VIEWS
                        WHERE TABLE_SCHEMA = " . $admin->quote($live) . " ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec("USE `$scratch`");
$viewCount = 0; $viewErrs = [];
foreach ($views as $v) {
    $ddl = $admin->query("SHOW CREATE VIEW `$live`.`$v`")->fetch(PDO::FETCH_ASSOC)['Create View'] ?? '';
    if ($ddl === '') continue;
    $ddl = preg_replace('/DEFINER=\S+ /', '', $ddl);
    $ddl = str_replace("`$live`.", '', $ddl);
    try { $admin->exec($ddl); $viewCount++; } catch (Throwable $e) { $viewErrs[] = "$v: " . $e->getMessage(); }
}
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo 'Cloned structure of ' . count($tables) . ' tables and ' . $viewCount . ' of ' . count($views) . " views.\n";
foreach ($viewErrs as $e) echo "  view-clone-warn: $e\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/audit.php';
require_once __DIR__ . '/../src/helpers/cost.php';
require_once __DIR__ . '/../src/helpers/shutdown.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

ob_start();
require __DIR__ . '/apply_phase35_shutdown.php';
$migLog = ob_get_clean();
foreach (['sd_shutdowns', 'sd_assets', 'sd_scopes', 'sd_dependencies', 'sd_baselines', 'sd_readiness_checks', 'sd_startup_checks', 'sd_planned_parts', 'sd_activity'] as $t) {
    $ok = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='$t'")->fetchColumn() > 0;
    if (!$ok) { fwrite(STDERR, "FATAL: migration did not create $t\n"); exit(2); }
}

$UID = 9001;

/* ------------------------------------------------------------------ fixtures */
$pdo->prepare('INSERT INTO departments (code, name) VALUES (?, ?)')->execute(['MAINT', 'Maintenance']);
$DEPT = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO users (username, email, password, full_name, role_id) VALUES (?,?,?,?,?)')
    ->execute(['harness_sd', 'harness_sd@example.test', 'x', 'Harness User', 1]);
$USER = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO asset_registry (code, name, status) VALUES (?,?,?)')->execute(['PMP-1', 'Feed Pump', 'active']);
$ASSET = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO asset_registry (code, name, status) VALUES (?,?,?)')->execute(['MTR-1', 'Drive Motor', 'active']);
$ASSET2 = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO repair (asset_id, title, status, actual_start_at, estimated_duration_minutes, repair_time_minutes,
                                    cost_parts, cost_labor, cost_outsource) VALUES (?,?,?,?,?,?,?,?,?)')
    ->execute([$ASSET, 'WO for shutdown', 'in_progress', date('Y-m-d H:i:s', strtotime('-2 hours')), 600, 300, 1000.00, 500.00, 200.00]);
$REPAIR = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO spare_parts (code, name, unit, stock_qty, reserved_qty, unit_price, last_synced_at)
               VALUES (?,?,?,?,?,?,NOW())')->execute(['SP-BRG', 'Bearing 6205', 'pcs', 10, 0, 150.00]);
$PART = (int)$pdo->lastInsertId();

/* ================================================================= 1. constants */
echo "\n[1] constants + labels\n";
check('SD_STATUSES count', count(SD_STATUSES) === 9);
check('draft -> planning,cancelled', sd_valid_transitions()['draft'] === ['planning', 'cancelled']);
check('completed -> []', sd_valid_transitions()['completed'] === []);
check('cancelled -> []', sd_valid_transitions()['cancelled'] === []);
check('statuses()', sd_statuses() === SD_STATUSES);
check('status_labels has 9', count(sd_status_labels()) === 9);
check('reason_codes has pass', array_key_exists('pass', sd_reason_codes()));
check('check_labels has loto', array_key_exists('loto', sd_check_labels()));

/* ================================================================= 2. config */
echo "\n[2] config\n";
$cfg = sd_config($pdo);
check('block_on_readiness 1', $cfg['block_on_readiness'] === '1');
check('allow_waive_blocking 0', $cfg['allow_waive_blocking'] === '0');
check('progress_source work_order', $cfg['progress_source'] === 'work_order');
check('scope_min_estimate_hours 0.01', $cfg['scope_min_estimate_hours'] === '0.01');
check('max_baseline_versions 20', $cfg['max_baseline_versions'] === '20');
check('sd_bool true', sd_bool(['x' => '1'], 'x') === true);
check('sd_bool false', sd_bool(['x' => '0'], 'x') === false);
check('sd_bool yes', sd_bool(['x' => 'yes'], 'x') === true);
sd_config_override(['allow_waive_blocking' => '1', 'progress_source' => 'manual']);
check('override applied', sd_config($pdo)['allow_waive_blocking'] === '1' && sd_config($pdo)['progress_source'] === 'manual');
sd_config_reset();
check('reset restores default', sd_config($pdo)['progress_source'] === 'work_order');
check('sd_setting missing -> default', sd_setting($pdo, 'nope_xyz', 'DEF') === 'DEF');
check('table_exists true', sd_table_exists($pdo, 'sd_shutdowns') === true);
check('table_exists false', sd_table_exists($pdo, 'no_such_table_zzz') === false);

/* ================================================================= 3. create/update */
echo "\n[3] create / update\n";
$month = date('Ym');
$s1 = sd_create($pdo, $UID, ['title' => 'Annual Pump Overhaul', 'shutdown_type' => 'planned', 'risk_level' => 'high']);
check('create ok', ($s1['id'] ?? 0) > 0, json_encode($s1));
$S1 = (int)$s1['id'];
check('shutdown_no seq 001', $s1['shutdown_no'] === "SD-$month-001", $s1['shutdown_no']);
check('created as draft', $s1['status'] === 'draft');
$s2 = sd_create($pdo, $UID, ['title' => 'Motor inspection']);
$S2 = (int)$s2['id'];
check('shutdown_no seq 002', $s2['shutdown_no'] === "SD-$month-002", $s2['shutdown_no']);

check('missing title', (sd_create($pdo, $UID, [])['error'] ?? '') === 'VALIDATION_ERROR');
check('bad type', (sd_create($pdo, $UID, ['title' => 'x', 'shutdown_type' => 'nope'])['error'] ?? '') === 'VALIDATION_ERROR');
check('bad risk', (sd_create($pdo, $UID, ['title' => 'x', 'risk_level' => 'nope'])['error'] ?? '') === 'VALIDATION_ERROR');
$dup = sd_create($pdo, $UID, ['title' => 'dup', 'shutdown_no' => $s1['shutdown_no']]);
check('duplicate shutdown_no', ($dup['error'] ?? '') === 'DUPLICATE');

check('get ok', (sd_get($pdo, $S1)['shutdown_no'] ?? '') === $s1['shutdown_no']);
check('get missing null', sd_get($pdo, 999999) === null);
$upd = sd_update($pdo, $UID, $S1, ['facility' => 'Plant A', 'notes' => 'note']);
check('update ok', ($upd['id'] ?? 0) === $S1);
check('update empty -> validation', (sd_update($pdo, $UID, $S1, [])['error'] ?? '') === 'VALIDATION_ERROR');
check('update missing -> NOT_FOUND', (sd_update($pdo, $UID, 999999, ['title' => 'x'])['error'] ?? '') === 'NOT_FOUND');

/* ================================================================= 4. transitions */
echo "\n[4] transitions\n";
check('bad target status', (sd_transition($pdo, $UID, $S1, 'nope')['error'] ?? '') === 'VALIDATION_ERROR');
check('invalid transition draft->execution', (sd_transition($pdo, $UID, $S1, 'execution')['error'] ?? '') === 'INVALID_TRANSITION');
check('cancel needs reason', (sd_transition($pdo, $UID, $S1, 'cancelled')['error'] ?? '') === 'REASON_REQUIRED');
check('draft->planning ok', (sd_transition($pdo, $UID, $S1, 'planning')['status'] ?? '') === 'planning');

/* ================================================================= 5. scopes */
echo "\n[5] scopes\n";
check('scope without title', (sd_scope_save($pdo, $UID, ['shutdown_id' => $S1])['error'] ?? '') === 'VALIDATION_ERROR');
check('scope bad shutdown', (sd_scope_save($pdo, $UID, ['shutdown_id' => 999999, 'title' => 'x'])['error'] ?? '') === 'NOT_FOUND');
check('scope bad repair', (sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'title' => 'x', 'repair_id' => 999999])['error'] ?? '') === 'VALIDATION_ERROR');
check('scope negative est', (sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'title' => 'x', 'estimate_hours' => -1])['error'] ?? '') === 'VALIDATION_ERROR');
$sc1 = sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'title' => 'Isolate & drain', 'estimate_hours' => 10, 'repair_id' => $REPAIR, 'owner_user_id' => $USER, 'sort' => 1]);
$SC1 = (int)$sc1['id'];
check('scope1 created', $SC1 > 0);
$sc2 = sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'title' => 'Replace seal', 'estimate_hours' => 5, 'repair_id' => $REPAIR, 'owner_user_id' => $USER, 'sort' => 2]);
$SC2 = (int)$sc2['id'];
check('scope2 created', $SC2 > 0);
check('bad parent (other shutdown)', (sd_scope_save($pdo, $UID, ['shutdown_id' => $S2, 'title' => 'child', 'parent_id' => $SC1])['error'] ?? '') === 'VALIDATION_ERROR');
$sc3 = sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'title' => 'Child scope', 'parent_id' => $SC1]);
$SC3 = (int)$sc3['id'];
check('valid child parent', $SC3 > 0);
check('scope list count 3', count(sd_scope_list($pdo, $S1)) === 3);
$scupd = sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'id' => $SC3, 'title' => 'Child scope v2', 'estimate_hours' => 1]);
check('scope update', ($scupd['id'] ?? 0) === $SC3);

/* ================================================================= 6. dependency + CPM */
echo "\n[6] dependencies + critical path\n";
check('dep same pred/succ', (sd_dependency_save($pdo, $UID, ['shutdown_id' => $S1, 'predecessor_scope_id' => $SC1, 'successor_scope_id' => $SC1])['error'] ?? '') === 'VALIDATION_ERROR');
check('dep bad type', (sd_dependency_save($pdo, $UID, ['shutdown_id' => $S1, 'predecessor_scope_id' => $SC1, 'successor_scope_id' => $SC2, 'dep_type' => 'XX'])['error'] ?? '') === 'VALIDATION_ERROR');
check('dep scope from other shutdown', (sd_dependency_save($pdo, $UID, ['shutdown_id' => $S2, 'predecessor_scope_id' => $SC1, 'successor_scope_id' => $SC2])['error'] ?? '') === 'VALIDATION_ERROR');
check('dep FS ok', (sd_dependency_save($pdo, $UID, ['shutdown_id' => $S1, 'predecessor_scope_id' => $SC1, 'successor_scope_id' => $SC2, 'dep_type' => 'FS', 'lag_hours' => 2])['ok'] ?? false) === true);
$cpS1 = sd_critical_path($pdo, $S1);
check('cp status ok', $cpS1['status'] === 'ok', $cpS1['status']);
// SC1=10 + lag2 + SC2=5 = 17 ; SC3=1 standalone
check('cp project hours 17', $cpS1['critical_path_hours'] === 17.0, (string)$cpS1['critical_path_hours']);
check('cp total estimate 16', $cpS1['total_estimate_hours'] === 16.0, (string)$cpS1['total_estimate_hours']);
check('cycle guard rejects', (sd_dependency_save($pdo, $UID, ['shutdown_id' => $S1, 'predecessor_scope_id' => $SC2, 'successor_scope_id' => $SC1, 'dep_type' => 'FS'])['error'] ?? '') === 'CYCLE');
check('sd_reaches true', sd_reaches($pdo, $S1, $SC1, $SC2) === true);
check('sd_reaches false', sd_reaches($pdo, $S1, $SC2, $SC1) === false);
// SC3 was only needed for the CPM hour totals; drop it so later progress math is simple.
check('cleanup SC3', (sd_scope_delete($pdo, $UID, $SC3, 'cleanup for later sections')['deleted'] ?? false) === true);

/* dedicated CPM maths */
$cp1 = sd_create($pdo, $UID, ['title' => 'CPM maths']);
$CP = (int)$cp1['id'];
$p1 = (int)sd_scope_save($pdo, $UID, ['shutdown_id' => $CP, 'title' => 'P1', 'estimate_hours' => 10])['id'];
$p2 = (int)sd_scope_save($pdo, $UID, ['shutdown_id' => $CP, 'title' => 'P2', 'estimate_hours' => 4])['id'];
$p3 = (int)sd_scope_save($pdo, $UID, ['shutdown_id' => $CP, 'title' => 'P3', 'estimate_hours' => 6])['id'];
sd_dependency_save($pdo, $UID, ['shutdown_id' => $CP, 'predecessor_scope_id' => $p1, 'successor_scope_id' => $p3]);
sd_dependency_save($pdo, $UID, ['shutdown_id' => $CP, 'predecessor_scope_id' => $p2, 'successor_scope_id' => $p3]);
$cp = sd_critical_path($pdo, $CP);
check('CPM project 16', $cp['critical_path_hours'] === 16.0, (string)$cp['critical_path_hours']);
$float = [];
foreach ($cp['nodes'] as $n) $float[$n['scope_id']] = $n['float'];
check('P1 float 0', (float)$float[$p1] === 0.0);
check('P2 float 6', (float)$float[$p2] === 6.0);
check('P3 float 0', (float)$float[$p3] === 0.0);
check('critical path = P1,P3', array_column($cp['critical_path'], 'scope_id') === [$p1, $p3]);

$cp0 = sd_create($pdo, $UID, ['title' => 'empty']);
check('cp no_scopes', sd_critical_path($pdo, (int)$cp0['id'])['status'] === 'no_scopes');
$cp1b = sd_create($pdo, $UID, ['title' => 'no deps']);
sd_scope_save($pdo, $UID, ['shutdown_id' => (int)$cp1b['id'], 'title' => 'A', 'estimate_hours' => 3]);
$cpNo = sd_critical_path($pdo, (int)$cp1b['id']);
check('cp no_dependencies', $cpNo['status'] === 'no_dependencies');
check('cp no_dependencies sum', $cpNo['sum_duration'] === 3.0);
$cp2 = sd_create($pdo, $UID, ['title' => 'unestimated']);
sd_scope_save($pdo, $UID, ['shutdown_id' => (int)$cp2['id'], 'title' => 'A', 'estimate_hours' => 3]);
sd_scope_save($pdo, $UID, ['shutdown_id' => (int)$cp2['id'], 'title' => 'B']);
$cpU = sd_critical_path($pdo, (int)$cp2['id']);
check('cp not_estimated', $cpU['status'] === 'not_estimated');
check('cp unestimated count 1', $cpU['unestimated_count'] === 1);

/* ================================================================= 7. baseline */
echo "\n[7] baselines\n";
$b = sd_baseline_create($pdo, $UID, $S1, 'first');
check('baseline create v1', ($b['version'] ?? 0) === 1, json_encode($b));
check('baseline current v1', (int)(sd_baseline_current($pdo, $S1)['version'] ?? 0) === 1);
check('shutdown is_baselined', (int)sd_get($pdo, $S1)['is_baselined'] === 1);
check('shutdown baseline_version 1', (int)sd_get($pdo, $S1)['baseline_version'] === 1);
$b2 = sd_baseline_create($pdo, $UID, $S1, 'second');
check('baseline create v2', ($b2['version'] ?? 0) === 2);
check('only v2 current', (int)(sd_baseline_current($pdo, $S1)['version'] ?? 0) === 2);
check('baselines listed 2', count(sd_baselines($pdo, $S1)) === 2);

$diff0 = sd_baseline_diff($pdo, $S1);
check('diff available', ($diff0['available'] ?? false) === true);
check('diff clean', $diff0['added'] === [] && $diff0['removed'] === [] && $diff0['changed'] === []);
sd_scope_save($pdo, $UID, ['shutdown_id' => $S1, 'id' => $SC2, 'title' => 'Replace seal', 'estimate_hours' => 8, 'repair_id' => $REPAIR, 'owner_user_id' => $USER, 'sort' => 2]);
$diff1 = sd_baseline_diff($pdo, $S1);
check('diff detects change', count($diff1['changed']) === 1 && (float)$diff1['changed'][0]['delta_hours'] === 3.0);
check('diff cp delta 3', (float)$diff1['critical_path_delta'] === 3.0, (string)$diff1['critical_path_delta']);

sd_config_override(['max_baseline_versions' => '2']);
check('baseline cap reached', (sd_baseline_create($pdo, $UID, $S1)['error'] ?? '') === 'CAP_REACHED');
sd_config_reset();

/* ================================================================= 8. readiness */
echo "\n[8] readiness + waive\n";
$rd = sd_readiness($pdo, $S1);
check('readiness not yet refreshed -> empty', $rd['checks'] === [] && $rd['blocking'] === 0);
$rf = sd_readiness_refresh($pdo, $UID, $S1);
check('refresh ok', ($rf['ok'] ?? true) !== false && isset($rf['checks']), json_encode($rf['error'] ?? null));
check('refresh produced checks', count($rf['checks']) > 0);
check('scope_defined pass', (function () use ($rf) {
    foreach ($rf['checks'] as $c) if ($c['check_key'] === 'scope_defined') return $c['state'] === 'pass' && (int)$c['is_blocking'] === 1;
    return false;
})());
check('no permit check when none linked', (function () use ($rf) {
    foreach ($rf['checks'] as $c) if ($c['check_key'] === 'permit') return false;
    return true;
})());
$failBlocking = null;
foreach ($rf['checks'] as $c) if ((int)$c['is_blocking'] === 1 && $c['state'] === 'fail') { $failBlocking = $c; break; }
// assets_defined is fail because we have not added an asset yet
check('assets_defined failing (blocking)', $failBlocking !== null && $failBlocking['check_key'] === 'assets_defined', $failBlocking['check_key'] ?? 'none');
check('readiness not ready', $rf['ready'] === false && $rf['blocking'] >= 1);

// add an asset that needs no isolation -> clears the asset gate
check('asset save ok', (sd_asset_save($pdo, $UID, ['shutdown_id' => $S1, 'asset_id' => $ASSET, 'isolation_required' => 0, 'is_critical' => 1])['ok'] ?? false) === true);
check('asset bad id', (sd_asset_save($pdo, $UID, ['shutdown_id' => $S1, 'asset_id' => 999999])['error'] ?? '') === 'VALIDATION_ERROR');
$assets = sd_assets($pdo, $S1);
check('sd_assets lists 1', count($assets) === 1);
$SD_ASSET0 = (int)$assets[0]['id'];
check('asset code joined', $assets[0]['asset_code'] === 'PMP-1');

$rf2 = sd_readiness_refresh($pdo, $UID, $S1);
check('after asset: ready', $rf2['ready'] === true && $rf2['blocking'] === 0, 'blocking=' . $rf2['blocking']);

// waive: blocking failure forbidden by default. Create a blocking failure by adding isolation asset.
sd_asset_save($pdo, $UID, ['shutdown_id' => $S1, 'asset_id' => $ASSET2, 'isolation_required' => 1]);
$rf3 = sd_readiness_refresh($pdo, $UID, $S1);
$isoCheck = null;
foreach ($rf3['checks'] as $c) if ($c['check_key'] === 'isolation' && $c['state'] === 'fail') { $isoCheck = $c; break; }
check('isolation gate failing', $isoCheck !== null);
check('waive blocking forbidden by default', (sd_readiness_waive($pdo, $UID, (int)$isoCheck['id'], 'this is a long enough reason', 'ok')['error'] ?? '') === 'WAIVE_FORBIDDEN');
check('waive reason too short', (sd_readiness_waive($pdo, $UID, (int)$isoCheck['id'], 'short', 'ok')['error'] ?? '') === 'REASON_REQUIRED');
check('waive needs reason code', (sd_readiness_waive($pdo, $UID, (int)$isoCheck['id'], 'this is a long enough reason', '')['error'] ?? '') === 'VALIDATION_ERROR');
sd_config_override(['allow_waive_blocking' => '1']);
check('waive ok when allowed', (sd_readiness_waive($pdo, $UID, (int)$isoCheck['id'], 'this is a long enough reason', 'risk accepted')['state'] ?? '') === 'waived');
sd_config_reset();
$rf4 = sd_readiness($pdo, $S1);
check('waived counted', $rf4['waived'] >= 1);
check('refresh preserves waiver', (function () use ($pdo, $UID, $S1, $isoCheck) {
    sd_readiness_refresh($pdo, $UID, $S1);
    $st = $pdo->prepare('SELECT state FROM sd_readiness_checks WHERE id = ?');
    $st->execute([(int)$isoCheck['id']]);
    return $st->fetchColumn() === 'waived';
})());

/* ================================================================= 9. dependency delete + scope status */
echo "\n[9] scope status + delete + dependency delete\n";
check('scope status no reason (require_reason_scope=1)', (sd_scope_status($pdo, $UID, $SC1, 'ready')['error'] ?? '') === 'REASON_REQUIRED');
check('scope invalid transition planned->done', (sd_scope_status($pdo, $UID, $SC1, 'done', 'r')['error'] ?? '') === 'INVALID_TRANSITION');
check('scope planned->ready', (sd_scope_status($pdo, $UID, $SC1, 'ready', 'start')['status'] ?? '') === 'ready');
check('scope ready->in_progress', (sd_scope_status($pdo, $UID, $SC1, 'in_progress', 'go')['status'] ?? '') === 'in_progress');
check('scope in_progress->done', (sd_scope_status($pdo, $UID, $SC1, 'done', 'fin')['status'] ?? '') === 'done');
check('delete done scope blocked', (sd_scope_delete($pdo, $UID, $SC1, 'x')['error'] ?? '') === 'STATE');
// dedicated shutdown for parent/child delete rules
$s5 = sd_create($pdo, $UID, ['title' => 'delete rules']);
$S5 = (int)$s5['id'];
$par = (int)sd_scope_save($pdo, $UID, ['shutdown_id' => $S5, 'title' => 'parent'])['id'];
$ch1 = (int)sd_scope_save($pdo, $UID, ['shutdown_id' => $S5, 'title' => 'child1', 'parent_id' => $par])['id'];
$ch2 = (int)sd_scope_save($pdo, $UID, ['shutdown_id' => $S5, 'title' => 'child2', 'parent_id' => $par])['id'];
check('delete parent with children blocked', (sd_scope_delete($pdo, $UID, $par, 'x')['error'] ?? '') === 'HAS_CHILDREN');
check('delete needs reason', (sd_scope_delete($pdo, $UID, $ch1, '')['error'] ?? '') === 'REASON_REQUIRED');
check('delete childless planned ok', (sd_scope_delete($pdo, $UID, $ch1, 'not needed')['deleted'] ?? false) === true);
check('delete last child ok', (sd_scope_delete($pdo, $UID, $ch2, 'not needed')['deleted'] ?? false) === true);
check('delete parent now ok', (sd_scope_delete($pdo, $UID, $par, 'not needed')['deleted'] ?? false) === true);

$deps = sd_dependencies($pdo, $S1);
check('dependencies listed 1', count($deps) === 1);
check('dependency delete ok', (sd_dependency_delete($pdo, $UID, (int)$deps[0]['id'], 'replan')['deleted'] ?? false) === true);
check('dependencies now 0', count(sd_dependencies($pdo, $S1)) === 0);

/* ================================================================= 10. progress */
echo "\n[10] progress\n";
$prog = sd_progress($pdo, $S1);
check('progress scope_count 2', $prog['scope_count'] === 2, (string)$prog['scope_count']);
check('progress pct 50 (SC1 done, SC2 via repair 50)', $prog['pct'] === 50, (string)$prog['pct']);
check('progress basis estimate_hours', $prog['pct_basis'] === 'estimate_hours');
check('progress done count 1', $prog['done'] === 1);

$rp = sd_repair_progress($pdo, $REPAIR);
check('repair progress available', $rp['available'] === true);
check('repair progress pct 50', $rp['pct'] === 50, (string)$rp['pct']);
$pdo->exec("UPDATE repair SET status='completed' WHERE id=$REPAIR");
check('repair completed pct 100', sd_repair_progress($pdo, $REPAIR)['pct'] === 100);
check('repair missing unavailable', sd_repair_progress($pdo, 999999)['available'] === false);

/* ================================================================= 11. material */
echo "\n[11] material\n";
check('part needs spare_part_id', (sd_part_save($pdo, $UID, ['shutdown_id' => $S1])['error'] ?? '') === 'VALIDATION_ERROR');
check('part qty > 0', (sd_part_save($pdo, $UID, ['shutdown_id' => $S1, 'spare_part_id' => $PART, 'planned_qty' => 0])['error'] ?? '') === 'VALIDATION_ERROR');
check('part save ok', (sd_part_save($pdo, $UID, ['shutdown_id' => $S1, 'spare_part_id' => $PART, 'planned_qty' => 5])['ok'] ?? false) === true);
$mat = sd_material($pdo, $S1);
check('material 1 item', count($mat['items']) === 1);
check('material covered', $mat['covered'] === 1 && $mat['short'] === 0);
check('material availability_source reservation', $mat['availability_source'] === 'spare_parts.stock_qty - spare_part_reservations');
sd_part_save($pdo, $UID, ['shutdown_id' => $S1, 'spare_part_id' => $PART, 'planned_qty' => 20]);
$mat2 = sd_material($pdo, $S1);
check('material short', $mat2['short'] === 1 && $mat2['items'][0]['gap'] === 10.0, json_encode($mat2['items'][0]['gap'] ?? null));
check('material no on-order', $mat2['on_order_available'] === false);
check('part reserve unavailable without Phase 33', (sd_part_reserve($pdo, $UID, ['shutdown_id' => $S1, 'spare_part_id' => $PART, 'qty' => 1])['error'] ?? '') === 'UNAVAILABLE');
$pp = $pdo->query("SELECT id FROM sd_planned_parts WHERE shutdown_id=$S1")->fetchColumn();
check('part delete ok', (sd_part_delete($pdo, $UID, (int)$pp, 'cancelled')['deleted'] ?? false) === true);

/* ================================================================= 12. cost */
echo "\n[12] cost\n";
$cost = sd_cost_summary($pdo, $S1);
check('cost available', ($cost['available'] ?? false) === true);
check('cost work_order_count 1', $cost['work_order_count'] === 1);
check('cost parts 1000', (float)$cost['parts_cost'] === 1000.0, (string)$cost['parts_cost']);
check('cost outsource 200', (float)$cost['outsource_cost'] === 200.0);
check('labor money withheld by default', $cost['labor_cost'] === null && $cost['total_cost'] === null);
check('labor money flag false', $cost['labor_money_shown'] === false);
sd_config_override(['report_labor_money' => '1']);
$cost2 = sd_cost_summary($pdo, $S1);
check('labor money shown when enabled', $cost2['labor_money_shown'] === true && $cost2['labor_cost'] !== null);
check('total cost = labor+parts+outsource', $cost2['total_cost'] === round((float)$cost2['labor_cost'] + 1000.0 + 200.0, 2));
sd_config_reset();
$noRepair = sd_create($pdo, $UID, ['title' => 'no wo']);
check('cost unavailable without WO', (sd_cost_summary($pdo, (int)$noRepair['id'])['available'] ?? true) === false);

/* ================================================================= 13. startup LOTO */
echo "\n[13] startup LOTO interlock\n";
$s3 = sd_create($pdo, $UID, ['title' => 'LOTO test']);
$S3 = (int)$s3['id'];
sd_asset_save($pdo, $UID, ['shutdown_id' => $S3, 'asset_id' => $ASSET2, 'isolation_required' => 1]);
$su1 = sd_startup_evaluate($pdo, $S3);
check('startup not ready (never isolated)', $su1['ready'] === false && $su1['loto_total_live'] === 0);
check('startup code loto_not_applied', $su1['checks'][0]['reason_code'] === 'loto_not_applied', $su1['checks'][0]['reason_code']);
check('startup LOTO row not waivable', $su1['checks'][0]['is_waivable'] === false);

// live lock -> blocks as LOTO_ACTIVE
$pdo->prepare('INSERT INTO work_permits (permit_no, asset_id, status, valid_until) VALUES (?,?,?,?)')
    ->execute(['PTW-1', $ASSET2, 'active', date('Y-m-d H:i:s', strtotime('+1 day'))]);
$PERMIT = (int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO permit_loto_points (permit_id, seq, point_label, status) VALUES (?,1,?, 'locked')")
    ->execute([$PERMIT, 'Main breaker']);
$su2 = sd_startup_evaluate($pdo, $S3);
check('startup live count 1', $su2['loto_total_live'] === 1);
check('startup code loto_active', $su2['checks'][0]['reason_code'] === 'loto_active', $su2['checks'][0]['reason_code']);

// released with authoriser -> evidence
$pdo->exec("UPDATE permit_loto_points SET status='removed', removed_by=$UID, removed_at=NOW(), removal_authorized_by=$UID WHERE permit_id=$PERMIT");
$su3 = sd_startup_evaluate($pdo, $S3);
check('startup ready after authorised release', $su3['ready'] === true && $su3['blocking'] === 0);
check('startup code loto_released', $su3['checks'][0]['reason_code'] === 'loto_released', $su3['checks'][0]['reason_code']);

// startup refresh persists sheet + lifecycle row
$srf = sd_startup_refresh($pdo, $UID, $S3);
check('startup refresh ok', ($srf['available'] ?? false) === true);
$sheet = sd_startup_sheet($pdo, $S3);
check('startup sheet stores lifecycle row', (function () use ($sheet) {
    foreach ($sheet['stored_checks'] as $c) if ($c['check_key'] === 'lifecycle') return true;
    return false;
})());
check('startup LOTO stored row not waivable', $sheet['loto_row_waivable'] === false);
$lotoRow = null;
foreach ($sheet['stored_checks'] as $c) if ($c['check_key'] === 'loto_clear') { $lotoRow = $c; break; }
check('startup waive LOTO forbidden', (sd_startup_waive($pdo, $UID, (int)$lotoRow['id'], 'a long enough reason', 'x')['error'] ?? '') === 'WAIVE_FORBIDDEN');

/* ================================================================= 14. full lifecycle on S1 */
echo "\n[14] full lifecycle S1 reach completed\n";
// S1 currently planning. scopes: SC1 done, SC2 planned. Need all scopes closed and no live loto/blocking assets for startup.
// Remove the isolation asset added in section 8 so startup cannot be blocked.
$isoRow = $pdo->query("SELECT sa.id FROM sd_assets sa WHERE sa.shutdown_id=$S1 AND sa.asset_id=$ASSET2")->fetchColumn();
if ($isoRow) sd_asset_delete($pdo, $UID, (int)$isoRow, 'no isolation needed');
sd_scope_status($pdo, $UID, $SC2, 'ready', 'go');
sd_scope_status($pdo, $UID, $SC2, 'in_progress', 'go');
sd_scope_status($pdo, $UID, $SC2, 'done', 'fin');

// re-establish a dependency (deleted in section 9) so the critical-path gate is satisfiable
sd_dependency_save($pdo, $UID, ['shutdown_id' => $S1, 'predecessor_scope_id' => $SC1, 'successor_scope_id' => $SC2, 'dep_type' => 'SS']);
sd_readiness_refresh($pdo, $UID, $S1);
$t1 = sd_transition($pdo, $UID, $S1, 'scope_freeze');
check('planning->scope_freeze ok', ($t1['status'] ?? '') === 'scope_freeze', json_encode($t1));
$t2 = sd_transition($pdo, $UID, $S1, 'ready');
check('scope_freeze->ready ok', ($t2['status'] ?? '') === 'ready', json_encode($t2));
$t3 = sd_transition($pdo, $UID, $S1, 'execution');
check('ready->execution ok', ($t3['status'] ?? '') === 'execution');
check('execution sets actual_start_at', !empty(sd_get($pdo, $S1)['actual_start_at']));
$t4 = sd_transition($pdo, $UID, $S1, 'startup');
check('execution->startup ok', ($t4['status'] ?? '') === 'startup', json_encode($t4));
$t5 = sd_transition($pdo, $UID, $S1, 'closeout');
check('startup->closeout ok', ($t5['status'] ?? '') === 'closeout', json_encode($t5));
check('completed bad outcome', (sd_transition($pdo, $UID, $S1, 'completed', ['closeout_outcome' => 'weird'])['error'] ?? '') === 'VALIDATION_ERROR');
check('completed negative downtime', (sd_transition($pdo, $UID, $S1, 'completed', ['downtime_minutes' => -5])['error'] ?? '') === 'VALIDATION_ERROR');
$t6 = sd_transition($pdo, $UID, $S1, 'completed', ['closeout_outcome' => 'completed', 'downtime_minutes' => 120, 'lessons' => 'ok']);
check('closeout->completed ok', ($t6['status'] ?? '') === 'completed', json_encode($t6));
check('completed sets actual_end_at', !empty(sd_get($pdo, $S1)['actual_end_at']));
check('completed is terminal', (sd_transition($pdo, $UID, $S1, 'planning')['error'] ?? '') === 'INVALID_TRANSITION');
check('update completed blocked', (sd_update($pdo, $UID, $S1, ['title' => 'x'])['error'] ?? '') === 'STATE');

// closeout gate on a shutdown with open scopes
$s4 = sd_create($pdo, $UID, ['title' => 'closeout gate']);
$S4 = (int)$s4['id'];
sd_scope_save($pdo, $UID, ['shutdown_id' => $S4, 'title' => 'open', 'estimate_hours' => 2]);
sd_transition($pdo, $UID, $S4, 'planning');
sd_transition($pdo, $UID, $S4, 'scope_freeze');
$pdo->prepare("UPDATE sd_shutdowns SET status='startup' WHERE id=$S4")->execute();
check('closeout gate SCOPE_OPEN', (sd_transition($pdo, $UID, $S4, 'closeout')['error'] ?? '') === 'SCOPE_OPEN');

/* ================================================================= 15. cancel + dashboard/options/detail */
echo "\n[15] cancel / dashboard / options / detail\n";
check('cancel S2 ok', (sd_transition($pdo, $UID, $S2, 'cancelled', ['reason' => 'not needed'])['status'] ?? '') === 'cancelled');
$list = sd_list($pdo, ['status' => 'cancelled']);
check('sd_list filter status', count($list) === 1 && $list[0]['status'] === 'cancelled');
check('sd_list has status_label', $list[0]['status_label'] === sd_status_labels()['cancelled']);
check('sd_list has progress', array_key_exists('progress', $list[0]) && array_key_exists('pct', $list[0]['progress']) && $list[0]['progress']['scope_count'] === 0);
check('sd_list q filter', count(sd_list($pdo, ['q' => 'Annual Pump'])) >= 1);
check('sd_list risk filter', count(sd_list($pdo, ['risk_level' => 'high'])) >= 1);

$dash = sd_dashboard($pdo);
check('dashboard total >= 6', $dash['total'] >= 6, (string)$dash['total']);
check('dashboard by_status has completed', ($dash['by_status']['completed'] ?? 0) >= 1);
check('dashboard active_count int', is_int($dash['active_count']));
check('dashboard loto_live_permits 0', $dash['loto_live_permits'] === 0);

$opts = sd_options();
check('options statuses 9', count($opts['statuses']) === 9);
check('options dep_types 4', count($opts['dep_types']) === 4);
check('options permission_module shutdown', $opts['permission_module'] === 'shutdown');
check('options offline_forbidden has startup_gate', in_array('startup_gate', $opts['offline_forbidden'], true));

$detail = sd_detail($pdo, $S1);
check('detail status completed', $detail['status'] === 'completed');
check('detail has critical_path', isset($detail['critical_path']['status']));
check('detail has readiness', isset($detail['readiness']['checks']));
check('detail has assets', isset($detail['assets']));
check('detail has cost', isset($detail['cost']['available']));
check('detail allowed_transitions empty (completed)', $detail['allowed_transitions'] === []);
check('detail missing -> []', sd_detail($pdo, 999999) === []);
$detailShallow = sd_detail($pdo, $S1, false);
check('detail shallow omits scopes', !isset($detailShallow['scopes']));

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
