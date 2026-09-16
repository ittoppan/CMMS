<?php
/**
 * repair_attachment.php — อัปโหลดภาพ/ไฟล์หลักฐานเข้ารายงานซ่อม (Phase 19 Offline)
 *
 * POST /api/v1/repair_attachment.php   (login + CSRF + idempotent)
 * body (JSON):
 *   {
 *     "work_order_id": 123,
 *     "category": "after_image|failure_image|document|other",
 *     "data":  "data:image/jpeg;base64,....",     // หรือ multipart $_FILES['file']
 *     "file_name": "photo1.jpg",                    // optional
 *     "client_action_id": "uuid-..."               // offline sync queue (กันส่งซ้ำ)
 *   }
 *
 * -> { success:true, attachment_id, url:"/uploads/repair/xxx.jpg" }
 *
 * ใช้โดย offline photo flow: PWA บันทึกรูปไว้เครื่อง (IndexedDB) → sync กลับ
 * เมื่อ online → endpoint นี้เขียนไฟล์ + ผูก repair_attachments ครั้งเดียว
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';

header('Content-Type: application/json; charset=utf-8');
session_start();
enforceCsrf();

try {
    $pdo = getDb();
    requireLogin($pdo);

    $method = $_SERVER['REQUEST_METHOD'] ?? '';

    // ---- GET: รายการ attachments ของใบงาน (สำหรับ view page + preview หลัง sync) ----
    if ($method === 'GET') {
        $woId = (int)($_GET['work_order_id'] ?? 0);
        if (!$woId) { http_response_code(400); echo json_encode(['error' => 'Missing work_order_id']); exit; }
        $cu = currentUser($pdo);
        $isSup = canSupervisor();
        $uid = $cu ? (int)$cu['id'] : 0;
        $st = $pdo->prepare("SELECT COUNT(*) FROM repair r LEFT JOIN work_assignees wa ON wa.ref_type = 'repair' AND wa.ref_id = r.id
                             WHERE r.id = ? AND (r.assigned_to = ? OR wa.user_id = ?)");
        $st->execute([$woId, $uid, $uid]);
        $isTech = (int)$st->fetchColumn() > 0;
        if (!$isSup && !$isTech) {
            http_response_code(403);
            echo json_encode(['error' => 'ไม่มีสิทธิ์ดูหลักฐานของใบงานนี้'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $rows = $pdo->prepare("SELECT id, file_name, file_path, file_type, category, file_size, uploaded_by, created_at
                               FROM repair_attachments WHERE repair_id = ? ORDER BY id DESC");
        $rows->execute([$woId]);
        echo json_encode(['success' => true, 'attachments' => $rows->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $data = json_decode((string)$raw, true) ?: [];

    // ---- idempotency (ป้องกัน offline sync ส่งซ้ำ สร้าง attachment ซ้ำ) ----
    $idemKey = clientActionKeyFromRequest($data);
    if ($idemKey !== '') {
        $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/repair_attachment.php');
        if ($idem['status'] === 'replay') { echo json_encode(['success' => true, 'dedup' => true, 'ref_id' => $idem['ref_id']]); exit; }
        if ($idem['status'] !== 'new') {
            clientActionFinish($pdo, $idemKey, 'conflict', null, null, 409);
            http_response_code(409);
            echo json_encode(['error' => 'รายการนี้ถูกส่งแล้วจากอุปกรณ์ของท่าน — ไม่ประมวลผลซ้ำ', 'code' => 'CLIENT_ACTION_UNCERTAIN'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $woId = (int)($data['work_order_id'] ?? 0);
    if (!$woId) { clientActionFinish($pdo, $idemKey, 'failed', null, null, 400); http_response_code(400); echo json_encode(['error' => 'Missing work_order_id']); exit; }

    // สิทธิ์: ช่างผู้รับงาน/ทีม หรือหัวหน้างาน/Admin เท่านั้น (ไม่อนุญาตบุคคลทั่วไปยัดรูป)
    $cu = currentUser($pdo);
    $isSup = canSupervisor();
    $isTech = false;
    if ($cu) {
        $uid = (int)$cu['id'];
        $st = $pdo->prepare("SELECT COUNT(*) FROM repair r LEFT JOIN work_assignees wa ON wa.ref_type = 'repair' AND wa.ref_id = r.id
                             WHERE r.id = ? AND (r.assigned_to = ? OR wa.user_id = ?)");
        $st->execute([$woId, $uid, $uid]);
        $isTech = (int)$st->fetchColumn() > 0;
    }
    if (!$isSup && !$isTech) {
        clientActionFinish($pdo, $idemKey, 'failed', 'repair', $woId, 403);
        http_response_code(403);
        echo json_encode(['error' => 'ไม่มีสิทธิ์เพิ่มหลักฐานให้ใบงานนี้'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- รับไฟล์ (JSON base64 data URL หรือ multipart) ----
    $maxBytes = 6 * 1024 * 1024;
    $mimeExtMap = [
        'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif',
        'image/webp' => 'webp', 'image/svg+xml' => 'svg',
        'application/pdf' => 'pdf', 'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.ms-excel' => 'xls', 'text/csv' => 'csv', 'text/plain' => 'txt',
    ];
    $imageExts = ['png', 'jpg', 'gif', 'webp', 'svg'];

    $binary = null;
    $mime = null;

    if (isset($_FILES['file']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
        if ($_FILES['file']['size'] > $maxBytes) { http_response_code(413); echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 6 MB']); exit; }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $_FILES['file']['tmp_name']);
        finfo_close($finfo);
        if (!isset($mimeExtMap[$mime])) { http_response_code(415); echo json_encode(['error' => 'ประเภทไฟล์ไม่รองรับ']); exit; }
        $binary = file_get_contents($_FILES['file']['tmp_name']);
    } else {
        $ds = (string)($data['data'] ?? '');
        if ($ds === '') { http_response_code(400); echo json_encode(['error' => 'Missing image data']); exit; }
        if (preg_match('/^data:([a-zA-Z0-9.+\/-]+);base64,(.*)$/s', $ds, $m)) {
            $mime = strtolower($m[1]);
            $binary = base64_decode($m[2], true);
            if ($binary === false) { http_response_code(400); echo json_encode(['error' => 'Base64 ผิดรูปแบบ']); exit; }
        } else {
            http_response_code(400); echo json_encode(['error' => 'Data URL ผิดรูปแบบ']); exit;
        }
    }

    if ($binary === null || $binary === '') { http_response_code(400); echo json_encode(['error' => 'ไม่มีข้อมูลรูปภาพ']); exit; }
    if (strlen($binary) > $maxBytes) { http_response_code(413); echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 6 MB']); exit; }

    $ext = $mimeExtMap[$mime] ?? 'bin';
    if (in_array($ext, $imageExts, true) && $ext !== 'svg') {
        $img = @imagecreatefromstring($binary);
        if ($img === false) {
            clientActionFinish($pdo, $idemKey, 'failed', null, null, 400);
            http_response_code(400); echo json_encode(['error' => 'ไฟล์รูปเสียหายหรือไม่ใช่รูปภาพจริง']); exit;
        }
        imagedestroy($img);
    }

    $cat = in_array(($data['category'] ?? ''), ['after_image', 'failure_image', 'video', 'document', 'other'], true)
        ? (string)$data['category'] : 'other';
    $folder = 'repair';
    $fileName = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $upDir = __DIR__ . '/../../../public/uploads/' . $folder . '/';
    if (!is_dir($upDir)) {
        if (!@mkdir($upDir, 0755, true)) {
            clientActionFinish($pdo, $idemKey, 'failed', null, null, 500);
            http_response_code(500);
            echo json_encode(['error' => 'ไม่สามารถสร้างโฟลเดอร์ upload ได้']);
            exit;
        }
    }
    if (!@file_put_contents($upDir . $fileName, $binary)) {
        clientActionFinish($pdo, $idemKey, 'failed', null, null, 500);
        http_response_code(500);
        echo json_encode(['error' => 'ไม่สามารถบันทึกไฟล์ได้ (ตรวจสิทธิ์โฟลเดอร์)']);
        exit;
    }
    $filePath = 'uploads/repair/' . $fileName;
    $origName = (string)($data['file_name'] ?? $fileName);
    $origName = mb_substr(basename($origName), 0, 240);

    $ins = $pdo->prepare("INSERT INTO repair_attachments (repair_id, file_name, file_path, file_type, file_size, category, uploaded_by, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
    $ins->execute([$woId, $origName, $filePath, $mime, (int)strlen($binary), $cat, $cu['id'] ?? null]);
    $attId = (int)$pdo->lastInsertId();

    clientActionFinish($pdo, $idemKey, 'success', 'repair_attachment', $attId, 200);
    try {
        audit_log($pdo, 'ATTACHMENT_UPLOAD', 'repair_attachment', (string)$attId, "เพิ่มหลักฐานภาพ/ไฟล์หมวด $cat ให้ใบงาน #$woId", null, $filePath);
    } catch (Exception $e) { /* audit ไม่เด่น */ }

    echo json_encode(['success' => true, 'attachment_id' => $attId, 'url' => '/uploads/' . $folder . '/' . $fileName], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}