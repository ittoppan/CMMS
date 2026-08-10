<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
session_start();

$resource = $_GET['resource'] ?? 'work-orders';
$pdo = getDb();
requireLogin($pdo); // ต้อง login ก่อนอ่านข้อมูล

try {
    if ($resource === 'work-orders') {
        $data = $pdo->query("SELECT r.*, a.name AS asset_name, u.full_name AS assigned_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id ORDER BY r.id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'assets') {
        $data = $pdo->query("SELECT * FROM asset_registry ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'inventory') {
        $data = $pdo->query("SELECT * FROM spare_parts ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'pm-plans') {
        $data = $pdo->query("SELECT * FROM pm_am ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'borrowing') {
        $data = $pdo->query("SELECT * FROM equipment_borrowing ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'calibration') {
        $data = $pdo->query("SELECT * FROM calibration ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'users') {
        $data = $pdo->query("SELECT id, username, email, full_name, phone, role, position, employee_code, avatar_path, is_active, created_at, updated_at FROM users ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'spare-parts') {
        $data = $pdo->query("SELECT * FROM spare_parts ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'work-permits') {
        $data = $pdo->query("SELECT wp.*, u.full_name AS requester_name FROM work_permits wp LEFT JOIN users u ON wp.requested_by = u.id ORDER BY wp.id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'iot-devices') {
        $data = $pdo->query("SELECT iot.*, a.name AS asset_name, a.code AS asset_code FROM iot_devices iot LEFT JOIN asset_registry a ON iot.asset_id = a.id ORDER BY iot.id ASC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'bom-tree') {
        $data = $pdo->query("SELECT b.*, a.name AS asset_name, a.code AS asset_code, s.name AS part_name, s.code AS part_code FROM machine_bom b LEFT JOIN asset_registry a ON b.asset_id = a.id LEFT JOIN spare_parts s ON b.spare_part_id = s.id ORDER BY b.id ASC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['status' => 'error', 'code' => 404, 'message' => 'Resource not found'], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'code' => 500, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
