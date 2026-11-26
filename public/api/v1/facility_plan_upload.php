<?php
/**
 * facility_plan_upload.php — อัปโหลดรูปแปลนผังอาคาร (facility-layout)
 *
 * POST /api/v1/facility_plan_upload.php   (multipart/form-data: file=<image>)
 * - CSRF บังคับ (token จาก /api/v1/csrf.php ส่งมาทาง header X-CSRF-Token)
 * - สิทธิ์: settings/manage (เหมือนการบันทึกผังอาคาร)
 * - รับเฉพาะ JPEG/PNG/WebP ขนาดไม่เกิน 10 MB (ตรวจด้วย finfo + getimagesize)
 * - เก็บที่ public/uploads/facility/ แล้วตอบ path + width/height จริงของไฟล์
 *
 * -> { success:true, path:"/uploads/facility/xxx.png", width:1600, height:400, size:12345, mime:"image/png" }
 *
 * ฝั่ง UI เอา path ไปใส่ floor_plan.image_url และ width/height ไปใส่
 * floor_plan.image_width/image_height (ช่อง URL เดิมยังใช้เป็น fallback ได้)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';

header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';

try {
    $pdo = getDb();
    requireLogin($pdo);

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }

    enforceCsrf();
    requirePerm($pdo, 'settings', 'manage', 'ต้องมีสิทธิ์จัดการการตั้งค่า/ผังอาคาร');

    if (!isset($_FILES['file']) || !is_array($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
        api_fail(400, 'VALIDATION_ERROR', 'ไม่พบไฟล์อัปโหลด (multipart field "file")');
    }
    if ((int)($_FILES['file']['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        $code = (int)($_FILES['file']['error'] ?? 0);
        if ($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE) {
            api_fail(413, 'FILE_TOO_LARGE', 'ไฟล์ใหญ่เกิน 10 MB — โปรดลดขนาดไฟล์แล้วลองอีกครั้ง');
        }
        api_fail(400, 'UPLOAD_FAILED', 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
    }

    $maxBytes = 10 * 1024 * 1024;
    if ((int)($_FILES['file']['size'] ?? 0) > $maxBytes) {
        api_fail(413, 'FILE_TOO_LARGE', 'ไฟล์ใหญ่เกิน 10 MB — โปรดลดขนาดไฟล์แล้วลองอีกครั้ง');
    }

    // ตรวจชนิดไฟล์จากเนื้อหา (ไม่เชื่อ $_FILES['type']) แล้วยืนยันว่าเป็นรูปที่ decode ได้
    $mimeExt = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? (string)finfo_file($finfo, $_FILES['file']['tmp_name']) : '';
    if ($finfo) finfo_close($finfo);
    if (!isset($mimeExt[$mime])) {
        api_fail(415, 'UNSUPPORTED_TYPE', 'รองรับเฉพาะไฟล์ JPEG/PNG/WebP เท่านั้น');
    }
    $info = @getimagesize($_FILES['file']['tmp_name']);
    $expected = ['image/jpeg' => IMAGETYPE_JPEG, 'image/png' => IMAGETYPE_PNG, 'image/webp' => IMAGETYPE_WEBP];
    if (!$info || (int)($info[2] ?? 0) !== $expected[$mime] || (int)$info[0] <= 0 || (int)$info[1] <= 0) {
        api_fail(415, 'INVALID_IMAGE', 'ไฟล์รูปไม่ถูกต้องหรือชำรุด');
    }
    $width = (int)$info[0];
    $height = (int)$info[1];

    $upDir = __DIR__ . '/../../../public/uploads/facility/';
    if (!is_dir($upDir) && !@mkdir($upDir, 0755, true)) {
        api_fail(500, 'UPLOAD_DIR_FAILED', 'ไม่สามารถสร้างโฟลเดอร์อัปโหลดได้');
    }

    $fileName = 'plan_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $mimeExt[$mime];
    $target = $upDir . $fileName;
    if (!@move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
        api_fail(500, 'UPLOAD_FAILED', 'บันทึกไฟล์ไม่สำเร็จ (ตรวจสิทธิ์โฟลเดอร์ uploads/facility)');
    }
    @chmod($target, 0644);

    // server ที่รันจาก .next/standalone เสิร์ฟ public ของตัวเอง — mirror ไฟล์ให้ตรงกันด้วย
    // (production ผ่าน IIS อ่าน public/uploads ต้นทางเป็นหลัก; ส่วนพรีวิว :3001 อ่าน standalone)
    $standaloneDir = __DIR__ . '/../../../frontend/.next/standalone/public/uploads/facility/';
    if (is_dir(dirname($standaloneDir)) && @mkdir($standaloneDir, 0755, true)) {
        // สร้างโฟลเดอร์ปลายทางได้ → คัดลอกไฟล์ไปด้วย (ถ้าไม่สำเร็จก็ไม่ทำให้คำขอล้มเหลว)
    }
    if (is_dir($standaloneDir)) {
        @copy($target, $standaloneDir . $fileName);
    }

    echo json_encode([
        'success' => true,
        'path' => '/uploads/facility/' . $fileName,
        'width' => $width,
        'height' => $height,
        'size' => (int)filesize($target),
        'mime' => $mime,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[facility_plan_upload.php] ' . $e->getMessage());
    api_fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
}
