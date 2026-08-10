<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '📲 In-App & Web Push Notification Center — CMMS-TOPPAN';
$pdo = getDb();

// Seed sample in-app notifications
$notifications = [
    ['title' => '🔴 แจ้งเตือนด่วน: เครื่องสลิตติ้ง A-DL-01 เสีย (Break Down)', 'time' => '10 นาทีที่แล้ว', 'type' => 'urgent', 'read' => false],
    ['title' => '📋 แผน PM ประจำสัปดาห์: ตรวจสอบมอเตอร์ตู้พิมพ์ 10 สี', 'time' => '1 ชั่วโมงที่แล้ว', 'type' => 'pm', 'read' => true],
    ['title' => '📦 อะไหล่ต่ำกว่าเกณฑ์: BEARING 6205 2RS (คงเหลือ 2 ชิ้น)', 'time' => '3 ชั่วโมงที่แล้ว', 'type' => 'stock', 'read' => true]
];

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Native In-App & Web Push Shield</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Push Center</span>
            </div>
            <h1 class="text-2xl font-black">📲 ศูนย์แจ้งเตือนในระบบ & Web Push (In-App & Web Push Center)</h1>
            <p class="text-xs text-blue-100 mt-1">แจ้งเตือนสดผ่านหน้าจอเว็บและเบราว์เซอร์มือถือโดยไม่พึ่งพารวมข้อจำกัดของ LINE ช่วยให้ช่างและวิศวกรไม่พลาดทุกงานซ่อมบำรุงวิกฤต</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🔔</div>
    </div>

    <!-- Notification List -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 รายการแจ้งเตือนล่าสุด (Recent System Notifications)</span>
            <button onclick="alert('อ่านแล้วทั้งหมด')" class="text-xs text-indigo-600 font-bold hover:underline">กำจัดตัวเลขแจ้งเตือนทั้งหมด</button>
        </h3>

        <div class="divide-y divide-slate-100">
            <?php foreach ($notifications as $n): ?>
            <div class="py-3 flex items-center justify-between <?= !$n['read'] ? 'bg-indigo-50/50 p-3 rounded-xl border border-indigo-100' : '' ?>">
                <div class="space-y-1">
                    <span class="font-bold text-slate-900 text-xs block"><?= htmlspecialchars($n['title']) ?></span>
                    <span class="text-[10px] text-slate-400 font-mono"><?= $n['time'] ?></span>
                </div>
                <span class="badge font-bold text-[10px] <?= !$n['read'] ? 'badge badge-error animate-pulse' : 'bg-slate-100 text-slate-600' ?>">
                    <?= !$n['read'] ? '🔴 ยังไม่ได้อ่าน' : 'อ่านแล้ว' ?>
                </span>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
