<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/DispatchService.php';

$pageTitle = '🔄 AI Auto Scheduler (Smart Dispatching) — CMMS-TOPPAN';
$matches = DispatchService::autoMatchTechnicians();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">AI Workload & Skill Match Engine</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Smart Dispatching</span>
            </div>
            <h1 class="text-2xl font-black">🔄 ระบบจัดคิวงานซ่อมช่างแมตช์สกิลอัตโนมัติ (AI Auto Scheduler)</h1>
            <p class="text-xs text-blue-100 mt-1">วิเคราะห์ภาระงานช่าง (Workload) ความเชี่ยวชาญเฉพาะทาง (Skill Match) และสถานะความว่าง เพื่อจ่ายงานให้ช่างที่เหมาะสมที่สุดอัตโนมัติ</p>
        </div>
        <button onclick="location.reload();" class="btn btn-primary bg-white text-indigo-900 hover:bg-blue-50 text-xs font-black px-4 py-2.5 rounded-xl shadow-lg">
            ⚡ คำนวณแมตช์คิวงานซ่อมสด
        </button>
    </div>

    <!-- AI Match Results Table -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 ผลการวิเคราะห์จัดคิวงานซ่อมอัตโนมัติ (AI Matched Dispatch Assignments)</span>
            <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= count($matches) ?> ใบงาน</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-50 font-bold text-slate-700 uppercase border-b">
                    <tr>
                        <th class="p-3">เลขที่ใบสั่งซ่อม</th>
                        <th class="p-3">เครื่องจักร</th>
                        <th class="p-3">ระดับความสำคัญ</th>
                        <th class="p-3 font-bold text-indigo-700">ช่างที่ AI แนะนำ (Matched Technician)</th>
                        <th class="p-3 text-center">คะแนนความเหมาะสม (Skill Match Score)</th>
                        <th class="p-3 text-center">การจัดการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($matches as $m): ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700 text-sm"><?= htmlspecialchars($m['work_order_no']) ?></td>
                        <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($m['asset_name']) ?> — <span class="text-slate-500 font-normal"><?= htmlspecialchars($m['title']) ?></span></td>
                        <td class="p-3">
                            <span class="badge font-bold text-[10px] uppercase <?= match($m['priority']) { 'critical'=>'badge badge-error', 'high'=>'badge badge-warning', default=>'badge badge-info' } ?>">
                                <?= htmlspecialchars($m['priority']) ?>
                            </span>
                        </td>
                        <td class="p-3 font-bold text-indigo-900 text-sm">👤 <?= htmlspecialchars($m['assigned_technician']) ?></td>
                        <td class="p-3 text-center">
                            <span class="badge badge badge-success font-black text-xs">🎯 <?= $m['match_score'] ?> Match</span>
                        </td>
                        <td class="p-3 text-center">
                            <button onclick="alert('ยืนยันมอบหมายงาน WO <?= htmlspecialchars($m['work_order_no']) ?> ให้ช่าง <?= addslashes($m['assigned_technician']) ?> สำเร็จ!')" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold px-3 py-1">
                                ✅ ยืนยันจ่ายงาน
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
