<?php
/* Split from knowledge.php (2026-10-17) - always loaded via the knowledge.php barrel file */

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


