<?php
/**
 * CMMS-TPT Checklist Engine API (ตรวจเช็ครอบ)
 *
 * Templates:
 *   GET  /api/v1/inspections.php                      -> templates list
 *   GET  /api/v1/inspections.php?template=1           -> template + items
 *   POST /api/v1/inspections.php                      -> create template { code,title,category,frequency,description }
 *   PUT  /api/v1/inspections.php?template=1           -> update template meta
 *   DELETE /api/v1/inspections.php?template=1         -> delete template
 *   POST /api/v1/inspections.php?action=item&template=1 -> add item { task,type,standard,min_value,max_value,unit,is_required }
 *   PUT  /api/v1/inspections.php?item=1               -> update item
 *   DELETE /api/v1/inspections.php?item=1             -> delete item
 *
 * Schedules (รอบตรวจ):
 *   GET  /api/v1/inspections.php?schedules=1&status=&asset_id=   -> schedules list
 *   GET  /api/v1/inspections.php?schedule=1           -> schedule + items + results
 *   POST /api/v1/inspections.php?action=schedule      -> create schedule { template_id, asset_id, assignee_id, due_date, period_start, period_end }
 *   POST /api/v1/inspections.php?action=submit&schedule=1 -> submit results { items: [...] }
 *   DELETE /api/v1/inspections.php?schedule=1         -> delete schedule
 *
 * Fail -> สร้างใบแจ้งซ่อม (repair) อัตโนมัติ + บันทึก inspection_fail_actions
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

requireLogin(getDb());

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // ============================================================
    // SCHEDULES (ต้องมาก่อน POST create template เพราะ action ต่างกัน)
    // ============================================================
    if ($method === 'POST' && $action === 'schedule') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($data['template_id']) || empty($data['asset_id'])) {
            http_response_code(400); echo json_encode(['error' => 'template_id และ asset_id จำเป็น']); exit;
        }
        $stmt = $pdo->prepare('INSERT INTO inspection_schedules
            (template_id, asset_id, department_id, location_id, assignee_id, inspector_id, priority, due_date, period_start, period_end, estimated_duration_min, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            (int)$data['template_id'], (int)$data['asset_id'],
            !empty($data['department_id']) ? (int)$data['department_id'] : null,
            !empty($data['location_id']) ? (int)$data['location_id'] : null,
            !empty($data['assignee_id']) ? (int)$data['assignee_id'] : null,
            !empty($data['inspector_id']) ? (int)$data['inspector_id'] : (!empty($data['assignee_id']) ? (int)$data['assignee_id'] : null),
            in_array($data['priority'] ?? '', ['low','normal','high','critical'], true) ? $data['priority'] : 'normal',
            $data['due_date'] ?? null, $data['period_start'] ?? null, $data['period_end'] ?? null,
            !empty($data['estimated_duration_min']) ? (int)$data['estimated_duration_min'] : null,
            'pending',
        ]);
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($method === 'POST' && $action === 'submit') {
        submitSchedule($pdo, (int)($_GET['schedule'] ?? 0));
        exit;
    }

    // ============================================================
    // TEMPLATES
    // ============================================================
    if ($method === 'GET' && isset($_GET['schedules'])) {
        listSchedules($pdo);
        exit;
    }
    if ($method === 'GET' && isset($_GET['schedule'])) {
        getSchedule($pdo, (int)$_GET['schedule']);
        exit;
    }
    if ($method === 'GET' && isset($_GET['template'])) {
        $tpl = $pdo->prepare('SELECT * FROM inspection_templates WHERE id = ?');
        $tpl->execute([(int)$_GET['template']]);
        $t = $tpl->fetch();
        if (!$t) { http_response_code(404); echo json_encode(['error' => 'Template not found']); exit; }
        $it = $pdo->prepare('SELECT * FROM inspection_template_items WHERE template_id = ? ORDER BY seq, id');
        $it->execute([$t['id']]);
        $t['items'] = $it->fetchAll();
        echo json_encode($t);
        exit;
    }
    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT t.*, COUNT(i.id) AS item_count,
            (SELECT COUNT(*) FROM inspection_schedules s WHERE s.template_id = t.id AND s.status IN ("pending","in_progress")) AS open_schedules
            FROM inspection_templates t LEFT JOIN inspection_template_items i ON i.template_id = t.id
            GROUP BY t.id ORDER BY t.updated_at DESC');
        echo json_encode($stmt->fetchAll());
        exit;
    }

    if ($method === 'POST' && $action === 'item') {
        $tplId = (int)($_GET['template'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        if (!$tplId) { http_response_code(400); echo json_encode(['error' => 'Missing template id']); exit; }
        $seq = (int)($data['seq'] ?? 0);
        $itemType = normalizeItemType($data['type'] ?? 'check');
        $stmt = $pdo->prepare('INSERT INTO inspection_template_items
            (template_id, seq, task, type, standard, min_value, max_value, unit, options, photo_required, remark_required, pass_criteria, failure_action, is_required)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $tplId, $seq,
            trim((string)($data['task'] ?? '')),
            $itemType,
            $data['standard'] ?? null,
            isset($data['min_value']) && $data['min_value'] !== '' ? (float)$data['min_value'] : null,
            isset($data['max_value']) && $data['max_value'] !== '' ? (float)$data['max_value'] : null,
            $data['unit'] ?? null,
            !empty($data['options']) ? json_encode(is_array($data['options']) ? $data['options'] : $data['options'], JSON_UNESCAPED_UNICODE) : null,
            isset($data['photo_required']) ? (int)$data['photo_required'] : 0,
            isset($data['remark_required']) ? (int)$data['remark_required'] : 0,
            $data['pass_criteria'] ?? null,
            $data['failure_action'] ?? null,
            isset($data['is_required']) ? (int)$data['is_required'] : 1,
        ]);
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        foreach (['code', 'title'] as $f) {
            if (empty(trim((string)($data[$f] ?? '')))) { http_response_code(400); echo json_encode(['error' => "Missing $f"]); exit; }
        }
        $stmt = $pdo->prepare('INSERT INTO inspection_templates (code, title, category, description, frequency, is_active, created_by)
            VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            strtoupper(trim($data['code'])), trim($data['title']),
            $data['category'] ?? null, $data['description'] ?? null,
            $data['frequency'] ?? 'monthly',
            isset($data['is_active']) ? (int)$data['is_active'] : 1,
            (int)($_SESSION['user_id'] ?? 0) ?: null,
        ]);
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($method === 'PUT' && isset($_GET['item'])) {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = []; $vals = [];
        foreach (['task', 'standard', 'unit', 'pass_criteria', 'failure_action', 'is_required', 'photo_required', 'remark_required'] as $f) {
            if (array_key_exists($f, $data)) { $fields[] = "$f = ?"; $vals[] = $data[$f]; }
        }
        if (array_key_exists('type', $data)) { $fields[] = 'type = ?'; $vals[] = normalizeItemType($data['type']); }
        if (array_key_exists('options', $data)) {
            $fields[] = 'options = ?';
            $vals[] = !empty($data['options']) ? json_encode(is_array($data['options']) ? $data['options'] : $data['options'], JSON_UNESCAPED_UNICODE) : null;
        }
        foreach (['min_value', 'max_value', 'seq'] as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = ?";
                $vals[] = ($data[$f] === '' || $data[$f] === null) ? null : (float)$data[$f];
            }
        }
        if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
        $vals[] = (int)$_GET['item'];
        $stmt = $pdo->prepare('UPDATE inspection_template_items SET ' . implode(',', $fields) . ' WHERE id = ?');
        $stmt->execute($vals);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'PUT') {
        $tplId = (int)($_GET['template'] ?? 0);
        if (!$tplId) { http_response_code(400); echo json_encode(['error' => 'Missing template id']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = []; $vals = [];
        foreach (['code', 'title', 'category', 'description', 'frequency', 'is_active'] as $f) {
            if (array_key_exists($f, $data)) { $fields[] = "$f = ?"; $vals[] = $data[$f]; }
        }
        if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
        $vals[] = $tplId;
        $stmt = $pdo->prepare('UPDATE inspection_templates SET ' . implode(',', $fields) . ' WHERE id = ?');
        $stmt->execute($vals);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE' && isset($_GET['item'])) {
        $stmt = $pdo->prepare('DELETE FROM inspection_template_items WHERE id = ?');
        $stmt->execute([(int)$_GET['item']]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE' && isset($_GET['schedule'])) {
        $stmt = $pdo->prepare('DELETE FROM inspection_schedules WHERE id = ?');
        $stmt->execute([(int)$_GET['schedule']]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $tplId = (int)($_GET['template'] ?? 0);
        if (!$tplId) { http_response_code(400); echo json_encode(['error' => 'Missing template id']); exit; }
        $stmt = $pdo->prepare('DELETE FROM inspection_templates WHERE id = ?');
        $stmt->execute([$tplId]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

// ------------------------------------------------------------
function listSchedules(PDO $pdo): void {
    $sql = 'SELECT s.*, t.title AS template_title, t.code AS template_code, t.category,
            a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
            u.full_name AS assignee_name, cb.full_name AS completed_name
        FROM inspection_schedules s
        LEFT JOIN inspection_templates t ON t.id = s.template_id
        LEFT JOIN asset_registry a ON a.id = s.asset_id
        LEFT JOIN users u ON u.id = s.assignee_id
        LEFT JOIN users cb ON cb.id = s.completed_by';
    $where = []; $args = [];
    if (isset($_GET['status']) && $_GET['status'] !== '') { $where[] = 's.status = ?'; $args[] = $_GET['status']; }
    if (isset($_GET['asset_id']) && (int)$_GET['asset_id'] > 0) { $where[] = 's.asset_id = ?'; $args[] = (int)$_GET['asset_id']; }
    if (isset($_GET['assignee_id']) && (int)$_GET['assignee_id'] > 0) { $where[] = 's.assignee_id = ?'; $args[] = (int)$_GET['assignee_id']; }
    if (isset($_GET['inspector_id']) && (int)$_GET['inspector_id'] > 0) { $where[] = 's.inspector_id = ?'; $args[] = (int)$_GET['inspector_id']; }
    if (isset($_GET['template_id']) && (int)$_GET['template_id'] > 0) { $where[] = 's.template_id = ?'; $args[] = (int)$_GET['template_id']; }
    if (isset($_GET['department_id']) && (int)$_GET['department_id'] > 0) { $where[] = 's.department_id = ?'; $args[] = (int)$_GET['department_id']; }
    if (isset($_GET['location_id']) && (int)$_GET['location_id'] > 0) { $where[] = 's.location_id = ?'; $args[] = (int)$_GET['location_id']; }
    if (isset($_GET['result']) && $_GET['result'] !== '') { $where[] = 's.result = ?'; $args[] = $_GET['result']; }
    if (isset($_GET['date_from']) && $_GET['date_from'] !== '') { $where[] = 's.due_date >= ?'; $args[] = $_GET['date_from']; }
    if (isset($_GET['date_to']) && $_GET['date_to'] !== '') { $where[] = 's.due_date <= ?'; $args[] = $_GET['date_to']; }
    if (isset($_GET['due_today'])) { $where[] = 's.due_date <= CURDATE() AND s.status IN ("pending","in_progress")'; }
    if (isset($_GET['overdue'])) { $where[] = 's.due_date < CURDATE() AND s.status IN ("pending","in_progress")'; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY (s.status = "pending") DESC, s.priority ASC, s.due_date ASC, s.id DESC LIMIT 300';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    echo json_encode($stmt->fetchAll());
}

function getSchedule(PDO $pdo, int $id): void {
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing schedule id']); exit; }
    $stmt = $pdo->prepare('SELECT s.*, t.title AS template_title, t.code AS template_code, t.frequency, t.category,
            a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
            a.department_id AS asset_department_id, a.location_id AS asset_location_id,
            u.full_name AS assignee_name
        FROM inspection_schedules s
        LEFT JOIN inspection_templates t ON t.id = s.template_id
        LEFT JOIN asset_registry a ON a.id = s.asset_id
        LEFT JOIN users u ON u.id = s.assignee_id
        WHERE s.id = ?');
    $stmt->execute([$id]);
    $s = $stmt->fetch();
    if (!$s) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }

    // items: snapshot จาก template
    $items = $pdo->prepare('SELECT * FROM inspection_template_items WHERE template_id = ? ORDER BY seq, id');
    $items->execute([$s['template_id']]);
    $s['items'] = $items->fetchAll();

    // results (ถ้า submit แล้ว)
    $res = $pdo->prepare('SELECT * FROM inspection_results WHERE schedule_id = ? ORDER BY seq, id');
    $res->execute([$id]);
    $s['results'] = $res->fetchAll();

    // งานซ่อม / request ที่สร้างจาก fail
    $fa = $pdo->prepare('SELECT r.work_order_no, r.id AS repair_id, m.request_code, m.id AS maintenance_request_id
        FROM inspection_fail_actions f
        LEFT JOIN repair r ON r.id = f.repair_id
        LEFT JOIN maintenance_requests m ON m.id = f.maintenance_request_id
        WHERE f.schedule_id = ?');
    $fa->execute([$id]);
    $s['fail_actions'] = $fa->fetchAll();

    // รูปถ่ายหลักฐาน
    $ph = $pdo->prepare('SELECT * FROM inspection_photos WHERE schedule_id = ? ORDER BY id');
    $ph->execute([$id]);
    $s['photos'] = $ph->fetchAll();

    // ค่า measurement
    $ms = $pdo->prepare('SELECT * FROM inspection_measurements WHERE schedule_id = ? ORDER BY id');
    $ms->execute([$id]);
    $s['measurements'] = $ms->fetchAll();

    echo json_encode($s);
}

function submitSchedule(PDO $pdo, int $id): void {
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing schedule id']); exit; }
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    if (!isset($data['items']) || !is_array($data['items'])) {
        http_response_code(400); echo json_encode(['error' => 'items จำเป็นต้องเป็น array']); exit;
    }

    $stmt = $pdo->prepare('SELECT * FROM inspection_schedules WHERE id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $s = $stmt->fetch();
    if (!$s) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }
    if ($s['status'] === 'completed') { http_response_code(409); echo json_encode(['error' => 'รอบตรวจนี้บันทึกผลแล้ว'], JSON_UNESCAPED_UNICODE); exit; }

    // Config ของ template items (source of truth สำหรับ required/range/photo/remark)
    $itemCfgStmt = $pdo->prepare('SELECT * FROM inspection_template_items WHERE template_id = ?');
    $itemCfgStmt->execute([$s['template_id']]);
    $itemCfg = [];
    foreach ($itemCfgStmt->fetchAll() as $row) { $itemCfg[(int)$row['id']] = $row; }

    // ลบผลเก่า (กรณี submit ซ้ำบน status ที่ยังไม่ completed)
    $del = $pdo->prepare('DELETE FROM inspection_results WHERE schedule_id = ?');
    $del->execute([$id]);

    $ins = $pdo->prepare('INSERT INTO inspection_results (schedule_id, item_id, seq, task, type, status, value, note, photo_id, measurement_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)');
    $insPhoto = $pdo->prepare('SELECT id FROM inspection_photos WHERE schedule_id = ? AND (item_id = ? OR (item_id IS NULL AND ? = 0)) ORDER BY id LIMIT 1');
    $insMs = $pdo->prepare('INSERT INTO inspection_measurements (schedule_id, item_id, value_numeric, unit, min_value, max_value, passed, recorded_by) VALUES (?,?,?,?,?,?,?,?)');

    $failCount = 0; $warnCount = 0;
    $failItems = [];
    $hasCritical = false;
    $seq = 0;
    $submittedIds = [];

    foreach ($data['items'] as $it) {
        $itemId = !empty($it['item_id']) ? (int)$it['item_id'] : null;
        if ($itemId) $submittedIds[] = $itemId;
        $cfg = $itemId ? ($itemCfg[$itemId] ?? null) : null;
        $type = (string)($it['type'] ?? ($cfg['type'] ?? 'check'));
        $clientStatus = (string)($it['status'] ?? '');
        $value = (string)($it['value'] ?? '');
        $note = (string)($it['note'] ?? '');
        $photoIds = isset($it['photo_ids']) && is_array($it['photo_ids']) ? array_map('intval', $it['photo_ids']) : [];
        $isRequired = ((int)($cfg['is_required'] ?? 1)) === 1;
        $photoRequired = ((int)($cfg['photo_required'] ?? 0)) === 1;
        $remarkRequired = ((int)($cfg['remark_required'] ?? 0)) === 1;
        $minV = isset($cfg['min_value']) && $cfg['min_value'] !== null ? (float)$cfg['min_value'] : null;
        $maxV = isset($cfg['max_value']) && $cfg['max_value'] !== null ? (float)$cfg['max_value'] : null;
        $unit = (string)($cfg['unit'] ?? ($it['unit'] ?? ''));

        $st = 'pass';
        $numval = null;
        $passed = null;

        if ($type === 'numeric' || $type === 'measurement' || $type === 'value') {
            if ($value !== '' && is_numeric($value)) {
                $numval = (float)$value;
                $inRange = true;
                if ($minV !== null && $numval < $minV) $inRange = false;
                if ($maxV !== null && $numval > $maxV) $inRange = false;
                $st = $inRange ? 'pass' : 'fail';
                $passed = $inRange ? 1 : 0;
                if ($st === 'fail') { $failCount++; $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => $value, 'note' => $note]; if (((string)($cfg['failure_action'] ?? '') === 'critical')) $hasCritical = true; }
            } else {
                if ($isRequired) { $st = 'fail'; $failCount++; $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => '', 'note' => 'ไม่ได้กรอกค่า']; }
            }
        } elseif ($type === 'text' || $type === 'date_time') {
            if ($value === '') { if ($isRequired) { $st = 'fail'; $failCount++; $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => '', 'note' => 'ไม่ได้กรอกข้อมูล']; } }
        } else {
            // check / yes_no / pass_fail / dropdown
            if (trim((string)$clientStatus) === '') {
                // ยังไม่ตอบ → ถ้าจำเป็นต้องตอบ ถือว่าไม่ผ่าน (กันข้อมูลปลอม)
                if ($isRequired) {
                    $st = 'fail';
                    $failCount++;
                    $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => '', 'note' => 'ไม่ได้ระบุผล'];
                    if (((string)($cfg['failure_action'] ?? '') === 'critical')) $hasCritical = true;
                }
            } else {
                $st = ($clientStatus === 'fail') ? 'fail' : (($clientStatus === 'warn') ? 'warn' : 'pass');
                if ($st === 'fail') {
                    $failCount++;
                    $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => $value, 'note' => $note];
                    if (((string)($cfg['failure_action'] ?? '') === 'critical')) $hasCritical = true;
                } elseif ($st === 'warn') {
                    $warnCount++;
                }
            }
        }

        // Photo required
        $photoId = null;
        if (!empty($photoIds)) {
            $photoId = $photoIds[0];
        } elseif ($itemId) {
            $insPhoto->execute([$id, $itemId, 0]);
            $photoId = (int)$insPhoto->fetchColumn() ?: null;
        }
        if ($photoRequired && !$photoId) {
            $st = 'fail';
            $failCount++;
            $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => $value, 'note' => 'ขาดรูปหลักฐาน'];
        }

        // Remark required
        if ($remarkRequired && trim($note) === '') {
            $st = 'fail';
            $failCount++;
            $failItems[] = ['item_id' => $itemId, 'task' => (string)($cfg['task'] ?? $it['task'] ?? ''), 'value' => $value, 'note' => 'ต้องระบุหมายเหตุ'];
        }

        // บันทึก measurement (ถ้าเป็นตัวเลข)
        $measurementId = null;
        if ($numval !== null) {
            $insMs->execute([$id, $itemId, $numval, $unit ?: null, $minV, $maxV, $passed, (int)($_SESSION['user_id'] ?? 0) ?: null]);
            $measurementId = (int)$pdo->lastInsertId();
        }

        $ins->execute([
            $id,
            $itemId,
            $seq++,
            (string)($cfg['task'] ?? $it['task'] ?? ''),
            $type,
            $st,
            $value !== '' ? $value : null,
            trim($note) !== '' ? $note : null,
            $photoId ?: null,
            $measurementId,
        ]);
    }

    // กันข้อมูลปลอม: รายการที่จำเป็นต้องตอบแต่ไม่ถูกส่งมา ให้ถือว่าไม่ผ่าน
    $submittedSet = array_flip($submittedIds);
    foreach ($itemCfg as $cfgId => $cfg) {
        if (((int)($cfg['is_required'] ?? 1)) !== 1) continue;
        if (isset($submittedSet[(int)$cfgId])) continue;
        $failCount++;
        $failItems[] = ['item_id' => (int)$cfgId, 'task' => (string)$cfg['task'], 'value' => '', 'note' => 'ไม่ได้ระบุผล'];
        if (((string)($cfg['failure_action'] ?? '') === 'critical')) $hasCritical = true;
        $ins->execute([
            $id,
            (int)$cfgId,
            $seq++,
            (string)$cfg['task'],
            (string)$cfg['type'],
            'fail',
            null,
            'ไม่ได้ระบุผล',
            null,
            null,
        ]);
    }

    $now = date('Y-m-d H:i:s');
    if ($hasCritical) $result = 'critical_fail';
    elseif ($failCount > 0) $result = 'fail';
    elseif ($warnCount > 0) $result = 'pass_with_warning';
    else $result = 'pass';

    $upd = $pdo->prepare('UPDATE inspection_schedules
        SET status = "completed", result = ?, fail_count = ?, completed_by = ?, completed_at = ?, notes = ?
        WHERE id = ?');
    $notes = $data['notes'] ?? ($failCount > 0 ? "พบรายการไม่ผ่าน $failCount รายการ" : 'ผ่านทุกรายการ');
    $upd->execute([$result, $failCount, (int)($_SESSION['user_id'] ?? 0) ?: null, $now, $notes, $id]);

    // Auto-generate รอบถัดไปตามความถี่
    $nextId = autoCreateNextSchedule($pdo, $s);

    // Fail -> สร้างใบแจ้งซ่อม (WO) + maintenance request
    $repairId = null;
    $maintenanceRequestId = null;
    if ($failCount > 0) {
        list($repairId, $maintenanceRequestId) = createFailActions($pdo, $s, $failItems, $failCount, $hasCritical);
    }

    echo json_encode([
        'success' => true,
        'result' => $result,
        'fail_count' => $failCount,
        'warn_count' => $warnCount,
        'repair_id' => $repairId,
        'maintenance_request_id' => $maintenanceRequestId,
        'next_schedule_id' => $nextId,
        'message' => $result === 'pass'
            ? 'บันทึกผลตรวจผ่านทุกรายการ'
            : "บันทึกผลแล้ว ($result) — สร้างงานซ่อมให้แล้ว",
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * สร้าง WO (repair) + maintenance request จากรายการที่ตรวจไม่ผ่าน
 */
function createFailActions(PDO $pdo, array $s, array $failItems, int $failCount, bool $hasCritical): array {
    $asset = $pdo->prepare('SELECT name, code, department_id, location_id FROM asset_registry WHERE id = ?');
    $asset->execute([$s['asset_id']]);
    $a = $asset->fetch() ?: ['name' => '', 'code' => '', 'department_id' => null, 'location_id' => null];
    $tpl = $pdo->prepare('SELECT title FROM inspection_templates WHERE id = ?');
    $tpl->execute([$s['template_id']]);
    $t = $tpl->fetch();

    $descLines = [];
    foreach ($failItems as $f) {
        $line = '- ' . $f['task'];
        if ($f['value'] !== '') $line .= " (ค่า: {$f['value']})";
        if ($f['note'] !== '') $line .= " — {$f['note']}";
        $descLines[] = $line;
    }
    $title = 'ตรวจไม่ผ่าน: ' . ($t['title'] ?? 'เช็คครอบ') . ($a['code'] ? " ({$a['code']})" : '');
    $severity = $hasCritical ? 'critical' : 'high';
    $userId = (int)($_SESSION['user_id'] ?? 0) ?: null;

    // maintenance request (review object สำหรับ supervisor/planner)
    $mrSql = 'INSERT INTO maintenance_requests
        (request_code, asset_id, title, description, priority, status, requested_by, assigned_to, department_id, location_id,
         inspection_schedule_id, finding, severity, photo_path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    $mrc = $pdo->prepare('SELECT CONCAT("INSP-", DATE_FORMAT(NOW(), "%y%m%d"), "-", LPAD(COALESCE(MAX(id),0)+1, 4, "0")) FROM maintenance_requests');
    $mrc->execute();
    $requestCode = $mrc->fetchColumn();
    $mr = $pdo->prepare($mrSql);
    $mr->execute([
        $requestCode, $s['asset_id'], $title, implode("\n", $descLines),
        $severity === 'critical' ? 'critical' : 'high', 'open',
        $userId,
        $s['assignee_id'] ?: null,
        !empty($s['department_id']) ? (int)$s['department_id'] : (!empty($a['department_id']) ? (int)$a['department_id'] : null),
        !empty($s['location_id']) ? (int)$s['location_id'] : (!empty($a['location_id']) ? (int)$a['location_id'] : null),
        (int)$s['id'],
        implode("\n", $descLines),
        $severity,
        null,
    ]);
    $maintenanceRequestId = (int)$pdo->lastInsertId();

    // WO (repair) — ต่อจากของเดิม
    $repair = $pdo->prepare('INSERT INTO repair
        (asset_id, assigned_to, created_by, priority, status, title, description, failure_report)
        VALUES (?,?,?,?,?,?,?,?)');
    $repair->execute([
        $s['asset_id'],
        $s['assignee_id'] ?: null,
        $userId,
        $severity === 'critical' ? 'critical' : 'high',
        'open',
        $title,
        "สร้างอัตโนมัติจากรอบตรวจเช็ค (ตรวจพบ " . count($failItems) . " รายการไม่ผ่าน)\n" . implode("\n", $descLines),
        $descLines ? implode("\n", $descLines) : null,
    ]);
    $repairId = (int)$pdo->lastInsertId();

    $fa = $pdo->prepare('INSERT INTO inspection_fail_actions (schedule_id, repair_id, maintenance_request_id, action, severity, auto_create_wo, created_by) VALUES (?,?,?,?,?,?,?)');
    $fa->execute([(int)$s['id'], $repairId, $maintenanceRequestId, 'create_work_order', $severity, 1, $userId]);

    // แจ้งเตือน LINE/Email
    notifyInspectionFail($pdo, $s, $t['title'] ?? 'เช็คครอบ', $a['code'] ?? '', $failItems, $repairId, $failCount);

    return [$repairId, $maintenanceRequestId];
}

/**
 * สร้างรอบตรวจถัดไปตามความถี่ของ template
 * - คำนวณ due_date ถัดไป (daily/weekly/monthly/quarterly/yearly)
 * - ไม่สร้างซ้ำถ้ามีรอบที่ยังค้างอยู่ (pending/in_progress) ของ template+เครื่องเดิม
 * - one_time = ไม่สร้าง
 */
function autoCreateNextSchedule(PDO $pdo, array $s): ?int {
    $tpl = $pdo->prepare('SELECT frequency FROM inspection_templates WHERE id = ?');
    $tpl->execute([$s['template_id']]);
    $freq = $tpl->fetchColumn();

    $addDays = [
        'daily' => 1, 'weekly' => 7, 'monthly' => 30,
        'quarterly' => 90, 'yearly' => 365,
    ];
    if (!isset($addDays[$freq])) return null; // one_time / unknown

    // ฐาน = ครบกำหนดเดิม (หรือวันที่ทำเสร็จ ถ้าไม่มี due)
    $base = new DateTime($s['due_date'] ?? $s['completed_at'] ?? 'today');
    $nextDue = (clone $base)->modify('+' . $addDays[$freq] . ' days')->format('Y-m-d');

    // เช็คว่ามีรอบค้างของ template+เครื่องนี้อยู่แล้วหรือไม่
    $dup = $pdo->prepare('SELECT id FROM inspection_schedules
        WHERE template_id = ? AND asset_id = ? AND status IN ("pending","in_progress") LIMIT 1');
    $dup->execute([$s['template_id'], $s['asset_id']]);
    if ($dup->fetchColumn()) return null;

    $ins = $pdo->prepare('INSERT INTO inspection_schedules
        (template_id, asset_id, assignee_id, due_date, period_start, period_end, status)
        VALUES (?,?,?,?,?,?,?)');
    $ins->execute([
        $s['template_id'], $s['asset_id'], $s['assignee_id'],
        $nextDue,
        date('Y-m-d', strtotime($s['completed_at'] ?? 'now')),
        $nextDue,
        'pending',
    ]);
    return (int)$pdo->lastInsertId();
}

/**
 * แจ้งเตือนเมื่อตรวจพบรายการไม่ผ่าน
 * - ส่ง LINE Push (Flex) + Email ถึงผู้รับผิดชอบ (assignee)
 * - ส่ง LINE Push ถึงกลุ่ม LINE ช่าง ถ้าตั้งค่า line_maintenance_group_id ไว้
 */
function notifyInspectionFail(PDO $pdo, array $s, string $templateTitle, string $assetCode, array $failItems, int $repairId, int $failCount): void {
    $baseUrl = publicBaseUrl();
    $targetUrl = $baseUrl . '/repair?id=' . $repairId;
    $woNo = '';
    if ($repairId) {
        $wo = $pdo->prepare('SELECT work_order_no FROM repair WHERE id = ?');
        $wo->execute([$repairId]);
        $woNo = (string)$wo->fetchColumn();
    }

    $lines = [];
    foreach ($failItems as $f) {
        $line = '- ' . $f['task'];
        if ($f['value'] !== '') $line .= " (ค่า: {$f['value']})";
        if ($f['note'] !== '') $line .= " — {$f['note']}";
        $lines[] = $line;
    }
    $message = "เครื่องจักร: {$assetCode}\nพบ {$failCount} รายการไม่ผ่าน:\n" . implode("\n", $lines)
        . ($woNo ? "\nงานซ่อมอัตโนมัติ: {$woNo}" : '');

    // 1. ผู้รับผิดชอบตรวจ (LINE + Email ถ้ามี line_user_id / email)
    if (!empty($s['assignee_id'])) {
        sendNotificationToUser(
            (int)$s['assignee_id'],
            '⚠️ ตรวจเช็คไม่ผ่าน: ' . $templateTitle . ($assetCode ? " ({$assetCode})" : ''),
            $message,
            $targetUrl
        );
    }

    // 2. กลุ่ม LINE ช่าง (ถ้าตั้งค่า line_maintenance_group_id ใน settings)
    $groupId = getSettingValue('line_maintenance_group_id', '');
    if (!empty($groupId)) {
        sendLinePushMessage($groupId, '🔧 [ช่าง] ตรวจเช็คไม่ผ่าน: ' . $templateTitle, $message, $targetUrl);
    }
}

/**
 * ทำให้ค่า item type อยู่ใน enum ที่รองรับ (ลบ Hack จาก legacy 'value'/'check')
 */
function normalizeItemType(string $type): string {
    $allowed = ['check', 'value', 'numeric', 'measurement', 'dropdown', 'date_time', 'yes_no', 'pass_fail', 'text'];
    $v = strtolower(trim($type));
    return in_array($v, $allowed, true) ? $v : 'check';
}
