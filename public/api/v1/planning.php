<?php
/**
 * planning.php — Phase 25 Advanced Maintenance Planning & Scheduling API
 *
 * หน้าจอ: /planning (Planning Center), /planning/calendar (Timeline Planner),
 *         /field/plan (แท็บช่าง MY PLAN), Dashboard KPI integration
 *
 * Permission (สอดคล้อง src/helpers/roles.php):
 *   GET  center/queue/technicians/conflicts/readiness/duration_history → canPlanWork (1,2,6,7)
 *   GET  calendar/schedule_log/kpis                                   → authenticated (ช่างเห็นเฉพาะงานตัวเอง)
 *   PUT  schedule/reschedule/priority/assign/emergency/skill           → canPlanWork + CSRF + idempotency
 *   POST bulk                                                          → canPlanWork + CSRF + idempotency
 *
 * หลักการ (Phase 25):
 *   - backend re-validate ทุก action (RBAC + scope + สถานะ + ช่วงเวลา) — อย่าไว้ใจ body
 *   - ทุก schedule/assign/priority เขียน audit log (repair_schedule_log + repair_activity_log)
 *   - ไม่เปลี่ยน priority อัตโนมัติ — priority actions ต้องคนสั่ง + เหตุผล
 *   - สต็อก = Sage (spare_issue_requests) — ไม่จอง/ตัดสต็อกของตัวเอง
 *
 * HTTP: GET = อ่าน / PUT = mutate (CSRF บังคับ) / POST = bulk + dry-run (CSRF บังคับ)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
require_once __DIR__ . '/../../../src/helpers/planning.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
require_once __DIR__ . '/../../../src/helpers/idempotency.php';
require_once __DIR__ . '/../../../src/services/NotificationCenterService.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

function pln_uid(): int { return (int)($_SESSION['user_id'] ?? 0); }
function pln_input(): array {
    $d = json_decode(file_get_contents('php://input'), true);
    return is_array($d) ? $d : [];
}
function pln_name(PDO $pdo, int $uid): string {
    if (!$uid) return '-';
    $st = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $st->execute([$uid]);
    return (string)($st->fetchColumn() ?: '-');
}

function pln_fetch_wo(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT r.*, a.code AS asset_code, a.name AS asset_name, a.category AS asset_category, a.criticality AS asset_criticality,
                                u.full_name AS assigned_name,
                                (SELECT mr.request_code FROM maintenance_requests mr WHERE mr.work_order_id = r.id) AS request_code
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบใบสั่งงาน'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    return $row;
}

/** ลง Notification Center (inbox) — ช่วยรวม template/vars ให้เหมือน supervisor */
function pln_center(PDO $pdo, string $module, string $event, string $type, array $vars = [], array $users = [], array $roles = [1, 2, 6], ?string $url = null, int $refId = 0): void {
    try {
        NotificationCenterService::notify($pdo, [
            'module' => $module, 'event' => $event, 'type' => $type,
            'ref_type' => 'repair', 'ref_id' => $refId,
            'template' => $module . ':' . $event,
            'vars' => $vars,
            'users' => $users,
            'roles' => $roles,
            'exclude_users' => [pln_uid()],
            'channels' => ['app'],
            'dedup_hours' => 1,
            'url' => (string)($url ?? ''),
        ]);
    } catch (Exception $e) {
        error_log('[planning.php] center notify: ' . $e->getMessage());
    }
}

function pln_notify_user(PDO $pdo, int $uid, string $title, string $message, string $url): void {
    if (!$uid) return;
    try {
        sendNotificationToUser($uid, $title, $message, $url);
    } catch (Exception $e) {
        error_log('[planning.php] notify: ' . $e->getMessage());
    }
}

/** คำขอซ่อมใหม่ (maintenance_requests สถานะ open) — ให้ planner เห็นในคิวก่อนอนุมัติเป็นใบงาน
 *  หมายเหตุ: ไม่เขียน/ตัดสต็อก; การอนุมัติคำขอทำที่หน้าทบทวนของหัวหน้างาน (supervisor/review) */
function pln_open_requests(PDO $pdo): array {
    $st = $pdo->prepare("SELECT mr.id, mr.request_code, mr.title, mr.description, mr.priority, mr.status,
                                mr.asset_id, mr.requested_by, mr.created_at,
                                a.code AS asset_code, a.name AS asset_name,
                                a.category AS asset_category, a.criticality AS asset_criticality,
                                u.full_name AS requested_name
                         FROM maintenance_requests mr
                         LEFT JOIN asset_registry a ON a.id = mr.asset_id
                         LEFT JOIN users u ON u.id = mr.requested_by
                         WHERE mr.status = 'open'
                         ORDER BY FIELD(mr.priority, 'critical', 'high', 'normal', 'low'), mr.created_at ASC
                         LIMIT 200");
    $st->execute();
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'kind' => 'request',
            'id' => (int)$r['id'],
            'request_id' => (int)$r['id'],
            'work_order_no' => (string)($r['request_code'] ?? ('RQ-' . $r['id'])),
            'title' => (string)$r['title'],
            'description' => (string)($r['description'] ?? ''),
            'status' => (string)$r['status'],
            'priority' => ($r['priority'] === 'normal' || $r['priority'] === null) ? 'medium' : (string)$r['priority'],
            'asset_id' => $r['asset_id'] !== null ? (int)$r['asset_id'] : null,
            'asset_code' => $r['asset_code'],
            'asset_name' => $r['asset_name'],
            'asset_category' => $r['asset_category'],
            'asset_criticality' => $r['asset_criticality'],
            'assigned_to' => 0,
            'assigned_name' => null,
            'planned_start_at' => null,
            'planned_end_at' => null,
            'sla_due_at' => null,
            'source_type' => 'breakdown',
            'work_order_type' => 'breakdown',
            'required_skill' => null,
            'created_at' => $r['created_at'],
            'created_by' => $r['requested_by'] !== null ? (int)$r['requested_by'] : null,
            'requested_name' => $r['requested_name'],
            'team' => [],
            'team_ids' => [],
        ];
    }
    return $out;
}

/** รายการ repair ตามเงื่อนไข queue + scope (ไม่มี pagination SQL เพราะต้อง enrich ข้ามตาราง) */
function pln_queue_rows(PDO $pdo): array {
    $cfg = pln_config($pdo);
    $roleId = currentRoleId();
    $uid = pln_uid();
    $scope = kpi_scope($pdo, $roleId, $uid, 'r');
    $doneStatuses = pln_done_statuses();
    $done = implode(',', array_fill(0, count($doneStatuses), '?'));
    $st = $pdo->prepare("SELECT r.*, a.code AS asset_code, a.name AS asset_name, a.category AS asset_category, a.criticality AS asset_criticality,
                                u.full_name AS assigned_name
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.status NOT IN ($done)
                           AND r.status != 'draft'{$scope['sql']}
                         ORDER BY r.created_at DESC");
    $st->execute(array_merge($doneStatuses, $scope['params']));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) $row['kind'] = 'workorder';
    unset($row);
    return array_merge($rows, pln_open_requests($pdo));
}

/* ─────────────────────────── GET ─────────────────────────── */

/** สรุปศูนย์วางแผน: กลุ่มคิว + KPI + conflict วันนี้ + workload วันนี้ + readiness โดยรวม */
function apiGetCenter(PDO $pdo): void {
    requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
    $cfg = pln_config($pdo);
    $skills = pln_get_skills($pdo);
    $today = new DateTime('today');
    $tomorrow = (clone $today)->modify('+1 day');

    $rows = pln_queue_rows($pdo);
    $groups = ['new_request' => 0, 'unplanned' => 0, 'unscheduled' => 0, 'scheduled' => 0, 'at_risk' => 0, 'overdue' => 0];
    $sla = ['safe' => 0, 'at_risk' => 0, 'breached' => 0];
    $ready = 0;
    $scheduledToday = 0;
    $withReadiness = [];
    $todayFrom = $today->format('Y-m-d 00:00:00');
    $todayTo = $tomorrow->format('Y-m-d 00:00:00');
    foreach ($rows as $r) {
        $prep = pln_prepare($pdo, $r, $cfg, $skills);
        $withReadiness[] = $prep;
        $g = $prep['group'];
        if (isset($groups[$g])) $groups[$g]++;
        $sla[$prep['sla_risk']] = isset($sla[$prep['sla_risk']]) ? $sla[$prep['sla_risk']] + 1 : 1;
        if (($prep['readiness']['state'] ?? '') === 'READY') $ready++;
        $ps = (string)($prep['planned_start_at'] ?? '');
        if ($ps !== '' && $ps >= $todayFrom && $ps < $todayTo) $scheduledToday++;
    }

    // ความขัดแย้งของแผนวันนี้ (เส้นขอบฟ้าวันถัดไป)
    $conflicts = [];
    foreach ($withReadiness as $prep) {
        if ($prep['group'] !== 'scheduled' && $prep['group'] !== 'at_risk') continue;
        if (empty($prep['planned_start_at']) || empty($prep['planned_end_at'])) continue;
        $cs = pln_detect_conflicts($pdo, $prep['planned_start_at'], $prep['planned_end_at'],
            array_merge([(int)($prep['assigned_to'] ?? 0)], array_map('intval', $prep['team_ids'] ?? [])),
            (int)$prep['id'], (int)($prep['asset_id'] ?? 0));
        foreach ($cs as $c) {
            if (!isset($c['user_id']) || $c['user_id'] === 0 || count($cs) > 40) continue;
            $c['wo_id'] = (int)$prep['id'];
            $c['wo_no'] = (string)$prep['work_order_no'];
            $c['wo_title'] = (string)$prep['title'];
            $conflicts[] = $c;
        }
    }

    // Workload วันนี้ + readiness สรุป
    $workload = pln_technician_workload($pdo, $today, $tomorrow);

    echo json_encode([
        'groups' => $groups,
        'sla' => $sla,
        'readiness' => ['ready' => $ready, 'total' => count($rows)],
        'total_open' => count($rows),
        'scheduled_today' => $scheduledToday,
        'conflicts' => array_slice($conflicts, 0, 40),
        'workload' => array_values($workload),
        'can' => ['plan' => canPlanWork(), 'role_id' => currentRoleId()],
    ], JSON_UNESCAPED_UNICODE);
}

/** คิววางแผน โดยรวมหรือตามกลุ่ม (ค้นหา/กรอง/เรียง) */
function apiGetQueue(PDO $pdo): void {
    requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
    $cfg = pln_config($pdo);
    $group = (string)($_GET['group'] ?? 'all');
    $search = mb_strtolower(trim((string)($_GET['search'] ?? '')));
    $priority = (string)($_GET['priority'] ?? '');
    if ($priority === 'normal') $priority = 'medium';
    $techId = (int)($_GET['technician_id'] ?? 0);
    $assetId = (int)($_GET['asset_id'] ?? 0);
    $limit = min(300, max(1, (int)($_GET['limit'] ?? 120)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    $skills = pln_get_skills($pdo);
    $items = [];
    foreach (pln_queue_rows($pdo) as $r) {
        $it = pln_prepare($pdo, $r, $cfg, $skills);
        if ($group !== 'all' && $it['group'] !== $group) continue;
        if ($priority !== '' && $priority !== 'all' && $it['priority'] !== $priority) continue;
        if ($techId && (int)$it['assigned_to'] !== $techId && !in_array($techId, $it['team_ids'], true)) continue;
        if ($assetId && (int)$it['asset_id'] !== $assetId) continue;
        if ($search !== '') {
            $hay = mb_strtolower(implode(' ', [$it['work_order_no'], $it['title'], $it['asset_code'], $it['asset_name'], $it['assigned_name'] ?? '']));
            if (mb_strpos($hay, $search) === false) continue;
        }
        $items[] = $it;
    }
    usort($items, function ($a, $b) {
        $ord = ['CRITICAL' => 0, 'HIGH' => 1, 'NORMAL' => 2, 'LOW' => 3];
        $ga = $a['priority_explanation']['level'] ?? 'NORMAL';
        $gb = $b['priority_explanation']['level'] ?? 'NORMAL';
        $ca = $ord[$ga] ?? 2;
        $cb = $ord[$gb] ?? 2;
        if ($ca !== $cb) return $ca <=> $cb;
        $oa = $a['overdue'] ? 1 : 0;
        $ob = $b['overdue'] ? 1 : 0;
        return $ob <=> $oa;
    });

    $counts = ['new_request' => 0, 'unplanned' => 0, 'unscheduled' => 0, 'scheduled' => 0, 'at_risk' => 0, 'overdue' => 0];
    foreach ($items as $it) if (isset($counts[$it['group']])) $counts[$it['group']]++;

    echo json_encode([
        'items' => array_slice($items, $offset, $limit),
        'total' => count($items),
        'offset' => $offset,
        'limit' => $limit,
        'groups' => $counts,
        'can' => ['plan' => true, 'role_id' => currentRoleId()],
    ], JSON_UNESCAPED_UNICODE);
}

/** ตารางงาน (Timeline) — day/week/month; ช่าง role 3 เห็นงานตัวเองเท่านั้น (scope ที่ server) */
function apiGetCalendar(PDO $pdo): void {
    $cfg = pln_config($pdo);
    $view = (string)($_GET['view'] ?? 'week');
    if (!in_array($view, ['day', 'week', 'month'], true)) $view = 'week';
    $today = new DateTime('today');
    if ($view === 'day') {
        $from = clone $today;
        $to = (clone $today)->modify('+1 day');
    } elseif ($view === 'month') {
        $from = (clone $today)->setDate($today->format('Y'), $today->format('m'), 1);
        $to = (clone $from)->modify('+1 month');
    } else {
        $from = (clone $today)->modify('-' . max(0, $today->format('N') - 1) . ' days');
        $to = (clone $from)->modify('+7 days');
    }
    $fromStr = $from->format('Y-m-d 00:00:00');
    $toStr = $to->format('Y-m-d 00:00:00');

    $scope = kpi_scope($pdo, currentRoleId(), pln_uid(), 'r');
    $doneStatuses = pln_done_statuses();
    $done = implode(',', array_fill(0, count($doneStatuses), '?'));
    $st = $pdo->prepare("SELECT r.*, a.code AS asset_code, a.name AS asset_name, a.criticality AS asset_criticality,
                                a.category AS asset_category, u.full_name AS assigned_name
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.planned_start_at IS NOT NULL AND r.planned_end_at IS NOT NULL
                           AND r.status NOT IN ($done)
                           AND r.planned_start_at < ? AND r.planned_end_at > ?{$scope['sql']}
                         ORDER BY r.planned_start_at ASC");
    $params = array_merge($doneStatuses, [$toStr, $fromStr], $scope['params']);
    $st->execute($params);
    $skills = pln_get_skills($pdo);
    $items = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $it = pln_prepare($pdo, $r, $cfg, $skills, false);
        $items[] = $it;
    }

    $workload = [];
    if (canPlanWork()) {
        $workload = array_values(pln_technician_workload($pdo, $from, $to));
    }

    echo json_encode([
        'view' => $view,
        'from' => $from->format('Y-m-d'),
        'to' => $to->format('Y-m-d'),
        'items' => $items,
        'workload' => $workload,
        'can' => ['plan' => canPlanWork(), 'role_id' => currentRoleId()],
    ], JSON_UNESCAPED_UNICODE);
}

/** รายชื่อช่าง + ทักษะ + workload ในช่วงเวลาที่ส่ง */
function apiGetTechnicians(PDO $pdo): void {
    requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
    $from = new DateTime((string)($_GET['from'] ?? 'today 00:00:00'));
    $to = new DateTime((string)($_GET['to'] ?? '+1 day 00:00:00'));
    $skills = pln_get_skills($pdo);
    $st = $pdo->prepare('SELECT u.id, u.full_name, u.role_id, r.name AS role_name
                            FROM users u LEFT JOIN roles r ON r.id = u.role_id
                            WHERE u.is_active = 1 AND u.role_id IN (1,2,3,6,7)
                            ORDER BY (u.role_id = 3) DESC, u.full_name ASC');
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $workload = pln_technician_workload($pdo, $from, $to);
    foreach ($rows as &$t) {
        $uid = (int)$t['id'];
        $t['skills'] = $skills[$uid] ?? [];
        $t['workload'] = $workload[$uid] ?? null;
    }
    unset($t);
    echo json_encode(['items' => $rows], JSON_UNESCAPED_UNICODE);
}

/** ความขัดแย้งของแผนในหน้าต่าง (default: สัปดาห์นี้) */
function apiGetConflicts(PDO $pdo): void {
    requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
    $cfg = pln_config($pdo);
    $from = new DateTime((string)($_GET['from'] ?? 'today 00:00:00'));
    $to = new DateTime((string)($_GET['to'] ?? '+7 days 00:00:00'));
    $fromStr = $from->format('Y-m-d 00:00:00');
    $toStr = $to->format('Y-m-d 00:00:00');
    $doneStatuses = pln_done_statuses();
    $done = implode(',', array_fill(0, count($doneStatuses), '?'));
    $st = $pdo->prepare("SELECT r.*, a.code AS asset_code, a.name AS asset_name
                         FROM repair r LEFT JOIN asset_registry a ON a.id = r.asset_id
                         WHERE r.status NOT IN ($done) AND r.status != 'draft'
                           AND r.planned_start_at IS NOT NULL AND r.planned_end_at IS NOT NULL
                           AND r.planned_start_at < ? AND r.planned_end_at > ?
                         ORDER BY r.planned_start_at ASC
                         LIMIT 300");
    $st->execute(array_merge($doneStatuses, [$toStr, $fromStr]));
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $teamIds = array_merge([(int)$r['assigned_to']], array_map('intval', array_column(getWorkAssignees($pdo, 'repair', (int)$r['id']), 'user_id')));
        $cs = pln_detect_conflicts($pdo, (string)$r['planned_start_at'], (string)$r['planned_end_at'], $teamIds, (int)$r['id'], (int)$r['asset_id']);
        foreach ($cs as $c) {
            if (strtotime((string)$c['overlap_from']) >= strtotime($fromStr) || strtotime((string)$c['overlap_to']) <= strtotime($toStr)) {
                $c['wo_id'] = (int)$r['id'];
                $c['wo_no'] = (string)$r['work_order_no'];
                $c['wo_title'] = (string)$r['title'];
                $out[] = $c;
            }
        }
    }
    usort($out, fn($a, $b) => strtotime((string)$a['overlap_from']) <=> strtotime((string)$b['overlap_from']));
    echo json_encode(['items' => array_slice($out, 0, 100)], JSON_UNESCAPED_UNICODE);
}

/** ความพร้อมทำงานโดยละเอียดของใบงาน */
function apiGetReadiness(PDO $pdo): void {
    requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $wo = pln_fetch_wo($pdo, $id);
    $cfg = pln_config($pdo);
    $prep = pln_prepare($pdo, $wo, $cfg, pln_get_skills($pdo));
    echo json_encode([
        'id' => (int)$wo['id'],
        'work_order_no' => $wo['work_order_no'],
        'title' => $wo['title'],
        'readiness' => $prep['readiness'],
        'duration_estimate' => $prep['duration_estimate'],
        'skill_match' => $prep['skill_match'],
        'priority_explanation' => $prep['priority_explanation'],
        'sla_risk' => $prep['sla_risk'],
        'group' => $prep['group'],
    ], JSON_UNESCAPED_UNICODE);
}

/** ประวัติระยะเวลางานที่คล้ายคลึง (ประกอบการวางแผน) */
function apiGetDurationHistory(PDO $pdo): void {
    requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $wo = pln_fetch_wo($pdo, $id);
    echo json_encode(['estimate' => pln_duration_estimate($pdo, $wo)], JSON_UNESCAPED_UNICODE);
}

/** ประวัติการเลื่อน/มอบหมายของใบงาน (audit) */
function apiGetScheduleLog(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $st = $pdo->prepare('SELECT l.*, u.full_name AS changed_name
                         FROM repair_schedule_log l LEFT JOIN users u ON u.id = l.changed_by
                         WHERE l.repair_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 100');
    $st->execute([$id]);
    echo json_encode(['items' => $st->fetchAll(PDO::FETCH_ASSOC)], JSON_UNESCAPED_UNICODE);
}

/** KPI วางแผนสำหรับ Dashboard (ทุกคนที่ล็อกอินได้ — scope ตาม role) */
function apiGetKpis(PDO $pdo): void {
    $cfg = pln_config($pdo);
    $roleId = currentRoleId();
    $uid = pln_uid();
    $scope = kpi_scope($pdo, $roleId, $uid, 'r');
    $doneStatuses = pln_done_statuses();
    $done = implode(',', array_fill(0, count($doneStatuses), '?'));
    $st = $pdo->prepare("SELECT r.* FROM repair r
                         WHERE r.status NOT IN ($done) AND r.status != 'draft'{$scope['sql']}");
    $st->execute(array_merge($doneStatuses, $scope['params']));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $groups = ['unplanned' => 0, 'unscheduled' => 0, 'scheduled' => 0, 'at_risk' => 0, 'overdue' => 0];
    $sla = ['safe' => 0, 'at_risk' => 0, 'breached' => 0];
    foreach ($rows as $r) {
        $g = pln_group($r, $cfg);
        if ($g !== 'done' && $g !== 'new_request' && isset($groups[$g])) $groups[$g]++;
        $risk = pln_sla_risk($r, (int)$cfg['sla_risk_hours']);
        if (isset($sla[$risk])) $sla[$risk]++;
    }
    echo json_encode([
        'total_open' => count($rows),
        'groups' => $groups,
        'sla' => $sla,
        'can_plan' => canPlanWork(),
    ], JSON_UNESCAPED_UNICODE);
}

/* ─────────────────────────── MY PLAN (field/plan) ─────────────────────────── */

/** MY PLAN — งานทั้งหมดที่ผู้ใช้เป็นหัวหน้าชุด/ทีม: วันนี้ / สัปดาห์นี้ / ยังไม่มีรอบเวลา (login เท่านั้น) */
function apiGetMyPlan(PDO $pdo): void {
    $uid = pln_uid();
    if ($uid <= 0) { http_response_code(401); echo json_encode(['error' => 'ต้องเข้าสู่ระบบก่อน'], JSON_UNESCAPED_UNICODE); exit; }
    $cfg = pln_config($pdo);
    $skills = pln_get_skills($pdo);
    $today = new DateTime('today');
    $tomorrow = (clone $today)->modify('+1 day');
    $weekFrom = (clone $today)->modify('-' . max(0, $today->format('N') - 1) . ' days');
    $weekTo = (clone $weekFrom)->modify('+7 days');
    $doneStatuses = pln_done_statuses();
    $done = implode(',', array_fill(0, count($doneStatuses), '?'));
    $st = $pdo->prepare("SELECT r.*, a.code AS asset_code, a.name AS asset_name, a.category AS asset_category,
                                a.criticality AS asset_criticality, u.full_name AS assigned_name
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.status NOT IN ($done) AND r.status != 'draft'
                           AND (r.assigned_to = ? OR EXISTS (
                                 SELECT 1 FROM work_assignees wa
                                 WHERE wa.ref_type = 'repair' AND wa.ref_id = r.id AND wa.user_id = ?))
                         ORDER BY r.planned_start_at ASC, r.planned_end_at ASC, r.created_at DESC");
    $st->execute(array_merge($doneStatuses, [$uid, $uid]));

    $todayItems = [];
    $weekItems = [];
    $unplanned = [];
    $summary = ['today' => 0, 'week' => 0, 'unscheduled' => 0, 'need_skill' => 0];
    $t0 = $today->format('Y-m-d 00:00:00');
    $t1 = $tomorrow->format('Y-m-d 00:00:00');
    $w0 = $weekFrom->format('Y-m-d 00:00:00');
    $w1 = $weekTo->format('Y-m-d 00:00:00');
    $seenWeek = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $it = pln_prepare($pdo, $r, $cfg, $skills);
        $ps = (string)($it['planned_start_at'] ?? '');
        if ($ps !== '' && $ps >= $t0 && $ps < $t1) {
            $todayItems[] = $it;
            $summary['today']++;
        }
        if ($ps !== '' && $ps >= $w0 && $ps < $w1 && !in_array((int)$it['id'], $seenWeek, true)) {
            $weekItems[] = $it;
            $seenWeek[] = (int)$it['id'];
            $summary['week']++;
        }
        if ($ps === '') {
            $unplanned[] = $it;
            $summary['unscheduled']++;
        }
        if (($it['readiness']['state'] ?? '') === 'BLOCKED') $summary['need_skill']++;
    }

    echo json_encode([
        'today' => $todayItems,
        'week' => $weekItems,
        'unplanned' => $unplanned,
        'summary' => $summary,
        'display_name' => pln_name($pdo, $uid),
        'can' => ['plan' => canPlanWork(), 'role_id' => currentRoleId()],
    ], JSON_UNESCAPED_UNICODE);
}

/* ─────────────────────────── PUT ─────────────────────────── */

/** กำหนดรอบเวลางาน (schedule) — บันทึก audit + แจ้งเตือน */
function apiDoSchedule(PDO $pdo, int $id, string $start, string $end, ?string $reason, bool $force): array {
    if ($start === '' || $end === '') return ['success' => false, 'error' => 'ต้องระบุช่วงเวลา'];
    if ($end <= $start) return ['success' => false, 'error' => 'ช่วงเวลาไม่ถูกต้อง (สิ้นสุดต้องอยู่หลังเริ่ม)'];
    $wo = pln_fetch_wo($pdo, $id);
    if (in_array($wo['status'], pln_finished_statuses(), true)) return ['success' => false, 'error' => 'งานจบแล้ว ไม่สามารถเปลี่ยนตารางได้'];
    $teamIds = array_merge([(int)$wo['assigned_to']], array_map('intval', array_column(getWorkAssignees($pdo, 'repair', $id), 'user_id')));
    if ($wo['planned_start_at'] === $start && $wo['planned_end_at'] === $end) {
        return ['success' => true, 'unchanged' => true, 'conflicts' => [], 'wo' => $wo];
    }
    $conflicts = pln_detect_conflicts($pdo, $start, $end, array_values(array_unique($teamIds)), $id, (int)$wo['asset_id']);
    if ($conflicts && !$force) {
        return ['success' => false, 'error' => 'ขัดกับแผนงานอื่นในช่วงเวลาเดียวกัน', 'conflicts' => $conflicts];
    }
    $before = ['planned_start_at' => $wo['planned_start_at'], 'planned_end_at' => $wo['planned_end_at'], 'assigned_to' => $wo['assigned_to'], 'priority' => $wo['priority']];
    $pdo->prepare('UPDATE repair SET planned_start_at = ?, planned_end_at = ?, planner_id = ?,
                    sla_due_at = COALESCE(sla_due_at, ?) WHERE id = ?')
        ->execute([$start, $end, pln_uid(), $end, $id]);
    $after = ['planned_start_at' => $start, 'planned_end_at' => $end, 'assigned_to' => $wo['assigned_to'], 'priority' => $wo['priority']];
    pln_log_schedule($pdo, $id, $reason && $wo['planned_start_at'] ? 'reschedule' : 'schedule', $before, $after, $reason);

    pln_center($pdo, 'repair', 'planned', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)($wo['asset_code'] ?? ''), 'asset_name' => (string)($wo['asset_name'] ?? ''),
        'priority' => (string)($wo['priority'] ?? 'normal'), 'planned_start_at' => substr($start, 0, 16),
        'required_skill' => (string)($wo['required_skill'] ?? ''),
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id);
    return ['success' => true, 'conflicts' => $conflicts, 'wo' => $wo];
}

/** กำหนดรอบเวลาใหม่ + เหตุผล (reschedule) */
function apiDoReschedule(PDO $pdo, int $id, string $start, string $end, string $reason, bool $force): array {
    $reason = trim($reason);
    if ($reason === '') return ['success' => false, 'error' => 'ต้องระบุเหตุผลการเลื่อนกำหนด'];
    $res = apiDoSchedule($pdo, $id, $start, $end, $reason, $force);
    if (empty($res['success'])) return $res;
    $wo = $res['wo'];
    $users = array_values(array_unique(array_merge([(int)$wo['assigned_to']], array_column(getWorkAssignees($pdo, 'repair', $id), 'user_id'))));
    foreach ($users as $u) {
        if ($u <= 0) continue;
        pln_notify_user($pdo, (int)$u, 'เลื่อนกำหนดงาน ' . $wo['work_order_no'],
            $wo['title'] . "\nเวลาใหม่: {$start} → {$end}\nเหตุผล: {$reason}",
            publicBaseUrl() . '/repair/view?id=' . $id);
    }
    pln_center($pdo, 'repair', 'rescheduled', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)($wo['asset_code'] ?? ''), 'asset_name' => (string)($wo['asset_name'] ?? ''),
        'planned_start_at' => substr($start, 0, 16), 'planned_end_at' => substr($end, 0, 16), 'reason' => $reason,
    ], $users, [1, 2, 6], '/repair/view?id=' . $id, $id);
    return $res;
}

/** มอบหมายงาน (single) — ตรวจ double-assign/สถานะ/conflict เหมือน supervisor + แจ้งทักษะขาด */
function apiDoAssign(PDO $pdo, int $id, int $leadId, array $teamIds, ?string $start, ?string $end, ?string $note, bool $force): array {
    $teamIds = array_values(array_unique(array_filter(array_map('intval', $teamIds), fn($u) => $u > 0)));
    if ($leadId <= 0) return ['success' => false, 'error' => 'ต้องระบุผู้รับผิดชอบ (lead)'];
    $wo = pln_fetch_wo($pdo, $id);
    if (in_array($wo['status'], pln_finished_statuses(), true)) return ['success' => false, 'error' => 'งานจบแล้ว ไม่สามารถมอบหมายได้'];
    if ((int)$wo['assigned_to'] === $leadId && in_array($wo['status'], ['assigned', 'accepted'], true)) {
        return ['success' => false, 'error' => 'งานนี้ถูกมอบหมายให้ผู้รับผิดชอบคนนี้แล้ว'];
    }
    $start = $start ?: (string)$wo['planned_start_at'];
    $end = $end ?: (string)$wo['planned_end_at'];
    $conflicts = $start !== '' && $end !== '' ? pln_detect_conflicts($pdo, $start, $end, $teamIds, $id, (int)$wo['asset_id']) : [];
    if ($conflicts && !$force) {
        return ['success' => false, 'error' => 'ขัดกับงานที่วางแผนไว้ในช่วงเวลาเดียวกัน', 'conflicts' => $conflicts];
    }
    $sla = !empty($wo['sla_due_at']) ? $wo['sla_due_at'] : ($end ?: null);
    $before = ['planned_start_at' => $wo['planned_start_at'], 'planned_end_at' => $wo['planned_end_at'], 'assigned_to' => $wo['assigned_to'], 'priority' => $wo['priority']];
    $set = setWorkAssignees($pdo, 'repair', $id, $teamIds, $leadId, pln_uid());
    $pdo->prepare('UPDATE repair SET assigned_to = ?, status = "assigned", status_changed_at = NOW(),
                    planned_start_at = ?, planned_end_at = ?, planner_id = ?, sla_due_at = COALESCE(sla_due_at, ?)
                    WHERE id = ?')
        ->execute([$leadId, $start, $end, pln_uid(), $sla, $id]);
    $after = ['planned_start_at' => $start, 'planned_end_at' => $end, 'assigned_to' => $leadId, 'priority' => $wo['priority']];
    pln_log_schedule($pdo, $id, 'assign', $before, $after, $note);

    foreach ($set['added'] as $u) {
        pln_notify_user($pdo, (int)$u, 'คุณได้รับมอบหมายงาน ' . $wo['work_order_no'], $wo['title'], publicBaseUrl() . '/repair/view?id=' . $id);
        pln_center($pdo, 'repair', 'assigned', 'work_order', [
            'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
            'asset_code' => (string)($wo['asset_code'] ?? ''), 'asset_name' => (string)($wo['asset_name'] ?? ''),
            'priority' => (string)($wo['priority'] ?? 'normal'), 'assigner_name' => pln_name($pdo, pln_uid()),
        ], [(int)$u], [], '/repair/view?id=' . $id, $id);
    }
    return ['success' => true, 'added' => $set['added'], 'conflicts' => $conflicts, 'wo' => $wo];
}

function apiSchedule(PDO $pdo): void {
    $d = pln_input();
    $id = (int)($d['id'] ?? 0);
    $res = apiDoSchedule($pdo, $id, (string)($d['planned_start_at'] ?? ''), (string)($d['planned_end_at'] ?? ''), trim((string)($d['reason'] ?? '')), !empty($d['force']));
    if (empty($res['success'])) { http_response_code(409); echo json_encode(['success' => false, 'error' => $res['error'], 'conflicts' => $res['conflicts'] ?? []], JSON_UNESCAPED_UNICODE); exit; }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}

function apiReschedule(PDO $pdo): void {
    $d = pln_input();
    $id = (int)($d['id'] ?? 0);
    $res = apiDoReschedule($pdo, $id, (string)($d['planned_start_at'] ?? ''), (string)($d['planned_end_at'] ?? ''), (string)($d['reason'] ?? ''), !empty($d['force']));
    if (empty($res['success'])) { http_response_code(409); echo json_encode(['success' => false, 'error' => $res['error'], 'conflicts' => $res['conflicts'] ?? []], JSON_UNESCAPED_UNICODE); exit; }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}

function apiPriority(PDO $pdo): void {
    $d = pln_input();
    $id = (int)($d['id'] ?? 0);
    $priority = strtolower(trim((string)($d['priority'] ?? '')));
    if ($priority === 'normal') $priority = 'medium'; // repair.priority enum ไม่มี 'normal'
    $reason = trim((string)($d['reason'] ?? ''));
    if (!in_array($priority, ['low', 'normal', 'medium', 'high', 'critical'], true)) {
        http_response_code(422); echo json_encode(['error' => 'ระดับความเร่งด่วนไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE); exit;
    }
    $wo = pln_fetch_wo($pdo, $id);
    if (in_array($wo['status'], pln_finished_statuses(), true)) {
        http_response_code(409); echo json_encode(['error' => 'งานจบแล้ว ไม่สามารถเปลี่ยนระดับความเร่งด่วนได้'], JSON_UNESCAPED_UNICODE); exit;
    }
    if ($wo['priority'] === $priority) {
        echo json_encode(['success' => true, 'unchanged' => true], JSON_UNESCAPED_UNICODE); exit;
    }
    $before = ['planned_start_at' => $wo['planned_start_at'], 'planned_end_at' => $wo['planned_end_at'], 'assigned_to' => $wo['assigned_to'], 'priority' => $wo['priority']];
    $pdo->prepare('UPDATE repair SET priority = ?, planner_id = ? WHERE id = ?')->execute([$priority, pln_uid(), $id]);
    $after = ['planned_start_at' => $wo['planned_start_at'], 'planned_end_at' => $wo['planned_end_at'], 'assigned_to' => $wo['assigned_to'], 'priority' => $priority];
    pln_log_schedule($pdo, $id, 'priority', $before, $after, $reason ?: 'ปรับระดับความเร่งด่วน');
    $users = array_values(array_unique(array_merge([(int)$wo['assigned_to']], array_column(getWorkAssignees($pdo, 'repair', $id), 'user_id'))));
    pln_center($pdo, 'repair', 'planned', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)($wo['asset_code'] ?? ''), 'asset_name' => (string)($wo['asset_name'] ?? ''),
        'priority' => $priority,
    ], $users, [1, 2, 6], '/repair/view?id=' . $id, $id);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}

function apiAssign(PDO $pdo): void {
    $d = pln_input();
    $id = (int)($d['id'] ?? 0);
    $lead = (int)($d['lead_id'] ?? $d['assigned_to'] ?? 0);
    $res = apiDoAssign($pdo, $id, $lead, (array)($d['team_ids'] ?? []), (string)($d['planned_start_at'] ?? '') ?: null, (string)($d['planned_end_at'] ?? '') ?: null, trim((string)($d['note'] ?? '')), !empty($d['force']));
    if (empty($res['success'])) { http_response_code(409); echo json_encode(['success' => false, 'error' => $res['error'], 'conflicts' => $res['conflicts'] ?? []], JSON_UNESCAPED_UNICODE); exit; }
    echo json_encode(['success' => true, 'conflicts' => $res['conflicts'] ?? []], JSON_UNESCAPED_UNICODE);
}

/** ประกาศงานฉุกเฉิน — priority=critical + สล็อตทันที + แจ้งหัวหน้างานทุกระดับ + audit */
function apiEmergency(PDO $pdo): void {
    $d = pln_input();
    $id = (int)($d['id'] ?? 0);
    $reason = trim((string)($d['reason'] ?? ''));
    if ($reason === '') { http_response_code(422); echo json_encode(['error' => 'ต้องระบุเหตุผลงานฉุกเฉิน'], JSON_UNESCAPED_UNICODE); exit; }
    $wo = pln_fetch_wo($pdo, $id);
    if (in_array($wo['status'], pln_finished_statuses(), true)) {
        http_response_code(409); echo json_encode(['error' => 'งานจบแล้ว'], JSON_UNESCAPED_UNICODE); exit;
    }
    $start = date('Y-m-d H:i:00', time() + 600); // เริ่มภายใน 10 นาที
    $dur = (int)($wo['estimated_duration_minutes'] ?? 0) ?: 120;
    $end = date('Y-m-d H:i:00', strtotime($start) + $dur * 60);
    $before = ['planned_start_at' => $wo['planned_start_at'], 'planned_end_at' => $wo['planned_end_at'], 'assigned_to' => $wo['assigned_to'], 'priority' => $wo['priority']];
    $pdo->prepare('UPDATE repair SET work_order_type = "emergency", priority = "critical", planned_start_at = ?, planned_end_at = ?,
                    status = CASE WHEN status IN ("draft","pending_approval","approved","open","acknowledged") THEN "assigned" ELSE status END,
                    status_changed_at = NOW(), planner_id = ?, sla_due_at = COALESCE(sla_due_at, ?) WHERE id = ?')
        ->execute([$start, $end, pln_uid(), date('Y-m-d H:i:00', strtotime($start) + 8 * 3600), $id]);
    $after = ['planned_start_at' => $start, 'planned_end_at' => $end, 'assigned_to' => $wo['assigned_to'], 'priority' => 'critical'];
    pln_log_schedule($pdo, $id, 'emergency', $before, $after, $reason);
    $affected = pln_detect_conflicts($pdo, $start, $end, array_merge([(int)$wo['assigned_to']], array_column(getWorkAssignees($pdo, 'repair', $id), 'user_id')), $id, (int)$wo['asset_id']);
    pln_center($pdo, 'repair', 'emergency', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)($wo['asset_code'] ?? ''), 'asset_name' => (string)($wo['asset_name'] ?? ''),
        'reason' => $reason,
    ], [], [1, 2, 6], '/planning', $id);
    echo json_encode(['success' => true, 'planned_start_at' => $start, 'planned_end_at' => $end, 'affected' => array_slice($affected, 0, 20)], JSON_UNESCAPED_UNICODE);
}

/** บันทึก/แก้ไขทักษะช่าง (upsert — master data จัดการผ่านนี้แล้ว) */
function apiSkill(PDO $pdo): void {
    $d = pln_input();
    $userId = (int)($d['user_id'] ?? 0);
    $skillName = trim((string)($d['skill_name'] ?? ''));
    $level = min(5, max(1, (int)($d['skill_level'] ?? 1)));
    if (!$userId || $skillName === '') { http_response_code(400); echo json_encode(['error' => 'ต้องระบุช่างและชื่อทักษะ'], JSON_UNESCAPED_UNICODE); exit; }
    $cert = trim((string)($d['certification'] ?? '')) ?: null;
    $validUntil = trim((string)($d['valid_until'] ?? '')) ?: null;
    $area = trim((string)($d['area'] ?? '')) ?: null;
    $notes = trim((string)($d['notes'] ?? '')) ?: null;
    if ($validUntil !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $validUntil)) $validUntil = null;
    $st = $pdo->prepare('INSERT INTO technician_skills (user_id, skill_name, skill_level, certification, valid_until, area, notes, created_by)
                         VALUES (?,?,?,?,?,?,?,?)
                         ON DUPLICATE KEY UPDATE skill_level = VALUES(skill_level), certification = VALUES(certification),
                           valid_until = VALUES(valid_until), area = VALUES(area), notes = VALUES(notes)');
    $st->execute([$userId, $skillName, $level, $cert, $validUntil, $area, $notes, pln_uid()]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}

/* ─────────────────────────── POST: bulk ─────────────────────────── */

function apiBulk(PDO $pdo): void {
    $d = pln_input();
    $action = (string)($d['operation'] ?? 'schedule'); // bulk operation: schedule | assign
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)($d['ids'] ?? [])), fn($x) => $x > 0)));
    if (!in_array($action, ['schedule', 'assign'], true) || !$ids || count($ids) > 100) {
        http_response_code(400); echo json_encode(['error' => 'ข้อมูล bulk ไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE); exit;
    }
    $dryRun = !empty($d['dry_run']);
    $start = (string)($d['planned_start_at'] ?? '');
    $end = (string)($d['planned_end_at'] ?? '');
    $lead = (int)($d['lead_id'] ?? 0);
    $teamIds = array_values(array_unique(array_filter(array_map('intval', (array)($d['team_ids'] ?? [])), fn($u) => $u > 0)));
    $note = trim((string)($d['note'] ?? ''));
    $force = !empty($d['force']);

    if ($end !== '' && $start !== '' && $end <= $start) {
        http_response_code(422); echo json_encode(['error' => 'ช่วงเวลาไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE); exit;
    }
    if ($action === 'assign' && $lead <= 0) {
        http_response_code(422); echo json_encode(['error' => 'ต้องระบุผู้รับผิดชอบหลัก (lead)'], JSON_UNESCAPED_UNICODE); exit;
    }

    $results = [];
    foreach ($ids as $rid) {
        if ($action === 'schedule') {
            if ($dryRun) {
                $wo = pln_fetch_wo($pdo, $rid);
                $cfg = pln_config($pdo);
                $prep = pln_prepare($pdo, $wo, $cfg, pln_get_skills($pdo));
                $team = array_merge([(int)$wo['assigned_to']], array_map('intval', array_column(getWorkAssignees($pdo, 'repair', $rid), 'user_id')));
                $conflicts = $start !== '' && $end !== '' ? pln_detect_conflicts($pdo, $start, $end, array_values(array_unique($team)), $rid, (int)$wo['asset_id']) : [];
                $results[] = [
                    'id' => $rid, 'preview' => true, 'code' => $wo['work_order_no'], 'title' => (string)$wo['title'],
                    'group' => $prep['group'], 'duration_estimate' => $prep['duration_estimate'],
                    'conflicts' => $conflicts, 'readiness' => $prep['readiness'],
                ];
            } else {
                $res = apiDoSchedule($pdo, $rid, $start, $end, $note ?: null, $force);
                if (empty($res['success'])) $results[] = ['id' => $rid, 'success' => false, 'error' => $res['error']];
                else $results[] = ['id' => $rid, 'success' => true, 'code' => $res['wo']['work_order_no'] ?? '', 'conflicts' => $res['conflicts'] ?? []];
            }
        } else { // assign
            $itemStart = $start ?: null;
            $itemEnd = $end ?: null;
            if ($dryRun) {
                $wo = pln_fetch_wo($pdo, $rid);
                $cfg = pln_config($pdo);
                $prep = pln_prepare($pdo, $wo, $cfg, pln_get_skills($pdo));
                $s = $itemStart ?: (string)$wo['planned_start_at'];
                $e = $itemEnd ?: (string)$wo['planned_end_at'];
                $conflicts = $s !== '' && $e !== '' ? pln_detect_conflicts($pdo, $s, $e, $teamIds, $rid, (int)$wo['asset_id']) : [];
                $results[] = [
                    'id' => $rid, 'preview' => true, 'code' => $wo['work_order_no'], 'title' => (string)$wo['title'],
                    'group' => $prep['group'], 'skill_match' => $prep['skill_match'],
                    'conflicts' => $conflicts, 'readiness' => $prep['readiness'],
                ];
            } else {
                $res = apiDoAssign($pdo, $rid, $lead, $teamIds, $itemStart, $itemEnd, $note ?: null, $force);
                if (empty($res['success'])) $results[] = ['id' => $rid, 'success' => false, 'error' => $res['error']];
                else $results[] = ['id' => $rid, 'success' => true, 'code' => $res['wo']['work_order_no'] ?? '', 'conflicts' => $res['conflicts'] ?? []];
            }
        }
    }
    echo json_encode([
        'success' => true, 'dry_run' => $dryRun,
        'preview' => $dryRun ? ['conflicts_total' => count(array_filter($results, fn($r) => !empty($r['conflicts'])))] : null,
        'results' => $results,
    ], JSON_UNESCAPED_UNICODE);
}

/* ─────────────────────────── dispatcher ─────────────────────────── */

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    requireLogin($pdo);
    if ($method !== 'GET') enforceCsrf();

    $action = (string)($_GET['action'] ?? '');
    if ($method !== 'GET' && $action === '') $action = (string)(pln_input()['action'] ?? '');

    switch ($method) {
        case 'GET':
            switch ($action) {
                case 'center':          apiGetCenter($pdo); break;
                case 'queue':           apiGetQueue($pdo); break;
                case 'calendar':        apiGetCalendar($pdo); break;
                case 'technicians':     apiGetTechnicians($pdo); break;
                case 'conflicts':       apiGetConflicts($pdo); break;
                case 'readiness':       apiGetReadiness($pdo); break;
                case 'duration_history': apiGetDurationHistory($pdo); break;
                case 'schedule_log':    apiGetScheduleLog($pdo); break;
                case 'kpis':            apiGetKpis($pdo); break;
                case 'my_plan':         apiGetMyPlan($pdo); break;
                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'PUT':
            requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
            // idempotency (กัน re-sync ซ้ำ) — ใช้สำหรับทุก mutate ที่มี ref ได้
            $did = pln_input();
            $idemKey = clientActionKeyFromRequest($did);
            if ($idemKey !== '') {
                $idem = clientActionBegin($pdo, $idemKey, 'PUT', '/api/v1/planning.php?' . $action);
                if ($idem['status'] === 'replay') {
                    $id = (int)($did['id'] ?? 0);
                    if ($id > 0) echo json_encode(['success' => true, 'replay' => true, 'ref_id' => $id], JSON_UNESCAPED_UNICODE);
                    else echo json_encode(['success' => true, 'replay' => true], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                if ($idem['status'] === 'duplicate_processing') {
                    http_response_code(409);
                    echo json_encode(['error' => 'คำขอนี้กำลังประมวลผลอยู่ กรุณาลองใหม่'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
            switch ($action) {
                case 'schedule':    apiSchedule($pdo); break;
                case 'reschedule':  apiReschedule($pdo); break;
                case 'priority':    apiPriority($pdo); break;
                case 'assign':      apiAssign($pdo); break;
                case 'emergency':   apiEmergency($pdo); break;
                case 'skill':       apiSkill($pdo); break;
                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            if ($idemKey !== '') clientActionFinish($pdo, $idemKey, 'success', 'repair', (int)($did['id'] ?? 0));
            break;

        case 'POST':
            requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน');
            $body = pln_input();
            $idemKey = clientActionKeyFromRequest($body);
            if ($idemKey !== '') {
                $idem = clientActionBegin($pdo, $idemKey, 'POST', '/api/v1/planning.php?bulk');
                if ($idem['status'] === 'replay') { echo json_encode(['success' => true, 'replay' => true], JSON_UNESCAPED_UNICODE); exit; }
                if ($idem['status'] === 'duplicate_processing') { http_response_code(409); echo json_encode(['error' => 'คำขอนี้กำลังประมวลผลอยู่'], JSON_UNESCAPED_UNICODE); exit; }
            }
            if ($action === 'bulk') apiBulk($pdo);
            else { http_response_code(400); echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE); exit; }
            if ($idemKey !== '') clientActionFinish($pdo, $idemKey, 'success', 'bulk', 0);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    api_safe_catch($e);
}
exit;