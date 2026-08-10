<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '📈 Realtime OEE Calculator (Overall Equipment Effectiveness) — CMMS-TOPPAN';
$pdo = getDb();

// Sample OEE Calculations
$avail = 92.5;  // Availability %
$perf  = 94.0;  // Performance %
$qual  = 99.2;  // Quality %
$oee   = round(($avail * $perf * $qual) / 10000, 2); // OEE = Availability x Performance x Quality

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Total Productive Maintenance (TPM) Metric</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">OEE Integration</span>
            </div>
            <h1 class="text-2xl font-black">📈 ระบบคำนวณประสิทธิผลโดยรวมของเครื่องจักร (OEE Realtime Integration)</h1>
            <p class="text-xs text-blue-100 mt-1">หลอมรวมข้อมูลการผลิต (Production) และงานซ่อมบำรุง (Maintenance) ด้วยสมการ OEE = Availability × Performance × Quality</p>
        </div>
        <div class="text-right">
            <span class="text-3xl font-black text-emerald-400 block"><?= $oee ?>%</span>
            <span class="text-[10px] text-blue-200 uppercase font-bold">World-Class OEE Target: >85%</span>
        </div>
    </div>

    <!-- OEE 3 Factor Breakdown Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <!-- 1. Availability Rate -->
        <div class="card p-5 bg-white rounded-2xl border-2 border-indigo-200 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-extrabold text-indigo-900 text-sm">⏱️ 1. Availability Rate (อัตราความพร้อมใช้งาน)</span>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= $avail ?>%</span>
            </div>
            <p class="text-xs text-slate-600">คำนวณจากเวลาเดินเครื่องจริงเทียบกับเวลาวางแผนการผลิต (หักลบ Downtime งานซ่อม Break Down 🔴)</p>
            <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                <div class="bg-indigo-600 h-full rounded-full" style="width: <?= $avail ?>%;"></div>
            </div>
        </div>

        <!-- 2. Performance Rate -->
        <div class="card p-5 bg-white rounded-2xl border-2 border-purple-200 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-extrabold text-purple-900 text-sm">⚡ 2. Performance Rate (สมรรถนะการเดินเครื่อง)</span>
                <span class="badge bg-purple-100 text-purple-800 font-bold text-xs"><?= $perf ?>%</span>
            </div>
            <p class="text-xs text-slate-600">คำนวณจากความเร็วในการผลิตจริงเทียบกับความเร็วออกแบบตามสเปกเครื่องจักร (Ideal Cycle Time)</p>
            <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                <div class="bg-purple-600 h-full rounded-full" style="width: <?= $perf ?>%;"></div>
            </div>
        </div>

        <!-- 3. Quality Rate -->
        <div class="card p-5 bg-white rounded-2xl border-2 border-emerald-200 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-extrabold text-emerald-900 text-sm">🎯 3. Quality Rate (คุณภาพชิ้นงานดี)</span>
                <span class="badge badge badge-success font-bold text-xs"><?= $qual ?>%</span>
            </div>
            <p class="text-xs text-slate-600">คำนวณจากจำนวนชิ้นงานดีที่ผ่านเกณฑ์ QC เทียบกับจำนวนผลิตรวมทั้งหมด (หักลบชิ้นงานเสีย/NG)</p>
            <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                <div class="bg-emerald-600 h-full rounded-full" style="width: <?= $qual ?>%;"></div>
            </div>
        </div>

    </div>

</div>

<?php renderFooter(); ?>
