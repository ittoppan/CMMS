<?php
/**
 * CMMS-TPT Push Subscription API (Web Push / PWA)
 *
 *  GET    /api/v1/push_subscribe.php           -> { "publicKey": "<base64url VAPID public>" }
 *  POST   /api/v1/push_subscribe.php  {endpoint, keys:{p256dh, auth}}  -> { "status": "success" }
 *  DELETE /api/v1/push_subscribe.php?endpoint=...                      -> { "status": "success" }
 *
 * ต้อง login (session) — PWA เรียกผ่าน Next.js proxy (/api/* -> :8081) ซึ่ง Origin ผ่าน CSRF check
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/services/WebPushService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $userId = (int)$_SESSION['user_id'];
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $keys = WebPushService::loadKeys($pdo);
        echo json_encode(['publicKey' => WebPushService::base64url_encode($keys['public_raw'])]);
        exit;
    }

    if ($method === 'POST') {
        $in = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
        $endpoint = trim((string)($in['endpoint'] ?? ''));
        $p256dh   = trim((string)($in['keys']['p256dh'] ?? ''));
        $auth     = trim((string)($in['keys']['auth'] ?? ''));
        if ($endpoint === '' || $p256dh === '' || $auth === '') {
            http_response_code(400);
            echo json_encode(['error' => 'endpoint และ keys จำเป็น']);
            exit;
        }
        if (!str_starts_with($endpoint, 'https://') && !str_starts_with($endpoint, 'http://')) {
            http_response_code(400);
            echo json_encode(['error' => 'endpoint ไม่ถูกต้อง']);
            exit;
        }
        $stmt = $pdo->prepare("
            INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), keys_p256dh = VALUES(keys_p256dh), keys_auth = VALUES(keys_auth), updated_at = NOW()
        ");
        $stmt->execute([$userId, $endpoint, $p256dh, $auth]);
        echo json_encode(['status' => 'success']);
        exit;
    }

    if ($method === 'DELETE') {
        $endpoint = trim((string)($_GET['endpoint'] ?? ''));
        if ($endpoint !== '') {
            $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')->execute([$endpoint, $userId]);
        }
        echo json_encode(['status' => 'success']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
