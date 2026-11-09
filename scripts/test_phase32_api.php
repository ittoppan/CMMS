<?php
/**
 * Phase 32 — HTTP smoke test ของ API document.php / engineering_change.php
 *
 *   php scripts/test_phase32_api.php
 *
 * ทดสอบผ่าน HTTP จริง (IIS/FastCGI :8081) — ครอบคลุม requireLogin, requirePerm, enforceCsrf,
 * idempotency, DomainException → HTTP code และ payload ที่ client ใช้
 *
 * ข้อสำคัญเรื่อง session ปลอม (เรียนรู้จาก scripts/smoke_test.php ที่พลาดตรงนี้):
 *   - ต้อง ini_set('session.use_strict_mode','0') ก่อน session_start() — php.ini ตั้งเป็น 1
 *     PHP จะสร้าง session id ใหม่แทน id ที่กำหนด ทำให้ cookie ชี้ไฟล์ที่ไม่มีอยู่จริง (401 ทุก endpoint)
 *   - ห้าม output (echo/print_r) ก่อน session ini_set — PHP จะถือว่า headers ถูกส่งแล้ว
 *   - session.save_path ของ FastCGI = C:\Windows\Temp และต้องเปิดสิทธิ์อ่านให้ IUSR (S-1-5-17)
 *   - ใช้ user_id ที่ active จริงในฐานข้อมูล แล้วลบไฟล์ session ทิ้งเมื่อจบ
 *
 * role_id ใน session ถูกใช้โดย canPerm() (ดู src/helpers/permissions.php) จึงทดสอบ RBAC ได้จริง
 *   role 1 Admin = อนุญาตทุกอย่าง / role 2 Manager = เต็ม / role 7 Foreman = สร้างได้แต่อนุมัติไม่ได้
 */
error_reporting(E_ALL);
ini_set('display_errors', '1');

const BASE = 'http://127.0.0.1:8081';
const SESS_PATH = 'C:\Windows\Temp';

require_once __DIR__ . '/../src/config/db.php';

ini_set('session.save_path', SESS_PATH);
ini_set('session.use_strict_mode', '0');
ini_set('session.use_cookies', '0');

/** สร้าง session ปลอม (ต้องเรียกก่อน output ใด ๆ) */
function fakeSession(int $roleId): array {
    $sid = bin2hex(random_bytes(13));
    session_id($sid);
    if (!session_start()) throw new RuntimeException('session_start failed');
    $_SESSION = [
        'user_id' => 1, 'user_name' => 'admin', 'role_id' => $roleId,
        'full_name' => 'Phase32 API Test (role ' . $roleId . ')',
        'csrf_token' => bin2hex(random_bytes(16)),
        'last_activity' => time(), 'last_regenerated' => time(),
    ];
    $csrf = (string)$_SESSION['csrf_token'];
    session_write_close();

    $file = rtrim(SESS_PATH, '\\/') . DIRECTORY_SEPARATOR . 'sess_' . $sid;
    if (!is_file($file)) throw new RuntimeException('ไม่พบไฟล์ session ' . basename($file));
    exec('icacls "' . $file . '" /grant "*S-1-5-17:(F)" 2>&1', $out, $rc);
    if ($rc !== 0) throw new RuntimeException('icacls ล้มเหลว: ' . implode(' | ', $out));
    return ['sid' => $sid, 'cookie' => 'PHPSESSID=' . $sid, 'csrf' => $csrf, 'file' => $file];
}

$sAdmin = fakeSession(1);
$sManager = fakeSession(2);
$sForeman = fakeSession(7);

$pass = 0; $fail = 0;
function ok(string $label, bool $cond, string $extra = ''): void {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; echo "  FAIL  $label $extra\n"; }
}

$cookie = $sAdmin['cookie'];
$csrf = $sAdmin['csrf'];

function req(string $url, ?array $payload = null, ?array $session = null): array {
    $cookie = $session !== null ? (string)$session['cookie'] : $GLOBALS['cookie'];
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    curl_setopt($ch, CURLOPT_COOKIE, $cookie);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }
    $raw = (string)curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $body = $raw;
    if (($p = strpos($raw, "\r\n\r\n")) !== false) $body = substr($raw, $p + 4);
    $json = json_decode($body, true);
    return ['code' => $code, 'json' => is_array($json) ? $json : null, 'raw' => $body, 'err' => $err];
}

/** ลบข้อมูลทดสอบโดยตรง (cancel ใช้ไม่ได้เมื่อ ECR ค้างที่ pending_approval) */
function purgeEcr(PDO $pdo, int $ecrId): void {
    if ($ecrId <= 0) return;
    foreach (['engineering_change_impacts', 'engineering_change_activity', 'engineering_change_approvals',
        'engineering_change_links', 'engineering_change_verifications'] as $t) {
        $pdo->prepare("DELETE FROM `$t` WHERE ecr_id = ?")->execute([$ecrId]);
    }
    $pdo->prepare('DELETE FROM engineering_changes WHERE id = ?')->execute([$ecrId]);
}

function purgeDoc(PDO $pdo, int $docId): void {
    if ($docId <= 0) return;
    $revs = array_map('intval', $pdo->query("SELECT id FROM document_revisions WHERE document_id = $docId")->fetchAll(PDO::FETCH_COLUMN));
    $trs = array_map('intval', $pdo->query("SELECT id FROM document_training WHERE document_id = $docId")->fetchAll(PDO::FETCH_COLUMN));
    $pdo->prepare('DELETE FROM document_acknowledgements WHERE document_id = ?')->execute([$docId]);
    $pdo->prepare('DELETE FROM document_links WHERE document_id = ?')->execute([$docId]);
    $pdo->prepare('DELETE FROM document_activity WHERE document_id = ?')->execute([$docId]);
    if ($trs) {
        $in = implode(',', $trs);
        $pdo->exec("DELETE FROM document_training_results WHERE training_id IN ($in)");
    }
    $pdo->prepare('DELETE FROM document_training WHERE document_id = ?')->execute([$docId]);
    if ($revs) {
        $in = implode(',', $revs);
        $pdo->exec("DELETE FROM document_approvals WHERE revision_id IN ($in)");
        $pdo->exec("DELETE FROM document_impacts WHERE revision_id IN ($in)");
    }
    $pdo->prepare('DELETE FROM document_revisions WHERE document_id = ?')->execute([$docId]);
    $pdo->prepare('DELETE FROM controlled_documents WHERE id = ?')->execute([$docId]);
}

$DOC = '/api/v1/document.php';
$ECR = '/api/v1/engineering_change.php';
$stamp = bin2hex(random_bytes(4));
$docId = 0;
$ecrId = 0;
$ecrSodId = 0;
$idemId = 0;
$fmDocId = 0;
$fmEcrId = 0;

try {
    echo "== 1. auth / csrf ==\n";
    $r = req(BASE . $DOC . '?action=config');
    ok('document config 200', $r['code'] === 200 && isset($r['json']['statuses']), $r['raw'] . ' ' . $r['err']);
    ok('document config มี can_*', isset($r['json']['can']['publish']));
    $r = req(BASE . $ECR . '?action=options');
    ok('ecr options 200 + กฎห้ามแก้ข้อมูลหลัก', $r['code'] === 200 && ($r['json']['rules']['no_master_data_automation'] ?? false) === true, $r['raw']);
    $r = req(BASE . $DOC . '?action=create', ['action' => 'create', 'doc_type' => 'sop', 'title' => 'no csrf']);
    ok('POST ไม่มี CSRF ถูกปฏิเสธ (403)', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=nope');
    ok('GET action ไม่รู้จัก = 404', $r['code'] === 404, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR, ['action' => 'list', 'csrf_token' => $csrf]);
    ok('POST action ที่ไม่ใช่ mutation = 404', $r['code'] === 404, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=get', ['action' => 'get', 'csrf_token' => $csrf]);
    ok('POST get = 404 (บังคับใช้ GET)', $r['code'] === 404, (string)$r['code'] . ' ' . $r['raw']);

    echo "== 2. validation ผ่าน API ==\n";
    $r = req(BASE . $DOC . '?action=create', ['action' => 'create', 'doc_type' => 'sop', 'title' => '  ', 'csrf_token' => $csrf]);
    ok('สร้างเอกสารไม่มีชื่อ -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=create', ['action' => 'create', 'doc_type' => 'hologram', 'title' => 'x', 'csrf_token' => $csrf]);
    ok('doc_type ผิด -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=create', ['action' => 'create', 'title' => 'x', 'change_type' => 'warp', 'csrf_token' => $csrf]);
    ok('change_type ผิด -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=create', ['action' => 'create', 'title' => '  ', 'change_type' => 'other',
        'description' => 'd', 'reason' => 'r', 'csrf_token' => $csrf]);
    ok('สร้าง ECR ไม่มีชื่อ -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);

    echo "== 3. เอกสาร: สร้าง -> อ่าน ==\n";
    $r = req(BASE . $DOC . '?action=create', ['action' => 'create', 'csrf_token' => $csrf,
        'doc_type' => 'sop', 'title' => '[TEST] SOP API ' . $stamp, 'description' => 'ทดสอบ API เอกสาร',
        'requires_acknowledgement' => 1, 'review_cycle_days' => 730]);
    ok('สร้างเอกสารผ่าน API', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
    $docId = (int)($r['json']['id'] ?? 0);
    ok('ได้เลขเอกสาร', $docId > 0 && (string)($r['json']['doc_no'] ?? '') !== '', $r['raw']);
    $r = req(BASE . $DOC . '?action=get&id=' . $docId);
    ok('GET detail ได้', $r['code'] === 200 && (int)($r['json']['id'] ?? 0) === $docId, $r['raw']);
    ok('detail มี section ครบ', isset($r['json']['revisions'], $r['json']['ack_progress'], $r['json']['links'], $r['json']['activity']));
    $r = req(BASE . $DOC . '?action=list&q=' . rawurlencode('[TEST] SOP API ' . $stamp));
    ok('ค้นหาเอกสารได้', $r['code'] === 200 && count($r['json']['documents'] ?? []) >= 1, $r['raw']);
    $r = req(BASE . $DOC . '?action=rev_create', ['action' => 'rev_create', 'csrf_token' => $csrf,
        'document_id' => $docId, 'title' => '[TEST] WI rev1', 'change_summary' => 'ทดสอบ API']);
    ok('สร้าง revision ไม่มีไฟล์ -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=rev_submit', ['action' => 'rev_submit', 'csrf_token' => $csrf, 'revision_id' => 999999]);
    ok('rev_submit revision ไม่มีจริง -> 404', $r['code'] === 404, (string)$r['code']);
    $r = req(BASE . $DOC . '?action=update', ['action' => 'update', 'csrf_token' => $csrf, 'document_id' => $docId,
        'title' => '[TEST] SOP API แก้ไข ' . $stamp]);
    ok('แก้ไขเอกสารได้', $r['code'] === 200 && (int)($r['json']['id'] ?? 0) === $docId, $r['raw']);
    $r = req(BASE . $DOC . '?action=get&id=' . $docId);
    ok('ชื่อใหม่ถูกบันทึก', str_contains((string)($r['json']['title'] ?? ''), 'แก้ไข'), $r['raw']);
    $r = req(BASE . $DOC . '?action=qr_payload', ['action' => 'qr_payload', 'csrf_token' => $csrf, 'document_id' => $docId]);
    $docQr = (string)($r['json']['payload'] ?? '');
    $docNo = (string)($r['json']['doc_no'] ?? '');
    ok('QR payload ขึ้นต้นด้วย CMMS-D-', $r['code'] === 200 && str_starts_with($docQr, 'CMMS-D-'), $r['raw']);

    echo "== 4. ECR: วงจรจนขออนุมัติ ==\n";
    $r = req(BASE . $ECR . '?action=create', ['action' => 'create', 'csrf_token' => $csrf,
        'title' => '[TEST] ECR API ' . $stamp, 'change_type' => 'process_change',
        'description' => 'ทดสอบ ECR ผ่าน API', 'reason' => 'ลดข้อผิดพลาด', 'priority' => 'medium',
        'requested_by' => 61]);
    ok('สร้าง ECR ผ่าน API', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
    $ecrId = (int)($r['json']['id'] ?? 0);
    $ecrNo = (string)($r['json']['ecr_no'] ?? '');
    ok('ได้เลข ECR', $ecrId > 0 && (bool)preg_match('~^ECR-\d{4}-\d{3}$~', $ecrNo), $r['raw']);
    $r = req(BASE . $ECR . '?action=request_approval', ['action' => 'request_approval', 'csrf_token' => $csrf, 'ecr_id' => $ecrId]);
    ok('ขออนุมัติจาก draft -> 409 CONFLICT', $r['code'] === 409 && ($r['json']['code'] ?? '') === 'CONFLICT', (string)$r['code'] . ' ' . $r['raw']);
    foreach (['submit', 'start_review', 'start_impact'] as $a) {
        $r = req(BASE . $ECR . '?action=' . $a, ['action' => $a, 'csrf_token' => $csrf, 'ecr_id' => $ecrId]);
        ok("ECR $a สำเร็จ", $r['code'] === 200 && (string)($r['json']['status'] ?? '') !== '', (string)$r['code'] . ' ' . $r['raw']);
    }
    $r = req(BASE . $ECR . '?action=approve', ['action' => 'approve', 'csrf_token' => $csrf,
        'ecr_id' => $ecrId, 'step' => 1, 'decision' => 'approved']);
    ok('อนุมัติก่อนขออนุมัติ -> 409', $r['code'] === 409, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=request_approval', ['action' => 'request_approval', 'csrf_token' => $csrf, 'ecr_id' => $ecrId]);
    ok('ไม่มีผลกระทบ -> 409 พร้อมเหตุผล', $r['code'] === 409 && ($r['json']['code'] ?? '') === 'CONFLICT'
        && trim((string)($r['json']['error'] ?? '')) !== '', (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=impact_add', ['action' => 'impact_add', 'csrf_token' => $csrf,
        'ecr_id' => $ecrId, 'impact_area' => 'safety', 'severity' => 'critical', 'description' => 'เพิ่มการยืนยันก่อนปิดงาน',
        'required_action' => 'ปรับ WI', 'owner_id' => 1]);
    ok('เพิ่มผลกระทบระดับ critical ผ่าน API', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
    $impactId = (int)($r['json']['id'] ?? 0);
    $r = req(BASE . $ECR . '?action=impact_update', ['action' => 'impact_update', 'csrf_token' => $csrf,
        'impact_id' => $impactId, 'status' => 'nope']);
    ok('สถานะผลกระทบผิด -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=link_add', ['action' => 'link_add', 'csrf_token' => $csrf,
        'ecr_id' => $ecrId, 'link_type' => 'document', 'entity_id' => $docId, 'action_required' => 'ทบทวนเอกสาร']);
    ok('ผูก traceability ไปยังเอกสารได้', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $linkId = (int)($r['json']['id'] ?? 0);
    $r = req(BASE . $ECR . '?action=request_approval', ['action' => 'request_approval', 'csrf_token' => $csrf, 'ecr_id' => $ecrId]);
    ok('ขออนุมัติสำเร็จหลังมีผลกระทบ', $r['code'] === 200 && (string)($r['json']['status'] ?? '') === 'pending_approval', $r['raw']);
    $r = req(BASE . $ECR . '?action=approvals&ecr_id=' . $ecrId);
    ok('สายอนุมัติครบ 3 ขั้น (critical ต้องมี engineering_approval)', $r['code'] === 200
        && count($r['json']['approvals'] ?? []) === 3, $r['raw']);
    $r = req(BASE . $ECR . '?action=approve', ['action' => 'approve', 'csrf_token' => $csrf,
        'ecr_id' => $ecrId, 'step' => 1, 'decision' => 'maybe']);
    ok('decision ผิด -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=approve', ['action' => 'approve', 'csrf_token' => $csrf,
        'ecr_id' => $ecrId, 'step' => 2, 'decision' => 'approved']);
    ok('ข้ามขั้น (อนุมัติ step 2 ก่อน step 1) -> 409', $r['code'] === 409, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=link_update', ['action' => 'link_update', 'csrf_token' => $csrf,
        'link_id' => $linkId, 'action_status' => 'in_progress', 'note' => 'เริ่มทบทวน']);
    ok('อัปเดตสถานะการดำเนินการของ link ได้', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=link_update', ['action' => 'link_update', 'csrf_token' => $csrf,
        'link_id' => $linkId, 'action_status' => 'completed']);
    ok('สถานะ link ที่ไม่อยู่ในคลัง -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=link_update', ['action' => 'link_update', 'csrf_token' => $csrf,
        'link_id' => $linkId, 'action_status' => 'done', 'note' => 'ทบทวนแล้ว']);
    ok('ปิดผลการดำเนินการของ link ได้', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);

    echo "== 5. RBAC ตามบทบาท (role 7 = Foreman: สร้างได้ แต่อนุมัติ/ปิด/บังคับมีผลไม่ได้) ==\n";
    $cookie = $sForeman['cookie'];
    $csrfF = $sForeman['csrf'];
    $r = req(BASE . $ECR . '?action=get&id=' . $ecrId);
    ok('role 7 ดู ECR ได้', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=approve', ['action' => 'approve', 'csrf_token' => $csrfF,
        'ecr_id' => $ecrId, 'step' => 1, 'decision' => 'approved', 'comment' => 'ผ่าน']);
    ok('role 7 อนุมัติไม่ได้ -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=close', ['action' => 'close', 'csrf_token' => $csrfF, 'ecr_id' => $ecrId, 'summary' => 'x']);
    ok('role 7 ปิดงานไม่ได้ -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=record_verification', ['action' => 'record_verification', 'csrf_token' => $csrfF,
        'ecr_id' => $ecrId, 'result' => 'pass', 'notes' => 'ผ่าน']);
    ok('role 7 บันทึกการตรวจสอบไม่ได้ -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=rev_effective', ['action' => 'rev_effective', 'csrf_token' => $csrfF, 'revision_id' => 999999]);
    ok('role 7 บังคับมีผลไม่ได้ -> 403 (ตรวจสิทธิ์ก่อนแตะ engine)', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=ack_assign', ['action' => 'ack_assign', 'csrf_token' => $csrfF, 'document_id' => $docId, 'user_ids' => [1]]);
    ok('role 7 จัดการ training/ack ไม่ได้ -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=create', ['action' => 'create', 'csrf_token' => $csrfF,
        'doc_type' => 'sop', 'title' => '[TEST] foreman ' . $stamp]);
    ok('role 7 สร้างเอกสารได้ (document: create)', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $fmDocId = (int)($r['json']['id'] ?? 0);
    $r = req(BASE . $ECR . '?action=create', ['action' => 'create', 'csrf_token' => $csrfF,
        'title' => '[TEST] foreman ecr ' . $stamp, 'change_type' => 'other', 'description' => 'd', 'reason' => 'r']);
    ok('role 7 สร้าง ECR ได้ (engineering_change: create)', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $fmEcrId = (int)($r['json']['id'] ?? 0);

    echo "== 6. segregation of duties: ผู้ขอห้ามอนุมัติเอง ==\n";
    $cookie = $sManager['cookie'];
    $csrfM = $sManager['csrf'];
    $r = req(BASE . $ECR . '?action=create', ['action' => 'create', 'csrf_token' => $csrfM,
        'title' => '[TEST] SoD ' . $stamp, 'change_type' => 'other', 'description' => 'd', 'reason' => 'r',
        'requested_by' => 1]);
    $ecrSodId = (int)($r['json']['id'] ?? 0);
    ok('สร้าง ECR ที่ผู้ขอคือตัวเอง', $r['code'] === 200 && $ecrSodId > 0, $r['raw']);
    foreach (['submit', 'start_review', 'start_impact'] as $a) {
        req(BASE . $ECR . '?action=' . $a, ['action' => $a, 'csrf_token' => $csrfM, 'ecr_id' => $ecrSodId]);
    }
    $r = req(BASE . $ECR . '?action=impact_add', ['action' => 'impact_add', 'csrf_token' => $csrfM,
        'ecr_id' => $ecrSodId, 'impact_area' => 'quality', 'severity' => 'low', 'description' => 'ปรับสูตรตรวจ']);
    $r = req(BASE . $ECR . '?action=request_approval', ['action' => 'request_approval', 'csrf_token' => $csrfM, 'ecr_id' => $ecrSodId]);
    ok('ขออนุมัติสำเร็จ', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=approve', ['action' => 'approve', 'csrf_token' => $csrfM,
        'ecr_id' => $ecrSodId, 'step' => 1, 'decision' => 'approved', 'comment' => 'อนุมัติเอง']);
    ok('ผู้ขออนุมัติเอง -> 403/409 (SoD)', in_array($r['code'], [403, 409], true), (string)$r['code'] . ' ' . $r['raw']);

    echo "== 7. idempotency กันส่งซ้ำ ==\n";
    $cookie = $sAdmin['cookie'];
    $key = 'p32-test-' . $stamp;
    $body = ['action' => 'create', 'csrf_token' => $csrf, 'client_action_id' => $key,
        'title' => '[TEST] idempotent ' . $stamp, 'change_type' => 'other', 'description' => 'd', 'reason' => 'r',
        'requested_by' => 61];
    $r = req(BASE . $ECR . '?action=create', $body);
    $idemId = (int)($r['json']['id'] ?? 0);
    ok('สร้างครั้งแรกได้ id', $r['code'] === 200 && $idemId > 0, $r['raw']);
    $r = req(BASE . $ECR . '?action=create', $body);
    ok('ส่งซ้ำด้วย client_action_id เดิม -> dedup ไม่สร้างซ้ำ', $r['code'] === 200 && ($r['json']['dedup'] ?? false) === true
        && (int)($r['json']['id'] ?? 0) === $idemId, $r['raw']);
    $r = req(BASE . $ECR . '?action=create', $body);
    $pdo = getDb();
    $n = (int)$pdo->query("SELECT COUNT(*) FROM engineering_changes WHERE title = " . $pdo->quote('[TEST] idempotent ' . $stamp))->fetchColumn();
    ok('มี ECR เพียง 1 แถวหลังส่งซ้ำ 3 ครั้ง', $n === 1, "rows=$n");

    echo "== 8. DomainException -> HTTP code ==\n";
    $r = req(BASE . $ECR . '?action=get&id=99999999');
    ok('ECR ไม่มีจริง -> 404 NOT_FOUND', $r['code'] === 404 && ($r['json']['code'] ?? '') === 'NOT_FOUND', $r['raw']);
    $r = req(BASE . $DOC . '?action=get&id=99999999');
    ok('เอกสารไม่มีจริง -> 404', $r['code'] === 404, $r['raw']);
    $r = req(BASE . $DOC . '?action=rev_effective', ['action' => 'rev_effective', 'csrf_token' => $csrf, 'revision_id' => 999999]);
    ok('revision ไม่มีจริง -> 404', $r['code'] === 404, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=cancel', ['action' => 'cancel', 'csrf_token' => $csrf, 'ecr_id' => $ecrId]);
    ok('ยกเลิกโดยไม่ระบุเหตุผล -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=cancel', ['action' => 'cancel', 'csrf_token' => $csrf, 'ecr_id' => $ecrId, 'reason' => 'ทดสอบ']);
    ok('ยกเลิก ECR ที่อยู่ระหว่างอนุมัติได้ (พร้อมเหตุผล)', $r['code'] === 200 && (string)($r['json']['status'] ?? '') === 'cancelled', $r['raw']);
    $r = req(BASE . $ECR . '?action=submit', ['action' => 'submit', 'csrf_token' => $csrf, 'ecr_id' => $ecrId]);
    ok('ย้อนสถานะหลังยกเลิก -> 409', $r['code'] === 409, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=cancel', ['action' => 'cancel', 'csrf_token' => $csrf, 'ecr_id' => $fmEcrId, 'reason' => 'ทดสอบ']);
    ok('ยกเลิก ECR ที่ยัง draft ได้', $r['code'] === 200 && (string)($r['json']['status'] ?? '') === 'cancelled', $r['raw']);

    echo "== 9. read models ==\n";
    $r = req(BASE . $ECR . '?action=summary');
    ok('summary 200', $r['code'] === 200 && isset($r['json']['summary']['by_status']), $r['raw']);
    $r = req(BASE . $ECR . '?action=list&status=pending_approval');
    ok('list กรองสถานะได้', $r['code'] === 200 && is_array($r['json']['ecrs'] ?? null), $r['raw']);
    $r = req(BASE . $ECR . '?action=list&status=bogus');
    ok('สถานะที่ไม่รู้จักไม่ทำให้ error', $r['code'] === 200, (string)$r['code']);
    $r = req(BASE . $ECR . '?action=list&from=2027-01-01&to=2026-01-01');
    ok('ช่วงวันที่กลับด้าน -> 400', $r['code'] === 400, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=by_no&ecr_no=ECR-1900-001');
    ok('ค้นหา ECR ด้วยเลขที่ไม่มีจริง -> 404', $r['code'] === 404, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $ECR . '?action=activity&ecr_id=' . $ecrId);
    ok('activity 200', $r['code'] === 200 && count($r['json']['activity'] ?? []) > 0, $r['raw']);
    $r = req(BASE . $ECR . '?action=verifications&ecr_id=' . $ecrId);
    ok('verifications 200', $r['code'] === 200, (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=dashboard');
    ok('document dashboard 200', $r['code'] === 200 && isset($r['json']['dashboard']), (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=my_pending');
    ok('my_pending 200', $r['code'] === 200 && is_array($r['json']['items'] ?? null), (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=reports&report=summary');
    ok('reports 200', $r['code'] === 200 && isset($r['json']['report']), (string)$r['code'] . ' ' . $r['raw']);
    $r = req(BASE . $DOC . '?action=data_quality');
    ok('data_quality 200', $r['code'] === 200 && isset($r['json']['data_quality']), (string)$r['code']);
    $r = req(BASE . $DOC . '?action=effective&asset_id=1');
    ok('effective สำหรับเครื่อง 200', $r['code'] === 200 && is_array($r['json']['documents'] ?? null), (string)$r['code']);

    echo "== 10. QR resolution (CMMS-D / CMMS-E) ==\n";
    $SCAN = '/api/v1/scan.php';
    // 10.1 แยกชนิด payload ถูกต้อง (pure function — ไม่ต้องผ่าน HTTP)
    require_once __DIR__ . '/../src/helpers/scan.php';
    $parseCases = [
        ['CMMS-D-9F3A21BC7D', 'document', '9F3A21BC7D'],
        ['CMMS-D_9F3A21BC7D', 'document', '9F3A21BC7D'],
        ['SOP-2026-001', 'document', 'SOP-2026-001'],
        ['CMMS-E-ECR-2026-001', 'ecr', 'ECR-2026-001'],
        ['ECR-2026-001', 'ecr', 'ECR-2026-001'],
        ['CMMS-A-9F3A21BC7D', 'asset', '9F3A21BC7D'],
        ['CMMS-W-145', 'work_order', '145'],
        ['CMMS-P-88', 'pm', '88'],
        ['CMMS-S-BRG-001', 'spare', 'BRG-001'],
    ];
    foreach ($parseCases as [$in, $wantType, $wantKey]) {
        $got = scan_parse($in);
        ok("scan_parse('$in') -> $wantType", $got['type'] === $wantType && $got['key'] === $wantKey, json_encode($got, JSON_UNESCAPED_UNICODE));
    }
    // 10.2 สแกน QR เอกสาร (token) -> ได้เอกสาร + effective revision + สถานะ ack
    $r = req(BASE . $SCAN . '?action=resolve&code=' . urlencode($docQr));
    $isDoc = ($r['json']['type'] ?? '') === 'document';
    ok('สแกน CMMS-D (token) -> document', $r['code'] === 200 && $isDoc, $r['raw']);
    ok('ได้เลขเอกสารตรงกับที่สร้าง', ($r['json']['data']['document']['doc_no'] ?? '') === $docNo, $r['raw']);
    ok('คืนสถานะการรับทรางของผู้สแกน', array_key_exists('outstanding_ack', (array)($r['json']['data'] ?? [])), $r['raw']);
    ok('สแกนไม่ทำให้เอกสารมีผลบังคับใช้เอง', ($r['json']['data']['effective_revision'] ?? null) === null, $r['raw']);
    // 10.3 สแกนด้วยเลขเอกสารตรง ๆ
    $r = req(BASE . $SCAN . '?action=resolve&code=' . urlencode($docNo));
    ok('สแกนด้วยเลขเอกสารตรง -> document', ($r['json']['type'] ?? '') === 'document', $r['raw']);
    // 10.4 Foreman (role 7) มี document:view -> สแกนได้ แต่รับทรางไม่ได้ (ไม่มีสิทธิ์ acknowledge)
    $r = req(BASE . $SCAN . '?action=resolve&code=' . urlencode($docQr), null, $sForeman);
    ok('role 7 สแกนเอกสารได้', ($r['json']['type'] ?? '') === 'document', $r['raw']);
    ok('role 7 รับทรางไม่ได้', ($r['json']['data']['can_acknowledge'] ?? false) === false, $r['raw']);
    // 10.5 สแกน ECR ด้วยเลขที่
    $r = req(BASE . $SCAN . '?action=resolve&code=' . urlencode($ecrNo));
    ok('สแกน CMMS-E (เลข ECR) -> ecr', ($r['json']['type'] ?? '') === 'ecr', $r['raw']);
    ok('คืนสายอนุมัติของ ECR', is_array($r['json']['data']['approvals'] ?? null), $r['raw']);
    // 10.6 Foreman สแกน ECR ได้แต่สถานะ can_approve ต้อง false
    $r = req(BASE . $SCAN . '?action=resolve&code=' . urlencode($ecrNo), null, $sForeman);
    ok('role 7 สแกน ECR ได้ แต่ can_approve = false', ($r['json']['type'] ?? '') === 'ecr' && ($r['json']['data']['can_approve'] ?? true) === false, $r['raw']);
    // 10.7 payload ที่ไม่มีจริง -> unknown ไม่ error
    $r = req(BASE . $SCAN . '?action=resolve&code=CMMS-D-ZZZZZZZZZZ');
    ok('สแกน token ที่ไม่มีจริง -> unknown', ($r['json']['type'] ?? '') === 'unknown', $r['raw']);
    $r = req(BASE . $SCAN . '?action=resolve&code=ECR-1900-001');
    ok('สแกนเลข ECR ที่ไม่มีจริง -> unknown', ($r['json']['type'] ?? '') === 'unknown', $r['raw']);
    // 10.8 รายการฉลาก QR เอกสาร + บันทึกการพิมพ์
    $r = req(BASE . $SCAN . '?action=document_labels');
    ok('document_labels 200', $r['code'] === 200 && is_array($r['json']['items'] ?? null), (string)$r['code'] . ' ' . $r['raw']);
    ok('document_labels คืน prefix CMMS-D-', ($r['json']['prefix'] ?? '') === 'CMMS-D-', (string)($r['json']['prefix'] ?? ''));
    $r = req(BASE . $SCAN . '?action=document_labels&status=active');
    ok('document_labels กรองสถานะได้', $r['code'] === 200, (string)$r['code']);
    $r = req(BASE . $SCAN . '?action=document_print_log', ['action' => 'document_print_log', 'csrf_token' => $csrf,
        'document_ids' => [$docId, 999999], 'template' => 'a4-sheet']);
    ok('document_print_log นับเฉพาะที่มีจริง', $r['code'] === 200 && (int)($r['json']['logged'] ?? 0) === 1, $r['raw']);
    $r = req(BASE . $SCAN . '?action=document_print_log', ['action' => 'document_print_log', 'document_ids' => [$docId]]);
    ok('document_print_log ไม่มี CSRF -> 403', $r['code'] === 403, (string)$r['code'] . ' ' . $r['raw']);
    // 10.9 role 7 พิมพ์ฉลากเอกสารได้ (มี document:view) แต่ทำผ่าน scan ไม่ได้
    $r = req(BASE . $SCAN . '?action=resolve');
    ok('สแกนโดยไม่ระบุ code -> 400', $r['code'] === 400, (string)$r['code']);
} catch (Throwable $e) {
    $fail++;
    echo "  FATAL " . get_class($e) . ': ' . $e->getMessage() . "\n    " . $e->getFile() . ':' . $e->getLine() . "\n";
} finally {
    echo "\n== cleanup ==\n";
    $pdo = getDb();
    // ลบตาม stamp ของรอบนี้ทั้งหมด (ครอบคลุมแม้ assertion ที่ล้มเหลวจะสร้างข้อมูลไปแล้ว)
    $like = '%' . $stamp . '%';
    $ecrIds = array_map('intval', $pdo->query('SELECT id FROM engineering_changes WHERE title LIKE ' . $pdo->quote($like))->fetchAll(PDO::FETCH_COLUMN));
    foreach ($ecrIds as $id) purgeEcr($pdo, $id);
    $docIds = array_map('intval', $pdo->query('SELECT id FROM controlled_documents WHERE title LIKE ' . $pdo->quote($like))->fetchAll(PDO::FETCH_COLUMN));
    foreach ($docIds as $id) purgeDoc($pdo, $id);
    $pdo->exec('DELETE FROM engineering_change_activity WHERE ecr_id NOT IN (SELECT id FROM engineering_changes)');
    $pdo->exec('DELETE FROM client_action_log WHERE client_action_id LIKE ' . $pdo->quote('p32-test-%'));
    $left = [];
    foreach (['engineering_changes', 'engineering_change_impacts', 'engineering_change_activity', 'engineering_change_approvals',
        'engineering_change_links', 'engineering_change_verifications', 'controlled_documents', 'document_revisions',
        'document_acknowledgements', 'document_activity', 'document_links', 'document_training', 'document_training_results',
        'document_impacts', 'document_approvals'] as $t) {
        $left[$t] = (int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    }
    $nonZero = array_filter($left, fn($v) => $v > 0);
    echo "remaining rows: " . json_encode($left) . "\n";
    ok('ไม่เหลือข้อมูลทดสอบค้างในฐานข้อมูล', $nonZero === [], json_encode($nonZero));
    foreach ([$sAdmin, $sManager, $sForeman] as $s) @unlink($s['file']);
    echo "PASS=$pass FAIL=$fail\n";
    exit($fail === 0 ? 0 : 1);
}
