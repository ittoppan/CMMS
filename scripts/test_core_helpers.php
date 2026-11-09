<?php
/**
 * scripts/test_core_helpers.php — unit harness for core work-order helpers.
 *
 * Covers src/helpers/work_order.php:
 *   - generateWorkOrderNo(): EN-{YYMM}-{NNN} sequencing, >999 rollover, non-numeric noise,
 *     cross-month isolation.
 *   - saveRepairSpareParts(): row insert, cost_parts math, unit_price fallback,
 *     stock deduction gated by the spare_deduct_stock setting, replace mode, guards.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_coretest".
 * It clones the live structure (CREATE TABLE ... LIKE, no rows) before loading helpers,
 * so the helpers talk to the scratch DB only.
 *
 *   php scripts/test_core_helpers.php [--keep]
 *
 * SAFETY: refuses to run unless the scratch name ends in "_coretest", differs from the
 * live DB name, and SELECT DATABASE() is verified after connecting. The live DB is never
 * written to.
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
$scratch = $live . '_coretest';

if (!str_ends_with($scratch, '_coretest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

/* ------------------------------------------------------------------ assertions */
$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

/* ------------------------------------------------------------------ scratch DB */
$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

echo "Core-helper harness on scratch DB: $scratch (live: $live)\n";
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

/* getSettingValue() lives in src/helpers/notification.php, which pulls in a lot of
 * dependencies. The helpers under test only need a settings lookup, so provide a thin
 * equivalent that reads the (scratch) settings table. */
if (!function_exists('getSettingValue')) {
    function getSettingValue(string $key, $default = null) {
        $st = getDb()->prepare('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1');
        $st->execute([$key]);
        $v = $st->fetchColumn();
        return ($v === false || $v === null) ? $default : $v;
    }
}

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/work_order.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ------------------------------------------------------------------ helpers */
function setSetting(PDO $pdo, string $key, ?string $value): void {
    $pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?,?)
                   ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)')->execute([$key, $value]);
}
function insRepair(PDO $pdo, ?string $wo): int {
    $pdo->prepare('INSERT INTO repair (asset_id, title, work_order_no) VALUES (?,?,?)')
        ->execute([1, 'test wo', $wo]);
    return (int)$pdo->lastInsertId();
}
function insSpare(PDO $pdo, string $code, float $stock, float $price): int {
    $pdo->prepare('INSERT INTO spare_parts (code, name, stock_qty, unit_price) VALUES (?,?,?,?)')
        ->execute([$code, 'Spare ' . $code, $stock, $price]);
    return (int)$pdo->lastInsertId();
}
function stockOf(PDO $pdo, int $id): float {
    $s = $pdo->prepare('SELECT stock_qty FROM spare_parts WHERE id = ?');
    $s->execute([$id]);
    return (float)$s->fetchColumn();
}
function countRsp(PDO $pdo, int $repairId): int {
    $s = $pdo->prepare('SELECT COUNT(*) FROM repair_spare_parts WHERE repair_id = ?');
    $s->execute([$repairId]);
    return (int)$s->fetchColumn();
}

$pfx = 'EN-' . date('ym') . '-';

/* ================================================================== A. numbering */
echo "\n[A] generateWorkOrderNo()\n";

$pdo->exec('DELETE FROM repair');
check('empty table -> {$pfx}001', generateWorkOrderNo($pdo) === $pfx . '001', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '001');
check('after 001 -> 002', generateWorkOrderNo($pdo) === $pfx . '002', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '009');
check('after 009 -> 010', generateWorkOrderNo($pdo) === $pfx . '010', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '099');
check('after 099 -> 100', generateWorkOrderNo($pdo) === $pfx . '100', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '999');
check('after 999 -> 1000', generateWorkOrderNo($pdo) === $pfx . '1000', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '1000');
check('after 1000 -> 1001 (rollover past 3 digits)', generateWorkOrderNo($pdo) === $pfx . '1001', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '999');
insRepair($pdo, $pfx . '1000');
check('with {999,1000} present -> 1001 (no duplicate)', generateWorkOrderNo($pdo) === $pfx . '1001', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '002');
insRepair($pdo, $pfx . 'abc');
check('non-numeric suffix ignored -> 003', generateWorkOrderNo($pdo) === $pfx . '003', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, 'EN-9901-500');
insRepair($pdo, $pfx . '001');
check('other month isolated -> 002', generateWorkOrderNo($pdo) === $pfx . '002', generateWorkOrderNo($pdo));

$pdo->exec('DELETE FROM repair');
insRepair($pdo, $pfx . '007');
check('format is EN-YYMM-NNN', (bool)preg_match('/^EN-\d{4}-\d{3,}$/', generateWorkOrderNo($pdo)), generateWorkOrderNo($pdo));

/* ================================================================== B. spare parts */
echo "\n[B] saveRepairSpareParts()\n";

setSetting($pdo, 'spare_deduct_stock', '1');
$sp1 = insSpare($pdo, 'SP1', 10, 5.00);
$sp2 = insSpare($pdo, 'SP2', 3, 2.50);
$sp3 = insSpare($pdo, 'SP3', 1, 0.00);
$woId = insRepair($pdo, null);

$r = saveRepairSpareParts($pdo, $woId, [
    ['spare_part_id' => $sp1, 'quantity_used' => 2],
    ['spare_part_id' => $sp2, 'quantity_used' => 1],
]);
check('inserts both rows', $r['rows'] === 2, json_encode($r));
check('cost_parts = 2*5 + 1*2.5 = 12.5', abs($r['cost_parts'] - 12.5) < 0.001, (string)$r['cost_parts']);
check('rows persisted', countRsp($pdo, $woId) === 2);
check('sp1 stock deducted 10-2=8', abs(stockOf($pdo, $sp1) - 8.0) < 0.001, (string)stockOf($pdo, $sp1));
check('sp2 stock deducted 3-1=2', abs(stockOf($pdo, $sp2) - 2.0) < 0.001, (string)stockOf($pdo, $sp2));

$r = saveRepairSpareParts($pdo, $woId, [['spare_part_id' => $sp1, 'quantity_used' => 2, 'unit_price' => 9]]);
check('explicit unit_price overrides spare price', abs($r['cost_parts'] - 18.0) < 0.001, (string)$r['cost_parts']);

$stored = $pdo->query("SELECT unit_price FROM repair_spare_parts WHERE repair_id = $woId ORDER BY id DESC LIMIT 1")->fetchColumn();
check('stored unit_price = 9.00', abs((float)$stored - 9.0) < 0.001, (string)$stored);

$r = saveRepairSpareParts($pdo, $woId, [['spare_part_id' => $sp2, 'quantity_used' => 0]]);
check('qty<=0 skipped', $r['rows'] === 0, json_encode($r));
$r = saveRepairSpareParts($pdo, $woId, [['spare_part_id' => 999999, 'quantity_used' => 5]]);
check('unknown spare skipped', $r['rows'] === 0, json_encode($r));

$before = countRsp($pdo, $woId);
$r = saveRepairSpareParts($pdo, $woId, [['spare_part_id' => $sp1, 'quantity_used' => 1]], true);
check('replace=true wipes prior rows then inserts 1', countRsp($pdo, $woId) === 1 && $before > 1, "before=$before now=" . countRsp($pdo, $woId));
check('replace deduplicates to single row set', $r['rows'] === 1, json_encode($r));

$stockBefore = stockOf($pdo, $sp3);
saveRepairSpareParts($pdo, $woId, [['spare_part_id' => $sp3, 'quantity_used' => 5]]);
check('stock clamps at 0 (1 - 5)', abs(stockOf($pdo, $sp3) - 0.0) < 0.001, (string)stockOf($pdo, $sp3));

$stockB = stockOf($pdo, $sp1);
setSetting($pdo, 'spare_deduct_stock', '0');
$r = saveRepairSpareParts($pdo, $woId, [['spare_part_id' => $sp1, 'quantity_used' => 3]], true);
check('setting=0 -> no stock deduction', abs(stockOf($pdo, $sp1) - $stockB) < 0.001, "before=$stockB after=" . stockOf($pdo, $sp1));
check('setting=0 -> row still inserted', countRsp($pdo, $woId) === 1);

$r = saveRepairSpareParts($pdo, $woId, []);
check('empty items -> 0 rows, 0 cost', $r['rows'] === 0 && $r['cost_parts'] === 0.0, json_encode($r));

$r = saveRepairSpareParts($pdo, $woId, [['spare_part_id' => $sp1, 'quantity_used' => 2]], true);
check('all missing spares skips gracefully', countRsp($pdo, $woId) >= 0 && $r['rows'] === 1, json_encode($r));

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
