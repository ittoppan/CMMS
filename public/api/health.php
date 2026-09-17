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

header('Content-Type: application/json; charset=utf-8');

$dbOk = false;
try {
    $pdo = getDb();
    $pdo->query('SELECT 1');
    $dbOk = true;
} catch (Throwable $e) {
    error_log('[health] DB ping failed: ' . get_class($e) . ': ' . $e->getMessage());
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