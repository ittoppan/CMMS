<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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
    // name_th/name_en are NOT NULL columns: a category may be labelled in only one
    // language, so the missing side is stored as an empty string, never null.
    $nameTh = $nameTh ?? '';
    $nameEn = $nameEn ?? '';
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


