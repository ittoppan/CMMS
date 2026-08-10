<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo); // ต้อง login ก่อนเข้าใช้งาน
    $method = $_SERVER['REQUEST_METHOD'];

    // GET ดูได้ทุกคนที่ login — write (สร้าง/แก้ไข/ลบผู้ใช้) ต้อง admin เท่านั้น
    requireLogin($pdo, $method !== 'GET');

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT id, role_id, username, email, full_name, phone, role, position, employee_code, avatar, avatar_path, line_user_id, is_active, created_at, updated_at FROM users WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT id, role_id, username, email, full_name, phone, role, position, employee_code, avatar, avatar_path, line_user_id, is_active, created_at, updated_at FROM users ORDER BY created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['role_id', 'username', 'email', 'password', 'full_name', 'phone', 'avatar', 'is_active', 'department_id', 'employee_code', 'position', 'signature_path', 'line_user_id'];
            $cols = [];
            $vals = [];
            foreach ($allowed as $col) {
                if ($col === 'password') {
                    if (!empty($data[$col])) { $cols[] = $col; $vals[] = password_hash($data[$col], PASSWORD_DEFAULT); }
                    continue;
                }
                if (array_key_exists($col, $data)) {
                    $cols[] = $col;
                    $vals[] = $data[$col];
                }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data provided']); exit; }
            // รหัสพนักงานต้องไม่ซ้ำกับผู้ใช้รายอื่น (กันผูก LINE ผิดคน)
            if (array_key_exists('employee_code', $data) && $data['employee_code'] !== null && trim((string)$data['employee_code']) !== '') {
                $code = strtoupper(trim((string)$data['employee_code']));
                $dup = $pdo->prepare('SELECT id FROM users WHERE employee_code = ?');
                $dup->execute([$code]);
                if ($dup->fetch()) { http_response_code(409); echo json_encode(['error' => 'รหัสพนักงานนี้ถูกใช้ไปแล้วในระบบ']); exit; }
                $data['employee_code'] = $code;
                $vals[array_search('employee_code', $cols)] = $code;
            }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO users (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['role_id', 'username', 'email', 'password', 'full_name', 'phone', 'avatar', 'is_active', 'department_id', 'employee_code', 'position', 'signature_path', 'line_user_id'];
            $fields = [];
            $values = [];
            foreach ($allowed as $col) {
                if ($col === 'password') {
                    if (!empty($data[$col])) { $fields[] = "$col = ?"; $values[] = password_hash($data[$col], PASSWORD_DEFAULT); }
                    continue;
                }
                if (array_key_exists($col, $data)) {
                    $fields[] = "$col = ?";
                    $values[] = $data[$col];
                }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data provided']); exit; }
            // รหัสพนักงานต้องไม่ซ้ำกับผู้ใช้รายอื่น (กันผูก LINE ผิดคน)
            if (array_key_exists('employee_code', $data) && $data['employee_code'] !== null && trim((string)$data['employee_code']) !== '') {
                $code = strtoupper(trim((string)$data['employee_code']));
                $dup = $pdo->prepare('SELECT id FROM users WHERE employee_code = ? AND id <> ?');
                $dup->execute([$code, $id]);
                if ($dup->fetch()) { http_response_code(409); echo json_encode(['error' => 'รหัสพนักงานนี้ถูกใช้ไปแล้วในระบบ']); exit; }
                $idx = array_search('employee_code = ?', $fields);
                if ($idx !== false) { $values[$idx] = $code; }
            }
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE users SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true, 'message' => 'Updated']);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            // Safe Foreign Key Unbinding
            try { $pdo->prepare('UPDATE repair SET assigned_to = NULL WHERE assigned_to = ?')->execute([$id]); } catch (Exception $e) {}
            try { $pdo->prepare('UPDATE work_permits SET requested_by = NULL WHERE requested_by = ?')->execute([$id]); } catch (Exception $e) {}

            $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
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
