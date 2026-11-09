<?php
/**
 * Phase 32 — business-rule test ของ src/helpers/document_control.php (controlled documents)
 *
 *   php scripts/test_phase32_document_control.php
 *
 * - ต่อ DB จริง (settings/notification_templates ต้องถูก apply แล้ว)
 * - ล้างข้อมูล Phase32 ที่เหลือก่อน/หลังรัน เพื่อไม่ให้มี fake data ค้างในระบบ
 * - exit 0 = ผ่านทุกข้อ, exit 1 = มีข้อที่ fail
 */
error_reporting(E_ALL);
ini_set('display_errors', '1');
require dirname(__DIR__) . '/src/config/db.php';
require dirname(__DIR__) . '/src/helpers/document_control.php';

$pdo = getDb();
$_SESSION['user_id'] = 1;
$_SESSION['role_id'] = 1;
$UID = 1;

// purge à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ Phase32 à¸—à¸µà¹ˆà¹€à¸«à¸¥à¸·à¸­à¸ˆà¸²à¸à¸£à¸­à¸šà¸à¹ˆà¸­à¸™ (à¹‚à¸¡à¸”à¸¹à¸¥à¹ƒà¸«à¸¡à¹ˆ à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸£à¸´à¸‡)
$revs = array_map('intval', $pdo->query('SELECT id FROM document_revisions')->fetchAll(PDO::FETCH_COLUMN));
$docs = array_map('intval', $pdo->query('SELECT id FROM controlled_documents')->fetchAll(PDO::FETCH_COLUMN));
if ($revs || $docs) {
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $ri = $revs ? implode(',', $revs) : '0';
    $di = $docs ? implode(',', $docs) : '0';
    foreach (['document_approvals' => 'revision_id', 'document_impacts' => 'revision_id', 'document_acknowledgements' => 'document_id', 'document_training_results' => 'training_id', 'document_training' => 'document_id', 'document_links' => 'document_id', 'document_activity' => 'document_id'] as $t => $col) {
        $pdo->exec("DELETE FROM `$t` WHERE $col IN ($ri) OR $col IN ($di)");
    }
    $pdo->exec("DELETE FROM document_revisions WHERE id IN ($ri)");
    $pdo->exec("DELETE FROM controlled_documents WHERE id IN ($di)");
    $pdo->exec("DELETE FROM notifications WHERE module IN ('document','engineering_change')");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    echo "purged: docs=" . count($docs) . " revs=" . count($revs) . "\n";
}

$pass = 0; $fail = 0;
function ok(string $label, bool $cond, string $extra = ''): void {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; echo "  FAIL  $label $extra\n"; }
}
function expectThrow(string $label, callable $fn, ?int $code = null): ?Throwable {
    global $pass, $fail;
    try { $fn(); $fail++; echo "  FAIL  $label (no exception thrown)\n"; return null; }
    catch (DomainException $e) {
        $got = (int)$e->getCode();
        if ($got < 400 || $got > 599) $got = 400; // API à¸—à¸³à¹à¸šà¸šà¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™ (contractor.php)
        if ($code !== null && $got !== $code) { $fail++; echo "  FAIL  $label (code $got != $code: {$e->getMessage()})\n"; return $e; }
        $pass++; echo "  PASS  $label -> {$e->getMessage()}\n"; return $e;
    }
    catch (Throwable $e) { $fail++; echo "  FAIL  $label (unexpected " . get_class($e) . ": {$e->getMessage()})\n"; return $e; }
}

// ---------- fixture: à¹„à¸Ÿà¸¥à¹Œ PDF à¸›à¸¥à¸­à¸¡à¹ƒà¸™ public/uploads/documents ----------
$dir = dirname(__DIR__) . '/public/uploads/documents';
if (!is_dir($dir)) { mkdir($dir, 0775, true); echo "+ created $dir\n"; }
$stamp = bin2hex(random_bytes(4));
$pdfName = "p32test-$stamp.pdf";
file_put_contents("$dir/$pdfName", "%PDF-1.4\n% phase32 test\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
$pdfPath = "uploads/documents/$pdfName";
$pdf2Name = "p32test-$stamp-2.pdf";
file_put_contents("$dir/$pdf2Name", "%PDF-1.4\n% phase32 test rev2\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
$pdf2Path = "uploads/documents/$pdf2Name";
$pdf3Name = "p32test-$stamp-3.pdf";
file_put_contents("$dir/$pdf3Name", "%PDF-1.4\n% phase32 test rev3\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
$pdf3Path = "uploads/documents/$pdf3Name";

$docId = 0; $rev1 = 0; $rev2 = 0;
try {
    echo "== 1. create document ==\n";
    $doc = doc_create($pdo, [
        'doc_type' => 'sop', 'title' => '[TEST] SOP ' . $stamp, 'description' => 'Phase32 automated test',
        'department_id' => null, 'asset_id' => null, 'confidentiality' => 'internal',
        'requires_acknowledgement' => 1, 'requires_training' => 0, 'review_cycle_days' => 730,
    ], $UID);
    $docId = (int)$doc['id'];
    ok('doc created', $docId > 0, json_encode($doc));
    ok('doc_no format SOP-YYYY-NNN', (bool)preg_match('~^SOP-\d{4}-\d{3}$~', (string)$doc['doc_no']), (string)$doc['doc_no']);
    ok('starts as draft', $doc['status'] === 'draft', (string)$doc['status']);
    ok('next_review_date from review cycle', !empty($doc['next_review_date']), json_encode($doc['next_review_date']));
    ok('à¸ªà¸£à¹‰à¸²à¸‡ revision à¹à¸£à¸ 1.0 à¹ƒà¸«à¹‰à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´', (int)$doc['revision_id'] > 0 && doc_rev_get($pdo, (int)$doc['revision_id'])['revision_no'] === '1.0', json_encode($doc['revision_id']));

    expectThrow('doc_type à¸›à¸¥à¸­à¸¡à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_create($pdo, ['doc_type' => 'xxx', 'title' => 'x'], $UID), 400);

    echo "== 2. file validation ==\n";
    expectThrow('à¹„à¸¡à¹ˆà¸¡à¸µà¹„à¸Ÿà¸¥à¹Œ -> revision à¹„à¸¡à¹ˆà¹„à¸”à¹‰', function () use ($pdo, $docId, $UID) {
        doc_rev_create($pdo, $docId, ['title' => 'r', 'change_summary' => 's'], $UID);
    }, 400);
    expectThrow('URL à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_validate_file($pdo, ['file_path' => 'https://x.com/a.pdf']), 400);
    expectThrow('path traversal à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/documents/../../src/config/db.php']), 400);
    expectThrow('à¸™à¸­à¸à¹‚à¸Ÿà¸¥à¹€à¸”à¸­à¸£à¹Œ documents à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/spares/x.pdf']), 400);
    expectThrow('à¹‚à¸Ÿà¸¥à¹€à¸”à¸­à¸£à¹Œà¸¢à¹ˆà¸­à¸¢à¸‹à¹‰à¸­à¸™à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/documents/a/b.pdf']), 400);
    expectThrow('à¹„à¸Ÿà¸¥à¹Œà¹„à¸¡à¹ˆà¸¡à¸µà¸ˆà¸£à¸´à¸‡', fn() => doc_validate_file($pdo, ['file_path' => 'uploads/documents/nope.pdf']), 400);
    $fv = doc_validate_file($pdo, ['file_path' => $pdfPath]);
    ok('à¹„à¸Ÿà¸¥à¹Œà¸—à¸µà¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡à¸œà¹ˆà¸²à¸™ + à¹„à¸”à¹‰ sha256', strlen((string)$fv['content_hash']) === 64, json_encode($fv));

    echo "== 3. revision 1.0 + approval chain ==\n";
    $r1 = doc_rev_create($pdo, $docId, [
        'title' => '[TEST] SOP rev1', 'change_summary' => 'à¸ªà¸£à¹‰à¸²à¸‡à¸„à¸£à¸±à¹‰à¸‡à¹à¸£à¸',
        'file_path' => $pdfPath, 'next_review_date' => null,
    ], $UID);
    $rev1 = (int)$r1['id'];
    ok('rev à¸–à¸±à¸”à¸ˆà¸²à¸ 1.0 à¹€à¸›à¹‡à¸™ 1.1 (doc_create à¸ªà¸£à¹‰à¸²à¸‡ 1.0 à¹ƒà¸«à¹‰)', ($r1['revision_no'] ?? '') === '1.1', json_encode($r1));
    ok('content_hash à¸–à¸¹à¸à¸šà¸±à¸™à¸—à¸¶à¸ + à¸„à¸·à¸™à¸„à¹ˆà¸²', strlen((string)($r1['content_hash'] ?? '')) === 64, json_encode($r1['content_hash'] ?? null));
    expectThrow('à¹à¸à¹‰ revision à¸—à¸µà¹ˆà¸¢à¸±à¸‡ draft à¹„à¸”à¹‰ à¹à¸•à¹ˆ effective à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_rev_effective($pdo, $rev1, $UID), 409);

    $sub = doc_rev_submit($pdo, $rev1, $UID);
    ok('submit -> under_review', $sub['status'] === 'under_review', json_encode($sub));
    $aps = doc_approvals($pdo, $rev1);
    ok('à¸ªà¸£à¹‰à¸²à¸‡ approval chain ' . count($aps) . ' à¸‚à¸±à¹‰à¸™', count($aps) >= 2, json_encode(array_column($aps, 'step_key')));
    ok('à¸—à¸¸à¸à¸‚à¸±à¹‰à¸™à¹€à¸£à¸´à¹ˆà¸¡ pending', count(array_filter($aps, fn($a) => $a['decision'] === 'pending')) === count($aps));

    expectThrow('à¸‚à¹‰à¸²à¸¡à¸¥à¸³à¸”à¸±à¸š: à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸‚à¸±à¹‰à¸™ 2 à¸à¹ˆà¸­à¸™à¸‚à¸±à¹‰à¸™ 1', fn() => doc_rev_approve_step($pdo, $UID, $rev1, (int)$aps[1]['step'], 'approved'), 409);
    expectThrow('à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸‚à¸±à¹‰à¸™à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µ', fn() => doc_rev_approve_step($pdo, $UID, $rev1, 99, 'approved'), 404);

    foreach ($aps as $i => $a) {
        $r = doc_rev_approve_step($pdo, $UID, $rev1, (int)$a['step'], 'approved', 'ok');
        $isLast = $i === count($aps) - 1;
        ok('à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸‚à¸±à¹‰à¸™ ' . $a['step'] . ' (' . $a['step_key'] . ') -> ' . $r['status'], $isLast ? $r['status'] === 'approved' : $r['status'] === 'pending_approval', json_encode($r));
    }
    expectThrow('à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸‹à¹‰à¸³à¸‚à¸±à¹‰à¸™à¹€à¸”à¸´à¸¡', fn() => doc_rev_approve_step($pdo, $UID, $rev1, (int)$aps[0]['step'], 'approved'), 409);
    ok('approved à¹à¸¥à¹‰à¸§à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¥à¸šà¸±à¸‡à¸„à¸±à¸šà¹ƒà¸Šà¹‰', doc_rev_get($pdo, $rev1)['status'] === 'approved');

    echo "== 4. effective guard: impact à¸•à¹‰à¸­à¸‡à¸–à¸¹à¸à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¹à¸¥à¸°à¸›à¸´à¸”à¸à¹ˆà¸­à¸™ ==\n";
    expectThrow('à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¥à¸à¸£à¸°à¸—à¸šà¹€à¸¥à¸¢ -> à¸›à¸£à¸°à¸à¸²à¸¨à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_rev_effective($pdo, $rev1, $UID), 409);
    $imp = doc_impact_add($pdo, $rev1, [
        'impact_area' => 'safety', 'severity' => 'high',
        'description' => 'à¸•à¹‰à¸­à¸‡à¸­à¸šà¸£à¸¡à¸Šà¹ˆà¸²à¸‡à¸à¹ˆà¸­à¸™', 'required_action' => 'à¸­à¸šà¸£à¸¡ 1 à¸§à¸±à¸™', 'owner_id' => $UID,
    ], $UID);
    ok('à¹€à¸žà¸´à¹ˆà¸¡à¸œà¸¥à¸à¸£à¸°à¸—à¸šà¹„à¸”à¹‰', (int)$imp['id'] > 0, json_encode($imp));
    expectThrow('impact à¸ªà¸–à¸²à¸™à¸° in_progress à¸šà¸¥à¹‡à¸­à¸à¸à¸²à¸£à¸›à¸£à¸°à¸à¸²à¸¨à¹ƒà¸Šà¹‰', fn() => doc_rev_effective($pdo, $rev1, $UID), 409);
    expectThrow('impact à¸ªà¸–à¸²à¸™à¸° open à¸šà¸¥à¹‡à¸­à¸à¸à¸²à¸£à¸›à¸£à¸°à¸à¸²à¸¨à¹ƒà¸Šà¹‰', function () use ($pdo, $imp, $rev1, $UID) {
        doc_impact_update($pdo, (int)$imp['id'], ['status' => 'open'], $UID);
        doc_rev_effective($pdo, $rev1, $UID);
    }, 409);
    expectThrow('impact à¸ªà¸–à¸²à¸™à¸°à¹„à¸¡à¹ˆà¸£à¸¹à¹‰à¸ˆà¸±à¸à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_impact_update($pdo, (int)$imp['id'], ['status' => 'pending'], $UID), 400);
    doc_impact_update($pdo, (int)$imp['id'], ['status' => 'in_progress'], $UID);
    expectThrow('à¸¢à¸·à¸™à¸¢à¸±à¸™ in_progress à¸¢à¸±à¸‡à¸šà¸¥à¹‡à¸­à¸ (à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™)', fn() => doc_rev_effective($pdo, $rev1, $UID), 409);
    doc_impact_update($pdo, (int)$imp['id'], ['status' => 'not_applicable'], $UID);
    $eff = doc_rev_effective($pdo, $rev1, $UID);
    ok('not_applicable -> effective à¹„à¸”à¹‰', $eff['status'] === 'effective', json_encode($eff));
    ok('document.status à¹€à¸›à¹‡à¸™ active', doc_get($pdo, $docId)['status'] === 'active');
    ok('current_effective_revision_id à¸Šà¸µà¹‰à¸–à¸¹à¸à¸‰à¸šà¸±à¸š', (int)doc_get($pdo, $docId)['current_effective_revision_id'] === $rev1);
    $cnt = $pdo->query("SELECT COUNT(*) FROM document_revisions WHERE document_id = " . $docId . " AND status = 'effective'")->fetchColumn();
    ok('à¸¡à¸µ effective à¹„à¸”à¹‰ 1 à¸‰à¸šà¸±à¸š', (int)$cnt === 1, "count=$cnt");

    echo "== 5. revision 1.1 supersede ==\n";
    $r2 = doc_rev_create($pdo, $docId, ['title' => '[TEST] SOP rev1.2', 'change_summary' => 'à¹à¸à¹‰à¹„à¸‚à¸„à¸£à¸±à¹‰à¸‡à¸—à¸µà¹ˆ 2', 'file_path' => $pdf2Path], $UID);
    $rev2 = (int)$r2['id'];
    ok('minor bump à¹€à¸›à¹‡à¸™ 1.2', ($r2['revision_no'] ?? '') === '1.2', json_encode($r2));
    expectThrow('content_hash à¸‹à¹‰à¸³à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜ (à¸ªà¸£à¹‰à¸²à¸‡)', function () use ($pdo, $docId, $UID, $pdfPath) {
        doc_rev_create($pdo, $docId, ['title' => 'dup', 'change_summary' => 'dup', 'file_path' => $pdfPath], $UID);
    }, 409);
    doc_rev_submit($pdo, $rev2, $UID);
    foreach (doc_approvals($pdo, $rev2) as $a) doc_rev_approve_step($pdo, $UID, $rev2, (int)$a['step'], 'approved');
    expectThrow('rev à¹ƒà¸«à¸¡à¹ˆà¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸œà¸¥à¸à¸£à¸°à¸—à¸š à¸›à¸£à¸°à¸à¸²à¸¨à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_rev_effective($pdo, $rev2, $UID), 409);
    doc_impact_add($pdo, $rev2, ['impact_area' => 'document', 'severity' => 'medium', 'description' => 'à¸•à¹‰à¸­à¸‡à¹à¸ˆà¹‰à¸‡à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰', 'required_action' => 'à¸›à¸£à¸°à¸à¸²à¸¨à¹ƒà¸™à¸£à¸°à¸šà¸š'], $UID);
    doc_impact_update($pdo, (int)doc_impact_list($pdo, $rev2)[0]['id'], ['status' => 'completed'], $UID);
    $eff2 = doc_rev_effective($pdo, $rev2, $UID);
    ok('rev1.1 effective', $eff2['status'] === 'effective');
    ok('rev1.0 à¸–à¸¹à¸ supersede', doc_rev_get($pdo, $rev1)['status'] === 'superseded', doc_rev_get($pdo, $rev1)['status']);
    ok('superseded_by_revision_id à¸Šà¸µà¹‰ rev2', (int)doc_rev_get($pdo, $rev1)['superseded_by_revision_id'] === $rev2);
    $cnt = $pdo->query("SELECT COUNT(*) FROM document_revisions WHERE document_id = $docId AND status = 'effective'")->fetchColumn();
    ok('à¸¢à¸±à¸‡à¸¡à¸µ effective à¹„à¸”à¹‰ 1 à¸‰à¸šà¸±à¸šà¸«à¸¥à¸±à¸‡ supersede', (int)$cnt === 1, "count=$cnt");

    echo "== 6. acknowledgement + offline guard ==\n";
    expectThrow('ack à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸£à¸°à¸šà¸¸ revision à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_ack_acknowledge($pdo, $docId, 61, 'read', null), 400);
    expectThrow('ack à¸ˆà¸²à¸ revision à¹€à¸à¹ˆà¸² (offline stale) -> 409', fn() => doc_ack_acknowledge($pdo, $docId, 61, 'read', $rev1), 409);
    expectThrow('ack à¸§à¸´à¸˜à¸µ training à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜ (à¸•à¹‰à¸­à¸‡à¸œà¹ˆà¸²à¸™à¸«à¸¥à¸±à¸à¸ªà¸¹à¸•à¸£)', fn() => doc_ack_acknowledge($pdo, $docId, 61, 'training', $rev2), 409);
    $a1 = doc_ack_acknowledge($pdo, $docId, 61, 'read', $rev2, 'à¸­à¹ˆà¸²à¸™à¹à¸¥à¹‰à¸§');
    ok('ack à¸‰à¸šà¸±à¸šà¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸ªà¸³à¹€à¸£à¹‡à¸ˆ', $a1['status'] === 'acknowledged', json_encode($a1));
    ok('based_on_revision_id = revision à¸—à¸µà¹ˆà¸­à¹ˆà¸²à¸™', (int)$a1['revision_id'] === $rev2);
    $a2 = doc_ack_acknowledge($pdo, $docId, 61, 'read', $rev2);
    ok('ack à¸‹à¹‰à¸³ idempotent', ($a2['already'] ?? false) === true, json_encode($a2));
    expectThrow('ack revision à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¥', fn() => doc_ack_acknowledge($pdo, $docId, 1, 'read', $rev1), 409);

    echo "== 7. training (à¸•à¹‰à¸­à¸‡à¸œà¸¹à¸à¸à¸±à¸š revision à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹€à¸›à¸´à¸”) ==\n";
    $tr = doc_training_add($pdo, $docId, $rev2, ['course_code' => 'TST-' . strtoupper($stamp), 'title' => 'à¸«à¸¥à¸±à¸à¸ªà¸¹à¸•à¸£à¸—à¸”à¸ªà¸­à¸š', 'pass_score' => 80, 'validity_days' => 365], $UID);
    ok('à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¥à¸±à¸à¸ªà¸¹à¸•à¸£à¹„à¸”à¹‰', (int)$tr['id'] > 0, json_encode($tr));
    $tr2 = doc_training_add($pdo, $docId, $rev2, ['course_code' => 'TST-' . strtoupper($stamp), 'title' => 'à¸«à¸¥à¸±à¸à¸ªà¸¹à¸•à¸£à¸—à¸”à¸ªà¸­à¸š'], $UID);
    ok('course_code à¸‹à¹‰à¸³ -> à¸­à¸±à¸›à¹€à¸”à¸•à¸‚à¸­à¸‡à¹€à¸”à¸´à¸¡', (int)$tr2['id'] === (int)$tr['id'], json_encode($tr2));
    ok('requires_training à¸–à¸¹à¸à¹€à¸›à¸´à¸”à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´', (int)doc_get($pdo, $docId)['requires_training'] === 1);
    $res = doc_training_record($pdo, (int)$tr['id'], 61, ['status' => 'failed', 'score' => 40], $UID);
    ok('à¸šà¸±à¸™à¸—à¸¶à¸à¸œà¸¥à¸ªà¸­à¸šà¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™', ($res['status'] ?? '') === 'failed', json_encode($res));
    $res2 = doc_training_record($pdo, (int)$tr['id'], 61, ['status' => 'passed', 'score' => 95], $UID);
    ok('à¸šà¸±à¸™à¸—à¸¶à¸à¸œà¸¥à¸ªà¸­à¸šà¸œà¹ˆà¸²à¸™ + attempts à¹€à¸žà¸´à¹ˆà¸¡', ($res2['status'] ?? '') === 'passed' && (int)($res2['attempts'] ?? 0) === 2, json_encode($res2));
    expectThrow('à¸œà¸¥à¸ªà¸­à¸šà¸„à¸°à¹à¸™à¸™à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸²à¹€à¸à¸“à¸‘à¹Œà¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_training_record($pdo, (int)$tr['id'], 61, ['status' => 'passed', 'score' => 50], $UID), 409);
    expectThrow('à¸œà¸¥à¸ªà¸­à¸šà¸ªà¸–à¸²à¸™à¸°à¹„à¸¡à¹ˆà¸£à¸¹à¹‰à¸ˆà¸±à¸à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_training_record($pdo, (int)$tr['id'], 61, ['status' => 'auto_pass'], $UID), 400);
    expectThrow('à¸œà¸¥à¸ªà¸­à¸šà¸„à¸°à¹à¸™à¸™à¸™à¸­à¸ 0-100 à¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_training_record($pdo, (int)$tr['id'], 61, ['status' => 'passed', 'score' => 150], $UID), 400);
    $ackAfterTraining = $pdo->prepare("SELECT status, method FROM document_acknowledgements WHERE revision_id = ? AND user_id = ?");
    $ackAfterTraining->execute([$rev2, 61]);
    $aT = $ackAfterTraining->fetch(PDO::FETCH_ASSOC);
    ok('à¸œà¹ˆà¸²à¸™à¸à¸²à¸£à¸à¸¶à¸à¸­à¸šà¸£à¸¡ -> ack à¸–à¸¹à¸à¸­à¸±à¸›à¹€à¸”à¸•à¹€à¸›à¹‡à¸™ training', ($aT['method'] ?? '') === 'training' && ($aT['status'] ?? '') === 'acknowledged', json_encode($aT));
    expectThrow('à¹€à¸žà¸´à¹ˆà¸¡à¸«à¸¥à¸±à¸à¸ªà¸¹à¸•à¸£à¹ƒà¸«à¹‰ revision à¸—à¸µà¹ˆà¸–à¸¹à¸ supersede à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_training_add($pdo, $docId, $rev1, ['course_code' => 'TST-X-' . strtoupper($stamp), 'title' => 'x'], $UID), 409);

    echo "== 8. scheduled + obsolete + immutability ==\n";
    $r3 = doc_rev_create($pdo, $docId, ['title' => '[TEST] SOP rev1.3', 'change_summary' => 'à¸—à¸”à¸ªà¸­à¸š schedule', 'file_path' => $pdf3Path], $UID);
    $rev3 = (int)$r3['id'];
    doc_rev_submit($pdo, $rev3, $UID);
    foreach (doc_approvals($pdo, $rev3) as $a) doc_rev_approve_step($pdo, $UID, $rev3, (int)$a['step'], 'approved');
    expectThrow('à¸¢à¹‰à¸­à¸™à¸§à¸±à¸™à¸—à¸µà¹ˆà¸¡à¸µà¸œà¸¥à¸à¹ˆà¸­à¸™à¸§à¸±à¸™à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´', fn() => doc_rev_schedule($pdo, $rev3, $UID, '2000-01-01'), 409);
    $future = date('Y-m-d', strtotime('+7 days'));
    $sc = doc_rev_schedule($pdo, $rev3, $UID, $future);
    ok('schedule à¸­à¸™à¸²à¸„à¸•à¹„à¸”à¹‰', $sc['effective_date'] === $future, json_encode($sc));
    // à¸ˆà¸³à¸¥à¸­à¸‡à¸§à¹ˆà¸²à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹€à¸¡à¸·à¹ˆà¸­à¸§à¸²à¸™ à¹à¸¥à¹‰à¸§ cron à¸¡à¸²à¸›à¸£à¸°à¸¢à¸à¸•à¹Œà¸§à¸±à¸™à¸—à¸µà¹ˆà¸—à¸µà¹ˆà¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸” (à¸¢à¹‰à¸­à¸™à¸«à¸¥à¸±à¸‡à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸° system mode)
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $pdo->prepare('UPDATE document_revisions SET approved_at = ? WHERE id = ?')->execute([$yesterday . ' 10:00:00', $rev3]);
    $rev3b = doc_rev_get($pdo, $rev3);
    $sys = doc_validate_effective_date($pdo, $rev3b, $yesterday, 'system');
    ok('system mode à¸›à¸£à¸°à¸¢à¸à¸•à¸´à¸§à¸±à¸™à¸—à¸µà¹ˆà¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”à¹„à¸”à¹‰ (cron à¹„à¸¡à¹ˆà¸„à¹‰à¸²à¸‡)', $sys === $yesterday, $sys);
    expectThrow('user mode à¸¢à¸±à¸‡à¸«à¹‰à¸²à¸¡à¸¢à¹‰à¸­à¸™à¹à¸¡à¹‰à¸ˆà¸°à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”', fn() => doc_validate_effective_date($pdo, $rev3b, $yesterday, 'user'), 409);
    expectThrow('system mode à¸à¹‡à¸«à¹‰à¸²à¸¡à¸¢à¹‰à¸­à¸™à¸à¹ˆà¸­à¸™à¸§à¸±à¸™à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´', fn() => doc_validate_effective_date($pdo, $rev3b, '2000-05-05', 'system'), 409);
    $pdo->prepare('UPDATE document_revisions SET approved_at = ? WHERE id = ?')->execute([date('Y-m-d H:i:s'), $rev3]);
    expectThrow('à¹à¸à¹‰ approved revision à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_rev_update($pdo, $rev3, ['change_summary' => 'à¹à¸à¹‰'], $UID), 409);
    expectThrow('effective revision à¸—à¸µà¹ˆà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µ impact à¸›à¸£à¸°à¸à¸²à¸¨à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_rev_effective($pdo, $rev3, $UID), 409);
    doc_impact_add($pdo, $rev3, ['impact_area' => 'safety', 'severity' => 'low', 'description' => 'à¹„à¸¡à¹ˆà¸¡à¸µà¸œà¸¥', 'status' => 'not_applicable'], $UID);
    $eff3 = doc_rev_effective($pdo, $rev3, $UID, $future, 'system');
    ok('cron-style effective à¸—à¸µà¹ˆà¸§à¸±à¸™à¸„à¹ˆà¸­à¸™à¹€à¸›à¹‡à¸™à¸­à¸”à¸µà¸•à¹„à¸”à¹‰', $eff3['status'] === 'effective', json_encode($eff3));
    ok('rev1.1 à¸–à¸¹à¸ supersede', doc_rev_get($pdo, $rev2)['status'] === 'superseded');
    expectThrow('ack à¸‚à¸­à¸‡ revision à¸—à¸µà¹ˆà¸–à¸¹à¸ supersede à¹à¸¥à¹‰à¸§ -> 409', fn() => doc_ack_acknowledge($pdo, $docId, 61, 'read', $rev2), 409);

    $ob = doc_rev_obsolete($pdo, $rev3, $UID, 'à¸—à¸”à¸ªà¸­à¸šà¹€à¸¥à¸´à¸à¹ƒà¸Šà¹‰');
    ok('obsolete à¹„à¸”à¹‰', $ob['status'] === 'obsolete', json_encode($ob));
    ok('à¸¥à¹‰à¸²à¸‡ current_effective_revision_id', doc_get($pdo, $docId)['current_effective_revision_id'] === null, json_encode(doc_get($pdo, $docId)['current_effective_revision_id']));
    $dq = doc_data_quality($pdo, 'no_effective');
    ok('data_quality à¸ˆà¸±à¸šà¹€à¸­à¸à¸ªà¸²à¸£ active à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µ effective à¹„à¸”à¹‰', count($dq['rows']) >= 1, json_encode(array_column($dq['rows'], 'doc_no')));

    echo "== 8. document status transitions ==\n";
    expectThrow('active -> draft à¹„à¸¡à¹ˆà¹„à¸”à¹‰', fn() => doc_set_status($pdo, $docId, 'draft', $UID), 409);
    expectThrow('à¸ªà¸–à¸²à¸™à¸°à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢à¹„à¸¡à¹ˆà¸£à¸¹à¹‰à¸ˆà¸±à¸', fn() => doc_set_status($pdo, $docId, 'banana', $UID), 400);
    $ob2 = doc_set_status($pdo, $docId, 'obsolete', $UID, 'à¸—à¸”à¸ªà¸­à¸šà¹€à¸¥à¸´à¸à¹ƒà¸Šà¹‰à¸—à¸±à¹‰à¸‡à¸‰à¸šà¸±à¸š');
    ok('active -> obsolete à¹„à¸”à¹‰', $ob2['status'] === 'obsolete', json_encode($ob2));

    echo "== 9. links / training / QR / reports ==\n";
    $assetId = (int)$pdo->query('SELECT id FROM asset_registry ORDER BY id LIMIT 1')->fetchColumn();
    if ($assetId > 0) {
        $l1 = doc_link_add($pdo, $docId, null, ['entity_type' => 'asset', 'entity_id' => $assetId, 'link_type' => 'governs'], $UID);
        $l2 = doc_link_add($pdo, $docId, null, ['entity_type' => 'asset', 'entity_id' => $assetId, 'link_type' => 'governs', 'note' => 'à¸‹à¹‰à¸³'], $UID);
        ok('link à¸£à¸°à¸”à¸±à¸šà¹€à¸­à¸à¸ªà¸²à¸£à¸‹à¹‰à¸³à¸–à¸¹à¸ dedupe (revision_guard)', $l1['id'] === $l2['id'], "{$l1['id']} vs {$l2['id']}");
        $cn = $pdo->query("SELECT COUNT(*) FROM document_links WHERE document_id = $docId AND entity_type='asset' AND entity_id=$assetId AND link_type='governs'")->fetchColumn();
        ok('à¹„à¸¡à¹ˆà¸¡à¸µ link à¸‹à¹‰à¸³à¹ƒà¸™ DB', (int)$cn === 1, "count=$cn");
        $l3 = doc_link_add($pdo, $docId, $rev1, ['entity_type' => 'asset', 'entity_id' => $assetId, 'link_type' => 'governs'], $UID);
        ok('link à¸£à¸°à¸”à¸±à¸š revision à¹à¸¢à¸à¸ˆà¸²à¸à¸£à¸°à¸”à¸±à¸šà¹€à¸­à¸à¸ªà¸²à¸£', $l3['id'] !== $l1['id'], "{$l1['id']} vs {$l3['id']}");
        $l4 = doc_link_add($pdo, $docId, $rev1, ['entity_type' => 'asset', 'entity_id' => $assetId, 'link_type' => 'governs', 'note' => 'à¸­à¸±à¸›à¹€à¸”à¸• note'], $UID);
        ok('upsert link à¹€à¸”à¸´à¸¡à¹„à¸”à¹‰', $l4['id'] === $l3['id']);
    } else {
        echo "  SKIP  à¹„à¸¡à¹ˆà¸¡à¸µ asset à¹ƒà¸™à¸£à¸°à¸šà¸š\n";
    }
    expectThrow('entity à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸¡à¸µà¸­à¸¢à¸¹à¹ˆà¸–à¸¹à¸à¸›à¸à¸´à¹€à¸ªà¸˜', fn() => doc_link_add($pdo, $docId, null, ['entity_type' => 'asset', 'entity_id' => 99999999, 'link_type' => 'reference'], $UID), 404);

    echo "== 10. QR / detail / reports ==\n";

    $det = doc_detail($pdo, $docId);
    ok('doc_detail à¸­à¹ˆà¸²à¸™à¹„à¸”à¹‰', is_array($det) && (int)$det['id'] === $docId);
    ok('doc_detail à¹„à¸¡à¹ˆà¸ªà¸£à¹‰à¸²à¸‡ QR token à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ GET', ($det['qr_token'] ?? '') === '' && ($det['qr_payload'] ?? null) === null, json_encode([$det['qr_token'] ?? null, $det['qr_payload'] ?? null]));
    $payload = doc_qr_payload($pdo, $docId);
    ok('QR payload prefix CMMS-D-', str_starts_with($payload, 'CMMS-D-'), $payload);
    $det2 = doc_detail($pdo, $docId);
    ok('GET à¸«à¸¥à¸±à¸‡à¸ªà¸£à¹‰à¸²à¸‡ QR à¹€à¸«à¹‡à¸™ token à¹€à¸”à¸´à¸¡', ($det2['qr_payload'] ?? '') === $payload, json_encode($det2['qr_payload'] ?? null));
    ok('activity timeline à¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥', count($det2['activity']) > 5, (string)count($det2['activity']));

    foreach (['summary', 'revision_history', 'ack_status', 'training_status', 'impact_summary', 'review_schedule'] as $rp) {
        $rows = doc_reports($pdo, $rp);
        ok("report $rp à¸„à¸·à¸™ array", is_array($rows), gettype($rows));
    }
    ok('dashboard à¸„à¸·à¸™ array', is_array(doc_dashboard($pdo)));
    ok('options à¸„à¸·à¸™ array', is_array(doc_options($pdo)));
    $list = doc_list($pdo, ['doc_type' => 'sop', 'status' => 'obsolete', 'q' => $stamp]);
    ok('doc_list filter à¸—à¸³à¸‡à¸²à¸™', count($list) === 1, (string)count($list));
} catch (Throwable $e) {
    $fail++;
    echo "  FATAL " . get_class($e) . ': ' . $e->getMessage() . "\n  at " . $e->getFile() . ':' . $e->getLine() . "\n";
    if (function_exists('xdebug_print_function_stack')) {}
    echo $e->getTraceAsString() . "\n";
}

echo "\n== cleanup ==\n";
if ($docId > 0) {
    $revIds = array_map('intval', $pdo->query("SELECT id FROM document_revisions WHERE document_id = $docId")->fetchAll(PDO::FETCH_COLUMN));
    $trIds = array_map('intval', $pdo->query("SELECT id FROM document_training WHERE document_id = $docId")->fetchAll(PDO::FETCH_COLUMN));
    $ri = $revIds ? implode(',', $revIds) : '0';
    $ti = $trIds ? implode(',', $trIds) : '0';
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $pdo->exec("DELETE FROM document_approvals WHERE revision_id IN ($ri)");
    $pdo->exec("DELETE FROM document_impacts WHERE revision_id IN ($ri)");
    $pdo->exec("DELETE FROM document_acknowledgements WHERE document_id = $docId");
    $pdo->exec("DELETE FROM document_training_results WHERE training_id IN ($ti)");
    $pdo->exec("DELETE FROM document_training WHERE document_id = $docId");
    $pdo->exec("DELETE FROM document_links WHERE document_id = $docId");
    $pdo->exec("DELETE FROM document_activity WHERE document_id = $docId");
    $pdo->exec("DELETE FROM document_revisions WHERE document_id = $docId");
    $pdo->exec("DELETE FROM controlled_documents WHERE id = $docId");
    $pdo->exec("DELETE FROM notifications WHERE module = 'document'");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $left = [];
    foreach (['controlled_documents' => 'id', 'document_revisions' => 'document_id', 'document_approvals' => 'revision_id', 'document_impacts' => 'revision_id', 'document_acknowledgements' => 'document_id', 'document_training' => 'document_id', 'document_links' => 'document_id', 'document_activity' => 'document_id'] as $t => $col) {
        $left[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t` WHERE $col = $docId")->fetchColumn();
    }
    $left['document_training_results'] = (int)$pdo->query("SELECT COUNT(*) FROM document_training_results WHERE training_id IN ($ti)")->fetchColumn();
    echo "  remaining rows: " . json_encode($left) . "\n";
}
foreach ([$pdfName, $pdf2Name, $pdf3Name] as $f) { if (is_file("$dir/$f")) { unlink("$dir/$f"); echo "  removed $f\n"; } }
echo "\nPASS=$pass FAIL=$fail\n";
exit($fail > 0 ? 1 : 0);

