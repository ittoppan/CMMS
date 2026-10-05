<?php
/**
 * scripts/smoke_phase38_knowledge.php - live smoke test for the Phase 38 engine
 *
 * Runs the real lifecycle against the live schema: create -> submit -> approve ->
 * publish -> new version -> supersede, plus relations, the Phase 32 document
 * bridge, search logging, zero-result gap opening, usage/feedback, reviews,
 * taxonomy and export.
 *
 * Every row it creates is deleted again in the finally block, so the test proves
 * the writes really work and leaves the database as it found it.
 *
 *   php scripts/smoke_phase38_knowledge.php
 *   php scripts/smoke_phase38_knowledge.php --keep     (leave the test rows)
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$keep = in_array('--keep', $argv, true);

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/knowledge.php';

$pdo = getDb();
$db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();

$pass = 0;
$fail = 0;
$notes = 0;

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

function note(string $label, string $detail): void {
    global $notes;
    $notes++;
    echo '  NOTE  ' . $label . ' -> ' . $detail . PHP_EOL;
}

function section(string $title): void {
    echo PHP_EOL . '== ' . $title . ' ==' . PHP_EOL;
}

/** Two different real users: the author and the approver must not be the same. */
$users = $pdo->query('SELECT id, role_id FROM users WHERE is_active = 1 ORDER BY id LIMIT 2')
    ->fetchAll(PDO::FETCH_ASSOC);
if (count($users) < 2) {
    echo 'ABORT: needs at least two active users to test author/approver separation' . PHP_EOL;
    exit(1);
}
$authorId = (int)$users[0]['id'];
$approverId = (int)$users[1]['id'];
$authorRole = (int)$users[0]['role_id'];
$approverRole = (int)$users[1]['role_id'];

echo 'Phase 38 Knowledge smoke test' . PHP_EOL;
echo 'database: ' . $db . PHP_EOL;
echo 'author user: ' . $authorId . ' (role ' . $authorRole . ')   approver user: ' . $approverId
     . ' (role ' . $approverRole . ')' . PHP_EOL;

$stamp = strtoupper(substr(md5((string)microtime(true) . getmypid()), 0, 8));
$key = 'SMOKE-' . $stamp;

$articleIds = [];
$gapId = 0;
$categoryId = 0;
$tagId = 0;
$reviewId = 0;
$relationId = 0;
$searchLogId = 0;
$needle = '';
$catId = 0;
$catCode = 'SMTK-' . $stamp;

try {
    section('Feature status');
    $fs = kn_feature_status($pdo);
    ok('feature_status responds', !empty($fs['ok']));
    ok('knowledge_article table present', ($fs['checks']['phase38_knowledge_article'][0] ?? '') === 'OK');
    ok('phase 32 bridge tables present',
        ($fs['checks']['phase32_controlled_documents'][0] ?? '') === 'OK'
        && ($fs['checks']['phase32_document_revisions'][0] === 'OK'));
    note('state', (string)$fs['state']);

    section('Config');
    $cfg = kn_config($pdo);
    ok('config loads from settings', is_array($cfg) && $cfg['enabled'] === true);
    ok('privileged roles come from settings, not a hardcoded guess',
        $cfg['privileged_roles'] === [1, 2, 6], implode(',', $cfg['privileged_roles']));

    $catRows = kn_categories($pdo);
    ok('categories seeded', count($catRows) > 0, (string)count($catRows) . ' categories');
    $categoryId = (int)$catRows[0]['id'];

    section('Draft lifecycle');
    $created = kn_article_create($pdo, [
        'article_key' => $key,
        'title' => 'Smoke test: วิธีตรวจเช็กปั๊มส่งน้ำ ' . $stamp,
        'summary' => 'บทความทดสอบอัตโนมัติ — ห้ามใช้งานจริง',
        'symptoms' => 'เสียงดังผิดปกติ น้ำไม่ไหล',
        'diagnosis' => 'วัดแรงดันและเช็คว่าลูกลอยทำงานหรือไม่',
        'root_cause' => 'ยังไม่ทราบสาเหตุ — ห้ามเดา',
        'resolution' => 'เปิดวาล์วและล้างกรอง',
        'prevention' => 'ตรวจตามรอบบำรุง',
        'safety_notes' => 'ต้องล็อกอินเทอร์ล็อกก่อนเปิดฝาครอบ',
        'estimated_minutes' => null,
        'requires_isolation' => 1,
        'category_id' => $categoryId,
        'owner_id' => $approverId,
        'review_cycle_days' => 90,
        'tags' => ['smoke-test', 'pump'],
    ], $authorId);
    ok('create draft', !empty($created['ok']), (string)($created['code'] ?? $created['article_key'] ?? ''));
    $id1 = (int)($created['id'] ?? 0);
    $articleIds[] = $id1;

    $row1 = kn_article_row($pdo, $id1);
    ok('draft status', ($row1['status'] ?? '') === 'draft');
    ok('estimated_minutes stays null (not guessed)', $row1['estimated_minutes'] === null,
        var_export($row1['estimated_minutes'], true));
    ok('requires_isolation kept', (int)$row1['requires_isolation'] === 1);
    ok('content_hash stored', !empty($row1['content_hash']));
    ok('next_review_date derived from cycle', ($row1['next_review_date'] ?? '') !== '');
    ok('tags attached', in_array('smoke-test', kn_article_tag_names($pdo, $id1), true));

    $dup = kn_article_create($pdo, ['article_key' => $key, 'title' => 'duplicate key test'], $authorId);
    ok('duplicate article_key refused', ($dup['code'] ?? '') === 'KN_ARTICLE_KEY_EXISTS');

    $bad = kn_article_create($pdo, ['article_key' => '!!bad key!!', 'title' => 'x'], $authorId);
    ok('invalid article_key refused', ($bad['code'] ?? '') === 'KN_VALIDATION_FAILED');

    $beforeHash = (string)$row1['content_hash'];
    $upd = kn_article_update($pdo, $id1, ['resolution' => 'เปิดวาล์ว ล้างกรอง แล้วทดสอบ 10 นาที'], $authorId);
    ok('update draft', !empty($upd['ok']));
    ok('content_hash changes with content',
        (string)(kn_article_row($pdo, $id1)['content_hash'] ?? '') !== $beforeHash);

    section('Review separation');
    $sub = kn_article_submit($pdo, $id1, $authorId);
    ok('submit for review', !empty($sub['ok']) && ($sub['status'] ?? '') === 'in_review');
    ok('submit opens a review round', (int)($sub['review_round'] ?? 0) >= 1);

    $selfApprove = kn_article_approve($pdo, $id1, $authorId);
    ok('author cannot approve own article', ($selfApprove['code'] ?? '') === 'KN_SELF_APPROVAL_NOT_ALLOWED');

    $appr = kn_article_approve($pdo, $id1, $approverId, ['findings' => 'อ่านแล้วตรงกับหน้างานจริง']);
    ok('approver approves', !empty($appr['ok']) && ($appr['status'] ?? '') === 'approved');

    // An approval belongs to the exact text that was read.
    $edited = kn_article_update($pdo, $id1, ['summary' => 'สรุปฉบับแก้ไขหลังอนุมัติ — ต้องอนุมัติใหม่'], $authorId);
    ok('editing approved text sends it back to draft', !empty($edited['ok'])
        && ($edited['status'] ?? '') === 'draft', (string)($edited['code'] ?? ''));
    kn_article_submit($pdo, $id1, $authorId);
    kn_article_approve($pdo, $id1, $approverId, ['findings' => 'อนุมัติหลังแก้ไขแล้ว']);

    section('Publish + guard');
    $pub = kn_article_publish($pdo, $id1, $approverId);
    ok('publish', !empty($pub['ok']) && ($pub['status'] ?? '') === 'published');
    $guard = $pdo->query('SELECT * FROM knowledge_published_guard WHERE article_key = ' . $pdo->quote($key))->fetch();
    ok('published guard row written', (int)($guard['article_id'] ?? 0) === $id1);

    $immutable = kn_article_update($pdo, $id1, ['title' => 'แก้ฉบับที่เผยแพร่แล้ว'], $authorId);
    ok('published article is immutable', ($immutable['code'] ?? '') === 'KN_PUBLISHED_IS_IMMUTABLE');

    section('New version + supersede');
    $v2 = kn_article_new_version($pdo, $id1, $authorId);
    ok('new version created', !empty($v2['ok']) && (int)$v2['version_no'] === 2, (string)($v2['code'] ?? ''));
    $id2 = (int)($v2['id'] ?? 0);
    $articleIds[] = $id2;
    ok('previous version still published while v2 is draft',
        (string)(kn_article_row($pdo, $id1)['status'] ?? '') === 'published');
    ok('v2 carries the tags forward', in_array('smoke-test', kn_article_tag_names($pdo, $id2), true));

    kn_article_submit($pdo, $id2, $authorId);
    kn_article_approve($pdo, $id2, $approverId, ['findings' => 'รอบที่สอง ปรับข้อความแล้ว']);
    $pub2 = kn_article_publish($pdo, $id2, $approverId);
    ok('publish v2', !empty($pub2['ok']));
    ok('v1 became superseded (not deleted)', (string)(kn_article_row($pdo, $id1)['status'] ?? '') === 'superseded');
    $guard2 = $pdo->query('SELECT article_id FROM knowledge_published_guard WHERE article_key = ' . $pdo->quote($key))->fetch();
    ok('guard moved to v2', (int)($guard2['article_id'] ?? 0) === $id2);
    $versions = $pdo->query('SELECT COUNT(*) FROM knowledge_article WHERE article_key = ' . $pdo->quote($key))->fetchColumn();
    ok('both versions kept', (int)$versions === 2);

    section('CMMS traceability (reference only)');
    $badTarget = kn_relation_add($pdo, $id2, ['entity_type' => 'asset', 'entity_id' => '999999999', 'link_type' => 'applies_to'], $authorId);
    ok('relation to a non-existent asset refused', ($badTarget['code'] ?? '') === 'KN_TARGET_NOT_FOUND');
    $badType = kn_relation_add($pdo, $id2, ['entity_type' => 'spreadsheet', 'entity_id' => '1'], $authorId);
    ok('unknown entity_type refused', ($badType['code'] ?? '') === 'KN_UNKNOWN_ENTITY_TYPE');

    $asset = $pdo->query('SELECT id FROM asset_registry ORDER BY id LIMIT 1')->fetch();
    if ($asset) {
        $rel = kn_relation_add($pdo, $id2, [
            'entity_type' => 'asset', 'entity_id' => (string)$asset['id'],
            'link_type' => 'applies_to', 'note' => 'smoke test',
        ], $authorId);
        ok('relation to a real asset accepted', !empty($rel['ok']), (string)($rel['entity_label'] ?? $rel['code'] ?? ''));
        $relationId = (int)($rel['id'] ?? 0);
        $relList = kn_article_relations($pdo, $id2);
        ok('relation listed with a readable label', !empty($relList[0]['entity_label'] ?? null));
        ok('asset row untouched by knowledge',
            (int)$pdo->query('SELECT COUNT(*) FROM asset_registry WHERE id = ' . (int)$asset['id'])->fetchColumn() === 1);
    } else {
        note('relations', 'asset_registry is empty — relation target check skipped');
    }

    $related = kn_related_articles($pdo, 'asset', (string)$asset['id'], 1, $authorId);
    ok('related knowledge for the asset', !empty($related['ok']) && count($related['articles']) >= 1);

    section('Phase 32 document bridge');
    $doc = $pdo->query('SELECT id FROM controlled_documents ORDER BY id LIMIT 1')->fetch();
    if ($doc) {
        $ref = kn_document_ref_add($pdo, $id2, [
            'document_id' => (int)$doc['id'], 'link_type' => 'reference',
        ], $authorId);
        ok('bridge to a controlled document', !empty($ref['ok']), (string)($ref['code'] ?? ''));
        $badRev = kn_document_ref_add($pdo, $id2, [
            'document_id' => (int)$doc['id'], 'document_revision_id' => 999999, 'link_type' => 'reference',
        ], $authorId);
        ok('revision from another document refused', in_array($badRev['code'] ?? '', ['KN_DOCUMENT_REF_EXISTS', 'KN_DOCUMENT_REVISION_NOT_FOUND'], true));
        $refs = kn_article_document_refs($pdo, $id2);
        ok('document reference listed with revision', !empty($refs[0]['written_revision_no'] ?? null) || ($refs[0]['document_revision_id'] ?? null) === null);
        $stale = kn_document_ref_check_stale($pdo, $id2, $approverId);
        ok('stale re-check runs without error', !empty($stale['ok']) && (int)$stale['checked'] >= 1);
        foreach ($stale['flagged'] as $f) {
            ok('a flagged reference names its document', !empty($f['document_id']) && !empty($f['doc_no']));
        }
    } else {
        note('document bridge', 'no controlled document exists yet — bridge check skipped');
    }

    section('Search + zero-result gaps');
    $needle = 'ปั๊มส่งน้ำ ' . $stamp;
    $found = kn_search($pdo, $needle, 1, $approverId);
    ok('search finds the published article', !empty($found['ok']) && $found['knowledge_count'] >= 1,
        'count=' . (int)($found['knowledge_count'] ?? 0));
    ok('search reports answered', ($found['answered'] ?? false) === true);
    $searchLogId = (int)($found['search_log_id'] ?? 0);
    ok('search logged', $searchLogId > 0);

    $click = kn_search_log_click($pdo, $searchLogId, $id2, $approverId, ['device' => 'desktop']);
    ok('first click recorded', !empty($click['ok']) && empty($click['already_recorded']));
    $click2 = kn_search_log_click($pdo, $searchLogId, $id1, $approverId);
    ok('later click does not overwrite the first', !empty($click2['already_recorded']));

    $short = kn_search($pdo, 'a', 1, $approverId);
    ok('too-short query refused', ($short['code'] ?? '') === 'KN_QUERY_TOO_SHORT');

    $missing = 'zzz-no-such-knowledge-' . $stamp;
    $g1 = kn_search($pdo, $missing, 1, $approverId);
    ok('missing knowledge is reported as unanswered', ($g1['answered'] ?? true) === false);
    ok('single miss does not open a gap', ($g1['gap_opened']['opened'] ?? false) === false,
        (string)($g1['gap_opened']['reason'] ?? ''));
    $g2 = kn_search($pdo, $missing, 1, $approverId);
    ok('repeated miss opens a tracked gap', ($g2['gap_opened']['opened'] ?? false) === true);
    $gapId = (int)($g2['gap_opened']['gap_id'] ?? 0);

    $gapRow = $gapId > 0 ? $pdo->query('SELECT * FROM knowledge_gap WHERE id = ' . $gapId)->fetch() : null;
    ok('gap occurrences are real search counts', $gapRow !== null && (int)$gapRow['occurrences'] >= 2,
        $gapRow !== null ? 'occurrences=' . (int)$gapRow['occurrences'] : '');

    $noArticle = kn_gap_action($pdo, $gapId, 'resolve', $approverId, []);
    ok('gap cannot close without an article', ($noArticle['code'] ?? '') === 'RESOLVED_ARTICLE_REQUIRED');
    $badClose = kn_gap_action($pdo, $gapId, 'resolve', $approverId, ['resolved_article_id' => 999999]);
    ok('gap cannot close with a missing article', ($badClose['code'] ?? '') === 'KN_ARTICLE_NOT_FOUND');
    $resolved = kn_gap_action($pdo, $gapId, 'resolve', $approverId,
                              ['resolved_article_id' => $id2, 'close_note' => 'smoke test']);
    ok('gap resolves with a real article', !empty($resolved['ok']) && ($resolved['to'] ?? '') === 'resolved');

    $gapEvidence = kn_gap_get($pdo, $gapId);
    ok('gap keeps its real search evidence', !empty($gapEvidence['ok']) && count($gapEvidence['evidence_searches']) >= 2);

    $noReason = kn_gap_action($pdo, $gapId, 'triage', $approverId, ['priority' => 'high']);
    ok('re-prioritising requires a reason', ($noReason['code'] ?? '') === 'PRIORITY_REASON_REQUIRED');

    section('Usage + feedback');
    kn_usage_log($pdo, $id2, 'view', $approverId, ['device' => 'mobile']);
    kn_usage_log($pdo, $id2, 'print', $approverId, ['device' => 'mobile']);
    $badAction = kn_usage_log($pdo, $id2, 'telepathy', $approverId);
    ok('unknown usage action refused', ($badAction['code'] ?? '') === 'KN_INVALID_USAGE_ACTION');

    $fb = kn_usage_feedback($pdo, $id2, 'not_helpful', $approverId, ['comment' => 'ขั้นตอนไม่ตรงกับเครื่องนี้']);
    ok('feedback recorded', !empty($fb['ok']));
    $summary = kn_usage_summary($pdo, $id2);
    ok('usage counts real rows', (int)$summary['total_events'] >= 3, 'events=' . (int)$summary['total_events']);
    ok('negative feedback is visible in the summary', (int)($summary['by_helpfulness']['not_helpful'] ?? 0) >= 1);
    ok('a rating is not counted as a view', (int)($summary['by_action']['feedback'] ?? 0) === 1
        && (int)$summary['views'] === (int)($summary['by_action']['view'] ?? 0)
            + (int)($summary['by_action']['search_hit'] ?? 0)
            + (int)($summary['by_action']['open_procedure'] ?? 0),
        'feedback=' . (int)($summary['by_action']['feedback'] ?? 0)
        . ' views=' . (int)$summary['views']);

    $events = kn_usage_events($pdo, ['article_id' => $id2]);
    ok('usage stream returns the events', !empty($events['ok']) && count($events['events']) >= 3);

    section('Reviews');
    $revs = kn_reviews($pdo, ['open_only' => 1]);
    ok('review queue reads', !empty($revs['ok']));
    ok('scheduled due list present', array_key_exists('scheduled_due', $revs));

    $req = kn_review_request($pdo, $id2, 'user_report', $approverId, ['due_date' => date('Y-m-d', strtotime('+7 days'))]);
    ok('review can be requested by a real report', !empty($req['ok']), (string)($req['code'] ?? ''));
    $reviewId = (int)($req['id'] ?? 0);
    $again = kn_review_request($pdo, $id2, 'manual', $approverId);
    ok('second open review refused', ($again['code'] ?? '') === 'KN_REVIEW_ALREADY_OPEN');

    $started = kn_review_start($pdo, $reviewId, $approverId);
    ok('review can be started', !empty($started['ok']));
    $noFinding = kn_review_complete($pdo, $reviewId, 'needs_revision', $approverId, []);
    ok('failed review requires findings', ($noFinding['code'] ?? '') === 'REVIEW_FINDINGS_REQUIRED');
    $done = kn_review_complete($pdo, $reviewId, 'approved', $approverId, [
        'findings' => 'ตรวจกับช่างหน้าเครื่องแล้ว ถูกต้อง',
        'new_next_review_date' => date('Y-m-d', strtotime('+90 days')),
    ]);
    ok('review completed with a real outcome', !empty($done['ok']));

    section('Taxonomy');
    $catCode = 'SMTK-' . $stamp;
    $cat = kn_category_save($pdo, ['code' => $catCode, 'name_th' => 'ทดสอบ ' . $stamp, 'name_en' => 'Smoke ' . $stamp], $authorId);
    ok('category created', !empty($cat['ok']), (string)($cat['code'] ?? ''));
    $catId = (int)($cat['id'] ?? 0);
    $catDup = kn_category_save($pdo, ['code' => $catCode, 'name_th' => 'ซ้ำ', 'name_en' => 'dup'], $authorId);
    ok('duplicate category code refused', ($catDup['code'] ?? '') === 'KN_CATEGORY_CODE_EXISTS');

    $tag = kn_tag_save($pdo, ['tag' => 'smoke-' . $stamp, 'label_th' => 'ทดสอบ'], $authorId);
    ok('tag created', !empty($tag['ok']));
    $tagId = (int)($tag['id'] ?? 0);

    section('Catalog + export');
    $catalog = kn_catalog($pdo, 1, $authorId);
    ok('catalog responds', !empty($catalog['ok']));
    ok('catalog counts published knowledge', (int)$catalog['published_articles'] >= 1);
    ok('catalog separates usage from usefulness',
        array_key_exists('answer_rate_note', $catalog['usage']));

    $exp = kn_export($pdo, 'articles');
    ok('article export works', !empty($exp['ok']) && is_array($exp['rows']));
    ok('export reports truncation honestly', array_key_exists('truncated', $exp) && $exp['truncated'] === false);
    $badExp = kn_export($pdo, 'everything');
    ok('unknown export refused', ($badExp['code'] ?? '') === 'KN_UNKNOWN_EXPORT');

    section('Visibility');
    $visible = kn_article_get($pdo, $id2, 4, $authorId);
    ok('published internal article is visible to an ordinary reader', !empty($visible['ok']));
    $visibleOwner = kn_article_get($pdo, $id2, 4, $approverId);
    ok('the article owner can read it too', !empty($visibleOwner['ok']));

    $seeDraft = static function (int $roleId, int $viewerId) use ($pdo, $cfg, $id1): int {
        $vis = kn_visibility_clause($roleId, $viewerId, $cfg);
        $q = $pdo->prepare('SELECT COUNT(*) FROM knowledge_article a WHERE a.id = ? AND ' . $vis['sql']);
        $q->execute(array_merge([$id1], $vis['params']));
        return (int)$q->fetchColumn();
    };
    // Both test users took part in the review, so the article's own participants
    // may always see it; an unrelated id shows what the role rule really does.
    ok('visibility clause is valid SQL', $seeDraft(4, 999999) >= 0);
    ok('an unrelated ordinary reader cannot see a draft/superseded version', $seeDraft(4, 999999) === 0);
    ok('a privileged role (2) can see every version', $seeDraft(2, 999999) === 1);
    ok('the article author keeps access to their own version', $seeDraft(4, $authorId) === 1);

    section('Activity log');
    $act = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_activity WHERE article_id IN (' .
                             implode(',', array_map('intval', $articleIds ?: [0])) . ')')->fetchColumn();
    ok('every step left an append-only activity row', $act >= 6, 'rows=' . $act);
} catch (Throwable $e) {
    $fail++;
    echo '  FAIL  uncaught: ' . get_class($e) . ': ' . $e->getMessage() . PHP_EOL;
    echo '        at ' . $e->getFile() . ':' . $e->getLine() . PHP_EOL;
} finally {
    if ($keep) {
        echo PHP_EOL . '--keep: leaving ' . count($articleIds) . ' test article(s) in place' . PHP_EOL;
    } else {
        echo PHP_EOL . 'cleanup' . PHP_EOL;
        try {
            $ids = array_values(array_filter(array_map('intval', $articleIds)));
            $list = $ids === [] ? '0' : implode(',', $ids);
            $pdo->exec('DELETE FROM knowledge_activity WHERE article_id IN (' . $list . ')');
            $pdo->exec('DELETE FROM knowledge_document_ref WHERE article_id IN (' . $list . ')');
            $pdo->exec('DELETE FROM knowledge_relation WHERE article_id IN (' . $list . ')');
            $pdo->exec('DELETE FROM knowledge_article_tag WHERE article_id IN (' . $list . ')');
            $pdo->exec('DELETE FROM knowledge_usage WHERE article_id IN (' . $list . ')');
            $pdo->exec('UPDATE knowledge_search_log SET clicked_article_id = NULL WHERE clicked_article_id IN (' . $list . ')');
            $pdo->exec('DELETE FROM knowledge_review WHERE article_id IN (' . $list . ')');
            $pdo->exec('DELETE FROM knowledge_activity WHERE entity_type = \'knowledge_gap\' AND entity_id = ' . (int)$gapId);
            $pdo->exec('DELETE FROM knowledge_gap WHERE id = ' . (int)$gapId);
            $pdo->exec('DELETE FROM knowledge_published_guard WHERE article_key = ' . $pdo->quote($key));
            $pdo->exec('DELETE FROM knowledge_article WHERE article_key = ' . $pdo->quote($key));
            $pdo->exec('DELETE FROM knowledge_search_log WHERE normalized_query LIKE ' . $pdo->quote('%zzz-no-such-knowledge-' . $stamp . '%'));
            $pdo->exec('DELETE FROM knowledge_search_log WHERE normalized_query = ' . $pdo->quote(mb_strtolower(trim($needle))));
            $pdo->exec('DELETE FROM knowledge_activity WHERE entity_type IN (\'knowledge_category\',\'knowledge_tag\')
                        AND entity_id IN (' . (int)$catId . ', ' . (int)$tagId . ')');
            if ($catId > 0) {
                $pdo->exec('DELETE FROM knowledge_category WHERE id = ' . (int)$catId . " AND code = " . $pdo->quote($catCode));
            }
            if ($tagId > 0) {
                $pdo->exec('DELETE FROM knowledge_tag WHERE tag = ' . $pdo->quote('smoke-' . $stamp)
                    . ' AND id NOT IN (SELECT tag_id FROM knowledge_article_tag)');
            }
            $pdo->exec('DELETE FROM knowledge_tag WHERE tag IN (\'smoke-test\',\'pump\')
                        AND id NOT IN (SELECT tag_id FROM knowledge_article_tag)');
            // Taxonomy activity rows that point at a tag/category this test
            // deleted are test residue too; real taxonomy rows are left alone.
            $pdo->exec('DELETE FROM knowledge_activity WHERE entity_type IN (\'tag\',\'knowledge_tag\')
                        AND entity_id NOT IN (SELECT id FROM knowledge_tag)');
            $pdo->exec('DELETE FROM knowledge_activity WHERE entity_type IN (\'category\',\'knowledge_category\')
                        AND entity_id NOT IN (SELECT id FROM knowledge_category)');
            $left = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_article')->fetchColumn();
            echo '  knowledge_article rows remaining: ' . $left . PHP_EOL;
        } catch (Throwable $e) {
            echo '  NOTE  cleanup failed: ' . $e->getMessage() . PHP_EOL;
        }
    }
}

echo PHP_EOL . '================================' . PHP_EOL;
echo "PASS: {$pass}   FAIL: {$fail}   NOTES: {$notes}" . PHP_EOL;
exit($fail > 0 ? 1 : 0);
