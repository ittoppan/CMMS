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

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 30)));
        $st = $pdo->prepare('SELECT sh.*, u.full_name AS created_by_name
                             FROM shift_handovers sh
                             LEFT JOIN users u ON u.id = sh.created_by
                             ORDER BY sh.shift_date DESC, sh.id DESC
                             LIMIT ' . $limit);
        $st->execute();
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['items' => $rows], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) $input = $_POST;
        $shiftDate = trim((string)($input['shift_date'] ?? ''));
        if ($shiftDate === '') $shiftDate = date('Y-m-d');
        // validate date
        $d = DateTime::createFromFormat('Y-m-d', $shiftDate);
        if (!$d || $d->format('Y-m-d') !== $shiftDate) {
            http_response_code(400);
            echo json_encode(['error' => 'วันที่ไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $shiftCode = trim((string)($input['shift_code'] ?? 'day'));
        if (!in_array($shiftCode, ['day', 'night', 'morning', 'afternoon'], true)) $shiftCode = 'day';

        $uid = (int)($_SESSION['user_id'] ?? 0);
        $st = $pdo->prepare('INSERT INTO shift_handovers (shift_date, shift_code, pending_jobs, incidents, machines_watch, notes, created_by)
                             VALUES (?, ?, ?, ?, ?, ?, ?)');
        $st->execute([
            $shiftDate,
            $shiftCode,
            trim((string)($input['pending_jobs'] ?? '')) ?: null,
            trim((string)($input['incidents'] ?? '')) ?: null,
            trim((string)($input['machines_watch'] ?? '')) ?: null,
            trim((string)($input['notes'] ?? '')) ?: null,
            $uid ?: null,
        ]);
        echo json_encode(['ok' => true, 'id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    if (function_exists('api_safe_catch')) api_safe_catch($e);
    else {
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
}
exit;
