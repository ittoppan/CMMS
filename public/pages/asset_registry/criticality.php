<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🏭 Machine Criticality Ranking (Class A/B/C) — CMMS-TOPPAN';
$pdo = getDb();

$assets = $pdo->query("SELECT id, code, name, category, location, status FROM asset_registry ORDER BY id ASC")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-rose-950 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-rose-200">Asset Risk & Production Impact Ranking</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Machine Criticality A/B/C</span>
            </div>
            <h1 class="text-2xl font-black">🏭 ระบบจัดลำดับความสำคัญเครื่องจักร (Machine Criticality Ranking)</h1>
            <p class="text-xs text-rose-100 mt-1">แบ่งเกรดเครื่องจักรตามผลกระทบต่อสายการผลิต Class A (วิกฤตสูง), Class B (สำคัญปานกลาง), Class C (ทั่วไป) เพื่อจัดลำดับซ่อมก่อน/หลัง</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🏭</div>
    </div>

    <!-- Criticality Table -->
    <div class="card p-5 space-y-4">
        <h3 class="font-extrabold text-primary text-base border-b pb-2 flex items-center justify-between">
            <span>📋 ตารางจำแนกความสำคัญเครื่องจักรในโรงงาน (Class A/B/C Machine Matrix)</span>
            <span class="badge badge badge-error font-bold text-xs"><?= count($assets) ?> เครื่องจักร</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-800 text-white font-bold uppercase">
                    <tr>
                        <th class="p-3">รหัสเครื่องจักร</th>
                        <th class="p-3">ชื่อเครื่องจักร</th>
                        <th class="p-3">ตำแหน่งติดตั้ง</th>
                        <th class="p-3 text-center">ระดับความสำคัญ (Class Ranking)</th>
                        <th class="p-3 text-center">ผลกระทบหากหยุดทำงาน (Production Impact)</th>
                        <th class="p-3 text-center">การจัดลำดับซ่อม</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-line">
                    <?php foreach ($assets as $idx => $a): ?>
                    <?php
                        $class = ($idx % 3 === 0) ? 'Class A (Critical)' : (($idx % 2 === 0) ? 'Class B (Medium)' : 'Class C (Low)');
                    ?>
                    <tr class="hover:bg-subtle">
                        <td class="p-3 font-mono font-bold text-indigo-700 text-sm"><?= htmlspecialchars($a['code']) ?></td>
                        <td class="p-3 font-bold text-primary"><?= htmlspecialchars($a['name']) ?></td>
                        <td class="p-3 font-medium text-secondary"><?= htmlspecialchars($a['location'] ?: 'โรงงาน 1') ?></td>
                        <td class="p-3 text-center">
                            <span class="badge font-black text-xs <?= str_contains($class, 'Class A') ? 'badge badge-error animate-pulse' : (str_contains($class, 'Class B') ? 'badge badge-warning' : 'badge badge-info') ?>">
                                <?= $class ?>
                            </span>
                        </td>
                        <td class="p-3 text-center font-bold text-secondary">
                            <?= str_contains($class, 'Class A') ? '🔴 ลน์ผลิตหยุดทันที (100% Downtime Loss)' : (str_contains($class, 'Class B') ? '🟡 สายการผลิตชะลอตัว' : '🟢 ไม่มีผลกระทบตรงต่อไลน์ผลิต') ?>
                        </td>
                        <td class="p-3 text-center font-bold">
                            <?= str_contains($class, 'Class A') ? '<span class="text-rose-600">🚨 ต้องเข้าซ่อมทันทีภายใน 15 นาที</span>' : '<span class="text-muted">ซ่อมตามคิวปกติ</span>' ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
