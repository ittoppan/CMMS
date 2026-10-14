<?php
/**
 * scripts/test_workforce.php — behavioral harness for the workforce engine
 * (src/helpers/workforce.php, Phase 34).
 *
 * Covers pure + light-DB functions: wf_staff_where, wf_abort, wf_shift_minutes,
 * wf_leave_days, wf_date_range, wf_requirement_scopes, wf_requirement_scope_label,
 * wf_config, wf_skill_levels, wf_is_working_day, wf_shift_for, wf_availability,
 * wf_require_staff.
 *
 * wf_config()/wf_skill_levels() read getSettingValue(), which caches EVERY setting
 * on first call, so defaults vs overrides cannot be observed in one process. The
 * parent asserts overrides after seeding; it forks `php <self> --child` (same
 * scratch DB, settings cleared) to assert the documented defaults.
 *
 * Runs against a THROWAWAY database = live DB name + "_wftest".
 *   php scripts/test_workforce.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);
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

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_wftest';

if (!str_ends_with($scratch, '_wftest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function throws(string $label, string $class, callable $fn, ?int $code = null): void {
    try { $fn(); check($label, false, 'no exception thrown'); }
    catch (Throwable $e) {
        $ok = $e instanceof $class && ($code === null || $e->getCode() === $code);
        check($label, $ok, get_class($e) . '#' . $e->getCode() . ': ' . $e->getMessage());
    }
}

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

/* ═══════════════════════════════════════════════════════════ CHILD: defaults */
if ($CHILD) {
    require_once __DIR__ . '/../src/config/db.php';
    require_once __DIR__ . '/../src/helpers/workforce.php';
    $pdo = getDb();
    $cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($cur !== $scratch) { fwrite(STDERR, "CHILD GUARD: on '$cur'\n"); exit(2); }
    $pdo->exec('DELETE FROM settings');
    $pass_count = 0; $fail_count = 0; $failures = [];
    $cfg = wf_config($pdo);
    check('default auto_assign=false', $cfg['auto_assign'] === false);
    check('default block_unqualified=true', $cfg['block_unqualified'] === true);
    check('default require_reason=true', $cfg['require_reason'] === true);
    check('default expiry_warning_days=30', $cfg['expiry_warning_days'] === 30);
    check('default capacity_warn_pct=85', $cfg['capacity_warn_pct'] === 85);
    check('default capacity_over_pct=100', $cfg['capacity_over_pct'] === 100);
    check('default shift_start=08:00', $cfg['default_shift_start'] === '08:00');
    check('default shift_hours=8', $cfg['default_shift_hours'] === 8);
    check('default working_days=[1,2,3,4,5]', $cfg['default_working_days'] === [1, 2, 3, 4, 5]);
    $lvl = wf_skill_levels($pdo);
    check('default skill levels = 5 labels', count($lvl) === 5 && $lvl[3] === 'ทำได้ด้วยตัวเอง', json_encode($lvl, JSON_UNESCAPED_UNICODE));
    printf("CHILDSUM PASS %d FAIL %d\n", $pass_count, $fail_count);
    exit($fail_count > 0 ? 1 : 0);
}

/* ═══════════════════════════════════════════════════════════ PARENT: setup */
$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Workforce harness on scratch DB: $scratch (live: $live)\n";
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

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/workforce.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* seed BEFORE first getSettingValue() (loads the whole cache once) */
$set = $pdo->prepare("INSERT INTO settings (setting_key, setting_group, setting_value) VALUES (?, 'workforce', ?)");
$set->execute(['workforce_auto_assign', '1']);
$set->execute(['workforce_expiry_warning_days', '10']);
$set->execute(['workforce_capacity_warn_pct', '70']);
$set->execute(['planning_working_days', '1,2,3,4,5,6']);
$set->execute(['planning_shift_start', '07:30']);
$set->execute(['planning_shift_hours', '9']);
$set->execute(['workforce_skill_levels', json_encode([
    ['key' => 1, 'label' => 'Beginner'], ['key' => 4, 'label' => 'Expert'], ['bogus' => 'x'],
], JSON_UNESCAPED_UNICODE)]);

/* ═══════════════════════════════════════════════════════════ 1. staff helpers */
echo "\n[1] wf_staff_where / wf_abort\n";
$w = wf_staff_where();
check('unaliased where', $w === "is_active = 1 AND (role_id IN (1,2,3,6,7) OR (role_id IS NULL AND role IN ('technician','foreman','manager','admin','asst_manager')))", $w);
$wa = wf_staff_where('u');
check('aliased where prefixes columns', str_contains($wa, 'u.is_active = 1') && str_contains($wa, 'u.role_id'), $wa);
throws('wf_abort throws RuntimeException', RuntimeException::class, fn() => wf_abort('boom'));
throws('wf_abort carries status code', RuntimeException::class, fn() => wf_abort('nope', 404), 404);

/* ═══════════════════════════════════════════════════════════ 2. pure math */
echo "\n[2] wf_shift_minutes / wf_leave_days / wf_date_range\n";
check('day shift 08-17 break60 = 480', wf_shift_minutes('08:00:00', '17:00:00', 60) === 480, (string)wf_shift_minutes('08:00:00', '17:00:00', 60));
check('overnight 22-06 = 480', wf_shift_minutes('22:00:00', '06:00:00', 0) === 480, (string)wf_shift_minutes('22:00:00', '06:00:00', 0));
check('break reduces minutes', wf_shift_minutes('08:00:00', '16:00:00', 30) === 450, (string)wf_shift_minutes('08:00:00', '16:00:00', 30));
check('break > shift clamps to 0', wf_shift_minutes('08:00:00', '09:00:00', 120) === 0, (string)wf_shift_minutes('08:00:00', '09:00:00', 120));
check('invalid time -> 0', wf_shift_minutes('not-a-time', '17:00:00', 0) === 0);
check('leave same day = 1', wf_leave_days('2026-03-01', '2026-03-01') === 1);
check('leave inclusive span = 5', wf_leave_days('2026-03-01', '2026-03-05') === 5);
check('reversed leave = 0', wf_leave_days('2026-03-05', '2026-03-01') === 0);
check('invalid leave = 0', wf_leave_days('x', 'y') === 0);
check('range count 3', wf_date_range('2026-03-01', '2026-03-03') === ['2026-03-01', '2026-03-02', '2026-03-03']);
check('range clamps to maxDays', count(wf_date_range('2026-01-01', '2026-12-31', 10)) === 10);
check('reversed range empty', wf_date_range('2026-03-05', '2026-03-01') === []);

/* ═══════════════════════════════════════════════════════════ 3. scopes/labels */
echo "\n[3] wf_requirement_scopes / wf_requirement_scope_label\n";
$scopes = wf_requirement_scopes();
check('7 scopes', count($scopes) === 7, (string)count($scopes));
check('category/criticality are text scopes', $scopes['asset_category'] === 'text' && $scopes['asset_criticality'] === 'text');
$pdo->prepare('INSERT INTO asset_registry (code, name) VALUES (?,?)')->execute(['AST-1', 'ปั๊มน้ำ P-01']);
$assetId = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO departments (code, name) VALUES (?,?)')->execute(['DPT-1', 'ซ่อมบำรุง']);
$deptId = (int)$pdo->lastInsertId();
check('global label', wf_requirement_scope_label($pdo, 'global', 0, '') === 'ทั้งหมด');
check('asset_category label', wf_requirement_scope_label($pdo, 'asset_category', 0, 'Rotating') === 'ประเภทเครื่องจักร: Rotating');
check('asset_criticality label', wf_requirement_scope_label($pdo, 'asset_criticality', 0, 'A') === 'ระดับความสำคัญ: A');
check('asset label resolves name', wf_requirement_scope_label($pdo, 'asset', $assetId, '') === 'ปั๊มน้ำ P-01', wf_requirement_scope_label($pdo, 'asset', $assetId, ''));
check('department label resolves name', wf_requirement_scope_label($pdo, 'department', $deptId, '') === 'ซ่อมบำรุง', wf_requirement_scope_label($pdo, 'department', $deptId, ''));
check('missing asset falls back to type#id', wf_requirement_scope_label($pdo, 'asset', 999999, '') === 'asset#999999');

/* ═══════════════════════════════════════════════════════════ 4. config overrides */
echo "\n[4] wf_config / wf_skill_levels (overrides)\n";
$cfg = wf_config($pdo);
check('auto_assign override = true', $cfg['auto_assign'] === true);
check('expiry_warning_days override = 10', $cfg['expiry_warning_days'] === 10);
check('capacity_warn_pct override = 70', $cfg['capacity_warn_pct'] === 70);
check('block_unqualified default still true', $cfg['block_unqualified'] === true);
check('working_days override = [1..6]', $cfg['default_working_days'] === [1, 2, 3, 4, 5, 6]);
check('shift_start override = 07:30', $cfg['default_shift_start'] === '07:30');
check('shift_hours override = 9', $cfg['default_shift_hours'] === 9);
$lvl = wf_skill_levels($pdo);
check('skill levels parsed + bogus row skipped', $lvl === [1 => 'Beginner', 4 => 'Expert'], json_encode($lvl));

/* ═══════════════════════════════════════════════════════════ 5. working day */
echo "\n[5] wf_is_working_day\n";
$pdo->prepare('INSERT INTO holidays (holiday_date, name, is_recurring) VALUES (?,?,?)')->execute(['2020-05-01', 'Songkran-ish recurring', 1]);
$pdo->prepare('INSERT INTO holidays (holiday_date, name, is_recurring) VALUES (?,?,?)')->execute(['2026-12-25', 'One-off', 0]);
check('Mon 2026-03-02 working (no holiday)', wf_is_working_day($pdo, '2026-03-02') === true);
check('Sun 2026-03-01 not working (default days)', wf_is_working_day($pdo, '2026-03-01') === false);
check('recurring holiday suppresses', wf_is_working_day($pdo, '2026-05-01') === false);
check('one-off holiday suppresses exact date', wf_is_working_day($pdo, '2026-12-25') === false);
check('one-off does not leak to other years', wf_is_working_day($pdo, '2027-12-25') === true);

/* ═══════════════════════════════════════════════════════════ 6. shift + availability */
echo "\n[6] wf_shift_for / wf_availability / wf_require_staff\n";
$pdo->prepare('INSERT INTO users (username, email, password, full_name, role_id, role, is_active) VALUES (?,?,?,?,?,?,?)')
    ->execute(['tech1', 'tech1@x.test', 'x', 'ช่างสมชาย', null, 'technician', 1]);
$uid = (int)$pdo->lastInsertId();

throws('wf_require_staff rejects unknown id', RuntimeException::class, fn() => wf_require_staff($pdo, 999999));
check('wf_require_staff returns name', wf_require_staff($pdo, $uid) === 'ช่างสมชาย');

$sh = wf_shift_for($pdo, $uid, '2026-03-02');
check('default shift start 07:30', $sh['start'] === '07:30', json_encode($sh));
check('default shift end 16:30 (9h)', $sh['end'] === '16:30', $sh['end']);
check('default shift work_minutes 540', $sh['work_minutes'] === 540, (string)$sh['work_minutes']);
check('default shift source', $sh['source'] === 'global_planning_settings');

$pdo->prepare('INSERT INTO wf_shift_assignments (user_id, shift_start, shift_end, break_minutes, work_days) VALUES (?,?,?,?,?)')
    ->execute([$uid, '06:00:00', '14:00:00', 30, '1,2,3,4,5']);
$sh = wf_shift_for($pdo, $uid, '2026-03-02');
check('per-user shift wins', $sh['source'] === 'shift_assignment' && $sh['start'] === '06:00' && $sh['work_minutes'] === 450, json_encode($sh));

$av = wf_availability($pdo, $uid, '2026-03-02'); // Monday
check('available on working day', $av['available'] === true && $av['reasons'] === [], json_encode($av['reasons']));
$av = wf_availability($pdo, $uid, '2026-03-01'); // Sunday
check('unavailable on Sunday -> OUTSIDE_SHIFT', $av['available'] === false && in_array('OUTSIDE_SHIFT', $av['reasons'], true), json_encode($av['reasons']));

$pdo->prepare('INSERT INTO wf_leave (user_id, status, leave_type, start_date, end_date) VALUES (?,?,?,?,?)')
    ->execute([$uid, 'approved', 'annual', '2026-03-02', '2026-03-04']);
$av = wf_availability($pdo, $uid, '2026-03-02');
check('approved leave -> ON_LEAVE', in_array('ON_LEAVE', $av['reasons'], true), json_encode($av['reasons']));
check('leave detail surfaced', $av['leave']['type'] === 'annual');

$pdo->prepare('INSERT INTO wf_leave (user_id, status, leave_type, start_date, end_date) VALUES (?,?,?,?,?)')
    ->execute([$uid, 'rejected', 'sick', '2026-03-09', '2026-03-09']);
$av = wf_availability($pdo, $uid, '2026-03-09');
check('rejected leave ignored', !in_array('ON_LEAVE', $av['reasons'], true), json_encode($av['reasons']));

$pdo->prepare('INSERT INTO wf_courses (code, name_th) VALUES (?,?)')->execute(['CRS-1', 'ความปลอดภัย']);
$courseId = (int)$pdo->lastInsertId();
$pdo->prepare('INSERT INTO wf_training_records (user_id, course_id, status, scheduled_date) VALUES (?,?,?,?)')
    ->execute([$uid, $courseId, 'planned', '2026-03-10']);
$av = wf_availability($pdo, $uid, '2026-03-10');
check('planned training -> IN_TRAINING', in_array('IN_TRAINING', $av['reasons'], true), json_encode($av['reasons']));
check('training detail surfaced', $av['training']['course'] === 'ความปลอดภัย');

/* ═══════════════════════════════════════════════════════════ 7. child: defaults */
echo "\n[7] wf_config / wf_skill_levels defaults (child process)\n";
$self = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__) . ' --child';
$out = shell_exec($self . ' 2>&1');
echo $out;
if (preg_match('/CHILDSUM PASS (\d+) FAIL (\d+)/', (string)$out, $m)) {
    $pass_count += (int)$m[1];
    $fail_count += (int)$m[2];
    check('child assertions reported', true);
} else {
    check('child process produced CHILDSUM', false, 'no CHILDSUM in output');
}

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
