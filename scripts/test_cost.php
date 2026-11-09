<?php
/**
 * scripts/test_cost.php — behavioral harness for the Phase-26 Cost & Budget engine.
 *
 * Covers src/helpers/cost.php:
 *   - cost_money()                 amount normalization/rounding
 *   - cost_can_manage_budget()     role gate (1,2,6)
 *   - budget_state()               NORMAL/WARNING/EXCEEDED/NO_BUDGET ladder
 *   - budget_effective()           allocated + Σ adjustments
 *   - budget_create/update/submit/approve/adjust/close/cancel  workflow + guards
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_costtest".
 *   php scripts/test_cost.php [--keep]
 *
 * NOTE: view-dependent readers (budget_actual / cost_summary / *_vs_actual) are
 * intentionally out of scope here because the scratch clone only carries BASE
 * TABLES (no v_maintenance_cost view) — those need a separate fixture.
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
$scratch = $live . '_costtest';

if (!str_ends_with($scratch, '_costtest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx(float $a, float $b): bool { return abs($a - $b) < 0.001; }
function throws(string $label, callable $fn): void {
    try { $fn(); check($label, false, 'no exception thrown'); }
    catch (DomainException $e) { check($label, true); }
    catch (Throwable $e) { check($label, false, get_class($e) . ': ' . $e->getMessage()); }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Cost-engine harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/audit.php';
require_once __DIR__ . '/../src/helpers/notification.php';
require_once __DIR__ . '/../src/services/NotificationCenterService.php';
require_once __DIR__ . '/../src/helpers/cost.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ================================================================= 1. helpers */
echo "\n[1] cost_money() / cost_can_manage_budget()\n";
check('rounds to 2dp', cost_money('1234.567') === 1234.57);
check('round half up', cost_money('9999.995') === 10000.0);
check('null -> 0', cost_money(null) === 0.0);
check('garbage -> 0', cost_money('abc') === 0.0);
check('int-like string', cost_money('500') === 500.0);
check('manage roles 1,2,6 true', cost_can_manage_budget(1) && cost_can_manage_budget(2) && cost_can_manage_budget(6));
check('others false', !cost_can_manage_budget(3) && !cost_can_manage_budget(5) && !cost_can_manage_budget(7));

/* ================================================================= 2. budget_state */
echo "\n[2] budget_state()\n";
$cfg = ['warning_pct' => 80.0, 'exceed_pct' => 100.0];
$s = budget_state($cfg, null, 0.0);
check('no budget / no spend -> NO_BUDGET', $s['alert'] === 'NO_BUDGET' && $s['pct'] === 0.0, json_encode($s));
$s = budget_state($cfg, null, 150.0);
check('no budget / spend -> EXCEEDED', $s['alert'] === 'EXCEEDED' && $s['remaining'] === -150.0, json_encode($s));
$s = budget_state($cfg, 0.0, 10.0);
check('zero budget / spend -> EXCEEDED', $s['alert'] === 'EXCEEDED');
$s = budget_state($cfg, 1000.0, 500.0);
check('50% -> NORMAL', $s['alert'] === 'NORMAL' && $s['pct'] === 50.0 && $s['remaining'] === 500.0, json_encode($s));
check('NORMAL label', $s['label'] === 'ปกติ');
$s = budget_state($cfg, 1000.0, 800.0);
check('80% -> WARNING', $s['alert'] === 'WARNING' && $s['pct'] === 80.0, json_encode($s));
check('WARNING label', $s['label'] === 'ใกล้ถึงเกณฑ์');
$s = budget_state($cfg, 1000.0, 1000.0);
check('100% -> EXCEEDED', $s['alert'] === 'EXCEEDED');
$s = budget_state($cfg, 1000.0, 1250.0);
check('125% -> EXCEEDED, negative remaining', $s['alert'] === 'EXCEEDED' && $s['remaining'] === -250.0, json_encode($s));
check('EXCEEDED label', $s['label'] === 'เกินงบประมาณ');
$s = budget_state($cfg, 1000.0, 0.0);
check('0% -> NORMAL', $s['alert'] === 'NORMAL' && $s['remaining'] === 1000.0);

/* ================================================================= 3. budget_create */
echo "\n[3] budget_create()\n";
throws('year < 2000 rejected', fn() => budget_create($pdo, ['year' => 1999, 'month' => 1], 1));
throws('year > 2100 rejected', fn() => budget_create($pdo, ['year' => 2101, 'month' => 1], 1));
throws('month 0 rejected', fn() => budget_create($pdo, ['year' => 2030, 'month' => 0], 1));
throws('month 13 rejected', fn() => budget_create($pdo, ['year' => 2030, 'month' => 13], 1));
throws('negative allocated rejected', fn() => budget_create($pdo, ['year' => 2030, 'month' => 1, 'allocated_budget' => -1], 1));

$c1 = budget_create($pdo, ['year' => 2030, 'month' => 1, 'allocated_budget' => 50000], 1);
$b1 = (int)$c1['id'];
$row = $pdo->query("SELECT status, allocated_budget, department_id, currency FROM budget_plan WHERE id = $b1")->fetch();
check('new budget status = draft', $row['status'] === 'draft');
check('allocated stored', approx((float)$row['allocated_budget'], 50000.0));
check('dept 0 stored as NULL', $row['department_id'] === null);
check('default currency THB', $row['currency'] === 'THB');

throws('duplicate company-wide (year+month, NULL dept) rejected', fn() => budget_create($pdo, ['year' => 2030, 'month' => 1, 'allocated_budget' => 1], 1));

$c2 = budget_create($pdo, ['year' => 2030, 'month' => 2, 'department_id' => 5, 'allocated_budget' => 20000], 1);
$b2 = (int)$c2['id'];
check('dept budget stored with dept id', (int)$pdo->query("SELECT department_id FROM budget_plan WHERE id = $b2")->fetchColumn() === 5);
throws('duplicate dept budget rejected', fn() => budget_create($pdo, ['year' => 2030, 'month' => 2, 'department_id' => 5, 'allocated_budget' => 1], 1));

/* ================================================================= 4. budget_update */
echo "\n[4] budget_update()\n";
budget_update($pdo, ['id' => $b1, 'allocated_budget' => 60000], 1);
check('draft update applied', approx((float)$pdo->query("SELECT allocated_budget FROM budget_plan WHERE id = $b1")->fetchColumn(), 60000.0));
throws('negative allocated rejected on update', fn() => budget_update($pdo, ['id' => $b1, 'allocated_budget' => -5], 1));

/* ================================================================= 5. submit / approve */
echo "\n[5] budget_submit() / budget_approve()\n";
budget_submit($pdo, $b1, 1);
check('draft -> submitted', (string)$pdo->query("SELECT status FROM budget_plan WHERE id = $b1")->fetchColumn() === 'submitted');
throws('submit from submitted rejected', fn() => budget_submit($pdo, $b1, 1));

budget_approve($pdo, $b1, 7);
$row = $pdo->query("SELECT status, approved_by FROM budget_plan WHERE id = $b1")->fetch();
check('submitted -> active', $row['status'] === 'active');
check('approved_by recorded', (int)$row['approved_by'] === 7);
throws('approve active rejected', fn() => budget_approve($pdo, $b1, 7));

$c3 = budget_create($pdo, ['year' => 2030, 'month' => 3, 'allocated_budget' => 1000], 1);
$b3 = (int)$c3['id'];
budget_approve($pdo, $b3, 1);
check('draft -> active (direct approve)', (string)$pdo->query("SELECT status FROM budget_plan WHERE id = $b3")->fetchColumn() === 'active');

/* ================================================================= 6. adjust / effective */
echo "\n[6] budget_adjust() / budget_effective()\n";
throws('adjust requires reason', fn() => budget_adjust($pdo, ['id' => $b3, 'adjustment_amount' => 100], 1));
$res = budget_adjust($pdo, ['id' => $b3, 'adjustment_amount' => 500, 'reason' => 'extra'], 1);
check('effective = allocated + adjustment', approx((float)$res['effective_budget'], 1500.0), json_encode($res));
budget_adjust($pdo, ['id' => $b3, 'adjustment_amount' => -300, 'reason' => 'cut'], 1);
check('multiple adjustments summed', approx(budget_effective($pdo, $b3, 1000.0), 1200.0));

$c4 = budget_create($pdo, ['year' => 2030, 'month' => 4, 'allocated_budget' => 1000], 1);
$b4 = (int)$c4['id'];
throws('adjust on draft rejected', fn() => budget_adjust($pdo, ['id' => $b4, 'adjustment_amount' => 1, 'reason' => 'x'], 1));

/* ================================================================= 7. close / cancel */
echo "\n[7] budget_close() / budget_cancel()\n";
budget_close($pdo, $b3, 1);
check('active -> closed', (string)$pdo->query("SELECT status FROM budget_plan WHERE id = $b3")->fetchColumn() === 'closed');
throws('close draft rejected', fn() => budget_close($pdo, $b4, 1));
budget_cancel($pdo, $b4, 1);
check('draft -> cancelled', (string)$pdo->query("SELECT status FROM budget_plan WHERE id = $b4")->fetchColumn() === 'cancelled');
throws('cancel active rejected', fn() => budget_cancel($pdo, $b1, 1));
throws('unknown budget id', fn() => budget_close($pdo, 999999, 1));

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
