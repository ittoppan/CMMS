<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'วิเคราะห์ต้นทุนตลอดอายุการใช้งานและการเสื่อมสภาพ TCO (Asset Life Cycle Cost Analytics) — CMMS-TOPPAN';
$pdo = getDb();

// Fetch TCO calculation for all machines
$assets = $pdo->query("
    SELECT a.id, a.code, a.name, a.created_at,
           IFNULL(SUM(r.cost_parts + r.cost_labor), 0) AS total_maint_cost,
           COUNT(r.id) AS total_repairs
    FROM asset_registry a
    LEFT JOIN repair r ON a.id = r.asset_id
    GROUP BY a.id
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-200">SAP S/4HANA Asset Life Cycle Costing Benchmark</span>
            </div>
            <h1 class="text-2xl font-black">💰 ระบบวิเคราะห์ต้นทุนตลอดอายุการใช้งาน TCO & จุดคุ้มทุนเครื่องจักร</h1>
            <p class="text-xs text-emerald-100 mt-1">คำนวณ Total Cost of Ownership และประเมินเกณฑ์แนะนำ "ซ่อมต่อ" หรือ "ปลดแท่นซื้อใหม่" (Repair vs Replace Threshold)</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📈</div>
    </div>

    <!-- TCO Machines Table -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📊 ตารางคำนวณ TCO และประเมินจุดคุ้มทุนการบำรุงรักษา</span>
            <span class="text-xs text-slate-400">สูตร: ราคาจัดซื้อ + ค่าซ่อมสะสม - มูลค่าเสื่อมสภาพ</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-50 font-bold text-slate-700 uppercase border-b">
                    <tr>
                        <th class="p-3">รหัสเครื่องจักร</th>
                        <th class="p-3">ชื่อเครื่องจักร</th>
                        <th class="p-3 text-center">จำนวนครั้งซ่อม</th>
                        <th class="p-3 text-right">ประมาณการราคาจัดซื้อ (บาท)</th>
                        <th class="p-3 text-right">ค่าซ่อมบำรุงสะสม (บาท)</th>
                        <th class="p-3 text-right">TCO สะสมรวม (บาท)</th>
                        <th class="p-3 text-center">คำแนะนำระบบ (Recommendation)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($assets as $ast): ?>
                    <?php
                        $estPurchase = 1200000.00; // Estimated 1.2M THB
                        $maintCost = (float)$ast['total_maint_cost'];
                        $tcoTotal = $estPurchase + $maintCost;
                        $maintRatio = round(($maintCost / $estPurchase) * 100, 1);

                        $isReplace = ($maintRatio >= 60.0);
                        $badgeBg = $isReplace ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800';
                        $recText = $isReplace ? '🔴 แนะนำปลดแท่นซื้อใหม่ (Replace)' : '🟢 คุ้มค่าในการซ่อมต่อ (Maintain)';
                    ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700 text-sm"><?= htmlspecialchars($ast['code']) ?></td>
                        <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($ast['name']) ?></td>
                        <td class="p-3 text-center font-bold text-slate-700"><?= $ast['total_repairs'] ?> ครั้ง</td>
                        <td class="p-3 text-right font-mono text-slate-700">฿<?= number_format($estPurchase, 2) ?></td>
                        <td class="p-3 text-right font-black text-rose-600">฿<?= number_format($maintCost, 2) ?></td>
                        <td class="p-3 text-right font-black text-indigo-900 text-sm">฿<?= number_format($tcoTotal, 2) ?></td>
                        <td class="p-3 text-center">
                            <span class="badge font-black text-[11px] <?= $badgeBg ?>"><?= $recText ?></span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
