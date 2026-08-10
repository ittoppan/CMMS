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
            $assetId = isset($_GET['asset_id']) ? (int)$_GET['asset_id'] : 1;
            $sql = "SELECT b.*, s.code as part_code, s.name as part_name, s.unit, s.stock_qty, s.image_url, s.location as part_location 
                    FROM machine_bom b 
                    LEFT JOIN spare_parts s ON b.spare_part_id = s.id 
                    WHERE b.asset_id = ? 
                    ORDER BY b.id DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$assetId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['status' => 'success', 'data' => $rows]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $assetId = isset($data['asset_id']) ? (int)$data['asset_id'] : 1;
            $sparePartId = isset($data['spare_part_id']) ? (int)$data['spare_part_id'] : 1;
            $defaultQty = isset($data['default_qty']) ? (float)$data['default_qty'] : 1.0;
            $remarks = isset($data['remarks']) ? trim($data['remarks']) : 'อะไหล่ประกอบชิ้นส่วน';

            $stmt = $pdo->prepare("INSERT INTO machine_bom (asset_id, spare_part_id, default_qty, remarks) VALUES (?, ?, ?, ?)");
            $stmt->execute([$assetId, $sparePartId, $defaultQty, $remarks]);

            echo json_encode([
                'status' => 'success',
                'message' => 'เพิ่มชิ้นส่วนเข้า BOM Tree สำเร็จแล้ว',
                'id' => (int)$pdo->lastInsertId()
            ]);
            break;

        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare("DELETE FROM machine_bom WHERE id = ?");
            $stmt->execute([$id]);
            echo json_encode(['status' => 'success', 'message' => 'Deleted']);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
