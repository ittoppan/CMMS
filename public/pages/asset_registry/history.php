<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'บัตรประวัติเครื่องจักร F-EN-01 - CMMS-TPT';
$pdo = getDb();

$assetId = (int)($_GET['id'] ?? 0);
if (!$assetId) {
    header('Location: index.php');
    exit;
}

// Fetch Asset Info
$stmt = $pdo->prepare("
    SELECT a.*, d.name AS dept_name, l.name AS location_name,
           u.full_name AS custodian_name
    FROM asset_registry a
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN locations l ON a.location_id = l.id
    LEFT JOIN users u ON a.responsible_user_id = u.id
    WHERE a.id = ?
");
$stmt->execute([$assetId]);
$asset = $stmt->fetch();

if (!$asset) {
    echo "Asset not found.";
    exit;
}

// Repair history
$repairs = $pdo->prepare("
    SELECT r.*, u.full_name AS assigned_name,
           fc.name AS failure_name, rc.name AS repair_name
    FROM repair r
    LEFT JOIN users u ON r.assigned_to = u.id
    LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id
    LEFT JOIN repair_codes rc ON r.repair_code_id = rc.id
    WHERE r.asset_id = ?
    ORDER BY r.created_at DESC
");
$repairs->execute([$assetId]);
$repairList = $repairs->fetchAll();

// PM history
$pms = $pdo->prepare("
    SELECT p.*, u.full_name AS assigned_name
    FROM pm_am p
    LEFT JOIN users u ON p.assigned_to = u.id
    WHERE p.asset_id = ?
    ORDER BY p.due_date DESC
");
$pms->execute([$assetId]);
$pmList = $pms->fetchAll();

// Calibration history
$cals = $pdo->prepare("
    SELECT c.*, s.name AS supplier_name
    FROM calibration c
    LEFT JOIN suppliers s ON c.supplier_id = s.id
    WHERE c.asset_id = ?
    ORDER BY c.calibration_date DESC
");
$cals->execute([$assetId]);
$calList = $cals->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <div class="flex items-center gap-2">
                <a href="index.php" class="text-sm text-brand-600 hover:underline">&larr; กลับหน้ารายชื่อทรัพย์สิน</a>
                <span class="badge badge-info">F-EN-01 REV.03</span>
            </div>
            <h1 class="mt-1 text-2xl font-bold text-primary">บัตรประวัติเครื่องจักร (MACHINE HISTORY CARD)</h1>
        </div>
        <button onclick="window.print()" class="btn btn-primary">🖨️ พิมพ์บัตรประวัติ (F-EN-01)</button>
    </div>

    <!-- Asset Details Card -->
    <div class="card p-6 space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-4 flex-wrap gap-4">
            <div class="flex items-center gap-4">
                <img src="<?= getImageUrl($asset['image_path'] ?? '', 'asset') ?>" class="w-16 h-16 rounded-xl object-cover border border-line shadow-sm shrink-0">
                <div>
                    <span class="text-xs text-indigo-600 font-mono font-extrabold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100"><?= htmlspecialchars($asset['code']) ?></span>
                    <h2 class="text-xl font-bold text-primary mt-0.5"><?= htmlspecialchars($asset['name']) ?></h2>
                    <span class="text-xs text-muted block">แผนก/สถานที่: <?= htmlspecialchars($asset['dept_name'] ?? '-') ?> (<?= htmlspecialchars($asset['location_name'] ?? '-') ?>)</span>
                </div>
            </div>
            <div class="text-right">
                <span class="badge badge badge-success text-xs font-bold"><?= htmlspecialchars($asset['status'] ?? 'Active') ?></span>
                <span class="text-xs text-muted block mt-1">ผู้รับผิดชอบ: <?= htmlspecialchars($asset['custodian_name'] ?? '-') ?></span>
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div><strong>ยี่ห้อ (Brand):</strong> <?= htmlspecialchars($asset['brand'] ?? '-') ?></div>
            <div><strong>รุ่น (Model):</strong> <?= htmlspecialchars($asset['model'] ?? '-') ?></div>
            <div><strong>Serial No.:</strong> <?= htmlspecialchars($asset['serial_number'] ?? '-') ?></div>
            <div><strong>วันที่รับเข้า:</strong> <?= htmlspecialchars($asset['purchase_date'] ?? '-') ?></div>
        </div>
    </div>

    <!-- 1. Repair History -->
    <div class="card p-4">
        <h2 class="text-lg font-bold text-primary mb-3">🔧 1. ประวัติงานซ่อม (Repair Orders Log)</h2>
        <?php if (empty($repairList)): ?>
        <p class="text-sm text-muted text-center py-4">ไม่มีประวัติการซ่อม</p>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="data-table w-full text-xs">
                <thead>
                    <tr class="bg-muted">
                        <th class="p-2">วันที่</th>
                        <th class="p-2">ชื่องาน/อาการเสีย</th>
                        <th class="p-2">ช่างผู้ซ่อม</th>
                        <th class="p-2">Failure Code</th>
                        <th class="p-2">สาเหตุ & วิธีแก้</th>
                        <th class="p-2">สถานะ</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($repairList as $r): ?>
                    <tr class="border-b">
                        <td class="p-2 font-mono"><?= date('d/m/Y', strtotime($r['created_at'])) ?></td>
                        <td class="p-2 font-bold"><a href="../repair/view.php?id=<?= $r['id'] ?>" class="text-brand-600 hover:underline"><?= htmlspecialchars($r['title']) ?></a></td>
                        <td class="p-2"><?= htmlspecialchars($r['assigned_name'] ?? '-') ?></td>
                        <td class="p-2"><?= htmlspecialchars($r['failure_name'] ?? '-') ?></td>
                        <td class="p-2"><?= htmlspecialchars($r['root_cause'] ?? '-') ?> / <?= htmlspecialchars($r['solution'] ?? '-') ?></td>
                        <td class="p-2"><span class="badge badge-info"><?= strtoupper($r['status']) ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>

    <!-- 2. PM History -->
    <div class="card p-4">
        <h2 class="text-lg font-bold text-primary mb-3">📋 2. ประวัติการทำ PM/AM (Preventive Maintenance Log)</h2>
        <?php if (empty($pmList)): ?>
        <p class="text-sm text-muted text-center py-4">ไม่มีประวัติ PM/AM</p>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="data-table w-full text-xs">
                <thead>
                    <tr class="bg-muted">
                        <th class="p-2">กำหนดวันที่</th>
                        <th class="p-2">ชื่อแผน PM</th>
                        <th class="p-2">ผู้รับผิดชอบ</th>
                        <th class="p-2">สถานะ</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($pmList as $p): ?>
                    <tr class="border-b">
                        <td class="p-2 font-mono"><?= date('d/m/Y', strtotime($p['due_date'])) ?></td>
                        <td class="p-2 font-bold"><?= htmlspecialchars($p['title']) ?></td>
                        <td class="p-2"><?= htmlspecialchars($p['assigned_name'] ?? '-') ?></td>
                        <td class="p-2"><span class="badge badge-info"><?= strtoupper($p['status']) ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</div>

<?php renderFooter(); ?>
