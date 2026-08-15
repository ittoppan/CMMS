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
function sendLinePushMessage($lineUserId, $title, $message, $targetUrl = '', $photos = [], $headerColor = '#1d4ed8', $headerText = '🔔 CMMS-TPT NOTIFICATION', $btnLabel = 'ดูรายละเอียดในระบบ', $opts = []) {
    $channelAccessToken = getenv('LINE_CHANNEL_ACCESS_TOKEN') ?: getenv('LINE_CHANNEL_SECRET');
    if (empty($channelAccessToken)) {
        error_log("LINE_CHANNEL_ACCESS_TOKEN is missing in .env");
        return false;
    }

    $url = 'https://api.line.me/v2/bot/message/push';

    // Normalize รูป: รองรับ 1) items (รูป+ชื่อทีละรายการ เช่น ใบเบิกอะไหล่) 2) before/after 3) array ธรรมดา
    $beforeUrls = []; $afterUrls = []; $flatUrls = []; $spareItemRows = [];
    if (isset($photos['items']) && is_array($photos['items'])) {
        // แต่ละรายการ = แถวแนวนอน [รูปเล็ก] [ชื่อ + จำนวน]
        foreach (array_slice($photos['items'], 0, 8) as $it) {
            $itName = (string)($it['name'] ?? '');
            $itUrl  = trim((string)($it['url'] ?? ''));
            if ($itName === '' && $itUrl === '') continue;
            $rowContents = [];
            if ($itUrl !== '') {
                $rowContents[] = [
                    'type' => 'image',
                    'url' => $itUrl,
                    'size' => 'sm',
                    'aspectRatio' => '1:1',
                    'aspectMode' => 'cover',
                    'flex' => 2,
                    'action' => ['type' => 'uri', 'uri' => $defaultTapUrl],
                ];
            }
            $rowContents[] = [
                'type' => 'box',
                'layout' => 'vertical',
                'flex' => 5,
                'justifyContent' => 'center',
                'contents' => [
                    ['type' => 'text', 'text' => $itName, 'size' => 'xs', 'weight' => 'bold', 'wrap' => true, 'color' => '#1e293b'],
                ],
            ];
            $spareItemRows[] = ['type' => 'box', 'layout' => 'horizontal', 'margin' => 'md', 'spacing' => 'sm', 'contents' => $rowContents];
        }
    } elseif (array_key_exists('before', $photos) || array_key_exists('after', $photos)) {
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
        'size' => $opts['body_size'] ?? 'sm',
        'color' => $opts['body_color'] ?? '#475569',
        'weight' => $opts['body_weight'] ?? 'regular',
        'align' => $opts['body_align'] ?? 'start',
        'wrap' => (($opts['body_wrap'] ?? '1') == '1') ? true : false,
        'margin' => 'md'
    ];
    if (($opts['body_separator'] ?? '0') == '1') {
        $bodyContents[] = ['type' => 'separator', 'margin' => 'md'];
    }
    foreach ($photoBoxes as $pb) $bodyContents[] = $pb;
    // แถวรูป+ชื่อทีละรายการ (ใบเบิกอะไหล่) — ต่อท้ายเนื้อหา
    if ($spareItemRows) {
        $bodyContents[] = ['type' => 'text', 'text' => 'รายการที่ขอเบิก', 'size' => 'xs', 'weight' => 'bold', 'color' => '#b45309', 'margin' => 'lg'];
        foreach ($spareItemRows as $ir) $bodyContents[] = $ir;
    }

    // ── สไตล์ละเอียด (จากหน้า /settings/notifications) — backward compatible ──
    $headerTextColor = $opts['header_text_color'] ?? '#ffffff';
    $headerAlign     = $opts['header_align'] ?? 'start';
    $headerSubtitle  = (string)($opts['header_subtitle'] ?? '');
    $headerContents  = [
        [
            'type' => 'text',
            'text' => $headerText,
            'color' => $headerTextColor,
            'weight' => $opts['header_weight'] ?? 'bold',
            'size' => $opts['header_size'] ?? 'xs',
            'wrap' => true,
            'align' => $headerAlign
        ]
    ];
    if ($headerSubtitle !== '') {
        $headerContents[] = [
            'type' => 'text',
            'text' => $headerSubtitle,
            'color' => $headerTextColor,
            'size' => 'xxs',
            'wrap' => true,
            'margin' => 'xs',
            'align' => $headerAlign,
            'opacity' => 0.75
        ];
    }

    // ปุ่มใน footer: 1 ปุ่มหลัก + (ถ้าตั้ง) ปุ่มที่ 2
    $footerButtons = [];
    $btnStyle   = $opts['btn_style'] ?? 'primary';
    $btnColor   = $opts['btn_color'] ?? '#06C755';
    $btnTxtColor = $opts['btn_text_color'] ?? '#ffffff';
    $btnHeight = in_array($opts['btn_height'] ?? 'md', ['sm', 'md', 'lg'], true) ? ($opts['btn_height'] ?? 'md') : 'md';
    // โหมดปุ่มกด: 'postback' (อนุมัติผ่าน LINE — ดึง repair id จาก targetUrl) หรือ 'uri' (ลิงก์เปิดหน้า)
    $postbackRid = 0;
    if (($opts['btn_postback'] ?? '0') == '1') {
        parse_str((string)parse_url((string)$defaultTapUrl, PHP_URL_QUERY), $pq);
        $postbackRid = (int)($pq['id'] ?? 0);
    }
    $isPostback = $postbackRid > 0 && ($opts['btn_postback'] ?? '0') == '1';
    $footerButtons[] = [
        'type' => 'button',
        'action' => $isPostback
            ? ['type' => 'postback', 'data' => 'spare_approve=' . $postbackRid, 'label' => $btnLabel]
            : ['type' => 'uri', 'label' => $btnLabel, 'uri' => $defaultTapUrl],
        'style' => $btnStyle,
        'color' => $btnStyle === 'link' ? $btnColor : ($btnStyle === 'secondary' ? $btnTxtColor : $btnColor),
        'height' => $btnHeight,
    ];
    $btn2Label = (string)($opts['btn2_label'] ?? '');
    if ($btn2Label !== '') {
        $btn2Url = trim((string)($opts['btn2_url'] ?? '')) ?: $defaultTapUrl;
        $footerButtons[] = [
            'type' => 'button',
            'action' => $isPostback
                ? ['type' => 'postback', 'data' => 'spare_reject=' . $postbackRid, 'label' => $btn2Label]
                : ['type' => 'uri', 'label' => $btn2Label, 'uri' => $btn2Url],
            'style' => 'secondary',
            'color' => $btnColor,
            'margin' => 'sm',
            'height' => $btnHeight,
        ];
    }

    $bubble = [
        'type' => 'bubble',
        'backgroundColor' => $opts['container_bg'] ?? '#ffffff',
        'borderColor'     => $opts['border_color'] ?? '#e2e8f0',
        'cornerRadius'    => $opts['corner_radius'] ?? 'lg',
    ];
    $bubbleDirection = ($opts['bubble_direction'] ?? 'ltr') === 'rtl' ? 'rtl' : 'ltr';
    if ($bubbleDirection !== 'ltr') $bubble['direction'] = $bubbleDirection;
    $bubbleSize = (string)($opts['bubble_size'] ?? '');
    if ($bubbleSize !== '') $bubble['size'] = $bubbleSize;
    $bubble['header'] = [
        'type' => 'box',
        'layout' => 'vertical',
        'backgroundColor' => preg_match('/^#[0-9a-fA-F]{6}$/', (string)$headerColor) ? $headerColor : '#1d4ed8',
        'paddingAll' => in_array($opts['header_padding'] ?? 'md', ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? ($opts['header_padding'] ?? 'md') : 'md',
        'contents' => $headerContents
    ];
    $heroImage = trim((string)($opts['hero_image'] ?? ''));
    if ($heroImage !== '') {
        $bubble['hero'] = [
            'type' => 'image',
            'url' => $heroImage,
            'size' => in_array($opts['hero_size'] ?? 'full', ['full', 'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl'], true) ? ($opts['hero_size'] ?? 'full') : 'full',
            'aspectRatio' => $opts['hero_ratio'] ?? '4:3',
            'aspectMode' => ($opts['hero_mode'] ?? 'cover') === 'fit' ? 'fit' : 'cover',
            'action' => ['type' => 'uri', 'uri' => $defaultTapUrl]
        ];
    }
    $bodyBox = ['type' => 'box', 'layout' => 'vertical', 'contents' => $bodyContents];
    $bodyPadding = in_array($opts['body_padding'] ?? 'md', ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? ($opts['body_padding'] ?? 'md') : 'md';
    if ($bodyPadding !== 'md') $bodyBox['paddingAll'] = $bodyPadding;
    $bodySpacing = in_array($opts['body_spacing'] ?? 'none', ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? ($opts['body_spacing'] ?? 'none') : 'none';
    if ($bodySpacing !== 'none') $bodyBox['spacing'] = $bodySpacing;
    $bodyBg = trim((string)($opts['body_background'] ?? ''));
    if ($bodyBg !== '' && preg_match('/^#[0-9a-fA-F]{6}$/', $bodyBg)) $bodyBox['backgroundColor'] = $bodyBg;
    $bodyJustify = in_array($opts['body_justify'] ?? 'flex-start', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'], true) ? ($opts['body_justify'] ?? 'flex-start') : 'flex-start';
    if ($bodyJustify !== 'flex-start') $bodyBox['justifyContent'] = $bodyJustify;
    $bubble['body'] = $bodyBox;
    $bubble['footer'] = ['type' => 'box', 'layout' => 'vertical', 'contents' => $footerButtons];

    $flexPayload = [
        'to' => $lineUserId,
        'messages' => [
            [
                'type' => 'flex',
                'altText' => "🔔 $title: $message",
                'contents' => $bubble
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

    // เขียนประวัติการส่ง LINE (ใคร / เมื่อไหร่ / เทมเพลตไหน) — ดูได้ที่ /notifications/history
    logLineSend(
        $lineUserId,
        (string)($opts['tpl_key'] ?? ''),
        $httpCode === 200 ? 'SENT' : 'FAILED',
        $title . ': ' . $message,
        $response
    );
    return ($httpCode === 200);
}

/**
 * เขียน log การส่ง LINE ลง notification_logs (recipient + template)
 * - recipient: line_user_id (U...) หรือ group id (C...) — หน้า history join users แสดงชื่อ
 * - template: ชื่อเทมเพลต line_tpl_* (ว่าง = ข้อความทั่วไป)
 */
function logLineSend($recipient, $template = '', $status = 'SENT', $content = '', $raw = null) {
    try {
        $pdo = getDb();
        $pdo->prepare(
            "INSERT INTO notification_logs (channel, status, recipient, template, content, raw_response, created_at)
             VALUES ('LINE', ?, ?, ?, ?, ?, NOW())"
        )->execute([
            $status,
            mb_substr((string)$recipient, 0, 100),
            mb_substr((string)$template, 0, 60),
            mb_substr((string)$content, 0, 500),
            $raw !== null ? mb_substr((string)$raw, 0, 2000) : null,
        ]);
    } catch (Exception $e) {
        error_log('[line] logLineSend failed: ' . $e->getMessage());
    }
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
        'line_tpl_work_assign' => [
            'header_color' => '#0891b2',
            'header_title' => '🔧 งานถูกมอบหมายให้คุณ #{work_order_id}',
            'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nงาน: {title}\nความเร่งด่วน: {priority} | สถานะ: {status}\nผู้มอบหมาย: {assigner_name}",
            'btn_label' => '📋 ดูรายละเอียดงาน',
            'enabled' => '1', 'image_before' => '', 'image_after' => '',
        ],
        'line_tpl_spare_request' => [
            'header_color' => '#b45309',
            'header_title' => '🧰 ขอเบิกอะไหล่ #{work_order_id} รออนุมัติ',
            'body_text' => "รายการ: {items_summary}\nช่างผู้ขอเบิก: {requester_name}\nรวมมูลค่า: {total_cost} บาท",
            'btn_label' => '✅ อนุมัติการเบิก',
            'btn2_label' => '❌ ไม่อนุมัติ',
            'btn_postback' => '1',
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
    $hex6 = function ($v, $fallback) { return preg_match('/^#[0-9a-fA-F]{6}$/', (string)$v) ? (string)$v : $fallback; };
    $pick = function ($key, $fallback) use ($tpl, $d) { return $tpl[$key] ?? $d[$key] ?? $fallback; };
    return [
        'header_color'      => $hex6($pick('header_color', $d['header_color'] ?? '#1d4ed8'), $d['header_color'] ?? '#1d4ed8'),
        'header_title'      => (string)($tpl['header_title'] ?? $d['header_title']),
        'header_subtitle'   => (string)$pick('header_subtitle', ''),
        'header_text_color' => $hex6($pick('header_text_color', '#ffffff'), '#ffffff'),
        'header_align'      => in_array($pick('header_align', 'start'), ['start', 'center', 'end'], true) ? $pick('header_align', 'start') : 'start',
        'header_size'       => in_array($pick('header_size', 'xs'), ['xxs', 'xs', 'sm', 'md'], true) ? $pick('header_size', 'xs') : 'xs',
        'header_weight'     => in_array($pick('header_weight', 'bold'), ['regular', 'bold'], true) ? $pick('header_weight', 'bold') : 'bold',
        'header_padding'    => in_array($pick('header_padding', 'md'), ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? $pick('header_padding', 'md') : 'md',
        'hero_image'        => trim((string)$pick('hero_image', '')),
        'hero_ratio'        => in_array($pick('hero_ratio', '4:3'), ['1.91:1', '16:9', '4:3', '1:1'], true) ? $pick('hero_ratio', '4:3') : '4:3',
        'hero_size'         => in_array($pick('hero_size', 'full'), ['full', 'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl'], true) ? $pick('hero_size', 'full') : 'full',
        'hero_mode'         => in_array($pick('hero_mode', 'cover'), ['cover', 'fit'], true) ? $pick('hero_mode', 'cover') : 'cover',
        'body_text'         => (string)($tpl['body_text'] ?? $d['body_text']),
        'body_color'        => $hex6($pick('body_color', '#475569'), '#475569'),
        'body_size'         => in_array($pick('body_size', 'sm'), ['xs', 'sm', 'md'], true) ? $pick('body_size', 'sm') : 'sm',
        'body_weight'       => in_array($pick('body_weight', 'regular'), ['regular', 'bold'], true) ? $pick('body_weight', 'regular') : 'regular',
        'body_align'        => in_array($pick('body_align', 'start'), ['start', 'center', 'end'], true) ? $pick('body_align', 'start') : 'start',
        'body_wrap'         => (($pick('body_wrap', '1') == '1' || $pick('body_wrap', '1') === true)) ? '1' : '0',
        'body_spacing'      => in_array($pick('body_spacing', 'none'), ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? $pick('body_spacing', 'none') : 'none',
        'body_padding'      => in_array($pick('body_padding', 'md'), ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? $pick('body_padding', 'md') : 'md',
        'body_background'   => ($pick('body_background', '') !== '' && preg_match('/^#[0-9a-fA-F]{6}$/', (string)$pick('body_background', ''))) ? (string)$pick('body_background', '') : '',
        'body_justify'      => in_array($pick('body_justify', 'flex-start'), ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'], true) ? $pick('body_justify', 'flex-start') : 'flex-start',
        'body_separator'    => (($pick('body_separator', '0') == '1' || $pick('body_separator', '0') === true)) ? '1' : '0',
        'btn_label'         => (string)($tpl['btn_label'] ?? $d['btn_label']),
        'btn_color'         => $hex6($pick('btn_color', '#06C755'), '#06C755'),
        'btn_text_color'    => $hex6($pick('btn_text_color', '#ffffff'), '#ffffff'),
        'btn_style'         => in_array($pick('btn_style', 'primary'), ['primary', 'secondary', 'link'], true) ? $pick('btn_style', 'primary') : 'primary',
        'btn_height'        => in_array($pick('btn_height', 'md'), ['sm', 'md', 'lg'], true) ? $pick('btn_height', 'md') : 'md',
        'btn2_label'        => (string)$pick('btn2_label', ''),
        'btn2_url'          => trim((string)$pick('btn2_url', '')),
        'btn_postback'      => (($pick('btn_postback', $d['btn_postback'] ?? '0') == '1' || $pick('btn_postback', $d['btn_postback'] ?? '0') === true)) ? '1' : '0',
        'image_before'      => trim((string)($tpl['image_before'] ?? $d['image_before'] ?? '')),
        'image_after'       => trim((string)($tpl['image_after'] ?? $d['image_after'] ?? '')),
        'container_bg'      => $hex6($pick('container_bg', '#ffffff'), '#ffffff'),
        'border_color'      => $hex6($pick('border_color', '#e2e8f0'), '#e2e8f0'),
        'corner_radius'     => in_array($pick('corner_radius', 'lg'), ['none', 'xs', 'sm', 'md', 'lg', 'xl'], true) ? $pick('corner_radius', 'lg') : 'lg',
        'bubble_direction'  => in_array($pick('bubble_direction', 'ltr'), ['ltr', 'rtl'], true) ? $pick('bubble_direction', 'ltr') : 'ltr',
        'bubble_size'       => in_array($pick('bubble_size', ''), ['', 'nano', 'micro', 'deci', 'hecto', 'kilo', 'mega', 'giga'], true) ? $pick('bubble_size', '') : '',
        'enabled'           => (($tpl['enabled'] ?? $d['enabled'] ?? '1') == '1' || ($tpl['enabled'] ?? '1') === true) ? '1' : '0',
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
    $opts = [
        'header_text_color' => $tpl['header_text_color'],
        'header_subtitle'   => $tpl['header_subtitle'],
        'header_align'      => $tpl['header_align'],
        'header_size'       => $tpl['header_size'],
        'header_weight'     => $tpl['header_weight'],
        'header_padding'    => $tpl['header_padding'],
        'hero_image'        => $tpl['hero_image'],
        'hero_ratio'        => $tpl['hero_ratio'],
        'hero_size'         => $tpl['hero_size'],
        'hero_mode'         => $tpl['hero_mode'],
        'body_color'        => $tpl['body_color'],
        'body_size'         => $tpl['body_size'],
        'body_weight'       => $tpl['body_weight'],
        'body_align'        => $tpl['body_align'],
        'body_wrap'         => $tpl['body_wrap'],
        'body_spacing'      => $tpl['body_spacing'],
        'body_padding'      => $tpl['body_padding'],
        'body_background'   => $tpl['body_background'],
        'body_justify'      => $tpl['body_justify'],
        'body_separator'    => $tpl['body_separator'],
        'btn_color'         => $tpl['btn_color'],
        'btn_text_color'    => $tpl['btn_text_color'],
        'btn_style'         => $tpl['btn_style'],
        'btn_height'        => $tpl['btn_height'],
        'btn2_label'        => $tpl['btn2_label'],
        'btn2_url'          => $tpl['btn2_url'],
        'btn_postback'      => $tpl['btn_postback'],
        'container_bg'      => $tpl['container_bg'],
        'border_color'      => $tpl['border_color'],
        'corner_radius'     => $tpl['corner_radius'],
        'bubble_direction'  => $tpl['bubble_direction'],
        'bubble_size'       => $tpl['bubble_size'],
        'tpl_key'           => $tplKey,
    ];
    return sendLinePushMessage($lineUserId, $title, $body, $targetUrl, $photos, $tpl['header_color'], $title, $btnLabel, $opts);
}

/**
 * ส่ง LINE งานถูกมอบหมายถึงช่างผู้รับ (line_tpl_work_assign) — เฉพาะผู้ใช้ที่ผูก LINE แล้ว
 * @return bool ส่งสำเร็จหรือไม่
 */
function lineNotifyAssigned($assigneeUserId, array $vars = [], $targetUrl = '') {
    if (getSettingValue('line_notify_enabled', '0') !== '1') return false;
    $pdo = getDb();
    $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
    $st->execute([(int)$assigneeUserId]);
    $lid = $st->fetchColumn();
    if (!$lid) return false;
    return sendLineTemplatePush((string)$lid, 'line_tpl_work_assign', $vars, $targetUrl);
}

/**
 * ส่ง LINE ขอเบิกอะไหล่ให้หัวหน้า/แอดมินอนุมัติ (line_tpl_spare_request)
 * - เป้าหมาย: ผู้ใช้ role Admin/Manager (role_id 1,2) ที่ผูก LINE แล้ว
 * - ถ้าไม่มีใครผูก LINE → ส่งเข้ากลุ่ม LINE ช่าง (ถ้าตั้งไว้)
 * @return int จำนวนที่ส่งสำเร็จ
 */
function lineNotifySpareRequest(array $vars = [], $targetUrl = '', array $photos = []) {
    if (getSettingValue('line_notify_enabled', '0') !== '1') return 0;
    $pdo = getDb();
    $st = $pdo->query("SELECT line_user_id FROM users WHERE role_id IN (1,2) AND is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''");
    $targets = $st->fetchAll(PDO::FETCH_COLUMN);
    if (empty($targets)) {
        $gid = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_maintenance_group_id'")->fetchColumn();
        if ($gid && getSettingValue('line_group_enabled', '1') === '1') $targets[] = (string)$gid;
    }
    $sent = 0;
    foreach (array_unique($targets) as $tid) {
        if (sendLineTemplatePush($tid, 'line_tpl_spare_request', $vars, $targetUrl, $photos)) $sent++;
    }
    return $sent;
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
