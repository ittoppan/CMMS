<?php
/**
 * scripts/daily_digest.php — สรุปสถานะประจำวัน (รันผ่าน cron/watchdog วันละครั้ง)
 *
 * ใช้: php scripts/daily_digest.php
 * หรือเรียกผ่าน watchdog/scheduler ที่มีอยู่
 *
 * ส่งสรุปไป Telegram (ถ้า telegram_enabled) — ข้อมูลมาจาก DB จริงเท่านั้น
 */
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/auth.php';
require_once __DIR__ . '/../src/helpers/settings.php';
require_once __DIR__ . '/../src/helpers/notification.php';

try {
    $pdo = getDb();

    $openWo = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE LOWER(COALESCE(status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')")->fetchColumn();
    $overdue = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE COALESCE(sla_due_at, estimated_completion_date) IS NOT NULL AND COALESCE(sla_due_at, estimated_completion_date) < NOW() AND LOWER(COALESCE(status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')")->fetchColumn();
    $critical = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE priority='critical' AND LOWER(COALESCE(status,'')) NOT IN ('completed','closed','resolved','rejected','cancelled')")->fetchColumn();

    // PM due today
    $pmDue = 0;
    try {
        $pmDue = (int)$pdo->query("SELECT COUNT(*) FROM pm_plans WHERE DATE(next_due_date) = CURDATE()")->fetchColumn();
    } catch (Throwable $e) { /* table may differ */ }
    // fallback pm_am
    if ($pmDue === 0) {
        try { $pmDue = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE DATE(next_pm_date) = CURDATE()")->fetchColumn(); } catch (Throwable $e) {}
    }

    // Low stock
    $lowStock = 0;
    try {
        $lowStock = (int)$pdo->query("SELECT COUNT(*) FROM spare_parts WHERE stock_qty <= min_stock_qty AND min_stock_qty > 0")->fetchColumn();
    } catch (Throwable $e) {}

    $msg = "สรุปสถานะประจำวัน CMMS-TPT\n"
         . "งานซ่อมเปิดอยู่: {$openWo}\n"
         . "เกินกำหนด: {$overdue}\n"
         . "วิกฤต: {$critical}\n"
         . "PM ครบกำหนดวันนี้: {$pmDue}\n"
         . "อะไหล่ต่ำกว่า min: {$lowStock}\n"
         . "เวลา: " . date('Y-m-d H:i');

    if (function_exists('telegramAdminAlert')) {
        telegramAdminAlert('สรุปประจำวัน', $msg, null, 'INFO');
    } elseif (function_exists('telegramSend')) {
        telegramSend($msg);
    } else {
        // fallback: print to stdout for cron capture
        echo $msg . "\n";
    }
    echo "OK\n";
} catch (Throwable $e) {
    error_log('daily_digest: ' . $e->getMessage());
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
