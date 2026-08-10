<?php
require_once __DIR__ . '/../src/includes/layout.php';
$pageTitle = 'ผูกบัญชี LINE (LINE Binding) - CMMS-TPT';
$pdo = getDb();

if (empty($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$userId = (int)$_SESSION['user_id'];
$stmt = $pdo->prepare("SELECT id, username, full_name, email, line_user_id FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch();

// Handle manual LINE User ID save
$successMsg = '';
$errorMsg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['line_user_id'])) {
    $lineId = trim($_POST['line_user_id']);
    try {
        $pdo->prepare("UPDATE users SET line_user_id = ? WHERE id = ?")->execute([$lineId, $userId]);
        $user['line_user_id'] = $lineId;
        $successMsg = 'บันทึกข้อมูล LINE User ID เรียบร้อยแล้ว!';
    } catch (Exception $e) {
        $errorMsg = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
$domainUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
$lineLoginUrl = $domainUrl . '/line_login.php';
$qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" . urlencode($lineLoginUrl);
?>

<div class="max-w-2xl mx-auto space-y-6">
    <!-- Header -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-2xl">
                📲
            </div>
            <div>
                <h1 class="text-xl font-bold text-gray-900">ลงทะเบียนผูกบัญชี LINE & รับการแจ้งเตือน</h1>
                <p class="text-sm text-gray-500">สำหรับช่างและผู้ใช้งานในระบบ CMMS-TPT</p>
            </div>
        </div>
    </div>

    <?php if ($successMsg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-medium">
        ✅ <?= htmlspecialchars($successMsg) ?>
    </div>
    <?php endif; ?>

    <?php if ($errorMsg): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 font-medium">
        ❌ <?= htmlspecialchars($errorMsg) ?>
    </div>
    <?php endif; ?>

    <!-- Status Box -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <h2 class="text-base font-bold text-gray-900">1. สถานะการผูกบัญชีปัจจุบัน</h2>
        
        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-md border border-gray-200">
            <div>
                <div class="text-sm font-semibold text-gray-800"><?= htmlspecialchars($user['full_name']) ?> (<?= htmlspecialchars($user['username']) ?>)</div>
                <div class="text-xs text-gray-500">อีเมลรับการแจ้งเตือน: <?= htmlspecialchars($user['email']) ?></div>
            </div>
            <div>
                <?php if (!empty($user['line_user_id'])): ?>
                <span class="badge badge-active flex items-center gap-1" style="background:#dcfce7;color:#15803d;padding:6px 12px;font-size:13px;">
                    🟢 ผูก LINE แล้ว (Linked)
                </span>
                <?php else: ?>
                <span class="badge badge-critical flex items-center gap-1" style="background:#fee2e2;color:#b91c1c;padding:6px 12px;font-size:13px;">
                    ⚪ ยังไม่ได้ผูก LINE
                </span>
                <?php endif; ?>
            </div>
        </div>

        <?php if (!empty($user['line_user_id'])): ?>
        <div class="text-xs text-gray-500 font-mono bg-gray-100 p-2 rounded">
            LINE User ID: <?= htmlspecialchars($user['line_user_id']) ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Quick Binding Method 1: Auto LINE Login -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <h2 class="text-base font-bold text-gray-900">2. วิธีผูกบัญชีอัตโนมัติด้วย LINE (แนะนำ)</h2>
        <p class="text-sm text-gray-600">กดปุ่มด้านล่างเพื่อล็อกอิน LINE ระบบจะเชื่อมต่อ LINE ID ของคุณกับผู้ใช้นี้โดยอัตโนมัติทันที</p>
        
        <div class="flex flex-col sm:flex-row items-center gap-6 pt-2">
            <a href="/line_login.php" class="w-full sm:w-auto text-center font-bold px-6 py-3 rounded-lg text-white transition-all shadow-md flex items-center justify-center gap-2" style="background:#06C755;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 5.58 2 10c0 2.5 1.5 4.7 3.8 6.1-.2.8-.7 2.8-.8 3.2 0 .2.1.4.3.4.1 0 .2 0 .3-.1.4-.3 3.6-2.4 4.2-2.8.7.1 1.4.2 2.2.2 5.5 0 10-3.58 10-8s-4.5-8-10-8z"/></svg>
                เข้าสู่ระบบเพื่อผูกบัญชี LINE ทันที
            </a>
            <div class="text-center sm:text-left">
                <img src="<?= $qrUrl ?>" alt="QR Code LINE Login" class="w-32 h-32 mx-auto rounded border border-gray-300">
                <span class="text-xs text-gray-500 block mt-1">สแกนผ่านแอป LINE บนมือถือ</span>
            </div>
        </div>
    </div>

    <!-- Manual Binding Method 2 -->
    <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <h2 class="text-base font-bold text-gray-900">3. กรอก LINE User ID ด้วยตนเอง (ถ้ามี)</h2>
        <form method="POST" class="flex gap-2">
            <input type="text" name="line_user_id" value="<?= htmlspecialchars($user['line_user_id'] ?? '') ?>" placeholder="ระบุ LINE User ID (เช่น U1234567...)" class="input input-bordered w-full flex-1">
            <button type="submit" class="btn btn-primary">บันทึก</button>
        </form>
    </div>
</div>

<?php renderFooter(); ?>
