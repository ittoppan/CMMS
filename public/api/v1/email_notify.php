<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
if (empty($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

/* ============================================================
 * Email Notification Settings API
 * GET  → settings (SMTP) + templates (from email_notifications)
 * PUT  → save settings + templates
 * POST → test send { template_key, to_email? }
 * ============================================================ */

// Map UI template keys → (module, event)
const EMAIL_TPL_MAP = [
    'email_tpl_breakdown'   => ['repair', 'created'],
    'email_tpl_pm_overdue'  => ['pm_am', 'due_soon'],
    'email_tpl_low_stock'   => ['inventory', 'low_stock'],
    'email_tpl_completed'   => ['repair', 'resolved'],
    'email_tpl_sage_approval' => ['sage', 'approval'],
];

const EMAIL_TPL_LABELS = [
    'email_tpl_breakdown'   => ['label' => 'แจ้งซ่อมด่วน (Breakdown)', 'icon' => '🚨', 'hint' => 'ส่งเมื่อมีใบแจ้งซ่อมฉุกเฉิน / เครื่องหยุดทำงาน'],
    'email_tpl_pm_overdue'  => ['label' => 'แผน PM เกินกำหนด', 'icon' => '📋', 'hint' => 'ส่งเมื่อแผน PM ยังไม่เสร็จเกินกำหนดชำระ'],
    'email_tpl_low_stock'   => ['label' => 'สต็อกต่ำกว่าจุดสั่งซื้อ', 'icon' => '📦', 'hint' => 'ส่งเมื่ออะไหล่คงเหลือต่ำกว่า min_stock'],
    'email_tpl_completed'   => ['label' => 'งานซ่อมเสร็จเรียบร้อย', 'icon' => '✅', 'hint' => 'ส่งเมื่อปิดใบสั่งงานซ่อมสำเร็จ'],
    'email_tpl_sage_approval' => ['label' => 'ขออนุมัติเบิก Sage', 'icon' => '📑', 'hint' => 'ส่งเมื่อมีการขออนุมัติเบิกอะไหล่ผ่าน Sage 300'],
];

const EMAIL_SETTING_KEYS = [
    'email_notify_enabled', 'smtp_enabled', 'smtp_host', 'smtp_port',
    'smtp_encryption', 'smtp_user', 'smtp_pass', 'smtp_from_email', 'smtp_from_name',
];

function loadEmailTemplates(PDO $pdo): array {
    $out = [];
    foreach (EMAIL_TPL_MAP as $key => [$module, $event]) {
        $cfg = getEmailTemplateConfig($module, $event);
        $out[$key] = [
            'subject' => $cfg['subject'],
            'header_color' => $cfg['header_color'],
            'body_html' => $cfg['body_html'],
            'btn_label' => $cfg['btn_label'],
            'btn_url' => $cfg['btn_url'],
            'enabled' => $cfg['enabled'],
            'module' => $module,
            'event' => $event,
        ];
    }
    return $out;
}

function sampleVars(): array {
    return [
        'work_order_id' => 'WO-TEST-1001', 'asset_code' => 'MCH-01', 'asset_name' => 'Press Machine 01',
        'title' => 'เสียงดังผิดปกติที่มอเตอร์', 'priority' => 'CRITICAL', 'status' => 'IN_PROGRESS',
        'reporter_name' => 'อนันต์ พนักงานคุมเครื่องพิมพ์', 'assigned_name' => 'สมศักดิ์ ช่างซ่อมบำรุง',
        'due_date' => date('Y-m-d'), 'days_overdue' => '2', 'item_code' => 'SUP0010917',
        'item_name' => 'เทอร์มินอลโทรศัพท์สีขาว LINE', 'qty' => '3', 'min_stock' => '5',
        'downtime_hours' => '2.5', 'total_cost' => '4,500', 'requisition_no' => 'REQ-TEST-001',
        'items_summary' => 'Bearing 6204 x 2', 'requester_name' => 'วิชัย ช่างไฟและกลการ', 'total_amount' => '1,250',
    ];
}

try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $userId = (int)$_SESSION['user_id'];

    $envPath = __DIR__ . '/../../../.env';
    if (file_exists($envPath) && function_exists('loadEnv')) loadEnv($envPath);

    switch ($method) {
        case 'GET':
            $settings = [];
            $in = implode(',', array_fill(0, count(EMAIL_SETTING_KEYS), '?'));
            $stmt = $pdo->prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($in)");
            $stmt->execute(EMAIL_SETTING_KEYS);
            foreach ($stmt->fetchAll() as $r) { $settings[$r['setting_key']] = $r['setting_value']; }

            $stmt = $pdo->prepare("SELECT id, full_name, email FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $me = $stmt->fetch();

            echo json_encode([
                'settings' => $settings,
                'templates' => loadEmailTemplates($pdo),
                'meta' => EMAIL_TPL_LABELS,
                'me' => ['id' => $me['id'], 'full_name' => $me['full_name'], 'email' => $me['email'] ?? ''],
                'env' => [
                    'smtp_configured' => !empty($settings['smtp_host']) && ($settings['smtp_enabled'] ?? '0') === '1',
                    'mail_function' => function_exists('mail'),
                    'php_version' => PHP_VERSION,
                ],
                'help' => ['variables' => array_keys(sampleVars())],
            ]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data) { http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); exit; }

            $count = 0;

            // --- settings ---
            $upsert = $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, 'notification', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
            $desc = [
                'email_notify_enabled' => 'เปิด/ปิดการแจ้งเตือนผ่านอีเมล',
                'smtp_enabled' => 'ใช้ SMTP ในการส่งอีเมล (0=mail(), 1=SMTP)',
                'smtp_host' => 'SMTP Host',
                'smtp_port' => 'SMTP Port',
                'smtp_encryption' => 'none/tls/ssl',
                'smtp_user' => 'SMTP Username',
                'smtp_pass' => 'SMTP Password',
                'smtp_from_email' => 'From email',
                'smtp_from_name' => 'From name',
            ];
            foreach (($data['settings'] ?? []) as $k => $v) {
                if (!in_array($k, EMAIL_SETTING_KEYS, true)) continue;
                $upsert->execute([$k, (string)$v, $desc[$k] ?? '']);
                $count++;
            }

            // --- templates (upsert into email_notifications) ---
            $tplUpsert = $pdo->prepare("INSERT INTO email_notifications (module, event, recipients, subject, template_body, is_active)
                VALUES (?, ?, '', ?, ?, ?)
                ON DUPLICATE KEY UPDATE subject = VALUES(subject), template_body = VALUES(template_body), is_active = VALUES(is_active)");
            foreach (($data['templates'] ?? []) as $key => $tpl) {
                if (!isset(EMAIL_TPL_MAP[$key])) continue;
                [$module, $event] = EMAIL_TPL_MAP[$key];
                $json = json_encode([
                    'header_color' => preg_match('/^#[0-9a-fA-F]{6}$/', $tpl['header_color'] ?? '') ? $tpl['header_color'] : '#1d4ed8',
                    'body_html' => mb_substr($tpl['body_html'] ?? '', 0, 4000),
                    'btn_label' => mb_substr($tpl['btn_label'] ?? 'เปิดดูในระบบ', 0, 100),
                    'btn_url' => mb_substr($tpl['btn_url'] ?? '', 0, 500),
                    'enabled' => (($tpl['enabled'] ?? '1') === '1' || ($tpl['enabled'] ?? '1') === true) ? '1' : '0',
                ], JSON_UNESCAPED_UNICODE);
                $tplUpsert->execute([
                    $module, $event,
                    mb_substr($tpl['subject'] ?? '', 0, 500),
                    $json,
                    (($tpl['enabled'] ?? '1') === '1' || ($tpl['enabled'] ?? '1') === true) ? 1 : 0,
                ]);
                $count++;
            }

            echo json_encode(['success' => true, 'saved' => $count]);
            break;

        case 'POST':
            // Test send: { template_key?, to_email?, to_name? }
            $data = json_decode(file_get_contents('php://input'), true) ?? [];

            $stmt = $pdo->prepare("SELECT id, full_name, email FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $me = $stmt->fetch();

            $toEmail = trim($data['to_email'] ?? '') ?: ($me['email'] ?? '');
            $toName = trim($data['to_name'] ?? '') ?: ($me['full_name'] ?? '');

            if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
                http_response_code(400);
                echo json_encode(['error' => 'อีเมลปลายทางไม่ถูกต้อง — กรุณากรอกอีเมลในช่อง "ส่งทดสอบไปยัง" หรือตั้ง email ให้ผู้ใช้ในระบบ']);
                exit;
            }

            $key = $data['template_key'] ?? 'email_tpl_breakdown';
            if (!isset(EMAIL_TPL_MAP[$key])) { http_response_code(400); echo json_encode(['error' => 'ไม่พบ template']); exit; }
            [$module, $event] = EMAIL_TPL_MAP[$key];

            $ok = sendEmailWithTemplate($toEmail, $toName, $module, $event, sampleVars(), $data['btn_url'] ?? '');
            if ($ok) {
                echo json_encode(['success' => true, 'message' => "ส่งอีเมลทดสอบไปยัง $toEmail สำเร็จ (template: " . EMAIL_TPL_LABELS[$key]['label'] . ")"]);
            } else {
                $smtpOn = getSettingValue('smtp_enabled', '0') === '1';
                $hint = $smtpOn
                    ? 'SMTP ไม่ตอบรับ — ตรวจสอบ Host/Port/User/Password/Encryption'
                    : 'ใช้ mail() ของ PHP — ตรวจสอบว่า IIS SMTP / sendmail ตั้งค่าแล้ว หรือเปิด SMTP ด้านบน';
                http_response_code(500);
                echo json_encode(['error' => 'การส่งอีเมลไม่สำเร็จ — ' . $hint]);
            }
            break;

        default:
            http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500); echo json_encode(['error' => $e->getMessage()]);
}
