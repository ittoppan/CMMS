<?php
/**
 * scripts/test_engineering_change.php — behavioral harness for the engineering
 * change (ECR) engine (src/helpers/engineering_change.php).
 *
 * Covers: label maps, ecr_transitions, ecr_assert_transition, ecr_next_actions,
 * ecr_next_no (delete-safe numbering), ecr_config defaults, and a full lifecycle
 * workflow: create -> submit -> review -> impact -> approval blockers ->
 * request_approval -> step approvals -> implementation -> verification -> close,
 * plus cancel/reject/reopen and ecr_impact_add.
 *
 * Runs against a THROWAWAY database = live DB name + "_ecrtest".
 *   php scripts/test_engineering_change.php [--keep]
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
$scratch = $live . '_ecrtest';

if (!str_ends_with($scratch, '_ecrtest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Engineering-change harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/engineering_change.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$_SESSION = ['role_id' => 1];   // approve as admin (bypasses the role gate)
$requester = 100; $approver = 1000;

/* ================================================================= 1. maps */
echo "\n[1] label maps / transitions\n";
check('11 statuses', count(ecr_statuses()) === 11);
check('4 priorities', count(ecr_priorities()) === 4);
check('8 change types', count(ecr_change_types()) === 8);
check('4 impact statuses', count(ecr_impact_statuses()) === 4);
check('4 link action statuses', count(ecr_link_action_statuses()) === 4);
check('10 link types', count(ecr_link_types()) === 10);
check('9 target types', count(ecr_target_types()) === 9);
check('6 verification methods', count(ecr_verification_methods()) === 6);
$tr = ecr_transitions();
check('submit only from draft', $tr['submit'] === ['draft']);
check('reject from 3 states', $tr['reject'] === ['under_review', 'impact_assessment', 'pending_approval']);

/* ================================================================= 2. assert_transition */
echo "\n[2] ecr_assert_transition()\n";
try { ecr_assert_transition(['status' => 'draft'], 'submit'); check('submit from draft ok', true); }
catch (Throwable $e) { check('submit from draft ok', false, $e->getMessage()); }
throws('submit from under_review throws', fn() => ecr_assert_transition(['status' => 'under_review'], 'submit'));
throws('unknown action throws', fn() => ecr_assert_transition(['status' => 'draft'], 'frobnicate'));

/* ================================================================= 3. next_actions */
echo "\n[3] ecr_next_actions()\n";
check('draft -> submit,cancel', ecr_next_actions(['status' => 'draft']) === ['submit', 'cancel']);
check('verification -> record_verification,rework,close', ecr_next_actions(['status' => 'verification']) === ['record_verification', 'rework', 'close']);
check('completed -> none', ecr_next_actions(['status' => 'completed']) === []);
check('unknown -> none', ecr_next_actions(['status' => 'zzz']) === []);

/* ================================================================= 4. next_no */
echo "\n[4] ecr_next_no()\n";
$base = 'ECR-' . date('Y') . '-';
$clear = fn() => $pdo->exec('DELETE FROM engineering_changes');
$ins = fn(string $no) => $pdo->prepare('INSERT INTO engineering_changes (ecr_no, title) VALUES (?, ?)')->execute([$no, 't']);
$clear();
check('empty -> 001', ecr_next_no($pdo, (int)date('Y')) === $base . '001', ecr_next_no($pdo, (int)date('Y')));
$clear(); $ins($base . '001'); $ins($base . '002'); $ins($base . '003');
check('001..003 -> 004', ecr_next_no($pdo) === $base . '004', ecr_next_no($pdo));
$pdo->prepare('DELETE FROM engineering_changes WHERE ecr_no = ?')->execute([$base . '002']);
check('delete middle -> still free number (004)', ecr_next_no($pdo) === $base . '004', ecr_next_no($pdo));
$clear();

/* ================================================================= 5. config defaults */
echo "\n[5] ecr_config() defaults\n";
$cfg = ecr_config($pdo);
check('impact_required default true', $cfg['impact_required'] === true);
check('impact_min_critical default 1', $cfg['impact_min_critical'] === 1);
check('critical_guards default', $cfg['critical_guards'] === ['owner_required', 'action_required'], json_encode($cfg['critical_guards']));
check('blocks_on_fail default true', $cfg['blocks_on_fail'] === true);
check('requires_doc_revisions default false', $cfg['requires_doc_revisions'] === false);
check('ack_blocks_close default true', $cfg['ack_blocks_close'] === true);
check('roles_for_step default [1,2,6]', ecr_roles_for_step($pdo, 'anything') === [1, 2, 6]);

/* ================================================================= 6. create validation */
echo "\n[6] ecr_create() validation\n";
throws('empty title throws', fn() => ecr_create($pdo, ['title' => ''], $requester));
throws('bad change_type throws', fn() => ecr_create($pdo, ['title' => 'x', 'change_type' => 'nope'], $requester));
throws('bad priority throws', fn() => ecr_create($pdo, ['title' => 'x', 'priority' => 'nope'], $requester));
throws('bad required_by_date throws', fn() => ecr_create($pdo, ['title' => 'x', 'required_by_date' => '2026/01/01'], $requester));

/* ================================================================= 7. full workflow */
echo "\n[7] full lifecycle\n";
$ecr = ecr_create($pdo, [
    'title' => 'เปลี่ยนวัสดุซีลปั๊ม P-01',
    'change_type' => 'design_change', 'priority' => 'high',
    'description' => 'เปลี่ยนวัสดุซีลเป็น Viton', 'reason' => 'ซีลชำรุดบ่อย',
], $requester);
$eid = (int)$ecr['id'];
check('created in draft', $ecr['status'] === 'draft');
check('ecr_no format', str_starts_with((string)$ecr['ecr_no'], $base), (string)$ecr['ecr_no']);

$ecr = ecr_submit($pdo, $eid, $requester);
check('submit -> submitted', $ecr['status'] === 'submitted');
throws('submit twice throws', fn() => ecr_submit($pdo, $eid, $requester));
$ecr = ecr_start_review($pdo, $eid, $approver);
check('start_review -> under_review', $ecr['status'] === 'under_review');
$ecr = ecr_start_impact($pdo, $eid, $requester);
check('start_impact -> impact_assessment', $ecr['status'] === 'impact_assessment');

$b = ecr_approval_blockers($pdo, $ecr);
check('blocked with no impacts', count($b) === 1 && str_contains($b[0], 'ประเมินผลกระทบ'), json_encode($b));

$imp = ecr_impact_add($pdo, $eid, ['impact_area' => 'safety', 'severity' => 'high', 'description' => 'ต้องทบทวนขั้นตอน'], $requester);
check('impact_add returns row', (int)$imp['id'] > 0);
$b = ecr_approval_blockers($pdo, $ecr);
check('non-critical impact clears basic blocker', $b === [], json_encode($b));

$crit = ecr_impact_add($pdo, $eid, ['impact_area' => 'production', 'severity' => 'critical', 'description' => 'หยุดผลิต 4 ชม.'], $requester);
$b = ecr_approval_blockers($pdo, $ecr);
check('critical impact w/o owner+action blocks', count($b) >= 2, json_encode($b));
$pdo->prepare("UPDATE engineering_change_impacts SET owner_id = 5, required_action = 'จัดตารางหยุด' WHERE id = ?")->execute([(int)$crit['id']]);
$b = ecr_approval_blockers($pdo, $ecr);
check('critical guards satisfied -> no blocker', $b === [], json_encode($b));

$ecr = ecr_request_approval($pdo, $eid, $requester);
check('request_approval -> pending_approval', $ecr['status'] === 'pending_approval');
$nAppr = (int)$pdo->query("SELECT COUNT(*) FROM engineering_change_approvals WHERE ecr_id = $eid")->fetchColumn();
check('2 approval steps created', $nAppr === 2, (string)$nAppr);
$step = ecr_current_step($pdo, $eid);
check('current step = technical_review', ($step['step_key'] ?? null) === 'technical_review');

$r1 = ecr_approve_step($pdo, $approver, $eid, 1, 'approved');
check('step 1 approved, still pending', $r1['status'] === 'pending_approval' && $r1['all_approved'] === false);
$r2 = ecr_approve_step($pdo, $approver, $eid, 2, 'approved');
check('step 2 approved -> approved', $r2['status'] === 'approved' && $r2['all_approved'] === true);
$ecr = ecr_get($pdo, $eid);
check('status approved', $ecr['status'] === 'approved');

$ecr = ecr_start_implementation($pdo, $eid, $approver);
check('start_implementation -> implementation', $ecr['status'] === 'implementation');
$ib = ecr_implementation_blockers($pdo, $eid);
check('open impacts block implementation', count($ib) >= 1, json_encode($ib));
$pdo->prepare("UPDATE engineering_change_impacts SET status = 'completed' WHERE ecr_id = ?")->execute([$eid]);
$ib = ecr_implementation_blockers($pdo, $eid);
check('completed impacts clear blocker', $ib === [], json_encode($ib));

$ecr = ecr_mark_implemented($pdo, $eid, $approver);
check('mark_implemented -> verification', $ecr['status'] === 'verification');

$ver = ecr_record_verification($pdo, $eid, ['result' => 'pass', 'verification_method' => 'functional_test', 'notes' => 'ทำงานปกติ'], $approver);
check('verification pass recorded round 1', $ver['round'] === 1 && $ver['result'] === 'pass' && $ver['status'] === 'verification', json_encode($ver));
$ecr = ecr_get($pdo, $eid);
$cb = ecr_close_blockers($pdo, $ecr);
check('close blockers empty after pass', $cb === [], json_encode($cb));
$ecr = ecr_close($pdo, $eid, 'ปิดงานเรียบร้อย', $approver);
check('close -> completed', $ecr['status'] === 'completed');
check('next_actions none after close', ecr_next_actions($ecr) === []);

/* ================================================================= 8. verification fail -> rework */
echo "\n[8] verification fail path\n";
$e2 = ecr_create($pdo, ['title' => 'Fail path', 'change_type' => 'other', 'description' => 'd', 'reason' => 'r'], $requester);
$id2 = (int)$e2['id'];
ecr_submit($pdo, $id2, $requester);
ecr_start_review($pdo, $id2, $approver);
ecr_start_impact($pdo, $id2, $requester);
ecr_impact_add($pdo, $id2, ['impact_area' => 'other', 'severity' => 'low', 'description' => 'x'], $requester);
ecr_request_approval($pdo, $id2, $requester);
ecr_approve_step($pdo, $approver, $id2, 1, 'approved');
ecr_approve_step($pdo, $approver, $id2, 2, 'approved');
ecr_start_implementation($pdo, $id2, $approver);
$pdo->prepare("UPDATE engineering_change_impacts SET status = 'completed' WHERE ecr_id = ?")->execute([$id2]);
ecr_mark_implemented($pdo, $id2, $approver);
throws('verification fail without reason throws', fn() => ecr_record_verification($pdo, $id2, ['result' => 'fail', 'notes' => 'n'], $approver));
$vf = ecr_record_verification($pdo, $id2, ['result' => 'fail', 'notes' => 'ยังรั่ว', 'failure_reason' => 'รอยรั่วที่หน้าแปลน'], $approver);
check('fail -> back to implementation', $vf['status'] === 'implementation');
$e2 = ecr_get($pdo, $id2);
$cb = ecr_close_blockers($pdo, $e2);
check('close blocked while latest result=fail', count($cb) >= 1, json_encode($cb));

/* ================================================================= 9. cancel / reject / reopen */
echo "\n[9] cancel / reject / reopen\n";
$e3 = ecr_create($pdo, ['title' => 'To cancel', 'change_type' => 'other'], $requester);
$id3 = (int)$e3['id'];
throws('cancel without reason throws', fn() => ecr_cancel($pdo, $id3, '   ', $requester));
$e3 = ecr_cancel($pdo, $id3, 'ไม่จำเป็นแล้ว', $requester);
check('cancel -> cancelled', $e3['status'] === 'cancelled');

$e4 = ecr_create($pdo, ['title' => 'To reject', 'change_type' => 'other', 'description' => 'd', 'reason' => 'r'], $requester);
$id4 = (int)$e4['id'];
ecr_submit($pdo, $id4, $requester);
ecr_start_review($pdo, $id4, $approver);
throws('reject without reason throws', fn() => ecr_reject($pdo, $id4, '', $approver));
$e4 = ecr_reject($pdo, $id4, 'ข้อมูลไม่ครบ', $approver);
check('reject -> rejected', $e4['status'] === 'rejected');
$e4 = ecr_reopen($pdo, $id4, $requester);
check('reopen -> draft', $e4['status'] === 'draft');

/* ================================================================= 10. self-approval guard */
echo "\n[10] segregation of duties\n";
$e5 = ecr_create($pdo, ['title' => 'Self approve', 'change_type' => 'other', 'description' => 'd', 'reason' => 'r'], $requester);
$id5 = (int)$e5['id'];
ecr_submit($pdo, $id5, $requester);
ecr_start_review($pdo, $id5, $approver);
ecr_start_impact($pdo, $id5, $requester);
ecr_impact_add($pdo, $id5, ['impact_area' => 'other', 'severity' => 'low', 'description' => 'x'], $requester);
ecr_request_approval($pdo, $id5, $requester);
throws('requester cannot approve own ECR', fn() => ecr_approve_step($pdo, $requester, $id5, 1, 'approved'));

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
