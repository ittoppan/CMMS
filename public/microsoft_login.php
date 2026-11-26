<?php
// Ensure session cookie works across Next.js rewrite proxy
$frontendDomain = parse_url(getenv('MS_CALLBACK_URL') ?: (getenv('MICROSOFT_CALLBACK_URL') ?: ''), PHP_URL_HOST);
if ($frontendDomain) {
    ini_set('session.cookie_domain', '.' . $frontendDomain);
}
ini_set('session.cookie_path', '/');
ini_set('session.cookie_secure', isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? '1' : '0');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
session_start();
require_once __DIR__ . '/../src/config/db.php';

$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) loadEnv($envPath);

$clientId = getenv('MS_CLIENT_ID') ?: getenv('MICROSOFT_CLIENT_ID') ?: getenv('AZURE_CLIENT_ID');
$clientSecret = getenv('MS_CLIENT_SECRET') ?: getenv('MICROSOFT_CLIENT_SECRET') ?: getenv('AZURE_CLIENT_SECRET');
$tenant = getenv('MS_TENANT_ID') ?: getenv('MICROSOFT_TENANT_ID') ?: getenv('AZURE_TENANT_ID') ?: 'common';
$callbackUrl = getenv('MS_CALLBACK_URL') ?: getenv('MICROSOFT_CALLBACK_URL') ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/microsoft_callback.php');

$isReactUi = (($_SERVER['HTTP_HOST'] ?? '') === 'localhost:8081');
$loginPage = $isReactUi ? '/login' : '/login.php';

if (!$clientId) {
    header('Location: ' . $loginPage . '?error=' . urlencode('ยังไม่ได้ตั้งค่า Microsoft Client ID ในระบบ กรุณาล็อกอินด้วย Username & Password แทน'));
    exit;
}

// Generate state token to prevent CSRF
$state = bin2hex(random_bytes(16));
$_SESSION['ms_oauth_state'] = $state;

$params = [
    'response_type' => 'code',
    'client_id'     => $clientId,
    'redirect_uri'  => $callbackUrl,
    'state'         => $state,
    'scope'         => 'openid profile email User.Read',
    'response_mode' => 'query',
];

$msAuthUrl = 'https://login.microsoftonline.com/' . rawurlencode($tenant) . '/oauth2/v2.0/authorize?' . http_build_query($params);
header('Location: ' . $msAuthUrl);
exit;
