<?php
/**
 * CMMS-TPT User Feedback (Phase 22 §5) — เบา ๆ รีไซส์โครงสร้างเดิม
 *
 * GET  /api/v1/feedback.php?status=<..>   — รายการ feedback (admin=ทั้งหมด, ผู้ใช้=ของตัวเอง)
 * POST /api/v1/feedback.php               — ส่ง feedback ใหม่ (ผู้ที่ล็อกอินทุกคน)
 * PUT  /api/v1/feedback.php               — admin: เปลี่ยน status / assigned_to
 *
 * - ทุก request ต้องล็อกอิน (requireLogin) — CSRF บังคับที่ mutation
 * - admin เท่านั้นที่ดู/แก้ feedback ของทุกคน; ผู้ใช้ทั่วไปเห็นเฉพาะของตัวเอง
 * - ไม่เก็บ secret / ไม่เปิดข้อมูล sensitive
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';

header('Content-Type: application/json; charset=utf-8');
session_start();

$pdo = getDb();
$user = requireLogin($pdo, false); // requireLogin ตรวจ CSRF ให้แล้ว (POST/PUT)
$isAdmin = ((int)($user['role_id'] ?? 0) === 1);

const FB_CATEGORIES = ['bug', 'ux', 'slow', 'missing_function', 'incorrect_data', 'training', 'enhancement', 'other'];
const FB_STATUSES   = ['new', 'triaged', 'in_progress', 'resolved', 'rejected'];
const FB_PRIORITIES = ['low', 'medium', 'high'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $where = [];
    $args  = [];
    if (!$isAdmin) {
        $where[] = 'f.user_id = ?';
        $args[]  = (int)$user['id'];
    }
    $statusFilter = (string)($_GET['status'] ?? '');
    if ($statusFilter !== '' && in_array($statusFilter, FB_STATUSES, true)) {
        $where[] = 'f.status = ?';
        $args[]  = $statusFilter;
    }
    $sql = "SELECT f.id, f.user_name, f.module, f.screen, f.category, f.description, f.priority, f.status,
                   f.assigned_to, f.created_at, f.resolved_at,
                   (SELECT u.full_name FROM users u WHERE u.id = f.assigned_to) AS assigned_name
            FROM feedback f"
         . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
         . ' ORDER BY f.id DESC LIMIT 100';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
    echo json_encode([
        'success' => true,
        'code'    => 'OK',
        'data'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
        'scope'   => $isAdmin ? 'all' : 'own',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) {
        api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง (ต้องเป็น JSON)');
    }
    $category = trim((string)($in['category'] ?? ''));
    $desc = trim((string)($in['description'] ?? ''));
    $module = trim((string)($in['module'] ?? ''));
    $screen = trim((string)($in['screen'] ?? ''));
    $priority = trim((string)($in['priority'] ?? 'medium'));

    if (!in_array($category, FB_CATEGORIES, true)) {
        api_fail(400, 'VALIDATION_ERROR', 'กรุณาเลือกประเภทฟีดแบ็ก');
    }
    if ($desc === '' || mb_strlen($desc) < 5) {
        api_fail(400, 'VALIDATION_ERROR', 'กรุณาอธิบายรายละเอียดอย่างน้อย 5 ตัวอักษร');
    }
    if (!in_array($priority, FB_PRIORITIES, true)) {
        $priority = 'medium';
    }

    $stmt = $pdo->prepare(
        "INSERT INTO feedback (user_id, user_name, module, screen, category, description, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'new')"
    );
    $stmt->execute([
        (int)$user['id'],
        mb_substr((string)($user['full_name'] ?? $_SESSION['user_name'] ?? 'ผู้ใช้'), 0, 150),
        mb_substr($module, 0, 60) ?: null,
        mb_substr($screen, 0, 120) ?: null,
        $category,
        mb_substr($desc, 0, 2000),
        $priority,
    ]);
    $id = (int)$pdo->lastInsertId();
    audit_log($pdo, 'FEEDBACK_CREATE', 'feedback', $id, 'ผู้ใช้ส่ง feedback ('.$category.')', null, ['priority' => $priority], 'info');
    echo json_encode(['success' => true, 'code' => 'OK', 'id' => $id], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PUT') {
    if (!$isAdmin) {
        api_fail(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการ feedback');
    }
    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in) || empty($in['id'])) {
        api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง (ต้องมี id)');
    }
    $id = (int)$in['id'];
    $status = trim((string)($in['status'] ?? ''));
    $assignedTo = isset($in['assigned_to']) && $in['assigned_to'] !== '' && $in['assigned_to'] !== null ? (int)$in['assigned_to'] : null;

    $cur = $pdo->prepare("SELECT status FROM feedback WHERE id = ?");
    $cur->execute([$id]);
    $row = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        api_fail(404, 'NOT_FOUND', 'ไม่พบ feedback นี้');
    }

    $sets = [];
    $args = [];
    if ($status !== '' && in_array($status, FB_STATUSES, true) && $status !== $row['status']) {
        $sets[] = 'status = ?';
        $args[] = $status;
        if ($status === 'resolved') {
            $sets[] = 'resolved_at = NOW()';
        } elseif ($status === 'new' || $status === 'triaged' || $status === 'in_progress') {
            $sets[] = 'resolved_at = NULL';
        }
    }
    if ($assignedTo !== null) {
        $sets[] = 'assigned_to = ?';
        $args[] = $assignedTo;
    }
    if (!$sets) {
        echo json_encode(['success' => true, 'code' => 'NO_CHANGE', 'id' => $id], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $args[] = $id;
    $stmt = $pdo->prepare("UPDATE feedback SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($args);
    audit_log($pdo, 'FEEDBACK_UPDATE', 'feedback', $id, 'Admin ปรับสถานะ feedback', $row['status'], $status ?: null, 'info');
    echo json_encode(['success' => true, 'code' => 'OK', 'id' => $id], JSON_UNESCAPED_UNICODE);
    exit;
}

api_fail(405, 'METHOD_NOT_ALLOWED', 'ไม่รองรับ method นี้');