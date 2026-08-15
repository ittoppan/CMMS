<?php
/**
 * form_templates.php — แบบฟอร์มดิจิทัล (ออกแบบด้วย formBuilder, กรอก + พิมพ์ PDF)
 *
 * GET
 *   /api/v1/form_templates.php                → รายการเทมเพลต (ทุกคนที่ล็อกอิน) + submission_count + can_design
 *   /api/v1/form_templates.php?id=5           → เทมเพลตเดียว (schema JSON) + submissions ล่าสุด 20 รายการ
 *
 * POST (ต้อง admin — enforceCsrf ผ่าน requireLogin)
 *   { id?, code, title, rev, description, schema }  → upsert เทมเพลต
 *   { action: "submit", id, data }                  → บันทึกผลการกรอก (ทุกคนที่ล็อกอิน)
 *   { action: "delete_submission", id }             → ลบผลการกรอก (admin)
 *
 * DELETE ?id=5 (admin) → ลบเทมเพลต + ผลการกรอกทั้งหมด
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    $user = requireLogin($pdo); // ต้อง login เสมอ
    $isAdmin = ((int)($user['role_id'] ?? 0) === 1);

    // ---- ตาราง (สร้างอัตโนมัติเหมือน custom_pages) ----
    $pdo->exec("CREATE TABLE IF NOT EXISTS form_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        rev VARCHAR(16) NOT NULL DEFAULT 'REV.00',
        description VARCHAR(500) NOT NULL DEFAULT '',
        `schema` LONGTEXT NOT NULL,
        created_by INT DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_form_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS form_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_id INT NOT NULL,
        data LONGTEXT NOT NULL,
        created_by INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_fs_template (template_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $method = $_SERVER['REQUEST_METHOD'];

    // ---- POST ----
    if ($method === 'POST') {
        enforceCsrf();
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: '', true);
        if (!is_array($body)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'ข้อมูลไม่ถูกต้อง (ต้องเป็น JSON)'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // ---- บันทึกผลการกรอก (ทุกคน) ----
        if (($body['action'] ?? '') === 'submit') {
            $tid = (int)($body['id'] ?? 0);
            if ($tid <= 0) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'ไม่พบ id แบบฟอร์ม'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $exists = $pdo->prepare('SELECT id FROM form_templates WHERE id = ?');
            $exists->execute([$tid]);
            if (!$exists->fetch()) {
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'ไม่พบแบบฟอร์มนี้'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $data = json_encode($body['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE);
            $stmt = $pdo->prepare('INSERT INTO form_submissions (template_id, data, created_by) VALUES (?, ?, ?)');
            $stmt->execute([$tid, $data, (int)$user['id']]);
            echo json_encode([
                'status' => 'success',
                'message' => 'บันทึกผลการกรอกแล้ว',
                'id' => (int)$pdo->lastInsertId(),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // ---- ลบผลการกรอก (admin) ----
        if (($body['action'] ?? '') === 'delete_submission') {
            if (!$isAdmin) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'เฉพาะผู้ดูแลระบบ'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $sid = (int)($body['id'] ?? 0);
            if ($sid <= 0) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'ไม่พบ id'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            $stmt = $pdo->prepare('DELETE FROM form_submissions WHERE id = ?');
            $stmt->execute([$sid]);
            echo json_encode(['status' => 'success', 'message' => 'ลบผลการกรอกแล้ว'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // ---- upsert เทมเพลต (admin) ----
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'เฉพาะผู้ดูแลระบบเท่านั้นที่ออกแบบแบบฟอร์ม'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $code = trim((string)($body['code'] ?? ''));
        $title = trim((string)($body['title'] ?? ''));
        $rev = trim((string)($body['rev'] ?? ''));
        $desc = trim((string)($body['description'] ?? ''));
        $schema = trim((string)($body['schema'] ?? ''));
        $id = (int)($body['id'] ?? 0);

        if ($code === '' || $title === '' || $schema === '') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'กรุณากรอก รหัส / ชื่อ / ฟอร์ม (schema) ให้ครบ'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (strlen($schema) > 500000) {
            http_response_code(413);
            echo json_encode(['status' => 'error', 'message' => 'ฟอร์มใหญ่เกินไป (schema > 500 KB)'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $code = strtoupper(preg_replace('/[^A-Z0-9-]/', '', $code));
        $revClean = $rev !== '' ? (preg_match('/^REV\.\d{2}$/i', $rev) ? strtoupper($rev) : 'REV.' . str_pad((string)(int)$rev, 2, '0', STR_PAD_LEFT)) : 'REV.00';

        if ($id > 0) {
            $stmt = $pdo->prepare('UPDATE form_templates SET code = ?, title = ?, rev = ?, description = ?, `schema` = ? WHERE id = ?');
            $stmt->execute([$code, $title, $revClean, $desc, $schema, $id]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO form_templates (code, title, rev, description, `schema`, created_by) VALUES (?, ?, ?, ?, ?, ?)');
            $stmt->execute([$code, $title, $revClean, $desc, $schema, (int)$user['id']]);
            $id = (int)$pdo->lastInsertId();
        }
        echo json_encode(['status' => 'success', 'message' => 'บันทึกแบบฟอร์มแล้ว', 'id' => $id], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- DELETE (admin) ----
    if ($method === 'DELETE') {
        enforceCsrf();
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'เฉพาะผู้ดูแลระบบ'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'ไม่พบ id'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $pdo->prepare('DELETE FROM form_submissions WHERE template_id = ?')->execute([$id]);
        $stmt = $pdo->prepare('DELETE FROM form_templates WHERE id = ?');
        $stmt->execute([$id]);
        echo json_encode(['status' => 'success', 'message' => 'ลบแบบฟอร์มแล้ว'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---- GET ----
    $id = (int)($_GET['id'] ?? 0);
    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT t.*, u.full_name AS created_name FROM form_templates t LEFT JOIN users u ON t.created_by = u.id WHERE t.id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'ไม่พบแบบฟอร์ม'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $subStmt = $pdo->prepare('SELECT fs.id, fs.data, fs.created_at, u.full_name AS created_name FROM form_submissions fs LEFT JOIN users u ON fs.created_by = u.id WHERE fs.template_id = ? ORDER BY fs.id DESC LIMIT 20');
        $subStmt->execute([$id]);
        echo json_encode([
            'status' => 'success',
            'data' => $row,
            'submissions' => $subStmt->fetchAll(),
            'can_design' => $isAdmin,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $rows = $pdo->query('SELECT t.id, t.code, t.title, t.rev, t.description, t.updated_at, u.full_name AS created_name,
        (SELECT COUNT(*) FROM form_submissions fs WHERE fs.template_id = t.id) AS submission_count
        FROM form_templates t LEFT JOIN users u ON t.created_by = u.id ORDER BY t.code ASC')->fetchAll();
    echo json_encode([
        'status' => 'success',
        'data' => $rows,
        'can_design' => $isAdmin,
    ], JSON_UNESCAPED_UNICODE);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'server error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
