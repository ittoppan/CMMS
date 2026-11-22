<?php
// scripts/unlock_login.php — ปลดล็อกตัวนับล็อกอิน (CLI เท่านั้น)
// ใช้: php scripts/unlock_login.php <username>   หรือ   php scripts/unlock_login.php --all-e2e
if (php_sapi_name() !== 'cli') { fwrite(STDERR, "CLI only\n"); exit(1); }
require __DIR__ . '/../src/config/db.php';
$pdo = getDb();
$arg = $argv[1] ?? '';
if ($arg === '--all-e2e') {
    $st = $pdo->prepare("DELETE FROM iot_rate_limits WHERE scope_key LIKE 'login_lock:e2e_%' OR scope_key LIKE 'login_user:e2e_%' OR scope_key LIKE 'login_ip:%'");
    $st->execute();
    echo "cleared e2e login counters: " . $st->rowCount() . " rows\n";
    exit(0);
}
if ($arg === '') { fwrite(STDERR, "usage: php scripts/unlock_login.php <username>|--all-e2e\n"); exit(1); }
$user = mb_strtolower(mb_substr($arg, 0, 60));
$st = $pdo->prepare("DELETE FROM iot_rate_limits WHERE scope_key LIKE ? OR scope_key LIKE ?");
$st->execute(['login_lock:' . $user . ':%', 'login_user:' . $user]);
echo "cleared login counters for " . $user . ": " . $st->rowCount() . " rows\n";
