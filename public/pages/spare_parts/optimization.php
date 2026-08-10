<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/InventoryOptimizationService.php';

$pageTitle = '📦 AI Spare Parts Optimization (EOQ & Dead Stock) — CMMS-TOPPAN';
$optList = InventoryOptimizationService::getOptimizationMetrics();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-200">AI Inventory Working Capital Optimization</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">EOQ & Dead Stock AI</span>
            </div>
            <h1 class="text-2xl font-black">📦 ระบบเพิ่มประสิทธิภาพสต็อกอะไหล่ด้วย AI (EOQ & Dead Stock Alert)</h1>
            <p class="text-xs text-emerald-100 mt-1">คำนวณจุดสั่งซื้อ Economic Order Quantity (EOQ), แนะนำระดับ Min/Max สต็อกที่เหมาะสมด้วย AI, และแจ้งเตือนทุนจมคลัง (Dead Stock)</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">💰</div>
    </div>

    <!-- Optimization Table -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 ตารางคำนวณจุดสั่งซื้อ EOQ & วิเคราะห์เงินจมคลัง (AI Inventory Optimization Metrics)</span>
            <span class="badge badge badge-success font-bold text-xs"><?= count($optList) ?> รายการ</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-50 font-bold text-slate-700 uppercase border-b">
                    <tr>
                        <th class="p-3">รหัสอะไหล่</th>
                        <th class="p-3">ชื่ออะไหล่</th>
                        <th class="p-3 text-center">สต็อกปัจจุบัน</th>
                        <th class="p-3 text-center font-bold text-purple-700">AI Min / Max Recommend</th>
                        <th class="p-3 text-center font-black text-indigo-700">ปริมาณสั่งซื้อประหยัดสุด (EOQ)</th>
                        <th class="p-3 text-right">เงินจมสต็อกสะสม (บาท)</th>
                        <th class="p-3 text-center">สถานะทุนจม (Dead Stock Status)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($optList as $item): ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700"><?= htmlspecialchars($item['code']) ?></td>
                        <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($item['name']) ?></td>
                        <td class="p-3 text-center font-bold text-slate-700"><?= number_format($item['stock_qty']) ?> ชิ้น</td>
                        <td class="p-3 text-center font-bold text-purple-800 bg-purple-50/50">
                            Min: <?= $item['ai_min'] ?> / Max: <?= $item['ai_max'] ?>
                        </td>
                        <td class="p-3 text-center font-black text-indigo-900 bg-indigo-50/50 text-sm">
                            🎯 <?= $item['eoq'] ?> ชิ้น/ครั้ง
                        </td>
                        <td class="p-3 text-right font-black text-slate-900">฿<?= number_format($item['capital_tied'], 2) ?></td>
                        <td class="p-3 text-center">
                            <?php if ($item['is_dead_stock']): ?>
                            <span class="badge badge badge-error font-bold text-[10px] animate-pulse">⚠️ Dead Stock Alert</span>
                            <?php else: ?>
                            <span class="badge badge badge-success font-bold text-[10px]">🟢 สต็อกหมุนเวียนปกติ</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
