<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            $sageCategory = isset($_GET['sage_category']) ? $_GET['sage_category'] : '';

            if ($id) {
                $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id WHERE s.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } elseif (!empty($sageCategory)) {
                $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id WHERE s.sage_category = ? ORDER BY s.created_at DESC');
                $stmt->execute([$sageCategory]);
                echo json_encode($stmt->fetchAll());
            } else {
                $stmt = $pdo->query('SELECT s.*, sup.name AS supplier_name FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id ORDER BY s.created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['supplier_id', 'code', 'name', 'description', 'category', 'sage_category', 'unit', 'stock_qty', 'min_stock', 'max_stock', 'location', 'unit_price', 'sage_item_no', 'sage_sync_status', 'image_url'];
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO spare_parts (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['supplier_id', 'code', 'name', 'description', 'category', 'sage_category', 'unit', 'stock_qty', 'min_stock', 'max_stock', 'location', 'unit_price', 'sage_item_no', 'sage_sync_status', 'image_url'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE spare_parts SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            // Safe Foreign Key Cleanup
            try { $pdo->prepare('DELETE FROM machine_bom WHERE spare_part_id = ?')->execute([$id]); } catch (Exception $e) {}

            $stmt = $pdo->prepare('DELETE FROM spare_parts WHERE id = ?');
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
