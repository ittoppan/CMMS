<?php
/**
 * production_hours.php — Production / runtime hours ต่อเครื่องต่อวัน
 *
 * Endpoints:
 *   GET    /api/v1/production_hours.php            → รายการ (join asset)
 *   GET    /api/v1/production_hours.php?id=N       → รายการเดียว
 *   POST   /api/v1/production_hours.php            → เพิ่ม
 *   PUT    /api/v1/production_hours.php?id=N       → แก้ไข
 *   DELETE /api/v1/production_hours.php?id=N       → ลบ
 *
 * ใช้เป็นตัวตั้งต้น (operating hours) ของ MTBF/MTTR, OEE และ reliability engine
 * (production_hours.hours → src/helpers/reliability.php, asset_reliability.php)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    // CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ
    if (in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
        enforceCsrf();
    }

    $allowed = ['asset_id', 'record_date', 'hours', 'shift', 'notes'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT ph.*, a.code AS asset_code, a.name AS asset_name FROM production_hours ph LEFT JOIN asset_registry a ON ph.asset_id = a.id WHERE ph.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT ph.*, a.code AS asset_code, a.name AS asset_name FROM production_hours ph LEFT JOIN asset_registry a ON ph.asset_id = a.id ORDER BY ph.record_date DESC, ph.id DESC LIMIT 500');
                echo json_encode($stmt->fetchAll());
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col]) && $data[$col] !== '') { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $cols[] = 'created_by';
            $vals[] = (int)($_SESSION['user_id'] ?? 0) ?: null;
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare('INSERT INTO production_hours (' . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;

        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $values[] = $id;
            $stmt = $pdo->prepare('UPDATE production_hours SET ' . implode(',', $fields) . ' WHERE id = ?');
            $stmt->execute($values);
            echo json_encode(['success' => true]);
            break;

        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare('DELETE FROM production_hours WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            echo json_encode(['success' => true, 'message' => 'Deleted']);
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    api_safe_catch($e);
}
