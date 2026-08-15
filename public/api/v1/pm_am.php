<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
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
                $single = [$row];
                attachWorkTeams($single, 'pm_am');
                echo json_encode($single[0]);
            } else {
                $stmt = $pdo->query('SELECT p.*, a.name AS asset_name, u.full_name AS assigned_name FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id ORDER BY p.created_at DESC');
                $rows = $stmt->fetchAll();
                attachWorkTeams($rows, 'pm_am');
                echo json_encode($rows);
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason', 'reschedule_to', 'deferral_status', 'deferral_requested_by', 'deferral_requested_at', 'inspector_signature', 'operator_signature', 'operator_name', 'reviewer_signature', 'signed_at'];
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO pm_am (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            $pmNewId = (int)$pdo->lastInsertId();
            // ---- ทีมผู้รับผิดชอบหลายคน (assigned_to = หัวหน้าชุด, team_ids = ทุกคน) ----
            if ((isset($data['team_ids']) && is_array($data['team_ids'])) || !empty($data['assigned_to'])) {
                $teamIds = isset($data['team_ids']) && is_array($data['team_ids']) ? $data['team_ids'] : [];
                $leadId = (int)($data['assigned_to'] ?? 0);
                setWorkAssignees($pdo, 'pm_am', $pmNewId, $teamIds, $leadId, (int)($_SESSION['user_id'] ?? 0) ?: null);
            }
            echo json_encode(['success' => true, 'id' => $pmNewId]);
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            // ช่างกด "รับงาน" — ทำงานก่อนเช็คฟิลด์อื่น (ส่งมาแค่ assignee_accept ตัวเดียวก็ได้)
            $accepted = false;
            if (!empty($data['assignee_accept'])) {
                $cu = currentUser($pdo);
                if ($cu && $cu['id']) {
                    acceptWorkAssignment($pdo, 'pm_am', $id, (int)$cu['id']);
                    $accepted = true;
                }
            }
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason', 'reschedule_to', 'deferral_status', 'deferral_requested_by', 'deferral_requested_at', 'inspector_signature', 'operator_signature', 'operator_name', 'reviewer_signature', 'signed_at'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) {
                if ($accepted) { echo json_encode(['success' => true, 'accepted' => true]); exit; }
                http_response_code(400); echo json_encode(['error' => 'No data']); exit;
            }
            $values[] = $id;
            $qOld = $pdo->prepare('SELECT assigned_to FROM pm_am WHERE id = ?');
            $qOld->execute([$id]);
            $oldAssignedTo = (int)($qOld->fetchColumn() ?: 0);
            $stmt = $pdo->prepare("UPDATE pm_am SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            // ---- ทีมผู้รับผิดชอบหลายคน ----
            if (isset($data['team_ids']) && is_array($data['team_ids'])) {
                // ส่งรายการทีมเต็ม → แทนที่ทั้งหมด
                $teamIds = $data['team_ids'];
                $leadId = (int)($data['assigned_to'] ?? $oldAssignedTo);
                setWorkAssignees($pdo, 'pm_am', $id, $teamIds, $leadId, (int)($_SESSION['user_id'] ?? 0) ?: null);
            } elseif (isset($data['assigned_to']) && (int)$data['assigned_to'] !== $oldAssignedTo) {
                // เปลี่ยนหัวหน้าชุดเฉย ๆ → รักษาทีมเดิม แต่อัปเดต lead
                $curTeam = array_map(fn($m) => (int)$m['user_id'], getWorkAssignees($pdo, 'pm_am', $id));
                setWorkAssignees($pdo, 'pm_am', $id, $curTeam, (int)$data['assigned_to'], (int)($_SESSION['user_id'] ?? 0) ?: null);
            }

            // 🆕 ขอเลื่อนกำหนด (deferral) → ส่ง LINE ให้หัวหน้า/แอดมินอนุมัติ
            if (($data['deferral_status'] ?? '') === 'pending' && !empty($data['reschedule_to'])) {
                require_once __DIR__ . '/../../../src/helpers/notification.php';
                $q = $pdo->prepare('SELECT pm.id, pm.title, pm.due_date, pm.reschedule_to, pm.reschedule_reason, a.code AS asset_code, a.name AS asset_name FROM pm_am pm LEFT JOIN asset_registry a ON pm.asset_id = a.id WHERE pm.id = ?');
                $q->execute([$id]);
                $pm = $q->fetch(PDO::FETCH_ASSOC);
                if ($pm) {
                    $reqName = '';
                    $reqId = (int)($data['deferral_requested_by'] ?? ($_SESSION['user_id'] ?? 0));
                    if ($reqId) { $u = $pdo->prepare('SELECT full_name FROM users WHERE id = ?'); $u->execute([$reqId]); $reqName = (string)$u->fetchColumn(); }
                    $body = "เครื่องจักร: {$pm['asset_code']} - {$pm['asset_name']}\n"
                          . "รายการ: {$pm['title']}\n"
                          . "กำหนดเดิม: {$pm['due_date']} → กำหนดใหม่: {$pm['reschedule_to']}\n"
                          . "เหตุผล: " . (string)($pm['reschedule_reason'] ?: '-')
                          . ($reqName !== '' ? "\nผู้ขอ: {$reqName}" : '')
                          . "\n\nกดปุ่มด้านล่างเพื่ออนุมัติ/ไม่อนุมัติ";
                    notifyPmDeferral($id, ['title' => $pm['title'], 'body' => $body], rtrim((string)publicBaseUrl(), '/') . '/pages/pm_am/?id=' . $id);
                }
            }

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
                        // คัดลอกทีมผู้รับผิดชอบไปรอบถัดไปด้วย
                        $newPmId = (int)$pdo->lastInsertId();
                        $cpTeam = $pdo->prepare(
                            "INSERT IGNORE INTO work_assignees (ref_type, ref_id, user_id, role, assigned_by, created_at)
                             SELECT 'pm_am', ?, user_id, role, assigned_by, NOW() FROM work_assignees WHERE ref_type = 'pm_am' AND ref_id = ?"
                        );
                        $cpTeam->execute([$newPmId, $id]);
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
            $pdo->prepare("DELETE FROM work_assignees WHERE ref_type = 'pm_am' AND ref_id = ?")->execute([$id]);
            if ($stmt->rowCount() === 0) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            echo json_encode(['success' => true, 'message' => 'Deleted']);
            break;
        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
