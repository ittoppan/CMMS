<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/work_order.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

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
            // อะไหล่ที่ใช้ซ่อม: ?parts=1&id=N (รายเดียว -> array) หรือ ?parts=1&ids=1,2,3 (หลาย -> map keyed by repair_id)
            if (isset($_GET['parts'])) {
                $ids = [];
                if (!empty($_GET['ids'])) {
                    $ids = array_values(array_filter(array_map('intval', explode(',', $_GET['ids']))));
                } elseif (!empty($_GET['id'])) {
                    $ids = [(int)$_GET['id']];
                }
                if (!$ids) { echo json_encode([]); break; }
                $in = implode(',', array_fill(0, count($ids), '?'));
                $stmt = $pdo->prepare("SELECT rsp.repair_id, sp.id AS spare_part_id, sp.code, sp.name, rsp.quantity_used, rsp.unit_price
                                       FROM repair_spare_parts rsp
                                       JOIN spare_parts sp ON rsp.spare_part_id = sp.id
                                       WHERE rsp.repair_id IN ($in)
                                       ORDER BY rsp.repair_id, sp.code");
                $stmt->execute($ids);
                $rows = $stmt->fetchAll();
                if (count($ids) === 1) {
                    echo json_encode($rows);
                } else {
                    $map = [];
                    foreach ($rows as $r) { $map[(int)$r['repair_id']][] = $r; }
                    echo json_encode($map);
                }
                break;
            }
            // ไทม์ไลน์การซ่อม: ?activity=1&id=N (จาก repair_activity_log)
            if (isset($_GET['activity'])) {
                $rid = (int)($_GET['id'] ?? 0);
                if (!$rid) { echo json_encode([]); break; }
                $stmt = $pdo->prepare('SELECT a.id, a.repair_id, a.action, a.description, a.old_value, a.new_value, a.created_at, u.full_name AS user_name
                                       FROM repair_activity_log a
                                       LEFT JOIN users u ON a.user_id = u.id
                                       WHERE a.repair_id = ? ORDER BY a.created_at ASC, a.id ASC');
                $stmt->execute([$rid]);
                echo json_encode($stmt->fetchAll());
                break;
            }
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
            // POST อนุญาตแบบ anonymous (ฟอร์มสาธารณะ LINE LIFF) แต่ยังต้องผ่าน CSRF check
            enforceCsrf();

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

            // ---- อะไหล่ที่ใช้ซ่อม (ใบเบิกจากใบซ่อม) — ตัดสต็อก + ผูก repair_spare_parts ----
            if (!empty($data['spare_parts']) && is_array($data['spare_parts'])) {
                try {
                    $r = saveRepairSpareParts($pdo, $newId, $data['spare_parts']);
                    if (!empty($r['cost_parts'])) {
                        $pdo->prepare('UPDATE repair SET cost_parts = ? WHERE id = ?')->execute([$r['cost_parts'], $newId]);
                    }
                } catch (Exception $e) {
                    error_log('[repair.php] spare_parts failed: ' . $e->getMessage());
                }
            }

            // ---- LINE แจ้งเตือนงานใหม่เข้า (non-blocking — fail เงียบไม่พังการ submit) ----
            try {
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
                    $priority = strtoupper((string)($data['priority'] ?? 'NORMAL'));
                    $detailUrl = publicBaseUrl() . '/repair/view?id=' . $newId;

                    // ตัวแปรสำหรับเทมเพลต Flex (line_tpl_breakdown จาก /settings/notifications)
                    $tplVars = [
                        '{work_order_id}' => $wo,
                        '{asset_code}' => $assetCode ?: '-',
                        '{asset_name}' => $assetName ?: '',
                        '{title}' => mb_substr($title, 0, 200),
                        '{priority}' => $priority,
                        '{status}' => (string)($data['status'] ?? 'PENDING'),
                        '{reporter_name}' => (string)($data['receiver_name'] ?? '-'),
                    ];

                    // เป้าหมาย: กลุ่ม LINE (ถ้าตั้ง) + ช่างที่ถูกมอบหมาย หรือ LINE-bound users ทั้งหมด (fallback)
                    $targets = [];
                    $grpEnabled = getSettingValue('line_group_enabled', '1');
                    $grp = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_maintenance_group_id'");
                    $grp->execute();
                    $gid = $grp->fetchColumn();
                    if ($gid && $grpEnabled === '1') $targets[] = (string)$gid;

                    if (!empty($data['assigned_to'])) {
                        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                        $st->execute([(int)$data['assigned_to']]);
                        $lid = $st->fetchColumn();
                        if ($lid) $targets[] = (string)$lid;
                    } elseif (!$gid || $grpEnabled !== '1') {
                        $st = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''");
                        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $lid) $targets[] = (string)$lid;
                    }

                    foreach (array_unique($targets) as $tid) {
                        $photos = ['before' => repairPhotoUrls($newId, 'failure_image', 2)];
                        sendLineTemplatePush($tid, 'line_tpl_breakdown', $tplVars, $detailUrl, $photos);
                    }

                    // แจ้งเตือนแอดมินผ่าน Telegram เมื่อเป็นงานด่วน CRITICAL หรือเครื่องหยุด
                    if ($priority === 'CRITICAL' || strtolower((string)($data['machine_status'] ?? '')) === 'down') {
                        telegramAdminAlert(
                            "แจ้งซ่อมด่วน $wo",
                            $title . " — เครื่อง: " . ($assetCode ?: '-') . ($assetName ? " $assetName" : '') . " | ความเร่งด่วน: $priority",
                            $detailUrl,
                            'ERROR'
                        );
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

            // ---- อะไหล่ที่ใช้ซ่อม (ใบเบิกจากใบซ่อม) — แทนที่รายการ + ตัดสต็อก + คำนวณต้นทุนรวม ----
            if (isset($data['spare_parts']) && is_array($data['spare_parts'])) {
                try {
                    $r = saveRepairSpareParts($pdo, $id, $data['spare_parts'], true);
                    if (!empty($r['cost_parts'])) {
                        $pdo->prepare('UPDATE repair SET cost_parts = ? WHERE id = ?')->execute([$r['cost_parts'], $id]);
                    }
                } catch (Exception $e) {
                    error_log('[repair.php] spare_parts failed: ' . $e->getMessage());
                }
            }
            echo json_encode(['success' => true]);

            // ---- LINE แจ้งเตือนเมื่อปิดงานซ่อม (completed) — ใช้เทมเพลต line_tpl_completed ----
            try {
                $isCompleted = (isset($data['status']) && $data['status'] === 'completed') || isset($data['completed_at']);
                if ($isCompleted && getSettingValue('line_notify_enabled', '0') === '1') {
                    $q = $pdo->prepare("SELECT r.*, a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
                                        FROM repair r
                                        LEFT JOIN asset_registry a ON a.id = r.asset_id
                                        LEFT JOIN users u ON u.id = r.assigned_to
                                        WHERE r.id = ?");
                    $q->execute([$id]);
                    $row = $q->fetch(PDO::FETCH_ASSOC);
                    if ($row) {
                        $dt = 0.0;
                        if (!empty($row['downtime_start']) && !empty($row['downtime_end'])) {
                            $dt = round((strtotime($row['downtime_end']) - strtotime($row['downtime_start'])) / 3600, 1);
                        }
                        $totalCost = (float)($row['cost_parts'] ?? 0) + (float)($row['cost_labor'] ?? 0);
                        $cv = [
                            '{work_order_id}' => (string)($row['work_order_no'] ?? 'EN-????-???'),
                            '{asset_code}' => (string)($row['asset_code'] ?? '-'),
                            '{asset_name}' => (string)($row['asset_name'] ?? ''),
                            '{title}' => mb_substr((string)($row['title'] ?? ''), 0, 200),
                            '{downtime_hours}' => number_format($dt, 1),
                            '{total_cost}' => number_format($totalCost),
                            '{assigned_name}' => (string)($row['assigned_name'] ?? '-'),
                        ];
                        $detailUrl = publicBaseUrl() . '/repair/view?id=' . $id;
                        $targets = [];
                        if (!empty($row['assigned_to'])) {
                            $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                            $st->execute([(int)$row['assigned_to']]);
                            $lid = $st->fetchColumn();
                            if ($lid) $targets[] = (string)$lid;
                        }
                        $grp = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_maintenance_group_id'")->fetchColumn();
                        if ($grp && getSettingValue('line_group_enabled', '1') === '1') $targets[] = (string)$grp;
                        $photos = ['before' => repairPhotoUrls($id, 'failure_image', 2), 'after' => repairPhotoUrls($id, 'after_image', 2)];
                        foreach (array_unique($targets) as $tid) {
                            sendLineTemplatePush($tid, 'line_tpl_completed', $cv, $detailUrl, $photos);
                        }
                    }
                }
            } catch (Exception $e) {
                error_log("[repair.php] completed LINE notify failed: " . $e->getMessage());
            }
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
