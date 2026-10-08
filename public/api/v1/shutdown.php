<?php
/**
 * shutdown.php — Shutdown / Turnaround Management API (Phase 35)
 *
 * Thin adapter only — every business rule lives in src/helpers/shutdown.php.
 * requireLogin + requirePerm('shutdown', $action) + enforceCsrf() are enforced server-side.
 * There is deliberately no endpoint here that releases a LOTO lock: removal stays in Phase 30.
 *
 *   GET  /api/v1/shutdown.php?action=...
 *     config        — config + reason codes + check labels + can_* + options
 *     options       — reference data (departments, users, assets, open WOs, permits, parts)
 *     dashboard     — status counts, upcoming, readiness-blocked list, live LOTO permits
 *     list          — shutdowns (?status&department_id&risk_level&q&from&to&limit)
 *     detail        — one shutdown with everything (?id&full=0)
 *     scopes        — WBS rows for one shutdown (?id)
 *     dependencies  — dependency edges (?id)
 *     critical_path — CPM result (?id)
 *     readiness     — stored sheet + live re-evaluation (?id)
 *     baselines     — baseline versions (?id)
 *     baseline_diff — live plan vs current baseline (?id)
 *     startup       — startup gate sheet (?id) — PURE read, never releases anything
 *     material      — planned vs live stock (?id&scope_id)
 *     cost          — cost from linked work orders (?id)
 *     progress      — derived progress (?id)
 *     activity      — activity trail (?id)
 *     candidates    — advisory workforce candidates for a WO (?work_order_id) [Phase 34]
 *
 *   POST (CSRF + permission + idempotency — every mutation calls the engine only)
 *     save             { id?, title, shutdown_type?, facility?, objective?, risk_level?,
 *                        department_id?, owner_user_id?, planned_start_at?, planned_end_at?, notes? }
 *     transition       { id, to, reason?, closeout_outcome?, downtime_minutes?, lessons? }
 *     scope_save       { id?, shutdown_id, title, parent_id?, wbs_code?, estimate_hours?, repair_id?,
 *                        permit_id?, owner_user_id?, planned_start_at?, planned_end_at?, ... }
 *     scope_status     { scope_id, to, reason? }
 *     scope_delete     { scope_id, reason }
 *     dependency_save  { shutdown_id, predecessor_scope_id, successor_scope_id, dep_type?, lag_hours? }
 *     dependency_delete{ id, reason? }
 *     baseline_create  { id, note? }
 *     readiness_refresh{ id }
 *     readiness_waive  { check_id, reason, reason_code }
 *     startup_refresh  { id }
 *     startup_waive    { check_id, reason, reason_code }   (LOTO row always refused)
 *     asset_save       { shutdown_id, asset_id, is_critical?, isolation_required?, loto_permit_id?, status? }
 *     asset_delete     { sd_asset_id, reason }
 *     part_save        { shutdown_id, spare_part_id, planned_qty, scope_id?, needed_by?, note? }
 *     part_delete      { id, reason? }
 *     part_reserve     { shutdown_id, spare_part_id, qty, scope_id?, note? }   [online only]
 */

require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/cost.php';
require_once __DIR__ . '/../../../src/helpers/spare_optimization.php';
require_once __DIR__ . '/../../../src/helpers/workforce.php';
require_once __DIR__ . '/../../../src/helpers/shutdown.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $hasPerm = fn(string $a): bool => canPerm($pdo, 'shutdown', $a);

    /** Map an engine error code onto an HTTP status. The engine owns the code; the API owns the wire. */
    $errStatus = function (string $code): int {
        return match ($code) {
            'NOT_FOUND' => 404,
            'DB', 'INTERNAL_ERROR' => 500,
            'INVALID_TRANSITION', 'STATE', 'CYCLE', 'DUPLICATE', 'READINESS_BLOCKED', 'LOTO_ACTIVE',
            'STARTUP_BLOCKED', 'SCOPE_OPEN', 'WAIVE_FORBIDDEN', 'CAP_REACHED', 'HAS_CHILDREN' => 409,
            default => 400,
        };
    };

    /** Emit a successful engine result, or translate its error array into an HTTP failure. */
    $emit = function (array $res) use ($errStatus): void {
        if (!empty($res['error'])) {
            $code = (string)$res['error'];
            api_fail($errStatus($code), $code, (string)($res['message'] ?? $code));
        }
        echo json_encode($res, JSON_UNESCAPED_UNICODE);
    };

    /* ───────────────── GET ───────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'config');
        requirePerm($pdo, 'shutdown', 'view');

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config'        => sd_config($pdo),
                    'reason_codes'  => sd_reason_codes(),
                    'check_labels'  => sd_check_labels(),
                    'status_labels' => sd_status_labels(),
                    'options'       => sd_options(),
                    'can' => [
                        'view' => true,
                        'plan' => $hasPerm('plan'),
                        'readiness_manage' => $hasPerm('readiness_manage'),
                        'baseline_create' => $hasPerm('baseline_create'),
                        'execute' => $hasPerm('execute'),
                        'startup' => $hasPerm('startup'),
                        'closeout' => $hasPerm('closeout'),
                        'cancel' => $hasPerm('cancel'),
                    ],
                    'permission_module' => 'shutdown',
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'options': {
                $departments = $pdo->query('SELECT id, code, name FROM departments WHERE is_active = 1 ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
                $users = $pdo->query('SELECT id, full_name, department_id FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC);
                $assets = $pdo->query("SELECT id, code, name, criticality, status FROM asset_registry
                                       WHERE status <> 'disposed' ORDER BY code LIMIT 1000")->fetchAll(PDO::FETCH_ASSOC);
                $repairs = $pdo->query("SELECT id, work_order_no, title, status, asset_id FROM repair
                                        WHERE status NOT IN ('closed','cancelled','completed') ORDER BY id DESC LIMIT 500")->fetchAll(PDO::FETCH_ASSOC);
                $permits = $pdo->query("SELECT id, permit_no, status, asset_id FROM work_permits
                                        WHERE status IN ('approved','active') ORDER BY id DESC LIMIT 500")->fetchAll(PDO::FETCH_ASSOC);
                $parts = $pdo->query("SELECT id, code, name, unit, stock_qty, reserved_qty FROM spare_parts
                                      ORDER BY code LIMIT 2000")->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode([
                    'options'     => sd_options(),
                    'departments' => $departments,
                    'users'       => $users,
                    'assets'      => $assets,
                    'work_orders' => $repairs,
                    'permits'     => $permits,
                    'spare_parts' => $parts,
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'dashboard':
                echo json_encode(sd_dashboard($pdo, [
                    'department_id' => isset($_GET['department_id']) ? (int)$_GET['department_id'] : 0,
                ]), JSON_UNESCAPED_UNICODE);
                break;

            case 'list':
                echo json_encode(['rows' => sd_list($pdo, [
                    'status' => (string)($_GET['status'] ?? ''),
                    'department_id' => isset($_GET['department_id']) ? (int)$_GET['department_id'] : 0,
                    'owner_user_id' => isset($_GET['owner_user_id']) ? (int)$_GET['owner_user_id'] : 0,
                    'risk_level' => (string)($_GET['risk_level'] ?? ''),
                    'q' => (string)($_GET['q'] ?? ''),
                    'from' => (string)($_GET['from'] ?? ''),
                    'to' => (string)($_GET['to'] ?? ''),
                    'limit' => min(500, max(1, (int)($_GET['limit'] ?? 100))),
                ])], JSON_UNESCAPED_UNICODE);
                break;

            case 'detail': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $full = (string)($_GET['full'] ?? '1') !== '0';
                $d = sd_detail($pdo, $id, $full);
                if (!$d) api_fail(404, 'NOT_FOUND', 'ไม่พบการหยุดเครื่อง');
                echo json_encode($d, JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'scopes': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(['scopes' => sd_scope_list($pdo, $id)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'dependencies': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(['dependencies' => sd_dependencies($pdo, $id)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'critical_path': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(sd_critical_path($pdo, $id), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'readiness': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode([
                    'stored' => sd_readiness($pdo, $id),
                    'live'   => sd_readiness_evaluate($pdo, $id),
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'baselines': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(['baselines' => sd_baselines($pdo, $id)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'baseline_diff': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(sd_baseline_diff($pdo, $id), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'startup': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(sd_startup_sheet($pdo, $id), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'material': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(sd_material($pdo, $id, (int)($_GET['scope_id'] ?? 0)), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'cost': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(sd_cost_summary($pdo, $id), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'progress': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                echo json_encode(sd_progress($pdo, $id), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'activity': {
                $id = (int)($_GET['id'] ?? 0);
                if ($id <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ id');
                $st = $pdo->prepare('SELECT a.*, u.full_name AS user_name FROM sd_activity a
                                     LEFT JOIN users u ON u.id = a.user_id
                                     WHERE a.shutdown_id = ? ORDER BY a.id DESC LIMIT 200');
                $st->execute([$id]);
                echo json_encode(['activity' => $st->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'candidates': {
                // Advisory only — Phase 34's ranking. Absent Phase 34 tables, report unavailable.
                $woId = (int)($_GET['work_order_id'] ?? 0);
                if ($woId <= 0) api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ work_order_id');
                requirePerm($pdo, 'shutdown', 'plan');
                if (!function_exists('wf_candidates') || !sd_table_exists($pdo, 'wf_crews')) {
                    echo json_encode(['available' => false, 'note' => 'ระบบกำลังคน (Phase 34) ยังไม่พร้อมใช้งาน'], JSON_UNESCAPED_UNICODE);
                    break;
                }
                echo json_encode(array_merge(['available' => true], wf_candidates($pdo, $woId, (string)($_GET['date'] ?? ''))), JSON_UNESCAPED_UNICODE);
                break;
            }

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
        if ($action === '') api_fail(400, 'VALIDATION_ERROR', 'ต้องระบุ action');

        // ── permission gates (always server-side) ──
        switch ($action) {
            case 'save':
            case 'scope_save':
            case 'scope_delete':
            case 'dependency_save':
            case 'dependency_delete':
            case 'asset_save':
            case 'asset_delete':
            case 'part_save':
            case 'part_delete':
                requirePerm($pdo, 'shutdown', 'plan');
                break;

            case 'scope_status':
            case 'part_reserve':
                requirePerm($pdo, 'shutdown', 'execute');
                break;

            case 'baseline_create':
                requirePerm($pdo, 'shutdown', 'baseline_create');
                break;

            case 'readiness_refresh':
            case 'readiness_waive':
                requirePerm($pdo, 'shutdown', 'readiness_manage');
                break;

            case 'startup_refresh':
            case 'startup_waive':
                requirePerm($pdo, 'shutdown', 'startup');
                break;

            case 'transition': {
                $to = (string)($data['to'] ?? '');
                $perm = match ($to) {
                    'startup' => 'startup',
                    'closeout', 'completed' => 'closeout',
                    'cancelled' => 'cancel',
                    'execution' => 'execute',
                    default => 'plan',
                };
                requirePerm($pdo, 'shutdown', $perm);
                break;
            }

            default:
                api_fail(404, 'NOT_FOUND', 'ไม่รู้จัก action นี้');
        }

        // ── idempotency (offline / retry safe; lifecycle + stock writes are NOT queued offline) ──
        $idemKey = clientActionKeyFromRequest($data);
        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/shutdown.php?action=' . urlencode($actionRel));
            if ($idem['status'] === 'replay') {
                echo json_encode(['success' => true, 'dedup' => true, 'id' => $idem['ref_id']], JSON_UNESCAPED_UNICODE);
                exit;
            }
            if ($idem['status'] !== 'new') {
                clientActionFinish($pdo, $idemKey, 'conflict', null, null, 409);
                http_response_code(409);
                echo json_encode(['success' => false, 'code' => 'CLIENT_ACTION_UNCERTAIN',
                    'error' => 'รายการนี้ถูกส่งแล้วจากอุปกรณ์ของท่าน — ไม่ประมวลผลซ้ำ'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        /** Run an engine callable, finish idempotency, translate errors, emit success. */
        $run = function (string $refType, callable $fn) use ($pdo, $idemKey, $errStatus): void {
            $res = $fn();
            if (is_array($res) && !empty($res['error'])) {
                if ($idemKey !== '') clientActionFinish($pdo, $idemKey, 'error', $refType, null, $errStatus((string)$res['error']));
                api_fail($errStatus((string)$res['error']), (string)$res['error'], (string)($res['message'] ?? ''));
            }
            if ($idemKey !== '') clientActionFinish($pdo, $idemKey, 'success', $refType, $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], is_array($res) ? $res : []), JSON_UNESCAPED_UNICODE);
            exit;
        };

        switch ($action) {
            case 'save': {
                $id = (int)($data['id'] ?? 0);
                $run('shutdown', fn() => $id > 0
                    ? sd_update($pdo, $uid, $id, $data)
                    : sd_create($pdo, $uid, $data));
                break;
            }

            case 'transition':
                $run('shutdown', fn() => sd_transition($pdo, $uid, (int)($data['id'] ?? 0), (string)($data['to'] ?? ''), $data));
                break;

            case 'scope_save':
                $run('shutdown', fn() => sd_scope_save($pdo, $uid, $data));
                break;

            case 'scope_status':
                $run('shutdown', fn() => sd_scope_status($pdo, $uid, (int)($data['scope_id'] ?? 0), (string)($data['to'] ?? ''), (string)($data['reason'] ?? '')));
                break;

            case 'scope_delete':
                $run('shutdown', fn() => sd_scope_delete($pdo, $uid, (int)($data['scope_id'] ?? 0), (string)($data['reason'] ?? '')));
                break;

            case 'dependency_save':
                $run('shutdown', fn() => sd_dependency_save($pdo, $uid, $data));
                break;

            case 'dependency_delete':
                $run('shutdown', fn() => sd_dependency_delete($pdo, $uid, (int)($data['id'] ?? 0), (string)($data['reason'] ?? '')));
                break;

            case 'baseline_create':
                $run('shutdown', fn() => sd_baseline_create($pdo, $uid, (int)($data['id'] ?? 0), (string)($data['note'] ?? '')));
                break;

            case 'readiness_refresh':
                $run('shutdown', fn() => sd_readiness_refresh($pdo, $uid, (int)($data['id'] ?? 0)));
                break;

            case 'readiness_waive':
                $run('shutdown', fn() => sd_readiness_waive($pdo, $uid, (int)($data['check_id'] ?? 0), (string)($data['reason'] ?? ''), (string)($data['reason_code'] ?? '')));
                break;

            case 'startup_refresh':
                $run('shutdown', fn() => sd_startup_refresh($pdo, $uid, (int)($data['id'] ?? 0)));
                break;

            case 'startup_waive':
                $run('shutdown', fn() => sd_startup_waive($pdo, $uid, (int)($data['check_id'] ?? 0), (string)($data['reason'] ?? ''), (string)($data['reason_code'] ?? '')));
                break;

            case 'asset_save':
                $run('shutdown', fn() => sd_asset_save($pdo, $uid, $data));
                break;

            case 'asset_delete':
                $run('shutdown', fn() => sd_asset_delete($pdo, $uid, (int)($data['sd_asset_id'] ?? 0), (string)($data['reason'] ?? '')));
                break;

            case 'part_save':
                $run('shutdown', fn() => sd_part_save($pdo, $uid, $data));
                break;

            case 'part_delete':
                $run('shutdown', fn() => sd_part_delete($pdo, $uid, (int)($data['id'] ?? 0), (string)($data['reason'] ?? '')));
                break;

            case 'part_reserve':
                $run('shutdown', fn() => sd_part_reserve($pdo, $uid, $data));
                break;
        }
        exit;
    }

    api_fail(405, 'METHOD_NOT_ALLOWED', 'ไม่รองรับเมธอดนี้');
} catch (RuntimeException $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 599) $status = 400;
    $code = match ($status) {
        403 => 'FORBIDDEN',
        404 => 'NOT_FOUND',
        409 => 'CONFLICT',
        default => 'VALIDATION_ERROR',
    };
    api_fail($status, $code, $e->getMessage());
} catch (Throwable $e) {
    api_safe_catch($e);
}
