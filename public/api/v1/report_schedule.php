<?php
/**
 * report_schedule.php — กำหนดการส่งรายงานอัตโนมัติ (Scheduled Reports, Phase 17)
 *
 * GET    /api/v1/report_schedule.php            → รายการกำหนดการทั้งหมด + ตัวเลือก
 * POST   /api/v1/report_schedule.php            → สร้าง/แก้ไขกำหนดการ (body = config JSON)
 * DELETE /api/v1/report_schedule.php?id=5       → ลบกำหนดการ
 *
 * เก็บ config เป็น JSON array ใน settings.setting_key = 'scheduled_reports'
 * เฉพาะผู้เห็นข้อมูลการบริหาร (role 1/2/6) เท่านั้น — เหมือนสิทธิ์ดูต้นทุน
 * ทุก request ที่เปลี่ยนข้อมูลผ่าน enforceCsrf() (token หรือ Origin เดียวกัน)
 * การส่งจริงทำงานโดย scripts/report_scheduler.php (CLI/Scheduler)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/roles.php';
require_once __DIR__ . '/../../../src/helpers/kpi.php';
require_once __DIR__ . '/../../../src/helpers/notification.php'; // getSettingValue()

header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    $user = requireLogin($pdo);
    if (!in_array((int)$user['role_id'], [1, 2, 6], true)) {
        http_response_code(403);
        echo json_encode(['error' => 'เฉพาะผู้จัดการ/ผู้ดูแลระบบเท่านั้นที่ตั้งค่ากำหนดการรายงาน'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
        require_once __DIR__ . '/../../../src/csrf.php';
        enforceCsrf();
    }

    $resources = [
        'center' => 'ภาพรวมระบบซ่อมบำรุง (Report Center)',
        'work-orders' => 'ใบสั่งซ่อม (Work Order)',
        'requests' => 'คำขอแจ้งซ่อม (Maintenance Request)',
        'pm' => 'แผน PM / AM',
        'inspections' => 'การตรวจเช็ครายวัน',
        'assets' => 'เครื่องจักร (Asset)',
        'spare-parts' => 'อะไหล่ (จาก Sage 300)',
        'cost' => 'ต้นทุนซ่อมบำรุง',
        'downtime' => 'Downtime',
        'technicians' => 'สมรรถนะช่าง',
        'sla' => 'SLA',
        'mttr-mtbf' => 'MTTR / MTBF',
    ];
    $allowed = array_keys($resources);

    $load = function () use ($pdo): array {
        $raw = getSettingValue('scheduled_reports', '[]');
        $a = json_decode((string)$raw, true);
        return is_array($a) ? array_values($a) : [];
    };
    $save = function (array $cfg) use ($pdo): void {
        $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description)
                       VALUES ('scheduled_reports', ?, 'Reports', 'Scheduled report configurations (JSON)')
                       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
            ->execute([json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    };

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $configs = $load();
        echo json_encode([
            'configs' => $configs,
            'resources' => $resources,
            'schedules' => [
                ['value' => 'daily', 'label' => 'ทุกวัน', 'needDay' => false],
                ['value' => 'weekly', 'label' => 'รายสัปดาห์', 'needDay' => true],
                ['value' => 'monthly', 'label' => 'รายเดือน', 'needDay' => true],
            ],
            'channels' => [
                ['value' => 'telegram', 'label' => 'Telegram'],
                ['value' => 'line', 'label' => 'LINE'],
                ['value' => 'email', 'label' => 'อีเมล'],
            ],
            'ranges' => [
                ['value' => '', 'label' => 'ค่าเริ่มต้น (30 วัน / ทั้งหมด)'],
                ['value' => '7d', 'label' => '7 วันล่าสุด'],
                ['value' => '30d', 'label' => '30 วันล่าสุด'],
                ['value' => '90d', 'label' => '90 วันล่าสุด'],
                ['value' => '12m', 'label' => '12 เดือนล่าสุด'],
                ['value' => 'today', 'label' => 'วันนี้'],
                ['value' => 'custom', 'label' => 'ช่วงกำหนดเอง (range_start / range_end)'],
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $body = json_decode((string)file_get_contents('php://input'), true);

    if ($method === 'DELETE') {
        $id = (int)($_GET['id'] ?? 0);
        $configs = $load();
        $kept = array_values(array_filter($configs, fn($c) => (int)($c['id'] ?? 0) !== $id));
        $save($kept);
        echo json_encode(['success' => true, 'removed_id' => $id]);
        exit;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---------- validate ----------
    $config = $body['config'] ?? $body;
    if (!is_array($config)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing config'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $name = trim((string)($config['name'] ?? ''));
    $resource = (string)($config['resource'] ?? '');
    $schedule = (string)($config['schedule'] ?? '');
    $time = (string)($config['time'] ?? '');
    $channelsIn = $config['channels'] ?? [];
    if ($name === '' || mb_strlen($name) > 120) { $err = 'name ต้องไม่ว่างและไม่เกิน 120 ตัวอักษร'; }
    elseif (!in_array($resource, $allowed, true)) { $err = 'ไม่รองรับ resource นี้'; }
    elseif (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) { $err = 'เวลา (time) ต้องเป็น HH:MM'; }
    elseif (!in_array($schedule, ['daily', 'weekly', 'monthly'], true)) { $err = 'schedule ต้องเป็น daily/weekly/monthly'; }
    elseif (!is_array($channelsIn) || empty($channelsIn)) { $err = 'ต้องเลือกอย่างน้อย 1 ช่องทางส่ง'; }
    else {
        $err = null;
        $allowedCh = ['telegram', 'line', 'email'];
        foreach ($channelsIn as $ch) if (!in_array((string)$ch, $allowedCh, true)) { $err = 'ช่องทางไม่ถูกต้อง'; break; }
    }
    if ($err !== null) { http_response_code(400); echo json_encode(['error' => $err], JSON_UNESCAPED_UNICODE); exit; }

    // วันในสัปดาห์ / วันในเดือน ตาม schedule
    $dayOfWeek = $schedule === 'weekly' ? (int)($config['day_of_week'] ?? 0) : null;
    $dayOfMonth = $schedule === 'monthly' ? (int)($config['day_of_month'] ?? 0) : null;
    if ($schedule === 'weekly' && ($dayOfWeek < 1 || $dayOfWeek > 7)) { http_response_code(400); echo json_encode(['error' => 'day_of_week ต้องอยู่ 1-7 (จันทร์=1..อาทิตย์=7)']); exit; }
    if ($schedule === 'monthly' && ($dayOfMonth < 1 || $dayOfMonth > 28)) { http_response_code(400); echo json_encode(['error' => 'day_of_month ต้องอยู่ 1-28']); exit; }

    // resource ที่จำกัดสิทธิ์ — ตั้งค่าได้เฉพาะ role ที่เห็นรายงานนั้น
    $roleId = (int)$user['role_id'];
    if ($resource === 'cost' && !kpi_can_see_cost($roleId)) { http_response_code(403); echo json_encode(['error' => 'ไม่มีสิทธิ์ตั้งค่ารายงานต้นทุน']); exit; }
    if ($resource === 'technicians' && !in_array($roleId, [1, 2, 6, 7], true)) { http_response_code(403); echo json_encode(['error' => 'ไม่มีสิทธิ์ตั้งค่ารายงานช่าง']); exit; }

    // filters — รับเฉพาะคีย์ที่ปลอดภัย
    $filters = [];
    $allowedFilters = ['range', 'range_start', 'range_end', 'department_id', 'location_id', 'asset_id',
        'asset_category', 'technician_id', 'source_type', 'priority', 'status', 'year', 'month'];
    foreach (($config['filters'] ?? []) as $fk => $fv) {
        if (in_array((string)$fk, $allowedFilters, true)) $filters[$fk] = (string)$fv;
    }

    // recipients (อีเมล) — ตรวจ format คร่าว ๆ
    $recipients = [];
    foreach (($config['recipients'] ?? []) as $em) {
        $em = trim((string)$em);
        if ($em !== '' && filter_var($em, FILTER_VALIDATE_EMAIL)) $recipients[] = $em;
    }

    $uid = (int)($config['user_id'] ?? 0);
    if ($uid <= 0) $uid = (int)$user['id'];
    $uRow = $pdo->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1');
    $uRow->execute([$uid]);
    if (!$uRow->fetchColumn()) $uid = (int)$user['id'];

    $configs = $load();
    $id = (int)($config['id'] ?? 0);
    if ($id <= 0) {
        $id = time() % 100000; // id เฉพาะสำหรับ config (ไม่ใช่ PK)
        while (in_array($id, array_map(fn($c) => (int)($c['id'] ?? 0), $configs), true)) $id++;
    }

    $entry = [
        'id' => $id,
        'name' => $name,
        'resource' => $resource,
        'schedule' => $schedule,
        'day_of_week' => $dayOfWeek,
        'day_of_month' => $dayOfMonth,
        'time' => $time,
        'channels' => array_values(array_map('strval', $channelsIn)),
        'recipients' => $recipients,
        'filters' => $filters,
        'user_id' => $uid,
        'enabled' => (int)(($config['enabled'] ?? true) ? 1 : 0) === 1,
        'created_by' => (int)$user['id'],
        'created_at' => date('Y-m-d H:i:s'),
        'last_sent_at' => null,
    ];
    // คงค่า last_sent_at เดิมเมื่อแก้ไข config เดิม
    foreach ($configs as $i => $old) {
        if ((int)($old['id'] ?? 0) === $id) {
            $entry['last_sent_at'] = $old['last_sent_at'] ?? null;
            $configs[$i] = $entry;
            $entry = null;
            break;
        }
    }
    if ($entry !== null) $configs[] = $entry;

    $save($configs);
    echo json_encode(['success' => true, 'configs' => $configs], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}