<?php
session_start();
require_once __DIR__ . '/../src/config/db.php';

$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) loadEnv($envPath);

$channelId = getenv('LINE_LOGIN_CHANNEL_ID') ?: getenv('LINE_CHANNEL_ID') ?: getenv('LINE_CLIENT_ID');
$callbackUrl = getenv('LINE_CALLBACK_URL') ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/line_callback.php');

if (!$channelId) {
    header('Location: /login.php?error=' . urlencode('ยังไม่ได้ตั้งค่า LINE Channel ID ในระบบ กรุณาล็อกอินด้วย Username & Password แทนครับ'));
    exit;
}

// Generate state token to prevent CSRF
$state = bin2hex(random_bytes(16));
$_SESSION['line_oauth_state'] = $state;

$params = [
    'response_type' => 'code',
    'client_id'     => $channelId,
    'redirect_uri'  => $callbackUrl,
    'state'         => $state,
    'scope'         => 'profile openid email',
];

$lineAuthUrl = 'https://access.line.me/oauth2/v2.1/authorize?' . http_build_query($params);
header('Location: ' . $lineAuthUrl);
exit;
