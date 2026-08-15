<?php
require_once __DIR__ . '/../config/db.php';

/**
 * CMMS-TPT Notification Helpers
 * - LINE Push Message (Messaging API Flex)
 * - Email notification (template-based from `email_notifications`, SMTP or mail())
 */

/* ============================================================
 * 1.5 PUBLIC BASE URL — URL ภายนอกปัจจุบัน (Cloudflare → ngrok → fallback)
 * ============================================================ */
function publicBaseUrl() {
    // 1. ตั้งค่าล็อกด้วยมือในหน้า Settings (มีผลก่อนเสมอ)
    $override = getSettingValue('public_base_url', '');
    if (!empty($override)) return rtrim($override, '/');

    // 2. env APP_URL (แนะนำให้ตั้งค่าตรงนี้ใน production)
    $appUrl = getenv('APP_URL');
    if (!empty($appUrl)) return rtrim($appUrl, '/');

    // 3. Cloudflare Tunnel (dev) — อ่านจาก log ของ cloudflared เฉพาะเมื่อตั้ง CLOUDFLARE_LOG_PATH
    $logPath = getenv('CLOUDFLARE_LOG_PATH');
    if (!empty($logPath) && file_exists($logPath)) {
        $log = (string)@file_get_contents($logPath);
        if (preg_match('#https://[a-z0-9\-]+\.trycloudflare\.com#', $log, $m)) return rtrim($m[0], '/');
    }

    // 4. ngrok (dev) — อ่านจาก local API (port 4040) เฉพาะเมื่อตั้ง NGROK_ENABLED=1
    if (getenv('NGROK_ENABLED') === '1') {
        $ctx = stream_context_create(['http' => ['timeout' => 2]]);
        $json = @file_get_contents('http://127.0.0.1:4040/api/tunnels', false, $ctx);
        if ($json !== false) {
            $j = json_decode($json, true);
            foreach (($j['tunnels'] ?? []) as $t) {
                if (!empty($t['public_url'])) return rtrim($t['public_url'], '/');
            }
        }
    }

    // 5. env LINE_CALLBACK_URL (ตัด .php ต่อท้าย)
    $env = getenv('LINE_CALLBACK_URL');
    if (!empty($env)) return rtrim(preg_replace('#/[^/]*\.php$#', '', rtrim($env, '/')), '/');

    // 6. fallback สุดท้าย: host ปัจจุบัน (ไม่ใช่ URL tunnel ที่ฝังตายตัว)
    if (!empty($_SERVER['HTTP_HOST'])) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        return $scheme . '://' . $_SERVER['HTTP_HOST'];
    }
    return '';
}

/* ============================================================
 * 1. COMBINED: send to a specific user via LINE + Email
 * ============================================================ */
function sendNotificationToUser($userId, $title, $message, $targetUrl = '') {
    $pdo = getDb();
    $stmt = $pdo->prepare("SELECT id, full_name, email, line_user_id FROM users WHERE id = ? AND is_active = 1");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user) return false;

    $results = [
        'line' => false,
        'email' => false
    ];

    // 1. Send LINE Push Message if line_user_id exists
    if (!empty($user['line_user_id'])) {
        $results['line'] = sendLinePushMessage($user['line_user_id'], $title, $message, $targetUrl);
    }

    // 2. Send Email Notification if email exists
    if (!empty($user['email'])) {
        $results['email'] = sendEmailNotification($user['email'], $user['full_name'], $title, $message, $targetUrl);
    }

    return $results;
}

/* ============================================================
 * 2. LINE PUSH (Flex Message via Messaging API)
 * ============================================================ */

/**
 * สร้าง public HTTPS URL สำหรับรูปในระบบ (ผ่าน ngrok base)
 * - file_path รูปแบบ "uploads/repair/xxx.jpg"
 * - LINE ต้องการ HTTPS URL ที่เข้าถึงได้จากนอก (ใช้ ngrok)
 */
function linePhotoUrl($filePath) {
    if (empty($filePath)) return '';
    $base = publicBaseUrl();
    return $base . '/' . ltrim($filePath, '/');
}

/**
 * ดึง URL รูปจาก repair_attachments ตามหมวด (failure_image = ก่อนซ่อม, after_image = หลังซ่อม)
 * คืน array ของ public HTTPS URL
 */
function repairPhotoUrls($repairId, $category = 'failure_image', $limit = 3) {
    try {
        $pdo = getDb();
        $s = $pdo->prepare("SELECT file_path FROM repair_attachments
                            WHERE repair_id = ? AND category = ? AND file_type LIKE 'image/%'
                            ORDER BY id ASC LIMIT " . (int)$limit);
        $s->execute([$repairId, $category]);
        $urls = [];
        foreach ($s->fetchAll(PDO::FETCH_COLUMN) as $fp) {
            $u = linePhotoUrl($fp);
            if ($u) $urls[] = $u;
        }
        return $urls;
    } catch (Exception $e) {
        return [];
    }
}

/**
 * ส่ง LINE Push — Flex การ์ดข้อมูลพร้อมรูปก่อน/หลังซ่อมอยู่ใน Flex Template เดียวกัน
 * @param string|array $photos รูปแบบ:
 *   - ['before' => [url...], 'after' => [url...]]  → แสดงเป็นบล็อกรูปใน Flex พร้อม label ก่อนซ่อม/หลังซ่อม (อย่างละสูงสุด 2 รูป)
 *   - [url, url, ...] (array ธรรมดา)              → backward compat แสดงเป็นรูปแนบ (สูงสุด 4 รูป)
 */
function sendLinePushMessage($lineUserId, $title, $message, $targetUrl = '', $photos = [], $headerColor = '#1d4ed8', $headerText = '🔔 CMMS-TPT NOTIFICATION', $btnLabel = 'ดูรายละเอียดในระบบ') {
    $channelAccessToken = getenv('LINE_CHANNEL_ACCESS_TOKEN') ?: getenv('LINE_CHANNEL_SECRET');
    if (empty($channelAccessToken)) {
        error_log("LINE_CHANNEL_ACCESS_TOKEN is missing in .env");
        return false;
    }

    $url = 'https://api.line.me/v2/bot/message/push';

    // Normalize รูป: รองรับทั้งแบบมี label (before/after) และ array ธรรมดา
    $beforeUrls = []; $afterUrls = []; $flatUrls = [];
    if (array_key_exists('before', $photos) || array_key_exists('after', $photos)) {
        $beforeUrls = array_values(array_filter(array_slice((array)($photos['before'] ?? []), 0, 2)));
        $afterUrls  = array_values(array_filter(array_slice((array)($photos['after'] ?? []), 0, 2)));
    } else {
        $flatUrls = array_values(array_filter(array_slice((array)$photos, 0, 4)));
    }

    $defaultTapUrl = !empty($targetUrl) ? $targetUrl : publicBaseUrl();

    // สร้างบล็อกรูปภายใน Flex body (เต็มความกว้าง พร้อม label สีน้ำเงิน)
    $photoBoxes = [];
    $addPhotoSection = function ($urls, $label) use (&$photoBoxes, $defaultTapUrl) {
        if (empty($urls)) return;
        $photoBoxes[] = [
            'type' => 'text',
            'text' => $label,
            'size' => 'xs',
            'weight' => 'bold',
            'color' => '#1d4ed8',
            'margin' => 'lg'
        ];
        foreach ($urls as $u) {
            $photoBoxes[] = [
                'type' => 'image',
                'url' => $u,
                'size' => 'full',
                'aspectRatio' => '4:3',
                'aspectMode' => 'cover',
                'margin' => 'xs',
                'action' => ['type' => 'uri', 'uri' => $defaultTapUrl]
            ];
        }
    };
    $addPhotoSection($beforeUrls, '📸 ก่อนซ่อม');
    $addPhotoSection($afterUrls, '📸 หลังซ่อม');
    $addPhotoSection($flatUrls, '📎 รูปแนบ');

    $bodyContents = [];
    // ใส่ title เป็นหัวข้อตัวหนาเฉพาะเมื่อต่างจาก header (กันซ้ำซ้อน ถ้า header ใช้ title เดียวกัน)
    if ($headerText !== '' && $headerText === $title) {
        // header แสดง title อยู่แล้ว — body เริ่มด้วยเนื้อหาเลย
    } else {
        $bodyContents[] = [
            'type' => 'text',
            'text' => $title,
            'weight' => 'bold',
            'size' => 'md',
            'wrap' => true
        ];
    }
    $bodyContents[] = [
        'type' => 'text',
        'text' => $message,
        'size' => 'sm',
        'color' => '#475569',
        'wrap' => true,
        'margin' => 'md'
    ];
    foreach ($photoBoxes as $pb) $bodyContents[] = $pb;

    $flexPayload = [
        'to' => $lineUserId,
        'messages' => [
            [
                'type' => 'flex',
                'altText' => "🔔 $title: $message",
                'contents' => [
                    'type' => 'bubble',
                    'header' => [
                        'type' => 'box',
                        'layout' => 'vertical',
                        'backgroundColor' => preg_match('/^#[0-9a-fA-F]{6}$/', (string)$headerColor) ? $headerColor : '#1d4ed8',
                        'contents' => [
                            [
                                'type' => 'text',
                                'text' => $headerText,
                                'color' => '#ffffff',
                                'weight' => 'bold',
                                'size' => 'xs',
                                'wrap' => true
                            ]
                        ]
                    ],
                    'body' => [
                        'type' => 'box',
                        'layout' => 'vertical',
                        'contents' => $bodyContents
                    ],
                    'footer' => [
                        'type' => 'box',
                        'layout' => 'vertical',
                        'contents' => [
                            [
                                'type' => 'button',
                                'action' => [
                                    'type' => 'uri',
                                    'label' => $btnLabel,
                                    'uri' => $defaultTapUrl
                                ],
                                'style' => 'primary',
                                'color' => '#06C755'
                            ]
                        ]
                    ]
                ]
            ]
        ]
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($flexPayload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $channelAccessToken
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ($httpCode === 200);
}

/* ============================================================
 * 2.5 TEMPLATE-DRIVEN LINE PUSH (line_tpl_* จากหน้า /settings/notifications)
 * — ใช้จริงกับทุกจุดส่ง: งานซ่อมใหม่/ปิดงาน, PM เกินกำหนด, สต็อกต่ำ, อนุมัติ Sage
 * ============================================================ */

/** ค่าเริ่มต้นของเทมเพลต LINE (ตรงกับ settings_defaults.php) */
function lineTemplateDefaults() {
    return [
        'line_tpl_breakdown' => [
            'header_color' => '#dc2626',
            'header_title' => '🚨 แจ้งซ่อมด่วน #{work_order_id}',
            'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nอาการเสีย: {title}\nความเร่งด่วน: {priority} | สถานะ: {status}\nผู้แจ้งซ่อม: {reporter_name}",
            'btn_label' => '⚡ รับงานซ่อมด่วน',
            'enabled' => '1', 'image_before' => '', 'image_after' => '',
        ],
        'line_tpl_completed' => [
            'header_color' => '#16a34a',
            'header_title' => '✅ ซ่อมเสร็จเรียบร้อย #{work_order_id}',
            'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nDowntime: {downtime_hours} ชม.\nค่าซ่อมรวม: {total_cost} บาท\nช่างผู้ปิดงาน: {assigned_name}",
            'btn_label' => '📊 ประเมินผลงาน',
            'enabled' => '1', 'image_before' => '', 'image_after' => '',
        ],
        'line_tpl_low_stock' => [
            'header_color' => '#7c3aed',
            'header_title' => '📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ',
            'body_text' => "รหัสอะไหล่: {item_code}\nชื่ออะไหล่: {item_name}\nคงเหลือ: {qty} (ขั้นต่ำ: {min_stock})",
            'btn_label' => '🛒 สั่งซื้อ/เบิกจ่าย',
            'enabled' => '1', 'image_before' => '', 'image_after' => '',
        ],
        'line_tpl_pm_overdue' => [
            'header_color' => '#d97706',
            'header_title' => '📋 แผน PM เกินกำหนด #{work_order_id}',
            'body_text' => "เครื่องจักร: {asset_code}\nรายการ: {title}\nกำหนดชำระ: {due_date} (เกินมา {days_overdue} วัน)",
            'btn_label' => '📝 เปิดเช็คชีท PM',
            'enabled' => '1', 'image_before' => '', 'image_after' => '',
        ],
        'line_tpl_sage_approval' => [
            'header_color' => '#7c3aed',
            'header_title' => '📦 ขออนุมัติเบิกอะไหล่ #{requisition_no}',
            'body_text' => "รายการ: {items_summary}\nผู้ขอเบิก: {requester_name}\nรวมมูลค่า: {total_amount} บาท",
            'btn_label' => '✔ อนุมัติการเบิก',
            'enabled' => '1', 'image_before' => '', 'image_after' => '',
        ],
    ];
}

/**
 * อ่านเทมเพลต LINE จาก settings (line_tpl_*) — fallback ค่าเริ่มต้นถ้ายังไม่ได้ตั้ง
 * @return array{header_color:string,header_title:string,body_text:string,btn_label:string,enabled:string,image_before:string,image_after:string}
 */
function getLineTemplate($tplKey) {
    $d = lineTemplateDefaults()[$tplKey] ?? [
        'header_color' => '#1d4ed8', 'header_title' => '🔔 CMMS-TPT NOTIFICATION',
        'body_text' => '', 'btn_label' => 'ดูรายละเอียดในระบบ',
        'enabled' => '1', 'image_before' => '', 'image_after' => '',
    ];
    $raw = getSettingValue($tplKey, '');
    $tpl = $raw !== '' ? (json_decode($raw, true) ?: []) : [];
    return [
        'header_color' => preg_match('/^#[0-9a-fA-F]{6}$/', (string)($tpl['header_color'] ?? '')) ? $tpl['header_color'] : $d['header_color'],
        'header_title' => (string)($tpl['header_title'] ?? $d['header_title']),
        'body_text'    => (string)($tpl['body_text'] ?? $d['body_text']),
        'btn_label'    => (string)($tpl['btn_label'] ?? $d['btn_label']),
        'image_before' => trim((string)($tpl['image_before'] ?? $d['image_before'] ?? '')),
        'image_after'  => trim((string)($tpl['image_after'] ?? $d['image_after'] ?? '')),
        'enabled'      => (($tpl['enabled'] ?? $d['enabled'] ?? '1') == '1' || ($tpl['enabled'] ?? '1') === true) ? '1' : '0',
    ];
}

/**
 * ส่ง LINE Push จากเทมเพลต (line_tpl_*) — จุดส่งจริงทั้งหมดต้องใช้ฟังก์ชันนี้
 * - เคารพปุ่มเปิด/ปิดของเทมเพลต (enabled='0' → ไม่ส่ง)
 * - $vars: {var} => ค่าจริง · $photos: ['before'=>[],'after'=>[]] หรือ array ธรรมดา
 * - รูป: ใช้ $photos (จากงานจริง) ก่อน; ถ้าไม่มีและเทมเพลตตั้ง URL ไว้ → ใช้ URL ของเทมเพลต
 */
function sendLineTemplatePush($lineUserId, $tplKey, array $vars = [], $targetUrl = '', $photos = []) {
    $tpl = getLineTemplate($tplKey);
    if ($tpl['enabled'] !== '1') return false;

    // normalize: รองรับทั้ง {key} และ key (substituteVars ใช้ key ไม่มีปีกกา)
    $norm = [];
    foreach ($vars as $k => $v) $norm[trim((string)$k, '{}')] = (string)$v;

    $title    = substituteVars($tpl['header_title'], $norm);
    $body     = substituteVars($tpl['body_text'], $norm);
    $btnLabel = substituteVars($tpl['btn_label'], $norm);

    if (empty($photos)) {
        $photos = [];
        if ($tpl['image_before'] !== '') $photos['before'] = [$tpl['image_before']];
        if ($tpl['image_after']  !== '') $photos['after']  = [$tpl['image_after']];
    }
    return sendLinePushMessage($lineUserId, $title, $body, $targetUrl, $photos, $tpl['header_color'], $title, $btnLabel);
}

/* ============================================================
 * 2.6 TELEGRAM — แจ้งเตือนแอดมินระบบ (bot token + chat id จาก settings หรือ .env)
 * ============================================================ */

/**
 * ส่งข้อความ Telegram (sendMessage API) — HTML parse mode
 * อ่านค่า: settings (telegram_bot_token / telegram_chat_id) → env (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)
 * เขียน log ลง notification_logs ช่อง TELEGRAM
 */
function sendTelegramMessage($text, $parseMode = 'HTML') {
    $token  = getSettingValue('telegram_bot_token', '') ?: (getenv('TELEGRAM_BOT_TOKEN') ?: '');
    $chatId = getSettingValue('telegram_chat_id', '') ?: (getenv('TELEGRAM_CHAT_ID') ?: '');
    if (empty($token) || empty($chatId)) {
        error_log('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing (settings หรือ .env)');
        return false;
    }

    $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
    $payload = [
        'chat_id' => $chatId,
        'text' => mb_substr((string)$text, 0, 4000),
        'disable_web_page_preview' => true,
    ];
    if ($parseMode === 'HTML') $payload['parse_mode'] = 'HTML';

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $ok = ($httpCode === 200);
    try {
        $pdo = getDb();
        $pdo->prepare("INSERT INTO notification_logs (channel, status, content, raw_response, created_at) VALUES ('TELEGRAM', ?, ?, ?, NOW())")
            ->execute([$ok ? 'SENT' : 'FAILED', mb_substr((string)$text, 0, 500), $ok ? null : mb_substr((string)$response, 0, 2000)]);
    } catch (Exception $e) {}
    return $ok;
}

/**
 * แจ้งเตือนแอดมินระบบ (Telegram) — format ข้อความ HTML พร้อม level icon + ลิงก์
 * เคารพสวิตช์ telegram_enabled (default เปิด)
 */
function telegramAdminAlert($title, $message, $url = '', $level = 'INFO') {
    if (getSettingValue('telegram_enabled', '1') !== '1') return false;
    $icon = ['INFO' => 'ℹ️', 'WARN' => '⚠️', 'ERROR' => '🚨', 'SUCCESS' => '✅'][$level] ?? 'ℹ️';
    $lines = ['<b>' . $icon . ' ' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</b>', htmlspecialchars((string)$message, ENT_QUOTES, 'UTF-8')];
    if (!empty($url)) $lines[] = '<a href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">🔗 เปิดในระบบ</a>';
    return sendTelegramMessage(implode("\n", $lines));
}

/* ============================================================
 * 3. EMAIL — template helpers
 * ============================================================ */

/** Load a template row from `email_notifications` by module+event, or defaults. */
function getEmailTemplateConfig($module, $event) {
    $pdo = getDb();
    $stmt = $pdo->prepare("SELECT subject, template_body, is_active FROM email_notifications WHERE module = ? AND event = ?");
    $stmt->execute([$module, $event]);
    $row = $stmt->fetch();

    $defaults = [
        'repair/created' => ['subject' => '🚨 แจ้งซ่อมด่วน #{work_order_id}: {title}', 'header_color' => '#dc2626', 'body_html' => 'เครื่องจักร: <b>{asset_code}</b> - {asset_name}<br>อาการเสีย: {title}<br>ความเร่งด่วน: <b>{priority}</b> | สถานะ: {status}<br>ผู้แจ้งซ่อม: {reporter_name}', 'btn_label' => 'เปิดดูใบแจ้งซ่อม'],
        'pm_am/due_soon' => ['subject' => '📋 แผน PM ถึงกำหนด/เกินกำหนด: {title}', 'header_color' => '#d97706', 'body_html' => 'เครื่องจักร: <b>{asset_code}</b><br>รายการ: {title}<br>กำหนดชำระ: {due_date} (เกินมา {days_overdue} วัน)', 'btn_label' => 'เปิดเช็คชีท PM'],
        'inventory/low_stock' => ['subject' => '📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ: {item_name}', 'header_color' => '#7c3aed', 'body_html' => 'รหัสอะไหล่: <b>{item_code}</b><br>ชื่ออะไหล่: {item_name}<br>คงเหลือ: {qty} (ขั้นต่ำ: {min_stock})', 'btn_label' => 'สั่งซื้อ/เบิกจ่าย'],
        'repair/resolved' => ['subject' => '✅ ซ่อมเสร็จเรียบร้อย #{work_order_id}', 'header_color' => '#16a34a', 'body_html' => 'เครื่องจักร: <b>{asset_code}</b> - {asset_name}<br>Downtime: {downtime_hours} ชม.<br>ค่าซ่อมรวม: {total_cost} บาท<br>ช่างผู้ปิดงาน: {assigned_name}', 'btn_label' => 'ประเมินผลงาน'],
        'sage/approval' => ['subject' => '📑 ขออนุมัติเบิกอะไหล่ #{requisition_no}', 'header_color' => '#7c3aed', 'body_html' => 'รายการ: {items_summary}<br>ผู้ขอเบิก: {requester_name}<br>รวมมูลค่า: <b>{total_amount} บาท</b>', 'btn_label' => 'อนุมัติการเบิก'],
    ];

    $key = "$module/$event";
    $d = $defaults[$key] ?? ['subject' => '🔔 CMMS-TPT Notification', 'header_color' => '#1d4ed8', 'body_html' => '{message}', 'btn_label' => 'เปิดดูในระบบ'];

    $cfg = ['subject' => $d['subject'], 'header_color' => $d['header_color'], 'body_html' => $d['body_html'], 'btn_label' => $d['btn_label'], 'btn_url' => '', 'enabled' => '1'];

    if ($row) {
        $cfg['enabled'] = (string)$row['is_active'];
        if (!empty($row['subject'])) $cfg['subject'] = $row['subject'];
        if (!empty($row['template_body'])) {
            $j = json_decode($row['template_body'], true);
            if (is_array($j)) {
                foreach (['header_color' => '#1d4ed8', 'body_html' => '', 'btn_label' => 'เปิดดูในระบบ', 'btn_url' => '', 'enabled' => '1'] as $k => $fallback) {
                    $cfg[$k] = $j[$k] ?? $fallback;
                }
            } else {
                $cfg['body_html'] = $row['template_body']; // plain-text body fallback
            }
        }
    }
    return $cfg;
}

/** Substitute {vars} in a string. */
function substituteVars($text, array $vars) {
    foreach ($vars as $k => $v) {
        $text = str_replace('{' . $k . '}', (string)$v, $text);
    }
    return $text;
}

/** Send an email using a stored template (module+event). Returns bool. */
function sendEmailWithTemplate($toEmail, $toName, $module, $event, array $vars = [], $targetUrl = '') {
    $cfg = getEmailTemplateConfig($module, $event);
    if ($cfg['enabled'] !== '1') return false;

    $vars['to_name'] = $toName ?: 'ผู้ใช้งาน';
    if (empty($vars['message'])) $vars['message'] = substituteVars($cfg['body_html'], $vars);

    $subject = substituteVars($cfg['subject'], $vars);
    $bodyHtml = substituteVars($cfg['body_html'], $vars);
    $btnLabel = substituteVars($cfg['btn_label'], $vars);
    $btnUrl = !empty($cfg['btn_url']) ? $cfg['btn_url'] : $targetUrl;

    $html = buildEmailHtml($toName, $subject, $bodyHtml, $cfg['header_color'], $btnLabel, $btnUrl);
    return sendHtmlEmail($toEmail, $toName, $subject, $html);
}

/** Build full HTML email body with header color + CTA button. */
function buildEmailHtml($toName, $subject, $bodyHtml, $headerColor = '#1d4ed8', $btnLabel = '', $btnUrl = '') {
    $btn = '';
    if (!empty($btnLabel) && !empty($btnUrl)) {
        $btn = "<a href='" . htmlspecialchars($btnUrl, ENT_QUOTES, 'UTF-8') . "' style='display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;'>" . htmlspecialchars($btnLabel, ENT_QUOTES, 'UTF-8') . "</a>";
    }
    $color = preg_match('/^#[0-9a-fA-F]{6}$/', $headerColor) ? $headerColor : '#1d4ed8';

    return "<!DOCTYPE html>
<html>
<head><meta charset='utf-8'></head>
<body style='margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;'>
    <div style='max-width:560px;margin:0 auto;'>
        <div style='background:$color;padding:18px 24px;border-radius:10px 10px 0 0;'>
            <span style='color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.5px;'>CMMS-TPT ENTERPRISE</span>
        </div>
        <div style='background:#ffffff;padding:28px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;'>
            <h2 style='margin:0 0 16px;color:#0f172a;font-size:20px;'>" . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . "</h2>
            <p style='margin:0 0 16px;color:#334155;font-size:14px;'>เรียน คุณ <strong>" . htmlspecialchars($toName, ENT_QUOTES, 'UTF-8') . "</strong>,</p>
            <div style='background:#f8fafc;border-left:4px solid $color;border-radius:6px;padding:16px 18px;margin:0 0 20px;font-size:14px;color:#1e293b;line-height:1.7;'>$bodyHtml</div>
            $btn
        </div>
        <div style='background:#f8fafc;padding:16px 24px;border:1px solid #e2e8f0;border-radius:0 0 10px 10px;'>
            <p style='margin:0;font-size:11px;color:#94a3b8;text-align:center;'>ระบบแจ้งเตือนอัตโนมัติ CMMS-TPT Enterprise — กรุณาอย่าตอบกลับอีเมลนี้</p>
        </div>
    </div>
</body>
</html>";
}

/* ============================================================
 * 4. EMAIL — transport (SMTP or mail())
 * ============================================================ */

/** Send HTML email via SMTP if configured, else PHP mail(). */
function sendHtmlEmail($toEmail, $toName, $subject, $htmlBody) {
    $smtpEnabled = getSettingValue('smtp_enabled', '0') === '1';
    $smtpHost = getSettingValue('smtp_host', '');
    $smtpPort = (int)getSettingValue('smtp_port', '587');
    $smtpUser = getSettingValue('smtp_user', '');
    $smtpPass = getSettingValue('smtp_pass', '');
    $smtpEnc = getSettingValue('smtp_encryption', 'tls');
    $fromEmail = getSettingValue('smtp_from_email', '') ?: ($smtpUser ?: 'noreply@cmms-tpt.local');
    $fromName = getSettingValue('smtp_from_name', 'CMMS-TPT');

    if ($smtpEnabled && !empty($smtpHost)) {
        return smtpSendMail($toEmail, $subject, $htmlBody, $fromEmail, $fromName, $smtpHost, $smtpPort, $smtpUser, $smtpPass, $smtpEnc);
    }

    // Fallback: PHP mail()
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $headers = [
        'MIME-Version: 1.0',
        'Content-type: text/html; charset=utf-8',
        'From: ' . encodeHeader($fromName) . ' <' . $fromEmail . '>',
        'X-Mailer: PHP/' . phpversion()
    ];
    return @mail($toEmail, $encodedSubject, $htmlBody, implode("\r\n", $headers));
}

/** Read a setting from `settings` table (cached per request). */
function getSettingValue($key, $default = '') {
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        try {
            $pdo = getDb();
            foreach ($pdo->query("SELECT setting_key, setting_value FROM settings")->fetchAll() as $r) {
                $cache[$r['setting_key']] = $r['setting_value'];
            }
        } catch (Exception $e) {
            $cache = [];
        }
    }
    return isset($cache[$key]) && $cache[$key] !== '' ? $cache[$key] : $default;
}

/** RFC2047 header encoding for UTF-8 */
function encodeHeader($text) {
    return '=?UTF-8?B?' . base64_encode($text) . '?=';
}

/**
 * Minimal SMTP client via fsockopen (STARTTLS / SSL / plain, AUTH LOGIN).
 * Returns true on success. No external dependencies (no PHPMailer needed).
 */
function smtpSendMail($toEmail, $subject, $htmlBody, $fromEmail, $fromName, $host, $port, $user = '', $pass = '', $encryption = 'tls') {
    $errno = 0; $errstr = '';
    $timeout = 10;

    $remote = ($encryption === 'ssl' && $port === 465) ? 'ssl://' . $host : $host;
    $fp = @fsockopen($remote, $port, $errno, $errstr, $timeout);
    if (!$fp) {
        error_log("SMTP connect failed: $errstr ($errno)");
        return false;
    }
    stream_set_timeout($fp, $timeout);

    $log = [];
    $readReply = function ($expect) use ($fp, &$log) {
        $reply = '';
        while ($line = fgets($fp, 515)) {
            $reply .= $line;
            if (isset($line[3]) && $line[3] === ' ') break; // multi-line ends with "NNN "
        }
        $log[] = trim($reply);
        return (int)substr(trim($reply), 0, 3) === $expect;
    };
    $send = function ($cmd) use ($fp, &$log) {
        fwrite($fp, $cmd . "\r\n");
        $log[] = 'C: ' . $cmd;
    };

    if (!$readReply(220)) { fclose($fp); error_log('SMTP no greeting: ' . implode(' | ', $log)); return false; }

    $helo = 'EHLO ' . (gethostname() ?: 'localhost');
    $send($helo);
    if (!$readReply(250)) { fclose($fp); return false; }

    if ($encryption === 'tls') {
        $send('STARTTLS');
        if (!$readReply(220)) { fclose($fp); return false; }
        $crypto = stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        if (!$crypto) { fclose($fp); error_log('SMTP STARTTLS failed'); return false; }
        $send($helo);
        if (!$readReply(250)) { fclose($fp); return false; }
    }

    if (!empty($user)) {
        $send('AUTH LOGIN');
        if (!$readReply(334)) { fclose($fp); return false; }
        $send(base64_encode($user));
        if (!$readReply(334)) { fclose($fp); return false; }
        $send(base64_encode($pass));
        if (!$readReply(235)) { fclose($fp); return false; }
    }

    $send('MAIL FROM:<' . $fromEmail . '>');
    if (!$readReply(250)) { fclose($fp); return false; }

    $send('RCPT TO:<' . $toEmail . '>');
    if (!$readReply(250)) { fclose($fp); return false; }

    $send('DATA');
    if (!$readReply(354)) { fclose($fp); return false; }

    $headers = "From: " . encodeHeader($fromName) . " <$fromEmail>\r\n"
        . "To: <$toEmail>\r\n"
        . "Subject: " . encodeHeader($subject) . "\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/html; charset=utf-8\r\n"
        . "X-Mailer: CMMS-TPT/SMTP\r\n";

    // dot-stuffing: a line starting with "." gets an extra "."
    $body = preg_replace('/^\./m', '..', $htmlBody);
    fwrite($fp, $headers . "\r\n" . $body . "\r\n.\r\n");
    $okData = $readReply(250);

    $send('QUIT');
    fclose($fp);

    if (!$okData) error_log('SMTP DATA rejected: ' . implode(' | ', $log));
    return $okData;
}

/* ============================================================
 * 5. EMAIL — legacy generic send (kept for backward compat)
 * ============================================================ */
function sendEmailNotification($toEmail, $toName, $title, $message, $targetUrl = '') {
    $subject = "[CMMS-TPT] " . strip_tags($title);
    $bodyHtml = "<b>" . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . "</b><br>" . nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
    $html = buildEmailHtml($toName, $subject, $bodyHtml, '#1d4ed8', 'เปิดดูในระบบ', $targetUrl);
    return sendHtmlEmail($toEmail, $toName, $subject, $html);
}
