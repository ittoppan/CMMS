<?php
/**
 * scripts/test_notifications.php — behavioral harness for the notification engine
 * (src/helpers/notification.php).
 *
 * Covers: getSettingValue, substituteVars, encodeHeader, buildEmailHtml,
 * publicBaseUrl, linePhotoUrl, repairPhotoUrls, getLineTemplate,
 * getEmailTemplateConfig, logLineSend, sendLinePushMessage (disabled path),
 * sendNotificationToUser (guarded paths).
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_ntftest".
 *   php scripts/test_notifications.php [--keep]
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$KEEP = in_array('--keep', $argv ?? [], true);

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

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$live = $env['DB_NAME'] ?? 'cmms_tpt';
$scratch = $live . '_ntftest';

if (!str_ends_with($scratch, '_ntftest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Notification harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/notification.php';

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

/* Seed settings FIRST — getSettingValue() caches the whole table on first call. */
ins($pdo, 'settings', ['setting_key' => 'public_base_url', 'setting_value' => 'https://cdn.example.com/']);
ins($pdo, 'settings', ['setting_key' => 'line_notify_enabled', 'setting_value' => '0']);
ins($pdo, 'settings', ['setting_key' => 'smtp_enabled', 'setting_value' => '0']);
ins($pdo, 'settings', ['setting_key' => 'setting_empty', 'setting_value' => '']);
ins($pdo, 'settings', ['setting_key' => 'line_tpl_breakdown', 'setting_value' => json_encode([
    'header_color' => '#123456', 'header_align' => 'center', 'body_wrap' => '0', 'enabled' => '1',
], JSON_UNESCAPED_UNICODE)]);

/* Email templates: one JSON (API-style, consistent) + one plain-text (settings-page style). */
ins($pdo, 'email_notifications', ['module' => 'inventory', 'event' => 'low_stock', 'is_active' => 0,
    'subject' => 'แจ้งเตือนสต็อก {item_name}', 'template_body' => json_encode([
        'header_color' => '#abcdef', 'body_html' => '<b>{qty}</b> ชิ้น', 'btn_label' => 'สั่งซื้อ',
        'btn_url' => 'https://t.test/buy', 'enabled' => '0',
    ], JSON_UNESCAPED_UNICODE)]);
ins($pdo, 'email_notifications', ['module' => 'repair', 'event' => 'resolved', 'is_active' => 0,
    'subject' => 'ปิดงาน {work_order_id}', 'template_body' => 'งานเสร็จแล้ว <b>{title}</b>']);

$NOW = time();
$D = fn(int $days) => date('Y-m-d H:i:s', $NOW + $days * 86400);
$U1 = ins($pdo, 'users', ['username' => 'somsri', 'email' => 'somsri@x.io', 'password' => 'x', 'full_name' => 'Somsri K', 'is_active' => 1]);
ins($pdo, 'users', ['username' => 'inactive', 'email' => 'off@x.io', 'password' => 'x', 'full_name' => 'Off', 'is_active' => 0]);

/* repair_attachments for repairPhotoUrls */
$R = ins($pdo, 'repair', ['asset_id' => 1, 'title' => 'x', 'source_type' => 'breakdown', 'status' => 'open', 'created_at' => $D(-1)]);
ins($pdo, 'repair_attachments', ['repair_id' => $R, 'file_name' => 'a.jpg', 'file_path' => 'uploads/repair/a.jpg', 'file_type' => 'image/jpeg', 'category' => 'failure_image']);
ins($pdo, 'repair_attachments', ['repair_id' => $R, 'file_name' => 'b.jpg', 'file_path' => 'uploads/repair/b.jpg', 'file_type' => 'image/jpeg', 'category' => 'failure_image']);
ins($pdo, 'repair_attachments', ['repair_id' => $R, 'file_name' => 'c.jpg', 'file_path' => 'uploads/repair/c.jpg', 'file_type' => 'image/jpeg', 'category' => 'failure_image']);
ins($pdo, 'repair_attachments', ['repair_id' => $R, 'file_name' => 'aft.jpg', 'file_path' => 'uploads/repair/after.jpg', 'file_type' => 'image/jpeg', 'category' => 'after_image']);
ins($pdo, 'repair_attachments', ['repair_id' => $R, 'file_name' => 'doc.pdf', 'file_path' => 'uploads/repair/doc.pdf', 'file_type' => 'application/pdf', 'category' => 'failure_image']);

/* ================================================================= 1. getSettingValue */
echo "\n[1] getSettingValue()\n";
check('known key returns value', getSettingValue('public_base_url') === 'https://cdn.example.com/', getSettingValue('public_base_url'));
check('missing key returns default', getSettingValue('nope_key', 'DEF') === 'DEF', getSettingValue('nope_key', 'DEF'));
check('empty value returns default', getSettingValue('setting_empty', 'DEF') === 'DEF', getSettingValue('setting_empty', 'DEF'));
check('missing key no default → empty', getSettingValue('nope_key2') === '');

/* ================================================================= 2. substituteVars */
echo "\n[2] substituteVars()\n";
check('single var', substituteVars('Hello {name}', ['name' => 'World']) === 'Hello World');
check('multiple vars', substituteVars('{a}-{b}', ['a' => '1', 'b' => '2']) === '1-2');
check('repeated var all replaced', substituteVars('{x}{x}', ['x' => 'y']) === 'yy');
check('unknown left intact', substituteVars('{a}-{z}', ['a' => '1']) === '1-{z}');
check('numeric value', substituteVars('n={n}', ['n' => 42]) === 'n=42');
check('no vars untouched', substituteVars('plain', []) === 'plain');

/* ================================================================= 3. encodeHeader */
echo "\n[3] encodeHeader()\n";
check('utf8 encoded', encodeHeader('ทดสอบ') === '=?UTF-8?B?' . base64_encode('ทดสอบ') . '?=');
check('ascii encoded', encodeHeader('CMMS-TPT') === '=?UTF-8?B?' . base64_encode('CMMS-TPT') . '?=');

/* ================================================================= 4. buildEmailHtml */
echo "\n[4] buildEmailHtml()\n";
$h = buildEmailHtml('สมชาย', 'หัวข้อ <b>', '<p>body</p>', '#16a34a', 'กด', 'https://t.test/x');
check('subject escaped', str_contains($h, htmlspecialchars('หัวข้อ <b>', ENT_QUOTES, 'UTF-8')));
check('toName escaped', str_contains($h, htmlspecialchars('สมชาย', ENT_QUOTES, 'UTF-8')));
check('valid header color applied', str_contains($h, 'background:#16a34a'));
check('body html preserved', str_contains($h, '<p>body</p>'));
check('button rendered', str_contains($h, "<a href='https://t.test/x'"));
check('button label rendered', str_contains($h, htmlspecialchars('กด', ENT_QUOTES, 'UTF-8')));
$h2 = buildEmailHtml('N', 'S', 'B', 'not-a-color', 'L', '');
check('invalid color → default', str_contains($h2, 'background:#1d4ed8') && !str_contains($h2, 'not-a-color'));
check('no button when url empty', !str_contains($h2, '<a href='));
$h3 = buildEmailHtml('N', 'S', 'B', '#1d4ed8', '', 'https://t.test/y');
check('no button when label empty', !str_contains($h3, '<a href='));

/* ================================================================= 5. publicBaseUrl / linePhotoUrl */
echo "\n[5] publicBaseUrl() + linePhotoUrl()\n";
check('publicBaseUrl trims slash', publicBaseUrl() === 'https://cdn.example.com', publicBaseUrl());
check('linePhotoUrl empty', linePhotoUrl('') === '');
check('linePhotoUrl joins', linePhotoUrl('uploads/x.jpg') === 'https://cdn.example.com/uploads/x.jpg', linePhotoUrl('uploads/x.jpg'));
check('linePhotoUrl trims leading slash', linePhotoUrl('/uploads/x.jpg') === 'https://cdn.example.com/uploads/x.jpg', linePhotoUrl('/uploads/x.jpg'));

/* ================================================================= 6. repairPhotoUrls */
echo "\n[6] repairPhotoUrls()\n";
$urls = repairPhotoUrls($R, 'failure_image', 3);
check('photo urls count (limit 3, pdf excluded)', count($urls) === 3, (string)count($urls));
check('photo url base + path', ($urls[0] ?? '') === 'https://cdn.example.com/uploads/repair/a.jpg', $urls[0] ?? '');
check('photo urls ordered by id', ($urls[2] ?? '') === 'https://cdn.example.com/uploads/repair/c.jpg', $urls[2] ?? '');
$urlsAfter = repairPhotoUrls($R, 'after_image');
check('after image category', count($urlsAfter) === 1 && str_ends_with($urlsAfter[0], 'after.jpg'), implode(',', $urlsAfter));
check('unknown repair → empty', repairPhotoUrls(999999) === []);

/* ================================================================= 7. getLineTemplate */
echo "\n[7] getLineTemplate()\n";
$t = getLineTemplate('line_tpl_breakdown');
check('override header_color', $t['header_color'] === '#123456', $t['header_color']);
check('override header_align center', $t['header_align'] === 'center', $t['header_align']);
check('override body_wrap 0', $t['body_wrap'] === '0', $t['body_wrap']);
check('defaults body_text preserved', str_contains($t['body_text'], '{asset_code}'), $t['body_text']);
check('default btn_color', $t['btn_color'] === '#06C755', $t['btn_color']);
$tu = getLineTemplate('line_tpl_unknown');
check('unknown tpl default color', $tu['header_color'] === '#1d4ed8', $tu['header_color']);
check('unknown tpl default title', $tu['header_title'] === '🔔 CMMS-TPT NOTIFICATION', $tu['header_title']);
$tc = getLineTemplate('line_tpl_completed');
check('completed default header', $tc['header_color'] === '#16a34a', $tc['header_color']);
check('completed header_subtitle default empty', $tc['header_subtitle'] === '');

/* ================================================================= 8. getEmailTemplateConfig */
echo "\n[8] getEmailTemplateConfig()\n";
$c = getEmailTemplateConfig('repair', 'created');
check('no-row default subject', str_contains($c['subject'], '{work_order_id}'), $c['subject']);
check('no-row default color', $c['header_color'] === '#dc2626', $c['header_color']);
check('no-row enabled 1', $c['enabled'] === '1', $c['enabled']);
check('no-row btn_label', $c['btn_label'] === 'เปิดดูใบแจ้งซ่อม', $c['btn_label']);

$ci = getEmailTemplateConfig('inventory', 'low_stock');
check('json row subject override', $ci['subject'] === 'แจ้งเตือนสต็อก {item_name}', $ci['subject']);
check('json row header_color parsed', $ci['header_color'] === '#abcdef', $ci['header_color']);
check('json row body_html parsed', $ci['body_html'] === '<b>{qty}</b> ชิ้น', $ci['body_html']);
check('json row btn_url parsed', $ci['btn_url'] === 'https://t.test/buy', $ci['btn_url']);
check('json row enabled 0', $ci['enabled'] === '0', $ci['enabled']);

$cp = getEmailTemplateConfig('repair', 'resolved');
check('plain-text body used as html', $cp['body_html'] === 'งานเสร็จแล้ว <b>{title}</b>', $cp['body_html']);
check('plain-text is_active 0 → disabled', $cp['enabled'] === '0', $cp['enabled']);
check('plain-text subject override', $cp['subject'] === 'ปิดงาน {work_order_id}', $cp['subject']);

/* ================================================================= 9. logLineSend */
echo "\n[9] logLineSend()\n";
$before = (int)$pdo->query('SELECT COUNT(*) FROM notification_logs')->fetchColumn();
logLineSend(str_repeat('R', 150), 'tpl_x', 'SENT', str_repeat('C', 600), 'raw');
$after = (int)$pdo->query('SELECT COUNT(*) FROM notification_logs')->fetchColumn();
check('logLineSend inserted', $after === $before + 1, "{$before} to {$after}");
$row = $pdo->query('SELECT * FROM notification_logs ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
check('log channel LINE', $row['channel'] === 'LINE');
check('log status', $row['status'] === 'SENT');
check('log recipient truncated to 100', mb_strlen($row['recipient']) === 100, (string)mb_strlen($row['recipient']));
check('log template', $row['template'] === 'tpl_x');
check('log content truncated to 500', mb_strlen($row['content']) === 500, (string)mb_strlen($row['content']));

/* ================================================================= 10. guarded send paths */
echo "\n[10] guarded send paths\n";
check('sendLinePushMessage disabled → false', sendLinePushMessage('U123', 'T', 'M') === false);
check('sendNotificationToUser unknown user → false', sendNotificationToUser(999999, 'T', 'M') === false);
check('sendNotificationToUser inactive → false', sendNotificationToUser(2, 'T', 'M') === false);

/* ================================================================= 11. regression guard (bug #27) */
echo "\n[11] regression guard: \$defaultTapUrl defined before use\n";
$src = (string)file_get_contents(__DIR__ . '/../src/helpers/notification.php');
$fnPos = strpos($src, 'function sendLinePushMessage');
$braceStart = $fnPos === false ? false : strpos($src, '{', $fnPos);
$body = '';
if ($braceStart !== false) {
    $depth = 0; $end = null; $len = strlen($src);
    for ($i = $braceStart; $i < $len; $i++) {
        $c = $src[$i];
        if ($c === '{') $depth++;
        elseif ($c === '}') { $depth--; if ($depth === 0) { $end = $i; break; } }
    }
    if ($end !== null) $body = substr($src, $braceStart, $end - $braceStart);
}
$assignPos = $body === '' ? false : strpos($body, '$defaultTapUrl = !empty($targetUrl)');
$usePos = $body === '' ? false : strpos($body, "'uri' => \$defaultTapUrl");
check('sentinel found', $assignPos !== false && $usePos !== false, "assign=$assignPos use=$usePos");
check('assignment precedes first use', $assignPos !== false && $usePos !== false && $assignPos < $usePos, "assign=$assignPos use=$usePos");

/* ------------------------------------------------------------------ done */
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "\n========================================\n";
printf("PASS %d  FAIL %d\n", $pass_count, $fail_count);
if ($fail_count > 0) { echo "Failures:\n"; foreach ($failures as $f) echo "  - $f\n"; }
if (!$KEEP) {
    $pdo = null;
    $drop = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $drop->exec("DROP DATABASE IF EXISTS `$scratch`");
    echo "Dropped scratch DB $scratch\n";
} else {
    echo "Kept scratch DB $scratch (--keep)\n";
}
exit($fail_count > 0 ? 1 : 0);
