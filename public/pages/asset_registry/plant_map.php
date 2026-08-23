<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แผนผังโรงงานอินเทอร์แอคทีฟ 2D (Interactive Plant Layout Map) - CMMS-TPT';
$pdo = getDb();

// Fetch machines with status and active repair count
$assets = $pdo->query("
    SELECT a.*, loc.name AS location_name, wz.name AS zone_name,
           (SELECT COUNT(*) FROM repair r WHERE r.asset_id = a.id AND r.status IN ('open', 'acknowledged', 'in_progress', 'waiting_parts')) AS active_repairs,
           (SELECT r.priority FROM repair r WHERE r.asset_id = a.id AND r.status IN ('open', 'acknowledged', 'in_progress', 'waiting_parts') ORDER BY r.priority = 'critical' DESC LIMIT 1) AS max_priority
    FROM asset_registry a
    LEFT JOIN locations loc ON a.location_id = loc.id
    LEFT JOIN work_zones wz ON a.work_zone_id = wz.id
    ORDER BY a.name ASC
")->fetchAll();

renderHeader();
?>

<div class="space-y-6 max-w-6xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-slate-800">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold px-2.5 py-1 rounded-full uppercase">Smart Factory 2D Visualizer</span>
                <span class="text-xs text-slate-300">Real-time Machine Status Map</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="map" class="w-7 h-7 text-indigo-400"></i>
                <span>แผนผังโรงงานอินเทอร์แอคทีฟ 2D (Interactive 2D Plant Layout Map)</span>
            </h1>
            <p class="text-xs text-slate-300 mt-1">แสดงตำแหน่งและไฟแสดงสถานะเครื่องจักรในแต่ละโซนการผลิตแบบ Real-time สีไฟแสดงสถานะความปกติ/ขัดข้อง</p>
        </div>
        <div class="flex gap-2">
            <a href="index.php" class="btn bg-white/10 text-white text-xs hover:bg-white/20 border border-white/20">&larr; ทะเบียนเครื่องจักร</a>
        </div>
    </div>

    <!-- Status Legend Card -->
    <div class="card p-4 flex items-center justify-between flex-wrap gap-4 text-xs font-bold">
        <span class="text-slate-700 block">คำอธิบายสีไฟสถานะเครื่องจักร:</span>
        <div class="flex items-center gap-4 flex-wrap">
            <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse"></span> 🟢 ทำงานปกติ (Operating)</span>
            <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-full bg-rose-600 animate-ping"></span> 🔴 เกิดเหตุซ่อมด่วน (Breakdown Critical)</span>
            <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded-full bg-amber-500"></span> 🟡 อยู่ระหว่างซ่อม/รออะไหล่ (In Repair)</span>
        </div>
    </div>

    <!-- 2D Plant Floor Layout Grid -->
    <div class="card p-6 bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 space-y-6 text-white">
        <h3 class="font-bold text-sm text-indigo-300 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-3">
            <span>🏭 แผนผังโซนการผลิต TOPPAN Factory Floor (Zone A & Zone B)</span>
            <span class="text-xs text-slate-400">Live Grid Node Map</span>
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <?php foreach ($assets as $a): 
                $hasRepair = $a['active_repairs'] > 0;
                $isCritical = $a['max_priority'] === 'critical';
                
                $statusBg = 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300';
                $dotBg = 'bg-emerald-500 shadow-emerald-500/50 shadow-lg';
                
                if ($isCritical) {
                    $statusBg = 'bg-rose-950/80 border-rose-500 text-rose-200 animate-pulse';
                    $dotBg = 'bg-rose-500 shadow-rose-500/50 shadow-lg animate-ping';
                } elseif ($hasRepair) {
                    $statusBg = 'bg-amber-950/60 border-amber-500/60 text-amber-200';
                    $dotBg = 'bg-amber-500 shadow-amber-500/50 shadow-lg';
                }
            ?>
            <div class="p-5 rounded-2xl border transition-all space-y-3 relative overflow-hidden <?= $statusBg ?>">
                <div class="flex items-center justify-between border-b border-white/10 pb-2">
                    <div>
                        <span class="font-mono text-xs font-black uppercase text-indigo-400 block"><?= htmlspecialchars($a['code']) ?></span>
                        <h4 class="font-extrabold text-sm text-white mt-0.5"><?= htmlspecialchars($a['name']) ?></h4>
                    </div>
                    <span class="w-4 h-4 rounded-full <?= $dotBg ?>"></span>
                </div>

                <div class="text-[11px] space-y-1 text-slate-300 font-medium">
                    <div>📍 โซน: <span class="font-bold text-white"><?= htmlspecialchars($a['zone_name'] ?? 'Main Zone') ?></span></div>
                    <div>🏢 สถานที่: <span class="font-bold text-white"><?= htmlspecialchars($a['location_name'] ?? 'Main Building') ?></span></div>
                    <div>🛠️ งานซ่อมค้าง: <span class="font-mono font-extrabold text-amber-400"><?= $a['active_repairs'] ?> งาน</span></div>
                </div>

                <div class="pt-2 flex justify-between items-center">
                    <a href="view.php?id=<?= $a['id'] ?>" class="text-[11px] font-bold text-indigo-300 hover:text-white underline">ดูประวัติเครื่อง &rarr;</a>
                    <a href="../repair/request.php?asset_id=<?= $a['id'] ?>" class="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold text-white transition-all">🔧 แจ้งซ่อมด่วน</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
