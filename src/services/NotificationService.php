<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/notification.php'; // publicBaseUrl()

class NotificationService {
    
    /**
     * Send LINE Notification (Notify Token or Messaging API)
     */
    public static function sendLineMessage(string $message, ?string $token = null): bool {
        $pdo = getDb();
        if (!$token) {
            try {
                $token = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_token'")->fetchColumn();
            } catch (Exception $e) {}
        }
        
        $token = $token ?: getenv('LINE_NOTIFY_TOKEN') ?: 'FALLBACK_TOKEN';
        
        if (empty($token) || $token === 'FALLBACK_TOKEN') {
            // Log notice if token is not yet configured by admin
            self::logNotification('LINE', 'PENDING_CONFIG', $message);
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

        // 1. LINE Alert Message
        $lineMsg = "\n🚨 [แจ้งซ่อมเครื่องจักรหยุดทำงาน BREAK DOWN]\n"
                 . "----------------------------------\n"
                 . "เลขที่ใบสั่งงาน: $woNo\n"
                 . "เครื่องจักร: $code - $asset\n"
                 . "ผู้แจ้งซ่อม: $reporter\n"
                 . "อาการเสีย: $problem\n"
                 . "สถานะ: 🔴 หยุดทำงาน (ความสำคัญสูงสุด)\n"
                 . "----------------------------------\n"
                 . "📲 รับงานซ่อม: $repairUrl";

        self::sendLineMessage($lineMsg);

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

        $lineMsg = "\n⚠️ [แจ้งเตือนแผน PM เกินกำหนดชำระ Overdue]\n"
                 . "----------------------------------\n"
                 . "เครื่องจักร: $assetCode\n"
                 . "รายการ: $title\n"
                 . "กำหนดชำระ: $dueDate (เกินมา $daysOverdue วัน)\n"
                 . "----------------------------------\n"
                 . "📋 ดำเนินการ PM: $pmUrl";

        self::sendLineMessage($lineMsg);
    }

    /**
     * Trigger 📦 Low Stock Reorder Notification
     */
    public static function notifyLowStock(string $itemCode, string $itemName, float $qty, float $minStock): void {
        $base = rtrim((string)publicBaseUrl(), '/');
        $spUrl = $base !== '' ? $base . '/pages/spare_parts/' : '/pages/spare_parts/';

        $lineMsg = "\n📦 [แจ้งเตือนสต็อกอะไหล่ต่ำกว่าจุดสั่งซื้อ Reorder Point]\n"
                 . "----------------------------------\n"
                 . "รหัสอะไหล่: $itemCode\n"
                 . "ชื่ออะไหล่: $itemName\n"
                 . "คงเหลือ: $qty (จุดขั้นต่ำ: $minStock)\n"
                 . "----------------------------------\n"
                 . "🛒 สั่งซื้อเบิกจ่าย: $spUrl";

        self::sendLineMessage($lineMsg);
    }

    /**
     * Internal Notification Logger — เขียนตาราง notification_logs (ไม่ปนกับ sage_sync_log)
     */
    private static function logNotification(string $type, string $status, string $content, ?string $rawResp = null): void {
        try {
            $pdo = getDb();
            $pdo->prepare("
                INSERT INTO notification_logs (channel, status, content, raw_response, created_at)
                VALUES (?, ?, ?, ?, NOW())
            ")->execute([$type, $status, mb_substr($content, 0, 500), $rawResp ? mb_substr($rawResp, 0, 2000) : null]);
        } catch (Exception $e) {}
    }
}
