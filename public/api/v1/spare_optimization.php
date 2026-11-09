<?php
/**
 * spare_optimization.php — Spare Parts Optimization & Warehouse Maintenance API (Phase 33)
 *
 * Thin adapter เท่านั้น — business rule ทั้งหมดอยู่ที่ src/helpers/spare_optimization.php
 * requireLogin + requirePerm('spare_parts', $action) + enforceCsrf() บังคับฝั่ง server เสมอ
 *
 * RBAC ยืม action เดิมของโมดูล spare_parts (view/plan/request/issue/return/approve)
 *   view    — อ่านอย่างเดียว
 *   plan    — กำหนดนโยบาย: config, warehouse, min/max, ABC, criticality, run
 *   request — สร้าง hold (reservation)
 *   issue   — ตัดมัดจำจาก hold (consume)
 *   approve — อนุมัติ substitute
 *
 *   GET  /api/v1/spare_optimization.php?action=...
 *     config       — config + schema + guards + can_*
 *     dashboard    — ภาพรวม (trustworthy/non-reliable split มาจาก ledger จริง)
 *     availability — ?search&status&category&abc&criticality&warehouse&sort&needs_reorder&limit&offset
 *     part         — ?spare_part_id=N : part + availability + demand + minmax proposal + criticality + substitutes
 *     minmax       — ?spare_part_id=N : ค่าที่คำนวณได้ (ยังไม่เขียน)
 *     obsolescence — ?limit=  (review trigger เท่านั้น ไม่ตัดจำหน่าย)
 *     analytics    — ?scope&category
 *     data_quality — ?  (ตรวจความครบถ้วนของข้อมูลก่อนคิด demand)
 *     warehouses   — คลัง/จุดจ่าย/กักกัน
 *     criticality  — ?spare_part_id= : ปัจจุบัน + ประวัติ + คะแนนที่ประเมินได้
 *     substitutes  — ?spare_part_id= : รายการทดแทนทั้งหมด + ที่มีผล ณ วันนี้
 *     reservations — ?spare_part_id= : hold ที่ยัง active
 *     readiness    — ?request_id= หรือ ?work_order_id= : วัสดุพร้อมใช้สำหรับงาน
 *     export       — ?search&status&category&sort&limit (ข้อมูลสำหรับ export เท่านั้น ไม่ใช่ไฟล์)
 *     runs         — ?limit= : ประวัติการวิเคราะห์ (inputs ที่ใช้)
 *
 *   POST (CSRF + permission + idempotency — ทุก mutation เรียก engine เท่านั้น)
 *     config_set          { ...key/value... }
 *     warehouse_register  { code, name, is_issue_point, is_quarantine, is_active, notes }
 *     warehouse_sync      {}
 *     minmax_apply        { spare_part_id, confirm, reason, values? }
 *     abc_apply           { confirm, reason }              — ใช้ผล classify ล่าสุด
 *     criticality_set     { spare_part_id, confirm, reason, level, method, factors?|score? }
 *     substitute_propose  { spare_part_id, substitute_part_id, ratio, reason, effective_from, effective_to }
 *     substitute_decide   { id, decision, note }
 *     reserve             { spare_part_id, qty, warehouse_id?, source_type?, source_id?, source_no?, needed_by?, expires_at?, note? }
 *     reservation_consume { id, qty }
 *     reservation_release { id, reason }
 *     reservations_expire {}
 *     run                 { scope }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/spare_optimization.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

$pdo = null;
$idemKey = '';
try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $hasPerm = fn(string $a): bool => canPerm($pdo, 'spare_parts', $a);
    $cfg = spO_getConfig($pdo);

    /* ───────────────── GET ───────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'dashboard');
        requirePerm($pdo, 'spare_parts', 'view');

        $partId = (int)($_GET['spare_part_id'] ?? 0);

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config' => $cfg,
                    'schema' => spO_configSchema(),
                    'guards' => spO_guards($cfg),
                    'last_synced_at' => $pdo->query('SELECT MAX(last_synced_at) FROM spare_parts')->fetchColumn() ?: null,
                    'can' => [
                        'view' => $hasPerm('view'), 'plan' => $hasPerm('plan'),
                        'request' => $hasPerm('request'), 'issue' => $hasPerm('issue'),
                        'return' => $hasPerm('return'), 'approve' => $hasPerm('approve'),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'dashboard':
                echo json_encode(spO_dashboard($pdo, $cfg), JSON_UNESCAPED_UNICODE);
                break;

            case 'availability':
                echo json_encode(spO_availabilityRows($pdo, $cfg, [
                    'search' => (string)($_GET['search'] ?? ''),
                    'status' => (string)($_GET['status'] ?? ''),
                    'category' => (string)($_GET['category'] ?? ''),
                    'abc' => (string)($_GET['abc'] ?? ''),
                    'criticality' => (string)($_GET['criticality'] ?? ''),
                    'warehouse' => (string)($_GET['warehouse'] ?? ''),
                    'sort' => (string)($_GET['sort'] ?? 'code'),
                    'needs_reorder' => !empty($_GET['needs_reorder']),
                    'limit' => (int)($_GET['limit'] ?? 200),
                    'offset' => (int)($_GET['offset'] ?? 0),
                ]), JSON_UNESCAPED_UNICODE);
                break;

            case 'part': {
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                $detail = spO_partDetail($pdo, $cfg, $partId);
                $detail['can'] = [
                    'plan' => $hasPerm('plan'), 'request' => $hasPerm('request'),
                    'issue' => $hasPerm('issue'), 'approve' => $hasPerm('approve'),
                ];
                echo json_encode($detail, JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'minmax':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                echo json_encode(spO_calculateMinMax($pdo, $partId, $cfg), JSON_UNESCAPED_UNICODE);
                break;

            case 'obsolescence':
                echo json_encode(spO_obsolescence($pdo, $cfg, ['limit' => (int)($_GET['limit'] ?? 200)]), JSON_UNESCAPED_UNICODE);
                break;

            case 'analytics':
                echo json_encode(spO_analytics($pdo, $cfg, [
                    'scope' => (string)($_GET['scope'] ?? 'full'),
                    'category' => (string)($_GET['category'] ?? ''),
                ]), JSON_UNESCAPED_UNICODE);
                break;

            case 'data_quality':
                echo json_encode(spO_dataQuality($pdo, $cfg), JSON_UNESCAPED_UNICODE);
                break;

            case 'warehouses':
                echo json_encode([
                    'warehouses' => spO_warehouses($pdo, false),
                    'can' => ['plan' => $hasPerm('plan')],
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'criticality':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                echo json_encode([
                    'current' => spO_criticalityGet($pdo, $partId),
                    'history' => spO_criticalityHistory($pdo, $partId),
                    'assessment' => spO_criticalityAssess($pdo, $cfg, $partId, (array)($_GET['factors'] ?? [])),
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'substitutes':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                echo json_encode([
                    'all' => spO_substitutesList($pdo, $partId),
                    'effective' => spO_effectiveSubstitutes($pdo, $partId, (string)($_GET['on_date'] ?? '') ?: null),
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'reservations':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                echo json_encode([
                    'active' => spO_activeReservations($pdo, $partId),
                    'held' => spO_heldQty($pdo, $partId),
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'readiness': {
                $requestId = (int)($_GET['request_id'] ?? 0);
                $woId = (int)($_GET['work_order_id'] ?? 0);
                $job = $requestId > 0 ? $requestId : $woId;
                if ($job <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ request_id หรือ work_order_id');
                echo json_encode(spO_readiness($pdo, $cfg, $job), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'export':
                requirePerm($pdo, 'spare_parts', 'plan');
                echo json_encode(spO_exportRows($pdo, $cfg, [
                    'search' => (string)($_GET['search'] ?? ''),
                    'status' => (string)($_GET['status'] ?? ''),
                    'category' => (string)($_GET['category'] ?? ''),
                    'sort' => (string)($_GET['sort'] ?? 'code'),
                    'limit' => (int)($_GET['limit'] ?? 5000),
                ]), JSON_UNESCAPED_UNICODE);
                break;

            case 'runs':
                echo json_encode(['runs' => spO_runs($pdo, (int)($_GET['limit'] ?? 20))], JSON_UNESCAPED_UNICODE);
                break;

            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }
        exit;
    }

    /* ───────────────── POST ───────────────── */

    if ($method === 'POST') {
        enforceCsrf();
        $data = json_decode((string)file_get_contents('php://input'), true);
        $data = is_array($data) ? $data : $_POST;
        $action = (string)($_GET['action'] ?? ($data['action'] ?? ''));
        if ($action === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ action');

        // permission ก่อน idempotency เสมอ
        $permFor = [
            'config_set' => 'plan', 'warehouse_register' => 'plan', 'warehouse_sync' => 'plan',
            'minmax_apply' => 'plan', 'abc_apply' => 'plan', 'criticality_set' => 'plan',
            'run' => 'plan',
            'substitute_propose' => 'plan', 'substitute_decide' => 'approve',
            'reserve' => 'request', 'reservation_consume' => 'issue',
            'reservation_release' => 'plan', 'reservations_expire' => 'plan',
        ];
        if (!isset($permFor[$action])) api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        requirePerm($pdo, 'spare_parts', $permFor[$action]);

        $idemKey = clientActionKeyFromRequest($data);        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/spare_optimization.php?action=' . urlencode($action));
            if ($idem['status'] === 'replay') {
                echo json_encode(['success' => true, 'dedup' => true, 'id' => $idem['ref_id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($idem['status'] === 'replay_failed') {
                // The same key already failed. Say so plainly instead of
                // pretending it is still in flight, or the client retries forever.
                $status = (int)($idem['https_status'] ?: 409);
                http_response_code($status);
                echo json_encode([
                    'success' => false,
                    'error' => 'คำขอนี้ถูกส่งมาก่อนแล้วแต่ถูกปฏิเสธ — กรุณาตรวจสอบข้อมูลแล้วส่งใหม่ด้วย client_action_id ใหม่',
                    'code' => 'CLIENT_ACTION_REJECTED',
                    'replayed_status' => $status,
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($idem['status'] !== 'new') {
                clientActionFinish($pdo, $idemKey, 'conflict', null, null, 409);
                echo json_encode(['success' => false, 'error' => 'รายการนี้ถูกส่งแล้วจากอุปกรณ์ของท่าน — ไม่ประมวลผลซ้ำ', 'code' => 'CLIENT_ACTION_UNCERTAIN'], JSON_UNESCAPED_UNICODE);
                http_response_code(409);
                exit;
            }
        }

        $respond = function (array $res) use ($pdo, $idemKey, $action): void {
            clientActionFinish($pdo, $idemKey, 'success', 'spare_optimization.' . $action, $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], $res), JSON_UNESCAPED_UNICODE);
            exit;
        };

        $partId = (int)($data['spare_part_id'] ?? 0);

        switch ($action) {
            case 'config_set':
                $respond(['updated' => spO_setConfig($pdo, $cfg, $data['config'] ?? $data, $uid), 'config' => spO_getConfig($pdo)]);
                break;

            case 'warehouse_register':
                $respond(spO_warehouseRegister($pdo, $cfg, $data, $uid));
                break;

            case 'warehouse_sync':
                $respond(spO_syncWarehousesFromSage($pdo, $cfg, $uid));
                break;

            case 'minmax_apply':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                $respond(spO_applyMinMax($pdo, $cfg, $partId, $data, $uid));
                break;

            case 'abc_apply': {
                $abc = spO_abcClassification($pdo, $cfg, (string)($data['category'] ?? '') ?: null);
                $respond(['updated' => spO_applyAbc($pdo, $cfg, $abc, $uid, $data), 'counts' => $abc['counts']]);
                break;
            }

            case 'criticality_set':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                $respond(spO_criticalitySet($pdo, $cfg, $partId, $data, $uid));
                break;

            case 'substitute_propose': {
                $subId = (int)($data['substitute_part_id'] ?? 0);
                if ($partId <= 0 || $subId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id และ substitute_part_id');
                $respond(spO_substitutePropose($pdo, $cfg, $partId, $subId, $data, $uid));
                break;
            }

            case 'substitute_decide': {
                $id = (int)($data['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(spO_substituteDecide($pdo, $cfg, $id, (string)($data['decision'] ?? ''), $data, $uid));
                break;
            }

            case 'reserve':
                if ($partId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ spare_part_id');
                $respond(spO_reserve($pdo, $cfg, $data, $uid));
                break;

            case 'reservation_consume': {
                $id = (int)($data['id'] ?? 0);
                $qty = (float)($data['qty'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                if ($qty <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ qty ที่มากกว่า 0');
                $respond(spO_reservationConsume($pdo, $cfg, $id, $qty, $data, $uid));
                break;
            }

            case 'reservation_release': {
                $id = (int)($data['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $respond(spO_reservationRelease($pdo, $cfg, $id, $data, $uid));
                break;
            }

            case 'reservations_expire':
                $respond(spO_expireReservations($pdo, $cfg, $uid));
                break;

            case 'run': {
                $scope = (string)($data['scope'] ?? 'full');
                $run = spO_runStart($pdo, $cfg, $scope, $uid);
                $analytics = spO_analytics($pdo, $cfg, ['scope' => $scope, 'category' => (string)($data['category'] ?? '') ?: null]);
                $findings = [
                    'scope' => $scope,
                    'parts_analyzed' => $analytics['parts_total'] ?? null,
                    'parts_reliable' => $analytics['parts_reliable'] ?? null,
                    'abc_counts' => $analytics['abc']['counts'] ?? null,
                    'slow_moving_count' => $analytics['obsolescence']['slow_moving_count'] ?? null,
                    'dead_stock_count' => $analytics['obsolescence']['dead_stock_count'] ?? null,
                    'dead_stock_value' => $analytics['obsolescence']['dead_stock_value'] ?? null,
                ];
                $status = !empty($analytics['parts_reliable']) ? 'ok' : 'partial';
                spO_runFinish($pdo, $run['id'], $findings, $status);
                $respond(['run' => $run, 'findings' => $findings, 'status' => $status, 'analytics' => $analytics]);
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
    // Release the idempotency key with the real outcome, otherwise a rejected
    // request would leave it stuck in 'processing' and every retry would 409.
    if ($pdo instanceof PDO && $idemKey !== '') {
        clientActionFinish($pdo, $idemKey, 'failed', null, null, $code);
    }
    $apiCode = match ($code) {
        404 => 'NOT_FOUND',
        409 => 'CONFLICT',
        403 => 'FORBIDDEN',
        default => 'VALIDATION_ERROR',
    };
    api_fail($code, $apiCode, $e->getMessage());
} catch (Throwable $e) {
    if ($pdo instanceof PDO && $idemKey !== '') {
        clientActionFinish($pdo, $idemKey, 'failed', null, null, 500);
    }
    api_safe_catch($e);
}
