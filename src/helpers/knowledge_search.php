<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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


