<?php
/**
 * CMMS-TPT Upload API — รับไฟล์รูปจาก PWA (Next.js) เก็บที่ public/uploads/<folder>/
 *
 * POST /api/v1/upload.php  body (JSON):
 *   { "folder": "spares|assets|avatars|repair|pm_am|calibration",
 *     "data":   "data:image/png;base64,...." }
 *   หรือ multipart/form-data:  $_FILES['file'] + $_POST['folder']
 *
 * -> { "status": "success", "url": "/uploads/spares/xxxx.png" }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $allowedFolders = ['spares', 'assets', 'avatars', 'repair', 'pm_am', 'calibration'];
    $maxBytes = 6 * 1024 * 1024; // 6 MB

    $folder = trim($_POST['folder'] ?? '');
    if (!in_array($folder, $allowedFolders, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid folder. Allowed: ' . implode('|', $allowedFolders)]);
        exit;
    }

    $mimeExtMap = [
        'image/png'  => 'png',
        'image/jpeg' => 'jpg',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
        'image/svg+xml' => 'svg',
    ];

    $binary = null;
    $mime = null;

    // ---- กรณี multipart (file upload) ----
    if (isset($_FILES['file']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
        if ($_FILES['file']['size'] > $maxBytes) {
            http_response_code(413);
            echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 6 MB']);
            exit;
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $_FILES['file']['tmp_name']);
        finfo_close($finfo);
        if (!isset($mimeExtMap[$mime])) {
            http_response_code(415);
            echo json_encode(['error' => 'ประเภทไฟล์ไม่รองรับ (รองรับ png/jpg/gif/webp/svg)']);
            exit;
        }
        $binary = file_get_contents($_FILES['file']['tmp_name']);
    } else {
        // ---- กรณี JSON base64 data URL ----
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!$data || empty($data['data'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing image data']);
            exit;
        }
        $folder = isset($data['folder']) ? trim((string)$data['folder']) : $folder;
        if (!in_array($folder, $allowedFolders, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid folder']);
            exit;
        }
        if (preg_match('/^data:([a-zA-Z0-9.+\/-]+);base64,(.*)$/s', $data['data'], $m)) {
            $mime = strtolower($m[1]);
            $binary = base64_decode($m[2], true);
            if ($binary === false) {
                http_response_code(400);
                echo json_encode(['error' => 'Base64 ผิดรูปแบบ']);
                exit;
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Data URL ผิดรูปแบบ']);
            exit;
        }
    }

    if ($binary === null || $binary === '') {
        http_response_code(400);
        echo json_encode(['error' => 'ไม่มีข้อมูลรูปภาพ']);
        exit;
    }
    if (strlen($binary) > $maxBytes) {
        http_response_code(413);
        echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 6 MB']);
        exit;
    }

    $ext = $mimeExtMap[$mime] ?? 'png';

    // ตรวจว่าเป็นรูปจริง (ยกเว้น svg — ตรวจแค่ tag คร่าว ๆ)
    if ($ext !== 'svg') {
        $img = @imagecreatefromstring($binary);
        if ($img === false) {
            http_response_code(415);
            echo json_encode(['error' => 'ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง']);
            exit;
        }
        imagedestroy($img);
    }

    $upDir = __DIR__ . '/../../../public/uploads/' . $folder . '/';
    if (!is_dir($upDir)) {
        if (!@mkdir($upDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['error' => 'ไม่สามารถสร้างโฟลเดอร์ upload ได้']);
            exit;
        }
    }

    $fileName = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $target = $upDir . $fileName;
    if (!@file_put_contents($target, $binary)) {
        http_response_code(500);
        echo json_encode(['error' => 'ไม่สามารถบันทึกไฟล์ได้ (ตรวจสิทธิ์โฟลเดอร์)']);
        exit;
    }

    echo json_encode([
        'status' => 'success',
        'url'    => '/uploads/' . $folder . '/' . $fileName,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
