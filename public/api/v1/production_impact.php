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

    $st = $pdo->query("SELECT shift, SUM(hours) AS total_hours, COUNT(*) AS records, MIN(record_date) AS first_date, MAX(record_date) AS last_date
                       FROM production_hours GROUP BY shift");
    $byShift = $st->fetchAll(PDO::FETCH_ASSOC);

    $st2 = $pdo->query("SELECT COUNT(*) AS total_records, COALESCE(SUM(hours),0) AS grand_total, MIN(record_date) AS first_date, MAX(record_date) AS last_date FROM production_hours");
    $summary = $st2->fetch(PDO::FETCH_ASSOC) ?: [];

    // daily trend last 14 days
    $st3 = $pdo->query("SELECT record_date, SUM(hours) AS hours FROM production_hours WHERE record_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) GROUP BY record_date ORDER BY record_date");
    $daily = $st3->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'summary' => $summary,
        'by_shift' => $byShift,
        'daily' => $daily,
    ], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    if (function_exists('api_safe_catch')) api_safe_catch($e);
    else { http_response_code(500); echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE); }
}
exit;
