<?php
/**
 * CMMS-TPT CSRF Protection Helper
 *
 * กลยุทธ์ (defense-in-depth):
 *  1. Token-based — ฟอร์ม PHP ฝัง <?= csrfField() ?> แล้วส่งกลับมาด้วย header X-CSRF-Token
 *     หรือ field _csrf / csrf_token (รองรับ JSON body ด้วย)
 *  2. Origin / Referer check — ถ้าไม่มี token (เช่น fetch ธรรมดาจาก PWA/Next.js ที่ proxy
 *     ผ่าน /api/*) ให้ตรวจสอบว่า Origin (หรือ Referer) เป็นต้นทางที่เชื่อถือได้เท่านั้น
 *
 * เหตุผลที่ต้องมี origin fallback: Next.js proxy /api/* -> http://localhost:8081/* แบบ
 * server-side ดังนั้น Origin ที่ PHP เห็นคือ Origin ของเบราว์เซอร์ (เช่น localhost:3000,
 * https://xxx.ngrok-free.app) ไม่ใช่ HTTP_HOST ของ PHP เอง
 *
 * Webhook ของ LINE (line_webhook.php) ถูกยกเว้น — LINE เซิร์ฟเวอร์ส่ง POST ไม่มี Origin
 * และยืนยันตัวตนด้วย signature แล้ว
 *
 * หมายเหตุ: ไฟล์นี้ไม่ start session เองที่ require-time (ไฟล์ API ส่วนใหญ่เรียก
 * session_start() เองทีหลัง — ถ้า start ซ้ำจะเกิด notice และอาจทำลาย JSON output)
 */

/** สร้าง/คืน CSRF token ของ session นี้ (สร้างครั้งแรกเมื่อ render ฟอร์ม) */
function csrfToken(): string {
    if (session_status() === PHP_SESSION_NONE) {
        @session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
        session_start();
    }
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/** hidden field สำหรับแทรกใน <form> เพื่อป้องกัน CSRF */
function csrfField(): string {
    return '<input type="hidden" name="_csrf" value="' . htmlspecialchars(csrfToken(), ENT_QUOTES, 'UTF-8') . '">';
}

/** อ่าน token ที่ส่งมา (header -> $_POST -> JSON body) */
function csrfSubmittedToken(): string {
    $t = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (is_string($t) && $t !== '') return $t;

    $t = $_POST['_csrf'] ?? $_POST['csrf_token'] ?? '';
    if (is_string($t) && $t !== '') return $t;

    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($ct, 'application/json')) {
        static $json = null;
        if ($json === null) {
            $json = json_decode((string)file_get_contents('php://input'), true) ?: [];
        }
        $t = $json['_csrf'] ?? $json['csrf_token'] ?? '';
        if (is_string($t)) return $t;
    }
    return '';
}

/** host ของ request ปัจจุบัน (HTTP_HOST ตัด port ออก) */
function csrfCurrentHost(): string {
    $h = $_SERVER['HTTP_HOST'] ?? '';
    $h = (string)preg_replace('/:\d+$/', '', $h);
    return strtolower(trim($h));
}

/**
 * Origin/Referer URL นี้เชื่อถือได้ไหม?
 * - host ตรงกับ HTTP_HOST (เข้าถึง PHP โดยตรง)
 * - loopback (localhost / 127.0.0.1 / ::1) — Next.js proxy จากเครื่องเดียวกัน
 * - private IP (RFC1918) — เปิด PWA จากเครื่องอื่นใน LAN
 * - wildcard/รายการจาก env ALLOWED_ORIGINS (คั่นด้วย ,) — ค่าเริ่มต้นครอบคลุม ngrok/cloudflare tunnel
 */
function csrfTrustedOrigin(string $url): bool {
    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true)) return false;
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($host === '') return false;

    if ($host === csrfCurrentHost()) return true;
    if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) return true;
    // RFC1918 private ranges (LAN access)
    if (preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/', $host)) return true;

    $pattern = strtolower(trim((string)getenv('ALLOWED_ORIGINS')));
    if ($pattern === '') {
        $pattern = '*.ngrok-free.app,*.ngrok.io,*.trycloudflare.com';
    }
    foreach (explode(',', $pattern) as $p) {
        $p = strtolower(trim($p));
        if ($p === '') continue;
        if (str_starts_with($p, '*.')) {
            $suffix = substr($p, 1); // ".example.com"
            if ($host === ltrim($suffix, '.') || str_ends_with($host, $suffix)) return true;
        } elseif ($host === $p) {
            return true;
        }
    }
    return false;
}

/** ตรวจ CSRF ผ่านไหม: token ถูกต้อง OR Origin ถูกต้อง OR Referer ถูกต้อง */
function csrfCheckPasses(): bool {
    // Token check (เฉพาะเมื่อมี session)
    if (session_status() === PHP_SESSION_ACTIVE) {
        $token = csrfSubmittedToken();
        if ($token !== '' && !empty($_SESSION['csrf_token']) && is_string($_SESSION['csrf_token'])) {
            if (hash_equals($_SESSION['csrf_token'], $token)) return true;
        }
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && csrfTrustedOrigin($origin)) return true;
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer !== '' && csrfTrustedOrigin($referer)) return true;
    return false;
}

/** บังคับตรวจ CSRF — ไม่ผ่านตอบ 403 และจบ request */
function enforceCsrf(): void {
    if (csrfCheckPasses()) return;
    http_response_code(403);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'error' => 'CSRF validation failed — หน้าเว็บหมดอายุหรือคำขอไม่ปลอดภัย กรุณารีเฟรชหน้าแล้วลองใหม่',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
