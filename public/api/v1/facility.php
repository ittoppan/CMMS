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

    $st = $pdo->query("SELECT COUNT(*) AS total FROM asset_registry");
    $total = (int)$st->fetchColumn();

    $st = $pdo->query("SELECT category, COUNT(*) AS c FROM asset_registry GROUP BY category ORDER BY c DESC");
    $byCategory = $st->fetchAll(PDO::FETCH_ASSOC);

    $st = $pdo->query("SELECT location, COUNT(*) AS c FROM asset_registry GROUP BY location ORDER BY c DESC LIMIT 20");
    $byLocation = $st->fetchAll(PDO::FETCH_ASSOC);

    $st = $pdo->query("SELECT status, COUNT(*) AS c FROM asset_registry GROUP BY status");
    $byStatus = $st->fetchAll(PDO::FETCH_ASSOC);

    $st = $pdo->query("SELECT COUNT(*) AS c FROM asset_registry WHERE warranty_expiry IS NOT NULL AND warranty_expiry < CURDATE()");
    $expiredWarranty = (int)$st->fetchColumn();

    echo json_encode([
        'total' => $total,
        'by_category' => $byCategory,
        'by_location' => $byLocation,
        'by_status' => $byStatus,
        'expired_warranty' => $expiredWarranty,
    ], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    if (function_exists('api_safe_catch')) api_safe_catch($e);
    else { http_response_code(500); echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE); }
}
exit;
