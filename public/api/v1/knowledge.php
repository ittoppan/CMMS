<?php
/**
 * knowledge.php - Phase 38 Knowledge Center API adapter
 *
 * A THIN adapter over src/helpers/knowledge.php. All policy, lifecycle rules and
 * SQL live in the helper; this file only does transport, authorization and audit.
 *
 * Authorization is enforced here with requirePerm($pdo, 'knowledge', <action>).
 * The frontend hiding a button is a UX decision, not an authorization one.
 *
 * @package cmms
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/knowledge.php';

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

/** Tag creation is a taxonomy action; without the permission, unknown tags are refused. */
function kn_can_create_tags(PDO $pdo, int $roleId): bool {
    return $roleId === 1 || canPerm($pdo, 'knowledge', 'taxonomy');
}

function kn_api_ok(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Engine failures answer with the engine's own code so the UI can react. */
function kn_api_fail(string $error, string $code = 'KN_ERROR', int $status = 400, array $extra = []): void {
    http_response_code($status);
    echo json_encode(array_merge(['ok' => false, 'error' => $error, 'code' => $code], $extra),
                     JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Map a helper result code onto an HTTP status. */
function kn_status_for(string $code): int {
    if (str_contains($code, 'NOT_FOUND')) {
        return 404;
    }
    if (str_contains($code, 'VALIDATION') || str_contains($code, 'INVALID') || str_contains($code, 'REQUIRED')) {
        return 422;
    }
    if (str_contains($code, 'IMMUTABLE') || str_contains($code, 'EXISTS')
        || str_contains($code, 'CONFLICT') || str_contains($code, 'GUARD')
        || str_contains($code, 'SELF_APPROVAL') || str_contains($code, 'ALREADY')
        || str_contains($code, 'NOT_PENDING') || str_contains($code, 'CLOSED')
        || str_contains($code, 'DISABLED') || str_contains($code, 'TOO_SHORT')) {
        return 409;
    }
    return 400;
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $action = strtolower(trim($_GET['action'] ?? ($_POST['action'] ?? 'catalog')));
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    $userId = (int)($_SESSION['user_id'] ?? 0);
    $roleId = (int)($_SESSION['role_id'] ?? 0);

    $jsonInput = null;
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        if ($raw !== '') {
            $jsonInput = json_decode($raw, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                kn_api_fail('invalid json', 'KN_INVALID_JSON', 400);
            }
        }
    }

    $get = static fn($k, $d = null) => ($jsonInput[$k] ?? ($_POST[$k] ?? ($_GET[$k] ?? $d)));
    $getStr = static fn($k, $d = '') => trim((string)$get($k, $d));
    $getInt = static fn($k, $d = 0) => (int)$get($k, $d);
    $getBool = static fn($k, $d = false) => (in_array(strtolower((string)$get($k, $d ? '1' : '0')), ['1', 'true', 'yes', 'on'], true));

    // Every mutation goes through CSRF. A GET never writes.
    $mutating = static fn(string $a): bool => in_array($a, [
        'article_create', 'article_update', 'article_submit', 'article_approve', 'article_send_back',
        'article_publish', 'article_new_version', 'article_supersede', 'article_archive',
        'relation_add', 'relation_remove', 'document_ref_add', 'document_ref_remove',
        'document_stale_check', 'search_click', 'usage_log', 'usage_feedback',
        'gap_create', 'gap_action', 'review_request', 'review_start', 'review_complete',
        'category_save', 'tag_save',
    ], true);

    if ($mutating($action)) {
        if ($method !== 'POST') {
            kn_api_fail('method not allowed', 'KN_METHOD_NOT_ALLOWED', 405);
        }
        enforceCsrf();
    }

    $perms = [
        'read' => static fn() => requirePerm($pdo, 'knowledge', 'read'),
        'search' => static fn() => requirePerm($pdo, 'knowledge', 'search'),
        'create' => static fn() => requirePerm($pdo, 'knowledge', 'create'),
        'edit' => static fn() => requirePerm($pdo, 'knowledge', 'edit'),
        'submit' => static fn() => requirePerm($pdo, 'knowledge', 'submit'),
        'review' => static fn() => requirePerm($pdo, 'knowledge', 'review'),
        'approve' => static fn() => requirePerm($pdo, 'knowledge', 'approve'),
        'publish' => static fn() => requirePerm($pdo, 'knowledge', 'publish'),
        'feedback' => static fn() => requirePerm($pdo, 'knowledge', 'feedback'),
        'manage_gaps' => static fn() => requirePerm($pdo, 'knowledge', 'manage_gaps'),
        'taxonomy' => static fn() => requirePerm($pdo, 'knowledge', 'taxonomy'),
        'usage_view' => static fn() => requirePerm($pdo, 'knowledge', 'usage_view'),
        'export' => static fn() => requirePerm($pdo, 'knowledge', 'export'),
    ];

    $opts = [
        'id'                => $getInt('id'),
        'q'                 => $getStr('q'),
        'status'            => $getStr('status'),
        'category_id'       => $getInt('category_id'),
        'confidentiality'   => $getStr('confidentiality'),
        'owner_id'          => $getInt('owner_id'),
        'tag'               => $getStr('tag'),
        'limit'             => $getInt('limit'),
        'page'              => $getInt('page', 1),
        'page_size'         => $getInt('page_size'),
        'include_unpublished' => $getBool('include_unpublished'),
        'with_usage'        => $getBool('with_usage'),
        'requires_isolation' => $getBool('requires_isolation'),
        'review_overdue'    => $getBool('review_overdue'),
        'asset_id'          => $getInt('asset_id'),
        'window_days'       => $getInt('window_days'),
        'entity_type'       => $getStr('entity_type'),
        'entity_id'         => $getStr('entity_id'),
        'device'            => $getStr('device'),
        'include_closed'    => $getBool('include_closed'),
        'priority'          => $getStr('priority'),
        'assigned_to'       => $getInt('assigned_to'),
        'min_occurrences'   => $getInt('min_occurrences'),
        'open_only'         => $getBool('open_only'),
        'reviewer_id'       => $getInt('reviewer_id'),
        'helpfulness'       => $getStr('helpfulness'),
        'since'             => $getStr('since'),
        'article_id'        => $getInt('article_id'),
    ];

    switch ($action) {
        /* ---------------- read ---------------- */
        case 'config':
            $perms['read']();
            // The client needs to know what this role may do, otherwise every
            // button has to be discovered by getting a 403.
            $can = [];
            foreach (KN_PERMISSION_ACTIONS as $permAction) {
                $can[$permAction] = $roleId === 1 || canPerm($pdo, 'knowledge', $permAction);
            }
            kn_api_ok(['ok' => true, 'config' => kn_config($pdo), 'can' => $can, 'vocab' => [
                'statuses' => KN_STATUSES,
                'transitions' => KN_TRANSITIONS,
                'confidentiality' => KN_CONFIDENTIALITY,
                'entity_types' => kn_entity_types(),
                'relation_link_types' => KN_RELATION_LINK_TYPES,
                'document_link_types' => KN_DOC_LINK_TYPES,
                'usage_actions' => KN_USAGE_ACTIONS,
                'helpfulness' => KN_HELPFULNESS,
                'gap_statuses' => KN_GAP_STATUSES,
                'gap_priorities' => KN_GAP_PRIORITIES,
                'review_statuses' => KN_REVIEW_STATUSES,
                'review_triggers' => KN_REVIEW_TRIGGERS,
                'devices' => KN_DEVICES,
            ]]);

        case 'feature_status':
            $perms['read']();
            kn_api_ok(kn_feature_status($pdo));

        case 'catalog':
            $perms['read']();
            kn_api_ok(kn_catalog($pdo, $roleId, $userId, $opts));

        case 'categories':
            $perms['read']();
            kn_api_ok(['ok' => true, 'categories' => kn_categories($pdo, !$getBool('include_inactive'))]);

        case 'tags':
            $perms['read']();
            kn_api_ok(['ok' => true, 'tags' => kn_tags($pdo, !$getBool('include_inactive'))]);

        case 'article_list':
            $perms['read']();
            kn_api_ok(kn_articles($pdo, $roleId, $userId, $opts));

        case 'article_get':
            $perms['read']();
            $key = $getStr('article_key');
            $idOrKey = $opts['id'] > 0 ? $opts['id'] : ($key !== '' ? $key : 0);
            $r = $idOrKey === 0 ? ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'] : kn_article_get($pdo, $idOrKey, $roleId, $userId, $opts);
            if (!$r['ok']) {
                kn_api_fail('ไม่พบบทความ', $r['code'], 404);
            }
            kn_api_ok($r);

        case 'search':
            $perms['search']();
            $q = $getStr('q');
            if ($q === '') {
                kn_api_fail('กรุณาระบุคำค้นหา', 'KN_QUERY_REQUIRED', 422);
            }
            kn_api_ok(kn_search($pdo, $q, $roleId, $userId, $opts));

        case 'related':
            $perms['read']();
            $r = kn_related_articles($pdo, $getStr('entity_type'), $getStr('entity_id'), $roleId, $userId, $opts);
            if (!$r['ok']) {
                kn_api_fail('ประเภทข้อมูลอ้างอิงไม่ถูกต้อง', $r['code'], 422, ['allowed' => $r['allowed'] ?? []]);
            }
            kn_api_ok($r);

        case 'usage_summary':
            $perms['read']();
            kn_api_ok(['ok' => true, 'article_id' => $opts['article_id'], 'usage' => kn_usage_summary($pdo, $opts['article_id'])]);

        case 'usage_events':
            $perms['usage_view']();
            // 'action' is the API action name in this transport, so the usage
            // action filter has to be read from its own parameter.
            $uOpts = $opts;
            $uOpts['action'] = $getStr('usage_action');
            $uOpts['user_id'] = $getInt('user_id');
            kn_api_ok(kn_usage_events($pdo, $uOpts));

        case 'gaps':
            $perms['manage_gaps']();
            kn_api_ok(kn_gaps($pdo, $opts));

        case 'gap_get':
            $perms['manage_gaps']();
            $r = kn_gap_get($pdo, $opts['id']);
            if (!$r['ok']) {
                kn_api_fail('ไม่พบ Knowledge Gap', $r['code'], 404);
            }
            kn_api_ok($r);

        case 'gap_stats':
            $perms['read']();
            kn_api_ok(kn_gap_stats($pdo));

        case 'reviews':
            $perms['read']();
            kn_api_ok(kn_reviews($pdo, $opts));

        case 'review_due':
            $perms['read']();
            kn_api_ok(['ok' => true, 'due' => kn_review_due($pdo, $opts['limit'] ?: 100)]);

        case 'export':
            $perms['export']();
            $what = $getStr('what', 'articles');
            $r = kn_export($pdo, $what, $opts);
            if (!$r['ok']) {
                kn_api_fail('ไม่สามารถ export ได้', $r['code'], kn_status_for($r['code']), ['allowed' => $r['allowed'] ?? []]);
            }
            audit_log($pdo, 'KNOWLEDGE_EXPORT', 'knowledge', $what,
                      'export ' . $what . ' (' . (int)$r['row_count'] . ' rows)', null, null, 'info');
            kn_api_ok($r);

        /* ---------------- writes ---------------- */
        case 'article_create':
            $perms['create']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_article_create($pdo, $d, $userId);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'create' : 'fail', $r['id'] ?? 0,
                      ($r['code'] ?? '') ?: ($d['title'] ?? ''), $d, null, 'info');
            break;

        case 'article_update':
            $perms['edit']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_article_update($pdo, $opts['id'], $d, $userId, ['create_tags' => kn_can_create_tags($pdo, $roleId)]);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'edit' : 'fail', $opts['id'],
                      $r['code'] ?? 'edit', null, $d, 'info');
            break;

        case 'article_submit':
            $perms['submit']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_article_submit($pdo, $opts['id'], $userId, [
                'reviewer_id' => $getInt('reviewer_id'),
                'review_due_days' => $getInt('review_due_days', 7),
                'trigger_reason' => $getStr('trigger_reason'),
            ]);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'submit' : 'fail', $opts['id'],
                      $r['code'] ?? 'submit', null, null, 'info');
            break;

        case 'article_approve':
            $perms['approve']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_article_approve($pdo, $opts['id'], $userId, [
                'findings' => $d['findings'] ?? null,
                'outcome_note' => $d['outcome_note'] ?? null,
            ]);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'approve' : 'fail', $opts['id'],
                      $r['code'] ?? 'approve', null, ['outcome' => $r['status'] ?? null], 'info');
            break;

        case 'article_send_back':
            $perms['review']();
            $r = kn_article_send_back($pdo, $opts['id'], $userId, $getStr('reason'));
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'send_back' : 'fail', $opts['id'],
                      $r['code'] ?? 'send_back', null, ['reason' => $getStr('reason')], 'info');
            break;

        case 'article_publish':
            $perms['publish']();
            $r = kn_article_publish($pdo, $opts['id'], $userId);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'publish' : 'fail', $opts['id'],
                      $r['code'] ?? 'publish', null,
                      ['superseded_id' => $r['superseded_id'] ?? null], 'info');
            break;

        case 'article_new_version':
            $perms['edit']();
            $r = kn_article_new_version($pdo, $opts['id'], $userId);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'new_version' : 'fail', $r['id'] ?? $opts['id'],
                      $r['code'] ?? 'new_version', null, ['source_id' => $opts['id']], 'info');
            break;

        case 'article_supersede':
            $perms['edit']();
            $r = kn_article_supersede($pdo, $opts['id'], $getInt('new_article_id'), $userId);
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'supersede' : 'fail', $opts['id'],
                      $r['code'] ?? 'supersede', null, ['new_article_id' => $getInt('new_article_id')], 'info');
            break;

        case 'article_archive':
            $perms['publish']();
            $r = kn_article_archive($pdo, $opts['id'], $userId, $getStr('reason'));
            audit_log($pdo, 'KNOWLEDGE_ARTICLE', $r['ok'] ? 'archive' : 'fail', $opts['id'],
                      $r['code'] ?? 'archive', null, ['reason' => $getStr('reason')], 'info');
            break;

        case 'relation_add':
            $perms['edit']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_relation_add($pdo, $opts['article_id'] ?: $opts['id'], $d, $userId);
            audit_log($pdo, 'KNOWLEDGE_RELATION', $r['ok'] ? 'add' : 'fail', $opts['article_id'] ?: $opts['id'],
                      $r['code'] ?? 'add', null, $d, 'info');
            break;

        case 'relation_remove':
            $perms['edit']();
            $r = kn_relation_remove($pdo, $opts['article_id'] ?: $opts['id'], $getInt('relation_id'), $userId);
            audit_log($pdo, 'KNOWLEDGE_RELATION', $r['ok'] ? 'remove' : 'fail', $opts['article_id'] ?: $opts['id'],
                      $r['code'] ?? 'remove', null, ['relation_id' => $getInt('relation_id')], 'info');
            break;

        case 'document_ref_add':
            $perms['edit']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_document_ref_add($pdo, $opts['article_id'] ?: $opts['id'], $d, $userId);
            audit_log($pdo, 'KNOWLEDGE_DOC_REF', $r['ok'] ? 'add' : 'fail', $opts['article_id'] ?: $opts['id'],
                      $r['code'] ?? 'add', null, $d, 'info');
            break;

        case 'document_ref_remove':
            $perms['edit']();
            $r = kn_document_ref_remove($pdo, $opts['article_id'] ?: $opts['id'], $getInt('ref_id'), $userId);
            audit_log($pdo, 'KNOWLEDGE_DOC_REF', $r['ok'] ? 'remove' : 'fail', $opts['article_id'] ?: $opts['id'],
                      $r['code'] ?? 'remove', null, ['ref_id' => $getInt('ref_id')], 'info');
            break;

        case 'document_stale_check':
            $perms['read']();
            $articleId = $opts['article_id'] > 0 ? $opts['article_id'] : null;
            $r = kn_document_ref_check_stale($pdo, $articleId, $userId);
            audit_log($pdo, 'KNOWLEDGE_DOC_STALE', 'check', $articleId ?? 'all',
                      'checked ' . (int)$r['checked'] . ' refs, flagged ' . count($r['flagged']), null, null, 'info');
            break;

        case 'search_click':
            $perms['search']();
            $r = kn_search_log_click($pdo, $getInt('search_log_id'), $getInt('article_id'), $userId,
                                     ['device' => $opts['device']]);
            break;

        case 'usage_log':
            $perms['read']();
            $r = kn_usage_log($pdo, $opts['article_id'] ?: $opts['id'], $getStr('usage_action', 'view'), $userId, [
                'device' => $opts['device'],
                'asset_id' => $opts['asset_id'],
                'entity_type' => $opts['entity_type'],
                'entity_id' => $opts['entity_id'],
            ]);
            break;

        case 'usage_feedback':
            $perms['feedback']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_usage_feedback($pdo, $opts['article_id'] ?: $opts['id'], $getStr('helpfulness'), $userId, [
                'comment' => $d['comment'] ?? null,
                'device' => $opts['device'],
                'asset_id' => $opts['asset_id'],
                'entity_type' => $opts['entity_type'],
                'entity_id' => $opts['entity_id'],
            ]);
            audit_log($pdo, 'KNOWLEDGE_FEEDBACK', $r['ok'] ? 'feedback' : 'fail',
                      $opts['article_id'] ?: $opts['id'], $r['code'] ?? ($getStr('helpfulness')),
                      null, ['helpfulness' => $getStr('helpfulness')], 'info');
            break;

        case 'gap_create':
            $perms['manage_gaps']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_gap_create($pdo, $getStr('term'), $userId, $d);
            audit_log($pdo, 'KNOWLEDGE_GAP', $r['ok'] ? 'create' : 'fail', $r['id'] ?? 0,
                      $r['code'] ?? 'create', null, $d, 'info');
            break;

        case 'gap_action':
            $perms['manage_gaps']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_gap_action($pdo, $opts['id'], $getStr('gap_action'), $userId, $d);
            audit_log($pdo, 'KNOWLEDGE_GAP', $r['ok'] ? 'action' : 'fail', $opts['id'],
                      $r['code'] ?? $getStr('gap_action'), null, $d, 'info');
            break;

        case 'review_request':
            $perms['review']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_review_request($pdo, $opts['article_id'] ?: $opts['id'], $getStr('trigger_reason', 'manual'), $userId, $d);
            audit_log($pdo, 'KNOWLEDGE_REVIEW', $r['ok'] ? 'request' : 'fail', $opts['article_id'] ?: $opts['id'],
                      $r['code'] ?? 'request', null, $d, 'info');
            break;

        case 'review_start':
            $perms['review']();
            $r = kn_review_start($pdo, $opts['id'], $userId);
            audit_log($pdo, 'KNOWLEDGE_REVIEW', $r['ok'] ? 'start' : 'fail', $opts['id'],
                      $r['code'] ?? 'start', null, null, 'info');
            break;

        case 'review_complete':
            $perms['review']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_review_complete($pdo, $opts['id'], $getStr('outcome'), $userId, $d);
            audit_log($pdo, 'KNOWLEDGE_REVIEW', $r['ok'] ? 'complete' : 'fail', $opts['id'],
                      $r['code'] ?? 'complete', null, $d, 'info');
            break;

        case 'category_save':
            $perms['taxonomy']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_category_save($pdo, $d, $userId);
            audit_log($pdo, 'KNOWLEDGE_CATEGORY', $r['ok'] ? 'save' : 'fail', $r['id'] ?? $d['id'] ?? 0,
                      $r['code'] ?? 'save', null, $d, 'info');
            break;

        case 'tag_save':
            $perms['taxonomy']();
            $d = array_merge($_POST, $jsonInput ?? []);
            $r = kn_tag_save($pdo, $d, $userId);
            audit_log($pdo, 'KNOWLEDGE_TAG', $r['ok'] ? 'save' : 'fail', $r['id'] ?? $d['id'] ?? 0,
                      $r['code'] ?? 'save', null, $d, 'info');
            break;

        default:
            kn_api_fail('unknown action', 'KN_UNKNOWN_ACTION', 400);
    }

    if (isset($r) && is_array($r)) {
        if (!empty($r['ok'])) {
            kn_api_ok($r, 200);
        }
        kn_api_fail($r['error'] ?? ($r['hint'] ?? $r['code']), (string)$r['code'], kn_status_for((string)$r['code']),
                    array_diff_key($r, ['ok' => 1, 'code' => 1, 'error' => 1]));
    }
    kn_api_fail('no result', 'KN_NO_RESULT', 500);
} catch (Throwable $e) {
    error_log(sprintf('[CMMS knowledge API] %s: %s @ %s:%d', get_class($e), $e->getMessage(), $e->getFile(), $e->getLine()));
    kn_api_fail('เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง', 'INTERNAL_ERROR', 500);
}
