<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/NotificationService.php';
require_once __DIR__ . '/../../../src/services/ApprovalService.php';

$pageTitle = 'ตั้งค่า LINE Notification & 1-Click Approval — CMMS-TOPPAN';
$pdo = getDb();

$msg = '';
$msgType = '';

// Handle Form Submission: Save LINE Settings
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_line_config'])) {
    try {
        $token        = trim($_POST['line_notify_token'] ?? '');
        $channelToken = trim($_POST['line_channel_access_token'] ?? '');
        $secret       = trim($_POST['line_channel_secret'] ?? '');
        $approver     = trim($_POST['line_default_approver'] ?? '');

        $settings = [
            'line_notify_token' => $token,
            'line_channel_access_token' => $channelToken,
            'line_channel_secret' => $secret,
            'line_default_approver' => $approver
        ];

        foreach ($settings as $key => $val) {
            $pdo->prepare("
                INSERT INTO settings (setting_key, setting_value, setting_group, description)
                VALUES (?, ?, 'Integrations', 'LINE API Settings')
                ON DUPLICATE KEY UPDATE setting_value = ?
            ")->execute([$key, $val, $val]);
        }

        $msg = 'บันทึกการตั้งค่าระบบ LINE Notify & Messaging API เรียบร้อยแล้ว!';
        $msgType = 'success';
    } catch (Exception $e) {
        $msg = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
        $msgType = 'error';
    }
}

// Handle Test Send LINE Alert
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['test_line_notify'])) {
    $testToken = trim($_POST['line_notify_token'] ?? '');
    $sent = NotificationService::sendLineMessage("\n🔔 [ทดสอบระบบ CMMS-TOPPAN LINE Alert]\nเวลา: " . date('d/m/Y H:i:s') . "\nระบบการแจ้งเตือนและส่งอนุมัติทำงานได้ปกติ 100%!", $testToken);
    
    if ($sent) {
        $msg = 'ส่งข้อความทดสอบไปยัง LINE Notify เรียบร้อยแล้ว!';
        $msgType = 'success';
    } else {
        $msg = 'ไม่สามารถส่งไปยัง LINE Notify ได้ กรุณาตรวจสอบ LINE Notify Token';
        $msgType = 'error';
    }
}

// Fetch Current Settings
$notifyToken  = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_token'")->fetchColumn() ?: '';
$channelToken = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_channel_access_token'")->fetchColumn() ?: '';
$channelSec   = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_channel_secret'")->fetchColumn() ?: '';
$defaultAppr  = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'line_default_approver'")->fetchColumn() ?: 'manager@toppan.co.th';

renderHeader();
?>

<div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-600 to-teal-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Official LINE Integration</span>
                <span class="text-xs text-emerald-200">Notify & 1-Click Approval</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="message-square" class="w-7 h-7 text-emerald-200"></i>
                <span>ตั้งค่า LINE Notification & 1-Click Approval System</span>
            </h1>
            <p class="text-xs text-emerald-100 mt-1">กำหนดค่า LINE Notify Token, Messaging API และอีเมลผู้อนุมัติเอกสาร 1-Click Approval</p>
        </div>
        <div class="flex gap-2">
            <a href="flex_builder.php" class="btn bg-amber-400 text-slate-900 font-extrabold text-xs shadow hover:bg-amber-300 gap-1">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
                <span>🎨 ออกแบบข้อความ LINE Flex →</span>
            </a>
            <a href="line_richmenu.php" class="card btn text-emerald-800 font-extrabold text-xs shadow hover:bg-emerald-50 gap-1">
                <i data-lucide="layout-grid" class="w-4 h-4"></i>
                <span>LINE Rich Menu</span>
            </a>
        </div>
    </div>

    <!-- Alert Banner -->
    <?php if ($msg): ?>
    <div class="p-4 <?= $msgType === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200' ?> font-bold rounded-xl border text-xs flex items-center gap-2">
        <i data-lucide="<?= $msgType === 'success' ? 'check-circle' : 'alert-circle' ?>" class="w-4 h-4"></i>
        <span><?= htmlspecialchars($msg) ?></span>
    </div>
    <?php endif; ?>

    <!-- Form: Configuration -->
    <form method="POST" class="card p-6 space-y-6">
        <input type="hidden" name="save_line_config" value="1">

        <!-- Section 1: LINE Notify Token -->
        <div class="space-y-3 border-b pb-5">
            <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">1</span>
                <span>LINE Notify Access Token (สำหรับการส่งแจ้งเตือนกลุ่มช่าง & Breakdown Alert)</span>
            </h3>
            <p class="text-xs text-slate-500">Token สำหรับส่งแจ้งเตือนงานซ่อมด่วน, แจ้งเตือน Overdue PM และแจ้งเตือนอะไหล่ต่ำกว่า Reorder Point เข้ากลุ่ม LINE</p>
            
            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">LINE Notify Token:</label>
                <input type="text" name="line_notify_token" value="<?= htmlspecialchars($notifyToken) ?>" placeholder="วาง LINE Notify Token ที่ได้จาก notify-bot.line.me" class="input input-bordered w-full text-xs font-mono font-bold">
            </div>
        </div>

        <!-- Section 2: LINE Messaging API -->
        <div class="space-y-3 border-b pb-5">
            <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">2</span>
                <span>LINE Official Account (Messaging API Access Token & Secret)</span>
            </h3>
            <p class="text-xs text-slate-500">ข้อมูลสำหรับส่งการ์ด Flex Message ปุ่ม 1-Click อนุมัติเอกสารผ่าน LINE Official Account (`@823cenqj`)</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1">
                    <label class="text-xs font-bold text-slate-700">Channel Access Token:</label>
                    <input type="text" name="line_channel_access_token" value="<?= htmlspecialchars($channelToken) ?>" placeholder="Channel Access Token (Long-lived)" class="input input-bordered w-full text-xs font-mono">
                </div>

                <div class="space-y-1">
                    <label class="text-xs font-bold text-slate-700">Channel Secret:</label>
                    <input type="password" name="line_channel_secret" value="<?= htmlspecialchars($channelSec) ?>" placeholder="Channel Secret Key" class="input input-bordered w-full text-xs font-mono">
                </div>
            </div>
        </div>

        <!-- Section 3: Default Approver Settings -->
        <div class="space-y-3 pb-2">
            <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">3</span>
                <span>อีเมลและช่องทางผู้อนุมัติหลัก (Default Approval Recipient)</span>
            </h3>
            <p class="text-xs text-slate-500">กำหนดอีเมลผู้จัดการหรือหัวหน้าแผนกที่จะได้รับคำขออนุมัติ 1-Click Approval</p>

            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">อีเมลผู้อนุมัติเอกสาร (Approver Email):</label>
                <input type="email" name="line_default_approver" value="<?= htmlspecialchars($defaultAppr) ?>" placeholder="manager@toppan.co.th" class="input input-bordered w-full text-xs font-mono font-bold">
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="pt-4 border-t flex justify-between items-center flex-wrap gap-3">
            <button type="submit" name="test_line_notify" value="1" class="btn btn-secondary text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 font-bold gap-2">
                <i data-lucide="send" class="w-4 h-4"></i>
                <span>🚀 ทดสอบส่งข้อความ LINE Notify</span>
            </button>

            <button type="submit" class="btn btn-primary bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg gap-2">
                <i data-lucide="save" class="w-4 h-4"></i>
                <span>บันทึกการตั้งค่า LINE</span>
            </button>
        </div>
    </form>

    <!-- Guide Card -->
    <div class="card p-6 bg-slate-900 text-white rounded-xl shadow-xl space-y-3 border border-slate-800">
        <h4 class="font-extrabold text-sm flex items-center gap-2 text-emerald-400">
            <i data-lucide="book-open" class="w-4 h-4"></i>
            <span>ขั้นตอนการขอ LINE Notify Token & Messaging API Key</span>
        </h4>
        <ol class="text-xs text-slate-300 space-y-1.5 list-decimal pl-4">
            <li>เข้าเว็บไซต์ <a href="https://notify-bot.line.me/" target="_blank" class="text-emerald-400 font-bold underline">https://notify-bot.line.me/</a> เข้าสู่ระบบ และกดสร้าง Token สำหรับกลุ่มช่างซ่อมบำรุง</li>
            <li>คัดลอก Token มาวางในช่อง <strong>LINE Notify Token</strong> ด้านบน</li>
            <li>เข้าสู่ระบบ <a href="https://developers.line.biz/" target="_blank" class="text-emerald-400 font-bold underline">LINE Developers Console</a> เลือก Provider และ Channel LINE OA (`@823cenqj`)</li>
            <li>คัดลอก Channel Access Token และ Channel Secret มาวางในช่องข้อ 2 แล้วกดบันทึก</li>
        </ol>
    </div>

</div>

<?php renderFooter(); ?>
