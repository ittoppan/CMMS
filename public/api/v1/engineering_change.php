<?php
/**
 * engineering_change.php — Engineering Change Request (ECR) API (Phase 32)
 *
 * Thin adapter เท่านั้น — business rule ทั้งหมดอยู่ที่ src/helpers/engineering_change.php
 * requireLogin + requirePerm('engineering_change', $action) + enforceCsrf() บังคับฝั่ง server เสมอ
 *
 *   GET  /api/v1/engineering_change.php?action=...
 *     config     — config + status maps + can_*
 *     options    — ค่าคงที่/สายอนุมัติ/แผนผังสถานะ/กฎ (ห้ามแก้ข้อมูลหลักอัตโนมัติ)
 *     summary    — สรุปตามสถานะ/ประเภท/ความสำคัญ + งานค้าง (?from=&to=)
 *     list       — ?status&change_type&priority&requested_by&asset_id&department_id&q&from&to&limit
 *     get        — detail + impacts + links + approvals + verifications + activity + blockers (?id=N)
 *     impacts    — (?ecr_id=N)
 *     links      — (?ecr_id=N)
 *     approvals  — (?ecr_id=N)
 *     verifications — (?ecr_id=N)
 *     activity   — (?ecr_id=N&limit=)
 *     by_no      — (?ecr_no=)
 *
 *   POST (CSRF + permission + idempotency — ทุก mutation เรียก engine เท่านั้น)
 *     create        { title, change_type, description, reason, priority?, asset_id?, required_by_date? }
 *     update        { id, ... }
 *     submit        { id }
 *     start_review  { id }
 *     start_impact  { id }
 *     request_approval { id }
 *     approve       { id, step, decision, comment? }
 *     reject        { id, reason }
 *     reopen        { id }
 *     start_implementation { id, planned_completion_date? }
 *     mark_implemented    { id }
 *     record_verification { id, result, verification_method?, notes?, failure_reason? }
 *     rework        { id, note? }
 *     close         { id, summary }
 *     cancel        { id, reason }
 *     impact_add    { ecr_id, impact_area, severity, description, target_type?, target_id?, ... }
 *     impact_update { impact_id, ... }
 *     impact_remove { impact_id }
 *     link_add      { ecr_id, link_type, entity_id, action_required?, ... }
 *     link_update   { link_id, action_status?, note? }
 *     link_remove   { link_id }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/engineering_change.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $hasPerm = fn(string $a): bool => canPerm($pdo, 'engineering_change', $a);

    /* ───────────────── GET ───────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'config');
        requirePerm($pdo, 'engineering_change', 'view');

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config' => ecr_config($pdo),
                    'statuses' => ecr_statuses(),
                    'priorities' => ecr_priorities(),
                    'change_types' => ecr_change_types(),
                    'can' => [
                        'view' => $hasPerm('view'), 'create' => $hasPerm('create'),
                        'edit' => $hasPerm('edit'), 'submit' => $hasPerm('submit'),
                        'review' => $hasPerm('review'), 'approve' => $hasPerm('approve'),
                        'implement' => $hasPerm('implement'), 'verify' => $hasPerm('verify'),
                        'close' => $hasPerm('close'),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'options':
                echo json_encode(ecr_options($pdo), JSON_UNESCAPED_UNICODE);
                break;

            case 'summary':
                echo json_encode(['summary' => ecr_summary($pdo, [
                    'from' => (string)($_GET['from'] ?? ''), 'to' => (string)($_GET['to'] ?? ''),
                ])], JSON_UNESCAPED_UNICODE);
                break;

            case 'list':
                echo json_encode(['ecrs' => ecr_list($pdo, [
                    'status' => $_GET['status'] ?? '', 'change_type' => $_GET['change_type'] ?? '',
                    'priority' => $_GET['priority'] ?? '', 'requested_by' => $_GET['requested_by'] ?? 0,
                    'asset_id' => $_GET['asset_id'] ?? 0, 'department_id' => $_GET['department_id'] ?? 0,
                    'q' => $_GET['q'] ?? '', 'from' => (string)($_GET['from'] ?? ''), 'to' => (string)($_GET['to'] ?? ''),
                    'limit' => $_GET['limit'] ?? 50,
                ])], JSON_UNESCAPED_UNICODE);
                break;

            case 'get': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $detail = ecr_detail($pdo, $id);
                if (!$detail) api_fail(404, 'NOT_FOUND', 'ไม่พบ ECR');
                echo json_encode($detail, JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'by_no': {
                $no = (string)($_GET['ecr_no'] ?? '');
                if ($no === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_no');
                echo json_encode(ecr_detail($pdo, (int)ecr_get_by_no($pdo, $no)['id']), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'impacts': {
                $ecrId = (int)($_GET['ecr_id'] ?? 0);
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                echo json_encode(['impacts' => ecr_impacts($pdo, $ecrId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'links': {
                $ecrId = (int)($_GET['ecr_id'] ?? 0);
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                echo json_encode(['links' => ecr_links($pdo, $ecrId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'approvals': {
                $ecrId = (int)($_GET['ecr_id'] ?? 0);
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                echo json_encode(['approvals' => ecr_approvals($pdo, $ecrId),
                    'current_step' => ecr_current_step($pdo, $ecrId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'verifications': {
                $ecrId = (int)($_GET['ecr_id'] ?? 0);
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                echo json_encode(['verifications' => ecr_verifications($pdo, $ecrId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'activity':
                echo json_encode(['activity' => ecr_activity_list($pdo, ($_GET['ecr_id'] ?? 0) ?: null, (int)($_GET['limit'] ?? 100))], JSON_UNESCAPED_UNICODE);
                break;

            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
        exit;
    }

    /* ───────────────── POST ───────────────── */

    if ($method === 'POST') {
        enforceCsrf();
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $actionRel = trim((string)($data['action'] ?? ''));
        if ($actionRel === '') $actionRel = trim((string)($_GET['action'] ?? ''));
        $action = str_replace('/', '_', $actionRel);

        // ── permission gates (บังคับฝั่ง server เสมอ) ──
        switch ($action) {
            case 'create':
                requirePerm($pdo, 'engineering_change', 'create');
                break;
            case 'update':
            case 'impact_add':
            case 'impact_update':
            case 'impact_remove':
            case 'link_add':
            case 'link_update':
            case 'link_remove':
                requirePerm($pdo, 'engineering_change', 'edit');
                break;
            case 'submit':
            case 'reopen':
            case 'cancel':
                requirePerm($pdo, 'engineering_change', 'submit');
                break;
            case 'start_review':
            case 'start_impact':
            case 'request_approval':
            case 'reject':
                requirePerm($pdo, 'engineering_change', 'review');
                break;
            case 'approve':
                requirePerm($pdo, 'engineering_change', 'approve');
                break;
            case 'start_implementation':
            case 'mark_implemented':
            case 'rework':
                requirePerm($pdo, 'engineering_change', 'implement');
                break;
            case 'record_verification':
                requirePerm($pdo, 'engineering_change', 'verify');
                break;
            case 'close':
                requirePerm($pdo, 'engineering_change', 'close');
                break;
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }

        // ── idempotency (กัน offline/retry ส่งซ้ำ) ──
        $idemKey = clientActionKeyFromRequest($data);
        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/engineering_change.php?action=' . urlencode($actionRel));
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

        $respond = function (array $res) use ($pdo, $idemKey): void {
            clientActionFinish($pdo, $idemKey, 'success', 'engineering_change', $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], $res), JSON_UNESCAPED_UNICODE);
            exit;
        };

        $id = (int)($data['id'] ?? 0);
        $ecrId = (int)($data['ecr_id'] ?? 0);
        if ($ecrId <= 0) $ecrId = $id;

        switch ($action) {
            case 'create':
                $respond(ecr_create($pdo, $data, $uid));
                break;

            case 'update':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_update($pdo, $ecrId, $data, $uid));
                break;

            case 'submit':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_submit($pdo, $ecrId, $uid));
                break;

            case 'start_review':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_start_review($pdo, $ecrId, $uid));
                break;

            case 'start_impact':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_start_impact($pdo, $ecrId, $uid));
                break;

            case 'request_approval':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_request_approval($pdo, $ecrId, $uid));
                break;

            case 'approve': {
                $step = (int)($data['step'] ?? 0);
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                if ($step <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ step');
                $respond(ecr_approve_step($pdo, $uid, $ecrId, $step, (string)($data['decision'] ?? ''),
                    isset($data['comment']) ? (string)$data['comment'] : null));
                break;
            }

            case 'reject':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_reject($pdo, $ecrId, (string)($data['reason'] ?? ''), $uid));
                break;

            case 'reopen':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_reopen($pdo, $ecrId, $uid));
                break;

            case 'start_implementation':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_start_implementation($pdo, $ecrId, $uid, (string)($data['planned_completion_date'] ?? '')));
                break;

            case 'mark_implemented':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_mark_implemented($pdo, $ecrId, $uid));
                break;

            case 'record_verification':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_record_verification($pdo, $ecrId, $data, $uid));
                break;

            case 'rework':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_rework($pdo, $ecrId, $uid, (string)($data['note'] ?? '')));
                break;

            case 'close':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_close($pdo, $ecrId, (string)($data['summary'] ?? ''), $uid));
                break;

            case 'cancel':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_cancel($pdo, $ecrId, (string)($data['reason'] ?? ''), $uid));
                break;

            case 'impact_add':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_impact_add($pdo, $ecrId, $data, $uid));
                break;

            case 'impact_update': {
                $impactId = (int)($data['impact_id'] ?? 0);
                if ($impactId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ impact_id');
                $respond(ecr_impact_update($pdo, $impactId, $data, $uid));
                break;
            }

            case 'impact_remove': {
                $impactId = (int)($data['impact_id'] ?? 0);
                if ($impactId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ impact_id');
                $respond(ecr_impact_remove($pdo, $impactId, $uid));
                break;
            }

            case 'link_add':
                if ($ecrId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ecr_id');
                $respond(ecr_link_add($pdo, $ecrId, $data, $uid));
                break;

            case 'link_update': {
                $linkId = (int)($data['link_id'] ?? 0);
                if ($linkId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ link_id');
                $respond(ecr_link_update($pdo, $linkId, $data, $uid));
                break;
            }

            case 'link_remove': {
                $linkId = (int)($data['link_id'] ?? 0);
                if ($linkId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ link_id');
                $respond(ecr_link_remove($pdo, $linkId, $uid));
                break;
            }

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
