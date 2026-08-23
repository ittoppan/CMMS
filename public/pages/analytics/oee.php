<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '📈 Realtime OEE Calculator (Overall Equipment Effectiveness) — CMMS-TOPPAN';
$pdo = getDb();

// คำนวณ Availability จากข้อมูลจริง: เวลา Downtime จากตาราง repair (ข้อมูลในระบบ)
// ถ้ายังไม่มีข้อมูลจริง → แสดง N/A แทนตัวเลขสมมติ
$monthDays = 30;
$downtimeMinutes = 0;
try {
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, downtime_start, downtime_end)), 0)
         FROM repair
         WHERE downtime_start IS NOT NULL AND downtime_end IS NOT NULL
           AND downtime_start >= DATE_SUB(NOW(), INTERVAL 30 DAY)"
    );
    $stmt->execute();
    $downtimeMinutes = (int)$stmt->fetchColumn();
} catch (Exception $e) {}
$hasRealData = $downtimeMinutes > 0;
$avail = $hasRealData ? max(0, round(100 - ($downtimeMinutes / ($monthDays * 24 * 60)) * 100, 1)) : null;
$perf  = null; // ยังไม่มีข้อมูลการผลิตจริงในระบบ
$qual  = null; // ยังไม่มีข้อมูล QC ในระบบ
$oee   = ($avail !== null && $perf !== null && $qual !== null) ? round(($avail * $perf * $qual) / 10000, 2) : null;

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
            <span class="text-3xl font-black text-emerald-400 block"><?= $oee !== null ? $oee . '%' : 'N/A' ?></span>
            <span class="text-[10px] text-blue-200 uppercase font-bold">World-Class OEE Target: >85%</span>
        </div>
    </div>

    <!-- OEE 3 Factor Breakdown Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <!-- 1. Availability Rate -->
        <div class="card p-5 border-2 border-indigo-200 space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-extrabold text-indigo-900 text-sm">⏱️ 1. Availability Rate (อัตราความพร้อมใช้งาน)</span>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= $avail !== null ? $avail . '%' : 'N/A' ?></span>
            </div>
            <p class="text-xs text-secondary">คำนวณจาก downtime จริง 30 วันที่ผ่านมา (จากตาราง repair) เทียบกับเวลาเดินเครื่องตามแผน</p>
            <div class="w-full bg-muted h-3 rounded-full overflow-hidden">
                <div class="bg-indigo-600 h-full rounded-full" style="width: <?= $avail !== null ? $avail : 0 ?>%;"></div>
            </div>
        </div>

        <!-- 2. Performance Rate -->
        <div class="card p-5 border-2 border-purple-200 space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-extrabold text-purple-900 text-sm">⚡ 2. Performance Rate (สมรรถนะการเดินเครื่อง)</span>
                <span class="badge bg-purple-100 text-purple-800 font-bold text-xs"><?= $perf !== null ? $perf . '%' : 'N/A' ?></span>
            </div>
            <p class="text-xs text-secondary">ยังไม่มีข้อมูลการผลิตจริง (Ideal Cycle Time) ในระบบ — รอเชื่อมข้อมูลฝ่ายผลิต</p>
            <div class="w-full bg-muted h-3 rounded-full overflow-hidden">
                <div class="bg-purple-600 h-full rounded-full" style="width: <?= $perf !== null ? $perf : 0 ?>%;"></div>
            </div>
        </div>

        <!-- 3. Quality Rate -->
        <div class="card p-5 border-2 border-emerald-200 space-y-3">
            <div class="flex items-center justify-between">
                <span class="font-extrabold text-emerald-900 text-sm">🎯 3. Quality Rate (คุณภาพชิ้นงานดี)</span>
                <span class="badge badge badge-success font-bold text-xs"><?= $qual !== null ? $qual . '%' : 'N/A' ?></span>
            </div>
            <p class="text-xs text-secondary">ยังไม่มีข้อมูล QC ในระบบ — รอเชื่อมข้อมูลฝ่ายประกันคุณภาพ</p>
            <div class="w-full bg-muted h-3 rounded-full overflow-hidden">
                <div class="bg-emerald-600 h-full rounded-full" style="width: <?= $qual !== null ? $qual : 0 ?>%;"></div>
            </div>
        </div>

    </div>

</div>

<?php renderFooter(); ?>
