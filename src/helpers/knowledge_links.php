<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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


