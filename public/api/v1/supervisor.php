<?php
/**
 * supervisor.php — Phase 14 Supervisor + Planner Workflow API
 *
 * รวมงานของหัวหน้างาน/นักวางแผน/ผู้ตรวจรับงาน:
 *   - Work queue (คิวงาน) + KPI สำหรับหน้า /supervisor/*
 *   - Review maintenance_requests -> Approve (สร้าง WO) / Reject พร้อมเหตุผล
 *   - วางแผนงาน (type/priority/เวลา/ทักษะ/เครื่องมือ/ความปลอดภัย/คำแนะนำ/SLA)
 *   - มอบหมายงาน (lead + ทีม) พร้อมเช็ค workload / conflict
 *   - Pause/Resume (เหตุผลบังคับ) + Complete + Verify/Close/Reopen
 *   - Schedule view (day/week/month) + เทคนิเชียน workload
 *
 * Permission (สอดคล้อง src/helpers/roles.php):
 *   canReviewRequest = roles 1,2,6   — อนุมัติ/ไม่อนุมัติคำขอ
 *   canPlanWork      = roles 1,2,6,7 — วางแผน + มอบหมาย + จัดตาราง
 *   canVerifyWork    = roles 1,2,6,7 — ตรวจรับงาน / ปิด / เปิดงานใหม่
 *   isTechnician     = role 3        — รับงาน/เริ่ม/pause/resume/เสร็จ (ต้องเป็นผู้รับงาน)
 *
 * HTTP: GET  = อ่าน / POST = create_request / PUT = actions (CSRF บังคับ)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/work_order.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
require_once __DIR__ . '/../../../src/services/NotificationCenterService.php';
require_once __DIR__ . '/../../../src/helpers/assignees.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];

    requireLogin($pdo);
    if ($method !== 'GET') enforceCsrf();

    $action = (string)($_GET['action'] ?? '');
    if ($method !== 'GET' && $action === '') {
        $action = (string)(p14_input()['action'] ?? '');
    }

    switch ($method) {
        case 'GET':
            switch ($action) {
                case 'kpis':        apiGetKpis($pdo); break;
                case 'queue':       apiGetQueue($pdo); break;
                case 'requests':    apiGetRequests($pdo); break;
                case 'workorders':  apiGetWorkOrders($pdo); break;
                case 'schedule':    apiGetSchedule($pdo); break;
                case 'technicians': apiGetTechnicians($pdo); break;
                case 'pause_log':   apiGetPauseLog($pdo); break;
                case 'request_log': apiGetRequestLog($pdo); break;
                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'POST':
            enforceCsrf();
            if ($action === 'create_request') {
                apiCreateRequest($pdo);
                break;
            }
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            break;

        case 'PUT':
            switch ($action) {
                case 'approve_request': requireRole(canReviewRequest(), 'เฉพาะผู้จัดการ/หัวหน้างานที่อนุมัติคำขอได้'); apiApproveRequest($pdo); break;
                case 'reject_request':  requireRole(canReviewRequest(), 'เฉพาะผู้จัดการ/หัวหน้างานที่อนุมัติคำขอได้'); apiRejectRequest($pdo); break;
                case 'cancel_request':  requireRole(canSupervisor(), 'ไม่มีสิทธิ์ยกเลิกคำขอ'); apiCancelRequest($pdo); break;
                case 'save_plan':       requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน'); apiSavePlan($pdo); break;
                case 'assign':          requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน'); apiAssignWork($pdo, false); break;
                case 'bulk_assign':     requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน'); apiAssignWork($pdo, true); break;
                case 'reschedule':      requireRole(canPlanWork(), 'เฉพาะผู้วางแผน/หัวหน้างาน'); apiRescheduleWork($pdo); break;
                case 'pause':           apiPauseWork($pdo); break;
                case 'resume':          apiResumeWork($pdo); break;
                case 'complete':        apiCompleteWork($pdo); break;
                case 'verify':          requireRole(canVerifyWork(), 'เฉพาะหัวหน้างานที่ตรวจรับงานได้'); apiVerifyWork($pdo); break;
                case 'close':           requireRole(canVerifyWork(), 'เฉพาะหัวหน้างานที่ปิดใบงานได้'); apiCloseWork($pdo); break;
                case 'reopen':          requireRole(canVerifyWork(), 'เฉพาะหัวหน้างานที่เปิดงานใหม่ได้'); apiReopenWork($pdo); break;
                default:
                    http_response_code(400);
                    echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
exit;

/* ─────────────────────────── helpers ─────────────────────────── */

function p14_uid(): int {
    return (int)($_SESSION['user_id'] ?? 0);
}

function p14_input(): array {
    $d = json_decode(file_get_contents('php://input'), true);
    return is_array($d) ? $d : [];
}

function p14_name(PDO $pdo, int $uid): string {
    if (!$uid) return '-';
    $st = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $st->execute([$uid]);
    return (string)($st->fetchColumn() ?: '-');
}

function p14_active_statuses(): array {
    return ['open', 'acknowledged', 'draft', 'pending_approval', 'approved', 'assigned', 'accepted',
        'in_progress', 'paused', 'waiting_parts', 'pending_parts', 'waiting_external', 'waiting_approval',
        'completed', 'pending_verification', 'resolved'];
}

function p14_done_statuses(): array {
    return ['closed', 'cancelled', 'rejected', 'verified', 'done', 'skipped'];
}

function p14_is_overdue(array $r): bool {
    return kpi_is_overdue($r);
}

function p14_overdue_days(array $r): int {
    return kpi_overdue_days($r);
}

function p14_log_repair(PDO $pdo, int $id, string $action, string $desc, $oldValue, $newValue, ?int $uid = null): void {
    try {
        $st = $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description, old_value, new_value, created_at)
                             VALUES (?,?,?,?,?,?,NOW())');
        $st->execute([$id, $uid ?? p14_uid(), $action, $desc, $oldValue, $newValue]);
    } catch (Exception $e) {
        error_log('[supervisor.php] repair_activity_log: ' . $e->getMessage());
    }
}

function p14_log_mr(PDO $pdo, int $reqId, string $action, string $desc, $oldValue, $newValue): void {
    try {
        $st = $pdo->prepare('INSERT INTO maintenance_request_activity (request_id, user_id, action, description, old_value, new_value, created_at)
                             VALUES (?,?,?,?,?,?,NOW())');
        $st->execute([$reqId, p14_uid(), $action, $desc, $oldValue, $newValue]);
    } catch (Exception $e) {
        error_log('[supervisor.php] maintenance_request_activity: ' . $e->getMessage());
    }
}

function p14_set_status(PDO $pdo, int $id, string $newStatus, array $extra = []): void {
    $fields = ['status = ?', 'status_changed_at = NOW()'];
    $values = [$newStatus];
    foreach ($extra as $col => $val) {
        if ($val === null) {
            $fields[] = "$col = NULL";
        } else {
            $fields[] = "$col = ?";
            $values[] = $val;
        }
    }
    $values[] = $id;
    $pdo->prepare('UPDATE repair SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
}

function p14_fetch_wo(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT r.*, a.code AS asset_code, a.name AS asset_name,
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

function p14_tech_ok(PDO $pdo, int $id): bool {
    if (canSupervisor()) return true;
    return isTechnician() && isWorkAssignee($pdo, 'repair', $id);
}

function p14_conflicts(PDO $pdo, array $userIds, ?string $start, ?string $end, int $excludeRepairId): array {
    if (!$start || !$end || $start >= $end) return [];
    $out = [];
    foreach (array_values(array_unique(array_filter($userIds, fn($u) => (int)$u > 0))) as $uid) {
        $st = $pdo->prepare(
            'SELECT r.work_order_no, r.title, r.planned_start_at, r.planned_end_at
             FROM repair r
             WHERE r.id != ? AND r.status NOT IN ("closed","cancelled","rejected","verified","done","skipped")
               AND r.planned_start_at IS NOT NULL AND r.planned_end_at IS NOT NULL
               AND r.planned_start_at < ? AND r.planned_end_at > ?
               AND (r.assigned_to = ? OR EXISTS (
                     SELECT 1 FROM work_assignees wa WHERE wa.ref_type="repair" AND wa.ref_id=r.id AND wa.user_id=?
                   ))
             LIMIT 20');
        $st->execute([$excludeRepairId, $end, $start, (int)$uid, (int)$uid]);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[] = ['user_id' => (int)$uid, 'user_name' => p14_name($pdo, (int)$uid), 'wo' => $row['work_order_no'], 'title' => $row['title']];
        }
    }
    return $out;
}

function p14_notify_user(PDO $pdo, int $uid, string $title, string $message, string $url): void {
    if (!$uid) return;
    try {
        sendNotificationToUser($uid, $title, $message, $url);
    } catch (Exception $e) {
        error_log('[supervisor.php] notify: ' . $e->getMessage());
    }
}

/** ลง Notification Center (inbox) — channels=['app'] เสมอ (external channel ยังใช้ workflow เดิม) */
function p14_center(PDO $pdo, string $module, string $event, string $type, array $vars = [], array $users = [], array $roles = [1, 2, 6], ?string $url = null, int $refId = 0, string $refType = ''): void {
    try {
        $reasonLabels = ['waiting_parts' => 'รออะไหล่', 'waiting_spare' => 'รออะไหล่', 'production_stop' => 'หยุดผลิต', 'contractor' => 'รอผู้รับเหมา', 'waiting_approval' => 'รอการอนุมัติ', 'other' => 'อื่น ๆ'];
        if (!empty($vars['reason'])) $vars['reason'] = $reasonLabels[$vars['reason']] ?? $vars['reason'];
        NotificationCenterService::notify($pdo, [
            'module' => $module, 'event' => $event, 'type' => $type,
            'ref_type' => $refType, 'ref_id' => $refId,
            'template' => $module . ':' . $event,
            'vars' => $vars,
            'users' => $users,
            'roles' => $roles,
            'exclude_users' => [p14_uid()],
            'channels' => ['app'],
            'dedup_hours' => 1,
            'url' => (string)($url ?? ''),
        ]);
    } catch (Exception $e) {
        error_log('[supervisor.php] center notify: ' . $e->getMessage());
    }
}

function p14_require_mr_open(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT mr.*, u.full_name AS requested_name, a.code AS asset_code, a.name AS asset_name
                         FROM maintenance_requests mr
                         LEFT JOIN users u ON u.id = mr.requested_by
                         LEFT JOIN asset_registry a ON a.id = mr.asset_id
                         WHERE mr.id = ?');
    $st->execute([$id]);
    $mr = $st->fetch(PDO::FETCH_ASSOC);
    if (!$mr) {
        http_response_code(404);
        echo json_encode(['error' => 'ไม่พบคำขอ'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (in_array($mr['status'], ['approved', 'rejected', 'cancelled'], true)) {
        http_response_code(409);
        echo json_encode(['error' => 'คำขอนี้ถูกจัดการไปแล้ว (สถานะ: ' . $mr['status'] . ')'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    return $mr;
}

function p14_sync_mr_status(PDO $pdo, int $woId, string $status): void {
    $pdo->prepare('UPDATE maintenance_requests SET status = ?, updated_at = NOW()
                   WHERE work_order_id = ? AND status NOT IN ("rejected","cancelled","closed")')
        ->execute([$status, $woId]);
}/* ─────────────────────────── GET ─────────────────────────── */

function apiGetKpis(PDO $pdo): void {
    // KPI ทั้งหมดคำนวณจากสูตรกลางใน src/helpers/kpi.php (ห้าม replicate)
    $opts = [
        'role_id' => currentRoleId(),
        'user_id' => (int)($_SESSION['user_id'] ?? 0),
        'range' => (string)($_GET['range'] ?? ''),
        'range_start' => (string)($_GET['range_start'] ?? ''),
        'range_end' => (string)($_GET['range_end'] ?? ''),
        'department_id' => '',
        'location_id' => '',
        'asset_id' => '',
        'asset_category' => '',
        'technician_id' => '',
        'source_type' => '',
        'priority' => '',
        'status' => '',
    ];
    $core = kpi_core_metrics($pdo, $opts);

    echo json_encode([
        'counts' => $core['counts'],
        'mttr_hours' => $core['mttr_hours'],
        'mtbf_hours' => $core['mtbf_hours'],
        'avg_response_minutes' => $core['avg_response_minutes'],
        'sla_compliance_pct' => $core['sla_compliance_pct'],
        'pm_compliance_pct' => $core['pm_compliance_pct'],
        'top_overdue' => kpi_top_overdue($pdo, $opts, 5),
        'can' => [
            'review' => canReviewRequest(),
            'plan' => canPlanWork(),
            'verify' => canVerifyWork(),
            'tech' => isTechnician(),
            'role_id' => currentRoleId(),
        ],
    ], JSON_UNESCAPED_UNICODE);
}

function apiGetQueue(PDO $pdo): void {
    $g = (string)($_GET['group'] ?? 'all');
    $search = trim((string)($_GET['search'] ?? ''));
    $priority = trim((string)($_GET['priority'] ?? ''));
    $assetId = (int)($_GET['asset_id'] ?? 0);
    $assigneeId = (int)($_GET['assignee_id'] ?? 0);
    $sort = (string)($_GET['sort'] ?? 'priority');
    $dir = (($_GET['order'] ?? 'desc') === 'asc') ? 'ASC' : 'DESC';
    $limit = min(300, max(1, (int)($_GET['limit'] ?? 100)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));

    $items = [];

    $wos = $pdo->query('SELECT r.*, a.code AS asset_code, a.name AS asset_name,
                                u.full_name AS assigned_name
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.status NOT IN ("cancelled","rejected","draft","done","skipped")
                         ORDER BY r.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($wos as $r) {
        $team = getWorkAssignees($pdo, 'repair', (int)$r['id']);
        $items[] = [
            'kind' => 'workorder',
            'ref_id' => (int)$r['id'],
            'code' => (string)$r['work_order_no'],
            'title' => (string)$r['title'],
            'asset_id' => (int)($r['asset_id'] ?? 0),
            'asset_code' => (string)($r['asset_code'] ?? ''),
            'asset_name' => (string)($r['asset_name'] ?? ''),
            'priority' => (string)$r['priority'],
            'status' => (string)$r['status'],
            'severity' => (string)$r['priority'],
            'assignee_id' => (int)($r['assigned_to'] ?? 0),
            'assignee_name' => (string)($r['assigned_name'] ?? ''),
            'team' => $team,
            'planned_start_at' => $r['planned_start_at'],
            'planned_end_at' => $r['planned_end_at'],
            'sla_due_at' => $r['sla_due_at'],
            'estimated_completion_date' => $r['estimated_completion_date'],
            'created_at' => (string)$r['created_at'],
            'source' => (string)($r['source_type'] ?? 'breakdown'),
            'request_code' => '',
            'overdue' => p14_is_overdue($r),
            'overdue_days' => p14_overdue_days($r),
        ];
    }

    $mrs = $pdo->query('SELECT mr.*, a.code AS asset_code, a.name AS asset_name, u.full_name AS requested_name
                        FROM maintenance_requests mr
                        LEFT JOIN asset_registry a ON a.id = mr.asset_id
                        LEFT JOIN users u ON u.id = mr.requested_by
                        WHERE mr.status NOT IN ("cancelled")
                        ORDER BY mr.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($mrs as $m) {
        $woNo = '';
        if (!empty($m['work_order_id'])) {
            $q = $pdo->prepare('SELECT work_order_no FROM repair WHERE id = ?');
            $q->execute([(int)$m['work_order_id']]);
            $woNo = (string)$q->fetchColumn();
        }
        $items[] = [
            'kind' => 'request',
            'ref_id' => (int)$m['id'],
            'code' => (string)$m['request_code'],
            'title' => (string)$m['title'],
            'asset_id' => (int)($m['asset_id'] ?? 0),
            'asset_code' => (string)($m['asset_code'] ?? ''),
            'asset_name' => (string)($m['asset_name'] ?? ''),
            'priority' => (string)$m['priority'],
            'status' => (string)$m['status'],
            'severity' => (string)($m['severity'] ?? 'medium'),
            'assignee_id' => (int)($m['requested_by'] ?? 0),
            'assignee_name' => (string)($m['requested_name'] ?? ''),
            'team' => [],
            'planned_start_at' => null,
            'planned_end_at' => null,
            'sla_due_at' => null,
            'estimated_completion_date' => null,
            'created_at' => (string)$m['created_at'],
            'source' => 'request',
            'request_code' => $woNo,
            'overdue' => p14_is_overdue($m),
            'overdue_days' => p14_overdue_days($m),
        ];
    }

    if ($g !== 'all') {
        $items = array_filter($items, function ($it) use ($g) {
            $s = $it['status'];
            switch ($g) {
                case 'new_requests':     return $it['kind'] === 'request' && $s === 'open';
                case 'pending_review':   return $it['kind'] === 'request' && in_array($s, ['open', 'in_progress', 'waiting_parts', 'waiting_approval'], true);
                case 'pending_approval': return $it['kind'] === 'workorder' && in_array($s, ['pending_approval', 'approved'], true) && !$it['assignee_id'];
                case 'unassigned':       return $it['kind'] === 'workorder' && in_array($s, ['open', 'acknowledged'], true) && !$it['assignee_id'];
                case 'assigned':         return $it['kind'] === 'workorder' && in_array($s, ['assigned', 'accepted'], true);
                case 'active':           return $it['kind'] === 'workorder' && in_array($s, ['in_progress', 'paused'], true);
                case 'waiting':          return $it['kind'] === 'workorder' && in_array($s, ['waiting_parts', 'waiting_external', 'waiting_approval'], true);
                case 'verification':     return $it['kind'] === 'workorder' && in_array($s, ['completed', 'pending_verification', 'resolved'], true);
                case 'verified':         return $it['kind'] === 'workorder' && in_array($s, ['verified', 'closed'], true);
                case 'overdue':          return (bool)$it['overdue'];
                case 'requests_approved': return $it['kind'] === 'request' && in_array($s, ['approved', 'in_progress', 'waiting_parts', 'waiting_approval', 'resolved', 'closed'], true);
                case 'requests_rejected': return $it['kind'] === 'request' && $s === 'rejected';
            }
            return false;
        });
    }

    if ($search !== '') {
        $q = mb_strtolower($search);
        $items = array_values(array_filter($items, function ($it) use ($q) {
            return mb_strpos(mb_strtolower((string)$it['code']), $q) !== false
                || mb_strpos(mb_strtolower((string)$it['title']), $q) !== false
                || mb_strpos(mb_strtolower((string)$it['asset_code']), $q) !== false
                || mb_strpos(mb_strtolower((string)$it['asset_name']), $q) !== false
                || mb_strpos(mb_strtolower((string)$it['assignee_name']), $q) !== false;
        }));
    }
    if ($priority !== '' && $priority !== 'all') {
        $items = array_values(array_filter($items, fn($it) => $it['priority'] === $priority));
    }
    if ($assetId) {
        $items = array_values(array_filter($items, fn($it) => $it['asset_id'] === $assetId));
    }
    if ($assigneeId) {
        $items = array_values(array_filter($items, fn($it) => $it['assignee_id'] === $assigneeId));
    }

    usort($items, function ($a, $b) use ($sort, $dir) {
        $cmp = 0;
        if ($sort === 'created') {
            $cmp = strtotime((string)$a['created_at']) <=> strtotime((string)$b['created_at']);
        } elseif ($sort === 'sla') {
            $ta = strtotime((string)$a['sla_due_at']);
            $tb = strtotime((string)$b['sla_due_at']);
            $ta = $ta ?: PHP_INT_MAX;
            $tb = $tb ?: PHP_INT_MAX;
            $cmp = $ta <=> $tb;
        } else {
            $pr = ['critical' => 0, 'high' => 1, 'normal' => 1, 'medium' => 2, 'low' => 3];
            $pa = $pr[$a['priority']] ?? 4;
            $pb = $pr[$b['priority']] ?? 4;
            $cmp = $pa <=> $pb;
        }
        return $dir === 'ASC' ? $cmp : -$cmp;
    });

    $total = count($items);
    $pageItems = array_slice($items, $offset, $limit);

    $buckets = [
        'all' => $total,
        'new_requests' => 0, 'pending_review' => 0, 'pending_approval' => 0, 'unassigned' => 0,
        'assigned' => 0, 'active' => 0, 'waiting' => 0, 'verification' => 0, 'verified' => 0, 'overdue' => 0,
    ];
    foreach ($items as $it) {
        $s = $it['status'];
        if ($it['kind'] === 'request' && $s === 'open') $buckets['new_requests']++;
        if ($it['kind'] === 'request' && in_array($s, ['open', 'in_progress', 'waiting_parts', 'waiting_approval'], true)) $buckets['pending_review']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['pending_approval', 'approved'], true) && !$it['assignee_id']) $buckets['pending_approval']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['open', 'acknowledged'], true) && !$it['assignee_id']) $buckets['unassigned']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['assigned', 'accepted'], true)) $buckets['assigned']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['in_progress', 'paused'], true)) $buckets['active']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['waiting_parts', 'waiting_external', 'waiting_approval'], true)) $buckets['waiting']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['completed', 'pending_verification', 'resolved'], true)) $buckets['verification']++;
        if ($it['kind'] === 'workorder' && in_array($s, ['verified', 'closed'], true)) $buckets['verified']++;
        if ($it['overdue']) $buckets['overdue']++;
    }

    echo json_encode([
        'items' => array_values($pageItems),
        'total' => $total,
        'offset' => $offset,
        'limit' => $limit,
        'buckets' => $buckets,
        'can' => [
            'review' => canReviewRequest(),
            'plan' => canPlanWork(),
            'verify' => canVerifyWork(),
            'tech' => isTechnician(),
            'role_id' => currentRoleId(),
        ],
    ], JSON_UNESCAPED_UNICODE);
}

function apiGetRequests(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if ($id) {
        $st = $pdo->prepare('SELECT mr.*, u.full_name AS requested_name, a.code AS asset_code, a.name AS asset_name,
                                    (SELECT work_order_no FROM repair WHERE id = mr.work_order_id) AS work_order_no
                             FROM maintenance_requests mr
                             LEFT JOIN users u ON u.id = mr.requested_by
                             LEFT JOIN asset_registry a ON a.id = mr.asset_id
                             WHERE mr.id = ?');
        $st->execute([$id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found'], JSON_UNESCAPED_UNICODE); exit; }
        $log = $pdo->prepare('SELECT r.id, r.action, r.description, r.old_value, r.new_value, r.created_at, u.full_name AS user_name
                              FROM maintenance_request_activity r LEFT JOIN users u ON u.id = r.user_id
                              WHERE r.request_id = ? ORDER BY r.created_at ASC, r.id ASC');
        $log->execute([$id]);
        $row['activity'] = $log->fetchAll();
        echo json_encode($row, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $status = trim((string)($_GET['status'] ?? ''));
    $priority = trim((string)($_GET['priority'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));
    $assetId = (int)($_GET['asset_id'] ?? 0);
    $sql = 'SELECT mr.*, u.full_name AS requested_name, a.code AS asset_code, a.name AS asset_name,
                   (SELECT work_order_no FROM repair WHERE id = mr.work_order_id) AS work_order_no
            FROM maintenance_requests mr
            LEFT JOIN users u ON u.id = mr.requested_by
            LEFT JOIN asset_registry a ON a.id = mr.asset_id
            WHERE 1=1';
    $params = [];
    if ($status !== '' && $status !== 'all') { $sql .= ' AND mr.status = ?'; $params[] = $status; }
    if ($priority !== '' && $priority !== 'all') { $sql .= ' AND mr.priority = ?'; $params[] = $priority; }
    if ($assetId) { $sql .= ' AND mr.asset_id = ?'; $params[] = $assetId; }
    if ($search !== '') {
        $sql .= ' AND (mr.request_code LIKE ? OR mr.title LIKE ? OR a.code LIKE ? OR a.name LIKE ?)';
        $s = "%$search%";
        array_push($params, $s, $s, $s, $s);
    }
    $sql .= ' ORDER BY CASE mr.priority WHEN "critical" THEN 0 WHEN "high" THEN 1 WHEN "normal" THEN 2 ELSE 3 END ASC, mr.created_at DESC';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    echo json_encode(['items' => $st->fetchAll(), 'can' => ['review' => canReviewRequest()]], JSON_UNESCAPED_UNICODE);
}

function apiGetWorkOrders(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if ($id) {
        $row = p14_fetch_wo($pdo, $id);
        $team = getWorkAssignees($pdo, 'repair', $id);
        $row['team'] = $team;
        $row['team_ids'] = array_map('intval', array_column($team, 'user_id'));
        $pause = $pdo->prepare('SELECT p.*, u.full_name AS user_name FROM work_pause_logs p LEFT JOIN users u ON u.id = p.user_id WHERE p.repair_id = ? ORDER BY p.created_at ASC, p.id ASC');
        $pause->execute([$id]);
        $row['pause_log'] = $pause->fetchAll();
        echo json_encode($row, JSON_UNESCAPED_UNICODE);
        exit;
    }

    $status = trim((string)($_GET['status'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));
    $assetId = (int)($_GET['asset_id'] ?? 0);
    $sql = 'SELECT r.*, a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
            FROM repair r
            LEFT JOIN asset_registry a ON a.id = r.asset_id
            LEFT JOIN users u ON u.id = r.assigned_to
            WHERE 1=1';
    $params = [];
    if ($status !== '' && $status !== 'all') { $sql .= ' AND r.status = ?'; $params[] = $status; }
    if ($assetId) { $sql .= ' AND r.asset_id = ?'; $params[] = $assetId; }
    if ($search !== '') {
        $sql .= ' AND (r.work_order_no LIKE ? OR r.title LIKE ? OR a.code LIKE ?)';
        $s = "%$search%";
        array_push($params, $s, $s, $s);
    }
    $sql .= ' ORDER BY r.created_at DESC';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    attachWorkTeams($rows, 'repair');
    echo json_encode(['items' => $rows, 'can' => ['plan' => canPlanWork(), 'verify' => canVerifyWork()]], JSON_UNESCAPED_UNICODE);
}

function apiGetSchedule(PDO $pdo): void {
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

    $st = $pdo->prepare('SELECT r.id, r.work_order_no, r.title, r.priority, r.status, r.asset_id, r.assigned_to,
                                r.planned_start_at, r.planned_end_at, r.estimated_duration_minutes, r.sla_due_at,
                                a.code AS asset_code, u.full_name AS assigned_name
                         FROM repair r
                         LEFT JOIN asset_registry a ON a.id = r.asset_id
                         LEFT JOIN users u ON u.id = r.assigned_to
                         WHERE r.planned_start_at IS NOT NULL
                           AND r.status NOT IN ("closed","cancelled","rejected","verified","done","skipped")
                           AND r.planned_start_at >= ? AND r.planned_start_at < ?
                         ORDER BY r.planned_start_at ASC');
    $st->execute([$fromStr, $toStr]);
    $rows = $st->fetchAll();
    attachWorkTeams($rows, 'repair');
    echo json_encode([
        'view' => $view,
        'from' => $from->format('Y-m-d'),
        'to' => $to->format('Y-m-d'),
        'items' => $rows,
    ], JSON_UNESCAPED_UNICODE);
}

function apiGetTechnicians(PDO $pdo): void {
    $rows = $pdo->query('SELECT u.id, u.full_name, u.role_id, r.name AS role_name
                         FROM users u
                         LEFT JOIN roles r ON r.id = u.role_id
                         WHERE u.is_active = 1 AND u.role_id IN (1,2,3,6,7)
                         ORDER BY (u.role_id = 3) DESC, u.full_name ASC')->fetchAll(PDO::FETCH_ASSOC);
    $active = p14_active_statuses();
    $in = implode(',', array_fill(0, count($active), '?'));
    foreach ($rows as &$t) {
        $uid = (int)$t['id'];
        $own = $pdo->prepare("SELECT COUNT(*) FROM repair WHERE assigned_to = ? AND status IN ($in)");
        $own->execute(array_merge([$uid], $active));
        $teamSt = $pdo->prepare("SELECT COUNT(DISTINCT wa.ref_id) FROM work_assignees wa JOIN repair r ON r.id = wa.ref_id
                                 WHERE wa.ref_type='repair' AND wa.user_id = ? AND r.status IN ($in)");
        $teamSt->execute(array_merge([$uid], $active));
        $todaySt = $pdo->prepare('SELECT COUNT(*) FROM repair WHERE status IN (' . implode(',', array_fill(0, count($active), '?')) . ')
                                  AND planned_start_at >= CURDATE() AND planned_start_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
                                  AND (assigned_to = ? OR EXISTS (SELECT 1 FROM work_assignees wa WHERE wa.ref_type="repair" AND wa.ref_id = repair.id AND wa.user_id = ?))');
        $todaySt->execute(array_merge($active, [$uid, $uid]));
        $sched = $pdo->prepare("SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, planned_start_at, planned_end_at)), 0)
                                FROM repair WHERE status IN ($in)
                                  AND planned_start_at >= CURDATE() AND planned_start_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
                                  AND (assigned_to = ? OR EXISTS (SELECT 1 FROM work_assignees wa WHERE wa.ref_type='repair' AND wa.ref_id = repair.id AND wa.user_id = ?))");
        $sched->execute(array_merge($active, [$uid, $uid]));
        $plannedMin = (int)$sched->fetchColumn();
        $t['open_count'] = (int)$own->fetchColumn() + (int)$teamSt->fetchColumn();
        $t['today_count'] = (int)$todaySt->fetchColumn();
        $t['planned_hours_today'] = round($plannedMin / 60, 1);
        $t['available_hours_today'] = round(max(0, 8 - $plannedMin / 60), 1);
    }
    echo json_encode(['items' => $rows], JSON_UNESCAPED_UNICODE);
}

function apiGetPauseLog(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode([]); exit; }
    $st = $pdo->prepare('SELECT p.*, u.full_name AS user_name FROM work_pause_logs p LEFT JOIN users u ON u.id = p.user_id WHERE p.repair_id = ? ORDER BY p.created_at ASC, p.id ASC');
    $st->execute([$id]);
    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
}

function apiGetRequestLog(PDO $pdo): void {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode([]); exit; }
    $st = $pdo->prepare('SELECT r.*, u.full_name AS user_name FROM maintenance_request_activity r LEFT JOIN users u ON u.id = r.user_id WHERE r.request_id = ? ORDER BY r.created_at ASC, r.id ASC');
    $st->execute([$id]);
    echo json_encode($st->fetchAll(), JSON_UNESCAPED_UNICODE);
}/* ─────────────────────────── POST ─────────────────────────── */

function apiCreateRequest(PDO $pdo): void {
    requireRole(canRequest(), 'ไม่มีสิทธิ์แจ้งงาน');
    $d = p14_input();
    $title = trim((string)($d['title'] ?? ''));
    $assetId = (int)($d['asset_id'] ?? 0);
    if ($title === '' || !$assetId) {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุชื่อเรื่องและเครื่องจักร'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $priority = in_array($d['priority'] ?? '', ['low', 'normal', 'high', 'critical'], true) ? $d['priority'] : 'normal';
    $severity = in_array($d['severity'] ?? '', ['low', 'medium', 'high', 'critical'], true) ? $d['severity'] : 'medium';
    $desc = trim((string)($d['description'] ?? ''));
    $finding = trim((string)($d['finding'] ?? $desc));
    $dept = (int)($d['department_id'] ?? 0) ?: null;
    $loc = (int)($d['location_id'] ?? 0) ?: null;

    $stmt = $pdo->prepare('SELECT CONCAT("RQ-", DATE_FORMAT(NOW(), "%y%m%d"), "-", LPAD(COALESCE(MAX(id),0)+1, 4, "0")) FROM maintenance_requests');
    $stmt->execute();
    $code = $stmt->fetchColumn();

    $ins = $pdo->prepare('INSERT INTO maintenance_requests
        (request_code, asset_id, title, description, priority, status, requested_by, department_id, location_id, finding, severity)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    $ins->execute([$code, $assetId, $title, $desc ?: $finding, $priority, 'open', p14_uid(), $dept, $loc, $finding, $severity]);
    $reqId = (int)$pdo->lastInsertId();
    p14_log_mr($pdo, $reqId, 'created', 'แจ้งงานใหม่เข้าคิว', null, $code);

    $asset = $pdo->prepare('SELECT code, name FROM asset_registry WHERE id = ?');
    $asset->execute([$assetId]);
    $a = $asset->fetch();
    $subject = 'คำขอใหม่ ' . $code . ': ' . mb_substr($title, 0, 120);
    $message = 'เครื่อง: ' . ($a['code'] ?? '-') . ' ' . ($a['name'] ?? '') . "\npriority: $priority\n" . $finding;
    $url = publicBaseUrl() . '/supervisor/review?id=' . $reqId;
    foreach ($pdo->query('SELECT id FROM users WHERE is_active = 1 AND role_id IN (1,2,6)')->fetchAll(PDO::FETCH_COLUMN) as $su) {
        p14_notify_user($pdo, (int)$su, $subject, $message, $url);
    }
    p14_center($pdo, 'maintenance_requests', 'created', 'request', [
        'request_code' => $code, 'title' => $title, 'asset_code' => (string)($a['code'] ?? ''),
        'asset_name' => (string)($a['name'] ?? ''), 'priority' => $priority,
    ], [], [1, 2, 6], '/supervisor/review?id=' . $reqId, $reqId, 'maintenance_requests');

    echo json_encode(['success' => true, 'id' => $reqId, 'code' => $code], JSON_UNESCAPED_UNICODE);
}

/* ─────────────────────────── PUT ─────────────────────────── */

function apiApproveRequest(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $mr = p14_require_mr_open($pdo, $id);

    $note = trim((string)($d['note'] ?? ''));
    $title = trim((string)($d['title'] ?? $mr['title']));
    if ($title === '') { http_response_code(400); echo json_encode(['error' => 'ต้องมีชื่อเรื่อง'], JSON_UNESCAPED_UNICODE); exit; }
    $assetId = (int)($d['asset_id'] ?? $mr['asset_id']);
    if (!$assetId) { http_response_code(400); echo json_encode(['error' => 'ต้องมีเครื่องจักร'], JSON_UNESCAPED_UNICODE); exit; }
    $priority = in_array($d['priority'] ?? '', ['low', 'normal', 'high', 'critical'], true) ? $d['priority'] : ($mr['priority'] ?: 'normal');
    $description = trim((string)($d['description'] ?? $mr['description'] ?? $mr['finding']));

    $upd = $pdo->prepare('UPDATE maintenance_requests SET status = "approved", review_note = ?, reviewed_by = ?, reviewed_at = NOW(),
                           title = ?, priority = ?, asset_id = ?, description = ?, assigned_to = ? WHERE id = ?');
    $upd->execute([$note, p14_uid(), $title, $priority, $assetId, $description, $mr['assigned_to'], $id]);

    $woNo = generateWorkOrderNo($pdo);
    $woDesc = 'สร้างจากคำขอ: ' . $mr['request_code'] . ($note !== '' ? "\nหมายเหตุหัวหน้า: {$note}" : '') . "\n" . $description;
    $ins = $pdo->prepare('INSERT INTO repair (work_order_no, asset_id, assigned_to, created_by, priority, status, title, description, failure_report, source_type, location_id, department_id)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    $ins->execute([
        $woNo, $assetId, $mr['assigned_to'], p14_uid(), $priority, 'pending_approval',
        $title, $woDesc, ($description ?: $mr['finding']), 'breakdown', $mr['location_id'], $mr['department_id'],
    ]);
    $repairId = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE maintenance_requests SET work_order_id = ? WHERE id = ?')->execute([$repairId, $id]);

    p14_log_mr($pdo, $id, 'approve', 'อนุมัติคำขอ → สร้างใบสั่งงาน ' . $woNo, $mr['status'], 'approved');
    p14_log_repair($pdo, $repairId, 'created', 'สร้างจากคำขอ ' . $mr['request_code'], null, 'pending_approval');

    $sub = 'คำขอ ' . $mr['request_code'] . ' อนุมัติแล้ว';
    $msg = 'สร้างใบสั่งงาน: ' . $woNo . "\nเครื่อง: " . $mr['asset_code'] . ($note ? "\nหมายเหตุ: {$note}" : '');
    p14_notify_user($pdo, (int)$mr['requested_by'], $sub, $msg, publicBaseUrl() . '/repair/view?id=' . $repairId);
    p14_center($pdo, 'maintenance_requests', 'approved', 'request', [
        'request_code' => $mr['request_code'], 'asset_code' => (string)($mr['asset_code'] ?? ''),
        'work_order_no' => $woNo, 'repair_id' => $repairId, 'title' => $title,
    ], [(int)$mr['requested_by']], [], '/repair/view?id=' . $repairId, $repairId, 'repair');

    echo json_encode(['success' => true, 'request_id' => $id, 'repair_id' => $repairId, 'work_order_no' => $woNo], JSON_UNESCAPED_UNICODE);
}

function apiRejectRequest(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    $reason = trim((string)($d['reason'] ?? ''));
    if (!$id || $reason === '') {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุเหตุผลที่ไม่อนุมัติ'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $mr = p14_require_mr_open($pdo, $id);
    $pdo->prepare('UPDATE maintenance_requests SET status = "rejected", rejected_reason = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ?')
        ->execute([$reason, p14_uid(), $reason, $id]);
    p14_log_mr($pdo, $id, 'reject', 'ไม่อนุมัติคำขอ', $mr['status'], 'rejected');
    p14_notify_user($pdo, (int)$mr['requested_by'], 'คำขอ ' . $mr['request_code'] . ' ไม่อนุมัติ', $reason, publicBaseUrl() . '/supervisor/review?id=' . $id);
    p14_center($pdo, 'maintenance_requests', 'rejected', 'request', [
        'request_code' => $mr['request_code'], 'asset_code' => (string)($mr['asset_code'] ?? ''),
        'title' => (string)($mr['title'] ?? ''), 'reason' => $reason,
    ], [(int)$mr['requested_by']], [], '/supervisor/review?id=' . $id, $id, 'maintenance_requests');
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}

function apiCancelRequest(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $st = $pdo->prepare('SELECT status, request_code FROM maintenance_requests WHERE id = ?');
    $st->execute([$id]);
    $mr = $st->fetch();
    if (!$mr) { http_response_code(404); echo json_encode(['error' => 'Not found'], JSON_UNESCAPED_UNICODE); exit; }
    if (in_array($mr['status'], ['approved', 'rejected', 'cancelled'], true)) {
        http_response_code(409);
        echo json_encode(['error' => 'จัดการคำขอนี้ไปแล้ว'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $pdo->prepare('UPDATE maintenance_requests SET status = "cancelled", review_note = ? WHERE id = ?')->execute([trim((string)($d['note'] ?? '')), $id]);
    p14_log_mr($pdo, $id, 'cancel', 'ยกเลิกคำขอ', $mr['status'], 'cancelled');
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
}

function apiSavePlan(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $wo = p14_fetch_wo($pdo, $id);

    $start = trim((string)($d['planned_start_at'] ?? ''));
    $end = trim((string)($d['planned_end_at'] ?? ''));
    if ($start !== '' && $end !== '' && $end <= $start) {
        http_response_code(422);
        echo json_encode(['error' => 'ช่วงเวลาวางแผนไม่ถูกต้อง (สิ้นสุดต้องอยู่หลังเริ่ม)'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $fields = [];
    $values = [];
    $map = [
        'work_order_type' => null, 'planned_start_at' => null, 'planned_end_at' => null,
        'estimated_duration_minutes' => 'int', 'required_skill' => null, 'required_tools' => null,
        'safety_requirement' => null, 'instructions' => null, 'sla_due_at' => null, 'priority' => null,
        'asset_id' => 'int', 'location_id' => 'int', 'department_id' => 'int',
    ];
    foreach ($map as $col => $type) {
        if (!array_key_exists($col, $d)) continue;
        $v = $d[$col];
        if ($type === 'int') $v = (int)$v ?: null;
        elseif ($v === '' || $v === null) $v = null;
        $fields[] = "$col = ?";
        $values[] = $v;
    }
    if (!$fields) { http_response_code(400); echo json_encode(['error' => 'ไม่มีข้อมูล'], JSON_UNESCAPED_UNICODE); exit; }

    $newStatus = null;
    if ($wo['status'] === 'draft' || $wo['status'] === '') $newStatus = 'pending_approval';

    $sql = 'UPDATE repair SET ' . implode(', ', $fields) . ', planner_id = ?';
    if ($newStatus !== null) $sql .= ', status = ?, status_changed_at = NOW()';
    $sql .= ' WHERE id = ?';
    $values[] = p14_uid();
    if ($newStatus !== null) $values[] = $newStatus;
    $values[] = $id;
    $pdo->prepare($sql)->execute($values);

    p14_log_repair($pdo, $id, 'planned', 'บันทึกแผนงาน (เวลา/ทักษะ/เครื่องมือ/ความปลอดภัย/คำแนะนำ)', null, $newStatus);
    echo json_encode(['success' => true, 'status' => $newStatus ?? $wo['status']], JSON_UNESCAPED_UNICODE);
}

/**
 * มอบหมายงาน (assign / bulk_assign)
 * - เช็คสถานะที่ assign ได้ + ห้าม assign ซ้ำ (double-assign guard)
 * - เช็ค workload/conflict ช่วงเวลาวางแผนของผู​้ถูกมอบหมาย (409 ถ้าชน เว้น force=1)
 */
function apiAssignWork(PDO $pdo, bool $bulk): void {
    $d = p14_input();
    $ids = $bulk ? array_values(array_filter(array_map('intval', (array)($d['ids'] ?? [])))) : [(int)($d['id'] ?? 0)];
    if (!$ids || ($bulk && count($ids) > 100)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing ids'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $leadId = (int)($d['lead_id'] ?? $d['assigned_to'] ?? 0);
    $teamIds = array_values(array_unique(array_filter(array_map('intval', (array)($d['team_ids'] ?? [])), fn($u) => $u > 0)));
    if ($leadId) $teamIds[] = $leadId;
    $teamIds = array_values(array_unique($teamIds));
    if (!$leadId && $teamIds) $leadId = $teamIds[0];
    if (!$leadId) {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุผู้รับผิดชอบ (lead)'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $start = trim((string)($d['planned_start_at'] ?? ''));
    $end = trim((string)($d['planned_end_at'] ?? ''));
    $note = trim((string)($d['note'] ?? ''));
    $force = !empty($d['force']);
    $allowFrom = ['open', 'acknowledged', 'draft', 'pending_approval', 'approved', 'assigned', 'accepted'];
    $needForceFor = ['in_progress', 'paused', 'waiting_parts', 'waiting_external', 'waiting_approval'];

    $assigner = p14_uid();
    $results = [];
    foreach ($ids as $rid) {
        try {
            $wo = p14_fetch_wo($pdo, $rid);
            $from = $wo['status'];
            if (in_array($from, p14_done_statuses(), true)) {
                $results[] = ['id' => $rid, 'success' => false, 'code' => $wo['work_order_no'], 'error' => 'งานจบแล้ว ไม่สามารถมอบหมายได้'];
                continue;
            }
            if (!in_array($from, $allowFrom, true) && !(in_array($from, $needForceFor, true) && $force)) {
                $results[] = ['id' => $rid, 'success' => false, 'code' => $wo['work_order_no'], 'error' => "สถานะ {$from} ไม่อนุญาตให้มอบหมาย (ต้องยกเลิกงานที่กำลังทำก่อน / Assign ซ้ำ)"];
                continue;
            }
            if (!empty($wo['assigned_to']) && (int)$wo['assigned_to'] === $leadId && in_array($from, ['assigned', 'accepted'], true)) {
                $results[] = ['id' => $rid, 'success' => false, 'code' => $wo['work_order_no'], 'error' => 'งานนี้ถูกมอบหมายให้ผู้รับผิดชอบคนนี้แล้ว'];
                continue;
            }

            $conflicts = $start !== '' && $end !== '' ? p14_conflicts($pdo, $teamIds, $start, $end, $rid) : [];
            if ($conflicts && !$force) {
                $results[] = [
                    'id' => $rid, 'success' => false, 'code' => $wo['work_order_no'],
                    'error' => 'ขัดกับงานที่วางแผนไว้ในช่วงเวลาเดียวกัน', 'conflicts' => $conflicts,
                ];
                continue;
            }

            $newStart = $start !== '' ? $start : $wo['planned_start_at'];
            $newEnd = $end !== '' ? $end : $wo['planned_end_at'];
            $sla = !empty($wo['sla_due_at']) ? $wo['sla_due_at'] : ($newEnd ?: null);

            $set = setWorkAssignees($pdo, 'repair', $rid, $teamIds, $leadId, $assigner);
            $pdo->prepare('UPDATE repair SET assigned_to = ?, status = "assigned", status_changed_at = NOW(),
                            planned_start_at = ?, planned_end_at = ?, planner_id = ?,
                            sla_due_at = COALESCE(sla_due_at, ?)
                            WHERE id = ?')
                ->execute([$leadId, $newStart, $newEnd, $assigner, $sla, $rid]);

            p14_log_repair($pdo, $rid, 'assigned', 'มอบหมายงานให้ ' . p14_name($pdo, $leadId) . ($note !== '' ? ' — ' . $note : ''), $from, 'assigned');
            foreach ($set['added'] as $uid) {
                p14_notify_user($pdo, (int)$uid, 'คุณได้รับมอบหมายงาน ' . $wo['work_order_no'], $wo['title'], publicBaseUrl() . '/repair/view?id=' . $rid);
                p14_center($pdo, 'repair', 'assigned', 'work_order', [
                    'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
                    'asset_code' => (string)$wo['asset_code'], 'asset_name' => (string)$wo['asset_name'],
                    'priority' => (string)$wo['priority'], 'assigner_name' => p14_name($pdo, $assigner),
                ], [(int)$uid], [], '/repair/view?id=' . $rid, $rid, 'repair');
            }
            p14_sync_mr_status($pdo, $rid, 'in_progress');
            $results[] = [
                'id' => $rid, 'success' => true, 'code' => $wo['work_order_no'], 'status' => 'assigned',
                'added' => $set['added'], 'conflicts' => $conflicts,
            ];
        } catch (Exception $e) {
            $results[] = ['id' => $rid, 'success' => false, 'error' => $e->getMessage()];
        }
    }

    $allOk = count(array_filter($results, fn($r) => !empty($r['success']))) === count($results);
    if (!$allOk) http_response_code(409);
    echo json_encode(['success' => $allOk, 'results' => $results], JSON_UNESCAPED_UNICODE);
}

function apiRescheduleWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    $start = (string)($d['planned_start_at'] ?? '');
    $end = (string)($d['planned_end_at'] ?? '');
    if (!$id || $start === '' || $end === '') {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุช่วงเวลาใหม่'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($end <= $start) {
        http_response_code(422);
        echo json_encode(['error' => 'ช่วงเวลาไม่ถูกต้อง'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $wo = p14_fetch_wo($pdo, $id);
    if (in_array($wo['status'], p14_done_statuses(), true)) {
        http_response_code(409);
        echo json_encode(['error' => 'งานจบแล้ว ไม่สามารถเลื่อนกำหนดได้'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $teamIds = array_map('intval', array_column(getWorkAssignees($pdo, 'repair', $id), 'user_id'));
    $conflicts = p14_conflicts($pdo, $teamIds, $start, $end, $id);
    if ($conflicts && empty($d['force'])) {
        http_response_code(409);
        echo json_encode(['error' => 'ขัดกับงานอื่นในช่วงเวลาเดียวกัน', 'conflicts' => $conflicts], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $pdo->prepare('UPDATE repair SET planned_start_at = ?, planned_end_at = ?, planner_id = ?,
                    sla_due_at = COALESCE(sla_due_at, ?) WHERE id = ?')
        ->execute([$start, $end, p14_uid(), $end, $id]);
    p14_log_repair($pdo, $id, 'rescheduled', 'เลื่อนกำหนดงาน', "{$wo['planned_start_at']} → {$wo['planned_end_at']}", "{$start} → {$end}");
    echo json_encode(['success' => true, 'conflicts' => $conflicts], JSON_UNESCAPED_UNICODE);
}

/**
 * หยุดพักงานชั่วคราวพร้อมเหตุผล (บังคับ) — บันทึกงาน pause ลง work_pause_logs
 * reason: waiting_parts|waiting_spare|production_stop|contractor|waiting_approval|other
 */
function apiPauseWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    $reason = trim((string)($d['reason'] ?? ''));
    $note = trim((string)($d['note'] ?? ''));
    if (!$id || $reason === '') {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุเหตุผลการหยุดพักงาน'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $reasonMap = [
        'waiting_parts' => 'waiting_parts',
        'waiting_spare' => 'waiting_parts',
        'production_stop' => 'paused',
        'contractor' => 'waiting_external',
        'waiting_approval' => 'waiting_external',
        'other' => 'paused',
    ];
    $newStatus = $reasonMap[$reason] ?? 'paused';
    $wo = p14_fetch_wo($pdo, $id);
    if (!p14_tech_ok($pdo, $id)) requireRole(false, 'เฉพาะช่างผู้รับงานหรือหัวหน้างานเท่านั้น');
    if (in_array($wo['status'], p14_done_statuses(), true) || $wo['status'] === '') {
        http_response_code(409);
        echo json_encode(['error' => 'ไม่สามารถหยุดงานที่จบแล้ว'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    p14_set_status($pdo, $id, $newStatus, ['paused_at' => date('Y-m-d H:i:s'), 'pause_reason' => $reason, 'wait_reason' => $reason]);
    $pdo->prepare('INSERT INTO work_pause_logs (repair_id, user_id, action, reason, note) VALUES (?,?,?,?,?)')
        ->execute([$id, p14_uid(), 'pause', $reason, $note]);
    p14_sync_mr_status($pdo, $id, $newStatus === 'paused' ? 'in_progress' : 'waiting_parts');
    p14_log_repair($pdo, $id, 'paused', 'หยุดพักงาน: ' . $reason . ($note !== '' ? ' — ' . $note : ''), $wo['status'], $newStatus);
    p14_center($pdo, 'repair', 'paused', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)$wo['asset_code'], 'reason' => $reason,
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
    echo json_encode(['success' => true, 'status' => $newStatus], JSON_UNESCAPED_UNICODE);
}

function apiResumeWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    $note = trim((string)($d['note'] ?? ''));
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    if (!p14_tech_ok($pdo, $id)) requireRole(false, 'เฉพาะช่างผู้รับงานหรือหัวหน้างานเท่านั้น');
    $wo = p14_fetch_wo($pdo, $id);
    if (!in_array($wo['status'], ['paused', 'waiting_parts', 'waiting_external'], true)) {
        http_response_code(409);
        echo json_encode(['error' => 'งานนี้ไม่ได้อยู่ในสถานะหยุดพัก'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    p14_set_status($pdo, $id, 'in_progress', ['paused_at' => null, 'pause_reason' => null, 'wait_reason' => null]);
    $pdo->prepare('INSERT INTO work_pause_logs (repair_id, user_id, action, reason, note) VALUES (?,?,?,?,?)')
        ->execute([$id, p14_uid(), 'resume', $d['reason'] ?? 'resumed', $note]);
    p14_log_repair($pdo, $id, 'resumed', 'กลับมาทำงานต่อ' . ($note !== '' ? ' — ' . $note : ''), $wo['status'], 'in_progress');
    p14_center($pdo, 'repair', 'resumed', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)$wo['asset_code'],
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
    echo json_encode(['success' => true, 'status' => 'in_progress'], JSON_UNESCAPED_UNICODE);
}

function apiCompleteWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    if (!p14_tech_ok($pdo, $id)) requireRole(false, 'เฉพาะช่างผู้รับงานหรือหัวหน้างานเท่านั้น');
    $wo = p14_fetch_wo($pdo, $id);
    if (!in_array($wo['status'], ['in_progress', 'paused', 'waiting_parts', 'waiting_external', 'assigned', 'accepted'], true)) {
        http_response_code(409);
        echo json_encode(['error' => "สถานะ {$wo['status']} ยังไม่พร้อมปิดงาน ช่างต้องเริ่มงานก่อน"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // บังคับผลตรวจการปนเปื้อน (เหมือน repair.php)
    $cc = strtolower((string)($d['contaminate_checking'] ?? 'not_checked'));
    if (!in_array($cc, ['clean', 'contaminated', 'not_applicable'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุผลตรวจการปนเปื้อนก่อนปิดใบงานซ่อม', 'code' => 'CONTAM_REQUIRED'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $updates = ['status = "completed"', 'completed_at = NOW()', 'contaminate_checking = ?', 'status_changed_at = NOW()'];
    $vals = [$cc];
    foreach (['resolution', 'root_cause', 'solution', 'downtime_start', 'downtime_end', 'before_image_path', 'after_image_path'] as $f) {
        if (isset($d[$f]) && trim((string)$d[$f]) !== '') {
            $updates[] = "$f = ?";
            $vals[] = trim((string)$d[$f]);
        }
    }
    $vals[] = $id;
    $pdo->prepare('UPDATE repair SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($vals);

    if (!empty($d['spare_parts']) && is_array($d['spare_parts'])) {
        try {
            $r = saveRepairSpareParts($pdo, $id, $d['spare_parts'], true);
            if (!empty($r['cost_parts'])) $pdo->prepare('UPDATE repair SET cost_parts = ? WHERE id = ?')->execute([$r['cost_parts'], $id]);
        } catch (Exception $e) {
            error_log('[supervisor.php] spare_parts: ' . $e->getMessage());
        }
    }
    p14_sync_mr_status($pdo, $id, 'resolved');

    $completeAt = date('Y-m-d H:i:s');
    if (!empty($wo['actual_start_at']) || !empty($wo['planned_start_at'])) {
        $start = strtotime((string)($wo['actual_start_at'] ?: $wo['planned_start_at']));
        $dur = max(0, (strtotime($completeAt) - $start) / 60);
        if ($dur > 0) $pdo->prepare('UPDATE repair SET repair_time_minutes = ? WHERE id = ?')->execute([(int)round($dur), $id]);
    }
    p14_log_repair($pdo, $id, 'completed', 'ช่างทำงานเสร็จ รอหัวหน้าตรวจรับ', $wo['status'], 'completed');
    p14_center($pdo, 'repair', 'completed', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)$wo['asset_code'], 'downtime_hours' => number_format(isset($dur) && $dur > 0 ? $dur / 60 : 0, 1),
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
    echo json_encode(['success' => true, 'status' => 'completed'], JSON_UNESCAPED_UNICODE);
}

function apiVerifyWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    $decision = (string)($d['decision'] ?? 'approved');
    $note = trim((string)($d['note'] ?? ''));
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $wo = p14_fetch_wo($pdo, $id);

    if ($decision === 'reopen') {
        $reason = trim((string)($d['reopen_reason'] ?? $note));
        if ($reason === '') {
            http_response_code(400);
            echo json_encode(['error' => 'ต้องระบุเหตุผลที่ต้องเปิดงานใหม่'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (!in_array($wo['status'], ['completed', 'pending_verification', 'resolved', 'verified'], true)) {
            http_response_code(409);
            echo json_encode(['error' => "สถานะ {$wo['status']} ไม่สามารถเปิดงานใหม่ได้"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        p14_set_status($pdo, $id, 'in_progress', [
            'reopened' => 1, 'verified_by' => null, 'verified_at' => null,
            'verify_note' => $reason, 'closed_by' => null, 'closed_at' => null,
        ]);
        p14_sync_mr_status($pdo, $id, 'in_progress');
        p14_log_repair($pdo, $id, 'reopened', 'เปิดงานใหม่: ' . $reason, $wo['status'], 'in_progress');
        p14_center($pdo, 'repair', 'reopened', 'work_order', [
            'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
            'asset_code' => (string)$wo['asset_code'], 'reason' => $reason,
        ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
        echo json_encode(['success' => true, 'status' => 'in_progress', 'reopened' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // approved — double-verify guard
    if ($wo['status'] === 'verified') {
        http_response_code(409);
        echo json_encode(['error' => 'งานนี้ตรวจรับแล้ว ไม่ตรวจซ้ำ'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!in_array($wo['status'], ['completed', 'pending_verification', 'resolved'], true)) {
        http_response_code(409);
        echo json_encode(['error' => "สถานะ {$wo['status']} ยังไม่พร้อมตรวจรับ (ช่างต้องปิดงานก่อน)"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $autoClose = !empty($d['auto_close']);
    $finalStatus = $autoClose ? 'closed' : 'verified';
    p14_set_status($pdo, $id, $finalStatus, [
        'verified_by' => p14_uid(),
        'verified_at' => date('Y-m-d H:i:s'),
        'verify_note' => $note,
        'closed_by' => $autoClose ? p14_uid() : null,
        'closed_at' => $autoClose ? date('Y-m-d H:i:s') : null,
    ]);
    p14_sync_mr_status($pdo, $id, $autoClose ? 'closed' : 'resolved');
    p14_log_repair($pdo, $id, 'verified', 'ตรวจรับงานผ่าน' . ($note !== '' ? ': ' . $note : ''), $wo['status'], $finalStatus);
    p14_center($pdo, 'repair', 'verified', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)$wo['asset_code'], 'verified_by_name' => p14_name($pdo, p14_uid()),
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
    echo json_encode(['success' => true, 'status' => $finalStatus], JSON_UNESCAPED_UNICODE);
}

function apiCloseWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id'], JSON_UNESCAPED_UNICODE); exit; }
    $wo = p14_fetch_wo($pdo, $id);
    if ($wo['status'] !== 'verified') {
        http_response_code(409);
        echo json_encode(['error' => 'ต้องตรวจรับงาน (Verify) ก่อนปิดใบงาน — ไม่ข้ามขั้นตอน'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    p14_set_status($pdo, $id, 'closed', ['closed_by' => p14_uid(), 'closed_at' => date('Y-m-d H:i:s')]);
    p14_sync_mr_status($pdo, $id, 'closed');
    p14_log_repair($pdo, $id, 'closed', 'ปิดใบงานเรียบร้อย', 'verified', 'closed');
    p14_center($pdo, 'repair', 'closed', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)$wo['asset_code'],
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
    echo json_encode(['success' => true, 'status' => 'closed'], JSON_UNESCAPED_UNICODE);
}

function apiReopenWork(PDO $pdo): void {
    $d = p14_input();
    $id = (int)($d['id'] ?? 0);
    $reason = trim((string)($d['reason'] ?? ''));
    if (!$id || $reason === '') {
        http_response_code(400);
        echo json_encode(['error' => 'ต้องระบุเหตุผลที่เปิดงานใหม่'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $wo = p14_fetch_wo($pdo, $id);
    if (!in_array($wo['status'], ['closed', 'verified'], true)) {
        http_response_code(409);
        echo json_encode(['error' => "สถานะ {$wo['status']} เปิดงานใหม่ไม่ได้"], JSON_UNESCAPED_UNICODE);
        exit;
    }
    p14_set_status($pdo, $id, 'in_progress', [
        'reopened' => 1, 'verify_note' => $reason, 'verified_by' => null, 'verified_at' => null,
        'closed_by' => null, 'closed_at' => null,
    ]);
    p14_sync_mr_status($pdo, $id, 'in_progress');
    p14_log_repair($pdo, $id, 'reopened', 'เปิดงานใหม่ (ปิดแล้ว): ' . $reason, $wo['status'], 'in_progress');
    p14_center($pdo, 'repair', 'reopened', 'work_order', [
        'work_order_no' => $wo['work_order_no'], 'title' => (string)$wo['title'],
        'asset_code' => (string)$wo['asset_code'], 'reason' => $reason,
    ], [], [1, 2, 6], '/repair/view?id=' . $id, $id, 'repair');
    echo json_encode(['success' => true, 'status' => 'in_progress'], JSON_UNESCAPED_UNICODE);
}