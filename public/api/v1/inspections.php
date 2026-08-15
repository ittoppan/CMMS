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
            (template_id, asset_id, assignee_id, due_date, period_start, period_end, status)
            VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            (int)$data['template_id'], (int)$data['asset_id'],
            !empty($data['assignee_id']) ? (int)$data['assignee_id'] : null,
            $data['due_date'] ?? null, $data['period_start'] ?? null, $data['period_end'] ?? null,
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
        $stmt = $pdo->prepare('INSERT INTO inspection_template_items
            (template_id, seq, task, type, standard, min_value, max_value, unit, is_required)
            VALUES (?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $tplId, $seq,
            trim((string)($data['task'] ?? '')),
            ($data['type'] ?? 'check') === 'value' ? 'value' : 'check',
            $data['standard'] ?? null,
            isset($data['min_value']) && $data['min_value'] !== '' ? (float)$data['min_value'] : null,
            isset($data['max_value']) && $data['max_value'] !== '' ? (float)$data['max_value'] : null,
            $data['unit'] ?? null,
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
        foreach (['task', 'type', 'standard', 'unit', 'is_required'] as $f) {
            if (array_key_exists($f, $data)) { $fields[] = "$f = ?"; $vals[] = $data[$f]; }
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

    // ============================================================
    // SCHEDULES
    // ============================================================
    if ($method === 'POST' && $action === 'schedule') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($data['template_id']) || empty($data['asset_id'])) {
            http_response_code(400); echo json_encode(['error' => 'template_id และ asset_id จำเป็น']); exit;
        }
        $stmt = $pdo->prepare('INSERT INTO inspection_schedules
            (template_id, asset_id, assignee_id, due_date, period_start, period_end, status)
            VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            (int)$data['template_id'], (int)$data['asset_id'],
            !empty($data['assignee_id']) ? (int)$data['assignee_id'] : null,
            $data['due_date'] ?? null, $data['period_start'] ?? null, $data['period_end'] ?? null,
            'pending',
        ]);
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($method === 'POST' && $action === 'submit') {
        submitSchedule($pdo, (int)($_GET['schedule'] ?? 0));
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
            a.name AS asset_name, a.code AS asset_code,
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
    if (isset($_GET['template_id']) && (int)$_GET['template_id'] > 0) { $where[] = 's.template_id = ?'; $args[] = (int)$_GET['template_id']; }
    if (isset($_GET['due_today'])) { $where[] = 's.due_date <= CURDATE() AND s.status IN ("pending","in_progress")'; }
    if (isset($_GET['overdue'])) { $where[] = 's.due_date < CURDATE() AND s.status IN ("pending","in_progress")'; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY (s.status = "pending") DESC, s.due_date ASC, s.id DESC LIMIT 300';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    echo json_encode($stmt->fetchAll());
}

function getSchedule(PDO $pdo, int $id): void {
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing schedule id']); exit; }
    $stmt = $pdo->prepare('SELECT s.*, t.title AS template_title, t.code AS template_code, t.frequency,
            a.name AS asset_name, a.code AS asset_code, u.full_name AS assignee_name
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

    // results ถ้ามี (submit แล้ว)
    $res = $pdo->prepare('SELECT * FROM inspection_results WHERE schedule_id = ? ORDER BY seq, id');
    $res->execute([$id]);
    $s['results'] = $res->fetchAll();

    // งานซ่อมที่สร้างจาก fail
    $fa = $pdo->prepare('SELECT r.work_order_no, r.id AS repair_id FROM inspection_fail_actions f
        LEFT JOIN repair r ON r.id = f.repair_id WHERE f.schedule_id = ?');
    $fa->execute([$id]);
    $s['fail_actions'] = $fa->fetchAll();

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
    if ($s['status'] === 'completed') { http_response_code(409); echo json_encode(['error' => 'รอบตรวจนี้บันทึกผลแล้ว']); exit; }

    // ลบผลเก่า (กรณี submit ซ้ำ)
    $del = $pdo->prepare('DELETE FROM inspection_results WHERE schedule_id = ?');
    $del->execute([$id]);

    $ins = $pdo->prepare('INSERT INTO inspection_results (schedule_id, item_id, seq, task, type, status, value, note)
        VALUES (?,?,?,?,?,?,?,?)');
    $failCount = 0;
    $failItems = [];
    $seq = 0;
    foreach ($data['items'] as $it) {
        $status = ($it['status'] ?? '') === 'fail' ? 'fail' : 'pass';
        if ($status === 'fail') {
            $failCount++;
            $failItems[] = [
                'task' => (string)($it['task'] ?? ''),
                'note' => (string)($it['note'] ?? ''),
                'value' => (string)($it['value'] ?? ''),
            ];
        }
        $ins->execute([
            $id,
            !empty($it['item_id']) ? (int)$it['item_id'] : null,
            $seq++,
            (string)($it['task'] ?? ''),
            ($it['type'] ?? 'check') === 'value' ? 'value' : 'check',
            $status,
            (string)($it['value'] ?? '') ?: null,
            (string)($it['note'] ?? '') ?: null,
        ]);
    }

    $now = date('Y-m-d H:i:s');
    $result = $failCount > 0 ? 'fail' : 'pass';
    $upd = $pdo->prepare('UPDATE inspection_schedules
        SET status = "completed", result = ?, fail_count = ?, completed_by = ?, completed_at = ?, notes = ?
        WHERE id = ?');
    $notes = $data['notes'] ?? ($failCount > 0 ? "พบรายการไม่ผ่าน $failCount รายการ" : 'ผ่านทุกรายการ');
    $upd->execute([$result, $failCount, (int)($_SESSION['user_id'] ?? 0) ?: null, $now, $notes, $id]);

    // Auto-generate รอบถัดไปตามความถี่ (daily/weekly/monthly/quarterly/yearly)
    $nextId = autoCreateNextSchedule($pdo, $s);

    // Fail -> สร้างใบแจ้งซ่อมอัตโนมัติ
    $repairId = null;
    if ($failCount > 0) {
        $asset = $pdo->prepare('SELECT name, code FROM asset_registry WHERE id = ?');
        $asset->execute([$s['asset_id']]);
        $a = $asset->fetch();
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
        $repair = $pdo->prepare('INSERT INTO repair
            (asset_id, assigned_to, created_by, priority, status, title, description, failure_report)
            VALUES (?,?,?,?,?,?,?,?)');
        $repair->execute([
            $s['asset_id'],
            $s['assignee_id'] ?: null,
            (int)($_SESSION['user_id'] ?? 0) ?: null,
            'high',
            'open',
            $title,
            "สร้างอัตโนมัติจากรอบตรวจเช็ค (ตรวจพบ " . count($failItems) . " รายการไม่ผ่าน)\n" . implode("\n", $descLines),
            $descLines ? implode("\n", $descLines) : null,
        ]);
        $repairId = (int)$pdo->lastInsertId();

        $fa = $pdo->prepare('INSERT INTO inspection_fail_actions (schedule_id, repair_id, action) VALUES (?,?,?)');
        $fa->execute([$id, $repairId, 'create_work_order']);

        // แจ้งเตือน LINE/Email: assignee + กลุ่ม LINE ช่าง (ถ้าตั้งค่าไว้)
        notifyInspectionFail($pdo, $s, $t['title'] ?? 'เช็คครอบ', $a['code'] ?? '', $failItems, $repairId, $failCount);
    }

    echo json_encode([
        'success' => true,
        'result' => $result,
        'fail_count' => $failCount,
        'repair_id' => $repairId,
        'next_schedule_id' => $nextId,
        'message' => $failCount > 0
            ? "บันทึกผลแล้ว พบรายการไม่ผ่าน $failCount รายการ — สร้างใบแจ้งซ่อมอัตโนมัติแล้ว"
            : 'บันทึกผลตรวจผ่านทุกรายการ',
    ]);
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
