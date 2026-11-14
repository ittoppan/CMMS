<?php
/**
 * pm_reminders.php — Best-effort reminders for PM cycles (due today / overdue)
 *
 * POST action=run (CSRF required): scan open PM cycles and notify assigned users.
 *   - overdue: status overdue or pending with due_date < today
 *   - due_today: pending with due_date == today
 *   - in_progress past due treated as overdue
 * Does not mutate PM status. Notification delivery depends on env/settings/channels;
 * deduplication is not schema-backed (call from cron/scheduler as needed).
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';

header('Content-Type: application/json; charset=utf-8');
session_start();
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $today = date('Y-m-d');

    if ($method === 'GET') {
        $sql = "SELECT
                    SUM(CASE WHEN status='overdue' OR (status='pending' AND due_date < :t1) OR (status='in_progress' AND due_date < :t2) THEN 1 ELSE 0 END) AS overdue_open,
                    SUM(CASE WHEN status='pending' AND due_date = :t3 THEN 1 ELSE 0 END) AS due_today,
                    SUM(CASE WHEN status='in_progress' AND (due_date IS NULL OR due_date >= :t4) THEN 1 ELSE 0 END) AS in_progress_open
                FROM pm_am
                WHERE status NOT IN ('completed','cancelled','skipped')";
        $st = $pdo->prepare($sql);
        $st->execute([':t1' => $today, ':t2' => $today, ':t3' => $today, ':t4' => $today]);
        $sum = $st->fetch(PDO::FETCH_ASSOC) ?: [];
        echo json_encode([
            'ok' => true,
            'today' => $today,
            'summary' => [
                'overdue_open' => (int)($sum['overdue_open'] ?? 0),
                'due_today' => (int)($sum['due_today'] ?? 0),
                'in_progress_open' => (int)($sum['in_progress_open'] ?? 0),
            ],
            'note' => 'POST action=run (CSRF) เพื่อส่งการแจ้งเตือน best-effort ให้ผู้รับผิดชอบ (พึ่ง env/settings/cron)',
        ], JSON_UNESCAPED_UNICODE);
        return;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        return;
    }

    $data = json_decode((string)file_get_contents('php://input'), true) ?: [];
    $action = (string)($data['action'] ?? ($_GET['action'] ?? 'run'));
    if ($action !== 'run') {
        http_response_code(400);
        echo json_encode(['error' => 'bad_action'], JSON_UNESCAPED_UNICODE);
        return;
    }

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
                         LIMIT 500");
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

    echo json_encode([
        'ok' => true,
        'today' => $today,
        'scanned_cycles' => count($rows),
        'users_targeted' => count($byUser),
        'users_notified' => $notifiedUsers,
        'notify_errors' => $notifyErrors,
        'channel_note' => 'การส่งจริงขึ้นกับ env/settings (LINE/Email/Telegram) และตาราง/ช่องทางที่ระบบรองรับ; endpoint นี้ best-effort และไม่มี dedupe ใน schema',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'internal_error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
