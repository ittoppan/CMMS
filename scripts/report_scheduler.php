<?php
/**
 * scripts/report_scheduler.php — ส่งรายงานตามกำหนดการ (Scheduled Reports, Phase 17)
 *
 * วิธีใช้:
 *   php scripts/report_scheduler.php                 # ตรวจกำหนดการที่ถึงเวลา แล้วส่ง
 *   php scripts/report_scheduler.php --force         # ส่งทุกกำหนดการที่เปิดใช้งาน (ไม่สนใจเวลา)
 *   php scripts/report_scheduler.php --force --id=3  # ส่งเฉพาะ config id 3
 *   php scripts/report_scheduler.php --dry           # แสดงว่าจะส่งอะไรบ้าง (ไม่ส่งจริง)
 *
 * กลไก:
 *   - อ่าน config จาก settings.scheduled_reports (JSON array — สร้างผ่าน /api/v1/report_schedule.php)
 *   - สร้างข้อมูลสรุปจาก src/helpers/reports.php (rpt_dispatch) — ใช้ข้อมูลจริง + KPI สูตรเดียวกับหน้าเว็บ
 *   - ส่งช่องทาง: Telegram (sendTelegramMessage) / LINE (NotificationService) / อีเมล (sendEmail)
 *   - dedup: notification_logs needle 'RPT-SCHED:configId:period' — ป้องกันส่งซ้ำถ้า run หลายรอบ
 *   - ต้องเรียกผ่าน cron/Task Scheduler (เช่น ทุก ๆ 5 นาที) — การประมูลวัน/เวลาเป็นหน้าที่ script นี้
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/roles.php';
require_once __DIR__ . '/../src/helpers/kpi.php';
require_once __DIR__ . '/../src/helpers/reports.php';
require_once __DIR__ . '/../src/helpers/notification.php'; // getSettingValue / sendTelegramMessage
require_once __DIR__ . '/../src/services/NotificationService.php';

$force = in_array('--force', $argv, true);
$dry = in_array('--dry', $argv, true);
$onlyId = 0;
foreach ($argv as $a) {
    if (preg_match('/^--id=(\d+)$/', $a, $m)) $onlyId = (int)$m[1];
}

$pdo = getDb();

/* ---------- helpers ---------- */

/** ตรวจว่า config นี้ถึงเวลาส่งหรือยัง (daily/weekly/monthly + time) */
function rpt_sched_due(array $c, string $now = ''): bool {
    $now = $now !== '' ? $now : date('Y-m-d H:i');
    [$d, $t] = explode(' ', $now);
    $targetTime = (string)($c['time'] ?? '08:00');
    if ($t < $targetTime) return false;

    switch ((string)($c['schedule'] ?? '')) {
        case 'weekly':
            return (int)date('N', strtotime($d)) === (int)($c['day_of_week'] ?? 0);
        case 'monthly':
            return (int)date('j', strtotime($d)) === (int)($c['day_of_month'] ?? 0);
        default: // daily
            return strtotime($d) <= strtotime(date('Y-m-d'));
    }
}

function rpt_sched_period(array $c): string {
    switch ((string)($c['schedule'] ?? '')) {
        case 'weekly': return date('Y-W');
        case 'monthly': return date('Y-m');
        default: return date('Y-m-d');
    }
}

function rpt_sched_fmt_money($v): string {
    return number_format((float)$v, 0, '.', ',');
}

/** สร้างข้อความสรุปรายงานจาก payload ของ rpt_dispatch */
function rpt_sched_summary(string $name, string $resource, array $data): string {
    $title = $data['title_th'] ?? $name;
    $lines = [];
    $lines[] = '📊 <b>' . $title . '</b>';
    $lines[] = '----------------------------------';
    foreach (($data['kpi'] ?? []) as $k) {
        if ($k === null) continue;
        $val = $k['value'];
        if ($val === null || $val === '') $val = '-';
        $unit = !empty($k['unit']) ? ' ' . $k['unit'] : '';
        $lines[] = '• ' . $k['label'] . ': <b>' . $val . '</b>' . $unit;
    }
    $table = $data['table'] ?? null;
    if ($table && !empty($table['rows'])) {
        $rows = array_slice($table['rows'], 0, 8);
        $lines[] = '----------------------------------';
        foreach ($rows as $r) {
            $first = '';
            foreach ($table['columns'] as $i => $col) {
                if ($col['key'] === '_href') continue;
                if ($i > 1) break; // แสดง 2 คอลัมน์แรกพอ
                $v = $r[$col['key']] ?? '';
                $first .= ($first !== '' ? ' | ' : '') . (string)$v;
            }
            if ($first !== '') $lines[] = '• ' . $first;
        }
        $lines[] = 'ทั้งหมด ' . (int)($table['total'] ?? count($table['rows'])) . ' รายการ';
    }
    $lines[] = '----------------------------------';
    $lines[] = '🕒 ' . date('d/m/Y H:i') . ' · รายงานอัตโนมัติจาก CMMS';
    return implode("\n", $lines);
}

function rpt_sched_log(PDO $pdo, string $needle, string $channel, string $status, string $content): void {
    try {
        $pdo->prepare("INSERT INTO notification_logs (channel, status, content, created_at) VALUES (?, ?, ?, NOW())")
            ->execute([$channel, $status, mb_substr($content, 0, 1000)]);
        if ($status === 'SENT') { // dedup marker
            $pdo->prepare("INSERT INTO notification_logs (channel, status, content, created_at) VALUES ('SCHED', 'SENT', ?, NOW())")
                ->execute([$needle]);
        }
    } catch (Throwable $e) {
        error_log('[report_scheduler] log: ' . $e->getMessage());
    }
}

function rpt_sched_sent_before(PDO $pdo, string $needle): bool {
    $st = $pdo->prepare("SELECT 1 FROM notification_logs WHERE channel = 'SCHED' AND status = 'SENT' AND content = ? LIMIT 1");
    $st->execute([$needle]);
    return (bool)$st->fetchColumn();
}

/* ---------- main ---------- */

$raw = getSettingValue('scheduled_reports', '[]');
$configs = json_decode((string)$raw, true);
if (!is_array($configs)) {
    echo "no scheduled_reports config\n";
    exit(0);
}

$anything = false;
foreach ($configs as $c) {
    if (!is_array($c)) continue;
    $id = (int)($c['id'] ?? 0);
    if ($onlyId > 0 && $id !== $onlyId) continue;
    if (!($c['enabled'] ?? true)) { echo "#$id disabled, skip\n"; continue; }

    $name = (string)($c['name'] ?? 'unnamed');
    $resource = (string)($c['resource'] ?? '');
    $needle = 'RPT-SCHED:' . $id . ':' . rpt_sched_period($c);

    if (!$force) {
        if ($onlyId === 0 && !rpt_sched_due($c)) { echo "#$id ($name) not due\n"; continue; }
        if ($onlyId > 0 && !rpt_sched_due($c)) { echo "#$id ($name) not due (ใช้ --force เพื่อข้ามเวลา)\n"; continue; }
    }
    if (rpt_sched_sent_before($pdo, $needle) && !$force) {
        echo "#$id ($name) already sent for {$needle}\n";
        continue;
    }

    // ---------- build data (ข้อมูลจริง, scope/filter ตาม user ใน config) ----------
    $uid = (int)($c['user_id'] ?? 1);
    $uRow = $pdo->prepare('SELECT id, full_name, role_id, role FROM users WHERE id = ?');
    $uRow->execute([$uid]);
    $u = $uRow->fetch(PDO::FETCH_ASSOC);
    if (!$u) { echo "#$id user $uid missing, skip\n"; continue; }

    $opts = array_merge([
        'role_id' => (int)($u['role_id'] ?? 1),
        'user_id' => (int)$u['id'],
        'range' => '', 'range_start' => '', 'range_end' => '',
        'department_id' => '', 'location_id' => '', 'asset_id' => '', 'asset_category' => '',
        'technician_id' => '', 'source_type' => '', 'priority' => '', 'status' => '',
    ], (array)($c['filters'] ?? []));
    $user = ['id' => (int)$u['id'], 'full_name' => (string)$u['full_name'], 'role_id' => (int)$u['role_id']];

    try {
        $data = rpt_dispatch($pdo, $user, $resource, $opts);
    } catch (Throwable $e) {
        echo "#$id ($name) generate failed: " . $e->getMessage() . "\n";
        continue;
    }
    if (empty($data['kpi']) && empty($data['table'])) {
        echo "#$id ($name) no data\n";
        continue;
    }

    $message = rpt_sched_summary($name, $resource, $data);
    $anything = true;

    if ($dry) {
        echo "== [dry] #$id ($name) $needle ==\n$message\n\n";
        continue;
    }

    // ---------- send ----------
    $results = [];
    foreach ((array)($c['channels'] ?? []) as $ch) {
        switch ($ch) {
            case 'telegram':
                $ok = sendTelegramMessage($message);
                $results[] = 'telegram:' . ($ok ? 'SENT' : 'FAILED');
                rpt_sched_log($pdo, $needle, 'TELEGRAM', $ok ? 'SENT' : 'FAILED', $message);
                break;
            case 'line':
                try {
                    $ok = NotificationService::sendLineMessage(strip_tags($message));
                    $results[] = 'line:' . ($ok ? 'SENT' : 'FAILED');
                    rpt_sched_log($pdo, $needle, 'LINE', $ok ? 'SENT' : 'FAILED', strip_tags($message));
                } catch (Throwable $e) {
                    $results[] = 'line:FAILED';
                    rpt_sched_log($pdo, $needle, 'LINE', 'FAILED', (string)$e->getMessage());
                }
                break;
            case 'email':
                $to = (array)($c['recipients'] ?? []);
                if (empty($to)) { $results[] = 'email:NO_RECIPIENT'; break; }
                foreach ($to as $em) {
                    $ok = NotificationService::sendEmail($em, '[CMMS] ' . $name . ' ' . rpt_sched_period($c),
                        nl2br(htmlspecialchars(strip_tags($message), ENT_QUOTES, 'UTF-8')));
                    $results[] = 'email:' . ($ok ? 'SENT' : 'FAILED');
                    rpt_sched_log($pdo, $needle, 'EMAIL', $ok ? 'SENT' : 'FAILED', $message);
                }
                break;
        }
    }

    // update last_sent_at + save
    foreach ($configs as $i => $old) {
        if ((int)($old['id'] ?? 0) === $id) {
            $configs[$i]['last_sent_at'] = date('Y-m-d H:i:s');
            break;
        }
    }
    try {
        $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description)
                       VALUES ('scheduled_reports', ?, 'Reports', 'Scheduled report configurations (JSON)')
                       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)")
            ->execute([json_encode($configs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    } catch (Throwable $e) { error_log('[report_scheduler] save: ' . $e->getMessage()); }

    echo "== #$id ($name) $needle: " . implode(',', $results) . " ==\n";
}

if (!$anything) echo "report_scheduler: nothing to run\n";
exit(0);