<?php
/**
 * PM reminders helper — scan open PM cycles (due today / overdue) and notify assignees (best-effort).
 * No schema changes, no dedupe; delivery depends on env/settings/channels.
 */

require_once __DIR__ . '/notification.php';

/** @return array{today:string,summary:array{overdue_open:int,due_today:int,in_progress_open:int}} */
function pm_reminders_summary(PDO $pdo, ?string $today = null): array {
    $today = $today ?: date('Y-m-d');
    $sql = "SELECT
                SUM(CASE WHEN status='overdue' OR (status='pending' AND due_date < :t1) OR (status='in_progress' AND due_date < :t2) THEN 1 ELSE 0 END) AS overdue_open,
                SUM(CASE WHEN status='pending' AND due_date = :t3 THEN 1 ELSE 0 END) AS due_today,
                SUM(CASE WHEN status='in_progress' AND (due_date IS NULL OR due_date >= :t4) THEN 1 ELSE 0 END) AS in_progress_open
            FROM pm_am
            WHERE status NOT IN ('completed','cancelled','skipped')";
    $st = $pdo->prepare($sql);
    $st->execute([':t1' => $today, ':t2' => $today, ':t3' => $today, ':t4' => $today]);
    $sum = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    return [
        'today' => $today,
        'summary' => [
            'overdue_open' => (int)($sum['overdue_open'] ?? 0),
            'due_today' => (int)($sum['due_today'] ?? 0),
            'in_progress_open' => (int)($sum['in_progress_open'] ?? 0),
        ],
    ];
}

/**
 * @return array{ok:bool,today:string,scanned_cycles:int,users_targeted:int,users_notified:int,notify_errors:int}
 */
function pm_reminders_run(PDO $pdo, ?string $today = null, int $limit = 500): array {
    $today = $today ?: date('Y-m-d');
    $limit = max(1, min(2000, $limit));

    $st = $pdo->prepare("SELECT id, title, asset_id, asset_name, due_date, assigned_to, status
                         FROM pm_am
                         WHERE status NOT IN ('completed','cancelled','skipped')
                           AND assigned_to IS NOT NULL AND assigned_to > 0
                           AND (
                               status='overdue'
                               OR (status='pending' AND due_date <= :t1)
                               OR (status='in_progress' AND due_date < :t2)
                           )
                         ORDER BY due_date ASC, id ASC
                         LIMIT " . (int)$limit);
    $st->execute([':t1' => $today, ':t2' => $today]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $byUser = [];
    foreach ($rows as $r) {
        $uid = (int)($r['assigned_to'] ?? 0);
        if ($uid <= 0) continue;
        $due = (string)($r['due_date'] ?? '');
        $kind = ($due !== '' && $due <= $today) ? (($due < $today || (string)$r['status'] === 'overdue') ? 'overdue' : 'due_today') : 'open';
        if (!isset($byUser[$uid])) $byUser[$uid] = ['overdue' => [], 'due_today' => [], 'open' => []];
        $byUser[$uid][$kind][] = $r;
    }

    $notifiedUsers = 0;
    $notifyErrors = 0;
    foreach ($byUser as $uid => $buckets) {
        $ov = $buckets['overdue'];
        $dt = $buckets['due_today'];
        $parts = [];
        if (count($ov)) $parts[] = 'เกินกำหนด ' . count($ov) . ' งาน';
        if (count($dt)) $parts[] = 'ถึงกำหนดวันนี้ ' . count($dt) . ' งาน';
        if (!$parts) continue;
        $samples = array_slice(array_merge($ov, $dt), 0, 3);
        $titles = array_map(function ($x) {
            $code = 'PM-' . str_pad((string)((int)$x['id']), 3, '0', STR_PAD_LEFT);
            $t = trim((string)($x['title'] ?? 'งาน PM'));
            $a = trim((string)($x['asset_name'] ?? ''));
            return $code . ($a !== '' ? " ($a)" : '') . ': ' . $t;
        }, $samples);
        $more = (count($ov) + count($dt)) - count($samples);
        $msg = 'แจ้งเตือน PM — ' . implode(', ', $parts)
            . ". ตัวอย่าง: " . implode(' | ', $titles)
            . ($more > 0 ? " และอีก $more งาน" : '')
            . ' (ตรวจสอบที่เมนู PM/AM)';
        try {
            sendNotificationToUser($pdo, (int)$uid, $msg, 'warning', '/pm_am', null);
            $notifiedUsers++;
        } catch (Throwable $e) {
            $notifyErrors++;
            error_log('pm_reminders notify error user=' . $uid . ': ' . $e->getMessage());
        }
    }

    return [
        'ok' => true,
        'today' => $today,
        'scanned_cycles' => count($rows),
        'users_targeted' => count($byUser),
        'users_notified' => $notifiedUsers,
        'notify_errors' => $notifyErrors,
    ];
}
