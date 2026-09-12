<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
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

    // ตัวช่วย: ตรวจหาหรือสร้าง cache row สำหรับ Sage item (Item Code เป็น reference key)
    $resolvePart = function (PDO $pdo, array $item): array {
        // 1) ใช้ spare_part_id ที่ส่งมา
        if (!empty($item['spare_part_id'])) {
            $partId = (int)$item['spare_part_id'];
            $stmt = $pdo->prepare("SELECT id, code, name, unit, stock_qty, reserved_qty, unit_price, sage_item_no, last_synced_at FROM spare_parts WHERE id = ?");
            $stmt->execute([$partId]);
            $part = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($part) return ['part' => $part, 'created' => false];
            throw new Exception("Part ID $partId not found");
        }
        // 2) หาจาก cache ตาม Item Code
        $code = trim((string)($item['item_code'] ?? $item['sage_item_code'] ?? ''));
        if ($code === '') throw new Exception("Missing item_code or spare_part_id");
        $stmt = $pdo->prepare("SELECT id, code, name, unit, stock_qty, reserved_qty, unit_price, sage_item_no, last_synced_at
                               FROM spare_parts WHERE sage_item_no = ? OR code = ? LIMIT 1");
        $stmt->execute([$code, $code]);
        $part = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($part) return ['part' => $part, 'created' => false];

        // 3) ยังไม่มีใน cache → ดึง Item Master จาก Sage 300 แล้วสร้าง cache placeholder (mirror อ่านอย่างเดียว)
        $sage = Sage300Service::getItemMaster($code);
        if (!$sage) throw new Exception("ไม่พบ Item Code '$code' ใน Sage 300 และไม่มีในแคช");
        $s = $sage[0];
        $ins = $pdo->prepare("INSERT INTO spare_parts (code, name, unit, category, sage_category, location, stock_qty, reserved_qty, min_stock, max_stock, unit_price, sage_item_no, sage_sync_status, last_synced_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 'placeholder', NOW())");
        $ins->execute([
            $s['item_no'], $s['description'], $s['unit'] ?: 'PCS',
            $s['category'] ?? '', $s['category'] ?? '', $s['location'] ?? '',
            $s['qty_on_hand'], $s['avg_cost'], $s['item_no'],
        ]);
        $partId = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare("SELECT id, code, name, unit, stock_qty, reserved_qty, unit_price, sage_item_no, last_synced_at FROM spare_parts WHERE id = ?");
        $stmt->execute([$partId]);
        return ['part' => $stmt->fetch(PDO::FETCH_ASSOC), 'created' => true];
    };

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

            if ($id) {
                $stmt = $pdo->prepare("
                    SELECT sir.*, u.full_name AS created_by_name, u2.full_name AS approved_by_name
                    FROM spare_issue_requests sir
                    LEFT JOIN users u ON sir.created_by = u.id
                    LEFT JOIN users u2 ON sir.approved_by = u2.id
                    WHERE sir.id = ?
                ");
                $stmt->execute([$id]);
                $request = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$request) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

                $stmt = $pdo->prepare("SELECT siri.*, sp.stock_qty, sp.reserved_qty, sp.last_synced_at
                                       FROM spare_issue_request_items siri
                                       LEFT JOIN spare_parts sp ON sp.id = siri.spare_part_id
                                       WHERE siri.request_id = ?");
                $stmt->execute([$id]);
                $request['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode($request);
            } else {
                $status = isset($_GET['status']) ? trim((string)$_GET['status']) : '';
                $workOrderId = isset($_GET['work_order_id']) ? (int)$_GET['work_order_id'] : 0;

                $where = [];
                $params = [];
                if ($status !== '') {
                    $where[] = "sir.status = ?";
                    $params[] = $status;
                }
                if ($workOrderId > 0) {
                    $where[] = "sir.work_order_id = ?";
                    $params[] = $workOrderId;
                }
                $whereClause = $where ? "WHERE " . implode(" AND ", $where) : "";
                $sql = "
                    SELECT sir.*, u.full_name AS created_by_name, u2.full_name AS approved_by_name,
                           (SELECT COUNT(*) FROM spare_issue_request_items s WHERE s.request_id = sir.id) AS item_count
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
            requireRole(canRequest(), 'ช่างเท่านั้นที่ขอเบิกอะไหล่ได้ (ยกเว้น Viewer)');
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            $workOrderId = isset($data['work_order_id']) ? (int)$data['work_order_id'] : 0;
            $workOrderNo = trim((string)($data['work_order_no'] ?? ''));
            $technicianId = isset($data['technician_id']) ? (int)$data['technician_id'] : (int)($_SESSION['user']['id'] ?? $_SESSION['user_id'] ?? 0);
            $technicianName = trim((string)($data['technician_name'] ?? ($_SESSION['user']['full_name'] ?? $_SESSION['full_name'] ?? '')));
            $requestType = trim((string)($data['request_type'] ?? 'withdrawal'));
            $items = $data['items'] ?? [];

            if (!$workOrderId || empty($items)) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing required fields: work_order_id, items']);
                exit;
            }

            // ตรวจ Item (ไม่หักสต็อก — Sage เป็นเจ้าของสต็อก; ตรวจแค่เตือนถ้าสต็อกแคชไม่พอ)
            $resolved = [];
            $stockChecks = [];
            foreach ($items as $item) {
                $r = $resolvePart($pdo, $item);
                $part = $r['part'];
                $qty = (float)($item['qty'] ?? 0);
                if ($qty <= 0) { http_response_code(400); echo json_encode(['error' => "จำนวนต้องมากกว่า 0 สำหรับ {$part['name']}"]); exit; }
                $available = (float)$part['stock_qty'] - (float)$part['reserved_qty'];
                $unitPrice = (float)($item['unit_price'] ?? $part['unit_price'] ?? 0);
                $resolved[] = [
                    'spare_part_id' => (int)$part['id'],
                    'part_code'     => $part['sage_item_no'] ?: $part['code'],
                    'part_name'     => $part['name'],
                    'unit'          => $part['unit'] ?: 'pcs',
                    'qty'           => $qty,
                    'unit_price'    => $unitPrice,
                    'stock_qty_at_request' => (float)$part['stock_qty'],
                ];
                $stockChecks[] = [
                    'item_code'  => $part['sage_item_no'] ?: $part['code'],
                    'available'  => max(0, $available),
                    'requested'  => $qty,
                    'sufficient' => $qty <= $available + 0.0001,
                    'warning'    => $qty > $available + 0.0001 ? 'สต็อกแคช (Last known from Sage 300) ไม่เพียงพอ — ยังส่งคำขอได้ เพื่อให้ผู้บังคับบัญชาอนุมัติ' : null,
                ];
            }

            $totalQty = array_sum(array_column($resolved, 'qty'));
            $totalValue = array_sum(array_map(fn($i) => $i['qty'] * $i['unit_price'], $resolved));

            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO spare_issue_requests (
                        work_order_id, work_order_no, technician_id, technician_name,
                        request_type, status, requested_by, total_qty, total_value, note, created_by
                    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $workOrderId,
                    $workOrderNo,
                    $technicianId ?: null,
                    $technicianName ?: null,
                    $requestType,
                    (int)($_SESSION['user']['id'] ?? $_SESSION['user_id'] ?? 1),
                    $totalQty,
                    $totalValue,
                    $data['note'] ?? null,
                    $_SESSION['user']['id'] ?? 1,
                ]);
                $requestId = (int)$pdo->lastInsertId();

                $stmt = $pdo->prepare("INSERT INTO spare_issue_request_items (
                    request_id, spare_part_id, part_code, part_name, qty, unit, unit_price, stock_qty_at_request
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                foreach ($resolved as $i) {
                    $stmt->execute([$requestId, $i['spare_part_id'], $i['part_code'], $i['part_name'], $i['qty'], $i['unit'], $i['unit_price'], $i['stock_qty_at_request']]);
                }
                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'request_id' => $requestId,
                    'status' => 'pending',
                    'message' => 'สร้างคำขอเบิกอะไหล่ (Pending Issue) เรียบร้อย — รอคลังจ่ายจริงใน Sage 300',
                    'stock_checks' => $stockChecks,
                    'total_value' => $totalValue,
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            break;

        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            $data = json_decode(file_get_contents('php://input'), true) ?: [];
            $action = trim((string)($data['action'] ?? ''));

            $stmt = $pdo->prepare("SELECT * FROM spare_issue_requests WHERE id = ?");
            $stmt->execute([$id]);
            $req = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$req) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            $stmt = $pdo->prepare("SELECT siri.*, sp.stock_qty, sp.reserved_qty FROM spare_issue_request_items siri LEFT JOIN spare_parts sp ON sp.id = siri.spare_part_id WHERE siri.request_id = ?");
            $stmt->execute([$id]);
            $reqItems = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $uid = (int)($_SESSION['user']['id'] ?? $_SESSION['user_id'] ?? 0);

            if ($action === 'approve') {
                requireRole(canApprove(), 'เฉพาะหัวหน้างาน/ผู้จัดการที่อนุมัติคำขอเบิก');
                $pdo->prepare("UPDATE spare_issue_requests SET status = 'Approved', approved_by = ?, approved_at = NOW() WHERE id = ?")->execute([$uid, $id]);
                Sage300Service::logAudit($uid, 'Spare_Issue', 'Approve_Request', null, "Approved request #$id");
                echo json_encode(['success' => true, 'status' => 'Approved', 'message' => 'อนุมัติคำขอเบิกเรียบร้อย (รอคลังจ่าย)']);
                exit;
            }
            if ($action === 'reject') {
                requireRole(canApprove(), 'เฉพาะหัวหน้างาน/ผู้จัดการที่ปฏิเสธคำขอเบิก');
                $reason = trim((string)($data['reason'] ?? ''));
                if ($reason === '') { http_response_code(400); echo json_encode(['error' => 'กรุณาระบุเหตุผลการปฏิเสธ']); exit; }
                $pdo->prepare("UPDATE spare_issue_requests SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = NOW() WHERE id = ?")->execute([$reason, $uid, $id]);
                echo json_encode(['success' => true, 'status' => 'rejected', 'message' => 'ปฏิเสธคำขอเบิกเรียบร้อย']);
                exit;
            }
            if ($action === 'issue') {
                requireRole(canIssue(), 'เฉพาะคลัง/หัวหน้างานที่จ่ายของได้');
                // ตรวจสต็อกแคช (Last known from Sage) — ป้องกันการจ่ายเกิน
                $overrides = [];
                foreach (($data['items'] ?? []) as $it) { $overrides[(int)$it['item_id']] = (float)$it['issued_qty']; }
                foreach ($reqItems as $it) {
                    $qty = $overrides[$it['id']] ?? (float)$it['qty'];
                    $available = (float)$it['stock_qty'] - (float)$it['reserved_qty'];
                    if ($qty > $available + 0.0001) {
                        http_response_code(400);
                        echo json_encode(['error' => "สต็อกแคช (Last known from Sage 300) ไม่เพียงพอสำหรับ {$it['part_code']}: ต้องใช้ {$qty}, เหลือ {$available} — ให้คลังตรวจสอบ/ซิงก์ Sage ก่อน"]);
                        exit;
                    }
                }
                $pdo->beginTransaction();
                try {
                    foreach ($reqItems as $it) {
                        $qty = $overrides[$it['id']] ?? (float)$it['qty'];
                        $pdo->prepare("UPDATE spare_issue_request_items SET issued_qty = ?, issued_at = NOW(), issued_by = ? WHERE id = ?")->execute([$qty, $uid, $it['id']]);
                    }
                    $pdo->prepare("UPDATE spare_issue_requests SET status = 'Issued', issued_by = ?, updated_at = NOW() WHERE id = ?")->execute([$uid, $id]);
                    if (!empty($data['sage_doc_no'])) {
                        $pdo->prepare("UPDATE spare_issue_requests SET sage_doc_no = ? WHERE id = ?")->execute([trim((string)$data['sage_doc_no']), $id]);
                    }
                    // บันทึก maintenance usage cost (ไม่หักสต็อก CMMS)
                    Sage300Service::postInventoryIssue((int)$req['work_order_id'], array_map(fn($it) => [
                        'spare_part_id' => (int)$it['spare_part_id'],
                        'qty_issued' => (float)($overrides[$it['id']] ?? (float)$it['qty']),
                        'unit_cost' => (float)$it['unit_price'],
                    ], $reqItems), $uid);
                    $pdo->commit();
                } catch (Exception $e) { $pdo->rollBack(); throw $e; }
                echo json_encode(['success' => true, 'status' => 'Issued', 'message' => 'จ่ายของแล้ว (Pending Sage) — สต็อกตัดจริงที่ Sage 300 แล้วบันทึกเลขที่เอกสาร']);
                exit;
            }
            if ($action === 'return') {
                $qty = (float)($data['qty'] ?? 0);
                $allItems = [];
                $fullyReturned = true;
                foreach ($reqItems as $it) {
                    $issued = (float)$it['issued_qty'];
                    $returned = (float)$it['returned_qty'];
                    $maxReturn = max(0, $issued - $returned);
                    $retQty = $qty > 0 ? min($maxReturn, $qty) : $maxReturn;
                    if ($retQty <= 0) { continue; }
                    $pdo->prepare("UPDATE spare_issue_request_items SET returned_qty = returned_qty + ?, returned_at = NOW(), returned_by = ? WHERE id = ?")->execute([$retQty, $uid, $it['id']]);
                    $allItems[] = [
                        'spare_part_id' => (int)$it['spare_part_id'],
                        'qty_returned' => $retQty,
                        'unit_cost' => (float)$it['unit_price'],
                    ];
                    if ($maxReturn - $retQty > 0.0001) $fullyReturned = false;
                }
                if ($fullyReturned) {
                    $pdo->prepare("UPDATE spare_issue_requests SET status = 'Returned', updated_at = NOW() WHERE id = ?")->execute([$id]);
                }
                Sage300Service::postInventoryReturn((int)$req['work_order_id'], $allItems, $uid);
                echo json_encode(['success' => true, 'status' => $fullyReturned ? 'Returned' : 'Issued', 'message' => 'บันทึกการคืนอะไหล่เรียบร้อย']);
                exit;
            }

            http_response_code(400);
            echo json_encode(['error' => 'Unknown action']);
            break;

        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            $stmt = $pdo->prepare("SELECT status FROM spare_issue_requests WHERE id = ?");
            $stmt->execute([$id]);
            $status = $stmt->fetchColumn();

            if (!$status) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            if (!in_array(strtolower($status), ['pending', 'requested', 'rejected'], true)) {
                http_response_code(400);
                echo json_encode(['error' => 'ลบได้เฉพาะคำขอที่ยังอยู่ในสถานะ pending/rejected']);
                exit;
            }

            $pdo->prepare("DELETE FROM spare_issue_request_items WHERE request_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM spare_issue_requests WHERE id = ?")->execute([$id]);

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