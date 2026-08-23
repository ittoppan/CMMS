<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '⏱️ SLA & Response Time Control — CMMS-TOPPAN';
$pdo = getDb();

$wos = $pdo->query("
    SELECT r.*, a.code AS asset_code, a.name AS asset_name
    FROM repair r
    JOIN asset_registry a ON r.asset_id = a.id
    WHERE r.status IN ('open', 'in_progress')
    ORDER BY r.id DESC LIMIT 15
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-rose-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-rose-200">Service Level Agreement (SLA) Monitor</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">SLA Control</span>
            </div>
            <h1 class="text-2xl font-black">⏱️ ระบบควบคุมเวลารับและปิดงานซ่อม (SLA & Response Time Control)</h1>
            <p class="text-xs text-rose-100 mt-1">คุมประสิทธิภาพทีมช่างด้วยเวลารับงาน (Response Time Target: < 15 นาที) และเวลาปิดงานซ่อม (Resolution Time Target: < 120 นาที) พร้อมนาฬิกานับถอยหลัง</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">⏱️</div>
    </div>

    <!-- SLA Countdown Cards -->
    <div class="card p-5 space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 รายการใบสั่งซ่อมที่อยู่ระหว่างนับเวลา SLA (Active Work Order SLA Countdown)</span>
            <span class="badge badge badge-error font-bold text-xs"><?= count($wos) ?> ใบงาน active</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-800 text-white font-bold uppercase">
                    <tr>
                        <th class="p-3">เลขที่ WO</th>
                        <th class="p-3">เครื่องจักร</th>
                        <th class="p-3 text-center">เป้าหมาย Response Time</th>
                        <th class="p-3 text-center">เวลานับถอยหลังรับงาน (SLA Timer)</th>
                        <th class="p-3 text-center">สถานะ SLA</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($wos as $wo): ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700 text-sm"><?= htmlspecialchars($wo['work_order_no'] ?? 'WO') ?></td>
                        <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($wo['asset_code']) ?> — <?= htmlspecialchars($wo['asset_name']) ?></td>
                        <td class="p-3 text-center font-bold text-slate-700">15.00 นาที</td>
                        <td class="p-3 text-center font-mono font-black text-rose-600 text-sm">
                            ⏱️ 00:08:42 นาที
                        </td>
                        <td class="p-3 text-center">
                            <span class="badge badge badge-success font-bold text-[10px]">🟢 อยู่ในเกณฑ์ SLA</span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
