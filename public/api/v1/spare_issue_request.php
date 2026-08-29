<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/services/ApprovalService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';

if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            
            if ($id) {
                // Get request with items
                $stmt = $pdo->prepare("
                    SELECT sir.*, u.full_name AS created_by_name, u2.full_name AS approved_by_name
                    FROM spare_issue_requests sir
                    LEFT JOIN users u ON sir.created_by = u.id
                    LEFT JOIN users u2 ON sir.approved_by = u2.id
                    WHERE sir.id = ?
                ");
                $stmt->execute([$id]);
                $request = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if (!$request) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                    exit;
                }
                
                // Get items
                $stmt = $pdo->prepare("SELECT * FROM spare_issue_request_items WHERE request_id = ?");
                $stmt->execute([$id]);
                $request['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                echo json_encode($request);
            } else {
                // List requests with filters
                $status = isset($_GET['status']) ? $_GET['status'] : '';
                $workOrderId = isset($_GET['work_order_id']) ? (int)$_GET['work_order_id'] : 0;
                
                $where = [];
                $params = [];
                
                if ($status && in_array($status, ['pending', 'approved', 'rejected', 'cancelled'])) {
                    $where[] = "sir.status = ?";
                    $params[] = $status;
                }
                if ($workOrderId > 0) {
                    $where[] = "sir.work_order_id = ?";
                    $params[] = $workOrderId;
                }
                
                $whereClause = $where ? "WHERE " . implode(" AND ", $where) : "";
                $sql = "
                    SELECT sir.*, u.full_name AS created_by_name, u2.full_name AS approved_by_name
                    FROM spare_issue_requests sir
                    LEFT JOIN users u ON sir.created_by = u.id
                    LEFT JOIN users u2 ON sir.approved_by = u2.id
                    $whereClause
                    ORDER BY sir.created_at DESC
                    LIMIT 100
                ";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $requests = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                echo json_encode($requests);
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            
            $workOrderId = isset($data['work_order_id']) ? (int)$data['work_order_id'] : 0;
            $workOrderNo = trim((string)($data['work_order_no'] ?? ''));
            $technicianId = isset($data['technician_id']) ? (int)$data['technician_id'] : 0;
            $technicianName = trim((string)($data['technician_name'] ?? ''));
            $requestType = trim((string)($data['request_type'] ?? 'withdrawal'));
            $items = $data['items'] ?? [];
            
            if (!$workOrderId || !$technicianId || !$technicianName || empty($items)) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing required fields: work_order_id, technician_id, technician_name, items']);
                exit;
            }
            
            // Validate items have stock
            $partIds = array_column($items, 'spare_part_id');
            $placeholders = rtrim(str_repeat('?,', count($partIds)), ',');
            $stmt = $pdo->prepare("SELECT id, code, name, stock_qty FROM spare_parts WHERE id IN ($placeholders)");
            $stmt->execute($partIds);
            $parts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $partsById = [];
            foreach ($parts as $p) {
                $partsById[$p['id']] = $p;
            }
            
            foreach ($items as $item) {
                $partId = (int)$item['spare_part_id'];
                $qty = (float)$item['qty'];
                
                if (!isset($partsById[$partId])) {
                    http_response_code(400);
                    echo json_encode(['error' => "Part ID $partId not found"]);
                    exit;
                }
                
                if ($qty > (float)$partsById[$partId]['stock_qty']) {
                    http_response_code(400);
                    echo json_encode(['error' => "Insufficient stock for {$partsById[$partId]['code']}: need $qty, available {$partsById[$partId]['stock_qty']}"]);
                    exit;
                }
            }
            
            // Create request
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO spare_issue_requests (
                        work_order_id, work_order_no, technician_id, technician_name,
                        request_type, status, total_qty, total_value, note, created_by
                    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
                ");
                $stmt->execute([
                    $workOrderId,
                    $workOrderNo,
                    $technicianId,
                    $technicianName,
                    $requestType,
                    $_SESSION['user']['full_name'] ?? 'System',
                    $_SESSION['user']['id'] ?? 1,
                ]);
                $requestId = (int)$pdo->lastInsertId();
                
                $totalQty = 0;
                $totalValue = 0;
                
                foreach ($items as $item) {
                    $partId = (int)$item['spare_part_id'];
                    $qty = (float)$item['qty'];
                    $unitPrice = (float)($item['unit_price'] ?? 0);
                    $stockQty = (float)$item['stock_qty_at_request'];
                    
                    $stmt = $pdo->prepare("
                        INSERT INTO spare_issue_request_items (
                            request_id, spare_part_id, part_code, part_name,
                            qty, unit, unit_price, stock_qty_at_request
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ");
                    $stmt->execute([
                        $requestId,
                        $partId,
                        $item['part_code'],
                        $item['part_name'],
                        $qty,
                        $item['unit'] ?? 'pcs',
                        $unitPrice,
                        $stockQty,
                    ]);
                    
                    $totalQty += $qty;
                    $totalValue += $qty * $unitPrice;
                }
                
                // Update totals
                $stmt = $pdo->prepare("UPDATE spare_issue_requests SET total_qty = ?, total_value = ? WHERE id = ?");
                $stmt->execute([$totalQty, $totalValue, $requestId]);
                
                $pdo->commit();
                
                echo json_encode([
                    'success' => true,
                    'request_id' => $requestId,
                    'message' => 'คำขอเบิกอะไหล่ถูกสร้างเรียบร้อยแล้ว'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            break;

        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing id']);
                exit;
            }
            
            // Only allow delete if status is pending
            $stmt = $pdo->prepare("SELECT status FROM spare_issue_requests WHERE id = ?");
            $stmt->execute([$id]);
            $status = $stmt->fetchColumn();
            
            if (!$status) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                exit;
            }
            
            if ($status !== 'pending') {
                http_response_code(400);
                echo json_encode(['error' => 'Can only delete pending requests']);
                exit;
            }
            
            // Delete items first (cascade will handle this, but explicit is clearer)
            $stmt = $pdo->prepare("DELETE FROM spare_issue_request_items WHERE request_id = ?");
            $stmt->execute([$id]);
            $stmt = $pdo->prepare("DELETE FROM spare_issue_requests WHERE id = ?");
            $stmt->execute([$id]);
            
            echo json_encode(['success' => true, 'message' => 'Request deleted']);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}