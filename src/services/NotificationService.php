<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/notification.php'; // publicBaseUrl()

class NotificationService {
    
    /**
     * Send LINE Notification
     *
     * ช่องทางหลัก: Messaging API Push (LINE Official Account) — ส่งถึงทุกคนที่ผูก line_user_id
     * (LINE Notify ปิดบริการแล้วตั้งแต่ มี.ค. 2025 — เหลือไว้เป็น fallback ถ้ายังมี token เก่า)
     */
    public static function sendLineMessage(string $message, ?string $token = null): bool {
        $pdo = getDb();

        // 1) Messaging API (channel access token จาก settings หรือ .env)
        try {
            $channelToken = $token ?: ($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_channel_access_token'")->fetchColumn() ?: '');
            $channelToken = $channelToken ?: (getenv('LINE_CHANNEL_ACCESS_TOKEN') ?: '');
            if (!empty($channelToken)) {
                $uids = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''")->fetchAll(PDO::FETCH_COLUMN);
                if (empty($uids)) {
                    self::logNotification('LINE', 'NO_RECIPIENT', $message, null, '', 'LINE_GENERIC');
                    return false;
                }
                $ok = true;
                foreach ($uids as $uid) {
                    // แต่ละคน log ไว้ใน sendLinePushMessage (recipient + template) ดูที่ /notifications/history
                    $ok = sendLinePushMessage((string)$uid, '🔔 CMMS-TPT แจ้งเตือน', $message) && $ok;
                }
                return $ok;
            }
        } catch (Exception $e) {}

        // 2) Legacy LINE Notify (token รูป xxxx:yyyy — ถ้ายังมีอยู่)
        if (!$token) {
            try {
                $token = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_token'")->fetchColumn();
            } catch (Exception $e) {}
        }

        $token = $token ?: getenv('LINE_NOTIFY_TOKEN') ?: 'FALLBACK_TOKEN';            if (empty($token) || $token === 'FALLBACK_TOKEN') {
            // ยังไม่ได้ตั้งค่า LINE ให้สมบูรณ์ — บันทึก log เพื่อให้ admin ทราบ
            self::logNotification('LINE', 'PENDING_CONFIG', $message, null, '', 'LINE_GENERIC');
            return false;
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, 'https://notify-api.line.me/api/notify');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(['message' => $message]));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-www-form-urlencoded',
            'Authorization: Bearer ' . trim($token)
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $result = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $success = ($httpCode === 200);
        self::logNotification('LINE', $success ? 'SENT' : 'FAILED', $message, $result);
        return $success;
    }

    /**
     * Send HTML Email Notification
     */
    public static function sendEmail(string $toEmail, string $subject, string $htmlBody): bool {
        if (empty($toEmail)) return false;

        $headers  = "MIME-Version: 1.0" . "\r\n";
        $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
        $headers .= "From: CMMS-TOPPAN Notification <noreply@toppan.co.th>" . "\r\n";

        $sent = @mail($toEmail, $subject, $htmlBody, $headers);
        self::logNotification('EMAIL', $sent ? 'SENT' : 'FAILED', "To: $toEmail | Subject: $subject");
        return $sent; // คืนค่าจริง อย่าปิดบังความล้มเหลว
    }

    /**
     * ส่งเทมเพลต Flex (line_tpl_*) ให้ทุกคนที่ผูก LINE — เคารพปุ่มเปิด/ปิดของเทมเพลต
     */
    public static function sendLineTemplateToAll(string $tplKey, array $vars, string $targetUrl = '', array $photos = []): void {
        try {
            $pdo = getDb();
            $uids = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''")->fetchAll(PDO::FETCH_COLUMN);
            if (empty($uids)) {
                self::logNotification('LINE', 'NO_RECIPIENT', "tpl=$tplKey " . implode(' | ', $vars), null, '', $tplKey);
                return;
            }
            foreach ($uids as $uid) {
                sendLineTemplatePush((string)$uid, $tplKey, $vars, $targetUrl, $photos);
            }
        } catch (Exception $e) {
            error_log('[NotificationService] sendLineTemplateToAll failed: ' . $e->getMessage());
        }
    }

    /**
     * ตรวจว่าเทมแพลต LINE ถูกเปิดใช้งานหรือไม่ (ใช้ gate การส่งจากสคริปต์ที่ส่งข้อความตรง)
     */
    public static function isLineTemplateEnabled(string $tplKey): bool {
        try {
            $tpl = getLineTemplate($tplKey);
            return ($tpl['enabled'] ?? '0') === '1';
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Trigger 🔴 Breakdown Alarm Notification
     */
    public static function notifyBreakdown(array $woData): void {
        $woNo     = $woData['work_order_no'] ?? 'EN-26-XXX';
        $asset    = $woData['asset_name'] ?? 'เครื่องจักรหลัก';
        $code     = $woData['asset_code'] ?? 'MCH';
        $reporter = $woData['reporter_name'] ?? 'ผู้แจ้งซ่อม';
        $problem  = $woData['problem'] ?? 'เครื่องจักรหยุดทำงานด่วน!';

        $base = rtrim((string)publicBaseUrl(), '/');
        $repairUrl = $base !== '' ? $base . '/pages/repair/' : '/pages/repair/';

        // 1. LINE Alert — ใช้เทมเพลต Flex (line_tpl_breakdown จาก /settings/notifications)
        self::sendLineTemplateToAll('line_tpl_breakdown', [
            '{work_order_id}' => $woNo,
            '{asset_code}' => $code,
            '{asset_name}' => $asset,
            '{title}' => $problem,
            '{priority}' => 'CRITICAL',
            '{status}' => 'DOWN',
            '{reporter_name}' => $reporter,
        ], $repairUrl);

        // 2. Email Alert Body
        $emailHtml = "
            <div style='font-family: Arial, sans-serif; padding: 20px; background-color: #fff1f2; border: 2px solid #e11d48; border-radius: 12px;'>
                <h2 style='color: #be123c;'>🚨 แจ้งซ่อมเครื่องจักรหยุดทำงานด่วน (Breakdown Alert)</h2>
                <p><strong>บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด</strong></p>
                <hr>
                <p><strong>เลขที่ใบสั่งงาน:</strong> <span style='font-family: monospace; font-weight: bold; color: #4338ca;'>$woNo</span></p>
                <p><strong>เครื่องจักร:</strong> $code - $asset</p>
                <p><strong>ผู้แจ้งซ่อม:</strong> $reporter</p>
                <p><strong>รายละเอียดปัญหา:</strong> $problem</p>
                <br>
                <a href='$repairUrl' style='background-color: #be123c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;'>กดดูรายละเอียดและรับงานซ่อม →</a>
            </div>
        ";

        self::sendEmail('maintenance-team@toppan.co.th', "🚨 BREAKDOWN ALERT: $woNo — $code", $emailHtml);
    }

    /**
     * Trigger ⚠️ Overdue PM Notification
     */
    public static function notifyPMOverdue(string $assetCode, string $title, string $dueDate, int $daysOverdue): void {
        $base = rtrim((string)publicBaseUrl(), '/');
        $pmUrl = $base !== '' ? $base . '/pages/pm_am/' : '/pages/pm_am/';

        // LINE — ใช้เทมเพลต Flex (line_tpl_pm_overdue จาก /settings/notifications)
        self::sendLineTemplateToAll('line_tpl_pm_overdue', [
            '{work_order_id}' => '',
            '{asset_code}' => $assetCode,
            '{asset_name}' => '',
            '{title}' => $title,
            '{due_date}' => $dueDate,
            '{days_overdue}' => (string)$daysOverdue,
        ], $pmUrl);
    }

    /**
     * Trigger 📦 Low Stock Reorder Notification
     */
    public static function notifyLowStock(string $itemCode, string $itemName, float $qty, float $minStock): void {
        $base = rtrim((string)publicBaseUrl(), '/');
        $spUrl = $base !== '' ? $base . '/pages/spare_parts/' : '/pages/spare_parts/';

        // LINE — ใช้เทมเพลต Flex (line_tpl_low_stock จาก /settings/notifications)
        self::sendLineTemplateToAll('line_tpl_low_stock', [
            '{item_code}' => $itemCode,
            '{item_name}' => $itemName,
            '{qty}' => rtrim(rtrim(number_format($qty, 2), '0'), '.') ?: '0',
            '{min_stock}' => rtrim(rtrim(number_format($minStock, 2), '0'), '.') ?: '0',
        ], $spUrl);
    }

    /**
     * Internal Notification Logger — เขียนตาราง notification_logs (ไม่ปนกับ sage_sync_log)
     */
    private static function logNotification(string $type, string $status, string $content, ?string $rawResp = null, string $recipient = '', string $template = ''): void {
        try {
            $pdo = getDb();
            $pdo->prepare("
                INSERT INTO notification_logs (channel, status, recipient, template, content, raw_response, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            ")->execute([
                $type,
                $status,
                $recipient !== '' ? mb_substr($recipient, 0, 100) : null,
                $template !== '' ? mb_substr($template, 0, 60) : null,
                mb_substr($content, 0, 500),
                $rawResp ? mb_substr($rawResp, 0, 2000) : null,
            ]);
        } catch (Exception $e) {}
    }
}
