<?php
require_once __DIR__ . '/../../../src/config/db.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM suppliers WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT * FROM suppliers ORDER BY created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['code', 'name', 'contact_person', 'email', 'phone', 'address', 'tax_id', 'is_active'];
            $cols = [];
            $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) {
                    $cols[] = $col;
                    $vals[] = $data[$col];
                }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data provided']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO suppliers (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['code', 'name', 'contact_person', 'email', 'phone', 'address', 'tax_id', 'is_active'];
            $fields = [];
            $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) {
                    $fields[] = "$col = ?";
                    $values[] = $data[$col];
                }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data provided']); exit; }
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE suppliers SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true, 'message' => 'Updated']);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare('DELETE FROM suppliers WHERE id = ?');
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
