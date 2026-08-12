<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/config/settings_defaults.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

// คืนค่าเริ่มต้นของทุกคีย์ (สำหรับปุ่มรีเซ็ตค่าเริ่มต้นใน UI)
if (isset($_GET['defaults'])) {
    echo json_encode(settingsDefaultValues(), JSON_UNESCAPED_UNICODE);
    exit;
}

// คืนประวัติการแก้ไข (audit log) — ล่าสุด 50 รายการ
if (isset($_GET['audit'])) {
    $limit = max(1, min(200, (int)($_GET['audit'] ?? 50)));
    $rows = getDb()->query("SELECT id, user_id, user_name, setting_key, old_value, new_value, created_at FROM settings_audit_log ORDER BY id DESC LIMIT $limit")->fetchAll();
    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
    exit;
}

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
                $stmt = $pdo->prepare('SELECT * FROM settings WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT * FROM settings ORDER BY setting_group, setting_key');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['setting_key', 'setting_value', 'setting_group', 'description'];
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO settings (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['setting_key', 'setting_value', 'setting_group', 'description'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $values[] = $id;
            // Audit log: อ่านค่าก่อนแก้เฉพาะ setting_value เท่านั้น
            $oldRow = $pdo->prepare('SELECT setting_key, setting_value FROM settings WHERE id = ?');
            $oldRow->execute([$id]);
            $old = $oldRow->fetch();
            $stmt = $pdo->prepare("UPDATE settings SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);

            // บันทึกประวัติการแก้ไข (เฉพาะตอน setting_value เปลี่ยนจริง)
            if (isset($data['setting_value']) && $old && $old['setting_value'] !== (string)$data['setting_value']) {
                try {
                    $pdo->prepare("INSERT INTO settings_audit_log (user_id, user_name, setting_key, old_value, new_value) VALUES (?, ?, ?, ?, ?)")
                        ->execute([
                            (int)($_SESSION['user_id'] ?? 0) ?: null,
                            mb_substr((string)($_SESSION['user_name'] ?? ''), 0, 150) ?: null,
                            mb_substr((string)$old['setting_key'], 0, 100),
                            $old['setting_value'],
                            (string)$data['setting_value'],
                        ]);
                } catch (Exception $e) { /* audit ไม่ควรทำให้บันทึกหลักล้ม */ }
            }
            echo json_encode(['success' => true]);
            break;
        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
