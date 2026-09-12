<?php
/**
 * pm_plans.php — PM Master Plans (pm_am_plans) + การ Generate รอบ PM และ Work Order
 *
 * Endpoints:
 *   GET  /api/v1/pm_plans.php                    → รายการแผน PM พร้อมสถิติ (asset_count, template_count, next_due, last_done)
 *   GET  /api/v1/pm_plans.php?id=N               → รายละเอียดแผน + assets + templates(+items) + ประวัติรอบ
 *   GET  /api/v1/pm_plans.php?action=overdue     → sync สถานะ overdue (ตาม due_date) แล้วคืนสรุป
 *   POST /api/v1/pm_plans.php                    → สร้างแผน + ลิงก์ assets/templates
 *   PUT  /api/v1/pm_plans.php?id=N               → แก้แผน + แทนที่ลิงก์ assets/templates
 *   DELETE /api/v1/pm_plans.php?id=N             → soft-delete (status=cancelled) ถ้ามีประวัติ, ลบลิงก์ถ้ายังไม่มี
 *   POST /api/v1/pm_plans.php?action=generate    → สร้างรอบ PM (pm_am) จากแผนพร้อมทุก asset (dedup + ตามความถี่)
 *   POST /api/v1/pm_plans.php?action=generate_wo → สร้าง Work Order (repair, source_type='pm') จากรอบ PM (กันซ้ำ)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/work_order.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    /** ความถี่ → ตัวช่วยคำนวณรอบถัดไป */
    $calcNextDue = function (string $base, string $freq, int $interval = 1): string {
        $interval = max(1, $interval);
        return match ($freq) {
            'daily'       => date('Y-m-d', strtotime("$base + $interval days")),
            'weekly'      => date('Y-m-d', strtotime("$base + " . ($interval * 7) . " days")),
            'monthly'     => date('Y-m-d', strtotime("$base + $interval months")),
            'quarterly'   => date('Y-m-d', strtotime("$base + " . ($interval * 3) . " months")),
            'semi_annual' => date('Y-m-d', strtotime("$base + " . ($interval * 6) . " months")),
            'yearly'      => date('Y-m-d', strtotime("$base + $interval years")),
            default       => date('Y-m-d', strtotime("$base + $interval days")), // custom / meter_based
        };
    };

    /** ค่าเริ่มต้นรอบถัดไปจากความถี่ จริง ๆ ใช้ last_done_date ของ asset นี้หรือ due ต่ำสุด */
    $loadPlanAssets = function (int $planId): array {
        global $pdo;
        $stmt = $pdo->prepare("SELECT a.id, a.code, a.name, a.location, a.criticality FROM pm_am_plan_assets pa JOIN asset_registry a ON a.id = pa.asset_id WHERE pa.plan_id = ? ORDER BY a.code");
        $stmt->execute([$planId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    };
    $loadPlanTemplates = function (int $planId): array {
        global $pdo;
        $stmt = $pdo->prepare("SELECT ct.id, ct.code, ct.name, ct.category FROM pm_am_plan_checklists pc JOIN checklist_templates ct ON ct.id = pc.template_id WHERE pc.plan_id = ? ORDER BY ct.name");
        $stmt->execute([$planId]);
        $list = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($list as &$t) {
            $sti = $pdo->prepare('SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY item_order, id');
            $sti->execute([$t['id']]);
            $t['items'] = $sti->fetchAll(PDO::FETCH_ASSOC);
        }
        return $list;
    };
    /** PM Planned Parts — อะไหล่ที่วางแผนไว้ในแผน PM (อ้างอิงด้วย Sage Item Code) */
    $loadPlanParts = function (int $planId): array {
        global $pdo;
        $stmt = $pdo->prepare("SELECT id, sage_item_code, item_description, unit, qty, note, created_at FROM pm_planned_parts WHERE plan_id = ? ORDER BY id ASC");
        $stmt->execute([$planId]);
        $parts = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($parts as &$p) { $p['qty'] = (float)$p['qty']; }
        return $parts;
    };

    switch ($method) {
        case 'GET':
            // ---- SYNC สถานะ overdue (ตาม due_date จริง ไม่ใช่ค่าซ้อน) ----
            if (isset($_GET['action']) && $_GET['action'] === 'overdue') {
                $today = date('Y-m-d');
                $pdo->prepare("UPDATE pm_am SET status='overdue' WHERE status='pending' AND due_date IS NOT NULL AND due_date < ?")->execute([$today]);
                $pdo->prepare("UPDATE pm_am SET status='pending' WHERE status='overdue' AND due_date IS NOT NULL AND due_date >= ?")->execute([$today]);
                $sum = [];
                foreach ($pdo->query("SELECT status, COUNT(*) c FROM pm_am GROUP BY status")->fetchAll(PDO::FETCH_ASSOC) as $r) $sum[$r['status']] = (int)$r['c'];
                echo json_encode(['success' => true, 'status' => $sum]);
                exit;
            }

            // ---- AUTO SYNC สถานะ overdue ตาม due_date จริง (ทุกการอ่าน) ----
            $today = date('Y-m-d');
            $pdo->prepare("UPDATE pm_am SET status='overdue' WHERE status='pending' AND due_date IS NOT NULL AND due_date < ?")->execute([$today]);
            $pdo->prepare("UPDATE pm_am SET status='pending' WHERE status='overdue' AND due_date IS NOT NULL AND due_date >= ?")->execute([$today]);

            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

            // ---- รายละเอียดแผนเดียว ----
            if ($id) {
                $st = $pdo->prepare("SELECT p.*, u.full_name AS responsible_name,
                        (SELECT COUNT(*) FROM pm_am_plan_assets pa WHERE pa.plan_id = p.id) AS asset_count,
                        (SELECT COUNT(*) FROM pm_am_plan_checklists pc WHERE pc.plan_id = p.id) AS template_count,
                        (SELECT MIN(due_date) FROM pm_am WHERE pm_am.plan_id = p.id AND pm_am.status IN ('pending','in_progress')) AS next_due,
                        (SELECT MAX(completed_at) FROM pm_am WHERE pm_am.plan_id = p.id AND pm_am.status = 'completed') AS last_completed_at
                     FROM pm_am_plans p LEFT JOIN users u ON u.id = p.responsible_user_id WHERE p.id = ?");
                $st->execute([$id]);
                $plan = $st->fetch(PDO::FETCH_ASSOC);
                if (!$plan) { http_response_code(404); echo json_encode(['error' => 'Plan not found']); exit; }

                $plan['assets']    = $loadPlanAssets($id);
                $plan['templates'] = $loadPlanTemplates($id);
                $plan['planned_parts'] = $loadPlanParts($id);

                // ประวัติรอบ PM ของแผนนี้ (พร้อมสถานะ + ชื่อช่าง)
                $hist = $pdo->prepare("SELECT pm.id, pm.title, pm.due_date, pm.last_done_date, pm.status, pm.priority, pm.completed_at, u.full_name AS assigned_name, a.code AS asset_code, a.name AS asset_name,
                        (SELECT COUNT(*) FROM repair WHERE repair.pm_am_id = pm.id) AS wo_count
                     FROM pm_am pm LEFT JOIN users u ON u.id = pm.assigned_to LEFT JOIN asset_registry a ON a.id = pm.asset_id
                     WHERE pm.plan_id = ? ORDER BY pm.due_date DESC, pm.id DESC LIMIT 200");
                $hist->execute([$id]);
                $plan['history'] = $hist->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(['status' => 'success', 'data' => $plan]);
                exit;
            }

            // ---- รายการแผนทั้งหมด ----
            $rows = $pdo->query(
                "SELECT p.*, u.full_name AS responsible_name,
                    (SELECT COUNT(*) FROM pm_am_plan_assets pa WHERE pa.plan_id = p.id) AS asset_count,
                    (SELECT COUNT(*) FROM pm_am_plan_checklists pc WHERE pc.plan_id = p.id) AS template_count,
                    (SELECT MIN(due_date) FROM pm_am WHERE pm_am.plan_id = p.id AND pm_am.status IN ('pending','in_progress')) AS next_due,
                    (SELECT MAX(completed_at) FROM pm_am WHERE pm_am.plan_id = p.id AND pm_am.status = 'completed') AS last_completed_at,
                    (SELECT COUNT(*) FROM pm_am WHERE pm_am.plan_id = p.id) AS cycle_count
                 FROM pm_am_plans p LEFT JOIN users u ON u.id = p.responsible_user_id
                 ORDER BY p.is_active DESC, p.code ASC"
            )->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['status' => 'success', 'code' => 200, 'count' => count($rows), 'data' => $rows]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            // ---- ACTION: generate รอบ PM จากแผน (ทุก asset ที่ลิงก์) ----
            if (isset($_GET['action']) && $_GET['action'] === 'generate') {
                $planId = (int)($data['plan_id'] ?? 0);
                if (!$planId) { http_response_code(400); echo json_encode(['error' => 'Missing plan_id']); exit; }
                $st = $pdo->prepare('SELECT * FROM pm_am_plans WHERE id = ?');
                $st->execute([$planId]);
                $plan = $st->fetch(PDO::FETCH_ASSOC);
                if (!$plan) { http_response_code(404); echo json_encode(['error' => 'Plan not found']); exit; }
                if ($plan['status'] !== 'active') { http_response_code(400); echo json_encode(['error' => 'เปิดใช้งานแผนก่อน (สถานะต้องเป็น active)']); exit; }

                $now = date('Y-m-d');
                $created = 0; $skipped = 0; $details = [];
                $assets = $loadPlanAssets($planId);
                foreach ($assets as $asset) {
                    // หารอบที่ค้างอยู่ของเครื่องนี้ (แผนนี้) เพื่อกันซ้ำ
                    $dup = $pdo->prepare(
                        "SELECT id FROM pm_am WHERE plan_id = ? AND asset_id = ? AND status IN ('pending','in_progress')
                         AND (due_date IS NULL OR due_date >= DATE_SUB(?, INTERVAL 1 DAY)) ORDER BY due_date DESC LIMIT 1"
                    );
                    $dup->execute([$planId, $asset['id'], $now]);
                    if ($dup->fetchColumn()) { $skipped++; $details[] = $asset['code'] . ': มีรอบค้างอยู่แล้ว'; continue; }

                    // คำนวณ due_date: ใช้รอบที่ผ่านมา (ถ้าครบกำหนดแล้ว) หรือวันเริ่มแผน
                    $last = $pdo->prepare("SELECT due_date, last_done_date, id FROM pm_am WHERE plan_id = ? AND asset_id = ? ORDER BY id DESC LIMIT 1");
                    $last->execute([$planId, $asset['id']]);
                    $lastRow = $last->fetch(PDO::FETCH_ASSOC);
                    $dueDate = $plan['start_date'] ?: date('Y-m-d');
                    if ($lastRow) {
                        $base = $lastRow['last_done_date'] ?: $lastRow['due_date'];
                        $dueDate = $calcNextDue($base, $plan['frequency_type'], (int)$plan['frequency_interval']);
                    }
                    // ถ้าเลยกำหนดมาหลายรอบ ให้ขยับทีละรอบจนถึงวันนี้ (ไม่สร้างย้อนหลัง)
                    $guard = 0;
                    while ($dueDate < $now && $guard < 60) {
                        $dueDate = $calcNextDue($dueDate, $plan['frequency_type'], (int)$plan['frequency_interval']);
                        $guard++;
                    }

                    $title = $plan['name'] . ($plan['plan_type'] === 'single' ? " — {$asset['name']}" : '');
                    $ins = $pdo->prepare(
                        "INSERT INTO pm_am (asset_id, assigned_to, plan_id, department_id, location_id, work_zone_id, title, description, frequency_type, frequency_interval, priority, estimated_duration_minutes, due_date, status, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())"
                    );
                    $ins->execute([
                        $asset['id'],
                        $plan['responsible_user_id'] ?: null,
                        $planId,
                        $plan['department_id'] ?: null,
                        $plan['location_id'] ?: null,
                        $plan['work_zone_id'] ?: null,
                        $title,
                        $plan['description'] ?: ($plan['instructions'] ?: ''),
                        $plan['frequency_type'],
                        (int)$plan['frequency_interval'],
                        $plan['priority'],
                        $plan['estimated_duration_minutes'] ?: null,
                        $dueDate,
                    ]);
                    $newPmId = (int)$pdo->lastInsertId();
                    // คัดลอกทีมผู้รับผิดชอบ (ถ้าผูก work_assignees กับแผน — ใช้ responsable เป็น lead)
                    if ($plan['responsible_user_id']) {
                        setWorkAssignees($pdo, 'pm_am', $newPmId, [], $plan['responsible_user_id'], (int)($_SESSION['user_id'] ?? 0) ?: null);
                    }
                    $created++;
                    $details[] = $asset['code'] . ": กำหนด {$dueDate}";
                }
                echo json_encode(['success' => true, 'created' => $created, 'skipped' => $skipped, 'details' => $details]);
                exit;
            }

            // ---- ACTION: generate Work Order จากรอบ PM (กันซ้ำ: repair.pm_am_id ไม่ซ้ำสถานะค้าง) ----
            if (isset($_GET['action']) && $_GET['action'] === 'generate_wo') {
                $pmId = (int)($data['pm_am_id'] ?? 0);
                if (!$pmId) { http_response_code(400); echo json_encode(['error' => 'Missing pm_am_id']); exit; }
                $st = $pdo->prepare(
                    "SELECT pm.*, a.name AS asset_name, a.code AS asset_code, a.location,
                        (SELECT COUNT(*) FROM repair WHERE repair.pm_am_id = pm.id AND repair.status NOT IN ('closed','cancelled','rejected')) AS open_wo
                     FROM pm_am pm LEFT JOIN asset_registry a ON a.id = pm.asset_id WHERE pm.id = ?"
                );
                $st->execute([$pmId]);
                $pm = $st->fetch(PDO::FETCH_ASSOC);
                if (!$pm) { http_response_code(404); echo json_encode(['error' => 'PM not found']); exit; }
                if ((int)$pm['open_wo'] > 0) { http_response_code(409); echo json_encode(['error' => 'รอบ PM นี้มี Work Order ค้างอยู่แล้ว — ไม่อนุญาตให้ซ้ำ', 'pm_am_id' => $pmId]); exit; }

                $woNo = generateWorkOrderNo($pdo);
                $desc = trim(($pm['description'] ?: '') . "\n\nแผน PM: " . ($pm['plan_id'] ?: '-'));
                $ins = $pdo->prepare(
                    "INSERT INTO repair (work_order_no, asset_id, assigned_to, created_by, department_id, location_id, work_zone_id, priority, status, source_type, pm_am_id, pm_plan_id, title, description, machine_status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'pm', ?, ?, ?, ?, ?, NOW(), NOW())"
                );
                $ins->execute([
                    $woNo,
                    $pm['asset_id'],
                    $pm['assigned_to'] ?: null,
                    (int)($_SESSION['user_id'] ?? 0) ?: null,
                    $pm['department_id'] ?: null,
                    $pm['location_id'] ?: null,
                    $pm['work_zone_id'] ?: null,
                    $pm['priority'],
                    $pmId,
                    $pm['plan_id'] ?: null,
                    '[PM] ' . $pm['title'],
                    $desc,
                    'running',
                ]);
                $repairId = (int)$pdo->lastInsertId();
                // คัดลอกทีมผู้รับผิดชอบจากรอบ PM → ใบสั่งงานซ่อม
                $team = getWorkAssignees($pdo, 'pm_am', $pmId);
                if (!empty($team)) {
                    setWorkAssignees($pdo, 'repair', $repairId, array_column($team, 'user_id'), (int)$pm['assigned_to'] ?: null, (int)($_SESSION['user_id'] ?? 0) ?: null);
                }

                // PM Planned Parts → snapshot ที่รอบ (pm_am_spare_parts) + สร้าง Pending Issue Request ให้ WO ใหม่
                $partsWarning = null;
                $plannedReqId = null;
                $plannedCount = 0;
                $plannedParts = $loadPlanParts((int)$pm['plan_id']);
                if (!empty($plannedParts)) {
                    try {
                        $uid = (int)($_SESSION['user_id'] ?? 0) ?: null;
                        $techName = null;
                        if ($pm['assigned_to']) {
                            $tn = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
                            $tn->execute([$pm['assigned_to']]);
                            $techName = $tn->fetchColumn() ?: null;
                        }
                        $reqRows = [];
                        foreach ($plannedParts as $pp) {
                            $code = trim((string)$pp['sage_item_code']);
                            if ($code === '') continue;
                            // หาหรือสร้าง cache row (mirror อ่านอย่างเดียวจาก Sage 300)
                            $c = $pdo->prepare('SELECT * FROM spare_parts WHERE sage_item_no = ? OR code = ? LIMIT 1');
                            $c->execute([$code, $code]);
                            $part = $c->fetch(PDO::FETCH_ASSOC);
                            if (!$part) {
                                $sage = Sage300Service::getItemMaster($code);
                                if (!$sage) { $partsWarning = "Item $code: ไม่พบใน Sage 300/แคช — ข้ามรายการ"; continue; }
                                $s = $sage[0];
                                $ins = $pdo->prepare("INSERT INTO spare_parts (code, name, unit, category, sage_category, location, stock_qty, reserved_qty, min_stock, max_stock, unit_price, sage_item_no, sage_sync_status, last_synced_at)
                                                      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 'placeholder', NOW())");
                                $ins->execute([$s['item_no'], $s['description'], $s['unit'] ?: 'PCS', $s['category'] ?? '', $s['category'] ?? '', $s['location'] ?? '', $s['qty_on_hand'], $s['avg_cost'], $s['item_no']]);
                                $part = ['id' => (int)$pdo->lastInsertId(), 'name' => $s['description'], 'unit' => $s['unit'] ?: 'PCS', 'unit_price' => (float)$s['avg_cost'], 'stock_qty' => (float)$s['qty_on_hand'], 'sage_item_no' => $s['item_no']];
                            }
                            $qty = (float)$pp['qty'];
                            $price = (float)$part['unit_price'];
                            // snapshot ที่รอบ PM
                            $ins2 = $pdo->prepare("INSERT INTO pm_am_spare_parts (pm_am_id, spare_part_id, quantity_used, unit_price, sage_item_code, item_description, unit)
                                                   VALUES (?, ?, ?, ?, ?, ?, ?)");
                            $ins2->execute([$pmId, (int)$part['id'], $qty, $price, $code, $pp['item_description'] ?: $part['name'], $pp['unit'] ?: $part['unit']]);
                            $reqRows[] = [
                                'spare_part_id' => (int)$part['id'],
                                'part_code' => $code,
                                'part_name' => $pp['item_description'] ?: $part['name'],
                                'qty' => $qty,
                                'unit' => $pp['unit'] ?: $part['unit'],
                                'unit_price' => $price,
                                'stock_qty_at_request' => (float)$part['stock_qty'],
                            ];
                            $plannedCount++;
                        }
                        if (!empty($reqRows)) {
                            $totalValue = array_sum(array_map(fn($r) => $r['qty'] * $r['unit_price'], $reqRows));
                            $insR = $pdo->prepare("INSERT INTO spare_issue_requests (work_order_id, work_order_no, technician_id, technician_name, request_type, status, requested_by, total_qty, total_value, note, created_by)
                                                   VALUES (?, ?, ?, ?, 'withdrawal', 'pending', ?, ?, ?, ?, ?)");
                            $insR->execute([$repairId, $woNo, $pm['assigned_to'] ?: null, $techName, $uid ?: 1, array_sum(array_column($reqRows, 'qty')), $totalValue, 'อะไหล่ตามแผน PM (จาก pm_planned_parts)', $uid ?: 1]);
                            $plannedReqId = (int)$pdo->lastInsertId();
                            $insI = $pdo->prepare("INSERT INTO spare_issue_request_items (request_id, spare_part_id, part_code, part_name, qty, unit, unit_price, stock_qty_at_request)
                                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                            foreach ($reqRows as $r) { $insI->execute([$plannedReqId, $r['spare_part_id'], $r['part_code'], $r['part_name'], $r['qty'], $r['unit'], $r['unit_price'], $r['stock_qty_at_request']]); }
                        }
                    } catch (Exception $e) {
                        $partsWarning = 'สร้างรายการอะไหล่ตามแผนไม่สำเร็จ: ' . $e->getMessage();
                    }
                }

                echo json_encode([
                    'success' => true,
                    'repair_id' => $repairId,
                    'work_order_no' => $woNo,
                    'pm_am_id' => $pmId,
                    'planned_parts_created' => $plannedCount,
                    'spare_request_id' => $plannedReqId,
                    'warning' => $partsWarning,
                ]);
                exit;
            }

            // ---- CREATE แผน ----
            $required = ['code', 'name'];
            foreach ($required as $f) {
                if (empty($data[$f])) { http_response_code(400); echo json_encode(['error' => "Missing field: $f"]); exit; }
            }
            $codeExists = $pdo->prepare('SELECT id FROM pm_am_plans WHERE code = ?');
            $codeExists->execute([trim($data['code'])]);
            if ($codeExists->fetchColumn()) { http_response_code(409); echo json_encode(['error' => 'รหัสแผนซ้ำกับระบบ']); exit; }

            $ins = $pdo->prepare(
                "INSERT INTO pm_am_plans (code, name, description, instructions, priority, estimated_duration_minutes, start_date, end_date,
                    plan_type, frequency_type, frequency_interval, meter_unit, meter_interval, lead_days, reminder_days, is_active, status,
                    responsible_user_id, department_id, location_id, work_zone_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
            );
            $ins->execute([
                trim($data['code']),
                trim($data['name']),
                $data['description'] ?? null,
                $data['instructions'] ?? null,
                $data['priority'] ?? 'medium',
                isset($data['estimated_duration_minutes']) && $data['estimated_duration_minutes'] !== '' ? (int)$data['estimated_duration_minutes'] : null,
                $data['start_date'] ?? null,
                $data['end_date'] ?? null,
                $data['plan_type'] ?? 'single',
                $data['frequency_type'] ?? 'monthly',
                max(1, (int)($data['frequency_interval'] ?? 1)),
                $data['meter_unit'] ?? null,
                isset($data['meter_interval']) && $data['meter_interval'] !== '' ? (float)$data['meter_interval'] : null,
                max(0, (int)($data['lead_days'] ?? 7)),
                max(0, (int)($data['reminder_days'] ?? 3)),
                (int)($data['is_active'] ?? 1),
                $data['status'] ?? 'active',
                isset($data['responsible_user_id']) && $data['responsible_user_id'] ? (int)$data['responsible_user_id'] : null,
                isset($data['department_id']) && $data['department_id'] ? (int)$data['department_id'] : null,
                isset($data['location_id']) && $data['location_id'] ? (int)$data['location_id'] : null,
                isset($data['work_zone_id']) && $data['work_zone_id'] ? (int)$data['work_zone_id'] : null,
            ]);
            $planId = (int)$pdo->lastInsertId();

            // ลิงก์ assets
            if (!empty($data['asset_ids']) && is_array($data['asset_ids'])) {
                $li = $pdo->prepare('INSERT IGNORE INTO pm_am_plan_assets (plan_id, asset_id) VALUES (?, ?)');
                foreach ($data['asset_ids'] as $aid) { if ((int)$aid > 0) $li->execute([$planId, (int)$aid]); }
            }
            // ลิงก์ checklist templates
            if (!empty($data['template_ids']) && is_array($data['template_ids'])) {
                $lt = $pdo->prepare('INSERT IGNORE INTO pm_am_plan_checklists (plan_id, template_id) VALUES (?, ?)');
                foreach ($data['template_ids'] as $tid) { if ((int)$tid > 0) $lt->execute([$planId, (int)$tid]); }
            }
            // PM Planned Parts (Sage Item Code เป็น reference key)
            if (!empty($data['planned_parts']) && is_array($data['planned_parts'])) {
                $ip = $pdo->prepare('INSERT INTO pm_planned_parts (plan_id, sage_item_code, item_description, unit, qty, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
                foreach ($data['planned_parts'] as $pp) {
                    $code = trim((string)($pp['sage_item_code'] ?? $pp['item_code'] ?? ''));
                    if ($code === '') continue;
                    $ip->execute([$planId, $code, $pp['item_description'] ?? null, $pp['unit'] ?? null, (float)($pp['qty'] ?? 1), $pp['note'] ?? null, (int)($_SESSION['user_id'] ?? 0) ?: null]);
                }
            }
            echo json_encode(['success' => true, 'id' => $planId]);
            break;

        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }

            $exists = $pdo->prepare('SELECT id FROM pm_am_plans WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetchColumn()) { http_response_code(404); echo json_encode(['error' => 'Plan not found']); exit; }

            // code ซ้ำ (ตัวอื่น)
            if (!empty($data['code'])) {
                $c = $pdo->prepare('SELECT id FROM pm_am_plans WHERE code = ? AND id != ?');
                $c->execute([trim($data['code']), $id]);
                if ($c->fetchColumn()) { http_response_code(409); echo json_encode(['error' => 'รหัสแผนซ้ำกับระบบ']); exit; }
            }

            $allowed = ['code', 'name', 'description', 'instructions', 'priority', 'start_date', 'end_date', 'plan_type',
                'frequency_type', 'meter_unit', 'meter_interval', 'lead_days', 'reminder_days', 'is_active', 'status',
                'responsible_user_id', 'department_id', 'location_id', 'work_zone_id'];
            $numeric = ['frequency_interval' => 1, 'lead_days' => 0, 'reminder_days' => 0];
            $fields = []; $values = [];
            foreach ($allowed as $col) {
                if (!array_key_exists($col, $data)) continue;
                $val = $data[$col];
                if ($col === 'estimated_duration_minutes') { $fields[] = 'estimated_duration_minutes = ?'; $values[] = $val !== '' && $val !== null ? (int)$val : null; continue; }
                if (in_array($col, ['frequency_interval'], true)) { $fields[] = "$col = ?"; $values[] = max($numeric[$col], (int)$val); continue; }
                if (in_array($col, ['is_active', 'responsible_user_id', 'department_id', 'location_id', 'work_zone_id'], true)) {
                    $fields[] = "$col = ?"; $values[] = $val !== '' && $val !== null ? (int)$val : null; continue;
                }
                if (in_array($col, ['meter_interval'], true)) { $fields[] = "$col = ?"; $values[] = $val !== '' && $val !== null ? (float)$val : null; continue; }
                $fields[] = "$col = ?"; $values[] = $val;
            }
            if (!empty($fields)) {
                $values[] = $id;
                $pdo->prepare("UPDATE pm_am_plans SET " . implode(',', $fields) . ", updated_at = NOW() WHERE id = ?")->execute($values);
            }

            // แทนที่ลิงก์ assets (ส่งชุดเต็ม)
            if (isset($data['asset_ids']) && is_array($data['asset_ids'])) {
                $pdo->prepare('DELETE FROM pm_am_plan_assets WHERE plan_id = ?')->execute([$id]);
                $li = $pdo->prepare('INSERT IGNORE INTO pm_am_plan_assets (plan_id, asset_id) VALUES (?, ?)');
                foreach ($data['asset_ids'] as $aid) { if ((int)$aid > 0) $li->execute([$id, (int)$aid]); }
            }
            // แทนที่ลิงก์ checklists
            if (isset($data['template_ids']) && is_array($data['template_ids'])) {
                $pdo->prepare('DELETE FROM pm_am_plan_checklists WHERE plan_id = ?')->execute([$id]);
                $lt = $pdo->prepare('INSERT IGNORE INTO pm_am_plan_checklists (plan_id, template_id) VALUES (?, ?)');
                foreach ($data['template_ids'] as $tid) { if ((int)$tid > 0) $lt->execute([$id, (int)$tid]); }
            }
            // แทนที่ PM Planned Parts (ส่งชุดเต็ม ถ้ามี key)
            if (isset($data['planned_parts']) && is_array($data['planned_parts'])) {
                $pdo->prepare('DELETE FROM pm_planned_parts WHERE plan_id = ?')->execute([$id]);
                $ip = $pdo->prepare('INSERT INTO pm_planned_parts (plan_id, sage_item_code, item_description, unit, qty, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
                foreach ($data['planned_parts'] as $pp) {
                    $code = trim((string)($pp['sage_item_code'] ?? $pp['item_code'] ?? ''));
                    if ($code === '') continue;
                    $ip->execute([$id, $code, $pp['item_description'] ?? null, $pp['unit'] ?? null, (float)($pp['qty'] ?? 1), $pp['note'] ?? null, (int)($_SESSION['user_id'] ?? 0) ?: null]);
                }
            }
            echo json_encode(['success' => true, 'id' => $id]);
            break;

        case 'DELETE':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
            $cycleCount = $pdo->prepare('SELECT COUNT(*) FROM pm_am WHERE plan_id = ?');
            $cycleCount->execute([$id]);
            $hasCycles = (int)$cycleCount->fetchColumn() > 0;
            $pdo->beginTransaction();
            try {
                $pdo->prepare('DELETE FROM pm_am_plan_assets WHERE plan_id = ?')->execute([$id]);
                $pdo->prepare('DELETE FROM pm_am_plan_checklists WHERE plan_id = ?')->execute([$id]);
                $pdo->prepare('DELETE FROM pm_planned_parts WHERE plan_id = ?')->execute([$id]);
                if ($hasCycles) {
                    // มีประวัติแล้ว → soft delete (ห้ามลบประวัติ)
                    $pdo->prepare("UPDATE pm_am_plans SET status = 'cancelled', is_active = 0, updated_at = NOW() WHERE id = ?")->execute([$id]);
                    echo json_encode(['success' => true, 'soft' => true, 'message' => 'แผนถูกรายการเป็น ยกเลิก (เก็บประวัติไว้)']);
                } else {
                    $pdo->prepare('DELETE FROM pm_am_plans WHERE id = ?')->execute([$id]);
                    echo json_encode(['success' => true, 'soft' => false]);
                }
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}