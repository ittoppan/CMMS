<?php
/**
 * forms.php — รายการ + ดาวน์โหลดแบบฟอร์ม (Form Templates) จาก docs/EN
 *
 * GET  /api/v1/forms.php                    → JSON รายการไฟล์ (code, rev, title, ext, size)
 * GET  /api/v1/forms.php?download=<file>    → ดาวน์โหลดไฟล์จริง (แนบชื่อเดิม)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

$FORM_DIR = realpath(__DIR__ . '/../../../docs/EN') ?: (__DIR__ . '/../../../docs/EN');
$IGNORE   = ['.DS_Store', 'Thumbs.db', '.', '..'];

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
    requireLogin($pdo); // ต้อง login ก่อนดู/ดาวน์โหลดแบบฟอร์ม

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
