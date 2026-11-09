<?php
/**
 * scripts/test_sage300.php — behavioral harness for src/helpers/sage300.php
 * (class Sage300Service).
 *
 * The ODBC path is intentionally kept OFFLINE: before any Sage call we set
 * SAGE300_ODBC_DSN/USER/PASS to bogus non-empty values so connectOdbc() skips the
 * .env fallback and fails fast (no real DSN, no hang). We cover:
 *   connectOdbc, probeConnection, getItemMaster, searchItems (all graceful-empty),
 *   postInventoryIssue, postInventoryReturn (cost accumulation + clamp + audit),
 *   logAudit (persistence + user name resolution).
 *
 * Runs against a THROWAWAY database named <live>_sagetest.
 *   php scripts/test_sage300.php [--keep]
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
$scratch = $live . '_sagetest';

if (!str_ends_with($scratch, '_sagetest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

/* Force the offline ODBC path: all three non-empty => .env fallback is skipped. */
putenv('SAGE300_ODBC_DSN=__CMMS_TEST_NO_SUCH_DSN__');
putenv('SAGE300_DB_USER=__none__');
putenv('SAGE300_DB_PASS=__none__');
$_ENV['SAGE300_ODBC_DSN'] = '__CMMS_TEST_NO_SUCH_DSN__';
$_ENV['SAGE300_DB_USER'] = '__none__';
$_ENV['SAGE300_DB_PASS'] = '__none__';

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Sage300 harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/sage300.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

function ins(PDO $pdo, string $table, array $data): int {
    $cols = array_keys($data);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES ('
        . implode(',', array_fill(0, count($cols), '?')) . ')';
    $pdo->prepare($sql)->execute(array_values($data));
    return (int)$pdo->lastInsertId();
}

$A1 = ins($pdo, 'asset_registry', ['code' => 'PMP-001', 'name' => 'Pump 1']);
$U1 = ins($pdo, 'users', ['username' => 'wh', 'email' => 'w@x.io', 'password' => 'x', 'full_name' => 'Warehouse User', 'role_id' => 7]);
$R1 = ins($pdo, 'repair', ['asset_id' => $A1, 'title' => 'Job', 'cost_parts' => 100]);

/* ================================================================= 1. connectOdbc */
echo "\n[1] connectOdbc() — offline failure\n";
$c = Sage300Service::connectOdbc();
check('success false', ($c['success'] ?? null) === false, json_encode(array_keys($c)));
check('error message present', !empty($c['error']), (string)($c['error'] ?? ''));
check('no connection object', !isset($c['connection']));

/* ================================================================= 2. probeConnection */
echo "\n[2] probeConnection()\n";
$p = Sage300Service::probeConnection();
check('connected false', ($p['connected'] ?? null) === false, json_encode($p));
check('driver none', ($p['driver'] ?? null) === 'none', json_encode($p));
check('detail connection_unavailable', ($p['detail'] ?? null) === 'connection_unavailable', json_encode($p));

/* ================================================================= 3. graceful-empty reads */
echo "\n[3] getItemMaster() / searchItems() with no ODBC\n";
$items = Sage300Service::getItemMaster();
check('getItemMaster returns empty array', $items === [], json_encode($items));
check('getItemMaster with itemNo still empty', Sage300Service::getItemMaster('SP-001') === []);
check('searchItems empty array', Sage300Service::searchItems('bearing') === []);
check('searchItems limit accepted', Sage300Service::searchItems('x', 5) === []);

/* ================================================================= 4. postInventoryIssue */
echo "\n[4] postInventoryIssue()\n";
$res = Sage300Service::postInventoryIssue($R1, [
    ['qty_issued' => 2, 'unit_cost' => 10],   // 20
    ['qty' => 3, 'unit_price' => 5],           // 15
    ['qty_issued' => 1],                        // 0
], $U1);
check('success true', ($res['success'] ?? null) === true, json_encode($res));
check('sage_doc_no null', array_key_exists('sage_doc_no', $res) && $res['sage_doc_no'] === null);
check('records_pending true', ($res['records_pending'] ?? null) === true);
check('total_cost 35 (qty/price fallbacks)', abs((float)$res['total_cost'] - 35.0) < 0.001, (string)$res['total_cost']);
$cost = (float)$pdo->query("SELECT cost_parts FROM repair WHERE id = $R1")->fetchColumn();
check('repair.cost_parts += 35 (100→135)', abs($cost - 135.0) < 0.001, (string)$cost);
$at = $pdo->query("SELECT * FROM audit_trail WHERE module='Sage300_Integration' AND action='Inventory_Issue' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('audit row written', is_array($at));
check('audit user_name resolved', ($at['user_name'] ?? null) === 'Warehouse User', (string)($at['user_name'] ?? ''));
check('audit new_value mentions WO', str_contains((string)($at['new_value'] ?? ''), "WO #$R1"), (string)($at['new_value'] ?? ''));

/* ================================================================= 5. postInventoryReturn */
echo "\n[5] postInventoryReturn()\n";
$res2 = Sage300Service::postInventoryReturn($R1, [
    ['qty_returned' => 2, 'unit_cost' => 10],  // 20
    ['qty' => 1, 'unit_price' => 5],            // 5
], $U1);
check('success true', ($res2['success'] ?? null) === true, json_encode($res2));
check('total_return_cost 25', abs((float)$res2['total_return_cost'] - 25.0) < 0.001, (string)$res2['total_return_cost']);
$cost2 = (float)$pdo->query("SELECT cost_parts FROM repair WHERE id = $R1")->fetchColumn();
check('repair.cost_parts -= 25 (135→110)', abs($cost2 - 110.0) < 0.001, (string)$cost2);

/* clamp: returning more than recorded never goes negative */
$res3 = Sage300Service::postInventoryReturn($R1, [['qty_returned' => 999, 'unit_cost' => 100]], $U1);
$cost3 = (float)$pdo->query("SELECT cost_parts FROM repair WHERE id = $R1")->fetchColumn();
check('cost clamped at 0 (GREATEST)', $cost3 === 0.0, (string)$cost3);
$at2 = $pdo->query("SELECT action FROM audit_trail WHERE module='Sage300_Integration' AND action='Inventory_Return' ORDER BY id DESC LIMIT 1")->fetchColumn();
check('return audit row written', $at2 === 'Inventory_Return', (string)$at2);

/* ================================================================= 6. logAudit */
echo "\n[6] logAudit()\n";
Sage300Service::logAudit($U1, 'TestMod', 'TestAct', ['a' => 1], 'plain');
$row = $pdo->query("SELECT * FROM audit_trail WHERE module='TestMod' AND action='TestAct' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('audit row inserted', is_array($row) && ($row['action'] ?? '') === 'TestAct');
check('array old_value json-encoded', ($row['old_value'] ?? '') === '{"a":1}', (string)($row['old_value'] ?? ''));
check('scalar new_value unchanged', ($row['new_value'] ?? '') === 'plain', (string)($row['new_value'] ?? ''));
check('ip_address set', !empty($row['ip_address']), (string)($row['ip_address'] ?? ''));
Sage300Service::logAudit(0, 'TestMod', 'NoUser', null, null);
$row2 = $pdo->query("SELECT user_name, user_id FROM audit_trail WHERE action='NoUser' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check('user_id 0 → user_name null', array_key_exists('user_name', $row2) && $row2['user_name'] === null, json_encode($row2));
check('user_id 0 stored as 0', (int)($row2['user_id'] ?? -1) === 0, json_encode($row2));

/* ------------------------------------------------------------------ done */
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }

if (!$KEEP) {
    try {
        $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
        echo "Dropped scratch DB $scratch\n";
    } catch (Throwable $e) { fwrite(STDERR, 'drop failed: ' . $e->getMessage() . "\n"); }
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}

exit($fail_count > 0 ? 1 : 0);
