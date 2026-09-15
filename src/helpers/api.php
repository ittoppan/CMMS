<?php
/**
 * api.php — มาตรฐาน error response ของ API (Phase 18 Security)
 *
 * JSON รูปแบบเดียวสำหรับทุก endpoint:
 *   { "error": "ข้อความที่ปลอดภัยต่อผู้ใช้", "code": "<ERROR_CODE>", "success": false }
 *
 * - ไม่เปิดเผย stack trace / SQL error สู่ client (log ไว้ฝั่ง server ผ่าน error_log)
 * - error code (UPPER_SNAKE) ให้ frontend ตรวจสอบได้ โดยไม่ต้อง px ดึงจากข้อความ
 *
 * ตัวอย่าง:
 *   api_fail(401, 'UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อนใช้งาน');
 *   api_fail(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้');
 *   api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง');
 *   api_fail(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ขอ');
 *   api_fail(409, 'CONFLICT', 'ข้อมูลซ้ำ/ขัดแย้ง');
 *   api_fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
 */
require_once __DIR__ . '/audit.php';

/** หัวข้อความลับที่ห้ามวนกลับไปยัง client (ใช้ mask ใน endpoint ที่คืน settings) */
const API_SECRET_KEYS = [
    'line_channel_access_token',
    'line_channel_secret',
    'line_liff_register_id',
    'line_notify_token',
    'vapid_private_key',
    'vapid_public_key',
    'smtp_pass',
    'telegram_bot_token',
    'telegram_chat_id',
    'sage300_db_pass',
    'sage300_db_user',
    'sage300_odbc_dsn',
];

/** ค่าลับถูกส่งกลับมาแบบ mask หรือไม่ (ไม่ควรเปิดเผยค่าจริงใน response) */
function apiIsSecretKey(string $key): bool {
    $k = strtolower(trim($key));
    if (in_array($k, API_SECRET_KEYS, true)) return true;
    return str_contains($k, 'token') || str_contains($k, 'secret') || str_ends_with($k, '_pass')
        || str_ends_with($k, 'password') || str_contains($k, 'private');
}

/** sentinel สำหรับค่าลับที่ถูก mask — ถ้า client ส่งกลับมาในค่าเดิม = ไม่ต้องการเปลี่ยน ให้ข้ามบันทึก */
const SETTING_MASKED = "••••••••";

/** แปลงค่าลับเป็น mask (ไม่ reveal ตัวอักษรจริงเลย — กันการนำไปใช้ต่อ เช่น token) */
function apiMaskSecret(string $value): string {
    return ($value === '') ? '' : SETTING_MASKED;
}

/** mask คอลัมน์ secrets ในแถว settings (ถอดตาม key ชื่อ) — ใช้กับผลลัพธ์ GET/DETAIL */
function apiMaskSettingsRows(array $rows): array {
    foreach ($rows as $i => $r) {
        if (is_array($r) && apiIsSecretKey((string)($r['setting_key'] ?? '')) && !empty($r['setting_value'])) {
            $rows[$i]['setting_value'] = apiMaskSecret((string)$r['setting_value']);
            $rows[$i]['masked'] = true;
        } elseif (is_array($r) && isset($r['setting_key'])) {
            $rows[$i]['masked'] = false;
        }
    }
    return $rows;
}

/** mask ค่าใน array payload (เช่น env vars / notif settings) ตามชื่อ key */
function apiMaskSecretArray(array $data): array {
    foreach ($data as $k => $v) {
        if ($v !== '' && $v !== null && apiIsSecretKey((string)$k)) {
            $data[$k] = apiMaskSecret((string)$v);
        }
    }
    return $data;
}

/** ตอบ error มาตรฐานแล้วจบ request */
function api_fail(int $status, string $code, string $message): void {
    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'success' => false,
        'error'   => $message,
        'code'    => $code,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/** ตอบ 403 พร้อม audit เหตุการณ์ปฏิเสธสิทธิ์ (severity=security) — บันทึกเฉพาะผู้ใช้ที่ login แล้ว */
function api_forbidden(?PDO $pdo, string $code, string $message): void {
    if ($pdo && !empty($_SESSION['user_id'])) {
        audit_log($pdo, 'PERMISSION_DENIED', 'system', '', $message, null, [
            'uri'    => $_SERVER['REQUEST_URI'] ?? '',
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
        ], 'security');
    }
    api_fail(403, $code, $message);
}