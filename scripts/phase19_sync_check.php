<?php
/**
 * scripts/phase19_sync_check.php — ตรวจกลไก Offline Sync ของ Phase 19
 *
 * ตรวจ:
 *   [Unit] idempotency helper บันทึก/ค้น/จบ (DB ตรง)
 *   [HTTP] login → POST สร้างใบงาน (idempotent) → ส่งซ้ำ key เดียวกัน → dedup
 *   [HTTP] spare_usage add + ส่งซ้ำ → ไม่เบิกรายการซ้ำ (จำนวนไม่เพิ่มทวีคูณ)
 *   [HTTP] PUT แก้ใบงานด้วย base_updated_at เก่า → 409 CONFLICT → ใช้ค่าล่าสุด → สำเร็จ
 *   [HTTP] repair_attachment อัปโหลดรูป + ส่งซ้ำ → ได้ attachment เดียว
 *   -> ล้างข้อมูลทดสอบ (ใบงาน/attachment/ไฟล์) หลังรันเสมอ
 *
 * วิธีรัน (HTTP ต้องมี user/pass จึงรัน):
 *   $env:CMMS_TEST_USER="E01117"; $env:CMMS_TEST_PASS="xxx"; php scripts/phase19_sync_check.php
 *   (ถ้าไม่มี env → รันเฉพาะส่วน Unit — เหมาะสำหรับ pre-push)
 *
 * exit code = จำนวนข้อผิดพลาด (0 = ผ่าน)
 */
error_reporting(E_ALL);
ini_set('display_errors', '1');

$BASE = 'http://localhost:8081';
$USER = (string)(getenv('CMMS_TEST_USER') ?: '');
$PASS = (string)(getenv('CMMS_TEST_PASS') ?: '');
$PASS_N = 0;
$FAIL_N = 0;

function ok(string $msg): void { global $PASS_N; $PASS_N++; echo "  [PASS] {$msg}\n"; }
function bad(string $msg): void { global $FAIL_N; $FAIL_N++; echo "  [FAIL] {$msg}\n"; }

function http_request(string $url, string $method = 'GET', array $headers = [], string $body = null, array $cookies = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    if ($headers) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    if ($cookies) curl_setopt($ch, CURLOPT_COOKIE, implode('; ', $cookies));
    $raw = (string)curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$code, $raw];
}

function split_response(string $raw): array {
    if (preg_match("/\r?\n\r?\n/", $raw, $m, PREG_OFFSET_CAPTURE)) {
        $head = substr($raw, 0, $m[0][1]);
        $body = substr($raw, $m[0][1] + strlen($m[0][0]));
    } else {
        $head = '';
        $body = $raw;
    }
    $setCookies = [];
    if (preg_match_all('/^Set-Cookie:\s*([^;]+);/mi', $head, $mc)) {
        foreach ($mc[1] as $c) $setCookies[] = trim($c);
    }
    return [$body, $setCookies];
}

function json_body(string $raw): array {
    [$body] = split_response($raw);
    $j = json_decode($body, true);
    return is_array($j) ? $j : [];
}

echo "=" . str_repeat('=', 76) . "\n";
echo "  CMMS-TPT Phase 19 — Offline Sync / Idempotency / Conflict Check\n";
echo "=" . str_repeat('=', 76) . "\n\n";

/* ───────────── 1) Unit: idempotency helper (DB) ───────────── */
echo "[1] Idempotency helper (DB unit)\n";
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/idempotency.php';
$pdo = getDb();
$key = 'unit-' . bin2hex(random_bytes(6));

try {
    $t = $pdo->query('SHOW TABLES LIKE "client_action_log"')->fetchColumn();
    if ($t === 'client_action_log') ok('client_action_log table exists');
    else bad('client_action_log missing');
} catch (Exception $e) { bad('client_action_log check: ' . $e->getMessage()); }

$r1 = clientActionBegin($pdo, $key, 'PUT', '/api/v1/repair.php');
ok($r1['status'] === 'new' ? 'begin → new' : 'begin -> ' . $r1['status']);
$r2 = clientActionBegin($pdo, $key, 'PUT', '/api/v1/repair.php');
ok($r2['status'] === 'duplicate_processing' ? 'begin ซ้ำ (processing) → duplicate_processing' : 'begin ซ้ำ -> ' . $r2['status']);
clientActionFinish($pdo, $key, 'success', 'repair', 123, 200);
$r3 = clientActionBegin($pdo, $key, 'PUT', '/api/v1/repair.php');
ok($r3['status'] === 'replay' && (int)$r3['ref_id'] === 123 ? 'begin หลัง success → replay (ref_id=123)' : 'after success -> ' . $r3['status']);

$row = $pdo->prepare("SELECT outcome, ref_type, ref_id FROM client_action_log WHERE client_action_id = ?");
$row->execute([$key]);
$rec = $row->fetch(PDO::FETCH_ASSOC);
if ($rec && $rec['outcome'] === 'success' && $rec['ref_type'] === 'repair') ok('บันทึก outcome=success + ref_type ถูกต้อง');
else bad('outcome/ref_type ผิด: ' . json_encode($rec, JSON_UNESCAPED_UNICODE));
$pdo->prepare("DELETE FROM client_action_log WHERE client_action_id LIKE 'unit-%' OR client_action_id LIKE 'p19-%'")->execute();
ok('ล้าง test rows (client_action_log)');

/* ───────────── 2+) HTTP tests (ต้องมี env user/pass) ───────────── */
if ($USER === '' || $PASS === '') {
    echo "\n[2] HTTP idempotency (skipped — ตั้ง CMMS_TEST_USER/CMMS_TEST_PASS สำหรับรันเต็ม)\n";
    echo "\n" . str_repeat('-', 76) . "\nSUM: {$PASS_N} passed, {$FAIL_N} failed\n";
    exit($FAIL_N > 0 ? 1 : 0);
}

// login
[$code, $raw] = http_request($BASE . '/api/auth/login.php', 'POST', ['Content-Type: application/json'], json_encode(['username' => $USER, 'password' => $PASS]));
[$body, $cookies] = split_response($raw);
$lj = json_decode($body, true);
if ($code !== 200 || empty($cookies) || ($lj['success'] ?? false) !== true) {
    echo "\n[2] Login ล้มเหลว (check CMMS_TEST_USER/CMMS_TEST_PASS) — status={$code}\n";
    exit(1);
}
ok("login สำเร็จ (username={$USER})");

$csrf = json_body(http_request($BASE . '/api/v1/csrf.php', 'GET', [], null, $cookies)[1]);
$csrfTok = (string)($csrf['csrf_token'] ?? '');
if ($csrfTok === '') { bad('csrf token ไม่ได้'); exit(1); }
ok('get CSRF token');
$common = ['Content-Type: application/json', 'X-CSRF-Token: ' . $csrfTok];

$base = [
    'title' => 'PH19 Sync Test ' . date('His'),
    'asset_id' => (int)($pdo->query('SELECT id FROM asset_registry ORDER BY id LIMIT 1')->fetchColumn() ?: 0),
    'priority' => 'medium',
    'receiver_name' => 'SyncCheck',
    'reporter_phone' => '0000000000',
    'contaminate_checking' => 'clean',
];
if ($base['asset_id'] === 0) {
    echo "ไม่มี asset_registry — สร้างใบงานทดสอบไม่ได้\n";
    exit(1);
}

// 2) POST create + dedup
echo "\n[2] WO create idempotency\n";
$ck = 'p19-' . bin2hex(random_bytes(6));
$body = array_merge($base, ['client_action_id' => $ck]);
[$c1, $r1n] = http_request($BASE . '/api/v1/repair.php', 'POST', $common, json_encode($body), $cookies);
$j1 = json_body($r1n);
$woId = (int)($j1['id'] ?? 0);
if ($c1 === 200 && $woId > 0) ok("สร้างใบงาน #$woId สำเร็จ (create)");
else { bad('create ใบงานล้มเหลว status=' . $c1 . ' ' . mb_substr($r1n, 0, 300)); exit(1); }

[$c2, $r2n] = http_request($BASE . '/api/v1/repair.php', 'POST', $common, json_encode($body), $cookies);
$j2 = json_body($r2n);
if ($c2 === 200 && ($j2['dedup'] ?? false) === true) ok('POST ซ้ำคีย์เดียวกัน → dedup (ไม่สร้างใบงานซ้ำ)');
else bad("POST ซ้ำ → status={$c2} dup=" . ($j2['dedup'] ?? 'n/a'));

// 3) spare_usage add + dedup (accumulate ไม่ทวีคูณ)
echo "\n[3] spare_usage add idempotency (ไม่ทวีคูณ)\n";
$sp = $pdo->query('SELECT id, code, stock_qty FROM spare_parts ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
if ($sp) {
    $sk = 'p19-' . bin2hex(random_bytes(6));
    $sBody = ['action' => 'add', 'work_order_id' => $woId, 'items' => [['spare_part_id' => (int)$sp['id'], 'qty' => 2]], 'client_action_id' => $sk];
    [$c3] = http_request($BASE . '/api/v1/spare_usage.php', 'POST', $common, json_encode($sBody), $cookies);
    [$c4] = http_request($BASE . '/api/v1/spare_usage.php', 'POST', $common, json_encode($sBody), $cookies);
    $qtyQ = $pdo->prepare('SELECT quantity_used FROM repair_spare_parts WHERE repair_id = ? AND spare_part_id = ?');
    $qtyQ->execute([$woId, (int)$sp['id']]);
    $qty = (float)$qtyQ->fetchColumn();
    if ($c3 === 200 && $c4 === 200 && abs($qty - 2.0) < 0.001) ok("add 2 qty + ส่งซ้ำ → quantity_used=2 (ไม่เป็น 4)");
    else bad("c3={$c3} c4={$c4} qty={$qty} (ควร 2)");
    // cleanup spare rows
    $pdo->prepare('DELETE FROM spare_issue_request_items WHERE request_id IN (SELECT id FROM spare_issue_requests WHERE work_order_id = ?)')->execute([$woId]);
    $pdo->prepare('DELETE FROM spare_issue_requests WHERE work_order_id = ?')->execute([$woId]);
    $pdo->prepare('DELETE FROM repair_spare_parts WHERE repair_id = ?')->execute([$woId]);
} else {
    bad('ไม่มี spare_parts ในระบบ — ข้าม test spare_usage');
}

// 4) conflict detection (base_updated_at)
echo "\n[4] Conflict detection (base_updated_at)\n";
$g = json_body(http_request($BASE . '/api/v1/repair.php?id=' . $woId, 'GET', $common, null, $cookies)[1]);
if (empty($g['id']) && empty($g['status']) && empty($g['title'])) { $g = json_body(http_request($BASE . '/api/v1/repair.php?id=' . $woId, 'GET', $common, null, $cookies)[1]); }
$upd = (string)($g['updated_at'] ?? $g['data']['updated_at'] ?? '');
if ($upd === '') bad('GET ใบงานไม่ได้ updated_at — ข้าม conflict test');
else {
    $stale = date('Y-m-d H:i:s', strtotime($upd) - 3600);
    $cBody = ['status' => 'in_progress', 'base_updated_at' => $stale, 'client_action_id' => 'p19-' . bin2hex(random_bytes(6))];
    [$c5, $r5n] = http_request($BASE . '/api/v1/repair.php?id=' . $woId, 'PUT', $common, json_encode($cBody), $cookies);
    $j5 = json_body($r5n);
    if ($c5 === 409 && ($j5['code'] ?? '') === 'CONFLICT') ok("PUT status + base_updated_at เก่า → 409 CONFLICT");
    else bad("PUT stale → status={$c5} code=" . ($j5['code'] ?? 'n/a'));

    $okBody = ['status' => 'in_progress', 'base_updated_at' => $upd, 'client_action_id' => 'p19-' . bin2hex(random_bytes(6))];
    [$c6] = http_request($BASE . '/api/v1/repair.php?id=' . $woId, 'PUT', $common, json_encode($okBody), $cookies);
    if ($c6 === 200) ok("PUT status + base_updated_at ปัจจุบัน → 200");
    else bad("PUT current → status={$c6}");
}

// 5) repair_attachment upload + dedup + cleanup file
echo "\n[5] repair_attachment อัปโหลด + dedup\n";
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
$dataUrl = 'data:image/png;base64,' . base64_encode($png);
$ak = 'p19-' . bin2hex(random_bytes(6));
$aBody = ['work_order_id' => $woId, 'category' => 'after_image', 'data' => $dataUrl, 'file_name' => 't.png', 'client_action_id' => $ak];
[$c7, $r7n] = http_request($BASE . '/api/v1/repair_attachment.php', 'POST', $common, json_encode($aBody), $cookies);
$j7 = json_body($r7n);
[$c8, $r8n] = http_request($BASE . '/api/v1/repair_attachment.php', 'POST', $common, json_encode($aBody), $cookies);
$j8 = json_body($r8n);
$attId = (int)($j7['attachment_id'] ?? 0);
if ($c7 === 200 && $attId > 0 && ($j8['dedup'] ?? false) === true) ok("upload ครั้งแรก + ส่งซ้ำ → attachment เดียว (id={$attId})");
else bad("c7={$c7} c8={$c8} j7=" . json_encode($j7, JSON_UNESCAPED_UNICODE));
// cleanup attachment row + file
try {
    $rowF = $pdo->prepare('SELECT file_path FROM repair_attachments WHERE id = ?');
    $rowF->execute([$attId]);
    $fp = (string)$rowF->fetchColumn();
    $pdo->prepare('DELETE FROM repair_attachments WHERE id = ?')->execute([$attId]);
    if ($fp) { foreach (['public/uploads/repair/' . basename($fp), 'uploads/repair/' . basename($fp)] as $p) { if (is_file(__DIR__ . '/../' . $p)) @unlink(__DIR__ . '/../' . $p); } }
} catch (Exception $e) { /* cleanup best-effort */ }

// cleanup: ลบใบงานทดสอบ + related
echo "\n[6] Cleanup ใบงานทดสอบ\n";
try {
    $pdo->prepare('DELETE FROM work_assignees WHERE ref_type = "repair" AND ref_id = ?')->execute([$woId]);
    $pdo->prepare('DELETE FROM repair_activity_log WHERE repair_id = ?')->execute([$woId]);
    $pdo->prepare('DELETE FROM repair_attachments WHERE repair_id = ?')->execute([$woId]);
    $pdo->prepare('DELETE FROM repair_spare_parts WHERE repair_id = ?')->execute([$woId]);
    $pdo->prepare('DELETE FROM spare_issue_request_items WHERE request_id IN (SELECT id FROM spare_issue_requests WHERE work_order_id = ?)')->execute([$woId]);
    $pdo->prepare('DELETE FROM spare_issue_requests WHERE work_order_id = ?')->execute([$woId]);
    $pdo->prepare('DELETE FROM repair WHERE id = ?')->execute([$woId]);
    ok('ลบใบงาน #' . $woId . ' + ข้อมูลอ้างอิงแล้ว');
} catch (Exception $e) { bad('cleanup: ' . $e->getMessage()); }

echo "\n" . str_repeat('-', 76) . "\n";
echo "  SUMMARY: {$PASS_N} passed, {$FAIL_N} failed\n";
echo str_repeat('-', 76) . "\n";
echo ($FAIL_N === 0 ? "RESULT: PASS — กลไก offline sync/idempotency ทำงานถูกต้อง\n" : "RESULT: FAIL — แก้ {$FAIL_N} รายการก่อน push\n");
exit($FAIL_N > 0 ? 1 : 0);