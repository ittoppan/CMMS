<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
session_start();

$resource = $_GET['resource'] ?? 'work-orders';
$pdo = getDb();
requireLogin($pdo); // ต้อง login ก่อนอ่านข้อมูล

try {
    // POST: สร้างใบอนุญาตทำงานเสี่ยง (work-permits) — ข้อมูลจริงจากฟอร์มฝั่ง PWA
    if ($resource === 'work-permits' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $pType     = trim($_POST['permit_type'] ?? '');
        $location  = trim($_POST['location'] ?? '');
        $repairRef = trim($_POST['repair_ref'] ?? '');
        $safetySig = trim($_POST['safety_signature'] ?? '');
        // map ค่าจาก frontend ให้ตรงกับ ENUM ของคอลัมน์ permit_type
        $pTypeMap = [
            'electrical_loto' => 'electrical',
            'high_altitude'   => 'high_work',
            'loto'            => 'electrical',
        ];
        if (isset($pTypeMap[$pType])) { $pType = $pTypeMap[$pType]; }
        if ($pType === '' || $location === '') {
            echo json_encode(['status' => 'error', 'code' => 422, 'message' => 'กรุณาระบุประเภทงานเสี่ยงและสถานที่ปฏิบัติงาน'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $elec = isset($_POST['loto_electrical']) ? 1 : 0;
        $pneu = isset($_POST['loto_pneumatic']) ? 1 : 0;
        $hydr = isset($_POST['loto_hydraulic']) ? 1 : 0;
        $chem = isset($_POST['loto_chemical']) ? 1 : 0;

        // หา repair_id จากเลขใบสั่งงาน (เช่น EN-2612-013) ถ้าระบุ
        $repairId = null;
        if ($repairRef !== '') {
            $s = $pdo->prepare("SELECT id FROM repair WHERE work_order_no = ? OR CONCAT('WO-', id) = ? LIMIT 1");
            $s->execute([$repairRef, $repairRef]);
            $repairId = $s->fetchColumn();
        }

        $pNo = 'WP-' . date('Ym') . '-' . str_pad(mt_rand(1, 999), 3, '0', STR_PAD_LEFT);
        $userId = $_SESSION['user_id'] ?? null;

        $stmt = $pdo->prepare("
            INSERT INTO work_permits (
                permit_no, repair_id, permit_type, location, requested_by,
                loto_electrical, loto_pneumatic, loto_hydraulic, loto_chemical,
                safety_signature, status, valid_from, valid_until, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', NOW(), DATE_ADD(NOW(), INTERVAL 8 HOUR), NOW())
        ");
        $stmt->execute([
            $pNo, $repairId, $pType, $location, $userId,
            $elec, $pneu, $hydr, $chem, $safetySig
        ]);
        echo json_encode(['status' => 'success', 'code' => 201, 'message' => "สร้างใบอนุญาต $pNo สำเร็จ", 'data' => ['permit_no' => $pNo, 'id' => $pdo->lastInsertId()]], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($resource === 'work-orders') {
        $data = $pdo->query("SELECT r.*, a.name AS asset_name, u.full_name AS assigned_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id ORDER BY r.id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'assets') {
        // join ข้อมูลจริง: วันที่ PM ครั้งล่าสุดจากตาราง pm_am
        $data = $pdo->query(
            "SELECT a.*, (SELECT MAX(due_date) FROM pm_am WHERE asset_id = a.id AND status = 'completed') AS last_pm
             FROM asset_registry a ORDER BY a.id ASC"
        )->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'inventory') {
        $data = $pdo->query("SELECT * FROM spare_parts ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'pm-plans') {
        // join ผู้รับผิดชอบ (assigned_to) และชื่อเครื่องจักร — ข้อมูลจริง
        $data = $pdo->query(
            "SELECT p.*, u.full_name AS assigned_to_name, a.name AS asset_name, a.code AS asset_code
             FROM pm_am p
             LEFT JOIN users u ON p.assigned_to = u.id
             LEFT JOIN asset_registry a ON p.asset_id = a.id
             ORDER BY p.id DESC"
        )->fetchAll(PDO::FETCH_ASSOC);
        attachWorkTeams($data, 'pm_am');
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
    } elseif ($resource === 'low-stock') {
        // อะไหล่ที่คงเหลือ <= จุดสั่งซื้อ (min_stock) — ข้อมูลจริงจากตาราง spare_parts
        $data = $pdo->query(
            "SELECT id, code, name, unit, stock_qty, reserved_qty, min_stock, location, unit_price
             FROM spare_parts
             WHERE min_stock > 0 AND stock_qty <= min_stock
             ORDER BY (stock_qty / min_stock) ASC
             LIMIT 10"
        )->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($data), 'data' => $data], JSON_UNESCAPED_UNICODE);
    } elseif ($resource === 'work-permits') {
        // join ผู้ยื่น (requested_by) และเจ้าหน้าที่ความปลอดภัย (safety_officer_id) — ข้อมูลจริง
        $data = $pdo->query(
            "SELECT wp.*, u.full_name AS requester_name, s.full_name AS safety_officer_name
             FROM work_permits wp
             LEFT JOIN users u ON wp.requested_by = u.id
             LEFT JOIN users s ON wp.safety_officer_id = s.id
             ORDER BY wp.id DESC"
        )->fetchAll(PDO::FETCH_ASSOC);
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
