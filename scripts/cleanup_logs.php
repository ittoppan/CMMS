<?php
/**
 * cleanup_logs.php — ลบ notification_logs เก่าอัตโนมัติตามนโยบายเก็บรักษา (retention)
 *
 *   log_retention_enabled = 1  -> ลบรายการที่เก่ากว่า log_retention_days วัน
 *   log_retention_enabled = 0  -> ไม่ลบ (skip)
 *
 * รันวันละ 1 ครั้งผ่าน scripts/watchdog.ps1 (Scheduled Task CMMS-Watchdog ทุกนาที
 * ใช้ date-file marker กันรันซ้ำในวันเดียวกัน) — ตั้งค่าได้ที่หน้า ตั้งค่าระบบทั้งหมด
 *
 * ตัวอย่าง:
 *   php scripts/cleanup_logs.php
 *   -> {"deleted":123,"before":456,"after":333}  หรือ  {"skipped":true,"reason":"disabled"}
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/notification.php'; // getSettingValue

$logFile = __DIR__ . '/../logs/watchdog.log';

function retentionLog(string $msg): void {
    global $logFile;
    $dir = dirname($logFile);
    if (!is_dir($dir)) { @mkdir($dir, 0777, true); }
    @file_put_contents($logFile, date('Y-m-d H:i:s') . " [cleanup_logs] " . $msg . PHP_EOL, FILE_APPEND);
}

try {
    $pdo = getDb();

    $enabled = getSettingValue('log_retention_enabled', '0') === '1';
    $days = max(1, (int)getSettingValue('log_retention_days', '90'));

    if (!$enabled) {
        retentionLog('disabled (log_retention_enabled=0) — skip');
        echo json_encode(['skipped' => true, 'reason' => 'disabled', 'days' => $days], JSON_UNESCAPED_UNICODE);
        exit(0);
    }

    $before = (int)$pdo->query('SELECT COUNT(*) FROM notification_logs')->fetchColumn();

    $stmt = $pdo->prepare('DELETE FROM notification_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)');
    $stmt->execute([$days]);
    $deleted = $stmt->rowCount();
    $after = $before - $deleted;

    retentionLog("deleted {$deleted} rows older than {$days} days (before={$before} after={$after})");

    // กันตารางโตโดยไม่รู้ตัว: แจ้งแอดมินผ่าน Telegram (ช่องระบบ) เฉพาะเมื่อลบเยอะผิดปกติ
    if ($deleted > 5000) {
        $msg = "🧹 cleanup_logs: ลบ notification_logs เก่า {$deleted} แถว (> {$days} วัน)";
        if (function_exists('sendTelegramMessage')) {
            @sendTelegramMessage("<b>CMMS — Log Retention</b>" . PHP_EOL . $msg);
        }
        retentionLog("large delete ({$deleted}) — notified admin");
    }

    echo json_encode(['deleted' => $deleted, 'before' => $before, 'after' => $after, 'days' => $days], JSON_UNESCAPED_UNICODE);
    exit(0);
} catch (Throwable $e) {
    retentionLog('ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit(1);
}
