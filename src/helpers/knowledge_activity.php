<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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

