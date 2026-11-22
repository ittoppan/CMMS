<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

$THRESHOLD = 30;

try {
    $pdo = getDb();
    requireLogin($pdo);
    requirePerm($pdo, 'dashboard', 'view');

    $st = $pdo->query("SELECT COUNT(*) AS c FROM repair WHERE status IN ('completed','verified','closed','done','resolved') AND completed_at IS NOT NULL");
    $count = (int)$st->fetchColumn();

    $payload = [
        'threshold' => $THRESHOLD,
        'available' => $count,
        'ready' => $count >= $THRESHOLD,
    ];

    if ($count >= $THRESHOLD) {
        // top failing assets
        $st = $pdo->query("SELECT a.code, a.name, COUNT(*) AS failures
                            FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id
                            WHERE r.status IN ('completed','verified','closed','done','resolved')
                            GROUP BY r.asset_id ORDER BY failures DESC LIMIT 5");
        $payload['top_assets'] = $st->fetchAll(PDO::FETCH_ASSOC);

        // avg resolution hours
        $st = $pdo->query("SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, completed_at)) AS avg_hours FROM repair WHERE status IN ('completed','verified','closed','done','resolved') AND completed_at IS NOT NULL");
        $payload['avg_resolution_hours'] = round((float)$st->fetchColumn(), 1);

        // monthly trend last 6 months
        $st = $pdo->query("SELECT DATE_FORMAT(completed_at,'%Y-%m') AS ym, COUNT(*) AS c FROM repair WHERE status IN ('completed','verified','closed','done','resolved') AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY ym ORDER BY ym");
        $payload['monthly'] = $st->fetchAll(PDO::FETCH_ASSOC);
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    if (function_exists('api_safe_catch')) api_safe_catch($e);
    else { http_response_code(500); echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE); }
}
exit;
