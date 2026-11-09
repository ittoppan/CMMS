<?php
/**
 * scripts/test_calibration.php — behavioral harness for the Phase-29 Calibration
 * & Measurement engine.
 *
 * Covers src/helpers/calibration.php:
 *   - cal_next_due()                 calendar month arithmetic + null guards
 *   - cal_compute_point()            error / error% / pass-fail (backend only)
 *   - cal_range_for_view()           month/week/today/next30/year windows
 *   - cal_workflow_transitions()     state machine + cal_can_transition()
 *   - cal_instrument_status_value()  GREEN / AMBER / RED
 *   - cal_run_computed()             compliance result in BOTH modes:
 *                                      all_points_pass (this process)
 *                                      critical_points_only (child process,
 *                                      because cal_config() caches statically
 *                                      per process and cannot be re-read)
 *   - cal_validate_submit()          data-completeness gate before submit
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_caltest".
 *
 *   php scripts/test_calibration.php [--keep]
 *
 * Internal: `--child` re-invokes this same file as a separate PHP process to
 * exercise the critical_points_only compliance branch against the scratch DB
 * that the parent already built. Not meant to be run directly.
 *
 * SAFETY: refuses to run unless the scratch name ends in "_caltest", differs
 * from the live DB name, and SELECT DATABASE() is verified after connecting.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP  = in_array('--keep', $argv ?? [], true);
$CHILD = in_array('--child', $argv ?? [], true);

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

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx(float $a, float $b, float $eps = 0.000001): bool { return abs($a - $b) <= $eps; }

/* ───────────────────────── child process: critical_points_only ───────────────────────── */
if ($CHILD) {
    $_ENV['DB_HOST'] = getenv('DB_HOST') ?: '127.0.0.1';
    $_ENV['DB_PORT'] = getenv('DB_PORT') ?: '3306';
    $_ENV['DB_USER'] = getenv('DB_USER') ?: 'root';
    $_ENV['DB_PASS'] = getenv('DB_PASS') ?: '';
    $_ENV['DB_NAME'] = getenv('DB_NAME') ?: '';
    require_once __DIR__ . '/../src/config/db.php';
    require_once __DIR__ . '/../src/helpers/calibration.php';

    $pdo = getDb();
    $db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($db !== (string)$_ENV['DB_NAME']) { fwrite(STDERR, "CHILD GUARD: connected to '$db'\n"); exit(2); }

    echo "[child] compliance mode = critical_points_only\n";
    $pdo->prepare("DELETE FROM settings WHERE setting_key = 'cal_compliance_mode'")->execute();
    $pdo->prepare("INSERT INTO settings (setting_key, setting_group, setting_value) VALUES ('cal_compliance_mode','calibration','critical_points_only')")->execute();

    $pt = fn($nom, $meas, $tol, bool $crit = false) => ['nominal_value' => $nom, 'measured_value' => $meas, 'tolerance' => $tol, 'is_critical' => $crit ? 1 : 0];

    $r = cal_run_computed($pdo, ['measurements' => [$pt(10, 20, 1, false), $pt(5, 5, 1, true)]]);
    check('critical mode: non-critical fail -> conditional', $r['result'] === 'conditional' && $r['oot'] === true, json_encode($r));
    check('critical mode: computation_mode surfaced', $r['computation_mode'] === 'critical_points_only');
    check('critical mode: critical pass counted', $r['critical_count'] === 1 && $r['critical_failed'] === 0);

    $r = cal_run_computed($pdo, ['measurements' => [$pt(10, 20, 1, true)]]);
    check('critical mode: critical fail -> fail', $r['result'] === 'fail' && $r['critical_failed'] === 1, json_encode($r));

    $r = cal_run_computed($pdo, ['measurements' => [$pt(10, 20, 1, true), $pt(5, 20, 1, false)]]);
    check('critical mode: mixed fails -> conditional', $r['result'] === 'conditional', json_encode($r));

    $r = cal_run_computed($pdo, ['measurements' => [$pt(10, 10, 1, true), $pt(5, 5, 1, false)]]);
    check('critical mode: all pass -> pass', $r['result'] === 'pass' && $r['oot'] === false);

    $r = cal_run_computed($pdo, ['measurements' => [$pt(10, 20, 1, false)]]);
    check('critical mode: only non-critical fail -> conditional', $r['result'] === 'conditional' && $r['critical_count'] === 0);

    echo "CHILDSUM PASS $pass_count FAIL $fail_count\n";
    exit($fail_count > 0 ? 1 : 0);
}

/* ───────────────────────── parent: build scratch DB ───────────────────────── */
$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_caltest';

if (!str_ends_with($scratch, '_caltest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

echo "Calibration harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/calibration.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ================================================================= 1. cal_next_due */
echo "\n[1] cal_next_due()\n";
check('null date -> null', cal_next_due(null, 12) === null);
check('empty date -> null', cal_next_due('', 12) === null);
check('zero interval -> null', cal_next_due('2026-01-15', 0) === null);
check('negative interval -> null', cal_next_due('2026-01-15', -3) === null);
check('+12 months', cal_next_due('2026-01-15', 12) === '2027-01-15');
check('+1 month month-end overflows (PHP +N months)', cal_next_due('2026-01-31', 1) === '2026-03-03');
check('+3 months across year', cal_next_due('2025-12-31', 3) === '2026-03-31');
check('+12 months leap-safe', cal_next_due('2026-02-28', 12) === '2027-02-28');

/* ================================================================= 2. cal_compute_point */
echo "\n[2] cal_compute_point()\n";
$c = cal_compute_point(['nominal_value' => 10, 'measured_value' => 10.5, 'tolerance' => 1]);
check('error_value = +0.5', approx((float)$c['error_value'], 0.5));
check('error_pct = +5%', approx((float)$c['error_pct'], 5.0));
check('within tolerance -> pass', $c['result'] === 'pass');

$c = cal_compute_point(['nominal_value' => 10, 'measured_value' => 12, 'tolerance' => 1]);
check('out of tolerance -> fail', $c['result'] === 'fail');

$c = cal_compute_point(['nominal_value' => 10, 'measured_value' => 11, 'tolerance' => 1]);
check('exactly at tolerance -> pass (<=)', $c['result'] === 'pass');

$c = cal_compute_point(['nominal_value' => 0, 'measured_value' => 2, 'tolerance' => 1]);
check('nominal 0: error_value computed', approx((float)$c['error_value'], 2.0));
check('nominal 0: error_pct stays null (no div/0)', $c['error_pct'] === null);
check('nominal 0: fail vs tolerance 1', $c['result'] === 'fail');

$c = cal_compute_point(['nominal_value' => 10, 'measured_value' => 10.5]);
check('no tolerance: error computed but result null', $c['result'] === null && approx((float)$c['error_value'], 0.5));

$c = cal_compute_point(['nominal_value' => 10, 'measured_value' => '', 'tolerance' => 1]);
check('missing measured -> all null', $c['error_value'] === null && $c['result'] === null);

$c = cal_compute_point(['nominal_value' => '', 'measured_value' => 5, 'tolerance' => 1]);
check('missing nominal -> all null', $c['error_value'] === null && $c['result'] === null);

/* ================================================================= 3. cal_range_for_view */
echo "\n[3] cal_range_for_view()\n";
$anchor = '2026-03-15';
check('today -> [anchor,anchor]', cal_range_for_view('today', $anchor) === ['2026-03-15', '2026-03-15']);
check('next30 end = anchor+30', cal_range_for_view('next30', $anchor) === ['2026-03-15', '2026-04-14']);
check('year -> Jan1..Dec31', cal_range_for_view('year', $anchor) === ['2026-01-01', '2026-12-31']);
check('month (default) -> first..last', cal_range_for_view('month', $anchor) === ['2026-03-01', '2026-03-31']);
$wk = cal_range_for_view('week', '2026-03-15');
check('week starts Monday', date('N', strtotime($wk[0])) === '1', json_encode($wk));
check('week ends Sunday', date('N', strtotime($wk[1])) === '7', json_encode($wk));

/* ================================================================= 4. workflow state machine */
echo "\n[4] cal_can_transition()\n";
check('scheduled -> in_progress', cal_can_transition('scheduled', 'in_progress') === true);
check('scheduled -> cancelled', cal_can_transition('scheduled', 'cancelled') === true);
check('scheduled -> approved (skip review) = false', cal_can_transition('scheduled', 'approved') === false);
check('in_progress -> pending_review', cal_can_transition('in_progress', 'pending_review') === true);
check('in_progress -> approved (bypass review) = false', cal_can_transition('in_progress', 'approved') === false);
check('in_progress -> in_progress (self) = false', cal_can_transition('in_progress', 'in_progress') === false);
check('pending_review -> approved', cal_can_transition('pending_review', 'approved') === true);
check('pending_review -> rejected', cal_can_transition('pending_review', 'rejected') === true);
check('approved is terminal', cal_can_transition('approved', 'in_progress') === false);
check('completed is terminal', cal_can_transition('completed', 'in_progress') === false);
check('rejected -> in_progress', cal_can_transition('rejected', 'in_progress') === true);
check('rejected -> scheduled = false', cal_can_transition('rejected', 'scheduled') === false);
check('overdue -> in_progress', cal_can_transition('overdue', 'in_progress') === true);
check('unknown from-state = false', cal_can_transition('nonsense', 'in_progress') === false);

/* ================================================================= 5. instrument status */
echo "\n[5] cal_instrument_status_value()\n";
$today = date('Y-m-d');
$plus  = fn(int $d) => date('Y-m-d', strtotime("$d days"));
check('no data at all -> RED', cal_instrument_status_value([]) === 'RED');
check('never calibrated, no last -> RED', cal_instrument_status_value(['next_calibration_date' => null]) === 'RED');
check('overdue (yesterday) -> RED', cal_instrument_status_value(['next_calibration_date' => $plus(-1)]) === 'RED');
check('due today -> AMBER', cal_instrument_status_value(['next_calibration_date' => $today]) === 'AMBER');
check('due in 10d, alert 30 -> AMBER', cal_instrument_status_value(['next_calibration_date' => $plus(10), 'cal_alert_days' => 30]) === 'AMBER');
check('due in 40d, alert 30 -> GREEN', cal_instrument_status_value(['next_calibration_date' => $plus(40), 'cal_alert_days' => 30]) === 'GREEN');
check('due exactly alert boundary -> AMBER', cal_instrument_status_value(['next_calibration_date' => $plus(30), 'cal_alert_days' => 30]) === 'AMBER');
check('alert defaults to 30 when missing', cal_instrument_status_value(['next_calibration_date' => $plus(40)]) === 'GREEN');
check('has last date but no next -> AMBER', cal_instrument_status_value(['last_calibration_date' => $plus(-5)]) === 'AMBER');
check('has last_run_date but no next -> AMBER', cal_instrument_status_value(['last_run_date' => $plus(-5)]) === 'AMBER');

/* ================================================================= 6. cal_run_computed (all_points_pass) */
echo "\n[6] cal_run_computed() — all_points_pass\n";
$pt = fn($nom, $meas, $tol, bool $crit = false) => ['nominal_value' => $nom, 'measured_value' => $meas, 'tolerance' => $tol, 'is_critical' => $crit ? 1 : 0];

$r = cal_run_computed($pdo, ['measurements' => [$pt(10, 10.5, 1), $pt(20, 20, 1)]]);
check('all pass -> pass', $r['result'] === 'pass' && $r['points_passed'] === 2 && $r['points_failed'] === 0, json_encode($r));
check('all pass -> complete, no OOT', $r['complete'] === true && $r['oot'] === false);
check('max_abs_error = 0.5', approx((float)$r['max_abs_error'], 0.5));
check('computation_mode surfaced', $r['computation_mode'] === 'all_points_pass');

$r = cal_run_computed($pdo, ['measurements' => [$pt(10, 12, 1), $pt(20, 20, 1)]]);
check('one fail -> fail', $r['result'] === 'fail' && $r['points_failed'] === 1);
check('one fail -> OOT flagged', $r['oot'] === true);
check('max_abs_error = 2.0', approx((float)$r['max_abs_error'], 2.0));

$r = cal_run_computed($pdo, ['measurements' => [$pt(10, 10, 1), $pt(20, '', 1)]]);
check('one missing reading -> conditional', $r['result'] === 'conditional' && $r['points_missing'] === 1, json_encode($r));
check('missing reading -> not complete, no OOT', $r['complete'] === false && $r['oot'] === false);

$r = cal_run_computed($pdo, ['measurements' => []]);
check('no points -> result null', $r['result'] === null && $r['insufficient_data'] === true);
check('no points -> not complete, no OOT', $r['complete'] === false && $r['oot'] === false);

$r = cal_run_computed($pdo, ['measurements' => [$pt(10, 10.5, 1, true), $pt(20, 25, 5, false)]]);
check('critical point passes -> counted, result pass', $r['result'] === 'pass' && $r['critical_count'] === 1 && $r['critical_failed'] === 0);

$r = cal_run_computed($pdo, ['measurements' => [$pt(1, 1.9, 5), $pt(2, 2.5, 5), $pt(3, 10, 5)]]);
check('max_abs_error picks largest (7.0)', approx((float)$r['max_abs_error'], 7.0));
check('two pass one fail -> fail', $r['points_passed'] === 2 && $r['points_failed'] === 1 && $r['result'] === 'fail');

/* ================================================================= 7. cal_validate_submit */
echo "\n[7] cal_validate_submit()\n";
$pdo->prepare("INSERT INTO asset_registry (code, name) VALUES ('CAL-A1','Test Gauge')")->execute();
$assetId = (int)$pdo->lastInsertId();

$pdo->prepare("INSERT INTO calibration (asset_id) VALUES (?)")->execute([$assetId]);
$calA = (int)$pdo->lastInsertId();
$v = cal_validate_submit($pdo, $calA);
check('no points + no date -> error', $v['error'] === true);
check('reports missing measurement point', str_contains($v['message'], 'ยังไม่มีจุดวัด'), $v['message']);
check('reports missing calibration date', str_contains($v['message'], 'ยังไม่ระบุวันที่สอบเทียบ'), $v['message']);

$pdo->prepare("INSERT INTO calibration (asset_id) VALUES (?)")->execute([$assetId]);
$calB = (int)$pdo->lastInsertId();
$insM = $pdo->prepare("INSERT INTO calibration_measurements (calibration_id, point_label, nominal_value, measured_value, tolerance, is_critical) VALUES (?,?,?,?,?,?)");
$insM->execute([$calB, 'P1', 10, 10.2, 0.5, 0]);
$v = cal_validate_submit($pdo, $calB, '2026-05-01');
check('candidateDate fills blank calibration_date', $v['error'] === false, json_encode($v));
check('missing standard -> warning only', count($v['warnings']) >= 1 && str_contains(implode(' ', $v['warnings']), 'มาตรฐาน'), json_encode($v['warnings']));

$pdo->prepare("INSERT INTO calibration (asset_id, calibration_date) VALUES (?, '2026-05-02')")->execute([$assetId]);
$calC = (int)$pdo->lastInsertId();
$insM->execute([$calC, 'P1', null, 5, null, 0]);
$v = cal_validate_submit($pdo, $calC);
check('missing nominal -> error', $v['error'] === true && str_contains($v['message'], 'ขาดค่าอ้างอิง'), $v['message']);
check('missing tolerance -> warning', str_contains(implode(' ', $v['warnings']), 'tolerance') || str_contains(implode(' ', $v['warnings']), 'เกณฑ์ยอมรับ'), json_encode($v['warnings']));

$v = cal_validate_submit($pdo, 999999);
check('unknown calibration -> error', $v['error'] === true && str_contains($v['message'], 'ไม่พบ'), $v['message']);

/* ================================================================= 8. critical_points_only (child process) */
echo "\n[8] cal_run_computed() — critical_points_only (child process)\n";
$cmd = '"' . PHP_BINARY . '" ' . escapeshellarg(__FILE__) . ' --child 2>&1';
$childLines = [];
$rc = 0;
exec($cmd, $childLines, $rc);
foreach ($childLines as $ln) {
    echo $ln . "\n";
    if (preg_match('/^\s*PASS\s+(.*)$/', $ln, $m)) { $pass_count++; }
    elseif (preg_match('/^\s*FAIL\s+(.*)$/', $ln, $m)) { $fail_count++; $failures[] = $m[1]; }
}
check('critical-mode child process exited 0', $rc === 0, "rc=$rc");

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
