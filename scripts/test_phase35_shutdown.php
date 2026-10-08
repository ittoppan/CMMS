<?php
/**
 * scripts/test_phase35_shutdown.php — Phase 35 engine/migration harness.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_sdtest".
 * It clones the live structure (CREATE TABLE ... LIKE, no FK constraints, no rows),
 * runs scripts/apply_phase35_shutdown.php on that copy, then drives the engine through
 * the invariants that matter: lifecycle gates, readiness explainability, baseline
 * immutability, CPM, and the hard-coded LOTO startup interlock.
 *
 *   php scripts/test_phase35_shutdown.php [--keep]
 *
 * SAFETY: the harness refuses to run unless the target database name ends in "_sdtest"
 * and is different from the live DB name, and it verifies SELECT DATABASE() after connecting.
 * Nothing here ever touches the live database.
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

/* ------------------------------------------------------------------ fixtures */
$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

echo "Phase 35 harness on scratch DB: $scratch (live: $live)\n";
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

/* Point db.php at the scratch DB BEFORE it is loaded. */
$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/audit.php';
require_once __DIR__ . '/../src/helpers/roles.php';
require_once __DIR__ . '/../src/helpers/api.php';
require_once __DIR__ . '/../src/helpers/permissions.php';
require_once __DIR__ . '/../src/helpers/cost.php';
require_once __DIR__ . '/../src/helpers/spare_optimization.php';
require_once __DIR__ . '/../src/helpers/workforce.php';
require_once __DIR__ . '/../src/helpers/shutdown.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* Fixtures. Repair / WO tables are left empty on purpose: the tests assert that a scope with
 * no linked work order reports wo_missing rather than silently passing. */
$deptId = (int)($pdo->query("INSERT INTO departments (code, name, is_active) VALUES ('MAINT35', 'Maintenance Test', 1)")->rowCount() ? $pdo->lastInsertId() : 0);
$pdo->prepare("INSERT INTO users (username, email, password, full_name, role_id, role, is_active, department_id)
               VALUES ('sd35admin', 'sd35@example.test', 'x', 'SD35 Admin', 1, 'admin', 1, ?)")->execute([$deptId]);
$uid = (int)$pdo->lastInsertId();

function mkAsset(PDO $pdo, string $code, string $name): int {
    $pdo->prepare("INSERT INTO asset_registry (code, name, status, criticality) VALUES (?,?,'active','B')")->execute([$code, $name]);
    return (int)$pdo->lastInsertId();
}
$assetA = mkAsset($pdo, 'ASSET-A35', 'Pump A');
$assetB = mkAsset($pdo, 'ASSET-B35', 'Motor B');
$assetC = mkAsset($pdo, 'ASSET-C35', 'Valve C');

$pdo->prepare("INSERT INTO spare_parts (code, name, unit, stock_qty, reserved_qty, unit_price) VALUES ('P1-35','Bearing','ea',10,0,100)")
    ->execute();
$partP1 = (int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO spare_parts (code, name, unit, stock_qty, reserved_qty, unit_price) VALUES ('P2-35','Seal','ea',0,0,50)")
    ->execute();
$partP2 = (int)$pdo->lastInsertId();

function mkPermit(PDO $pdo, int $assetId, string $no): int {
    $pdo->prepare("INSERT INTO work_permits (permit_no, asset_id, status, permit_type, isolation_required) VALUES (?,?,?, 'electrical', 1)")
        ->execute([$no, $assetId, 'active']);
    return (int)$pdo->lastInsertId();
}
function mkPoint(PDO $pdo, int $permitId, int $seq, string $label, string $status): int {
    $pdo->prepare("INSERT INTO permit_loto_points (permit_id, seq, point_label, energy_type, isolation_method, status)
                   VALUES (?,?,?,'electrical','loto',?)")->execute([$permitId, $seq, $label, $status]);
    return (int)$pdo->lastInsertId();
}

/* ------------------------------------------------------------------ 1. migration */
echo "\n[1] Migration\n";
ob_start();
require __DIR__ . '/apply_phase35_shutdown.php';
$mig1 = ob_get_clean();

foreach (['sd_shutdowns', 'sd_assets', 'sd_scopes', 'sd_dependencies', 'sd_baselines',
          'sd_readiness_checks', 'sd_startup_checks', 'sd_planned_parts', 'sd_activity'] as $t) {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$t]);
    check("table $t exists", (int)$st->fetchColumn() === 1);
}
$cols = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sd_readiness_checks'")->fetchAll(PDO::FETCH_COLUMN);
check('sd_readiness_checks.sd_asset_id added', in_array('sd_asset_id', $cols, true));
check('sd_readiness_checks.waiver_reason_code added', in_array('waiver_reason_code', $cols, true));
$scols = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sd_startup_checks'")->fetchAll(PDO::FETCH_COLUMN);
check('sd_startup_checks.waiver_reason_code added', in_array('waiver_reason_code', $scols, true));
$hcols = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sd_shutdowns'")->fetchAll(PDO::FETCH_COLUMN);
check('sd_shutdowns.closeout_outcome added', in_array('closeout_outcome', $hcols, true));
check('sd_shutdowns.actual_end_at added', in_array('actual_end_at', $hcols, true));

$idx = $pdo->query("SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sd_readiness_checks'
                      AND INDEX_NAME = 'uk_sdrc_key'")->fetch(PDO::FETCH_ASSOC);
check('sd_readiness_checks.uk_sdrc_key is unique', $idx && (int)$idx['NON_UNIQUE'] === 0);
$st = $pdo->query("SELECT COUNT(*) FROM settings WHERE setting_key LIKE 'shutdown\\_%'");
check('settings group shutdown seeded (>=9)', (int)$st->fetchColumn() >= 9);
$st = $pdo->query("SELECT COUNT(*) FROM notification_templates WHERE module = 'shutdown'");
check('notification_templates module shutdown (>=10)', (int)$st->fetchColumn() >= 10);
$st = $pdo->query("SELECT COUNT(*) FROM menu_permissions WHERE menu_key LIKE 'shutdown%'");
check('menu_permissions shutdown seeded', (int)$st->fetchColumn() > 0);

/* idempotency: re-run and confirm no error and stable table count */
ob_start(); require __DIR__ . '/apply_phase35_shutdown.php'; $mig2 = ob_get_clean();
$st = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'sd\\_%'");
check('migration is idempotent (re-run ok, sd_* table count stable)', (int)$st->fetchColumn() === 9, "count=" . (int)$st->fetchColumn());

/* ------------------------------------------------------------------ 2. create/update */
echo "\n[2] Create / update / list\n";
$c = sd_create($pdo, $uid, ['title' => 'Turnaround Test 35', 'shutdown_type' => 'turnaround', 'risk_level' => 'high', 'facility' => 'Line 1']);
check('sd_create returns id', !empty($c['id']));
$sid = (int)($c['id'] ?? 0);
check('sd_create status draft', ($c['status'] ?? '') === 'draft');
check('shutdown_no format SD-YYYYMM-NNN', (bool)preg_match('/^SD-\d{6}-\d+$/', (string)($c['shutdown_no'] ?? '')));
$dup = sd_create($pdo, $uid, ['title' => 'Dup', 'shutdown_no' => $c['shutdown_no']]);
check('duplicate shutdown_no rejected', ($dup['error'] ?? '') === 'DUPLICATE');
check('bad shutdown_type rejected', (sd_create($pdo, $uid, ['title' => 'x', 'shutdown_type' => 'nope'])['error'] ?? '') === 'VALIDATION_ERROR');
check('missing title rejected', (sd_create($pdo, $uid, [])['error'] ?? '') === 'VALIDATION_ERROR');
check('sd_get returns the row', (int)(sd_get($pdo, $sid)['id'] ?? 0) === $sid);
sd_update($pdo, $uid, $sid, ['title' => 'Turnaround Test 35 (rev)']);
check('sd_update persists title', (string)sd_get($pdo, $sid)['title'] === 'Turnaround Test 35 (rev)');
check('sd_list includes the shutdown', in_array($sid, array_map(fn($r) => (int)$r['id'], sd_list($pdo, [])), true));

/* ------------------------------------------------------------------ 3. scopes / deps / CPM */
echo "\n[3] Scopes, dependencies, critical path\n";
$s1 = sd_scope_save($pdo, $uid, ['shutdown_id' => $sid, 'title' => 'Remove rotor', 'estimate_hours' => 8]);
$s2 = sd_scope_save($pdo, $uid, ['shutdown_id' => $sid, 'title' => 'Inspect seals', 'estimate_hours' => 4]);
$S1 = (int)($s1['id'] ?? 0); $S2 = (int)($s2['id'] ?? 0);
check('scope 1 created', $S1 > 0);
check('scope 2 created', $S2 > 0);
check('scope with bad repair_id rejected', (sd_scope_save($pdo, $uid, ['shutdown_id' => $sid, 'title' => 'x', 'repair_id' => 999999])['error'] ?? '') === 'VALIDATION_ERROR');
check('dependency self rejected', (sd_dependency_save($pdo, $uid, ['shutdown_id' => $sid, 'predecessor_scope_id' => $S1, 'successor_scope_id' => $S1])['error'] ?? '') === 'VALIDATION_ERROR');
check('dependency S1->S2 saved', (sd_dependency_save($pdo, $uid, ['shutdown_id' => $sid, 'predecessor_scope_id' => $S1, 'successor_scope_id' => $S2, 'dep_type' => 'FS'])['ok'] ?? false) === true);
check('dependency cycle S2->S1 rejected', (sd_dependency_save($pdo, $uid, ['shutdown_id' => $sid, 'predecessor_scope_id' => $S2, 'successor_scope_id' => $S1])['error'] ?? '') === 'CYCLE');
check('sd_reaches(S1 -> S2)', sd_reaches($pdo, $sid, $S1, $S2) === true);
$cp = sd_critical_path($pdo, $sid);
check('critical path status ok', ($cp['status'] ?? '') === 'ok', (string)($cp['status'] ?? ''));
check('critical path hours = 12 (8 + 4)', (float)($cp['critical_path_hours'] ?? -1) === 12.0, (string)($cp['critical_path_hours'] ?? ''));
$s3 = sd_scope_save($pdo, $uid, ['shutdown_id' => $sid, 'title' => 'Unestimated job', 'estimate_hours' => 0]);
$S3 = (int)($s3['id'] ?? 0);
$cp2 = sd_critical_path($pdo, $sid);
check('missing estimate => not_estimated', ($cp2['status'] ?? '') === 'not_estimated');
check('unestimated title reported', in_array('Unestimated job', (array)($cp2['unestimated_titles'] ?? []), true));
check('scope delete requires reason', (sd_scope_delete($pdo, $uid, $S3, '')['error'] ?? '') === 'REASON_REQUIRED');
sd_scope_delete($pdo, $uid, $S3, 'remove unestimated scope from test plan');
check('critical path ok again after removing S3', (sd_critical_path($pdo, $sid)['status'] ?? '') === 'ok');
check('scope status planned->ready ok', (sd_scope_status($pdo, $uid, $S1, 'ready', 'พร้อมเริ่มงานตามแผน')['status'] ?? '') === 'ready');
check('scope status ready->done rejected', (sd_scope_status($pdo, $uid, $S2, 'done')['error'] ?? '') === 'INVALID_TRANSITION');

/* ------------------------------------------------------------------ 4. readiness (pre-assets) */
echo "\n[4] Readiness rows\n";
$ev0 = sd_readiness_evaluate($pdo, $sid);
$has = function (array $rows, string $key, string $state, int $blocking = -1): bool {
    foreach ($rows as $r) {
        if ($r['check_key'] !== $key) continue;
        if ($r['state'] !== $state) continue;
        if ($blocking >= 0 && (int)$r['is_blocking'] !== $blocking) continue;
        return true;
    }
    return false;
};
check('row schema carries sd_asset_id', isset($ev0[0]['sd_asset_id']));
check('scope_defined passes (scopes exist)', $has($ev0, 'scope_defined', 'pass'));
check('baseline fails before baseline', $has($ev0, 'baseline', 'fail'));
check('critical_path passes (CPM ok)', $has($ev0, 'critical_path', 'pass'));
check('assets_defined fails (no assets yet)', $has($ev0, 'assets_defined', 'fail'));
check('scope wo_linked fails with wo_missing', $has($ev0, 'wo_linked', 'fail'));
check('scope estimated passes (S1=8)', $has($ev0, 'estimated', 'pass'));
check('scope owner fails with owner_missing', $has($ev0, 'owner', 'fail'));

/* ------------------------------------------------------------------ 5. baseline immutability */
echo "\n[5] Baseline immutability\n";
$b1 = sd_baseline_create($pdo, $uid, $sid, 'v1 test');
check('baseline v1 created', (int)($b1['version'] ?? 0) === 1);
check('shutdown flagged is_baselined', (int)sd_get($pdo, $sid)['is_baselined'] === 1);
sd_scope_save($pdo, $uid, ['shutdown_id' => $sid, 'id' => $S2, 'title' => 'Inspect seals', 'estimate_hours' => 6]);
$diff = sd_baseline_diff($pdo, $sid);
check('baseline_diff available', ($diff['available'] ?? false) === true);
check('baseline_diff shows drift', !empty($diff['changed']));
check('baseline_diff delta = +2', (float)($diff['critical_path_delta'] ?? 0) === 2.0, (string)($diff['critical_path_delta'] ?? ''));
$b2 = sd_baseline_create($pdo, $uid, $sid, 'v2 test');
check('baseline v2 created', (int)($b2['version'] ?? 0) === 2);
$rows = sd_baselines($pdo, $sid);
check('only one is_current baseline', count(array_filter($rows, fn($r) => (int)$r['is_current'] === 1)) === 1);
check('current baseline is v2', (int)sd_baseline_current($pdo, $sid)['version'] === 2);
$v1row = null; foreach ($rows as $r) if ((int)$r['version'] === 1) $v1row = $r;
$vst = $pdo->prepare('SELECT snapshot_json FROM sd_baselines WHERE shutdown_id = ? AND version = 1');
$vst->execute([$sid]);
$snap = json_decode((string)$vst->fetchColumn(), true);
$snapS2 = null; foreach (($snap['scopes'] ?? []) as $sc) if ((int)$sc['id'] === $S2) $snapS2 = $sc;
check('v1 snapshot frozen at 4h (not overwritten by current 6h)', $snapS2 && (float)$snapS2['estimate_hours'] === 4.0);

/* ------------------------------------------------------------------ 6. material */
echo "\n[6] Material plan vs live stock\n";
check('part_save P1 ok', (sd_part_save($pdo, $uid, ['shutdown_id' => $sid, 'spare_part_id' => $partP1, 'planned_qty' => 5])['ok'] ?? false) === true);
check('part_save P2 ok', (sd_part_save($pdo, $uid, ['shutdown_id' => $sid, 'spare_part_id' => $partP2, 'planned_qty' => 3])['ok'] ?? false) === true);
check('part_save qty 0 rejected', (sd_part_save($pdo, $uid, ['shutdown_id' => $sid, 'spare_part_id' => $partP1, 'planned_qty' => 0])['error'] ?? '') === 'VALIDATION_ERROR');
$mat = sd_material($pdo, $sid);
check('material has 2 lines', (int)$mat['plan_line_count'] === 2);
check('material short count = 1 (P2 stock 0)', (int)$mat['short'] === 1);
check('material reports no on-order source', ($mat['on_order_available'] ?? true) === false);

/* ------------------------------------------------------------------ 7. LOTO startup interlock */
echo "\n[7] LOTO startup interlock (hard-coded)\n";
sd_asset_save($pdo, $uid, ['shutdown_id' => $sid, 'asset_id' => $assetA, 'isolation_required' => 1, 'is_critical' => 1]);
sd_asset_save($pdo, $uid, ['shutdown_id' => $sid, 'asset_id' => $assetB, 'isolation_required' => 0]);
sd_asset_save($pdo, $uid, ['shutdown_id' => $sid, 'asset_id' => $assetC, 'isolation_required' => 1]);
$permit = mkPermit($pdo, $assetA, 'PTW-35-001');
$point = mkPoint($pdo, $permit, 1, 'Main isolator', 'locked');

$live = sd_loto_live($pdo, $assetA);
check('sd_loto_live sees 1 locked point', (int)$live['live_count'] === 1);
check('sd_loto_live is read-only', ($live['read_only'] ?? false) === true);

$st = sd_startup_evaluate($pdo, $sid);
check('startup blocked while LOTO live', (int)$st['blocking'] >= 1);
check('startup loto_total_live = 1', (int)$st['loto_total_live'] === 1);
check('startup not ready', ($st['ready'] ?? true) === false);
$find = function (array $checks, int $assetId): ?array { foreach ($checks as $c) if ((int)$c['asset_id'] === $assetId) return $c; return null; };
$aRow = $find($st['checks'], $assetA);
check('asset A reason = loto_active', ($aRow['reason_code'] ?? '') === 'loto_active');
check('loto check is never waivable', ($aRow['is_waivable'] ?? true) === false);
$bRow = $find($st['checks'], $assetB);
check('asset B (not required) = loto_not_required', ($bRow['reason_code'] ?? '') === 'loto_not_required');
$cRow = $find($st['checks'], $assetC);
check('asset C (required, no trace) = loto_not_applied', ($cRow['reason_code'] ?? '') === 'loto_not_applied');

$ref = sd_startup_refresh($pdo, $uid, $sid);
check('startup_refresh persists lifecycle fail', ($ref['ready'] ?? true) === false);
$sheet = sd_startup_sheet($pdo, $sid);
$hasLoto = false; foreach ($sheet['stored_checks'] as $r) if ($r['check_key'] === 'loto_clear') $hasLoto = true;
check('startup sheet stores a loto_clear row', $hasLoto);
check('startup sheet loto_row_waivable = false', ($sheet['loto_row_waivable'] ?? true) === false);
$lotoId = 0; foreach ($sheet['stored_checks'] as $r) if ($r['check_key'] === 'loto_clear') $lotoId = (int)$r['id'];
check('waiving the LOTO row is forbidden', (sd_startup_waive($pdo, $uid, $lotoId, 'เหตุผลยาวพอสำหรับทดสอบ', 'pass')['error'] ?? '') === 'WAIVE_FORBIDDEN');

/* removal WITH an authoriser is the only accepted release evidence */
$pdo->prepare("UPDATE permit_loto_points SET status='removed', removed_at=NOW(), removed_by=?, removal_authorized_by=? WHERE id=?")
    ->execute([$uid, $uid, $point]);
$evi = sd_loto_evidence($pdo, $assetA);
check('released evidence counted', (int)$evi['released_count'] === 1);
check('released_by_authorised_person true', ($evi['released_by_authorised_person'] ?? false) === true);
$st2 = sd_startup_evaluate($pdo, $sid);
$aRow2 = $find($st2['checks'], $assetA);
check('asset A now loto_released', ($aRow2['reason_code'] ?? '') === 'loto_released');

/* asset C still blocks; remove it from the shutdown */
$cSdRow = 0; foreach (sd_assets($pdo, $sid) as $a) if ((int)$a['asset_id'] === $assetC) $cSdRow = (int)$a['id'];
check('asset C membership row found', $cSdRow > 0);
sd_asset_delete($pdo, $uid, $cSdRow, 'remove from test plan');
$st3 = sd_startup_evaluate($pdo, $sid);
check('startup ready after release and cleanup', ($st3['ready'] ?? false) === true, 'blocking=' . (int)$st3['blocking']);
check('no live LOTO remains', (int)$st3['loto_total_live'] === 0);

/* startup gate is unreachable until execution: force status, then transition */
$pdo->prepare("UPDATE sd_shutdowns SET status='execution' WHERE id=?")->execute([$sid]);
sd_config_reset(); // drop cached config so a changed setting cannot leak between sections

/* put a fresh live lock back, prove the gate refuses, then clear */
$point2 = mkPoint($pdo, $permit, 2, 'Backup isolator', 'tagged');
$gate = sd_transition($pdo, $uid, $sid, 'startup');
check('transition to startup refused while LOTO live', ($gate['error'] ?? '') === 'LOTO_ACTIVE');
$pdo->prepare("UPDATE permit_loto_points SET status='removed', removed_at=NOW(), removal_authorized_by=? WHERE id=?")->execute([$uid, $point2]);
$ok = sd_transition($pdo, $uid, $sid, 'startup');
check('transition to startup succeeds when clear', ($ok['status'] ?? '') === 'startup');

/* ------------------------------------------------------------------ 8. lifecycle + readiness gate */
echo "\n[8] Lifecycle gates\n";
$sh2 = sd_create($pdo, $uid, ['title' => 'Gate Test 35']);
$gid = (int)$sh2['id'];
check('draft->ready is not a valid transition', (sd_transition($pdo, $uid, $gid, 'ready')['error'] ?? '') === 'INVALID_TRANSITION');
check('cancel without reason rejected', (sd_transition($pdo, $uid, $gid, 'cancelled')['error'] ?? '') === 'REASON_REQUIRED');
check('draft->planning ok', (sd_transition($pdo, $uid, $gid, 'planning')['status'] ?? '') === 'planning');
check('planning->scope_freeze ok', (sd_transition($pdo, $uid, $gid, 'scope_freeze')['status'] ?? '') === 'scope_freeze');
check('scope_freeze auto-created a baseline', count(sd_baselines($pdo, $gid)) >= 1);
$rd = sd_readiness_refresh($pdo, $uid, $gid);
check('readiness refresh reports blockers', (int)($rd['blocking'] ?? 0) > 0);
$rdy = sd_transition($pdo, $uid, $gid, 'ready');
check('scope_freeze->ready blocked by readiness', ($rdy['error'] ?? '') === 'READINESS_BLOCKED');
check('readiness has no numeric score key', !array_key_exists('score', $rd) && !array_key_exists('percent', $rd));
check('readiness note states no total score', str_contains((string)($rd['note'] ?? ''), 'ไม่มีคะแนนรวม'));

/* ------------------------------------------------------------------ 9. reads */
echo "\n[9] Reads (selectors)\n";
$opt = sd_options();
check('sd_options.module = shutdown', ($opt['permission_module'] ?? '') === 'shutdown');
check('sd_options has reason codes', !empty($opt['reason_codes']));
check('sd_options has forbidden offline actions', !empty($opt['offline_forbidden']));
$dash = sd_dashboard($pdo, []);
check('sd_dashboard returns by_status/total', array_key_exists('by_status', $dash) && array_key_exists('total', $dash));
$det = sd_detail($pdo, $sid, true);
check('sd_detail includes progress', isset($det['progress']));
check('sd_detail includes startup', isset($det['startup']['checks']));
check('sd_detail includes cost', array_key_exists('available', (array)($det['cost'] ?? [])));
$cost = sd_cost_summary($pdo, $sid);
check('cost reports unavailable without linked WO', ($cost['available'] ?? true) === false);

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
