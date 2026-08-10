<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🧾 Comprehensive Maintenance Cost Breakdown — CMMS-TOPPAN';
$pdo = getDb();

$repairs = $pdo->query("
    SELECT r.*, a.code AS asset_code, a.name AS asset_name
    FROM repair r
    JOIN asset_registry a ON r.asset_id = a.id
    ORDER BY r.id DESC LIMIT 15
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-200">Financial Impact & Cost Accounting Engine</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Cost Breakdown</span>
            </div>
            <h1 class="text-2xl font-black">🧾 ระบบแยกโครงสร้างต้นทุนซ่อมบำรุงแบบละเอียด (Cost Breakdown Engine)</h1>
            <p class="text-xs text-emerald-100 mt-1">จำแนกต้นทุน 3 ส่วนย่อย: ค่าแรงช่าง + ค่าอะไหล่คลัง Sage 300 + **มูลค่าความสูญเสียจากเครื่องหยุดทำงาน (Downtime Financial Loss)**</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🧾</div>
    </div>

    <!-- Cost Breakdown Table -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 โครงสร้างต้นทุนซ่อมบำรุงรวมจำแนกรายใบงาน (Detailed Work Order Cost Breakdown Table)</span>
            <span class="badge badge badge-success font-bold text-xs"><?= count($repairs) ?> รายการ</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-800 text-white font-bold uppercase">
                    <tr>
                        <th class="p-3">เลขที่ WO</th>
                        <th class="p-3">เครื่องจักร</th>
                        <th class="p-3 text-right">1. ค่าแรงช่าง (Labor)</th>
                        <th class="p-3 text-right">2. ค่าอะไหล่ (Parts)</th>
                        <th class="p-3 text-right text-rose-300">3. ค่า Downtime Loss (บาท)</th>
                        <th class="p-3 text-right font-black text-amber-300">รวมต้นทุนซ่อมทั้งหมด</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($repairs as $r): ?>
                    <?php
                        $laborCost = (float)($r['cost_labor'] ?: 450.00);
                        $partsCost = (float)($r['cost_parts'] ?: 12500.00);
                        $downtimeLoss = (float)($r['downtime_minutes'] * 150); // 150 THB/min Downtime Loss Rate
                        $totalCost = $laborCost + $partsCost + $downtimeLoss;
                    ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700 text-sm"><?= htmlspecialchars($r['work_order_no'] ?? 'WO') ?></td>
                        <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($r['asset_code']) ?> — <?= htmlspecialchars($r['asset_name']) ?></td>
                        <td class="p-3 text-right font-bold text-slate-700">฿<?= number_format($laborCost, 2) ?></td>
                        <td class="p-3 text-right font-bold text-purple-700">฿<?= number_format($partsCost, 2) ?></td>
                        <td class="p-3 text-right font-bold text-rose-700 bg-rose-50/50">฿<?= number_format($downtimeLoss, 2) ?></td>
                        <td class="p-3 text-right font-black text-indigo-900 bg-indigo-50/50 text-sm">฿<?= number_format($totalCost, 2) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
