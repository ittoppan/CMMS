<?php
/**
 * health.php — public health check (ไม่มี auth) สำหรับ monitoring / load balancer
 *
 * GET /api/health
 *   200 { status: "ok", timestamp, uptime, db: "ok" }           — ทุกอย่างปกติ
 *   503 { status: "degraded", db: "error", timestamp }          — ติดต่อ DB ไม่ได้
 *
 * ไม่ return รายละเอียดภายใน/error message เดิมจาก PDO (กันข้อมูลหลุด)
 */
require_once __DIR__ . '/../../src/config/db.php';
require_once __DIR__ . '/../../src/helpers/errors.php';

header('Content-Type: application/json; charset=utf-8');

$dbOk = false;
try {
    $pdo = getDb();
    $pdo->query('SELECT 1');
    $dbOk = true;
} catch (Throwable $e) {
    define('CMMS_HEALTH_NO_DB', true); // DB ใช้ไม่ได้ — ห้ามพยายามเขียน DB ซ้ำ
    error_log('[health] DB ping failed: ' . get_class($e) . ': ' . $e->getMessage());
    api_log_error($e, 'health', 'DB สำรองไม่สามารถเชื่อมต่อได้', 'DB', 'DB_CONNECTION_ERROR');
}

if ($dbOk) {
    http_response_code(200);
    echo json_encode([
        'status'    => 'ok',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'db'        => 'ok',
    ]);
} else {
    http_response_code(503);
    echo json_encode([
        'status'    => 'degraded',
        'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        'db'        => 'error',
    ]);
}