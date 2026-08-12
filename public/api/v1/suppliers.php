<?php
require_once __DIR__ . '/../../../src/config/db.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM suppliers WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $list = $pdo->query('SELECT * FROM suppliers ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);

                // คะแนน/เมตริกผู้ขาย — คำนวณจากข้อมูลจริง (สต็อก + การเบิกจ่าย)
                $metrics = $pdo->query("
                    SELECT sp.supplier_id,
                           COUNT(*)                                              AS part_count,
                           COALESCE(SUM(sp.stock_qty * sp.unit_price), 0)          AS stock_value,
                           COALESCE(SUM(CASE WHEN sp.min_stock > 0 AND sp.stock_qty <= sp.min_stock THEN 1 ELSE 0 END), 0) AS low_stock_count,
                           COALESCE(SUM(CASE WHEN sp.min_stock > 0 AND sp.stock_qty <= sp.min_stock THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) AS low_stock_rate,
                           COALESCE(SUM(t.quantity), 0)                           AS consumption_qty
                    FROM spare_parts sp
                    LEFT JOIN spare_part_transactions t
                           ON t.spare_part_id = sp.id
                          AND t.type IN ('withdrawal','scrap')
                    WHERE sp.supplier_id IS NOT NULL
                    GROUP BY sp.supplier_id
                ")->fetchAll(PDO::FETCH_ASSOC);
                $byId = [];
                foreach ($metrics as $m) {
                    $byId[(int)$m['supplier_id']] = $m;
                }

                foreach ($list as &$row) {
                    $id = (int)$row['id'];
                    $m = $byId[$id] ?? null;
                    if (!$m) {
                        $row['part_count'] = 0;
                        $row['stock_value'] = 0;
                        $row['low_stock_count'] = 0;
                        $row['low_stock_rate'] = 0;
                        $row['consumption_qty'] = 0;
                        $row['rating'] = 0;
                        continue;
                    }
                    $partCount   = (int)$m['part_count'];
                    $lowRate     = (float)$m['low_stock_rate'];            // 0-100
                    $consumption = (float)$m['consumption_qty'];
                    $row['part_count']      = $partCount;
                    $row['stock_value']     = (float)$m['stock_value'];
                    $row['low_stock_count'] = (int)$m['low_stock_count'];
                    $row['low_stock_rate']  = $lowRate;
                    $row['consumption_qty'] = $consumption;
                    // คะแนน 0-100: สต็อกไม่ขาด 60 คะแนน + มีรายการ/ใช้จริง 40 คะแนน
                    $score = round((100 - $lowRate) * 0.60 + min($partCount, 20) * 2.0 + min($consumption / 10, 8.0));
                    $row['rating'] = (int)max(0, min(100, $score));
                }
                unset($row);
                echo json_encode($list);
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['code', 'name', 'contact_person', 'email', 'phone', 'address', 'tax_id', 'is_active'];
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
            $stmt = $pdo->prepare("INSERT INTO suppliers (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['code', 'name', 'contact_person', 'email', 'phone', 'address', 'tax_id', 'is_active'];
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
            $stmt = $pdo->prepare("UPDATE suppliers SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true, 'message' => 'Updated']);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare('DELETE FROM suppliers WHERE id = ?');
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
