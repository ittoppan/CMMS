<?php
/**
 * scripts/smoke_phase38_api_transport.php - HTTP smoke test for the Phase 38 endpoint
 *
 * Boots PHP's built-in server on a spare port, fabricates a real session file for
 * an admin, and calls public/api/v1/knowledge.php over HTTP so the transport is
 * proven too: requires resolve, JSON is really JSON (no stray bytes before it),
 * CSRF really blocks an unprotected POST, and an anonymous call is refused.
 *
 * The server is always stopped and the session file always removed again.
 *
 *   php scripts/smoke_phase38_api_transport.php
 *   php scripts/smoke_phase38_api_transport.php --port=8792
 */

$port = 8791;
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--port=(\d+)$/', $a, $m)) {
        $port = (int)$m[1];
    }
}

require_once __DIR__ . '/../src/config/db.php';
$pdo = getDb();

$sessionId = 'knsmoke' . substr(md5((string)microtime(true)), 0, 8);
$csrf = bin2hex(random_bytes(32));
$user = $pdo->query('SELECT id, role_id FROM users WHERE is_active = 1 AND role_id = 1 ORDER BY id LIMIT 1')->fetch();
if (!$user) {
    echo "ABORT: no active admin user to build a session for\n";
    exit(1);
}

$savePath = sys_get_temp_dir();
$sessionFile = $savePath . DIRECTORY_SEPARATOR . 'sess_' . $sessionId;
file_put_contents($sessionFile, 'user_id|i:' . (int)$user['id'] . ';role_id|i:' . (int)$user['role_id']
    . ';csrf_token|s:64:"' . $csrf . '";last_activity|i:' . time() . ';');

$pass = 0;
$fail = 0;
function ok(string $label, bool $cond, string $detail = ''): void {
    global $pass, $fail;
    if ($cond) {
        $pass++;
        echo '  PASS  ' . $label . ($detail !== '' ? ' -> ' . $detail : '') . PHP_EOL;
    } else {
        $fail++;
        echo '  FAIL  ' . $label . ($detail !== '' ? ' -> ' . $detail : '') . PHP_EOL;
    }
}

/** @return array{status:int,body:string,json:mixed,raw:string} */
function call(string $url, array $headers = [], ?string $post = null): array {
    $ctx = stream_context_create(['http' => [
        'method'        => $post === null ? 'GET' : 'POST',
        'header'        => $headers,
        'content'       => $post ?? '',
        'ignore_errors' => true,
        'timeout'       => 20,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    $raw = (string)$body;
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
            $status = (int)$m[1];
        }
    }
    return ['status' => $status, 'body' => $raw, 'json' => json_decode($raw, true), 'raw' => $raw];
}

$root = dirname(__DIR__);
$serverLog = $savePath . DIRECTORY_SEPARATOR . 'knsmoke_server_' . $port . '.log';
// An array command spawns php.exe directly instead of going through cmd.exe, so
// proc_terminate() really kills the server and the test never leaves it behind.
$proc = proc_open(
    [PHP_BINARY, '-S', '127.0.0.1:' . $port, '-t', $root . '/public'],
    [1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']],
    $pipes
);

echo 'Phase 38 API transport smoke test' . PHP_EOL;
echo 'server: 127.0.0.1:' . $port . '   session: ' . $sessionId . ' (user ' . $user['id'] . ')' . PHP_EOL;

try {
    // wait for the port
    $up = false;
    for ($i = 0; $i < 50; $i++) {
        $sock = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.3);
        if ($sock) {
            fclose($sock);
            $up = true;
            break;
        }
        usleep(100000);
    }
    ok('built-in server started', $up);
    if (!$up) {
        throw new RuntimeException('server did not come up: ' . (string)@file_get_contents($serverLog));
    }

    $base = 'http://127.0.0.1:' . $port . '/api/v1/knowledge.php';
    $cookie = ['Cookie: PHPSESSID=' . $sessionId];

    echo PHP_EOL . '== Anonymous ==' . PHP_EOL;
    $anon = call($base . '?action=catalog');
    ok('anonymous call is refused', $anon['status'] === 401, 'status=' . $anon['status']);
    ok('refusal is JSON', is_array($anon['json']), mb_substr($anon['raw'], 0, 80));

    echo PHP_EOL . '== Reads as an admin ==' . PHP_EOL;
    $cfg = call($base . '?action=config', $cookie);
    ok('config responds 200', $cfg['status'] === 200, 'status=' . $cfg['status']);
    ok('config reports its can_* flags for the client', is_array($cfg['json']['can'] ?? null));
    ok('nothing is printed before the JSON', str_starts_with(ltrim($cfg['raw']), '{'));

    $cat = call($base . '?action=catalog', $cookie);
    ok('catalog responds', $cat['status'] === 200 && !empty($cat['json']['ok']));
    ok('catalog is empty rather than invented',
        (int)($cat['json']['published_articles'] ?? -1) === 0,
        'published=' . (int)($cat['json']['published_articles'] ?? -1));

    $list = call($base . '?action=article_list', $cookie);
    ok('article_list responds', $list['status'] === 200 && is_array($list['json']['articles'] ?? null));
    ok('article_list is empty rather than invented', (int)($list['json']['total'] ?? -1) === 0);
    ok('config carries the entity map for the relation picker',
        in_array('asset', (array)($cfg['json']['vocab']['entity_types'] ?? []), true)
        && in_array('work_order', (array)($cfg['json']['vocab']['entity_types'] ?? []), true));
    ok('config carries the status machine',
        !empty($cfg['json']['vocab']['transitions']['draft'] ?? null));

    echo PHP_EOL . '== CSRF ==' . PHP_EOL;
    $noToken = call($base . '?action=search', $cookie, http_build_query(['q' => 'zzz-no-csrf-' . $sessionId]));
    ok('POST without a token is blocked', $noToken['status'] === 403, 'status=' . $noToken['status']);
    ok('CSRF failure says so', str_contains($noToken['raw'], 'CSRF'));

    $withToken = call($base . '?action=search',
        array_merge($cookie, ['X-CSRF-Token: ' . $csrf, 'Content-Type: application/x-www-form-urlencoded']),
        http_build_query(['q' => 'zzz-no-csrf-' . $sessionId]));
    ok('POST with a valid token is accepted', $withToken['status'] === 200, 'status=' . $withToken['status']);
    ok('the answer is reported as unanswered, not guessed',
        ($withToken['json']['answered'] ?? true) === false);

    $badPerm = call($base . '?action=taxonomy&code=X-' . strtoupper($sessionId)
        . '&name_th=probe&name_en=probe', array_merge($cookie, ['X-CSRF-Token: ' . $csrf]),
        http_build_query(['_csrf' => $csrf, 'code' => 'X-' . strtoupper($sessionId), 'name_th' => 'probe']));
    ok('a refused write answers with a code, not a 500',
        in_array($badPerm['status'], [200, 400, 403], true) && !isset($badPerm['json']['fatal']),
        'status=' . $badPerm['status'] . ' code=' . (string)($badPerm['json']['code'] ?? '-'));

    $unknown = call($base . '?action=not_a_real_action', $cookie);
    ok('an unknown action is refused', $unknown['status'] === 400, 'status=' . $unknown['status']);

    echo PHP_EOL . '== Server log ==' . PHP_EOL;
    $log = (string)@file_get_contents($serverLog);
    $fatals = preg_match_all('/PHP (Fatal|Parse) error|Warning:|Notice:/i', $log, $m2);
    ok('no PHP error in the server log', $fatals === 0, trim((string)preg_replace('/\s+/', ' ', mb_substr($log, 0, 200))));
} catch (Throwable $e) {
    $fail++;
    echo '  FAIL  uncaught: ' . $e->getMessage() . PHP_EOL;
} finally {
    if (is_resource($proc)) {
        proc_terminate($proc, 9);
        proc_close($proc);
    }
    @unlink($sessionFile);
    // the probe search left one honest log row behind; take it out again
    try {
        $n = $pdo->exec('DELETE FROM knowledge_search_log WHERE normalized_query LIKE '
                        . $pdo->quote('%zzz-no-csrf-' . strtolower($sessionId) . '%'));
        $g = $pdo->exec('DELETE FROM knowledge_gap WHERE normalized_term LIKE '
                        . $pdo->quote('%zzz-no-csrf-' . strtolower($sessionId) . '%'));
        $pdo->exec('DELETE FROM knowledge_activity WHERE entity_type = \'knowledge_gap\''
                   . ' AND description LIKE ' . $pdo->quote('%zzz-no-csrf-' . strtolower($sessionId) . '%'));
        $pdo->exec('DELETE FROM knowledge_category WHERE code = ' . $pdo->quote('X-' . strtoupper($sessionId)));
        echo PHP_EOL . 'cleanup: ' . (int)$n . ' search log(s), ' . (int)$g . ' gap(s) removed' . PHP_EOL;
    } catch (Throwable $e) {
        echo '  NOTE  cleanup failed: ' . $e->getMessage() . PHP_EOL;
    }
    echo 'knowledge_article rows: ' . (int)$pdo->query('SELECT COUNT(*) FROM knowledge_article')->fetchColumn() . PHP_EOL;
}

echo PHP_EOL . "PASS: {$pass}   FAIL: {$fail}" . PHP_EOL;
exit($fail > 0 ? 1 : 0);