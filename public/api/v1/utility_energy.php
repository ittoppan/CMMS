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
        $limit = min(200, max(1, (int)($_GET['limit'] ?? 50)));
        $type = trim((string)($_GET['type'] ?? ''));
        $where = '';
        $params = [];
        if ($type !== '') { $where = ' WHERE utility_type = ?'; $params[] = $type; }
        $st = $pdo->prepare('SELECT * FROM utility_readings' . $where . ' ORDER BY reading_date DESC, id DESC LIMIT ' . $limit);
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);

        // summary by type
        $st2 = $pdo->query("SELECT utility_type, COUNT(*) AS records, COALESCE(SUM(value),0) AS total, MIN(reading_date) AS first_date, MAX(reading_date) AS last_date FROM utility_readings GROUP BY utility_type");
        $summary = $st2->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['items' => $rows, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        requirePerm($pdo, 'utility_energy', 'write');
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) $input = $_POST;
        $type = trim((string)($input['utility_type'] ?? ''));
        if ($type === '') { http_response_code(400); echo json_encode(['error' => 'กรุณาระบุประเภท'], JSON_UNESCAPED_UNICODE); exit; }
        $date = trim((string)($input['reading_date'] ?? ''));
        if ($date === '') $date = date('Y-m-d');
        $d = DateTime::createFromFormat('Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) { http_response_code(400); echo json_encode(['error' => 'วันที่ไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE); exit; }
        $value = $input['value'] ?? null;
        if (!is_numeric($value)) { http_response_code(400); echo json_encode(['error' => 'ค่าต้องเป็นตัวเลข'], JSON_UNESCAPED_UNICODE); exit; }

        $uid = (int)($_SESSION['user_id'] ?? 0);
        $st = $pdo->prepare('INSERT INTO utility_readings (utility_type, reading_date, value, unit, notes, recorded_by) VALUES (?,?,?,?,?,?)');
        $st->execute([$type, $date, $value, trim((string)($input['unit'] ?? '')) ?: null, trim((string)($input['notes'] ?? '')) ?: null, $uid ?: null]);
        echo json_encode(['ok' => true, 'id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Exception $e) {
    if (function_exists('api_safe_catch')) api_safe_catch($e);
    else { http_response_code(500); echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE); }
}
exit;
