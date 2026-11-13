<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/work_order.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/services/NotificationCenterService.php';
require_once __DIR__ . '/../../../src/helpers/workforce.php';
require_once __DIR__ . '/../../../src/helpers/failure.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

// สถานะเฉพาะของ Phase 14 (Supervisor workflow) — จัดการผ่าน /api/v1/supervisor.php เท่านั้น
$P14_ONLY_STATUSES = ['draft', 'pending_approval', 'approved', 'assigned', 'accepted', 'paused', 'waiting_external', 'pending_verification', 'verified'];

/**
 * Fallback RM-1: ป้องกันกราฟ Downtime ว่าง — ถ้า payload มี downtime_start + downtime_end
 * แต่ไม่กรอก/กรอก 0 นาที → คำนวณจากความต่างของเวลาให้อัตโนมัติ (ผู้ใช้ยัง override ได้โดยกรอกค่าเอง)
 */
function repair_autofill_downtime(array &$data): void {
    $s = trim((string)($data['downtime_start'] ?? ''));
    $e = trim((string)($data['downtime_end'] ?? ''));
    $m = $data['downtime_minutes'] ?? null;
    if ($s === '' || $e === '') return;
    if ($m !== null && trim((string)$m) !== '' && (int)$m > 0) return;
    $ts1 = strtotime($s); $ts2 = strtotime($e);
    if ($ts1 === false || $ts2 === false || $ts2 < $ts1) return;
    $data['downtime_minutes'] = max(1, (int)round(($ts2 - $ts1) / 60));
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
            // กลุ่มอ้างอิงรหัส F/R: ?reference=codes -> { failure_codes, repair_codes } (สำหรับ dropdown ปิดใบงาน/แก้ไข)
            if (isset($_GET['reference']) && $_GET['reference'] === 'codes') {
                $fCodes = $pdo->query("SELECT id, code, name, category FROM failure_codes WHERE is_active = 1 ORDER BY id")->fetchAll();
                $rCodes = $pdo->query("SELECT id, code, name, category FROM repair_codes WHERE is_active = 1 ORDER BY id")->fetchAll();
                echo json_encode(['failure_codes' => $fCodes, 'repair_codes' => $rCodes], JSON_UNESCAPED_UNICODE);
                break;
            }
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
                $stmt = $pdo->prepare("SELECT rsp.repair_id, sp.id AS spare_part_id, sp.code, sp.name, sp.image_url, rsp.quantity_used, rsp.unit_price
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
                $stmt = $pdo->prepare('SELECT r.*, a.name AS asset_name, u.full_name AS assigned_name, u.avatar_path AS assigned_avatar, u.avatar AS assigned_avatar_legacy, fc.code AS failure_code, rc.code AS repair_code, rr.rating_score, rr.rating_comment FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id LEFT JOIN repair_codes rc ON r.repair_code_id = rc.id LEFT JOIN repair_ratings rr ON rr.repair_id = r.id AND rr.id = (SELECT MAX(rr2.id) FROM repair_ratings rr2 WHERE rr2.repair_id = r.id) WHERE r.id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
                $single = [$row];
                attachWorkTeams($single, 'repair');
                echo json_encode($single[0]);
            } else {
                // รายการงานซ่อม (รองรับกรอง/แบ่งหน้าแบบ opt-in เพื่อความเข้ากันได้ย้อนหลัง)
                $ratingJoin = ' LEFT JOIN repair_ratings rr ON rr.repair_id = r.id AND rr.id = (SELECT MAX(rr2.id) FROM repair_ratings rr2 WHERE rr2.repair_id = r.id)';
                $baseSelect = 'SELECT r.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS assigned_name, u.avatar_path AS assigned_avatar, u.avatar AS assigned_avatar_legacy, fc.code AS failure_code, rc.code AS repair_code, rr.rating_score, rr.rating_comment FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id LEFT JOIN repair_codes rc ON r.repair_code_id = rc.id' . $ratingJoin;
                $baseCount = 'SELECT COUNT(*) FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id LEFT JOIN users u ON r.assigned_to = u.id';

                $where = [];
                $params = [];
                if (!empty($_GET['asset_code'])) {
                    $where[] = 'a.code = ?';
                    $params[] = (string)$_GET['asset_code'];
                }
                if (isset($_GET['status']) && $_GET['status'] !== '' && $_GET['status'] !== 'all') {
                    $stFilter = strtolower(trim((string)$_GET['status']));
                    // รองรับกลุ่มสถานะที่ UI ใช้บ่อย
                    if ($stFilter === 'overdue') {
                        $where[] = "r.estimated_completion_date IS NOT NULL AND r.estimated_completion_date < CURDATE() AND LOWER(COALESCE(r.status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')";
                    } elseif ($stFilter === 'open_active') {
                        $where[] = "LOWER(COALESCE(r.status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')";
                    } elseif ($stFilter === 'completed_all') {
                        $where[] = "LOWER(COALESCE(r.status,'')) IN ('completed','closed','resolved')";
                    } else {
                        $where[] = 'LOWER(COALESCE(r.status,"")) = ?';
                        $params[] = $stFilter;
                    }
                }
                if (!empty($_GET['assigned_to'])) {
                    $where[] = 'r.assigned_to = ?';
                    $params[] = (int)$_GET['assigned_to'];
                }
                if (!empty($_GET['created_from'])) {
                    $where[] = 'DATE(r.created_at) >= ?';
                    $params[] = (string)$_GET['created_from'];
                }
                if (!empty($_GET['created_to'])) {
                    $where[] = 'DATE(r.created_at) <= ?';
                    $params[] = (string)$_GET['created_to'];
                }
                if (!empty($_GET['q'])) {
                    $q = trim((string)$_GET['q']);
                    if ($q !== '') {
                        $where[] = '(r.work_order_no LIKE ? OR r.title LIKE ? OR r.description LIKE ? OR a.name LIKE ? OR a.code LIKE ? OR u.full_name LIKE ?)';
                        $like = '%' . $q . '%';
                        array_push($params, $like, $like, $like, $like, $like, $like);
                    }
                }
                $whereSql = $where ? (' WHERE ' . implode(' AND ', $where)) : '';
                $orderSql = ' ORDER BY r.created_at DESC';

                $hasLimit = isset($_GET['limit']) || isset($_GET['offset']) || isset($_GET['page']);
                $wantTotal = isset($_GET['with_total']) || isset($_GET['paginate']);
                $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 0;
                $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
                if (isset($_GET['page']) && $limit > 0) {
                    $page = max(1, (int)$_GET['page']);
                    $offset = ($page - 1) * $limit;
                } elseif (isset($_GET['page']) && $limit === 0) {
                    $limit = 50;
                    $page = max(1, (int)$_GET['page']);
                    $offset = ($page - 1) * $limit;
                }

                $total = null;
                if ($wantTotal) {
                    $cStmt = $pdo->prepare($baseCount . $whereSql);
                    $cStmt->execute($params);
                    $total = (int)$cStmt->fetchColumn();
                }

                $sql = $baseSelect . $whereSql . $orderSql;
                if ($limit > 0) {
                    $sql .= ' LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;
                }
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                attachWorkTeams($rows, 'repair');

                // คงรูปแบบผลลัพธ์เดิม (array) เพื่อความเข้ากันได้; คืนรูปแบบ object เมื่อขอ with_total/paginate อย่างชัดเจน
                if ($wantTotal) {
                    echo json_encode([
                        'items' => $rows,
                        'total' => $total,
                        'limit' => $limit > 0 ? $limit : null,
                        'offset' => $limit > 0 ? $offset : 0,
                    ], JSON_UNESCAPED_UNICODE);
                } else {
                    echo json_encode($rows);
                }
            }
            break;
        case 'POST':
            // POST อนุญาตแบบ anonymous (ฟอร์มสาธารณะ LINE LIFF) แต่ยังต้องผ่าน CSRF check
            enforceCsrf();

            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            // ประเมินงานซ่อม (tracking) — บันทึกคะแนน/ความคิดเห็นลง repair_ratings
            if (($data['action'] ?? '') === 'rate') {
                requireLogin($pdo);
                $rid = (int)($data['repair_id'] ?? 0);
                $score = (int)($data['rating_score'] ?? 0);
                $comment = trim((string)($data['rating_comment'] ?? ''));
                if ($rid <= 0 || $score < 1 || $score > 5) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid rating data', 'success' => false], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $st = $pdo->prepare('SELECT id, status, created_by, work_order_no FROM repair WHERE id = ?');
                $st->execute([$rid]);
                $repairRow = $st->fetch();
                if (!$repairRow) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Repair not found', 'success' => false], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $rStatus = strtolower(trim((string)($repairRow['status'] ?? '')));
                if (!in_array($rStatus, ['completed', 'closed', 'resolved'], true)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'สามารถประเมินได้เฉพาะงานที่ปิดงาน/เสร็จสิ้นแล้ว', 'success' => false], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $cu = currentUser($pdo);
                $ratedBy = $cu['id'] ?? null;
                $createdBy = isset($repairRow['created_by']) ? (int)$repairRow['created_by'] : 0;
                $canRate = false;
                if (function_exists('canSupervisor') && canSupervisor()) $canRate = true;
                if ($ratedBy && $createdBy > 0 && (int)$ratedBy === $createdBy) $canRate = true;
                if ($createdBy <= 0 && $ratedBy) $canRate = true; // ผู้แจ้งสาธารณะ/ไม่ระบุตัวตนผู้สร้าง — อนุญาตผู้ใช้ที่ล็อกอิน
                if (!$canRate) {
                    http_response_code(403);
                    echo json_encode(['error' => 'ไม่มีสิทธิ์ประเมินงานนี้', 'success' => false], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $ex = $pdo->prepare('SELECT id, rating_score, rating_comment FROM repair_ratings WHERE repair_id = ? ORDER BY id DESC LIMIT 1');
                $ex->execute([$rid]);
                $existing = $ex->fetch(PDO::FETCH_ASSOC);
                $existingId = $existing ? (int)$existing['id'] : 0;
                if ($existingId) {
                    $u = $pdo->prepare('UPDATE repair_ratings SET rating_score = ?, rating_comment = ?, rated_by = ?, created_at = NOW() WHERE id = ?');
                    $u->execute([$score, ($comment !== '' ? $comment : null), $ratedBy, $existingId]);
                    $ratingId = $existingId;
                } else {
                    $i = $pdo->prepare('INSERT INTO repair_ratings (repair_id, rating_score, rating_comment, rated_by) VALUES (?, ?, ?, ?)');
                    $i->execute([$rid, $score, ($comment !== '' ? $comment : null), $ratedBy]);
                    $ratingId = (int)$pdo->lastInsertId();
                }
                // บันทึกกิจกรรมการประเมิน (ถ้ามีตาราง)
                try {
                    $oldVal = $existing ? (($existing['rating_score'] ?? '') . '|' . ($existing['rating_comment'] ?? '')) : '';
                    $newVal = $score . '|' . $comment;
                    $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description, old_value, new_value, created_at) VALUES (?,?,?,?,?,?,NOW())')
                        ->execute([$rid, $ratedBy, $existingId ? 'rating_updated' : 'rating_created', 'บันทึกการประเมินงานซ่อม', $oldVal, $newVal]);
                } catch (Exception $e) {
                    // ไม่บล็อกการบันทึกคะแนนหากบันทึก log ไม่สำเร็จ
                }
                echo json_encode([
                    'success' => true,
                    'rating_id' => $ratingId,
                    'repair_id' => $rid,
                    'rating_score' => $score,
                    'rating_comment' => $comment,
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if (empty($data['work_order_no'])) {
                $data['work_order_no'] = generateWorkOrderNo($pdo);
            }
            // Phase 19: idempotency — form แจ้งซ่อม (offline queue) ส่งซ้ำไม่สร้างใบงานซ้ำ
            $idemKey = clientActionKeyFromRequest($data);
            if ($idemKey !== '') {
                $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/repair.php');
                if ($idem['status'] === 'replay') {
                    echo json_encode(['success' => true, 'dedup' => true, 'ref_id' => $idem['ref_id']]);
                    exit;
                }
                if ($idem['status'] !== 'new') {
                    clientActionFinish($pdo, $idemKey, 'conflict', null, null, 409);
                    http_response_code(409);
                    echo json_encode(['error' => 'รายการนี้ถูกส่งแล้วจากอุปกรณ์ของท่าน — ไม่ประมวลผลซ้ำ', 'code' => 'CLIENT_ACTION_UNCERTAIN'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
            // ไม่ได้ login (ฟอร์มสาธารณะจาก LINE) → ต้องมีชื่อผู้แจ้ง + เบอร์โทร
            // (ฟอร์ม /repair/request บังคับทั้งคู่ในขั้นตอน "ผู้แจ้ง & รูป")
            if (!currentUser($pdo)) {
                if (empty($data['receiver_name'])) {
                    clientActionFinish($pdo, $idemKey, 'failed', null, null, 400);
                    http_response_code(400);
                    echo json_encode(['error' => 'Missing receiver_name — ฟอร์มสาธารณะต้องระบุชื่อผู้แจ้ง']);
                    exit;
                }
                if (empty($data['reporter_phone'])) {
                    clientActionFinish($pdo, $idemKey, 'failed', null, null, 400);
                    http_response_code(400);
                    echo json_encode(['error' => 'Missing reporter_phone — ฟอร์มสาธารณะต้องระบุเบอร์โทรผู้แจ้ง']);
                    exit;
                }
            }
            repair_autofill_downtime($data);
            // อนุญาตแจ้งซ่อมโดยไม่ระบุเครื่องจักร: asset_id ว่าง/0 ให้เป็น NULL (กัน FK constraint)
            if (array_key_exists('asset_id', $data)) {
                $aid = $data['asset_id'];
                if ($aid === '' || $aid === '0' || $aid === 0 || $aid === null || $aid === 'null') {
                    $data['asset_id'] = null;
                }
            }
            $allowed = ['work_order_no', 'asset_id', 'assigned_to', 'created_by', 'priority', 'status', 'title', 'description', 'failure_report', 'diagnosis', 'resolution', 'downtime_start', 'downtime_end', 'downtime_minutes', 'cost_parts', 'cost_labor', 'cost_outsource', 'notes', 'repair_type_id', 'failure_code_id', 'repair_code_id', 'work_zone_id', 'location_id', 'department_id', 'safety_related', 'product_lot_no', 'machine_status', 'production_line_status', 'estimated_completion_date', 'actual_start_at', 'acknowledged_at', 'root_cause', 'solution', 'rejection_reason_id', 'rejection_note', 'before_image_path', 'after_image_path', 'receiver_name', 'receiver_signature_path', 'reporter_phone', 'reporter_email', 'office', 'completed_at', 'contaminate_checking', 'outsource_by', 'requested_parts', 'video_path', 'attachment_path'];
            // ---- บังคับผลตรวจการปนเปื้อนก่อนปิดงานซ่อม (โรงงานอาหาร — กันลืมตรวจ) ----
            $closingNow = (isset($data['status']) && strtolower((string)$data['status']) === 'completed') || isset($data['completed_at']);
            if ($closingNow) {
                $cc = strtolower((string)($data['contaminate_checking'] ?? 'not_checked'));
                if (!in_array($cc, ['clean', 'contaminated', 'not_applicable'], true)) {
                    clientActionFinish($pdo, $idemKey, 'failed', null, null, 400);
                    http_response_code(400);
                    echo json_encode(['error' => 'ต้องระบุผลตรวจการปนเปื้อน (ไม่พบการปนเปื้อน / พบการปนเปื้อน / ไม่เกี่ยวข้องกับงานนี้) ก่อนปิดใบงานซ่อม', 'code' => 'CONTAM_REQUIRED']);
                    exit;
                }
            }
            $cols = []; $vals = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $cols[] = $col; $vals[] = $data[$col]; }
            }
            if (empty($cols)) { clientActionFinish($pdo, $idemKey, 'failed', null, null, 400); http_response_code(400); echo json_encode(['error' => 'No data']); exit; }
            $placeholders = rtrim(str_repeat('?,', count($cols)), ',');
            $stmt = $pdo->prepare("INSERT INTO repair (" . implode(',', $cols) . ") VALUES ($placeholders)");
            $stmt->execute($vals);
            $newId = (int)$pdo->lastInsertId();
            clientActionFinish($pdo, $idemKey, 'success', 'repair', $newId, 200);
            echo json_encode(['success' => true, 'id' => $newId, 'work_order_no' => $data['work_order_no']]);

            // ---- อะไหล่ที่ใช้ซ่อม (ใบเบิกจากใบซ่อม) — ตัดสต็อก + ผูก repair_spare_parts ----
            if (!empty($data['spare_parts']) && is_array($data['spare_parts'])) {
                try {
                    $r = saveRepairSpareParts($pdo, $newId, $data['spare_parts']);
                    if (!empty($r['cost_parts'])) {
                        $pdo->prepare('UPDATE repair SET cost_parts = ? WHERE id = ?')->execute([$r['cost_parts'], $newId]);
                    }
                    $pdo->prepare("UPDATE repair SET spare_approval_status = 'pending', spare_approved_by = NULL, spare_approved_at = NULL WHERE id = ?")->execute([$newId]);
                } catch (Exception $e) {
                    error_log('[repair.php] spare_parts failed: ' . $e->getMessage());
                }
            }
            // ---- LINE แจ้งขอเบิกอะไหล่ → หัวหน้า/แอดมินอนุมัติ (ถ้ามีรายการ) ----
            if (!empty($data['spare_parts']) && is_array($data['spare_parts']) && getSettingValue('line_notify_enabled', '0') === '1') {
                try {
                    $sumParts = [];
                    $spareItems = [];
                    $gInfo = $pdo->prepare('SELECT code, image_url FROM spare_parts WHERE id = ?');
                    foreach ($data['spare_parts'] as $sp) {
                        $gInfo->execute([(int)($sp['spare_part_id'] ?? 0)]);
                        $info = $gInfo->fetch(PDO::FETCH_ASSOC);
                        $qty = (float)($sp['quantity_used'] ?? 0);
                        $cd = trim((string)($info['code'] ?? ''));
                        if ($cd !== '') $sumParts[] = $cd . ' x ' . $qty;
                        $iu = (string)($info['image_url'] ?? '');
                        if ($iu !== '') {
                            $iu = preg_match('#^https?://#i', $iu) ? $iu : linePhotoUrl($iu);
                        } else {
                            // ไม่มีรูปจริง — ใช้รูป placeholder อัตโนมัติ (รหัสอะไหล่บนพื้นสี)
                            $iu = publicBaseUrl() . '/api/v1/spare_image.php?id=' . (int)($sp['spare_part_id'] ?? 0);
                        }
                        $name = $cd !== '' ? $cd . ' x ' . rtrim(rtrim(number_format($qty, 2), '0'), '.') : '';
                        if ($name !== '' || $iu !== '') $spareItems[] = ['name' => $name, 'url' => $iu];
                    }
                    lineNotifySpareRequest([
                        '{work_order_id}' => (string)($data['work_order_no'] ?? ''),
                        '{items_summary}' => implode(', ', $sumParts),
                        '{requester_name}' => (string)($data['receiver_name'] ?? '-'),
                        '{total_cost}' => number_format((float)($r['cost_parts'] ?? 0)),
                    ], publicBaseUrl() . '/repair/view?id=' . $newId, ['items' => $spareItems]);
                } catch (Exception $e) {
                    error_log('[repair.php] spare_request notify failed: ' . $e->getMessage());
                }
            }

            // ---- ผู้รับผิดชอบหลายคน (ทีมซ่อม) — assigned_to = หัวหน้าชุด, team_ids = ทุกคน ----
            if ((isset($data['team_ids']) && is_array($data['team_ids'])) || !empty($data['assigned_to'])) {
                try {
                    $teamIds = isset($data['team_ids']) && is_array($data['team_ids']) ? $data['team_ids'] : [];
                    $leadId = (int)($data['assigned_to'] ?? 0);
                    $cu = currentUser($pdo);
                    $res = setWorkAssignees($pdo, 'repair', $newId, $teamIds, $leadId, $cu['id'] ?? null);
                    if (getSettingValue('line_notify_enabled', '0') === '1' && !empty($res['added'])) {
                        $q = $pdo->prepare("SELECT r.work_order_no, a.code AS asset_code, a.name AS asset_name, r.title
                                            FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id WHERE r.id = ?");
                        $q->execute([$newId]);
                        $rw = $q->fetch(PDO::FETCH_ASSOC);
                        if ($rw) {
                            $vars = [
                                '{work_order_id}' => (string)($rw['work_order_no'] ?? ''),
                                '{asset_code}' => (string)($rw['asset_code'] ?? '-'),
                                '{asset_name}' => (string)($rw['asset_name'] ?? ''),
                                '{title}' => mb_substr((string)($rw['title'] ?? ''), 0, 200),
                                '{priority}' => strtoupper((string)($data['priority'] ?? 'NORMAL')),
                                '{status}' => (string)($data['status'] ?? 'open'),
                                '{assigner_name}' => (string)($cu['full_name'] ?? '-'),
                            ];
                            foreach ($res['added'] as $uid) {
                                lineNotifyAssigned((int)$uid, $vars, publicBaseUrl() . '/repair/view?id=' . $newId);
                            }
                        }
                    }
                } catch (Exception $e) {
                    error_log('[repair.php] team save failed: ' . $e->getMessage());
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
                }
            } catch (Exception $e) {
                error_log("[repair.php] LINE notify failed: " . $e->getMessage());
            }

            // ---- Telegram แจ้งงานซ่อมใหม่ (เหมือน LINE — อิสระจากสวิตช์ LINE เพื่อถนอม quota LINE ระหว่างทดสอบ) ----
            try {
                if (getSettingValue('telegram_enabled', '1') === '1') {
                    $assetCode = ''; $assetName = '';
                    if (!empty($data['asset_id'])) {
                        $st = $pdo->prepare("SELECT code, name FROM asset_registry WHERE id = ?");
                        $st->execute([(int)$data['asset_id']]);
                        $a = $st->fetch();
                        if ($a) { $assetCode = $a['code']; $assetName = $a['name']; }
                    }
                    $wo = $data['work_order_no'] ?? 'EN-????-???';
                    $priority = strtoupper((string)($data['priority'] ?? 'NORMAL'));
                    $isUrgent = !empty($data['is_urgent']) || $priority === 'CRITICAL' || strtolower((string)($data['machine_status'] ?? '')) === 'down';
                    $msg = ($isUrgent ? "เครื่องจักรหยุดทำงานด่วน!\n" : "มีงานซ่อมใหม่เข้า\n") .
                        "ใบงาน: $wo\n" .
                        "เครื่อง: " . ($assetCode ?: '-') . ($assetName ? " $assetName" : '') . "\n" .
                        "อาการ: " . mb_substr((string)($data['title'] ?? 'งานซ่อมใหม่'), 0, 200) . "\n" .
                        "ความเร่งด่วน: $priority\n" .
                        "สถานะ: " . (string)($data['status'] ?? 'PENDING') . "\n" .
                        "ผู้แจ้ง: " . (string)($data['receiver_name'] ?? '-') . "\n" .
                        "สถานะเครื่อง: " . (string)($data['machine_status'] ?? '-');
                    telegramAdminAlert(
                        $isUrgent ? "แจ้งซ่อมด่วน $wo" : "งานซ่อมใหม่ $wo",
                        $msg,
                        publicBaseUrl() . '/repair/view?id=' . $newId,
                        $isUrgent ? 'ERROR' : 'INFO'
                    );
                }
            } catch (Exception $e) {
                error_log("[repair.php] Telegram notify failed: " . $e->getMessage());
            }
            // ---- Notification Center inbox (app channel — LINE/Telegram ส่งไปแล้วข้างบน) ----
            try {
                $cuCreate = currentUser($pdo);
                $createdUsers = [];
                if (!empty($data['assigned_to'])) $createdUsers[] = (int)$data['assigned_to'];
                if (!empty($data['team_ids']) && is_array($data['team_ids'])) {
                    foreach ($data['team_ids'] as $tm) if ((int)$tm > 0) $createdUsers[] = (int)$tm;
                }
                NotificationCenterService::notify($pdo, [
                    'module' => 'repair', 'event' => 'created', 'type' => 'work_order',
                    'ref_type' => 'repair', 'ref_id' => $newId,
                    'template' => 'repair:created',
                    'vars' => [
                        'work_order_no' => (string)($data['work_order_no'] ?? ''),
                        'title' => (string)($data['title'] ?? 'งานซ่อมใหม่'),
                        'asset_code' => (string)($assetCode ?? ''), 'asset_name' => (string)($assetName ?? ''),
                        'priority' => (string)($data['priority'] ?? 'normal'),
                        'status' => (string)($data['status'] ?? 'open'),
                        'reporter_name' => (string)($data['receiver_name'] ?? ''),
                    ],
                    'users' => $createdUsers,
                    'roles' => [1, 2, 6],
                    'exclude_users' => $cuCreate && (int)$cuCreate['id'] ? [(int)$cuCreate['id']] : [],
                    'channels' => ['app'],
                    'url' => '/repair/view?id=' . $newId,
                ]);
            } catch (Exception $e) {
                error_log('[repair.php] center notify create failed: ' . $e->getMessage());
            }
            break;
        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }
            // อนุญาตกรณีไม่ระบุเครื่องจักร: asset_id ว่าง/0 ให้เป็น NULL
            if (array_key_exists('asset_id', $data)) {
                $aid = $data['asset_id'];
                if ($aid === '' || $aid === '0' || $aid === 0 || $aid === null || $aid === 'null') {
                    $data['asset_id'] = null;
                }
            }
            // Phase 19: idempotency — ป้องกัน offline sync queue ส่งซ้ำ (network timeout / retry)
            $idemKey = clientActionKeyFromRequest($data);
            if ($idemKey !== '') {
                $idem = clientActionBegin($pdo, $idemKey, 'PUT', '/api/v1/repair.php');
                if ($idem['status'] === 'replay') {
                    echo json_encode(['success' => true, 'dedup' => true, 'ref_id' => $idem['ref_id']]);
                    exit;
                }
                if ($idem['status'] !== 'new') {
                    clientActionFinish($pdo, $idemKey, 'conflict', null, null, 409);
                    http_response_code(409);
                    echo json_encode(['error' => 'รายการนี้ถูกส่งแล้วจากอุปกรณ์ของท่าน — ไม่ประมวลผลซ้ำ', 'code' => 'CLIENT_ACTION_UNCERTAIN'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
            // Phase 14: สถานะใน Supervisor workflow ต้องจัดการผ่าน supervisor.php เท่านั้น
            if (isset($data['status'])) {
                $wantedStatus = trim((string)$data['status']);
                if (in_array($wantedStatus, $P14_ONLY_STATUSES, true) && !canSupervisor()) {
                    clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 403);
                    http_response_code(403);
                    echo json_encode(['error' => 'สถานะนี้จัดการผ่าน Supervisor Workflow หน้า /supervisor เท่านั้น (ห้ามข้ามขั้นตอน)'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
            // โหลดสถานะปัจจุบันของใบงาน (ใช้ตรวจ conflict, auto-stamp เวลา, และตรวจเงื่อนไขปิดงาน)
            $curStmt = $pdo->prepare('SELECT * FROM repair WHERE id = ?');
            $curStmt->execute([$id]);
            $curRow = $curStmt->fetch(PDO::FETCH_ASSOC);
            if (!$curRow) {
                clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 404);
                http_response_code(404); echo json_encode(['error' => 'Not found']); exit;
            }

            // Phase 19: conflict detection — ถ้าใบงานถูกแก้จากระบบระหว่างที่ช่างออฟไลน์ → กันเขียนทับ
            if (!empty($data['base_updated_at']) && (isset($data['status']) || isset($data['completed_at']))) {
                $curUpd = $curRow['updated_at'] ?? null;
                $wantedStatus = strtolower((string)($data['status'] ?? ($curRow['status'] ?? '')));
                $isTerminalOrFlow = in_array($wantedStatus, ['completed', 'in_progress', 'paused', 'waiting_parts', 'closed', 'verified'], true);
                if ($curUpd && strtotime((string)$data['base_updated_at']) !== strtotime((string)$curUpd) && $isTerminalOrFlow) {
                    clientActionFinish($pdo, $idemKey, 'conflict', 'repair', $id, 409);
                    http_response_code(409);
                    echo json_encode([
                        'error' => 'ข้อมูลรายการนี้ถูกแก้ไขจากระบบแล้ว — กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',
                        'code' => 'CONFLICT',
                        'current' => ['status' => $curRow['status'] ?? null, 'updated_at' => $curUpd],
                    ], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
            // ช่างกด "รับงาน" — ทำงานก่อนเช็คฟิลด์อื่น (ส่งมาแค่ assignee_accept ตัวเดียวก็ได้)
            $accepted = false;
            if (!empty($data['assignee_accept'])) {
                $cu = currentUser($pdo);
                if ($cu && $cu['id']) {
                    acceptWorkAssignment($pdo, 'repair', $id, (int)$cu['id']);
                    // Phase 14: รับงานแล้ว → ยกระดับใบงาน assigned/approved → accepted
                    try {
                        $curStatus = $curRow['status'] ?? null;
                        if (in_array($curStatus, ['pending_approval', 'approved', 'assigned'], true)) {
                            $pdo->prepare('UPDATE repair SET status = "accepted", status_changed_at = NOW() WHERE id = ?')->execute([$id]);
                            $curRow['status'] = 'accepted';
                        }
                    } catch (Exception $e) {
                        error_log('[repair.php] accept status upgrade failed: ' . $e->getMessage());
                    }
                    $accepted = true;
                    // Notification Center inbox — งานถูกช่างรับแล้ว (มีช่องทาง LINE/SMS เดิมหรือไม่ก็ตาม)
                    try {
                        $aw = $pdo->prepare("SELECT r.work_order_no, r.title, r.priority, r.assigned_to, a.code AS asset_code, a.name AS asset_name
                                              FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id WHERE r.id = ?");
                        $aw->execute([$id]);
                        $awRow = $aw->fetch(PDO::FETCH_ASSOC);
                        if ($awRow) {
                            NotificationCenterService::notify($pdo, [
                                'module' => 'repair', 'event' => 'accepted', 'type' => 'work_order',
                                'ref_type' => 'repair', 'ref_id' => $id,
                                'template' => 'repair:accepted',
                                'vars' => [
                                    'work_order_no' => (string)$awRow['work_order_no'],
                                    'title' => (string)$awRow['title'],
                                    'asset_code' => (string)$awRow['asset_code'],
                                    'assignee_name' => (string)($cu['full_name'] ?? ''),
                                ],
                                'users' => [(int)$awRow['assigned_to'], (int)$cu['id']],
                                'roles' => [1, 2, 6],
                                'exclude_users' => [(int)$cu['id']],
                                'channels' => ['app'],
                                'url' => '/repair/view?id=' . $id,
                            ]);
                        }
                    } catch (Exception $e) {
                        error_log('[repair.php] center notify accept failed: ' . $e->getMessage());
                    }
                }
            }

            // ---- เวลาเริ่ม/เสร็จซ่อม: ห้ามแก้ไขเอง — ประทับอัตโนมัติตามการเปลี่ยนสถานะ ----
            $oldStatus = strtolower((string)($curRow['status'] ?? ''));
            $newStatus = strtolower((string)($data['status'] ?? $oldStatus));
            // ไม่รับค่าจากผู้ใช้ (ห้ามแก้ไขเวลาเริ่ม/เสร็จ)
            unset($data['actual_start_at'], $data['completed_at'], $data['downtime_start'], $data['downtime_end']);

            $inProgressStatuses = ['in_progress', 'waiting_parts', 'paused', 'waiting_external', 'waiting_approval', 'pending_verification'];
            $startedNow = in_array($newStatus, $inProgressStatuses, true) && !in_array($oldStatus, $inProgressStatuses, true) && $oldStatus !== 'completed' && $oldStatus !== 'closed' && $oldStatus !== 'verified';
            $startMissing = in_array($newStatus, $inProgressStatuses, true) && empty($curRow['actual_start_at']) && empty($curRow['downtime_start']);
            if ($startedNow || $startMissing) {
                $stampStart = date('Y-m-d H:i:s');
                if (empty($curRow['actual_start_at'])) $data['actual_start_at'] = $stampStart;
                if (empty($curRow['downtime_start'])) $data['downtime_start'] = $stampStart;
            }

            $completedNow = ($newStatus === 'completed' && $oldStatus !== 'completed');
            if ($completedNow) {
                $stampEnd = date('Y-m-d H:i:s');
                if (empty($curRow['completed_at'])) $data['completed_at'] = $stampEnd;
                if (empty($curRow['downtime_end'])) $data['downtime_end'] = $stampEnd;
            }

            repair_autofill_downtime($data);
            $allowed = ['work_order_no', 'asset_id', 'assigned_to', 'priority', 'status', 'title', 'description', 'failure_report', 'diagnosis', 'resolution', 'downtime_start', 'downtime_end', 'downtime_minutes', 'cost_parts', 'cost_labor', 'cost_outsource', 'notes', 'repair_type_id', 'failure_code_id', 'repair_code_id', 'work_zone_id', 'location_id', 'department_id', 'safety_related', 'product_lot_no', 'machine_status', 'production_line_status', 'estimated_completion_date', 'actual_start_at', 'acknowledged_at', 'root_cause', 'solution', 'rejection_reason_id', 'rejection_note', 'before_image_path', 'after_image_path', 'receiver_name', 'receiver_signature_path', 'completed_at', 'contaminate_checking', 'outsource_by', 'requested_parts', 'video_path', 'attachment_path'];
            // Phase 14: ฟิลด์วางแผนเปิดเฉพาะหัวหน้างาน (Admin/Manager/ASST Manager/Foreman)
            if (canSupervisor()) {
                $allowed = array_merge($allowed, ['work_order_type', 'planned_start_at', 'planned_end_at', 'estimated_duration_minutes', 'required_skill', 'required_tools', 'safety_requirement', 'instructions', 'sla_due_at']);
            }
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (isset($data[$col])) { $fields[] = "$col = ?"; $values[] = $data[$col]; }
            }
            if (empty($fields)) {
                if ($accepted) {
                    clientActionFinish($pdo, $idemKey, 'success', 'repair', $id, 200);
                    echo json_encode(['success' => true, 'accepted' => true]); exit;
                }
                clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 400);
                http_response_code(400); echo json_encode(['error' => 'No data']); exit;
            }
            // ---- บังคับผลตรวจการปนเปื้อนและข้อมูลปิดงานก่อนปิดงานซ่อม ----
            $closingNow = ($newStatus === 'completed');
            $newlyClosing = ($newStatus === 'completed' && $oldStatus !== 'completed' && $oldStatus !== 'closed');
            if ($closingNow) {
                $cc = strtolower((string)($data['contaminate_checking'] ?? $curRow['contaminate_checking'] ?? 'not_checked'));
                if (!in_array($cc, ['clean', 'contaminated', 'not_applicable'], true)) {
                    clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 400);
                    http_response_code(400);
                    echo json_encode(['error' => 'ต้องระบุผลตรวจการปนเปื้อน (ไม่พบการปนเปื้อน / พบการปนเปื้อน / ไม่เกี่ยวข้องกับงานนี้) ก่อนปิดใบงานซ่อม', 'code' => 'CONTAM_REQUIRED'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                // บังคับข้อมูลสำหรับวิเคราะห์สาเหตุ/ปิดงาน
                $cr = $curRow;
                $needRoot = getSettingValue('require_root_cause', '1') === '1';
                $needFail = getSettingValue('require_failure_code', '0') === '1';
                $rc = trim((string)($data['root_cause'] ?? $cr['root_cause'] ?? ''));
                $sol = trim((string)($data['solution'] ?? $data['resolution'] ?? $cr['solution'] ?? $cr['resolution'] ?? ''));
                $fc = isset($data['failure_code_id']) ? (int)$data['failure_code_id'] : (int)($cr['failure_code_id'] ?? 0);
                $errs = [];
                if ($needRoot && $rc === '') $errs[] = 'ต้องระบุสาเหตุรากก่อนปิดงาน';
                if ($sol === '') $errs[] = 'ต้องระบุวิธีแก้ไขก่อนปิดงาน';
                if ($needFail && $fc <= 0) $errs[] = 'ต้องเลือกรหัสการเสีย (Failure Code) ก่อนปิดงาน';
                // ผู้แจ้งต้องเซ็นรับจากช่างตอนปิดงาน (บังคับเมื่อปิดงานครั้งแรก; ใบงานที่ปิดแล้วแบบเดิมที่ยังไม่มีลายเซ็นไม่บังคับย้อนหลังเมื่อแก้ไข)
                $recvSig = trim((string)($data['receiver_signature_path'] ?? $cr['receiver_signature_path'] ?? ''));
                if ($newlyClosing && $recvSig === '') $errs[] = 'ต้องมีลายเซ็นรับงานจากผู้แจ้งก่อนปิดงาน';
                if (function_exists('failure_repair_close_blockers')) {
                    $errs = array_merge($errs, failure_repair_close_blockers($pdo, $id));
                }
                if ($errs) {
                    clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 400);
                    http_response_code(400);
                    echo json_encode(['error' => implode(' ', $errs), 'code' => 'CLOSURE_INCOMPLETE', 'errors' => $errs], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
            $values[] = $id;
            $qOld = $pdo->prepare('SELECT assigned_to FROM repair WHERE id = ?');
            $qOld = $pdo->prepare('SELECT assigned_to FROM repair WHERE id = ?');
            $qOld->execute([$id]);
            $oldAssignedTo = (int)($qOld->fetchColumn() ?: 0);
            $stmt = $pdo->prepare("UPDATE repair SET " . implode(',', $fields) . " WHERE id = ?");
            $stmt->execute($values);

            // ---- อะไหล่ที่ใช้ซ่อม (ใบเบิกจากใบซ่อม) — แทนที่รายการ + ตัดสต็อก + คำนวณต้นทุนรวม ----
            if (isset($data['spare_parts']) && is_array($data['spare_parts'])) {
                try {
                    $r = saveRepairSpareParts($pdo, $id, $data['spare_parts'], true);
                    if (!empty($r['cost_parts'])) {
                        $pdo->prepare('UPDATE repair SET cost_parts = ? WHERE id = ?')->execute([$r['cost_parts'], $id]);
                    }
                    $pdo->prepare("UPDATE repair SET spare_approval_status = 'pending', spare_approved_by = NULL, spare_approved_at = NULL WHERE id = ?")->execute([$id]);
                } catch (Exception $e) {
                    error_log('[repair.php] spare_parts failed: ' . $e->getMessage());
                }
            }
            // ---- แจ้งเตือน: งานถูกมอบหมาย → ช่างผู้รับ + ขอเบิกอะไหล่ → หัวหน้า/แอดมินอนุมัติ (LINE + Telegram เหมือนกัน) ----
            try {
                $q = $pdo->prepare("SELECT r.*, a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
                                    FROM repair r
                                    LEFT JOIN asset_registry a ON a.id = r.asset_id
                                    LEFT JOIN users u ON u.id = r.assigned_to
                                    WHERE r.id = ?");
                $q->execute([$id]);
                $row = $q->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $detailUrl = publicBaseUrl() . '/repair/view?id=' . $id;
                    // 1) งานถูกมอบหมาย → บันทึกทีม (lead + ทีม) + แจ้งถึงผู้ถูกเพิ่มทุกคน
                    $teamChanged = (isset($data['team_ids']) && is_array($data['team_ids'])) || (isset($data['assigned_to']) && (int)$data['assigned_to'] !== $oldAssignedTo);
                    if ($teamChanged) {
                        $teamIds = isset($data['team_ids']) && is_array($data['team_ids']) ? array_map('intval', $data['team_ids']) : array_map(fn($m) => (int)$m['user_id'], getWorkAssignees($pdo, 'repair', $id));
                        $leadIdAssign = (int)($data['assigned_to'] ?? $oldAssignedTo);
                        if ($leadIdAssign > 0 && !in_array($leadIdAssign, $teamIds, true)) {
                            $teamIds[] = $leadIdAssign;
                        }
                        // Competency/certification gate
                        try {
                            $cfgWf = wf_config($pdo);
                            $woRow = $row;
                            $req = wf_required_skills_for_work_order($pdo, $woRow);
                            if ($cfgWf['block_unqualified'] && !empty($req['unmapped'])) {
                                clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 409);
                                http_response_code(409);
                                echo json_encode(['error' => 'ใบงานระบุทักษะที่ยังไม่ผูกกับ catalog: ' . implode(', ', $req['unmapped']) . ' — ปิดกั้นการมอบหมาย', 'code' => 'WF_UNMAPPED_REQUIREMENT'], JSON_UNESCAPED_UNICODE);
                                exit;
                            }
                            $perPerson = array_values(array_filter($req['required'], fn($r) => empty($r['require_any_of'])));
                            $teamLevel = array_values(array_filter($req['required'], fn($r) => !empty($r['require_any_of'])));
                            $dateAssign = substr((string)($woRow['planned_start_at'] ?? ''), 0, 10) ?: date('Y-m-d');
                            foreach ($teamIds as $uidCheck) {
                                $qual = wf_qualification($pdo, (int)$uidCheck, $perPerson, $dateAssign);
                                $av = wf_availability($pdo, (int)$uidCheck, $dateAssign, $cfgWf);
                                $codes = array_merge($qual['reason_codes'] ?? [], $av['reasons'] ?? []);
                                if (empty($qual['has_skill_data']) && $perPerson) $codes[] = 'NO_SKILL_DATA';
                                $codes = array_values(array_unique(array_filter($codes)));
                                if ($codes && $cfgWf['block_unqualified']) {
                                    clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 409);
                                    http_response_code(409);
                                    echo json_encode(['error' => 'มอบหมายไม่ได้: ' . wf_user_label($pdo, (int)$uidCheck) . ' — ' . implode(', ', array_map(fn($c) => (WF_CONFLICT_REASONS[$c] ?? $c), $codes)), 'code' => 'WF_UNQUALIFIED'], JSON_UNESCAPED_UNICODE);
                                    exit;
                                }
                            }
                            foreach ($teamLevel as $rReq) {
                                $holders = [];
                                foreach ($teamIds as $u) {
                                    $q = wf_qualification($pdo, (int)$u, [$rReq], $dateAssign);
                                    if (!empty($q['qualified'])) $holders[] = (int)$u;
                                }
                                if (!$holders && $cfgWf['block_unqualified']) {
                                    $sname = (string)($rReq['name'] ?? ('skill#' . ($rReq['skill_id'] ?? '')));
                                    clientActionFinish($pdo, $idemKey, 'failed', 'repair', $id, 409);
                                    http_response_code(409);
                                    echo json_encode(['error' => 'มอบหมายไม่ได้: ' . $sname . ' — ' . (WF_CONFLICT_REASONS['TEAM_SKILL_GAP'] ?? 'TEAM_SKILL_GAP'), 'code' => 'WF_TEAM_SKILL_GAP'], JSON_UNESCAPED_UNICODE);
                                    exit;
                                }
                            }
                        } catch (Exception $e) {
                            if ($e->getCode() >= 400 && $e->getCode() < 600) {
                                throw $e;
                            }
                            error_log('[repair.php] wf gate failed: ' . $e->getMessage());
                        }
                        $cu = currentUser($pdo);
                        $res = setWorkAssignees($pdo, 'repair', $id, $teamIds, $leadIdAssign > 0 ? $leadIdAssign : (int)($data['assigned_to'] ?? $oldAssignedTo), $cu['id'] ?? null);

                        if (!empty($res['added'])) {
                            $names = [];
                            foreach ((array)$res['added'] as $uid) {
                                $st = $pdo->prepare("SELECT full_name FROM users WHERE id = ? AND is_active = 1");
                                $st->execute([(int)$uid]);
                                $n = $st->fetchColumn();
                                if ($n) $names[] = (string)$n;
                                if (getSettingValue('line_notify_enabled', '0') === '1') {
                                    lineNotifyAssigned((int)$uid, [
                                        '{work_order_id}' => (string)($row['work_order_no'] ?? ''),
                                        '{asset_code}' => (string)($row['asset_code'] ?? '-'),
                                        '{asset_name}' => (string)($row['asset_name'] ?? ''),
                                        '{title}' => mb_substr((string)($row['title'] ?? ''), 0, 200),
                                        '{priority}' => (string)($row['priority'] ?? ''),
                                        '{status}' => (string)($row['status'] ?? ''),
                                        '{assigner_name}' => (string)($cu['full_name'] ?? '-'),
                                    ], $detailUrl);
                                }
                            }
                            // Telegram — เหมือน LINE งานถูกมอบหมาย
                            if (getSettingValue('telegram_enabled', '1') === '1') {
                                telegramAdminAlert(
                                    "งานถูกมอบหมาย " . ($row['work_order_no'] ?? ''),
                                    "ใบงาน: " . ($row['work_order_no'] ?? '') . "\n" .
                                    "เครื่อง: " . ($row['asset_code'] ?? '-') . ($row['asset_name'] ? " {$row['asset_name']}" : '') . "\n" .
                                    "มอบหมายให้: " . (implode(', ', $names) ?: '-') . "\n" .
                                    "โดย: " . ($cu['full_name'] ?? '-'),
                                    $detailUrl,
                                    'INFO'
                                );
                            }
                        }
                    }
                    // 2) เบิกอะไหล่ → หัวหน้า/แอดมินอนุมัติ
                    if (isset($data['spare_parts']) && is_array($data['spare_parts']) && !empty($data['spare_parts'])) {
                        $sumParts = [];
                        $spareItems = [];
                        $gInfo = $pdo->prepare('SELECT code, image_url FROM spare_parts WHERE id = ?');
                        foreach ($data['spare_parts'] as $sp) {
                            $gInfo->execute([(int)($sp['spare_part_id'] ?? 0)]);
                            $info = $gInfo->fetch(PDO::FETCH_ASSOC);
                            $qty = (float)($sp['quantity_used'] ?? 0);
                            $cd = trim((string)($info['code'] ?? ''));
                            if ($cd !== '') $sumParts[] = $cd . ' x ' . $qty;
                            $iu = (string)($info['image_url'] ?? '');
                            if ($iu !== '') {
                                $iu = preg_match('#^https?://#i', $iu) ? $iu : linePhotoUrl($iu);
                            } else {
                                // ไม่มีรูปจริง — ใช้รูป placeholder อัตโนมัติ (รหัสอะไหล่บนพื้นสี)
                                $iu = publicBaseUrl() . '/api/v1/spare_image.php?id=' . (int)($sp['spare_part_id'] ?? 0);
                            }
                            $name = $cd !== '' ? $cd . ' x ' . rtrim(rtrim(number_format($qty, 2), '0'), '.') : '';
                            if ($name !== '' || $iu !== '') $spareItems[] = ['name' => $name, 'url' => $iu];
                        }
                        if (getSettingValue('line_notify_enabled', '0') === '1') {
                            lineNotifySpareRequest([
                                '{work_order_id}' => (string)($row['work_order_no'] ?? ''),
                                '{items_summary}' => implode(', ', $sumParts),
                                '{requester_name}' => (string)($row['assigned_name'] ?? '-'),
                                '{total_cost}' => number_format((float)($r['cost_parts'] ?? 0)),
                            ], $detailUrl, ['items' => $spareItems]);
                        }
                        // Telegram — เหมือน LINE ขออนุมัติเบิกอะไหล่
                        if (getSettingValue('telegram_enabled', '1') === '1') {
                            telegramAdminAlert(
                                "ขออนุมัติเบิกอะไหล่ " . ($row['work_order_no'] ?? ''),
                                "ใบงาน: " . ($row['work_order_no'] ?? '') . "\n" .
                                "รายการ: " . (implode(', ', $sumParts) ?: '-') . "\n" .
                                "ผู้ขอเบิก: " . ($row['assigned_name'] ?? '-') . "\n" .
                                "รวมมูลค่า: " . number_format((float)($r['cost_parts'] ?? 0)) . " บาท",
                                $detailUrl,
                                'WARN'
                            );
                        }
                    }
                }
            } catch (Exception $e) {
                error_log("[repair.php] assign/spare notify failed: " . $e->getMessage());
            }
            clientActionFinish($pdo, $idemKey, 'success', 'repair', $id, 200);
            echo json_encode(['success' => true]);

            // ---- แจ้งเตือนเมื่อปิดงานซ่อม (completed) — LINE เทมเพลต line_tpl_completed + Telegram เหมือน LINE ----
            try {
                $isCompleted = (isset($data['status']) && $data['status'] === 'completed') || isset($data['completed_at']);
                if ($isCompleted) {
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
                        $detailUrl = publicBaseUrl() . '/repair/view?id=' . $id;

                        if (getSettingValue('line_notify_enabled', '0') === '1') {
                            $cv = [
                                '{work_order_id}' => (string)($row['work_order_no'] ?? 'EN-????-???'),
                                '{asset_code}' => (string)($row['asset_code'] ?? '-'),
                                '{asset_name}' => (string)($row['asset_name'] ?? ''),
                                '{title}' => mb_substr((string)($row['title'] ?? ''), 0, 200),
                                '{downtime_hours}' => number_format($dt, 1),
                                '{total_cost}' => number_format($totalCost),
                                '{assigned_name}' => (string)($row['assigned_name'] ?? '-'),
                            ];
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

                        // Telegram — เหมือน LINE ปิดงานซ่อม
                        if (getSettingValue('telegram_enabled', '1') === '1') {
                            telegramAdminAlert(
                                "ซ่อมเสร็จเรียบร้อย " . ($row['work_order_no'] ?? 'EN-????-???'),
                                "ใบงาน: " . ($row['work_order_no'] ?? 'EN-????-???') . "\n" .
                                "เครื่อง: " . ($row['asset_code'] ?? '-') . ($row['asset_name'] ? " {$row['asset_name']}" : '') . "\n" .
                                "อาการ: " . mb_substr((string)($row['title'] ?? ''), 0, 200) . "\n" .
                                "Downtime: " . number_format($dt, 1) . " ชม.\n" .
                                "ค่าซ่อมรวม: " . number_format($totalCost) . " บาท\n" .
                                "ช่างผู้ปิดงาน: " . ($row['assigned_name'] ?? '-'),
                                $detailUrl,
                                'SUCCESS'
                            );
                        }
                    }
                }
            } catch (Exception $e) {
                error_log("[repair.php] completed notify failed: " . $e->getMessage());
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
    api_safe_catch($e);
}
