<?php
/**
 * pm_reminders.php — Best-effort reminders for PM cycles (due today / overdue)
 *
 * GET: summary counts (no mutation)
 * POST action=run (CSRF required, login required): scan open PM cycles and notify assigned users.
 *
 * For cron/Task Scheduler prefer scripts/pm_reminders.php (CLI) which uses the same helper.
 * Dedupe: schema-backed via pm_am.last_notified_at + cooldown (settings pm_reminder_cooldown_hours).
 * A cycle is only described in a message after this run claimed it; delivery still depends on env/settings/channels.
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';
require_once __DIR__ . '/../../../src/helpers/pm_reminders.php';

header('Content-Type: application/json; charset=utf-8');
session_start();
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    requireLogin($pdo);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $out = pm_reminders_summary($pdo);
        echo json_encode([
            'ok' => true,
            'today' => $out['today'],
            'summary' => $out['summary'],
            'note' => 'POST action=run (CSRF) เพื่อส่งการแจ้งเตือน best-effort ให้ผู้รับผิดชอบ หรือใช้ scripts/pm_reminders.php ผ่าน cron (แนะนำ) — มี dedupe ต่อรอบ PM (pm_am.last_notified_at + cooldown)',
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

    $limit = isset($data['limit']) ? (int)$data['limit'] : 500;
    $res = pm_reminders_run($pdo, null, $limit);
    $res['channel_note'] = 'การส่งจริงขึ้นกับ env/settings (LINE/Email/Telegram) และตาราง/ช่องทางที่ระบบรองรับ; dedupe ต่อรอบ PM ด้วย last_notified_at + cooldown (skipped_duplicate/notified_cycles ในผลลัพธ์)';
    echo json_encode($res, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'internal_error', 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
