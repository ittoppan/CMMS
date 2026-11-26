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

$clientId     = getenv('MS_CLIENT_ID') ?: getenv('MICROSOFT_CLIENT_ID') ?: getenv('AZURE_CLIENT_ID');
$clientSecret = getenv('MS_CLIENT_SECRET') ?: getenv('MICROSOFT_CLIENT_SECRET') ?: getenv('AZURE_CLIENT_SECRET');
$tenant       = getenv('MS_TENANT_ID') ?: getenv('MICROSOFT_TENANT_ID') ?: getenv('AZURE_TENANT_ID') ?: 'common';
$callbackUrl  = getenv('MS_CALLBACK_URL') ?: getenv('MICROSOFT_CALLBACK_URL') ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/microsoft_callback.php');

$isReactUi = (($_SERVER['HTTP_HOST'] ?? '') === 'localhost:8081');
$loginPage = $isReactUi ? '/login' : '/login.php';

// Handle Microsoft-side errors (e.g. access_denied on cancel)
$msError = $_GET['error'] ?? '';
if ($msError !== '') {
    $desc = $_GET['error_description'] ?? $msError;
    header('Location: ' . $loginPage . '?error=' . urlencode('Microsoft Login: ' . $desc));
    exit;
}

$code  = $_GET['code'] ?? '';
$state = $_GET['state'] ?? '';

// Validate state to prevent CSRF
if (!$state || !isset($_SESSION['ms_oauth_state']) || $state !== $_SESSION['ms_oauth_state']) {
    unset($_SESSION['ms_oauth_state']);
    header('Location: ' . $loginPage . '?error=' . urlencode('Microsoft session หมดอายุหรือลิงก์ถูกใช้ซ้ำ กรุณากดปุ่ม Microsoft Login ใหม่'));
    exit;
}
unset($_SESSION['ms_oauth_state']);

if (!$code) {
    header('Location: ' . $loginPage . '?error=' . urlencode('Microsoft Login cancelled or failed'));
    exit;
}

try {
    // 1. Exchange code for access token
    $ch = curl_init('https://login.microsoftonline.com/' . rawurlencode($tenant) . '/oauth2/v2.0/token');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'redirect_uri'  => $callbackUrl,
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
            'scope'         => 'openid profile email User.Read',
        ]),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $tokenData = json_decode($response, true);
    if ($httpCode !== 200 || empty($tokenData['access_token'])) {
        $msg = 'Microsoft Login (token) ไม่สำเร็จ';
        if (!empty($tokenData['error_description'])) {
            $msg .= ' (' . $tokenData['error_description'] . ')';
        }
        header('Location: ' . $loginPage . '?error=' . urlencode($msg));
        exit;
    }

    $accessToken = $tokenData['access_token'];

    // 2. Fetch Microsoft profile (Graph /me)
    $ch = curl_init('https://graph.microsoft.com/v1.0/me');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $accessToken],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $profileRes = curl_exec($ch);
    $profileHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $profile = json_decode($profileRes, true);
    if ($profileHttp !== 200 || empty($profile['id'])) {
        header('Location: ' . $loginPage . '?error=' . urlencode('Failed to fetch Microsoft profile'));
        exit;
    }

    $msUserId    = $profile['id'];
    $displayName = $profile['displayName'] ?? '';
    $email       = $profile['mail'] ?? ($profile['userPrincipalName'] ?? '');

    $pdo = getDb();

    // 3. If user is already logged in, bind this Microsoft account to their account
    if (!empty($_SESSION['user_id'])) {
        $stmt = $pdo->prepare('UPDATE users SET microsoft_user_id = ? WHERE id = ?');
        $stmt->execute([$msUserId, $_SESSION['user_id']]);
        $bindTarget = $isReactUi ? '/settings' : '/pages/settings/';
        header('Location: ' . $bindTarget . '?msg=' . urlencode('ผูกบัญชี Microsoft เรียบร้อยแล้ว'));
        exit;
    }

    // 4. Otherwise, find user by microsoft_user_id
    $stmt = $pdo->prepare('SELECT id, full_name, role_id, is_active FROM users WHERE microsoft_user_id = ? AND is_active = 1');
    $stmt->execute([$msUserId]);
    $user = $stmt->fetch();

    if ($user) {
        // Log in user
        $_SESSION['user_id']      = (int)$user['id'];
        $_SESSION['user_name']    = $user['full_name'];
        $_SESSION['role_id']      = (int)$user['role_id'];
        $_SESSION['ms_profile']   = $profile;
        header('Location: /');
        exit;
    } else {
        // ยังไม่ผูกบัญชี: เด้งกลับหน้า login พร้อมคำแนะนำ
        header('Location: ' . $loginPage . '?error=' . urlencode('บัญชี Microsoft (' . $displayName . ') ยังไม่ได้ถูกผูกกับผู้ใช้ในระบบ กรุณาล็อกอินด้วยชื่อผู้ใช้ก่อน แล้วกด Microsoft อีกครั้งเพื่อผูกบัญชี'));
        exit;
    }

} catch (Exception $e) {
    header('Location: ' . $loginPage . '?error=' . urlencode('System Error: ' . $e->getMessage()));
    exit;
}
