<?php
/**
 * CMMS-TPT Spare Issue API — ยอดคงเหลือ / รับคืนซากอะไหล่
 *
 * GET /api/v1/spare_issue.php
 *      (default)                     รายการเบิก-จ่ายทั้งหมด (join repair + spare_parts)
 *      ?part_id=N                    เฉพาะรายการของอะไหล่ชิ้นนี้ (ประวัติคงเหลือใน detail)
 *      ?returned=1                   เฉพาะรายการที่คืนซากแล้ว (qty_returned > 0)
 *      ?pending=1                    เฉพาะรายการที่ยังคืนซากไม่ครบ (qty_issued > qty_returned)
 *
 * POST /api/v1/spare_issue.php  (CSRF ตรวจแล้ว)
 *      { action:"return", id, qty, reason }   -> บันทึกคืนซาก (qty_returned + qty)
 */
require_once __DIR__ . '/../../../src/config/db.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $sql = "SELECT si.id AS item_id, si.request_id, si.spare_part_id,
                       si.qty_requested, si.qty_reserved, si.qty_issued, si.qty_returned, si.unit_cost,
                       si.return_reason, si.returned_at,
                       sp.code AS part_code, sp.name AS part_name, sp.unit, sp.category,
                       r.id AS wo_id, r.work_order_no, r.title AS wo_title,
                       req.status AS request_status, req.remarks, req.created_at AS requested_at,
                       ru.full_name AS returned_by_name
                FROM spare_issue_items si
                LEFT JOIN spare_issue_requests req ON si.request_id = req.id
                LEFT JOIN repair r ON req.work_order_id = r.id
                LEFT JOIN spare_parts sp ON si.spare_part_id = sp.id
                LEFT JOIN users ru ON si.returned_by = ru.id
                WHERE si.qty_issued IS NOT NULL";
        $where = [];
        $args = [];
        if (!empty($_GET['part_id'])) {
            $where[] = 'si.spare_part_id = ?';
            $args[] = (int)$_GET['part_id'];
        }
        if (isset($_GET['returned']) && $_GET['returned'] === '1') {
            $where[] = 'si.qty_returned > 0';
        }
        if (isset($_GET['pending']) && $_GET['pending'] === '1') {
            $where[] = 'si.qty_returned < si.qty_issued';
        }
        if (isset($_GET['request_id'])) {
            $where[] = 'si.request_id = ?';
            $args[] = (int)$_GET['request_id'];
        }
        if ($where) {
            $sql .= ' AND ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY (si.qty_returned < si.qty_issued) DESC, si.id DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($args);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['qty_issued'] = $r['qty_issued'] === null ? 0 : (float)$r['qty_issued'];
            $r['qty_returned'] = $r['qty_returned'] === null ? 0 : (float)$r['qty_returned'];
            $r['remaining'] = round($r['qty_issued'] - $r['qty_returned'], 2);
        }
        unset($r);
        echo json_encode($rows);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        if (($data['action'] ?? '') !== 'return') {
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action']);
            exit;
        }
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

        $qty = isset($data['qty']) ? (float)$data['qty'] : 0;
        $reason = trim((string)($data['reason'] ?? ''));
        if ($qty <= 0) { http_response_code(400); echo json_encode(['error' => 'จำนวนต้องมากกว่า 0']); exit; }
        if ($reason === '') { http_response_code(400); echo json_encode(['error' => 'กรุณาระบุเหตุผลการคืนซาก']); exit; }

        $sel = $pdo->prepare('SELECT qty_issued, qty_returned, return_reason, request_id FROM spare_issue_items WHERE id = ?');
        $sel->execute([$id]);
        $row = $sel->fetch();
        if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

        $issued = (float)$row['qty_issued'];
        $done = (float)($row['qty_returned'] ?? 0);
        $remaining = round($issued - $done, 2);
        if ($remaining <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'รายการนี้คืนซากครบแล้ว (ไม่เหลือจำนวนให้คืน)']);
            exit;
        }
        if ($qty > $remaining + 0.0001) {
            http_response_code(400);
            echo json_encode(['error' => "จำนวนเกินยอดที่เบิกคงเหลือ (เบิก {$issued}, คืนไปแล้ว {$done}, เหลือคืนได้ {$remaining})"]);
            exit;
        }

        $newDone = round($done + $qty, 2);
        $newReason = $row['return_reason'] ? trim($row['return_reason']) . "; {$reason}" : $reason;
        if (strlen($newReason) > 255) { $newReason = substr($newReason, 0, 255); }

        $u = $pdo->prepare('UPDATE spare_issue_items
                SET qty_returned = ?, return_reason = ?, returned_at = NOW(), returned_by = ?
                WHERE id = ?');
        $u->execute([$newDone, $newReason, (int)$_SESSION['user_id'], $id]);

        // ขอสถานะอัปเดตให้ auto ตามสัดส่วนคืนซาก (ถ้าคืนครบแล้ว อัปเดตเป็น 'Returned' ถ้ายังไม่เคย)
        $isFull = $newDone >= $issued - 0.0001;
        if ($isFull && $row['request_id']) {
            $q = $pdo->prepare("UPDATE spare_issue_requests SET status = 'Returned' WHERE id = ? AND status = 'Issued'");
            $q->execute([(int)$row['request_id']]);
        }

        echo json_encode([
            'success' => true,
            'message' => 'บันทึกคืนซากเรียบร้อย' . ($isFull ? ' (ครบตามยอดเบิก)' : ''),
            'qty_returned' => $newDone,
            'remaining' => round($newDone >= $issued ? 0 : $issued - $newDone, 2),
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}