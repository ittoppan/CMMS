<?php
/**
 * stock_take.php — โมดูลนับสต็อกจริง (Stock Take)
 *
 * GET    /api/v1/stock_take.php             -> รายการรอบนับทั้งหมด
 * GET    /api/v1/stock_take.php?id=N        -> รายละเอียดรอบ + รายการ (พร้อมส่วนต่าง)
 * POST   /api/v1/stock_take.php             -> { note? } สร้างรอบใหม่ (code อัตโนมัติ ST-YYYYMMDD-NNN)
 * PUT    /api/v1/stock_take.php?id=N        -> { action: "item"|"complete"|"cancel", ... }
 *          - action=item   : { spare_part_id, counted_qty, note? } อัปเดตจำนวนที่กรอก
 *          - action=complete : ปรับ stock_qty ตามส่วนต่าง + ปิดรอบ (completed)
 *          - action=cancel : ยกเลิกรอบ
 * DELETE /api/v1/stock_take.php?id=N        -> ลบรอบ (เฉพาะ draft)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $userId = (int)$_SESSION['user_id'];

    if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
        enforceCsrf();
    }
    $method = $_SERVER['REQUEST_METHOD'];
    $id = (int)($_GET['id'] ?? 0);

    // ---------- GET: รายการรอบ ----------
    if ($method === 'GET' && !$id) {
        $rows = $pdo->query('
            SELECT st.id, st.code, st.note, st.status, st.created_at, st.completed_at,
                   u.full_name AS created_name,
                   COUNT(sti.id) AS total_items,
                   SUM(sti.counted_qty IS NOT NULL) AS counted_items,
                   SUM(sti.counted_qty IS NOT NULL AND sti.counted_qty <> sti.system_qty) AS diff_items
            FROM stock_take st
            LEFT JOIN users u ON st.created_by = u.id
            LEFT JOIN stock_take_items sti ON sti.stock_take_id = st.id
            GROUP BY st.id
            ORDER BY st.id DESC
        ')->fetchAll();
        echo json_encode(['success' => true, 'data' => $rows], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---------- GET: รายละเอียดรอบ ----------
    if ($method === 'GET' && $id) {
        $st = $pdo->prepare('SELECT * FROM stock_take WHERE id = ?');
        $st->execute([$id]);
        $round = $st->fetch();
        if (!$round) { http_response_code(404); echo json_encode(['error' => 'ไม่พบรอบนับสต็อก']); exit; }

        $items = $pdo->prepare('
            SELECT sti.id, sti.spare_part_id, sti.system_qty, sti.counted_qty, sti.note,
                   sp.code, sp.name, sp.unit, sp.location, sp.unit_price
            FROM stock_take_items sti
            JOIN spare_parts sp ON sti.spare_part_id = sp.id
            WHERE sti.stock_take_id = ?
            ORDER BY sp.code
        ');
        $items->execute([$id]);
        $rows = $items->fetchAll();
        foreach ($rows as &$r) {
            $r['diff'] = ($r['counted_qty'] === null) ? null : (float)$r['counted_qty'] - (float)$r['system_qty'];
        }
        unset($r);
        echo json_encode(['success' => true, 'round' => $round, 'items' => $rows], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---------- POST: สร้างรอบ ----------
    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $note = mb_substr(trim((string)($data['note'] ?? '')), 0, 255);

        // รหัสรอบ: ST-YYYYMMDD-NNN
        $prefix = 'ST-' . date('Ymd') . '-';
        $seq = (int)$pdo->query("SELECT COUNT(*) FROM stock_take WHERE code LIKE '$prefix%'")->fetchColumn() + 1;
        $code = $prefix . str_pad((string)$seq, 3, '0', STR_PAD_LEFT);

        $pdo->prepare('INSERT INTO stock_take (code, note, status, created_by) VALUES (?, ?, \'draft\', ?)')
            ->execute([$code, $note, $userId]);
        $takeId = (int)$pdo->lastInsertId();

        // ใส่รายการอะไหล่ทั้งหมดที่ใช้งาน (มี code/name) ลงรอบ
        $pdo->prepare('
            INSERT INTO stock_take_items (stock_take_id, spare_part_id, system_qty)
            SELECT ?, id, stock_qty FROM spare_parts
            WHERE code != \'\' AND name != \'\'
            ORDER BY code
        ')->execute([$takeId]);

        echo json_encode(['success' => true, 'id' => $takeId, 'code' => $code]);
        exit;
    }

    // ---------- PUT: อัปเดต / ปิดรอบ ----------
    if ($method === 'PUT') {
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = (string)($data['action'] ?? '');

        $round = $pdo->prepare('SELECT * FROM stock_take WHERE id = ?');
        $round->execute([$id]);
        $r = $round->fetch();
        if (!$r) { http_response_code(404); echo json_encode(['error' => 'ไม่พบรอบนับสต็อก']); exit; }

        if ($action === 'item') {
            if ($r['status'] !== 'draft') { http_response_code(400); echo json_encode(['error' => 'รอบนี้ปิดแล้ว ไม่สามารถแก้ไขได้']); exit; }
            $partId = (int)($data['spare_part_id'] ?? 0);
            $qty = isset($data['counted_qty']) && $data['counted_qty'] !== '' && $data['counted_qty'] !== null
                ? (float)$data['counted_qty'] : null;
            $note = mb_substr(trim((string)($data['note'] ?? '')), 0, 255);
            $upd = $pdo->prepare('UPDATE stock_take_items SET counted_qty = ?, note = ?, updated_at = NOW() WHERE stock_take_id = ? AND spare_part_id = ?');
            $upd->execute([$qty, $note, $id, $partId]);
            echo json_encode(['success' => true]);
            exit;
        }

        if ($action === 'complete') {
            if ($r['status'] !== 'draft') { http_response_code(400); echo json_encode(['error' => 'รอบนี้ไม่ใช่ draft']); exit; }
            $pdo->beginTransaction();
            try {
                // ปรับ stock_qty ตามส่วนต่าง (เฉพาะรายการที่นับแล้ว)
                $pdo->exec("
                    UPDATE spare_parts sp
                    JOIN stock_take_items sti ON sti.spare_part_id = sp.id AND sti.stock_take_id = $id
                    SET sp.stock_qty = sti.counted_qty
                    WHERE sti.counted_qty IS NOT NULL AND sti.counted_qty <> sti.system_qty
                ");
                $pdo->prepare("UPDATE stock_take SET status = 'completed', completed_at = NOW(), completed_by = ? WHERE id = ?")
                    ->execute([$userId, $id]);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(500); echo json_encode(['error' => 'ปรับสต็อกไม่สำเร็จ: ' . $e->getMessage()]);
                exit;
            }
            echo json_encode(['success' => true, 'message' => 'ปิดรอบนับสต็อก + ปรับ stock_qty ตามจำนวนจริงเรียบร้อย']);
            exit;
        }

        if ($action === 'cancel') {
            if ($r['status'] === 'completed') { http_response_code(400); echo json_encode(['error' => 'รอบที่ปิดแล้วยกเลิกไม่ได้']); exit; }
            $pdo->prepare("UPDATE stock_take SET status = 'cancelled' WHERE id = ?")->execute([$id]);
            echo json_encode(['success' => true, 'message' => 'ยกเลิกรอบนับสต็อกแล้ว']);
            exit;
        }

        http_response_code(400); echo json_encode(['error' => 'ไม่รู้จัก action (item/complete/cancel)']);
        exit;
    }

    // ---------- DELETE: ลบรอบ (เฉพาะ draft) ----------
    if ($method === 'DELETE') {
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
        $round = $pdo->prepare('SELECT status FROM stock_take WHERE id = ?');
        $round->execute([$id]);
        $status = $round->fetchColumn();
        if ($status === false) { http_response_code(404); echo json_encode(['error' => 'ไม่พบรอบ']); exit; }
        if ($status !== 'draft') { http_response_code(400); echo json_encode(['error' => 'ลบได้เฉพาะรอบที่ยังไม่ปิด (draft)']); exit; }
        $pdo->prepare('DELETE FROM stock_take WHERE id = ?')->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => 'Server Error: ' . $e->getMessage()]);
}
