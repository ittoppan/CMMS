<?php
/**
 * scripts/pm_reminders.php — ส่งแจ้งเตือน PM (เกินกำหนด/ถึงกำหนดวันนี้) แบบ best-effort
 *
 * ใช้สำหรับ cron/Task Scheduler (รันบนเซิร์ฟเวอร์ที่มีสิทธิ์อ่าน DB และตั้งค่า env ช่องทางแจ้งเตือนแล้ว)
 * ไม่ mutate สถานะ PM — dedupe ด้วย `pm_am.last_notified_at` + cooldown (settings `pm_reminder_cooldown_hours`, default 20 ชม.)
 * ต้องรัน migration `database/migration_20261118_pm_reminders_dedupe_proposal.sql` ก่อนใช้โค้ดนี้
 *
 * ตัวอย่าง:
 *   php scripts/pm_reminders.php                 # ส่งจริง
 *   php scripts/pm_reminders.php --dry-run       # แสดงแผน/จำนวนที่จะส่ง ไม่ส่ง และไม่เขียน DB
 *   php scripts/pm_reminders.php --limit=200     # จำกัดจำนวนรอบที่สแกน (ค่าเริ่มต้น 500)
 *
 * exit code: 0 = ปกติ, 1 = error, 2 = มี notify error บางราย
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/pm_reminders.php';

$dry = in_array('--dry-run', $argv ?? [], true) || in_array('--dry', $argv ?? [], true);
$limit = 500;
foreach (($argv ?? []) as $a) {
    if (preg_match('/^--limit=(\d+)$/', $a, $m)) $limit = (int)$m[1];
}

try {
    $pdo = getDb();
    $today = date('Y-m-d');
    $summary = pm_reminders_summary($pdo, $today);

    if ($dry) {
        $plan = pm_reminders_plan($pdo, $today, $limit);
        echo "[dry-run] PM reminders " . $today . PHP_EOL;
        echo json_encode(['summary' => $summary['summary']] + $plan, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
        exit(0);
    }

    $res = pm_reminders_run($pdo, $today, $limit);
    echo json_encode(['summary' => $summary['summary']] + $res, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;

    // 1 บรรทัดต่อการรัน สำหรับ cron/Task Scheduler (logs/pm_reminders.log)
    $logDir = dirname(__DIR__) . '/logs';
    if (!is_dir($logDir)) @mkdir($logDir, 0775, true);
    if (is_dir($logDir)) {
        @file_put_contents(
            $logDir . '/pm_reminders.log',
            sprintf(
                "%s pm_reminders run=%s scanned=%d notified_users=%d claimed_cycles=%d skipped_users=%d errors=%d cooldown_h=%d dedupe=%d\n",
                date('Y-m-d H:i:s'),
                $res['today'] ?? $today,
                (int)($res['scanned_cycles'] ?? 0),
                (int)($res['users_notified'] ?? 0),
                (int)($res['notified_cycles'] ?? 0),
                (int)($res['skipped_duplicate'] ?? 0),
                (int)($res['notify_errors'] ?? 0),
                (int)($res['cooldown_hours'] ?? 0),
                !empty($res['dedupe']) ? 1 : 0
            ),
            FILE_APPEND
        );
    }

    exit(($res['notify_errors'] ?? 0) > 0 ? 2 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, "pm_reminders error: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
