<?php
/**
 * scripts/pm_reminders.php — ส่งแจ้งเตือน PM (เกินกำหนด/ถึงกำหนดวันนี้) แบบ best-effort
 *
 * ใช้สำหรับ cron/Task Scheduler (รันบนเซิร์ฟเวอร์ที่มีสิทธิ์อ่าน DB และตั้งค่า env ช่องทางแจ้งเตือนแล้ว)
 * ไม่ mutate สถานะ PM, ไม่มี dedupe ใน schema (ควรตั้งความถี่ cron ให้เหมาะสม เช่น วันละครั้งช่วงเช้า)
 *
 * ตัวอย่าง:
 *   php scripts/pm_reminders.php                 # ส่งจริง
 *   php scripts/pm_reminders.php --dry-run       # แสดงสรุป/รายการเป้าหมาย ไม่ส่ง
 *   php scripts/pm_reminders.php --limit=200     # จำกัดจำนวนรอบที่สแกน (ค่าเริ่มต้น 500)
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
        // preview targets without sending
        $st = $pdo->prepare("SELECT id, title, asset_id, asset_name, due_date, assigned_to, status
                             FROM pm_am
                             WHERE status NOT IN ('completed','cancelled','skipped')
                               AND assigned_to IS NOT NULL AND assigned_to > 0
                               AND (
                                   status='overdue'
                                   OR (status='pending' AND due_date <= :t1)
                                   OR (status='in_progress' AND due_date < :t2)
                               )
                             ORDER BY due_date ASC, id ASC
                             LIMIT " . (int)max(1, min(2000, $limit)));
        $st->execute([':t1' => $today, ':t2' => $today]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        echo "[dry-run] PM reminders " . $today . PHP_EOL;
        echo json_encode(['summary' => $summary['summary'], 'scanned_cycles' => count($rows)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
        exit(0);
    }

    $res = pm_reminders_run($pdo, $today, $limit);
    echo json_encode(['summary' => $summary['summary']] + $res, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    exit(($res['notify_errors'] ?? 0) > 0 ? 2 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, "pm_reminders error: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
