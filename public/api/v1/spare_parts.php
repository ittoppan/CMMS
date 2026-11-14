<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
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
            $sageCategory = isset($_GET['sage_category']) ? trim((string)$_GET['sage_category']) : '';
            $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
            $stockStatus = isset($_GET['stock_status']) ? trim((string)$_GET['stock_status']) : '';
            $limitParam = $_GET['limit'] ?? null;
            $pageParam = $_GET['page'] ?? null;
            $offsetParam = $_GET['offset'] ?? null;
            $paginate = ($limitParam !== null || $pageParam !== null || $offsetParam !== null);

            if ($id) {
                $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id WHERE s.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
                break;
            }

            $baseWhere = [];
            $baseParams = [];
            if ($sageCategory !== '' && strtolower($sageCategory) !== 'all') {
                $baseWhere[] = 's.sage_category = ?';
                $baseParams[] = $sageCategory;
            }
            if ($q !== '') {
                $baseWhere[] = '(s.code LIKE ? OR s.name LIKE ? OR s.sage_item_no LIKE ? OR s.category LIKE ? OR s.location LIKE ?)';
                $like = '%' . $q . '%';
                array_push($baseParams, $like, $like, $like, $like, $like);
            }
            $baseWhereSql = $baseWhere ? ('WHERE ' . implode(' AND ', $baseWhere)) : '';
            $baseSql = 'FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id ' . $baseWhereSql;

            $stockExpr = 'COALESCE(s.stock_qty, 0)';
            $minExpr = 'COALESCE(s.min_stock, 0)';
            $where = $baseWhere;
            $params = $baseParams;
            if ($stockStatus === 'out') {
                $where[] = $stockExpr . ' <= 0';
            } elseif ($stockStatus === 'low') {
                $where[] = $stockExpr . ' > 0 AND ' . $stockExpr . ' <= ' . $minExpr;
            } elseif ($stockStatus === 'ok') {
                $where[] = $stockExpr . ' > ' . $minExpr;
            }
            $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
            $listSql = 'FROM spare_parts s LEFT JOIN suppliers sup ON s.supplier_id = sup.id ' . $whereSql;

            $summarySql = "SELECT
                COUNT(*) AS total_items,
                SUM(CASE WHEN $stockExpr <= 0 THEN 1 ELSE 0 END) AS out_count,
                SUM(CASE WHEN $stockExpr > 0 AND $stockExpr <= $minExpr THEN 1 ELSE 0 END) AS low_count,
                SUM(CASE WHEN $stockExpr > $minExpr THEN 1 ELSE 0 END) AS ok_count,
                COALESCE(SUM($stockExpr * COALESCE(s.unit_price, 0)), 0) AS total_value
                " . $baseSql;
            $sumStmt = $pdo->prepare($summarySql);
            $sumStmt->execute($baseParams);
            $summaryRow = $sumStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $summary = [
                'total_items' => (int)($summaryRow['total_items'] ?? 0),
                'low_count' => (int)($summaryRow['low_count'] ?? 0),
                'out_count' => (int)($summaryRow['out_count'] ?? 0),
                'ok_count' => (int)($summaryRow['ok_count'] ?? 0),
                'total_value' => (float)($summaryRow['total_value'] ?? 0),
            ];

            if ($paginate) {
                $limit = max(1, min(200, (int)($limitParam ?? 50)));
                if ($pageParam !== null) {
                    $page = max(1, (int)$pageParam);
                    $offset = ($page - 1) * $limit;
                } else {
                    $offset = max(0, (int)($offsetParam ?? 0));
                    $page = (int)floor($offset / $limit) + 1;
                }
                $countStmt = $pdo->prepare('SELECT COUNT(*) ' . $listSql);
                $countStmt->execute($params);
                $total = (int)$countStmt->fetchColumn();
                $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name ' . $listSql . ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?');
                $stmt->execute(array_merge($params, [$limit, $offset]));
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['items' => $items, 'total' => $total, 'limit' => $limit, 'offset' => $offset, 'page' => $page, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
            } else {
                $stmt = $pdo->prepare('SELECT s.*, sup.name AS supplier_name ' . $listSql . ' ORDER BY s.created_at DESC');
                $stmt->execute($params);
                // คืน array เดิมเพื่อความเข้ากันได้ย้อนหลังกับ consumer ที่คาดหวังรูปแบบเดิม
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
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
    api_safe_catch($e);
}
