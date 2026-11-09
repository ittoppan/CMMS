<?php
/**
 * scripts/test_document_control.php — behavioral harness for the controlled
 * document engine (src/helpers/document_control.php).
 *
 * Covers: label maps, doc_config defaults, document + revision transition maps,
 * doc_next_no (delete-safe), doc_rev_next_number (semantic), doc_validate_file
 * (path-traversal / folder / extension guards), doc_review_date, doc_create
 * validation + first revision, doc_update guards, doc_set_status guards, a full
 * revision lifecycle (create->submit->approve->effective with supersede),
 * impacts, acknowledgements, training, traceability links and QR tokens.
 *
 * Runs against a THROWAWAY database = live DB name + "_doctest".
 *   php scripts/test_document_control.php [--keep]
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
$scratch = $live . '_doctest';

if (!str_ends_with($scratch, '_doctest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Document-control harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/document_control.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$_SESSION = ['role_id' => 1];
$uid = 100; $approver = 1000;
$YEAR = date('Y');

/* temp upload fixture used by doc_validate_file / doc_rev_create */
$uploadDir = dirname(__DIR__) . '/public/uploads/documents';
if (!is_dir($uploadDir)) @mkdir($uploadDir, 0775, true);
$tmpName = 'harness_doc_' . bin2hex(random_bytes(4)) . '.txt';
$tmpFile = $uploadDir . '/' . $tmpName;
file_put_contents($tmpFile, 'controlled document fixture ' . microtime(true));
register_shutdown_function(fn() => @unlink($tmpFile));
$relPath = 'uploads/documents/' . $tmpName;

/* ================================================================= 1. maps */
echo "\n[1] label maps\n";
check('5 doc statuses', count(doc_statuses()) === 5);
check('8 rev statuses', count(doc_rev_statuses()) === 8);
check('11 impact areas', count(doc_impact_areas()) === 11);
check('4 severities', count(doc_severities()) === 4);
check('3 confidentiality', count(doc_confidentiality()) === 3);
check('4 impact statuses', count(doc_impact_statuses()) === 4);
check('6 link types', count(doc_link_types()) === 6);
check('12 entity labels', count(doc_entity_labels()) === 12);

/* ================================================================= 2. config defaults */
echo "\n[2] doc_config() defaults\n";
/* doc_config() caches the whole settings table on first call — seed before it. */
$pdo->prepare('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)')->execute([
    'document_ack_methods',
    json_encode([
        ['key' => 'read', 'label' => 'อ่านแล้วรับทราบ'],
        ['key' => 'signature', 'label' => 'ลงนามรับรอง'],
        ['key' => 'training', 'label' => 'ผ่านการฝึกอบรม'],
        ['key' => 'quiz', 'label' => 'ทดสอบความเข้าใจ'],
        ['key' => 'system', 'label' => 'บันทึกจากระบบ'],
    ]),
]);
$cfg = doc_config($pdo);
check('max_file_mb default 25', $cfg['max_file_mb'] === 25);
check('ack_due_days default 14', $cfg['ack_due_days'] === 14);
check('review_due_days default 30', $cfg['review_due_days'] === 30);
check('training_pass_score default 80', $cfg['training_pass_score'] === 80);
check('training_validity default 365', $cfg['training_validity'] === 365);
check('ack_assign_roles default [3,4]', $cfg['ack_assign_roles'] === [3, 4]);
check('require_impacts_closed default true', $cfg['require_impacts_closed'] === true);
check('require_training default false', $cfg['require_training'] === false);
check('qr_prefix default CMMS-D-', $cfg['qr_prefix'] === 'CMMS-D-');

/* ================================================================= 3. transitions */
echo "\n[3] transition maps\n";
$dt = doc_valid_transitions();
check('doc draft -> active/obsolete/archived', $dt['draft'] === ['active', 'obsolete', 'archived']);
check('doc archived -> none', $dt['archived'] === []);
$rt = doc_rev_valid_transitions();
check('rev draft -> under_review/obsolete', $rt['draft'] === ['under_review', 'obsolete']);
check('rev approved -> effective/obsolete', $rt['approved'] === ['effective', 'obsolete']);
check('rev obsolete -> none', $rt['obsolete'] === []);
try { doc_rev_assert_status(['status' => 'draft'], 'under_review'); check('rev assert valid ok', true); }
catch (Throwable $e) { check('rev assert valid ok', false, $e->getMessage()); }
throws('rev assert draft->effective throws', fn() => doc_rev_assert_status(['status' => 'draft'], 'effective'));

/* ================================================================= 4. next_no */
echo "\n[4] doc_next_no()\n";
$base = 'SOP-' . $YEAR . '-';
$clear = fn() => $pdo->exec('DELETE FROM controlled_documents');
$ins = fn(string $no) => $pdo->prepare('INSERT INTO controlled_documents (doc_no, title, doc_type) VALUES (?,?,?)')->execute([$no, 't', 'sop']);
$clear();
check('empty -> 001', doc_next_no($pdo, 'sop') === $base . '001', doc_next_no($pdo, 'sop'));
$clear(); $ins($base . '001'); $ins($base . '002'); $ins($base . '003');
check('001..003 -> 004', doc_next_no($pdo, 'sop') === $base . '004', doc_next_no($pdo, 'sop'));
$pdo->prepare('DELETE FROM controlled_documents WHERE doc_no = ?')->execute([$base . '002']);
$n = doc_next_no($pdo, 'sop');
check('after delete: no duplicate', $n !== $base . '001' && $n !== $base . '003', $n);
$clear();

/* ================================================================= 5. rev numbers */
echo "\n[5] doc_rev_next_number()\n";
$docId = null;
$clear();
$ins($base . '001');
$docId = (int)$pdo->lastInsertId();
check('no revision -> 1.0', doc_rev_next_number($pdo, $docId) === [1, 0, '1.0']);
$pdo->prepare("INSERT INTO document_revisions (document_id, revision_no, revision_major, revision_minor, status) VALUES (?,?,?,?,'draft')")
    ->execute([$docId, '1.0', 1, 0]);
check('1.0 -> 1.1', doc_rev_next_number($pdo, $docId) === [1, 1, '1.1']);
check('bump major -> 2.0', doc_rev_next_number($pdo, $docId, 1) === [2, 0, '2.0']);
$clear();

/* ================================================================= 6. validate_file */
echo "\n[6] doc_validate_file()\n";
check('empty path -> all null', doc_validate_file($pdo, [])['file_path'] === null);
throws('http url rejected', fn() => doc_validate_file($pdo, ['file_path' => 'http://evil/x.pdf']));
throws('backslash rejected', fn() => doc_validate_file($pdo, ['file_path' => 'uploads\\documents\\a.pdf']));
throws('traversal rejected', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/documents/../../etc/passwd']));
throws('wrong root rejected', fn() => doc_validate_file($pdo, ['file_path' => 'other/documents/a.pdf']));
throws('wrong subfolder rejected', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/manuals/a.pdf']));
throws('nested subfolder rejected', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/documents/sub/a.pdf']));
throws('missing real file rejected', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/documents/does_not_exist.txt']));
$vf = doc_validate_file($pdo, ['file_path' => $relPath]);
check('valid file -> file_name', $vf['file_name'] === $tmpName);
check('valid file -> path', $vf['file_path'] === $relPath);
check('valid file -> hash sha256', is_string($vf['content_hash']) && strlen($vf['content_hash']) === 64);
check('valid file -> size > 0', (int)$vf['file_size'] > 0);

/* ================================================================= 7. review date */
echo "\n[7] doc_review_date()\n";
check('default +365', doc_review_date($pdo, 'sop') === date('Y-m-d', strtotime('+365 days')), (string)doc_review_date($pdo, 'sop'));
check('explicit from', doc_review_date($pdo, 'sop', '2026-01-01') === date('Y-m-d', strtotime('2026-01-01 +365 days')));

/* ================================================================= 8. effective-date rules */
echo "\n[8] doc_validate_effective_date()\n";
$revStub = ['approved_at' => date('Y-m-d H:i:s', strtotime('-30 days'))];
throws('bad format throws', fn() => doc_validate_effective_date($pdo, $revStub, '2026/01/01'));
throws('backdate throws (default)', fn() => doc_validate_effective_date($pdo, $revStub, date('Y-m-d', strtotime('-1 day'))));
throws('future throws (default)', fn() => doc_validate_effective_date($pdo, $revStub, date('Y-m-d', strtotime('+1 day'))));
check('today ok', doc_validate_effective_date($pdo, $revStub, date('Y-m-d')) === date('Y-m-d'));
check('system mode allows backdate', doc_validate_effective_date($pdo, $revStub, date('Y-m-d', strtotime('-5 days')), 'system') === date('Y-m-d', strtotime('-5 days')));

/* ================================================================= 9. create validation */
echo "\n[9] doc_create() validation\n";
throws('empty title throws', fn() => doc_create($pdo, ['title' => ''], $uid));
$d = doc_create($pdo, ['title' => 'First Doc', 'doc_type' => 'sop'], $uid);
$doc1 = (int)$d['id'];
check('created draft', $d['status'] === 'draft');
check('auto doc_no', $d['doc_no'] === 'SOP-' . $YEAR . '-001', (string)$d['doc_no']);
check('first revision 1.0', $d['revision_no'] === '1.0');
check('revision row created', (int)$pdo->query("SELECT COUNT(*) FROM document_revisions WHERE document_id=$doc1")->fetchColumn() === 1);
check('bad conf -> internal', doc_get($pdo, $doc1)['confidentiality'] === 'internal');
throws('duplicate doc_no throws', fn() => doc_create($pdo, ['title' => 'Dup', 'doc_no' => $d['doc_no']], $uid));

/* ================================================================= 10. set_status / update guards */
echo "\n[10] document status & update guards\n";
throws('invalid status throws', fn() => doc_set_status($pdo, $doc1, 'bogus', $uid));
throws('draft -> active without effective throws', fn() => doc_set_status($pdo, $doc1, 'active', $uid));
throws('obsolete without reason throws', fn() => doc_set_status($pdo, $doc1, 'obsolete', $uid));
check('update title ok', (doc_update($pdo, $doc1, ['title' => 'First Doc v2'], $uid)['updated'] ?? 0) >= 1);
check('title changed', doc_get($pdo, $doc1)['title'] === 'First Doc v2');
throws('update bad confidentiality throws', fn() => doc_update($pdo, $doc1, ['confidentiality' => 'nope'], $uid));

/* ================================================================= 11. full revision lifecycle */
echo "\n[11] revision lifecycle\n";
$revId = (int)$d['revision_id'];
$dns = doc_create($pdo, ['title' => 'No Summary'], $uid);
$revNS = (int)$dns['revision_id'];
$pdo->exec("UPDATE document_revisions SET change_summary = '' WHERE id = $revNS");
throws('submit revision (no summary) throws', fn() => doc_rev_submit($pdo, $revNS, $uid));
$sub = doc_rev_submit($pdo, $revId, $uid);
check('submit -> under_review', $sub['status'] === 'under_review');
$nAppr = (int)$pdo->query("SELECT COUNT(*) FROM document_approvals WHERE revision_id=$revId")->fetchColumn();
check('2 approval steps created', $nAppr === 2, (string)$nAppr);
throws('skip step 2 throws', fn() => doc_rev_approve_step($pdo, $approver, $revId, 2, 'approved'));
$a1 = doc_rev_approve_step($pdo, $approver, $revId, 1, 'approved');
check('step1 -> pending_approval', $a1['status'] === 'pending_approval' && $a1['all_approved'] === false);
$a2 = doc_rev_approve_step($pdo, $approver, $revId, 2, 'approved');
check('step2 -> approved', $a2['status'] === 'approved' && $a2['all_approved'] === true);

try { doc_rev_effective($pdo, $revId, $approver, ''); check('effective w/o impact blocked', false, 'no exception'); }
catch (DomainException $e) { check('effective w/o impact blocked', true); }
doc_impact_add($pdo, $revId, ['impact_area' => 'other', 'severity' => 'low', 'description' => 'no impact', 'status' => 'not_applicable'], $uid);
$eff = doc_rev_effective($pdo, $revId, $approver, '');
check('effective -> effective', $eff['status'] === 'effective');
check('effective_date today', $eff['effective_date'] === date('Y-m-d'));
$docRow = doc_get($pdo, $doc1);
check('doc -> active', $docRow['status'] === 'active');
check('current_effective_revision_id set', (int)$docRow['current_effective_revision_id'] === $revId);

/* second revision supersedes the first */
$r2 = doc_rev_create($pdo, $doc1, ['change_summary' => 'Rev 2 update', 'file_path' => $relPath], $uid);
check('rev2 created 1.1', $r2['revision_no'] === '1.1', (string)$r2['revision_no']);
$rev2 = (int)$r2['id'];
doc_rev_submit($pdo, $rev2, $uid);
doc_rev_approve_step($pdo, $approver, $rev2, 1, 'approved');
doc_rev_approve_step($pdo, $approver, $rev2, 2, 'approved');
throws('rev2 effective w/o impact blocked', fn() => doc_rev_effective($pdo, $rev2, $approver, ''));
doc_impact_add($pdo, $rev2, ['impact_area' => 'quality', 'severity' => 'medium', 'description' => 'ok', 'status' => 'completed'], $uid);
$eff2 = doc_rev_effective($pdo, $rev2, $approver, '');
check('rev2 effective supersedes rev1', $eff2['status'] === 'effective' && $eff2['superseded_revision_no'] === '1.0', json_encode($eff2));
check('rev1 now superseded', doc_rev_get($pdo, $revId)['status'] === 'superseded');
check('doc points to rev2', (int)doc_get($pdo, $doc1)['current_effective_revision_id'] === $rev2);

/* apply_scheduled is a no-op when nothing scheduled */
$sched = doc_rev_apply_scheduled($pdo, 0);
check('apply_scheduled nothing -> empty', $sched['applied'] === [] && $sched['skipped'] === []);

/* obsolete revision clears pointer */
$rev3same = doc_rev_obsolete($pdo, $rev2, $approver, 'withdrawn');
check('obsolete rev -> obsolete', $rev3same['status'] === 'obsolete');
check('effective pointer cleared', doc_get($pdo, $doc1)['current_effective_revision_id'] === null);

/* ================================================================= 12. impact guards */
echo "\n[12] impacts\n";
$imp = doc_impact_add($pdo, $revNS, ['impact_area' => 'safety', 'severity' => 'high', 'description' => 'train staff'], $uid);
check('impact added open', $imp['status'] === 'open');
throws('bad area throws', fn() => doc_impact_add($pdo, $revNS, ['impact_area' => 'nope', 'description' => 'x'], $uid));
throws('no description throws', fn() => doc_impact_add($pdo, $revNS, ['impact_area' => 'safety', 'description' => ''], $uid));
$up = doc_impact_update($pdo, (int)$imp['id'], ['status' => 'completed'], $uid);
check('impact update -> completed', $up['status'] === 'completed');
check('impact completed_at set', doc_impact_get($pdo, (int)$imp['id'])['completed_at'] !== null);
throws('impact bad status throws', fn() => doc_impact_update($pdo, (int)$imp['id'], ['status' => 'nope'], $uid));
check('impact_list returns rows', count(doc_impact_list($pdo, $revNS)) >= 1);

/* ================================================================= 13. acknowledgements */
echo "\n[13] acknowledgements\n";
$pdo->prepare("INSERT INTO users (username,email,password,full_name,role_id,is_active) VALUES ('u3','u3@x.com','x','User Three',3,1)")->execute();
$u3 = (int)$pdo->lastInsertId();
$pdo->prepare("INSERT INTO users (username,email,password,full_name,role_id,is_active) VALUES ('u4','u4@x.com','x','User Four',4,1)")->execute();
$u4 = (int)$pdo->lastInsertId();
$da = doc_create($pdo, ['title' => 'Ack Doc', 'doc_type' => 'work_instruction', 'requires_acknowledgement' => 1], $uid);
$docA = (int)$da['id']; $revA = (int)$da['revision_id'];
doc_rev_update($pdo, $revA, ['change_summary' => 's'], $uid);
doc_rev_submit($pdo, $revA, $uid);
doc_rev_approve_step($pdo, $approver, $revA, 1, 'approved');
doc_rev_approve_step($pdo, $approver, $revA, 2, 'approved');
doc_impact_add($pdo, $revA, ['impact_area' => 'other', 'severity' => 'low', 'description' => 'n/a', 'status' => 'not_applicable'], $uid);
$effA = doc_rev_effective($pdo, $revA, $approver, '');
check('ack auto-assigned on effective', (int)$effA['acknowledgement_assigned'] === 2, (string)$effA['acknowledgement_assigned']);
$prog = doc_ack_progress($pdo, $docA);
check('ack progress total 2', $prog['total'] === 2 && $prog['pending'] === 2, json_encode($prog));
throws('acknowledge w/o based_on throws', fn() => doc_ack_acknowledge($pdo, $docA, $u3, 'read', null));
throws('acknowledge wrong revision throws', fn() => doc_ack_acknowledge($pdo, $docA, $u3, 'read', $revA + 999));
throws('acknowledge with training method throws', fn() => doc_ack_acknowledge($pdo, $docA, $u3, 'training', $revA));
$ack = doc_ack_acknowledge($pdo, $docA, $u3, 'read', $revA);
check('acknowledged', $ack['status'] === 'acknowledged');
check('progress pending now 1', doc_ack_progress($pdo, $docA)['pending'] === 1);
$again = doc_ack_acknowledge($pdo, $docA, $u3, 'read', $revA);
check('re-acknowledge idempotent', ($again['already'] ?? false) === true);
$ackRow = doc_ack_list($pdo, ['document_id' => $docA, 'status' => 'pending']);
check('ack_list pending 1', count($ackRow) === 1);
$exc = doc_ack_exception($pdo, (int)$ackRow[0]['id'], 'on leave', $approver);
check('ack exception recorded', $exc['status'] === 'exception');
throws('exception on acknowledged throws', fn() => doc_ack_exception($pdo, (int)$ack['id'], 'x', $approver));

/* ================================================================= 14. training */
echo "\n[14] training\n";
$tr = doc_training_add($pdo, $docA, $revA, ['course_code' => 'C-ACK', 'title' => 'Ack training', 'pass_score' => 80], $uid);
$tid = (int)$tr['id'];
check('training added', $tid > 0 && $tr['pass_score'] === 80);
throws('record bad status throws', fn() => doc_training_record($pdo, $tid, $u3, ['status' => 'nope'], $approver));
throws('pass without score throws', fn() => doc_training_record($pdo, $tid, $u3, ['status' => 'passed'], $approver));
throws('pass below threshold throws', fn() => doc_training_record($pdo, $tid, $u3, ['status' => 'passed', 'score' => 50], $approver));
$res = doc_training_record($pdo, $tid, $u3, ['status' => 'passed', 'score' => 90], $approver);
check('training passed', $res['status'] === 'passed' && $res['score'] === 90);
check('training expiry set', is_string($res['expires_at']));
$res2 = doc_training_record($pdo, $tid, $u3, ['status' => 'passed', 'score' => 95], $approver);
check('training attempt increments', $res2['attempts'] === 2, json_encode($res2));
$tp = doc_training_progress($pdo, $docA);
check('training progress passed 1', $tp['summary']['passed'] === 1, json_encode($tp['summary']));

/* ================================================================= 15. links */
echo "\n[15] traceability links\n";
$lk = doc_link_add($pdo, $doc1, null, ['entity_type' => 'document', 'entity_id' => $docA, 'link_type' => 'reference'], $uid);
$linkId = (int)$lk['id'];
check('link added', $linkId > 0);
$lk2 = doc_link_add($pdo, $doc1, null, ['entity_type' => 'revision', 'entity_id' => $revA, 'link_type' => 'reference'], $uid);
check('link to revision works (widened enum)', (int)$lk2['id'] > 0, json_encode($lk2));
throws('link to missing revision throws', fn() => doc_link_add($pdo, $doc1, null, ['entity_type' => 'revision', 'entity_id' => 999999], $uid));
throws('link bad entity_type throws', fn() => doc_link_add($pdo, $doc1, null, ['entity_type' => 'nope', 'entity_id' => 1], $uid));
throws('link missing entity throws', fn() => doc_link_add($pdo, $doc1, null, ['entity_type' => 'document', 'entity_id' => 999999], $uid));
throws('link bad link_type throws', fn() => doc_link_add($pdo, $doc1, null, ['entity_type' => 'document', 'entity_id' => $docA, 'link_type' => 'nope'], $uid));
check('links_list by doc', count(doc_links_list($pdo, $doc1)) === 2);
check('link_remove ok', doc_link_remove($pdo, $linkId, $uid)['removed'] === true);
check('links_list after remove', count(doc_links_list($pdo, $doc1)) === 1);
throws('link_remove missing throws', fn() => doc_link_remove($pdo, $linkId, $uid));

/* ================================================================= 16. QR tokens */
echo "\n[16] QR tokens\n";
$tok = doc_qr_token($pdo, $doc1, true);
check('qr token created', is_string($tok) && strlen($tok) === 16, $tok);
check('qr token stable', doc_qr_token($pdo, $doc1, false) === $tok);
check('qr payload prefixed', doc_qr_payload($pdo, $doc1) === 'CMMS-D-' . $tok);

/* ================================================================= 17. query helpers */
echo "\n[17] query helpers\n";
check('doc_list returns rows', count(doc_list($pdo)) >= 2);
check('doc_list filter doc_type', count(doc_list($pdo, ['doc_type' => 'work_instruction'])) === 1);
check('doc_list search', count(doc_list($pdo, ['search' => 'Ack Doc'])) === 1);
check('doc_revisions lists', count(doc_revisions($pdo, $docA)) === 1);
check('doc_approvals lists', count(doc_approvals($pdo, $revA)) === 2);
check('doc_detail returns doc', (doc_detail($pdo, $doc1)['id'] ?? 0) === $doc1);
check('doc_detail missing -> null', doc_detail($pdo, 999999) === null);
check('activity timeline non-empty', count(doc_activity_timeline($pdo, $doc1)) >= 1);

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
@unlink($tmpFile);

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
