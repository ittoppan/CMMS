<?php
/**
 * contractor.php — Contractor Management & External Service API (Phase 31)
 *
 * Thin adapter เหนือ src/helpers/contractor.php (single source) — API บังคับ
 * requireLogin + requirePerm('contractor', $action) + enforceCsrf() ฝั่ง server เสมอ.
 *
 *   GET  /api/v1/contractor.php?action=...
 *     config        — config ทั้งหมด + status maps + can_* (ตรวจปุ่ม/เงื่อนไขฝั่ง client)
 *     statuses      — contractor status -> label ไทย
 *     options       — masters ที่ฟอร์ม create ต้องใช้ (users, assets, WOs, ...)
 *     dashboard     — ตัวเลขภาพรวม + งานค้าง + เอกสาร/SLA เตือน
 *     list          — users ?status / ?search / ?category / ?owner / ?qualified
 *     get           — detail ครบชุด (?id=N)
 *     assignments   — งานภายนอก (?status / ?contractor_id / ?search / ?mine)
 *     contracts     — สัญญาของผู้รับเหมา (?contractor_id)
 *     contacts      — ผู้ติดต่อ (?contractor_id)
 *     documents     — เอกสาร (?contractor_id)
 *     qualifications— รอบประเมินทั้งหมด (?contractor_id)
 *     qual-current  — รอบประเมินล่าสุด (?contractor_id)
 *     workers       — พนักงานผู้รับเหมา (?contractor_id)
 *     worker-autz   — ตรวจใบรับรองพนักงาน (?worker_id&service_category=)
 *     activity      — timeline (?contractor_id / ?assignment_id / ?limit)
 *     performance   — scorecard จริง (?contractor_id&from=&to=)
 *     cost-summary  — งบประมาณ/ค่าใช้จ่าย (?contractor_id)
 *     analytics     — แนวโน้ม (?from=&to=)
 *     data-quality  — ช่องว่างข้อมูล (?check=)
 *     reports       — รายงาน (?report=&from=&to=)
 *
 *   POST (CSRF + permission + idempotency — activity/audit ทุก mutation ใน engine แล้ว)
 *     create                    { company_name, ... }
 *     update                    { id, ... }
 *     status                    { id, to, reason?, evidence? }
 *     contact_add               { contractor_id, full_name, role?, phone?, email?, line_id?, is_primary? }
 *     contact_update            { contact_id, ... }
 *     contact_delete            { contact_id }
 *     doc_add                   { contractor_id, doc_type, file_path, file_original_name?, doc_no?, issue_date?, expiry_date?, notes? }
 *     doc_update                { doc_id, ... }
 *     qual_create               { contractor_id, dimension_scores?, ... }
 *     qual_submit               { qual_id }
 *     qual_review               { qual_id, decision(approved|conditional|rejected), reason?, valid_until? }
 *     worker_add                { contractor_id, full_name, ... }
 *     worker_update             { worker_id, ... }
 *     cert_add                  { worker_id, certification_code, issue_date?, expiry_date?, photo_path? }
 *     cert_revoke               { cert_id, reason? }
 *     contract_create           { contractor_id, title, contract_type?, amount?, start_date?, end_date?, ... }
 *     contract_update           { contract_id, ... }
 *     assign                    { contractor_id, title, work_order_id?, asset_id?, service_category?, planned_start?/end?, ... }
 *     assignment_status         { id, to, note? }   (workflow ใน engine + permit gate + SLA)
 *     bind_permit               { id, permit_id }
 *     inspect                   { id, result(pass|conditional|reject), defect?, rework_due_date?, checklist?/evidence?, notes? }
 *     action_create             { contractor_id, issue, assignment_id?, owner_id?, due_date?, ... }
 *     action_verify             { action_id, note? }
 *     review_create             { contractor_id, period, period_start?, period_end?, score?, comment? }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/contractor.php';
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

    $hasPerm = fn(string $a): bool => canPerm($pdo, 'contractor', $a);

    /* ───────────────────────── GET ───────────────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'config');
        requirePerm($pdo, 'contractor', 'view');

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config' => ctr_config($pdo),
                    'statuses' => ctr_statuses(),
                    'assignment_statuses' => ctr_assignment_statuses(),
                    'can' => [
                        'view' => $hasPerm('view'),
                        'create' => $hasPerm('create'),
                        'edit' => $hasPerm('edit'),
                        'approve' => $hasPerm('approve'),
                        'execute' => $hasPerm('execute'),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                exit;

            case 'statuses':
                echo json_encode(['statuses' => ctr_statuses()], JSON_UNESCAPED_UNICODE);
                exit;

            case 'options':
                echo json_encode(ctr_options($pdo, $uid), JSON_UNESCAPED_UNICODE);
                exit;

            case 'dashboard':
                echo json_encode(['dashboard' => ctr_dashboard($pdo)], JSON_UNESCAPED_UNICODE);
                exit;

            case 'list':
                echo json_encode(['contractors' => ctr_list($pdo, [
                    'status' => (string)($_GET['status'] ?? ''),
                    'search' => (string)($_GET['search'] ?? ''),
                    'category' => (string)($_GET['category'] ?? ''),
                    'owner' => (int)($_GET['owner'] ?? 0),
                    'qualified' => (int)($_GET['qualified'] ?? 0),
                ])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'get': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $d = ctr_detail($pdo, $id);
                if (!$d) api_fail(404, 'NOT_FOUND', 'ไม่พบผู้รับเหมา');
                echo json_encode(['contractor' => $d], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'assignments':
                echo json_encode(['assignments' => ctr_assignments($pdo, [
                    'status' => (string)($_GET['status'] ?? ''),
                    'contractor_id' => (int)($_GET['contractor_id'] ?? 0),
                    'search' => (string)($_GET['search'] ?? ''),
                    'mine' => !empty($_GET['mine']) ? $uid : 0,
                ])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'contracts': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['contracts' => ctr_contracts($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'contacts': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['contacts' => ctr_contacts($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'documents': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['documents' => ctr_documents($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'qualifications': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['qualifications' => ctr_qualifications_all($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'qual-current': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['current' => ctr_qual_current($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'workers': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['workers' => ctr_workers($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'worker-autz': {
                $wid = (int)($_GET['worker_id'] ?? 0);
                if ($wid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ worker_id');
                echo json_encode(['autz' => ctr_worker_autz($pdo, $wid, (string)($_GET['service_category'] ?? ''))], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'activity':
                echo json_encode(['activity' => ctr_activity_list(
                    $pdo,
                    (int)($_GET['contractor_id'] ?? 0) ?: null,
                    (int)($_GET['assignment_id'] ?? 0) ?: null,
                    min(500, max(1, (int)($_GET['limit'] ?? 200))),
                )], JSON_UNESCAPED_UNICODE);
                exit;

            case 'performance': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['performance' => ctr_performance($pdo, $cid, (string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''))], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'cost-summary': {
                $cid = (int)($_GET['contractor_id'] ?? 0);
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                echo json_encode(['cost' => ctr_cost_summary($pdo, $cid)], JSON_UNESCAPED_UNICODE);
                exit;
            }

            case 'analytics':
                echo json_encode(['analytics' => ctr_analytics($pdo, [
                    'from' => (string)($_GET['from'] ?? ''),
                    'to' => (string)($_GET['to'] ?? ''),
                    'contractor_id' => (int)($_GET['contractor_id'] ?? 0),
                ])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'data-quality':
                echo json_encode(['checks' => ctr_data_quality($pdo, [
                    'check' => (string)($_GET['check'] ?? ''),
                    'contractor_id' => (int)($_GET['contractor_id'] ?? 0),
                ])], JSON_UNESCAPED_UNICODE);
                exit;

            case 'reports': {
                $report = (string)($_GET['report'] ?? '');
                if ($report === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ report');
                echo json_encode(['report' => ctr_reports($pdo, $report, [
                    'from' => (string)($_GET['from'] ?? ''),
                    'to' => (string)($_GET['to'] ?? ''),
                    'contractor_id' => (int)($_GET['contractor_id'] ?? 0),
                    'status' => (string)($_GET['status'] ?? ''),
                ])], JSON_UNESCAPED_UNICODE);
                exit;
            }

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
                requirePerm($pdo, 'contractor', 'create');
                break;
            case 'status':
            case 'qual_review':
            case 'bind_permit':
                requirePerm($pdo, 'contractor', 'approve');
                break;
            case 'update':
            case 'contact_add':
            case 'contact_update':
            case 'contact_delete':
            case 'doc_add':
            case 'doc_update':
            case 'qual_create':
            case 'qual_submit':
            case 'worker_add':
            case 'worker_update':
            case 'cert_add':
            case 'cert_revoke':
            case 'contract_create':
            case 'contract_update':
                requirePerm($pdo, 'contractor', 'edit');
                break;
            case 'assign':
            case 'assignment_status':
            case 'inspect':
            case 'action_create':
            case 'action_transition':
            case 'action_verify':
            case 'review_create':
                requirePerm($pdo, 'contractor', 'execute');
                break;
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }

        // ── idempotency (กัน offline/retry ส่งซ้ำ) ──
        $idemKey = clientActionKeyFromRequest($data);
        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/contractor.php?action=' . urlencode($actionRel));
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

        // ตอบผลจาก engine — เปิดเผย error ผ่าน DomainException (catch กลางข้างล่าง)
        $respond = function (array $res) use ($pdo, $idemKey): void {
            clientActionFinish($pdo, $idemKey, 'success', 'contractor', $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], $res), JSON_UNESCAPED_UNICODE);
            exit;
        };

        $id = (int)($data['id'] ?? 0);
        $cid = (int)($data['contractor_id'] ?? 0);
        if ($cid <= 0) $cid = $id;

        switch ($action) {
            case 'create':
                $respond(ctr_create($pdo, $data, $uid));
                break;

            case 'update':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(ctr_update($pdo, $id, $data, $uid));
                break;

            case 'status':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(ctr_status_change($pdo, $id, (string)($data['to'] ?? ''), $uid, (string)($data['reason'] ?? ''), (string)($data['evidence'] ?? '')));
                break;

            case 'contact_add':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_contact_add($pdo, $cid, $data, $uid));
                break;

            case 'contact_update': {
                $contactId = (int)($data['contact_id'] ?? 0);
                if ($contactId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contact_id');
                $respond(ctr_contact_update($pdo, $contactId, $data, $uid));
                break;
            }

            case 'contact_delete': {
                $contactId = (int)($data['contact_id'] ?? 0);
                if ($contactId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contact_id');
                $respond(ctr_contact_delete($pdo, $contactId, $uid));
                break;
            }

            case 'doc_add':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_doc_add($pdo, $cid, $data, $uid));
                break;

            case 'doc_update': {
                $docId = (int)($data['doc_id'] ?? 0);
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ doc_id');
                $respond(ctr_doc_update($pdo, $docId, $data, $uid));
                break;
            }

            case 'qual_create':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_qual_create($pdo, $cid, $data, $uid));
                break;

            case 'qual_submit': {
                $qualId = (int)($data['qual_id'] ?? 0);
                if ($qualId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ qual_id');
                $respond(ctr_qual_submit($pdo, $qualId, $uid));
                break;
            }

            case 'qual_review': {
                $qualId = (int)($data['qual_id'] ?? 0);
                if ($qualId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ qual_id');
                $respond(ctr_qual_review($pdo, $qualId, (string)($data['decision'] ?? ''), $uid, (string)($data['reason'] ?? ''), isset($data['valid_until']) && $data['valid_until'] !== '' ? (string)$data['valid_until'] : null));
                break;
            }

            case 'worker_add':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_worker_add($pdo, $cid, $data, $uid));
                break;

            case 'worker_update': {
                $workerId = (int)($data['worker_id'] ?? 0);
                if ($workerId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ worker_id');
                $respond(ctr_worker_update($pdo, $workerId, $data, $uid));
                break;
            }

            case 'cert_add': {
                $workerId = (int)($data['worker_id'] ?? 0);
                if ($workerId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ worker_id');
                $respond(ctr_cert_add($pdo, $workerId, $data, $uid));
                break;
            }

            case 'cert_revoke': {
                $certId = (int)($data['cert_id'] ?? 0);
                if ($certId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ cert_id');
                $respond(ctr_cert_revoke($pdo, $certId, $uid, (string)($data['reason'] ?? '')));
                break;
            }

            case 'contract_create':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_contract_create($pdo, $cid, $data, $uid));
                break;

            case 'contract_update': {
                $contractId = (int)($data['contract_id'] ?? 0);
                if ($contractId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contract_id');
                $respond(ctr_contract_update($pdo, $contractId, $data, $uid));
                break;
            }

            case 'assign':
                $respond(ctr_assign($pdo, $data, $uid));
                break;

            case 'assignment_status':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(ctr_assignment_status($pdo, $id, (string)($data['to'] ?? ''), $uid, (string)($data['note'] ?? '')));
                break;

            case 'bind_permit': {
                $permitId = (int)($data['permit_id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                if ($permitId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ permit_id');
                $respond(ctr_bind_permit($pdo, $id, $permitId, $uid));
                break;
            }

            case 'inspect':
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(ctr_inspect($pdo, $id, $data, $uid));
                break;

            case 'action_create':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_action_create($pdo, $cid, $data, $uid));
                break;

            case 'action_transition': {
                $actionId = (int)($data['action_id'] ?? 0);
                if ($actionId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ action_id');
                $respond(ctr_action_transition($pdo, $actionId, (string)($data['to'] ?? ''), $uid, (string)($data['note'] ?? '')));
                break;
            }

            case 'action_verify': {
                $actionId = (int)($data['action_id'] ?? 0);
                if ($actionId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ action_id');
                $respond(ctr_action_verify($pdo, $actionId, $uid, (string)($data['note'] ?? '')));
                break;
            }

            case 'review_create':
                if ($cid <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ contractor_id');
                $respond(ctr_review_create($pdo, $cid, $data, $uid));
                break;

            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
    }

    api_fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');

} catch (DomainException $e) {
    $code = (int)$e->getCode();
    if ($code < 400 || $code > 599) $code = 400;
    $apiCode = match ($code) {
        404 => 'NOT_FOUND',
        409 => 'CONFLICT',
        403 => 'FORBIDDEN',
        default => 'VALIDATION_ERROR',
    };
    api_fail($code, $apiCode, $e->getMessage());
} catch (Throwable $e) {
    api_safe_catch($e);
}