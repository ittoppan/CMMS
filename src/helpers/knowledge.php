<?php
/**
 * knowledge.php - Phase 38 Knowledge Management engine
 *
 * DESIGN CONTRACT (see database/migration_20260924_phase38_knowledge.sql and
 * docs/KNOWLEDGE_MANAGEMENT.md):
 *
 *  1. PHASE 38 EXTENDS PHASE 32, IT NEVER REPLACES IT. A controlled procedure
 *     that needs a file, an approval chain, a revision, an impact assessment or
 *     a mandatory acknowledgement is still a controlled_documents item and is
 *     still governed by src/helpers/document_control.php. Nothing in this file
 *     re-implements document revision, approval, effective-date or
 *     acknowledgement logic.
 *
 *  2. NO FABRICATED LINK. knowledge_relation points at an existing CMMS record
 *     and is a REFERENCE ONLY. This module never UPDATEs or DELETEs
 *     asset_registry / repair / pm_am / failure_modes / failure_causes / rca /
 *     spare_parts / engineering_changes rows.
 *
 *  3. PUBLISHED KNOWLEDGE IS IMMUTABLE. Editing a published article is refused;
 *     a new version is created instead and the previous version becomes
 *     `superseded` (never deleted) so a work order closed against it stays
 *     explainable.
 *
 *  4. AT MOST ONE PUBLISHED VERSION PER article_key, enforced by the
 *     knowledge_published_guard PRIMARY KEY inside the publish transaction.
 *
 *  5. NO INVENTED USAGE. knowledge_usage / knowledge_search_log only ever record
 *     something a real user really did. Zero usage is reported as zero usage and
 *     is never presented as low value.
 *
 *  6. A MISSING SETTING IS NOT A ZERO. Anything not configured comes back as
 *     NOT_CONFIGURED / NULL with an explanation, never as a guessed number.
 *
 * Screens: /knowledge (catalog), /knowledge/articles, /knowledge/gaps,
 * /knowledge/reviews, /knowledge/taxonomy, /knowledge/usage
 *
 * Authorization is enforced in the API adapter with
 * requirePerm($pdo, 'knowledge', <action>). Hiding a button is not authorization.
 *
 * @package cmms
 */
require_once __DIR__ . '/../config/db.php';

const KN_VERSION = 'phase38.1';

/** Lifecycle vocabulary. A status is never reused for a different meaning. */
const KN_STATUSES = ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived'];

/** Legal status transitions. Everything else is refused and audited. */
const KN_TRANSITIONS = [
    'draft'       => ['in_review'],
    'in_review'   => ['approved', 'draft'],
    'approved'    => ['published', 'draft'],
    'published'   => ['superseded', 'archived'],
    'superseded'  => ['archived'],
    'archived'    => [],
];

/** Confidentiality levels, from widest to narrowest. */
const KN_CONFIDENTIALITY = ['internal', 'restricted', 'confidential'];

/** Controlled-document bridge link types (knowledge_document_ref). */
const KN_DOC_LINK_TYPES = ['implements', 'governs', 'summarises', 'evidenced_by', 'supersedes', 'reference'];

/** CMMS traceability link types (knowledge_relation). */
const KN_RELATION_LINK_TYPES = ['applies_to', 'troubleshoots', 'caused_by', 'resolved_by', 'prevents', 'evidenced_by', 'reference'];

/** Real user actions that may be logged in knowledge_usage. */
const KN_USAGE_ACTIONS = ['view', 'open_procedure', 'print', 'download', 'copy_link', 'search_hit', 'acknowledge', 'feedback'];

/** Helpful / not helpful / no answer. NULL until a person answers. */
const KN_HELPFULNESS = ['helpful', 'not_helpful', 'no_answer'];

const KN_GAP_STATUSES = ['open', 'triaged', 'in_progress', 'resolved', 'rejected'];
const KN_GAP_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const KN_REVIEW_STATUSES = ['pending', 'in_progress', 'approved', 'needs_revision', 'rejected'];
const KN_REVIEW_TRIGGERS = ['scheduled', 'incident', 'major_revision', 'user_report', 'manual'];

const KN_DEVICES = ['mobile', 'tablet', 'desktop', 'unknown'];

/** Every permission this module can ask for, in the order the API documents them. */
const KN_PERMISSION_ACTIONS = ['read', 'search', 'create', 'edit', 'submit', 'review', 'approve',
                                'publish', 'feedback', 'manage_gaps', 'taxonomy', 'usage_view', 'export'];

/* ===========================================================================
 * 1. CONFIG
 * =========================================================================== */

/**
 * Knowledge engine configuration (settings group 'knowledge').
 *
 * Every value has a hard default in code so the engine still behaves predictably
 * on a database where the Phase 38 settings were never seeded.
 */
function kn_config(PDO $pdo): array {
    static $cache = [];
    if (isset($cache['cfg'])) {
        return $cache['cfg'];
    }

    $rows = [];
    try {
        $st = $pdo->query("SELECT setting_key, setting_value FROM settings WHERE setting_group = 'knowledge'");
        foreach ($st->fetchAll() as $r) {
            $rows[(string)$r['setting_key']] = (string)($r['setting_value'] ?? '');
        }
    } catch (Throwable $e) {
        $rows = [];
    }

    $get = static function (string $key, string $default) use ($rows): string {
        $v = $rows[$key] ?? '';
        return ($v === '' ? $default : $v);
    };
    $int = static function (string $key, int $default) use ($get): int {
        $v = $get($key, (string)$default);
        return is_numeric($v) ? (int)$v : $default;
    };
    $bool = static function (string $key, bool $default) use ($get): bool {
        $v = strtolower($get($key, $default ? '1' : '0'));
        return in_array($v, ['1', 'true', 'yes', 'on'], true);
    };
    $roles = static function (string $key, string $default) use ($get): array {
        $out = [];
        foreach (preg_split('/[^0-9]+/', $get($key, $default)) ?: [] as $r) {
            if ($r !== '') {
                $out[] = (int)$r;
            }
        }
        return $out;
    };

    $cfg = [
        'enabled'                     => $bool('knowledge_enabled', true),
        'search_include_documents'    => $bool('knowledge_search_include_documents', true),
        'search_include_manuals'      => $bool('knowledge_search_include_manuals', false),
        'min_query_len'               => max(1, $int('knowledge_min_query_len', 2)),
        'max_results'                 => max(1, $int('knowledge_max_results', 50)),
        'result_window_days'          => max(1, $int('knowledge_result_window_days', 365)),
        'usage_log_enabled'           => $bool('knowledge_usage_log_enabled', true),
        'search_log_enabled'          => $bool('knowledge_search_log_enabled', true),
        'auto_create_gap'             => $bool('knowledge_auto_create_gap', true),
        'gap_min_occurrences'         => max(1, $int('knowledge_gap_min_occurrences', 2)),
        'gap_window_days'             => max(1, $int('knowledge_gap_window_days', 180)),
        'gap_default_priority'        => $get('knowledge_gap_default_priority', 'medium'),
        'review_default_days'         => max(1, $int('knowledge_review_default_days', 180)),
        'review_overdue_warn_days'    => max(0, $int('knowledge_review_overdue_warn_days', 14)),
        'publish_requires_approved'   => $bool('knowledge_publish_requires_approved', true),
        'publish_requires_review'     => $bool('knowledge_publish_requires_review_record', true),
        'publish_requires_category'   => $bool('knowledge_publish_requires_category', true),
        'publish_requires_relation'   => $bool('knowledge_publish_requires_relation', false),
        'auto_check_document_stale'   => $bool('knowledge_auto_check_document_stale', true),
        'helpfulness_enabled'         => $bool('knowledge_helpfulness_enabled', true),
        'usage_retention_days'        => max(0, $int('knowledge_usage_retention_days', 730)),
        'search_log_retention_days'   => max(0, $int('knowledge_search_log_retention_days', 730)),
        'page_default_size'           => max(5, $int('knowledge_page_default_size', 25)),
        'export_row_limit'            => max(100, $int('knowledge_export_row_limit', 50000)),
        // Roles allowed to see restricted/confidential knowledge and every draft.
        // 1 = Admin, 2 = Manager, 6 = ASST Manager. Not seeded in settings on
        // purpose: widening this list is an access-control decision an operator
        // makes explicitly, so the code default is used until they do.
        'privileged_roles'            => $roles('knowledge_privileged_roles', '1,2,6'),
    ];

    if (!in_array($cfg['gap_default_priority'], KN_GAP_PRIORITIES, true)) {
        $cfg['gap_default_priority'] = 'medium';
    }

    $cache['cfg'] = $cfg;
    return $cfg;
}

/* ===========================================================================
 * 2. SMALL UTILITIES
 * =========================================================================== */

/**
 * Grouping key for a search or gap. Two searches only group when a technician
 * would call them the same question, so this is deliberately plain: trim,
 * collapse whitespace, lower-case, strip Thai tone marks that carry no meaning
 * for grouping.
 */
function kn_normalize_query(string $q): string {
    $q = preg_replace('/\s+/u', ' ', trim($q)) ?? trim($q);
    $q = mb_strtolower($q, 'UTF-8');
    return mb_substr($q, 0, 255, 'UTF-8');
}

/** Stable business key for an article. */
function kn_normalize_key(string $key): string {
    $key = strtoupper(trim($key));
    return (string)preg_replace('/[^A-Z0-9._-]/', '-', $key);
}

/** True when an article_key is shaped like a business key we accept. */
function kn_valid_key(string $key): bool {
    return (bool)preg_match('/^[A-Z0-9][A-Z0-9._-]{2,59}$/', $key);
}

/**
 * Content fingerprint over the readable content of an article.
 *
 * This is what makes "did the content actually change?" answerable instead of
 * guessed from updated_at. version_no and article_key are excluded on purpose:
 * a new version of the same key with identical text is not a content change.
 */
function kn_content_hash(array $a): string {
    $parts = [
        (string)($a['title'] ?? ''),
        (string)($a['summary'] ?? ''),
        (string)($a['symptoms'] ?? ''),
        (string)($a['diagnosis'] ?? ''),
        (string)($a['root_cause'] ?? ''),
        (string)($a['resolution'] ?? ''),
        (string)($a['prevention'] ?? ''),
        (string)($a['safety_notes'] ?? ''),
        (string)($a['estimated_minutes'] ?? ''),
        !empty($a['requires_isolation']) ? '1' : '0',
    ];
    $norm = static function (string $s): string {
        return mb_strtolower(trim((string)preg_replace('/\s+/u', ' ', $s) ?? ''), 'UTF-8');
    };
    $parts = array_map($norm, $parts);
    return hash('sha256', implode("\n", $parts));
}

/** Add or subtract whole days from a Y-m-d date, returning Y-m-d or null. */
function kn_date_add(string $date, int $days): ?string {
    $ts = strtotime($date . ' 00:00:00');
    if ($ts === false) {
        return null;
    }
    return date('Y-m-d', strtotime("+$days days", $ts));
}

/** Whole days between two Y-m-d dates (b - a), or null when unparseable. */
function kn_days_between(string $a, string $b): ?int {
    $ta = strtotime($a . ' 00:00:00');
    $tb = strtotime($b . ' 00:00:00');
    if ($ta === false || $tb === false) {
        return null;
    }
    return (int)round(($tb - $ta) / 86400);
}

/** Clamp a page size and page number coming from the client. */
function kn_paging(array $opts, array $cfg): array {
    $limit = (int)($opts['limit'] ?? $opts['page_size'] ?? $cfg['page_default_size']);
    if ($limit <= 0) {
        $limit = $cfg['page_default_size'];
    }
    $limit = min($limit, 200);
    $page = max(1, (int)($opts['page'] ?? 1));
    return ['limit' => $limit, 'offset' => ($page - 1) * $limit, 'page' => $page];
}

/* ===========================================================================
 * 3. CMMS ENTITY MAP (reference targets)
 * =========================================================================== */

/**
 * Whitelist of CMMS records a knowledge article may reference.
 *
 * Phase 38 owns none of these tables. The map exists so a relation can be
 * CHECKED before it is written (a dangling reference is worse than no
 * reference) and so the UI can print a readable label.
 *
 * `pk` is the column the entity_id points at. `label_sql` is only ever used in a
 * SELECT against the target table.
 */
function kn_entity_map(): array {
    static $map = null;
    if ($map !== null) {
        return $map;
    }
    $map = [
        'asset' => [
            'table' => 'asset_registry', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.code,''),' â€” ',COALESCE(t.name,''))",
            'desc_sql'  => "CONCAT_WS(' / ', NULLIF(t.category,''), NULLIF(t.location,''), NULLIF(t.department,''))",
        ],
        // An asset class is asset_registry.category (a string), not a table of
        // its own: this database has no asset_class master.
        'asset_class' => [
            'table' => 'asset_registry', 'pk' => 'category',
            'label_sql' => "COALESCE(t.category,'')",
            'desc_sql'  => "CONCAT(COUNT(*),' assets')",
            'group_by'  => true,
        ],
        'component' => [
            'table' => 'asset_components', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.component_code,''),' â€” ',COALESCE(t.name,''))",
            'desc_sql'  => "COALESCE(t.category,'')",
        ],
        'failure_mode' => [
            'table' => 'failure_modes', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.code,''),' â€” ',COALESCE(t.name,''))",
            'desc_sql'  => "COALESCE(t.component,'')",
        ],
        'failure_cause' => [
            'table' => 'failure_causes', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.code,''),' â€” ',COALESCE(t.name,''))",
            'desc_sql'  => "''",
        ],
        'spare_part' => [
            'table' => 'spare_parts', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.code,''),' â€” ',COALESCE(t.name,''))",
            'desc_sql'  => "COALESCE(t.category,'')",
        ],
        // A work order in this system is the repair table.
        'work_order' => [
            'table' => 'repair', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.work_order_no,''),' â€” ',COALESCE(t.title,''))",
            'desc_sql'  => "COALESCE(t.status,'')",
        ],
        'pm' => [
            'table' => 'pm_am', 'pk' => 'id',
            'label_sql' => "CONCAT('#',t.id,' â€” ',COALESCE(t.title,''))",
            'desc_sql'  => "COALESCE(t.status,'')",
        ],
        'rca' => [
            'table' => 'rca', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.rca_code,''),' â€” ',COALESCE(t.title,''))",
            'desc_sql'  => "COALESCE(t.status,'')",
        ],
        'engineering_change' => [
            'table' => 'engineering_changes', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.ecr_no,''),' â€” ',COALESCE(t.title,''))",
            'desc_sql'  => "COALESCE(t.status,'')",
        ],
        'department' => [
            'table' => 'departments', 'pk' => 'id',
            'label_sql' => "CONCAT(COALESCE(t.code,''),' â€” ',COALESCE(t.name,''))",
            'desc_sql'  => "''",
        ],
    ];
    return $map;
}

/** Entity types a knowledge article may reference. */
function kn_entity_types(): array {
    return array_keys(kn_entity_map());
}

/**
 * Does the referenced CMMS record actually exist?
 *
 * A missing target is reported instead of being written: a relation to a deleted
 * asset is a lie the UI would happily render.
 */
function kn_relation_target_exists(PDO $pdo, string $entityType, string $entityId): array {
    $map = kn_entity_map();
    if (!isset($map[$entityType])) {
        return ['ok' => false, 'code' => 'KN_UNKNOWN_ENTITY_TYPE'];
    }
    $entityId = trim($entityId);
    if ($entityId === '' || mb_strlen($entityId) > 64) {
        return ['ok' => false, 'code' => 'KN_INVALID_ENTITY_ID'];
    }

    $def = $map[$entityType];
    $table = $def['table'];
    $pk = $def['pk'];

    try {
        if (!empty($def['group_by'])) {
            $st = $pdo->prepare("SELECT t.`$pk` AS entity_id, " . $def['label_sql'] . " AS label
                                FROM `$table` t WHERE t.`$pk` = ? LIMIT 1");
            $st->execute([$entityId]);
        } else {
            $st = $pdo->prepare("SELECT t.`$pk` AS entity_id, " . $def['label_sql'] . " AS label
                                FROM `$table` t WHERE t.`$pk` = ? LIMIT 1");
            $st->execute([$entityId]);
        }
        $row = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[knowledge] relation target check failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_TARGET_UNVERIFIABLE'];
    }

    if (!$row) {
        return ['ok' => false, 'code' => 'KN_TARGET_NOT_FOUND'];
    }
    return [
        'ok' => true,
        'entity_id' => (string)$row['entity_id'],
        'label' => (string)$row['label'],
    ];
}

/**
 * Human label for a referenced entity, used when rendering relation lists.
 * Returns null when the target disappeared or is no longer readable.
 */
function kn_entity_label(PDO $pdo, string $entityType, string $entityId): ?string {
    $map = kn_entity_map();
    if (!isset($map[$entityType])) {
        return null;
    }
    $def = $map[$entityType];
    try {
        $st = $pdo->prepare("SELECT " . $def['label_sql'] . " AS label FROM `{$def['table']}` t WHERE t.`{$def['pk']}` = ? LIMIT 1");
        $st->execute([$entityId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[knowledge] entity label lookup failed: ' . $e->getMessage());
        return null;
    }
    return $row ? (string)$row['label'] : null;
}

/* ===========================================================================
 * 4. VISIBILITY
 * =========================================================================== */

/**
 * SQL fragment limiting a query to what the caller may see.
 *
 * Two independent rules, both always applied:
 *   - confidentiality: internal is open; restricted/confidential needs a
 *     privileged role (knowledge_privileged_roles) or one of the people already
 *     attached to the article (author, owner, reviewer, approver, publisher).
 *   - status: published is open to every reader; draft / in_review / approved /
 *     superseded / archived are visible to a privileged role, to the people
 *     attached to the article, or to the author of the version this one
 *     superseded (they must be able to see what they used to rely on).
 *
 * Returns ['sql' => "...", 'params' => [...]] so callers can AND it into any
 * query without repeating the policy.
 */
function kn_visibility_clause(int $roleId, int $userId, array $cfg, string $alias = 'a'): array {
    $priv = $cfg['privileged_roles'] ?: [1];
    $ph = implode(',', array_fill(0, count($priv), '?'));

    $sql = "(
        (a.confidentiality = 'internal'
         OR ? IN ($ph)
         OR a.author_id = ? OR a.owner_id = ? OR a.review_owner_id = ?
         OR a.reviewed_by = ? OR a.approved_by = ? OR a.published_by = ?)
        AND
        (a.status = 'published'
         OR ? IN ($ph)
         OR a.author_id = ? OR a.owner_id = ? OR a.review_owner_id = ?
         OR a.reviewed_by = ? OR a.approved_by = ? OR a.published_by = ?
         OR a.superseded_by_id = ?
         OR a.id IN (SELECT kb.id FROM knowledge_article kb
                     WHERE kb.superseded_by_id = a.id AND kb.author_id = ?))
    )";

    $params = [
        $roleId, ...$priv,
        $userId, $userId, $userId, $userId, $userId, $userId,
        $roleId, ...$priv,
        $userId, $userId, $userId, $userId, $userId, $userId, $userId, $userId,
    ];
    return ['sql' => $sql, 'params' => $params];
}

/** Is this role allowed to see restricted/confidential knowledge? */
function kn_role_is_privileged(int $roleId, array $cfg): bool {
    return in_array($roleId, $cfg['privileged_roles'], true);
}

/* ===========================================================================
 * 5. ACTIVITY + VALIDATION
 * =========================================================================== */

/**
 * Append-only knowledge activity row. knowledge_activity is never updated or
 * deleted, so a knowledge action can never rewrite its own history.
 */
function kn_activity(
    PDO $pdo,
    ?int $articleId,
    string $action,
    ?string $description = null,
    ?string $oldStatus = null,
    ?string $newStatus = null,
    ?string $entityType = null,
    ?string $entityId = null,
    ?int $userId = null
): void {
    try {
        $st = $pdo->prepare('INSERT INTO knowledge_activity
            (article_id, action, description, old_status, new_status, entity_type, entity_id, performed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $st->execute([
            $articleId,
            mb_substr(trim($action), 0, 60),
            $description === null ? null : mb_substr(trim($description), 0, 1000),
            $oldStatus,
            $newStatus,
            $entityType === null ? null : mb_substr($entityType, 0, 40),
            $entityId === null ? null : mb_substr($entityId, 0, 64),
            $userId,
        ]);
    } catch (Throwable $e) {
        // Never let a logging failure roll back the business action.
        error_log('[knowledge] activity log failed: ' . $e->getMessage());
    }
}

/** Trim + length-limit a text field, returning null when empty. */
function kn_text(?string $v, int $max): ?string {
    if ($v === null) {
        return null;
    }
    $v = trim($v);
    if ($v === '') {
        return null;
    }
    return mb_substr($v, 0, $max, 'UTF-8');
}

/**
 * Validate the writable part of an article.
 *
 * estimated_minutes is the important one: NULL means "not measured" and is
 * never filled in with a guess. requires_isolation is a safety statement, so it
 * is a real boolean and never defaults from the category.
 */
function kn_validate_article_payload(array $in, bool $isCreate): array {
    $out = [];
    $errs = [];

    if ($isCreate || array_key_exists('title', $in)) {
        $title = kn_text($in['title'] ?? null, 255);
        if ($title === null || mb_strlen($title) < 3) {
            $errs['title'] = 'TITLE_REQUIRED';
        } else {
            $out['title'] = $title;
        }
    }

    if ($isCreate || array_key_exists('article_key', $in)) {
        $key = kn_normalize_key((string)($in['article_key'] ?? ''));
        if (!kn_valid_key($key)) {
            $errs['article_key'] = 'ARTICLE_KEY_INVALID';
        } else {
            $out['article_key'] = $key;
        }
    }

    foreach (['summary' => 2000, 'symptoms' => 8000, 'diagnosis' => 8000, 'root_cause' => 8000,
              'resolution' => 8000, 'prevention' => 8000, 'safety_notes' => 4000] as $field => $max) {
        if ($isCreate || array_key_exists($field, $in)) {
            $out[$field] = kn_text($in[$field] ?? null, $max);
        }
    }

    if ($isCreate || array_key_exists('category_id', $in)) {
        $cat = $in['category_id'] ?? null;
        if ($cat === null || $cat === '' || (int)$cat === 0) {
            $out['category_id'] = null;
        } else {
            $out['category_id'] = max(0, (int)$cat);
        }
    }

    if ($isCreate || array_key_exists('estimated_minutes', $in)) {
        $min = $in['estimated_minutes'] ?? null;
        if ($min === null || $min === '') {
            $out['estimated_minutes'] = null; // not measured â€” stays not measured
        } elseif (!is_numeric($min) || (int)$min < 0 || (int)$min > 10080) {
            $errs['estimated_minutes'] = 'ESTIMATED_MINUTES_INVALID';
        } else {
            $out['estimated_minutes'] = (int)$min;
        }
    }

    if ($isCreate || array_key_exists('requires_isolation', $in)) {
        $out['requires_isolation'] = (!empty($in['requires_isolation'])) ? 1 : 0;
    }

    if ($isCreate || array_key_exists('confidentiality', $in)) {
        $conf = strtolower(trim((string)($in['confidentiality'] ?? 'internal')));
        if (!in_array($conf, KN_CONFIDENTIALITY, true)) {
            $errs['confidentiality'] = 'CONFIDENTIALITY_INVALID';
        } else {
            $out['confidentiality'] = $conf;
        }
    }

    if ($isCreate || array_key_exists('owner_id', $in)) {
        $owner = $in['owner_id'] ?? null;
        $out['owner_id'] = ($owner === null || $owner === '' || (int)$owner === 0) ? null : max(0, (int)$owner);
    }

    if ($isCreate || array_key_exists('review_cycle_days', $in)) {
        $rc = $in['review_cycle_days'] ?? null;
        if ($rc === null || $rc === '') {
            // NULL = no scheduled review, which is a deliberate answer and means
            // the article never enters an overdue list.
            $out['review_cycle_days'] = null;
        } elseif (!is_numeric($rc) || (int)$rc < 1 || (int)$rc > 3650) {
            $errs['review_cycle_days'] = 'REVIEW_CYCLE_INVALID';
        } else {
            $out['review_cycle_days'] = (int)$rc;
        }
    }

    return ['values' => $out, 'errors' => $errs];
}

/** Fetch one article row by id, or null. No visibility filtering here. */
function kn_article_row(PDO $pdo, int $id): ?array {
    if ($id <= 0) {
        return null;
    }
    $st = $pdo->prepare('SELECT * FROM knowledge_article WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Fetch one article row by business key, picking the highest version. */
function kn_article_row_by_key(PDO $pdo, string $articleKey): ?array {
    $st = $pdo->prepare('SELECT * FROM knowledge_article WHERE article_key = ? ORDER BY version_no DESC LIMIT 1');
    $st->execute([$articleKey]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Does a category exist and is it active? */
function kn_category_ok(PDO $pdo, int $categoryId): bool {
    if ($categoryId <= 0) {
        return false;
    }
    $st = $pdo->prepare('SELECT is_active FROM knowledge_category WHERE id = ?');
    $st->execute([$categoryId]);
    $v = $st->fetchColumn();
    return $v !== false && (int)$v === 1;
}

/** Category tree for the taxonomy screen and the editor dropdown. */
function kn_categories(PDO $pdo, bool $activeOnly = true): array {
    $sql = 'SELECT c.id, c.code, c.name_th, c.name_en, c.parent_id, c.description, c.sort_order, c.is_active,
                   (SELECT COUNT(*) FROM knowledge_article a WHERE a.category_id = c.id) AS article_count,
                   (SELECT COUNT(*) FROM knowledge_article a WHERE a.category_id = c.id AND a.status = \'published\') AS published_count
            FROM knowledge_category c';
    if ($activeOnly) {
        $sql .= ' WHERE c.is_active = 1';
    }
    $sql .= ' ORDER BY c.sort_order, c.code';
    return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

/** Tag vocabulary with real usage counts (counts may be 0 and that is honest). */
function kn_tags(PDO $pdo, bool $activeOnly = true): array {
    $sql = 'SELECT t.id, t.tag, t.label_th, t.is_active,
                   (SELECT COUNT(*) FROM knowledge_article_tag at WHERE at.tag_id = t.id) AS article_count
            FROM knowledge_tag t';
    if ($activeOnly) {
        $sql .= ' WHERE t.is_active = 1';
    }
    $sql .= ' ORDER BY t.tag';
    return $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Create or edit a category (taxonomy permission only).
 *
 * A category that already has articles is never deleted, only deactivated:
 * published knowledge must keep the classification it was published under.
 */
function kn_category_save(PDO $pdo, array $in, int $userId): array {
    $id = (int)($in['id'] ?? 0);
    $code = strtoupper(trim((string)($in['code'] ?? '')));
    if (!preg_match('/^[A-Z0-9][A-Z0-9._-]{1,39}$/', $code)) {
        return ['ok' => false, 'code' => 'KN_CATEGORY_CODE_INVALID'];
    }
    $nameTh = kn_text($in['name_th'] ?? null, 150);
    $nameEn = kn_text($in['name_en'] ?? null, 150);
    if ($nameTh === null && $nameEn === null) {
        return ['ok' => false, 'code' => 'KN_CATEGORY_NAME_REQUIRED'];
    }
    $parentId = (int)($in['parent_id'] ?? 0);
    if ($parentId > 0) {
        $chk = $pdo->prepare('SELECT id FROM knowledge_category WHERE id = ?');
        $chk->execute([$parentId]);
        if ($chk->fetchColumn() === false) {
            return ['ok' => false, 'code' => 'KN_CATEGORY_PARENT_NOT_FOUND'];
        }
        if ($id > 0 && $parentId === $id) {
            return ['ok' => false, 'code' => 'KN_CATEGORY_PARENT_SELF'];
        }
    }
    $sort = max(0, (int)($in['sort_order'] ?? 0));
    $desc = kn_text($in['description'] ?? null, 500);
    $active = array_key_exists('is_active', $in) ? (!empty($in['is_active']) ? 1 : 0) : 1;

    try {
        if ($id > 0) {
            $st = $pdo->prepare('UPDATE knowledge_category
                                 SET code = ?, name_th = ?, name_en = ?, parent_id = ?,
                                     description = ?, sort_order = ?, is_active = ?
                                 WHERE id = ?');
            $st->execute([$code, $nameTh, $nameEn, $parentId > 0 ? $parentId : null, $desc, $sort, $active, $id]);
        } else {
            $st = $pdo->prepare('INSERT INTO knowledge_category (code, name_th, name_en, parent_id, description, sort_order, is_active)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)');
            $st->execute([$code, $nameTh, $nameEn, $parentId > 0 ? $parentId : null, $desc, $sort, $active]);
            $id = (int)$pdo->lastInsertId();
        }
    } catch (Throwable $e) {
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            return ['ok' => false, 'code' => 'KN_CATEGORY_CODE_EXISTS'];
        }
        error_log('[knowledge] category save failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_CATEGORY_SAVE_FAILED'];
    }

    kn_activity($pdo, null, 'category_save', 'à¸šà¸±à¸™à¸—à¸¶à¸à¸«à¸¡à¸§à¸”à¸«à¸¡à¸¹à¹ˆ ' . $code, null, null, 'knowledge_category', (string)$id, $userId);
    return ['ok' => true, 'id' => $id, 'code' => $code];
}

/** Create or retire a tag. Tags in use are retired, never deleted. */
function kn_tag_save(PDO $pdo, array $in, int $userId): array {
    $id = (int)($in['id'] ?? 0);
    $tag = kn_normalize_tag((string)($in['tag'] ?? ''));
    if ($tag === '' || mb_strlen($tag) < 2) {
        return ['ok' => false, 'code' => 'KN_TAG_INVALID'];
    }
    $label = kn_text($in['label_th'] ?? null, 150);
    $active = array_key_exists('is_active', $in) ? (!empty($in['is_active']) ? 1 : 0) : 1;

    try {
        if ($id > 0) {
            $pdo->prepare('UPDATE knowledge_tag SET tag = ?, label_th = ?, is_active = ? WHERE id = ?')
                ->execute([$tag, $label, $active, $id]);
        } else {
            $pdo->prepare('INSERT INTO knowledge_tag (tag, label_th, is_active) VALUES (?, ?, ?)')
                ->execute([$tag, $label, $active]);
            $id = (int)$pdo->lastInsertId();
        }
    } catch (Throwable $e) {
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            return ['ok' => false, 'code' => 'KN_TAG_EXISTS'];
        }
        error_log('[knowledge] tag save failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_TAG_SAVE_FAILED'];
    }

    kn_activity($pdo, null, 'tag_save', 'à¸šà¸±à¸™à¸—à¸¶à¸à¹à¸—à¹‡à¸ ' . $tag, null, null, 'knowledge_tag', (string)$id, $userId);
    return ['ok' => true, 'id' => $id, 'tag' => $tag];
}

/* ===========================================================================
 * 6. TAGS
 * =========================================================================== */

/**
 * Fold a tag to its canonical form so "Bearing", "bearing" and " BEARING " can
 * never become three different tags.
 */
function kn_normalize_tag(string $tag): string {
    $tag = mb_strtolower(trim($tag), 'UTF-8');
    $tag = (string)preg_replace('/\s+/u', '-', $tag);
    return mb_substr((string)preg_replace('/[^\p{L}\p{N}\-]/u', '', $tag), 0, 60, 'UTF-8');
}

/**
 * Resolve tag names to ids, optionally creating the missing ones.
 *
 * Creating a tag is a taxonomy decision, so the API only allows it for callers
 * with the `taxonomy` permission; everyone else gets UNKNOWN_TAGS back.
 */
function kn_resolve_tags(PDO $pdo, array $tags, bool $create, ?int $userId = null): array {
    $ids = [];
    $unknown = [];
    $seen = [];
    $sel = $pdo->prepare('SELECT id FROM knowledge_tag WHERE tag = ?');
    $ins = $pdo->prepare('INSERT IGNORE INTO knowledge_tag (tag) VALUES (?)');

    foreach ($tags as $raw) {
        $tag = kn_normalize_tag((string)$raw);
        if ($tag === '' || isset($seen[$tag])) {
            continue;
        }
        $seen[$tag] = true;
        $sel->execute([$tag]);
        $id = $sel->fetchColumn();
        if ($id === false) {
            if (!$create) {
                $unknown[] = $tag;
                continue;
            }
            $ins->execute([$tag]);
            $sel->execute([$tag]);
            $id = $sel->fetchColumn();
            if ($id !== false) {
                kn_activity($pdo, null, 'tag_create', 'à¸ªà¸£à¹‰à¸²à¸‡à¹à¸—à¹‡à¸à¹ƒà¸«à¸¡à¹ˆ: ' . $tag, null, null, 'tag', (string)$id, $userId);
            }
        }
        if ($id !== false) {
            $ids[] = (int)$id;
        }
    }
    return ['ids' => $ids, 'unknown' => $unknown];
}

/** Replace an article's tag join rows. Only the join changes, never the article. */
function kn_article_set_tags(PDO $pdo, int $articleId, array $tagIds, ?int $userId): void {
    $pdo->prepare('DELETE FROM knowledge_article_tag WHERE article_id = ?')->execute([$articleId]);
    if ($tagIds === []) {
        return;
    }
    $ins = $pdo->prepare('INSERT IGNORE INTO knowledge_article_tag (article_id, tag_id, created_by) VALUES (?, ?, ?)');
    foreach ($tagIds as $tid) {
        $ins->execute([$articleId, (int)$tid, $userId]);
    }
}

/** Tag names attached to an article. */
function kn_article_tag_names(PDO $pdo, int $articleId): array {
    $st = $pdo->prepare('SELECT t.tag FROM knowledge_article_tag at
                        JOIN knowledge_tag t ON t.id = at.tag_id
                        WHERE at.article_id = ? ORDER BY t.tag');
    $st->execute([$articleId]);
    return $st->fetchAll(PDO::FETCH_COLUMN);
}

/* ===========================================================================
 * 7. ARTICLE SHAPE + READ
 * =========================================================================== */

/** Normalise a raw article row into the shape the UI consumes. */
function kn_article_shape(array $row): array {
    $out = [
        'id'                 => (int)$row['id'],
        'article_key'        => (string)$row['article_key'],
        'version_no'         => (int)$row['version_no'],
        'title'              => (string)$row['title'],
        'summary'            => $row['summary'] ?? null,
        'symptoms'           => $row['symptoms'] ?? null,
        'diagnosis'          => $row['diagnosis'] ?? null,
        'root_cause'         => $row['root_cause'] ?? null,
        'resolution'         => $row['resolution'] ?? null,
        'prevention'         => $row['prevention'] ?? null,
        'safety_notes'       => $row['safety_notes'] ?? null,
        'estimated_minutes'  => $row['estimated_minutes'] === null ? null : (int)$row['estimated_minutes'],
        'requires_isolation' => (int)$row['requires_isolation'] === 1,
        'category_id'        => $row['category_id'] === null ? null : (int)$row['category_id'],
        'status'             => (string)$row['status'],
        'confidentiality'    => (string)$row['confidentiality'],
        'content_hash'       => $row['content_hash'] ?? null,
        'owner_id'           => $row['owner_id'] === null ? null : (int)$row['owner_id'],
        'author_id'          => $row['author_id'] === null ? null : (int)$row['author_id'],
        'review_cycle_days'  => $row['review_cycle_days'] === null ? null : (int)$row['review_cycle_days'],
        'next_review_date'   => $row['next_review_date'] ?? null,
        'review_owner_id'    => $row['review_owner_id'] === null ? null : (int)$row['review_owner_id'],
        'reviewed_by'        => $row['reviewed_by'] === null ? null : (int)$row['reviewed_by'],
        'reviewed_at'        => $row['reviewed_at'] ?? null,
        'approved_by'        => $row['approved_by'] === null ? null : (int)$row['approved_by'],
        'approved_at'        => $row['approved_at'] ?? null,
        'published_by'       => $row['published_by'] === null ? null : (int)$row['published_by'],
        'published_at'       => $row['published_at'] ?? null,
        'superseded_at'      => $row['superseded_at'] ?? null,
        'superseded_by_id'   => $row['superseded_by_id'] === null ? null : (int)$row['superseded_by_id'],
        'archived_at'        => $row['archived_at'] ?? null,
        'archive_reason'     => $row['archive_reason'] ?? null,
        'created_at'         => $row['created_at'] ?? null,
        'updated_at'         => $row['updated_at'] ?? null,
    ];

    // Derived, never stored, never guessed: overdue only exists when a review
    // cycle was actually configured.
    $out['review_overdue'] = false;
    $out['review_overdue_days'] = null;
    if ($out['status'] === 'published' && !empty($out['next_review_date'])) {
        $d = kn_days_between((string)$out['next_review_date'], date('Y-m-d'));
        if ($d !== null && $d > 0) {
            $out['review_overdue'] = true;
            $out['review_overdue_days'] = $d;
        }
    }
    $out['allowed_transitions'] = KN_TRANSITIONS[$out['status']] ?? [];
    return $out;
}

/**
 * One article for reading, with optional tags, relations, document bridges,
 * review history and the version chain.
 */
function kn_article_get(PDO $pdo, $idOrKey, int $roleId, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $isId = is_numeric($idOrKey) && (int)$idOrKey > 0;
    $row = $isId ? kn_article_row($pdo, (int)$idOrKey) : kn_article_row_by_key($pdo, kn_normalize_key((string)$idOrKey));
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }

    $vis = kn_visibility_clause($roleId, $userId, $cfg);
    $st = $pdo->prepare('SELECT COUNT(*) FROM knowledge_article a WHERE a.id = ? AND ' . $vis['sql']);
    $st->execute(array_merge([(int)$row['id']], $vis['params']));
    if ((int)$st->fetchColumn() === 0) {
        // A restricted article must not even be confirmed to exist.
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }

    $id = (int)$row['id'];
    $article = kn_article_shape($row);
    $article['tags'] = kn_article_tag_names($pdo, $id);
    $article['relations'] = kn_article_relations($pdo, $id);
    $article['documents'] = kn_article_document_refs($pdo, $id);

    if (!empty($opts['with_reviews'])) {
        $rst = $pdo->prepare('SELECT id, round_no, trigger_reason, status, due_date, reviewer_id, assigned_by,
                                     assigned_at, started_at, completed_at, findings, recommendations,
                                     outcome_note, new_next_review_date, created_at
                              FROM knowledge_review WHERE article_id = ? ORDER BY round_no DESC');
        $rst->execute([$id]);
        $article['reviews'] = $rst->fetchAll(PDO::FETCH_ASSOC);
    }

    $vst = $pdo->prepare('SELECT id, version_no, status, title, published_at, superseded_at, superseded_by_id
                          FROM knowledge_article WHERE article_key = ? ORDER BY version_no');
    $vst->execute([(string)$row['article_key']]);
    $article['versions'] = $vst->fetchAll(PDO::FETCH_ASSOC);

    return ['ok' => true, 'article' => $article];
}

/**
 * Article list with real filters.
 *
 * Readers get published articles only unless they explicitly ask for the
 * editorial backlog (which their visibility clause then filters anyway).
 */
function kn_articles(PDO $pdo, int $roleId, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $paging = kn_paging($opts, $cfg);

    $where = [];
    $params = [];

    if (!empty($opts['article_key'])) {
        $where[] = 'a.article_key = ?';
        $params[] = kn_normalize_key((string)$opts['article_key']);
    }
    if (!empty($opts['status'])) {
        $st = array_values(array_intersect(array_filter(explode(',', (string)$opts['status']), 'strlen'), KN_STATUSES));
        if ($st === []) {
            $where[] = '1 = 0';
        } else {
            $where[] = 'a.status IN (' . implode(',', array_fill(0, count($st), '?')) . ')';
            $params = array_merge($params, $st);
        }
    } elseif (empty($opts['include_unpublished'])) {
        $where[] = "a.status = 'published'";
    }
    if (!empty($opts['category_id'])) {
        $where[] = 'a.category_id = ?';
        $params[] = (int)$opts['category_id'];
    }
    if (!empty($opts['confidentiality'])) {
        $where[] = 'a.confidentiality = ?';
        $params[] = (string)$opts['confidentiality'];
    }
    if (!empty($opts['owner_id'])) {
        $where[] = 'a.owner_id = ?';
        $params[] = (int)$opts['owner_id'];
    }
    if (!empty($opts['q'])) {
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr(trim((string)$opts['q']), 0, 100, 'UTF-8')) . '%';
        $where[] = '(a.title LIKE ? OR a.article_key LIKE ? OR a.summary LIKE ?)';
        $params = array_merge($params, [$like, $like, $like]);
    }
    if (!empty($opts['tag'])) {
        $where[] = 'EXISTS (SELECT 1 FROM knowledge_article_tag at JOIN knowledge_tag t ON t.id = at.tag_id
                           WHERE at.article_id = a.id AND t.tag = ?)';
        $params[] = kn_normalize_tag((string)$opts['tag']);
    }
    if (!empty($opts['requires_isolation'])) {
        $where[] = 'a.requires_isolation = 1';
    }
    if (!empty($opts['review_overdue'])) {
        $where[] = "a.status = 'published' AND a.next_review_date IS NOT NULL AND a.next_review_date < ?";
        $params[] = date('Y-m-d');
    }

    $vis = kn_visibility_clause($roleId, $userId, $cfg);
    $where[] = $vis['sql'];
    $params = array_merge($params, $vis['params']);

    $whereSql = implode(' AND ', $where);
    $st = $pdo->prepare('SELECT a.*, c.code AS category_code, c.name_th AS category_name_th, c.name_en AS category_name_en
                         FROM knowledge_article a
                         LEFT JOIN knowledge_category c ON c.id = a.category_id
                         WHERE ' . $whereSql . '
                         ORDER BY (a.published_at IS NULL), a.published_at DESC, a.updated_at DESC
                         LIMIT ' . $paging['limit'] . ' OFFSET ' . $paging['offset']);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $cst = $pdo->prepare('SELECT COUNT(*) FROM knowledge_article a WHERE ' . $whereSql);
    $cst->execute($params);
    $total = (int)$cst->fetchColumn();

    $articles = [];
    foreach ($rows as $row) {
        $article = kn_article_shape($row);
        $article['category_code'] = $row['category_code'] ?? null;
        $article['category_name_th'] = $row['category_name_th'] ?? null;
        $article['category_name_en'] = $row['category_name_en'] ?? null;
        if (!empty($opts['with_usage'])) {
            $article['usage'] = kn_usage_summary($pdo, (int)$row['id']);
        }
        $articles[] = $article;
    }

    return ['ok' => true, 'articles' => $articles, 'total' => $total,
            'page' => $paging['page'], 'limit' => $paging['limit']];
}

/* ===========================================================================
 * 8. ARTICLE WRITE + LIFECYCLE
 * =========================================================================== */

/** Create a draft article. Nothing here can publish anything. */
function kn_article_create(PDO $pdo, array $in, int $userId): array {
    $cfg = kn_config($pdo);
    $v = kn_validate_article_payload($in, true);
    if ($v['errors']) {
        return ['ok' => false, 'code' => 'KN_VALIDATION_FAILED', 'errors' => $v['errors']];
    }
    $vals = $v['values'];

    if (!empty($vals['category_id']) && !kn_category_ok($pdo, $vals['category_id'])) {
        return ['ok' => false, 'code' => 'KN_CATEGORY_NOT_FOUND'];
    }

    $dup = $pdo->prepare('SELECT id FROM knowledge_article WHERE article_key = ? LIMIT 1');
    $dup->execute([$vals['article_key']]);
    if ($dup->fetchColumn() !== false) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_KEY_EXISTS',
                'hint' => 'à¹ƒà¸Šà¹‰ new_version à¹€à¸žà¸·à¹ˆà¸­à¸ªà¸£à¹‰à¸²à¸‡à¸‰à¸šà¸±à¸šà¸–à¸±à¸”à¹„à¸›à¸‚à¸­à¸‡ article_key à¹€à¸”à¸´à¸¡'];
    }

    // A review cycle is only applied when the author accepts the default; NULL
    // keeps meaning "no scheduled review".
    $cycle = $vals['review_cycle_days'];
    if ($cycle === null && !empty($in['apply_default_cycle'])) {
        $cycle = $cfg['review_default_days'];
    }
    $nextReview = $cycle === null ? null : kn_date_add(date('Y-m-d'), $cycle);

    $st = $pdo->prepare(
        'INSERT INTO knowledge_article
            (article_key, version_no, title, summary, symptoms, diagnosis, root_cause, resolution,
             prevention, safety_notes, estimated_minutes, requires_isolation, category_id, status,
             confidentiality, content_hash, owner_id, author_id, review_cycle_days, next_review_date)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'draft\', ?, ?, ?, ?, ?, ?)'
    );
    $st->execute([
        $vals['article_key'], $vals['title'], $vals['summary'], $vals['symptoms'], $vals['diagnosis'],
        $vals['root_cause'], $vals['resolution'], $vals['prevention'], $vals['safety_notes'],
        $vals['estimated_minutes'], $vals['requires_isolation'], $vals['category_id'],
        $vals['confidentiality'], kn_content_hash($vals), $vals['owner_id'] ?? null, $userId,
        $cycle, $nextReview,
    ]);
    $id = (int)$pdo->lastInsertId();

    kn_article_set_tags($pdo, $id, kn_resolve_tags($pdo, (array)($in['tags'] ?? []), (bool)($in['create_tags'] ?? true), $userId)['ids'], $userId);

    kn_activity($pdo, $id, 'create', 'à¸ªà¸£à¹‰à¸²à¸‡à¸šà¸—à¸„à¸§à¸²à¸¡: ' . $vals['title'], null, 'draft', null, null, $userId);
    return ['ok' => true, 'id' => $id, 'article_key' => $vals['article_key'], 'version_no' => 1, 'status' => 'draft'];
}

/**
 * Edit an article.
 *
 * Published content is immutable: the caller must create a new version instead.
 * An article that is already in review is sent back to draft rather than edited
 * in place, because a reviewer has to approve the exact text they read â€” an
 * approval of text that then changes under them is not an approval.
 */
function kn_article_update(PDO $pdo, int $id, array $in, int $userId, array $opts = []): array {
    $row = kn_article_row($pdo, $id);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $status = (string)$row['status'];
    if ($status === 'published') {
        return ['ok' => false, 'code' => 'KN_PUBLISHED_IS_IMMUTABLE',
                'hint' => 'à¸ªà¸£à¹‰à¸²à¸‡à¸‰à¸šà¸±à¸šà¹ƒà¸«à¸¡à¹ˆà¸”à¹‰à¸§à¸¢ new_version à¹à¸¥à¹‰à¸§à¹€à¸œà¸¢à¹à¸žà¸£à¹ˆà¹à¸—à¸™'];
    }
    if (in_array($status, ['superseded', 'archived'], true)) {
        return ['ok' => false, 'code' => 'KN_STATUS_NOT_EDITABLE'];
    }

    $v = kn_validate_article_payload($in, false);
    if ($v['errors']) {
        return ['ok' => false, 'code' => 'KN_VALIDATION_FAILED', 'errors' => $v['errors']];
    }
    $vals = $v['values'];
    if (!empty($vals['category_id']) && !kn_category_ok($pdo, $vals['category_id'])) {
        return ['ok' => false, 'code' => 'KN_CATEGORY_NOT_FOUND'];
    }
    if (isset($vals['article_key']) && $vals['article_key'] !== (string)$row['article_key']) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_KEY_IMMUTABLE'];
    }

    // next_review_date only moves when the cycle itself changes, so saving an
    // unrelated typo does not silently restart the review clock.
    if (array_key_exists('review_cycle_days', $vals)
        && (int)($row['review_cycle_days'] ?? 0) !== (int)($vals['review_cycle_days'] ?? 0)) {
        $vals['next_review_date'] = $vals['review_cycle_days'] === null
            ? null
            : kn_date_add(date('Y-m-d'), (int)$vals['review_cycle_days']);
    }

    // An approval belongs to the exact text a reviewer read. Changing that text
    // - whether the article was waiting for a reviewer or already approved but
    // not yet published - sends it back to draft instead of keeping an approval
    // that no longer describes the content. A save that changes nothing keeps
    // the status it had.
    $vals['content_hash'] = kn_content_hash(array_merge($row, $vals));
    $contentChanged = (string)$vals['content_hash'] !== (string)$row['content_hash'];
    $newStatus = ($contentChanged && in_array($status, ['in_review', 'approved'], true)) ? 'draft' : $status;

    $cols = array_keys($vals);
    $sets = [];
    foreach ($cols as $col) {
        $sets[] = "`$col` = ?";
    }
    $args = [];
    foreach ($vals as $val) {
        $args[] = $val;
    }

    $sql = 'UPDATE knowledge_article SET ' . implode(', ', $sets) . ', updated_at = NOW()';
    if ($newStatus !== $status) {
        $sql .= ", status = 'draft'";
    }
    $sql .= ' WHERE id = ?';
    $args[] = $id;
    $pdo->prepare($sql)->execute($args);

    if (array_key_exists('tags', $in)) {
        $resolved = kn_resolve_tags($pdo, (array)$in['tags'], (bool)($opts['create_tags'] ?? true), $userId);
        kn_article_set_tags($pdo, $id, $resolved['ids'], $userId);
    }

    kn_activity($pdo, $id, 'edit', 'à¹à¸à¹‰à¹„à¸‚à¹€à¸™à¸·à¹‰à¸­à¸«à¸²à¸šà¸—à¸„à¸§à¸²à¸¡', $status, $newStatus, null, null, $userId);
    return ['ok' => true, 'id' => $id, 'status' => $newStatus,
            'content_changed' => $contentChanged,
            'resubmitted_to_draft' => $newStatus !== $status];
}

/** Back to draft: the author withdrew it, or a reviewer sent it back. */
function kn_article_send_back(PDO $pdo, int $id, int $userId, string $reason): array {
    $row = kn_article_row($pdo, $id);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $status = (string)$row['status'];
    if (!in_array($status, ['in_review', 'approved'], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRANSITION', 'from' => $status, 'to' => 'draft'];
    }
    $pdo->prepare("UPDATE knowledge_article SET status = 'draft', updated_at = NOW() WHERE id = ?")->execute([$id]);
    $rst = $pdo->prepare("UPDATE knowledge_review
                          SET status = 'needs_revision', outcome_note = ?, completed_at = NOW(),
                              new_next_review_date = NULL
                          WHERE article_id = ? AND status IN ('pending','in_progress')");
    $rst->execute([kn_text($reason, 1000), $id]);
    kn_activity($pdo, $id, 'send_back', kn_text($reason, 1000) ?? 'à¸ªà¹ˆà¸‡à¸à¸¥à¸±à¸šà¹à¸à¹‰à¹„à¸‚', $status, 'draft', null, null, $userId);
    return ['ok' => true, 'id' => $id, 'status' => 'draft'];
}

/**
 * Submit for review. This is also what opens the review record, so a reviewer
 * always has a real round to act on instead of a bare status change.
 */
function kn_article_submit(PDO $pdo, int $id, int $userId, array $opts = []): array {
    $row = kn_article_row($pdo, $id);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $status = (string)$row['status'];
    if (!in_array('in_review', KN_TRANSITIONS[$status] ?? [], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRANSITION', 'from' => $status, 'to' => 'in_review'];
    }

    $reviewerId = (int)($opts['reviewer_id'] ?? 0);
    if ($reviewerId <= 0) {
        $reviewerId = (int)($row['owner_id'] ?? 0);
    }
    $trigger = in_array((string)($opts['trigger_reason'] ?? ''), KN_REVIEW_TRIGGERS, true)
        ? (string)$opts['trigger_reason'] : 'scheduled';
    $dueDays = (int)($opts['review_due_days'] ?? 7);
    $due = kn_date_add(date('Y-m-d'), max(1, $dueDays));

    try {
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE knowledge_article SET status = 'in_review', updated_at = NOW() WHERE id = ?")->execute([$id]);
        $round = (int)$pdo->query('SELECT COALESCE(MAX(round_no),0) FROM knowledge_review WHERE article_id = ' . $id)->fetchColumn() + 1;
        $pdo->prepare('INSERT INTO knowledge_review
                        (article_id, round_no, trigger_reason, status, due_date, reviewer_id, assigned_by, assigned_at)
                       VALUES (?, ?, ?, \'pending\', ?, ?, ?, NOW())')
            ->execute([$id, $round, $trigger, $due, $reviewerId > 0 ? $reviewerId : null, $userId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[knowledge] submit failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_SUBMIT_FAILED'];
    }

    kn_activity($pdo, $id, 'submit', 'à¸ªà¹ˆà¸‡à¹€à¸‚à¹‰à¸²à¸£à¸µà¸§à¸´à¸§ (à¸£à¸­à¸šà¸—à¸µà¹ˆ ' . $round . ')', $status, 'in_review', null, null, $userId);
    return ['ok' => true, 'id' => $id, 'status' => 'in_review', 'review_round' => $round];
}

/**
 * Approve the content. The approver must not be the author â€” the person who
 * wrote it is not the person who declares it true. This is the same separation
 * Phase 32 enforces on document approvals.
 */
function kn_article_approve(PDO $pdo, int $id, int $userId, array $opts = []): array {
    $row = kn_article_row($pdo, $id);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $status = (string)$row['status'];
    if (!in_array('approved', KN_TRANSITIONS[$status] ?? [], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRANSITION', 'from' => $status, 'to' => 'approved'];
    }
    if (!empty($row['author_id']) && (int)$row['author_id'] === $userId && empty($opts['override_self_approve'])) {
        return ['ok' => false, 'code' => 'KN_SELF_APPROVAL_NOT_ALLOWED'];
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE knowledge_article
                        SET status = 'approved', approved_by = ?, approved_at = NOW(),
                            reviewed_by = COALESCE(reviewed_by, ?), reviewed_at = COALESCE(reviewed_at, NOW()),
                            updated_at = NOW()
                        WHERE id = ?")
            ->execute([$userId, $userId, $id]);

        $rst = $pdo->prepare("SELECT id FROM knowledge_review
                              WHERE article_id = ? AND status IN ('pending','in_progress')
                              ORDER BY round_no DESC LIMIT 1");
        $rst->execute([$id]);
        $reviewId = $rst->fetchColumn();
        if ($reviewId !== false) {
            $pdo->prepare("UPDATE knowledge_review
                            SET status = 'approved', reviewer_id = COALESCE(reviewer_id, ?),
                                started_at = COALESCE(started_at, NOW()), completed_at = NOW(),
                                findings = COALESCE(findings, ?), outcome_note = COALESCE(outcome_note, ?)
                            WHERE id = ?")
                ->execute([$userId, kn_text($opts['findings'] ?? null, 4000),
                           kn_text($opts['outcome_note'] ?? null, 1000), (int)$reviewId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[knowledge] approve failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_APPROVE_FAILED'];
    }

    kn_activity($pdo, $id, 'approve', 'à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹€à¸™à¸·à¹‰à¸­à¸«à¸²', $status, 'approved', null, null, $userId);
    return ['ok' => true, 'id' => $id, 'status' => 'approved'];
}

/**
 * Publish. This is the only place knowledge_published_guard is written.
 *
 * Inside one transaction: supersede whatever version of this article_key is
 * currently published, take the guard row for the new article, then mark it
 * published. The guard's PRIMARY KEY is what makes "at most one published
 * version per article_key" true even if two people publish at the same moment â€”
 * the loser gets a duplicate-key error, not a second live article.
 */
function kn_article_publish(PDO $pdo, int $id, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $row = kn_article_row($pdo, $id);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $status = (string)$row['status'];
    if (!in_array('published', KN_TRANSITIONS[$status] ?? [], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRANSITION', 'from' => $status, 'to' => 'published'];
    }
    if ($cfg['publish_requires_approved'] && $status !== 'approved') {
        return ['ok' => false, 'code' => 'KN_PUBLISH_REQUIRES_APPROVED'];
    }
    if ($cfg['publish_requires_category'] && empty($row['category_id'])) {
        return ['ok' => false, 'code' => 'KN_PUBLISH_REQUIRES_CATEGORY'];
    }
    if ($cfg['publish_requires_relation']) {
        $n = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_relation WHERE article_id = ' . $id)->fetchColumn();
        if ($n === 0) {
            return ['ok' => false, 'code' => 'KN_PUBLISH_REQUIRES_RELATION'];
        }
    }
    if ($cfg['publish_requires_review']) {
        $ok = $pdo->prepare("SELECT COUNT(*) FROM knowledge_review WHERE article_id = ? AND status = 'approved'");
        $ok->execute([$id]);
        if ((int)$ok->fetchColumn() === 0) {
            return ['ok' => false, 'code' => 'KN_PUBLISH_REQUIRES_APPROVED_REVIEW',
                    'hint' => 'à¸•à¹‰à¸­à¸‡à¸¡à¸µà¸šà¸±à¸™à¸—à¸¶à¸à¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸—à¸šà¸—à¸§à¸™à¸—à¸µà¹ˆà¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¹à¸¥à¹‰à¸§à¸­à¸¢à¹ˆà¸²à¸‡à¸™à¹‰à¸­à¸¢à¸«à¸™à¸¶à¹ˆà¸‡à¸£à¸­à¸š'];
        }
    }

    $key = (string)$row['article_key'];
    $previous = null;
    $staleRefs = [];

    try {
        $pdo->beginTransaction();

        $prev = $pdo->prepare("SELECT id, version_no FROM knowledge_article WHERE article_key = ? AND status = 'published'");
        $prev->execute([$key]);
        while ($r = $prev->fetch()) {
            if ((int)$r['id'] === $id) {
                continue;
            }
            $previous = $r;
            $pdo->prepare("UPDATE knowledge_article
                            SET status = 'superseded', superseded_at = NOW(), superseded_by_id = ?, updated_at = NOW()
                            WHERE id = ?")
                ->execute([$id, (int)$r['id']]);
            $pdo->prepare('DELETE FROM knowledge_published_guard WHERE article_key = ?')->execute([$key]);
            // Knowledge written against the version that just lost is now
            // written against a superseded text: flag it instead of guessing.
            $sr = $pdo->prepare('UPDATE knowledge_document_ref SET is_stale = 1, stale_checked_at = NOW()
                                 WHERE article_id = ? AND is_stale = 0');
            $sr->execute([(int)$r['id']]);
            if ($sr->rowCount() > 0) {
                $staleRefs[] = (int)$r['id'];
            }
        }

        $pdo->prepare('INSERT INTO knowledge_published_guard (article_key, article_id) VALUES (?, ?)')
            ->execute([$key, $id]);

        $nextReview = $row['next_review_date'];
        if (!empty($row['review_cycle_days']) && $row['reviewed_at'] !== null) {
            // An approved review restarts the cycle from the approval date.
            $nextReview = kn_date_add((string)substr((string)$row['reviewed_at'], 0, 10), (int)$row['review_cycle_days']);
        }

        $pdo->prepare("UPDATE knowledge_article
                        SET status = 'published', published_by = ?, published_at = NOW(),
                            next_review_date = ?, updated_at = NOW()
                        WHERE id = ?")
            ->execute([$userId, $nextReview, $id]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (str_contains($e->getMessage(), 'uk_kpg') || (int)($e->errorInfo[1] ?? 0) === 1062) {
            return ['ok' => false, 'code' => 'KN_PUBLISH_GUARD_CONFLICT',
                    'hint' => 'à¸¡à¸µà¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆà¹€à¸œà¸¢à¹à¸žà¸£à¹ˆà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§à¸‚à¸­à¸‡ article_key à¸™à¸µà¹‰ â€” à¸¥à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡'];
        }
        error_log('[knowledge] publish failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_PUBLISH_FAILED'];
    }

    kn_activity($pdo, $id, 'publish', 'à¹€à¸œà¸¢à¹à¸žà¸£à¹ˆà¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . (int)$row['version_no'], $status, 'published', null, null, $userId);
    foreach ($staleRefs as $oldId) {
        kn_activity($pdo, $oldId, 'superseded', 'à¸–à¸¹à¸à¹à¸—à¸™à¸—à¸µà¹ˆà¹‚à¸”à¸¢à¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . (int)$row['version_no'] . ' â€” à¹€à¸­à¸à¸ªà¸²à¸£à¸—à¸µà¹ˆà¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡à¸–à¸¹à¸à¸—à¸³à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸«à¸¡à¸²à¸¢à¸§à¹ˆà¸²à¸­à¸²à¸ˆà¹„à¸¡à¹ˆà¸—à¸±à¸™',
                     'published', 'superseded', null, null, $userId);
    }
    if ($previous) {
        kn_activity($pdo, $id, 'supersede_previous',
                    'à¹à¸—à¸™à¸—à¸µà¹ˆà¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . (int)$previous['version_no'], null, null, null, null, $userId);
    }

    return ['ok' => true, 'id' => $id, 'status' => 'published',
            'superseded_id' => $previous ? (int)$previous['id'] : null,
            'stale_flagged' => $staleRefs];
}

/**
 * Start the next version of an article.
 *
 * The published version stays published until the new one is published, so the
 * shop floor is never left without an answer. article_key survives the version
 * bump; version_no is article-internal and has nothing to do with a Phase 32
 * document revision.
 */
function kn_article_new_version(PDO $pdo, int $id, int $userId, array $opts = []): array {
    $src = kn_article_row($pdo, $id);
    if (!$src) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    if (!in_array((string)$src['status'], ['published', 'superseded', 'approved'], true)) {
        return ['ok' => false, 'code' => 'KN_NEW_VERSION_NOT_ALLOWED',
                'hint' => 'à¸ªà¸£à¹‰à¸²à¸‡à¸‰à¸šà¸±à¸šà¹ƒà¸«à¸¡à¹ˆà¹„à¸”à¹‰à¸ˆà¸²à¸à¸šà¸—à¸„à¸§à¸²à¸¡à¸—à¸µà¹ˆà¸­à¸™à¸¸à¸¡à¸±à¸•à¸´à¸«à¸£à¸·à¸­à¹€à¸œà¸¢à¹à¸žà¸£à¹ˆà¹à¸¥à¹‰à¸§à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™'];
    }

    $key = (string)$src['article_key'];
    $max = (int)$pdo->query('SELECT COALESCE(MAX(version_no),0) FROM knowledge_article WHERE article_key = ' . $pdo->quote($key))->fetchColumn();
    $nextNo = $max + 1;

    try {
        $pdo->beginTransaction();
        $st = $pdo->prepare(
            'INSERT INTO knowledge_article
                (article_key, version_no, title, summary, symptoms, diagnosis, root_cause, resolution,
                 prevention, safety_notes, estimated_minutes, requires_isolation, category_id, status,
                 confidentiality, content_hash, owner_id, author_id, review_cycle_days, next_review_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'draft\', ?, ?, ?, ?, ?, NULL)'
        );
        $st->execute([
            $key, $nextNo, $src['title'], $src['summary'], $src['symptoms'], $src['diagnosis'],
            $src['root_cause'], $src['resolution'], $src['prevention'], $src['safety_notes'],
            $src['estimated_minutes'], $src['requires_isolation'], $src['category_id'],
            $src['confidentiality'], $src['content_hash'], $src['owner_id'], $userId, $src['review_cycle_days'],
        ]);
        $newId = (int)$pdo->lastInsertId();

        // Carry the taxonomy and traceability forward: the machine and the tags
        // did not change just because the text did.
        $copyTags = $pdo->prepare('INSERT IGNORE INTO knowledge_article_tag (article_id, tag_id, created_by)
                                   SELECT ?, tag_id, ? FROM knowledge_article_tag WHERE article_id = ?');
        $copyTags->execute([$newId, $userId, $id]);

        $copyRel = $pdo->prepare('INSERT IGNORE INTO knowledge_relation (article_id, entity_type, entity_id, link_type, note, created_by)
                                  SELECT ?, entity_type, entity_id, link_type, ?, ? FROM knowledge_relation WHERE article_id = ?');
        $copyRel->execute([$newId, 'à¸„à¸±à¸”à¸¥à¸­à¸à¸ˆà¸²à¸à¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . (int)$src['version_no'], $userId, $id]);

        $copyDoc = $pdo->prepare('INSERT IGNORE INTO knowledge_document_ref
                                    (article_id, document_id, document_revision_id, link_type, is_stale, note, created_by)
                                  SELECT ?, document_id, document_revision_id, link_type, 0, ?, ?
                                  FROM knowledge_document_ref WHERE article_id = ?');
        $copyDoc->execute([$newId, 'à¸„à¸±à¸”à¸¥à¸­à¸à¸ˆà¸²à¸à¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . (int)$src['version_no'], $userId, $id]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[knowledge] new version failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_NEW_VERSION_FAILED'];
    }

    kn_activity($pdo, $newId, 'new_version', 'à¸ªà¸£à¹‰à¸²à¸‡à¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . $nextNo . ' à¸ˆà¸²à¸à¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . (int)$src['version_no'],
                 null, 'draft', null, null, $userId);
    kn_activity($pdo, $id, 'has_new_version', 'à¸¡à¸µà¸‰à¸šà¸±à¸šà¸—à¸µà¹ˆ ' . $nextNo . ' à¸£à¸­à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡', null, null, null, null, $userId);

    return ['ok' => true, 'id' => $newId, 'article_key' => $key, 'version_no' => $nextNo,
            'status' => 'draft', 'source_id' => $id];
}

/**
 * Archive an article. Archiving is not deleting: the row, its history, its
 * relations and its usage all stay, because a work order may have been closed
 * against it.
 */
function kn_article_archive(PDO $pdo, int $id, int $userId, string $reason): array {
    $reason = (string)kn_text($reason, 500);
    if ($reason === '') {
        return ['ok' => false, 'code' => 'ARCHIVE_REASON_REQUIRED'];
    }
    $row = kn_article_row($pdo, $id);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $status = (string)$row['status'];
    if (!in_array('archived', KN_TRANSITIONS[$status] ?? [], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRANSITION', 'from' => $status, 'to' => 'archived'];
    }

    try {
        $pdo->beginTransaction();
        if ($status === 'published') {
            $pdo->prepare('DELETE FROM knowledge_published_guard WHERE article_key = ?')->execute([(string)$row['article_key']]);
        }
        $pdo->prepare('UPDATE knowledge_article
                        SET status = \'archived\', archived_by = ?, archived_at = NOW(),
                            archive_reason = ?, updated_at = NOW()
                        WHERE id = ?')
            ->execute([$userId, $reason, $id]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[knowledge] archive failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_ARCHIVE_FAILED'];
    }

    kn_activity($pdo, $id, 'archive', 'à¹€à¸à¹‡à¸šà¸–à¸²à¸§à¸£: ' . $reason, $status, 'archived', null, null, $userId);
    return ['ok' => true, 'id' => $id, 'status' => 'archived'];
}

/**
 * Explicitly point one article at another as the version that replaces it.
 * kn_article_publish does this automatically; this exists for the case where an
 * operator knows the successor before it is published.
 */
function kn_article_supersede(PDO $pdo, int $id, int $newArticleId, int $userId): array {
    $old = kn_article_row($pdo, $id);
    $new = kn_article_row($pdo, $newArticleId);
    if (!$old || !$new) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    if ((string)$old['article_key'] !== (string)$new['article_key']) {
        return ['ok' => false, 'code' => 'KN_SUPERSEDE_KEY_MISMATCH'];
    }
    if (!in_array('superseded', KN_TRANSITIONS[(string)$old['status']] ?? [], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRANSITION', 'from' => (string)$old['status'], 'to' => 'superseded'];
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare("UPDATE knowledge_article
                        SET status = 'superseded', superseded_by_id = ?, superseded_at = NOW(), updated_at = NOW()
                        WHERE id = ?")
            ->execute([$newArticleId, $id]);
        if ((string)$old['status'] === 'published') {
            $pdo->prepare('DELETE FROM knowledge_published_guard WHERE article_key = ?')->execute([(string)$old['article_key']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[knowledge] supersede failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_SUPERSEDE_FAILED'];
    }

    kn_activity($pdo, $id, 'supersede', 'à¸–à¸¹à¸à¹à¸—à¸™à¸—à¸µà¹ˆà¹‚à¸”à¸¢à¸šà¸—à¸„à¸§à¸²à¸¡ #' . $newArticleId,
                 (string)$old['status'], 'superseded', null, null, $userId);
    return ['ok' => true, 'id' => $id, 'status' => 'superseded', 'superseded_by_id' => $newArticleId];
}

/* ===========================================================================
 * 9. SEARCH
 * =========================================================================== */

/**
 * Search published knowledge.
 *
 * Three separate answers, never merged into one fuzzy count:
 *   - knowledge: published articles the caller may read
 *   - documents: Phase 32 controlled documents (read-only cross reference)
 *   - manuals:   legacy manuals, off by default because they are not controlled
 *
 * `answered` means "the technician got an answer from somewhere". A gap is only
 * opened when nothing was found anywhere: if the answer exists in a controlled
 * document, the honest follow-up is "summarise it into knowledge", not "we have
 * no knowledge".
 */
function kn_search(PDO $pdo, string $query, int $roleId, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $started = microtime(true);
    $query = trim($query);

    if (mb_strlen($query, 'UTF-8') < $cfg['min_query_len']) {
        return ['ok' => false, 'code' => 'KN_QUERY_TOO_SHORT',
                'min_query_len' => $cfg['min_query_len'], 'results' => [], 'documents' => [], 'manuals' => []];
    }

    $limit = min(max(1, (int)($opts['limit'] ?? $cfg['max_results'])), $cfg['max_results']);
    $like = '%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr($query, 0, 120, 'UTF-8')) . '%';
    $norm = kn_normalize_query($query);

    $results = [];
    $where = ["a.status = 'published'"];
    $params = [];

    if (!empty($opts['category_id'])) {
        $where[] = 'a.category_id = ?';
        $params[] = (int)$opts['category_id'];
    }
    if (!empty($opts['tag'])) {
        $where[] = 'EXISTS (SELECT 1 FROM knowledge_article_tag at JOIN knowledge_tag t ON t.id = at.tag_id
                           WHERE at.article_id = a.id AND t.tag = ?)';
        $params[] = kn_normalize_tag((string)$opts['tag']);
    }
    if (!empty($opts['asset_id'])) {
        $assetId = (int)$opts['asset_id'];
        // Same search scoped to one machine, without requiring the author to have
        // created an explicit relation for it.
        $where[] = 'EXISTS (SELECT 1 FROM knowledge_relation r
                            WHERE r.article_id = a.id
                              AND ((r.entity_type = \'asset\' AND r.entity_id = ?)
                                OR (r.entity_type = \'asset_class\' AND r.entity_id IN
                                    (SELECT category FROM asset_registry WHERE id = ?))))';
        $params[] = (string)$assetId;
        $params[] = $assetId;
    }
    if (!empty($opts['window_days'])) {
        $where[] = 'a.published_at >= ?';
        $params[] = date('Y-m-d H:i:s', strtotime('-' . max(1, (int)$opts['window_days']) . ' days'));
    }

    // Body fields are searched as one group: a match anywhere in the readable
    // text is a hit, and the rank only decides the order. A tag is part of the
    // same group, never an extra filter - an article without tags must still
    // be findable by its text.
    $where[] = '(a.title LIKE ? OR a.article_key LIKE ? OR a.summary LIKE ? OR a.symptoms LIKE ?
                OR a.diagnosis LIKE ? OR a.root_cause LIKE ? OR a.resolution LIKE ?
                OR a.prevention LIKE ? OR a.safety_notes LIKE ?
                OR EXISTS (SELECT 1 FROM knowledge_article_tag at JOIN knowledge_tag t ON t.id = at.tag_id
                           WHERE at.article_id = a.id AND t.tag LIKE ?)
                OR EXISTS (SELECT 1 FROM knowledge_article_tag at JOIN knowledge_tag t ON t.id = at.tag_id
                           WHERE at.article_id = a.id AND t.label_th LIKE ?))';
    for ($i = 0; $i < 9; $i++) {
        $params[] = $like;
    }
    $params[] = $like;
    $params[] = $like;

    $vis = kn_visibility_clause($roleId, $userId, $cfg);
    $where[] = $vis['sql'];
    $params = array_merge($params, $vis['params']);

    $rank = "CASE WHEN a.title LIKE ? THEN 0 WHEN a.article_key LIKE ? THEN 1
                   WHEN a.summary LIKE ? THEN 2 WHEN a.symptoms LIKE ? THEN 3
                   WHEN a.diagnosis LIKE ? THEN 4 WHEN a.resolution LIKE ? THEN 5
                   WHEN a.root_cause LIKE ? THEN 6 WHEN a.prevention LIKE ? THEN 7 ELSE 8 END";
    $rankParams = [$like, $like, $like, $like, $like, $like, $like, $like];

    $sql = 'SELECT a.id, a.article_key, a.version_no, a.title, a.summary, a.symptoms, a.diagnosis,
                   a.resolution, a.safety_notes, a.estimated_minutes, a.requires_isolation,
                   a.status, a.confidentiality, a.category_id, a.published_at, a.next_review_date,
                   c.code AS category_code, c.name_th AS category_name_th, c.name_en AS category_name_en
            FROM knowledge_article a
            LEFT JOIN knowledge_category c ON c.id = a.category_id
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY ' . $rank . ', a.published_at DESC
            LIMIT ' . $limit;

    $st = $pdo->prepare($sql);
    // Placeholder order follows the SQL text: every WHERE parameter first, then
    // the ranking parameters that live in ORDER BY.
    $st->execute(array_merge($params, $rankParams));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $i => $row) {
        $rows[$i]['match_rank'] = $i;
        $rows[$i]['category_code'] = $row['category_code'] ?? null;
        $rows[$i]['requires_isolation'] = (int)$row['requires_isolation'] === 1;
        $rows[$i]['estimated_minutes'] = $row['estimated_minutes'] === null ? null : (int)$row['estimated_minutes'];
    }
    $results = $rows;
    $knowledgeCount = count($results);

    $documents = [];
    if ($cfg['search_include_documents']) {
        $documents = kn_search_documents($pdo, $query, $limit, $roleId, $userId);
    }
    $manuals = [];
    if ($cfg['search_include_manuals']) {
        $manuals = kn_search_manuals($pdo, $query, $limit);
    }

    $answered = ($knowledgeCount + count($documents) + count($manuals)) > 0;
    $tookMs = (int)round((microtime(true) - $started) * 1000);

    $gap = null;
    $logId = null;
    if ($cfg['search_log_enabled']) {
        $logId = kn_search_log($pdo, [
            'query_text' => mb_substr($query, 0, 255),
            'normalized_query' => $norm,
            'filters_json' => json_encode([
                'category_id' => $opts['category_id'] ?? null,
                'tag' => $opts['tag'] ?? null,
                'asset_id' => $opts['asset_id'] ?? null,
                'window_days' => $opts['window_days'] ?? null,
            ], JSON_UNESCAPED_UNICODE),
            'result_count' => $knowledgeCount,
            'result_article_ids' => $results === [] ? null : json_encode(array_map('intval', array_column($results, 'id'))),
            'has_results' => $answered ? 1 : 0,
            'asset_id' => !empty($opts['asset_id']) ? (int)$opts['asset_id'] : null,
            'user_id' => $userId,
            'took_ms' => $tookMs,
        ]);
    }

    if (!$answered) {
        $gap = kn_gap_open_from_search($pdo, $norm, mb_substr($query, 0, 255), $opts, $userId);
    }

    return [
        'ok' => true,
        'query' => $query,
        'normalized_query' => $norm,
        'results' => $results,
        'knowledge_count' => $knowledgeCount,
        'documents' => $documents,
        'manuals' => $manuals,
        'answered' => $answered,
        'took_ms' => $tookMs,
        'search_log_id' => $logId,
        'gap_opened' => $gap,
    ];
}

/**
 * Phase 32 controlled documents that match, as a clearly separate group.
 * These rows are read-only references: knowledge never edits a document, and the
 * same confidentiality rule the knowledge layer uses is applied here so a
 * restricted document cannot leak through the search box.
 */
function kn_search_documents(PDO $pdo, string $query, int $limit, int $roleId, int $userId): array {
    $cfg = kn_config($pdo);
    $like = '%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr($query, 0, 120, 'UTF-8')) . '%';

    $where = ['(d.title LIKE ? OR d.doc_no LIKE ? OR d.description LIKE ?)'];
    $params = [$like, $like, $like];
    if (!kn_role_is_privileged($roleId, $cfg)) {
        $where[] = "(d.confidentiality = 'internal' OR d.owner_id = ? OR d.created_by = ?)";
        $params[] = $userId;
        $params[] = $userId;
    }

    try {
        $st = $pdo->prepare(
            'SELECT d.id, d.doc_no, d.title, d.status, d.confidentiality, d.next_review_date,
                    d.current_effective_revision_id AS effective_revision_id,
                    r.revision_no AS effective_revision_no
             FROM controlled_documents d
             LEFT JOIN document_revisions r ON r.id = d.current_effective_revision_id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY d.updated_at DESC
             LIMIT ' . (int)$limit
        );
        $st->execute($params);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[knowledge] document search failed: ' . $e->getMessage());
        return [];
    }
    foreach ($rows as $i => $r) {
        $rows[$i]['source'] = 'controlled_document';
        $rows[$i]['controlled'] = true;
    }
    return $rows;
}

/**
 * Legacy manuals, only when knowledge_search_include_manuals is switched on.
 * They are explicitly marked as uncontrolled so nobody relies on an unversioned
 * file by accident.
 */
function kn_search_manuals(PDO $pdo, string $query, int $limit): array {
    $like = '%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr($query, 0, 120, 'UTF-8')) . '%';
    try {
        $st = $pdo->prepare(
            'SELECT m.id, m.title, m.version, m.file_path, m.file_type, m.asset_id, m.created_at
             FROM manuals m
             WHERE (m.title LIKE ? OR m.description LIKE ?)
             LIMIT ' . (int)$limit
        );
        $st->execute([$like, $like]);
    } catch (Throwable $e) {
        error_log('[knowledge] manual search failed: ' . $e->getMessage());
        return [];
    }
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $i => $r) {
        $rows[$i]['source'] = 'legacy_manual';
        $rows[$i]['controlled'] = false;
    }
    return $rows;
}

/** Persist one search row and return its id. */
function kn_search_log(PDO $pdo, array $row): ?int {
    try {
        $st = $pdo->prepare(
            'INSERT INTO knowledge_search_log
                (query_text, normalized_query, filters_json, result_count, result_article_ids,
                 has_results, searched_in, asset_id, user_id, took_ms)
             VALUES (?, ?, ?, ?, ?, ?, \'knowledge\', ?, ?, ?)'
        );
        $st->execute([
            (string)$row['query_text'],
            (string)$row['normalized_query'],
            $row['filters_json'] ?? null,
            (int)($row['result_count'] ?? 0),
            $row['result_article_ids'] ?? null,
            (int)($row['has_results'] ?? 0),
            $row['asset_id'] ?? null,
            $row['user_id'] ?? null,
            $row['took_ms'] ?? null,
        ]);
        return (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[knowledge] search log failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * Record that a searcher actually opened one of the results. This is what makes
 * "people found this useful" a measurement instead of an assumption.
 */
function kn_search_log_click(PDO $pdo, int $logId, int $articleId, int $userId, array $opts = []): array {
    if ($logId <= 0) {
        return ['ok' => false, 'code' => 'KN_SEARCH_LOG_NOT_FOUND'];
    }
    $st = $pdo->prepare('SELECT id, clicked_article_id FROM knowledge_search_log WHERE id = ?');
    $st->execute([$logId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_SEARCH_LOG_NOT_FOUND'];
    }
    // The first click is the one that counts; a later click does not overwrite it.
    if ($row['clicked_article_id'] !== null) {
        return ['ok' => true, 'already_recorded' => true];
    }
    $pdo->prepare('UPDATE knowledge_search_log SET clicked_article_id = ? WHERE id = ? AND clicked_article_id IS NULL')
        ->execute([$articleId, $logId]);
    kn_usage_log($pdo, $articleId, 'search_hit', $userId, ['device' => $opts['device'] ?? null]);
    return ['ok' => true];
}

/* ===========================================================================
 * 10. RELATIONS (reference only)
 * =========================================================================== */

/** Relations of one article, each with its target label when still resolvable. */
function kn_article_relations(PDO $pdo, int $articleId): array {
    $st = $pdo->prepare('SELECT id, entity_type, entity_id, link_type, note, created_by, created_at
                        FROM knowledge_relation WHERE article_id = ? ORDER BY entity_type, link_type, entity_id');
    $st->execute([$articleId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $i => $r) {
        $label = kn_entity_label($pdo, (string)$r['entity_type'], (string)$r['entity_id']);
        $rows[$i]['entity_label'] = $label;
        // A relation whose target vanished is surfaced, never hidden: pretending
        // the link is fine would send a technician to a machine that is not there.
        $rows[$i]['target_missing'] = ($label === null);
    }
    return $rows;
}

/**
 * Attach a reference to an existing CMMS record.
 *
 * The target is checked before the row is written. Nothing in this function
 * touches the target table â€” Phase 38 writes one row in knowledge_relation and
 * nothing else.
 */
function kn_relation_add(PDO $pdo, int $articleId, array $in, int $userId): array {
    if (!kn_article_row($pdo, $articleId)) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $entityType = strtolower(trim((string)($in['entity_type'] ?? '')));
    $linkType = strtolower(trim((string)($in['link_type'] ?? 'applies_to')));
    $entityId = trim((string)($in['entity_id'] ?? ''));

    if (!in_array($entityType, kn_entity_types(), true)) {
        return ['ok' => false, 'code' => 'KN_UNKNOWN_ENTITY_TYPE', 'allowed' => kn_entity_types()];
    }
    if (!in_array($linkType, KN_RELATION_LINK_TYPES, true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_LINK_TYPE', 'allowed' => KN_RELATION_LINK_TYPES];
    }

    $target = kn_relation_target_exists($pdo, $entityType, $entityId);
    if (!$target['ok']) {
        return ['ok' => false, 'code' => $target['code'], 'entity_type' => $entityType, 'entity_id' => $entityId];
    }

    $note = kn_text($in['note'] ?? null, 500);
    try {
        $st = $pdo->prepare('INSERT INTO knowledge_relation (article_id, entity_type, entity_id, link_type, note, created_by)
                             VALUES (?, ?, ?, ?, ?, ?)');
        $st->execute([$articleId, $entityType, (string)$target['entity_id'], $linkType, $note, $userId]);
        $id = (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            return ['ok' => false, 'code' => 'KN_RELATION_EXISTS'];
        }
        error_log('[knowledge] relation add failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_RELATION_ADD_FAILED'];
    }

    kn_activity($pdo, $articleId, 'relation_add',
                 'à¸œà¸¹à¸ ' . $entityType . ' ' . (string)$target['entity_id'] . ' (' . $linkType . ')',
                 null, null, $entityType, (string)$target['entity_id'], $userId);
    return ['ok' => true, 'id' => $id, 'entity_label' => (string)$target['label']];
}

/**
 * Remove a relation. Only the knowledge_relation row goes; the CMMS record it
 * pointed at is untouched, which is the whole point of the reference-only rule.
 */
function kn_relation_remove(PDO $pdo, int $articleId, int $relationId, int $userId): array {
    $st = $pdo->prepare('SELECT id, entity_type, entity_id, link_type FROM knowledge_relation
                        WHERE id = ? AND article_id = ?');
    $st->execute([$relationId, $articleId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_RELATION_NOT_FOUND'];
    }
    $pdo->prepare('DELETE FROM knowledge_relation WHERE id = ?')->execute([$relationId]);
    kn_activity($pdo, $articleId, 'relation_remove',
                 'à¹€à¸¥à¸´à¸à¸œà¸¹à¸ ' . (string)$row['entity_type'] . ' ' . (string)$row['entity_id'],
                 null, null, (string)$row['entity_type'], (string)$row['entity_id'], $userId);
    return ['ok' => true, 'id' => $relationId];
}

/**
 * Published knowledge attached to a CMMS record â€” "what does this machine's
 * history point at?". Read-only: the caller gets knowledge, the CMMS record
 * does not get knowledge.
 */
function kn_related_articles(PDO $pdo, string $entityType, string $entityId, int $roleId, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $entityType = strtolower(trim($entityType));
    if (!in_array($entityType, kn_entity_types(), true)) {
        return ['ok' => false, 'code' => 'KN_UNKNOWN_ENTITY_TYPE', 'allowed' => kn_entity_types()];
    }

    $limit = min(max(1, (int)($opts['limit'] ?? 25)), 200);
    $vis = kn_visibility_clause($roleId, $userId, $cfg);
    $params = [$entityType, trim($entityId)];
    $sql = "SELECT a.id, a.article_key, a.version_no, a.title, a.summary, a.status,
                   a.requires_isolation, a.published_at, a.next_review_date,
                   r.link_type, r.note
            FROM knowledge_relation r
            JOIN knowledge_article a ON a.id = r.article_id
            WHERE r.entity_type = ? AND r.entity_id = ? AND a.status = 'published' AND " . $vis['sql'] . '
            ORDER BY a.published_at DESC
            LIMIT ' . $limit;
    $st = $pdo->prepare($sql);
    $st->execute(array_merge($params, $vis['params']));

    $label = kn_entity_label($pdo, $entityType, trim($entityId));
    return ['ok' => true, 'entity_type' => $entityType, 'entity_id' => trim($entityId),
            'entity_label' => $label, 'target_missing' => ($label === null),
            'articles' => $st->fetchAll(PDO::FETCH_ASSOC)];
}

/* ===========================================================================
 * 11. BRIDGE TO PHASE 32 CONTROLLED DOCUMENTS
 * =========================================================================== */

/**
 * Controlled documents an article refers to, plus a staleness verdict.
 *
 * A reference records WHICH revision the knowledge was written against. When the
 * document moves to a newer effective revision the reference is flagged stale â€”
 * the article is never silently rewritten, because a technician's instructions
 * changing under them is worse than an honest "check this again".
 */
function kn_article_document_refs(PDO $pdo, int $articleId): array {
    $st = $pdo->prepare(
        'SELECT r.id, r.document_id, r.document_revision_id, r.link_type, r.is_stale, r.stale_checked_at,
                r.note, r.created_at,
                d.doc_no, d.title AS document_title, d.status AS document_status,
                d.current_effective_revision_id,
                rev.revision_no AS written_revision_no,
                eff.revision_no AS current_effective_revision_no
         FROM knowledge_document_ref r
         JOIN controlled_documents d ON d.id = r.document_id
         LEFT JOIN document_revisions rev ON rev.id = r.document_revision_id
         LEFT JOIN document_revisions eff ON eff.id = d.current_effective_revision_id
         WHERE r.article_id = ?
         ORDER BY d.doc_no'
    );
    $st->execute([$articleId]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $i => $row) {
        $written = $row['document_revision_id'] === null ? null : (int)$row['document_revision_id'];
        $current = $row['current_effective_revision_id'] === null ? null : (int)$row['current_effective_revision_id'];
        $rows[$i]['is_stale'] = (int)$row['is_stale'] === 1;
        $rows[$i]['stale_reason'] = null;
        if ($written !== null && $current !== null && $written !== $current) {
            $rows[$i]['is_stale'] = true;
            $rows[$i]['stale_reason'] = 'document_revision_changed';
        } elseif ($current === null) {
            $rows[$i]['is_stale'] = true;
            $rows[$i]['stale_reason'] = 'document_has_no_effective_revision';
        }
    }
    return $rows;
}

/** Bridge an article to a controlled document (and optionally to a revision). */
function kn_document_ref_add(PDO $pdo, int $articleId, array $in, int $userId): array {
    if (!kn_article_row($pdo, $articleId)) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    $documentId = (int)($in['document_id'] ?? 0);
    $revisionId = (int)($in['document_revision_id'] ?? 0);
    $linkType = strtolower(trim((string)($in['link_type'] ?? 'reference')));

    if ($documentId <= 0) {
        return ['ok' => false, 'code' => 'KN_DOCUMENT_NOT_FOUND'];
    }
    if (!in_array($linkType, KN_DOC_LINK_TYPES, true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_LINK_TYPE', 'allowed' => KN_DOC_LINK_TYPES];
    }

    $dst = $pdo->prepare('SELECT id, doc_no, title, status, current_effective_revision_id
                          FROM controlled_documents WHERE id = ?');
    $dst->execute([$documentId]);
    $doc = $dst->fetch(PDO::FETCH_ASSOC);
    if (!$doc) {
        return ['ok' => false, 'code' => 'KN_DOCUMENT_NOT_FOUND'];
    }

    // A revision may only be pinned when it really belongs to that document.
    if ($revisionId > 0) {
        $rst = $pdo->prepare('SELECT id, revision_no, status FROM document_revisions WHERE id = ? AND document_id = ?');
        $rst->execute([$revisionId, $documentId]);
        $rev = $rst->fetch(PDO::FETCH_ASSOC);
        if (!$rev) {
            return ['ok' => false, 'code' => 'KN_DOCUMENT_REVISION_NOT_FOUND',
                    'hint' => 'revision à¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™à¹€à¸­à¸à¸ªà¸²à¸£à¸™à¸µà¹‰'];
        }
    } else {
        // Default to whatever is effective right now, so the reference is honest
        // about the text the author actually read.
        $revisionId = (int)($doc['current_effective_revision_id'] ?? 0);
    }

    $note = kn_text($in['note'] ?? null, 500);
    try {
        $st = $pdo->prepare('INSERT INTO knowledge_document_ref
                                (article_id, document_id, document_revision_id, link_type, is_stale, note, created_by)
                             VALUES (?, ?, ?, ?, 0, ?, ?)');
        $st->execute([$articleId, $documentId, $revisionId > 0 ? $revisionId : null, $linkType, $note, $userId]);
        $id = (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        if ((int)($e->errorInfo[1] ?? 0) === 1062) {
            return ['ok' => false, 'code' => 'KN_DOCUMENT_REF_EXISTS'];
        }
        error_log('[knowledge] document ref add failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_DOCUMENT_REF_ADD_FAILED'];
    }

    kn_activity($pdo, $articleId, 'document_ref_add',
                 'à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡à¹€à¸­à¸à¸ªà¸²à¸£ ' . (string)$doc['doc_no'] . ' (' . $linkType . ')',
                 null, null, 'controlled_document', (string)$documentId, $userId);
    return ['ok' => true, 'id' => $id, 'document_id' => $documentId, 'document_revision_id' => $revisionId];
}

/** Remove a bridge row. The controlled document itself is never touched. */
function kn_document_ref_remove(PDO $pdo, int $articleId, int $refId, int $userId): array {
    $st = $pdo->prepare('SELECT id, document_id FROM knowledge_document_ref WHERE id = ? AND article_id = ?');
    $st->execute([$refId, $articleId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_DOCUMENT_REF_NOT_FOUND'];
    }
    $pdo->prepare('DELETE FROM knowledge_document_ref WHERE id = ?')->execute([$refId]);
    kn_activity($pdo, $articleId, 'document_ref_remove', 'à¹€à¸¥à¸´à¸à¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡à¹€à¸­à¸à¸ªà¸²à¸£ #' . (int)$row['document_id'],
                 null, null, 'controlled_document', (string)$row['document_id'], $userId);
    return ['ok' => true, 'id' => $refId];
}

/**
 * Re-check every reference for one article (or all of them).
 *
 * This only sets is_stale. It never edits article content and never touches a
 * Phase 32 table â€” a document revision change is something knowledge reports,
 * not something knowledge is allowed to react to silently.
 */
function kn_document_ref_check_stale(PDO $pdo, ?int $articleId, ?int $userId = null): array {
    $st = $pdo->prepare(
        'SELECT r.id, r.article_id, r.document_id, r.document_revision_id, r.is_stale,
                d.doc_no, d.current_effective_revision_id, d.status AS document_status
         FROM knowledge_document_ref r
         JOIN controlled_documents d ON d.id = r.document_id'
    );
    if ($articleId !== null) {
        $st->execute([$articleId]);
    } else {
        $st->execute();
    }
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $checked = 0;
    $flagged = [];
    $cleared = [];
    foreach ($rows as $row) {
        $written = $row['document_revision_id'] === null ? null : (int)$row['document_revision_id'];
        $current = $row['current_effective_revision_id'] === null ? null : (int)$row['current_effective_revision_id'];
        $wasStale = (int)$row['is_stale'] === 1;

        // Stale when the document moved on, or when it has no effective revision
        // at all (obsolete / still in draft).
        $isStale = ($current === null) || ($written !== null && $current !== null && $written !== $current);

        $checked++;
        if ($isStale === $wasStale) {
            $pdo->prepare('UPDATE knowledge_document_ref SET stale_checked_at = NOW() WHERE id = ?')->execute([(int)$row['id']]);
            continue;
        }

        $pdo->prepare('UPDATE knowledge_document_ref SET is_stale = ?, stale_checked_at = NOW() WHERE id = ?')
            ->execute([$isStale ? 1 : 0, (int)$row['id']]);

        if ($isStale) {
            $flagged[] = ['ref_id' => (int)$row['id'], 'article_id' => (int)$row['article_id'],
                          'document_id' => (int)$row['document_id'], 'doc_no' => (string)$row['doc_no'],
                          'written_revision_id' => $written, 'current_effective_revision_id' => $current];
            kn_activity($pdo, (int)$row['article_id'], 'document_revision_changed',
                         'à¹€à¸­à¸à¸ªà¸²à¸£ ' . (string)$row['doc_no'] . ' à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸‰à¸šà¸±à¸šà¸¡à¸µà¸œà¸¥ â€” à¸šà¸—à¸„à¸§à¸²à¸¡à¸­à¸²à¸ˆà¹„à¸¡à¹ˆà¸—à¸±à¸™ à¸•à¹‰à¸­à¸‡à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š',
                         null, null, 'controlled_document', (string)$row['document_id'], $userId);
        } else {
            $cleared[] = (int)$row['id'];
        }
    }

    return ['ok' => true, 'checked' => $checked, 'flagged' => $flagged, 'cleared' => $cleared];
}

/* ===========================================================================
 * 12. USAGE + FEEDBACK
 * =========================================================================== */

/**
 * Record one real usage event. Nothing is back-filled and no counter is
 * estimated. A NULL user_id means an anonymous or device-level hit, which is
 * still real usage.
 */
function kn_usage_log(PDO $pdo, int $articleId, string $action, ?int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $action = strtolower(trim($action));
    if (!in_array($action, KN_USAGE_ACTIONS, true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_USAGE_ACTION', 'allowed' => KN_USAGE_ACTIONS];
    }
    if (!kn_article_row($pdo, $articleId)) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    if (!$cfg['usage_log_enabled']) {
        return ['ok' => true, 'logged' => false, 'reason' => 'knowledge_usage_log_enabled = 0'];
    }

    $device = strtolower(trim((string)($opts['device'] ?? '')));
    $device = in_array($device, KN_DEVICES, true) ? $device : 'unknown';
    $entityType = isset($opts['entity_type']) ? strtolower(trim((string)$opts['entity_type'])) : null;
    $entityId = isset($opts['entity_id']) ? mb_substr(trim((string)$opts['entity_id']), 0, 64) : null;
    $assetId = !empty($opts['asset_id']) ? (int)$opts['asset_id'] : null;

    try {
        $st = $pdo->prepare(
            'INSERT INTO knowledge_usage (article_id, action, helpfulness, comment, entity_type, entity_id, asset_id, user_id, device)
             VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?)'
        );
        $st->execute([$articleId, $action, $entityType, $entityId, $assetId, $userId, $device]);
        return ['ok' => true, 'logged' => true, 'id' => (int)$pdo->lastInsertId()];
    } catch (Throwable $e) {
        error_log('[knowledge] usage log failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_USAGE_LOG_FAILED'];
    }
}

/**
 * Record a person's verdict: helpful / not_helpful / no_answer.
 *
 * This is a separate, later signal than the view â€” a view never implies the
 * knowledge helped. A "not_helpful" verdict also opens an activity entry so the
 * author sees the real complaint instead of a silent drop in usage.
 */
function kn_usage_feedback(PDO $pdo, int $articleId, string $helpfulness, ?int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    if (!$cfg['helpfulness_enabled']) {
        return ['ok' => false, 'code' => 'KN_FEEDBACK_DISABLED'];
    }
    $helpfulness = strtolower(trim($helpfulness));
    if (!in_array($helpfulness, KN_HELPFULNESS, true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_HELPFULNESS', 'allowed' => KN_HELPFULNESS];
    }
    $article = kn_article_row($pdo, $articleId);
    if (!$article) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }

    $device = strtolower(trim((string)($opts['device'] ?? '')));
    $device = in_array($device, KN_DEVICES, true) ? $device : 'unknown';
    $comment = kn_text($opts['comment'] ?? null, 1000);

    try {
        $st = $pdo->prepare(
            'INSERT INTO knowledge_usage (article_id, action, helpfulness, comment, entity_type, entity_id, asset_id, user_id, device)
             VALUES (?, \'feedback\', ?, ?, ?, ?, ?, ?, ?)'
        );
        $st->execute([
            $articleId, $helpfulness, $comment,
            isset($opts['entity_type']) ? strtolower(trim((string)$opts['entity_type'])) : null,
            isset($opts['entity_id']) ? mb_substr(trim((string)$opts['entity_id']), 0, 64) : null,
            !empty($opts['asset_id']) ? (int)$opts['asset_id'] : null,
            $userId, $device,
        ]);
    } catch (Throwable $e) {
        error_log('[knowledge] feedback failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_FEEDBACK_FAILED'];
    }

    kn_activity($pdo, $articleId, 'feedback',
                 'à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¸£à¸²à¸¢à¸‡à¸²à¸™: ' . $helpfulness . ($comment === null ? '' : ' â€” ' . $comment),
                 null, null, null, null, $userId);

    return ['ok' => true, 'article_id' => $articleId, 'helpfulness' => $helpfulness];
}

/**
 * Real usage numbers for one article. Every count is a plain count of rows that
 * exist; nothing here is scored, weighted or inferred.
 */
function kn_usage_summary(PDO $pdo, int $articleId): array {
    try {
        $st = $pdo->prepare(
            'SELECT action, COUNT(*) AS c FROM knowledge_usage WHERE article_id = ? GROUP BY action'
        );
        $st->execute([$articleId]);
        $byAction = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $byAction[(string)$r['action']] = (int)$r['c'];
        }

        $hst = $pdo->prepare(
            'SELECT helpfulness, COUNT(*) AS c FROM knowledge_usage
             WHERE article_id = ? AND helpfulness IS NOT NULL GROUP BY helpfulness'
        );
        $hst->execute([$articleId]);
        $byHelp = [];
        foreach ($hst->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $byHelp[(string)$r['helpfulness']] = (int)$r['c'];
        }

        $last = $pdo->prepare('SELECT MAX(created_at) FROM knowledge_usage WHERE article_id = ?');
        $last->execute([$articleId]);
        $lastUsed = $last->fetchColumn();

        $views = 0;
        foreach (['view', 'search_hit', 'open_procedure'] as $a) {
            $views += $byAction[$a] ?? 0;
        }
        $answers = array_sum($byHelp);

        return [
            'total_events'     => array_sum($byAction),
            'views'            => $views,
            'by_action'        => $byAction,
            'by_helpfulness'   => $byHelp,
            'answers'          => $answers,
            'last_used_at'     => $lastUsed === false ? null : (string)$lastUsed,
            'has_usage_data'   => array_sum($byAction) > 0,
            // Zero answers is reported as zero answers. It is never turned into
            // a "low value" verdict about the content.
            'answer_rate_note' => $answers === 0 ? 'NO_FEEDBACK_YET' : null,
        ];
    } catch (Throwable $e) {
        error_log('[knowledge] usage summary failed: ' . $e->getMessage());
        return ['total_events' => 0, 'views' => 0, 'by_action' => [], 'by_helpfulness' => [],
                'answers' => 0, 'last_used_at' => null, 'has_usage_data' => false,
                'answer_rate_note' => 'USAGE_UNAVAILABLE'];
    }
}

/** Usage event stream for the usage screen. */
function kn_usage_events(PDO $pdo, array $opts = []): array {
    $cfg = kn_config($pdo);
    $limit = min(max(1, (int)($opts['limit'] ?? 50)), 200);
    $where = [];
    $params = [];

    if (!empty($opts['article_id'])) {
        $where[] = 'u.article_id = ?';
        $params[] = (int)$opts['article_id'];
    }
    if (!empty($opts['user_id'])) {
        $where[] = 'u.user_id = ?';
        $params[] = (int)$opts['user_id'];
    }
    if (!empty($opts['action'])) {
        $where[] = 'u.action = ?';
        $params[] = (string)$opts['action'];
    }
    if (!empty($opts['helpfulness'])) {
        $where[] = 'u.helpfulness = ?';
        $params[] = (string)$opts['helpfulness'];
    }
    if (!empty($opts['since'])) {
        $where[] = 'u.created_at >= ?';
        $params[] = (string)$opts['since'] . ' 00:00:00';
    }
    $whereSql = $where === [] ? '1 = 1' : implode(' AND ', $where);

    $st = $pdo->prepare(
        'SELECT u.id, u.article_id, u.action, u.helpfulness, u.comment, u.entity_type, u.entity_id,
                u.asset_id, u.user_id, u.device, u.created_at,
                a.article_key, a.title
         FROM knowledge_usage u
         LEFT JOIN knowledge_article a ON a.id = u.article_id
         WHERE ' . $whereSql . '
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT ' . $limit
    );
    $st->execute($params);
    return ['ok' => true, 'events' => $st->fetchAll(PDO::FETCH_ASSOC)];
}

/* ===========================================================================
 * 13. KNOWLEDGE GAPS
 * =========================================================================== */

/**
 * Turn a zero-result search into a tracked work item.
 *
 * The gap is a work item, not a conclusion: it carries the real number of
 * searches behind it, it is only opened once the same question has been asked
 * knowledge_gap_min_occurrences times, and closing it requires a real article.
 * Nothing about WHY the knowledge is missing is decided here.
 */
function kn_gap_open_from_search(PDO $pdo, string $normalizedTerm, string $term, array $opts, ?int $userId): ?array {
    $cfg = kn_config($pdo);
    if (!$cfg['auto_create_gap'] || $normalizedTerm === '') {
        return null;
    }

    $assetId = !empty($opts['asset_id']) ? (int)$opts['asset_id'] : null;
    $entityType = isset($opts['entity_type']) ? strtolower(trim((string)$opts['entity_type'])) : null;
    $entityId = isset($opts['entity_id']) ? mb_substr(trim((string)$opts['entity_id']), 0, 64) : null;

    // Count real searches for the same question inside the window. This is the
    // only basis for opening a gap.
    $cnt = $pdo->prepare(
        'SELECT COUNT(*) FROM knowledge_search_log
         WHERE normalized_query = ? AND has_results = 0 AND created_at >= ?'
    );
    $cnt->execute([$normalizedTerm, date('Y-m-d H:i:s', strtotime('-' . $cfg['gap_window_days'] . ' days'))]);
    $occurrences = (int)$cnt->fetchColumn();

    if ($occurrences < $cfg['gap_min_occurrences']) {
        return ['opened' => false, 'reason' => 'BELOW_MIN_OCCURRENCES',
                'occurrences' => $occurrences, 'min_occurrences' => $cfg['gap_min_occurrences'],
                'normalized_term' => $normalizedTerm];
    }

    // The unique key (normalized_term, asset_id) does not dedupe NULL asset_id,
    // so the existence check is explicit instead of relying on the index.
    if ($assetId === null) {
        $ex = $pdo->prepare('SELECT id FROM knowledge_gap WHERE normalized_term = ? AND asset_id IS NULL LIMIT 1');
    } else {
        $ex = $pdo->prepare('SELECT id FROM knowledge_gap WHERE normalized_term = ? AND asset_id = ? LIMIT 1');
    }
    $ex->execute($assetId === null ? [$normalizedTerm] : [$normalizedTerm, $assetId]);
    $existingId = $ex->fetchColumn();

    if ($existingId !== false) {
        $up = $pdo->prepare(
            'UPDATE knowledge_gap
             SET occurrences = occurrences + 1, last_seen_at = NOW(),
                 entity_type = COALESCE(entity_type, ?), entity_id = COALESCE(entity_id, ?)
             WHERE id = ?'
        );
        $up->execute([$entityType, $entityId, (int)$existingId]);
        return ['opened' => false, 'reason' => 'ALREADY_TRACKED', 'gap_id' => (int)$existingId,
                'occurrences' => $occurrences + 1, 'normalized_term' => $normalizedTerm];
    }

    try {
        $st = $pdo->prepare(
            'INSERT INTO knowledge_gap (search_term, normalized_term, occurrences, first_seen_at, last_seen_at,
                                         asset_id, entity_type, entity_id, status, priority)
             VALUES (?, ?, ?, NOW(), NOW(), ?, ?, ?, \'open\', ?)'
        );
        $st->execute([mb_substr($term, 0, 255), $normalizedTerm, $occurrences, $assetId, $entityType, $entityId,
                      $cfg['gap_default_priority']]);
        $gapId = (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[knowledge] gap open failed: ' . $e->getMessage());
        return null;
    }

    kn_activity($pdo, null, 'gap_open',
                 'à¹€à¸›à¸´à¸” Knowledge Gap à¸ˆà¸²à¸à¸„à¸³à¸„à¹‰à¸™ "' . mb_substr($term, 0, 120) . '" (à¸„à¹‰à¸™à¹„à¸¡à¹ˆà¹€à¸ˆà¸­ ' . $occurrences . ' à¸„à¸£à¸±à¹‰à¸‡)',
                 null, null, 'knowledge_gap', (string)$gapId, $userId);

    return ['opened' => true, 'gap_id' => $gapId, 'occurrences' => $occurrences,
            'normalized_term' => $normalizedTerm];
}

/** Gap work items, newest activity first. */
function kn_gaps(PDO $pdo, array $opts = []): array {
    $cfg = kn_config($pdo);
    $paging = kn_paging($opts, $cfg);
    $where = [];
    $params = [];

    if (!empty($opts['status'])) {
        $st = array_values(array_intersect(array_filter(explode(',', (string)$opts['status']), 'strlen'), KN_GAP_STATUSES));
        if ($st === []) {
            $where[] = '1 = 0';
        } else {
            $where[] = 'g.status IN (' . implode(',', array_fill(0, count($st), '?')) . ')';
            $params = array_merge($params, $st);
        }
    } elseif (empty($opts['include_closed'])) {
        $where[] = "g.status <> 'rejected'";
    }
    if (!empty($opts['priority'])) {
        $pr = array_values(array_intersect(array_filter(explode(',', (string)$opts['priority']), 'strlen'), KN_GAP_PRIORITIES));
        if ($pr === []) {
            $where[] = '1 = 0';
        } else {
            $where[] = 'g.priority IN (' . implode(',', array_fill(0, count($pr), '?')) . ')';
            $params = array_merge($params, $pr);
        }
    }
    if (!empty($opts['assigned_to'])) {
        $where[] = 'g.assigned_to = ?';
        $params[] = (int)$opts['assigned_to'];
    }
    if (!empty($opts['asset_id'])) {
        $where[] = 'g.asset_id = ?';
        $params[] = (int)$opts['asset_id'];
    }
    if (!empty($opts['q'])) {
        $where[] = 'g.search_term LIKE ?';
        $params[] = '%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr((string)$opts['q'], 0, 100, 'UTF-8')) . '%';
    }
    if (!empty($opts['min_occurrences'])) {
        $where[] = 'g.occurrences >= ?';
        $params[] = (int)$opts['min_occurrences'];
    }

    $whereSql = $where === [] ? '1 = 1' : implode(' AND ', $where);
    $st = $pdo->prepare(
        'SELECT g.*, ra.article_key AS resolved_article_key, ra.title AS resolved_article_title,
                ra.status AS resolved_article_status
         FROM knowledge_gap g
         LEFT JOIN knowledge_article ra ON ra.id = g.resolved_article_id
         WHERE ' . $whereSql . '
         ORDER BY FIELD(g.priority, \'critical\',\'high\',\'medium\',\'low\'), g.occurrences DESC, g.last_seen_at DESC
         LIMIT ' . $paging['limit'] . ' OFFSET ' . $paging['offset']
    );
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $i => $r) {
        $age = kn_days_between(substr((string)$r['last_seen_at'], 0, 10), date('Y-m-d'));
        $rows[$i]['days_since_last_seen'] = $age;
        // A gap nobody has searched for in a long time is still open work, but it
        // is no longer urgent â€” this is reported, not reprioritised for the user.
        $rows[$i]['is_stale_question'] = ($age !== null && $age > $cfg['gap_window_days']);
    }

    $cst = $pdo->prepare('SELECT COUNT(*) FROM knowledge_gap g WHERE ' . $whereSql);
    $cst->execute($params);
    $total = (int)$cst->fetchColumn();

    return ['ok' => true, 'gaps' => $rows, 'total' => $total,
            'page' => $paging['page'], 'limit' => $paging['limit']];
}

/** One gap with its real search evidence. */
function kn_gap_get(PDO $pdo, int $id): array {
    $st = $pdo->prepare('SELECT * FROM knowledge_gap WHERE id = ?');
    $st->execute([$id]);
    $gap = $st->fetch(PDO::FETCH_ASSOC);
    if (!$gap) {
        return ['ok' => false, 'code' => 'KN_GAP_NOT_FOUND'];
    }

    // The evidence behind the counter: the actual searches, not a summary.
    $since = date('Y-m-d H:i:s', strtotime('-' . kn_config($pdo)['gap_window_days'] . ' days'));
    $est = $pdo->prepare('SELECT id, query_text, asset_id, entity_type, entity_id, user_id, took_ms, created_at
                          FROM knowledge_search_log
                          WHERE normalized_query = ? AND has_results = 0 AND created_at >= ?
                          ORDER BY created_at DESC LIMIT 50');
    $est->execute([(string)$gap['normalized_term'], $since]);

    return ['ok' => true, 'gap' => $gap, 'evidence_searches' => $est->fetchAll(PDO::FETCH_ASSOC)];
}

/** Open a gap by hand, for something people cannot search for yet. */
function kn_gap_create(PDO $pdo, string $term, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);
    $norm = kn_normalize_query($term);
    if ($norm === '') {
        return ['ok' => false, 'code' => 'GAP_TERM_REQUIRED'];
    }
    $priority = in_array((string)($opts['priority'] ?? ''), KN_GAP_PRIORITIES, true)
        ? (string)$opts['priority'] : $cfg['gap_default_priority'];
    $assetId = !empty($opts['asset_id']) ? (int)$opts['asset_id'] : null;

    try {
        if ($assetId === null) {
            $ex = $pdo->prepare('SELECT id FROM knowledge_gap WHERE normalized_term = ? AND asset_id IS NULL LIMIT 1');
            $ex->execute([$norm]);
        } else {
            $ex = $pdo->prepare('SELECT id FROM knowledge_gap WHERE normalized_term = ? AND asset_id = ? LIMIT 1');
            $ex->execute([$norm, $assetId]);
        }
        $existing = $ex->fetchColumn();
        if ($existing !== false) {
            return ['ok' => true, 'id' => (int)$existing, 'created' => false];
        }

        $st = $pdo->prepare('INSERT INTO knowledge_gap
                                (search_term, normalized_term, occurrences, first_seen_at, last_seen_at,
                                 asset_id, entity_type, entity_id, status, priority, priority_reason, triaged_by, triaged_at)
                             VALUES (?, ?, 0, NOW(), NOW(), ?, ?, ?, \'triaged\', ?, ?, ?, NOW())');
        $st->execute([
            mb_substr(trim($term), 0, 255), $norm, $assetId,
            isset($opts['entity_type']) ? strtolower(trim((string)$opts['entity_type'])) : null,
            isset($opts['entity_id']) ? mb_substr(trim((string)$opts['entity_id']), 0, 64) : null,
            $priority, kn_text($opts['priority_reason'] ?? null, 500), $userId,
        ]);
        $id = (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[knowledge] gap create failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_GAP_CREATE_FAILED'];
    }

    kn_activity($pdo, null, 'gap_create', 'à¹€à¸›à¸´à¸” gap à¹€à¸­à¸‡: ' . mb_substr($term, 0, 120),
                 null, null, 'knowledge_gap', (string)$id, $userId);
    return ['ok' => true, 'id' => $id, 'created' => true];
}

/**
 * Move a gap through its workflow.
 *
 * Every transition is written by a person and stamped with who did it. Resolving
 * a gap REQUIRES a real article id â€” a gap cannot be closed by declaring the
 * question unimportant, and it cannot be closed by pointing at a draft nobody can
 * read.
 */
function kn_gap_action(PDO $pdo, int $id, string $action, int $userId, array $opts = []): array {
    $st = $pdo->prepare('SELECT * FROM knowledge_gap WHERE id = ?');
    $st->execute([$id]);
    $gap = $st->fetch(PDO::FETCH_ASSOC);
    if (!$gap) {
        return ['ok' => false, 'code' => 'KN_GAP_NOT_FOUND'];
    }
    $from = (string)$gap['status'];

    switch ($action) {
        case 'triage':
            $priority = in_array((string)($opts['priority'] ?? ''), KN_GAP_PRIORITIES, true)
                ? (string)$opts['priority'] : (string)$gap['priority'];
            $reason = kn_text($opts['priority_reason'] ?? null, 500);
            if ($reason === null) {
                return ['ok' => false, 'code' => 'PRIORITY_REASON_REQUIRED',
                        'hint' => 'à¸•à¹‰à¸­à¸‡à¸£à¸°à¸šà¸¸à¹€à¸«à¸•à¸¸à¸œà¸¥à¸‚à¸­à¸‡à¸¥à¸³à¸”à¸±à¸šà¸„à¸§à¸²à¸¡à¸ªà¸³à¸„à¸±à¸ à¹€à¸žà¸£à¸²à¸°à¸£à¸°à¸šà¸šà¸ˆà¸°à¹„à¸¡à¹ˆà¸•à¸±à¸”à¸ªà¸´à¸™à¸„à¸§à¸²à¸¡à¸ªà¸³à¸„à¸±à¸à¹à¸—à¸™à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰'];
            }
            $pdo->prepare("UPDATE knowledge_gap
                            SET status = 'triaged', priority = ?, priority_reason = ?, triaged_by = ?, triaged_at = NOW()
                            WHERE id = ?")
                ->execute([$priority, $reason, $userId, $id]);
            $to = 'triaged';
            break;

        case 'assign':
            $assignee = (int)($opts['assigned_to'] ?? 0);
            if ($assignee <= 0) {
                return ['ok' => false, 'code' => 'ASSIGNEE_REQUIRED'];
            }
            $due = kn_text($opts['due_date'] ?? null, 10);
            $pdo->prepare("UPDATE knowledge_gap
                            SET status = 'in_progress', assigned_to = ?, due_date = ?,
                                triaged_by = COALESCE(triaged_by, ?), triaged_at = COALESCE(triaged_at, NOW())
                            WHERE id = ?")
                ->execute([$assignee, $due !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $due) ? $due : null, $userId, $id]);
            $to = 'in_progress';
            break;

        case 'priority':
            $priority = (string)($opts['priority'] ?? '');
            $reason = kn_text($opts['priority_reason'] ?? null, 500);
            if (!in_array($priority, KN_GAP_PRIORITIES, true)) {
                return ['ok' => false, 'code' => 'PRIORITY_INVALID', 'allowed' => KN_GAP_PRIORITIES];
            }
            if ($reason === null) {
                return ['ok' => false, 'code' => 'PRIORITY_REASON_REQUIRED'];
            }
            $pdo->prepare('UPDATE knowledge_gap SET priority = ?, priority_reason = ? WHERE id = ?')
                ->execute([$priority, $reason, $id]);
            $to = $from;
            break;

        case 'resolve':
            $articleId = (int)($opts['resolved_article_id'] ?? 0);
            if ($articleId <= 0) {
                return ['ok' => false, 'code' => 'RESOLVED_ARTICLE_REQUIRED',
                        'hint' => 'à¸•à¹‰à¸­à¸‡à¸£à¸°à¸šà¸¸à¸šà¸—à¸„à¸§à¸²à¸¡à¸—à¸µà¹ˆà¹€à¸‚à¸µà¸¢à¸™à¸•à¸­à¸šà¸„à¸³à¸–à¸²à¸¡à¸™à¸µà¹‰à¸ˆà¸£à¸´à¸‡'];
            }
            $article = kn_article_row($pdo, $articleId);
            if (!$article) {
                return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
            }
            if (!in_array((string)$article['status'], ['published', 'approved'], true)) {
                return ['ok' => false, 'code' => 'RESOLVED_ARTICLE_NOT_USABLE',
                        'status' => (string)$article['status'],
                        'hint' => 'à¸šà¸—à¸„à¸§à¸²à¸¡à¸—à¸µà¹ˆà¸›à¸´à¸” gap à¸•à¹‰à¸­à¸‡à¹€à¸œà¸¢à¹à¸žà¸£à¹ˆà¸«à¸£à¸·à¸­à¸­à¸¢à¹ˆà¸²à¸‡à¸™à¹‰à¸­à¸¢à¸œà¹ˆà¸²à¸™à¸à¸²à¸£à¸­à¸™à¸¸à¸¡à¸±à¸•à¸´'];
            }
            $note = kn_text($opts['close_note'] ?? null, 1000);
            $pdo->prepare("UPDATE knowledge_gap
                            SET status = 'resolved', resolved_article_id = ?, resolved_by = ?,
                                resolved_at = NOW(), close_note = ?
                            WHERE id = ?")
                ->execute([$articleId, $userId, $note, $id]);
            kn_activity($pdo, $articleId, 'gap_resolved_by_article',
                         'à¸šà¸—à¸„à¸§à¸²à¸¡à¸™à¸µà¹‰à¸›à¸´à¸” gap "' . (string)$gap['search_term'] . '"',
                         null, null, 'knowledge_gap', (string)$id, $userId);
            $to = 'resolved';
            break;

        case 'reject':
            $note = kn_text($opts['close_note'] ?? null, 1000);
            if ($note === null) {
                return ['ok' => false, 'code' => 'CLOSE_NOTE_REQUIRED',
                        'hint' => 'à¸à¸²à¸£à¸›à¸à¸´à¹€à¸ªà¸˜ gap à¸•à¹‰à¸­à¸‡à¸¡à¸µà¹€à¸«à¸•à¸¸à¸œà¸¥à¸—à¸µà¹ˆà¹€à¸‚à¸µà¸¢à¸™à¹„à¸§à¹‰'];
            }
            $pdo->prepare("UPDATE knowledge_gap
                            SET status = 'rejected', resolved_by = ?, resolved_at = NOW(), close_note = ?
                            WHERE id = ?")
                ->execute([$userId, $note, $id]);
            $to = 'rejected';
            break;

        case 'reopen':
            $pdo->prepare("UPDATE knowledge_gap
                            SET status = 'open', resolved_article_id = NULL, resolved_by = NULL,
                                resolved_at = NULL
                            WHERE id = ?")
                ->execute([$id]);
            $to = 'open';
            break;

        default:
            return ['ok' => false, 'code' => 'KN_UNKNOWN_GAP_ACTION',
                    'allowed' => ['triage', 'assign', 'priority', 'resolve', 'reject', 'reopen']];
    }

    kn_activity($pdo, null, 'gap_' . $action,
                 'gap "' . (string)$gap['search_term'] . '" : ' . $from . ' -> ' . $to,
                 $from, $to, 'knowledge_gap', (string)$id, $userId);

    return ['ok' => true, 'id' => $id, 'from' => $from, 'to' => $to];
}

/** Aggregated gap numbers for the dashboard. */
function kn_gap_stats(PDO $pdo): array {
    $cfg = kn_config($pdo);
    try {
        $byStatus = $pdo->query('SELECT status, COUNT(*) c, SUM(occurrences) occ FROM knowledge_gap GROUP BY status')
            ->fetchAll(PDO::FETCH_ASSOC);
        $byPriority = $pdo->query("SELECT priority, COUNT(*) c FROM knowledge_gap
                                   WHERE status NOT IN ('resolved','rejected') GROUP BY priority")
            ->fetchAll(PDO::FETCH_ASSOC);

        // The raw number of unanswered searches, independent of whether a gap was
        // opened for them. Both are reported; neither is invented.
        $unanswered = (int)$pdo->query(
            'SELECT COUNT(*) FROM knowledge_search_log
             WHERE has_results = 0 AND created_at >= ' . $pdo->quote(date('Y-m-d H:i:s', strtotime('-' . $cfg['gap_window_days'] . ' days')))
        )->fetchColumn();
        $total = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_search_log')->fetchColumn();
        $answered = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_search_log WHERE has_results = 1')->fetchColumn();

        $top = $pdo->query(
            'SELECT normalized_query, COUNT(*) c FROM knowledge_search_log
             WHERE has_results = 0 AND created_at >= ' . $pdo->quote(date('Y-m-d H:i:s', strtotime('-' . $cfg['gap_window_days'] . ' days'))) . '
             GROUP BY normalized_query ORDER BY c DESC, normalized_query LIMIT 10'
        )->fetchAll(PDO::FETCH_ASSOC);

        return ['ok' => true, 'by_status' => $byStatus, 'by_priority' => $byPriority,
                'searches_total' => $total, 'searches_answered' => $answered,
                'searches_unanswered_in_window' => $unanswered,
                'top_unanswered_terms' => $top,
                'window_days' => $cfg['gap_window_days']];
    } catch (Throwable $e) {
        error_log('[knowledge] gap stats failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_GAP_STATS_UNAVAILABLE'];
    }
}

/* ===========================================================================
 * 14. REVIEWS
 * =========================================================================== */

/**
 * Review queue.
 *
 * Two different things are reported side by side and never merged:
 *   - scheduled: a published article whose review_cycle_days has elapsed
 *   - opened rounds: knowledge_review rows a person still has to finish
 */
function kn_reviews(PDO $pdo, array $opts = []): array {
    $cfg = kn_config($pdo);
    $limit = min(max(1, (int)($opts['limit'] ?? 50)), 200);
    $where = [];
    $params = [];

    if (!empty($opts['status'])) {
        $st = array_values(array_intersect(array_filter(explode(',', (string)$opts['status']), 'strlen'), KN_REVIEW_STATUSES));
        if ($st === []) {
            $where[] = '1 = 0';
        } else {
            $where[] = 'r.status IN (' . implode(',', array_fill(0, count($st), '?')) . ')';
            $params = array_merge($params, $st);
        }
    }
    if (!empty($opts['open_only'])) {
        $where[] = "r.status IN ('pending','in_progress')";
    }
    if (!empty($opts['reviewer_id'])) {
        $where[] = 'r.reviewer_id = ?';
        $params[] = (int)$opts['reviewer_id'];
    }
    $whereSql = $where === [] ? '1 = 1' : implode(' AND ', $where);

    $st = $pdo->prepare(
        'SELECT r.*, a.article_key, a.title, a.status AS article_status, a.version_no,
                a.next_review_date AS article_next_review_date
         FROM knowledge_review r
         JOIN knowledge_article a ON a.id = r.article_id
         WHERE ' . $whereSql . '
         ORDER BY (r.due_date IS NULL), r.due_date, r.id
         LIMIT ' . $limit
    );
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $today = date('Y-m-d');
    foreach ($rows as $i => $r) {
        $rows[$i]['overdue'] = ($r['due_date'] !== null && (string)$r['due_date'] < $today
            && in_array((string)$r['status'], ['pending', 'in_progress'], true));
    }

    return ['ok' => true, 'reviews' => $rows, 'scheduled_due' => kn_review_due($pdo, $limit)];
}

/**
 * Published articles whose review date has arrived.
 *
 * An article with no review cycle is never in this list â€” "no scheduled review"
 * is an answer, not an overdue item.
 */
function kn_review_due(PDO $pdo, int $limit = 100): array {
    $cfg = kn_config($pdo);
    $today = date('Y-m-d');
    $warn = $cfg['review_overdue_warn_days'];
    $rows = $pdo->query(
        'SELECT a.id, a.article_key, a.version_no, a.title, a.next_review_date, a.review_cycle_days,
                a.review_owner_id, a.owner_id,
                DATEDIFF(CURRENT_DATE, a.next_review_date) AS days_overdue
         FROM knowledge_article a
         WHERE a.status = \'published\'
           AND a.next_review_date IS NOT NULL
           AND a.next_review_date <= DATE_ADD(CURRENT_DATE, INTERVAL ' . (int)$warn . ' DAY)
         ORDER BY a.next_review_date
         LIMIT ' . (int)$limit
    )->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $i => $r) {
        $rows[$i]['due'] = (string)$r['next_review_date'] <= $today;
        $rows[$i]['days_overdue'] = (int)$r['days_overdue'];
    }
    return $rows;
}

/**
 * Open a review round for a reason that is not the calendar: an incident, a
 * major document revision, or a user report that the knowledge was wrong.
 */
function kn_review_request(PDO $pdo, int $articleId, string $trigger, int $userId, array $opts = []): array {
    $row = kn_article_row($pdo, $articleId);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_ARTICLE_NOT_FOUND'];
    }
    if (!in_array($trigger, KN_REVIEW_TRIGGERS, true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_TRIGGER', 'allowed' => KN_REVIEW_TRIGGERS];
    }
    $open = $pdo->prepare("SELECT id FROM knowledge_review WHERE article_id = ? AND status IN ('pending','in_progress') LIMIT 1");
    $open->execute([$articleId]);
    if ($open->fetchColumn() !== false) {
        return ['ok' => false, 'code' => 'KN_REVIEW_ALREADY_OPEN'];
    }

    $reviewer = (int)($opts['reviewer_id'] ?? 0);
    if ($reviewer <= 0) {
        $reviewer = (int)($row['review_owner_id'] ?? $row['owner_id'] ?? 0);
    }
    $round = (int)$pdo->query('SELECT COALESCE(MAX(round_no),0) FROM knowledge_review WHERE article_id = ' . $articleId)->fetchColumn() + 1;
    $due = kn_text($opts['due_date'] ?? null, 10);

    try {
        $st = $pdo->prepare('INSERT INTO knowledge_review
                                (article_id, round_no, trigger_reason, status, due_date, reviewer_id, assigned_by, assigned_at)
                             VALUES (?, ?, ?, \'pending\', ?, ?, ?, NOW())');
        $st->execute([$articleId, $round, $trigger,
                      ($due !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) ? $due : null,
                      $reviewer > 0 ? $reviewer : null, $userId]);
        $id = (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[knowledge] review request failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_REVIEW_REQUEST_FAILED'];
    }

    kn_activity($pdo, $articleId, 'review_request', 'à¸‚à¸­à¸•à¸£à¸§à¸ˆà¸—à¸šà¸—à¸§à¸™ (' . $trigger . ') à¸£à¸­à¸šà¸—à¸µà¹ˆ ' . $round,
                 null, null, null, null, $userId);
    return ['ok' => true, 'id' => $id, 'round_no' => $round];
}

/** Reviewer picks the round up. */
function kn_review_start(PDO $pdo, int $reviewId, int $userId): array {
    $st = $pdo->prepare('SELECT * FROM knowledge_review WHERE id = ?');
    $st->execute([$reviewId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_REVIEW_NOT_FOUND'];
    }
    if ((string)$row['status'] !== 'pending') {
        return ['ok' => false, 'code' => 'KN_REVIEW_NOT_PENDING', 'status' => (string)$row['status']];
    }
    $pdo->prepare("UPDATE knowledge_review
                    SET status = 'in_progress', reviewer_id = COALESCE(reviewer_id, ?),
                        started_at = COALESCE(started_at, NOW())
                    WHERE id = ?")
        ->execute([$userId, $reviewId]);
    kn_activity($pdo, (int)$row['article_id'], 'review_start', 'à¹€à¸£à¸´à¹ˆà¸¡à¸•à¸£à¸§à¸ˆà¸—à¸šà¸—à¸§à¸™à¸£à¸­à¸šà¸—à¸µà¹ˆ ' . (int)$row['round_no'],
                 'pending', 'in_progress', null, null, $userId);
    return ['ok' => true, 'id' => $reviewId, 'status' => 'in_progress'];
}

/**
 * Finish a review round.
 *
 * 'approved' is the only outcome that keeps an article published. Only a person
 * writes the outcome, and only a person sets the next review date â€” the system
 * never decides that a knowledge item is still true.
 */
function kn_review_complete(PDO $pdo, int $reviewId, string $status, int $userId, array $opts = []): array {
    if (!in_array($status, ['approved', 'needs_revision', 'rejected'], true)) {
        return ['ok' => false, 'code' => 'KN_INVALID_REVIEW_OUTCOME',
                'allowed' => ['approved', 'needs_revision', 'rejected']];
    }
    $st = $pdo->prepare('SELECT * FROM knowledge_review WHERE id = ?');
    $st->execute([$reviewId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['ok' => false, 'code' => 'KN_REVIEW_NOT_FOUND'];
    }
    if (!in_array((string)$row['status'], ['pending', 'in_progress'], true)) {
        return ['ok' => false, 'code' => 'KN_REVIEW_ALREADY_CLOSED', 'status' => (string)$row['status']];
    }

    $findings = kn_text($opts['findings'] ?? null, 4000);
    $outcome = kn_text($opts['outcome_note'] ?? null, 1000);
    if ($findings === null && $status !== 'approved') {
        return ['ok' => false, 'code' => 'REVIEW_FINDINGS_REQUIRED',
                'hint' => 'à¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸—à¸šà¸—à¸§à¸™à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™à¸•à¹‰à¸­à¸‡à¹€à¸‚à¸µà¸¢à¸™à¸ªà¸´à¹ˆà¸‡à¸—à¸µà¹ˆà¸žà¸š à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹à¸„à¹ˆà¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸ªà¸–à¸²à¸™à¸°'];
    }
    $nextReview = kn_text($opts['new_next_review_date'] ?? null, 10);
    $nextReview = ($nextReview !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $nextReview)) ? $nextReview : null;

    $articleId = (int)$row['article_id'];
    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE knowledge_review
                        SET status = ?, reviewer_id = COALESCE(reviewer_id, ?), started_at = COALESCE(started_at, NOW()),
                            completed_at = NOW(), findings = ?, recommendations = ?, outcome_note = ?,
                            new_next_review_date = ?
                        WHERE id = ?')
            ->execute([$status, $userId, $findings, kn_text($opts['recommendations'] ?? null, 4000), $outcome, $nextReview, $reviewId]);

        if ($status === 'needs_revision') {
            // A failed review on an unpublished article sends it back to draft; on
            // a published one it only flags the article, because silently
            // unpublishing knowledge that a technician may be standing in front of
            // is not this module's decision.
            $ast = $pdo->prepare("SELECT status FROM knowledge_article WHERE id = ?");
            $ast->execute([$articleId]);
            $aStatus = (string)$ast->fetchColumn();
            if (in_array($aStatus, ['in_review', 'approved'], true)) {
                $pdo->prepare("UPDATE knowledge_article SET status = 'draft', updated_at = NOW() WHERE id = ?")->execute([$articleId]);
            }
            $pdo->prepare('UPDATE knowledge_article SET next_review_date = ? WHERE id = ?')
                ->execute([$nextReview, $articleId]);
        } elseif ($status === 'approved' && $nextReview !== null) {
            $pdo->prepare('UPDATE knowledge_article
                            SET next_review_date = ?, reviewed_by = COALESCE(reviewed_by, ?),
                                reviewed_at = COALESCE(reviewed_at, NOW())
                            WHERE id = ?')
                ->execute([$nextReview, $userId, $articleId]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[knowledge] review complete failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_REVIEW_COMPLETE_FAILED'];
    }

    kn_activity($pdo, $articleId, 'review_complete',
                 'à¸•à¸£à¸§à¸ˆà¸—à¸šà¸—à¸§à¸™à¸£à¸­à¸šà¸—à¸µà¹ˆ ' . (int)$row['round_no'] . ' à¸œà¸¥: ' . $status,
                 (string)$row['status'], $status, null, null, $userId);

    return ['ok' => true, 'id' => $reviewId, 'status' => $status, 'new_next_review_date' => $nextReview];
}

/* ===========================================================================
 * 15. CATALOG, FEATURE STATUS, EXPORT
 * =========================================================================== */

/**
 * Knowledge Center dashboard.
 *
 * Every number here is a count of rows that exist. Where a number cannot be
 * produced yet it comes back as null with a reason, never as zero.
 */
function kn_catalog(PDO $pdo, int $roleId, int $userId, array $opts = []): array {
    $cfg = kn_config($pdo);

    try {
        $byStatus = $pdo->query('SELECT status, COUNT(*) c FROM knowledge_article GROUP BY status')
            ->fetchAll(PDO::FETCH_ASSOC);
        $statusCounts = array_fill_keys(KN_STATUSES, 0);
        foreach ($byStatus as $r) {
            $statusCounts[(string)$r['status']] = (int)$r['c'];
        }

        $byCategory = $pdo->query(
            'SELECT c.id, c.code, c.name_th, c.name_en,
                    COALESCE(SUM(a.status = \'published\'), 0) AS published,
                    COUNT(a.id) AS total
             FROM knowledge_category c
             LEFT JOIN knowledge_article a ON a.category_id = c.id
             WHERE c.is_active = 1
             GROUP BY c.id, c.code, c.name_th, c.name_en
             ORDER BY c.sort_order, c.code'
        )->fetchAll(PDO::FETCH_ASSOC);

        $published = $statusCounts['published'];
        $totalArticles = array_sum($statusCounts);

        // Traceability health: how much of what is published is actually
        // attached to a machine or a failure mode.
        $unlinked = (int)$pdo->query(
            "SELECT COUNT(*) FROM knowledge_article a
             WHERE a.status = 'published'
               AND NOT EXISTS (SELECT 1 FROM knowledge_relation r WHERE r.article_id = a.id)"
        )->fetchColumn();
        $withRelation = $published - $unlinked;

        $stale = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_document_ref WHERE is_stale = 1')->fetchColumn();

        $usageTotal = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_usage')->fetchColumn();
        $helpTotal = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_usage WHERE helpfulness IS NOT NULL')->fetchColumn();
        $searchTotal = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_search_log')->fetchColumn();
        $searchZero = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_search_log WHERE has_results = 0')->fetchColumn();

        $topUsed = $pdo->query(
            'SELECT u.article_id, a.article_key, a.title, COUNT(*) c
             FROM knowledge_usage u JOIN knowledge_article a ON a.id = u.article_id
             GROUP BY u.article_id, a.article_key, a.title
             ORDER BY c DESC LIMIT 10'
        )->fetchAll(PDO::FETCH_ASSOC);

        $openGaps = (int)$pdo->query("SELECT COUNT(*) FROM knowledge_gap WHERE status NOT IN ('resolved','rejected')")->fetchColumn();
        $dueReviews = count(kn_review_due($pdo));

        return [
            'ok' => true,
            'enabled' => $cfg['enabled'],
            'status_counts' => $statusCounts,
            'total_articles' => $totalArticles,
            'published_articles' => $published,
            'by_category' => $byCategory,
            'traceability' => [
                'published_with_relation' => $withRelation,
                'published_without_relation' => $unlinked,
                'note' => $published === 0
                    ? 'NO_PUBLISHED_KNOWLEDGE_YET'
                    : null,
            ],
            'document_bridge' => ['stale_references' => $stale],
            'usage' => [
                'events' => $usageTotal,
                'helpfulness_answers' => $helpTotal,
                'answer_rate_note' => $helpTotal === 0 ? 'NO_FEEDBACK_YET' : null,
                'searches' => $searchTotal,
                'searches_zero_result' => $searchZero,
                'top_used' => $topUsed,
            ],
            'gaps_open' => $openGaps,
            'reviews_due' => $dueReviews,
        ];
    } catch (Throwable $e) {
        error_log('[knowledge] catalog failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_CATALOG_UNAVAILABLE'];
    }
}

/**
 * What is actually switched on.
 *
 * This is the honest answer to "why is the Knowledge Center empty": the schema
 * may be installed while nothing has been published, or a phase-32 precondition
 * may be missing. Both are reported separately instead of being merged into a
 * single "not working".
 */
function kn_feature_status(PDO $pdo): array {
    $cfg = kn_config($pdo);
    $checks = [];

    // Phase 32 tables must exist; without them there is no controlled-document
    // bridge and no document-backed search.
    foreach (['controlled_documents', 'document_revisions'] as $t) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $st->execute([$t]);
        $checks['phase32_' . $t] = [(int)$st->fetchColumn() > 0 ? 'OK' : 'MISSING'];
    }
    foreach (['knowledge_article', 'knowledge_relation', 'knowledge_usage', 'knowledge_gap'] as $t) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $st->execute([$t]);
        $checks['phase38_' . $t] = [(int)$st->fetchColumn() > 0 ? 'OK' : 'MISSING'];
    }

    $counts = [];
    try {
        $counts['articles'] = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_article')->fetchColumn();
        $counts['published'] = (int)$pdo->query("SELECT COUNT(*) FROM knowledge_article WHERE status = 'published'")->fetchColumn();
        $counts['categories'] = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_category')->fetchColumn();
        $counts['tags'] = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_tag')->fetchColumn();
        $counts['usage_events'] = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_usage')->fetchColumn();
        $counts['searches'] = (int)$pdo->query('SELECT COUNT(*) FROM knowledge_search_log')->fetchColumn();
        $counts['open_gaps'] = (int)$pdo->query("SELECT COUNT(*) FROM knowledge_gap WHERE status NOT IN ('resolved','rejected')")->fetchColumn();
    } catch (Throwable $e) {
        $counts = ['error' => $e->getMessage()];
    }

    // Zero published knowledge is NOT an error: it is the normal state before
    // anyone writes the first article, and it is labelled as such.
    $ready = $checks['phase38_knowledge_article'][0] === 'OK';
    $state = 'READY';
    if ($checks['phase38_knowledge_article'][0] === 'MISSING') {
        $state = 'SCHEMA_MISSING';
    } elseif (($counts['published'] ?? 0) === 0) {
        $state = 'NO_PUBLISHED_KNOWLEDGE';
    } elseif (($counts['usage_events'] ?? 0) === 0) {
        $state = 'NO_USAGE_YET';
    }

    return [
        'ok' => true,
        'version' => KN_VERSION,
        'state' => $state,
        'ready' => $ready,
        'checks' => $checks,
        'counts' => $counts,
        'config' => $cfg,
        'settings_seeded' => $cfg['enabled'],
        'privileged_roles' => $cfg['privileged_roles'],
    ];
}

/**
 * Flat rows for a spreadsheet export. Capped by knowledge_export_row_limit and
 * the cap is reported, so nobody silently receives a truncated file as if it
 * were complete.
 */
function kn_export(PDO $pdo, string $what, array $opts = []): array {
    $cfg = kn_config($pdo);
    $limit = $cfg['export_row_limit'];

    try {
        switch ($what) {
            case 'articles':
                $rows = $pdo->query(
                    'SELECT a.article_key, a.version_no, a.title, a.status, a.confidentiality,
                            c.code AS category_code, a.requires_isolation, a.estimated_minutes,
                            a.review_cycle_days, a.next_review_date, a.published_at, a.updated_at
                     FROM knowledge_article a
                     LEFT JOIN knowledge_category c ON c.id = a.category_id
                     ORDER BY a.article_key, a.version_no
                     LIMIT ' . ($limit + 1)
                )->fetchAll(PDO::FETCH_ASSOC);
                break;

            case 'usage':
                $rows = $pdo->query(
                    'SELECT a.article_key, a.title, u.action, u.helpfulness, u.device,
                            u.entity_type, u.entity_id, u.user_id, u.created_at
                     FROM knowledge_usage u
                     LEFT JOIN knowledge_article a ON a.id = u.article_id
                     ORDER BY u.created_at DESC
                     LIMIT ' . ($limit + 1)
                )->fetchAll(PDO::FETCH_ASSOC);
                break;

            case 'searches':
                $rows = $pdo->query(
                    'SELECT query_text, normalized_query, result_count, has_results,
                            asset_id, user_id, took_ms, created_at
                     FROM knowledge_search_log
                     ORDER BY created_at DESC
                     LIMIT ' . ($limit + 1)
                )->fetchAll(PDO::FETCH_ASSOC);
                break;

            case 'gaps':
                $rows = $pdo->query(
                    'SELECT search_term, occurrences, status, priority, priority_reason,
                            assigned_to, due_date, resolved_article_id, first_seen_at, last_seen_at, resolved_at
                     FROM knowledge_gap
                     ORDER BY occurrences DESC
                     LIMIT ' . ($limit + 1)
                )->fetchAll(PDO::FETCH_ASSOC);
                break;

            case 'reviews':
                $rows = $pdo->query(
                    'SELECT a.article_key, a.title, r.round_no, r.trigger_reason, r.status,
                            r.due_date, r.reviewer_id, r.completed_at, r.outcome_note
                     FROM knowledge_review r
                     JOIN knowledge_article a ON a.id = r.article_id
                     ORDER BY r.created_at DESC
                     LIMIT ' . ($limit + 1)
                )->fetchAll(PDO::FETCH_ASSOC);
                break;

            default:
                return ['ok' => false, 'code' => 'KN_UNKNOWN_EXPORT',
                        'allowed' => ['articles', 'usage', 'searches', 'gaps', 'reviews']];
        }
    } catch (Throwable $e) {
        error_log('[knowledge] export failed: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'KN_EXPORT_UNAVAILABLE'];
    }

    $truncated = count($rows) > $limit;
    if ($truncated) {
        $rows = array_slice($rows, 0, $limit);
    }

    return ['ok' => true, 'what' => $what, 'rows' => $rows,
            'row_count' => count($rows), 'row_limit' => $limit, 'truncated' => $truncated];
}
