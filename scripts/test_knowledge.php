<?php
/**
 * scripts/test_knowledge.php — behavioral harness for the Phase 38 Knowledge
 * engine (src/helpers/knowledge.php).
 *
 * Runs against a THROWAWAY database = live DB name + "_kntest".
 *   php scripts/test_knowledge.php [--keep]
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
$scratch = $live . '_kntest';

if (!str_ends_with($scratch, '_kntest') || $scratch === $live || !preg_match('/^[A-Za-z0-9_]+$/', $scratch)) {
    fwrite(STDERR, "GUARD: refusing to use unsafe scratch name '$scratch'\n");
    exit(2);
}

$pass_count = 0; $fail_count = 0; $failures = [];
function check(string $label, $cond, string $extra = ''): void {
    global $pass_count, $fail_count, $failures;
    if ($cond) { $pass_count++; echo "  PASS  $label\n"; }
    else { $fail_count++; $failures[] = $label; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }
}
function approx($a, $b, float $eps = 1e-6): bool {
    return $a !== null && $b !== null && is_numeric($a) && is_numeric($b) && abs((float)$a - (float)$b) <= $eps;
}

$admin = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
echo "Knowledge harness on scratch DB: $scratch (live: $live)\n";
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
require_once __DIR__ . '/../src/helpers/knowledge.php';

$pdo = getDb();
$cur = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
if ($cur !== $scratch) { fwrite(STDERR, "GUARD: connected to '$cur', expected '$scratch'\n"); exit(2); }
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');

$UID_AUTHOR = 7;
$UID_OTHER  = 8;
$ROLE_PRIV  = 1;
$ROLE_READ  = 5;

/* ================================================================= 1. constants */
echo "\n[1] constants\n";
check('KN_VERSION', KN_VERSION === 'phase38.1');
check('6 statuses', KN_STATUSES === ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived']);
check('draft -> in_review', KN_TRANSITIONS['draft'] === ['in_review']);
check('in_review -> approved,draft', KN_TRANSITIONS['in_review'] === ['approved', 'draft']);
check('published -> superseded,archived', KN_TRANSITIONS['published'] === ['superseded', 'archived']);
check('archived -> []', KN_TRANSITIONS['archived'] === []);
check('3 confidentiality', KN_CONFIDENTIALITY === ['internal', 'restricted', 'confidential']);
check('7 relation link types', count(KN_RELATION_LINK_TYPES) === 7);
check('8 usage actions', KN_USAGE_ACTIONS === ['view', 'open_procedure', 'print', 'download', 'copy_link', 'search_hit', 'acknowledge', 'feedback']);
check('5 gap statuses', KN_GAP_STATUSES === ['open', 'triaged', 'in_progress', 'resolved', 'rejected']);
check('5 review triggers', KN_REVIEW_TRIGGERS === ['scheduled', 'incident', 'major_revision', 'user_report', 'manual']);
check('13 permission actions', count(KN_PERMISSION_ACTIONS) === 13);

/* ================================================================= 2. config */
echo "\n[2] kn_config() defaults\n";
$cfg = kn_config($pdo);
check('enabled true', $cfg['enabled'] === true);
check('min_query_len 2', $cfg['min_query_len'] === 2);
check('max_results 50', $cfg['max_results'] === 50);
check('gap_min_occurrences 2', $cfg['gap_min_occurrences'] === 2);
check('gap_window_days 180', $cfg['gap_window_days'] === 180);
check('gap_default_priority medium', $cfg['gap_default_priority'] === 'medium');
check('review_default_days 180', $cfg['review_default_days'] === 180);
check('publish_requires_approved true', $cfg['publish_requires_approved'] === true);
check('publish_requires_category true', $cfg['publish_requires_category'] === true);
check('publish_requires_relation false', $cfg['publish_requires_relation'] === false);
check('search_include_manuals false', $cfg['search_include_manuals'] === false);
check('privileged_roles [1,2,6]', $cfg['privileged_roles'] === [1, 2, 6]);
check('page_default_size 25', $cfg['page_default_size'] === 25);
check('privileged: role 1 yes', kn_role_is_privileged(1, $cfg) === true);
check('privileged: role 5 no', kn_role_is_privileged(5, $cfg) === false);

/* ================================================================= 3. pure helpers */
echo "\n[3] pure helpers\n";
check('normalize_query collapses+lowercases', kn_normalize_query("  Hello   WORLD  ") === 'hello world');
check('normalize_key upper+dash', kn_normalize_key('pump seal repl') === 'PUMP-SEAL-REPL');
check('normalize_key keeps dots', kn_normalize_key('a.b-c_1') === 'A.B-C_1');
check('valid_key min 3', kn_valid_key('ABC') === true);
check('valid_key too short', kn_valid_key('AB') === false);
check('valid_key leading dash invalid', kn_valid_key('-ABC') === false);
check('valid_key 60 ok', kn_valid_key('A' . str_repeat('B', 59)) === true);
check('valid_key 61 too long', kn_valid_key('A' . str_repeat('B', 60)) === false);

$h1 = kn_content_hash(['title' => 'Pump Seal', 'summary' => 'Replace it']);
$h2 = kn_content_hash(['title' => '  pump   seal ', 'summary' => 'REPLACE IT']);
check('content_hash case+ws normalised', $h1 === $h2);
$h3 = kn_content_hash(['title' => 'Pump Seal', 'summary' => 'Replace them']);
check('content_hash changes with content', $h1 !== $h3);
$h4 = kn_content_hash(['title' => 'Pump Seal', 'summary' => 'Replace it', 'article_key' => 'X', 'version_no' => 9]);
check('content_hash ignores key+version', $h1 === $h4);
check('content_hash is sha256 hex', preg_match('/^[0-9a-f]{64}$/', $h1) === 1);

check('date_add +1', kn_date_add('2026-01-31', 1) === '2026-02-01');
check('date_add +30', kn_date_add('2026-01-31', 30) === '2026-03-02');
check('date_add invalid -> null', kn_date_add('not-a-date', 1) === null);
check('days_between', kn_days_between('2026-01-01', '2026-01-31') === 30);
check('days_between negative', kn_days_between('2026-01-31', '2026-01-01') === -30);

check('text null -> null', kn_text(null, 10) === null);
check('text blank -> null', kn_text('   ', 10) === null);
check('text trim', kn_text('  x  ', 10) === 'x');
check('text truncate', kn_text('abcdefghij', 4) === 'abcd');

check('normalize_tag lowercase', kn_normalize_tag('Bearing') === 'bearing');
check('normalize_tag spaces->dash', kn_normalize_tag('Ball Bearing') === 'ball-bearing');
check('normalize_tag strips symbols', kn_normalize_tag('a@b') === 'ab');
check('normalize_tag blank -> empty', kn_normalize_tag('   ') === '');

$pg = kn_paging([], $cfg);
check('paging default 25/0', $pg['limit'] === 25 && $pg['offset'] === 0 && $pg['page'] === 1);
$pg2 = kn_paging(['limit' => 999, 'page' => 3], $cfg);
check('paging clamps limit to 200', $pg2['limit'] === 200);
check('paging offset', $pg2['offset'] === 400);
check('paging page 0 -> 1', kn_paging(['page' => 0], $cfg)['page'] === 1);

/* ================================================================= 4. entity map */
echo "\n[4] entity map\n";
$types = kn_entity_types();
check('11 entity types', count($types) === 11, implode(',', $types));
check('has work_order', in_array('work_order', $types, true));
check('has asset_class', in_array('asset_class', $types, true));
check('work_order -> repair', kn_entity_map()['work_order']['table'] === 'repair');
check('asset -> asset_registry', kn_entity_map()['asset']['table'] === 'asset_registry');

/* ================================================================= 5. taxonomy */
echo "\n[5] taxonomy\n";
$catRes = kn_category_save($pdo, ['code' => 'HYD', 'name_th' => 'ระบบไฮดรอลิก', 'name_en' => 'Hydraulics'], $UID_AUTHOR);
check('category create ok', ($catRes['ok'] ?? false) === true, json_encode($catRes, JSON_UNESCAPED_UNICODE));
$CAT = (int)$catRes['id'];
check('category id > 0', $CAT > 0);
check('category bad code', (kn_category_save($pdo, ['code' => '!', 'name_th' => 'x'], $UID_AUTHOR)['code'] ?? '') === 'KN_CATEGORY_CODE_INVALID');
check('category name required', (kn_category_save($pdo, ['code' => 'NO_NAME'], $UID_AUTHOR)['code'] ?? '') === 'KN_CATEGORY_NAME_REQUIRED');
check('category dup code', (kn_category_save($pdo, ['code' => 'HYD', 'name_th' => 'again', 'name_en' => 'again'], $UID_AUTHOR)['code'] ?? '') === 'KN_CATEGORY_CODE_EXISTS');
check('category parent not found', (kn_category_save($pdo, ['code' => 'CHILD', 'name_th' => 'child', 'parent_id' => 999999], $UID_AUTHOR)['code'] ?? '') === 'KN_CATEGORY_PARENT_NOT_FOUND');
$thOnly = kn_category_save($pdo, ['code' => 'THONLY', 'name_th' => 'ไทยเท่านั้น'], $UID_AUTHOR);
check('category thai-only name accepted', ($thOnly['ok'] ?? false) === true, json_encode($thOnly, JSON_UNESCAPED_UNICODE));
check('category_ok true', kn_category_ok($pdo, $CAT) === true);
check('category_ok false for 0', kn_category_ok($pdo, 0) === false);
check('categories list >=1', count(kn_categories($pdo)) >= 1);

$tagRes = kn_tag_save($pdo, ['tag' => 'Pump', 'label_th' => 'ปั๊ม'], $UID_AUTHOR);
check('tag create ok', ($tagRes['ok'] ?? false) === true, json_encode($tagRes));
check('tag normalised', ($tagRes['tag'] ?? '') === 'pump');
check('tag dup', (kn_tag_save($pdo, ['tag' => 'PUMP'], $UID_AUTHOR)['code'] ?? '') === 'KN_TAG_EXISTS');
check('tag invalid short', (kn_tag_save($pdo, ['tag' => 'x'], $UID_AUTHOR)['code'] ?? '') === 'KN_TAG_INVALID');

$rt = kn_resolve_tags($pdo, ['Pump', '  pump ', 'Seal'], false);
check('resolve unknown does not create', $rt['unknown'] === ['seal'] && count($rt['ids']) === 1);
$rt2 = kn_resolve_tags($pdo, ['Pump', 'Seal'], true);
check('resolve creates missing', count($rt2['ids']) === 2 && $rt2['unknown'] === []);
check('resolve dedupes', count(kn_resolve_tags($pdo, ['pump', 'PUMP'], true)['ids']) === 1);

/* ================================================================= 6. article create/read */
echo "\n[6] article create + read\n";
$A1 = kn_article_create($pdo, [
    'title' => 'Pump seal replacement procedure',
    'article_key' => 'pump-seal-repl',
    'category_id' => $CAT,
    'confidentiality' => 'internal',
    'estimated_minutes' => 45,
    'requires_isolation' => true,
    'review_cycle_days' => 180,
    'summary' => 'Replace the mechanical seal',
    'tags' => ['Pump', 'Seal'],
], $UID_AUTHOR);
check('create ok', ($A1['ok'] ?? false) === true, json_encode($A1));
$ID1 = (int)$A1['id'];
check('create draft v1', $A1['status'] === 'draft' && $A1['version_no'] === 1);
$row1 = kn_article_row($pdo, $ID1);
check('key normalised', $row1['article_key'] === 'PUMP-SEAL-REPL');
check('requires_isolation stored as 1', (int)$row1['requires_isolation'] === 1);
check('estimated_minutes stored', (int)$row1['estimated_minutes'] === 45);
check('content_hash sha256', preg_match('/^[0-9a-f]{64}$/', (string)$row1['content_hash']) === 1);
check('next_review_date = +180', $row1['next_review_date'] === kn_date_add(date('Y-m-d'), 180), (string)$row1['next_review_date']);
check('tags attached', kn_article_tag_names($pdo, $ID1) === ['pump', 'seal']);

$v = kn_validate_article_payload(['title' => 'ab', 'article_key' => 'ABC'], true);
check('title too short', ($v['errors']['title'] ?? '') === 'TITLE_REQUIRED');
$v = kn_validate_article_payload(['title' => 'Good title', 'article_key' => '!!'], true);
check('bad article key', ($v['errors']['article_key'] ?? '') === 'ARTICLE_KEY_INVALID');
$v = kn_validate_article_payload(['title' => 'Good title', 'article_key' => 'ABC', 'estimated_minutes' => -1], true);
check('negative minutes invalid', ($v['errors']['estimated_minutes'] ?? '') === 'ESTIMATED_MINUTES_INVALID');
$v = kn_validate_article_payload(['title' => 'Good title', 'article_key' => 'ABC', 'estimated_minutes' => 10081], true);
check('minutes > 10080 invalid', ($v['errors']['estimated_minutes'] ?? '') === 'ESTIMATED_MINUTES_INVALID');
$v = kn_validate_article_payload(['title' => 'Good title', 'article_key' => 'ABC', 'estimated_minutes' => ''], true);
check('empty minutes -> null not measured', $v['values']['estimated_minutes'] === null);
$v = kn_validate_article_payload(['title' => 'Good title', 'article_key' => 'ABC', 'confidentiality' => 'secret'], true);
check('bad confidentiality', ($v['errors']['confidentiality'] ?? '') === 'CONFIDENTIALITY_INVALID');
$v = kn_validate_article_payload(['title' => 'Good title', 'article_key' => 'ABC', 'review_cycle_days' => 0], true);
check('review cycle 0 invalid', ($v['errors']['review_cycle_days'] ?? '') === 'REVIEW_CYCLE_INVALID');

check('dup key rejected', (kn_article_create($pdo, ['title' => 'Another', 'article_key' => 'PUMP-SEAL-REPL'], $UID_AUTHOR)['code'] ?? '') === 'KN_ARTICLE_KEY_EXISTS');
check('bad category rejected', (kn_article_create($pdo, ['title' => 'Another good', 'article_key' => 'NEW-1', 'category_id' => 999999], $UID_AUTHOR)['code'] ?? '') === 'KN_CATEGORY_NOT_FOUND');

check('get requires read permission for draft', (kn_article_get($pdo, $ID1, $ROLE_READ, 999)['code'] ?? '') === 'KN_ARTICLE_NOT_FOUND');
check('author sees own draft', (kn_article_get($pdo, $ID1, $ROLE_READ, $UID_AUTHOR)['ok'] ?? false) === true);
check('privileged sees draft', (kn_article_get($pdo, $ID1, $ROLE_PRIV, 999)['ok'] ?? false) === true);
check('get by key', (kn_article_get($pdo, 'pump-seal-repl', $ROLE_PRIV, 999)['ok'] ?? false) === true);

$list = kn_articles($pdo, $ROLE_PRIV, $UID_OTHER);
check('list published-only default empty', ($list['total'] ?? -1) === 0);
$list2 = kn_articles($pdo, $ROLE_PRIV, $UID_OTHER, ['include_unpublished' => 1]);
check('list include_unpublished finds draft', ($list2['total'] ?? 0) >= 1);

/* ================================================================= 7. update */
echo "\n[7] article update\n";
$up = kn_article_update($pdo, $ID1, ['title' => 'Pump seal replacement (rev)'], $UID_AUTHOR);
check('update ok', ($up['ok'] ?? false) === true && $up['content_changed'] === true);
check('update same content -> unchanged', (kn_article_update($pdo, $ID1, ['title' => 'Pump seal replacement (rev)'], $UID_AUTHOR)['content_changed'] ?? true) === false);
check('key immutable', (kn_article_update($pdo, $ID1, ['article_key' => 'OTHER-KEY'], $UID_AUTHOR)['code'] ?? '') === 'KN_ARTICLE_KEY_IMMUTABLE');

/* ================================================================= 8. lifecycle */
echo "\n[8] lifecycle submit/approve/publish/version/archive\n";
$A2 = kn_article_create($pdo, ['title' => 'Valve leak fix', 'article_key' => 'VALVE-LEAK', 'category_id' => $CAT], $UID_AUTHOR);
$ID2 = (int)$A2['id'];
$sub = kn_article_submit($pdo, $ID2, $UID_AUTHOR);
check('submit ok + round 1', ($sub['ok'] ?? false) === true && $sub['review_round'] === 1, json_encode($sub));
check('submit sets in_review', (kn_article_row($pdo, $ID2)['status']) === 'in_review');
check('submit creates review row', (int)$pdo->query("SELECT COUNT(*) FROM knowledge_review WHERE article_id=$ID2 AND status='pending'")->fetchColumn() === 1);
check('submit again invalid (in_review->in_review)', (kn_article_submit($pdo, $ID2, $UID_AUTHOR)['code'] ?? '') === 'KN_INVALID_TRANSITION');

$appr = kn_article_approve($pdo, $ID2, $UID_OTHER);
check('approve ok', ($appr['ok'] ?? false) === true, json_encode($appr));
check('approve sets approved', kn_article_row($pdo, $ID2)['status'] === 'approved');
check('approve marks review approved', (int)$pdo->query("SELECT COUNT(*) FROM knowledge_review WHERE article_id=$ID2 AND status='approved'")->fetchColumn() === 1);

$pub = kn_article_publish($pdo, $ID2, $UID_OTHER);
check('publish ok', ($pub['ok'] ?? false) === true, json_encode($pub));
check('publish leaves article published', kn_article_row($pdo, $ID2)['status'] === 'published');
check('publish guard row exists', (int)$pdo->query("SELECT COUNT(*) FROM knowledge_published_guard WHERE article_key='VALVE-LEAK'")->fetchColumn() === 1);
check('published visible to reader', (kn_article_get($pdo, $ID2, $ROLE_READ, 999)['ok'] ?? false) === true);

check('published immutable', (kn_article_update($pdo, $ID2, ['title' => 'edit me'], $UID_OTHER)['code'] ?? '') === 'KN_PUBLISHED_IS_IMMUTABLE');

$nv = kn_article_new_version($pdo, $ID2, $UID_OTHER);
check('new_version ok v2', ($nv['ok'] ?? false) === true && $nv['version_no'] === 2, json_encode($nv));
$ID2b = (int)$nv['id'];
check('old version still published', kn_article_row($pdo, $ID2)['status'] === 'published');
check('new version is draft', kn_article_row($pdo, $ID2b)['status'] === 'draft');

kn_article_submit($pdo, $ID2b, $UID_OTHER);
kn_article_approve($pdo, $ID2b, $UID_AUTHOR);
$pub2 = kn_article_publish($pdo, $ID2b, $UID_AUTHOR);
check('publish v2 ok', ($pub2['ok'] ?? false) === true, json_encode($pub2));
check('v2 supersedes v1', (int)($pub2['superseded_id'] ?? 0) === $ID2);
check('v1 now superseded', kn_article_row($pdo, $ID2)['status'] === 'superseded');
check('v1 superseded_by_id = v2', (int)kn_article_row($pdo, $ID2)['superseded_by_id'] === $ID2b);
check('guard points at v2', (int)$pdo->query("SELECT article_id FROM knowledge_published_guard WHERE article_key='VALVE-LEAK'")->fetchColumn() === $ID2b);

check('archive needs reason', (kn_article_archive($pdo, $ID2b, $UID_AUTHOR, '')['code'] ?? '') === 'ARCHIVE_REASON_REQUIRED');
$arc = kn_article_archive($pdo, $ID2b, $UID_AUTHOR, 'replaced by new SOP');
check('archive ok', ($arc['ok'] ?? false) === true, json_encode($arc));
check('archived status', kn_article_row($pdo, $ID2b)['status'] === 'archived');
check('archive removes guard', (int)$pdo->query("SELECT COUNT(*) FROM knowledge_published_guard WHERE article_key='VALVE-LEAK'")->fetchColumn() === 0);

$A3 = kn_article_create($pdo, ['title' => 'Motor bearing inspection', 'article_key' => 'MOTOR-BRG', 'category_id' => $CAT], $UID_AUTHOR);
$ID3 = (int)$A3['id'];
kn_article_submit($pdo, $ID3, $UID_AUTHOR);
check('self-approval blocked', (kn_article_approve($pdo, $ID3, $UID_AUTHOR)['code'] ?? '') === 'KN_SELF_APPROVAL_NOT_ALLOWED');
check('self-approval override allowed', (kn_article_approve($pdo, $ID3, $UID_AUTHOR, ['override_self_approve' => true])['ok'] ?? false) === true);

$A4 = kn_article_create($pdo, ['title' => 'Gasket spec sheet', 'article_key' => 'GASKET-SPEC', 'category_id' => $CAT], $UID_AUTHOR);
$ID4 = (int)$A4['id'];
kn_article_submit($pdo, $ID4, $UID_AUTHOR);
check('send_back from in_review ok', (kn_article_send_back($pdo, $ID4, $UID_OTHER, 'needs work')['ok'] ?? false) === true);
check('send_back -> draft', kn_article_row($pdo, $ID4)['status'] === 'draft');
check('send_back from draft invalid', (kn_article_send_back($pdo, $ID4, $UID_OTHER, 'x')['code'] ?? '') === 'KN_INVALID_TRANSITION');

check('update in_review with content change -> draft',
    (function () use ($pdo, $UID_AUTHOR) {
        $a = kn_article_create($pdo, ['title' => 'Hose replacement guide', 'article_key' => 'HOSE-REPL', 'category_id' => 1], $UID_AUTHOR);
        $id = (int)$a['id'];
        kn_article_submit($pdo, $id, $UID_AUTHOR);
        $r = kn_article_update($pdo, $id, ['title' => 'Hose replacement guide v2'], $UID_AUTHOR);
        return ($r['resubmitted_to_draft'] ?? false) === true && kn_article_row($pdo, $id)['status'] === 'draft';
    })());

/* ================================================================= 9. relations */
echo "\n[9] relations\n";
$pdo->prepare('INSERT INTO departments (code, name) VALUES (?, ?)')->execute(['MAINT', 'Maintenance']);
$DEP = (int)$pdo->lastInsertId();
check('target: unknown entity type', (kn_relation_target_exists($pdo, 'bogus', '1')['code'] ?? '') === 'KN_UNKNOWN_ENTITY_TYPE');
check('target: empty entity id', (kn_relation_target_exists($pdo, 'asset', '')['code'] ?? '') === 'KN_INVALID_ENTITY_ID');
check('target: not found', (kn_relation_target_exists($pdo, 'department', '999999')['code'] ?? '') === 'KN_TARGET_NOT_FOUND');
check('target: department found', (kn_relation_target_exists($pdo, 'department', (string)$DEP)['ok'] ?? false) === true);

$rel = kn_relation_add($pdo, $ID1, ['entity_type' => 'department', 'entity_id' => (string)$DEP, 'link_type' => 'applies_to'], $UID_AUTHOR);
check('relation add ok', ($rel['ok'] ?? false) === true, json_encode($rel));
check('relation bad link type', (kn_relation_add($pdo, $ID1, ['entity_type' => 'department', 'entity_id' => (string)$DEP, 'link_type' => 'nope'], $UID_AUTHOR)['code'] ?? '') === 'KN_INVALID_LINK_TYPE');
check('relation unknown entity', (kn_relation_add($pdo, $ID1, ['entity_type' => 'zzz', 'entity_id' => '1'], $UID_AUTHOR)['code'] ?? '') === 'KN_UNKNOWN_ENTITY_TYPE');
check('relation missing target', (kn_relation_add($pdo, $ID1, ['entity_type' => 'department', 'entity_id' => '999999'], $UID_AUTHOR)['code'] ?? '') === 'KN_TARGET_NOT_FOUND');
$rels = kn_article_relations($pdo, $ID1);
check('article relations lists 1', count($rels) === 1);
check('relation label resolved', ($rels[0]['entity_label'] ?? null) !== null && $rels[0]['target_missing'] === false);
check('relation remove ok', (kn_relation_remove($pdo, $ID1, (int)$rel['id'], $UID_AUTHOR)['ok'] ?? false) === true);
check('relations now empty', kn_article_relations($pdo, $ID1) === []);

/* ================================================================= 10. document bridge */
echo "\n[10] document bridge\n";
check('doc ref unknown document', (kn_document_ref_add($pdo, $ID1, ['document_id' => 999999], $UID_AUTHOR)['code'] ?? '') === 'KN_DOCUMENT_NOT_FOUND');
check('doc ref missing document_id', (kn_document_ref_add($pdo, $ID1, [], $UID_AUTHOR)['code'] ?? '') === 'KN_DOCUMENT_NOT_FOUND');
check('article doc refs empty', kn_article_document_refs($pdo, $ID1) === []);

/* ================================================================= 11. gaps + reviews */
echo "\n[11] gaps + reviews\n";
check('gap create ok', (kn_gap_create($pdo, 'torque spec for flanges', $UID_AUTHOR, ['priority' => 'high'])['ok'] ?? false) === true);
$gap = kn_gap_create($pdo, 'torque spec for flanges', $UID_AUTHOR);
check('gap create dedupes', ($gap['created'] ?? true) === false);
check('gap create empty term', (kn_gap_create($pdo, '   ', $UID_AUTHOR)['code'] ?? '') === 'GAP_TERM_REQUIRED');
check('gap assign needs assignee', (kn_gap_action($pdo, (int)$gap['id'], 'assign', $UID_AUTHOR, [])['code'] ?? '') === 'ASSIGNEE_REQUIRED');
check('gap reject needs note', (kn_gap_action($pdo, (int)$gap['id'], 'reject', $UID_AUTHOR, [])['code'] ?? '') === 'CLOSE_NOTE_REQUIRED');
check('gap unknown action', (kn_gap_action($pdo, (int)$gap['id'], 'frobnicate', $UID_AUTHOR)['code'] ?? '') === 'KN_UNKNOWN_GAP_ACTION');
check('gap resolve needs article', (kn_gap_action($pdo, (int)$gap['id'], 'resolve', $UID_AUTHOR, [])['code'] ?? '') === 'RESOLVED_ARTICLE_REQUIRED');
check('gap stats ok', (kn_gap_stats($pdo)['ok'] ?? false) === true);
check('gap get ok', (kn_gap_get($pdo, (int)$gap['id'])['ok'] ?? false) === true);

check('review request bad trigger', (kn_review_request($pdo, $ID2b, 'nope', $UID_OTHER)['code'] ?? '') === 'KN_INVALID_TRIGGER');
$rev = kn_review_request($pdo, $ID2b, 'incident', $UID_OTHER, ['reviewer_id' => $UID_OTHER]);
check('review request ok', ($rev['ok'] ?? false) === true, json_encode($rev));
check('review request while open blocked', (kn_review_request($pdo, $ID2b, 'incident', $UID_OTHER)['code'] ?? '') === 'KN_REVIEW_ALREADY_OPEN');
check('review start ok', (kn_review_start($pdo, (int)$rev['id'], $UID_OTHER)['ok'] ?? false) === true);
check('review start not pending', (kn_review_start($pdo, (int)$rev['id'], $UID_OTHER)['code'] ?? '') === 'KN_REVIEW_NOT_PENDING');
check('review complete bad outcome', (kn_review_complete($pdo, (int)$rev['id'], 'maybe', $UID_OTHER)['code'] ?? '') === 'KN_INVALID_REVIEW_OUTCOME');
check('review complete non-approved needs findings', (kn_review_complete($pdo, (int)$rev['id'], 'needs_revision', $UID_OTHER, [])['code'] ?? '') === 'REVIEW_FINDINGS_REQUIRED');
check('review complete approved ok', (kn_review_complete($pdo, (int)$rev['id'], 'approved', $UID_OTHER, ['outcome_note' => 'still valid'])['ok'] ?? false) === true);
check('review already closed', (kn_review_complete($pdo, (int)$rev['id'], 'approved', $UID_OTHER)['code'] ?? '') === 'KN_REVIEW_ALREADY_CLOSED');
check('review_due returns array', is_array(kn_review_due($pdo)));
check('reviews list ok', is_array(kn_reviews($pdo)));

/* ================================================================= 12. search */
echo "\n[12] search\n";
$A5 = kn_article_create($pdo, ['title' => 'Valve leak troubleshooting guide', 'article_key' => 'VALVE-LEAK-GUIDE', 'category_id' => $CAT], $UID_AUTHOR);
$ID5 = (int)$A5['id'];
kn_article_submit($pdo, $ID5, $UID_AUTHOR);
kn_article_approve($pdo, $ID5, $UID_OTHER);
kn_article_publish($pdo, $ID5, $UID_OTHER);
$sShort = kn_search($pdo, 'x', $ROLE_PRIV, $UID_OTHER);
check('search too short', ($sShort['code'] ?? '') === 'KN_QUERY_TOO_SHORT');
$sHit = kn_search($pdo, 'valve leak', $ROLE_PRIV, $UID_OTHER);
check('search answered', ($sHit['ok'] ?? false) === true && $sHit['answered'] === true, json_encode(['n' => $sHit['knowledge_count'] ?? null]));
check('search logged', ($sHit['search_log_id'] ?? null) !== null);
$sMiss1 = kn_search($pdo, 'zzz confusing nonsense', $ROLE_PRIV, $UID_OTHER);
check('search miss first not gap', ($sMiss1['answered'] ?? true) === false && ($sMiss1['gap_opened']['opened'] ?? true) === false);
$sMiss2 = kn_search($pdo, 'zzz confusing nonsense', $ROLE_PRIV, $UID_OTHER);
check('search miss second opens gap', ($sMiss2['gap_opened']['opened'] ?? false) === true, json_encode($sMiss2['gap_opened'] ?? null));

/* ================================================================= 13. catalog */
echo "\n[13] catalog\n";
check('catalog ok', (kn_catalog($pdo, $ROLE_PRIV, $UID_OTHER)['ok'] ?? false) === true);
check('feature_status array', is_array(kn_feature_status($pdo)));

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
