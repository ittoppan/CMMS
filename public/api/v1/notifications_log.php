<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนดูประวัติการส่งแจ้งเตือน

    // ── ตัวกรองจาก query string ──
    $channel  = trim((string)($_GET['channel'] ?? ''));
    $status   = trim((string)($_GET['status'] ?? ''));
    $template = trim((string)($_GET['template'] ?? ''));
    $q        = trim((string)($_GET['q'] ?? ''));
    $from     = trim((string)($_GET['from'] ?? ''));
    $to       = trim((string)($_GET['to'] ?? ''));
    $limit    = min(max((int)($_GET['limit'] ?? 200), 1), 500);

    $where  = [];
    $params = [];
    if ($channel !== '')  { $where[] = 'l.channel = ?';  $params[] = $channel; }
    if ($status !== '')   { $where[] = 'l.status = ?';   $params[] = $status; }
    if ($template !== '') { $where[] = 'l.template = ?'; $params[] = $template; }
    if ($q !== '')        { $where[] = '(l.content LIKE ? OR l.recipient LIKE ? OR COALESCE(u.username, u.full_name, \'\') LIKE ?)';
                            $like = '%' . $q . '%'; $params[] = $like; $params[] = $like; $params[] = $like; }
    if ($from !== '')     { $where[] = 'DATE(l.created_at) >= ?'; $params[] = $from; }
    if ($to !== '')       { $where[] = 'DATE(l.created_at) <= ?'; $params[] = $to; }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $baseFrom = "FROM notification_logs l
                 LEFT JOIN users u ON u.line_user_id = l.recipient";

    $stmt = $pdo->prepare(
        "SELECT l.id, l.channel, l.status, l.recipient, l.template,
                l.content, l.raw_response, l.created_at,
                COALESCE(NULLIF(u.full_name, ''), u.username, '') AS recipient_name
         $baseFrom
         $whereSql
         ORDER BY l.id DESC
         LIMIT " . (int)$limit
    );
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // ── สถิติ (ตามตัวกรองช่องทาง) ──
    $stats = [
        'total'  => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs")->fetchColumn(),
        'sent'   => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE status = 'SENT'")->fetchColumn(),
        'failed' => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE status IN ('FAILED','PENDING_CONFIG','NO_RECIPIENT')")->fetchColumn(),
        'today'  => (int)$pdo->query("SELECT COUNT(*) FROM notification_logs WHERE DATE(created_at) = CURDATE()")->fetchColumn(),
        'by_channel' => [],
        'by_status'  => [],
        'by_template'=> [],
    ];
    foreach ($pdo->query("SELECT channel, COUNT(*) c FROM notification_logs GROUP BY channel")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $stats['by_channel'][$r['channel']] = (int)$r['c'];
    }
    foreach ($pdo->query("SELECT status, COUNT(*) c FROM notification_logs GROUP BY status")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $stats['by_status'][$r['status']] = (int)$r['c'];
    }
    foreach ($pdo->query("SELECT COALESCE(template, '') t, COUNT(*) c FROM notification_logs GROUP BY template")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $stats['by_template'][$r['t'] === '' ? 'GENERIC' : $r['t']] = (int)$r['c'];
    }

    echo json_encode([
        'status' => 'success',
        'code'   => 200,
        'count'  => count($logs),
        'data'   => $logs,
        'stats'  => $stats,
        'filters' => [
            'templates' => $pdo->query("SELECT DISTINCT template FROM notification_logs WHERE template IS NOT NULL AND template != '' ORDER BY template")->fetchAll(PDO::FETCH_COLUMN),
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
