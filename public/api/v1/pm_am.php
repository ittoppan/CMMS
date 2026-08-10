<?php
require_once __DIR__ . '/../../../src/config/db.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT p.*, a.name AS asset_name, u.full_name AS assigned_name FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id WHERE p.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT p.*, a.name AS asset_name, u.full_name AS assigned_name FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id ORDER BY p.created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason'];
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO pm_am (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE pm_am SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare('DELETE FROM pm_am WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            echo json_encode(['success' => true, 'message' => 'Deleted']);
            break;
        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
