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
        $st = $pdo->query("SELECT lp.*, a.code AS asset_code, a.name AS asset_name,
                            CASE WHEN lp.last_done IS NULL THEN 9999
                                 ELSE DATEDIFF(CURDATE(), lp.last_done) END AS days_since
                            FROM lubrication_points lp
                            LEFT JOIN asset_registry a ON a.id = lp.asset_id
                            ORDER BY lp.name");
        $points = $st->fetchAll(PDO::FETCH_ASSOC);
        foreach ($points as &$p) {
            $due = false;
            if ($p['last_done'] === null) $due = true;
            else if ((int)$p['days_since'] >= (int)$p['interval_days']) $due = true;
            $p['due'] = $due;
            $p['next_due'] = $p['last_done'] ? date('Y-m-d', strtotime($p['last_done'] . ' + ' . (int)$p['interval_days'] . ' days')) : null;
        }
        unset($p);
        echo json_encode(['items' => $points], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) $input = $_POST;
        $action = (string)($input['action'] ?? 'add_point');

        $uid = (int)($_SESSION['user_id'] ?? 0);

        if ($action === 'add_point') {
            $name = trim((string)($input['name'] ?? ''));
            if ($name === '') { http_response_code(400); echo json_encode(['error' => 'กรุณาระบุชื่อจุดหล่อลื่น'], JSON_UNESCAPED_UNICODE); exit; }
            $interval = max(1, (int)($input['interval_days'] ?? 30));
            $assetId = !empty($input['asset_id']) ? (int)$input['asset_id'] : null;
            $st = $pdo->prepare('INSERT INTO lubrication_points (name, asset_id, interval_days, notes, created_by) VALUES (?,?,?,?,?)');
            $st->execute([$name, $assetId, $interval, trim((string)($input['notes'] ?? '')) ?: null, $uid ?: null]);
            echo json_encode(['ok' => true, 'id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'mark_done') {
            $pointId = (int)($input['point_id'] ?? 0);
            if ($pointId <= 0) { http_response_code(400); echo json_encode(['error' => 'point_id ไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE); exit; }
            $doneDate = trim((string)($input['done_date'] ?? ''));
            if ($doneDate === '') $doneDate = date('Y-m-d');
            $d = DateTime::createFromFormat('Y-m-d', $doneDate);
            if (!$d || $d->format('Y-m-d') !== $doneDate) { http_response_code(400); echo json_encode(['error' => 'วันที่ไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE); exit; }
            // log
            $st = $pdo->prepare('INSERT INTO lubrication_logs (point_id, done_date, notes, done_by) VALUES (?,?,?,?)');
            $st->execute([$pointId, $doneDate, trim((string)($input['notes'] ?? '')) ?: null, $uid ?: null]);
            // update point last_done
            $st = $pdo->prepare('UPDATE lubrication_points SET last_done = ? WHERE id = ?');
            $st->execute([$doneDate, $pointId]);
            echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(400);
        echo json_encode(['error' => 'action ไม่รู้จัก'], JSON_UNESCAPED_UNICODE);
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
