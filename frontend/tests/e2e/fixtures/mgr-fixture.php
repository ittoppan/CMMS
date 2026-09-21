<?php
// E2E Phase 26: transient manager-labeled user for the dashboard widget check.
// usage: php mgr-fixture.php up|down [password]
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$cmd = $argv[1] ?? '';
if ($cmd === 'up') {
    $pw = $argv[2] ?? 'x';
    $pdo->exec("DELETE FROM users WHERE username='e2e_mgr'");
    $hash = password_hash($pw, PASSWORD_BCRYPT);
    $pdo->prepare("INSERT INTO users (role_id, role, username, email, password, full_name, is_active, must_change_password) VALUES (2,'manager','e2e_mgr','e2e_mgr@cmms.local',?,'E2E Budget Mgr',1,0)")->execute([$hash]);
    echo "ok";
} elseif ($cmd === 'down') {
    echo "deleted:" . $pdo->exec("DELETE FROM users WHERE username='e2e_mgr'");
}