<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
$envPath = __DIR__ . '/../../../.env';
if (file_exists($envPath)) loadEnv($envPath);

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');

    if ($username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'code' => 'VALIDATION_ERROR']);
        exit;
    }

    $pdo = getDb();
    $stmt = $pdo->prepare('SELECT id, username, password, full_name, role_id, must_change_password, is_active FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || ((int)$user['is_active'] !== 1) || !password_verify($password, $user['password'])) {
        // บันทึก failed login (severity=security) — ไม่ระบุว่าชื่อผู้ใช้ถูกหรือไม่ (กัน user enumeration)
        audit_log($pdo, 'LOGIN_FAIL', 'auth', $username, 'เข้าสู่ระบบไม่สำเร็จ (ชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง)', null, ['username' => $username], 'security');
        http_response_code(401);
        echo json_encode(['error' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'code' => 'INVALID_CREDENTIALS']);
        exit;
    }

    // Cookie hardening + start session (ก่อนเขียนข้อมูล session)
    cmms_secure_session();
    session_regenerate_id(true); // ป้องกัน session fixation
    $_SESSION['user_id']   = $user['id'];
    $_SESSION['user_name'] = $user['full_name'];
    $_SESSION['role_id']   = $user['role_id'];
    $_SESSION['must_change_password'] = (int)$user['must_change_password'] === 1;
    $_SESSION['last_activity']      = time();
    $_SESSION['last_regenerated']   = time();

    audit_log($pdo, 'LOGIN', 'auth', (int)$user['id'], 'เข้าสู่ระบบสำเร็จ: ' . $user['full_name'], null, ['role_id' => (int)$user['role_id']]);

    echo json_encode(['success' => true, 'must_change_password' => (int)$user['must_change_password'] === 1, 'code' => 'OK', 'user' => [
        'id'       => $user['id'],
        'username' => $user['username'],
        'full_name'=> $user['full_name'],
    ]]);
} catch (Exception $e) {
    error_log('[login.php] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง', 'code' => 'INTERNAL_ERROR']);
}