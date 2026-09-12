<?php
/**
 * checklist_templates.php — REST API สำหรับ Checklist Templates + Items (engine ของ PM Plans)
 *
 * Endpoints:
 *   GET  /api/v1/checklist_templates.php            → รายการ templates (id, code, name, category, is_active, item_count)
 *   GET  /api/v1/checklist_templates.php?id=N       → template + items (sorted by item_order)
 *   POST /api/v1/checklist_templates.php            → สร้าง template
 *   PUT  /api/v1/checklist_templates.php?id=N       → แก้ template meta
 *   DELETE /api/v1/checklist_templates.php?id=N     → ลบ template (ถ้าไม่มี plan ใช้อยู่)
 *   POST /api/v1/checklist_templates.php?action=item&template_id=N    → เพิ่ม item
 *   PUT  /api/v1/checklist_templates.php?action=item&item_id=N        → แก้ item
 *   DELETE /api/v1/checklist_templates.php?action=item&item_id=N      → ลบ item
 *   PUT  /api/v1/checklist_templates.php?action=sort_items&template_id=N → sort ลำดับ [{id,order}]
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
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            // ---- รายการ templates ทั้งหมด ----
            if (!isset($_GET['id'])) {
                $rows = $pdo->query(
                    "SELECT ct.*, (SELECT COUNT(*) FROM checklist_template_items cti WHERE cti.template_id = ct.id) AS item_count
                     FROM checklist_templates ct ORDER BY ct.code ASC"
                )->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'count' => count($rows), 'data' => $rows]);
                exit;
            }

            // ---- รายละเอียด template เดียว + items ----
            $id = (int)$_GET['id'];
            $st = $pdo->prepare('SELECT * FROM checklist_templates WHERE id = ?');
            $st->execute([$id]);
            $tpl = $st->fetch(PDO::FETCH_ASSOC);
            if (!$tpl) { http_response_code(404); echo json_encode(['error' => 'Template not found']); exit; }

            $it = $pdo->prepare('SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY item_order ASC, id ASC');
            $it->execute([$id]);
            $tpl['items'] = $it->fetchAll(PDO::FETCH_ASSOC);

            // ตรวจสอบว่า template นี้ถูกใช้ใน plan ไหนบ้าง (กันลบ)
            $used = $pdo->prepare('SELECT pc.plan_id, p.code, p.name FROM pm_am_plan_checklists pc JOIN pm_am_plans p ON p.id = pc.plan_id WHERE pc.template_id = ?');
            $used->execute([$id]);
            $tpl['used_in_plans'] = $used->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['status' => 'success', 'data' => $tpl]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            // ---- Action: sort items ----
            if (isset($_GET['action']) && $_GET['action'] === 'sort_items') {
                $tid = (int)($_GET['template_id'] ?? 0);
                $items = $data['items'] ?? []; // [{id,order}, ...]
                if (!$tid || !is_array($items)) { http_response_code(400); echo json_encode(['error' => 'Missing template_id or items']); exit; }
                $upd = $pdo->prepare('UPDATE checklist_template_items SET item_order = ? WHERE id = ? AND template_id = ?');
                foreach ($items as $it) {
                    $upd->execute([(int)($it['order'] ?? 0), (int)$it['id'], $tid]);
                }
                echo json_encode(['success' => true]);
                exit;
            }

            // ---- Action: add item ----
            if (isset($_GET['action']) && $_GET['action'] === 'item') {
                $tplId = (int)($_GET['template_id'] ?? 0);
                if (!$tplId) { http_response_code(400); echo json_encode(['error' => 'Missing template_id']); exit; }
                $exists = $pdo->prepare('SELECT id FROM checklist_templates WHERE id = ?');
                $exists->execute([$tplId]);
                if (!$exists->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Template not found']); exit; }
                $desc = trim((string)($data['description'] ?? ''));
                if ($desc === '') { http_response_code(400); echo json_encode(['error' => 'Item description required']); exit; }
                $maxOrder = $pdo->prepare('SELECT COALESCE(MAX(item_order), 0) + 1 FROM checklist_template_items WHERE template_id = ?');
                $maxOrder->execute([$tplId]);
                $order = (int)$maxOrder->fetchColumn();
                $ins = $pdo->prepare(
                    "INSERT INTO checklist_template_items (template_id, item_order, item_type, description, expected_value, tolerance_min, tolerance_max, unit, options, is_required, photo_required)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                $ins->execute([
                    $tplId,
                    $order,
                    $data['item_type'] ?? 'yes_no',
                    $desc,
                    $data['expected_value'] ?? null,
                    isset($data['tolerance_min']) && $data['tolerance_min'] !== '' ? (float)$data['tolerance_min'] : null,
                    isset($data['tolerance_max']) && $data['tolerance_max'] !== '' ? (float)$data['tolerance_max'] : null,
                    $data['unit'] ?? null,
                    isset($data['options']) && is_array($data['options']) ? json_encode($data['options']) : null,
                    isset($data['is_required']) ? (int)$data['is_required'] : 1,
                    isset($data['photo_required']) ? (int)$data['photo_required'] : 0,
                ]);
                echo json_encode(['success' => true, 'item_id' => (int)$pdo->lastInsertId()]);
                exit;
            }

            // ---- CREATE template ----
            $code = trim((string)($data['code'] ?? ''));
            $name = trim((string)($data['name'] ?? ''));
            if ($code === '' || $name === '') { http_response_code(400); echo json_encode(['error' => 'Code and name required']); exit; }
            $cDup = $pdo->prepare('SELECT id FROM checklist_templates WHERE code = ?');
            $cDup->execute([$code]);
            if ($cDup->fetchColumn()) { http_response_code(409); echo json_encode(['error' => 'Template code duplicates']); exit; }
            $ins = $pdo->prepare("INSERT INTO checklist_templates (code, name, category, description, is_active) VALUES (?, ?, ?, ?, ?)");
            $ins->execute([$code, $name, $data['category'] ?? 'pm_am', $data['description'] ?? null, (int)($data['is_active'] ?? 1)]);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;

        case 'PUT':
            // ---- Action: update item ----
            if (isset($_GET['action']) && $_GET['action'] === 'item') {
                $itemId = (int)($_GET['item_id'] ?? 0);
                if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'Missing item_id']); exit; }
                $data = json_decode(file_get_contents('php://input'), true);
                if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
                $allowed = ['item_type', 'description', 'expected_value', 'tolerance_min', 'tolerance_max', 'unit', 'options', 'item_order', 'is_required', 'photo_required'];
                $fields = []; $values = [];
                foreach ($allowed as $col) {
                    if (!array_key_exists($col, $data)) continue;
                    $val = $data[$col];
                    if ($col === 'options') { $fields[] = "$col = ?"; $values[] = is_array($val) ? json_encode($val) : $val; continue; }
                    if (in_array($col, ['is_required','photo_required','item_order'], true)) { $fields[] = "$col = ?"; $values[] = (int)$val; continue; }
                    if (in_array($col, ['tolerance_min','tolerance_max'], true)) { $fields[] = "$col = ?"; $values[] = $val !== '' && $val !== null ? (float)$val : null; continue; }
                    $fields[] = "$col = ?"; $values[] = $val;
                }
                if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No fields to update']); exit; }
                $values[] = $itemId;
                $pdo->prepare("UPDATE checklist_template_items SET " . implode(',', $fields) . " WHERE id = ?")->execute($values);
                echo json_encode(['success' => true]);
                exit;
            }

            // ---- UPDATE template meta ----
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['code', 'name', 'category', 'description', 'is_active'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (!array_key_exists($col, $data)) continue;
                $val = $data[$col];
                if ($col === 'is_active') { $fields[] = "$col = ?"; $values[] = (int)$val; continue; }
                $fields[] = "$col = ?"; $values[] = $val;
            }
            if (!empty($fields)) {
                $values[] = $id;
                $pdo->prepare("UPDATE checklist_templates SET " . implode(',', $fields) . " WHERE id = ?")->execute($values);
            }
            echo json_encode(['success' => true]);
            break;

        case 'DELETE':
            // ---- Delete item ----
            if (isset($_GET['action']) && $_GET['action'] === 'item') {
                $itemId = (int)($_GET['item_id'] ?? 0);
                if (!$itemId) { http_response_code(400); echo json_encode(['error' => 'Missing item_id']); exit; }
                $pdo->prepare('DELETE FROM checklist_template_items WHERE id = ?')->execute([$itemId]);
                echo json_encode(['success' => true]);
                exit;
            }
            // ---- Delete template ----
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $used = $pdo->prepare('SELECT COUNT(*) FROM pm_am_plan_checklists WHERE template_id = ?');
            $used->execute([$id]);
            if ((int)$used->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode(['error' => 'เทมเพลตนี้ถูกใช้งานใน PM Plan อยู่ — ไม่อนุญาตให้ลบ (ปิด is_active แทน)']);
                exit;
            }
            $pdo->prepare('DELETE FROM checklist_template_items WHERE template_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM checklist_templates WHERE id = ?')->execute([$id]);
            echo json_encode(['success' => true]);
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}