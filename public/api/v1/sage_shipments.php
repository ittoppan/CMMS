<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';

if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

function hasColumn(PDO $pdo, string $table, string $col): bool {
    static $cache = [];
    $key = $table . '.' . $col;
    if (isset($cache[$key])) return $cache[$key];
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$col]);
        $cache[$key] = (bool)$stmt->fetch();
    } catch (Exception $e) {
        $cache[$key] = false;
    }
    return $cache[$key];
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $status = isset($_GET['status']) ? trim((string)$_GET['status']) : '';
            $reqStatus = isset($_GET['status_filter']) ? trim((string)$_GET['status_filter']) : '';
            $workOrderId = isset($_GET['work_order_id']) ? (int)$_GET['work_order_id'] : 0;
            $requestId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            $showItems = isset($_GET['items']) && $_GET['items'] === '1';
            $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 0;
            $perPage = isset($_GET['per_page']) ? min(200, max(1, (int)$_GET['per_page'])) : 200;
            $paginate = $requestId === 0 && $page > 0;

            // Detect schema variants
            $hasCreatedBy = hasColumn($pdo, 'spare_issue_requests', 'created_by');
            $hasRequestedBy = hasColumn($pdo, 'spare_issue_requests', 'requested_by');
            $hasApprovedBy = hasColumn($pdo, 'spare_issue_requests', 'approved_by');
            $hasTechnicianName = hasColumn($pdo, 'spare_issue_requests', 'technician_name');
            $hasWorkOrderNo = hasColumn($pdo, 'spare_issue_requests', 'work_order_no');
            $hasTotalQty = hasColumn($pdo, 'spare_issue_requests', 'total_qty');
            $hasSageStatus = hasColumn($pdo, 'spare_issue_requests', 'sage_shipment_status');
            $hasSageShipmentTable = true;
            try { $pdo->query("SELECT 1 FROM spare_issue_sage_shipments LIMIT 1"); } catch (Exception $e) { $hasSageShipmentTable = false; }

            if ($requestId > 0) {
                // Build main query with fallbacks
                $selectExtras = [];
                $joins = [];
                // created_by_name fallback to requested_by
                if ($hasCreatedBy) {
                    $joins[] = "LEFT JOIN users u ON sir.created_by = u.id";
                    $selectExtras[] = "u.full_name AS created_by_name";
                } elseif ($hasRequestedBy) {
                    $joins[] = "LEFT JOIN users u ON sir.requested_by = u.id";
                    $selectExtras[] = "u.full_name AS created_by_name";
                } else {
                    $selectExtras[] = "NULL AS created_by_name";
                }
                if ($hasApprovedBy) {
                    $joins[] = "LEFT JOIN users u2 ON sir.approved_by = u2.id";
                    $selectExtras[] = "u2.full_name AS approved_by_name";
                } else {
                    $selectExtras[] = "NULL AS approved_by_name";
                }
                if (hasColumn($pdo, 'spare_issue_requests', 'sage_shipment_by')) {
                    $joins[] = "LEFT JOIN users u3 ON sir.sage_shipment_by = u3.id";
                    $selectExtras[] = "u3.full_name AS sage_by_name";
                } else {
                    $selectExtras[] = "NULL AS sage_by_name";
                }
                // work_order_no: use column if exists else join repair
                if ($hasWorkOrderNo) {
                    $selectExtras[] = "sir.work_order_no";
                } else {
                    $joins[] = "LEFT JOIN repair r ON sir.work_order_id = r.id";
                    $selectExtras[] = "r.work_order_no";
                }
                // technician_name: use column if exists else use created/requested user name
                if ($hasTechnicianName) {
                    $selectExtras[] = "sir.technician_name";
                } else {
                    // fallback: will resolve via created_by/requested_by name later
                    $selectExtras[] = "COALESCE(u.full_name, '') AS technician_name";
                }
                // sage_shipment fields: if not exists, provide defaults
                if (!$hasSageStatus) {
                    $selectExtras[] = "'pending' AS sage_shipment_status";
                    $selectExtras[] = "NULL AS sage_shipment_no";
                    $selectExtras[] = "NULL AS sage_shipment_date";
                    $selectExtras[] = "NULL AS sage_shipment_by";
                    $selectExtras[] = "NULL AS sage_shipment_note";
                    $selectExtras[] = "NULL AS sage_updated_at";
                }

                $extraSelect = $selectExtras ? ", " . implode(", ", $selectExtras) : "";
                $joinSql = $joins ? " " . implode(" ", $joins) : "";
                $sql = "SELECT sir.* $extraSelect FROM spare_issue_requests sir $joinSql WHERE sir.id = ?";
                $stmt = $pdo->prepare($sql);
                $stmt->execute([$requestId]);
                $request = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$request) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found'], JSON_UNESCAPED_UNICODE);
                    exit;
                }

                // Normalize missing keys for frontend
                if (!isset($request['sage_shipment_status']) || $request['sage_shipment_status'] === null) $request['sage_shipment_status'] = 'pending';
                if (!isset($request['work_order_no']) || $request['work_order_no'] === null) $request['work_order_no'] = $request['work_order_no'] ?? null;
                if (!isset($request['technician_name'])) $request['technician_name'] = null;

                // Fetch items with sage data if table exists
                if ($hasSageShipmentTable) {
                    $stmt = $pdo->prepare("
                        SELECT siri.id, siri.request_id, siri.spare_part_id, siri.part_code, siri.part_name,
                               siri.qty, siri.unit, siri.unit_price, siri.stock_qty_at_request,
                               COALESCE(sis.sage_qty, 0) AS sage_qty,
                               sis.sage_shipment_no, sis.sage_line_no,
                               COALESCE(sis.status, 'pending') AS sage_item_status,
                               sis.sage_shipment_date, sis.sage_note, sis.sage_shipment_by,
                               u.full_name AS sage_by_name,
                               (siri.qty - COALESCE(sis.sage_qty, 0)) AS remaining,
                               CASE WHEN COALESCE(sis.sage_qty, 0) >= siri.qty THEN 1 ELSE 0 END AS is_fully_shipped
                        FROM spare_issue_request_items siri
                        LEFT JOIN spare_issue_sage_shipments sis ON siri.id = sis.item_id
                        LEFT JOIN users u ON sis.sage_shipment_by = u.id
                        WHERE siri.request_id = ?
                        ORDER BY siri.id
                    ");
                    $stmt->execute([$requestId]);
                    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } else {
                    $stmt = $pdo->prepare("SELECT siri.*, 0 AS sage_qty, NULL AS sage_shipment_no, NULL AS sage_line_no, 'pending' AS sage_item_status, NULL AS sage_shipment_date, NULL AS sage_note, NULL AS sage_shipment_by, NULL AS sage_by_name, siri.qty AS remaining, 0 AS is_fully_shipped FROM spare_issue_request_items siri WHERE siri.request_id = ? ORDER BY siri.id");
                    $stmt->execute([$requestId]);
                    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
                foreach ($items as &$it) {
                    $it['qty'] = (float)$it['qty'];
                    $it['sage_qty'] = (float)($it['sage_qty'] ?? 0);
                    $it['remaining'] = (float)($it['remaining'] ?? 0);
                    $it['is_fully_shipped'] = !empty($it['is_fully_shipped']);
                }
                unset($it);
                $request['items'] = $items;
                $totalSage = 0; $totalQty = 0;
                foreach ($items as $it) { $totalSage += (float)$it['sage_qty']; $totalQty += (float)$it['qty']; }
                $request['total_sage_qty'] = $totalSage;
                // total_qty: prefer sir column if exists else sum
                if ($hasTotalQty && isset($request['total_qty']) && (float)$request['total_qty'] > 0) {
                    $request['total_qty'] = (float)$request['total_qty'];
                } else {
                    $request['total_qty'] = $totalQty;
                }

                echo json_encode($request, JSON_UNESCAPED_UNICODE);
            } else {
                $where = [];
                $params = [];
                if ($status !== '' && in_array($status, ['pending','partial','completed','cancelled'], true) && $hasSageStatus) {
                    $where[] = "sir.sage_shipment_status = ?";
                    $params[] = $status;
                }
                $reqStatuses = ['Requested','Approved','Waiting Issue','Issued','Returned','Cancelled'];
                if ($reqStatus !== '' && in_array($reqStatus, $reqStatuses, true)) {
                    $where[] = "sir.status = ?";
                    $params[] = $reqStatus;
                }
                if ($workOrderId > 0) {
                    $where[] = "sir.work_order_id = ?";
                    $params[] = $workOrderId;
                }
                $whereClause = $where ? "WHERE " . implode(" AND ", $where) : "";

                // Build select extras similar to single
                $selectExtras = [];
                $joins = [];
                if ($hasCreatedBy) {
                    $joins[] = "LEFT JOIN users u ON sir.created_by = u.id";
                    $selectExtras[] = "u.full_name AS created_by_name";
                } elseif ($hasRequestedBy) {
                    $joins[] = "LEFT JOIN users u ON sir.requested_by = u.id";
                    $selectExtras[] = "u.full_name AS created_by_name";
                } else {
                    $selectExtras[] = "NULL AS created_by_name";
                }
                if ($hasApprovedBy) {
                    $joins[] = "LEFT JOIN users u2 ON sir.approved_by = u2.id";
                    $selectExtras[] = "u2.full_name AS approved_by_name";
                } else {
                    $selectExtras[] = "NULL AS approved_by_name";
                }
                if (hasColumn($pdo, 'spare_issue_requests', 'sage_shipment_by')) {
                    $joins[] = "LEFT JOIN users u3 ON sir.sage_shipment_by = u3.id";
                    $selectExtras[] = "u3.full_name AS sage_by_name";
                } else {
                    $selectExtras[] = "NULL AS sage_by_name";
                }
                if (!$hasWorkOrderNo) {
                    $joins[] = "LEFT JOIN repair r ON sir.work_order_id = r.id";
                    $selectExtras[] = "r.work_order_no AS work_order_no";
                }
                if (!$hasTechnicianName) {
                    // technician_name will be resolved via created_by/requested_by join alias u
                    // we already have u.full_name as created_by_name, reuse
                    $selectExtras[] = "COALESCE(u.full_name, '') AS technician_name";
                }
                // agg for totals
                $aggJoin = "";
                if ($hasSageShipmentTable) {
                    $aggJoin = "LEFT JOIN (
                        SELECT siri.request_id,
                               SUM(COALESCE(sis.sage_qty, 0)) AS total_sage_qty,
                               SUM(siri.qty) AS sum_qty,
                               SUM(CASE WHEN COALESCE(sis.status,'pending') != 'completed' THEN 1 ELSE 0 END) AS pending_count
                        FROM spare_issue_request_items siri
                        LEFT JOIN spare_issue_sage_shipments sis ON siri.id = sis.item_id
                        GROUP BY siri.request_id
                    ) agg ON agg.request_id = sir.id";
                    $selectExtras[] = "COALESCE(agg.total_sage_qty, 0) AS total_sage_qty";
                    $selectExtras[] = "COALESCE(agg.sum_qty, 0) AS agg_total_qty";
                    $selectExtras[] = "COALESCE(agg.pending_count, 0) AS pending_items";
                } else {
                    $selectExtras[] = "0 AS total_sage_qty";
                    $selectExtras[] = "0 AS agg_total_qty";
                    $selectExtras[] = "0 AS pending_items";
                }
                if (!$hasSageStatus) {
                    $selectExtras[] = "'pending' AS sage_shipment_status";
                    $selectExtras[] = "NULL AS sage_shipment_no";
                    $selectExtras[] = "NULL AS sage_shipment_date";
                }

                $extraSelect = $selectExtras ? ", " . implode(", ", $selectExtras) : "";
                $joinSql = $joins ? " " . implode(" ", $joins) : "";
                $sql = "SELECT sir.* $extraSelect FROM spare_issue_requests sir $joinSql $aggJoin $whereClause";

                $totalCount = null;
                if ($paginate) {
                    $countSql = "SELECT COUNT(*) FROM spare_issue_requests sir $whereClause";
                    $cstmt = $pdo->prepare($countSql);
                    $cstmt->execute($params);
                    $totalCount = (int)$cstmt->fetchColumn();
                }
                $sql .= " ORDER BY sir.created_at DESC";
                if ($paginate) {
                    $sql .= " LIMIT $perPage OFFSET " . (($page - 1) * $perPage);
                } else {
                    $sql .= " LIMIT 200";
                }

                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $requests = $stmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($requests as &$r) {
                    // total_qty fallback
                    if ($hasTotalQty && isset($r['total_qty']) && (float)$r['total_qty'] > 0) {
                        $r['total_qty'] = (float)$r['total_qty'];
                    } else {
                        $r['total_qty'] = (float)($r['agg_total_qty'] ?? 0);
                    }
                    $r['total_sage_qty'] = (float)($r['total_sage_qty'] ?? 0);
                    $r['pending_items'] = (int)($r['pending_items'] ?? 0);
                    if (!isset($r['sage_shipment_status']) || $r['sage_shipment_status'] === null) $r['sage_shipment_status'] = 'pending';
                    unset($r['agg_total_qty']);
                }
                unset($r);

                if ($showItems) {
                    foreach ($requests as &$r) {
                        if ($hasSageShipmentTable) {
                            $stmt = $pdo->prepare("
                                SELECT siri.id, siri.request_id, siri.spare_part_id, siri.part_code, siri.part_name,
                                       siri.qty, siri.unit, siri.unit_price, siri.stock_qty_at_request,
                                       COALESCE(sis.sage_qty, 0) AS sage_qty,
                                       sis.sage_shipment_no, sis.sage_line_no,
                                       COALESCE(sis.status, 'pending') AS sage_item_status,
                                       sis.sage_shipment_date, sis.sage_note, sis.sage_shipment_by,
                                       u.full_name AS sage_by_name,
                                       (siri.qty - COALESCE(sis.sage_qty, 0)) AS remaining,
                                       CASE WHEN COALESCE(sis.sage_qty, 0) >= siri.qty THEN 1 ELSE 0 END AS is_fully_shipped
                                FROM spare_issue_request_items siri
                                LEFT JOIN spare_issue_sage_shipments sis ON siri.id = sis.item_id
                                LEFT JOIN users u ON sis.sage_shipment_by = u.id
                                WHERE siri.request_id = ?
                                ORDER BY siri.id
                            ");
                            $stmt->execute([$r['id']]);
                            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                        } else {
                            $stmt = $pdo->prepare("SELECT siri.*, 0 AS sage_qty, NULL AS sage_shipment_no, NULL AS sage_line_no, 'pending' AS sage_item_status, NULL AS sage_shipment_date, NULL AS sage_note, NULL AS sage_shipment_by, NULL AS sage_by_name, siri.qty AS remaining, 0 AS is_fully_shipped FROM spare_issue_request_items siri WHERE siri.request_id = ? ORDER BY siri.id");
                            $stmt->execute([$r['id']]);
                            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                        }
                        foreach ($items as &$it) {
                            $it['qty'] = (float)$it['qty'];
                            $it['sage_qty'] = (float)($it['sage_qty'] ?? 0);
                            $it['remaining'] = (float)($it['remaining'] ?? 0);
                            $it['is_fully_shipped'] = !empty($it['is_fully_shipped']);
                        }
                        unset($it);
                        $r['items'] = $items;
                    }
                    unset($r);
                }

                if ($paginate) {
                    echo json_encode([
                        'data'  => $requests,
                        'total' => $totalCount,
                        'page'  => $page,
                        'per_page' => $perPage,
                    ], JSON_UNESCAPED_UNICODE);
                } else {
                    echo json_encode($requests, JSON_UNESCAPED_UNICODE);
                }
            }
            break;

        case 'POST':
            $raw = file_get_contents('php://input');
            $data = json_decode($raw, true);
            if (!is_array($data)) $data = $_POST;
            $action = trim((string)($data['action'] ?? ''));

            if ($action === 'update_sage_status') {
                $requestId = (int)($data['request_id'] ?? 0);
                $sageStatus = trim((string)($data['sage_shipment_status'] ?? ''));
                $sageShipmentNo = trim((string)($data['sage_shipment_no'] ?? ''));
                $sageShipmentDate = isset($data['sage_shipment_date']) && $data['sage_shipment_date'] !== '' ? $data['sage_shipment_date'] : null;
                $sageNote = trim((string)($data['sage_shipment_note'] ?? ''));
                $sageShipmentBy = $_SESSION['user']['id'] ?? null;
                if (!$requestId || $sageStatus === '') {
                    http_response_code(400);
                    echo json_encode(['error' => 'Missing required fields'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $validStatuses = ['pending','partial','completed','cancelled'];
                if (!in_array($sageStatus, $validStatuses, true)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid sage_shipment_status'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                if (!hasColumn($pdo, 'spare_issue_requests', 'sage_shipment_status')) {
                    http_response_code(500);
                    echo json_encode(['error' => 'sage_shipment columns not yet migrated. Run migration.'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $stmt = $pdo->prepare("UPDATE spare_issue_requests SET sage_shipment_status = ?, sage_shipment_no = ?, sage_shipment_date = ?, sage_shipment_note = ?, sage_shipment_by = ?, sage_updated_at = NOW() WHERE id = ?");
                $stmt->execute([$sageStatus, $sageShipmentNo !== '' ? $sageShipmentNo : null, $sageShipmentDate, $sageNote !== '' ? $sageNote : null, $sageShipmentBy, $requestId]);
                echo json_encode(['success' => true, 'message' => 'อัปเดตสถานะ Sage 300 เรียบร้อยแล้ว'], JSON_UNESCAPED_UNICODE);
                break;
            }

            if ($action === 'update_item_sage_status') {
                $itemId = (int)($data['item_id'] ?? 0);
                $sageQty = (float)($data['sage_qty'] ?? 0);
                $sageShipmentNo = trim((string)($data['sage_shipment_no'] ?? ''));
                $sageLineNo = isset($data['sage_line_no']) && $data['sage_line_no'] !== '' ? (int)$data['sage_line_no'] : null;
                $sageStatus = trim((string)($data['status'] ?? 'pending'));
                $sageShipmentDate = isset($data['sage_shipment_date']) && $data['sage_shipment_date'] !== '' ? $data['sage_shipment_date'] : null;
                $sageNote = trim((string)($data['sage_note'] ?? ''));
                $sageBy = $_SESSION['user']['id'] ?? null;
                if (!$itemId) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Missing item_id'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $stmt = $pdo->prepare("SELECT id, request_id, qty FROM spare_issue_request_items WHERE id = ?");
                $stmt->execute([$itemId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Item not found'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $requestId = (int)$row['request_id'];
                $maxQty = (float)$row['qty'];
                if ($sageQty < 0 || $sageQty > $maxQty) {
                    http_response_code(400);
                    echo json_encode(['error' => 'sage_qty must be 0..' . $maxQty], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $validStatuses = ['pending','partial','completed','cancelled'];
                if (!in_array($sageStatus, $validStatuses, true)) {
                    $sageStatus = $sageQty >= $maxQty ? 'completed' : ($sageQty > 0 ? 'partial' : 'pending');
                }
                // Ensure table exists
                try { $pdo->query("SELECT 1 FROM spare_issue_sage_shipments LIMIT 1"); } catch (Exception $e) {
                    http_response_code(500);
                    echo json_encode(['error' => 'spare_issue_sage_shipments table not migrated'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $stmt = $pdo->prepare("SELECT id FROM spare_issue_sage_shipments WHERE item_id = ?");
                $stmt->execute([$itemId]);
                $existing = $stmt->fetchColumn();
                if ($existing) {
                    $stmt = $pdo->prepare("UPDATE spare_issue_sage_shipments SET sage_qty = ?, sage_shipment_no = ?, sage_line_no = ?, status = ?, sage_shipment_date = ?, sage_note = ?, sage_shipment_by = ?, updated_at = NOW() WHERE item_id = ?");
                    $stmt->execute([$sageQty, $sageShipmentNo !== '' ? $sageShipmentNo : null, $sageLineNo, $sageStatus, $sageShipmentDate, $sageNote !== '' ? $sageNote : null, $sageBy, $itemId]);
                } else {
                    $stmt = $pdo->prepare("INSERT INTO spare_issue_sage_shipments (request_id, item_id, sage_qty, sage_shipment_no, sage_line_no, status, sage_shipment_date, sage_shipment_by, sage_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$requestId, $itemId, $sageQty, $sageShipmentNo !== '' ? $sageShipmentNo : null, $sageLineNo, $sageStatus, $sageShipmentDate, $sageBy, $sageNote !== '' ? $sageNote : null]);
                }
                $stmt = $pdo->prepare("SELECT SUM(siri.qty) AS total_qty, SUM(COALESCE(sis.sage_qty, 0)) AS total_sage_qty, SUM(CASE WHEN COALESCE(sis.status,'pending') = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_cnt, COUNT(*) AS item_cnt FROM spare_issue_request_items siri LEFT JOIN spare_issue_sage_shipments sis ON siri.id = sis.item_id WHERE siri.request_id = ?");
                $stmt->execute([$requestId]);
                $agg = $stmt->fetch(PDO::FETCH_ASSOC);
                $totalQty = (float)($agg['total_qty'] ?? 0);
                $totalSageQty = (float)($agg['total_sage_qty'] ?? 0);
                $cancelledCnt = (int)($agg['cancelled_cnt'] ?? 0);
                $itemCnt = (int)($agg['item_cnt'] ?? 0);
                if ($cancelledCnt === $itemCnt && $itemCnt > 0) $newParentStatus = 'cancelled';
                elseif ($totalSageQty == 0) $newParentStatus = 'pending';
                elseif ($totalSageQty >= $totalQty && $totalQty > 0) $newParentStatus = 'completed';
                else $newParentStatus = 'partial';
                $stmt = $pdo->prepare("UPDATE spare_issue_requests SET sage_shipment_status = ?, sage_updated_at = NOW() WHERE id = ?");
                $stmt->execute([$newParentStatus, $requestId]);
                echo json_encode(['success' => true, 'message' => 'อัปเดตรายการ Sage 300 เรียบร้อยแล้ว', 'sage_shipment_status' => $newParentStatus], JSON_UNESCAPED_UNICODE);
                break;
            }

            http_response_code(400);
            echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
