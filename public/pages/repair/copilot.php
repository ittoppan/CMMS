<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/AICopilotService.php';

$pageTitle = '🤖 AI Repair Copilot สำหรับช่างซ่อมบำรุง — CMMS-TOPPAN';

$userQuery = $_GET['q'] ?? 'มอเตอร์ร้อน + มีเสียงดังแทรก';
$aiResponse = AICopilotService::diagnoseSymptom($userQuery);

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-purple-200">Smart Maintenance Knowledge Copilot</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">AI Assistant</span>
            </div>
            <h1 class="text-2xl font-black">🤖 AI Assistant สำหรับช่างซ่อมบำรุง (AI Repair Copilot)</h1>
            <p class="text-xs text-purple-100 mt-1">ช่วยช่างแก้ปัญหางานซ่อมได้ทันที พิมพ์อาการเสีย ➔ AI วิเคราะห์สาเหตุ, ขั้นตอนการตรวจเช็ค, และเบิกอะไหล่ที่ต้องใช้ให้อัตโนมัติ</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🤖</div>
    </div>

    <!-- Interactive Query Box -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <form method="GET" class="flex gap-2">
            <input type="text" name="q" value="<?= htmlspecialchars($userQuery) ?>" placeholder="พิมพ์อาการเสีย เช่น 'มอเตอร์ร้อน + เสียงดัง', 'สายพานลำเลียงสั่น', 'แรงดันลมตก'..." class="input input-bordered w-full font-bold text-slate-800 text-sm">
            <button type="submit" class="btn btn-primary bg-purple-700 hover:bg-purple-800 font-bold px-6 py-2">
                🤖 AI วิเคราะห์งานซ่อม
            </button>
        </form>
    </div>

    <!-- AI Result Display Card -->
    <div class="card p-6 bg-white rounded-2xl border-2 border-purple-200 shadow-lg space-y-6">
        <div class="flex items-center justify-between border-b pb-3">
            <h3 class="font-black text-purple-900 text-lg flex items-center gap-2">
                <span>🤖 ผลการวิเคราะห์อาการ:</span>
                <span class="bg-purple-100 text-purple-800 px-3 py-1 rounded-xl text-sm font-bold">"<?= htmlspecialchars($aiResponse['symptom']) ?>"</span>
            </h3>
            <span class="badge badge badge-success font-bold text-xs">🎯 AI Match Score: 98%</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- 1. Probable Causes -->
            <div class="p-4 bg-rose-50 rounded-2xl border border-rose-200 space-y-2">
                <span class="font-extrabold text-rose-900 text-sm block">⚠️ 1. สาเหตุที่เป็นไปได้ (Probable Causes)</span>
                <ul class="space-y-1.5 text-xs text-slate-700">
                    <?php foreach ($aiResponse['causes'] as $c): ?>
                    <li class="font-medium bg-white p-2 rounded-lg border border-rose-100"><?= htmlspecialchars($c) ?></li>
                    <?php endforeach; ?>
                </ul>
            </div>

            <!-- 2. Inspection Steps -->
            <div class="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 space-y-2">
                <span class="font-extrabold text-indigo-900 text-sm block">🔍 2. ขั้นตอนการตรวจเช็คหน้างาน (SOP Inspection)</span>
                <ul class="space-y-1.5 text-xs text-slate-700">
                    <?php foreach ($aiResponse['steps'] as $s): ?>
                    <li class="font-medium bg-white p-2 rounded-lg border border-indigo-100"><?= htmlspecialchars($s) ?></li>
                    <?php endforeach; ?>
                </ul>
            </div>

            <!-- 3. Recommended Spare Parts -->
            <div class="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
                <span class="font-extrabold text-emerald-900 text-sm block">📦 3. อะไหล่ที่ต้องเตรียมเบิก (Recommended Spares)</span>
                <ul class="space-y-1.5 text-xs text-slate-700">
                    <?php foreach ($aiResponse['spares'] as $sp): ?>
                    <li class="font-bold bg-white p-2 rounded-lg border border-emerald-100 flex items-center justify-between">
                        <div>
                            <span class="font-mono text-indigo-700"><?= htmlspecialchars($sp['code']) ?></span>
                            <div class="text-slate-800 text-[11px]"><?= htmlspecialchars($sp['name']) ?></div>
                        </div>
                        <span class="badge bg-emerald-200 text-emerald-900 font-black text-[10px]"><?= htmlspecialchars($sp['qty']) ?></span>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
