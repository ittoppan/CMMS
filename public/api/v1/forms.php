<?php
/**
 * forms.php — รายการ + ดาวน์โหลดแบบฟอร์ม (Form Templates) จาก docs/EN
 *
 * GET  /api/v1/forms.php                    → JSON รายการไฟล์ (code, rev, title, ext, size)
 * GET  /api/v1/forms.php?download=<file>    → ดาวน์โหลดไฟล์จริง (แนบชื่อเดิม)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

$FORM_DIR = realpath(__DIR__ . '/../../../docs/EN') ?: (__DIR__ . '/../../../docs/EN');
$IGNORE   = ['.DS_Store', 'Thumbs.db', '.', '..'];

// นามสกุลที่อนุญาตให้อัปโหลด (กัน .php/.exe ฯลฯ)
$ALLOWED_EXT = ['xls', 'xlsx', 'xlsm', 'pdf', 'docx', 'ods', 'doc', 'csv', 'pptx'];
$MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** ทำความสะอาดชื่อไฟล์: ห้าม path traversal / อักขระอันตราย */
function safeFormName(string $name): string {
    $n = basename(trim($name));
    $n = preg_replace('/[\x00-\x1F\x7F\x{202E}]/u', '', $n);           // control chars
    $n = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], '-', $n);
    $n = preg_replace('/\s+/', ' ', $n);
    return trim($n);
}

/** ดึง code (F-EN-xx / F-SF-xx) จากชื่อไฟล์ */
function formCode(string $file): string {
    if (preg_match('/^(F-[A-Z]{2}-\d{2})/', $file, $m)) return $m[1];
    return '';
}

/** ดึง REV.xx จากชื่อไฟล์ */
function formRev(string $file): string {
    if (preg_match('/(REV\.\d{2})/i', $file, $m)) return strtoupper($m[1]);
    return '';
}

/** ดึงชื่อแบบฟอร์ม (ตัด code + REV + นามสกุล) */
function formTitle(string $file): string {
    $t = preg_replace('/^(F-[A-Z]{2}-\d{2})\s*/', '', $file);
    $t = preg_replace('/\s*(REV\.\d{2})\s*/i', '', $t);
    $t = pathinfo($t, PATHINFO_FILENAME);
    return trim($t);
}

try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนดู/อัปโหลด/ดาวน์โหลดแบบฟอร์ม

    // ---- อัปโหลด (multipart/form-data) ----
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        enforceCsrf();

        if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'ไม่พบไฟล์ที่เลือก'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'อัปโหลดไม่สำเร็จ (รหัส ' . $_FILES['file']['error'] . ')'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($_FILES['file']['size'] > $MAX_BYTES) {
            http_response_code(413);
            echo json_encode(['status' => 'error', 'message' => 'ไฟล์ใหญ่เกิน 25 MB'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $origName = safeFormName($_FILES['file']['name'] ?? 'form.xls');
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if (!in_array($ext, $ALLOWED_EXT, true)) {
            http_response_code(415);
            echo json_encode(['status' => 'error', 'message' => 'ประเภทไฟล์ไม่รองรับ (อนุญาต: ' . implode(', ', $ALLOWED_EXT) . ')'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // ถ้าให้ code/rev/title มา → สร้างชื่อตามมาตรฐาน F-EN-xx REV.xx ชื่อ.ext
        $code  = trim((string)($_POST['code'] ?? ''));
        $rev   = trim((string)($_POST['rev'] ?? ''));
        $title = trim((string)($_POST['title'] ?? ''));
        if ($code !== '') {
            if ($title === '') {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'ระบุรหัสแบบฟอร์มแล้วต้องกรอกชื่อแบบฟอร์มด้วย'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $code = strtoupper(preg_replace('/[^A-Z0-9-]/', '', $code));
            if (!preg_match('/^F-[A-Z]{2}-\d{2,3}$/', $code)) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'รหัสแบบฟอร์มไม่ถูกต้อง (เช่น F-EN-64)'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $revClean = $rev !== '' ? (preg_match('/^REV\.\d{2}$/i', $rev) ? strtoupper($rev) : 'REV.' . str_pad((string)(int)$rev, 2, '0', STR_PAD_LEFT)) : 'REV.00';
            $name = $code . ' ' . $revClean . ' ' . safeFormName($title) . '.' . $ext;
        } else {
            $name = $origName;
        }

        if (!is_dir($FORM_DIR) && !@mkdir($FORM_DIR, 0755, true)) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'ไม่สามารถสร้างโฟลเดอร์ docs/EN ได้'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $target = $FORM_DIR . '/' . $name;
        // overwrite ไฟล์เดิมชื่อเดียวกัน (REV ใหม่แทนของเก่า)
        @unlink($target);
        if (!@move_uploaded_file($_FILES['file']['tmp_name'], $target)) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'บันทึกไฟล์ไม่สำเร็จ (ตรวจสิทธิ์โฟลเดอร์ docs/EN)'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        echo json_encode([
            'status' => 'success',
            'code'   => 200,
            'message' => 'อัปโหลดแบบฟอร์มสำเร็จ',
            'file'   => [
                'code'     => formCode($name),
                'rev'      => formRev($name),
                'title'    => formTitle($name),
                'filename' => $name,
                'ext'      => $ext,
                'size'     => (int)filesize($target),
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- ดาวน์โหลด ----
    if (isset($_GET['download'])) {
        $name = basename((string)$_GET['download']); // basename = กัน path traversal
        if ($name === '' || in_array($name, $IGNORE, true)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'ชื่อไฟล์ไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $path = realpath($FORM_DIR . '/' . $name);
        if ($path === false || strpos($path, realpath($FORM_DIR)) !== 0 || !is_file($path)) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'ไม่พบไฟล์'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'pdf'   => 'application/pdf',
            'docx'  => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls'   => 'application/vnd.ms-excel',
            'xlsx'  => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xlsm'  => 'application/vnd.ms-excel.sheet.macroEnabled.12',
            'ods'   => 'application/vnd.oasis.opendocument.spreadsheet',
            default => 'application/octet-stream',
        };
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . rawurlencode($name) . '"');
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }

    // ---- รายการ ----
    $files = [];
    if (is_dir($FORM_DIR)) {
        $entries = scandir($FORM_DIR);
        foreach ($entries as $e) {
            if (in_array($e, $IGNORE, true)) continue;
            $full = $FORM_DIR . '/' . $e;
            if (!is_file($full)) continue;
            $files[] = [
                'code'     => formCode($e),
                'rev'      => formRev($e),
                'title'    => formTitle($e),
                'filename' => $e,
                'ext'      => strtolower(pathinfo($e, PATHINFO_EXTENSION)),
                'size'     => (int)filesize($full),
            ];
        }
    }
    usort($files, fn($a, $b) => strcmp($a['code'] ?: 'ZZ', $b['code'] ?: 'ZZ') ?: strcmp($a['filename'], $b['filename']));

    echo json_encode([
        'status' => 'success',
        'code'   => 200,
        'count'  => count($files),
        'data'   => $files,
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
