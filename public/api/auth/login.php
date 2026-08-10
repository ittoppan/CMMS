<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../../src/config/db.php';
$envPath = __DIR__ . '/../../../.env';
if (file_exists($envPath)) loadEnv($envPath);

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $username = $data['username'] ?? '';
    $password = $data['password'] ?? '';

    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน']);
        exit;
    }

    $pdo = getDb();
    $stmt = $pdo->prepare('SELECT id, username, password, full_name, role_id FROM users WHERE username = ? AND is_active = 1');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        http_response_code(401);
        echo json_encode(['error' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง']);
        exit;
    }

    session_start();
    $_SESSION['user_id']   = $user['id'];
    $_SESSION['user_name'] = $user['full_name'];
    $_SESSION['role_id']   = $user['role_id'];

    echo json_encode(['success' => true, 'user' => [
        'id'       => $user['id'],
        'username' => $user['username'],
        'full_name'=> $user['full_name'],
    ]]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server Error: ' . $e->getMessage()]);
}
