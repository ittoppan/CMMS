<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    requirePerm($pdo, 'dashboard', 'view');

    // completeness of closed/completed work orders
    $st = $pdo->query("SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN root_cause IS NOT NULL AND root_cause <> '' THEN 1 ELSE 0 END) AS has_cause,
        SUM(CASE WHEN solution IS NOT NULL AND solution <> '' THEN 1 ELSE 0 END) AS has_solution,
        SUM(CASE WHEN actual_start_at IS NOT NULL THEN 1 ELSE 0 END) AS has_hours,
        SUM(CASE WHEN estimated_completion_date IS NOT NULL THEN 1 ELSE 0 END) AS has_estimate
        FROM repair
        WHERE status IN ('completed','verified','closed','done','resolved')");
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];

    // users with no assigned repairs
    $st2 = $pdo->query("SELECT u.id, u.username, u.full_name, u.role
                        FROM users u
                        LEFT JOIN repair r ON r.assigned_to = u.id
                        WHERE r.id IS NULL AND u.is_active = 1
                        ORDER BY u.full_name
                        LIMIT 50");
    $inactive = $st2->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'completeness' => [
            'total' => (int)($row['total'] ?? 0),
            'has_cause' => (int)($row['has_cause'] ?? 0),
            'has_solution' => (int)($row['has_solution'] ?? 0),
            'has_hours' => (int)($row['has_hours'] ?? 0),
            'has_estimate' => (int)($row['has_estimate'] ?? 0),
        ],
        'inactive_users' => $inactive,
    ], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    if (function_exists('api_safe_catch')) api_safe_catch($e);
    else { http_response_code(500); echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE); }
}
exit;
