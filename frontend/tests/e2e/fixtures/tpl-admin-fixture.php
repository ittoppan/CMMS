<?php
// E2E: transient admin user that can create checklist templates (perm inspection.create),
// plus cleanup of the template created by the test.
// usage: php tpl-admin-fixture.php up <username> <password>
//        php tpl-admin-fixture.php down <username> <template_code>
require_once 'C:/inetpub/wwwroot/cmms-tpt/src/config/db.php';
$pdo = getDb();
$cmd = $argv[1] ?? '';
$user = $argv[2] ?? 'e2e_tpl_a11y';

if ($cmd === 'up') {
    $pw = $argv[3] ?? 'x';
    $pdo->prepare("DELETE FROM users WHERE username = ?")->execute([$user]);
    $hash = password_hash($pw, PASSWORD_BCRYPT);
    $pdo->prepare("INSERT INTO users (role_id, role, username, email, password, full_name, is_active, must_change_password) VALUES (1,'admin',?,'e2e_tpl_a11y@cmms.local',?,'E2E Template A11y',1,0)")
        ->execute([$user, $hash]);
    echo "up:" . $user;
} elseif ($cmd === 'down') {
    $code = $argv[3] ?? '';
    if ($code !== '') {
        $st = $pdo->prepare("SELECT id FROM checklist_templates WHERE code = ?");
        $st->execute([$code]);
        $tid = (int)$st->fetchColumn();
        if ($tid) {
            $pdo->prepare("DELETE FROM checklist_template_items WHERE template_id = ?")->execute([$tid]);
            $pdo->prepare("DELETE FROM checklist_templates WHERE id = ?")->execute([$tid]);
        }
        echo "template_deleted:" . ($tid ? 1 : 0) . " ";
    }
    $st = $pdo->prepare("DELETE FROM users WHERE username = ?");
    $st->execute([$user]);
    echo "user_deleted:" . $st->rowCount();
}
