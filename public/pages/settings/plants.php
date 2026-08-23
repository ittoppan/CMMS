<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ระบบจัดการโครงสร้างหลายโรงงาน Multi-Factory Sites — CMMS-TOPPAN';
$pdo = getDb();

$sites = $pdo->query("SELECT * FROM plants_sites ORDER BY id ASC")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-slate-900 via-indigo-900 to-blue-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">IBM Maximo Multi-Site Hierarchy Benchmark</span>
            </div>
            <h1 class="text-2xl font-black">🏢 ศูนย์จัดการโครงสร้างหลายโรงงาน (Multi-Factory Plants & Sites Center)</h1>
            <p class="text-xs text-blue-100 mt-1">บริหารจัดการสถิติเครื่องจักร คลังอะไหล่ และแผนกซ่อมบำรุงแบบ Multi-Site ทั่วประเทศ</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🏭</div>
    </div>

    <!-- Multi-Site Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <?php foreach ($sites as $st): ?>
        <div class="card p-5 border-2 space-y-4 hover:shadow-md transition-all">
            <div class="flex items-center justify-between">
                <span class="cmms-banner info font-mono text-xs font-bold px-2.5 py-1 rounded-lg border"><?= htmlspecialchars($st['site_code']) ?></span>
                <span class="badge badge badge-success font-bold text-xs">🟢 ACTIVE (ออนไลน์)</span>
            </div>

            <div>
                <h3 class="font-black text-primary text-lg mb-1"><?= htmlspecialchars($st['site_name']) ?></h3>
                <p class="text-xs text-muted line-clamp-2"><?= htmlspecialchars($st['location_address']) ?></p>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                <div class="p-2 bg-subtle rounded-xl text-center">
                    <span class="text-muted font-bold text-[10px] block">เครื่องจักรสะสม</span>
                    <span class="font-black text-indigo-900 text-base">5 เครื่อง</span>
                </div>
                <div class="p-2 bg-subtle rounded-xl text-center">
                    <span class="text-muted font-bold text-[10px] block">สถานะการซ่อม</span>
                    <span class="font-black text-emerald-600 text-base">ปกติ</span>
                </div>
            </div>

            <button onclick="alert('สลับบริบทเข้าสู่ <?= addslashes($st['site_name']) ?> สำเร็จ!')" class="w-full btn btn-primary bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-xs font-bold py-2.5 rounded-xl">
                🔄 สลับเข้าจัดการโรงงานนี้
            </button>
        </div>
        <?php endforeach; ?>
    </div>

</div>

<?php renderFooter(); ?>
