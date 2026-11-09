<?php
/**
 * repair_form_attachment.php — staging อัปโหลดไฟล์เอกสารแนบจากฟอร์มแจ้งซ่อม (anonymous / LINE LIFF)
 *
 * POST /api/v1/repair_form_attachment.php   (multipart/form-data: file=<doc>)
 * CSRF บังคับ (เหมือน repair.php POST) — token จาก /api/v1/csrf.php
 *
 * -> { success:true, path:"/uploads/repair/xxx.pdf" }
 *
 * ไฟล์ถูกเก็บลง uploads/repair/ — ผู้แจ้งส่งใบงานพร้อม field attachment_path
 * ใน POST /api/v1/repair.php ภายหลัง (หากไม่ส่ง = ไฟล์ orphan เฉย ๆ)
 * (แยกจาก repair_attachment.php ที่ผูกไฟล์กับใบงานหลังสร้าง — endpoint นี้ใช้ก่อนมีใบงาน)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/csrf.php';

header('Content-Type: application/json; charset=utf-8');
session_start();
enforceCsrf();

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing file (multipart field "file")'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // จำกัด 10 MB (post_max_size จริง 32 MB เหลือ margin ให้ multipart overhead)
    $maxBytes = 10 * 1024 * 1024;
    if ($_FILES['file']['size'] > $maxBytes) {
        http_response_code(413);
        echo json_encode(['error' => 'ไฟล์เอกสารใหญ่เกิน 10 MB — โปรดลดขนาดไฟล์แล้วลองอีกครั้ง'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $mimeExtMap = [
        'application/pdf' => 'pdf',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'text/csv' => 'csv',
        'text/plain' => 'txt',
        'application/zip' => 'zip',
    ];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $_FILES['file']['tmp_name']);
    finfo_close($finfo);
    if (!isset($mimeExtMap[$mime])) {
        http_response_code(415);
        echo json_encode(['error' => 'ไฟล์เอกสารไม่รองรับ — PDF/DOC/DOCX/XLS/XLSX/CSV/TXT/ZIP เท่านั้น'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $upDir = __DIR__ . '/../../../public/uploads/repair/';
    if (!is_dir($upDir) && !@mkdir($upDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'ไม่สามารถสร้างโฟลเดอร์ upload ได้'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $fileName = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $mimeExtMap[$mime];
    if (!@move_uploaded_file($_FILES['file']['tmp_name'], $upDir . $fileName)) {
        http_response_code(500);
        echo json_encode(['error' => 'บันทึกไฟล์ไม่สำเร็จ (ตรวจสิทธิ์โฟลเดอร์)'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'path' => '/uploads/repair/' . $fileName, 'size' => (int)$_FILES['file']['size']], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    api_safe_catch($e);
}
