<?php
/**
 * scripts/notification_engine.php - CLI: Notification + Alert Engine (Phase 16)
 *
 * ตรวจสภาพจริงของระบบแล้วสร้าง notification (inbox) ผ่าน NotificationCenterService
 * พร้อมเริมเดอร์/ยก priority ตาม time-based rules (delay / repeat / dedup):
 *
 *   1) PM/AM ใกล้กำหนด (pm_reminder_days) + เกินกำหนด
 *   2) อะไหล่ต่ำกว่า min_stock / ไม่มีสต็อก (สรุปเป็น 1 ฉบับ/วัน)
 *   3) SLA at-risk (<24 ชม.) + SLA breached ของใบสั่งงาน
 *   4) Escalation งานด่วน/วิกฤตค้างเกิน escalation_hours
 *   5) สอบเทียบ (calibration) ใกล้กำหนด
 *   6) ตรวจเช็ครอบไม่ผ่าน (inspection failed — guarded)
 *   7) Rule engine — ใช้ notification_rules ปรับผู้รับ/ช่องทาง/delay/repeat/dedup
 *   8) Retry การส่งช่องทางภายนอกที่ค้าง (notification_deliveries)
 *
 * ใช้: php notification_engine.php [--force] [--module=pm,low_stock,sla,escalation,calibration,inspection,retry]
 *      --force = ข้าม dedup (ใช้ทดสอบ)
 * exit 0 = ทำงานเสร็จ (ไม่ว่าจะเจอหรือไม่เจอรายการ)
 */
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/notification.php';
require_once __DIR__ . '/../src/services/NotificationCenterService.php';

$force     = in_array('--force', $argv, true);
$moduleArg = 'all';
foreach ($argv as $a) {
    if (preg_match('/^--module=(.+)$/', $a, $m)) $moduleArg = $m[1];
}
$modules = array_values(array_map('trim', array_filter(explode(',', $moduleArg))));

function engSetting(PDO $pdo, string $key, string $default = ''): string
{
    try {
        $v = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = " . $pdo->quote($key))->fetchColumn();
        return ($v === false || $v === null || $v === '') ? $default : (string)$v;
    } catch (Throwable $e) {
        return $default;
    }
}

function engHas(string $m): bool
{
    global $modules;
    return in_array($m, $modules, true);
}

function engRolesSupervisors(): array
{
    return [1, 2, 6];
}

/**
 * นับจำนวน notification_events ของโจทย์นี้ (key prefix) ตั้งแต่วันที่สร้าง entity
 * ใช้ลด/จำกัด repeat จาก rule (max_repeats / repeat_every_minutes)
 */
function engEventCount(PDO $pdo, string $keyPrefix, string $since): int
{
    try {
        $st = $pdo->prepare("SELECT COUNT(*) FROM notification_events WHERE event_key LIKE ? AND created_at >= ?");
        $st->execute([$keyPrefix . '%', $since]);
        return (int)$st->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * ดึง rule ที่ตรง (module,event) และเปิดใช้งาน — คืน array ของ rule หรือ defaults
 */
function engRule(PDO $pdo, string $module, string $event): ?array
{
    try {
        $st = $pdo->prepare('SELECT * FROM notification_rules WHERE module = ? AND (event = ? OR event = "*") AND enabled = 1 ORDER BY (event = ?) DESC, id ASC LIMIT 1');
        $st->execute([$module, $event, $event]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * resolve users จาก id-array เดิม + ขยาย roles → user id
 */
function engResolveUsers(PDO $pdo, array $roles, array $baseUsers = []): array
{
    $users = array_values(array_filter(array_map('intval', $baseUsers), fn($u) => $u > 0));
    if ($roles) {
        $in = implode(',', array_fill(0, count($roles), '?'));
        $st = $pdo->prepare("SELECT id FROM users WHERE is_active = 1 AND role_id IN ($in)");
        $st->execute(array_values($roles));
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $uid) $users[] = (int)$uid;
    }
    return array_values(array_unique(array_filter($users, fn($u) => $u > 0)));
}

/**
 * กลั่นกฎ: คำนวณผู้รับ / ช่องทาง / delay / allowed-repeats / dedup_hours
 * @return array{users:int[],channels:string[],priority:string,dedup:int,delay:int,allowed:int}
 */
function engApplyRule(PDO $pdo, $rule, array $defaultUsers, array $defaultRoles, array $defaultChannels, string $priority): array
{
    $users = $defaultUsers;
    $channels = $defaultChannels;
    $dedup = 24;
    $delay = 0;
    $allowed = 1;
    if ($rule) {
        $roles = json_decode((string)$rule['recipients_role'], true);
        $usersFromJson = json_decode((string)$rule['recipients_user'], true);
        $users = engResolveUsers($pdo, is_array($roles) ? array_filter($roles) : [], is_array($usersFromJson) ? array_values(array_map('intval', $usersFromJson)) : $defaultUsers);
        $chs = json_decode((string)$rule['channels'], true);
        if (is_array($chs) && $chs) $channels = array_values(array_intersect(NotificationCenterService::CHANNELS, $chs));
        $dedup = max(1, (int)$rule['dedup_hours']);
        $delay = max(0, (int)$rule['delay_minutes']);
        if (in_array($rule['priority'], NotificationCenterService::PRIORITIES, true)) {
            $priority = (string)$rule['priority'];
        }
        $maxRepeats = max(1, (int)$rule['max_repeats']);
        $repeatEvery = max(0, (int)$rule['repeat_every_minutes']);
        $allowed = $repeatEvery > 0 ? $maxRepeats : 1;
    } else {
        // default: ผู้รับจาก defaultUsers + ขยาย roles ทั้งหมด
        $users = engResolveUsers($pdo, $defaultRoles, $defaultUsers);
    }
    return ['users' => $users, 'channels' => $channels, 'priority' => $priority, 'dedup' => $dedup, 'delay' => $delay, 'allowed' => $allowed];
}

/**
 * ปล่อย candidate หนึ่งผ่าน pipeline (rule → delay → repeat → notify)
 */
function engFire(PDO $pdo, array $c): int
{
    global $force;
    $rule = engRule($pdo, (string)$c['module'], (string)$c['event']);
    $r = engApplyRule($pdo, $rule, $c['users'] ?? [], $c['roles'] ?? [], $c['channels'] ?? ['app', 'push'], (string)$c['priority']);

    $createdAt = (string)($c['created_at'] ?? date('Y-m-d H:i:s', time() - 86400));
    // delay: ยังไม่ถึงเวลาตามกฎ (นับจากเวลาที่ entity เกิด)
    if ($r['delay'] > 0) {
        $ageMin = (strtotime('now') - strtotime($createdAt)) / 60;
        if ($ageMin < $r['delay']) {
            echo "  delay ({$r['delay']}m, age " . round($ageMin, 1) . "m): {$c['module']}:{$c['event']}#{$c['ref_id']}\n";
            return 0;
        }
    }
    // repeat: จำนวนที่เคยส่งแล้วต้องน้อยกว่าที่กฎอนุญาต
    $baseKey = "{$c['module']}:{$c['event']}:{$c['ref_type']}:{$c['ref_id']}";
    $since = date('Y-m-d H:i:s', strtotime($createdAt));
    $sent = engEventCount($pdo, $baseKey . ':%', $since);
    if ($sent >= $r['allowed']) {
        echo "  repeat-limit ({$sent} ≥ {$r['allowed']}): {$baseKey}\n";
        return 0;
    }

    $spec = [
        'type' => (string)($c['type'] ?? ($c['module'] === 'pm_am' ? 'pm' : $c['module'])),
        'module' => $c['module'],
        'event' => $c['event'],
        'priority' => $r['priority'],
        'ref_type' => (string)($c['ref_type'] ?? ''),
        'ref_id' => (int)($c['ref_id'] ?? 0),
        'users' => array_values(array_unique(array_filter(array_map('intval', $r['users']), fn($u) => $u > 0))),
        'roles' => [],
        'channels' => $r['channels'],
        'url' => (string)($c['url'] ?? ''),
        'payload' => $c['payload'] ?? null,
        'event_key' => $baseKey . ':' . date('Y-m-d') . ':' . $sent,
        'dedup_hours' => $r['dedup'],
        'force' => $force,
    ];
    if (!empty($c['template'])) {
        $spec['template'] = (string)$c['template'];
        $spec['vars'] = $c['vars'] ?? [];
    } else {
        $spec['title'] = (string)($c['title'] ?? '');
        $spec['message'] = (string)($c['message'] ?? '');
    }
    $n = NotificationCenterService::notify($pdo, $spec);
    echo "  fire {$baseKey} (" . ($n ? "inbox ×{$n}" : 'dedup/skip') . ")\n";
    return $n;
}

/* ═══════════════════════ รัน ═══════════════════════ */
$pdo = getDb();
NotificationCenterService::install($pdo);
echo "== notification_engine " . date('Y-m-d H:i:s') . " (modules: " . implode(',', $modules) . ", force=" . ($force ? 'yes' : 'no') . ") ==\n";

$done = 0;

/* ---------------- PM/AM ใกล้กำหนด + เกินกำหนด ---------------- */
if (engHas('pm') || engHas('all')) {
    $reminderDays = max(0, (int)engSetting($pdo, 'pm_reminder_days', '3'));
    $rows = $pdo->query("
        SELECT p.id, p.title, p.due_date, p.status, p.assigned_to, p.created_at,
               a.code AS asset_code, a.name AS asset_name
        FROM pm_am p
        LEFT JOIN asset_registry a ON p.asset_id = a.id
        WHERE p.status = 'pending' AND p.due_date IS NOT NULL
          AND p.due_date <= DATE_ADD(CURDATE(), INTERVAL " . $reminderDays . " DAY)
        ORDER BY p.due_date ASC")->fetchAll();
    foreach ($rows as $r) {
        $days = (int)((strtotime((string)$r['due_date']) - strtotime(date('Y-m-d'))) / 86400);
        $overdue = $days < 0;
        $fire = engFire($pdo, [
            'module' => 'pm_am', 'event' => $overdue ? 'overdue' : 'due',
            'type' => 'pm', 'priority' => $overdue ? 'high' : 'medium',
            'ref_type' => 'pm_am', 'ref_id' => (int)$r['id'],
            'users' => (int)$r['assigned_to'] ? [(int)$r['assigned_to']] : [],
            'roles' => engRolesSupervisors(),
            'channels' => ['app', 'push'],
            'template' => 'pm_am:' . ($overdue ? 'overdue' : 'due'),
            'vars' => [
                'asset_code' => (string)$r['asset_code'], 'asset_name' => (string)$r['asset_name'],
                'title' => (string)$r['title'], 'due_date' => (string)$r['due_date'],
                'days' => max(0, $days), 'days_overdue' => abs($days),
            ],
            'url' => '/pm_am/checksheet',
            'created_at' => (string)$r['created_at'],
        ]);
        $done += $fire;
    }
    echo "PM due/overdue check done (" . count($rows) . " candidates)\n";
}

/* ---------------- อะไหล่ต่ำกว่า min / สต็อก 0 ---------------- */
if (engHas('low_stock') || engHas('all')) {
    if (engSetting($pdo, 'low_stock_alert', '1') === '1') {
        $lowCount = (int)$pdo->query('SELECT COUNT(*) FROM spare_parts WHERE stock_qty > 0 AND stock_qty <= min_stock')->fetchColumn();
        if ($lowCount > 0) {
            $top = $pdo->query('SELECT code, name, stock_qty, min_stock, unit FROM spare_parts
                                WHERE stock_qty > 0 AND stock_qty <= min_stock
                                ORDER BY (stock_qty / NULLIF(min_stock,0)) ASC, stock_qty ASC LIMIT 15')->fetchAll();
            $lines = [];
            foreach ($top as $t) {
                $lines[] = "• {$t['code']} - " . mb_substr((string)$t['name'], 0, 30) . ": เหลือ {$t['stock_qty']} {$t['unit']} (min {$t['min_stock']})";
            }
            $msg = "อะไหล่ต่ำกว่าจุดสั่งซื้อ: {$lowCount} รายการ\n" . implode("\n", $lines) . ($lowCount > 15 ? "\n...+ " . ($lowCount - 15) . " รายการ" : '');
            $done += engFire($pdo, [
                'module' => 'spare_parts', 'event' => 'low_stock',
                'type' => 'spare_part', 'priority' => 'high',
                'ref_type' => 'spare_parts', 'ref_id' => 0,
                'roles' => engRolesSupervisors(),
                'channels' => ['app', 'push'],
                'title' => "อะไหล่ต่ำกว่าจุดสั่งซื้อ {$lowCount} รายการ",
                'message' => $msg,
                'url' => '/spare_parts',
                'created_at' => date('Y-m-d 00:00:00'),
            ]);
        }
        echo "low stock check done ({$lowCount} items)\n";
    } else {
        echo "low stock check skipped (low_stock_alert=0)\n";
    }
}

/* ---------------- SLA at-risk / breached ---------------- */
if (engHas('sla') || engHas('all')) {
    $active = "('open','acknowledged','draft','pending_approval','approved','assigned','accepted','in_progress','paused','waiting_parts','pending_parts','waiting_external','waiting_approval','completed','pending_verification','resolved')";
    $slaRows = $pdo->query("
        SELECT r.id, r.work_order_no, r.title, r.sla_due_at, r.created_at, r.priority, r.assigned_to,
               a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
        FROM repair r
        LEFT JOIN asset_registry a ON r.asset_id = a.id
        LEFT JOIN users u ON r.assigned_to = u.id
        WHERE r.status IN $active AND r.sla_due_at IS NOT NULL
          AND r.sla_due_at < DATE_ADD(NOW(), INTERVAL 24 HOUR)")->fetchAll();
    foreach ($slaRows as $r) {
        $breached = strtotime((string)$r['sla_due_at']) < strtotime('now');
        $days = (int)((strtotime('now') - strtotime((string)$r['sla_due_at'])) / 86400);
        $done += engFire($pdo, [
            'module' => 'repair', 'event' => $breached ? 'sla_breached' : 'sla_at_risk',
            'type' => 'sla', 'priority' => $breached ? 'critical' : 'high',
            'ref_type' => 'repair', 'ref_id' => (int)$r['id'],
            'users' => (int)$r['assigned_to'] ? [(int)$r['assigned_to']] : [],
            'roles' => engRolesSupervisors(),
            'channels' => ['app', 'push'],
            'template' => 'repair:' . ($breached ? 'sla_breached' : 'sla_at_risk'),
            'vars' => [
                'work_order_no' => (string)$r['work_order_no'], 'title' => (string)$r['title'],
                'asset_code' => (string)$r['asset_code'], 'sla_due_at' => (string)$r['sla_due_at'],
                'overdue_days' => max(1, $days),
            ],
            'url' => '/repair/view?id=' . (int)$r['id'],
            'created_at' => (string)$r['created_at'],
        ]);
    }
    echo "SLA check done (" . count($slaRows) . " candidates)\n";
}

/* ---------------- Escalation งานด่วนค้าง ---------------- */
if (engHas('escalation') || engHas('all')) {
    $escHours = max(1, (int)engSetting($pdo, 'escalation_hours', '24'));
    if (engSetting($pdo, 'escalation_alert', '1') === '1') {
        $esc = $pdo->query("
            SELECT r.id, r.work_order_no, r.title, r.priority, r.created_at, r.assigned_to,
                   a.code AS asset_code, a.name AS asset_name,
                   TIMESTAMPDIFF(HOUR, r.created_at, NOW()) AS age_hours
            FROM repair r
            LEFT JOIN asset_registry a ON r.asset_id = a.id
            WHERE r.status NOT IN ('resolved','closed','cancelled','rejected','completed','verified','done','skipped')
              AND r.priority IN ('high','critical')
              AND r.work_order_no NOT LIKE '%DEMO%'
              AND TIMESTAMPDIFF(HOUR, r.created_at, NOW()) >= $escHours
            ORDER BY r.created_at ASC LIMIT 15")->fetchAll();
        foreach ($esc as $e) {
            $done += engFire($pdo, [
                'module' => 'repair', 'event' => 'escalated',
                'type' => 'priority', 'priority' => 'critical',
                'ref_type' => 'repair', 'ref_id' => (int)$e['id'],
                'users' => (int)$e['assigned_to'] ? [(int)$e['assigned_to']] : [],
                'roles' => engRolesSupervisors(),
                'channels' => ['app', 'push'],
                'template' => 'repair:escalated',
                'vars' => [
                    'work_order_no' => (string)$e['work_order_no'], 'title' => (string)$e['title'],
                    'asset_code' => (string)$e['asset_code'], 'age_hours' => (int)$e['age_hours'],
                    'escalation_hours' => $escHours,
                ],
                'url' => '/repair/view?id=' . (int)$e['id'],
                'created_at' => (string)$e['created_at'],
            ]);
        }
        echo "escalation check done (" . count($esc) . " candidates, {$escHours}h)\n";
    } else {
        echo "escalation check skipped (escalation_alert=0)\n";
    }
}

/* ---------------- Calibration ใกล้กำหนด ---------------- */
if (engHas('calibration') || engHas('all')) {
    $calDays = max(0, (int)engSetting($pdo, 'calibration_alert_days', '30'));
    try {
        $cal = $pdo->query("
            SELECT c.id, c.asset_id, c.next_calibration_date, c.created_at,
                   a.name AS asset_name, a.code AS asset_code
            FROM calibration c
            LEFT JOIN asset_registry a ON c.asset_id = a.id
            WHERE c.next_calibration_date IS NOT NULL
              AND c.next_calibration_date <= DATE_ADD(CURDATE(), INTERVAL $calDays DAY)")->fetchAll();
        foreach ($cal as $c) {
            $done += engFire($pdo, [
                'module' => 'calibration', 'event' => 'due',
                'type' => 'calibration', 'priority' => 'medium',
                'ref_type' => 'calibration', 'ref_id' => (int)$c['id'],
                'roles' => engRolesSupervisors(),
                'channels' => ['app', 'push'],
                'template' => 'calibration:due',
                'vars' => [
                    'asset_name' => (string)($c['asset_name'] ?? ''), 'asset_code' => (string)($c['asset_code'] ?? ''),
                    'next_date' => (string)$c['next_calibration_date'],
                ],
                'url' => '/calibration',
                'created_at' => (string)($c['created_at'] ?? (date('Y-m-d 00:00:00', strtotime((string)$c['next_calibration_date']) - $calDays * 86400))),
            ]);
        }
        echo "calibration check done (" . count($cal) . " candidates)\n";
    } catch (Throwable $e) {
        echo "calibration check skipped (schema mismatch): " . $e->getMessage() . "\n";
    }
}

/* ---------------- Inspection ล่าสุดไม่ผ่าน ---------------- */
if (engHas('inspection') || engHas('all')) {
    try {
        $rows = $pdo->query("
            SELECT s.id AS schedule_id, s.status, s.created_at,
                   t.title AS schedule_title,
                   a.code AS asset_code, a.name AS asset_name,
                   (SELECT COUNT(*) FROM inspection_results r
                    WHERE r.schedule_id = s.id AND r.status IN ('false','fail','ng')) AS fail_count
            FROM inspection_schedules s
            LEFT JOIN inspection_templates t ON t.id = s.template_id
            LEFT JOIN asset_registry a ON a.id = s.asset_id
            WHERE s.status IN ('completed','pending','in_progress')
              AND (SELECT COUNT(*) FROM inspection_results r
                   WHERE r.schedule_id = s.id AND r.status IN ('false','fail','ng')) > 0
            ORDER BY s.id DESC LIMIT 15")->fetchAll();
        foreach ($rows as $r) {
            $done += engFire($pdo, [
                'module' => 'inspections', 'event' => 'failed',
                'type' => 'inspection', 'priority' => 'critical',
                'ref_type' => 'inspection_schedules', 'ref_id' => (int)$r['schedule_id'],
                'roles' => [1, 2, 6, 7],
                'channels' => ['app', 'push'],
                'template' => 'inspections:failed',
                'vars' => [
                    'schedule_title' => (string)($r['schedule_title'] ?? 'ตรวจเช็ครอบ'),
                    'asset_code' => (string)($r['asset_code'] ?? ''), 'asset_name' => (string)($r['asset_name'] ?? ''),
                    'failed_summary' => (int)$r['fail_count'] . ' รายการผิดปกติ',
                ],
                'url' => '/inspections',
                'created_at' => (string)$r['created_at'],
            ]);
        }
        echo "inspection failed check done (" . count($rows) . " candidates)\n";
    } catch (Throwable $e) {
        echo "inspection check skipped (schema mismatch): " . $e->getMessage() . "\n";
    }
}

/* ---------------- Retry การส่งค้าง ---------------- */
if (engHas('retry') || engHas('all')) {
    $retried = NotificationCenterService::retryPending($pdo, 3);
    echo "retry done: {$retried} delivery(s) succeeded\n";
}

echo "== done: {$done} notification(s) fired ==\n";