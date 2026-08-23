<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'Reservation Center (ศูนย์ควบคุมการจองอะไหล่) - CMMS-TPT';
$pdo = getDb();

// Fetch spare parts with reservation metrics
$stmt = $pdo->query("
    SELECT sp.*, sp.unit AS unit_name,
           (sp.stock_qty - sp.reserved_qty) AS available_qty
    FROM spare_parts sp
    ORDER BY sp.reserved_qty DESC, sp.name ASC
");
$parts = $stmt->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <div class="flex items-center gap-2">
                <a href="index.php" class="text-sm text-brand-600 hover:underline">&larr; คลังอะไหล่</a>
                <span class="badge badge-info badge badge-warning">Reservation Tracking</span>
            </div>
            <h1 class="mt-1 text-2xl font-bold text-gray-900">📑 Reservation Center (ศูนย์ควบคุมและติดตามการจองอะไหล่)</h1>
        </div>
        <div class="flex gap-2">
            <a href="issue_center.php" class="btn btn-secondary">📦 Spare Issue Center (เบิก-จ่าย)</a>
            <a href="index.php" class="btn btn-primary">⚙️ รายการสต็อกทั้งหมด</a>
        </div>
    </div>

    <!-- Overview Metrics Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center">
            <span class="text-xs font-bold text-gray-500 uppercase block">จำนวนรายการที่มีการจอง</span>
            <span class="text-3xl font-extrabold text-amber-600 mt-1 block">
                <?= count(array_filter($parts, fn($p) => $p['reserved_qty'] > 0)) ?>
            </span>
        </div>
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center">
            <span class="text-xs font-bold text-gray-500 uppercase block">จำนวนชิ้นรวมที่ถูกจอง (Reserved)</span>
            <span class="text-3xl font-extrabold text-indigo-600 mt-1 block">
                <?= number_format(array_sum(array_column($parts, 'reserved_qty')), 0) ?>
            </span>
        </div>
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center">
            <span class="text-xs font-bold text-gray-500 uppercase block">อะไหล่พร้อมใช้งาน (Available Stock)</span>
            <span class="text-3xl font-extrabold text-emerald-600 mt-1 block">
                <?= number_format(array_sum(array_column($parts, 'available_qty')), 0) ?>
            </span>
        </div>
    </div>

    <!-- Reservation Table -->
    <div class="card overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-4 border-b border-gray-200 font-bold text-gray-900">
            📊 รายละเอียดสต็อกและการจองอะไหล่ (Stock & Reservation Balance)
        </div>
        
        <div class="overflow-x-auto">
            <table class="data-table cmms-stack-table text-sm">
                <thead class="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                    <tr>
                        <th class="px-4 py-3 text-left">รูปภาพอะไหล่</th>
                        <th class="px-4 py-3 text-left">รหัส / ชื่ออะไหล่</th>
                        <th class="px-4 py-3 text-center">คลังคงเหลือ (Stock)</th>
                        <th class="px-4 py-3 text-center">ถูกจองแล้ว (Reserved)</th>
                        <th class="px-4 py-3 text-center">พร้อมใช้งาน (Available)</th>
                        <th class="px-4 py-3 text-center">สถานะการจอง</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    <?php foreach ($parts as $p): ?>
                    <tr class="hover:bg-gray-50">
                        <td data-label="รูปภาพอะไหล่" class="px-4 py-3">
                            <img src="<?= getImageUrl($p['image_url'] ?? null, 'spare') ?>" class="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm bg-slate-50" title="<?= htmlspecialchars($p['name']) ?>">
                        </td>
                        <td data-label="รหัส / ชื่ออะไหล่" class="px-4 py-3">
                            <span class="font-mono font-bold text-indigo-600 block text-xs"><?= htmlspecialchars($p['code']) ?></span>
                            <span class="font-bold text-gray-900"><?= htmlspecialchars($p['name']) ?></span>
                        </td>
                        <td data-label="คลังคงเหลือ (Stock)" class="px-4 py-3 text-center font-bold text-gray-800">
                            <?= number_format($p['stock_qty'], 2) ?> <?= htmlspecialchars($p['unit_name'] ?? 'PCS') ?>
                        </td>
                        <td data-label="ถูกจองแล้ว (Reserved)" class="px-4 py-3 text-center font-bold text-amber-600">
                            <?= number_format($p['reserved_qty'], 2) ?> <?= htmlspecialchars($p['unit_name'] ?? 'PCS') ?>
                        </td>
                        <td data-label="พร้อมใช้งาน (Available)" class="px-4 py-3 text-center font-bold text-emerald-600">
                            <?= number_format($p['available_qty'], 2) ?> <?= htmlspecialchars($p['unit_name'] ?? 'PCS') ?>
                        </td>
                        <td data-label="สถานะการจอง" class="px-4 py-3 text-center">
                            <?php if ($p['reserved_qty'] > 0): ?>
                            <span class="badge badge badge-warning font-bold px-2.5 py-1">⚠️ มีรายการจอง</span>
                            <?php else: ?>
                            <span class="badge bg-gray-100 text-gray-600 font-bold px-2.5 py-1">⚪ ไม่มีรายการจอง</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
