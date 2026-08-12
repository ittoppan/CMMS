<?php
/**
 * watchdog-notify.php - CLI helper: ส่ง LINE Notify จากสคริปต์ PowerShell (watchdog)
 *
 * 用法:
 *   php watchdog-notify.php <path-to-message-file>
 *
 * อ่านข้อความจากไฟล์ชั่วคราว (หลีกเลี่ยงปัญหา quoting ใน PowerShell/cmd)
 * token อ่านจาก settings table / env LINE_NOTIFY_TOKEN ผ่าน NotificationService
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(2);
}

$msgFile = $argv[1] ?? '';
if ($msgFile === '' || !is_file($msgFile)) {
    fwrite(STDERR, "usage: php watchdog-notify.php <message-file>\n");
    exit(2);
}

require_once __DIR__ . '/../src/services/NotificationService.php';

$message = (string)file_get_contents($msgFile);
$message = trim($message);
if ($message === '') {
    fwrite(STDERR, "empty message\n");
    exit(2);
}

try {
    $ok = NotificationService::sendLineMessage($message);
} catch (Throwable $e) {
    fwrite(STDERR, "sendLineMessage threw: " . $e->getMessage() . "\n");
    exit(1);
}

exit($ok ? 0 : 1);
