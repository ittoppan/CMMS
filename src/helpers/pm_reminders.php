<?php
/**
 * PM reminders helper — scan open PM cycles (due today / overdue) and notify assignees (best-effort).
 *
 * Dedupe (schema-backed): `pm_am.last_notified_at` + cooldown window
 * (settings key `pm_reminder_cooldown_hours`, default 20 hours).
 *
 * Protocol: claim (atomic UPDATE) → build the message from the claimed rows only → send → rollback on send failure.
 * Schema required (deploy migration BEFORE this code):
 *   database/migration_20261118_pm_reminders_dedupe_proposal.sql
 * Design: docs/pm-reminders-dedupe-design.md
 */

require_once __DIR__ . '/notification.php';

/**
 * Cooldown window in hours (settings `pm_reminder_cooldown_hours`, default 20, clamped 1..168).
 * 20h < 24h so a once-a-day cron still passes every day even with clock drift.
 */
function pm_reminders_cooldown_hours(): int {
    $raw = trim((string)getSettingValue('pm_reminder_cooldown_hours', '20'));
    $hours = (int)$raw;
    if ($hours <= 0) $hours = 20;
    return max(1, min(168, $hours));
}

/**
 * Dedupe columns present? (cached per process) — lets the endpoint keep working (dedupe=false)
 * until the migration is applied, instead of failing the whole reminder run.
 */
function pm_reminders_dedupe_supported(PDO $pdo): bool {
    static $cache = null;
    if ($cache !== null) return $cache;
    try {
        $st = $pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'pm_am'
                              AND COLUMN_NAME IN ('last_notified_at','notify_count')");
        $cache = ((int)$st->fetchColumn() === 2);
    } catch (Throwable $e) {
        $cache = false;
    }
    return $cache;
}

/** Dedupe cutoff timestamp — computed in PHP (never with SQL NOW()/INTERVAL) to avoid timezone drift. */
function pm_reminders_cutoff(int $hours, ?int $nowTs = null): string {
    return date('Y-m-d H:i:s', ($nowTs ?? time()) - ($hours * 3600));
}

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
 * Candidate cycles (no dedupe filter — the claim UPDATE is the single source of truth).
 * Ordering puts never-notified cycles first so `limit` cannot starve new work.
 * @return array<int,array<string,mixed>>
 */
function pm_reminders_scan(PDO $pdo, string $today, int $limit): array {
    $withDedupe = pm_reminders_dedupe_supported($pdo);
    // pm_am ไม่มีคอลัมน์ asset_name — ดึงชื่อเครื่องจักรจาก asset_registry (เหมือน public/api/v1/pm_am.php)
    $cols = $withDedupe ? 'p.last_notified_at' : 'NULL AS last_notified_at';
    $sql = "SELECT p.id, p.title, p.asset_id, a.name AS asset_name, p.due_date, p.assigned_to, p.status, " . $cols . "
              FROM pm_am p
              LEFT JOIN asset_registry a ON a.id = p.asset_id
             WHERE p.status NOT IN ('completed','cancelled','skipped')
               AND p.assigned_to IS NOT NULL AND p.assigned_to > 0
               AND (
                   p.status='overdue'
                   OR (p.status='pending' AND p.due_date <= ?)
                   OR (p.status='in_progress' AND p.due_date < ?)
               )
             " . ($withDedupe
                    ? 'ORDER BY (p.last_notified_at IS NOT NULL) ASC, p.last_notified_at ASC, p.due_date ASC, p.id ASC'
                    : 'ORDER BY p.due_date ASC, p.id ASC') . "
             LIMIT " . (int)max(1, min(2000, $limit));
    try {
        $st = $pdo->prepare($sql);
        $st->execute([$today, $today]);
        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        // 42S22 / 1054 = unknown column → schema ยังไม่ migrate (เฉพาะคอลัมน์ dedupe)
        if (strpos($e->getMessage(), 'last_notified_at') !== false) {
            throw new RuntimeException(
                'pm_reminders: schema missing pm_am.last_notified_at — run '
                . 'database/migration_20261118_pm_reminders_dedupe_proposal.sql before deploying this code',
                0,
                $e
            );
        }
        throw $e;
    }
}

/** @return array<int,array<int,array<string,mixed>>> candidate cycles grouped by assignee (id => rows) */
function pm_reminders_group(array $rows): array {
    $byUser = [];
    foreach ($rows as $r) {
        $uid = (int)($r['assigned_to'] ?? 0);
        if ($uid <= 0) continue;
        $byUser[$uid][] = $r;
    }
    return $byUser;
}

/** Row is outside the cooldown window (or never notified) → eligible for a new reminder. */
function pm_reminders_row_is_claimable(array $row, string $cutoff): bool {
    $last = $row['last_notified_at'] ?? null;
    if ($last === null || $last === '') return true;
    return (string)$last < $cutoff;
}

/**
 * Atomic claim for one assignee. Returns ONLY the rows this process actually claimed.
 * @param int[] $ids
 * @return array<int,array<string,mixed>>
 */
function pm_reminders_claim(PDO $pdo, int $userId, array $ids, string $marker, string $cutoff): array {
    $ids = array_values(array_filter(array_map('intval', $ids), function ($v) { return $v > 0; }));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));

    $sql = "UPDATE pm_am
               SET last_notified_at = ?, notify_count = notify_count + 1
             WHERE assigned_to = ?
               AND id IN ($ph)
               AND (last_notified_at IS NULL OR last_notified_at < ?)";
    $st = $pdo->prepare($sql);
    $st->execute(array_merge([$marker, $userId], $ids, [$cutoff]));
    if ($st->rowCount() < 1) return [];

    // Read back only our own claim marker — this is the exact set the message may describe.
    $sel = $pdo->prepare("SELECT p.id, p.title, p.asset_id, a.name AS asset_name, p.due_date, p.assigned_to, p.status, p.last_notified_at
                            FROM pm_am p
                            LEFT JOIN asset_registry a ON a.id = p.asset_id
                           WHERE p.assigned_to = ? AND p.last_notified_at = ? AND p.id IN ($ph)
                        ORDER BY p.due_date ASC, p.id ASC");
    $sel->execute(array_merge([$userId, $marker], $ids));
    return $sel->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

/**
 * Undo a claim whose notification could not be sent/handled, so the next run retries.
 * Guarded by `last_notified_at = $marker` so it never overwrites someone else's claim.
 * @param array<int,array<string,mixed>> $claimed rows returned by pm_reminders_claim()
 * @param array<int,mixed> $previousOld id => last_notified_at before the claim
 */
function pm_reminders_release(PDO $pdo, array $claimed, array $previousOld, string $marker): int {
    $st = $pdo->prepare("UPDATE pm_am
                            SET last_notified_at = ?, notify_count = GREATEST(notify_count - 1, 0)
                          WHERE id = ? AND last_notified_at = ?");
    $released = 0;
    foreach ($claimed as $row) {
        $id = (int)($row['id'] ?? 0);
        if ($id <= 0) continue;
        $old = $previousOld[$id] ?? null;
        $st->bindValue(1, ($old === null || $old === '') ? null : (string)$old, ($old === null || $old === '') ? PDO::PARAM_NULL : PDO::PARAM_STR);
        $st->bindValue(2, $id, PDO::PARAM_INT);
        $st->bindValue(3, $marker, PDO::PARAM_STR);
        try {
            $st->execute();
            $released += max(0, $st->rowCount());
        } catch (Throwable $e) {
            error_log('pm_reminders release error id=' . $id . ': ' . $e->getMessage());
        }
    }
    return $released;
}

/**
 * Build the reminder text from the given rows ONLY (call this with the claimed set).
 * @return array{message:string,kind:string,overdue:int,due_today:int}|null null when nothing to say
 */
function pm_reminders_message(array $rows, string $today): ?array {
    $ov = [];
    $dt = [];
    foreach ($rows as $r) {
        $due = trim((string)($r['due_date'] ?? ''));
        if ($due === '') continue;
        $isOverdue = ($due < $today) || (string)($r['status'] ?? '') === 'overdue';
        if ($isOverdue) { $ov[] = $r; continue; }
        if ($due === $today) $dt[] = $r;
    }
    if (!$ov && !$dt) return null;

    $parts = [];
    if (count($ov)) $parts[] = 'เกินกำหนด ' . count($ov) . ' งาน';
    if (count($dt)) $parts[] = 'ถึงกำหนดวันนี้ ' . count($dt) . ' งาน';

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

    return [
        'message' => $msg,
        'kind' => count($ov) ? 'overdue' : 'due_today',
        'overdue' => count($ov),
        'due_today' => count($dt),
    ];
}

/**
 * Send reminders with claim-based dedupe.
 * @return array{ok:bool,today:string,scanned_cycles:int,users_targeted:int,users_notified:int,skipped_duplicate:int,notified_cycles:int,cooldown_hours:int,notify_errors:int}
 */
function pm_reminders_run(PDO $pdo, ?string $today = null, int $limit = 500): array {
    $today = $today ?: date('Y-m-d');
    $limit = max(1, min(2000, $limit));
    $dedupe = pm_reminders_dedupe_supported($pdo);
    $hours = pm_reminders_cooldown_hours();
    $cutoff = pm_reminders_cutoff($hours);
    $marker = date('Y-m-d H:i:s');   // claim marker = max 1 claim per user per second

    $rows = pm_reminders_scan($pdo, $today, $limit);
    $byUser = pm_reminders_group($rows);

    $notifiedUsers = 0;
    $notifyErrors = 0;
    $skippedDuplicate = 0;
    $notifiedCycles = 0;

    foreach ($byUser as $uid => $items) {
        $previousOld = [];
        $ids = [];
        foreach ($items as $r) {
            $ids[] = (int)$r['id'];
            $previousOld[(int)$r['id']] = $r['last_notified_at'] ?? null;
        }

        if ($dedupe) {
            try {
                $claimed = pm_reminders_claim($pdo, (int)$uid, $ids, $marker, $cutoff);
            } catch (Throwable $e) {
                $notifyErrors++;
                error_log('pm_reminders claim error user=' . $uid . ': ' . $e->getMessage());
                continue;
            }
            if (!$claimed) {
                // ทุกรอบของผู้ใช้คนนี้อยู่ใน cooldown (หรือ process อื่น claim ไปแล้ว)
                $skippedDuplicate++;
                continue;
            }
        } else {
            // schema ยังไม่ migrate: ทำงานแบบเดิม (ไม่มี dedupe) เพื่อไม่ให้ endpoint ล่ม
            $claimed = $items;
        }

        // ข้อความสร้างจากรอบที่ claim สำเร็จเท่านั้น
        $built = pm_reminders_message($claimed, $today);
        if ($built === null) {
            if ($dedupe) pm_reminders_release($pdo, $claimed, $previousOld, $marker);
            $skippedDuplicate++;
            continue;
        }

        try {
            // sendNotificationToUser($userId, $title, $message, $targetUrl) — ช่องทางจริงขึ้นกับผู้ใช้/settings
            $title = ((int)$built['overdue'] > 0) ? 'แจ้งเตือน PM — เกินกำหนด' : 'แจ้งเตือน PM — ถึงกำหนดวันนี้';
            $target = rtrim((string)publicBaseUrl(), '/') . '/pages/pm_am/';
            $delivered = sendNotificationToUser((int)$uid, $title, $built['message'], $target);
            if ($delivered === false) {
                // ผู้ใช้ไม่มีในระบบ/ถูกปิดใช้งาน → ถือว่าส่งไม่สำเร็จ ให้รอบถัดไปลองใหม่
                throw new RuntimeException('user not found or inactive (userId=' . (int)$uid . ')');
            }
            $notifiedUsers++;
            $notifiedCycles += count($claimed);
        } catch (Throwable $e) {
            // ส่งไม่สำเร็จ → คืนสิทธิ์ให้รอบถัดไปลองใหม่ (เมื่อมี dedupe)
            if ($dedupe) pm_reminders_release($pdo, $claimed, $previousOld, $marker);
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
        'skipped_duplicate' => $skippedDuplicate,
        'notified_cycles' => $notifiedCycles,
        'cooldown_hours' => $hours,
        'dedupe' => $dedupe,
        'notify_errors' => $notifyErrors,
    ];
}

/**
 * Dry-run preview: same SELECT and same cooldown logic as pm_reminders_run(), but writes nothing.
 * @return array{ok:bool,dry_run:bool,today:string,scanned_cycles:int,users_targeted:int,users_would_notify:int,claimable_cycles:int,skipped_duplicate:int,cooldown_hours:int,cutoff:string}
 */
function pm_reminders_plan(PDO $pdo, ?string $today = null, int $limit = 500): array {
    $today = $today ?: date('Y-m-d');
    $limit = max(1, min(2000, $limit));
    $dedupe = pm_reminders_dedupe_supported($pdo);
    $hours = pm_reminders_cooldown_hours();
    $cutoff = pm_reminders_cutoff($hours);

    $rows = pm_reminders_scan($pdo, $today, $limit);
    $byUser = pm_reminders_group($rows);

    $wouldNotify = 0;
    $claimable = 0;
    $skippedDuplicate = 0;
    foreach ($byUser as $items) {
        $ok = 0;
        foreach ($items as $r) {
            if (!$dedupe || pm_reminders_row_is_claimable($r, $cutoff)) $ok++;
        }
        if ($ok > 0) {
            $wouldNotify++;
            $claimable += $ok;
        } else {
            $skippedDuplicate++;
        }
    }

    return [
        'ok' => true,
        'dry_run' => true,
        'today' => $today,
        'scanned_cycles' => count($rows),
        'users_targeted' => count($byUser),
        'users_would_notify' => $wouldNotify,
        'claimable_cycles' => $claimable,
        'skipped_duplicate' => $skippedDuplicate,
        'cooldown_hours' => $hours,
        'cutoff' => $cutoff,
        'dedupe' => $dedupe,
    ];
}
