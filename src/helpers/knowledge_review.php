<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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


