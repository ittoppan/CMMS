<?php
/**
 * profile.php — โปรไฟล์ส่วนตัว (แก้เองได้ ไม่ต้องพึ่งแอดมิน)
 *
 * GET  /api/v1/profile.php              -> ข้อมูลโปรไฟล์ของผู้ใช้ปัจจุบัน
 * PUT  /api/v1/profile.php              -> แก้ full_name / email / phone / position / avatar_path
 *                                          + เปลี่ยนรหัสผ่าน (ต้องยืนยันรหัสเดิม)
 * POST /api/v1/profile.php              -> อัปโหลดรูปโปรไฟล์ (base64 data URL หรือ multipart)
 *                                          -> { success, url, avatar_path }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $userId = (int)$_SESSION['user_id'];

    if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
        enforceCsrf();
    }

    $method = $_SERVER['REQUEST_METHOD'];

    // ---------- GET: โปรไฟล์ปัจจุบัน ----------
    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT id, username, email, full_name, phone, role, position, employee_code,
                                      avatar, avatar_path, line_user_id, created_at
                               FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u) { http_response_code(404); echo json_encode(['error' => 'User not found']); exit; }
        echo json_encode(['success' => true, 'user' => $u], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---------- POST: อัปโหลดรูปโปรไฟล์ ----------
    if ($method === 'POST') {
        $maxBytes = 6 * 1024 * 1024;
        $mimeExtMap = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];
        $uploadDir = __DIR__ . '/../../uploads/avatars';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0775, true);

        $binary = null; $mime = null;

        // multipart/form-data
        if (isset($_FILES['file']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            if ($_FILES['file']['size'] > $maxBytes) { http_response_code(413); echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 6 MB']); exit; }
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $_FILES['file']['tmp_name']);
            finfo_close($finfo);
            $binary = file_get_contents($_FILES['file']['tmp_name']);
        } else {
            // base64 data URL
            $raw = (string)($_POST['data'] ?? '');
            if (preg_match('/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s', $raw, $m)) {
                $mime = 'image/' . ($m[1] === 'jpg' ? 'jpeg' : $m[1]);
                $binary = base64_decode($m[2]);
            }
        }

        if ($binary === null || empty($mime) || !isset($mimeExtMap[$mime])) {
            http_response_code(415);
            echo json_encode(['error' => 'ประเภทไฟล์ไม่รองรับ (รองรับ png/jpg/gif/webp)']);
            exit;
        }
        if (strlen($binary) > $maxBytes) { http_response_code(413); echo json_encode(['error' => 'ไฟล์ใหญ่เกิน 6 MB']); exit; }

        $name = 'avatar_u' . $userId . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $mimeExtMap[$mime];
        $filePath = $uploadDir . '/' . $name;
        file_put_contents($filePath, $binary);

        $rel = '/uploads/avatars/' . $name;
        // ลบรูปเก่าที่เป็น avatar ของผู้ใช้นี้ (ถ้าอยู่ในโฟลเดอร์ avatars)
        $old = $pdo->prepare('SELECT avatar_path FROM users WHERE id = ?');
        $old->execute([$userId]);
        $oldPath = $old->fetchColumn();
        if ($oldPath && str_starts_with($oldPath, '/uploads/avatars/')) {
            $oldFile = __DIR__ . '/../..' . $oldPath;
            if (is_file($oldFile)) @unlink($oldFile);
        }

        $pdo->prepare("UPDATE users SET avatar_path = ?, avatar = NULL WHERE id = ?")->execute([$rel, $userId]);
        echo json_encode(['success' => true, 'url' => $rel, 'avatar_path' => $rel], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---------- PUT: แก้ไขโปรไฟล์ / เปลี่ยนรหัส ----------
    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = []; $values = [];

        foreach (['full_name' => 150, 'email' => 190, 'phone' => 30, 'position' => 100] as $col => $max) {
            if (array_key_exists($col, $data)) {
                $fields[] = "$col = ?";
                $values[] = mb_substr(trim((string)$data[$col]), 0, $max);
            }
        }
        if (array_key_exists('avatar_path', $data)) {
            $p = trim((string)$data['avatar_path']);
            if ($p !== '' && !preg_match('#^/uploads/avatars/[A-Za-z0-9_.-]+$#', $p)) {
                http_response_code(400);
                echo json_encode(['error' => 'avatar_path ไม่ถูกต้อง']);
                exit;
            }
            $fields[] = 'avatar_path = ?'; $values[] = $p;
            $fields[] = 'avatar = ?';      $values[] = null;
        }

        // เปลี่ยนรหัสผ่าน: ต้องยืนยันรหัสเดิม + รหัสใหม่ 2 ครั้งตรงกัน
        if (!empty($data['new_password']) || !empty($data['current_password'])) {
            $cur = (string)($data['current_password'] ?? '');
            $new = (string)($data['new_password'] ?? '');
            $confirm = (string)($data['confirm_password'] ?? '');
            if ($cur === '' || $new === '' || $confirm === '') {
                http_response_code(400); echo json_encode(['error' => 'กรุณากรอกรหัสเดิม + รหัสใหม่ + ยืนยันรหัสใหม่ให้ครบ']); exit;
            }
            if ($new !== $confirm) {
                http_response_code(400); echo json_encode(['error' => 'รหัสผ่านใหม่ไม่ตรงกับการยืนยัน']); exit;
            }
            if (strlen($new) < 6) {
                http_response_code(400); echo json_encode(['error' => 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร']); exit;
            }
            $h = $pdo->prepare('SELECT password FROM users WHERE id = ?');
            $h->execute([$userId]);
            $hash = $h->fetchColumn();
            if (!$hash || !password_verify($cur, $hash)) {
                http_response_code(401); echo json_encode(['error' => 'รหัสผ่านเดิมไม่ถูกต้อง']); exit;
            }
            $fields[] = 'password = ?'; $values[] = password_hash($new, PASSWORD_DEFAULT);
        }

        if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'ไม่มีข้อมูลที่จะแก้ไข']); exit; }

        $values[] = $userId;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ', updated_at = NOW() WHERE id = ?')->execute($values);
        echo json_encode(['success' => true, 'message' => 'บันทึกโปรไฟล์สำเร็จ']);
        exit;
    }

    http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => 'Server Error: ' . $e->getMessage()]);
}
