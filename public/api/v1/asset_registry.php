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
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM asset_registry WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT * FROM asset_registry ORDER BY created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            if (isset($data['brand']) && !isset($data['manufacturer'])) $data['manufacturer'] = $data['brand'];
            $allowed = ['code', 'name', 'description', 'category', 'location', 'criticality', 'department', 'manufacturer', 'model', 'serial_number', 'purchase_date', 'warranty_expiry', 'status', 'responsible_user_id', 'department_id', 'location_id', 'work_zone_id', 'barcode', 'qr_code_path', 'image_path', 'instruction_manual', 'in_place_edit'];
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
            $stmt = $pdo->prepare("INSERT INTO asset_registry (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            if (isset($data['brand']) && !isset($data['manufacturer'])) $data['manufacturer'] = $data['brand'];
            $allowed = ['code', 'name', 'description', 'category', 'location', 'criticality', 'department', 'manufacturer', 'model', 'serial_number', 'purchase_date', 'warranty_expiry', 'status', 'responsible_user_id', 'department_id', 'location_id', 'work_zone_id', 'barcode', 'qr_code_path', 'image_path', 'instruction_manual', 'in_place_edit'];
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
            $stmt = $pdo->prepare("UPDATE asset_registry SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true, 'message' => 'Updated']);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            // Safe Foreign Key Cleanup
            try { $pdo->prepare('DELETE FROM machine_bom WHERE asset_id = ?')->execute([$id]); } catch (Exception $e) {}
            try { $pdo->prepare('DELETE FROM iot_devices WHERE asset_id = ?')->execute([$id]); } catch (Exception $e) {}
            try { $pdo->prepare('UPDATE repair SET asset_id = NULL WHERE asset_id = ?')->execute([$id]); } catch (Exception $e) {}
            try { $pdo->prepare('UPDATE pm_am SET asset_id = NULL WHERE asset_id = ?')->execute([$id]); } catch (Exception $e) {}

            $stmt = $pdo->prepare('DELETE FROM asset_registry WHERE id = ?');
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
