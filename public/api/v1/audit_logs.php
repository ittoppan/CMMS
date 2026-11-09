<?php
/**
 * Audit Log API (Phase 18) — อ่านบันทึกการตรวจสอบ (ดูอย่างเดียว, append-only)
 *
 * GET  /api/v1/audit_logs.php
 *   -> รายการแบบ paginated + filter (ฝั่ง server — ห้ามโหลดทั้งหมด client)
 *      Query: page=1&limit=50 (cap 100), from=YYYY-MM-DD, to=YYYY-MM-DD,
 *             user_id=, action=, resource=, severity=, search=
 *   -> { items: [...], total, page, limit }
 *
 * GET  /api/v1/audit_logs.php?id=123
 *   -> รายละเอียดรายการเดียว (ลองดู drawer)
 *
 * GET  /api/v1/audit_logs.php?filters=1
 *   -> แหล่งข้อมูลสำหรับ combobox: actions[], users[], resources[]
 *
 * สิทธิ์: audit_log:view (Admin/Manager/ASST Manager ตาม PERMISSION_MATRIX)
 * ไม่มี UPDATE/DELETE ใด ๆ — append-only
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    requirePerm($pdo, 'audit_log', 'view', 'คุณไม่มีสิทธิ์เข้าถึงบันทึกตรวจสอบ (เฉพาะผู้ดูแลระบบ/ผู้จัดการ)');

    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET') {
        api_fail(405, 'METHOD_NOT_ALLOWED', 'รองรับเฉพาะการอ่านบันทึกเท่านั้น');
    }

    // ---- filter options สำหรับ UI ----
    if (isset($_GET['filters'])) {
        $actions = $pdo->query("SELECT DISTINCT action FROM audit_logs ORDER BY action")->fetchAll(PDO::FETCH_COLUMN);
        $users = $pdo->query("SELECT DISTINCT user_id, user_name FROM audit_logs WHERE user_id IS NOT NULL ORDER BY user_name")->fetchAll(PDO::FETCH_ASSOC);
        $resources = $pdo->query("SELECT DISTINCT resource_type FROM audit_logs WHERE resource_type <> '' ORDER BY resource_type")->fetchAll(PDO::FETCH_COLUMN);
        $severities = ['info', 'warning', 'security'];
        echo json_encode(['actions' => $actions, 'users' => $users, 'resources' => $resources, 'severities' => $severities], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- รายละเอียดรายการเดียว ----
    if (isset($_GET['id']) && (int)$_GET['id'] > 0) {
        $id = (int)$_GET['id'];
        $stmt = $pdo->prepare("SELECT * FROM audit_logs WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) { api_fail(404, 'NOT_FOUND', 'ไม่พบบันทึกที่ขอ'); }
        // JSON field → object (อ่านง่ายสำหรับการแสดงผล)
        foreach (['old_value', 'new_value'] as $f) {
            if (!empty($row[$f])) {
                $decoded = json_decode($row[$f], true);
                $row[$f] = ($decoded === null && $row[$f] !== 'null') ? $row[$f] : $decoded;
            }
        }
        echo json_encode($row, JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- รายการ + filter + pagination ----
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    $where = [];
    $args = [];

    $from = trim((string)($_GET['from'] ?? ''));
    if ($from !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
        $where[] = "created_at >= ?"; $args[] = $from . ' 00:00:00';
    }
    $to = trim((string)($_GET['to'] ?? ''));
    if ($to !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
        $where[] = "created_at <= ?"; $args[] = $to . ' 23:59:59';
    }
    $userId = (int)($_GET['user_id'] ?? 0);
    if ($userId > 0) { $where[] = 'user_id = ?'; $args[] = $userId; }
    $action = trim((string)($_GET['action'] ?? ''));
    if ($action !== '') { $where[] = 'action = ?'; $args[] = mb_substr($action, 0, 60); }
    $resource = trim((string)($_GET['resource'] ?? ''));
    if ($resource !== '') { $where[] = 'resource_type = ?'; $args[] = mb_substr($resource, 0, 60); }
    $severity = trim((string)($_GET['severity'] ?? ''));
    if (in_array($severity, ['info', 'warning', 'security'], true)) { $where[] = 'severity = ?'; $args[] = $severity; }
    $search = trim((string)($_GET['search'] ?? ''));
    if ($search !== '') {
        $where[] = '(description LIKE ? OR user_name LIKE ? OR action LIKE ? OR resource_type LIKE ?)';
        $like = '%' . mb_substr($search, 0, 100) . '%';
        array_push($args, $like, $like, $like, $like);
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $totalStmt = $pdo->prepare("SELECT COUNT(*) FROM audit_logs" . $whereSql);
    $totalStmt->execute($args);
    $total = (int)$totalStmt->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT id, created_at, user_id, user_name, action, resource_type, resource_id,
                description, severity, ip_address, user_agent, request_id
         FROM audit_logs" . $whereSql . " ORDER BY id DESC LIMIT ? OFFSET ?"
    );
    $stmt->execute([...$args, $limit, $offset]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'items' => $items,
        'total' => $total,
        'page'  => $page,
        'limit' => $limit,
        'pages' => (int)ceil($total / max(1, $limit)),
    ], JSON_UNESCAPED_UNICODE);
    exit;
} catch (Throwable $e) {
    error_log('[audit_logs.php] ' . $e->getMessage());
    api_fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
}