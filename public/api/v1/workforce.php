<?php
/**
 * workforce.php — Maintenance Resource & Workforce Management API (Phase 34)
 *
 * Thin adapter only — every business rule lives in src/helpers/workforce.php.
 * requireLogin + requirePerm('workforce', $action) + enforceCsrf() are enforced server-side.
 *
 *   GET  /api/v1/workforce.php?action=...
 *     config        — config + reason codes + skill levels + can_*
 *     options       — skills, courses, crews, departments, users, asset types (reference data)
 *     dashboard     — workforce KPIs, data coverage, expiring certs, capacity alerts
 *     technicians   — people list with skill/cert/auth/shift summary (?department_id&role_id&q)
 *     technician    — one person: skills, certifications, authorizations, training, shift (?user_id=)
 *     skills        — skill catalog (?q&category&active)
 *     skill_matrix  — catalog × people grid (?user_ids)
 *     my_skills     — the caller's own skills/certs/training/authorizations (mobile view)
 *     certifications— certifications for a subject (?user_id | ?contractor_worker_id&subject_type)
 *     expiring      — certificates expiring in the warning window (?days)
 *     training      — training records (?user_id&status)
 *     courses       — course catalog
 *     crews         — crew list / one crew (?crew_id)
 *     shifts        — shift assignments (?user_id) and availability for a date (?date&user_id)
 *     capacity      — capacity board (?from&to&user_ids)
 *     workload      — actual vs planned per person (?from&to&user_id)
 *     candidates    — ranked candidates for a work order WITH reasons (?work_order_id&date) — read only
 *     gap           — skill gap analysis for a work order (?work_order_id)
 *     readiness     — workforce readiness for a work order (?work_order_id)
 *     conflicts     — conflict reasons for a work order or person (?work_order_id | ?user_id&from&to)
 *     contractor_workforce — contractor personnel + their certifications (Phase 31 reuse)
 *     evidence      — qualification evidence trail (?subject_type&subject_id)
 *     report        — capacity + certification + gap summary for a period (?from&to)
 *
 *   POST (CSRF + permission + idempotency — every mutation calls the engine only)
 *     skill_save        { id?, code, name_th, name_en?, category?, min_level?, is_certification_required?,
 *                        required_certification_code?, is_authorization_required?, required_authorization_code? }
 *     skill_assign      { user_id, skill_id|skill_name, skill_level, valid_until?, evidence_type?, reason }
 *     skill_remove      { id, reason }
 *     certification_save{ id?, subject_type?, user_id?, contractor_worker_id?, certification_code,
 *                        certification_name, certificate_no?, issued_date?, expiry_date?, issuing_body?,
 *                        status?, evidence_path?, reason }
 *     training_save     { id?, user_id, course_id, status, score?, scheduled_date?, completed_at?,
 *                        expires_at?, instructor?, reason }
 *     course_save       { id?, code, name_th, name_en?, category?, description?, validity_days?,
 *                        is_active?, reason }
 *     authorization_save{ id?, user_id, code, name_th, name_en?, valid_until?, status?, reason }
 *     shift_save       { id?, user_id, shift_start, shift_end, break_minutes?, work_days, effective_from?,
 *                        effective_to?, overtime_allowed?, reason }
 *     leave_save       { id?, user_id, leave_type, start_date, end_date, status?, reason? }
 *     crew_save        { id?, code, name_th, name_en?, department_id?, lead_user_id?, notes? }
 *     crew_members     { crew_id, user_ids[], lead_user_id?, reason }
 *     assign_work_order{ work_order_id, user_ids[], lead_user_id?, reason }
 *     requirement_save { scope_type, scope_value, skill_id, min_level, is_mandatory?, notes? }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/workforce.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/csrf.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'];
    $uid = (int)($_SESSION['user_id'] ?? 0);
    $hasPerm = fn(string $a): bool => canPerm($pdo, 'workforce', $a);

    /** 409 helper for domain errors that carry an HTTP status. */
    $fail = function (string $msg, int $status = 400, string $code = 'VALIDATION_ERROR'): void {
        api_fail($status, $code, $msg);
    };

    /* ───────────────── GET ───────────────── */

    if ($method === 'GET') {
        $action = (string)($_GET['action'] ?? 'config');
        // Self-scoped reads are available to any signed-in user. A technician has no
        // workforce.view permission, yet must be able to open their own record on the
        // PWA. These actions only ever return the caller's own data, so requiring the
        // admin-level "view" permission would lock out the people who need them most.
        $selfScoped = ['my_skills', 'config'];
        if (!in_array($action, $selfScoped, true)) {
            requirePerm($pdo, 'workforce', 'view');
        } elseif (!empty($_GET['user_id']) && (int)$_GET['user_id'] !== $uid) {
            // Guard against a self-scoped action being used to read somebody else.
            api_fail(403, 'FORBIDDEN', 'ดูได้เฉพาะข้อมูลของตัวเองเท่านั้น');
        }

        switch ($action) {
            case 'config':
                echo json_encode([
                    'config'         => wf_config($pdo),
                    'reason_codes'   => WF_CONFLICT_REASONS,
                    'skill_levels'   => wf_skill_levels($pdo),
                    'can' => [
                        'view' => $hasPerm('view'), 'manage' => $hasPerm('manage'),
                        'technician_manage' => $hasPerm('technician_manage'),
                        'skill_manage' => $hasPerm('skill_manage'), 'skill_assign' => $hasPerm('skill_assign'),
                        'certification_manage' => $hasPerm('certification_manage'),
                        'training_manage' => $hasPerm('training_manage'), 'crew_manage' => $hasPerm('crew_manage'),
                        'capacity_view' => $hasPerm('capacity_view'), 'capacity_manage' => $hasPerm('capacity_manage'),
                        'assignment_manage' => $hasPerm('assignment_manage'),
                        'analytics' => $hasPerm('analytics'),
                    ],
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'options': {
                $departments = $pdo->query('SELECT id, code, name FROM departments WHERE is_active = 1 ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
                $people = $pdo->query('SELECT id, full_name, employee_code, position, department_id, role_id
                                       FROM users WHERE ' . wf_staff_where() . ' ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC);
                // asset_registry has no asset_type_id; scope by its real attributes.
                $assetCategories = $pdo->query("SELECT DISTINCT category FROM asset_registry
                                                WHERE category IS NOT NULL AND category <> '' ORDER BY category")
                                    ->fetchAll(PDO::FETCH_COLUMN);
                echo json_encode([
                    'skills'      => wf_skills($pdo),
                    'courses'     => wf_courses($pdo),
                    'crews'       => wf_crews($pdo, true),
                    'departments' => $departments,
                    'users'       => $people,
                    'asset_categories' => array_map('strval', $assetCategories),
                    'asset_criticalities' => array_map(
                        fn($r) => $r['criticality'],
                        $pdo->query('SELECT DISTINCT criticality FROM asset_registry ORDER BY criticality')->fetchAll(PDO::FETCH_ASSOC)
                    ),
                    'repair_types' => $pdo->query('SELECT id, code, name FROM repair_types WHERE is_active = 1 ORDER BY name')->fetchAll(PDO::FETCH_ASSOC),
                    'work_zones'  => $pdo->query('SELECT id, name FROM work_zones ORDER BY name')->fetchAll(PDO::FETCH_ASSOC),
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'dashboard':
                echo json_encode(wf_dashboard($pdo, (string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? '')), JSON_UNESCAPED_UNICODE);
                break;

            case 'technicians': {
                $sql = 'SELECT u.id, u.full_name, u.employee_code, u.position, u.department_id, u.role_id, u.role, u.is_active,
                               d.name AS department_name, COALESCE(r.name, u.role) AS role_name
                        FROM users u
                        LEFT JOIN departments d ON d.id = u.department_id
                        LEFT JOIN roles r ON r.id = u.role_id
                        WHERE ' . wf_staff_where('u');
                $params = [];
                if (!empty($_GET['department_id'])) { $sql .= ' AND u.department_id = ?'; $params[] = (int)$_GET['department_id']; }
                if (!empty($_GET['role_id'])) { $sql .= ' AND u.role_id = ?'; $params[] = (int)$_GET['role_id']; }
                if (!empty($_GET['q'])) { $sql .= ' AND (u.full_name LIKE ? OR u.employee_code LIKE ?)'; $params[] = '%' . $_GET['q'] . '%'; $params[] = '%' . $_GET['q'] . '%'; }
                $sql .= ' ORDER BY u.full_name';
                $st = $pdo->prepare($sql);
                $st->execute($params);
                $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                $asOf = date('Y-m-d');
                foreach ($rows as &$row) {
                    $id = (int)$row['id'];
                    $skills = wf_user_skills($pdo, $id, $asOf);
                    $certs = wf_certifications($pdo, $id, 'user', $asOf);
                    $auths = wf_user_authorizations($pdo, $id, $asOf);
                    $row['skill_count'] = count($skills);
                    $row['top_skills'] = array_slice(array_map(fn($s) => $s['skill_name'], $skills), 0, 5);
                    $row['valid_cert_count'] = count(array_filter($certs, fn($c) => $c['status'] === 'active' && !$c['expired']));
                    $row['expired_cert_count'] = count(array_filter($certs, fn($c) => $c['expired']));
                    $row['active_auth_count'] = count(array_filter($auths, fn($a) => $a['status'] === 'active'));
                    $row['has_shift'] = (bool)$pdo->query('SELECT 1 FROM wf_shift_assignments WHERE user_id = ' . $id . ' AND is_active = 1 LIMIT 1')->fetchColumn();
                }
                unset($row);
                echo json_encode(['technicians' => $rows], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'technician': {
                $id = (int)($_GET['user_id'] ?? 0);
                if ($id <= 0) $fail('ต้องระบุ user_id');
                $u = $pdo->prepare('SELECT u.*, d.name AS department_name FROM users u
                                    LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?');
                $u->execute([$id]);
                $user = $u->fetch(PDO::FETCH_ASSOC);
                if (!$user) $fail('ไม่พบผู้ใช้', 404, 'NOT_FOUND');
                $shift = $pdo->prepare('SELECT * FROM wf_shift_assignments WHERE user_id = ? AND is_active = 1 LIMIT 1');
                $shift->execute([$id]);
                echo json_encode([
                    'user'            => $user,
                    'skills'          => wf_user_skills($pdo, $id),
                    'certifications'  => wf_certifications($pdo, $id, 'user'),
                    'authorizations'  => wf_user_authorizations($pdo, $id),
                    'training'        => wf_training_records($pdo, $id),
                    'shift'           => $shift->fetch(PDO::FETCH_ASSOC) ?: null,
                    'shift_effective' => wf_shift_for($pdo, $id, date('Y-m-d')),
                    'crew_memberships'=> $pdo->query('SELECT cm.*, c.name_th AS crew_name FROM wf_crew_members cm
                                                      JOIN wf_crews c ON c.id = cm.crew_id
                                                      WHERE cm.user_id = ' . $id . ' AND cm.is_active = 1')->fetchAll(PDO::FETCH_ASSOC),
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'skills': {
                $rows = wf_skills($pdo, ($_GET['active'] ?? '1') !== '0');
                if (!empty($_GET['q'])) {
                    $q = mb_strtolower((string)$_GET['q']);
                    $rows = array_values(array_filter($rows, fn($s) =>
                        mb_str_contains(mb_strtolower($s['code'] . ' ' . $s['name_th'] . ' ' . $s['category']), $q)));
                }
                echo json_encode(['skills' => $rows], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'skill_matrix': {
                $ids = isset($_GET['user_ids']) && $_GET['user_ids'] !== ''
                    ? array_filter(array_map('intval', explode(',', (string)$_GET['user_ids']))) : null;
                echo json_encode(wf_skill_matrix($pdo, $ids), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'my_skills':
                echo json_encode([
                    'skills'         => wf_user_skills($pdo, $uid),
                    'certifications' => wf_certifications($pdo, $uid, 'internal'),
                    'authorizations' => wf_user_authorizations($pdo, $uid),
                    'training'       => wf_training_records($pdo, $uid),
                    'shift_effective'=> wf_shift_for($pdo, $uid, date('Y-m-d')),
                    'availability'   => wf_availability($pdo, $uid, (string)($_GET['date'] ?? date('Y-m-d'))),
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'certifications': {
                // worker_certifications.subject_type is ENUM('internal','contractor')
                $subjectType = (string)($_GET['subject_type'] ?? 'internal') === 'contractor' ? 'contractor' : 'internal';
                $subjectId = $subjectType === 'contractor'
                    ? (int)($_GET['contractor_worker_id'] ?? 0) : (int)($_GET['user_id'] ?? 0);
                if ($subjectId <= 0) $fail('ต้องระบุ user_id หรือ contractor_worker_id');
                echo json_encode(['certifications' => wf_certifications($pdo, $subjectId, $subjectType)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'expiring':
                echo json_encode(['expiring' => wf_expiring_certifications($pdo, isset($_GET['days']) ? (int)$_GET['days'] : null)], JSON_UNESCAPED_UNICODE);
                break;

            case 'training':
                echo json_encode([
                    'records' => wf_training_records($pdo, isset($_GET['user_id']) ? (int)$_GET['user_id'] : null),
                    'courses' => wf_courses($pdo, ($_GET['active'] ?? '1') !== '0'),
                ], JSON_UNESCAPED_UNICODE);
                break;

            case 'courses':
                echo json_encode(['courses' => wf_courses($pdo, ($_GET['active'] ?? '1') !== '0')], JSON_UNESCAPED_UNICODE);
                break;

            case 'crews':
                if (!empty($_GET['crew_id'])) {
                    $crew = wf_crew($pdo, (int)$_GET['crew_id']);
                    if (!$crew) $fail('ไม่พบทีม', 404, 'NOT_FOUND');
                    echo json_encode($crew, JSON_UNESCAPED_UNICODE);
                } else {
                    echo json_encode(['crews' => wf_crews($pdo)], JSON_UNESCAPED_UNICODE);
                }
                break;

            case 'shifts': {
                $out = ['shifts' => $pdo->query('SELECT s.*, u.full_name FROM wf_shift_assignments s
                                                  JOIN users u ON u.id = s.user_id
                                                  WHERE s.is_active = 1 ORDER BY u.full_name')->fetchAll(PDO::FETCH_ASSOC)];
                if (!empty($_GET['user_id'])) {
                    $date = (string)($_GET['date'] ?? date('Y-m-d'));
                    $out['availability'] = wf_availability($pdo, (int)$_GET['user_id'], $date);
                    $out['date'] = $date;
                }
                echo json_encode($out, JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'leave': {
                // wf_leave had no reader, which left approved leave invisible to the
                // shifts screen even though it silently reduces capacity. Read the
                // overlapping range, not just rows that start inside it, or a long
                // leave would vanish from every day it actually covers.
                $from = (string)($_GET['from'] ?? date('Y-m-01'));
                $to   = (string)($_GET['to']   ?? date('Y-m-t', strtotime('+1 month')));
                $sql = 'SELECT l.*, u.full_name, u.employee_code
                        FROM wf_leave l
                        JOIN users u ON u.id = l.user_id
                        WHERE l.start_date <= ? AND l.end_date >= ?';
                $params = [$to, $from];
                if (!empty($_GET['user_id'])) { $sql .= ' AND l.user_id = ?'; $params[] = (int)$_GET['user_id']; }
                if (!empty($_GET['status']))  { $sql .= ' AND l.status = ?';   $params[] = (string)$_GET['status']; }
                $sql .= ' ORDER BY u.full_name, l.start_date';
                $st = $pdo->prepare($sql);
                $st->execute($params);
                $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as &$row) {
                    $row['id']          = (int)$row['id'];
                    $row['user_id']     = (int)$row['user_id'];
                    $row['days']        = (int)wf_leave_days($row['start_date'], $row['end_date']);
                    $row['reduces_capacity'] = $row['status'] === 'approved';
                }
                unset($row);
                echo json_encode(['from' => $from, 'to' => $to, 'leave' => $rows], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'capacity': {
                requirePerm($pdo, 'workforce', 'capacity_view');
                $to = (string)($_GET['to'] ?? date('Y-m-d'));
                $from = (string)($_GET['from'] ?? date('Y-m-d', strtotime($to . ' -6 days')));
                $ids = isset($_GET['user_ids']) && $_GET['user_ids'] !== ''
                    ? array_filter(array_map('intval', explode(',', (string)$_GET['user_ids']))) : null;
                echo json_encode(['range' => ['from' => $from, 'to' => $to], 'board' => wf_capacity_board($pdo, $from, $to, $ids)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'workload': {
                requirePerm($pdo, 'workforce', 'capacity_view');
                $to = (string)($_GET['to'] ?? date('Y-m-d'));
                $from = (string)($_GET['from'] ?? date('Y-m-d', strtotime($to . ' -6 days')));
                $targets = !empty($_GET['user_id']) ? [(int)$_GET['user_id']]
                    : array_map(fn($c) => $c['user_id'], wf_capacity_board($pdo, $from, $to));
                $rows = [];
                foreach ($targets as $t) $rows[] = wf_actual_vs_planned($pdo, (int)$t, $from, $to);
                echo json_encode(['range' => ['from' => $from, 'to' => $to], 'workload' => $rows], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'candidates': {
                $woId = (int)($_GET['work_order_id'] ?? 0);
                if ($woId <= 0) $fail('ต้องระบุ work_order_id');
                requirePerm($pdo, 'workforce', 'assignment_manage');
                echo json_encode(wf_candidates($pdo, $woId, (string)($_GET['date'] ?? '')), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'gap': {
                $woId = (int)($_GET['work_order_id'] ?? 0);
                if ($woId <= 0) $fail('ต้องระบุ work_order_id');
                $st = $pdo->prepare('SELECT * FROM repair WHERE id = ?');
                $st->execute([$woId]);
                $wo = $st->fetch(PDO::FETCH_ASSOC);
                if (!$wo) $fail('ไม่พบใบงาน', 404, 'NOT_FOUND');
                echo json_encode(wf_skill_gap($pdo, $wo), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'readiness': {
                $woId = (int)($_GET['work_order_id'] ?? 0);
                if ($woId <= 0) $fail('ต้องระบุ work_order_id');
                echo json_encode(wf_readiness($pdo, $woId), JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'conflicts': {
                if (!empty($_GET['work_order_id'])) {
                    requirePerm($pdo, 'workforce', 'assignment_manage');
                    $woId = (int)$_GET['work_order_id'];
                    $c = wf_candidates($pdo, $woId, (string)($_GET['date'] ?? ''));
                    $blocked = array_values(array_filter($c['candidates'], fn($x) => !$x['eligible']));
                    echo json_encode([
                        'work_order_id' => $woId,
                        'required' => $c['required'],
                        'unmapped' => $c['unmapped'],
                        'blocked' => $blocked,
                        'note' => $c['note'],
                    ], JSON_UNESCAPED_UNICODE);
                    break;
                }
                requirePerm($pdo, 'workforce', 'capacity_view');
                $userId = (int)($_GET['user_id'] ?? 0);
                if ($userId <= 0) $fail('ต้องระบุ user_id');
                $to = (string)($_GET['to'] ?? date('Y-m-d', strtotime('+7 days')));
                $from = (string)($_GET['from'] ?? date('Y-m-d'));
                echo json_encode([
                    'user_id' => $userId,
                    'range' => ['from' => $from, 'to' => $to],
                    'days' => array_map(fn($d) => array_merge(['date' => $d], wf_availability($pdo, $userId, $d)), wf_date_range($from, $to)),
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'contractor_workforce':
                echo json_encode(['workers' => wf_contractor_workforce($pdo, isset($_GET['contractor_id']) ? (int)$_GET['contractor_id'] : null)], JSON_UNESCAPED_UNICODE);
                break;

            case 'evidence': {
                $st = $pdo->prepare('SELECT * FROM wf_qualification_evidence
                                     WHERE subject_type = ? AND subject_id = ? ORDER BY created_at DESC LIMIT 200');
                $st->execute([(string)($_GET['subject_type'] ?? 'user'), (int)($_GET['subject_id'] ?? 0)]);
                echo json_encode(['evidence' => $st->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE);
                break;
            }

            case 'report':
                requirePerm($pdo, 'workforce', 'analytics');
                $to = (string)($_GET['to'] ?? date('Y-m-d'));
                $from = (string)($_GET['from'] ?? date('Y-m-d', strtotime($to . ' -29 days')));
                echo json_encode([
                    'range' => ['from' => $from, 'to' => $to],
                    'dashboard' => wf_dashboard($pdo, $from, $to),
                    'board' => wf_capacity_board($pdo, $from, $to),
                    'expiring' => wf_expiring_certifications($pdo),
                ], JSON_UNESCAPED_UNICODE);
                break;

            default:
                $fail('ไม่รู้จัก action นี้', 404, 'NOT_FOUND');
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

        // ── permission gates (always server-side) ──
        switch ($action) {
            case 'skill_save':
                requirePerm($pdo, 'workforce', 'skill_manage');
                break;
            case 'skill_assign':
            case 'skill_remove':
                requirePerm($pdo, 'workforce', 'skill_assign');
                break;
            case 'certification_save':
                requirePerm($pdo, 'workforce', 'certification_manage');
                break;
            case 'training_save':
                requirePerm($pdo, 'workforce', 'training_manage');
                break;
            case 'course_save':
                requirePerm($pdo, 'workforce', 'training_manage');
                break;
            case 'authorization_save':
                requirePerm($pdo, 'workforce', 'manage');
                break;
            case 'shift_save':
            case 'leave_save':
                requirePerm($pdo, 'workforce', 'manage');
                break;
            case 'crew_save':
            case 'crew_members':
                requirePerm($pdo, 'workforce', 'crew_manage');
                break;
            case 'requirement_save':
                requirePerm($pdo, 'workforce', 'skill_manage');
                break;
            case 'assign_work_order':
                requirePerm($pdo, 'workforce', 'assignment_manage');
                break;
            default:
                $fail('ไม่รู้จัก action นี้', 404, 'NOT_FOUND');
        }

        // ── idempotency (prevents offline/retry double processing) ──
        $idemKey = clientActionKeyFromRequest($data);
        if ($idemKey !== '') {
            $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/workforce.php?action=' . urlencode($actionRel));
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

        $respond = function (array $res) use ($pdo, $idemKey, $action): void {
            clientActionFinish($pdo, $idemKey, 'success', 'workforce', $res['id'] ?? null);
            echo json_encode(array_merge(['success' => true], $res), JSON_UNESCAPED_UNICODE);
            exit;
        };

        switch ($action) {
            case 'skill_save':
                $respond(wf_save_skill($pdo, $data, $uid));
                break;

            case 'skill_assign':
                $respond(wf_assign_skill($pdo, (int)($data['user_id'] ?? 0), $data, $uid));
                break;

            case 'skill_remove':
                wf_remove_skill($pdo, (int)($data['id'] ?? 0), (string)($data['reason'] ?? ''), $uid);
                $respond(['id' => (int)($data['id'] ?? 0)]);
                break;

            case 'certification_save':
                $respond(wf_save_certification($pdo, $data, $uid));
                break;

            case 'training_save':
                $respond(wf_save_training($pdo, $data, $uid));
                break;

            case 'course_save':
                $respond(wf_save_course($pdo, $data, $uid));
                break;

            case 'authorization_save':
                $respond(wf_save_authorization($pdo, $data, $uid));
                break;

            case 'shift_save':
                $respond(wf_save_shift($pdo, $data, $uid));
                break;

            case 'leave_save':
                $respond(wf_save_leave($pdo, $data, $uid));
                break;

            case 'crew_save':
                $respond(wf_save_crew($pdo, $data, $uid));
                break;

            case 'crew_members':
                $respond(wf_set_crew_members($pdo, (int)($data['crew_id'] ?? 0),
                    (array)($data['user_ids'] ?? []),
                    isset($data['lead_user_id']) ? (int)$data['lead_user_id'] : null,
                    (string)($data['reason'] ?? ''), $uid));
                break;

            case 'requirement_save':
                $respond(wf_save_requirement($pdo, $data, $uid));
                break;

            case 'assign_work_order':
                $respond(wf_assign_work_order($pdo, (int)($data['work_order_id'] ?? 0),
                    (array)($data['user_ids'] ?? []),
                    isset($data['lead_user_id']) ? (int)$data['lead_user_id'] : null,
                    (string)($data['reason'] ?? ''), $uid));
                break;
        }
        exit;
    }

    $fail('ไม่รองรับเมธอดนี้', 405, 'METHOD_NOT_ALLOWED');
} catch (RuntimeException $e) {
    $status = (int)$e->getCode();
    if ($status < 400 || $status > 599) $status = 400;
    $code = $status === 409 ? 'CONFLICT' : ($status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR');
    api_fail($status, $code, $e->getMessage());
} catch (Throwable $e) {
    api_safe_catch($e);
}
