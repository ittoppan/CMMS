<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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


