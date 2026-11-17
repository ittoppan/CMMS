<?php
/**
 * ntfy.php — ช่องทางแจ้งเตือนผ่าน ntfy (ntfy.sh หรือ self-hosted)
 *
 * ทำไมต้องมี: ntfy เป็น push ที่ติดตั้งเป็น PWA บนมือถือ/เดสก์ท็อปได้ (ไม่ต้องมีแอปจาก store)
 * และไม่ผูกกับ LINE/Telegram — ใช้เป็นช่องทางสำรองเมื่อข้อความ LINE ถูกจำกัดโควตา
 *
 * ตั้งค่าทั้งหมดอยู่ในตาราง settings (ไม่ hardcode):
 *   ntfy_enabled    0/1                       — สวิตช์หลัก
 *   ntfy_server_url https://ntfy.sh           — เซิร์ฟเวอร์ที่ผู้รับ subscribe (URL public ก็ได้)
 *   ntfy_publish_url                          — URL สำหรับ "ส่ง" จากเซิร์ฟเวอร์นี้ (ถ้าไม่ตั้ง = ใช้ ntfy_server_url)
 *                                              เช่นตั้ง http://127.0.0.1:2586 เพื่อส่งภายในเครื่อง ไม่ต้องออกเน็ต
 *   ntfy_topic      <ชื่อ topic>               — ปลายทาง (เทียบเท่า "รหัสห้อง")
 *   ntfy_token      tk_xxx                    — access token ของ topic ที่ป้องกันไว้ (ถ้ามี)
 *   ntfy_priority   ''|min|low|default|high|urgent — บังคับระดับ (ว่าง = ตามระดับเหตุการณ์)
 *   ntfy_tags       warning,rotating_light    — แท็ก/อีโมจิ (ว่าง = ตามระดับเหตุการณ์)
 *   ntfy_click_url  0/1                       — แตะแล้วเปิดหน้าในระบบ (ถ้ามีลิงก์)
 *
 * ใช้ร่วมกับ: NotificationCenterService (channel 'ntfy'), public/api/v1/line_notify.php (ทดสอบส่ง)
 */
require_once __DIR__ . '/settings.php';

/** ค่าตั้งต้นของระดับความสำคัญ (ntfy: 1=min … 5=urgent) */
const NTFY_PRIORITIES = ['min' => 1, 'low' => 2, 'default' => 3, 'high' => 4, 'urgent' => 5];

/** อ่านค่าตั้งค่า ntfy ทั้งชุด (ค่าที่ไม่ถูกต้องถูก normalize ให้ปลอดภัย) */
function ntfy_config(): array {
    $server = trim(setting_value('ntfy_server_url', 'https://ntfy.sh'));
    if (!preg_match('~^https?://[^/\s]+~i', $server)) {
        $server = 'https://ntfy.sh';
    }
    // ปลายทางสำหรับส่ง (publish) แยกจาก server ที่ผู้รับใช้ subscribe ได้: ตั้งเป็น loopback
    // เพื่อให้ PHP ส่งเข่า ntfy บนเครื่องเดียวกันได้ตรง ๆ แม้ ntfy_server_url จะเป็น URL ผ่าน tunnel
    $publish = trim(setting_value('ntfy_publish_url', ''));
    if (!preg_match('~^https?://[^/\s]+~i', $publish)) {
        $publish = $server;
    }
    $topic = preg_replace('/[^A-Za-z0-9._-]/', '', trim(setting_value('ntfy_topic', '')));
    $priority = strtolower(trim(setting_value('ntfy_priority', '')));
    return [
        'enabled'  => setting_value('ntfy_enabled', '0') === '1',
        'server'   => rtrim($server, '/'),
        'publish'  => rtrim($publish, '/'),
        'topic'    => mb_substr((string)$topic, 0, 64),
        'token'    => trim(setting_value('ntfy_token', '')) ?: trim((string)(getenv('NTFY_TOKEN') ?: '')),
        'priority' => array_key_exists($priority, NTFY_PRIORITIES) ? $priority : '',
        'tags'     => trim(setting_value('ntfy_tags', '')),
        'click'    => setting_value('ntfy_click_url', '1') === '1',
    ];
}

/** URL ที่ผู้ใช้เปิดเพื่อ subscribe topic (ใช้แสดงในหน้าตั้งค่า/ให้ผู้ใช้กดรับบนมือถือ) */
function ntfy_topic_url(?array $cfg = null): string {
    $cfg = $cfg ?? ntfy_config();
    if ($cfg['topic'] === '') return '';
    return $cfg['server'] . '/' . rawurlencode($cfg['topic']);
}

/** ระดับเหตุการณ์ (INFO/WARN/ERROR) → priority ของ ntfy */
function ntfy_priority_for_level(string $level): string {
    return ['ERROR' => 'high', 'WARN' => 'default', 'SUCCESS' => 'low'][strtoupper($level)] ?? 'low';
}

/** แท็กเริ่มต้นตามระดับเหตุการณ์ (ntfy ใช้ชื่อ emoji มาตรฐาน) */
function ntfy_tags_for_level(string $level): array {
    return ['ERROR' => ['rotating_light'], 'WARN' => ['warning'], 'SUCCESS' => ['white_check_mark']][strtoupper($level)]
        ?? ['information_source'];
}

/**
 * ส่งข้อความเข้า ntfy ตามค่าที่บันทึกไว้
 * @param array $opts title/priority(int)/tags(string[])/click(string)/topic(string)
 * @return array{ok:bool,error:string,url:string}
 */
function ntfy_send(string $message, array $opts = []): array {
    $cfg = ntfy_config();
    $topic = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($opts['topic'] ?? $cfg['topic']));
    if ($topic === '') {
        return ['ok' => false, 'error' => 'ยังไม่ได้ตั้ง ntfy topic', 'url' => ''];
    }

    $payload = ['topic' => $topic, 'message' => mb_substr($message, 0, 4000)];
    if (!empty($opts['title'])) $payload['title'] = mb_substr((string)$opts['title'], 0, 200);
    if (!empty($opts['priority'])) $payload['priority'] = (int)$opts['priority'];
    if (!empty($opts['tags'])) $payload['tags'] = array_values((array)$opts['tags']);
    if (!empty($opts['click']) && preg_match('~^https?://~i', (string)$opts['click'])) $payload['click'] = (string)$opts['click'];
    if (!empty($opts['attach']) && preg_match('~^https?://~i', (string)$opts['attach'])) $payload['attach'] = (string)$opts['attach'];

    $url = $cfg['publish'] . '/';
    $headers = ['Content-Type: application/json'];
    if ($cfg['token'] !== '') $headers[] = 'Authorization: Bearer ' . $cfg['token'];

    $ok = false;
    $response = '';
    $httpCode = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $response = (string)curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => implode("\r\n", $headers),
            'content' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'timeout' => 6,
            'ignore_errors' => true,
        ]]);
        $response = (string)@file_get_contents($url, false, $ctx);
        if (isset($http_response_header[0]) && preg_match('~\s(\d{3})\s~', $http_response_header[0], $m)) {
            $httpCode = (int)$m[1];
        }
    }
    $ok = $httpCode >= 200 && $httpCode < 300;

    try {
        $pdo = getDb();
        $pdo->prepare('INSERT INTO notification_logs (channel, status, content, raw_response, created_at) VALUES (?, ?, ?, ?, NOW())')
            ->execute([
                'NTFY',
                $ok ? 'SENT' : 'FAILED',
                mb_substr((string)($payload['title'] ?? '') . "\n" . $message, 0, 500),
                $ok ? null : mb_substr("HTTP $httpCode " . $response, 0, 2000),
            ]);
    } catch (Throwable $e) {
        // audit log ล้มเหลวไม่ควรทำให้การส่งล้มเหลว
    }

    return $ok
        ? ['ok' => true, 'error' => '', 'url' => $cfg['server'] . '/' . rawurlencode($topic)]
        : ['ok' => false, 'error' => "ntfy ตอบ HTTP $httpCode" . ($response !== '' ? ' — ' . mb_substr($response, 0, 200) : ''), 'url' => $cfg['server']];
}

/**
 * แจ้งเตือนแอดมินผ่าน ntfy — ใช้ระดับ/แท็ก/ลิงก์ตามระดับเหตุการณ์
 * เคารพสวิตช์ ntfy_enabled (default ปิด)
 */
function ntfyAdminAlert(string $title, string $message, string $url = '', string $level = 'INFO'): bool {
    $cfg = ntfy_config();
    if (!$cfg['enabled']) return false;

    $priorityName = $cfg['priority'] !== '' ? $cfg['priority'] : ntfy_priority_for_level($level);
    $tags = $cfg['tags'] !== '' ? array_map('trim', explode(',', $cfg['tags'])) : ntfy_tags_for_level($level);

    $res = ntfy_send($message, [
        'title'    => $title,
        'priority' => NTFY_PRIORITIES[$priorityName] ?? 3,
        'tags'     => $tags,
        'click'    => $cfg['click'] ? $url : '',
    ]);
    if (!$res['ok']) error_log('[ntfy] send failed: ' . $res['error']);
    return $res['ok'];
}
