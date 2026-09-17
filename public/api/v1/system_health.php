<?php
/**
 * CMMS-TPT Production Health Dashboard (Phase 22 §3) — Admin เท่านั้น
 *
 * GET /api/v1/system_health.php
 *   -> สแนปชอตสถานะระบบจากข้อมูลจริงใน DB ณ เวลานั้น (ไม่มีการจำลองตัวเลข)
 *
 * กลุ่มข้อมูล:
 *   system      — เวลา server, uptime, SSL, request_id
 *   db          — ping + latency (ms)
 *   sage        — ผล probe จริง (Sage300Service::probeConnection) + sync ล่าสุด
 *   storage     — พื้นที่ว่าง disk + ขนาดไฟล์ php-error.log
 *   errors      — จำนวน error 30 วัน/by category + ล่าสุด (system_errors)
 *   sync        — ผล client_action_log 30 วัน (success/conflict) + งานค้าง
 *   cmms        — จำนวนงานซ่อม/MR/PM/ตรวจรอบ/เบิกอะไหล่ (สถานะจริง)
 *   spare       — สถานะการตัดสต็อก Sage (pending/partial/completed/cancelled)
 *   notifications — ยอดส่ง 30 วัน แยกช่องทาง + ความสำเร็จ + ล่าสุดที่ล้มเหลว
 *   audit       — audit_logs 30 วัน + login audit ล่าสุด
 *   data_quality— เช็คคุณภาพข้อมูลจริง (ระบบยังไม่ผลิตจริง → แจ้งด้วย)
 *   timing_ms   — เวลารวม endpoint + ต่อย่อยต่อกลุ่ม
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
require_once __DIR__ . '/../../../src/helpers/errors.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';

header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}
requireLogin(getDb(), true); // admin เท่านั้น

$pdo = getDb();
$t0 = microtime(true);
$requestId = cmms_request_id();

/** helper: กันปิด parenthesis ตอน interpolation + ใช้ย่อ ๆ ใน SQL COUNT */
function one2(PDO $pdo, string $sql): float {
    return (float)$pdo->query($sql)->fetchColumn();
}

/** helper: จับเวลาแต่ละกลุ่ม + กัน query ล้มไม่ให้พังทั้ง endpoint */
function health_group(string $label, callable $fn): array {
    $s = microtime(true);
    try {
        $data = $fn();
        return ['ok' => true, 'ms' => round((microtime(true) - $s) * 1000, 1), 'data' => $data];
    } catch (Throwable $e) {
        error_log("[system_health] $label failed: " . $e->getMessage());
        return ['ok' => false, 'ms' => round((microtime(true) - $s) * 1000, 1), 'error' => $e->getMessage()];
    }
}

// ── DB ──
$dbGroup = health_group('db', function () use ($pdo) {
    $s = microtime(true);
    $pdo->query('SELECT 1');
    return ['ping_ms' => round((microtime(true) - $s) * 1000, 1)];
});

// ── Sage ──
$sageGroup = health_group('sage', function () use ($pdo) {
    try {
        $probe = Sage300Service::probeConnection();
    } catch (Throwable $e) {
        $probe = ['connected' => false, 'detail' => 'probe_exception'];
    }
    $last = $pdo->query(
        "SELECT sync_type, status, created_at FROM sage_sync_log ORDER BY created_at DESC LIMIT 1"
    )->fetch(PDO::FETCH_ASSOC);
    $lastOk = $pdo->query(
        "SELECT created_at FROM sage_sync_log WHERE status = 'SUCCESS' ORDER BY created_at DESC LIMIT 1"
    )->fetchColumn();
    return [
        'probe' => $probe,
        'last_sync' => $last ?: null,
        'last_success_at' => $lastOk ?: null,
    ];
});

// ── Storage ──
$storageGroup = health_group('storage', function () use ($pdo) {
    $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (__DIR__ . '/../../..');
    $free = @disk_free_space($docRoot);
    $total = @disk_total_space($docRoot);
    $logFile = dirname(__DIR__, 3) . '/logs/php-error.log';
    $logBytes = null; $logMtime = null;
    if (is_file($logFile)) {
        $logBytes = filesize($logFile);
        $logMtime = date('Y-m-d H:i:s', filemtime($logFile));
    }
    return [
        'disk_free_bytes' => $free === false ? null : (int)$free,
        'disk_total_bytes' => $total === false ? null : (int)$total,
        'disk_free_percent' => ($total !== false && $total > 0 && $free !== false) ? round(($free / $total) * 100, 1) : null,
        'php_error_log' => ['path' => 'logs/php-error.log', 'bytes' => $logBytes, 'mtime' => $logMtime],
    ];
});

// ── Errors (system_errors เริ่มเก็บจาก Phase 22 ขึ้นไป) ──
$errorsGroup = health_group('errors', function () use ($pdo) {
    $byCategory = $pdo->query(
        "SELECT category, COUNT(*) c FROM system_errors WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY category ORDER BY c DESC"
    )->fetchAll(PDO::FETCH_ASSOC);
    $recent = $pdo->query(
        "SELECT id, created_at, module, endpoint, method, user_name, category, error_code, user_message, request_id
         FROM system_errors ORDER BY id DESC LIMIT 10"
    )->fetchAll(PDO::FETCH_ASSOC);
    return [
        'note' => 'system_errors collects from Phase 22 deployment onward; earlier exceptions exist only in logs/php-error.log',
        'by_category_30d' => array_map(fn($r) => ['category' => $r['category'], 'count' => (int)$r['c']], $byCategory),
        'recent' => $recent,
    ];
});

// ── Sync (client_action_log) ──
$syncGroup = health_group('sync', function () use ($pdo) {
    $byOutcome = $pdo->query(
        "SELECT outcome, COUNT(*) c FROM client_action_log
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY outcome"
    )->fetchAll(PDO::FETCH_ASSOC);
    $stuck = $pdo->query(
        "SELECT client_action_id, endpoint, method, outcome, created_at FROM client_action_log
         WHERE finished_at IS NULL
           AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at ASC LIMIT 10"
    )->fetchAll(PDO::FETCH_ASSOC);
    return [
        'by_outcome_30d' => $byOutcome,
        'possibly_stuck_24h' => $stuck, // เริ่ม log ยังไม่จบเกิน 24 ชม.
    ];
});

// ── CMMS งานซ่อม/PM/ตรวจ ──
$cmmsGroup = health_group('cmms', function () use ($pdo) {
    $active = "status IN ('open','assigned','in_progress','pending_approval')";
    $openRepair = (int)one2($pdo, "SELECT COUNT(*) FROM repair WHERE $active");
    $staleOpen = (int)one2($pdo, "SELECT COUNT(*) FROM repair WHERE $active AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
    $oldestOpen = $pdo->query("SELECT work_order_no, created_at FROM repair WHERE $active ORDER BY created_at ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    return [
        'repair' => [
            'open' => $openRepair,
            'open_stale_gt_30d' => $staleOpen,
            'oldest_open' => $oldestOpen,
            'completed_no_technician' => (int)one2($pdo, "SELECT COUNT(*) FROM repair WHERE status = 'completed' AND assigned_to IS NULL"),
        ],
        'maintenance_requests' => $pdo->query("SELECT status, COUNT(*) c FROM maintenance_requests GROUP BY status")->fetchAll(PDO::FETCH_ASSOC),
        'pm' => [
            'by_status' => $pdo->query("SELECT status, COUNT(*) c FROM pm_am GROUP BY status")->fetchAll(PDO::FETCH_ASSOC),
            'overdue' => (int)one2($pdo, "SELECT COUNT(*) FROM pm_am WHERE status IN ('pending','overdue') AND due_date < CURDATE()"),
            'active_plans' => (int)one2($pdo, "SELECT COUNT(*) FROM pm_am_plans WHERE status = 'active' AND is_active = 1"),
        ],
        'inspections' => [
            'total_rows' => (int)one2($pdo, "SELECT COUNT(*) FROM inspection_results"),
            'failed' => (int)one2($pdo, "SELECT COUNT(*) FROM inspection_results WHERE status = 'fail'"),
        ],
    ];
});

// ── Spare / Sage stock flow ──
$spareGroup = health_group('spare', function () use ($pdo) {
    return [
        'issue_requests' => $pdo->query("SELECT status, COUNT(*) c FROM spare_issue_requests GROUP BY status")->fetchAll(PDO::FETCH_ASSOC),
        'sage_shipments' => $pdo->query("SELECT status, COUNT(*) c FROM spare_issue_sage_shipments GROUP BY status")->fetchAll(PDO::FETCH_ASSOC),
    ];
});

// ── Notifications 30 วัน ──
$notifGroup = health_group('notifications', function () use ($pdo) {
    $byChannel = $pdo->query(
        "SELECT channel, status, COUNT(*) c FROM notification_logs
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY channel, status ORDER BY channel, c DESC"
    )->fetchAll(PDO::FETCH_ASSOC);
    $lastFailed = $pdo->query(
        "SELECT id, channel, status, recipient, raw_response, created_at FROM notification_logs
         WHERE status <> 'SENT' AND channel = 'LINE' ORDER BY id DESC LIMIT 5"
    )->fetchAll(PDO::FETCH_ASSOC);
    return ['by_channel_status_30d' => $byChannel, 'recent_line_failures' => $lastFailed];
});

// ── Audit ──
$auditGroup = health_group('audit', function () use ($pdo) {
    $sev = $pdo->query(
        "SELECT severity, COUNT(*) c FROM audit_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY severity"
    )->fetchAll(PDO::FETCH_ASSOC);
    $total = (int)one2($pdo, "SELECT COUNT(*) FROM audit_logs");
    $loginLast = $pdo->query(
        "SELECT username, ip_address, status, created_at FROM login_audit_log ORDER BY id DESC LIMIT 5"
    )->fetchAll(PDO::FETCH_ASSOC);
    return ['total' => $total, 'by_severity_30d' => $sev, 'recent_logins' => $loginLast];
});

// ── คุณภาพข้อมูล (ตรวจจริง ไม่ใช่ตัวเลขยัด) ──
$dqGroup = health_group('data_quality', function () use ($pdo) {
    $badDates = (int)one2($pdo, "SELECT COUNT(*) FROM repair WHERE completed_at IS NOT NULL AND actual_start_at IS NOT NULL AND completed_at < actual_start_at");
    $closedNoActual = (int)one2($pdo, "SELECT COUNT(*) FROM repair WHERE status IN ('closed','resolved') AND actual_start_at IS NULL");
    $orphanAssignees = (int)one2($pdo,
        "SELECT COUNT(*) FROM work_assignees wa
         LEFT JOIN users u ON u.id = wa.user_id
         WHERE u.id IS NULL");
    return [
        'note' => 'ระบบยังไม่ได้ใช้งานจริงในสายการผลิต — ข้อมูลที่มีคือ seed/setup/test ให้วิเคราะห์แบบระวัง',
        'repair_completed_before_start' => $badDates,
        'repair_closed_no_actual_start' => $closedNoActual,
        'work_assignees_orphan_users' => $orphanAssignees,
    ];
});

$response = [
    'status' => 'degraded',
    'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
    'server_time' => date('Y-m-d H:i:s'),
    'request_id' => $requestId,
    'generated_from' => 'phase22_production_monitoring',
    'warnings' => [],
    'system' => [
        'ssl' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'php' => PHP_VERSION,
        'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? null,
        'web_ok' => true,
    ],
    'db' => $dbGroup,
    'sage' => $sageGroup,
    'storage' => $storageGroup,
    'errors' => $errorsGroup,
    'sync' => $syncGroup,
    'cmms' => $cmmsGroup,
    'spare' => $spareGroup,
    'notifications' => $notifGroup,
    'audit' => $auditGroup,
    'data_quality' => $dqGroup,
    'timing_ms' => round((microtime(true) - $t0) * 1000, 1),
];

// status โดยรวม — พิจารณาจากกลุ่มที่ทำงานได้ (DB, Web)
$dbOk = ($dbGroup['ok'] ?? false) && !empty($dbGroup['data']['ping_ms']);
$response['status'] = $dbOk ? 'ok' : 'degraded';

if (empty($response['system']['ssl'])) {
    // HTTPS ยังไม่เปิด (P0 จาก Phase 21) — แจ้งให้เห็นบน dashboard
    $response['warnings'][] = 'HTTPS ยังไม่เปิดใช้งาน (Phase 21 blocker B-1 ยังค้าง)';
}

echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

if (!empty($dbOk)) {
    // บันทึกการเข้าดู (audit) — เบา ๆ เฉพาะ admin
    audit_log($pdo, 'SYSTEM_HEALTH_VIEW', 'system', '', 'Admin เปิดดู Production Health Dashboard', null, null, 'info');
}