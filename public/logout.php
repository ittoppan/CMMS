<?php
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/audit.php';
cmms_secure_session();
$pdo = getDb();
if (!empty($_SESSION['user_id'])) {
    audit_log($pdo, 'LOGOUT', 'auth', (int)$_SESSION['user_id'], 'ออกจากระบบ: ' . ($_SESSION['user_name'] ?? ''), null, null, 'info');
}
$_SESSION = [];
$cookieParams = session_get_cookie_params();
// ล้าง cookie จริงด้วย (กัน cookie เก่าที่เหลือค้างถูกใช้ซ้ำ)
if (session_name() !== '') {
    setcookie(session_name(), '', time() - 42000,
        $cookieParams['path'], $cookieParams['domain'],
        $cookieParams['secure'], $cookieParams['httponly']);
}
session_destroy();
header('Location: /login.php');
exit;