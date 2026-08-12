<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนดูประวัติการส่งแจ้งเตือน

    // ประวัติการส่งแจ้งเตือนจริงจากตาราง notification_logs
    $logs = $pdo->query(
        "SELECT id, channel, status, content, created_at
         FROM notification_logs
         ORDER BY id DESC
         LIMIT 300"
    )->fetchAll(PDO::FETCH_ASSOC);

    $stats = [
        'total'  => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs")->fetchColumn(),
        'sent'   => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE status = 'SENT'")->fetchColumn(),
        'failed' => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE status IN ('FAILED','PENDING_CONFIG','NO_RECIPIENT')")->fetchColumn(),
        'today'  => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE DATE(created_at) = CURDATE()")->fetchColumn(),
        'by_channel' => [],
        'by_status'  => [],
    ];
    foreach ($pdo->query("SELECT channel, COUNT(*) c FROM notification_logs GROUP BY channel")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $stats['by_channel'][$r['channel']] = (int)$r['c'];
    }
    foreach ($pdo->query("SELECT status, COUNT(*) c FROM notification_logs GROUP BY status")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $stats['by_status'][$r['status']] = (int)$r['c'];
    }

    echo json_encode([
        'status' => 'success',
        'code'   => 200,
        'count'  => count($logs),
        'data'   => $logs,
        'stats'  => $stats,
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
