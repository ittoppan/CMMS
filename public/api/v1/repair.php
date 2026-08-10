<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

function generateWorkOrderNo(PDO $pdo): string {
    $yymm = date('ym'); // e.g. 2607
    $prefix = "EN-" . $yymm . "-";
    
    $stmt = $pdo->prepare("SELECT work_order_no FROM repair WHERE work_order_no LIKE ? ORDER BY work_order_no DESC LIMIT 1");
    $stmt->execute([$prefix . '%']);
    $last = $stmt->fetchColumn();
    
    if ($last) {
        $lastSeq = (int)substr($last, -3);
        $nextSeq = $lastSeq + 1;
    } else {
        $nextSeq = 1;
    }
    
    return $prefix . str_pad($nextSeq, 3, '0', STR_PAD_LEFT);
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    // GET/PUT/DELETE ต้องเป็นผู้ใช้ในระบบ
    // POST อนุญาตแบบ anonymous — ฟอร์มแจ้งซ่อมสาธารณะ (LINE LIFF /repair/request)
    // ที่ไม่มี session; จะตรวจ receiver_name แทน (ดูใน case 'POST')
    if ($method !== 'POST') {
        requireLogin($pdo); // ต้อง login — รายการงาน/แก้ไข/ลบต้องเป็นผู้ใช้ในระบบ
    }

    switch ($method) {
        case 'GET':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT r.*, a.name AS asset_name, u.full_name AS assigned_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id WHERE r.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                echo json_encode($row);
            } else {
                $stmt = $pdo->query('SELECT r.*, a.name AS asset_name, u.full_name AS assigned_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id ORDER BY r.created_at DESC');
                echo json_encode($stmt->fetchAll());
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            if (empty($data['work_order_no'])) {
                $data['work_order_no'] = generateWorkOrderNo($pdo);
            }
            // ไม่ได้ login (ฟอร์มสาธารณะจาก LINE) → ต้องมีชื่อผู้แจ้ง + เบอร์โทร
            // (ฟอร์ม /repair/request บังคับทั้งคู่ในขั้นตอน "ผู้แจ้ง & รูป")
            if (!currentUser($pdo)) {
                if (empty($data['receiver_name'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Missing receiver_name — ฟอร์มสาธารณะต้องระบุชื่อผู้แจ้ง']);
                    exit;
                }
                if (empty($data['reporter_phone'])) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Missing reporter_phone — ฟอร์มสาธารณะต้องระบุเบอร์โทรผู้แจ้ง']);
                    exit;
                }
            }
            $allowed = ['work_order_no', 'asset_id', 'assigned_to', 'created_by', 'priority', 'status', 'title', 'description', 'failure_report', 'diagnosis', 'resolution', 'downtime_start', 'downtime_end', 'cost_parts', 'cost_labor', 'notes', 'repair_type_id', 'failure_code_id', 'repair_code_id', 'work_zone_id', 'location_id', 'department_id', 'safety_related', 'product_lot_no', 'machine_status', 'production_line_status', 'estimated_completion_date', 'actual_start_at', 'acknowledged_at', 'root_cause', 'solution', 'rejection_reason_id', 'rejection_note', 'before_image_path', 'after_image_path', 'receiver_name', 'receiver_signature_path', 'reporter_phone', 'reporter_email', 'office', 'completed_at'];
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO repair (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            $newId = (int)$pdo->lastInsertId();
            echo json_encode(['success' => true, 'id' => $newId, 'work_order_no' => $data['work_order_no']]);

            // ---- LINE แจ้งเตือนงานใหม่เข้า (non-blocking — fail เงียบไม่พังการ submit) ----
            try {
                require_once __DIR__ . '/../../../src/helpers/notification.php';
                $q = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_enabled'");
                $q->execute();
                if ($q->fetchColumn() === '1') {
                    $assetCode = ''; $assetName = '';
                    if (!empty($data['asset_id'])) {
                        $st = $pdo->prepare("SELECT code, name FROM asset_registry WHERE id = ?");
                        $st->execute([(int)$data['asset_id']]);
                        $a = $st->fetch();
                        if ($a) { $assetCode = $a['code']; $assetName = $a['name']; }
                    }
                    $wo = $data['work_order_no'] ?? 'EN-????-???';
                    $title = $data['title'] ?? 'งานซ่อมใหม่';
                    $body = "เครื่องจักร: " . ($assetCode ?: '-') . ($assetName ? " - $assetName" : '') .
                        "\nอาการ/รายการ: " . mb_substr($data['description'] ?? '-', 0, 120) .
                        "\nความเร่งด่วน: " . strtoupper((string)($data['priority'] ?? 'NORMAL')) .
                        " | สถานะเครื่อง: " . ($data['machine_status'] ?? '-') .
                        "\nผู้แจ้ง: " . ($data['receiver_name'] ?? '-') .
                        (!empty($data['reporter_phone']) ? " | โทร: {$data['reporter_phone']}" : '');
                    $detailUrl = publicBaseUrl() . '/repair/view?id=' . $newId;

                    // เป้าหมาย: กลุ่ม LINE (ถ้าตั้ง) + ช่างที่ถูกมอบหมาย หรือ LINE-bound users ทั้งหมด (fallback)
                    $targets = [];
                    $grp = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_maintenance_group_id'");
                    $grp->execute();
                    $gid = $grp->fetchColumn();
                    if ($gid) $targets[] = (string)$gid;

                    if (!empty($data['assigned_to'])) {
                        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                        $st->execute([(int)$data['assigned_to']]);
                        $lid = $st->fetchColumn();
                        if ($lid) $targets[] = (string)$lid;
                    } elseif (!$gid) {
                        $st = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''");
                        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $lid) $targets[] = (string)$lid;
                    }

                    foreach (array_unique($targets) as $tid) {
                        $photos = ['before' => repairPhotoUrls($newId, 'failure_image', 2)];
                        sendLinePushMessage($tid, "🚨 งานซ่อมใหม่ {$wo}", $body, $detailUrl, $photos);
                    }
                }
            } catch (Exception $e) {
                error_log("[repair.php] LINE notify failed: " . $e->getMessage());
            }
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            $allowed = ['work_order_no', 'asset_id', 'assigned_to', 'priority', 'status', 'title', 'description', 'failure_report', 'diagnosis', 'resolution', 'downtime_start', 'downtime_end', 'cost_parts', 'cost_labor', 'notes', 'repair_type_id', 'failure_code_id', 'repair_code_id', 'work_zone_id', 'location_id', 'department_id', 'safety_related', 'product_lot_no', 'machine_status', 'production_line_status', 'estimated_completion_date', 'actual_start_at', 'acknowledged_at', 'root_cause', 'solution', 'rejection_reason_id', 'rejection_note', 'before_image_path', 'after_image_path', 'receiver_name', 'receiver_signature_path', 'completed_at'];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) { http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $values[] = $id;
            $stmt = $pdo->prepare("UPDATE repair SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);
            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

            // Safe Foreign Key Cleanup
            try { $pdo->prepare('DELETE FROM repair_spare_parts WHERE repair_id = ?')->execute([$id]); } catch (Exception $e) {}
            try { $pdo->prepare('DELETE FROM repair_logs WHERE repair_id = ?')->execute([$id]); } catch (Exception $e) {}

            $stmt = $pdo->prepare('DELETE FROM repair WHERE id = ?');
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
