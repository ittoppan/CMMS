<?php
/**
 * scripts/test_security.php — behavioral harness for the security / core helpers:
 *   src/helpers/permissions.php (RBAC engine)
 *   src/helpers/api.php         (secret masking)
 *   src/helpers/errors.php      (error redaction + persistence)
 *
 * Covers: perm_default_granted, perm_allowed (role + user overrides),
 * canPerm, permModuleAliases, apiIsSecretKey, apiMaskSecret,
 * apiMaskSettingsRows, apiMaskSecretArray, cmms_request_id,
 * redact_error_message, cmms_error_context, record_error, api_log_error.
 *
 * Runs against a THROWAWAY database whose name is the live DB name + "_sectest".
 *   php scripts/test_security.php [--keep]
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
$scratch = $live . '_sectest';

if (!str_ends_with($scratch, '_sectest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Security harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/permissions.php';

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

$U9 = ins($pdo, 'users', ['username' => 'u9', 'email' => 'u9@x.io', 'password' => 'x', 'full_name' => 'User Nine', 'role_id' => 5]);

/* ================================================================= 1. perm_default_granted */
echo "\n[1] perm_default_granted()\n";
check('admin (role1) any action', perm_default_granted(1, 'anything', 'whatever') === true);
check('manager repair approve', perm_default_granted(2, 'repair', 'approve') === true);
check('manager settings manage denied', perm_default_granted(2, 'settings', 'manage') === false);
check('technician repair delete denied', perm_default_granted(3, 'repair', 'delete') === false);
check('technician repair start allowed', perm_default_granted(3, 'repair', 'start') === true);
check('viewer repair view allowed', perm_default_granted(5, 'repair', 'view') === true);
check('viewer repair create denied', perm_default_granted(5, 'repair', 'create') === false);
check('unknown module denied', perm_default_granted(2, 'nonexistent', 'view') === false);
check('unknown role denied', perm_default_granted(99, 'repair', 'view') === false);
check('knowledge technician feedback allowed', perm_default_granted(3, 'knowledge', 'feedback') === true);
check('knowledge technician create denied', perm_default_granted(3, 'knowledge', 'create') === false);
check('knowledge foreman approve denied', perm_default_granted(7, 'knowledge', 'approve') === false);

/* ================================================================= 2. perm_allowed — defaults + casing */
echo "\n[2] perm_allowed() defaults\n";
check('manufacturer default via perm_allowed', perm_allowed($pdo, 5, 'repair', 'view') === true);
check('case-insensitive module/action', perm_allowed($pdo, 5, ' REPAIR ', ' VIEW ') === true);
check('empty module false', perm_allowed($pdo, 5, '', 'view') === false);
check('empty action false', perm_allowed($pdo, 5, 'repair', '') === false);
check('no override falls to matrix (role3 repair delete)', perm_allowed($pdo, 3, 'repair', 'delete') === false);

/* ================================================================= 3. role-level overrides */
echo "\n[3] role-level overrides\n";
/* grant something the matrix denies: role5 repair create */
ins($pdo, 'user_permissions', ['role_id' => 5, 'user_id' => null, 'module' => 'repair', 'permission' => 'create', 'is_granted' => 1]);
check('role override grant wins over matrix-deny', perm_allowed($pdo, 5, 'repair', 'create') === true);
/* deny something the matrix allows: role2 repair approve */
ins($pdo, 'user_permissions', ['role_id' => 2, 'user_id' => null, 'module' => 'repair', 'permission' => 'approve', 'is_granted' => 0]);
check('role override deny wins over matrix-allow', perm_allowed($pdo, 2, 'repair', 'approve') === false);
check('role override does not leak to other actions', perm_allowed($pdo, 2, 'repair', 'edit') === true);

/* ================================================================= 4. user-specific override precedence (bug #28) */
echo "\n[4] user-specific override precedence\n";
/* Insert the USER row FIRST (lower id) and the ROLE row SECOND (higher id) so a
   naive "last row wins" collapse would let the role row stomp the user row. */
ins($pdo, 'user_permissions', ['role_id' => 5, 'user_id' => $U9, 'module' => 'inspection', 'permission' => 'execute', 'is_granted' => 0]);
ins($pdo, 'user_permissions', ['role_id' => 5, 'user_id' => null, 'module' => 'inspection', 'permission' => 'execute', 'is_granted' => 1]);
check('user deny beats role grant (order-independent)', perm_allowed($pdo, 5, 'inspection', 'execute', $U9) === false);
/* A different user in the same role with no user row must still see the role grant. */
check('other user unaffected by user override', perm_allowed($pdo, 5, 'inspection', 'execute', 424242) === true);
/* user grant beats role deny (reverse direction), inserted in the adversarial order too */
ins($pdo, 'user_permissions', ['role_id' => 5, 'user_id' => $U9, 'module' => 'spare_parts', 'permission' => 'request', 'is_granted' => 1]);
ins($pdo, 'user_permissions', ['role_id' => 5, 'user_id' => null, 'module' => 'spare_parts', 'permission' => 'request', 'is_granted' => 0]);
check('user grant beats role deny', perm_allowed($pdo, 5, 'spare_parts', 'request', $U9) === true);

/* ================================================================= 5. canPerm from session */
echo "\n[5] canPerm()\n";
$_SESSION = ['role_id' => 5, 'user_id' => 424242];
check('canPerm role5 repair view', canPerm($pdo, 'repair', 'view') === true);
check('canPerm role5 repair create (role override grant)', canPerm($pdo, 'repair', 'create') === true);
$_SESSION = ['role_id' => 3, 'user_id' => 0];
check('canPerm role3 repair delete denied', canPerm($pdo, 'repair', 'delete') === false);
$_SESSION = [];
check('canPerm no session denied', canPerm($pdo, 'repair', 'view') === false);

/* ================================================================= 6. permModuleAliases */
echo "\n[6] permModuleAliases()\n";
$aliases = [
    'work_order' => 'repair', 'work_orders' => 'repair', 'maintenance_request' => 'request',
    'asset_registry' => 'asset', 'pm' => 'pm_am', 'spare_part' => 'spare_parts',
    'reports' => 'report', 'user' => 'users', 'system' => 'settings',
    'work_permit' => 'safety', 'turnaround' => 'shutdown', 'ecr' => 'engineering_change',
    'doc_control' => 'document', 'controlled_document' => 'document',
];
$aliasOk = true; $aliasBad = [];
foreach ($aliases as $in => $want) {
    $got = permModuleAliases($in);
    if ($got !== $want) { $aliasOk = false; $aliasBad[] = "$in=>$got(want $want)"; }
}
check('alias map correct', $aliasOk, implode('; ', $aliasBad));
check('alias case-insensitive', permModuleAliases(' WORK_ORDER ') === 'repair', permModuleAliases(' WORK_ORDER '));
check('unknown alias passthrough lowercased', permModuleAliases('MyMod') === 'mymod', permModuleAliases('MyMod'));

/* ================================================================= 7. api.php secret masking */
echo "\n[7] API secret masking\n";
check('secret key token', apiIsSecretKey('line_channel_access_token') === true);
check('secret key secret', apiIsSecretKey('my_secret') === true);
check('secret key _pass', apiIsSecretKey('db_pass') === true);
check('secret key password suffix', apiIsSecretKey('user_password') === true);
check('secret key private', apiIsSecretKey('vapid_private_key') === true);
check('non-secret key', apiIsSecretKey('public_base_url') === false);
check('empty mask', apiMaskSecret('') === '');
check('masked value hidden', apiMaskSecret('super-secret') === SETTING_MASKED && !str_contains(apiMaskSecret('super-secret'), 'super'));
$rows = apiMaskSettingsRows([
    ['setting_key' => 'smtp_pass', 'setting_value' => 'hunter2'],
    ['setting_key' => 'public_base_url', 'setting_value' => 'https://x'],
    ['setting_key' => 'api_token_empty', 'setting_value' => ''],
]);
check('mask secret row', $rows[0]['setting_value'] === SETTING_MASKED && ($rows[0]['masked'] ?? false) === true);
check('non-secret row untouched', $rows[1]['setting_value'] === 'https://x' && $rows[1]['masked'] === false);
check('empty secret not masked', $rows[2]['setting_value'] === '' && $rows[2]['masked'] === false);
$arr = apiMaskSecretArray(['smtp_pass' => 'pw', 'name' => 'Public', 'empty_secret' => '']);
check('mask array secret', $arr['smtp_pass'] === SETTING_MASKED);
check('array non-secret untouched', $arr['name'] === 'Public');
check('array empty secret untouched', $arr['empty_secret'] === '');

/* ================================================================= 8. errors.php redaction */
echo "\n[8] error redaction\n";
check('redact password=', !str_contains(redact_error_message('connect failed password=Sup3rS3cret host=x'), 'Sup3rS3cret'));
check('redact token=', !str_contains(redact_error_message('token=abc123def'), 'abc123def'));
check('redact secret:', !str_contains(redact_error_message('secret: hunter2'), 'hunter2'));
check('redact bot token', !str_contains(redact_error_message('https://api.telegram.org/bot123456:AAHxyz/msg'), 'AAHxyz'));
check('keeps benign text', str_contains(redact_error_message('division by zero in file x'), 'division by zero'));

/* ================================================================= 9. request id + context */
echo "\n[9] request id + context\n";
unset($_SERVER['HTTP_X_REQUEST_ID']);
$rid = cmms_request_id();
check('request id generated', is_string($rid) && strlen($rid) === 32, (string)strlen($rid));
check('request id stable', cmms_request_id() === $rid);
$_SERVER['HTTP_X_REQUEST_ID'] = 'client-rid-1';
check('request id honors header', cmms_request_id() === 'client-rid-1');
$_SERVER['HTTP_X_REQUEST_ID'] = str_repeat('a', 100);
check('oversized request id regenerated', cmms_request_id() !== str_repeat('a', 100));

$_SESSION = ['user_id' => 7, 'user_name' => 'Somsri'];
$_SERVER['REQUEST_URI'] = '/api/v1/test.php';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['REMOTE_ADDR'] = '10.0.0.9';
unset($_SERVER['HTTP_X_FORWARDED_FOR']);
$_SERVER['HTTP_X_REQUEST_ID'] = 'rid-ctx';
$ctx = cmms_error_context('asset', 'EXCEPTION', 'INTERNAL_ERROR');
check('ctx module', $ctx['module'] === 'asset');
check('ctx endpoint', $ctx['endpoint'] === '/api/v1/test.php');
check('ctx method', $ctx['method'] === 'POST');
check('ctx user_id', $ctx['user_id'] === 7);
check('ctx user_name', $ctx['user_name'] === 'Somsri');
check('ctx ip from REMOTE_ADDR', $ctx['ip_address'] === '10.0.0.9');
check('ctx request_id', $ctx['request_id'] === 'rid-ctx');
$_SERVER['HTTP_X_FORWARDED_FOR'] = '203.0.113.7, 10.0.0.1';
$ctx2 = cmms_error_context('asset', 'EXCEPTION', 'INTERNAL_ERROR');
check('ctx ip from XFF (first hop)', $ctx2['ip_address'] === '203.0.113.7', $ctx2['ip_address']);

/* ================================================================= 10. record_error + api_log_error */
echo "\n[10] record_error + api_log_error()\n";
$eid = record_error($pdo, [
    'module' => 'api', 'endpoint' => '/x', 'method' => 'GET', 'user_id' => 3, 'user_name' => 'T',
    'category' => 'EXCEPTION', 'error_code' => 'INTERNAL_ERROR',
    'technical_message' => 'boom', 'user_message' => 'oops', 'request_id' => 'r1', 'ip_address' => '127.0.0.1',
]);
check('record_error returns id', $eid !== null && $eid > 0, (string)$eid);
$erow = $pdo->query("SELECT * FROM system_errors WHERE id = $eid")->fetch(PDO::FETCH_ASSOC);
check('error row module', $erow['module'] === 'api');
check('error row technical', $erow['technical_message'] === 'boom');
check('error row request_id', $erow['request_id'] === 'r1');

$before = (int)$pdo->query('SELECT COUNT(*) FROM system_errors')->fetchColumn();
$_SERVER['HTTP_X_REQUEST_ID'] = 'rid-log';
api_log_error(new RuntimeException('token=abcd1234 leaked'), 'asset', 'safe msg');
$after = (int)$pdo->query('SELECT COUNT(*) FROM system_errors')->fetchColumn();
check('api_log_error inserted', $after === $before + 1, "{$before} to {$after}");
$lrow = $pdo->query('SELECT * FROM system_errors ORDER BY id DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
check('api_log_error redacts secret', !str_contains((string)$lrow['technical_message'], 'abcd1234'), (string)$lrow['technical_message']);
check('api_log_error keeps user_message', $lrow['user_message'] === 'safe msg');
check('api_log_error module', $lrow['module'] === 'asset');

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
