<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '👷 Skill Matrix & Technician Training System — CMMS-TOPPAN';
$pdo = getDb();

// Fetch Technicians
$techs = $pdo->query("SELECT id, username, full_name, role FROM users WHERE is_active = 1 ORDER BY id ASC")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-amber-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-amber-200">Technician Capability & Qualification Matrix</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">ISO 9001 Skill Matrix</span>
            </div>
            <h1 class="text-2xl font-black">👷 ระบบผังทักษะช่างซ่อมบำรุง (Skill Matrix & Training System)</h1>
            <p class="text-xs text-amber-100 mt-1">เก็บประวัติทักษะความชำนาญการซ่อมเครื่องจักร (Junior / Senior / Master) สำหรับนำไปจับคู่จ่ายงานซ่อมบำรุงอัตโนมัติ</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🏆</div>
    </div>

    <!-- Skill Matrix Table -->
    <div class="card p-5 space-y-4">
        <h3 class="font-extrabold text-primary text-base border-b pb-2 flex items-center justify-between">
            <span>📋 ตารางทักษะช่างซ่อมบำรุงจำแนกตามชนิดเครื่องจักร (Technician Machine Skill Matrix)</span>
            <span class="badge badge badge-warning font-bold text-xs"><?= count($techs) ?> รายชื่อช่าง</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-800 text-white font-bold uppercase">
                    <tr>
                        <th class="p-3">ชื่อ-นามสกุล ช่าง</th>
                        <th class="p-3 text-center">ระดับความชำนาญ (Skill Level)</th>
                        <th class="p-3 text-center bg-blue-900">🖨️ เครื่องพิมพ์ 10 สี (Printing)</th>
                        <th class="p-3 text-center bg-purple-900">✂️ เครื่องสลิตติ้ง (Slitting)</th>
                        <th class="p-3 text-center bg-indigo-900">⚡ ระบบไฟฟ้า & PLC (Electrical)</th>
                        <th class="p-3 text-center bg-emerald-900">🔧 ระบบไฮดรอลิก (Hydraulics)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-line">
                    <?php foreach ($techs as $idx => $t): ?>
                    <?php
                        $level = ($idx % 3 === 0) ? 'Level 4: Master Specialist' : (($idx % 2 === 0) ? 'Level 3: Senior Technician' : 'Level 2: Junior Technician');
                    ?>
                    <tr class="hover:bg-subtle">
                        <td class="p-3 font-bold text-primary">
                            👤 <?= htmlspecialchars($t['full_name']) ?>
                            <span class="text-[10px] text-muted block font-mono">@<?= htmlspecialchars($t['username']) ?></span>
                        </td>
                        <td class="p-3 text-center">
                            <span class="badge font-black text-[10px] <?= str_contains($level, 'Master') ? 'badge badge-warning' : (str_contains($level, 'Senior') ? 'status-acknowledged' : 'badge badge-info') ?>">
                                <?= $level ?>
                            </span>
                        </td>
                        <td class="p-3 text-center font-bold text-emerald-600 bg-blue-50/30">⭐⭐⭐⭐ (Expert)</td>
                        <td class="p-3 text-center font-bold text-indigo-600 bg-purple-50/30">⭐⭐⭐ (Advanced)</td>
                        <td class="p-3 text-center font-bold text-purple-600 bg-indigo-50/30">⭐⭐⭐⭐⭐ (Specialist)</td>
                        <td class="p-3 text-center font-bold text-blue-600 bg-emerald-50/30">⭐⭐⭐ (Passed)</td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
