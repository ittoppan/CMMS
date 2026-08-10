<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // write (สร้าง/แก้ไข/ลบบทบาท หรือแก้สิทธิ์) ต้อง admin เท่านั้น
    if ($method !== 'GET') {
        requireLogin($pdo, true);
    }

    if ($action === 'permissions') {
        if ($method === 'GET') {
            $roleId = isset($_GET['role_id']) ? (int)$_GET['role_id'] : 0;
            if ($roleId) {
                $stmt = $pdo->prepare('SELECT * FROM user_permissions WHERE role_id = ?');
                $stmt->execute([$roleId]);
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            } else {
                $stmt = $pdo->query('SELECT * FROM user_permissions');
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            }
            exit;
        } elseif ($method === 'POST' || $method === 'PUT') {
            $data = json_decode(file_get_contents('php://input'), true);
            $roleId = (int)($data['role_id'] ?? 0);
            $permissions = $data['permissions'] ?? [];

            if (!$roleId || !is_array($permissions)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid role_id or permissions payload']);
                exit;
            }

            foreach ($permissions as $p) {
                $module = $p['module'] ?? '';
                $permission = $p['permission'] ?? '';
                $isGranted = !empty($p['is_granted']) ? 1 : 0;

                if ($module && $permission) {
                    $check = $pdo->prepare('SELECT id FROM user_permissions WHERE role_id = ? AND module = ? AND permission = ?');
                    $check->execute([$roleId, $module, $permission]);
                    $existing = $check->fetchColumn();

                    if ($existing) {
                        $upd = $pdo->prepare('UPDATE user_permissions SET is_granted = ? WHERE id = ?');
                        $upd->execute([$isGranted, $existing]);
                    } else {
                        $ins = $pdo->prepare('INSERT INTO user_permissions (role_id, module, permission, is_granted) VALUES (?, ?, ?, ?)');
                        $ins->execute([$roleId, $module, $permission, $isGranted]);
                    }
                }
            }

            echo json_encode(['success' => true, 'message' => 'Permissions updated']);
            exit;
        }
    }

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM roles WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT * FROM roles ORDER BY id ASC');
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['name', 'description'];
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
            $stmt = $pdo->prepare("INSERT INTO roles (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['name', 'description'];
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
            $stmt = $pdo->prepare("UPDATE roles SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true, 'message' => 'Updated']);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            // Safe Foreign Key Cleanup
            try { $pdo->prepare('DELETE FROM user_permissions WHERE role_id = ?')->execute([$id]); } catch (Exception $e) {}
            try { $pdo->prepare('UPDATE users SET role_id = NULL WHERE role_id = ?')->execute([$id]); } catch (Exception $e) {}

            $stmt = $pdo->prepare('DELETE FROM roles WHERE id = ?');
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
