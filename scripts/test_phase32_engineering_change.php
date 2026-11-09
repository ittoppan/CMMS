<?php
/**
 * Phase 32 — business-rule test ของ src/helpers/engineering_change.php (ECR workflow)
 *
 *   php scripts/test_phase32_engineering_change.php
 *
 * - ต่อ DB จริง (settings/notification_templates ต้องถูก apply แล้ว)
 * - ล้างข้อมูล ECR ที่เหลือก่อน/หลังรัน และลบเอกสาร fixture ที่สร้างเพื่อทดสอบ
 * - exit 0 = ผ่านทุกข้อ, exit 1 = มีข้อที่ fail
 */
error_reporting(E_ALL);
ini_set('display_errors', '1');
require dirname(__DIR__) . '/src/config/db.php';
require dirname(__DIR__) . '/src/helpers/engineering_change.php';

$pdo = getDb();
$_SESSION['user_id'] = 1;
$_SESSION['role_id'] = 1;
$UID = 1;          // ผู้บริหาร/ผู้อนุมัติ
$REQ = 61;         // ผู้ขอเปลี่ยนแปลง (คนละคนกับผู้อนุมัติ → ผ่านเกณฑ์แยกหน้าที่)

// purge ข้อมูล ECR ค้างจากรอบก่อน
$ecrs = array_map('intval', $pdo->query('SELECT id FROM engineering_changes')->fetchAll(PDO::FETCH_COLUMN));
if ($ecrs) {
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $ids = implode(',', $ecrs);
    foreach (['engineering_change_activity', 'engineering_change_verifications', 'engineering_change_approvals',
        'engineering_change_links', 'engineering_change_impacts'] as $t) {
        $pdo->exec("DELETE FROM `$t` WHERE ecr_id IN ($ids)");
    }
    $pdo->exec("DELETE FROM engineering_changes WHERE id IN ($ids)");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    echo "purged: ecrs=" . count($ecrs) . "\n";
}
$pdo->exec("DELETE FROM notifications WHERE module = 'engineering_change'");

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
        if ($got < 400 || $got > 599) $got = 400; // API จับ DomainException code นอกช่วง HTTP → 400
        if ($code !== null && $got !== $code) { $fail++; echo "  FAIL  $label (code $got != $code: {$e->getMessage()})\n"; return $e; }
        $pass++; echo "  PASS  $label -> {$e->getMessage()}\n"; return $e;
    }
    catch (Throwable $e) { $fail++; echo "  FAIL  $label (unexpected " . get_class($e) . ": {$e->getMessage()})\n"; return $e; }
}

// ---------- fixture ----------
$dir = dirname(__DIR__) . '/public/uploads/documents';
if (!is_dir($dir)) { mkdir($dir, 0775, true); echo "+ created $dir\n"; }
$stamp = bin2hex(random_bytes(4));
$files = [];
foreach (['sop' => 'SOP fixture', 'wiring' => 'wiring diagram'] as $k => $note) {
    $name = "p32ecr-$stamp-$k.pdf";
    file_put_contents("$dir/$name", "%PDF-1.4\n% phase32 ecr test $note\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    $files[] = "$dir/$name";
}
$pdfPath = 'uploads/documents/p32ecr-' . $stamp . '-sop.pdf';
$pdf2Path = 'uploads/documents/p32ecr-' . $stamp . '-wiring.pdf';

$docId = 0; $revId = 0;
$ecrId = 0;
$masterSnapshot = [];
foreach (['pm_am', 'repair', 'rca', 'machine_bom', 'spare_parts', 'failure_events'] as $t) {
    $masterSnapshot[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
}

try {
    echo "== 1. create ECR ==\n";
    $assetId = (int)$pdo->query('SELECT id FROM asset_registry ORDER BY id LIMIT 1')->fetchColumn();
    expectThrow('ไม่ระบุหัวข้อ -> ถูกปฏิเสธ', fn() => ecr_create($pdo, ['title' => '  ', 'change_type' => 'other'], $UID), 400);
    expectThrow('ประเภทการเปลี่ยนแปลงผิด', fn() => ecr_create($pdo, ['title' => 'x', 'change_type' => 'hack'], $UID), 400);
    expectThrow('ระดับความสำคัญผิด', fn() => ecr_create($pdo, ['title' => 'x', 'change_type' => 'other', 'priority' => 'urgent'], $UID), 400);
    expectThrow('asset_id ไม่มีจริง', fn() => ecr_create($pdo, ['title' => 'x', 'change_type' => 'other', 'asset_id' => 999999], $UID), 404);
    expectThrow('required_by_date ผิดรูปแบบ', fn() => ecr_create($pdo, ['title' => 'x', 'change_type' => 'other', 'required_by_date' => '31/12/2026'], $UID), 400);

    $ecr = ecr_create($pdo, [
        'title' => '[TEST] เปลี่ยนขั้นตอนเช็คเมย์ ' . $stamp,
        'change_type' => 'process_change', 'description' => 'ทดสอบ workflow ECR Phase32',
        'reason' => 'ลดข้อผิดพลาดในการเช็คเมย์', 'priority' => 'high',
        'requested_by' => $REQ, 'asset_id' => $assetId ?: null,
        'required_by_date' => date('Y-m-d', strtotime('+30 days')),
    ], $UID);
    $ecrId = (int)$ecr['id'];
    ok('สร้าง ECR ได้', $ecrId > 0, json_encode($ecr));
    ok('เลข ECR รูปแบบ ECR-YYYY-NNN', (bool)preg_match('~^ECR-\d{4}-\d{3}$~', (string)$ecr['ecr_no']), (string)$ecr['ecr_no']);
    ok('เริ่มเป็น draft', $ecr['status'] === 'draft', (string)$ecr['status']);
    ok('ecr_year ถูกต้อง', (int)$ecr['ecr_year'] === (int)date('Y'));
    ok('requested_date = วันนี้', (string)$ecr['requested_date'] === date('Y-m-d'), (string)$ecr['requested_date']);
    ok('ค้นหาด้วยเลข ECR', (int)ecr_get_by_no($pdo, (string)$ecr['ecr_no'])['id'] === $ecrId);
    $dup = ecr_create($pdo, ['title' => 'x', 'change_type' => 'other'], $UID);
    ok('เลข ECR ไม่ซ้ำ', (string)$dup['ecr_no'] !== (string)$ecr['ecr_no'], (string)$dup['ecr_no']);
    ecr_cancel($pdo, (int)$dup['id'], 'ทดสอบเลข ECR', $UID);

    $upd = ecr_update($pdo, $ecrId, ['description' => 'ทดสอบ workflow ECR Phase32 (แก้ไข)', 'priority' => 'critical'], $UID);
    ok('แก้ไขร่างได้', (string)$upd['description'] === 'ทดสอบ workflow ECR Phase32 (แก้ไข)' && (string)$upd['priority'] === 'critical');

    echo "== 2. submit มีเงื่อนไขข้อมูล ==\n";
    $draft2 = ecr_create($pdo, ['title' => '[TEST] ไม่ใส่รายละเอียด ' . $stamp, 'change_type' => 'other', 'requested_by' => $REQ], $UID);
    expectThrow('ไม่มี description -> ส่งไม่ได้', fn() => ecr_submit($pdo, (int)$draft2['id'], $UID), 409);
    $pdo->prepare('UPDATE engineering_changes SET description = ? WHERE id = ?')->execute(['มีรายละเอียด', (int)$draft2['id']]);
    expectThrow('ไม่มี reason -> ส่งไม่ได้', fn() => ecr_submit($pdo, (int)$draft2['id'], $UID), 409);
    ecr_cancel($pdo, (int)$draft2['id'], 'ทดสอบเงื่อนไขการส่ง', $UID);

    $sb = ecr_submit($pdo, $ecrId, $UID);
    ok('ส่ง ECR แล้ว = submitted', (string)$sb['status'] === 'submitted', (string)$sb['status']);
    ok('submitted_at ถูกตั้ง', !empty($sb['submitted_at']));
    expectThrow('ส่งซ้ำไม่ได้', fn() => ecr_submit($pdo, $ecrId, $UID), 409);
    expectThrow('ข้ามขั้น: submitted -> start_implementation ไม่ได้', fn() => ecr_start_implementation($pdo, $ecrId, $UID), 409);
    expectThrow('ข้ามขั้น: submitted -> request_approval ไม่ได้', fn() => ecr_request_approval($pdo, $ecrId, $UID), 409);
    expectThrow('ยกเลิกต้องมีเหตุผล', fn() => ecr_cancel($pdo, $ecrId, '  ', $UID), 400);
    expectThrow('แก้ไขรายละเอียดหลังส่งไม่ได้', fn() => ecr_update($pdo, $ecrId, ['title' => 'แก้ทับ'], $UID), 409);

    echo "== 3. review -> impact ==\n";
    $rv = ecr_start_review($pdo, $ecrId, $UID);
    ok('เข้าสู่ under_review', (string)$rv['status'] === 'under_review' && !empty($rv['review_started_at']));
    $im = ecr_start_impact($pdo, $ecrId, $UID);
    ok('เข้าสู่ impact_assessment', (string)$im['status'] === 'impact_assessment');

    echo "== 4. ผลกระทบ + เงื่อนไขก่อนขออนุมัติ ==\n";
    expectThrow('ด้านผลกระทบผิด', fn() => ecr_impact_add($pdo, $ecrId, ['impact_area' => 'space', 'description' => 'x'], $UID), 400);
    expectThrow('ระดับความรุนแรงผิด', fn() => ecr_impact_add($pdo, $ecrId, ['impact_area' => 'safety', 'severity' => 'fatal', 'description' => 'x'], $UID), 400);
    expectThrow('ไม่ระบุรายละเอียดผลกระทบ', fn() => ecr_impact_add($pdo, $ecrId, ['impact_area' => 'safety', 'description' => ' '], $UID), 400);
    expectThrow('target_type ต้องมี target_id', fn() => ecr_impact_add($pdo, $ecrId, ['impact_area' => 'safety', 'description' => 'x', 'target_type' => 'pm'], $UID), 400);
    expectThrow('target_id ไม่มีจริง', fn() => ecr_impact_add($pdo, $ecrId, ['impact_area' => 'safety', 'description' => 'x', 'target_type' => 'pm', 'target_id' => 999999], $UID), 404);

    $iSafe = ecr_impact_add($pdo, $ecrId, ['impact_area' => 'safety', 'severity' => 'high',
        'description' => 'ต้องเพิ่มขั้นตอนยืนยันก่อนปิดงาน', 'required_action' => 'ปรับ WI และอบรมผู้ปฏิบัติงาน',
        'owner_id' => $UID, 'status' => 'in_progress'], $UID);
    ok('เพิ่มผลกระทบได้', (int)$iSafe['id'] > 0 && (string)$iSafe['status'] === 'in_progress', json_encode($iSafe));
    $iCritical = ecr_impact_add($pdo, $ecrId, ['impact_area' => 'production', 'severity' => 'critical',
        'description' => 'หยุดสายการผลิตชั่วคราวระหว่างเปลี่ยน'], $UID);
    ok('เพิ่มผลกระทบระดับ critical ได้', (string)$iCritical['severity'] === 'critical');
    $blockers = ecr_approval_blockers($pdo, ecr_get($pdo, $ecrId));
    ok('critical ต้องมี owner + required_action (blocker)', count($blockers) >= 2, json_encode($blockers, JSON_UNESCAPED_UNICODE));
    expectThrow('ขออนุมัติทั้งที่ critical impact ไม่ครบ', fn() => ecr_request_approval($pdo, $ecrId, $UID), 409);
    ecr_impact_update($pdo, (int)$iCritical['id'], ['owner_id' => $UID, 'required_action' => 'ประสานหัวหน้าผลิต + ทดลอง 2 กะ'], $UID);
    ok('blocker หายเมื่อ critical impact ครบ', ecr_approval_blockers($pdo, ecr_get($pdo, $ecrId)) === [], json_encode(ecr_approval_blockers($pdo, ecr_get($pdo, $ecrId))));

    $noImpact = ecr_create($pdo, ['title' => '[TEST] ไม่มี impact ' . $stamp, 'change_type' => 'other',
        'description' => 'd', 'reason' => 'r', 'requested_by' => $REQ], $UID);
    ecr_submit($pdo, (int)$noImpact['id'], $UID);
    ecr_start_review($pdo, (int)$noImpact['id'], $UID);
    ecr_start_impact($pdo, (int)$noImpact['id'], $UID);
    expectThrow('ไม่มีผลกระทบเลย -> ขออนุมัติไม่ได้', fn() => ecr_request_approval($pdo, (int)$noImpact['id'], $UID), 409);
    ecr_cancel($pdo, (int)$noImpact['id'], 'ทดสอบแล้ว', $UID);
    ok('ยกเลิก ECR ได้', (string)ecr_get($pdo, (int)$noImpact['id'])['status'] === 'cancelled');

    echo "== 5. สายอนุมัติ ==\n";
    $ap = ecr_request_approval($pdo, $ecrId, $UID);
    ok('เข้าสู่ pending_approval', (string)$ap['status'] === 'pending_approval');
    $steps = ecr_approvals($pdo, $ecrId);
    ok('สร้างขั้นอนุมัติครบตาม chain (3 ขั้น)', count($steps) === 3, (string)count($steps));
    ok('ขั้นแรก = technical_review', (string)$steps[0]['step_key'] === 'technical_review', (string)$steps[0]['step_key']);
    ok('ขั้นอนุมัติมี due_at', !empty($steps[0]['due_at']));
    $selfEcr = ecr_create($pdo, ['title' => '[TEST] ผู้ขออนุมัติเอง ' . $stamp, 'change_type' => 'other',
        'description' => 'd', 'reason' => 'r', 'requested_by' => $UID], $UID);
    ecr_submit($pdo, (int)$selfEcr['id'], $UID);
    ecr_start_review($pdo, (int)$selfEcr['id'], $UID);
    ecr_start_impact($pdo, (int)$selfEcr['id'], $UID);
    ecr_impact_add($pdo, (int)$selfEcr['id'], ['impact_area' => 'cost', 'severity' => 'low', 'description' => 'ค่าใช้จ่ายเพิ่มเล็กน้อย'], $UID);
    ecr_request_approval($pdo, (int)$selfEcr['id'], $UID);
    expectThrow('ผู้ขอห้ามอนุมัติ ECR ของตัวเอง', fn() => ecr_approve_step($pdo, $UID, (int)$selfEcr['id'], 1, 'approved', 'ok'), 403);
    ecr_cancel($pdo, (int)$selfEcr['id'], 'ทดสอบหลักการแยกหน้าที่', $UID);

    expectThrow('อนุมัติข้ามลำดับขั้นไม่ได้', fn() => ecr_approve_step($pdo, $UID, $ecrId, 2, 'approved', 'ok'), 409);
    expectThrow('decision ผิด', fn() => ecr_approve_step($pdo, $UID, $ecrId, 1, 'maybe', 'ok'), 400);
    expectThrow('ไม่พบขั้นที่ระบุ', fn() => ecr_approve_step($pdo, $UID, $ecrId, 9, 'approved', 'ok'), 404);
    $a1 = ecr_approve_step($pdo, $UID, $ecrId, 1, 'approved', 'เห็นด้วย');
    ok('อนุมัติขั้น 1 แล้ว ยังรอขั้นถัดไป', $a1['status'] === 'pending_approval' && empty($a1['all_approved']));
    expectThrow('ตัดสินใจขั้นเดิมซ้ำไม่ได้', fn() => ecr_approve_step($pdo, $UID, $ecrId, 1, 'approved', 'ซ้ำ'), 409);
    $a2 = ecr_approve_step($pdo, $UID, $ecrId, 2, 'approved', 'ผ่าน');
    ok('อนุมัติขั้น 2 แล้ว ยังรอขั้นถัดไป', $a2['status'] === 'pending_approval' && empty($a2['all_approved']));
    $a3 = ecr_approve_step($pdo, $UID, $ecrId, 3, 'approved', 'อนุมัติ');
    ok('อนุมัติครบทุกขั้น -> approved', $a3['status'] === 'approved' && !empty($a3['all_approved']));
    $cur = ecr_get($pdo, $ecrId);
    ok('approved_at/approved_by ถูกตั้ง', !empty($cur['approved_at']) && (int)$cur['approved_by'] === $UID);
    expectThrow('อนุมัติซ้ำหลังอนุมัติแล้วไม่ได้', fn() => ecr_approve_step($pdo, $UID, $ecrId, 1, 'approved', 'ซ้ำ'), 409);

    $rejEcr = ecr_create($pdo, ['title' => '[TEST] ไม่ผ่าน ' . $stamp, 'change_type' => 'other',
        'description' => 'd', 'reason' => 'r', 'requested_by' => $REQ], $UID);
    ecr_submit($pdo, (int)$rejEcr['id'], $UID);
    ecr_start_review($pdo, (int)$rejEcr['id'], $UID);
    ecr_start_impact($pdo, (int)$rejEcr['id'], $UID);
    ecr_impact_add($pdo, (int)$rejEcr['id'], ['impact_area' => 'quality', 'severity' => 'medium', 'description' => 'คุณภาพอาจตก'], $UID);
    ecr_request_approval($pdo, (int)$rejEcr['id'], $UID);
    expectThrow('ปฏิเสธต้องมีเหตุผล', fn() => ecr_approve_step($pdo, $UID, (int)$rejEcr['id'], 1, 'rejected', '  '), 409);
    $rj = ecr_approve_step($pdo, $UID, (int)$rejEcr['id'], 1, 'rejected', 'ข้อมูลไม่พอ ต้องเพิ่มการทดสอบ');
    $rejRow = ecr_get($pdo, (int)$rejEcr['id']);
    ok('ปฏิเสธแล้วสถานะ = rejected', $rj['status'] === 'rejected' && !empty($rejRow['reject_reason']));
    $ro = ecr_reopen($pdo, (int)$rejEcr['id'], $UID);
    ok('เปิดกลับเป็นร่างได้', (string)$ro['status'] === 'draft');
    ok('คงประวัติการปฏิเสธไว้', !empty(ecr_get($pdo, (int)$rejEcr['id'])['reject_reason']));
    ecr_cancel($pdo, (int)$rejEcr['id'], 'ทดสอบแล้ว', $UID);

    echo "== 6. ลิงก์ (ไม่แก้ข้อมูลต้นทาง) ==\n";
    expectThrow('ประเภทลิงก์ผิด', fn() => ecr_link_add($pdo, $ecrId, ['link_type' => 'teleport', 'entity_id' => 1], $UID), 400);
    expectThrow('entity_id ต้องมี', fn() => ecr_link_add($pdo, $ecrId, ['link_type' => 'asset'], $UID), 400);
    expectThrow('entity ไม่มีจริง', fn() => ecr_link_add($pdo, $ecrId, ['link_type' => 'asset', 'entity_id' => 999999], $UID), 404);
    expectThrow('ตั้ง done โดยไม่มีรายละเอียด', fn() => ecr_link_add($pdo, $ecrId, ['link_type' => 'asset', 'entity_id' => $assetId, 'action_status' => 'done'], $UID), 409);
    $l1 = ecr_link_add($pdo, $ecrId, ['link_type' => 'asset', 'entity_id' => $assetId,
        'action_required' => 'ปรับชิ้นส่วนตามแบบใหม่', 'note' => 'รอจัดหาชิ้นส่วน'], $UID);
    ok('ผูกลิงก์เครื่องจักรได้', (int)$l1['id'] > 0 && (string)$l1['action_status'] === 'not_started', json_encode($l1));
    $l1b = ecr_link_add($pdo, $ecrId, ['link_type' => 'asset', 'entity_id' => $assetId,
        'action_required' => 'ปรับชิ้นส่วนตามแบบใหม่ (ยืนยัน)', 'action_status' => 'in_progress', 'note' => 'สั่งของแล้ว'], $UID);
    ok('ผูกลิงก์ซ้ำ = อัปเดตของเดิม (ไม่สร้างซ้ำ)', (int)$l1b['id'] === (int)$l1['id'] && count(ecr_links($pdo, $ecrId)) === 1);
    $pmId = (int)$pdo->query('SELECT id FROM pm_am ORDER BY id LIMIT 1')->fetchColumn();
    if ($pmId > 0) {
        $l2 = ecr_link_add($pdo, $ecrId, ['link_type' => 'pm', 'entity_id' => $pmId,
            'action_required' => 'ปรับรายการตรวจใน PM ให้ตรงกับขั้นตอนใหม่'], $UID);
        ok('ผูกลิงก์แผน PM ได้ (ต้องแก้ทีละรายการด้วยมือ)', (int)$l2['id'] > 0);
    }
    expectThrow('ลบลิงก์หลังอนุมัติไม่ได้', fn() => ecr_link_remove($pdo, (int)$l1['id'], $UID), 409);

    echo "== 7. implementation ต้องปิดผลกระทบ/ลิงก์ก่อน ==\n";
    expectThrow('วันกำหนดผิดรูปแบบ', fn() => ecr_start_implementation($pdo, $ecrId, $UID, '20-20-2026'), 400);
    $planned = date('Y-m-d', strtotime('+20 days'));
    $impl = ecr_start_implementation($pdo, $ecrId, $UID, $planned);
    ok('เข้าสู่ implementation พร้อมกำหนดวัน', (string)$impl['status'] === 'implementation' && (string)$impl['planned_completion_date'] === $planned);
    $b1 = ecr_implementation_blockers($pdo, $ecrId);
    ok('ยังมีผลกระทบ/ลิงก์ค้าง', count($b1) === 2, json_encode($b1, JSON_UNESCAPED_UNICODE));
    expectThrow('ผลกระทบ+ลิงก์ยังค้าง -> ขึ้นตรวจสอบผลไม่ได้', fn() => ecr_mark_implemented($pdo, $ecrId, $UID), 409);
    ecr_impact_update($pdo, (int)$iSafe['id'], ['status' => 'completed', 'action_taken' => 'ปรับ WI + อบรม 6 คน'], $UID);
    $iCriticalDone = ecr_impact_update($pdo, (int)$iCritical['id'], ['status' => 'not_applicable', 'action_taken' => 'ทดลองแล้วไม่กระทบสายการผลิต'], $UID);
    ok('ปิดผลกระทบ critical เป็น not_applicable ได้', (string)$iCriticalDone['status'] === 'not_applicable' && !empty($iCriticalDone['completed_at']));
    expectThrow('ผลกระทบครบแต่ลิงก์ยังค้าง -> ยังขึ้นตรวจสอบผลไม่ได้', fn() => ecr_mark_implemented($pdo, $ecrId, $UID), 409);
    if ($pmId > 0) {
        $lp = $pdo->prepare('SELECT id FROM engineering_change_links WHERE ecr_id = ? AND link_type = \'pm\'');
        $lp->execute([$ecrId]);
        ecr_link_update($pdo, (int)$lp->fetchColumn(), ['action_status' => 'done', 'note' => 'ปรับรายการตรวจเรียบร้อย'], $UID);
    }
    ecr_link_update($pdo, (int)$l1['id'], ['action_status' => 'done', 'note' => 'เปลี่ยนชิ้นส่วนแล้ว 12 ก.ย.'], $UID);
    ok('ไม่มี blocker ก่อนขึ้นตรวจสอบผล', ecr_implementation_blockers($pdo, $ecrId) === []);
    $mi = ecr_mark_implemented($pdo, $ecrId, $UID);
    ok('เข้าสู่ verification', (string)$mi['status'] === 'verification' && !empty($mi['implemented_at']));

    echo "== 8. ตรวจสอบผล + เงื่อนไขปิดงาน ==\n";
    expectThrow('ผลตรวจสอบผิด', fn() => ecr_record_verification($pdo, $ecrId, ['result' => 'ok'], $UID), 400);
    expectThrow('วิธีตรวจสอบผิด', fn() => ecr_record_verification($pdo, $ecrId, ['result' => 'pass', 'verification_method' => 'vibes'], $UID), 400);
    expectThrow('ผ่านต้องมีหมายเหตุ', fn() => ecr_record_verification($pdo, $ecrId, ['result' => 'pass'], $UID), 400);
    expectThrow('ไม่ผ่านต้องระบุเหตุผล', fn() => ecr_record_verification($pdo, $ecrId, ['result' => 'fail', 'notes' => 'ทดสอบไม่ผ่าน'], $UID), 409);
    expectThrow('ปิดงานต้องมีสรุปผล', fn() => ecr_close($pdo, $ecrId, '  ', $UID), 409);
    $b2 = ecr_close_blockers($pdo, ecr_get($pdo, $ecrId));
    ok('ยังปิดไม่ได้เพราะยังไม่มีผลตรวจสอบ', count($b2) >= 1, json_encode($b2, JSON_UNESCAPED_UNICODE));
    $v1 = ecr_record_verification($pdo, $ecrId, ['result' => 'pass', 'verification_method' => 'functional_test',
        'notes' => 'ทดสอบเครื่อง 3 รอบ ไม่พบข้อผิดพลาด'], $UID);
    ok('บันทึกผลตรวจสอบรอบ 1 = pass', (int)$v1['round'] === 1 && (string)$v1['status'] === 'verification', json_encode($v1));
    ok('มี verification_result ที่ ECR', (string)ecr_get($pdo, $ecrId)['verification_result'] === 'pass');

    echo "== 9. ปิด ECR ไม่ได้ถ้าเอกสารที่อ้างอิงยังไม่รับทราจครบ ==\n";
    $doc = doc_create($pdo, ['doc_type' => 'sop', 'title' => '[TEST] SOP ประกอบ ECR ' . $stamp,
        'description' => 'เอกสารประกอบการทดสอบ ECR', 'requires_acknowledgement' => 1, 'requires_training' => 0,
        'review_cycle_days' => 730], $UID);
    $docId = (int)$doc['id'];
    $rev = doc_rev_create($pdo, $docId, ['title' => '[TEST] WI เช็คเมย์ rev1', 'change_summary' => 'ทดสอบ ECR',
        'file_path' => $pdfPath], $UID);
    $revId = (int)$rev['id'];
    doc_rev_submit($pdo, $revId, $UID);
    foreach (doc_approvals($pdo, $revId) as $a) doc_rev_approve_step($pdo, $UID, $revId, (int)$a['step'], 'approved', 'ผ่าน');
    $di = doc_impact_add($pdo, $revId, ['impact_area' => 'document', 'severity' => 'low',
        'description' => 'เอกสารประกอบ ECR — ไม่มีผลกระทบต่อกระบวนการผลิต', 'status' => 'not_applicable'], $UID);
    ok('เอกสาร fixture มีผลกระทบปิดแล้ว', (string)$di['status'] === 'not_applicable');
    doc_rev_effective($pdo, $revId, $UID);
    ok('เอกสาร fixture มีผลบังคับใช้', (string)doc_rev_get($pdo, $revId)['status'] === 'effective');
    doc_ack_assign($pdo, $docId, [$REQ], $UID);
    $lDoc = ecr_link_add($pdo, $ecrId, ['link_type' => 'revision', 'entity_id' => $revId,
        'action_required' => 'เผยแพร่เอกสารฉบับใหม่ให้ผู้ปฏิบัติงาน', 'action_status' => 'done',
        'note' => 'เผยแพร่ในระบบเอกสารแล้ว'], $UID);
    ok('ผูกลิงก์ revision เอกสารได้', (int)$lDoc['id'] > 0);
    $b3 = ecr_close_blockers($pdo, ecr_get($pdo, $ecrId));
    ok('ปิดไม่ได้เพราะมีผู้ยังไม่รับทราจเอกสาร', count($b3) >= 1, json_encode($b3, JSON_UNESCAPED_UNICODE));
    expectThrow('ปิด ECR ทั้งที่ยังมีคนรับทราจไม่ครบ', fn() => ecr_close($pdo, $ecrId, 'สรุปงานทดสอบ', $UID), 409);
    doc_ack_acknowledge($pdo, $docId, $REQ, 'read', $revId);
    ok('รับทราจครบแล้วไม่มี blocker', ecr_close_blockers($pdo, ecr_get($pdo, $ecrId)) === [], json_encode(ecr_close_blockers($pdo, ecr_get($pdo, $ecrId))));
    $closed = ecr_close($pdo, $ecrId, 'เปลี่ยนขั้นตอนเช็คเมย์และเผยแพร่ WI ฉบับใหม่แล้ว', $UID);
    ok('ปิด ECR สำเร็จ', (string)$closed['status'] === 'completed' && !empty($closed['closed_at']) && (int)$closed['closed_by'] === $UID);
    expectThrow('ปิดซ้ำไม่ได้', fn() => ecr_close($pdo, $ecrId, 'ซ้ำ', $UID), 409);
    expectThrow('เพิ่มผลกระทบหลังปิดไม่ได้', fn() => ecr_impact_add($pdo, $ecrId, ['impact_area' => 'cost', 'description' => 'x'], $UID), 409);
    expectThrow('เพิ่มลิงก์หลังปิดไม่ได้', fn() => ecr_link_add($pdo, $ecrId, ['link_type' => 'asset', 'entity_id' => $assetId], $UID), 409);

    echo "== 10. ผลตรวจสอบไม่ผ่าน -> กลับไปแก้ไข (ห้ามปิด) ==\n";
    $e2 = ecr_create($pdo, ['title' => '[TEST] ตรวจสอบไม่ผ่าน ' . $stamp, 'change_type' => 'design_change',
        'description' => 'd', 'reason' => 'r', 'requested_by' => $REQ], $UID);
    $e2id = (int)$e2['id'];
    ecr_submit($pdo, $e2id, $UID);
    ecr_start_review($pdo, $e2id, $UID);
    ecr_start_impact($pdo, $e2id, $UID);
    $i2 = ecr_impact_add($pdo, $e2id, ['impact_area' => 'maintenance', 'severity' => 'medium',
        'description' => 'เพิ่มขั้นตอนบำรุงรักษา', 'required_action' => 'ปรับคู่มือ', 'owner_id' => $UID, 'status' => 'completed'], $UID);
    ecr_request_approval($pdo, $e2id, $UID);
    foreach (ecr_approvals($pdo, $e2id) as $a) ecr_approve_step($pdo, $UID, $e2id, (int)$a['step'], 'approved', 'ผ่าน');
    ecr_start_implementation($pdo, $e2id, $UID);
    ecr_mark_implemented($pdo, $e2id, $UID);
    $vFail = ecr_record_verification($pdo, $e2id, ['result' => 'fail', 'verification_method' => 'trial_run',
        'notes' => 'ทดลองใช้งานแล้วเกิดปัญหา', 'failure_reason' => 'สายสั่นเกินค่ากำหนด'], $UID);
    ok('ผลตรวจสอบ = fail กลับสถานะ implementation', (string)$vFail['status'] === 'implementation' && (int)$vFail['round'] === 1, json_encode($vFail));
    $b4 = ecr_close_blockers($pdo, ecr_get($pdo, $e2id));
    ok('ยังปิดไม่ได้หลังผลตรวจสอบไม่ผ่าน', (string)ecr_get($pdo, $e2id)['status'] !== 'verification');
    ecr_mark_implemented($pdo, $e2id, $UID);
    $vPass = ecr_record_verification($pdo, $e2id, ['result' => 'pass', 'verification_method' => 'measurement',
        'notes' => 'แก้แล้ว ค่าสายสั่นอยู่ในเกณฑ์'], $UID);
    ok('ตรวจสอบรอบ 2 = pass อยู่สถานะ verification', (int)$vPass['round'] === 2 && (string)$vPass['status'] === 'verification');
    $c2 = ecr_close($pdo, $e2id, 'แก้ไขแล้ว ผ่านการทดสอบรอบที่ 2', $UID);
    ok('ปิด ECR หลังตรวจสอบผ่าน', (string)$c2['status'] === 'completed');
    ok('เก็บประวัติตรวจสอบครบ 2 รอบ', count(ecr_verifications($pdo, $e2id)) === 2);

    echo "== 11. read model ==\n";
    $list = ecr_list($pdo, ['status' => 'completed', 'limit' => 10]);
    ok('กรองตามสถานะได้', count($list) >= 2, (string)count($list));
    ok('แนบป้ายสถานะ/ประเภท/ความสำคัญ', !empty($list[0]['status_label']) && !empty($list[0]['change_type_label']) && !empty($list[0]['priority_label']));
    ok('กรองตาม change_type ได้', count(ecr_list($pdo, ['change_type' => 'design_change'])) >= 1);
    ok('ค้นหาจากข้อความได้', count(ecr_list($pdo, ['q' => $stamp])) >= 2, (string)count(ecr_list($pdo, ['q' => $stamp])));
    expectThrow('ช่วงวันที่กลับด้าน', fn() => ecr_list($pdo, ['from' => '2026-12-31', 'to' => '2026-01-01']), 400);
    $det = ecr_detail($pdo, $ecrId);
    ok('detail มี impacts/links/approvals/verifications/activity', isset($det['impacts'], $det['links'], $det['approvals'], $det['verifications'], $det['activity']));
    ok('detail มี next_actions ของสถานะ', $det['next_actions'] === [], json_encode($det['next_actions']));
    $det2 = ecr_detail($pdo, $e2id);
    ok('impact_summary นับถูก', (int)$det2['impact_summary']['total'] === 1 && (int)$det2['impact_summary']['open'] === 0);
    $sum = ecr_summary($pdo, []);
    ok('summary by_status ครบ 11 สถานะ', count($sum['by_status']) === 11, (string)count($sum['by_status']));
    ok('summary นับ completed ได้', ($sum['by_status']['completed'] ?? 0) >= 2, json_encode($sum['by_status']));
    ok('completion_rate เป็น %', $sum['completion_rate'] > 0 && $sum['completion_rate'] <= 100);
    $opt = ecr_options($pdo);
    ok('options มีกฎห้ามแก้ข้อมูลหลักอัตโนมัติ', $opt['rules']['no_master_data_automation'] === true && $opt['rules']['rca_not_automatic'] === true);
    ok('options มี next_actions ทุกสถานะ', count($opt['next_actions']) === 11, (string)count($opt['next_actions']));
    ok('options มีสายอนุมัติ', count($opt['approval_chain']) === 3);
    $act = ecr_activity_list($pdo, $ecrId, 200);
    ok('activity มีประวัติครบ (create/submit/approve/implemented/verification/closed)', count($act) >= 10, (string)count($act));
    ok('activity เก็บสถานะเดิม-ใหม่', (bool)array_filter($act, fn($a) => $a['old_status'] === 'pending_approval' && $a['new_status'] === 'approved'));

    echo "== 12. ห้ามแก้ข้อมูลหลักอัตโนมัติ ==\n";
    foreach ($masterSnapshot as $t => $n) {
        $now = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
        ok("ไม่มีการเพิ่ม/ลบแถวใน $t", $now === $n, "ก่อน $n / หลัง $now");
    }
} catch (Throwable $e) {
    $fail++;
    echo "  FATAL " . get_class($e) . ': ' . $e->getMessage() . "\n    " . $e->getFile() . ':' . $e->getLine() . "\n";
} finally {
    // ---------- cleanup ----------
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $ecrs = array_map('intval', $pdo->query('SELECT id FROM engineering_changes')->fetchAll(PDO::FETCH_COLUMN));
    if ($ecrs) {
        $ids = implode(',', $ecrs);
        foreach (['engineering_change_activity', 'engineering_change_verifications', 'engineering_change_approvals',
            'engineering_change_links', 'engineering_change_impacts'] as $t) {
            $pdo->exec("DELETE FROM `$t` WHERE ecr_id IN ($ids)");
        }
        $pdo->exec("DELETE FROM engineering_changes WHERE id IN ($ids)");
    }
    $pdo->exec('DELETE FROM engineering_change_activity WHERE ecr_id NOT IN (SELECT id FROM engineering_changes)');
    if ($docId > 0) {
        $pdo->exec("DELETE FROM document_acknowledgements WHERE document_id = $docId");
        $pdo->exec("DELETE FROM document_impacts WHERE revision_id IN (SELECT id FROM document_revisions WHERE document_id = $docId)");
        $pdo->exec("DELETE FROM document_approvals WHERE revision_id IN (SELECT id FROM document_revisions WHERE document_id = $docId)");
        $pdo->exec("DELETE FROM document_training_results WHERE training_id IN (SELECT id FROM document_training WHERE document_id = $docId)");
        $pdo->exec("DELETE FROM document_training WHERE document_id = $docId");
        $pdo->exec("DELETE FROM document_links WHERE document_id = $docId");
        $pdo->exec("DELETE FROM document_activity WHERE document_id = $docId");
        $pdo->exec("DELETE FROM document_revisions WHERE document_id = $docId");
        $pdo->exec("DELETE FROM controlled_documents WHERE id = $docId");
    }
    $pdo->exec("DELETE FROM notifications WHERE module = 'engineering_change'");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    foreach ($files as $f) { if (is_file($f)) @unlink($f); }
    $left = [];
    foreach (['engineering_changes', 'engineering_change_impacts', 'engineering_change_approvals',
        'engineering_change_links', 'engineering_change_verifications', 'engineering_change_activity'] as $t) {
        $left[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    }
    echo "remaining rows: " . json_encode($left) . "\n";
    foreach ($files as $f) { if (is_file($f)) { $fail++; echo "  FAIL  ลบไฟล์ทดสอบไม่ได้ $f\n"; } }
    echo "PASS=$pass FAIL=$fail\n";
    exit($fail === 0 ? 0 : 1);
}
