<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
require_once __DIR__ . '/../../../src/csrf.php';
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $userId = (int)$_SESSION['user_id'];

    // Load .env LINE vars so helpers can use them
    $envPath = __DIR__ . '/../../../.env';
    if (file_exists($envPath) && function_exists('loadEnv')) loadEnv($envPath);

    switch ($method) {
        case 'GET':
            // 1) LINE-related settings + Telegram
            $keys = ['line_notify_enabled','line_notify_token','line_channel_access_token','line_channel_secret','line_channel_id','line_liff_id','line_callback_url','line_maintenance_group_id','low_stock_alert','maintenance_alert_days','email_notify_enabled','telegram_enabled','telegram_bot_token','telegram_chat_id'];
            $settings = [];
            $in = implode(',', array_fill(0, count($keys), '?'));
            $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($in)");
            $stmt->execute($keys);
            foreach ($stmt->fetchAll() as $r) { $settings[$r['setting_key']] = $r['setting_value']; }

            // 2) Notification templates (settings key prefix line_tpl_)
            $tplRows = $pdo->query("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'line_tpl_%'")->fetchAll();
            $templates = [];
            foreach ($tplRows as $r) {
                $templates[$r['setting_key']] = json_decode($r['setting_value'], true) ?: ['header_color' => '#1d4ed8', 'header_title' => '', 'body_text' => '', 'btn_label' => 'เปิดดูในระบบ', 'enabled' => '1', 'image_before' => '', 'image_after' => ''];
            }

            // 3) Current user LINE binding status
            $stmt = $pdo->prepare("SELECT id, full_name, line_user_id FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $me = $stmt->fetch();

            // 4) Default templates if none saved
            $defaults = [
                'line_tpl_breakdown' => ['header_color' => '#dc2626', 'header_title' => '🚨 แจ้งซ่อมด่วน #{work_order_id}', 'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nอาการเสีย: {title}\nความเร่งด่วน: {priority} | สถานะ: {status}\nผู้แจ้งซ่อม: {reporter_name}", 'btn_label' => '⚡ รับงานซ่อมด่วน', 'enabled' => '1', 'image_before' => '', 'image_after' => ''],
                'line_tpl_pm_overdue' => ['header_color' => '#d97706', 'header_title' => '📋 แผน PM เกินกำหนด #{work_order_id}', 'body_text' => "เครื่องจักร: {asset_code}\nรายการ: {title}\nกำหนดชำระ: {due_date} (เกินมา {days_overdue} วัน)", 'btn_label' => '📝 เปิดเช็คชีท PM', 'enabled' => '1', 'image_before' => '', 'image_after' => ''],
                'line_tpl_low_stock' => ['header_color' => '#7c3aed', 'header_title' => '📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ', 'body_text' => "รหัสอะไหล่: {item_code}\nชื่ออะไหล่: {item_name}\nคงเหลือ: {qty} (ขั้นต่ำ: {min_stock})", 'btn_label' => '🛒 สั่งซื้อ/เบิกจ่าย', 'enabled' => '1', 'image_before' => '', 'image_after' => ''],
                'line_tpl_completed' => ['header_color' => '#16a34a', 'header_title' => '✅ ซ่อมเสร็จเรียบร้อย #{work_order_id}', 'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nDowntime: {downtime_hours} ชม.\nค่าซ่อมรวม: {total_cost} บาท\nช่างผู้ปิดงาน: {assigned_name}", 'btn_label' => '📊 ประเมินผลงาน', 'enabled' => '1', 'image_before' => '', 'image_after' => ''],
                'line_tpl_sage_approval' => ['header_color' => '#7c3aed', 'header_title' => '📦 ขออนุมัติเบิกอะไหล่ #{requisition_no}', 'body_text' => "รายการ: {items_summary}\nผู้ขอเบิก: {requester_name}\nรวมมูลค่า: {total_amount} บาท", 'btn_label' => '✔ อนุมัติการเบิก', 'enabled' => '1', 'image_before' => '', 'image_after' => ''],
            ];
            foreach ($defaults as $k => $d) {
                if (!isset($templates[$k])) $templates[$k] = $d;
            }

            // order templates
            $ordered = [];
            foreach (['line_tpl_breakdown','line_tpl_pm_overdue','line_tpl_low_stock','line_tpl_completed','line_tpl_sage_approval'] as $k) {
                if (isset($templates[$k])) $ordered[$k] = $templates[$k];
            }

            echo json_encode([
                'settings' => $settings,
                'templates' => $ordered,
                'me' => ['id' => $me['id'], 'full_name' => $me['full_name'], 'line_bound' => !empty($me['line_user_id'])],
                'env' => [
                    'channel_token_set' => !empty(getenv('LINE_CHANNEL_ACCESS_TOKEN')),
                    'channel_secret_set' => !empty(getenv('LINE_CHANNEL_SECRET')),
                    'channel_id' => getenv('LINE_CHANNEL_ID') ?: getenv('LINE_CLIENT_ID') ?: '',
                    'liff_id_env' => getenv('LINE_LIFF_ID') ?: '',
                    'telegram_bot_token_set' => !empty(getenv('TELEGRAM_BOT_TOKEN')),
                    'telegram_chat_id_set' => !empty(getenv('TELEGRAM_CHAT_ID')),
                ],
                'help' => [
                    'variables' => ['{work_order_id}','{asset_code}','{asset_name}','{title}','{priority}','{status}','{reporter_name}','{assigned_name}','{due_date}','{days_overdue}','{item_code}','{item_name}','{qty}','{min_stock}','{downtime_hours}','{total_cost}','{requisition_no}','{items_summary}','{requester_name}','{total_amount}'],
                ],
            ]);
            break;

        case 'PUT':
            // Save: { settings: {key:value}, templates: {line_tpl_x: {...}} }
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }

            $upsert = $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, 'notification', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
            $count = 0;

            $allowedSettings = ['line_notify_enabled','line_notify_token','line_channel_access_token','line_channel_secret','line_channel_id','line_liff_id','line_callback_url','line_maintenance_group_id','low_stock_alert','maintenance_alert_days','email_notify_enabled','telegram_enabled','telegram_bot_token','telegram_chat_id'];
            foreach (($data['settings'] ?? []) as $k => $v) {
                if (!in_array($k, $allowedSettings, true)) continue;
                $desc = ['line_notify_enabled' => 'เปิด/ปิดการแจ้งเตือนผ่าน LINE', 'line_notify_token' => 'LINE Notify Access Token (รูปแบบ xxxx:xxxx)', 'line_channel_access_token' => 'LINE Messaging API Channel Access Token', 'line_channel_secret' => 'LINE Channel Secret', 'line_channel_id' => 'LINE Channel ID / Login Client ID', 'line_liff_id' => 'LIFF App ID (สำหรับเปิดระบบใน LINE มือถือ)', 'line_callback_url' => 'URL รับ callback จาก LINE Login (ต้องเป็น HTTPS)', 'line_maintenance_group_id' => 'Group ID ของห้อง LINE กลุ่มช่าง (เมื่องานใหม่เข้า → push เข้ากลุ่ม)', 'low_stock_alert' => 'แจ้งเตือนเมื่อสต็อกต่ำกว่าขั้นต่ำ (0=ปิด,1=เปิด)', 'maintenance_alert_days' => 'จำนวนวันแจ้งเตือนล่วงหน้าก่อนถึงกำหนดบำรุงรักษา', 'email_notify_enabled' => 'เปิด/ปิดการแจ้งเตือนผ่านอีเมล', 'telegram_enabled' => 'เปิด/ปิดการแจ้งเตือนแอดมินผ่าน Telegram', 'telegram_bot_token' => 'Telegram Bot Token (จาก @BotFather)', 'telegram_chat_id' => 'Telegram Chat ID ที่รับการแจ้งเตือนแอดมิน'][$k] ?? '';
                $upsert->execute([$k, (string)$v, $desc]);
                $count++;
            }

            // แจ้งเตือนแอดมิน (Telegram) เมื่อมีใครแก้ไขการตั้งค่าการแจ้งเตือน
            if ($count > 0) {
                try {
                    $me = $pdo->prepare("SELECT full_name FROM users WHERE id = ?");
                    $me->execute([$userId]);
                    $name = $me->fetchColumn() ?: "User#$userId";
                    telegramAdminAlert('การตั้งค่าการแจ้งเตือนถูกแก้ไข', "$name บันทึกการตั้งค่า LINE/Telegram จำนวน $count รายการ", publicBaseUrl() . '/settings/notifications', 'INFO');
                } catch (Exception $e) {}
            }

            $tplKeys = ['line_tpl_breakdown','line_tpl_pm_overdue','line_tpl_low_stock','line_tpl_completed','line_tpl_sage_approval'];
            foreach (($data['templates'] ?? []) as $k => $tpl) {
                if (!in_array($k, $tplKeys, true)) continue;
                $clean = [
                    'header_color' => preg_match('/^#[0-9a-fA-F]{6}$/', $tpl['header_color'] ?? '') ? $tpl['header_color'] : '#1d4ed8',
                    'header_title' => mb_substr($tpl['header_title'] ?? '', 0, 200),
                    'body_text' => mb_substr($tpl['body_text'] ?? '', 0, 2000),
                    'btn_label' => mb_substr($tpl['btn_label'] ?? 'เปิดดูในระบบ', 0, 100),
                    'image_before' => mb_substr(trim($tpl['image_before'] ?? ''), 0, 500),
                    'image_after' => mb_substr(trim($tpl['image_after'] ?? ''), 0, 500),
                    'enabled' => (($tpl['enabled'] ?? '1') === '1' || ($tpl['enabled'] ?? '1') === true) ? '1' : '0',
                ];
                $upsert->execute([$k, json_encode($clean, JSON_UNESCAPED_UNICODE), 'Notification template: ' . str_replace('line_tpl_', '', $k)]);
                $count++;
            }

            echo json_encode(['success' => true, 'saved' => $count]);
            break;

        case 'POST':
            // A) LIFF binding: { bind_liff_user_id, display_name? }
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            if (!empty($data['bind_liff_user_id'])) {
                $liffUid = mb_substr(trim($data['bind_liff_user_id']), 0, 100);
                $pdo->prepare("UPDATE users SET line_user_id = ? WHERE id = ?")->execute([$liffUid, $userId]);
                echo json_encode(['success' => true, 'bound' => true, 'line_user_id' => $liffUid]);
                exit;
            }

            // B2) Telegram test send: { telegram_test: true, message? }
            if (!empty($data['telegram_test'])) {
                $msg = mb_substr((string)($data['message'] ?? '🧪 ทดสอบการแจ้งเตือนแอดมิน CMMS-TPT — Telegram เชื่อมต่อเรียบร้อย'), 0, 1000);
                $ok = sendTelegramMessage($msg);
                if ($ok) {
                    echo json_encode(['success' => true, 'message' => 'ส่งข้อความทดสอบ Telegram ไปยังแอดมินสำเร็จ']);
                } else {
                    http_response_code(500);
                    echo json_encode(['error' => 'ส่ง Telegram ไม่สำเร็จ — ตรวจ Bot Token / Chat ID (ตั้งในหน้า Settings หรือ .env)']);
                }
                exit;
            }

            // B) Test send: { template_key?, to_user_id? (default self), custom?: {...} }
            $toUserId = (int)($data['to_user_id'] ?? $userId);

            $stmt = $pdo->prepare("SELECT id, full_name, line_user_id FROM users WHERE id = ?");
            $stmt->execute([$toUserId]);
            $target = $stmt->fetch();
            if (!$target || empty($target['line_user_id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'ผู้ใช้รายนี้ยังไม่ได้ผูก LINE User ID กรุณาผูกบัญชี LINE ก่อนทดสอบ']);
                exit;
            }

            // Build message from template or custom
            if (!empty($data['custom'])) {
                $title = mb_substr($data['custom']['header_title'] ?? 'ทดสอบการแจ้งเตือน CMMS-TPT', 0, 200);
                $body = mb_substr($data['custom']['body_text'] ?? 'ข้อความทดสอบจากระบบ CMMS-TPT', 0, 2000);
                $btnLabel = mb_substr($data['custom']['btn_label'] ?? 'เปิดดูในระบบ', 0, 100);
                $btnUrl = $data['custom']['btn_url'] ?? (getenv('LINE_CALLBACK_URL') ?: '');
            } else {
                $key = $data['template_key'] ?? 'line_tpl_breakdown';
                $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = ?");
                $stmt->execute([$key]);
                $raw = $stmt->fetchColumn();
                $tpl = $raw ? (json_decode($raw, true) ?: []) : [];
                $title = $tpl['header_title'] ?? '🔔 แจ้งเตือน CMMS-TPT';
                $body = $tpl['body_text'] ?? 'ข้อความทดสอบ';
                $btnLabel = $tpl['btn_label'] ?? 'เปิดดูในระบบ';
                $btnUrl = getenv('LINE_CALLBACK_URL') ?: '';
                // substitute sample variables
                $sample = [
                    '{work_order_id}' => 'WO-TEST-1001', '{asset_code}' => 'MCH-01', '{asset_name}' => 'Press Machine 01',
                    '{title}' => 'เสียงดังผิดปกติที่มอเตอร์', '{priority}' => 'CRITICAL', '{status}' => 'IN_PROGRESS',
                    '{reporter_name}' => 'อนันต์ พนักงานคุมเครื่องพิมพ์', '{assigned_name}' => 'สมศักดิ์ ช่างซ่อมบำรุง',
                    '{due_date}' => date('Y-m-d'), '{days_overdue}' => '2', '{item_code}' => 'SUP0010917',
                    '{item_name}' => 'เทอร์มินอลโทรศัพท์สีขาว LINE', '{qty}' => '3', '{min_stock}' => '5',
                    '{downtime_hours}' => '2.5', '{total_cost}' => '4,500', '{requisition_no}' => 'REQ-TEST-001',
                    '{items_summary}' => 'Bearing 6204 x 2', '{requester_name}' => 'วิชัย ช่างไฟและกลการ', '{total_amount}' => '1,250',
                ];
                foreach ($sample as $var => $val) { $title = str_replace($var, $val, $title); $body = str_replace($var, $val, $body); }
            }

            if (empty($btnUrl)) $btnUrl = 'https://line.me/';
            $headerColor = $tpl['header_color'] ?? '#1d4ed8';
            $headerText  = $tpl['header_title'] ?? '🔔 CMMS-TPT NOTIFICATION';
            $btnLabel    = $tpl['btn_label'] ?? 'ดูรายละเอียดในระบบ';

            // รูปก่อน/หลังซ่อมจาก template — ถ้าไม่ได้ตั้ง URL ไว้ ใช้รูปตัวอย่างให้เห็นเลย์เอาต์ตอนทดสอบ
            $imgBefore = trim($tpl['image_before'] ?? '');
            $imgAfter  = trim($tpl['image_after'] ?? '');
            if ($imgBefore !== '' || $imgAfter !== '') {
                $photos = [
                    'before' => $imgBefore !== '' ? [$imgBefore] : [],
                    'after'  => $imgAfter !== '' ? [$imgAfter] : [],
                ];
            } else {
                $photos = [
                    'before' => ['https://picsum.photos/seed/cmms-before/400/300'],
                    'after'  => ['https://picsum.photos/seed/cmms-after/400/300'],
                ];
            }
            $ok = sendLinePushMessage($target['line_user_id'], $title, $body, $btnUrl, $photos, $headerColor, $headerText, $btnLabel);
            if ($ok) {
                echo json_encode(['success' => true, 'message' => "ส่งข้อความทดสอบ LINE ไปยัง {$target['full_name']} สำเร็จ"]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'การส่ง LINE Push Message ไม่สำเร็จ กรุณาตรวจสอบ LINE Channel Access Token / Secret / Callback URL']);
            }
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
