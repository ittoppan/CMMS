<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'โครงสร้างพังผืดชิ้นส่วนเครื่องจักร BOM Tree (Interactive Asset BOM Tree) — CMMS-TOPPAN';
$pdo = getDb();

$assetId = (int)($_GET['id'] ?? 3);

// Fetch Asset
$asset = $pdo->query("SELECT * FROM asset_registry WHERE id = $assetId")->fetch();
if (!$asset) {
    $asset = $pdo->query("SELECT * FROM asset_registry LIMIT 1")->fetch();
}

// Fetch BOM Spares
$bomSpares = $pdo->query("
    SELECT mb.*, sp.code, sp.name, sp.unit, sp.stock_qty, sp.unit_price, sp.sage_item_no
    FROM machine_bom mb
    JOIN spare_parts sp ON mb.spare_part_id = sp.id
    WHERE mb.asset_id = {$asset['id']}
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">SAP PM & Infor EAM Asset Structure Benchmark</span>
            </div>
            <h1 class="text-2xl font-black">🔄 โครงสร้างพังผืดชิ้นส่วนเครื่องจักร BOM Tree Viewer</h1>
            <p class="text-xs text-blue-100 mt-1">แสดงพิกัดชิ้นส่วนเครื่องจักร <?= htmlspecialchars($asset['code']) ?> - <?= htmlspecialchars($asset['name']) ?> และรหัสเบิกอะไหล่ Sage 300</p>
        </div>
        <a href="/pages/asset_registry/history.php?id=<?= $asset['id'] ?>" class="card btn btn-primary text-indigo-900 hover:bg-blue-50 text-xs font-bold px-4 py-2 shadow-md">
            📑 บัตรประวัติ F-EN-01
        </a>
    </div>

    <!-- Tree View & Parts Panel Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Tree View Structure Column -->
        <div class="card p-5 space-y-3">
            <h3 class="font-extrabold text-primary text-base border-b pb-2">🌳 โครงสร้างต้นไม้ (Asset Hierarchy Tree)</h3>

            <div class="space-y-2 text-xs font-bold">
                <!-- Node Level 1: Machine -->
                <div class="p-3 bg-indigo-900 text-white rounded-xl flex items-center gap-2 shadow-sm">
                    <span>🏭</span>
                    <span><?= htmlspecialchars($asset['code']) ?> — <?= htmlspecialchars($asset['name']) ?></span>
                </div>

                <!-- Node Level 2: Sub-assemblies -->
                <div class="pl-4 space-y-2 border-l-2 border-indigo-200">
                    <div class="p-2.5 bg-indigo-50 text-indigo-900 rounded-lg flex items-center gap-2 border border-indigo-200">
                        <span>⚙️</span>
                        <span>1. ชุดขับเคลื่อนมอเตอร์หลัก (Main Drive Motor)</span>
                    </div>

                    <div class="p-2.5 bg-purple-50 text-purple-900 rounded-lg flex items-center gap-2 border border-purple-200">
                        <span>🛢️</span>
                        <span>2. ชุดระบบไฮดรอลิกและแรงดัน (Hydraulic Unit)</span>
                    </div>

                    <div class="p-2.5 bg-amber-50 text-amber-900 rounded-lg flex items-center gap-2 border border-amber-200">
                        <span>🔌</span>
                        <span>3. ตู้คอนโทรลและแผงวงจรไฟฟ้า (Control Panel)</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- BOM Spares Table Column -->
        <div class="lg:col-span-2 card p-5 space-y-3">
            <h3 class="font-extrabold text-primary text-base border-b pb-2 flex items-center justify-between">
                <span>📦 รายการชิ้นส่วนอะไหล่ BOM (Machine Bill of Materials)</span>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= count($bomSpares) ?> รายการ</span>
            </h3>

            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left border-collapse">
                    <thead class="bg-subtle font-bold text-secondary uppercase border-b">
                        <tr>
                            <th class="p-3">รหัสอะไหล่ CMMS</th>
                            <th class="p-3">รหัส Sage 300</th>
                            <th class="p-3">ชื่อรายการอะไหล่</th>
                            <th class="p-3 text-center">คงเหลือในคลัง</th>
                            <th class="p-3 text-right">ราคา/หน่วย</th>
                            <th class="p-3 text-center">การจัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-line">
                        <?php foreach ($bomSpares as $b): ?>
                        <tr class="hover:bg-subtle">
                            <td class="p-3 font-mono font-bold text-indigo-700"><?= htmlspecialchars($b['code']) ?></td>
                            <td class="p-3 font-mono text-purple-700 font-bold"><?= htmlspecialchars($b['sage_item_no'] ?? '-') ?></td>
                            <td class="p-3 font-bold text-primary"><?= htmlspecialchars($b['name']) ?></td>
                            <td class="p-3 text-center font-bold text-primary"><?= number_format($b['stock_qty']) ?> <?= htmlspecialchars($b['unit'] ?? 'ชิ้น') ?></td>
                            <td class="p-3 text-right font-black text-indigo-700">฿<?= number_format($b['unit_price'], 2) ?></td>
                            <td class="p-3 text-center">
                                <a href="/pages/repair/view.php?id=1" class="btn btn-primary bg-purple-700 border-purple-700 text-[11px] px-2.5 py-1 font-bold">
                                    📦 ขอเบิก
                                </a>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($bomSpares)): ?>
                        <tr><td colspan="6" class="cmms-empty-state-cell">ไม่มีรายการ BOM อะไหล่ผูกไว้กับเครื่องนี้</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

    </div>

</div>

<?php renderFooter(); ?>
