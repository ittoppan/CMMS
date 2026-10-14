<?php
/**
 * scripts/test_failure.php — behavioral harness for the Phase-27 Failure
 * Analysis & Root Cause Management engine.
 *
 * Covers src/helpers/failure.php:
 *   - failure_roles_*()            RBAC role sets
 *   - failure_event_validate()     severity/production_impact coercion + throws
 *   - failure_has_view()           information_schema lookup
 *   - failure_next_code()          per-day sequential code (rollover >999,
 *                                  non-numeric suffix tolerance)
 *   - failure_event_evaluate()     repeat / critical_asset / downtime triggers
 *   - failure_rca_transition()     RCA state machine + mandatory-action gate
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_faltest".
 *
 *   php scripts/test_failure.php [--keep]
 *
 * SAFETY: refuses to run unless the scratch name ends in "_faltest", differs
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
$scratch = $live . '_faltest';

if (!str_ends_with($scratch, '_faltest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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

echo "Failure-engine harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/audit.php';       // audit_log()
require_once __DIR__ . '/../src/helpers/notification.php'; // notification stack
require_once __DIR__ . '/../src/helpers/failure.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

/* ================================================================= 1. roles */
echo "\n[1] failure_roles_*()\n";
check('edit roles = [1,2,6,7]', failure_roles_edit() === [1, 2, 6, 7]);
check('manage roles = [1,2,6]', failure_roles_manage() === [1, 2, 6]);
check('approve roles = [1,2,6]', failure_roles_approve() === [1, 2, 6]);
check('taxonomy roles = [1,2,6]', failure_roles_taxonomy() === [1, 2, 6]);

/* ================================================================= 2. event validate */
echo "\n[2] failure_event_validate()\n";
throws('empty description throws', fn() => failure_event_validate(['description' => '   ']));
$v = failure_event_validate(['description' => ' bearing seized ']);
check('default severity = medium', $v['sev'] === 'medium');
check('default production_impact = empty', $v['prod'] === '');
check('description trimmed', $v['desc'] === 'bearing seized');
$v = failure_event_validate(['description' => 'x', 'severity' => 'critical']);
check('valid severity kept', $v['sev'] === 'critical');
$v = failure_event_validate(['description' => 'x', 'severity' => 'bogus']);
check('invalid severity -> medium', $v['sev'] === 'medium');
$v = failure_event_validate(['description' => 'x', 'production_impact' => 'line_stopped']);
check('valid production_impact kept', $v['prod'] === 'line_stopped');
$v = failure_event_validate(['description' => 'x', 'production_impact' => 'bogus']);
check('invalid production_impact -> other', $v['prod'] === 'other');
$v = failure_event_validate(['description' => str_repeat('a', 25000)]);
check('description truncated to 20000', mb_strlen($v['desc']) === 20000);

/* ================================================================= 3. has_view */
echo "\n[3] failure_has_view()\n";
check('base table exists -> true', failure_has_view('failure_events') === true);
check('missing view -> false', failure_has_view('v_does_not_exist_xyz') === false);

/* ================================================================= 4. failure_next_code */
echo "\n[4] failure_next_code()\n";
$clear = fn() => $pdo->exec('DELETE FROM failure_events');
$ins = fn(string $c) => $pdo->prepare('INSERT INTO failure_events (event_code) VALUES (?)')->execute([$c]);
$next = fn() => failure_next_code($pdo, 'FE', 'failure_events', 'event_code');
$base = 'FE-' . date('Ymd') . '-';

$clear();
check('empty table -> 001', $next() === $base . '001');
$clear(); $ins($base . '001');
check('001 -> 002', $next() === $base . '002');
$clear(); $ins($base . '009');
check('009 -> 010', $next() === $base . '010');
$clear(); $ins($base . '099');
check('099 -> 100', $next() === $base . '100');
$clear(); $ins($base . '999');
check('999 -> 1000', $next() === $base . '1000');
$clear(); $ins($base . '999'); $ins($base . '1000');
check('999,1000 -> 1001 (numeric rollover)', $next() === $base . '1001');
$clear(); $ins($base . 'ABC');
check('non-numeric suffix ignored -> 001', $next() === $base . '001');
$clear(); $ins($base . 'ABC'); $ins($base . '005');
check('noise + 005 -> 006', $next() === $base . '006');
$clear();
check('sanitises table/column identifiers', $next() === $base . '001');

/* ================================================================= 5. failure_event_evaluate */
echo "\n[5] failure_event_evaluate()\n";
$clear();
$mkAsset = function (string $code, string $name, ?string $crit) use ($pdo): int {
    $pdo->prepare('INSERT INTO asset_registry (code, name, criticality) VALUES (?,?,?)')->execute([$code, $name, $crit]);
    return (int)$pdo->lastInsertId();
};
$mkEvent = function (int $assetId, ?int $mode, ?int $dt, ?int $repairId = null) use ($pdo): int {
    $pdo->prepare('INSERT INTO failure_events (event_code, asset_id, failure_mode_id, downtime_minutes, repair_id, failure_date) VALUES (?,?,?,?,?,?)')
        ->execute(['EV-' . bin2hex(random_bytes(6)), $assetId, $mode, $dt, $repairId, date('Y-m-d H:i:s')]);
    return (int)$pdo->lastInsertId();
};

$a1 = $mkAsset('FAL-1', 'Asset One', 'B');
$e1 = $mkEvent($a1, null, null);
$r = failure_event_evaluate($pdo, $e1);
check('no repair / no trigger -> not required', $r['rca_required'] === false, json_encode($r));
check('no repair -> reason no_repair_link', in_array('no_repair_link', $r['reasons'], true), json_encode($r['reasons']));
check('single event -> not repeat', $r['repeat_suspected'] === false);

$aCrit = $mkAsset('FAL-2', 'Asset Critical', 'A');
$eC = $mkEvent($aCrit, null, null);
$r = failure_event_evaluate($pdo, $eC);
check('critical asset -> required', $r['rca_required'] === true);
check('critical asset reason present', in_array('critical_asset', $r['reasons'], true), json_encode($r['reasons']));

$aDt = $mkAsset('FAL-3', 'Asset Downtime', 'B');
$eDt = $mkEvent($aDt, null, 300);
$r = failure_event_evaluate($pdo, $eDt);
check('downtime 300 >= 240 -> required', $r['rca_required'] === true && in_array('downtime', $r['reasons'], true), json_encode($r['reasons']));
$aDt2 = $mkAsset('FAL-4', 'Asset Downtime Low', 'B');
$eDt2 = $mkEvent($aDt2, null, 100);
$r = failure_event_evaluate($pdo, $eDt2);
check('downtime 100 < 240 -> not required', $r['rca_required'] === false, json_encode($r));

$aRep = $mkAsset('FAL-5', 'Asset Repair', 'B');
$pdo->prepare('INSERT INTO repair (asset_id, title, priority) VALUES (?,?,?)')->execute([$aRep, 'WO test', 'critical']);
$rep = (int)$pdo->lastInsertId();
$eRep = $mkEvent($aRep, null, null, $rep);
$r = failure_event_evaluate($pdo, $eRep);
check('linked repair priority critical -> required', $r['rca_required'] === true && in_array('high_priority', $r['reasons'], true), json_encode($r['reasons']));

$aR = $mkAsset('FAL-6', 'Asset Repeat', 'B');
$mkEvent($aR, null, null);
$mkEvent($aR, null, null);
$eR3 = $mkEvent($aR, null, null);
$r = failure_event_evaluate($pdo, $eR3);
check('3rd same-asset event -> repeat suspected', $r['repeat_suspected'] === true, json_encode($r));
check('repeat -> rca required', $r['rca_required'] === true);
check('repeat reason present', (bool)array_filter($r['reasons'], fn($x) => str_starts_with($x, 'repeat:')), json_encode($r['reasons']));

/* ================================================================= 6. RCA transition */
echo "\n[6] failure_rca_transition()\n";
$mkRca = function (string $status) use ($pdo): int {
    $pdo->prepare('INSERT INTO rca (rca_code, title, status) VALUES (?,?,?)')
        ->execute(['RCA-' . bin2hex(random_bytes(6)), 'Test RCA', $status]);
    return (int)$pdo->lastInsertId();
};
$rcaStatus = fn(int $id) => (string)$pdo->query("SELECT status FROM rca WHERE id = $id")->fetchColumn();

$rca = $mkRca('open');
throws('invalid target status rejected', fn() => failure_rca_transition($pdo, $rca, 'bogus', 1));
throws('open -> closed invalid', fn() => failure_rca_transition($pdo, $rca, 'closed', 1));
$res = failure_rca_transition($pdo, $rca, 'investigating', 1);
check('open -> investigating ok', $res['from'] === 'open' && $res['to'] === 'investigating');
check('status persisted', $rcaStatus($rca) === 'investigating');
check('started_at stamped', (string)$pdo->query("SELECT started_at FROM rca WHERE id = $rca")->fetchColumn() !== '');
throws('investigating -> closed invalid', fn() => failure_rca_transition($pdo, $rca, 'closed', 1));
failure_rca_transition($pdo, $rca, 'root_cause_identified', 1);
check('-> root_cause_identified', $rcaStatus($rca) === 'root_cause_identified');
failure_rca_transition($pdo, $rca, 'action_in_progress', 1);
failure_rca_transition($pdo, $rca, 'verification', 1);
check('-> verification', $rcaStatus($rca) === 'verification');

$pdo->prepare('INSERT INTO rca_actions (rca_id, title, is_mandatory) VALUES (?,?,1)')->execute([$rca, 'Mandatory fix']);
throws('verification -> closed blocked by mandatory action', fn() => failure_rca_transition($pdo, $rca, 'closed', 1));
$pdo->prepare("UPDATE rca_actions SET status = 'verified' WHERE rca_id = ?")->execute([$rca]);
failure_rca_transition($pdo, $rca, 'closed', 1);
check('closed after mandatory action verified', $rcaStatus($rca) === 'closed');
$row = $pdo->query("SELECT closed_by, completed_at FROM rca WHERE id = $rca")->fetch();
check('closed_by + completed_at set', (int)$row['closed_by'] === 1 && (string)$row['completed_at'] !== '');
failure_rca_transition($pdo, $rca, 'reopened', 1);
check('closed -> reopened', $rcaStatus($rca) === 'reopened');
check('reopen_count incremented', (int)$pdo->query("SELECT reopen_count FROM rca WHERE id = $rca")->fetchColumn() === 1);
throws('reopened -> closed invalid', fn() => failure_rca_transition($pdo, $rca, 'closed', 1));

$rca2 = $mkRca('open');
failure_rca_transition($pdo, $rca2, 'cancelled', 1);
check('open -> cancelled', $rcaStatus($rca2) === 'cancelled');
throws('cancelled -> closed invalid', fn() => failure_rca_transition($pdo, $rca2, 'closed', 1));
failure_rca_transition($pdo, $rca2, 'reopened', 1);
check('cancelled -> reopened', $rcaStatus($rca2) === 'reopened');
throws('unknown rca id', fn() => failure_rca_transition($pdo, 999999, 'investigating', 1));

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
