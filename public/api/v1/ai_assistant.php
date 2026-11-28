<?php
/**
 * ai_assistant.php - Phase 40 AI Assistant API
 *
 * Transport + persistence for the in-app AI assistant. All policy and data
 * access happen here; the frontend is only a view.
 *
 * Actions (via ?action= or JSON body):
 *   scopes            GET  - scopes available to this user
 *   sessions          GET  - chat sessions owned by this user
 *   session_create    POST - { title?, scope? }
 *   session_delete    POST - { session_id }
 *   messages          GET  - ?session_id=
 *   send              POST - { session_id?, scope?, message }  (SSE stream)
 *   technician_summary GET/POST - ?technician_id= (defaults to current user)
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/api.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/services/AICopilotService.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('X-Content-Type-Options: nosniff');

$pdo = getDb();
$user = requireLogin($pdo);
$userId = (int)$user['id'];
$roleId = (int)$user['role_id'];

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

$rawBody = '';
$ct = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($ct, 'application/json') !== false) {
    $rawBody = (string)file_get_contents('php://input');
}
$jsonInput = null;
if ($rawBody !== '') {
    $jsonInput = json_decode($rawBody, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid json']);
        exit;
    }
}

$action = strtolower(trim($_GET['action'] ?? ($_POST['action'] ?? ($jsonInput['action'] ?? 'scopes'))));
$get = static fn(string $k, $d = null) => ($jsonInput[$k] ?? ($_POST[$k] ?? ($_GET[$k] ?? $d)));
$getStr = static fn(string $k, string $d = '') => trim((string)$get($k, $d));
$getInt = static fn(string $k, int $d = 0) => (int)$get($k, $d);

function ai_fail(string $msg, int $status = 400): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function ai_ok(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ai_scope_allowed(PDO $pdo, int $roleId, string $scope): bool {
    if ($scope === 'general') return true;
    $map = [
        'repair' => ['repair', 'view'],
        'workload' => ['workload', 'view'],
        'knowledge' => ['knowledge', 'search'],
        'technician' => ['repair', 'view'],
        'spare_parts' => ['spare_parts', 'view'],
    ];
    if (!isset($map[$scope])) return false;
    [$module, $action] = $map[$scope];
    if ($roleId === 1) return true;
    return canPerm($pdo, $module, $action);
}

function ai_sessions(PDO $pdo, int $userId): array {
    $st = $pdo->prepare('SELECT id, title, scope, created_at, updated_at FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC, id DESC');
    $st->execute([$userId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ai_messages(PDO $pdo, int $sessionId): array {
    $st = $pdo->prepare('SELECT id, role, content, created_at FROM ai_chat_messages WHERE session_id = ? ORDER BY id ASC');
    $st->execute([$sessionId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

function ai_technician_summary(PDO $pdo, int $technicianId): array {
    $counts = [];
    $st = $pdo->prepare('SELECT status, COUNT(*) AS c FROM repair WHERE assigned_to = ? GROUP BY status');
    $st->execute([$technicianId]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $counts[$row['status']] = (int)$row['c'];
    }
    $overdue = 0;
    try {
        $st = $pdo->prepare("SELECT COUNT(*) FROM repair WHERE assigned_to = ? AND sla_due_at IS NOT NULL AND sla_due_at < NOW() AND status NOT IN ('completed','cancelled','closed')");
        $st->execute([$technicianId]);
        $overdue = (int)$st->fetchColumn();
    } catch (Throwable $e) {
        $overdue = 0;
    }
    $recent = [];
    try {
        $st = $pdo->prepare('SELECT id, work_order_no, title, status, priority, created_at FROM repair WHERE assigned_to = ? ORDER BY id DESC LIMIT 5');
        $st->execute([$technicianId]);
        $recent = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $recent = [];
    }
    $open = 0;
    foreach ($counts as $s => $c) {
        if (!in_array($s, ['completed', 'cancelled', 'closed'], true)) $open += $c;
    }
    return [
        'technician_id' => $technicianId,
        'counts' => $counts,
        'open' => $open,
        'overdue' => $overdue,
        'recent' => $recent,
    ];
}

function ai_build_reply(PDO $pdo, int $userId, int $roleId, string $scope, string $message, int $technicianId): string {
    $m = mb_strtolower($message, 'UTF-8');
    $lines = [];

    // Symptom diagnosis via the existing copilot service.
    if (str_contains($m, 'อาการ') || str_contains($m, 'วินิจฉัย') || str_contains($m, 'ซ่อม') || str_contains($m, 'มอเตอร์') || str_contains($m, 'ปั๊ม')) {
        $diag = AICopilotService::diagnoseSymptom($message);
        $lines[] = 'ผลวิเคราะห์อาการ: ' . ($diag['symptom'] ?? $message);
        $lines[] = '';
        $lines[] = 'สาเหตุที่เป็นไปได้:';
        foreach ($diag['causes'] ?? [] as $c) $lines[] = '- ' . $c;
        $lines[] = '';
        $lines[] = 'ขั้นตอนตรวจสอบ:';
        foreach ($diag['steps'] ?? [] as $s) $lines[] = '- ' . $s;
        $lines[] = '';
        $lines[] = 'อะไหล่ที่อาจต้องใช้:';
        foreach ($diag['spares'] ?? [] as $sp) {
            $lines[] = '- ' . ($sp['code'] ?? '') . ' ' . ($sp['name'] ?? '') . ' (' . ($sp['qty'] ?? '') . ')';
        }
    }

    // Technician summary intent.
    if (str_contains($m, 'สรุป') || str_contains($m, 'งานค้าง') || str_contains($m, 'technician') || $scope === 'technician') {
        $sum = ai_technician_summary($pdo, $technicianId);
        $lines[] = '';
        $lines[] = 'สรุปงานของช่าง #' . $technicianId . ':';
        $lines[] = '- งานที่ยังไม่เสร็จ: ' . $sum['open'];
        $lines[] = '- งานเกิน SLA: ' . $sum['overdue'];
        foreach ($sum['counts'] as $status => $c) {
            $lines[] = "- $status: $c";
        }
        if (!empty($sum['recent'])) {
            $lines[] = '';
            $lines[] = 'งานล่าสุด:';
            foreach ($sum['recent'] as $r) {
                $lines[] = '- #' . $r['id'] . ' ' . ($r['work_order_no'] ?? '') . ' ' . ($r['title'] ?? '') . ' [' . ($r['status'] ?? '') . ']';
            }
        }
    }

    // Scope-specific context.
    if ($scope === 'workload') {
        try {
            $st = $pdo->query("SELECT COUNT(*) AS c FROM repair WHERE status NOT IN ('completed','cancelled','closed')");
            $openAll = (int)$st->fetchColumn();
            $lines[] = '';
            $lines[] = 'ภาพรวมระบบ: งานซ่อมที่ยังไม่ปิด ' . $openAll . ' รายการ';
        } catch (Throwable $e) {
            // ignore
        }
    }

    if ($scope === 'knowledge') {
        $lines[] = '';
        $lines[] = 'สำหรับค้นหาความรู้/บทความ ให้เปิดหน้า Knowledge Search เพื่อดูผลลัพธ์แบบละเอียด';
    }

    if (empty($lines)) {
        $lines[] = 'สวัสดีครับ ผมคือ AI Assistant สำหรับงานซ่อมบำรุง';
        $lines[] = 'คุณสามารถถามอาการเครื่องจักร, ขอสรุปงานของช่าง, หรือเลือก scope ด้านบนเพื่อจำกัดข้อมูลได้';
    }

    return implode("\n", $lines);
}

function ai_stream(string $text): void {
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    ob_implicit_flush(true);

    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-transform');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');

    $chunks = preg_split('/(\s+)/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE);
    if ($chunks === false) $chunks = [$text];
    $buffer = '';
    foreach ($chunks as $chunk) {
        $buffer .= $chunk;
        if (mb_strlen($buffer, 'UTF-8') >= 24) {
            $payload = json_encode(['delta' => $buffer], JSON_UNESCAPED_UNICODE);
            echo "data: " . $payload . "\n\n";
            if (function_exists('flush')) flush();
            $buffer = '';
            usleep(30000);
        }
    }
    if ($buffer !== '') {
        $payload = json_encode(['delta' => $buffer], JSON_UNESCAPED_UNICODE);
        echo "data: " . $payload . "\n\n";
        if (function_exists('flush')) flush();
    }
    echo "data: " . json_encode(['done' => true], JSON_UNESCAPED_UNICODE) . "\n\n";
    if (function_exists('flush')) flush();
}

// ---------------- actions ----------------

if ($action === 'scopes') {
    $scopes = [];
    foreach (['general', 'repair', 'workload', 'knowledge', 'technician', 'spare_parts'] as $s) {
        $scopes[] = ['key' => $s, 'allowed' => ai_scope_allowed($pdo, $roleId, $s)];
    }
    ai_ok(['scopes' => $scopes]);
}

if ($action === 'sessions') {
    ai_ok(['sessions' => ai_sessions($pdo, $userId)]);
}

if ($action === 'session_create') {
    if ($method !== 'POST') ai_fail('method not allowed', 405);
    enforceCsrf();
    $title = $getStr('title', 'New chat');
    $scope = $getStr('scope', 'general');
    if (!ai_scope_allowed($pdo, $roleId, $scope)) ai_fail('scope not allowed', 403);
    $st = $pdo->prepare('INSERT INTO ai_chat_sessions (user_id, title, scope) VALUES (?,?,?)');
    $st->execute([$userId, $title, $scope]);
    $id = (int)$pdo->lastInsertId();
    ai_ok(['session' => ['id' => $id, 'title' => $title, 'scope' => $scope]]);
}

if ($action === 'session_delete') {
    if ($method !== 'POST') ai_fail('method not allowed', 405);
    enforceCsrf();
    $sid = $getInt('session_id');
    $st = $pdo->prepare('DELETE FROM ai_chat_sessions WHERE id = ? AND user_id = ?');
    $st->execute([$sid, $userId]);
    $deleted = $st->rowCount() > 0;
    if ($deleted) {
        $pdo->prepare('DELETE FROM ai_chat_messages WHERE session_id = ?')->execute([$sid]);
    }
    ai_ok(['deleted' => $deleted]);
}

if ($action === 'messages') {
    $sid = $getInt('session_id');
    $st = $pdo->prepare('SELECT id FROM ai_chat_sessions WHERE id = ? AND user_id = ?');
    $st->execute([$sid, $userId]);
    if (!$st->fetch()) ai_fail('session not found', 404);
    ai_ok(['messages' => ai_messages($pdo, $sid)]);
}

if ($action === 'technician_summary') {
    $tid = $getInt('technician_id', $userId);
    if ($tid <= 0) $tid = $userId;
    // Allow reading own summary; others require repair view.
    if ($tid !== $userId && !ai_scope_allowed($pdo, $roleId, 'repair')) {
        ai_fail('not allowed', 403);
    }
    ai_ok(['summary' => ai_technician_summary($pdo, $tid)]);
}

if ($action === 'send') {
    if ($method !== 'POST') ai_fail('method not allowed', 405);
    enforceCsrf();

    $message = trim($getStr('message'));
    if ($message === '') ai_fail('message required', 422);

    $scope = $getStr('scope', 'general');
    if (!ai_scope_allowed($pdo, $roleId, $scope)) ai_fail('scope not allowed', 403);

    $sid = $getInt('session_id');
    if ($sid <= 0) {
        $title = mb_substr($message, 0, 60, 'UTF-8');
        $st = $pdo->prepare('INSERT INTO ai_chat_sessions (user_id, title, scope) VALUES (?,?,?)');
        $st->execute([$userId, $title, $scope]);
        $sid = (int)$pdo->lastInsertId();
    } else {
        $st = $pdo->prepare('SELECT id, scope FROM ai_chat_sessions WHERE id = ? AND user_id = ?');
        $st->execute([$sid, $userId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) ai_fail('session not found', 404);
        $scope = $row['scope'] ?: $scope;
    }

    // Save user message.
    $st = $pdo->prepare('INSERT INTO ai_chat_messages (session_id, role, content) VALUES (?,?,?)');
    $st->execute([$sid, 'user', $message]);

    $techId = $getInt('technician_id', $userId);
    if ($techId <= 0) $techId = $userId;

    $reply = ai_build_reply($pdo, $userId, $roleId, $scope, $message, $techId);

    // Persist assistant message before/while streaming (content already known).
    $st = $pdo->prepare('INSERT INTO ai_chat_messages (session_id, role, content) VALUES (?,?,?)');
    $st->execute([$sid, 'assistant', $reply]);

    $pdo->prepare('UPDATE ai_chat_sessions SET scope = ?, updated_at = NOW() WHERE id = ?')->execute([$scope, $sid]);

    // Send SSE.
    ai_stream($reply);

    // Append session id as a final SSE frame.
    echo "data: " . json_encode(['session_id' => $sid], JSON_UNESCAPED_UNICODE) . "\n\n";
    if (function_exists('flush')) flush();
    exit;
}

ai_fail('unknown action', 404);