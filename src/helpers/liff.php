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
    $cid = trim(setting_value('line_channel_id', ''));
    if ($cid === '') $cid = trim((string)(getenv('LINE_CHANNEL_ID') ?: ''));
    if ($cid === '') {
        $liffId = trim(setting_value('line_liff_id', ''));
        if ($liffId === '') $liffId = trim((string)(getenv('LINE_LIFF_ID') ?: ''));
        $dash = strpos($liffId, '-');
        if ($dash > 0) $cid = substr($liffId, 0, $dash);
    }
    return $cid;
}

/** endpoint ตรวจ token — override ได้ด้วย LINE_VERIFY_URL สำหรับทดสอบ (stub server) */
function liff_verify_endpoint(): string {
    $url = trim((string)(getenv('LINE_VERIFY_URL') ?: ''));
    return $url !== '' ? $url : 'https://api.line.me/oauth2/v2.1/verify';
}

/** ข้อความไทยของ error จาก LINE */
function liff_verify_error_message(string $code): string {
    return [
        'invalid_request'      => 'รูปแบบ ID token ไม่ถูกต้อง',
        'invalid_client'       => 'LINE Channel ID ไม่ตรงกับแอปที่ออก token',
        'unsupported_token_type' => 'token ชนิดนี้ไม่รองรับ',
        'invalid_grant'        => 'ID token หมดอายุแล้ว — เปิดหน้าจาก LINE ใหม่อีกครั้ง',
    ][$code] ?? 'ID token ไม่ถูกต้องหรือหมดอายุ';
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
