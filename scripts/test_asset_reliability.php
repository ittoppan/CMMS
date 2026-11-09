<?php
/**
 * scripts/test_asset_reliability.php — behavioral harness for the Phase 28
 * Asset Reliability & Lifecycle engine (src/helpers/asset_reliability.php).
 *
 * Builds a THROWAWAY database = live DB name + "_artest" (structure cloned from
 * live, NO rows), seeds fixtures, and exercises the engine end-to-end.
 *
 *   php scripts/test_asset_reliability.php [--keep]
 *
 * A child process (`--child`) runs the same file in a fresh PHP process to test
 * the config-override path (ar_config() caches statically per process).
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);
$IS_CHILD = in_array('--child', $argv ?? [], true);

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
$scratch = $live . '_artest';

if (!str_ends_with($scratch, '_artest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx(float $a, float $b, float $tol = 0.01): bool { return abs($a - $b) < $tol; }

/** api_fail() throws in the real API layer (JSON + exit). We mirror it as an exception. */
class ArApiFail extends \RuntimeException {
    public int $http;
    public string $errCode;
    public function __construct(int $http, string $code, string $message = '') {
        parent::__construct($code . ($message !== '' ? ": $message" : ''), $http);
        $this->http = $http; $this->errCode = $code;
    }
}
if (!function_exists('api_fail')) {
    function api_fail(int $status, string $code, string $message = ''): void { throw new ArApiFail($status, $code, $message); }
}
if (!function_exists('apiIsSecretKey')) {
    function apiIsSecretKey($k): bool { return false; } // let audit_log actually persist
}
function throws_code(string $label, string $code, callable $fn): void {
    try { $fn(); check($label, false, 'no exception thrown'); }
    catch (ArApiFail $e) { check($label, $e->errCode === $code, 'got ' . $e->errCode); }
    catch (\Throwable $e) { check($label, false, get_class($e) . ': ' . $e->getMessage()); }
}
function throws_any(string $label, callable $fn): void {
    try { $fn(); check($label, false, 'no exception thrown'); }
    catch (ArApiFail $e) { check($label, true, $e->errCode); }
    catch (\Throwable $e) { check($label, false, get_class($e) . ': ' . $e->getMessage()); }
}

/* ---------------------------------------------------------------- child mode */
if ($IS_CHILD) {
    foreach (['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_CHARSET'] as $k) {
        $v = getenv($k);
        if ($v !== false && $v !== '') $_ENV[$k] = $v;
    }
    require_once __DIR__ . '/../src/config/db.php';
    require_once __DIR__ . '/../src/helpers/audit.php';
    require_once __DIR__ . '/../src/helpers/asset_reliability.php';
    $pdo = getDb();
    $cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($cur !== $scratch) { fwrite(STDERR, "CHILD GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    $ovr = [
        'ar_min_failures_for_mtbf' => '3',
        'ar_criticality_auto_apply' => '0',
        'ar_criticality_threshold_a' => '90',
        'ar_criticality_review_days' => '180',
        'ar_retirement_min_age_years' => '5',
        'ar_replacement_review_notes' => '0',
    ];
    $ins = $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?,?, 'ar') ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    foreach ($ovr as $k => $v) $ins->execute([$k, $v]);

    $cfg = ar_config($pdo);
    check('child override min_failures 3', (int)$cfg['ar_min_failures_for_mtbf'] === 3, (string)$cfg['ar_min_failures_for_mtbf']);
    check('child override auto_apply false', $cfg['ar_criticality_auto_apply'] === false);
    check('child override threshold_a 90.0', (float)$cfg['ar_criticality_threshold_a'] === 90.0);
    check('child override review_days 180', (int)$cfg['ar_criticality_review_days'] === 180);
    check('child override retirement 5', (int)$cfg['ar_retirement_min_age_years'] === 5);
    check('child override replacement_notes false', $cfg['ar_replacement_review_notes'] === false);

    $ACTIVE = (int)$pdo->query("SELECT id FROM asset_registry WHERE code = 'AR-ACTIVE'")->fetchColumn();
    $UID = 9001;
    $a1 = ar_criticality_assess($pdo, $ACTIVE, ['factors' => []], $UID);
    check('child auto_apply off -> not applied', ($a1['applied'] ?? null) === false, json_encode($a1['applied'] ?? null));
    $row = $pdo->query("SELECT criticality FROM asset_registry WHERE id = $ACTIVE")->fetchColumn();
    check('child asset criticality unchanged', $row === 'A', (string)$row);
    $a2 = ar_criticality_assess($pdo, $ACTIVE, ['factors' => [], 'apply' => 1], $UID);
    check('child explicit apply -> applied', ($a2['applied'] ?? null) === true);

    echo "\nCHILDSUM PASS $pass_count FAIL $fail_count\n";
    exit($fail_count ? 1 : 0);
}

/* ---------------------------------------------------------------- clone schema */
$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Asset-reliability harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
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
require_once __DIR__ . '/../src/helpers/asset_reliability.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* keep LINE/Telegram silent in the harness (no network) */
$pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group) VALUES ('line_notify_enabled','0','harness')")->execute();

$UID = 9001;

/* ------------------------------------------------------------------ fixtures */
$pdo->prepare('INSERT INTO departments (code, name) VALUES (?, ?)')->execute(['MAINT', 'Maintenance']);
$DEPT = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO locations (code, name) VALUES (?, ?)')->execute(['WH-1', 'Warehouse 1']);
$LOC = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO users (username, email, password, full_name, role_id, is_active) VALUES (?,?,?,?,?,1)')
    ->execute(['harness_ar', 'harness_ar@example.test', 'x', 'Harness Admin', 3]);
$USER = (int)$pdo->lastInsertId();

function mk_asset(PDO $pdo, string $code, array $o = []): int {
    $cols = array_merge([
        'code' => $code, 'name' => $o['name'] ?? $code, 'category' => $o['category'] ?? 'rotating',
        'status' => $o['status'] ?? 'active', 'criticality' => $o['criticality'] ?? 'C',
        'lifecycle_status' => $o['lifecycle_status'] ?? 'operating',
        'department_id' => $o['department_id'] ?? null, 'location_id' => $o['location_id'] ?? null,
        'department' => $o['department'] ?? null, 'location' => $o['location'] ?? null,
        'commission_date' => $o['commission_date'] ?? null, 'installation_date' => $o['installation_date'] ?? null,
        'purchase_date' => $o['purchase_date'] ?? null, 'expected_life_months' => $o['expected_life_months'] ?? null,
        'running_hours_month' => $o['running_hours_month'] ?? 0, 'purchase_cost' => $o['purchase_cost'] ?? null,
        'installation_cost' => $o['installation_cost'] ?? null,
    ]);
    $k = array_keys($cols);
    $sql = 'INSERT INTO asset_registry (`' . implode('`,`', $k) . '`) VALUES (' . implode(',', array_fill(0, count($k), '?')) . ')';
    $pdo->prepare($sql)->execute(array_values($cols));
    return (int)$pdo->lastInsertId();
}

$A_ACTIVE = mk_asset($pdo, 'AR-ACTIVE', ['name' => 'Feed Pump', 'criticality' => 'B', 'department_id' => $DEPT, 'location_id' => $LOC, 'department' => 'Production', 'location' => 'Line A', 'commission_date' => date('Y-m-d', time() - 1096 * 86400), 'expected_life_months' => 120, 'running_hours_month' => 720, 'purchase_cost' => 100000, 'installation_cost' => 20000]);
$A_NEW = mk_asset($pdo, 'AR-NEW', ['name' => 'New Compressor', 'lifecycle_status' => 'planned']);
$A_FALLBACK = mk_asset($pdo, 'AR-FALL', ['name' => 'Fallback Motor', 'running_hours_month' => 600]);
$A_ONE = mk_asset($pdo, 'AR-ONE', ['name' => 'One Failure']);
$A_ZERO = mk_asset($pdo, 'AR-ZERO', ['name' => 'No Failure']);
$A_NOOP = mk_asset($pdo, 'AR-NOOP', ['name' => 'No Operating Hours']);
$A_OLD = mk_asset($pdo, 'AR-OLD', ['name' => 'Old Machine', 'commission_date' => date('Y-m-d', time() - 5480 * 86400), 'expected_life_months' => 120]);
$A_CRIT = mk_asset($pdo, 'AR-CRIT', ['name' => 'Criticality Test']);
$A_DISPOSED = mk_asset($pdo, 'AR-GONE', ['name' => 'Disposed', 'status' => 'disposed']);

function add_repair(PDO $pdo, int $assetId, string $sourceType, string $status, int $downtime, ?int $repairTime, float $parts, float $labor, float $out): int {
    $pdo->prepare('INSERT INTO repair (asset_id, title, source_type, status, downtime_minutes, repair_time_minutes,
                        cost_parts, cost_labor, cost_outsource, completed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([$assetId, 'WO ' . $sourceType, $sourceType, $status, $downtime, $repairTime, $parts, $labor, $out]);
    return (int)$pdo->lastInsertId();
}

// A_ACTIVE: 3 breakdown (downtime 300, cost 3*1700) + 1 pm (cost 0)
add_repair($pdo, $A_ACTIVE, 'breakdown', 'completed', 120, 90, 1000, 500, 200);
add_repair($pdo, $A_ACTIVE, 'breakdown', 'completed', 60, 30, 1000, 500, 200);
add_repair($pdo, $A_ACTIVE, 'breakdown', 'completed', 120, 60, 1000, 500, 200);
add_repair($pdo, $A_ACTIVE, 'pm', 'completed', 0, 0, 0, 0, 0);

// production hours for A_ACTIVE -> 3000 h
for ($i = 0; $i < 3; $i++) {
    $pdo->prepare('INSERT INTO production_hours (asset_id, record_date, hours) VALUES (?,?,?)')
        ->execute([$A_ACTIVE, date('Y-m-d', strtotime("-$i months")), 1000]);
}

// A_FALLBACK: 2 breakdown, no production_hours -> running_hours_month 600
add_repair($pdo, $A_FALLBACK, 'breakdown', 'completed', 30, 20, 100, 0, 0);
add_repair($pdo, $A_FALLBACK, 'breakdown', 'completed', 30, 20, 100, 0, 0);

add_repair($pdo, $A_ONE, 'breakdown', 'completed', 60, 30, 100, 0, 0);
add_repair($pdo, $A_ONE, 'breakdown', 'rejected', 999, 999, 9999, 9999, 9999); // excluded from reliability
for ($i = 0; $i < 3; $i++) add_repair($pdo, $A_NOOP, 'breakdown', 'completed', 10, 5, 0, 0, 0);

// pm_am rows for A_ACTIVE: 2 completed + 1 overdue pending
$pdo->prepare('INSERT INTO pm_am (asset_id, title, status, due_date, completed_at) VALUES (?,?,?,?,NOW())')->execute([$A_ACTIVE, 'PM 1', 'completed', date('Y-m-d', strtotime('-30 days'))]);
$pdo->prepare('INSERT INTO pm_am (asset_id, title, status, due_date, completed_at) VALUES (?,?,?,?,NOW())')->execute([$A_ACTIVE, 'PM 2', 'completed', date('Y-m-d', strtotime('-10 days'))]);
$pdo->prepare('INSERT INTO pm_am (asset_id, title, status, due_date) VALUES (?,?,?,?)')->execute([$A_ACTIVE, 'PM 3', 'pending', date('Y-m-d', strtotime('-1 day'))]);

/* ================================================================= 1. constants + pure */
echo "\n[1] constants + pure helpers\n";
check('lifecycle statuses count 9', count(AR_LIFECYCLE_STATUSES) === 9);
check('lifecycle labels count 9', count(AR_LIFECYCLE_LABELS) === 9);
$tr = ar_lifecycle_transitions();
check('disposed -> []', $tr['disposed'] === []);
check('planned includes procurement', in_array('procurement', $tr['planned'], true));
check('operating -> under_maintenance/overhauled/retired', $tr['operating'] === ['under_maintenance', 'overhauled', 'retired']);
$fd = ar_criticality_factor_defaults();
check('factor defaults count 7', count($fd) === 7);
check('factor production weight key', $fd['production']['weight'] === 'ar_criticality_w_production');
check('factor safety max_score 4', $fd['safety']['max_score'] === 4);

$base = date('Y-m-d', time() - 1096 * 86400);
check('age from commission_date ~3', approx((float)ar_asset_age_years(['commission_date' => $base]), round(1096 / 365.25, 2)));
check('age prefers commission over installation', approx((float)ar_asset_age_years(['commission_date' => $base, 'installation_date' => date('Y-m-d', time() - 1826 * 86400)]), round(1096 / 365.25, 2)));
check('age skips 0000-00-00', approx((float)ar_asset_age_years(['commission_date' => '0000-00-00', 'purchase_date' => $base]), round(1096 / 365.25, 2)));
check('age null when no date', ar_asset_age_years(['code' => 'X']) === null);
$eRem = round(((strtotime($base) + 120 * 30.44 * 86400) - time()) / 86400 / 365.25, 2);
check('remaining life ~7y', approx((float)ar_remaining_life_years(['commission_date' => $base, 'expected_life_months' => 120]), $eRem));
check('remaining life null without expected_life', ar_remaining_life_years(['commission_date' => $base]) === null);
check('remaining life null without date', ar_remaining_life_years(['expected_life_months' => 120]) === null);

/* ================================================================= 2. config defaults */
echo "\n[2] config defaults\n";
$CFG = ar_config($pdo);
check('default weights sum 100', (float)$CFG['ar_criticality_w_production'] + (float)$CFG['ar_criticality_w_safety'] + (float)$CFG['ar_criticality_w_quality'] + (float)$CFG['ar_criticality_w_cost'] + (float)$CFG['ar_criticality_w_downtime'] + (float)$CFG['ar_criticality_w_frequency'] + (float)$CFG['ar_criticality_w_redundancy'] === 100.0);
check('default threshold_a 80.0', (float)$CFG['ar_criticality_threshold_a'] === 80.0);
check('default min_failures 2', (int)$CFG['ar_min_failures_for_mtbf'] === 2);
check('default review_days 365', (int)$CFG['ar_criticality_review_days'] === 365);
check('default retirement_min_age 10', (int)$CFG['ar_retirement_min_age_years'] === 10);
check('default auto_apply true', $CFG['ar_criticality_auto_apply'] === true);
check('default replacement_review_notes true', $CFG['ar_replacement_review_notes'] === true);
check('reliability window clamped >=1', (int)$CFG['ar_reliability_window_months'] >= 1);

/* ================================================================= 3. criticality score */
echo "\n[3] ar_criticality_score\n";
$s = ar_criticality_score(['production' => 4, 'safety' => 4, 'downtime' => 4, 'frequency' => 4, 'redundancy' => 4], $CFG);
check('all-high -> 80 A', $s['score'] === 80.0 && $s['level'] === 'A', json_encode($s));
$s = ar_criticality_score(['safety' => 4, 'downtime' => 4, 'frequency' => 4, 'redundancy' => 4], $CFG);
check('70 -> B', $s['score'] === 70.0 && $s['level'] === 'B', json_encode($s));
$s = ar_criticality_score(['safety' => 4, 'downtime' => 4, 'frequency' => 4], $CFG);
check('55 -> C', $s['score'] === 55.0 && $s['level'] === 'C', json_encode($s));
$s = ar_criticality_score(['production' => 4, 'quality' => 4, 'cost' => 4], $CFG);
check('30 -> D', $s['score'] === 30.0 && $s['level'] === 'D', json_encode($s));
$s = ar_criticality_score(['production' => 99], $CFG);
check('raw clamped to max_score', (float)$s['detail']['production']['score'] === 4.0 && $s['score'] === 10.0, json_encode($s));
$s = ar_criticality_score(['production' => -5], $CFG);
check('negative clamped to 0', (float)$s['detail']['production']['score'] === 0.0 && $s['score'] === 0.0);
check('empty factors -> 0/D', ar_criticality_score([], $CFG)['level'] === 'D');

/* ================================================================= 4. lifecycle */
echo "\n[4] lifecycle change\n";
throws_code('invalid status rejected', 'INVALID_STATUS', fn() => ar_lifecycle_change($pdo, $A_NEW, 'zzz', $UID, 'proper reason'));
throws_code('dead transition target cancelled rejected', 'INVALID_STATUS', fn() => ar_lifecycle_change($pdo, $A_NEW, 'cancelled', $UID, 'proper reason'));
throws_code('reason required', 'REASON_REQUIRED', fn() => ar_lifecycle_change($pdo, $A_NEW, 'procurement', $UID, 'x'));
throws_code('missing asset', 'NOT_FOUND', fn() => ar_lifecycle_change($pdo, 999999, 'procurement', $UID, 'proper reason'));
$r1 = ar_lifecycle_change($pdo, $A_NEW, 'procurement', $UID, 'start procurement');
check('change planned->procurement ok', ($r1['from'] ?? '') === 'planned' && ($r1['to'] ?? '') === 'procurement', json_encode($r1));
throws_code('invalid transition installed->retired', 'INVALID_TRANSITION', fn() => ar_lifecycle_change($pdo, $A_NEW, 'retired', $UID, 'proper reason'));
$r2 = ar_lifecycle_change($pdo, $A_NEW, 'installed', $UID, 'delivered');
check('change procurement->installed ok', ($r2['to'] ?? '') === 'installed', json_encode($r2));
$asset = ar_asset($pdo, $A_NEW);
check('asset lifecycle updated', $asset['lifecycle_status'] === 'installed');
check('asset lifecycle_changed_at set', !empty($asset['lifecycle_status_changed_at']));
$hist = ar_lifecycle_history($pdo, $A_NEW);
check('history has 2 rows', count($hist) === 2, (string)count($hist));
check('history newest first (installed)', $hist[0]['to_status'] === 'installed');
check('history row has from_status', $hist[0]['from_status'] === 'procurement');

/* ================================================================= 5. criticality assess/history/due */
echo "\n[5] criticality assess / history / due\n";
throws_code('assess missing asset', 'NOT_FOUND', fn() => ar_criticality_assess($pdo, 999999, [], $UID));
$as1 = ar_criticality_assess($pdo, $A_ACTIVE, ['factors' => ['production' => 4, 'safety' => 4, 'downtime' => 4, 'frequency' => 4, 'redundancy' => 4]], $UID);
check('assess v1 score 80 level A applied', ($as1['version'] ?? 0) === 1 && $as1['score'] === 80.0 && $as1['level'] === 'A' && ($as1['applied'] ?? null) === true, json_encode($as1));
$row = $pdo->query("SELECT criticality, criticality_score, next_criticality_review_date FROM asset_registry WHERE id = $A_ACTIVE")->fetch();
check('asset criticality applied = A', $row['criticality'] === 'A');
check('asset criticality_score = 80.00', (float)$row['criticality_score'] === 80.0);
check('next review ~ +365d', $row['next_criticality_review_date'] === date('Y-m-d', time() + 365 * 86400), (string)$row['next_criticality_review_date']);
$h1 = ar_criticality_history($pdo, $A_ACTIVE);
check('history 1 row is_current', count($h1) === 1 && (int)$h1[0]['is_current'] === 1);
$as2 = ar_criticality_assess($pdo, $A_CRIT, ['factors' => []], $UID);
check('assess all-zero -> score 0 D', $as2['score'] === 0.0 && $as2['level'] === 'D');
$as3 = ar_criticality_assess($pdo, $A_CRIT, ['factors' => ['production' => 4]], $UID);
check('assess version increments', ($as3['version'] ?? 0) === 2);
$h2 = ar_criticality_history($pdo, $A_CRIT);
check('history 2 rows', count($h2) === 2);
check('latest is_current, older not', (int)$h2[0]['is_current'] === 1 && (int)$h2[1]['is_current'] === 0);
$due = ar_criticality_due($pdo, ['next_criticality_review_date' => date('Y-m-d', strtotime('-5 days'))]);
check('due when review in past', $due['due'] === true && $due['days_overdue'] >= 5, json_encode($due));
$due = ar_criticality_due($pdo, ['next_criticality_review_date' => date('Y-m-d', strtotime('+30 days'))]);
check('not due when review in future', $due['due'] === false && $due['days_overdue'] === 0);
$due = ar_criticality_due($pdo, ['criticality_reviewed_at' => date('Y-m-d H:i:s', strtotime('-400 days'))]);
check('due via reviewed_at + review_days', $due['due'] === true, json_encode($due));
check('no data -> not due', ar_criticality_due($pdo, [])['due'] === false);

/* ================================================================= 6. reliability */
echo "\n[6] ar_reliability_asset\n";
$rel = ar_reliability_asset($pdo, $A_ACTIVE);
check('A_ACTIVE OK', $rel['status'] === 'OK', json_encode($rel));
check('A_ACTIVE failures 3', $rel['failures'] === 3);
check('A_ACTIVE downtime 300', $rel['downtime_minutes'] === 300);
check('A_ACTIVE operating_hours 3000', approx((float)$rel['operating_hours'], 3000.0));
check('A_ACTIVE MTBF 1000', approx((float)$rel['mtbf_hours'], 1000.0));
check('A_ACTIVE MTTR 100', approx((float)$rel['mttr_minutes'], 100.0));
check('A_ACTIVE availability 99.83', approx((float)$rel['availability_pct'], 99.83));
check('A_ACTIVE note production_hours', $rel['operating_hours_note'] === 'production_hours');
$rel = ar_reliability_asset($pdo, $A_FALLBACK);
check('A_FALLBACK OK via running_hours_month', $rel['status'] === 'OK' && approx((float)$rel['mtbf_hours'], 3600.0), json_encode($rel));
check('A_FALLBACK note mentions running_hours_month', str_contains((string)$rel['operating_hours_note'], 'running_hours_month'));
check('A_FALLBACK MTTR 30', approx((float)$rel['mttr_minutes'], 30.0));
$rel = ar_reliability_asset($pdo, $A_ONE);
check('A_ONE INSUFFICIENT_DATA (below min)', $rel['status'] === 'INSUFFICIENT_DATA' && $rel['failures'] === 1, json_encode($rel));
$oneBreakdownRows = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE asset_id = $A_ONE AND source_type = 'breakdown'")->fetchColumn();
check('rejected breakdown excluded from failure count', $oneBreakdownRows === 2 && $rel['failures'] === 1, "rows=$oneBreakdownRows");
$rel = ar_reliability_asset($pdo, $A_ZERO);
check('A_ZERO INSUFFICIENT_DATA (no WO)', $rel['status'] === 'INSUFFICIENT_DATA' && str_contains((string)$rel['note'], 'ไม่มีใบงาน'), json_encode($rel));
$rel = ar_reliability_asset($pdo, $A_NOOP);
check('A_NOOP INSUFFICIENT_DATA (no hours)', $rel['status'] === 'INSUFFICIENT_DATA', json_encode($rel));
check('requirements min_failures reported', (int)$rel['requirements']['min_failures'] === 2);

/* ================================================================= 7. trend + maintenance + cost */
echo "\n[7] trend / maintenance burden / cost\n";
$trend = ar_trend_asset($pdo, $A_ACTIVE, 12);
check('trend returns 12 buckets', count($trend) === 12, (string)count($trend));
$curYm = date('Y-m');
$bucket = null;
foreach ($trend as $b) if ($b['ym'] === $curYm) $bucket = $b;
check('current month present', $bucket !== null);
check('trend failures 3', $bucket !== null && $bucket['failures'] === 3);
check('trend downtime 300', $bucket !== null && $bucket['downtime_minutes'] === 300);
check('trend wos 4 (3 breakdown + 1 pm)', $bucket !== null && $bucket['wos'] === 4, $bucket !== null ? (string)$bucket['wos'] : '');
check('trend cost 5100', $bucket !== null && approx((float)$bucket['cost'], 5100.0), $bucket !== null ? (string)$bucket['cost'] : '');

$mb = ar_maintenance_burden($pdo, $A_ACTIVE);
check('burden wos_total 4', $mb['wos_total'] === 4);
check('burden wos_breakdown 3', $mb['wos_breakdown'] === 3);
check('burden wos_pm 1', $mb['wos_pm'] === 1);
check('burden wos_done 4', $mb['wos_done'] === 4);
check('burden downtime 300', $mb['downtime_minutes_12m'] === 300);
check('pm_total 3', $mb['pm_total'] === 3);
check('pm_done 2', $mb['pm_done'] === 2);
check('pm_overdue 1', $mb['pm_overdue'] === 1);
check('pm compliance 66.7', approx((float)$mb['pm_compliance_pct'], 66.7, 0.05), (string)$mb['pm_compliance_pct']);

$cost = ar_cost_asset($pdo, $A_ACTIVE);
check('cost wos 4', $cost['wos'] === 4, (string)$cost['wos']);
check('cost breakdown_wos 3', $cost['breakdown_wos'] === 3);
check('cost total 5100', approx((float)$cost['total_cost'], 5100.0), (string)$cost['total_cost']);
check('cost parts 3000', approx((float)$cost['parts_cost'], 3000.0));
check('cost labor 1500', approx((float)$cost['labor_cost'], 1500.0));
check('cost outsource 600', approx((float)$cost['outsource_cost'], 600.0));
check('cost_per_year > 0', $cost['cost_per_year'] !== null && $cost['cost_per_year'] > 0);

/* ================================================================= 8. data quality */
echo "\n[8] data quality\n";
$dq = ar_data_quality_asset($pdo, $A_ACTIVE);
check('dq score 100', approx((float)$dq['score'], 100.0), json_encode($dq));
check('dq 6 checks', count($dq['checks']) === 6);
check('dq has_data true', $dq['has_data'] === true);
check('dq empty asset false', ar_data_quality_asset($pdo, 999999)['has_data'] === false);

/* ================================================================= 9. relationships */
echo "\n[9] relationships\n";
throws_code('rel missing target', 'NOT_FOUND', fn() => ar_relationship_add($pdo, $A_ACTIVE, ['related_asset_id' => 999999], $UID));
throws_code('rel self reference', 'SELF_REFERENCE', fn() => ar_relationship_add($pdo, $A_ACTIVE, ['related_asset_id' => $A_ACTIVE], $UID));
$radd = ar_relationship_add($pdo, $A_ACTIVE, ['related_asset_id' => $A_NEW, 'relation_type' => 'connected'], $UID);
check('rel add ok', ($radd['success'] ?? false) === true, json_encode($radd));
throws_code('rel duplicate', 'DUPLICATE', fn() => ar_relationship_add($pdo, $A_ACTIVE, ['related_asset_id' => $A_NEW, 'relation_type' => 'connected'], $UID));
$rels = ar_relationships($pdo, $A_NEW);
check('rel visible from both sides', count($rels) === 1 && (int)$rels[0]['asset_id'] === $A_ACTIVE, json_encode($rels));
$relId = (int)$rels[0]['id'];
ar_relationship_delete($pdo, $A_ACTIVE, $relId, $UID);
check('rel deleted', count(ar_relationships($pdo, $A_ACTIVE)) === 0);
throws_code('rel delete missing', 'NOT_FOUND', fn() => ar_relationship_delete($pdo, $A_ACTIVE, 999999, $UID));

/* ================================================================= 10. components */
echo "\n[10] components + replacements\n";
throws_code('component missing code', 'REQUIRED', fn() => ar_component_add($pdo, $A_ACTIVE, ['name' => 'X'], $UID));
$cadd = ar_component_add($pdo, $A_ACTIVE, ['component_code' => 'BRG-1', 'name' => 'Bearing 6205', 'serial_number' => 'SN-OLD'], $UID);
$COMP = (int)($cadd['id'] ?? 0);
check('component add ok', $COMP > 0, json_encode($cadd));
throws_code('component duplicate code', 'DUPLICATE', fn() => ar_component_add($pdo, $A_ACTIVE, ['component_code' => 'BRG-1', 'name' => 'Dup'], $UID));
$comps = ar_components($pdo, $A_ACTIVE);
check('components list 1', count($comps) === 1);
check('components replacements 0', (int)$comps[0]['replacements'] === 0);
throws_code('replace reason required', 'REASON_REQUIRED', fn() => ar_component_replace($pdo, $COMP, ['reason' => 'x'], $UID));
$rep = ar_component_replace($pdo, $COMP, ['reason' => 'worn out', 'new_serial' => 'SN-NEW', 'cost' => 250], $UID);
check('component replace ok', ($rep['success'] ?? false) === true, json_encode($rep));
$comps = ar_components($pdo, $A_ACTIVE);
check('components replacements 1', (int)$comps[0]['replacements'] === 1);
check('component status replaced', $comps[0]['status'] === 'replaced');
check('component serial updated', $comps[0]['serial_number'] === 'SN-NEW');
$repl = ar_component_replacements($pdo, $A_ACTIVE);
check('replacements list 1', count($repl) === 1);
check('replacement has component_code', ($repl[0]['component_code'] ?? '') === 'BRG-1');
check('replacement old_serial from component', ($repl[0]['old_serial'] ?? '') === 'SN-OLD');
throws_code('replace missing component', 'NOT_FOUND', fn() => ar_component_replace($pdo, 999999, ['reason' => 'worn'], $UID));
ar_component_delete($pdo, $COMP, $UID);
check('component deleted', count(ar_components($pdo, $A_ACTIVE)) === 0);
check('replacements cascade-deleted', count(ar_component_replacements($pdo, $A_ACTIVE)) === 0);

/* ================================================================= 11. overhauls */
echo "\n[11] overhauls\n";
throws_code('overhaul missing title', 'REQUIRED', fn() => ar_overhaul_create($pdo, $A_ACTIVE, [], $UID));
$oh = ar_overhaul_create($pdo, $A_ACTIVE, ['title' => 'Overhaul 1', 'planned_start' => date('Y-m-d H:i:s')], $UID);
$OH = (int)($oh['id'] ?? 0);
check('overhaul create ok', $OH > 0 && str_starts_with((string)($oh['overhaul_code'] ?? ''), 'OH-'), json_encode($oh));
$oh2 = ar_overhaul_create($pdo, $A_ACTIVE, ['title' => 'Overhaul 2', 'overhaul_code' => 'OH-TEST-1'], $UID);
check('overhaul explicit code used', ($oh2['overhaul_code'] ?? '') === 'OH-TEST-1');
throws_code('overhaul duplicate code', 'DUPLICATE', fn() => ar_overhaul_create($pdo, $A_ACTIVE, ['title' => 'Dup', 'overhaul_code' => 'OH-TEST-1'], $UID));
check('overhauls list 2', count(ar_overhauls($pdo, $A_ACTIVE)) === 2);
$upd = ar_overhaul_update($pdo, $OH, ['status' => 'completed', 'findings' => 'ok'], $UID);
check('overhaul update ok', ($upd['success'] ?? false) === true);
check('overhaul status persisted', $pdo->query("SELECT status FROM asset_overhauls WHERE id = $OH")->fetchColumn() === 'completed');
throws_code('overhaul update missing', 'NOT_FOUND', fn() => ar_overhaul_update($pdo, 999999, ['status' => 'completed'], $UID));
$bad = ar_overhaul_update($pdo, $OH, ['status' => 'bogus'], $UID);
check('overhaul invalid status ignored (no throw)', ($bad['success'] ?? false) === true);
ar_overhaul_delete($pdo, $OH, $UID);
check('overhaul deleted', count(ar_overhauls($pdo, $A_ACTIVE)) === 1);
throws_code('overhaul delete missing', 'NOT_FOUND', fn() => ar_overhaul_delete($pdo, 999999, $UID));

/* ================================================================= 12. measurements */
echo "\n[12] measurements\n";
throws_code('measurement missing parameter', 'REQUIRED', fn() => ar_measurement_add($pdo, $A_ACTIVE, [], $UID));
throws_code('measurement missing numeric', 'REQUIRED', fn() => ar_measurement_add($pdo, $A_ACTIVE, ['parameter' => 'vibration'], $UID));
$m = ar_measurement_add($pdo, $A_ACTIVE, ['parameter' => 'vibration', 'value_numeric' => 3.5, 'unit' => 'mm/s'], $UID);
$M = (int)($m['id'] ?? 0);
check('measurement add ok', $M > 0, json_encode($m));
check('measurements list 1', count(ar_measurements($pdo, $A_ACTIVE)) === 1);
check('measurements filter match', count(ar_measurements($pdo, $A_ACTIVE, ['parameter' => 'vibration'])) === 1);
check('measurements filter no-match', count(ar_measurements($pdo, $A_ACTIVE, ['parameter' => 'temperature'])) === 0);
throws_code('measurement delete missing', 'NOT_FOUND', fn() => ar_measurement_delete($pdo, 999999, $UID));
ar_measurement_delete($pdo, $M, $UID);
check('measurement deleted', count(ar_measurements($pdo, $A_ACTIVE)) === 0);

/* ================================================================= 13. composite */
echo "\n[13] decision support / profile / list / dashboard\n";
$ds = ar_decision_support($pdo, $A_ACTIVE);
check('decision lifeCost 125100', approx((float)$ds['lifecycle_cost']['total'], 125100.0), json_encode($ds['lifecycle_cost']));
check('decision purchase 100000', approx((float)$ds['lifecycle_cost']['purchase_cost'], 100000.0));
check('decision maintenance total 5100', approx((float)$ds['lifecycle_cost']['maintenance_cost_total'], 5100.0));
check('decision disclaimer present', !empty($ds['disclaimer']));
check('decision has reliability+cost+maintenance', isset($ds['reliability'], $ds['cost'], $ds['maintenance']));
throws_code('decision missing asset', 'NOT_FOUND', fn() => ar_decision_support($pdo, 999999));
throws_code('profile missing asset', 'NOT_FOUND', fn() => ar_profile($pdo, 999999));
$prof = ar_profile($pdo, $A_ACTIVE);
check('profile has core keys', isset($prof['asset'], $prof['lifecycle'], $prof['health'], $prof['reliability'], $prof['cost'], $prof['decision_support'], $prof['config'], $prof['generated_at']));
check('profile lifecycle current operating', ($prof['lifecycle']['current'] ?? '') === 'operating');
check('profile transitions map exposed', is_array($prof['lifecycle']['transitions'] ?? null));
$list = ar_asset_list($pdo, []);
$ids = array_map(fn($r) => (int)$r['id'], $list);
check('list includes A_ACTIVE', in_array($A_ACTIVE, $ids, true));
check('list excludes disposed', !in_array($A_DISPOSED, $ids, true));
$one = null; foreach ($list as $r) if ((int)$r['id'] === $A_ACTIVE) $one = $r;
check('list row has display_name', $one !== null && str_contains((string)$one['display_name'], 'AR-ACTIVE'));
check('list row has health+rel', $one !== null && isset($one['health'], $one['rel'], $one['age_years']));
$search = ar_asset_list($pdo, ['search' => 'AR-ACTIVE']);
check('list search filter', count($search) === 1 && (int)$search[0]['id'] === $A_ACTIVE, (string)count($search));
$dash = ar_dashboard_summary($pdo);
$totalActive = (int)$pdo->query("SELECT COUNT(*) FROM asset_registry WHERE status <> 'disposed'")->fetchColumn();
check('dashboard total_assets matches', (int)$dash['total_assets'] === $totalActive, (string)$dash['total_assets'] . '/' . $totalActive);
check('dashboard by_criticality sums to total', array_sum($dash['by_criticality']) === $totalActive);
check('dashboard has fleet reliability key', array_key_exists('fleet_reliability', $dash));
$crit = ar_critical_assets($pdo, 20);
check('critical assets first is A_ACTIVE (score 80)', (int)($crit[0]['id'] ?? 0) === $A_ACTIVE, json_encode(array_map(fn($r) => [$r['code'], $r['criticality_score']], array_slice($crit, 0, 3))));
$aging = ar_aging_assets($pdo, 20);
$agingIds = array_map(fn($r) => (int)$r['id'], $aging);
check('aging includes A_OLD', in_array($A_OLD, $agingIds, true), json_encode($agingIds));
check('aging marks over_min_age', count($aging) > 0 && ($aging[0]['over_min_age'] ?? false) === true);

/* ================================================================= 14. child (config override) */
echo "\n[14] config override (child process)\n";
$php = PHP_BINARY;
$childEnv = [
    'DB_HOST' => $host, 'DB_PORT' => $port, 'DB_USER' => $user, 'DB_PASS' => $pass, 'DB_NAME' => $scratch,
    'PATH' => (string)getenv('PATH'), 'SystemRoot' => (string)getenv('SystemRoot'),
    'TEMP' => (string)getenv('TEMP'), 'TMP' => (string)getenv('TMP'),
];
$childOut = ''; $childErr = '';
$proc = proc_open([$php, __FILE__, '--child'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $childEnv);
if (is_resource($proc)) {
    $childOut = (string)stream_get_contents($pipes[1]);
    $childErr = (string)stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]); proc_close($proc);
}
echo $childOut;
if (trim($childErr) !== '') echo "CHILD STDERR: $childErr\n";
if (preg_match('/CHILDSUM PASS (\d+) FAIL (\d+)/', $childOut, $mm)) {
    $cPass = (int)$mm[1]; $cFail = (int)$mm[2];
    check('child suite ran', $cPass > 0, "pass=$cPass");
    check('child suite 0 failures', $cFail === 0, "fail=$cFail");
} else {
    check('child suite produced summary', false, 'no CHILDSUM line');
}

/* ------------------------------------------------------------------ summary */
echo "\n========================================\n";
echo "PASS $pass_count  FAIL $fail_count\n";
if ($fail_count) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
echo "========================================\n";

if (!$KEEP) {
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count ? 1 : 0);
