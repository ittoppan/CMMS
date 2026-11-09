<?php
/**
 * scripts/test_services.php — behavioral harness for src/services/* small services
 *
 * Covers: AICopilotService, DataGovernanceService, AuditTrailService,
 * InventoryOptimizationService, PredictiveService, RCAService, SagePOService,
 * NotificationService (guard/log paths), WebPushService (pure crypto:
 * base64url, pointToPem, HKDF, ECDH, VAPID JWT, AES-128-GCM payload).
 *
 * Runs against a THROWAWAY database named <live>_svctest.
 *   php scripts/test_services.php [--keep]
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
$scratch = $live . '_svctest';

if (!str_ends_with($scratch, '_svctest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
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
echo "Services harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/services/AICopilotService.php';
require_once __DIR__ . '/../src/services/DataGovernanceService.php';
require_once __DIR__ . '/../src/services/AuditTrailService.php';
require_once __DIR__ . '/../src/services/InventoryOptimizationService.php';
require_once __DIR__ . '/../src/services/PredictiveService.php';
require_once __DIR__ . '/../src/services/RCAService.php';
require_once __DIR__ . '/../src/services/SagePOService.php';
require_once __DIR__ . '/../src/services/NotificationService.php';
require_once __DIR__ . '/../src/services/WebPushService.php';

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

/* ================================================================= 1. AICopilotService */
echo "\n[1] AICopilotService::diagnoseSymptom()\n";
$r = AICopilotService::diagnoseSymptom('zzz totally unknown symptom');
check('returns array with expected keys', is_array($r) && isset($r['symptom'], $r['causes'], $r['steps'], $r['spares']));
check('echoes symptom back', ($r['symptom'] ?? null) === 'zzz totally unknown symptom');
check('causes non-empty', is_array($r['causes']) && count($r['causes']) > 0);
check('steps non-empty', is_array($r['steps']) && count($r['steps']) > 0);
check('unknown → default spare SUP0010016', ($r['spares'][0]['code'] ?? '') === 'SUP0010016', json_encode($r['spares']));
check('empty symptom → default', ((AICopilotService::diagnoseSymptom('')['spares'][0]['code'] ?? '') === 'SUP0010016'));

/* keyword branch: extract a real keyword literal from the source (encoding-agnostic) */
$srcFile = file_get_contents(__DIR__ . '/../src/services/AICopilotService.php');
$kw = null;
if ($srcFile !== false && preg_match('/str_contains\(\$symptomLower, \'([^\']+)\'\)/', $srcFile, $m)) { $kw = $m[1]; }
check('extracted keyword literal from source', is_string($kw) && $kw !== '', var_export($kw, true));
$rk = AICopilotService::diagnoseSymptom((string)$kw);
check('keyword → bearing branch (SUP0010015)', ($rk['spares'][0]['code'] ?? '') === 'SUP0010015', json_encode($rk['spares']));
check('keyword branch returns 2 spares', count($rk['spares']) === 2);

/* ================================================================= 2. DataGovernanceService */
echo "\n[2] DataGovernanceService\n";
check('A-PT-01 valid', DataGovernanceService::validateAssetCode('A-PT-01') === true);
check('ABCD (len>=3) valid', DataGovernanceService::validateAssetCode('ABCD') === true);
check('ab invalid', DataGovernanceService::validateAssetCode('ab') === false);
check('trimmed A-PT-01 valid', DataGovernanceService::validateAssetCode('  A-PT-01  ') === true);
check('empty invalid', DataGovernanceService::validateAssetCode('') === false);

ins($pdo, 'spare_parts', ['code' => 'DUP-A', 'name' => 'DUP-PART', 'stock_qty' => 1, 'unit_price' => 10]);
ins($pdo, 'spare_parts', ['code' => 'DUP-B', 'name' => 'DUP-PART', 'stock_qty' => 1, 'unit_price' => 10]);
ins($pdo, 'spare_parts', ['code' => 'UNQ-1', 'name' => 'UNIQUE-PART', 'stock_qty' => 1, 'unit_price' => 10]);
$dups = DataGovernanceService::findDuplicateParts();
$dupNames = array_column($dups, 'name');
check('findDuplicateParts flags DUP-PART', in_array('DUP-PART', $dupNames, true), json_encode($dups));
check('findDuplicateParts excludes UNIQUE-PART', !in_array('UNIQUE-PART', $dupNames, true));
check('duplicate count is 2', ((int)($dups[array_search('DUP-PART', $dupNames, true)]['count'] ?? 0)) === 2);

/* ================================================================= 3. AuditTrailService */
echo "\n[3] AuditTrailService::log()\n";
$_SESSION = [];
$_SERVER['REMOTE_ADDR'] = '10.0.0.9';
AuditTrailService::log('LOGIN', 'auth', 'DOC-1', 'old', 'new');
$row = $pdo->query("SELECT * FROM audit_logs WHERE action='LOGIN' ORDER BY id DESC LIMIT 1")->fetch();
check('row inserted', is_array($row));
check('action correct', ($row['action'] ?? '') === 'LOGIN');
check('module correct', ($row['module'] ?? '') === 'auth');
check('doc_no correct', ($row['doc_no'] ?? '') === 'DOC-1');
check('old_value stored', ($row['old_value'] ?? '') === 'old');
check('new_value stored', ($row['new_value'] ?? '') === 'new');
check('default user_id = 1 when no session', (int)($row['user_id'] ?? 0) === 1);
check('ip_address from REMOTE_ADDR', ($row['ip_address'] ?? '') === '10.0.0.9');
$_SESSION = ['user_id' => 77];
AuditTrailService::log('CHANGE', 'spare', 'S-9');
$row2 = $pdo->query("SELECT * FROM audit_logs WHERE action='CHANGE' ORDER BY id DESC LIMIT 1")->fetch();
check('session user_id captured', (int)($row2['user_id'] ?? 0) === 77);
$_SESSION = [];

/* ================================================================= 4. InventoryOptimizationService */
echo "\n[4] InventoryOptimizationService::getOptimizationMetrics()\n";
ins($pdo, 'spare_parts', ['code' => 'DEAD-1', 'name' => 'Dead Stock', 'stock_qty' => 200, 'unit_price' => 6000, 'min_stock' => 5]);
ins($pdo, 'spare_parts', ['code' => 'NORM-1', 'name' => 'Normal', 'stock_qty' => 5, 'unit_price' => 100, 'min_stock' => 2]);
$metrics = InventoryOptimizationService::getOptimizationMetrics();
$byCode = [];
foreach ($metrics as $m) $byCode[$m['code']] = $m;
check('returns rows', count($metrics) >= 2);
check('keys present', isset($metrics[0]['eoq'], $metrics[0]['ai_min'], $metrics[0]['ai_max'], $metrics[0]['is_dead_stock'], $metrics[0]['capital_tied']));
$dead = $byCode['DEAD-1'] ?? [];
check('DEAD-1 flagged dead stock', ($dead['is_dead_stock'] ?? null) === true, json_encode($dead));
check('DEAD-1 capital_tied = 1,200,000', abs((float)($dead['capital_tied'] ?? 0) - 1200000.0) < 0.001, (string)($dead['capital_tied'] ?? '?'));
check('DEAD-1 eoq > 0', (float)($dead['eoq'] ?? 0) > 0);
check('DEAD-1 ai_max >= ai_min', (float)($dead['ai_max'] ?? 0) >= (float)($dead['ai_min'] ?? 0));
$norm = $byCode['NORM-1'] ?? [];
check('NORM-1 not dead stock', ($norm['is_dead_stock'] ?? null) === false);
check('NORM-1 capital_tied = 500', abs((float)($norm['capital_tied'] ?? 0) - 500.0) < 0.001, (string)($norm['capital_tied'] ?? '?'));

/* ================================================================= 5. PredictiveService */
echo "\n[5] PredictiveService::analyzeMachineRisks()\n";
$astA = ins($pdo, 'asset_registry', ['code' => 'PA', 'name' => 'Asset A', 'status' => 'active']);
$astB = ins($pdo, 'asset_registry', ['code' => 'PB', 'name' => 'Asset B', 'status' => 'active']);
for ($i = 0; $i < 5; $i++) {
    ins($pdo, 'repair', ['asset_id' => $astA, 'title' => 'fail ' . $i, 'status' => 'closed', 'created_at' => date('Y-m-d H:i:s')]);
}
$risks = PredictiveService::analyzeMachineRisks();
$byAsset = [];
foreach ($risks as $rk2) $byAsset[$rk2['code']] = $rk2;
check('sorted descending by risk_score', (function () use ($risks) {
    for ($i = 1; $i < count($risks); $i++) if ($risks[$i - 1]['risk_score'] < $risks[$i]['risk_score']) return false;
    return true;
})());
check('PA risk_score high', (float)($byAsset['PA']['risk_score'] ?? 0) >= 85, json_encode($byAsset['PA'] ?? null));
check('PA risk_level HIGH_ANOMALY', ($byAsset['PA']['risk_level'] ?? '') === 'HIGH_ANOMALY');
check('PA total_failures = 5', (int)($byAsset['PA']['total_failures'] ?? 0) === 5);
check('PA recommendation non-empty', ($byAsset['PA']['recommendation'] ?? '') !== '');
check('PB risk_level LOW_NORMAL', ($byAsset['PB']['risk_level'] ?? '') === 'LOW_NORMAL', json_encode($byAsset['PB'] ?? null));
check('PB total_failures = 0', (int)($byAsset['PB']['total_failures'] ?? 0) === 0);

/* ================================================================= 6. RCAService */
echo "\n[6] RCAService::createRCARecord()\n";
$id1 = RCAService::createRCARecord(['repair_id' => 1]);
check('returns inserted id > 0', $id1 > 0, (string)$id1);
$r1 = $pdo->query("SELECT * FROM rca_records WHERE id=$id1")->fetch();
check('default failure_code FAIL-MECH-01', ($r1['failure_code'] ?? '') === 'FAIL-MECH-01');
check('default why1 empty string', ($r1['why1'] ?? null) === '');
$id2 = RCAService::createRCARecord(['repair_id' => 2, 'failure_code' => 'FC-X', 'why1' => 'root one', 'corrective_action' => 'fix it']);
$r2 = $pdo->query("SELECT * FROM rca_records WHERE id=$id2")->fetch();
check('custom failure_code stored', ($r2['failure_code'] ?? '') === 'FC-X');
check('why1 stored', ($r2['why1'] ?? '') === 'root one');
check('corrective_action stored', ($r2['corrective_action'] ?? '') === 'fix it');

/* ================================================================= 7. SagePOService */
echo "\n[7] SagePOService::getActivePOList() (offline fallback)\n";
putenv('SAGE300_DSN=__NO_SUCH_DSN__');
$pos = SagePOService::getActivePOList();
check('returns array', is_array($pos));
check('offline fallback → 5 POs', count($pos) === 5, (string)count($pos));
check('each PO has required keys', !empty($pos) && isset($pos[0]['po_number'], $pos[0]['vendor_name'], $pos[0]['amount'], $pos[0]['date']));
check('amounts numeric > 0', (function () use ($pos) {
    foreach ($pos as $p) if (!is_numeric($p['amount']) || (float)$p['amount'] <= 0) return false;
    return true;
})());

/* ================================================================= 8. NotificationService (guards) */
echo "\n[8] NotificationService guard paths\n";
$pdo->exec("DELETE FROM notification_logs");
check('master switch off → sendLineMessage false', NotificationService::sendLineMessage('hi') === false);
check('master switch off → no log row', (int)$pdo->query("SELECT COUNT(*) FROM notification_logs")->fetchColumn() === 0);
check('sendEmail empty → false', NotificationService::sendEmail('', 's', 'b') === false);
putenv('LINE_CHANNEL_ACCESS_TOKEN=');
putenv('LINE_NOTIFY_TOKEN=');
$_ENV['LINE_CHANNEL_ACCESS_TOKEN'] = '';
$_ENV['LINE_NOTIFY_TOKEN'] = '';
ins($pdo, 'settings', ['setting_key' => 'line_notify_enabled', 'setting_value' => '1']);
check('enabled + no token → false', NotificationService::sendLineMessage('hi') === false);
$logStatuses = $pdo->query("SELECT status FROM notification_logs")->fetchAll(PDO::FETCH_COLUMN);
check('PENDING_CONFIG logged', in_array('PENDING_CONFIG', $logStatuses, true), json_encode($logStatuses));

/* ================================================================= 9. WebPushService (pure crypto) */
echo "\n[9] WebPushService pure crypto\n";
$bin = random_bytes(48);
check('base64url round trip', WebPushService::base64url_decode(WebPushService::base64url_encode($bin)) === $bin);
check('base64url has no + / =', preg_match('#[+/=]#', WebPushService::base64url_encode($bin)) === 0);

$as = WebPushService::generateKeys();
check('generateKeys public_raw = 65 bytes', strlen($as['public_raw']) === 65, (string)strlen($as['public_raw']));
check('public_raw starts with 0x04', $as['public_raw'][0] === "\x04");
$priv = openssl_pkey_get_private($as['private_pem']);
check('private_pem parses via openssl', $priv !== false);
$det = $priv ? openssl_pkey_get_details($priv) : null;
check('openssl sees EC key', is_array($det) && ($det['type'] ?? null) === OPENSSL_KEYTYPE_EC);
if (is_array($det) && isset($det['ec']['x'], $det['ec']['y'])) {
    $derived = "\x04" . str_pad($det['ec']['x'], 32, "\x00", STR_PAD_LEFT) . str_pad($det['ec']['y'], 32, "\x00", STR_PAD_LEFT);
    check('derived public == public_raw (d*G)', $derived === $as['public_raw']);
}

check('pointToPem rejects wrong length', (function () {
    try { WebPushService::pointToPem('short'); return false; } catch (RuntimeException $e) { return true; }
})());
$pem = WebPushService::pointToPem($as['public_raw']);
check('pointToPem is PUBLIC KEY pem', str_contains($pem, 'BEGIN PUBLIC KEY'));
check('pointToPem parses via openssl', openssl_pkey_get_public($pem) !== false);

/* HKDF RFC 5869 test case 1 */
$ikm = hex2bin('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
$salt = hex2bin('000102030405060708090a0b0c');
$info = hex2bin('f0f1f2f3f4f5f6f7f8f9');
$okm = bin2hex(WebPushService::hkdf($salt, $ikm, $info, 42));
check('HKDF RFC5869 TC1 vector', $okm === '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865', $okm);
check('HKDF empty salt ok', strlen(WebPushService::hkdf('', $ikm, $info, 32)) === 32);

/* ECDH symmetry */
$ua = WebPushService::generateKeys();
$s1 = WebPushService::ecdhShare($as['private_pem'], $ua['public_raw']);
$s2 = WebPushService::ecdhShare($ua['private_pem'], $as['public_raw']);
check('ECDH shared secret = 32 bytes', strlen($s1) === 32, (string)strlen($s1));
check('ECDH symmetric', $s1 === $s2);

/* VAPID JWT (ES256) */
$jwt = WebPushService::vapidJwt($as['private_pem'], ['aud' => 'https://push.example', 'exp' => time() + 3600, 'sub' => 'mailto:a@b.c']);
$parts = explode('.', $jwt);
check('JWT has 3 segments', count($parts) === 3, (string)count($parts));
$hdr = json_decode(WebPushService::base64url_decode($parts[0]), true);
check('JWT header alg=ES256', ($hdr['alg'] ?? '') === 'ES256', json_encode($hdr));
$rawSig = WebPushService::base64url_decode($parts[2]);
check('JWT raw signature = 64 bytes', strlen($rawSig) === 64, (string)strlen($rawSig));
$sigDer = (function (string $raw): string {
    $r = ltrim(substr($raw, 0, 32), "\0") ?: "\0";
    $s = ltrim(substr($raw, 32), "\0") ?: "\0";
    if (ord($r[0]) & 0x80) $r = "\0" . $r;
    if (ord($s[0]) & 0x80) $s = "\0" . $s;
    $seq = "\x02" . chr(strlen($r)) . $r . "\x02" . chr(strlen($s)) . $s;
    return "\x30" . chr(strlen($seq)) . $seq;
})($rawSig);
$vok = openssl_verify($parts[0] . '.' . $parts[1], $sigDer, openssl_pkey_get_public($pem), OPENSSL_ALGO_SHA256);
check('JWT ES256 signature verifies', $vok === 1, (string)$vok);

/* AES-128-GCM payload (RFC 8291) round trip */
$authRaw = random_bytes(16);
$sub = [
    'p256dh' => WebPushService::base64url_encode($ua['public_raw']),
    'auth'   => WebPushService::base64url_encode($authRaw),
];
$payload = 'hello-push-' . random_bytes(4);
$cipher = WebPushService::encryptPayload($payload, $sub, $as['public_raw'], $as['private_pem']);
$idlen = ord($cipher[20]);
$uaPub = substr($cipher, 21, $idlen);
$headerLen = 21 + $idlen;
check('payload idlen = 65', $idlen === 65, (string)$idlen);
check('payload total length', strlen($cipher) === $headerLen + strlen($payload) + 2 + 16, (string)strlen($cipher));
check('payload header embeds uaPublic', $uaPub === $ua['public_raw']);
$salt = substr($cipher, 0, 16);
$header = substr($cipher, 0, $headerLen);
$ct = substr($cipher, $headerLen, -16);
$tag = substr($cipher, -16);
$shared2 = WebPushService::ecdhShare($ua['private_pem'], $as['public_raw']);
$ikm2 = WebPushService::hkdf($salt, $shared2, "WebPush: info\x00" . $uaPub . $as['public_raw'], 32);
$cek = WebPushService::hkdf($authRaw, $ikm2, "Content-Encoding: aes128gcm\x00", 16);
$nonce = WebPushService::hkdf($authRaw, $ikm2, "Content-Encoding: nonce\x00", 12);
$plain = openssl_decrypt($ct, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, $header);
check('payload decrypts to original', $plain === "\x02\x00" . $payload, var_export($plain, true));

/* loadKeys persistence */
$pdo->exec("DELETE FROM settings WHERE setting_key IN ('vapid_public_key','vapid_private_key')");
$k1 = WebPushService::loadKeys($pdo);
$stored = (int)$pdo->query("SELECT COUNT(*) FROM settings WHERE setting_key IN ('vapid_public_key','vapid_private_key')")->fetchColumn();
check('loadKeys generates + stores 2 keys', $stored === 2, (string)$stored);
$k2 = WebPushService::loadKeys($pdo);
check('loadKeys idempotent (public matches)', $k1['public_raw'] === $k2['public_raw']);

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
