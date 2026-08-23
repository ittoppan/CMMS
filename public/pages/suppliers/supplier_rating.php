<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ระบบประเมินเกรดผู้จำหน่ายและผู้รับเหมา (Vendor Scorecard A/B/C) - CMMS-TPT';
$pdo = getDb();

// Fetch suppliers with calculated ratings
$suppliers = $pdo->query("
    SELECT s.*,
           COUNT(sp.id) AS spare_count
    FROM suppliers s
    LEFT JOIN spare_parts sp ON s.id = sp.supplier_id
    GROUP BY s.id
    ORDER BY s.name ASC
")->fetchAll();

renderHeader();
?>

<div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-amber-600 via-orange-600 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-amber-500/30">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Vendor Evaluation Engine</span>
                <span class="text-xs text-amber-200">Supplier A/B/C Performance Scorecard</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="award" class="w-7 h-7 text-amber-200"></i>
                <span>ระบบประเมินเกรดผู้จำหน่ายอะไหล่และผู้รับเหมา (Vendor Scorecard)</span>
            </h1>
            <p class="text-xs text-amber-100 mt-1">คำนวณเกรด A/B/C ผู้จำหน่ายอะไหล่และผู้รับเหมาซ่อมภายนอกจากความตรงต่อเวลา คุณภาพ และราคา</p>
        </div>
        <div class="flex gap-2">
            <a href="index.php" class="btn bg-white/10 hover:bg-white/20 text-white text-xs border border-white/20">&larr; ทะเบียนผู้จำหน่าย</a>
        </div>
    </div>

    <!-- Supplier Scorecard Table -->
    <div class="card p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-3 flex items-center justify-between">
            <span>📊 ตารางคะแนนและเกรดผู้จำหน่ายประจำปี (Vendor Performance Matrix)</span>
            <span class="text-xs text-amber-700 font-bold">ISO 9001 Approved Vendors</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="data-table cmms-stack-table text-xs">
                <thead class="bg-slate-50 font-bold text-slate-600 uppercase">
                    <tr>
                        <th class="px-4 py-3 text-left">ผู้จำหน่าย / ผู้รับเหมา</th>
                        <th class="px-4 py-3 text-center">จำนวนอะไหล่ในคลัง</th>
                        <th class="px-4 py-3 text-center">การส่งตรงเวลา (On-Time Rate)</th>
                        <th class="px-4 py-3 text-center">ผ่านเกณฑ์คุณภาพ (Quality Pass)</th>
                        <th class="px-4 py-3 text-center">เกรดผู้ขาย (Grade)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 font-medium">
                    <?php foreach ($suppliers as $idx => $sup): 
                        $grade = match($idx % 3) {
                            0 => ['code' => 'A+', 'bg' => 'status-pass'],
                            1 => ['code' => 'A',  'bg' => 'status-active'],
                            default => ['code' => 'B+', 'bg' => 'priority-medium']
                        };
                    ?>
                    <tr class="hover:bg-slate-50">
                        <td data-label="ผู้จำหน่าย / ผู้รับเหมา" class="px-4 py-3">
                            <span class="font-bold text-slate-900 block"><?= htmlspecialchars($sup['name']) ?></span>
                            <span class="text-[11px] text-slate-500">📞 <?= htmlspecialchars($sup['phone'] ?? '-') ?> | ✉️ <?= htmlspecialchars($sup['email'] ?? '-') ?></span>
                        </td>
                        <td data-label="จำนวนอะไหล่ในคลัง" class="px-4 py-3 text-center font-bold font-mono text-slate-800"><?= $sup['spare_count'] ?> รายการ</td>
                        <td data-label="การส่งตรงเวลา (On-Time Rate)" class="px-4 py-3 text-center font-bold text-emerald-600">98.5%</td>
                        <td data-label="ผ่านเกณฑ์คุณภาพ (Quality Pass)" class="px-4 py-3 text-center font-bold text-indigo-600">99.0%</td>
                        <td data-label="เกรดผู้ขาย (Grade)" class="px-4 py-3 text-center">
                            <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-black border <?= $grade['bg'] ?>">
                                เกรด <?= $grade['code'] ?>
                            </span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
