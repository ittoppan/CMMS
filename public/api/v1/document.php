<?php
/**
 * document.php — Controlled Document / Maintenance Standard API (Phase 32)
 *
 * Thin adapter เท่านั้น — business rule ทั้งหมดอยู่ที่ src/helpers/document_control.php
 * requireLogin + requirePerm('document', $action) + enforceCsrf() บังคับฝั่ง server เสมอ
 *
 *   GET  /api/v1/document.php?action=...
 *     config        — config จาก settings + status maps + can_* (ให้ client เรนเดอร์เอง)
 *     options       — ค่าคงที่/ป้ายสถานะ/สายอนุมัติ/กฎความปลอดภัย
 *     dashboard     — สรุป เอกสารค้าง/ใกล้ทบทวน/รับทราจค้าง/อบรมค้าง
 *     list          — ?status&doc_type&department_id&asset_id&q&limit
 *     get           — detail + revision + impact + ack + training + link + activity (?id=N)
 *     revisions     — (?document_id=N)
 *     approvals     — (?revision_id=N)
 *     impacts       — (?revision_id=N)
 *     acks          — (?document_id=N&revision_id=N)
 *     ack_progress  — สรุปการรับทราจ (?document_id=N)
 *     my_pending    — เอกสารที่ฉันยังไม่รับทราจ
 *     training      — (?document_id=N) + results/progress
 *     effective     — เอกสารที่มีผลบังคับใช้ของเครื่อง (?asset_id=&department_id=)
 *     links         — (?document_id=N&entity_type=&entity_id=)
 *     activity      — (?document_id=N&limit=)
 *     data_quality  — (?check=)
 *     reports       — (?report=&from=&to=)
 *
 *   POST (CSRF + permission + idempotency — ทุก mutation เรียก engine เท่านั้น)
 *     create            { doc_type, title, ... }
 *     update            { id, ... }
 *     set_status        { id, to, reason? }           (obsolete/archive เท่านั้น)
 *     rev_create        { document_id, title, change_summary, file_path, bump_major? }
 *     rev_update        { revision_id, ... }          (เฉพาะ revision ที่ยัง draft)
 *     rev_submit        { revision_id }
 *     rev_approve       { revision_id, step, decision, comment? }
 *     rev_schedule      { revision_id, effective_date }
 *     rev_effective     { revision_id, effective_date?, mode? }
 *     rev_obsolete      { revision_id, reason }
 *     impact_add        { revision_id, impact_area, severity, description, ... }
 *     impact_update     { impact_id, ... }
 *     impact_remove     { impact_id }
 *     ack_assign        { document_id, user_ids[] }
 *     ack_acknowledge   { document_id, method, based_on_revision_id, notes? }  (ผู้ใช้รับทราจเอง)
 *     ack_exception     { ack_id, reason }
 *     training_add      { document_id, revision_id, course_code, title, ... }
 *     training_record   { training_id, status, score?, notes? }
 *     link_add          { document_id, revision_id?, entity_type, entity_id, link_type, ... }
 *     link_remove       { link_id }
 *     qr_issue          { document_id }                 (POST เท่านั้น — เป็นการเขียน)
 *     qr_payload        { document_id }                 (สร้าง payload สำหรับพิมพ์ QR)
 *     apply_scheduled   — ปรับใช้ revision ที่กำหนดวันมีผลแล้ว (cron)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/document_control.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $hasPerm = fn(string $a): bool => canPerm($pdo, 'document', $a);
/** ack_assign / training_add / apply_scheduled ใช้สิทธิ์ training.manage (ไม่ใช่ document.*) */
$canManageTraining = fn(): bool => canPerm($pdo, 'training', 'manage');

    /* ───────────────── GET ───────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'config');
        requirePerm($pdo, 'document', 'view');

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config' => doc_config($pdo),
                    'statuses' => doc_statuses(),
                    'revision_statuses' => doc_rev_statuses(),
                    'impact_areas' => doc_impact_areas(),
                    'severities' => doc_severities(),
                    'impact_statuses' => doc_impact_statuses(),
                    'confidentiality' => doc_confidentiality(),
                    'ack_methods' => doc_config($pdo)['ack_methods'],
                    'can' => [
                        'view' => $hasPerm('view'), 'create' => $hasPerm('create'),
                        'revise' => $hasPerm('revise'), 'review' => $hasPerm('review'),
                        'approve' => $hasPerm('approve'), 'publish' => $hasPerm('publish'),
                        'manage_acks' => $canManageTraining(),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'options':
                echo json_encode(doc_options($pdo), JSON_UNESCAPED_UNICODE);
                break;

            case 'dashboard':
                echo json_encode(['dashboard' => doc_dashboard($pdo)], JSON_UNESCAPED_UNICODE);
                break;

            case 'list':
                echo json_encode(['documents' => doc_list($pdo, [
                    'status' => $_GET['status'] ?? '', 'doc_type' => $_GET['doc_type'] ?? '',
                    'department_id' => $_GET['department_id'] ?? 0, 'asset_id' => $_GET['asset_id'] ?? 0,
                    'q' => $_GET['q'] ?? '', 'limit' => $_GET['limit'] ?? 50,
                ])], JSON_UNESCAPED_UNICODE);
                break;

            case 'get': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $detail = doc_detail($pdo, $id);
                if (!$detail) api_fail(404, 'NOT_FOUND', 'ไม่พบเอกสาร');
                $detail['revisions'] = doc_revisions($pdo, $id);
                $revId = (int)($_GET['revision_id'] ?? 0);
                if ($revId > 0) {
                    $rev = doc_rev_get($pdo, $revId);
                    if ((int)$rev['document_id'] !== $id) api_fail(400, 'VALIDATION_ERROR', 'revision ไม่ได้อยู่ในเอกสารนี้');
                    $detail['revision'] = $rev;
                    $detail['impacts'] = doc_impact_list($pdo, $revId);
                    $detail['approvals'] = doc_approvals($pdo, $revId);
                    $detail['training'] = doc_training_list($pdo, $id);
                }
                $detail['ack_progress'] = doc_ack_progress($pdo, $id);
                $detail['training_progress'] = doc_training_progress($pdo, $id);
                $detail['links'] = doc_links_list($pdo, $id);
                $detail['activity'] = doc_activity_timeline($pdo, $id, null, 100);
                echo json_encode($detail, JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'revisions': {
                $docId = (int)($_GET['document_id'] ?? 0);
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                echo json_encode(['revisions' => doc_revisions($pdo, $docId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'approvals': {
                $revId = (int)($_GET['revision_id'] ?? 0);
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                echo json_encode(['approvals' => doc_approvals($pdo, $revId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'impacts': {
                $revId = (int)($_GET['revision_id'] ?? 0);
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                echo json_encode(['impacts' => doc_impact_list($pdo, $revId)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'acks': {
                $docId = (int)($_GET['document_id'] ?? 0);
                $revId = (int)($_GET['revision_id'] ?? 0);
                if ($docId <= 0 && $revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id หรือ revision_id');
                echo json_encode(['acks' => doc_ack_list($pdo, ['document_id' => $docId ?: null, 'revision_id' => $revId ?: null])], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'ack_progress': {
                $docId = (int)($_GET['document_id'] ?? 0);
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                echo json_encode(['progress' => doc_ack_progress($pdo, $docId, ($_GET['revision_id'] ?? 0) ?: null)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'my_pending':
                echo json_encode(['items' => doc_ack_pending_for_user($pdo, $uid, (int)($_GET['limit'] ?? 50))], JSON_UNESCAPED_UNICODE);
                break;

            case 'training': {
                $docId = (int)($_GET['document_id'] ?? 0);
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $out = ['training' => doc_training_list($pdo, $docId), 'progress' => doc_training_progress($pdo, $docId)];
                $trId = (int)($_GET['training_id'] ?? 0);
                if ($trId > 0) $out['results'] = doc_training_results($pdo, $trId);
                echo json_encode($out, JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'effective':
                echo json_encode(['documents' => doc_effective_for_asset($pdo,
                    (int)($_GET['asset_id'] ?? 0), ($_GET['department_id'] ?? 0) ?: null)], JSON_UNESCAPED_UNICODE);
                break;

            case 'links':
                echo json_encode(['links' => doc_links_list($pdo,
                    ($_GET['document_id'] ?? 0) ?: null, ($_GET['entity_type'] ?? '') ?: null, ($_GET['entity_id'] ?? 0) ?: null)], JSON_UNESCAPED_UNICODE);
                break;

            case 'activity':
                echo json_encode(['activity' => doc_activity_timeline($pdo,
                    ($_GET['document_id'] ?? 0) ?: null, ($_GET['revision_id'] ?? 0) ?: null, (int)($_GET['limit'] ?? 100))], JSON_UNESCAPED_UNICODE);
                break;

            case 'data_quality':
                echo json_encode(['data_quality' => doc_data_quality($pdo, (string)($_GET['check'] ?? ''))], JSON_UNESCAPED_UNICODE);
                break;

            case 'reports':
                echo json_encode(['report' => doc_reports($pdo, (string)($_GET['report'] ?? 'summary'),
                    (string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''))], JSON_UNESCAPED_UNICODE);
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
                requirePerm($pdo, 'document', 'create');
                break;
            case 'update':
            case 'set_status':
            case 'rev_create':
            case 'rev_update':
            case 'impact_add':
            case 'impact_update':
            case 'impact_remove':
            case 'link_add':
            case 'link_remove':
            case 'qr_issue':
                requirePerm($pdo, 'document', 'revise');
                break;
            case 'rev_submit':
            case 'rev_approve':
                requirePerm($pdo, 'document', 'review');
                break;
            case 'rev_schedule':
            case 'rev_effective':
            case 'rev_obsolete':
            case 'qr_payload':
                requirePerm($pdo, 'document', 'publish');
                break;
            case 'ack_assign':
            case 'training_add':
            case 'training_record':
            case 'apply_scheduled':
                requirePerm($pdo, 'training', 'manage');
                break;
            case 'ack_acknowledge':
            case 'ack_exception':
                // ผู้ใช้รับทราจ/แจ้งข้อยกเว้นเอง — ต้องมีสิทธิ์ดูเอกสารเท่านั้น
                requirePerm($pdo, 'document', 'view');
                break;
            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }

        // ── idempotency (กัน offline/retry ส่งซ้ำ) ──
        $idemKey = clientActionKeyFromRequest($data);
        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/document.php?action=' . urlencode($actionRel));
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
            clientActionFinish($pdo, $idemKey, 'success', 'document', $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], $res), JSON_UNESCAPED_UNICODE);
            exit;
        };

        $id = (int)($data['id'] ?? 0);
        $docId = (int)($data['document_id'] ?? 0);
        if ($docId <= 0) $docId = $id;
        $revId = (int)($data['revision_id'] ?? 0);

        switch ($action) {
            case 'create':
                $respond(doc_create($pdo, $data, $uid));
                break;

            case 'update':
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $respond(doc_update($pdo, $docId, $data, $uid));
                break;

            case 'set_status':
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $respond(doc_set_status($pdo, $docId, (string)($data['to'] ?? ''), $uid, (string)($data['reason'] ?? '')));
                break;

            case 'rev_create':
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $respond(doc_rev_create($pdo, $docId, $data, $uid));
                break;

            case 'rev_update':
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                $respond(doc_rev_update($pdo, $revId, $data, $uid));
                break;

            case 'rev_submit':
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                $respond(doc_rev_submit($pdo, $revId, $uid));
                break;

            case 'rev_approve': {
                $step = (int)($data['step'] ?? 0);
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                if ($step <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ step');
                $respond(doc_rev_approve_step($pdo, $uid, $revId, $step, (string)($data['decision'] ?? ''),
                    isset($data['comment']) ? (string)$data['comment'] : null));
                break;
            }

            case 'rev_schedule':
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                $respond(doc_rev_schedule($pdo, $revId, $uid, (string)($data['effective_date'] ?? '')));
                break;

            case 'rev_effective': {
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                $mode = (string)($data['mode'] ?? 'user');
                $res = doc_rev_effective($pdo, $revId, $uid, (string)($data['effective_date'] ?? ''), $mode === 'system' ? 'system' : 'user');
                $respond(array_merge($res, ['id' => $res['id'] ?? $revId]));
                break;
            }

            case 'rev_obsolete':
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                $respond(doc_rev_obsolete($pdo, $revId, $uid, (string)($data['reason'] ?? '')));
                break;

            case 'impact_add':
                if ($revId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ revision_id');
                $respond(doc_impact_add($pdo, $revId, $data, $uid));
                break;

            case 'impact_update': {
                $impactId = (int)($data['impact_id'] ?? 0);
                if ($impactId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ impact_id');
                $respond(doc_impact_update($pdo, $impactId, $data, $uid));
                break;
            }

            case 'impact_remove': {
                $impactId = (int)($data['impact_id'] ?? 0);
                if ($impactId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ impact_id');
                $respond(doc_impact_remove($pdo, $impactId, $uid));
                break;
            }

            case 'ack_assign':
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $users = (array)($data['user_ids'] ?? []);
                if (!$users) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ user_ids');
                $respond(doc_ack_assign($pdo, $docId, $users, $uid));
                break;

            case 'ack_acknowledge': {
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $based = (int)($data['based_on_revision_id'] ?? 0);
                if ($based <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ based_on_revision_id (ป้องกัน offline replay รับทราจผิดฉบับ)');
                $targetUser = (int)($data['user_id'] ?? 0) ?: $uid;
                if ($targetUser !== $uid && !$hasPerm('revise')) {
                    api_fail(403, 'FORBIDDEN', 'รับทราจแทนผู้อื่นไม่ได้');
                }
                $respond(doc_ack_acknowledge($pdo, $docId, $targetUser, (string)($data['method'] ?? 'read'), $based, (string)($data['notes'] ?? '')));
                break;
            }

            case 'ack_exception': {
                $ackId = (int)($data['ack_id'] ?? 0);
                if ($ackId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ ack_id');
                $respond(doc_ack_exception($pdo, $ackId, (string)($data['reason'] ?? ''), $uid));
                break;
            }

            case 'training_add':
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $respond(doc_training_add($pdo, $docId, $revId, $data, $uid));
                break;

            case 'training_record': {
                $trId = (int)($data['training_id'] ?? 0);
                if ($trId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ training_id');
                $respond(doc_training_record($pdo, $trId, (int)($data['user_id'] ?? 0) ?: $uid, $data, $uid));
                break;
            }

            case 'link_add':
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $respond(doc_link_add($pdo, $docId, $revId ?: null, $data, $uid));
                break;

            case 'link_remove': {
                $linkId = (int)($data['link_id'] ?? 0);
                if ($linkId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ link_id');
                $respond(doc_link_remove($pdo, $linkId, $uid));
                break;
            }

            case 'qr_issue': {
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $token = doc_qr_token($pdo, $docId, true);
                $respond(['id' => $docId, 'qr_token' => $token, 'payload' => doc_qr_payload($pdo, $docId)]);
                break;
            }

            case 'qr_payload': {
                if ($docId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ document_id');
                $doc = doc_get($pdo, $docId);
                $respond([
                    'id' => $docId,
                    'doc_no' => (string)$doc['doc_no'],
                    'title' => (string)$doc['title'],
                    'doc_type' => (string)$doc['doc_type'],
                    'status' => (string)$doc['status'],
                    'payload' => doc_qr_payload($pdo, $docId),
                ]);
                break;
            }

            case 'apply_scheduled':
                $respond(['applied' => doc_rev_apply_scheduled($pdo, $uid)]);
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
