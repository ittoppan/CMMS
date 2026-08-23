<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'Machine 360 & Spare Parts Analytics Dashboard - CMMS-TPT';
$pdo = getDb();

$assetId = (int)($_GET['asset_id'] ?? 0);

// Fetch active machine assets for dropdown
$assets = $pdo->query("SELECT id, code, name, department_id, location, status, image_path FROM asset_registry ORDER BY code ASC")->fetchAll();

if ($assetId === 0 && !empty($assets)) {
    $assetId = (int)$assets[0]['id'];
}

// Fetch selected asset details
$stmt = $pdo->prepare("
    SELECT a.*, d.name AS dept_name, l.name AS loc_name
    FROM asset_registry a
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN locations l ON a.location_id = l.id
    WHERE a.id = ?
");
$stmt->execute([$assetId]);
$asset = $stmt->fetch();

// Fetch Repair Orders for this asset
$repairsStmt = $pdo->prepare("
    SELECT r.*, u.full_name AS tech_name
    FROM repair r
    LEFT JOIN users u ON r.assigned_to = u.id
    WHERE r.asset_id = ?
    ORDER BY r.created_at DESC
");
$repairsStmt->execute([$assetId]);
$repairs = $repairsStmt->fetchAll();

// Calculate total costs & downtime metrics
$totalRepairs = count($repairs);
$totalDowntime = 0;
$totalLaborCost = 0;
$totalPartsCost = 0;
$totalOutsourceCost = 0;

foreach ($repairs as $r) {
    $totalDowntime += (float)($r['repair_time_minutes'] ?? 0) / 60;
    $totalLaborCost += (float)($r['cost_labor'] ?? 0);
    $totalPartsCost += (float)($r['cost_parts'] ?? 0);
    $totalOutsourceCost += (float)($r['cost_outsource'] ?? 0);
}
$totalMachineCost = $totalLaborCost + $totalPartsCost + $totalOutsourceCost;

// Fetch Spare Parts Issued for this Machine
$partsStmt = $pdo->prepare("
    SELECT sp.code, sp.name, sp.unit, sp.unit_price, sp.sage_item_no,
           SUM(sii.qty_requested) AS total_qty_issued,
           SUM(sii.qty_requested * sp.unit_price) AS total_parts_cost
    FROM spare_issue_items sii
    JOIN spare_issue_requests sir ON sii.request_id = sir.id
    JOIN spare_parts sp ON sii.spare_part_id = sp.id
    JOIN repair r ON sir.work_order_id = r.id
    WHERE r.asset_id = ?
    GROUP BY sp.id
    ORDER BY total_parts_cost DESC
");
$partsStmt->execute([$assetId]);
$issuedParts = $partsStmt->fetchAll();

// If no issue items linked directly, fetch machine BOM default spares as backup data
if (empty($issuedParts)) {
    $bomStmt = $pdo->prepare("
        SELECT sp.code, sp.name, sp.unit, sp.unit_price, sp.sage_item_no,
               mb.default_qty AS total_qty_issued,
               (mb.default_qty * sp.unit_price) AS total_parts_cost
        FROM machine_bom mb
        JOIN spare_parts sp ON mb.spare_part_id = sp.id
        WHERE mb.asset_id = ?
    ");
    $bomStmt->execute([$assetId]);
    $issuedParts = $bomStmt->fetchAll();
}

renderHeader();
?>

<!-- Local Chart.js -->
<script src="<?= $relPrefix ?>js/chart.min.js"></script>

<div class="space-y-6">
    <!-- Top Header Banner -->
    <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
            <div class="flex items-center gap-2">
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">Asset 360 Analytics</span>
                <span class="text-xs text-slate-400">Machine Deep Diagnostic & Spare Cost</span>
            </div>
            <h1 class="text-2xl font-black text-slate-900 mt-1">🏭 Dashboard วิเคราะห์ข้อมูลเครื่องจักร & อะไหล่ที่ถูกเบิก (Machine 360)</h1>
            <p class="text-xs text-slate-500 mt-0.5">วิเคราะห์ประวัติการซ่อม ค่าใช้จ่ายอะไหล่สะสม เวลา Downtime และรายการเบิกอะไหล่เฉพาะเครื่อง</p>
        </div>
        <div class="flex items-center gap-3">
            <!-- Asset Picker Dropdown -->
            <form method="GET" class="flex items-center gap-2">
                <label class="text-xs font-bold text-slate-700">เลือกเครื่องจักร:</label>
                <select name="asset_id" onchange="this.form.submit()" class="input input-bordered w-full font-bold text-xs cursor-pointer">
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= $a['id'] === $assetId ? 'selected' : '' ?>>
                        <?= htmlspecialchars($a['code']) ?> - <?= htmlspecialchars($a['name']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </form>
        </div>
    </div>

    <?php if ($asset): ?>
    <!-- Asset Summary Card -->
    <div class="card cmms-card p-5">
        <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="flex items-center gap-4">
                <img src="<?= getImageUrl($asset['image_path'] ?? '', 'asset') ?>" class="w-16 h-16 rounded-xl object-cover border border-slate-300 shadow-sm">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100"><?= htmlspecialchars($asset['code']) ?></span>
                        <span class="badge badge badge-success text-xs font-bold"><?= htmlspecialchars($asset['status'] ?? 'active') ?></span>
                    </div>
                    <h2 class="text-xl font-extrabold text-slate-900 mt-1"><?= htmlspecialchars($asset['name']) ?></h2>
                    <p class="text-xs text-slate-500">แผนก: <strong><?= htmlspecialchars($asset['dept_name'] ?? '-') ?></strong> | สถานที่: <strong><?= htmlspecialchars($asset['loc_name'] ?? '-') ?></strong></p>
                </div>
            </div>
            <div class="flex gap-2">
                <a href="history.php?id=<?= $assetId ?>" class="btn btn-secondary text-xs">📋 บัตรประวัติเครื่อง (F-EN-01)</a>
                <a href="bom.php?asset_id=<?= $assetId ?>" class="btn btn-primary text-xs">⚙️ อะไหล่ประจำเครื่อง (BOM)</a>
            </div>
        </div>
    </div>

    <!-- 4 High Level Metric Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card cmms-card p-5">
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider">มูลค่าเบิกอะไหล่สะสม</div>
            <div class="text-2xl font-black text-purple-700 mt-1">฿<?= number_format($totalPartsCost, 2) ?></div>
            <div class="text-[11px] text-slate-400 mt-1">รวม <?= count($issuedParts) ?> รายการอะไหล่</div>
        </div>
        <div class="card cmms-card p-5">
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider">รวมค่าใช้จ่ายซ่อมบำรุง</div>
            <div class="text-2xl font-black text-indigo-600 mt-1">฿<?= number_format($totalMachineCost, 2) ?></div>
            <div class="text-[11px] text-slate-400 mt-1">ค่าแรง + อะไหล่ + Outsource</div>
        </div>
        <div class="card cmms-card p-5">
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider">จำนวนครั้งที่เครื่องจักรเสีย</div>
            <div class="text-2xl font-black text-rose-600 mt-1"><?= $totalRepairs ?> ครั้ง</div>
            <div class="text-[11px] text-slate-400 mt-1">ใบสั่งซ่อม F-EN-03 สะสม</div>
        </div>
        <div class="card cmms-card p-5">
            <div class="text-xs text-slate-500 font-bold uppercase tracking-wider">เวลา Downtime สะสม</div>
            <div class="text-2xl font-black text-amber-600 mt-1"><?= number_format($totalDowntime, 1) ?> ชม.</div>
            <div class="text-[11px] text-slate-400 mt-1">ชั่วโมงเครื่องหยุดทำงาน</div>
        </div>
    </div>

    <!-- Charts & Spare Parts Table Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Spare Parts Issued Table (2 cols wide) -->
        <div class="lg:col-span-2 card bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
            <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center">
                <span>📦 รายการอะไหล่ที่มีการเบิกสำหรับเครื่องจักรนี้ (Spare Parts Issued Breakdown)</span>
                <span class="text-xs text-purple-600 font-bold">Sage 300 Matched</span>
            </div>

            <div class="overflow-x-auto">
                <table class="data-table cmms-stack-table text-sm">
                    <thead class="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                        <tr>
                            <th class="px-4 py-3 text-left">รหัสอะไหล่</th>
                            <th class="px-4 py-3 text-left">ชื่อรายการอะไหล่</th>
                            <th class="px-4 py-3 text-center">รหัส Sage 300</th>
                            <th class="px-4 py-3 text-center">จำนวนที่เบิก</th>
                            <th class="px-4 py-3 text-right">ราคา/หน่วย</th>
                            <th class="px-4 py-3 text-right">รวมมูลค่า (บาท)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <?php foreach ($issuedParts as $p): ?>
                        <tr class="hover:bg-slate-50">
                            <td data-label="รหัสอะไหล่" class="px-4 py-3 font-mono font-extrabold text-indigo-600 text-xs"><?= htmlspecialchars($p['code']) ?></td>
                            <td data-label="ชื่อรายการอะไหล่" class="px-4 py-3 font-bold text-slate-900"><?= htmlspecialchars($p['name']) ?></td>
                            <td data-label="รหัส Sage 300" class="px-4 py-3 text-center"><span class="badge bg-purple-50 text-purple-700 text-xs font-mono font-bold"><?= htmlspecialchars($p['sage_item_no'] ?? '-') ?></span></td>
                            <td data-label="จำนวนที่เบิก" class="px-4 py-3 text-center font-bold text-slate-800"><?= number_format($p['total_qty_issued']) ?> <?= htmlspecialchars($p['unit'] ?? 'ชิ้น') ?></td>
                            <td data-label="ราคา/หน่วย" class="px-4 py-3 text-right font-mono text-xs">฿<?= number_format($p['unit_price'], 2) ?></td>
                            <td data-label="รวมมูลค่า (บาท)" class="px-4 py-3 text-right font-mono font-bold text-purple-700">฿<?= number_format($p['total_parts_cost'], 2) ?></td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($issuedParts)): ?>
                        <tr><td colspan="6" class="cmms-empty-state-cell">ยังไม่มีประวัติการเบิกอะไหล่สำหรับเครื่องจักรนี้</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Cost Breakdown Doughnut Chart -->
        <div class="card cmms-card p-5">
            <h3 class="font-bold text-slate-900 text-sm border-b pb-2">📊 สัดส่วนค่าใช้จ่ายซ่อมบำรุง (Cost Ratio)</h3>
            <div class="relative h-64 flex items-center justify-center">
                <canvas id="costRatioChart"></canvas>
            </div>
        </div>

    </div>

    <!-- Recent Repair Orders Table -->
    <div class="card bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center">
            <span>🔧 ประวัติใบสั่งซ่อมเครื่องจักร F-EN-03 (Repair History Logs)</span>
            <a href="../repair/create.php?asset_id=<?= $assetId ?>" class="text-xs text-indigo-600 font-bold hover:underline">+ แจ้งซ่อมเครื่องนี้ →</a>
        </div>

        <div class="overflow-x-auto">
            <table class="data-table cmms-stack-table text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                    <tr>
                        <th class="px-4 py-3 text-left">เลขที่ WO</th>
                        <th class="px-4 py-3 text-left">อาการเสีย / ปัญหา</th>
                        <th class="px-4 py-3 text-center">ระดับความด่วน</th>
                        <th class="px-4 py-3 text-center">สถานะ</th>
                        <th class="px-4 py-3 text-left">ช่างผู้ดูแล</th>
                        <th class="px-4 py-3 text-right">ค่าซ่อมรวม</th>
                        <th class="px-4 py-3 text-center">ดูงาน</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($repairs as $r): ?>
                    <tr class="hover:bg-slate-50">
                        <td data-label="เลขที่ WO" class="px-4 py-3 font-mono font-bold text-indigo-600 text-xs">#WO-<?= $r['id'] ?></td>
                        <td data-label="อาการเสีย / ปัญหา" class="px-4 py-3 font-bold text-slate-900"><?= htmlspecialchars($r['title']) ?></td>
                        <td data-label="ระดับความด่วน" class="px-4 py-3 text-center"><span class="badge badge badge-error text-xs font-bold"><?= htmlspecialchars($r['priority'] ?? 'Medium') ?></span></td>
                        <td data-label="สถานะ" class="px-4 py-3 text-center"><span class="badge badge badge-success text-xs font-bold"><?= htmlspecialchars($r['status']) ?></span></td>
                        <td data-label="ช่างผู้ดูแล" class="px-4 py-3 text-slate-700 font-medium"><?= htmlspecialchars($r['tech_name'] ?? 'ไม่ระบุ') ?></td>
                        <td data-label="ค่าซ่อมรวม" class="px-4 py-3 text-right font-mono font-bold text-indigo-700">฿<?= number_format(($r['cost_labor']+$r['cost_parts']+$r['cost_outsource']), 2) ?></td>
                        <td data-label="ดูงาน" class="px-4 py-3 text-center"><a href="../repair/view.php?id=<?= $r['id'] ?>" class="btn btn-secondary btn-sm text-xs text-indigo-600 font-bold">ดูงาน →</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php endif; ?>

</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('costRatioChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['ค่าอะไหล่ (Parts)', 'ค่าแรงช่าง (Labor)', 'ค่าซ่อมภายนอก (Outsource)'],
            datasets: [{
                data: [<?= $totalPartsCost ?>, <?= $totalLaborCost ?>, <?= $totalOutsourceCost ?>],
                backgroundColor: ['#7c3aed', '#4f46e5', '#f59e0b'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Sarabun', size: 11 } } }
            }
        }
    });
});
</script>

<?php renderFooter(); ?>
