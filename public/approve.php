<?php
// start session ก่อนทุก output (สำหรับ CSRF token ในฟอร์ม)
if (session_status() === PHP_SESSION_NONE) {
    @session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/services/ApprovalService.php';
require_once __DIR__ . '/../src/csrf.php';

// คำขอผ่านฟอร์ม POST ต้องผ่าน CSRF check (การอนุมัติ 1-Click ผ่าน GET token ยังใช้ได้ตามเดิม)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    enforceCsrf();
}

$token  = trim($_GET['token'] ?? $_POST['token'] ?? '');
$action = trim($_GET['action'] ?? $_POST['action'] ?? '');
$reason = trim($_POST['reason'] ?? '');

$pdo = getDb();
$req = null;
$error = '';
$result = null;

if ($token) {
    $stmt = $pdo->prepare("SELECT * FROM approval_requests WHERE approval_token = ? LIMIT 1");
    $stmt->execute([$token]);
    $req = $stmt->fetch();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['submit_action'])) {
    $action = $_POST['submit_action'];
    $result = ApprovalService::processApproval($token, $action, $reason);
} elseif ($token && ($action === 'approve' || $action === 'reject')) {
    if ($req && $req['status'] === 'pending' && $action === 'approve') {
        // Direct 1-Click Approval
        $result = ApprovalService::processApproval($token, 'approve');
    }
}
?>
<!DOCTYPE html>
<html lang="th" class="h-full bg-slate-900">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>1-Click Approval System — CMMS-TOPPAN</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Sarabun', sans-serif; }
    </style>
</head>
<body class="h-full flex items-center justify-center p-4 bg-slate-950 text-slate-100">

<div class="w-full max-w-lg space-y-6">

    <!-- Header Logo Badge -->
    <div class="text-center space-y-2">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-extrabold text-2xl shadow-xl border border-indigo-400/30">C</div>
        <h1 class="text-xl font-black text-white">CMMS-TOPPAN 1-Click Approval</h1>
        <p class="text-xs text-slate-400">ระบบอนุมัติเอกสารผ่าน LINE และ Email แบบ 1-Click สัมผัสเดียว</p>
    </div>

    <?php if (!$req): ?>
    <!-- Invalid Token Card -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
        <div class="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-xl">❌</div>
        <h2 class="text-lg font-bold text-white">ไม่พบข้อมูลคำขออนุมัติ</h2>
        <p class="text-xs text-slate-400">ลิงก์อนุมัติไม่ถูกต้อง หรืออาจถูกยกเลิกแล้ว</p>
        <a href="/" class="inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all">กลับหน้าหลัก</a>
    </div>

    <?php elseif ($result && $result['success']): ?>
    <!-- Success Result Card -->
    <div class="bg-slate-900 border <?= $result['new_status'] === 'approved' ? 'border-emerald-500/50' : 'border-rose-500/50' ?> rounded-2xl p-6 shadow-2xl space-y-4">
        <div class="text-center space-y-2">
            <div class="w-16 h-16 rounded-full <?= $result['new_status'] === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400' ?> flex items-center justify-center mx-auto text-3xl">
                <?= $result['new_status'] === 'approved' ? '✅' : '❌' ?>
            </div>
            <h2 class="text-xl font-black text-white"><?= htmlspecialchars($result['message']) ?></h2>
            <span class="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold <?= $result['new_status'] === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300' ?>">
                DOCUMENT: <?= htmlspecialchars($req['document_no']) ?>
            </span>
        </div>

        <div class="bg-slate-950/80 rounded-xl p-4 border border-slate-800 text-xs space-y-2">
            <div class="flex justify-between"><span class="text-slate-400">หัวข้อรายการ:</span><span class="font-bold text-slate-200"><?= htmlspecialchars($req['title']) ?></span></div>
            <div class="flex justify-between"><span class="text-slate-400">ผู้ขออนุมัติ:</span><span class="font-bold text-slate-200"><?= htmlspecialchars($req['requester_name']) ?></span></div>
            <div class="flex justify-between"><span class="text-slate-400">เวลาดำเนินการ:</span><span class="font-mono text-emerald-400"><?= date('d/m/Y H:i:s') ?></span></div>
        </div>

        <a href="/" class="block w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold text-center rounded-xl shadow-lg transition-all">เข้าสู่ระบบ CMMS-TOPPAN Dashboard →</a>
    </div>

    <?php elseif ($req['status'] !== 'pending'): ?>
    <!-- Already Processed Card -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-4">
        <div class="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-xl">ℹ️</div>
        <h2 class="text-lg font-bold text-white">คำขอนี้ได้รับการดำเนินการไปแล้ว</h2>
        <p class="text-xs text-amber-300">
            สถานะปัจจุบัน: <strong class="uppercase font-mono"><?= htmlspecialchars($req['status']) ?></strong>
            (เมื่อ <?= date('d/m/Y H:i', strtotime($req['approved_at'])) ?>)
        </p>
        <a href="/" class="inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all">กลับหน้าหลัก</a>
    </div>

    <?php else: ?>
    <!-- Pending Approval Action Card -->
    <form method="POST" class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        <?= csrfField() ?>
        <input type="hidden" name="token" value="<?= htmlspecialchars($token) ?>">

        <div class="border-b border-slate-800 pb-3">
            <span class="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold rounded-md uppercase">1-CLICK APPROVAL REQUEST</span>
            <h2 class="text-lg font-black text-white mt-2"><?= htmlspecialchars($req['title']) ?></h2>
            <p class="text-xs text-slate-400 mt-0.5">เลขที่เอกสาร: <span class="font-mono font-bold text-indigo-400"><?= htmlspecialchars($req['document_no']) ?></span></p>
        </div>

        <div class="bg-slate-950 rounded-xl p-4 border border-slate-800 text-xs space-y-2">
            <div class="flex justify-between"><span class="text-slate-400">ประเภทเอกสาร:</span><span class="font-bold text-indigo-300 uppercase"><?= htmlspecialchars($req['request_type']) ?></span></div>
            <div class="flex justify-between"><span class="text-slate-400">ผู้ส่งขออนุมัติ:</span><span class="font-bold text-slate-200"><?= htmlspecialchars($req['requester_name']) ?></span></div>
            <div class="flex justify-between"><span class="text-slate-400">วันที่ส่งเรื่อง:</span><span class="font-mono text-slate-300"><?= date('d/m/Y H:i', strtotime($req['created_at'])) ?></span></div>
        </div>

        <?php if ($action === 'reject'): ?>
        <!-- Rejection Reason Input -->
        <div class="space-y-2">
            <label class="text-xs font-bold text-rose-400 block">ระบุเหตุผลการไม่อนุมัติ (Rejection Reason):</label>
            <textarea name="reason" rows="3" required placeholder="กรอกเหตุผลในการปฏิเสธคำขอนี้..." class="w-full bg-slate-950 text-white text-xs border border-rose-500/40 rounded-xl p-3 focus:outline-none focus:border-rose-500 font-bold placeholder-slate-500"></textarea>
        </div>
        <button type="submit" name="submit_action" value="reject" class="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
            <span>❌</span> <span>ยืนยันปฏิเสธคำขอนี้</span>
        </button>
        <?php else: ?>
        <!-- Action Buttons -->
        <div class="grid grid-cols-2 gap-3">
            <button type="submit" name="submit_action" value="approve" class="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                <span>✅</span> <span>อนุมัติรายการ (Approve)</span>
            </button>
            <a href="?token=<?= htmlspecialchars($token) ?>&action=reject" class="py-3 bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold text-xs rounded-xl border border-slate-700 text-center transition-all flex items-center justify-center gap-2">
                <span>❌</span> <span>ระบุเหตุผลไม่อนุมัติ</span>
            </a>
        </div>
        <?php endif; ?>

    </form>
    <?php endif; ?>

</div>

<script>
    if (typeof lucide !== 'undefined') lucide.createIcons();
</script>
</body>
</html>
