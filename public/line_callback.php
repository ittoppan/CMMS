<?php
session_start();
require_once __DIR__ . '/../src/config/db.php';

$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) loadEnv($envPath);

$channelId     = getenv('LINE_LOGIN_CHANNEL_ID') ?: getenv('LINE_CHANNEL_ID') ?: getenv('LINE_CLIENT_ID');
$channelSecret = getenv('LINE_LOGIN_CHANNEL_SECRET') ?: getenv('LINE_CHANNEL_SECRET') ?: getenv('LINE_CLIENT_SECRET');
$callbackUrl   = getenv('LINE_CALLBACK_URL') ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/line_callback.php');

// ตรวจว่าผู้ใช้มาจาก UI ไหน: ผ่าน Next.js proxy (React = ตัวหลัก) หรือเข้าตรง PHP (หลังบ้าน)
// - ผ่าน tunnel/React: HTTP_HOST ที่ PHP เห็น = localhost:8081 (Next rewrite)
// - เข้าตรง PHP: HTTP_HOST = IP/โดเมนของเครื่อง
$isReactUi = (($_SERVER['HTTP_HOST'] ?? '') === 'localhost:8081');

$code  = $_GET['code'] ?? '';
$state = $_GET['state'] ?? '';

// Validate state to prevent CSRF
if (!$state || !isset($_SESSION['line_oauth_state']) || $state !== $_SESSION['line_oauth_state']) {
    unset($_SESSION['line_oauth_state']);
    die('Invalid OAuth state. Please try logging in again.');
}
unset($_SESSION['line_oauth_state']);

if (!$code) {
    $loginPage = $isReactUi ? '/login' : '/login.php';
    header('Location: ' . $loginPage . '?error=' . urlencode('LINE Login cancelled or failed'));
    exit;
}

try {
    // 1. Exchange code for access token
    $ch = curl_init('https://api.line.me/oauth2/v2.1/token');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'redirect_uri'  => $callbackUrl,
            'client_id'     => $channelId,
            'client_secret' => $channelSecret,
        ]),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $tokenData = json_decode($response, true);
    if ($httpCode === 400 || empty($tokenData['access_token'])) {
        $loginPage = $isReactUi ? '/login' : '/login.php';
        $msg = 'LINE Login (400 Bad Request) - ระบบสลับให้ท่านเข้าสู่ระบบด้วย Username & Password แทนครับ';
        if (!empty($tokenData['error_description'])) {
            $msg .= ' (' . $tokenData['error_description'] . ')';
        }
        header('Location: ' . $loginPage . '?error=' . urlencode($msg));
        exit;
    }

    $accessToken = $tokenData['access_token'];

    // 2. Fetch LINE profile
    $ch = curl_init('https://api.line.me/v2/profile');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $accessToken],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $profileRes = curl_exec($ch);
    curl_close($ch);

    $profile = json_decode($profileRes, true);
    if (empty($profile['userId'])) {
        $loginPage = $isReactUi ? '/login' : '/login.php';
        header('Location: ' . $loginPage . '?error=' . urlencode('Failed to fetch LINE profile'));
        exit;
    }

    $lineUserId  = $profile['userId'];
    $displayName = $profile['displayName'] ?? '';
    $pictureUrl  = $profile['pictureUrl'] ?? '';

    $pdo = getDb();

    // 3. If user is already logged in, bind this LINE account to their account!
    if (!empty($_SESSION['user_id'])) {
        $stmt = $pdo->prepare('UPDATE users SET line_user_id = ? WHERE id = ?');
        $stmt->execute([$lineUserId, $_SESSION['user_id']]);
        $bindTarget = $isReactUi ? '/settings' : '/pages/settings/';
        header('Location: ' . $bindTarget . '?msg=' . urlencode('ผูกบัญชี LINE เรียบร้อยแล้ว'));
        exit;
    }

    // 4. Otherwise, find user by line_user_id
    $stmt = $pdo->prepare('SELECT id, full_name, role_id, is_active FROM users WHERE line_user_id = ? AND is_active = 1');
    $stmt->execute([$lineUserId]);
    $user = $stmt->fetch();

    if ($user) {
        // Log in user
        $_SESSION['user_id']   = (int)$user['id'];
        $_SESSION['user_name'] = $user['full_name'];
        $_SESSION['role_id']   = (int)$user['role_id'];
        $_SESSION['line_profile'] = $profile;
        header('Location: /');
        exit;
    } else {
        // ยังไม่ผูกบัญชี: เด้งไปหน้าลงทะเบียนผูกบัญชี (React /register รองรับ ?uid= แล้ว)
        // - ฝั่ง React: พาไปกรอกรหัสพนักงานเลย (มี LINE UID พร้อม)
        // - ฝั่ง PHP หลังบ้าน: ยังใช้ flow เดิม (ล็อกอินแล้วผูกอัตโนมัติ)
        if ($isReactUi) {
            header('Location: /register?uid=' . urlencode($lineUserId) . '&name=' . urlencode($displayName));
        } else {
            header('Location: /login.php?bind_line=1&error=' . urlencode('บัญชี LINE (' . $displayName . ') ยังไม่ได้ถูกผูกกับผู้ใช้ในระบบ กรุณาล็อกอินด้วยชื่อผู้ใช้ เพื่อผูกบัญชีอัตโนมัติในขั้นตอนถัดไป'));
        }
        exit;
    }

} catch (Exception $e) {
    $loginPage = $isReactUi ? '/login' : '/login.php';
    header('Location: ' . $loginPage . '?error=' . urlencode('System Error: ' . $e->getMessage()));
    exit;
}
