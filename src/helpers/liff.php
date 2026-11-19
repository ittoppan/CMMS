<?php
/**
 * liff.php — ตรวจ LIFF ID token (JWT) ฝั่งเซิร์ฟเวอร์
 *
 * ทำไมต้องมี: หน้า LIFF (LINE browser) เคยแนบ `line_user_id` มาใน query string
 * ซึ่งใครรู้ LINE user ID ของคนอื่นก็ปลอมได้ — วิธีที่ถูกคือให้ client ส่ง
 * `liff.getIDToken()` มา แล้วเซิร์ฟเวอร์ตรวจกับ LINE ก่อนจึงได้ userId จริง
 *
 * การตรวจ (ตามเอกสาร LINE Login):
 *   POST https://api.line.me/oauth2/v2.1/verify  (form: id_token, client_id)
 *   → 200 + { sub, aud, iss, exp, name?, picture? } ; 400 + { error, error_description }
 *   sub = LINE user ID (U + hex 32) — ใช้เป็นกุญแจผูกกับ users.line_user_id
 *
 * client_id = LINE Login channel ID ซึ่งเป็นเจ้าของ LIFF app:
 *   settings `line_channel_id` → env LINE_CHANNEL_ID → ส่วนหน้าก่อน '-' ของ `line_liff_id`
 *   (LIFF ID รูปแบบ <channelId>-<suffix>)
 *
 * หมายเหตุ: ไม่เก็บ/ไม่ log ตัว token — cache ผลลัพธ์ในหน่วยความจำต่อ request เท่านั้น
 */
require_once __DIR__ . '/settings.php';

/** LINE Login channel ID ที่ใช้เป็น aud ของ ID token */
function liff_channel_id(): string {
    // ID token (LIFF) ถูกออกโดย LINE Login channel ที่เป็นเจ้าของ LIFF app — aud ต้องตรงกับ
    // channel นั้น (prefix ก่อน '-' ของ LIFF ID). ค่า setting 'line_channel_id' เคยถูกตั้งเป็น
    // Messaging API channel (ใช้ push) ทำให้ตรวจ token ไม่ผ่าน → ผู้ใช้ที่ผูกแล้วถูกมองว่ายังไม่ผูก.
    // ดังนั้น: ถ้า setting ไม่ตรงกับ LIFF ID ใด ๆ ให้ derive จาก LIFF ID แทน (authoritative).
    $liffIds = [];
    foreach (['line_liff_id', 'line_liff_register_id'] as $k) {
        $v = trim(setting_value($k, ''));
        if ($v === '') $v = trim((string)(getenv(strtoupper($k)) ?: ''));
        if ($v !== '') $liffIds[] = $v;
    }
    $liffPrefixes = [];
    foreach ($liffIds as $lid) {
        $dash = strpos($lid, '-');
        if ($dash > 0) $liffPrefixes[] = substr($lid, 0, $dash);
    }

    $cid = trim(setting_value('line_channel_id', ''));
    if ($cid === '') $cid = trim((string)(getenv('LINE_LOGIN_CHANNEL_ID') ?: ''));
    if ($cid === '') $cid = trim((string)(getenv('LINE_CHANNEL_ID') ?: ''));

    // ถ้า cid ที่ตั้งไว้ไม่ตรงกับ LIFF ID ใดเลย → ใช้ prefix ของ LIFF ID แทน (แก้กรณีตั้งผิดช่อง)
    if ($cid !== '' && !empty($liffPrefixes) && !in_array($cid, $liffPrefixes, true)) {
        $cid = $liffPrefixes[0];
    }
    if ($cid === '' && !empty($liffPrefixes)) {
        $cid = $liffPrefixes[0];
    }
    return $cid;
}

/**
 * URL ของหน้า LIFF (endpoint เดียวกับ /repair/request) — ใช้กับปุ่มในข้อความ LINE
 * เพื่อให้ liff.init ทำงานและหน้ารู้ตัวตนผู้ใช้ LINE; คืน '' ถ้ายังไม่ได้ตั้งค่า LIFF ID
 */
function liff_url(array $query = []): string {
    $liffId = trim(setting_value('line_liff_id', ''));
    if ($liffId === '') $liffId = trim((string)(getenv('LINE_LIFF_ID') ?: ''));
    if ($liffId === '') return '';
    $qs = $query ? '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986) : '';
    return 'https://liff.line.me/' . rawurlencode($liffId) . $qs;
}

/** endpoint ตรวจ token — override ได้ด้วย LINE_VERIFY_URL สำหรับทดสอบ (stub server) */
function liff_verify_endpoint(): string {
    $url = trim((string)(getenv('LINE_VERIFY_URL') ?: ''));
    return $url !== '' ? $url : 'https://api.line.me/oauth2/v2.1/verify';
}

/** ข้อความไทยของ error จาก LINE */
function liff_verify_error_message(string $code): string {
    return [
        'invalid_request'      => 'LINE ไม่ยอมรับ ID token นี้ (invalid_request) — เปิดหน้าจาก LINE ใหม่แล้วลองอีกครั้ง',
        'invalid_client'       => 'LINE Channel ID ไม่ตรงกับแอปที่ออก token',
        'unsupported_token_type' => 'token ชนิดนี้ไม่รองรับ',
        'invalid_grant'        => 'ID token หมดอายุแล้ว — เปิดหน้าจาก LINE ใหม่อีกครั้ง',
    ][$code] ?? 'ID token ไม่ถูกต้องหรือหมดอายุ';
}

/**
 * ดึง LIFF ID token ออกจากคำขอ — header X-LIFF-Id-Token ก่อน, แล้ว Authorization: Bearer, แล้ว body.id_token
 * (ทุก endpoint ที่ต้องรู้ตัวตนผู้ใช้ LINE ใช้ตัวเดียวกัน จะได้ไม่ตีความต่างกัน)
 */
function liff_request_id_token(?array $body = null): string
{
    $token = trim((string)($_SERVER['HTTP_X_LIFF_ID_TOKEN'] ?? ''));
    if ($token === '') {
        $auth = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
        if ($auth !== '' && preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
            $token = trim($m[1]);
        }
    }
    if ($token === '' && is_array($body) && isset($body['id_token'])) {
        $token = trim((string)$body['id_token']);
    }
    return $token;
}

/**
 * ผู้ใช้ในระบบที่ผูกกับ LINE user ID นี้ (is_active เท่านั้น)
 *
 * ใช้แทนการแปลง `line_user_id` ที่ client ส่งมาตรง ๆ — เรียกได้หลังยืนยันตัวตนแล้วเท่านั้น
 */
function liff_user_by_line_id(
    PDO $pdo,
    string $lineUserId,
    string $columns = 'id, full_name, role_id, employee_code, department_id, role, phone, avatar_path, must_change_password, line_user_id'
): ?array {
    if ($lineUserId === '') return null;
    $st = $pdo->prepare("SELECT {$columns} FROM users WHERE line_user_id = ? AND is_active = 1 LIMIT 1");
    $st->execute([$lineUserId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * เก็บ LINE user ID ที่ยืนยันจาก LINE แล้ว (ออกโดย public/line_callback.php) ไว้ใน session
 *
 * ใช้กับหน้า /register ที่ไม่ได้เปิดผ่าน LIFF endpoint (จึงไม่มี ID token) แต่ผ่าน LINE Login
 * callback ซึ่งเซิร์ฟเวอร์แลก code เป็น token กับ LINE เองแล้ว — ไม่ใช่ค่าที่ client แนบมา
 */
function liff_session_set_verified_line_user(string $lineUserId, string $displayName = ''): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) return;
    $lineUserId = trim($lineUserId);
    if (!preg_match('/^U[0-9a-f]{32}$/i', $lineUserId)) return;
    $_SESSION['liff_verified_uid'] = $lineUserId;
    $_SESSION['liff_verified_at'] = time();
    if ($displayName !== '') $_SESSION['liff_verified_name'] = $displayName;
}

/** LINE user ID ที่ยืนยันแล้วใน session นี้ (หมดอายุตาม $maxAgeSeconds) — '' = ไม่มี */
function liff_session_verified_line_user(int $maxAgeSeconds = 900): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) return '';
    $uid = trim((string)($_SESSION['liff_verified_uid'] ?? ''));
    $at = (int)($_SESSION['liff_verified_at'] ?? 0);
    if ($uid === '' || $at <= 0 || (time() - $at) > $maxAgeSeconds) return '';
    return preg_match('/^U[0-9a-f]{32}$/i', $uid) ? $uid : '';
}

/**
 * LINE user ID ของ "ผู้เรียก" จากหลักฐานที่ตรวจได้เท่านั้น
 *  1) LIFF ID token (liff.getIDToken()) ที่ตรวจกับ LINE ผ่าน
 *  2) session ที่ line_callback.php ยืนยัน LINE Login มาแล้ว (หน้าละเภท /register)
 * ค่า `line_user_id` ที่ client แนบมาไม่ถูกใช้เลย
 *
 * @return array{ok:bool,line_user_id:string,via:string,error:string,code:string}
 */
function liff_verified_line_user(?array $body = null): array
{
    $token = liff_request_id_token($body);
    if ($token !== '') {
        $verified = liff_verify_id_token($token);
        return $verified['ok']
            ? ['ok' => true, 'line_user_id' => $verified['line_user_id'], 'via' => 'id_token', 'error' => '', 'code' => '']
            : ['ok' => false, 'line_user_id' => '', 'via' => '', 'error' => $verified['error'], 'code' => $verified['code']];
    }

    $sessUid = liff_session_verified_line_user();
    if ($sessUid !== '') {
        return ['ok' => true, 'line_user_id' => $sessUid, 'via' => 'line_login', 'error' => '', 'code' => ''];
    }

    return [
        'ok' => false,
        'line_user_id' => '',
        'via' => '',
        'error' => 'ต้องแนบ LIFF ID token (liff.getIDToken()) มาด้วย',
        'code' => 'MISSING_ID_TOKEN',
    ];
}

/**
 * ตัวตนผู้เรียกสำหรับ endpoint ที่ต้องรู้ว่า "ฉันคือใคร"
 *  1) session ผู้ใช้ระบบ (หน้าเว็บหลังบ้าน) — เชื่อได้
 *  2) LINE ที่ยืนยันแล้ว (liff_verified_line_user) — ไม่มี session หรือเป็นผู้ใช้ LIFF
 *
 * @param array|null $sessionUser ผลของ currentUser($pdo) ถ้ามี
 * @param array|null $body        body ที่อาจมี id_token (สำหรับ endpoint ที่ส่งทาง JSON)
 * @return array{ok:bool,source:string,line_user_id:string,user:?array,error:string,code:string}
 */
function liff_request_identity(PDO $pdo, ?array $body = null, ?array $sessionUser = null, string $columns = 'id, full_name, role_id, employee_code, department_id, role, phone, avatar_path, must_change_password, line_user_id'): array
{
    if ($sessionUser && !empty($sessionUser['id'])) {
        return [
            'ok' => true,
            'source' => 'session',
            'line_user_id' => (string)($sessionUser['line_user_id'] ?? ''),
            'user' => $sessionUser,
            'error' => '',
            'code' => '',
        ];
    }

    $verified = liff_verified_line_user($body);
    if (!$verified['ok']) {
        return [
            'ok' => false,
            'source' => 'none',
            'line_user_id' => '',
            'user' => null,
            'error' => $verified['error'],
            'code' => $verified['code'],
        ];
    }

    return [
        'ok' => true,
        'source' => $verified['via'],
        'line_user_id' => $verified['line_user_id'],
        'user' => liff_user_by_line_id($pdo, $verified['line_user_id'], $columns),
        'error' => '',
        'code' => '',
    ];
}

/**
 * ตรวจ LIFF ID token กับ LINE
 *
 * @return array{ok:bool,line_user_id:string,profile:array{name:string,picture:string},error:string,code:string}
 */
function liff_verify_id_token(string $idToken): array
{
    static $cache = [];
    $fail = static fn(string $msg, string $code = 'INVALID_ID_TOKEN'): array
        => ['ok' => false, 'line_user_id' => '', 'profile' => [], 'error' => $msg, 'code' => $code];

    $idToken = trim($idToken);
    if ($idToken === '') return $fail('ต้องแนบ LIFF ID token (liff.getIDToken()) มาด้วย', 'MISSING_ID_TOKEN');
    if (strlen($idToken) > 4096 || substr_count($idToken, '.') !== 2) {
        return $fail('รูปแบบ ID token ไม่ถูกต้อง');
    }

    $cacheKey = hash('sha256', $idToken);
    if (isset($cache[$cacheKey])) return $cache[$cacheKey];

    $cid = liff_channel_id();
    if ($cid === '') {
        error_log('[liff] LINE channel id missing (settings.line_channel_id / env LINE_CHANNEL_ID / line_liff_id)');
        return $fail('ระบบยังไม่ได้ตั้งค่า LINE Channel ID — แจ้งผู้ดูแลระบบ', 'SERVER_NOT_CONFIGURED');
    }

    $body = http_build_query(['id_token' => $idToken, 'client_id' => $cid], '', '&', PHP_QUERY_RFC3986);
    $headers = ['Content-Type: application/x-www-form-urlencoded'];
    $url = liff_verify_endpoint();
    $raw = '';
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $raw = (string)curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === '' && $err !== '') {
            error_log('[liff] verify request failed: ' . $err);
            return $fail('ติดต่อ LINE เพื่อตรวจสอบสิทธิ์ไม่สำเร็จ — ลองใหม่อีกครั้ง', 'VERIFY_UNAVAILABLE');
        }
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => 6,
            'ignore_errors' => true,
        ]]);
        $raw = (string)@file_get_contents($url, false, $ctx);
        if (isset($http_response_header[0]) && preg_match('~\s(\d{3})\s~', $http_response_header[0], $m)) {
            $status = (int)$m[1];
        }
        if ($raw === '') {
            return $fail('ติดต่อ LINE เพื่อตรวจสอบสิทธิ์ไม่สำเร็จ — ลองใหม่อีกครั้ง', 'VERIFY_UNAVAILABLE');
        }
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        error_log('[liff] verify returned non-JSON (HTTP ' . $status . ')');
        return $fail('คำตอบจาก LINE ไม่ถูกต้อง — ลองใหม่อีกครั้ง', 'VERIFY_UNAVAILABLE');
    }

    if ($status !== 200) {
        $errorCode = (string)($data['error'] ?? '');
        return $fail(liff_verify_error_message($errorCode), $errorCode !== '' ? strtoupper($errorCode) : 'INVALID_ID_TOKEN');
    }

    // ตรวจ claim ซ้ำอีกชั้น (defense-in-depth — เซิร์ฟเวอร์ LINE ตรวจให้แล้วรอบหนึ่ง)
    $iss = (string)($data['iss'] ?? '');
    if ($iss !== 'https://access.line.me') {
        return $fail('ID token ไม่ได้ออกโดย LINE');
    }

    $aud = $data['aud'] ?? '';
    $audList = is_array($aud) ? array_map('strval', $aud) : [(string)$aud];
    if (!in_array($cid, $audList, true)) {
        return $fail('ID token ถูกออกให้แอปอื่น (aud ไม่ตรง)');
    }

    $exp = (int)($data['exp'] ?? 0);
    if ($exp > 0 && $exp <= time()) {
        return $fail('ID token หมดอายุแล้ว — เปิดหน้าจาก LINE ใหม่อีกครั้ง', 'EXPIRED_ID_TOKEN');
    }

    $lineUserId = trim((string)($data['sub'] ?? ''));
    if (!preg_match('/^U[0-9a-f]{32}$/i', $lineUserId)) {
        return $fail('ID token ไม่มี LINE user ID ที่ถูกต้อง');
    }

    $result = [
        'ok' => true,
        'line_user_id' => $lineUserId,
        'profile' => [
            'name' => (string)($data['name'] ?? ''),
            'picture' => (string)($data['picture'] ?? ''),
        ],
        'error' => '',
        'code' => '',
    ];
    $cache[$cacheKey] = $result;
    return $result;
}
