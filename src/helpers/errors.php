<?php
/**
 * errors.php — Centralized runtime error persistence (Phase 22 §4)
 *
 * จุดเดียวสำหรับบันทึก exception ที่เกิดขึ้นระหว่าง request ลงตาราง system_errors
 * (append-only) เพื่อให้ Production Health Dashboard ดูข้อมูลจริงได้ และให้ฝ่าย IT
 * ตรวจสอบ stack ได้โดยไม่ต้องเปิดเผยสู่ client
 *
 * ข้อบังคับ:
 *  - ห้ามเก็บ secret (token / password / .env) ลง technical_message — ผ่าน redact_error_message()
 *  - ห้าม throw — เขียนล้ม = error_log อย่างเดียว ห้ามกระทบงานหลัก
 *  - user_id/user_name อ่านจาก session จริง (ไม่ใช่ client-provided)
 *
 * เรียกใช้:
 *   require_once __DIR__ . '/../helpers/errors.php';
 *   api_log_error($e, 'api', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
 */

/** สร้าง/อ่าน request id สำหรับติดตามรายการ error ข้ามระบบ ให้ค่าคงที่ใน request เดียว */
function cmms_request_id(): string {
    $reqId = $_SERVER['HTTP_X_REQUEST_ID'] ?? '';
    if (is_string($reqId) && $reqId !== '' && strlen($reqId) <= 64) return $reqId;
    $gen = bin2hex(random_bytes(16));
    $_SERVER['HTTP_X_REQUEST_ID'] = $gen; // กันการสุ่มซ้ำใน request เดียวกัน
    return $gen;
}

/** ลบ/ปกปิดค่าลับที่อาจปนมาในข้อความ exception ก่อนเก็บลง DB */
function redact_error_message(string $message): string {
    $out = $message;
    // connection string / password=...
    $out = preg_replace('/(password\s*=\s*)([^\s;"\']+)/i', '$1••••••', $out) ?? $out;
    // tokens / api keys / secrets ที่มีรูปแบบ key=value หรือ word token
    $out = preg_replace('/((?:token|secret|api_key|apikey|pass)\s*[=:]\s*)([^\s,;"\']+)/i', '$1••••••', $out) ?? $out;
    // ลิ้งก์ bot token รูป https://api.telegram.org/bot<TOKEN>/... — เก็บแค่ prefix
    $out = preg_replace('/(bot\d{5,}:)[A-Za-z0-9_-]+/', '$1••••••', $out) ?? $out;
    return $out;
}

/** บันทึก error ลง system_errors (เรียกผ่าน api_log_error) — เขียนล้มห้ามรบกวนงานหลัก */
function record_error(PDO $pdo, array $ctx): ?int {
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO system_errors
                (module, endpoint, method, user_id, user_name, category, error_code,
                 technical_message, user_message, request_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            mb_substr((string)($ctx['module'] ?? 'api'), 0, 60),
            !empty($ctx['endpoint']) ? mb_substr((string)$ctx['endpoint'], 0, 255) : null,
            !empty($ctx['method']) ? mb_substr((string)$ctx['method'], 0, 10) : null,
            isset($ctx['user_id']) ? (int)$ctx['user_id'] : null,
            !empty($ctx['user_name']) ? mb_substr((string)$ctx['user_name'], 0, 150) : null,
            mb_substr((string)($ctx['category'] ?? 'EXCEPTION'), 0, 50),
            !empty($ctx['error_code']) ? mb_substr((string)$ctx['error_code'], 0, 100) : null,
            !empty($ctx['technical_message']) ? mb_substr((string)$ctx['technical_message'], 0, 2000) : null,
            !empty($ctx['user_message']) ? mb_substr((string)$ctx['user_message'], 0, 500) : null,
            (!empty($ctx['request_id'])) ? mb_substr((string)$ctx['request_id'], 0, 64) : null,
            !empty($ctx['ip_address']) ? mb_substr((string)$ctx['ip_address'], 0, 45) : null,
        ]);
        return (int)$pdo->lastInsertId();
    } catch (Throwable $e) {
        error_log('[record_error] write failed: ' . $e->getMessage());
        return null;
    }
}

/** ประกอบ context จาก session/server ปัจจุบัน แล้วเขียนระบบ error */
function cmms_error_context(string $module, string $category, string $errorCode): array {
    $userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    $userName = isset($_SESSION['user_name']) && is_string($_SESSION['user_name'])
        ? mb_substr($_SESSION['user_name'], 0, 150) : null;
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if (is_string($xff) && $xff !== '') {
        $parts = array_map('trim', explode(',', $xff));
        foreach ($parts as $p) {
            if ($p !== '' && strtolower($p) !== 'unknown') { $ip = $p; break; }
        }
    }
    return [
        'module'      => $module,
        'endpoint'    => $_SERVER['REQUEST_URI'] ?? null,
        'method'      => $_SERVER['REQUEST_METHOD'] ?? null,
        'user_id'     => $userId,
        'user_name'   => $userName,
        'category'    => $category,
        'error_code'  => $errorCode,
        'request_id'  => cmms_request_id(),
        'ip_address'  => $ip,
    ];
}

/**
 * ระดับสูง — ใช้จาก catch/try ทั่วไป: บันทึก exception + ข้อความที่ปลอดภัยต่อผู้ใช้
 * ไม่ throw ไม่ว่ากรณีใด (DB พังก็ยังจบที่ error_log)
 */
function api_log_error(Throwable $e, string $module = 'api', string $userMessage = 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง', string $category = 'EXCEPTION', string $errorCode = 'INTERNAL_ERROR'): void {
    try {
        $ctx = cmms_error_context($module, $category, $errorCode);
        $ctx['user_message'] = $userMessage;
        $ctx['technical_message'] = sprintf(
            '%s: %s @ %s:%d',
            get_class($e),
            redact_error_message($e->getMessage()),
            $e->getFile(),
            $e->getLine()
        );
        if ($module === 'health' && defined('CMMS_HEALTH_NO_DB')) {
            error_log('[CMMS ERROR] (health, DB unavailable) ' . $ctx['technical_message']);
            return;
        }
        $pdo = getDb();
        record_error($pdo, $ctx);
    } catch (Throwable $e2) {
        error_log('[api_log_error] wrapper failed: ' . get_class($e2) . ': ' . $e2->getMessage());
    }
}