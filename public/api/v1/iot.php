<?php
/**
 * Phase 36 operator API (session authenticated).
 *
 * Read actions need iot.view. Every mutation names its own permission and is audited by the
 * helper it calls. Nothing here invents data, and nothing here creates work orders.
 */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/iot.php';

session_start();
cmms_cors_headers();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    exit;
}
if (!in_array($method, ['GET', 'HEAD', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'code' => 405, 'message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method !== 'GET') {
    enforceCsrf();
}

$pdo = getDb();
requireLogin($pdo);

if (!iot_can('view')) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'code' => 403, 'message' => 'ไม่มีสิทธิ์ดูข้อมูล IoT (iot.view)'], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = (string)($_GET['action'] ?? 'overview');
$in     = ($method === 'POST') ? $_POST : [];

$need = static function (string $perm) use ($pdo): void {
    if (canPerm($pdo, 'iot', $perm)) {
        return;
    }
    http_response_code(403);
    echo json_encode(['status' => 'error', 'code' => 403, 'message' => 'ไม่มีสิทธิ์ ' . $perm], JSON_UNESCAPED_UNICODE);
    exit;
};

$ok = static function ($data, int $code = 200): void {
    $body = ['status' => 'success', 'code' => $code, 'data' => $data];
    if (is_array($data) && array_is_list($data)) {
        $body['count'] = count($data);
    }
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
};

$fail = static function (array $err): void {
    $code = $err['error'] ?? 'ERROR';
    $http = ['VALIDATION' => 422, 'NOT_FOUND' => 404, 'DUPLICATE' => 409,
             'UNAUTHORIZED' => 401, 'FORBIDDEN' => 403, 'IN_USE' => 409,
             'INVALID_TRANSITION' => 409, 'NO_CHANGE' => 409,
             'TRANSITION' => 409, 'CONFLICT' => 409][$code] ?? 400;
    http_response_code($http);
    echo json_encode(['status' => 'error', 'code' => $http, 'error' => $code,
                      'message' => $err['message'] ?? 'ผิดพลาด'], JSON_UNESCAPED_UNICODE);
    exit;
};

$uid = (int)($_SESSION['user_id'] ?? 0);

$pdoLimit = isset($_GET['limit']) ? max(1, min(1000, (int)$_GET['limit'])) : 0;

try {
    /* ---------------- READS ---------------- */
    switch ($action) {
        case 'schema-ready':
            $ok(['ready' => iot_schema_ready($pdo), 'at' => iot_now()]);
            // no break

        case 'overview':
            require_once __DIR__ . '/../../../src/helpers/iot_condition.php';
            $ok(iot_overview($pdo));
            // no break

        case 'devices':
            $ok(iot_device_list($pdo, array_filter([
                'lifecycle_status' => $_GET['lifecycle_status'] ?? '',
                'asset_id'         => $_GET['asset_id'] ?? '',
                'source_id'        => $_GET['source_id'] ?? '',
                'gateway_id'       => $_GET['gateway_id'] ?? '',
                'q'                => $_GET['q'] ?? '',
                'limit'            => $pdoLimit,
            ], static fn($v) => $v !== '')));
            // no break

        case 'device':
            $got = iot_device_get($pdo, (int)($_GET['id'] ?? 0));
            if (!empty($got['error'])) {
                $fail($got);
            }
            $ok($got);
            // no break

        case 'points':
            $ok(iot_point_list($pdo, array_filter([
                'device_id'   => $_GET['device_id'] ?? '',
                'asset_id'    => $_GET['asset_id'] ?? '',
                'signal_type' => $_GET['signal_type'] ?? '',
                'enabled'     => $_GET['enabled'] ?? '',
                'q'           => $_GET['q'] ?? '',
                'limit'       => $pdoLimit,
            ], static fn($v) => $v !== '')));
            // no break

        case 'point':
            $got = iot_point_get($pdo, (int)($_GET['id'] ?? 0));
            if (!empty($got['error'])) {
                $fail($got);
            }
            $ok($got);
            // no break

        case 'series':
            require_once __DIR__ . '/../../../src/helpers/iot_condition.php';
            $pointId = (int)($_GET['point_id'] ?? 0);
            if (!iot_point_exists($pdo, $pointId)) {
                $fail(iot_err('NOT_FOUND', 'ไม่พบจุดวัด'));
            }
            $to   = iot_clean_str($_GET['to'] ?? '', 40) ?: iot_now();
            $from = iot_clean_str($_GET['from'] ?? '', 40)
                ?: date('Y-m-d H:i:s', strtotime($to) - 86400);
            $ok(iot_point_series($pdo, $pointId, $from, $to,
                                 iot_clean_str($_GET['bucket'] ?? '', 20) ?: null));
            // no break

        case 'rules':
            $ok(iot_rule_list($pdo, array_filter([
                'point_id'        => $_GET['point_id'] ?? '',
                'asset_id'        => $_GET['asset_id'] ?? '',
                'metric'          => $_GET['metric'] ?? '',
                'enabled'         => $_GET['enabled'] ?? '',
                'include_history' => $_GET['include_history'] ?? '',
                'limit'           => $pdoLimit,
            ], static fn($v) => $v !== '')));
            // no break

        case 'alarms':
            require_once __DIR__ . '/../../../src/helpers/iot_alarm.php';
            $rows = iot_alarm_list($pdo, array_filter([
                'status'    => $_GET['status'] ?? '',
                'severity'  => $_GET['severity'] ?? '',
                'category'  => $_GET['category'] ?? '',
                'device_id' => $_GET['device_id'] ?? '',
                'asset_id'  => $_GET['asset_id'] ?? '',
                'from'      => $_GET['from'] ?? '',
                'open_only' => $_GET['open_only'] ?? '',
                'order'     => $_GET['order'] ?? '',
                'limit'     => isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100,
            ], static fn($v) => $v !== ''));
            $ok($rows);
            // no break

        case 'alarm':
            require_once __DIR__ . '/../../../src/helpers/iot_alarm.php';
            $got = iot_alarm_get($pdo, (int)($_GET['id'] ?? 0));
            if (!empty($got['error'])) {
                $fail($got);
            }
            $ok($got);
            // no break

        case 'condition':
            require_once __DIR__ . '/../../../src/helpers/iot_condition.php';
            $snap = iot_condition_snapshot($pdo, (int)($_GET['asset_id'] ?? 0));
            if (!empty($snap['error'])) {
                $fail($snap);
            }
            $ok($snap);
            // no break

        case 'sources':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $ok(iot_source_list($pdo));
            // no break

        case 'connectors':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $ok(iot_connector_list($pdo));
            // no break

        case 'gateways':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $ok(iot_gateway_list($pdo));
            // no break

        case 'ingest-history':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $ok(iot_ingest_history($pdo, isset($_GET['limit']) ? (int)$_GET['limit'] : 50,
                                    isset($_GET['source_id']) ? (int)$_GET['source_id'] : null));
            // no break

        case 'data-quality':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $ok(iot_data_quality_summary($pdo, isset($_GET['hours']) ? (int)$_GET['hours'] : 24));
            // no break

        case 'retention':
            require_once __DIR__ . '/../../../src/helpers/iot_condition.php';
            $ok(['policies' => iot_retention_policies($pdo), 'targets' => iot_retention_targets()]);
            // no break
    }

    /* ---------------- MUTATIONS ---------------- */
    switch ($action) {
        case 'device-save':
            $need('write');
            $r = iot_device_save($pdo, $in, $uid);
            empty($r['error']) ? $ok($r, 200) : $fail($r);
            // no break

        case 'device-transition':
            $need('write');
            $r = iot_device_transition($pdo, (int)($in['id'] ?? 0),
                    (string)($in['to'] ?? ''), (string)($in['reason'] ?? ''), $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'point-save':
            $need('write');
            $r = iot_point_save($pdo, $in, $uid);
            empty($r['error']) ? $ok($r, isset($r['id']) && (int)($in['id'] ?? 0) === 0 ? 201 : 200) : $fail($r);
            // no break

        case 'point-delete':
            $need('write');
            $r = iot_point_delete($pdo, (int)($in['id'] ?? 0), (string)($in['reason'] ?? ''), $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'rule-save':
            $need('config');
            $r = iot_rule_save($pdo, $in, $uid);
            empty($r['error']) ? $ok($r, isset($r['id']) && (int)($in['id'] ?? 0) === 0 ? 201 : 200) : $fail($r);
            // no break

        case 'rule-enabled':
            $need('config');
            $r = iot_rule_set_enabled($pdo, (int)($in['id'] ?? 0), !empty($in['enabled']),
                    (string)($in['reason'] ?? ''), $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'alarm-ack':
            require_once __DIR__ . '/../../../src/helpers/iot_alarm.php';
            $need('alarm_ack');
            $r = iot_alarm_acknowledge($pdo, (int)($in['id'] ?? 0), $uid, (string)($in['note'] ?? ''));
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'alarm-transition':
            require_once __DIR__ . '/../../../src/helpers/iot_alarm.php';
            $to = (string)($in['to'] ?? '');
            $need($to === 'closed' ? 'alarm_close' : 'alarm_resolve');
            $r = iot_alarm_transition($pdo, (int)($in['id'] ?? 0), $to, (string)($in['note'] ?? ''),
                    $uid, array_filter([
                        'resolution_code' => $in['resolution_code'] ?? '',
                        'suppress_minutes'=> $in['suppress_minutes'] ?? '',
                        'until'           => $in['until'] ?? '',
                    ], static fn($v) => $v !== ''));
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'alarm-link-work-order':
            require_once __DIR__ . '/../../../src/helpers/iot_alarm.php';
            $need('write');
            $r = iot_alarm_link_work_order($pdo, (int)($in['id'] ?? 0), (int)($in['repair_id'] ?? 0),
                    (string)($in['note'] ?? ''), $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'alarm-link-rca':
            require_once __DIR__ . '/../../../src/helpers/iot_alarm.php';
            $need('write');
            $r = iot_alarm_link_rca($pdo, (int)($in['id'] ?? 0),
                    isset($in['rca_id']) && $in['rca_id'] !== '' ? (int)$in['rca_id'] : null,
                    (string)($in['note'] ?? ''), $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'source-save':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $need('config');
            $r = iot_source_save($pdo, $in, $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'connector-save':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $need('config');
            $r = iot_connector_save($pdo, $in, $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break

        case 'gateway-save':
            require_once __DIR__ . '/../../../src/helpers/iot_ingest.php';
            $need('config');
            $r = iot_gateway_save($pdo, $in, $uid);
            empty($r['error']) ? $ok($r) : $fail($r);
            // no break
    }

    http_response_code(404);
    echo json_encode(['status' => 'error', 'code' => 404, 'message' => 'ไม่พบ action ที่ร้องขอ'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[iot.api] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['status' => 'error', 'code' => 500, 'message' => 'เกิดข้อผิดพลาดภายในระบบ'], JSON_UNESCAPED_UNICODE);
}