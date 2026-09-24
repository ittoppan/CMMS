<?php
/**
 * public/api/v1/calibration_management.php — Calibration & Measurement Management API (Phase 29)
 *
 * REST + action-based สำหรับ Flow ครบวงจร:
 *   Instrument Master → Plan → Due → ลงมือสอบเทียบ (จุดวัด/ผล/หลักฐาน)
 *   → Review/Approve → Certificate → Next Due → History  (+ OOT → Impact → RCA/WO)
 *
 * แนวปฏิบัติ (REUSE):
 *   - MGMT/RBAC ของเดิม: requirePerm('calibration', ...) + enforceCsrf()
 *   - Engine กลาง: src/helpers/calibration.php (คำนวณฝั่ง backend เท่านั้น)
 *   - Status workflow ใช้ enum ที่ migrate แล้ว (scheduled/pending/in_progress/pending_review/approved/…)
 *   - Audit/Notification/Upload/Idempotency ของเดิม
 *
 * Endpoints (GET เหล่านี้ขึ้นกับสิทธิ์ view):
 *   GET ?resource=instruments&status=GREEN|AMBER|RED|unregistered&search=&department_id=&location_id=&limit=&offset=
 *   GET ?resource=instrument&id=<asset_id>
 *   GET ?resource=plans&asset_id=&status=
 *   GET ?resource=schedule&start=YYYY-MM-DD&end=YYYY-MM-DD&view=today|week|month|next30|year
 *   GET ?resource=dashboard&department_id=&location_id=
 *   GET ?resource=data-quality
 *   GET ?resource=config
 *   GET ?resource=standards&standard_id=&status=
 *   GET ?resource=procedures&procedure_code=&is_current=1|0
 *   GET ?resource=run&id=<calibration_id>           (measurements + certificates + computed)
 *   GET ?resource=reports&type=history|due|per_instrument|schedule_csv|compliance&...
 *
 * POST/PUT/DELETE (ต้อง CSRF + edit/create/delete):
 *   POST {action:"instrument_save", asset_id, ...}
 *   POST {action:"plan_save", ...}
 *   POST {action:"standard_save", ...}
 *   POST {action:"standard_delete", id}
 *   POST {action:"procedure_save", ...}
 *   POST {action:"procedure_new_version", id, ...}
 *   POST {action:"adopt_plan", plan_id, due_date?, asset_id?}   (สร้าง run จากแผน)
 *   POST {action:"run_start", calibration_id}                   (scheduled/pending → in_progress)
 *   POST {action:"run_save_points", calibration_id, points[]}   (บันทึก/แก้จุดวัด — backend คำนวณ error/result)
 *   POST {action:"run_complete", calibration_id}                (in_progress → pending_review/completed)
 *   POST {action:"run_review", calibration_id, decision:"approve"|"reject", reason?}   (approve=อนุมัติระยะที่ 2)
 *   POST {action:"certificate_upload", calibration_id, certificate_number, file_path, cert_date?, issuer?, valid_years?, result?}
 *   POST {action:"certificate_supersede", certificate_id, reason?}
 *   POST {action:"oot_create", calibration_id}
 *   POST {action:"oot_update", id, ...}
 *   POST {action:"config_save", settings:{key:value,...}}
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
require_once __DIR__ . '/../../../src/helpers/calibration.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) enforceCsrf();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $isRead = $method === 'GET';

    requirePerm($pdo, 'calibration', $isRead ? 'view' : ($method === 'POST' ? 'create' : ($method === 'PUT' ? 'edit' : 'delete')));

    if ($isRead) {
        $resource = trim((string)($_GET['resource'] ?? ''));
        $id = (int)($_GET['id'] ?? 0);

        switch ($resource) {
            case 'instruments':
                echo json_encode(cal_instruments($pdo, [
                    'search'        => $_GET['search'] ?? '',
                    'category'      => $_GET['category'] ?? '',
                    'department_id' => (int)($_GET['department_id'] ?? 0),
                    'location_id'   => (int)($_GET['location_id'] ?? 0),
                    'status'        => $_GET['status'] ?? '',
                    'calibration_due' => (int)($_GET['due_within_days'] ?? 0),
                    'limit'         => (int)($_GET['limit'] ?? 200),
                    'offset'        => (int)($_GET['offset'] ?? 0),
                ]), JSON_UNESCAPED_UNICODE);
                break;

            case 'instrument':
                if ($id <= 0) api_fail(400, 'INVALID_ID', 'ระบุ id ของเครื่องมือวัด (asset_id)');
                $row = cal_instrument($pdo, $id);
                if (!$row) api_fail(404, 'NOT_FOUND', 'ไม่พบเครื่องมือวัด/asset นี้');
                echo json_encode(['instrument' => $row], JSON_UNESCAPED_UNICODE);
                break;

            case 'plans':
                $where = ['1=1']; $args = [];
                if (!empty($_GET['asset_id'])) { $where[] = 'p.asset_id = ?'; $args[] = (int)$_GET['asset_id']; }
                if (!empty($_GET['status'])) { $where[] = 'p.status = ?'; $args[] = $_GET['status']; }
                $st = $pdo->prepare("SELECT p.*, a.code AS asset_code, a.name AS asset_name,
                        s.standard_code, s.standard_name, d.name AS dept_name, u.full_name AS responsible_name
                    FROM calibration_plans p
                    JOIN asset_registry a ON a.id = p.asset_id
                    LEFT JOIN calibration_standards s ON s.id = p.standard_id
                    LEFT JOIN departments d ON d.id = p.responsible_department_id
                    LEFT JOIN users u ON u.id = p.responsible_user_id
                    WHERE " . implode(' AND ', $where) . " ORDER BY p.next_calibration_date IS NULL, p.next_calibration_date ASC, p.id DESC");
                $st->execute($args);
                echo json_encode($st->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
                break;

            case 'schedule':
                $view = (string)($_GET['view'] ?? 'month');
                [$s, $e] = cal_range_for_view($view, $_GET['anchor'] ?? null);
                echo json_encode([
                    'start' => $s, 'end' => $e, 'view' => $view,
                    'items' => cal_schedule($pdo, ['start' => $s, 'end' => $e, 'view' => $view,
                        'department_id' => (int)($_GET['department_id'] ?? 0),
                        'location_id'   => (int)($_GET['location_id'] ?? 0),
                    ]),
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'dashboard':
                echo json_encode(cal_dashboard($pdo, [
                    'department_id' => (int)($_GET['department_id'] ?? 0),
                    'location_id'   => (int)($_GET['location_id'] ?? 0),
                ]), JSON_UNESCAPED_UNICODE);
                break;

            case 'data-quality':
                echo json_encode(cal_data_quality($pdo), JSON_UNESCAPED_UNICODE);
                break;

            case 'config':
                echo json_encode(cal_config($pdo), JSON_UNESCAPED_UNICODE);
                break;

            case 'standards':
                $where = ['1=1']; $args = [];
                if (!empty($_GET['standard_id'])) { $where[] = 'id = ?'; $args[] = (int)$_GET['standard_id']; }
                if (!empty($_GET['status'])) { $where[] = 'status = ?'; $args[] = $_GET['status']; }
                if (!empty($_GET['search'])) { $where[] = '(standard_code LIKE ? OR standard_name LIKE ? OR serial_number LIKE ?)'; $s = '%' . $_GET['search'] . '%'; array_push($args, $s, $s, $s); }
                $st = $pdo->prepare('SELECT * FROM calibration_standards WHERE ' . implode(' AND ', $where) . ' ORDER BY status, next_calibration_date ASC');
                $st->execute($args);
                echo json_encode($st->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
                break;

            case 'procedures':
                $where = ['1=1']; $args = [];
                if (!empty($_GET['procedure_code'])) { $where[] = 'procedure_code = ?'; $args[] = $_GET['procedure_code']; }
                if (isset($_GET['is_current'])) { $where[] = 'is_current = ?'; $args[] = (int)$_GET['is_current']; }
                $st = $pdo->prepare("SELECT p.*, u.full_name AS created_name,
                        (SELECT COUNT(*) FROM calibration_procedures p2 WHERE p2.procedure_code = p.procedure_code) AS version_count
                    FROM calibration_procedures p
                    LEFT JOIN users u ON u.id = p.created_by
                    WHERE " . implode(' AND ', $where) . " ORDER BY p.procedure_code, p.version DESC");
                $st->execute($args);
                echo json_encode($st->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
                break;

            case 'run':
                if ($id <= 0) api_fail(400, 'INVALID_ID', 'ระบุ id ของรอบสอบเทียบ');
                $run = cal_run($pdo, $id);
                if (!$run) api_fail(404, 'NOT_FOUND', 'ไม่พบรอบสอบเทียบ');
                echo json_encode($run, JSON_UNESCAPED_UNICODE);
                break;

            case 'certificates':
                $st = $pdo->query("SELECT cc.*, c.asset_id, a.code AS asset_code, a.name AS asset_name
                    FROM calibration_certificates cc
                    JOIN calibration c ON c.id = cc.calibration_id
                    JOIN asset_registry a ON a.id = c.asset_id
                    ORDER BY cc.created_at DESC LIMIT 500");
                echo json_encode($st->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
                break;

            case 'oot':
                $st = $pdo->query("SELECT o.*, a.code AS asset_code, a.name AS asset_name, rca.rca_code
                    FROM calibration_oot_events o
                    LEFT JOIN asset_registry a ON a.id = o.asset_id
                    LEFT JOIN rca ON rca.id = o.rca_id
                    ORDER BY o.detected_date DESC, o.id DESC LIMIT 500");
                echo json_encode($st->fetchAll(PDO::FETCH_ASSOC), JSON_UNESCAPED_UNICODE);
                break;

            case 'reports':
                $type = (string)($_GET['type'] ?? 'history');
                echo json_encode(cal_build_report($pdo, $type, $_GET), JSON_UNESCAPED_UNICODE);
                break;

            default:
                api_fail(400, 'BAD_RESOURCE', 'ไม่รู้จัก resource ที่ขอ');
        }
        exit;
    }

    // ---------- WRITE ----------
    $payload = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = (string)($payload['action'] ?? $_POST['action'] ?? '');

    switch ($action) {

        case 'instrument_save':
            $assetId = (int)($payload['asset_id'] ?? 0);
            if ($assetId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ asset_id ของเครื่องมือวัด');
            $r = cal_instrument_save($pdo, $assetId, $payload, $uid);
            if (!empty($r['error'])) api_fail(400, 'VALIDATION_ERROR', $r['message']);
            echo json_encode(['success' => true, 'message' => $r['created'] ? 'ลงทะเบียนเครื่องมือวัดแล้ว' : 'อัปเดตข้อมูลเครื่องมือวัดแล้ว', 'id' => $r['id']], JSON_UNESCAPED_UNICODE);
            break;

        case 'plan_save':
            $r = cal_plan_save($pdo, $payload, $uid);
            if (!empty($r['error'])) api_fail(400, 'POLICY_VIOLATION', $r['message']);
            echo json_encode(['success' => true, 'message' => $r['created'] ? 'สร้างแผนสอบเทียบแล้ว' : 'อัปเดตแผนสอบเทียบแล้ว', 'plan_id' => $r['id']], JSON_UNESCAPED_UNICODE);
            break;

        case 'standard_save':
            $id = (int)($payload['id'] ?? 0);
            $code = trim((string)($payload['standard_code'] ?? ''));
            if ($code === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ standard_code');
            $data = [
                'standard_code'         => $code,
                'standard_name'         => trim((string)($payload['standard_name'] ?? '')),
                'standard_type'         => in_array($payload['standard_type'] ?? '', ['reference_instrument','master_gauge','transfer_standard','calibrator','certified_weight','other'], true) ? $payload['standard_type'] : 'reference_instrument',
                'asset_id'              => !empty($payload['asset_id']) ? (int)$payload['asset_id'] : null,
                'manufacturer'          => $payload['manufacturer'] ?? null,
                'model'                 => $payload['model'] ?? null,
                'serial_number'         => $payload['serial_number'] ?? null,
                'accuracy'              => $payload['accuracy'] ?? null,
                'certificate_number'    => $payload['certificate_number'] ?? null,
                'certificate_file'      => $payload['certificate_file'] ?? null,
                'calibration_date'      => $payload['calibration_date'] ?? null,
                'next_calibration_date' => $payload['next_calibration_date'] ?? null,
                'traceability'          => $payload['traceability'] ?? null,
                'status'                => in_array($payload['status'] ?? 'active', ['active','expired','out_of_service','retired'], true) ? $payload['status'] : 'active',
                'notes'                 => $payload['notes'] ?? null,
            ];
            if (!empty($data['calibration_date']) && empty($data['next_calibration_date'])) {
                $data['next_calibration_date'] = cal_next_due($data['calibration_date'], (int)cal_config($pdo)['cal_default_interval_months']);
            }
            if ($data['standard_name'] === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ standard_name');
            if ($id > 0) {
                $set = []; $vals = [];
                foreach ($data as $k => $v) { $set[] = "`$k` = ?"; $vals[] = $v; }
                $vals[] = $id;
                $pdo->prepare('UPDATE calibration_standards SET ' . implode(',', $set) . ', updated_at = NOW() WHERE id = ?')->execute($vals);
                audit_log($pdo, 'CAL_STANDARD_UPDATE', 'calibration_standard', $id, 'อัปเดตมาตรฐานอ้างอิง ' . $data['standard_code']);
            } else {
                $st = $pdo->prepare('SELECT COUNT(*) FROM calibration_standards WHERE standard_code = ?');
                $st->execute([$data['standard_code']]);
                if ((int)$st->fetchColumn() > 0) api_fail(409, 'CONFLICT', 'standard_code ซ้ำในระบบแล้ว');
                $cols = array_keys($data);
                $ph = rtrim(str_repeat('?,', count($cols)), ',');
                $data['created_by'] = $uid;
                $cols = array_keys($data);
                $ph = rtrim(str_repeat('?,', count($cols)), ',');
                $pdo->prepare('INSERT INTO calibration_standards (' . implode(',', $cols) . ') VALUES (' . $ph . ')')->execute(array_values($data));
                $id = (int)$pdo->lastInsertId();
                audit_log($pdo, 'CAL_STANDARD_CREATE', 'calibration_standard', $id, 'สร้างมาตรฐานอ้างอิง ' . $data['standard_code']);
            }
            echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
            break;

        case 'standard_delete':
            $id = (int)($payload['id'] ?? 0);
            if ($id <= 0) api_fail(400, 'INVALID_ID', 'ระบุ id มาตรฐาน');
            $st = $pdo->prepare('SELECT COUNT(*) FROM calibration_plans WHERE standard_id = ?');
            $st->execute([$id]);
            if ((int)$st->fetchColumn() > 0) api_fail(409, 'CONFLICT', 'มาตรฐานนี้ถูกใช้งานในแผนสอบเทียบแล้ว — ทำได้แค่เปลี่ยนสถานะ (retired/expired)');
            $pdo->prepare('UPDATE calibration_standards SET status = \'retired\', updated_at = NOW() WHERE id = ?')->execute([$id]);
            audit_log($pdo, 'CAL_STANDARD_RETIRE', 'calibration_standard', $id, 'Retire มาตรฐานอ้างอิง (มีประวัติแนบห้ามลบ)');
            echo json_encode(['success' => true, 'message' => 'Retire มาตรฐานแล้ว'], JSON_UNESCAPED_UNICODE);
            break;

        case 'procedure_save':
            $id = (int)($payload['id'] ?? 0);
            $pcode = trim((string)($payload['procedure_code'] ?? ''));
            $pname = trim((string)($payload['procedure_name'] ?? ''));
            if ($pcode === '' || $pname === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ procedure_code และ procedure_name');
            $steps = array_key_exists('steps', $payload) ? json_encode($payload['steps'], JSON_UNESCAPED_UNICODE) : null;
            $data = [
                'procedure_code'     => $pcode,
                'procedure_name'     => $pname,
                'is_current'         => array_key_exists('is_current', $payload) ? (int)$payload['is_current'] : 1,
                'effective_date'     => $payload['effective_date'] ?? null,
                'instrument_category'=> $payload['instrument_category'] ?? null,
                'steps'              => $steps,
                'acceptance_criteria'=> $payload['acceptance_criteria'] ?? null,
                'required_standards' => $payload['required_standards'] ?? null,
                'required_equipment' => $payload['required_equipment'] ?? null,
                'rev_note'           => $payload['rev_note'] ?? null,
            ];
            if ($id <= 0) {
                $st = $pdo->prepare('SELECT MAX(version) FROM calibration_procedures WHERE procedure_code = ?');
                $st->execute([$pcode]);
                $maxVer = (int)$st->fetchColumn();
                $data['version'] = $maxVer + 1;
                $data['created_by'] = $uid;
                if ($maxVer > 0) {
                    // ยกเลิก version เดิมที่ is_current
                    $pdo->prepare('UPDATE calibration_procedures SET is_current = 0 WHERE procedure_code = ?')->execute([$pcode]);
                }
                $cols = array_keys($data);
                $ph = rtrim(str_repeat('?,', count($cols)), ',');
                $pdo->prepare('INSERT INTO calibration_procedures (' . implode(',', $cols) . ') VALUES (' . $ph . ')')->execute(array_values($data));
                $id = (int)$pdo->lastInsertId();
                audit_log($pdo, 'CAL_PROCEDURE_CREATE', 'calibration_procedure', $id, 'สร้างขั้นตอนสอบเทียบ ' . $pcode . ' v' . $data['version']);
            } else {
                $set = []; $vals = [];
                foreach ($data as $k => $v) { $set[] = "`$k` = ?"; $vals[] = $v; }
                $vals[] = $id;
                $pdo->prepare('UPDATE calibration_procedures SET ' . implode(',', $set) . ', updated_at = NOW() WHERE id = ?')->execute($vals);
                audit_log($pdo, 'CAL_PROCEDURE_UPDATE', 'calibration_procedure', $id, 'อัปเดตขั้นตอนสอบเทียบ ' . $pcode);
            }
            echo json_encode(['success' => true, 'id' => $id, 'version' => (int)$data['version']], JSON_UNESCAPED_UNICODE);
            break;

        case 'adopt_plan':
            // สร้าง run (แถว calibration) จากแผน active — REUSE ตารางเดิม
            $planId = (int)($payload['plan_id'] ?? 0);
            $st = $pdo->prepare('SELECT p.*, a.code AS asset_code FROM calibration_plans p JOIN asset_registry a ON a.id = p.asset_id WHERE p.id = ?');
            $st->execute([$planId]);
            $plan = $st->fetch(PDO::FETCH_ASSOC);
            if (!$plan) api_fail(404, 'NOT_FOUND', 'ไม่พบแผนสอบเทียบ');
            $due = $payload['due_date'] ?? $plan['next_calibration_date'] ?? null;
            $ins = $pdo->prepare('INSERT INTO calibration
                (asset_id, calibration_type, status, calibration_date, next_calibration_date, standard_used, plan_id, procedure_id, procedure_version, standard_id, calibrator_id, created_at, updated_at)
                VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
            $ins->execute([
                (int)$plan['asset_id'],
                ($payload['calibration_type'] ?? 'full') === 'abbreviated' ? 'abbreviated' : 'full',
                'scheduled',
                $due ?: null,
                $plan['standard_code'] ?? null,
                $planId,
                $plan['procedure_id'] ?? null,
                (int)($plan['procedure_version'] ?? 0) ?: null,
                $plan['standard_id'] ?? null,
                $plan['responsible_user_id'] ?: $uid,
            ]);
            $runId = (int)$pdo->lastInsertId();
            audit_log($pdo, 'CAL_RUN_ADOPT', 'calibration', $runId, 'สร้างรอบสอบเทียบจากแผน ' . $plan['plan_code']. ' (asset ' . $plan['asset_code'] . ')');
            echo json_encode(['success' => true, 'id' => $runId, 'message' => 'สร้างรอบสอบเทียบแล้ว'], JSON_UNESCAPED_UNICODE);
            break;

        case 'run_start':
            $id = (int)($payload['calibration_id'] ?? 0);
            $st = $pdo->prepare('SELECT status FROM calibration WHERE id = ?');
            $st->execute([$id]);
            $from = $st->fetchColumn();
            if ($from === false) api_fail(404, 'NOT_FOUND', 'ไม่พบรอบสอบเทียบ');
            if (!cal_can_transition((string)$from, 'in_progress')) api_fail(409, 'BAD_TRANSITION', 'สถานะ ' . $from . ' เริ่มการสอบเทียบไม่ได้');
            $pdo->prepare('UPDATE calibration SET status = \'in_progress\', started_at = COALESCE(started_at, NOW()), calibrator_id = ?, updated_at = NOW() WHERE id = ?')->execute([$uid, $id]);
            audit_log($pdo, 'CAL_RUN_START', 'calibration', $id, 'เริ่มการสอบเทียบ', $from, 'in_progress');
            echo json_encode(['success' => true, 'message' => 'เริ่มการสอบเทียบแล้ว'], JSON_UNESCAPED_UNICODE);
            break;

        case 'run_save_points':
            // บันทึก/แทนที่จุดวัด — error/result คำนวณฝั่ง backend เท่านั้น
            $id = (int)($payload['calibration_id'] ?? 0);
            $st = $pdo->prepare('SELECT status FROM calibration WHERE id = ?');
            $st->execute([$id]);
            $from = $st->fetchColumn();
            if ($from === false) api_fail(404, 'NOT_FOUND', 'ไม่พบรอบสอบเทียบ');
            if (!in_array((string)$from, ['in_progress', 'pending_review', 'rejected', 'pending'], true)) {
                api_fail(409, 'BAD_STATE', 'สถานะ ' . $from . ' บันทึกจุดวัดไม่ได้ (ต้อง in_progress)');
            }
            $points = $payload['points'] ?? [];
            if (!is_array($points)) api_fail(400, 'VALIDATION_ERROR', 'points ต้องเป็น array');
            $pdo->beginTransaction();
            try {
                // แทนที่ทั้งชุดแบบ transaction (0..n จุด) — แต่ไม่ลบถ้ากลับรอ review (ล็อกผ่าน state) 
                $del = $pdo->prepare('DELETE FROM calibration_measurements WHERE calibration_id = ?');
                $del->execute([$id]);
                $ins = $pdo->prepare('INSERT INTO calibration_measurements
                    (calibration_id, point_label, nominal_value, measured_value, tolerance, error_value, error_pct, result, is_critical, unit, notes, measured_at, created_by, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),?,NOW())');
                $envJson = null;
                $saved = 0;
                foreach ($points as $i => $p) {
                    $cp = cal_compute_point([
                        'nominal_value' => $p['nominal_value'] ?? null,
                        'measured_value' => $p['measured_value'] ?? null,
                        'tolerance'     => $p['tolerance'] ?? null,
                    ]);
                    $ins->execute([
                        $id,
                        trim((string)($p['point_label'] ?? ('P' . ($i + 1)))),
                        isset($p['nominal_value']) && $p['nominal_value'] !== '' ? $p['nominal_value'] : null,
                        isset($p['measured_value']) && $p['measured_value'] !== '' ? $p['measured_value'] : null,
                        isset($p['tolerance']) && $p['tolerance'] !== '' ? $p['tolerance'] : null,
                        $cp['error_value'],
                        $cp['error_pct'],
                        $cp['result'],
                        !empty($p['is_critical']) ? 1 : 0,
                        $p['unit'] ?? null,
                        $p['notes'] ?? null,
                        $uid,
                    ]);
                    $saved++;
                }
                // environment JSON (ถ้าส่งมา)
                if (isset($payload['environment']) && is_array($payload['environment'])) {
                    $envJson = json_encode($payload['environment'], JSON_UNESCAPED_UNICODE);
                }
                $pdo->prepare('UPDATE calibration SET environment = COALESCE(?, environment), updated_at = NOW() WHERE id = ?')->execute([$envJson, $id]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            audit_log($pdo, 'CAL_RUN_POINTS', 'calibration', $id, 'บันทึกจุดวัด ' . $saved . ' จุด (backend คำนวณ error/result)', null, ['count' => $saved]);
            echo json_encode(['success' => true, 'saved_points' => $saved], JSON_UNESCAPED_UNICODE);
            break;

        case 'run_complete':
            $id = (int)($payload['calibration_id'] ?? 0);
            $st = $pdo->prepare("SELECT c.*, p.method FROM calibration c
                LEFT JOIN calibration_plans p ON p.id = c.plan_id WHERE c.id = ?");
            $st->execute([$id]);
            $run = $st->fetch(PDO::FETCH_ASSOC);
            if (!$run) api_fail(404, 'NOT_FOUND', 'ไม่พบรอบสอบเทียบ');
            $from = (string)($run['status'] ?? '');
            if (in_array($from, ['approved', 'completed'], true)) api_fail(409, 'ALREADY_FINAL', 'รอบนี้ปิดแล้ว — ข้อมูล immutable');
            if (!in_array($from, ['in_progress', 'pending_review', 'rejected'], true)) api_fail(409, 'BAD_TRANSITION', 'สถานะ ' . $from . ' ยังยืนยันผลไม่ได้');
            $calDate = $payload['calibration_date'] ?? date('Y-m-d');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $calDate)) $calDate = date('Y-m-d');
            $v = cal_validate_submit($pdo, $id, $calDate);
            if (!empty($v['error'])) api_fail(400, 'DATA_INCOMPLETE', implode('; ', $v['errors']));

            $run['measurements'] = cal_run_measurements($pdo, $id);
            $computed = cal_run_computed($pdo, $run);
            $result = $computed['result'];
            $standardUsed = $payload['standard_used'] ?? ($run['standard_used'] ?? null);
            $certNo = $payload['certificate_number'] ?? ($run['certificate_number'] ?? null);
            $certFile = $payload['certificate_file'] ?? ($run['certificate_file'] ?? null);
            $notes = $payload['notes'] ?? ($run['notes'] ?? null);
            $resultAction = $computed['result'] === 'pass' ? 'pass' : (($payload['result_action'] ?? null) ?: null);

            $cfg = cal_config($pdo);
            $to = 'pending_review';
            $pdo->beginTransaction();
            try {
                $pdo->prepare('UPDATE calibration SET
                    status = ?, calibration_date = ?, standard_used = ?, certificate_number = ?,
                    certificate_file = ?, result = ?, result_action = ?, notes = ?, oot_flag = ?,
                    completed_at = NOW(), pending_review_at = NOW(), updated_at = NOW()
                    WHERE id = ?')->execute([
                        $to, $calDate, $standardUsed ?: null,
                        $certNo ?: null, $certFile ?: null, $result, $resultAction, $notes,
                        ($computed['oot'] ? 1 : 0), $id,
                    ]);
                // certificate record (ถ้ามีเลข) — 1 ใบ ต่อรอบเวอร์ชันแรก
                if ($certNo && $cfg['cal_require_certificate'] !== '1') {
                    $cc = $pdo->prepare('SELECT COUNT(*) FROM calibration_certificates WHERE calibration_id = ? AND certificate_number = ?');
                    $cc->execute([$id, $certNo]);
                    if ((int)$cc->fetchColumn() === 0 && $certNo !== '') {
                        $pdo->prepare("INSERT INTO calibration_certificates (calibration_id, certificate_number, certificate_date, result, file_path, uploaded_by, version, status, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, 1, 'active', NOW(), NOW())")->execute([$id, $certNo, $calDate, $result, $certFile ?: null, $uid]);
                    }
                }
                // OOT event ถ้า fail/conditional ตาม policy
                if (!empty($computed['oot']) && $cfg['cal_rca_on_fail'] === '1') {
                    $ex = $pdo->prepare('SELECT COUNT(*) FROM calibration_oot_events WHERE calibration_id = ?');
                    $ex->execute([$id]);
                    if ((int)$ex->fetchColumn() === 0) {
                        cal_oot_create($pdo, $id, $uid);
                    }
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            // แจ้งเตือน review pending
            $targets = cal_notify_targets($pdo, $run, 6);
            $run2 = cal_run($pdo, $id);
            cal_notify_inbox($pdo, $targets, 'review_pending', [
                'title' => 'รอตรวจสอบผลสอบเทียบ: ' . ($run['asset_code'] ?? '#'),
                'message' => 'เครื่องมือ: ' . ($run['asset_name'] ?? '') . "\nผล: " . $result,
                'url' => '/calibration/instruments/' . $run['asset_id'],
            ]);
            audit_log($pdo, 'CAL_RUN_COMPLETE', 'calibration', $id, 'ยืนยันผลสอบเทียบ (รอ review) → ' . $to . ' (result=' . $result . ')', $from, $to, $result === 'pass' ? 'info' : 'high');
            echo json_encode(['success' => true, 'message' => 'บันทึกผลสอบเทียบแล้ว ' . ($to === 'pending_review' ? '(รอผู้ตรวจสอบอนุมัติ)' : ''), 'status' => $to, 'result' => $result, 'computed' => $computed], JSON_UNESCAPED_UNICODE);
            break;

        case 'run_review':
            // ผู้ตรวจ (review) อนุมัติ → เขียน history (immutable) และคำนวณ next due
            $id = (int)($payload['calibration_id'] ?? 0);
            $decision = (string)($payload['decision'] ?? '');
            $st = $pdo->prepare('SELECT * FROM calibration WHERE id = ?');
            $st->execute([$id]);
            $run = $st->fetch(PDO::FETCH_ASSOC);
            if (!$run) api_fail(404, 'NOT_FOUND', 'ไม่พบรอบสอบเทียบ');
            if ((string)($run['status'] ?? '') !== 'pending_review') api_fail(409, 'BAD_TRANSITION', 'รอบนี้ไม่อยู่ในสถานะรออนุมัติ');

            if ($decision === 'reject') {
                $reason = trim((string)($payload['reason'] ?? ''));
                if ($reason === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุเหตุผลการ reject');
                $pdo->prepare('UPDATE calibration SET status = \'rejected\', reviewed_by = ?, reviewed_at = NOW(), reject_reason = ?, updated_at = NOW() WHERE id = ?')->execute([$uid, $reason, $id]);
                audit_log($pdo, 'CAL_RUN_REJECT', 'calibration', $id, 'Reject ผลสอบเทียบ: ' . mb_substr($reason, 0, 120), 'pending_review', 'rejected', 'high');
                echo json_encode(['success' => true, 'message' => 'ปฏิเสธผลสอบเทียบแล้ว (เปิดให้แก้ไขจุดวัดใหม่)'], JSON_UNESCAPED_UNICODE);
                break;
            }
            if ($decision !== 'approve') api_fail(400, 'VALIDATION_ERROR', 'decision ต้องเป็น approve หรือ reject');

            $res = cal_finalize_approved($pdo, $id, $uid);
            if (!empty($res['error'])) api_fail(500, 'FINALIZE_FAILED', $res['message']);
            $targets = cal_notify_targets($pdo, $run, 6);
            cal_notify_inbox($pdo, $targets, 'approved', [
                'title' => 'ผลสอบเทียบผ่านอนุมัติ',
                'message' => 'เครื่องมือ: ' . ($run['asset_id'] ?? '') . "\nรอบถัดไป: " . $res['next_calibration_date'],
                'url' => '/calibration/instruments/' . $run['asset_id'],
            ]);
            echo json_encode(['success' => true, 'message' => 'อนุมัติผลสอบเทียบและบันทึกประวัติแล้ว', 'next_calibration_date' => $res['next_calibration_date'], 'result' => $res['result'], 'history_id' => $res['history_id']], JSON_UNESCAPED_UNICODE);
            break;

        case 'certificate_upload':
            $id = (int)($payload['calibration_id'] ?? 0);
            $st = $pdo->prepare('SELECT * FROM calibration WHERE id = ?');
            $st->execute([$id]);
            $run = $st->fetch(PDO::FETCH_ASSOC);
            if (!$run) api_fail(404, 'NOT_FOUND', 'ไม่พบรอบสอบเทียบ');
            $certNo = trim((string)($payload['certificate_number'] ?? ''));
            $filePath = trim((string)($payload['file_path'] ?? ''));
            if ($certNo === '' && $filePath === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุเลขใบรับรองหรือไฟล์แนบ อย่างน้อย 1 อย่าง');
            $existing = null;
            if ($certNo !== '') {
                $st2 = $pdo->prepare("SELECT * FROM calibration_certificates WHERE calibration_id = ? AND certificate_number = ? AND status = 'active' ORDER BY version DESC LIMIT 1");
                $st2->execute([$id, $certNo]);
                $existing = $st2->fetch(PDO::FETCH_ASSOC) ?: null;
            }
            $okHash = file_exists($_SERVER['DOCUMENT_ROOT'] . '/' . ltrim($filePath, '/')) && is_file($_SERVER['DOCUMENT_ROOT'] . '/' . ltrim($filePath, '/'))
                ? hash_file('sha256', $_SERVER['DOCUMENT_ROOT'] . '/' . ltrim($filePath, '/')) : null;

            if ($existing) {
                // supersede ใบเดิม → version ใหม่ (ห้ามลบ)
                $pdo->beginTransaction();
                try {
                    $pdo->prepare("INSERT INTO calibration_certificates (calibration_id, certificate_number, certificate_date, issuer, result, file_path, file_hash, version, status, uploaded_by, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())")
                        ->execute([$id, $certNo, $payload['certificate_date'] ?? null, $payload['issuer'] ?? null,
                            $run['result'] ?? null, $filePath ?: null, $okHash, ((int)($existing['version'] ?? 1) + 1), $uid]);
                    $newCertId = (int)$pdo->lastInsertId();
                    $pdo->prepare("UPDATE calibration_certificates SET status='superseded', superseded_by=? WHERE id=?")->execute([$newCertId, (int)$existing['id']]);
                    $pdo->prepare("UPDATE calibration SET certificate_number = ?, certificate_file = ?, updated_at = NOW() WHERE id = ?")->execute([$certNo ?: null, $filePath ?: null, $id]);
                    $pdo->commit();
                } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
                audit_log($pdo, 'CAL_CERT_SUPERSEDE', 'calibration_certificate', $newCertId, 'ออกใบรับรองเวอร์ชันใหม่แทนใบเดิม (certificate #' . $certNo . ')');
                echo json_encode(['success' => true, 'message' => 'บันทึกใบรับรองเวอร์ชันใหม่ (แทนที่เวอร์ชันเดิม) แล้ว', 'certificate_id' => $newCertId], JSON_UNESCAPED_UNICODE);
            } else {
                $pdo->prepare("INSERT INTO calibration_certificates (calibration_id, certificate_number, certificate_date, issuer, result, file_path, file_hash, version, status, uploaded_by, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, NOW(), NOW())")
                    ->execute([$id, $certNo ?: ('CERT-' . strtoupper(substr(md5($id . microtime()), 0, 6))), $payload['certificate_date'] ?? null, $payload['issuer'] ?? null,
                        $run['result'] ?? null, $filePath ?: null, $okHash, $uid]);
                $newCertId = (int)$pdo->lastInsertId();
                if ($certNo !== '') {
                    $pdo->prepare("UPDATE calibration SET certificate_number = ?, certificate_file = ?, updated_at = NOW() WHERE id = ?")->execute([$certNo, $filePath ?: null, $id]);
                }
                audit_log($pdo, 'CAL_CERT_UPLOAD', 'calibration_certificate', $newCertId, 'แนบใบรับรอง #' . $certNo, null, ['hash' => $okHash ? substr($okHash, 0, 12) . '…' : null]);
                echo json_encode(['success' => true, 'message' => 'บันทึกใบรับรองแล้ว', 'certificate_id' => $newCertId, 'file_hash' => $okHash], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'certificate_supersede':
            $certId = (int)($payload['certificate_id'] ?? 0);
            $st = $pdo->prepare("SELECT * FROM calibration_certificates WHERE id = ?");
            $st->execute([$certId]);
            $cert = $st->fetch(PDO::FETCH_ASSOC);
            if (!$cert) api_fail(404, 'NOT_FOUND', 'ไม่พบใบรับรอง');
            $pdo->prepare("UPDATE calibration_certificates SET status='superseded', updated_at=NOW() WHERE id=? AND status='active'")->execute([$certId]);
            audit_log($pdo, 'CAL_CERT_VOID', 'calibration_certificate', $certId, 'Superedse/ยกเลิกใบรับรอง #' . ($cert['certificate_number'] ?? ''), 'active', 'superseded');
            echo json_encode(['success' => true, 'message' => 'Supersede ใบรับรองแล้ว'], JSON_UNESCAPED_UNICODE);
            break;

        case 'certificate_new_version':
            api_fail(400, 'USE_UPLOAD', 'ใช้ action certificate_upload แทน (ระบบทำ version ให้อัตโนมัติ)');

        case 'oot_create':
            $id = (int)($payload['calibration_id'] ?? 0);
            $r = cal_oot_create($pdo, $id, $uid);
            if (!empty($r['error'])) api_fail(409, 'CONFLICT', $r['message']);
            echo json_encode(['success' => true, 'message' => 'สร้าง OOT event แล้ว', 'oot_code' => $r['oot_code']], JSON_UNESCAPED_UNICODE);
            break;

        case 'oot_update':
            $id = (int)($payload['id'] ?? 0);
            $st = $pdo->prepare('SELECT * FROM calibration_oot_events WHERE id = ?');
            $st->execute([$id]);
            $oot = $st->fetch(PDO::FETCH_ASSOC);
            if (!$oot) api_fail(404, 'NOT_FOUND', 'ไม่พบ OOT event');
            $data = [
                'potentially_affected_process' => $payload['potentially_affected_process'] ?? ($oot['potentially_affected_process'] ?? null),
                'affected_product'        => $payload['affected_product'] ?? ($oot['affected_product'] ?? null),
                'affected_measurements'   => $payload['affected_measurements'] ?? ($oot['affected_measurements'] ?? null),
                'risk_assessment'         => $payload['risk_assessment'] ?? ($oot['risk_assessment'] ?? null),
                'investigation_status'    => in_array($payload['investigation_status'] ?? $oot['investigation_status'], ['open','investigating','resolved','closed','cancelled'], true) ? $payload['investigation_status'] : ($oot['investigation_status'] ?? 'open'),
                'investigation_result'    => $payload['investigation_result'] ?? ($oot['investigation_result'] ?? null),
                'fail_action'             => in_array($payload['fail_action'] ?? $oot['fail_action'], ['adjust','repair','recalibrate','send_external','scrap','investigate'], true) ? $payload['fail_action'] : ($oot['fail_action'] ?? null),
                'rca_id'                  => !empty($payload['rca_id']) ? (int)$payload['rca_id'] : ($oot['rca_id'] ?? null),
                'repair_id'               => !empty($payload['repair_id']) ? (int)$payload['repair_id'] : ($oot['repair_id'] ?? null),
            ];
            $set = []; $vals = [];
            foreach ($data as $k => $v) { $set[] = "`$k` = ?"; $vals[] = $v; }
            $vals[] = $id;
            $pdo->prepare('UPDATE calibration_oot_events SET ' . implode(',', $set) . ', updated_at = NOW() WHERE id = ?')->execute($vals);
            audit_log($pdo, 'CAL_OOT_UPDATE', 'calibration_oot', $id, 'อัปเดต OOT ' . ($oot['oot_code'] ?? '#') . ' → ' . $data['investigation_status']);
            echo json_encode(['success' => true, 'message' => 'อัปเดต OOT แล้ว'], JSON_UNESCAPED_UNICODE);
            break;

        case 'config_save':
            $updates = $payload['settings'] ?? null;
            if (!is_array($updates) || count($updates) === 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ settings เป็น key→value');
            $allowed = cal_config($pdo);
            $applied = 0; $rejected = [];
            $st = $pdo->prepare('UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?');
            foreach ($updates as $k => $v) {
                if (!array_key_exists((string)$k, $allowed)) { $rejected[] = $k; continue; }
                $st->execute([is_bool($v) ? ($v ? '1' : '0') : $v, (string)$k]);
                $applied++;
            }
            audit_log($pdo, 'CAL_CONFIG_SAVE', 'system', '', 'ตั้งค่าสอบเทียบ ' . $applied . ' รายการ' . (count($rejected) ? ' (ข้าม ' . implode(',', $rejected) . ')' : ''));
            echo json_encode(['success' => true, 'message' => "บันทึกการตั้งค่าแล้ว {$applied} รายการ", 'applied' => $applied, 'rejected' => $rejected], JSON_UNESCAPED_UNICODE);
            break;

        default:
            api_fail(400, 'UNKNOWN_ACTION', 'ไม่รู้จัก action: ' . $action);
    }
} catch (Throwable $e) {
    api_safe_catch($e, 'เกิดข้อผิดพลาดในระบบสอบเทียบ กรุณาลองใหม่ภายหลัง');
}