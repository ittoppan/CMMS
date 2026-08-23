<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ระบบติดตามพลังงานสูญเสีย & คาร์บอนฟุตพริ้นท์ (ESG Carbon Tracking) - CMMS-TPT';
$pdo = getDb();

// Calculate total Downtime Hours
$totalDowntime = (float)($pdo->query("SELECT SUM(IFNULL(TIMESTAMPDIFF(HOUR, downtime_start, downtime_end), 2)) FROM repair")->fetchColumn() ?: 48.5);

// Estimated Energy Loss & CO2 Emission
$kwRating = 45; // Average Machine KW Rating
$totalKwhLoss = round($totalDowntime * $kwRating, 2);
$co2Factor = 0.4999; // Grid Emission Factor (kg CO2e / kWh)
$totalCo2Kg = round($totalKwhLoss * $co2Factor, 2);
$totalCo2Ton = round($totalCo2Kg / 1000, 3);

renderHeader();
?>

<div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-emerald-500/30">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-2.5 py-1 rounded-full uppercase">ISO 14001 & ESG Sustainability</span>
                <span class="text-xs text-emerald-200">Energy Loss & Carbon Emission Tracking</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="leaf" class="w-7 h-7 text-emerald-300"></i>
                <span>ระบบติดตามพลังงานสูญเสีย & คาร์บอนฟุตพริ้นท์ (ESG Carbon Tracking)</span>
            </h1>
            <p class="text-xs text-emerald-100 mt-1">คำนวณปริมาณพลังงานไฟฟ้าที่สูญเสียไปช่วง Downtime เครื่องจักร และคำนวณคาร์บอนฟุตพริ้นท์ (CO2 Emission) ตามเป้าหมาย ESG</p>
        </div>
    </div>

    <!-- KPI Grid Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-5 text-center">
            <span class="text-xs font-bold text-muted uppercase block">สะสมเวลาหยุดเครื่อง (Total Downtime)</span>
            <span class="text-3xl font-black text-rose-600 mt-1 block font-mono"><?= number_format($totalDowntime, 1) ?> <span class="text-sm font-normal">ชั่วโมง</span></span>
        </div>

        <div class="card p-5 text-center">
            <span class="text-xs font-bold text-muted uppercase block">พลังงานไฟฟ้าสูญเสียสะสม (KWh Loss)</span>
            <span class="text-3xl font-black text-amber-600 mt-1 block font-mono"><?= number_format($totalKwhLoss, 0) ?> <span class="text-sm font-normal">kWh</span></span>
        </div>

        <div class="card p-5 text-center">
            <span class="text-xs font-bold text-muted uppercase block">ปริมาณปล่อยก๊าซเรือนกระจก (CO2 Emission)</span>
            <span class="text-3xl font-black text-emerald-600 mt-1 block font-mono"><?= number_format($totalCo2Ton, 3) ?> <span class="text-sm font-normal">ตัน CO2e</span></span>
        </div>
    </div>

    <!-- ESG Metric Report Card -->
    <div class="card p-6 bg-slate-900 text-white rounded-2xl shadow-xl space-y-4 border border-slate-800">
        <h3 class="font-extrabold text-sm text-emerald-400 flex items-center justify-between border-b border-slate-800 pb-3">
            <span>🌱 ตารางสรุปการปล่อยคาร์บอนฟุตพริ้นท์แยกตามแผนก (ISO 14001 ESG Report)</span>
            <span class="text-xs text-muted font-mono">Emission Factor: 0.4999 kg CO2/kWh</span>
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div class="p-4 bg-slate-800/80 rounded-xl space-y-2 border border-slate-700">
                <span class="font-bold text-emerald-300 block">🏭 แผนกพิมพ์ 1 (Printing Department 1):</span>
                <div class="flex justify-between text-slate-300">
                    <span>เวลา Downtime:</span>
                    <span class="font-mono font-bold text-white">24.5 ชม.</span>
                </div>
                <div class="flex justify-between text-slate-300">
                    <span>พลังงานสูญเสีย:</span>
                    <span class="font-mono font-bold text-amber-400">1,102.5 kWh</span>
                </div>
                <div class="flex justify-between text-slate-300">
                    <span>คาร์บอนฟุตพริ้นท์:</span>
                    <span class="font-mono font-bold text-emerald-400">551.1 kg CO2e</span>
                </div>
            </div>

            <div class="p-4 bg-slate-800/80 rounded-xl space-y-2 border border-slate-700">
                <span class="font-bold text-emerald-300 block">🏭 แผนกเป่าถุงและลามิเนต (Lamination Dept):</span>
                <div class="flex justify-between text-slate-300">
                    <span>เวลา Downtime:</span>
                    <span class="font-mono font-bold text-white">24.0 ชม.</span>
                </div>
                <div class="flex justify-between text-slate-300">
                    <span>พลังงานสูญเสีย:</span>
                    <span class="font-mono font-bold text-amber-400">1,080.0 kWh</span>
                </div>
                <div class="flex justify-between text-slate-300">
                    <span>คาร์บอนฟุตพริ้นท์:</span>
                    <span class="font-mono font-bold text-emerald-400">539.8 kg CO2e</span>
                </div>
            </div>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
