<?php
/**
 * scripts/test_contractor.php — behavioral harness for the contractor engine
 * (src/helpers/contractor.php).
 *
 * Covers: ctr_statuses / ctr_assignment_statuses / ctr_approval_statuses,
 * ctr_next_no (delete-safe sequence), ctr_sync_active, ctr_worker_autz,
 * ctr_assignment_transitions, ctr_permit_gate.
 *
 * Runs against a THROWAWAY database = live DB name + "_ctrtest".
 *   php scripts/test_contractor.php [--keep]
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
$scratch = $live . '_ctrtest';

if (!str_ends_with($scratch, '_ctrtest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function throws(string $label, callable $fn): void {
    try { $fn(); check($label, false, 'no exception thrown'); }
    catch (DomainException $e) { check($label, true); }
    catch (Throwable $e) { check($label, false, get_class($e) . ': ' . $e->getMessage()); }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Contractor harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/contractor.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* seed service categories BEFORE any ctr_config() call (static per-process cache) */
$pdo->prepare("INSERT INTO settings (setting_key, setting_group, setting_value) VALUES ('contractor_service_categories','contractor',?)")
    ->execute(['[{"key":"welding","requires_cert_codes":["WELD","SAFE"]},{"key":"general","requires_cert_codes":[]}]']);

/* ================================================================= 1. status sets */
echo "\n[1] ctr_statuses / ctr_assignment_statuses / ctr_approval_statuses\n";
check('8 contractor statuses', count(ctr_statuses()) === 8, (string)count(ctr_statuses()));
check('status has qualified/blocked/expired', isset(ctr_statuses()['qualified'], ctr_statuses()['blocked'], ctr_statuses()['expired']));
check('13 assignment statuses', count(ctr_assignment_statuses()) === 13, (string)count(ctr_assignment_statuses()));
check('approval statuses set', ctr_approval_statuses() === ['qualified', 'conditional', 'suspended', 'blocked', 'inactive']);

/* ================================================================= 2. next_no */
echo "\n[2] ctr_next_no()\n";
$base = 'CON-' . date('Y') . '-';
$clear = fn() => $pdo->exec('DELETE FROM contractors');
$ins = fn(string $code) => $pdo->prepare('INSERT INTO contractors (company_name, code) VALUES (?, ?)')->execute(['Co ' . $code, $code]);
$next = fn() => ctr_next_no($pdo, 'contractors', 'CON', 'code');
$clear();
check('empty -> 001', $next() === $base . '001', $next());
$clear(); $ins($base . '001'); $ins($base . '002'); $ins($base . '003');
check('001,002,003 -> 004', $next() === $base . '004', $next());
// delete the middle row: COUNT drops to 2 but the code 004 must still be produced
$pdo->prepare('DELETE FROM contractors WHERE code = ?')->execute([$base . '002']);
check('after delete middle -> 004 (not duplicate 003)', $next() === $base . '004', $next());
$clear(); $ins($base . '999'); $ins($base . '1000');
check('999,1000 -> 1001', $next() === $base . '1001', $next());
$clear();

/* ================================================================= 3. sync_active */
echo "\n[3] ctr_sync_active()\n";
$pdo->prepare('INSERT INTO contractors (company_name, code, status) VALUES (?,?,?)')->execute(['Active Co', $base . '500', 'draft']);
$cid = (int)$pdo->lastInsertId();
ctr_sync_active($pdo, $cid, 'qualified');
check('qualified -> is_active 1', (int)$pdo->query("SELECT is_active FROM contractors WHERE id = $cid")->fetchColumn() === 1);
ctr_sync_active($pdo, $cid, 'blocked');
check('blocked -> is_active 0', (int)$pdo->query("SELECT is_active FROM contractors WHERE id = $cid")->fetchColumn() === 0);
ctr_sync_active($pdo, $cid, 'suspended');
check('suspended -> is_active 1', (int)$pdo->query("SELECT is_active FROM contractors WHERE id = $cid")->fetchColumn() === 1);

/* ================================================================= 4. worker_autz */
echo "\n[4] ctr_worker_autz()\n";
check('missing worker -> unknown', ctr_worker_autz($pdo, 999999)['status'] === 'unknown');
$pdo->prepare('INSERT INTO contractor_workers (contractor_id, full_name) VALUES (?,?)')->execute([$cid, 'Somchai']);
$w = (int)$pdo->lastInsertId();
$r = ctr_worker_autz($pdo, $w);
check('no certs, no category -> na', $r['status'] === 'na', json_encode($r));
$r = ctr_worker_autz($pdo, $w, 'general');
check('category without cert rules -> na', $r['status'] === 'na', json_encode($r));

$addCert = function (string $code, ?string $expiry, int $active = 1) use ($pdo, $w) {
    $pdo->prepare('INSERT INTO worker_certifications (subject_type, contractor_worker_id, certification_code, certification_name, expiry_date, is_active) VALUES ("contractor",?,?,?,?,?)')
        ->execute([$w, $code, $code . ' cert', $expiry, $active]);
};
$addCert('WELD', date('Y-m-d', strtotime('+1 year')));
$r = ctr_worker_autz($pdo, $w);
check('one active cert, no category -> authorized', $r['status'] === 'authorized', json_encode($r));
$r = ctr_worker_autz($pdo, $w, 'welding');
check('welding missing SAFE -> not_authorized', $r['status'] === 'not_authorized' && $r['missing'] === ['SAFE'], json_encode($r));
$addCert('SAFE', date('Y-m-d', strtotime('+1 year')));
$r = ctr_worker_autz($pdo, $w, 'welding');
check('welding with WELD+SAFE -> authorized', $r['status'] === 'authorized', json_encode($r));
$addCert('EXPIRED', date('Y-m-d', strtotime('-1 day')));
$r = ctr_worker_autz($pdo, $w);
check('expired cert not counted', $r['status'] === 'authorized' && count($r['certs']) === 2, json_encode(array_column($r['certs'], 'certification_code')));

/* ================================================================= 5. transitions */
echo "\n[5] ctr_assignment_transitions()\n";
$tr = ctr_assignment_transitions();
$keys = array_keys(ctr_assignment_statuses());
check('keys == assignment statuses', array_keys($tr) === $keys, json_encode(array_diff(array_keys($tr), $keys)));
$ok = true; foreach ($tr as $tos) foreach ($tos as $to) if (!in_array($to, $keys, true)) $ok = false;
check('all targets known', $ok);
check('terminal closed/cancelled', $tr['closed'] === [] && $tr['cancelled'] === []);
check('requested -> contractor_selected', in_array('contractor_selected', $tr['requested'], true));
check('permit_ready -> work_started', in_array('work_started', $tr['permit_ready'], true));

/* ================================================================= 6. permit_gate */
echo "\n[6] ctr_permit_gate()\n";
$a = ['permit_required' => 0, 'permit_id' => 0, 'assignment_no' => 'A1', 'title' => 't', 'id' => 1, 'internal_owner_id' => 0];
try { ctr_permit_gate($pdo, $a); check('permit not required -> passes', true); } catch (Throwable $e) { check('permit not required -> passes', false, $e->getMessage()); }

$a['permit_required'] = 1;
throws('permit required but none -> throws', fn() => ctr_permit_gate($pdo, $a));

$a['permit_id'] = 999999;
throws('permit id not found -> throws', fn() => ctr_permit_gate($pdo, $a));

$mkPermit = function (string $status, ?string $validUntil) use ($pdo): int {
    $pdo->prepare('INSERT INTO work_permits (permit_no, status, valid_until) VALUES (?,?,?)')
        ->execute(['PTW-T-' . bin2hex(random_bytes(4)), $status, $validUntil]);
    return (int)$pdo->lastInsertId();
};

$a['permit_id'] = $mkPermit('draft', date('Y-m-d H:i:s', strtotime('+1 day')));
throws('permit draft -> throws', fn() => ctr_permit_gate($pdo, $a));

$a['permit_id'] = $mkPermit('approved', date('Y-m-d H:i:s', strtotime('+1 day')));
try { ctr_permit_gate($pdo, $a); check('permit approved + future -> passes', true); } catch (Throwable $e) { check('permit approved + future -> passes', false, $e->getMessage()); }

$a['permit_id'] = $mkPermit('active', date('Y-m-d H:i:s', strtotime('-1 hour')));
throws('permit expired -> throws', fn() => ctr_permit_gate($pdo, $a));

$a['permit_id'] = $mkPermit('active', null);
try { ctr_permit_gate($pdo, $a); check('permit active + no expiry -> passes', true); } catch (Throwable $e) { check('permit active + no expiry -> passes', false, $e->getMessage()); }

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
