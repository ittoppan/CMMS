<?php
/**
 * work_permit.php — Permit to Work (PTW) & Maintenance Safety API (Phase 30)
 *
 * Thin adapter เหนือ src/helpers/safety.php (single source) — API บังคับ
 * requireLogin + requirePerm('safety', $action) + enforceCsrf() ฝั่ง server เสมอ.
 *
 *   GET  /api/v1/work_permit.php?action=...
 *     config       — config ทั้งหมด + can_* (ใช้ตรวจปุ่ม/เงื่อนไขฝั่ง client)
 *     statuses     — map สถานะ -> label ไทย
 *     types        — permit_types + requirements (ฟอร์ม create)
 *     options      — assets/WO/contractors/users/permit_types (ฟอร์ม create)
 *     dashboard    — สรุปตัวเลข (?mine=1 จำกัดเฉพาะผู้ใช้)
 *     list         — รายการใบอนุญาต (status/risk/type/search)
 *     get          — detail ใบเดียว (?id=N)
 *     data-quality — ช่องว่างข้อมูล safety
 *
 *   POST (CSRF + permission + idempotency — audit ทุก mutation)
 *     create             { permit_type_code, asset_id?, repair_id?, location_id?, work_description,
 *                           start_at?, end_at?, supervisor_id?, safety_reviewer_id?, area_owner_id?, contractor_id?... }
 *     submit             { id, supervisor_id?, ... }
 *     risk_review        { id, risks:[{hazard, likelihood, severity, ...}] }
 *     approve_step       { id, step, decision, comment? }   (approve/reject/revision_requested)
 *     activate           { id }
 *     suspend            { id, reason_type?, reason, evidence_photo? }
 *     resume             { id, resume_note?, ... }
 *     complete           { id }
 *     close              { id, ... }
 *     cancel             { id, reason? }
 *     loto_add           { id, point_label, energy_type?, isolation_method?, lock_no?, tag_no? }
 *     loto_lock          { point_id, lock_no?, tag_no? }
 *     loto_verify        { id, loto_point_id?, verification_method?, result, instrument_id?, note? }
 *     loto_remove        { point_id }
 *     gas_test           { id, gas_type?, instrument_id?, reading?, unit?, acceptable_min?, acceptable_max?, result, note? }
 *     worker_add         { id, worker_type, user_id?|contractor_worker_id?, task? }
 *     worker_entry       { worker_id }
 *     worker_exit        { worker_id }
 *     ppe                { id, items:[{code,label}] }
 *     checklist          { id, phase, items:[{code,label,result}] }
 *     stop_work          { id, reason_type?, reason, ... }
 *     stop_work_review   { stop_id, review_status, corrective_action?, review_note? }
 *     safety_action      { permit_id?, source_type?, description, owner_user_id?, priority?, due_date? }
 *     action_transition  { action_id, to, note? }
 *
 * SAME_ORIGIN / CSRF: ทุก POST ผ่าน enforceCsrf() (token หรือ Origin/Referer).
 * Idempotency: ส่ง client_action_id ใน body หรือ header X-Client-Action-Id เพื่อกัน retry ซ้ำ.
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/safety.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $uName = (string)($_SESSION['user_name'] ?? '');

    $hasPerm = fn(string $a): bool => canPerm($pdo, 'safety', $a);

    /* ───────────────────────── GET ───────────────────────── */

    if ($method === 'GET') {
        header('Content-Type: application/json; charset=utf-8');
        $action = (string)($_GET['action'] ?? 'config');
        requirePerm($pdo, 'safety', 'view');

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config' => wp_config($pdo),
                    'statuses' => wp_statuses(),
                    'can' => [
                        'view' => $hasPerm('view'),
                        'create' => $hasPerm('create'),
                        'edit' => $hasPerm('edit'),
                        'approve' => $hasPerm('approve'),
                        'execute' => $hasPerm('execute'),
                        'cancel' => $hasPerm('cancel'),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                exit;

            case 'statuses':
                echo json_encode(['statuses' => wp_statuses()], JSON_UNESCAPED_UNICODE);
                exit;

            case 'types': {
                $res = wp_options($pdo);
                echo json_encode(['permit_types' => $res['permit_types'], 'config' => wp_config($pdo)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'options':
                echo json_encode(wp_options($pdo), JSON_UNESCAPED_UNICODE);
                exit;

            case 'dashboard':
                echo json_encode(['dashboard' => wp_dashboard($pdo, !empty($_GET['mine']) ? $uid : null)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'list':
                echo json_encode(['permits' => wp_list($pdo, [
                    'status' => (string)($_GET['status'] ?? ''),
                    'risk' => (string)($_GET['risk'] ?? ''),
                    'type' => (string)($_GET['type'] ?? ''),
                    'search' => (string)($_GET['search'] ?? ''),
                ])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'get': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $d = wp_detail($pdo, $id);
                if (!$d) api_fail(404, 'NOT_FOUND', 'ไม่พบใบอนุญาต');
                echo json_encode(['permit' => $d], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'data-quality':
                echo json_encode(['checks' => wp_data_quality($pdo)], JSON_UNESCAPED_UNICODE);
                exit;

            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
    }

    /* ───────────────────────── POST ───────────────────────── */

    if ($method === 'POST') {
        enforceCsrf();
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $actionRel = trim((string)($data['action'] ?? ''));
        if ($actionRel === '') $actionRel = trim((string)($_GET['action'] ?? ''));
        $action = str_replace('/', '_', $actionRel);

        // ── permission gates (back-end authorization บังคับเสมอ) ──
        switch ($action) {
            case 'create':
                requirePerm($pdo, 'safety', 'create');
                break;
            case 'approve_step':
                requirePerm($pdo, 'safety', 'approve');
                break;
            case 'cancel':
                requirePerm($pdo, 'safety', 'cancel');
                break;
            case 'submit':
            case 'risk_review':
            case 'worker_add':
            case 'worker_entry':
            case 'worker_exit':
            case 'ppe':
            case 'checklist':
                requirePerm($pdo, 'safety', 'edit');
                break;
            case 'activate':
            case 'suspend':
            case 'resume':
            case 'complete':
            case 'close':
            case 'loto_add':
            case 'loto_lock':
            case 'loto_verify':
            case 'loto_remove':
            case 'gas_test':
            case 'stop_work':
            case 'stop_work_review':
            case 'safety_action':
            case 'action_transition':
                requirePerm($pdo, 'safety', 'execute');
                break;
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }

        // ── idempotency (กัน offline/retry ส่งซ้ำ) ──
        $idemKey = clientActionKeyFromRequest($data);
        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/work_permit.php?action=' . urlencode($actionRel));
            if ($idem['status'] === 'replay') {
                echo json_encode(['success' => true, 'dedup' => true, 'id' => $idem['ref_id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($idem['status'] !== 'new') {
                clientActionFinish($pdo, $idemKey, 'conflict', null, null, 409);
                echo json_encode(['success' => false, 'error' => 'รายการนี้ถูกส่งแล้วจากอุปกรณ์ของท่าน — ไม่ประมวลผลซ้ำ', 'code' => 'CLIENT_ACTION_UNCERTAIN'], JSON_UNESCAPED_UNICODE);
                http_response_code(409);
                exit;
            }
        }

        // ตอบผลจาก engine พร้อม mapping error → HTTP status + audit via activity (ใน engine แล้ว)
        $respond = function (array $res) use ($pdo, $idemKey): void {
            if (isset($res['error'])) {
                $code = (string)$res['error'];
                $detail = (string)($res['detail'] ?? '');
                $status = match ($code) {
                    'NOT_FOUND' => 404,
                    'FORBIDDEN', 'FORBIDDEN_STEP' => 403,
                    'BAD_TRANSITION', 'ALREADY_DECIDED', 'PRIOR_STEP_PENDING', 'INSTRUMENT_RED', 'NOT_AUTHORIZED',
                    'LOCK_TAG_REQUIRED', 'RISK_REQUIRED', 'CHECKLIST_INCOMPLETE', 'ISOLATION_REQUIRED', 'GAS_REQUIRED',
                    'PPE_REQUIRED', 'WORKER_AUTH_REQUIRED', 'STEP_NOT_FOUND', 'BAD_DECISION', 'ACTIVE_STOP' => 409,
                    default => 400,
                };
                clientActionFinish($pdo, $idemKey, 'failed', null, null, $status);
                api_fail($status, $code, $detail !== '' ? $detail : $code);
            }
            clientActionFinish($pdo, $idemKey, 'success', 'work_permit', $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], $res), JSON_UNESCAPED_UNICODE);
            exit;
        };

        $id = (int)($data['id'] ?? 0);
        $pointId = (int)($data['point_id'] ?? 0);
        $workerId = (int)($data['worker_id'] ?? 0);

        switch ($action) {
            case 'create':
                $respond(wp_create($pdo, $uid, $data));
                break;

            case 'submit':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_submit($pdo, $uid, $id, $data));
                break;

            case 'risk_review':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_risk_review($pdo, $uid, $id, $data));
                break;

            case 'approve_step': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $step = (int)($data['step'] ?? 0);
                $decision = (string)($data['decision'] ?? '');
                if ($step <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ step');
                $respond(wp_approve_step($pdo, $uid, $id, $step, $decision, isset($data['comment']) ? (string)$data['comment'] : null));
                break;
            }

            case 'activate':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_activate($pdo, $uid, $id));
                break;

            case 'suspend':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_suspend($pdo, $uid, $id, $data));
                break;

            case 'resume':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_resume($pdo, $uid, $id, $data));
                break;

            case 'complete':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_complete($pdo, $uid, $id));
                break;

            case 'close':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_close($pdo, $uid, $id, $data));
                break;

            case 'cancel':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_cancel($pdo, $uid, $id, isset($data['reason']) ? (string)$data['reason'] : null));
                break;

            case 'loto_add':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_add_loto_point($pdo, $uid, $id, $data));
                break;

            case 'loto_lock':
                if ($pointId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ point_id');
                $respond(wp_lock_loto_point($pdo, $uid, $pointId, $data));
                break;

            case 'loto_verify':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_verify_zero_energy($pdo, $uid, $id, $data));
                break;

            case 'loto_remove':
                if ($pointId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ point_id');
                $respond(wp_remove_loto_point($pdo, $uid, $pointId));
                break;

            case 'gas_test':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_gas_test($pdo, $uid, $id, $data));
                break;

            case 'worker_add':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_add_worker($pdo, $uid, $id, $data));
                break;

            case 'worker_entry':
                if ($workerId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ worker_id');
                $respond(wp_worker_entry_exit($pdo, $uid, $workerId, 'entry'));
                break;

            case 'worker_exit':
                if ($workerId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ worker_id');
                $respond(wp_worker_entry_exit($pdo, $uid, $workerId, 'exit'));
                break;

            case 'ppe':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_confirm_ppe($pdo, $uid, $id, (array)($data['items'] ?? [])));
                break;

            case 'checklist':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_checklist($pdo, $uid, $id, (string)($data['phase'] ?? 'pre_work'), (array)($data['items'] ?? [])));
                break;

            case 'stop_work':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(wp_stop_work($pdo, $uid, $id, $data));
                break;

            case 'stop_work_review': {
                $stopId = (int)($data['stop_id'] ?? 0);
                if ($stopId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ stop_id');
                $respond(wp_review_stop_work($pdo, $uid, $stopId, $data));
                break;
            }

            case 'safety_action':
                $respond(wp_add_safety_action($pdo, $uid, $data));
                break;

            case 'action_transition': {
                $actionId = (int)($data['action_id'] ?? $data['id'] ?? 0);
                if ($actionId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ action_id');
                $respond(wp_action_transition($pdo, $uid, $actionId, (string)($data['to'] ?? ''), isset($data['note']) ? (string)$data['note'] : null));
                break;
            }

            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
    }

    api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');

} catch (DomainException $e) {
    api_fail(400, 'VALIDATION_ERROR', $e->getMessage());
} catch (Throwable $e) {
    api_safe_catch($e);
}