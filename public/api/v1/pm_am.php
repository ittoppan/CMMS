<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)

try {
    $pdo = getDb();
requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($method) {
        case 'GET':
            if (isset($_GET['today'])) { echo json_encode(['today' => date('Y-m-d')]); exit; }
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            // รายการเอกสารแนบของแผน PM (ใบแจ้งหนี้/ใบเสนอราคา)
            if (isset($_GET['attachments']) && $id) {
                $stmt = $pdo->prepare('SELECT a.*, u.full_name AS uploaded_name FROM pm_am_attachments a LEFT JOIN users u ON a.uploaded_by = u.id WHERE a.pm_am_id = ? ORDER BY a.created_at DESC');
                $stmt->execute([$id]);
                echo json_encode($stmt->fetchAll());
                exit;
            }
            if ($id) {
                $stmt = $pdo->prepare('SELECT p.*, pl.meter_interval AS plan_meter_interval, a.name AS asset_name, u.full_name AS assigned_name, u.avatar_path AS assigned_avatar, u.avatar AS assigned_avatar_legacy FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id LEFT JOIN pm_am_plans pl ON pl.id = p.plan_id WHERE p.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                $single = [$row];
                attachWorkTeams($single, 'pm_am');
                $r = $single[0];
                if ((!isset($r['meter_interval']) || $r['meter_interval'] === null || $r['meter_interval'] === '') && !empty($r['plan_meter_interval'])) {
                    $r['meter_interval'] = $r['plan_meter_interval'];
                }
                echo json_encode($r);
            } else {
                // sync overdue ตาม due_date จริง (อ่านให้สถานะสอดคล้อง)
                $today = date('Y-m-d');
                try {
                    $pdo->prepare("UPDATE pm_am SET status='overdue' WHERE status='pending' AND due_date IS NOT NULL AND due_date < ?")->execute([$today]);
                    $pdo->prepare("UPDATE pm_am SET status='pending' WHERE status='overdue' AND due_date IS NOT NULL AND due_date >= ?")->execute([$today]);
                } catch (Exception $e) { /* ignore */ }

                $where = [];
                $params = [];
                $status = isset($_GET['status']) ? trim((string)$_GET['status']) : '';
                $frequency = isset($_GET['frequency']) ? trim((string)$_GET['frequency']) : '';
                $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
                $outsource = isset($_GET['outsource']) ? trim((string)$_GET['outsource']) : '';
                $assignee = isset($_GET['assignee']) ? (int)$_GET['assignee'] : 0;
                $dueFrom = isset($_GET['due_from']) ? trim((string)$_GET['due_from']) : '';
                $dueTo = isset($_GET['due_to']) ? trim((string)$_GET['due_to']) : '';
                $dueState = isset($_GET['due_state']) ? trim((string)$_GET['due_state']) : '';

                if ($status !== '' && $status !== 'all') { $where[] = 'p.status = ?'; $params[] = $status; }
                if ($frequency !== '' && $frequency !== 'all') { $where[] = 'p.frequency_type = ?'; $params[] = $frequency; }
                if ($assignee > 0) { $where[] = 'p.assigned_to = ?'; $params[] = $assignee; }
                if ($outsource === '1' || $outsource === 'out') { $where[] = 'COALESCE(p.is_outsource,0) = 1'; }
                elseif ($outsource === '0' || $outsource === 'in') { $where[] = 'COALESCE(p.is_outsource,0) = 0'; }
                if ($dueFrom !== '') { $where[] = 'p.due_date >= ?'; $params[] = $dueFrom; }
                if ($dueTo !== '') { $where[] = 'p.due_date <= ?'; $params[] = $dueTo; }
                if ($q !== '') {
                    $where[] = '(p.title LIKE ? OR a.name LIKE ? OR a.code LIKE ? OR CAST(p.id AS CHAR) LIKE ? OR u.full_name LIKE ?)';
                    $like = '%' . $q . '%';
                    array_push($params, $like, $like, $like, $like, $like);
                }
                if ($dueState === 'overdue') {
                    $where[] = "p.status NOT IN ('completed','skipped','cancelled') AND p.due_date IS NOT NULL AND p.due_date < ?";
                    $params[] = $today;
                } elseif ($dueState === 'due_today') {
                    $where[] = "p.status NOT IN ('completed','skipped','cancelled') AND p.due_date = ?";
                    $params[] = $today;
                } elseif ($dueState === 'upcoming_7') {
                    $where[] = "p.status NOT IN ('completed','skipped','cancelled') AND p.due_date IS NOT NULL AND p.due_date >= ? AND p.due_date <= DATE_ADD(?, INTERVAL 7 DAY)";
                    $params[] = $today; $params[] = $today;
                } elseif ($dueState === 'no_due') {
                    $where[] = "(p.due_date IS NULL OR p.due_date = '')";
                }

                $whereSql = $where ? (' WHERE ' . implode(' AND ', $where)) : '';
                $baseSql = "FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id LEFT JOIN users u ON p.assigned_to = u.id LEFT JOIN pm_am_plans pl ON pl.id = p.plan_id" . $whereSql;

                if (isset($_GET['summary'])) {
                    $sum = [
                        'total' => 0, 'completed' => 0, 'in_progress' => 0, 'pending' => 0,
                        'overdue' => 0, 'skipped' => 0, 'cancelled' => 0,
                        'due_today' => 0, 'upcoming_7' => 0, 'no_due' => 0,
                        'actionable' => 0, 'compliance_eligible' => 0,
                    ];
                    $cnt = $pdo->prepare("SELECT COUNT(*) " . $baseSql);
                    $cnt->execute($params);
                    $sum['total'] = (int)$cnt->fetchColumn();
                    $stSum = $pdo->prepare("SELECT p.status, COUNT(*) c " . $baseSql . " GROUP BY p.status");
                    $stSum->execute($params);
                    foreach ($stSum->fetchAll() as $r) { $k = (string)$r['status']; if (array_key_exists($k, $sum)) $sum[$k] = (int)$r['c']; }
                    $dueSql = "SELECT
                        SUM(CASE WHEN p.status NOT IN ('completed','skipped','cancelled') AND p.due_date IS NOT NULL AND p.due_date < ? THEN 1 ELSE 0 END) AS overdue_due,
                        SUM(CASE WHEN p.status NOT IN ('completed','skipped','cancelled') AND p.due_date = ? THEN 1 ELSE 0 END) AS due_today,
                        SUM(CASE WHEN p.status NOT IN ('completed','skipped','cancelled') AND p.due_date IS NOT NULL AND p.due_date >= ? AND p.due_date <= DATE_ADD(?, INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS upcoming_7,
                        SUM(CASE WHEN p.due_date IS NULL OR p.due_date = '' THEN 1 ELSE 0 END) AS no_due,
                        SUM(CASE WHEN p.status NOT IN ('completed','skipped','cancelled') AND (p.due_date IS NULL OR p.due_date <= DATE_ADD(?, INTERVAL 7 DAY)) THEN 1 ELSE 0 END) AS actionable,
                        SUM(CASE WHEN p.status NOT IN ('skipped','cancelled') AND p.due_date IS NOT NULL AND p.due_date <= ? THEN 1 ELSE 0 END) AS compliance_eligible
                        " . $baseSql;
                    $dueParams = array_merge([$today,$today,$today,$today,$today,$today], $params);
                    $d = $pdo->prepare($dueSql);
                    $d->execute($dueParams);
                    $dr = $d->fetch() ?: [];
                    $sum['overdue'] = max($sum['overdue'], (int)($dr['overdue_due'] ?? 0));
                    $sum['due_today'] = (int)($dr['due_today'] ?? 0);
                    $sum['upcoming_7'] = (int)($dr['upcoming_7'] ?? 0);
                    $sum['no_due'] = (int)($dr['no_due'] ?? 0);
                    $sum['actionable'] = (int)($dr['actionable'] ?? 0);
                    $sum['compliance_eligible'] = (int)($dr['compliance_eligible'] ?? 0);
                    echo json_encode(['status' => 'success', 'summary' => $sum, 'today' => $today]);
                    exit;
                }

                $limit = isset($_GET['limit']) ? max(1, min(2000, (int)$_GET['limit'])) : 0; // 0 = all (backward compat)
                $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
                $order = " ORDER BY (p.status='overdue') DESC, p.due_date IS NULL, p.due_date ASC, p.id DESC";
                $sql = "SELECT p.*, pl.meter_interval AS plan_meter_interval, a.name AS asset_name, u.full_name AS assigned_name, u.avatar_path AS assigned_avatar, u.avatar AS assigned_avatar_legacy " . $baseSql . $order;
                if ($limit > 0) { $sql .= " LIMIT " . (int)$limit . " OFFSET " . (int)$offset; }
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$rr) {
                    if ((!isset($rr['meter_interval']) || $rr['meter_interval'] === null || $rr['meter_interval'] === '') && !empty($rr['plan_meter_interval'])) {
                        $rr['meter_interval'] = $rr['plan_meter_interval'];
                    }
                }
                unset($rr);
                attachWorkTeams($rows, 'pm_am');
                if ($limit > 0) {
                    $cnt = $pdo->prepare("SELECT COUNT(*) " . $baseSql);
                    $cnt->execute($params);
                    echo json_encode(['status' => 'success', 'data' => $rows, 'total' => (int)$cnt->fetchColumn(), 'limit' => $limit, 'offset' => $offset]);
                } else {
                    echo json_encode($rows);
                }
            }
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'meter_unit', 'meter_reading', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason', 'reschedule_to', 'deferral_status', 'deferral_requested_by', 'deferral_requested_at', 'inspector_signature', 'operator_signature', 'operator_name', 'reviewer_signature', 'signed_at', 'is_outsource', 'outsource_by', 'cost_outsource'];
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
            // ปิดงาน PM ได้ตั้งแต่วันครบกำหนดเป็นต้นไป (อนุญาตทำล่าช้า) แต่ไม่อนุญาตปิดก่อนถึงกำหนด
            if (($data['status'] ?? null) === 'completed') {
                $qDue = $pdo->prepare('SELECT due_date FROM pm_am WHERE id = ?');
                $qDue->execute([$id]);
                $dueRow = $qDue->fetch(PDO::FETCH_ASSOC);
                if (!$dueRow) { http_response_code(404); echo json_encode(['error' => 'PM not found']); exit; }
                $dueRaw = $dueRow['due_date'] ?? null;
                $todayDay = date('Y-m-d');
                if ($dueRaw) {
                    $dueDay = date('Y-m-d', strtotime((string)$dueRaw));
                    if ($todayDay < $dueDay) {
                        http_response_code(403);
                        echo json_encode(['error' => "PM นี้กำหนดตรวจวันที่ {$dueDay} — ยังไม่ถึงวันครบกำหนด ไม่สามารถปิดงานล่วงหน้าได้"]);
                        exit;
                    }
                }
                // บันทึกเวลาจริงหากไม่ส่งมา
                if (empty($data['completed_at'])) { $data['completed_at'] = date('Y-m-d H:i:s'); }
                if (empty($data['last_done_date'])) { $data['last_done_date'] = $todayDay; }
                if (empty($data['completed_by']) && !empty($_SESSION['user_id'])) { $data['completed_by'] = (int)$_SESSION['user_id']; }
            }
            // เพิ่มเอกสารแนบ (ใบแจ้งหนี้/ใบเสนอราคา) — { attach_file: {file_url, file_name, file_type, file_size} }
            if (isset($data['attach_file']) && is_array($data['attach_file'])) {
                $af = $data['attach_file'];
                $url = trim((string)($af['file_url'] ?? ''));
                if ($url === '') { http_response_code(400); echo json_encode(['error' => 'Missing file_url']); exit; }
                $exists = $pdo->prepare('SELECT id FROM pm_am WHERE id = ?');
                $exists->execute([$id]);
                if (!$exists->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'PM not found']); exit; }
                $ins = $pdo->prepare('INSERT INTO pm_am_attachments (pm_am_id, file_name, file_path, file_type, file_size, uploaded_by) VALUES (?,?,?,?,?,?)');
                $ins->execute([$id, (string)($af['file_name'] ?? basename($url)), $url, isset($af['file_type']) ? (string)$af['file_type'] : null, isset($af['file_size']) ? (int)$af['file_size'] : null, (int)($_SESSION['user_id'] ?? 0) ?: null]);
                echo json_encode(['success' => true, 'attachment_id' => (int)$pdo->lastInsertId()]);
                exit;
            }
            // ช่างกด "รับงาน" — ทำงานก่อนเช็คฟิลด์อื่น (ส่งมาแค่ assignee_accept ตัวเดียวก็ได้)
            $accepted = false;
            if (!empty($data['assignee_accept'])) {
                $cu = currentUser($pdo);
                if ($cu && $cu['id']) {
                    acceptWorkAssignment($pdo, 'pm_am', $id, (int)$cu['id']);
                    $accepted = true;
                }
            }
            $allowed = ['asset_id', 'assigned_to', 'title', 'description', 'frequency_type', 'frequency_interval', 'meter_unit', 'meter_reading', 'due_date', 'last_done_date', 'status', 'checklist', 'notes', 'plan_id', 'department_id', 'location_id', 'work_zone_id', 'work_instruction_file', 'completed_at', 'completed_by', 'reschedule_reason', 'reschedule_to', 'deferral_status', 'deferral_requested_by', 'deferral_requested_at', 'inspector_signature', 'operator_signature', 'operator_name', 'reviewer_signature', 'signed_at', 'is_outsource', 'outsource_by', 'cost_outsource'];
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

                if ($parent) {
                    $freq = (string)($parent['frequency_type'] ?? '');
                    // PM ตามมิเตอร์: บันทึกค่ามิเตอร์ ณ ตอนปิดงานเป็น baseline (ถ้ามีข้อมูล) และไม่สร้างรอบถัดไปตามเวลา
                    if ($freq === 'meter_based') {
                        $meterReadingProvided = array_key_exists('meter_reading', $data) && $data['meter_reading'] !== '' && $data['meter_reading'] !== null;
                        $pmMeterUnit = trim((string)($parent['meter_unit'] ?? ''));
                        if (!$meterReadingProvided && $pmMeterUnit !== '' && !empty($parent['asset_id'])) {
                            try {
                                $mr = $pdo->prepare("SELECT value_numeric FROM asset_measurements WHERE asset_id = ? AND (parameter = ? OR unit = ?) ORDER BY measured_at DESC, id DESC LIMIT 1");
                                $mr->execute([(int)$parent['asset_id'], $pmMeterUnit, $pmMeterUnit]);
                                $latestM = $mr->fetchColumn();
                                if ($latestM !== false && $latestM !== null) {
                                    $pdo->prepare("UPDATE pm_am SET meter_reading = ? WHERE id = ?")->execute([(float)$latestM, $id]);
                                }
                            } catch (Exception $e) { /* ตาราง/คอลัมน์อาจไม่พร้อม */ }
                        }
                    } elseif ($freq !== '') {
                        $interval = max(1, (int)($parent['frequency_interval'] ?: 1));
                        $completedRef = $data['last_done_date'] ?? $parent['last_done_date'] ?? date('Y-m-d');
                        $baseDue = !empty($parent['due_date']) ? date('Y-m-d', strtotime((string)$parent['due_date'])) : $completedRef;
                        $calcNext = function (string $from) use ($freq, $interval): string {
                            return match ($freq) {
                                'daily'       => date('Y-m-d', strtotime("$from + $interval days")),
                                'weekly'      => date('Y-m-d', strtotime("$from + " . ($interval * 7) . " days")),
                                'monthly'     => date('Y-m-d', strtotime("$from + $interval months")),
                                'quarterly'   => date('Y-m-d', strtotime("$from + " . ($interval * 3) . " months")),
                                'semi_annual' => date('Y-m-d', strtotime("$from + " . ($interval * 6) . " months")),
                                'yearly'      => date('Y-m-d', strtotime("$from + $interval years")),
                                default       => date('Y-m-d', strtotime("$from + $interval days")), // custom
                            };
                        };
                        $nextDue = $calcNext($baseDue);
                        $guard = 0;
                        // fixed schedule: ยึด cadence จากกำหนดเดิม แล้วเลื่อนไปจนรอบถัดไปอยู่หลังวันที่ปิดงานจริง
                        while ($nextDue <= $completedRef && $guard < 120) {
                            $nextDue = $calcNext($nextDue);
                            $guard++;
                        }

                        // Dedup: มีรอบเดียวกัน (เครื่อง+ชื่อ) ที่ยังค้างอยู่แล้วไหม — กันสร้างซ้ำ
                        $dup = $pdo->prepare("SELECT COUNT(*) FROM pm_am WHERE asset_id = ? AND title = ? AND status IN ('pending','in_progress')");
                        $dup->execute([$parent['asset_id'], $parent['title']]);
                        if ((int)$dup->fetchColumn() === 0) {
                            $ins = $pdo->prepare(
                                "INSERT INTO pm_am (asset_id, assigned_to, plan_id, title, description, frequency_type, frequency_interval, meter_unit, meter_interval, priority, estimated_duration_minutes, is_outsource, outsource_by, cost_outsource, due_date, status, department_id, location_id, work_zone_id, created_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())"
                            );
                            $ins->execute([
                                $parent['asset_id'],
                                $parent['assigned_to'],
                                $parent['plan_id'], // ลิงก์แม่ (ใช้ dedup/ติดตามรอบ)
                                $parent['title'],
                                $parent['description'],
                                $freq,
                                $interval,
                                $parent['meter_unit'] ?? null,
                                $parent['meter_interval'] ?? null,
                                $parent['priority'] ?? 'normal',
                                $parent['estimated_duration_minutes'] ?? null,
                                $parent['is_outsource'] ?? 0,
                                $parent['outsource_by'] ?? null,
                                $parent['cost_outsource'] ?? null,
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

                            // แจ้งเตือนผู้รับผิดชอบเมื่อออกรอบถัดไปอัตโนมัติ (ถ้าระบบ/ช่องทางพร้อม)
                            $notifyUid = (int)($parent['assigned_to'] ?? 0);
                            if ($notifyUid > 0) {
                                try {
                                    require_once __DIR__ . '/../../../src/helpers/notification.php';
                                    $assetCode = '';
                                    try {
                                        $qa = $pdo->prepare('SELECT code, name FROM asset_registry WHERE id = ?');
                                        $qa->execute([$parent['asset_id']]);
                                        $ar = $qa->fetch(PDO::FETCH_ASSOC) ?: [];
                                        $assetCode = trim((string)($ar['code'] ?? ''));
                                    } catch (Exception $e2) {}
                                    $titleN = '📋 รอบ PM ถัดไป: ' . (string)$parent['title'];
                                    $msgN = "สร้างรอบ PM ถัดไปแล้ว
รายการ: " . (string)$parent['title']
                                        . ($assetCode !== '' ? "
เครื่องจักร: {$assetCode}" : '')
                                        . "
กำหนด: {$nextDue}"
                                        . "
(ออกรอบอัตโนมัติจากการปิดงานรอบก่อนหน้า)";
                                    $urlN = rtrim((string)publicBaseUrl(), '/') . '/pm_am/checksheet?id=' . $newPmId . '&plan_id=' . (int)($parent['plan_id'] ?? 0);
                                    sendNotificationToUser($notifyUid, $titleN, $msgN, $urlN);
                                } catch (Exception $eN) { /* ไม่ให้ล้ม flow หลัก */ }
                            }
                        }
                    }
                }
            }

            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            // ลบเอกสารแนบรายการเดียว
            if (isset($_GET['attachment_id'])) {
                $attId = (int)$_GET['attachment_id'];
                $stmt = $pdo->prepare('SELECT file_path FROM pm_am_attachments WHERE id = ?');
                $stmt->execute([$attId]);
                $path = (string)$stmt->fetchColumn();
                if ($path !== '') {
                    $pdo->prepare('DELETE FROM pm_am_attachments WHERE id = ?')->execute([$attId]);
                    $full = __DIR__ . '/../../../public' . $path;
                    if (is_file($full)) { @unlink($full); }
                    echo json_encode(['success' => true, 'message' => 'Attachment deleted']);
                    exit;
                }
                http_response_code(404); echo json_encode(['error' => 'Not found']); exit;
            }
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $stmt = $pdo->prepare('DELETE FROM pm_am WHERE id = ?');
            $stmt->execute([$id]);
            $pdo->prepare("DELETE FROM work_assignees WHERE ref_type = 'pm_am' AND ref_id = ?")->execute([$id]);
            $pdo->prepare('DELETE FROM pm_am_attachments WHERE pm_am_id = ?')->execute([$id]);
            if ($stmt->rowCount() === 0) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            echo json_encode(['success' => true, 'message' => 'Deleted']);
            break;
        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    api_safe_catch($e);
}
