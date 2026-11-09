<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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


