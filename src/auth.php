<?php
/**
 * CMMS-TPT Auth Helper — ใช้ร่วมกับ API ทุกตัว (public/api/v1/*.php)
 *
 * - requireLogin($pdo, $adminOnly = false): ตรวจ session + ผู้ใช้จริง (is_active)
 *   คืนแถวผู้ใช้ หรือจบ request ด้วย 401 (ต้อง login) / 403 (ต้อง admin)
 * - currentUser($pdo): คืนผู้ใช้ปัจจุบันจาก session หรือ null
 *
 * Phase 18 hardening:
 *  - บังคับ session timeout จาก setting session_timeout_mins (0 = ปิด)
 *  - session_regenerate_id รอบ ๆ (~10 นาที) ป้องกัน fixation/hijack ระยะยาว
 *  - error response รูปมาตรฐาน { error, code } ผ่าน api_fail() (UNAUTHENTICATED/...)
 *  - กำหนด cookie params (HttpOnly, SameSite=Lax, Secure เมื่อ HTTPS) ผ่าน cmms_secure_session()
 *
 * หมายเหตุ: ต้องเรียก session_start() ในไฟล์ API ก่อนใช้ฟังก์ชันเหล่านี้
 * (บางไฟล์มี session_start เองอยู่แล้ว — อย่าซ้ำ)
 */

require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/helpers/api.php';

/** cookie hardened สำหรับ session — เรียกก่อน session_start() ใน entry point */
function cmms_secure_session(): void {
    if (session_status() !== PHP_SESSION_NONE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    @session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => $https,
    ]);
    session_start();
    // บังคับใช้ strict mode: กัน session fixation (session id ที่ server ไม่รู้จัก)
    @ini_set('session.use_strict_mode', '1');
}

/** อ่าน setting session_timeout_mins (cache 1 ครั้งต่อ request) */
function cmms_session_timeout_mins(PDO $pdo): int {
    static $mins = null;
    if ($mins !== null) return $mins;
    try {
        $mins = (int)$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'session_timeout_mins'")->fetchColumn();
    } catch (Throwable $e) {
        $mins = 60;
    }
    if ($mins < 0) $mins = 60;
    return $mins;
}

/** บังคับ idle timeout + regenerate เป็นระยะ — เรียกภายใน requireLogin */
function cmms_enforce_session_lifecycle(PDO $pdo): void {
    $timeoutMins = cmms_session_timeout_mins($pdo);
    $now = time();

    $last = (int)($_SESSION['last_activity'] ?? 0);
    if ($timeoutMins > 0 && $last > 0 && ($now - $last) > $timeoutMins * 60) {
        $_SESSION = [];
        session_destroy();
        api_fail(401, 'SESSION_EXPIRED', 'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง');
    }
    $_SESSION['last_activity'] = $now;

    $lastRegen = (int)($_SESSION['last_regenerated'] ?? 0);
    if ($lastRegen === 0) {
        $_SESSION['last_regenerated'] = $now;
    } elseif (($now - $lastRegen) > 600) {
        session_regenerate_id(true);
        $_SESSION['last_regenerated'] = $now;
    }
}

function currentUser(?PDO $pdo = null) {
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $pdo = $pdo ?? getDb();
    $stmt = $pdo->prepare("SELECT id, full_name, role_id FROM users WHERE id = ? AND is_active = 1");
    $stmt->execute([(int)$_SESSION['user_id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}

function requireLogin(PDO $pdo, bool $adminOnly = false) {
    // CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        enforceCsrf();
    }

    if (empty($_SESSION['user_id'])) {
        api_fail(401, 'UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อนใช้งาน');
    }
    $user = currentUser($pdo);
    if (!$user) {
        api_fail(401, 'UNAUTHENTICATED', 'ไม่พบผู้ใช้ที่ใช้งานอยู่ — กรุณาเข้าสู่ระบบใหม่');
    }

    // Lifecycle: idle timeout + regenerate (ทำงานหลังยืนยัน identity แล้ว)
    cmms_enforce_session_lifecycle($pdo);

    if ($adminOnly && (int)$user['role_id'] !== 1) {
        api_fail(403, 'FORBIDDEN', 'ต้องเป็นผู้ดูแลระบบ (Admin)');
    }
    return $user;
}