<?php
/**
 * CMMS-TPT Inspection Execute API (มือถือ / หน้างาน) — Phase 13
 *
 *  GET  /api/v1/inspection_execute.php                        -> รายการตรวจของฉัน (role-aware)
 *  GET  /api/v1/inspection_execute.php?schedule=1             -> checklist + draft + results + photos + measurements
 *  POST /api/v1/inspection_execute.php?action=start&schedule=1 -> เริ่มตรวจ (pending -> in_progress, ตั้ง started_at/inspector_id)
 *  POST /api/v1/inspection_execute.php?action=autosave&schedule=1 -> บันทึกร่าง (draft_json) แบบ real-time offline-safe
 *  POST /api/v1/inspection_execute.php?action=photo&schedule=1  -> อัปโหลดรูปหลักฐาน (multipart: file + item_id + caption)
 *  POST /api/v1/inspection_execute.php?action=delete_photo&schedule=1 -> ลบรูป (body { photo_id })
 *
 * การ submit ผล ใช้ inspections.php?action=submit&schedule=N (จบ workflow + สร้าง WO/Request อัตโนมัติ)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

requireLogin(getDb());

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    if ($method === 'GET' && isset($_GET['schedule'])) {
        getChecklist($pdo, (int)$_GET['schedule']);
        exit;
    }

    if ($method === 'GET') {
        mySchedules($pdo);
        exit;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $scheduleId = (int)($_GET['schedule'] ?? 0);
    if (!$scheduleId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing schedule id'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    switch ($action) {
        case 'start':
            actionStart($pdo, $scheduleId);
            break;
        case 'autosave':
            actionAutosave($pdo, $scheduleId);
            break;
        case 'photo':
            actionPhoto($pdo, $scheduleId);
            break;
        case 'delete_photo':
            actionDeletePhoto($pdo, $scheduleId);
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

/** รายการตรวจ — supervisor/admin เห็นทั้งหมด, ช่างเห็นเฉพาะที่มอบหมาย/รับผิดชอบเครื่อง */
function mySchedules(PDO $pdo): void {
    $me = (int)($_SESSION['user_id'] ?? 0);
    $sql = 'SELECT s.*, t.title AS template_title, t.code AS template_code, t.category, t.frequency,
            a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
            u.full_name AS assignee_name
        FROM inspection_schedules s
        LEFT JOIN inspection_templates t ON t.id = s.template_id
        LEFT JOIN asset_registry a ON a.id = s.asset_id
        LEFT JOIN users u ON u.id = s.assignee_id';

    $where = [];
    $args = [];
    $sup = in_array(currentRoleId(), [1, 2, 6, 7], true) || currentRoleId() === 0;
    if (!$sup) {
        $where[] = '(s.assignee_id = ? OR s.inspector_id = ? OR a.responsible_user_id = ?)';
        array_push($args, $me, $me, $me);
    }
    if (isset($_GET['status']) && $_GET['status'] !== '') { $where[] = 's.status = ?'; $args[] = $_GET['status']; }
    if (isset($_GET['overdue'])) { $where[] = 's.due_date < CURDATE() AND s.status IN ("pending","in_progress")'; }
    if (isset($_GET['due_today'])) { $where[] = 's.due_date <= CURDATE() AND s.status IN ("pending","in_progress")'; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY (s.status = "pending") DESC, s.priority ASC, s.due_date ASC, s.id DESC LIMIT 300';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['draft_json'] = !empty($r['draft_json']) ? json_decode($r['draft_json'], true) : null;
    }
    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
}

/** Checklist พร้อมกรอก (รวม draft + ผลเดิม + รูป + ค่าวัด) */
function getChecklist(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('SELECT s.*, t.title AS template_title, t.code AS template_code, t.frequency, t.category,
            a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
            a.department_id AS asset_department_id, a.location_id AS asset_location_id, a.image_path AS asset_image,
            u.full_name AS assignee_name, d.name AS department_name, l.name AS location_name
        FROM inspection_schedules s
        LEFT JOIN inspection_templates t ON t.id = s.template_id
        LEFT JOIN asset_registry a ON a.id = s.asset_id
        LEFT JOIN users u ON u.id = s.assignee_id
        LEFT JOIN departments d ON d.id = s.department_id
        LEFT JOIN locations l ON l.id = s.location_id
        WHERE s.id = ?');
    $stmt->execute([$id]);
    $s = $stmt->fetch();
    if (!$s) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }

    $items = $pdo->prepare('SELECT * FROM inspection_template_items WHERE template_id = ? ORDER BY seq, id');
    $items->execute([$s['template_id']]);
    $s['items'] = $items->fetchAll();

    $res = $pdo->prepare('SELECT * FROM inspection_results WHERE schedule_id = ? ORDER BY seq, id');
    $res->execute([$id]);
    $s['results'] = $res->fetchAll();

    $fa = $pdo->prepare('SELECT r.work_order_no, r.id AS repair_id, r.status AS wo_status, m.request_code, m.id AS maintenance_request_id, m.status AS mr_status
        FROM inspection_fail_actions f
        LEFT JOIN repair r ON r.id = f.repair_id
        LEFT JOIN maintenance_requests m ON m.id = f.maintenance_request_id
        WHERE f.schedule_id = ?');
    $fa->execute([$id]);
    $s['fail_actions'] = $fa->fetchAll();

    $ph = $pdo->prepare('SELECT * FROM inspection_photos WHERE schedule_id = ? ORDER BY id');
    $ph->execute([$id]);
    $s['photos'] = $ph->fetchAll();

    $ms = $pdo->prepare('SELECT * FROM inspection_measurements WHERE schedule_id = ? ORDER BY id');
    $ms->execute([$id]);
    $s['measurements'] = $ms->fetchAll();

    $s['draft_json'] = !empty($s['draft_json']) ? json_decode($s['draft_json'], true) : null;
    $s['can_edit'] = in_array($s['status'], ['pending', 'in_progress'], true);

    echo json_encode($s, JSON_UNESCAPED_UNICODE);
}

/** เริ่มตรวจ */
function actionStart(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('SELECT status FROM inspection_schedules WHERE id = ?');
    $stmt->execute([$id]);
    $status = $stmt->fetchColumn();
    if ($status === false) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }
    if ($status === 'completed') { http_response_code(409); echo json_encode(['error' => 'รอบตรวจนี้บันทึกผลแล้ว']); exit; }

    $me = (int)($_SESSION['user_id'] ?? 0) ?: null;
    $upd = $pdo->prepare('UPDATE inspection_schedules
        SET status = "in_progress", started_at = COALESCE(started_at, NOW()),
            inspector_id = COALESCE(inspector_id, ?)
        WHERE id = ?');
    $upd->execute([$me, $id]);
    echo json_encode(['success' => true, 'status' => 'in_progress', 'started_at' => date('Y-m-d H:i:s')]);
}

/** บันทึกร่างอัตโนมัติ (offline-safe — เก็บ localStorage ฝั่ง client ด้วย) */
function actionAutosave(PDO $pdo, int $id): void {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?? [];
    if (!array_key_exists('draft', $data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing draft'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $stmt = $pdo->prepare('SELECT status FROM inspection_schedules WHERE id = ?');
    $stmt->execute([$id]);
    $status = $stmt->fetchColumn();
    if ($status === false) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }
    if ($status === 'completed') { http_response_code(409); echo json_encode(['error' => 'รอบตรวจเสร็จแล้ว']); exit; }

    $me = (int)($_SESSION['user_id'] ?? 0) ?: null;
    $draftJson = json_encode($data['draft'], JSON_UNESCAPED_UNICODE);
    $newStatus = ($status === 'pending') ? 'in_progress' : $status;
    $upd = $pdo->prepare('UPDATE inspection_schedules
        SET status = ?, draft_json = ?, started_at = COALESCE(started_at, NOW()),
            inspector_id = COALESCE(inspector_id, ?)
        WHERE id = ?');
    $upd->execute([$newStatus, $draftJson, $me, $id]);
    echo json_encode([
        'success' => true,
        'status' => $newStatus,
        'saved_at' => date('Y-m-d H:i:s'),
        'size' => strlen($draftJson),
    ]);
}

/** อัปโหลดรูปหลักฐาน (multipart: file + item_id + caption) */
function actionPhoto(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('SELECT id FROM inspection_schedules WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Schedule not found']); exit; }

    if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing file (multipart field "file")'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $mimeExtMap = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    $maxBytes = 6 * 1024 * 1024;

    if ($_FILES['file']['size'] > $maxBytes) {
        http_response_code(413);
        echo json_encode(['error' => 'รูปใหญ่เกิน 6 MB'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $_FILES['file']['tmp_name']);
    finfo_close($finfo);
    if (!isset($mimeExtMap[$mime])) {
        http_response_code(415);
        echo json_encode(['error' => 'ต้องเป็นไฟล์รูป png/jpg/gif/webp'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $binary = file_get_contents($_FILES['file']['tmp_name']);
    $img = @imagecreatefromstring($binary);
    if ($img === false) {
        http_response_code(415);
        echo json_encode(['error' => 'ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    imagedestroy($img);

    $upDir = __DIR__ . '/../../../public/uploads/inspections/';
    if (!is_dir($upDir) && !@mkdir($upDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'ไม่สามารถสร้างโฟลเดอร์ upload ได้'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $ext = $mimeExtMap[$mime];
    $fileName = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    if (!@file_put_contents($upDir . $fileName, $binary)) {
        http_response_code(500);
        echo json_encode(['error' => 'บันทึกไฟล์ไม่สำเร็จ (ตรวจสิทธิ์โฟลเดอร์)'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $itemId = isset($_POST['item_id']) && (int)$_POST['item_id'] > 0 ? (int)$_POST['item_id'] : null;
    $caption = trim((string)($_POST['caption'] ?? '')) ?: null;
    $me = (int)($_SESSION['user_id'] ?? 0) ?: null;

    $ins = $pdo->prepare('INSERT INTO inspection_photos (schedule_id, item_id, file_path, file_name, file_size, mime_type, uploaded_by, caption)
        VALUES (?,?,?,?,?,?,?,?)');
    $ins->execute([$id, $itemId, '/uploads/inspections/' . $fileName, $_FILES['file']['name'], $_FILES['file']['size'], $mime, $me, $caption]);
    $photoId = (int)$pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'photo' => ['id' => $photoId, 'path' => '/uploads/inspections/' . $fileName, 'item_id' => $itemId],
    ], JSON_UNESCAPED_UNICODE);
}

/** ลบรูปหลักฐาน (เฉพาะที่ยังไม่ submit) */
function actionDeletePhoto(PDO $pdo, int $id): void {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $photoId = (int)($data['photo_id'] ?? 0);
    if (!$photoId) { http_response_code(400); echo json_encode(['error' => 'Missing photo_id'], JSON_UNESCAPED_UNICODE); exit; }

    $stmt = $pdo->prepare('SELECT id, file_path FROM inspection_photos WHERE id = ? AND schedule_id = ?');
    $stmt->execute([$photoId, $id]);
    $photo = $stmt->fetch();
    if (!$photo) { http_response_code(404); echo json_encode(['error' => 'Photo not found']); exit; }

    $del = $pdo->prepare('DELETE FROM inspection_photos WHERE id = ?');
    $del->execute([$photoId]);
    $full = __DIR__ . '/../../../public' . $photo['file_path'];
    if (is_file($full)) @unlink($full);

    echo json_encode(['success' => true]);
}