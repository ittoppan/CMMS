<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/NotificationService.php';
require_once __DIR__ . '/../helpers/notification.php'; // publicBaseUrl()

class ApprovalService {

    /**
     * Create a New One-Click Approval Request (Triggers LINE & Email Alerts)
     */
    public static function createApprovalRequest(
        string $requestType,  // 'repair', 'requisition', 'loto', 'pm'
        int $targetId,
        string $documentNo,
        string $title,
        string $requesterName,
        array $details = [],
        ?string $approverEmail = null,
        ?string $approverLineId = null
    ): array {
        $pdo = getDb();
        
        // Generate secure 64-character token
        $token = bin2hex(random_bytes(32));

        $approverEmail = $approverEmail ?: 'manager@toppan.co.th';

        $stmt = $pdo->prepare("
            INSERT INTO approval_requests (
                request_type, target_id, document_no, title, requester_name,
                approver_email, approver_line_id, status, approval_token, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())
        ");
        $stmt->execute([
            $requestType, $targetId, $documentNo, $title, $requesterName,
            $approverEmail, $approverLineId, $token
        ]);

        $requestId = $pdo->lastInsertId();

        // URL สาธารณะจาก settings/env — ไม่ฝัง IP เครื่อง dev
        $baseUrl = rtrim((string)publicBaseUrl(), '/');
        if ($baseUrl === '') {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $baseUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
        }
        $approveUrl = "$baseUrl/approve.php?token=$token&action=approve";
        $rejectUrl  = "$baseUrl/approve.php?token=$token&action=reject";

        // 1. Send LINE Flex Notification with One-Click Buttons
        self::sendLineApprovalFlex($documentNo, $title, $requesterName, $requestType, $details, $approveUrl, $rejectUrl);

        // 2. Send HTML Email with One-Click CTA Buttons
        self::sendEmailApprovalHtml($approverEmail, $documentNo, $title, $requesterName, $requestType, $details, $approveUrl, $rejectUrl);

        return [
            'success' => true,
            'request_id' => $requestId,
            'token' => $token,
            'approve_url' => $approveUrl,
            'reject_url' => $rejectUrl
        ];
    }

    /**
     * Process One-Click Approval or Rejection Action
     */
    public static function processApproval(string $token, string $action, ?string $reason = null): array {
        $pdo = getDb();
        
        $stmt = $pdo->prepare("SELECT * FROM approval_requests WHERE approval_token = ? LIMIT 1");
        $stmt->execute([$token]);
        $req = $stmt->fetch();

        if (!$req) {
            return ['success' => false, 'message' => 'ไม่พบข้อมูลคำขออนุมัติ หรือ Token ไม่ถูกต้อง'];
        }

        if ($req['status'] !== 'pending') {
            $statusLabel = $req['status'] === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ / ปฏิเสธแล้ว';
            return [
                'success' => false,
                'already_processed' => true,
                'status' => $req['status'],
                'message' => "คำขอนี้ได้รับการ $statusLabel เมื่อ " . date('d/m/Y H:i', strtotime($req['approved_at'])),
                'req' => $req
            ];
        }

        $newStatus = ($action === 'approve') ? 'approved' : 'rejected';
        
        // Update approval_requests table
        $pdo->prepare("
            UPDATE approval_requests
            SET status = ?, rejection_reason = ?, approved_at = NOW()
            WHERE id = ?
        ")->execute([$newStatus, $reason, $req['id']]);

        // Update target entity status dynamically
        self::updateTargetEntityStatus($req['request_type'], (int)$req['target_id'], $newStatus, $reason);

        // Send Notify back to Requester
        $statusMsg = $newStatus === 'approved' ? '✅ อนุมัติเรียบร้อยแล้ว' : '❌ ไม่อนุมัติ (' . ($reason ?: 'ไม่ระบุเหตุผล') . ')';
        NotificationService::sendLineMessage(
            "\n🔔 [ผลการอนุมัติเอกสาร {$req['document_no']}]\n" .
            "รายการ: {$req['title']}\n" .
            "ผู้ร้องขอ: {$req['requester_name']}\n" .
            "สถานะ: $statusMsg\n" .
            "เวลา: " . date('d/m/Y H:i')
        );

        return [
            'success' => true,
            'new_status' => $newStatus,
            'message' => $newStatus === 'approved' ? 'อนุมัติเอกสารสำเร็จเรียบร้อยแล้ว!' : 'ปฏิเสธเอกสารเรียบร้อยแล้ว',
            'req' => $req
        ];
    }

    /**
     * Dynamic Target Entity Status Updater
     */
    private static function updateTargetEntityStatus(string $type, int $targetId, string $status, ?string $reason = null): void {
        $pdo = getDb();
        if ($type === 'repair') {
            $targetStatus = ($status === 'approved') ? 'in_progress' : 'rejected';
            $pdo->prepare("UPDATE repair SET status = ?, updated_at = NOW() WHERE id = ?")->execute([$targetStatus, $targetId]);
        } elseif ($type === 'loto' || $type === 'work_permit') {
            $targetStatus = ($status === 'approved') ? 'approved' : 'rejected';
            $pdo->prepare("UPDATE work_permits SET status = ?, updated_at = NOW() WHERE id = ?")->execute([$targetStatus, $targetId]);
        } elseif ($type === 'requisition' || $type === 'spare_issue') {
            $targetStatus = ($status === 'approved') ? 'Approved' : 'Rejected';
            $pdo->prepare("UPDATE spare_issue_requests SET status = ?, updated_at = NOW() WHERE id = ?")->execute([$targetStatus, $targetId]);
        }
    }

    /**
     * Send LINE Flex Message Approval Card
     */
    private static function sendLineApprovalFlex(
        string $docNo, string $title, string $requester, string $type, array $details, string $approveUrl, string $rejectUrl
    ): void {
        $typeLabel = match($type) {
            'repair' => '🔧 ใบสั่งงานซ่อม F-EN-03',
            'loto'   => '🛡️ ใบอนุญาตความปลอดภัย LOTO',
            'requisition' => '📦 ใบขอเบิกอะไหล่ Sage 300',
            default => '📋 เอกสารขออนุมัติ'
        };

        // ใบขอเบิก Sage → ใช้เทมเพลต Flex (line_tpl_sage_approval จาก /settings/notifications)
        if ($type === 'requisition' || $type === 'spare_issue') {
            $itemsSummary = is_array($details) ? implode(', ', array_map(fn($d) => (string)$d, $details)) : (string)$details;
            NotificationService::sendLineTemplateToAll('line_tpl_sage_approval', [
                '{requisition_no}' => $docNo,
                '{items_summary}' => mb_substr($itemsSummary, 0, 200),
                '{requester_name}' => $requester,
                '{total_amount}' => '—',
            ], $approveUrl);
            return;
        }

        $lineMsg = "\n📩 [คำขออนุมัติด่วน 1-Click Approval]\n"
                 . "----------------------------------\n"
                 . "ประเภท: $typeLabel\n"
                 . "เลขที่เอกสาร: $docNo\n"
                 . "หัวข้อ: $title\n"
                 . "ผู้ขออนุมัติ: $requester\n"
                 . "----------------------------------\n"
                 . "✅ กดอนุมัติ (1-Click Approve):\n$approveUrl\n\n"
                 . "❌ กดไม่อนุมัติ (1-Click Reject):\n$rejectUrl";

        NotificationService::sendLineMessage($lineMsg);
    }

    /**
     * Send Responsive HTML Email Approval
     */
    private static function sendEmailApprovalHtml(
        string $toEmail, string $docNo, string $title, string $requester, string $type, array $details, string $approveUrl, string $rejectUrl
    ): void {
        $typeLabel = match($type) {
            'repair' => '🔧 ใบสั่งงานซ่อม F-EN-03',
            'loto'   => '🛡️ ใบอนุญาตความปลอดภัย LOTO',
            'requisition' => '📦 ใบขอเบิกอะไหล่ Sage 300',
            default => '📋 เอกสารขออนุมัติ'
        };

        $subject = "📩 [ขออนุมัติด่วน] $docNo — $title";

        $detailRows = '';
        foreach ($details as $k => $v) {
            $detailRows .= "<tr><td style='padding: 6px 12px; font-weight: bold; color: #475569;'>$k:</td><td style='padding: 6px 12px; color: #0f172a;'>$v</td></tr>";
        }

        $html = "
        <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);'>
            <div style='background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 24px; text-align: center; color: white;'>
                <div style='display: inline-block; padding: 4px 12px; background: rgba(255,255,255,0.2); border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;'>CMMS-TOPPAN 1-CLICK APPROVAL</div>
                <h2 style='margin: 0; font-size: 20px; font-weight: 800;'>📩 คำขออนุมัติเอกสารด่วน</h2>
                <p style='margin: 4px 0 0; font-size: 12px; opacity: 0.8;'>บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด</p>
            </div>
            
            <div style='padding: 24px;'>
                <div style='background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;'>
                    <table style='width: 100%; font-size: 13px; border-collapse: collapse;'>
                        <tr><td style='padding: 6px 12px; font-weight: bold; color: #475569;'>ประเภทเอกสาร:</td><td style='padding: 6px 12px; font-weight: bold; color: #4f46e5;'>$typeLabel</td></tr>
                        <tr><td style='padding: 6px 12px; font-weight: bold; color: #475569;'>เลขที่เอกสาร:</td><td style='padding: 6px 12px; font-family: monospace; font-weight: bold; color: #0f172a;'>$docNo</td></tr>
                        <tr><td style='padding: 6px 12px; font-weight: bold; color: #475569;'>หัวข้อรายการ:</td><td style='padding: 6px 12px; font-weight: bold; color: #0f172a;'>$title</td></tr>
                        <tr><td style='padding: 6px 12px; font-weight: bold; color: #475569;'>ผู้ส่งขออนุมัติ:</td><td style='padding: 6px 12px; color: #0f172a;'>$requester</td></tr>
                        $detailRows
                    </table>
                </div>

                <div style='text-align: center; margin: 28px 0;'>
                    <p style='font-size: 12px; font-weight: bold; color: #64748b; margin-bottom: 14px;'>กดปุ่มด้านล่างเพื่ออนุมัติหรือปฏิเสธได้ทันทีใน 1 สัมผัส:</p>
                    <a href='$approveUrl' style='display: inline-block; padding: 14px 32px; background-color: #10b981; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px; margin-right: 10px; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.3);'>✅ อนุมัติรายการ (Approve)</a>
                    <a href='$rejectUrl' style='display: inline-block; padding: 14px 32px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(239,68,68,0.3);'>❌ ปฏิเสธ (Reject)</a>
                </div>
            </div>
            
            <div style='background-color: #f1f5f9; padding: 12px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;'>
                ระบบบริหารจัดการงานซ่อมบำรุง CMMS-TOPPAN &copy; " . date('Y') . "
            </div>
        </div>
        ";

        NotificationService::sendEmail($toEmail, $subject, $html);
    }
}
