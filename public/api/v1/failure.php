<?php
/**
 * failure.php — Failure Analysis & Root Cause Management API (Phase 27)
 *
 * Thin adapter เหนือ src/helpers/failure.php (single source) — API บังคับ
 * requireLogin + requirePerm('failure', $action) ฝั่ง server เสมอ
 *
 *   GET  /api/v1/failure.php?action=...
 *     config             — เกณฑ์ trigger / window / threshold
 *     taxonomy           — failure_types / failure_modes / failure_causes / root_cause_categories
 *     events             — รายการเหตุการณ์ความเสียหาย (filters + paging)
 *     events/options     — วุ้อมลสำหรับ create: assets + wo options + taxonomy
 *     event              — detail เหตุการณ์เดียว (?id=N)
 *     event/evaluate     — ประเมิน repeat/rca ของ event (?id=N)
 *     rcas               — รายการ RCA (filters + paging)
 *     rca                — detail RCA (?id=N) รวม whys/evidence/measurements/actions/links/effectiveness
 *     rca/whys           — 5-Why ของ RCA (?id=N)
 *     rca/evidence       — หลักฐาน (?id=N)
 *     rca/measurements   — การวัด (?id=N)
 *     rca/actions        — action list (?id=N)
 *     rca/links          — action links (?id=N)
 *     rca/effectiveness  — ทบทวนผล (?id=N)
 *     dashboard          — สรุป + top failure modes + top assets + trend
 *     repeat-suspects    — รายการ "Repeat Failure Suspected"
 *     trend              — แนวโน้มรายเดือน
 *     data-quality       — ช่องว่างข้อมูล
 *     users              — ผู้ใช้สำหรับ assign (role 1,2,6,7)
 *     assets/wos         — assets + WO options สำหรับ form
 *
 *   POST (CSRF + permission ตรวจฝั่ง server — audit ทุก mutation)
 *     event/create       { asset_id, repair_id?, failure_date?, type/mode/cause?, severity, description, symptom? ... }
 *     event/update       { id, ... }
 *     rca/create         { failure_event_id, repair_id?, title, problem_statement?, assignee_id?, due_date?, trigger_reason? }
 *     rca/update         { id, ... }
 *     rca/transition     { id, to, note? }
 *     rca/why            { rca_id, rows:[{level, statement, is_root}] }
 *     evidence/add       { rca_id, evidence_type, title, description?, source?, file_*?, ... }  (append-only)
 *     measurement/add    { rca_id?, failure_event_id?, measurement_type, value, unit?, instrument, note? }
 *     action/create      { rca_id, action_type, title, description?, owner_id?, priority?, due_date?, is_mandatory? }
 *     action/update      { id, ... }
 *     action/complete    { id, evidence }
 *     action/verify      { id, pass, note? }
 *     action/cancel      { id, note }
 *     effectiveness/save { rca_id, effectiveness, remarks?, before_failures, after_failures, before_months?, after_months? }
 *     link/create        { rca_id, link_type, title, description?, proposed_change, action_id?, target_*? }
 *     link/transition    { id, to, note? }   (proposed→approved/rejected, approved→applied)
 *
 * ทุก POST ตรวจ requirePerm($pdo, 'failure', $action) ก่อน (back-end authorization)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/failure.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $roleId = currentRoleId();
    $roleId = $roleId ?: (int)($_SESSION['role_id'] ?? 0);
    if (!$roleId) {
        $st = $pdo->prepare('SELECT role_id FROM users WHERE id = ?');
        $st->execute([$uid]);
        $roleId = (int)($st->fetchColumn() ?: 0);
    }

    $canEdit = in_array($roleId, failure_roles_edit(), true);
    $canManage = in_array($roleId, failure_roles_manage(), true);
    $canApprove = in_array($roleId, failure_roles_approve(), true);

    /* ───────────────────────── GET ───────────────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'dashboard');

        $opts = [
            'role_id' => $roleId,
            'user_id' => $uid,
            'asset_id' => (string)($_GET['asset_id'] ?? ''),
            'severity' => (string)($_GET['severity'] ?? ''),
            'repeat_suspected' => (string)($_GET['repeat_suspected'] ?? ''),
            'rca_required' => (string)($_GET['rca_required'] ?? ''),
            'no_rca' => (string)($_GET['no_rca'] ?? ''),
            'q' => (string)($_GET['q'] ?? ''),
            'from' => (string)($_GET['from'] ?? ''),
            'to' => (string)($_GET['to'] ?? ''),
            'range' => (string)($_GET['range'] ?? ''),
            'months' => (string)($_GET['months'] ?? ''),
            'status' => (string)($_GET['status'] ?? ''),
            'assignee_id' => (string)($_GET['assignee_id'] ?? ''),
        ];
        $page = max(1, (int)($_GET['page'] ?? 1));
        $per = min(200, max(1, (int)($_GET['per'] ?? 25)));

        switch ($action) {
            case 'config':
                echo json_encode(['config' => failure_config($pdo), 'can_edit' => $canEdit, 'can_manage' => $canManage, 'can_approve' => $canApprove], JSON_UNESCAPED_UNICODE);
                exit;

            case 'taxonomy':
                echo json_encode(['taxonomy' => failure_taxonomy($pdo), 'can_taxonomy' => in_array($roleId, failure_roles_taxonomy(), true)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'events':
                echo json_encode(['events' => failure_event_list($pdo, $opts, $page, $per)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'events/options': {
                $id = (int)($_GET['id'] ?? 0);
                $out = [
                    'assets' => failure_assets($pdo),
                    'wos' => failure_wo_options($pdo),
                    'taxonomy' => failure_taxonomy($pdo),
                    'users' => failure_engine_users($pdo, 'edit'),
                ];
                if ($id > 0) $out['event'] = failure_event_find($pdo, $id);
                echo json_encode($out, JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'event':
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(['event' => failure_event_find($pdo, $id)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'event/evaluate':
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(['evaluation' => failure_event_evaluate($pdo, $id)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rcas':
                echo json_encode(['rcas' => failure_rca_list($pdo, $opts, $page, $per), 'can_manage' => $canManage], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rca': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $rca = failure_rca_find($pdo, $id);
                $out = [
                    'rca' => $rca,
                    'why' => failure_rca_whys($pdo, $id),
                    'evidence' => failure_rca_evidence($pdo, $id),
                    'measurements' => failure_rca_measurements($pdo, $id),
                    'actions' => failure_rca_actions($pdo, $id),
                    'links' => failure_rca_links($pdo, $id),
                    'effectiveness' => failure_rca_effectiveness($pdo, $id),
                    'event' => (int)($rca['failure_event_id'] ?? 0) > 0 ? failure_event_find($pdo, (int)$rca['failure_event_id']) : null,
                    'taxonomy' => failure_taxonomy($pdo),
                    'config' => failure_config($pdo),
                    'can_edit' => $canEdit,
                    'can_manage' => $canManage,
                    'can_approve' => $canApprove,
                ];
                echo json_encode($out, JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'rca/whys':
                echo json_encode(['why' => failure_rca_whys($pdo, (int)($_GET['id'] ?? 0))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rca/evidence':
                echo json_encode(['evidence' => failure_rca_evidence($pdo, (int)($_GET['id'] ?? 0))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rca/measurements':
                echo json_encode(['measurements' => failure_rca_measurements($pdo, (int)($_GET['id'] ?? 0))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rca/actions':
                echo json_encode(['actions' => failure_rca_actions($pdo, (int)($_GET['id'] ?? 0))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rca/links':
                echo json_encode(['links' => failure_rca_links($pdo, (int)($_GET['id'] ?? 0))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'rca/effectiveness':
                echo json_encode(['effectiveness' => failure_rca_effectiveness($pdo, (int)($_GET['id'] ?? 0))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'dashboard':
                echo json_encode(['dashboard' => failure_dashboard($pdo, $opts), 'repeat_suspects' => failure_repeat_suspects($pdo, ['limit' => 20])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'repeat-suspects':
                echo json_encode(['items' => failure_repeat_suspects($pdo, ['limit' => (int)($_GET['limit'] ?? 100)])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'trend':
                echo json_encode(['trend' => failure_trend($pdo, $opts)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'data-quality':
                echo json_encode(['data_quality' => failure_data_quality($pdo)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'users':
                echo json_encode(['users' => failure_engine_users($pdo, (string)($_GET['scope'] ?? 'edit'))], JSON_UNESCAPED_UNICODE);
                exit;

            case 'assets/wos':
                echo json_encode(['assets' => failure_assets($pdo), 'wos' => failure_wo_options($pdo)], JSON_UNESCAPED_UNICODE);
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
        $uName = (string)($_SESSION['user_name'] ?? '');
        $audit = function (string $resource, string|int $resourceId, string $desc, array $before = [], array $after = []) use ($pdo, $uName, $uid, $action): void {
            audit_log($pdo, strtoupper($action) === '' ? 'FAILURE' : strtoupper(str_replace('_', ' ', $action)), $resource, $resourceId, $desc . ' [' . $uName . ']', $before !== [] ? $before : null, $after !== [] ? $after : null);
        };

        // ── permission gates (back-end authorization บังคับเสมอ) ──
        switch ($action) {
            case 'rca_transition': {
                // transition ต้องดูจากค่า to (close/verify ต้อง role manage, ที่เหลือ investigate)
                $to = strtolower(trim((string)($data['to'] ?? '')));
                if (in_array($to, ['closed', 'verification'], true)) requirePerm($pdo, 'failure', 'close');
                elseif ($to === 'reopened') requirePerm($pdo, 'failure', 'close');
                else requirePerm($pdo, 'failure', 'investigate');
                break;
            }
            case 'link_transition':
                requirePerm($pdo, 'failure', 'approve');
                break;
            case 'action_verify':
                requirePerm($pdo, 'failure', 'verify');
                break;
            case 'evidence_add':
            case 'measurement_add':
            case 'action_create':
            case 'action_update':
            case 'action_complete':
            case 'action_cancel':
            case 'link_create':
                requirePerm($pdo, 'failure', 'actions');
                break;
            case 'rca_why':
            case 'rca_update':
                requirePerm($pdo, 'failure', 'edit');
                break;
            case 'event_create':
            case 'rca_create':
                requirePerm($pdo, 'failure', 'create');
                break;
            case 'event_update':
                requirePerm($pdo, 'failure', 'edit');
                break;
            case 'effectiveness_save':
                requirePerm($pdo, 'failure', 'verify');
                break;
            case 'taxonomy_save':
            case 'taxonomy_deactivate':
                requirePerm($pdo, 'failure', 'taxonomy');
                break;
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }

        $id = (int)($data['id'] ?? 0);

        switch ($action) {
            case 'event_create': {
                $res = failure_event_create($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id'], 'code' => $res['code'], 'repeat_suspected' => $res['repeat_suspected'], 'rca_required' => $res['rca_required'], 'reasons' => $res['reasons']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'event_update': {
                failure_event_update($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => (int)$data['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'rca_create': {
                $res = failure_rca_create($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id'], 'code' => $res['code']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'rca_update': {
                failure_rca_update($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => (int)$data['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'rca_transition': {
                $to = (string)($data['to'] ?? '');
                if ($id <= 0 || $to === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id และสถานะปลายทาง');
                $res = failure_rca_transition($pdo, $id, $to, $uid, (string)($data['note'] ?? ''));
                echo json_encode(['success' => true, 'id' => $id, 'from' => $res['from'], 'to' => $res['to']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'rca_why': {
                $rcaId = (int)($data['rca_id'] ?? 0);
                if ($rcaId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ rca_id');
                failure_rca_why_save($pdo, $rcaId, (array)($data['rows'] ?? []), $uid);
                echo json_encode(['success' => true, 'rca_id' => $rcaId, 'why' => failure_rca_whys($pdo, $rcaId)], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'evidence_add': {
                $res = failure_rca_evidence_add($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'measurement_add': {
                $res = failure_rca_measurement_add($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'action_create': {
                $res = failure_rca_action_create($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'action_update': {
                failure_rca_action_update($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'action_complete': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                failure_rca_action_complete($pdo, $id, $uid, (string)($data['evidence'] ?? ''));
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'action_verify': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                failure_rca_action_verify($pdo, $id, $uid, !empty($data['pass']), (string)($data['note'] ?? ''));
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'action_cancel': {
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                failure_rca_action_cancel($pdo, $id, $uid, (string)($data['note'] ?? ''));
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'effectiveness_save': {
                $res = failure_rca_effectiveness_save($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'link_create': {
                $res = failure_rca_link_create($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'link_transition': {
                $to = (string)($data['to'] ?? '');
                if ($id <= 0 || $to === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id และสถานะปลายทาง');
                failure_rca_link_transition($pdo, $id, $to, $uid, (string)($data['note'] ?? ''));
                echo json_encode(['success' => true, 'id' => $id, 'to' => $to], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'taxonomy_save': {
                $res = failure_taxonomy_save($pdo, $data, $uid);
                echo json_encode(['success' => true, 'id' => $res['id'], 'created' => $res['created']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            case 'taxonomy_deactivate': {
                $kind = (string)($data['kind'] ?? '');
                if ($id <= 0 || $kind === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ kind และ id');
                failure_taxonomy_deactivate($pdo, $kind, $id, $uid);
                echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
                exit;
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