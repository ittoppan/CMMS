<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/audit.php';
require_once __DIR__ . '/../../../src/helpers/settings.php';
require_once __DIR__ . '/../../../src/helpers/iot_ingest.php'; // ใช้ iot_rate_check() เป็นตัวนับ/ล็อกความพยายามล็อกอิน
$envPath = __DIR__ . '/../../../.env';
if (file_exists($envPath)) loadEnv($envPath);

try {
    $data = json_decode(file_get_contents('php://input'), true);
    $username = trim((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');

    if ($username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['error' => 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'code' => 'VALIDATION_ERROR']);
        exit;
    }

    $pdo = getDb();

    /* ---------- Rate limit / lockout (helper กลาง: iot_rate_check) ----------
     * - ต่อ username: 10 ครั้ง/ชั่วโมง (ด่านหลักกันเดารหัสของบัญชีเดียว)
     * - ต่อ IP: 1000 ครั้ง/ชั่วโมง — เพดานสูงตั้งใจ เพราะเบราว์เซอร์เรียกผ่าน Next
     *   proxy (/api/login → 127.0.0.1) ทำให้ PHP เห็น REMOTE_ADDR เป็น loopback
     *   เดียวกันทุกคน; ใช้ดัก brute-force ที่ยิงเข้า PHP ตรง ๆ
     *   (เดิม 120 ทำให้ suite e2e ที่ล็อกอิน 100+ ครั้ง/รอบ ชนเพดานตามลำดับรัน)
     * - ล็อกอินสำเร็จ → ล้างตัวนับของ username (ผู้ใช้จริงไม่ถูกล็อกเพราะพิมพ์ผิด 2-3 ครั้ง)
     * - ตัวนับเป็น bucket รายชั่วโมงของ iot_rate_limits (ไม่มี schema ใหม่)
     */
    $uma = 'login_user:' . mb_strtolower(mb_substr($username, 0, 60));
    $ipKey = 'login_ip:' . (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $retryAfterMin = max(1, 60 - (int)date('i'));

    foreach ([[$uma, 10], [$ipKey, 1000]] as [$scopeKey, $limit]) {
        $rl = iot_rate_check($pdo, $scopeKey, $limit, $retryAfterMin);
        if (!empty($rl['ok'])) {
            continue;
        }
        if (($rl['error'] ?? '') === 'RATE_LIMITED') {
            audit_log($pdo, 'LOGIN_RATE_LIMITED', 'auth', $username, 'ปฏิเสธการเข้าสู่ระบบ: เกินจำนวนครั้งที่อนุญาต', null, ['scope' => $scopeKey, 'limit' => $limit], 'security');
            header('Retry-After: ' . ($retryAfterMin * 60));
            http_response_code(429);
            echo json_encode([
                'error' => 'พยายามเข้าสู่ระบบหลายครั้งเกินกำหนด กรุณารอ ' . $retryAfterMin . ' นาทีแล้วลองใหม่',
                'code' => 'RATE_LIMITED',
                'retry_after_min' => $retryAfterMin,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        // RATE_LIMIT_UNAVAILABLE (ตาราง/DB ผิดพลาด) — ไม่บล็อกการล็อกอินทั้งระบบ แต่บันทึกไว้
        error_log('[login.php] rate limit unavailable: ' . ($rl['error'] ?? 'unknown'));
    }

    // ---------- Lockout หลังผิดเกิน max_login_attempts (ค่าเริ่มต้น 5, ล็อก 15 นาที ต่อ username+IP) ----------
    $maxLoginAttempts = (int)setting_value('max_login_attempts', '5');
    if ($maxLoginAttempts < 1) $maxLoginAttempts = 5;
    $lockScope = 'login_lock:' . mb_strtolower(mb_substr($username, 0, 60)) . ':' . (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $lockScope = mb_substr($lockScope, 0, 120);
    $minute = (int)date('i');
    $bucketMin = (int)(floor($minute / 15) * 15);
    $lockBucket = date('Y-m-d H:') . sprintf('%02d', $bucketMin) . ':00';
    try {
        $lst = $pdo->prepare('SELECT event_count FROM iot_rate_limits WHERE scope_key = ? AND window_start = ?');
        $lst->execute([$lockScope, $lockBucket]);
        $lockCount = (int)$lst->fetchColumn();
        if ($lockCount >= $maxLoginAttempts) {
            audit_log($pdo, 'LOGIN_LOCKED', 'auth', $username, 'ปฏิเสธการเข้าสู่ระบบ: ล็อกชั่วคราว (เกินจำนวนครั้งที่อนุญาต)', null, ['scope' => $lockScope], 'security');
            header('Retry-After: 900');
            http_response_code(429);
            echo json_encode(['error' => 'พยายามเข้าสู่ระบบหลายครั้งเกินกำหนด กรุณารอ 15 นาทีแล้วลองใหม่', 'code' => 'ACCOUNT_LOCKED', 'retry_after_min' => 15], JSON_UNESCAPED_UNICODE);
            exit;
        }
    } catch (Throwable $e) {
        error_log('[login.php] lockout check failed: ' . $e->getMessage());
    }

    $stmt = $pdo->prepare('SELECT id, username, password, full_name, role_id, must_change_password, is_active FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || ((int)$user['is_active'] !== 1) || !password_verify($password, $user['password'])) {
        // บันทึก failed login (severity=security) — ไม่ระบุว่าชื่อผู้ใช้ถูกหรือไม่ (กัน user enumeration)
        audit_log($pdo, 'LOGIN_FAIL', 'auth', $username, 'เข้าสู่ระบบไม่สำเร็จ (ชื่อผู้ใช้/รหัสผ่านไม่ถูกต้อง)', null, ['username' => $username], 'security');
        // เพิ่มตัวนับล็อก (ต่อ username+IP, ช่วง 15 นาที) — ไม่เปิดเผยว่าบัญชีมีอยู่หรือไม่
        try {
            $ins = $pdo->prepare('INSERT INTO iot_rate_limits (scope_key, window_start, event_count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE event_count = event_count + 1, updated_at = NOW()');
            $ins->execute([$lockScope, $lockBucket]);
        } catch (Throwable $e) {
            error_log('[login.php] lockout increment failed: ' . $e->getMessage());
        }
        http_response_code(401);
        echo json_encode(['error' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'code' => 'INVALID_CREDENTIALS']);
        exit;
    }

    // Cookie hardening + start session (ก่อนเขียนข้อมูล session)
    cmms_secure_session();
    session_regenerate_id(true); // ป้องกัน session fixation
    $_SESSION['user_id']   = $user['id'];
    $_SESSION['user_name'] = $user['full_name'];
    $_SESSION['role_id']   = $user['role_id'];
    $_SESSION['must_change_password'] = (int)$user['must_change_password'] === 1;
    $_SESSION['last_activity']      = time();
    $_SESSION['last_regenerated']   = time();

    // สำเร็จ → คืนสิทธิ์ให้ผู้ใช้รายนี้ (ล้างตัวนับของ username; ไม่แตะตัวนับ IP)
    try {
        $pdo->prepare('DELETE FROM iot_rate_limits WHERE scope_key = ?')->execute([$uma]);
        $pdo->prepare('DELETE FROM iot_rate_limits WHERE scope_key = ?')->execute([$lockScope]);
    } catch (Throwable $e) {
        error_log('[login.php] reset rate counter failed: ' . $e->getMessage());
    }

    audit_log($pdo, 'LOGIN', 'auth', (int)$user['id'], 'เข้าสู่ระบบสำเร็จ: ' . $user['full_name'], null, ['role_id' => (int)$user['role_id']]);

    // ชื่อบทบาท (สำหรับ frontend mapping หน้าแรกต่อ role)
    $roleName = '';
    try {
        $rs = $pdo->prepare('SELECT name FROM roles WHERE id = ?');
        $rs->execute([(int)$user['role_id']]);
        $roleName = (string)($rs->fetchColumn() ?: '');
    } catch (Throwable $e) { $roleName = ''; }

    echo json_encode(['success' => true, 'must_change_password' => (int)$user['must_change_password'] === 1, 'code' => 'OK', 'user' => [
        'id'        => $user['id'],
        'username'  => $user['username'],
        'full_name' => $user['full_name'],
        'role_id'   => (int)$user['role_id'],
        'role_name' => $roleName,
    ]]);
} catch (Exception $e) {
    error_log('[login.php] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง', 'code' => 'INTERNAL_ERROR']);
}