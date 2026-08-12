<?php
require_once __DIR__ . '/../../../src/config/db.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

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
                $stmt = $pdo->prepare('SELECT p.*, a.name AS asset_name, u.full_name AS assigned_name FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id WHERE p.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT p.*, a.name AS asset_name, u.full_name AS assigned_name FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id ORDER BY p.created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason'];
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO pm_am (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE pm_am SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);

            // 🆕 Auto next-cycle: เมื่อปิดงาน PM (status=completed) → สร้างรอบถัดไปตามความถี่อัตโนมัติ
            $newStatus = $data['status'] ?? null;
            if ($newStatus === 'completed') {
                $parentStmt = $pdo->prepare('SELECT * FROM pm_am WHERE id = ?');
                $parentStmt->execute([$id]);
                $parent = $parentStmt->fetch(PDO::FETCH_ASSOC);
                if ($parent && !empty($parent['frequency_type'])) {
                    $base = $data['last_done_date'] ?? $parent['last_done_date'] ?? date('Y-m-d');
                    $freq = $parent['frequency_type'];
                    $interval = max(1, (int)($parent['frequency_interval'] ?: 1));
                    $nextDue = match ($freq) {
                        'daily'     => date('Y-m-d', strtotime("$base + $interval days")),
                        'weekly'    => date('Y-m-d', strtotime("$base + " . ($interval * 7) . " days")),
                        'monthly'   => date('Y-m-d', strtotime("$base + $interval months")),
                        'quarterly' => date('Y-m-d', strtotime("$base + " . ($interval * 3) . " months")),
                        'yearly'    => date('Y-m-d', strtotime("$base + $interval years")),
                        default     => date('Y-m-d', strtotime("$base + $interval days")), // custom
                    };

                    // Dedup: มีรอบเดียวกัน (เครื่อง+ชื่อ) ที่ยังค้างอยู่แล้วไหม — กันสร้างซ้ำ
                    $dup = $pdo->prepare("SELECT COUNT(*) FROM pm_am WHERE asset_id = ? AND title = ? AND status IN ('pending','in_progress')");
                    $dup->execute([$parent['asset_id'], $parent['title']]);
                    if ((int)$dup->fetchColumn() === 0) {
                        $ins = $pdo->prepare(
                            "INSERT INTO pm_am (asset_id, assigned_to, plan_id, title, description, frequency_type, frequency_interval, due_date, status, department_id, location_id, work_zone_id, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())"
                        );
                        $ins->execute([
                            $parent['asset_id'],
                            $parent['assigned_to'],
                            $parent['plan_id'], // ลิงก์แม่ (ใช้ dedup/ติดตามรอบ)
                            $parent['title'],
                            $parent['description'],
                            $freq,
                            $interval,
                            $nextDue,
                            $parent['department_id'],
                            $parent['location_id'],
                            $parent['work_zone_id'],
                        ]);
                    }
                }
            }

            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare('DELETE FROM pm_am WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            echo json_encode(['success' => true, 'message' => 'Deleted']);
            break;
        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
