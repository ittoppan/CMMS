<?php
/**
 * Phase 36 machine ingestion API.
 *
 * Authenticated by source token (environment-backed secret reference), not by session, so CSRF
 * does not apply here. Rejections are reported per reading with the reason and quality state:
 * a value is never replaced by an invented one.
 */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/iot.php';
require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'METHOD_NOT_ALLOWED',
                      'message' => 'ใช้เมธอด POST เท่านั้น'], JSON_UNESCAPED_UNICODE);
    exit;
}

$pdo = getDb();
$cfg = iot_config($pdo);
$ip  = (string)($_SERVER['REMOTE_ADDR'] ?? '');

$reply = static function (int $http, array $body): void {
    http_response_code($http);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
};

if ($cfg['iot_enabled'] !== 1) {
    $reply(503, ['ok' => false, 'error' => 'MODULE_DISABLED',
                 'message' => 'โมดูล IoT ถูกปิดใช้งานอยู่ ไม่มีการรับหรือแตะข้อมูลใด ๆ']);
}

$raw = (string)file_get_contents('php://input');
if (strlen($raw) > $cfg['iot_ingest_max_payload_bytes']) {
    $reply(413, ['ok' => false, 'error' => 'PAYLOAD_TOO_LARGE',
                 'message' => 'payload ใหญ่เกินกำหนด ' . $cfg['iot_ingest_max_payload_bytes'] . ' bytes']);
}

$token = '';
foreach (['HTTP_X_IOT_TOKEN', 'HTTP_AUTHORIZATION', 'HTTP_X_SOURCE_TOKEN'] as $h) {
    $v = (string)($_SERVER[$h] ?? '');
    if ($v !== '') {
        $token = (stripos($v, 'bearer ') === 0) ? trim(substr($v, 7)) : $v;
        break;
    }
}

$rate = iot_rate_check($pdo, 'iot_ingest_ip:' . $ip, (int)$cfg['iot_ingest_rate_limit_per_min']);
if (empty($rate['ok'])) {
    $reply(429, array_merge(['ok' => false], $rate));
}

$auth = ['error' => 'UNAUTHORIZED', 'message' => 'ต้องยืนยันตัวตนของแหล่งข้อมูล'];
if ($cfg['iot_ingest_require_source_auth'] === 1) {
    $auth = iot_source_authenticate($pdo, $token, $ip);
}
if (!empty($auth['error'])) {
    $reply(401, ['ok' => false, 'error' => $auth['error'], 'message' => $auth['message']]);
}
$sourceId = (int)($auth['id'] ?? 0);
if ($sourceId <= 0) {
    $reply(401, ['ok' => false, 'error' => 'UNAUTHORIZED', 'message' => 'ไม่พบแหล่งข้อมูลที่ใช้งานได้']);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}
$readings = $payload['readings'] ?? ($payload['data'] ?? null);
if ($readings === null && isset($payload['point_key'])) {
    $readings = [$payload];
}
if (!is_array($readings) || $readings === []) {
    $reply(422, ['ok' => false, 'error' => 'NO_READINGS',
                 'message' => 'ไม่พบค่าที่ส่งมา ไม่มีการเดาแทน']);
}

$res = iot_ingest($pdo, $sourceId, $readings, [
    'batch_uid'     => $payload['batch_uid'] ?? '',
    'payload_bytes' => strlen($raw),
    'remote_ip'     => $ip,
    'http_status'   => 200,
]);

$http = $res['ok'] ? 200 : (($res['accepted'] > 0) ? 207 : 422);
$res['ok']         = (bool)$res['ok'];
$res['source_code'] = (string)($auth['source_code'] ?? '');
$reply($http, $res);