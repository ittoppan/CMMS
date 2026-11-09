<?php
/**
 * scripts/test_notification_center.php — behavioral harness for
 * src/services/NotificationCenterService.php (Phase 16 notification engine).
 *
 * Covers: install/seed templates, notify (template, dedup, recipients,
 * exclude, inactive, channel master-switch filtering), list/counts,
 * markRead/markAllRead, preferences, rules CRUD, retryPending.
 * External channels are disabled via settings so no network is used.
 *
 * Runs against a THROWAWAY database named <live>_nctest.
 *   php scripts/test_notification_center.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

function parseDotEnv(string $path): array {
    $out = [];
    if (!is_file($path)) return $out;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }
    return $out;
}

$KEEP = in_array('--keep', $argv ?? [], true);

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_nctest';

if (!str_ends_with($scratch, '_nctest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "NotificationCenter harness on scratch DB: $scratch (live: $live)\n";
$admin->exec("DROP DATABASE IF EXISTS `$scratch`");
$admin->exec("CREATE DATABASE `$scratch` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$tables = $admin->query("SELECT TABLE_NAME FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = " . $admin->quote($live) . " AND TABLE_TYPE = 'BASE TABLE'
                         ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_COLUMN);
$admin->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($tables as $t) $admin->exec("CREATE TABLE `$scratch`.`$t` LIKE `$live`.`$t`");
$admin->exec('SET FOREIGN_KEY_CHECKS=1');
echo 'Cloned structure of ' . count($tables) . " tables.\n";
unset($admin);

$_ENV['DB_HOST'] = $host; $_ENV['DB_PORT'] = $port; $_ENV['DB_USER'] = $user; $_ENV['DB_PASS'] = $pass; $_ENV['DB_NAME'] = $scratch;
putenv("DB_HOST=$host"); putenv("DB_PORT=$port"); putenv("DB_USER=$user"); putenv("DB_PASS=$pass"); putenv("DB_NAME=$scratch");

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/services/NotificationCenterService.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

function ins(PDO $pdo, string $table, array $data): int {
    $cols = array_keys($data);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES ('
        . implode(',', array_fill(0, count($cols), '?')) . ')';
    $pdo->prepare($sql)->execute(array_values($data));
    return (int)$pdo->lastInsertId();
}

/* Disable all external channels so only 'app' passes (no network calls).
   Seed BEFORE the first getSettingValue() call (it caches the whole map). */
ins($pdo, 'settings', ['setting_key' => 'line_notify_enabled', 'setting_value' => '0']);
ins($pdo, 'settings', ['setting_key' => 'email_notify_enabled', 'setting_value' => '0']);
ins($pdo, 'settings', ['setting_key' => 'telegram_enabled', 'setting_value' => '0']);
ins($pdo, 'settings', ['setting_key' => 'push_alert_enabled', 'setting_value' => '0']);

$U1 = ins($pdo, 'users', ['username' => 'u1', 'email' => 'u1@x.io', 'password' => 'x', 'full_name' => 'User One', 'role_id' => 5, 'is_active' => 1]);
$U2 = ins($pdo, 'users', ['username' => 'u2', 'email' => 'u2@x.io', 'password' => 'x', 'full_name' => 'User Two', 'role_id' => 5, 'is_active' => 1]);
$U3 = ins($pdo, 'users', ['username' => 'u3', 'email' => 'u3@x.io', 'password' => 'x', 'full_name' => 'User Off', 'role_id' => 5, 'is_active' => 0]);

/* ================================================================= 1. install + templates */
echo "\n[1] install() + seedTemplates()\n";
NotificationCenterService::install($pdo);
$expected = count(NotificationCenterService::defaultTemplates());
$tplCount = (int)$pdo->query('SELECT COUNT(*) FROM notification_templates')->fetchColumn();
check('templates seeded', $tplCount === $expected, "$tplCount vs $expected");
check('template repair:created exists', (int)$pdo->query("SELECT COUNT(*) FROM notification_templates WHERE module='repair' AND event='created'")->fetchColumn() === 1);
$tpl0 = NotificationCenterService::defaultTemplates()[0];
check('default template has keys', isset($tpl0['module'], $tpl0['event'], $tpl0['priority'], $tpl0['title_template'], $tpl0['message_template'], $tpl0['url_template']));
check('install idempotent (still one set)', $expected === (int)$pdo->query('SELECT COUNT(*) FROM notification_templates')->fetchColumn());

/* ================================================================= 2. notify — basic + template */
echo "\n[2] notify() — basic & template\n";
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'created', 'users' => [$U1], 'force' => true, 'channels' => ['app']]);
check('creates 1 inbox row', $n === 1, (string)$n);
$row = $pdo->query("SELECT * FROM notifications WHERE user_id=$U1 ORDER BY id DESC LIMIT 1")->fetch();
check('fallback title uppercased module+event', ($row['title'] ?? '') === 'REPAIR CREATED', (string)($row['title'] ?? ''));
check('type defaults to module', ($row['type'] ?? '') === 'repair');
check('priority default info', ($row['priority'] ?? '') === 'info');
check('linked to notification_event', (int)($row['source_event_id'] ?? 0) > 0);
$ev = $pdo->query("SELECT * FROM notification_events WHERE id=" . (int)$row['source_event_id'])->fetch();
check('event_key default form', ($ev['event_key'] ?? '') === 'repair:created::0', (string)($ev['event_key'] ?? ''));
check('app delivery recorded sent', (int)$pdo->query("SELECT COUNT(*) FROM notification_deliveries WHERE notification_id=" . (int)$row['id'] . " AND channel='app' AND status='sent'")->fetchColumn() === 1);

$n = NotificationCenterService::notify($pdo, [
    'module' => 'repair', 'event' => 'created', 'users' => [$U1], 'force' => true, 'channels' => ['app'],
    'template' => 'repair:created',
    'vars' => ['work_order_no' => 'WO-9', 'title' => 'Pump leak', 'asset_code' => 'A-1', 'asset_name' => 'Pump', 'priority' => 'high', 'status' => 'open', 'reporter_name' => 'Bob'],
]);
check('template notify creates row', $n === 1);
$row = $pdo->query("SELECT * FROM notifications WHERE user_id=$U1 ORDER BY id DESC LIMIT 1")->fetch();
check('template title substituted', ($row['title'] ?? '') === 'งานซ่อมใหม่ WO-9: Pump leak', (string)($row['title'] ?? ''));
check('template message substituted', str_contains((string)$row['message'], 'A-1 - Pump'), (string)$row['message']);
check('template priority applied', ($row['priority'] ?? '') === 'high');
check('url resolved from template', str_contains((string)$row['url'], '/repair/edit'), (string)$row['url']);

$n = NotificationCenterService::notify($pdo, [
    'module' => 'repair', 'event' => 'sla_breached', 'users' => [$U1], 'force' => true, 'channels' => ['app'],
    'template' => 'repair:sla_breached', 'priority' => 'low',
    'vars' => ['work_order_no' => 'WO-1', 'title' => 'T', 'asset_code' => 'A', 'overdue_days' => '2'],
]);
$row = $pdo->query("SELECT * FROM notifications WHERE user_id=$U1 ORDER BY id DESC LIMIT 1")->fetch();
check('explicit priority overrides template', ($row['priority'] ?? '') === 'low', (string)($row['priority'] ?? ''));

/* ================================================================= 3. recipients / dedup */
echo "\n[3] notify() — recipients, exclude, inactive, dedup\n";
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'assigned', 'roles' => [5], 'force' => true, 'channels' => ['app']]);
check('role recipients (U1,U2) → 2', $n === 2, (string)$n);
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'assigned', 'roles' => [5], 'exclude_users' => [$U2], 'force' => true, 'channels' => ['app']]);
check('exclude_users removes U2 → 1', $n === 1, (string)$n);
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'assigned', 'users' => [$U3], 'force' => true, 'channels' => ['app']]);
check('inactive user skipped → 0', $n === 0, (string)$n);
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'escalated', 'users' => [$U1], 'event_key' => 'DEDUP1', 'dedup_hours' => 24, 'channels' => ['app']]);
check('dedup first call → 1', $n === 1, (string)$n);
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'escalated', 'users' => [$U1], 'event_key' => 'DEDUP1', 'dedup_hours' => 24, 'channels' => ['app']]);
check('dedup second call → 0', $n === 0, (string)$n);
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'escalated', 'users' => [$U1], 'event_key' => 'DEDUP1', 'dedup_hours' => 24, 'force' => true, 'channels' => ['app']]);
check('force bypasses dedup → 1', $n === 1, (string)$n);

/* ================================================================= 4. channel filtering */
echo "\n[4] notify() — master-switch channel filtering\n";
$n = NotificationCenterService::notify($pdo, ['module' => 'repair', 'event' => 'closed', 'users' => [$U1], 'force' => true, 'channels' => ['app', 'line', 'push', 'email', 'telegram']]);
check('inbox still created', $n === 1, (string)$n);
$nid = (int)$pdo->query("SELECT id FROM notifications WHERE user_id=$U1 ORDER BY id DESC LIMIT 1")->fetchColumn();
$chans = $pdo->query("SELECT channel FROM notification_deliveries WHERE notification_id=$nid")->fetchAll(PDO::FETCH_COLUMN);
check('only app channel delivered (others master-off)', $chans === ['app'], json_encode($chans));

/* ================================================================= 5. list / counts */
echo "\n[5] listForUser() / countsForUser()\n";
$pdo->exec('DELETE FROM notifications');
$pdo->exec('DELETE FROM notification_deliveries');
$now = date('Y-m-d H:i:s');
$A = ins($pdo, 'notifications', ['user_id' => $U1, 'type' => 'work_order', 'module' => 'repair', 'event' => 'created', 'title' => 'Alpha pump', 'priority' => 'high']);
$B = ins($pdo, 'notifications', ['user_id' => $U1, 'type' => 'pm', 'module' => 'pm_am', 'event' => 'due', 'title' => 'Beta belt', 'priority' => 'medium', 'read_at' => $now]);
$C = ins($pdo, 'notifications', ['user_id' => $U1, 'type' => 'work_order', 'module' => 'repair', 'event' => 'closed', 'title' => 'Gamma valve', 'priority' => 'low']);
$D = ins($pdo, 'notifications', ['user_id' => $U2, 'type' => 'work_order', 'module' => 'repair', 'event' => 'created', 'title' => 'Other', 'priority' => 'info']);
$c = NotificationCenterService::countsForUser($pdo, $U1);
check('counts unread = 2', ($c['unread'] ?? -1) === 2, json_encode($c));
check('counts total = 3', ($c['total'] ?? -1) === 3);
check('counts by_type work_order=2', ($c['by_type']['work_order'] ?? -1) === 2);
check('counts by_module repair=2', ($c['by_module']['repair'] ?? -1) === 2);
$l = NotificationCenterService::listForUser($pdo, $U1, ['tab' => 'unread']);
check('unread list size 2', count($l['items']) === 2);
check('unread items all unread', array_reduce($l['items'], fn($carry, $i) => $carry && $i['read_at'] === null, true));
$l = NotificationCenterService::listForUser($pdo, $U1, ['tab' => 'read']);
check('read list size 1', count($l['items']) === 1 && $l['items'][0]['id'] === $B);
$l = NotificationCenterService::listForUser($pdo, $U1, ['type' => 'work_order']);
check('type filter size 2', count($l['items']) === 2);
$l = NotificationCenterService::listForUser($pdo, $U1, ['module' => 'pm_am']);
check('module filter size 1', count($l['items']) === 1);
$l = NotificationCenterService::listForUser($pdo, $U1, ['search' => 'Beta']);
check('search filter size 1', count($l['items']) === 1 && $l['items'][0]['id'] === $B);
$l = NotificationCenterService::listForUser($pdo, $U1, ['limit' => 1]);
check('limit honoured', count($l['items']) === 1);
check('list returns counts', isset($l['counts']['unread']));

/* ================================================================= 6. markRead / markAllRead */
echo "\n[6] markRead() / markAllRead()\n";
check('markRead own → 1', NotificationCenterService::markRead($pdo, $U1, [$A]) === 1);
check('markRead idempotent → 0', NotificationCenterService::markRead($pdo, $U1, [$A]) === 0);
check('markRead other user id → 0', NotificationCenterService::markRead($pdo, $U1, [$D]) === 0);
check('markAllRead unread left = 1', NotificationCenterService::markAllRead($pdo, $U1) === 1, (string)NotificationCenterService::markAllRead($pdo, $U1));
check('markAllRead second → 0', NotificationCenterService::markAllRead($pdo, $U1) === 0);
check('other user still unread', (int)$pdo->query("SELECT COUNT(*) FROM notifications WHERE user_id=$U2 AND read_at IS NULL")->fetchColumn() === 1);

/* ================================================================= 7. preferences */
echo "\n[7] preferences() / savePreferences()\n";
$pdo->exec('DELETE FROM notification_preferences');
check('save disable line → 1', NotificationCenterService::savePreferences($pdo, $U1, [['type' => '*', 'channel' => 'line', 'enabled' => false]]) === 1);
$pref = NotificationCenterService::preferences($pdo, $U1);
check('pref line disabled', ($pref['rows']['*']['line'] ?? null) === false, json_encode($pref['rows']));
check('pref exposes types', ($pref['types'] ?? []) === NotificationCenterService::TYPES);
check('save enable line → 1 (row removed)', NotificationCenterService::savePreferences($pdo, $U1, [['type' => '*', 'channel' => 'line', 'enabled' => true]]) === 1);
$pref = NotificationCenterService::preferences($pdo, $U1);
check('pref line row gone after enable', !isset($pref['rows']['*']['line']));
check('invalid channel ignored', NotificationCenterService::savePreferences($pdo, $U1, [['type' => '*', 'channel' => 'bogus', 'enabled' => false]]) === 0);
check('invalid type ignored', NotificationCenterService::savePreferences($pdo, $U1, [['type' => 'bogus', 'channel' => 'line', 'enabled' => false]]) === 0);

/* ================================================================= 8. rules CRUD */
echo "\n[8] rules() / saveRule() / deleteRule()\n";
$threw = false;
try { NotificationCenterService::saveRule($pdo, ['module' => 'repair']); } catch (RuntimeException $e) { $threw = true; }
check('saveRule validates name+module (throws)', $threw);
$rid = NotificationCenterService::saveRule($pdo, ['name' => 'R1', 'module' => 'repair', 'event' => '*', 'priority' => 'high', 'recipients_role' => [1, 2], 'channels' => ['app', 'line']]);
check('rule inserted', $rid > 0, (string)$rid);
$rr = $pdo->query("SELECT * FROM notification_rules WHERE id=$rid")->fetch();
check('rule recipients_role JSON', ($rr['recipients_role'] ?? '') === '[1,2]', (string)($rr['recipients_role'] ?? ''));
check('rule channels JSON filtered', ($rr['channels'] ?? '') === '["app","line"]', (string)($rr['channels'] ?? ''));
$rid3 = NotificationCenterService::saveRule($pdo, ['name' => 'R3', 'module' => 'system']);
$rr3 = $pdo->query("SELECT * FROM notification_rules WHERE id=$rid3")->fetch();
check('create without channels → default ["app"]', ($rr3['channels'] ?? '') === '["app"]', (string)($rr3['channels'] ?? ''));
$rid2 = NotificationCenterService::saveRule($pdo, ['name' => 'R2', 'module' => 'pm_am', 'max_repeats' => 0, 'dedup_hours' => 0]);
$rr2 = $pdo->query("SELECT * FROM notification_rules WHERE id=$rid2")->fetch();
check('max_repeats clamped to 1', (int)$rr2['max_repeats'] === 1);
check('dedup_hours clamped to 1', (int)$rr2['dedup_hours'] === 1);
$upd = NotificationCenterService::saveRule($pdo, ['id' => $rid, 'name' => 'R1b']);
$rr = $pdo->query("SELECT * FROM notification_rules WHERE id=$rid")->fetch();
check('update returns id', $upd === $rid);
check('update applied name', ($rr['name'] ?? '') === 'R1b');
check('update preserved module', ($rr['module'] ?? '') === 'repair');
$list = NotificationCenterService::rules($pdo);
check('rules() lists both', count($list) >= 2);
check('deleteRule true', NotificationCenterService::deleteRule($pdo, $rid) === true);
check('deleteRule again false', NotificationCenterService::deleteRule($pdo, $rid) === false);

/* ================================================================= 9. retryPending */
echo "\n[9] retryPending()\n";
$pdo->exec('DELETE FROM notification_deliveries');
$N = ins($pdo, 'notifications', ['user_id' => $U1, 'type' => 'system', 'module' => 'system', 'event' => 'error', 'title' => 'Retry me', 'priority' => 'info']);
$d1 = ins($pdo, 'notification_deliveries', ['notification_id' => $N, 'user_id' => $U1, 'channel' => 'app', 'status' => 'pending', 'attempts' => 0]);
$d2 = ins($pdo, 'notification_deliveries', ['notification_id' => $N, 'user_id' => $U1, 'channel' => 'app', 'status' => 'pending', 'attempts' => 3]);
$d3 = ins($pdo, 'notification_deliveries', ['notification_id' => $N, 'user_id' => $U1, 'channel' => 'push', 'status' => 'pending', 'attempts' => 0]);
$retried = NotificationCenterService::retryPending($pdo, 3);
check('retried count = 1 (app only)', $retried === 1, (string)$retried);
$r1 = $pdo->query("SELECT * FROM notification_deliveries WHERE id=$d1")->fetch();
check('d1 sent', ($r1['status'] ?? '') === 'sent' && (int)$r1['attempts'] === 1 && $r1['sent_at'] !== null);
$r2 = $pdo->query("SELECT * FROM notification_deliveries WHERE id=$d2")->fetch();
check('d2 untouched (attempts limit)', ($r2['status'] ?? '') === 'pending' && (int)$r2['attempts'] === 3);
$r3 = $pdo->query("SELECT * FROM notification_deliveries WHERE id=$d3")->fetch();
check('d3 push failed (no subscription)', ($r3['status'] ?? '') === 'failed' && (int)$r3['attempts'] === 1);

/* ================================================================= summary */
echo "\n========================================\n";
echo "PASS $pass_count  FAIL $fail_count\n";
if ($fail_count) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }

if (!$KEEP) {
    try {
        $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
        echo "Dropped scratch DB $scratch\n";
    } catch (Throwable $e) {
        echo 'Cleanup failed: ' . $e->getMessage() . "\n";
    }
} else {
    echo "Kept scratch DB $scratch\n";
}

exit($fail_count ? 1 : 0);
