<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'การกำหนดอะไหล่ประจำเครื่อง (Machine BOM Manager) - CMMS-TPT';
$pdo = getDb();

$assetId = (int)($_GET['asset_id'] ?? 0);

// Fetch all active machines for dropdown
$assets = $pdo->query("SELECT id, code, name, location FROM asset_registry ORDER BY code ASC")->fetchAll();

if ($assetId === 0 && !empty($assets)) {
    $assetId = (int)$assets[0]['id'];
}

// Fetch selected asset details
$stmt = $pdo->prepare("SELECT * FROM asset_registry WHERE id = ?");
$stmt->execute([$assetId]);
$asset = $stmt->fetch();

$msg = '';
$error = '';

// Handle Add Item to Machine BOM
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_bom_item'])) {
    try {
        $spId = (int)$_POST['spare_part_id'];
        $qty = (float)$_POST['default_qty'];
        $remarks = trim($_POST['remarks'] ?? '');

        if ($assetId <= 0 || $spId <= 0 || $qty <= 0) {
            throw new Exception("กรุณาเลือกอะไหล่และระบุจำนวนมาตรฐานให้ถูกต้อง");
        }

        // Check if already in BOM
        $chk = $pdo->prepare("SELECT id FROM machine_bom WHERE asset_id = ? AND spare_part_id = ?");
        $chk->execute([$assetId, $spId]);
        if ($chk->fetch()) {
            // Update
            $pdo->prepare("UPDATE machine_bom SET default_qty = ?, remarks = ? WHERE asset_id = ? AND spare_part_id = ?")
                ->execute([$qty, $remarks, $assetId, $spId]);
            $msg = 'อัปเดตจำนวนและรายละเอียดอะไหล่ประจำเครื่องเรียบร้อย';
        } else {
            // Insert
            $pdo->prepare("INSERT INTO machine_bom (asset_id, spare_part_id, default_qty, remarks) VALUES (?, ?, ?, ?)")
                ->execute([$assetId, $spId, $qty, $remarks]);
            $msg = 'เพิ่มผูกรายการอะไหล่ประจำเครื่องเรียบร้อยแล้ว';
        }

    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Handle Delete Item from Machine BOM
if (isset($_GET['delete_bom_id'])) {
    $bomId = (int)$_GET['delete_bom_id'];
    $pdo->prepare("DELETE FROM machine_bom WHERE id = ? AND asset_id = ?")->execute([$bomId, $assetId]);
    header("Location: bom.php?asset_id=$assetId&msg=" . urlencode("ลบอะไหล่ออกจาก BOM เรียบร้อยแล้ว"));
    exit;
}

if (isset($_GET['msg'])) {
    $msg = $_GET['msg'];
}

// Fetch BOM Items for selected asset
$stmt = $pdo->prepare("
    SELECT mb.*, sp.code AS spare_code, sp.name AS spare_name, sp.unit, sp.stock_qty, sp.unit_price, sp.sage_item_no
    FROM machine_bom mb
    JOIN spare_parts sp ON mb.spare_part_id = sp.id
    WHERE mb.asset_id = ?
    ORDER BY mb.id DESC
");
$stmt->execute([$assetId]);
$bomItems = $stmt->fetchAll();

// Fetch All Spare Parts for Add Form
$allSpares = $pdo->query("SELECT id, code, name, unit, stock_qty, sage_item_no FROM spare_parts ORDER BY code ASC")->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Header Banner -->
    <div class="card flex items-center justify-between flex-wrap gap-4 p-5">
        <div>
            <div class="flex items-center gap-2">
                <a href="index.php" class="text-xs text-indigo-600 font-bold hover:underline">← ทะเบียนทรัพย์สิน</a>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">Machine BOM Configurator</span>
            </div>
            <h1 class="text-2xl font-black text-slate-900 mt-1">⚙️ ระบบกำหนดและจัดการอะไหล่ประจำเครื่อง (Machine BOM)</h1>
            <p class="text-xs text-slate-500 mt-0.5">กำหนดโครงสร้างอะไหล่มาตรฐาน (Bill of Materials) เพื่อให้ช่างเห็นและขอเบิกได้รวดเร็วขณะซ่อมงาน</p>
        </div>
        
        <!-- Machine Selector Dropdown -->
        <form method="GET" class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
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

    <?php if ($msg): ?>
    <div class="cmms-banner success p-4 rounded-xl border font-bold text-sm">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="cmms-banner error p-4 rounded-xl border font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <?php if ($asset): ?>
    <!-- Active Machine Info Summary -->
    <div class="card p-4 bg-gradient-to-r from-indigo-900 to-slate-800 text-white rounded-xl shadow-sm flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">
                <?= mb_substr($asset['code'], 0, 3) ?>
            </div>
            <div>
                <span class="font-mono text-xs font-bold text-indigo-200"><?= htmlspecialchars($asset['code']) ?></span>
                <h2 class="text-lg font-extrabold"><?= htmlspecialchars($asset['name']) ?></h2>
                <span class="text-xs text-slate-300">สถานที่: <?= htmlspecialchars($asset['location'] ?? '-') ?></span>
            </div>
        </div>
        <div class="flex gap-2">
            <a href="asset_analytics.php?asset_id=<?= $assetId ?>" class="btn bg-white/20 text-white hover:bg-white/30 text-xs font-bold">
                📊 ดูสถิติ 360 & ประวัติเบิก →
            </a>
        </div>
    </div>

    <!-- 2 Column Layout: Left = Add Form, Right = BOM List -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Add Spare to BOM Form -->
        <div class="card cmms-card p-5">
            <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                <span>➕ เพิ่มผูกอะไหล่ประจำเครื่องนี้</span>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs">BOM Setup</span>
            </h3>

            <form method="POST" class="space-y-4 text-xs">
                <input type="hidden" name="add_bom_item" value="1">

                <div>
                    <label class="font-bold text-slate-700 block mb-1">เลือกรายการอะไหล่ (Sage 300 / คลังเก่า)</label>
                    <select name="spare_part_id" required class="input input-bordered w-full font-mono">
                        <option value="">-- ค้นหาและเลือกรายการอะไหล่ --</option>
                        <?php foreach ($allSpares as $sp): ?>
                        <option value="<?= $sp['id'] ?>">
                            <?= htmlspecialchars($sp['code']) ?> - <?= htmlspecialchars($sp['name']) ?> (คงเหลือ: <?= number_format($sp['stock_qty']) ?> <?= htmlspecialchars($sp['unit'] ?? 'ชิ้น') ?>)
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label class="font-bold text-slate-700 block mb-1">จำนวนที่ใช้มาตรฐานต่อเครื่อง (Default Qty)</label>
                    <input type="number" step="0.01" min="0.01" name="default_qty" required value="1" class="input input-bordered w-full font-bold text-sm">
                </div>

                <div>
                    <label class="font-bold text-slate-700 block mb-1">หมายเหตุ / รอบเปลี่ยนตามแผน (Remarks)</label>
                    <input type="text" name="remarks" placeholder="เช่น อะไหล่เปลี่ยนประจำทุก 6 เดือน (Form F-EN-14)" class="input input-bordered w-full">
                </div>

                <button type="submit" class="btn btn-primary bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-xs w-full py-3 font-extrabold shadow-md">
                    + เพิ่มผูกรายการอะไหล่เข้า BOM เครื่องนี้
                </button>
            </form>
        </div>

        <!-- BOM Items Table -->
        <div class="lg:col-span-2 card overflow-hidden space-y-3">
            <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center">
                <span>📋 ตารางโครงสร้างอะไหล่มาตรฐานประจำเครื่อง (Bill of Materials List)</span>
                <span class="text-xs text-indigo-600 font-bold">รวม <?= count($bomItems) ?> รายการ</span>
            </div>

            <div class="overflow-x-auto">
                <table class="data-table cmms-stack-table text-sm">
                    <thead class="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                        <tr>
                            <th class="px-4 py-3 text-left">รหัสอะไหล่</th>
                            <th class="px-4 py-3 text-left">ชื่อรายการอะไหล่</th>
                            <th class="px-4 py-3 text-center">รหัส Sage 300</th>
                            <th class="px-4 py-3 text-center">จำนวนมาตรฐาน</th>
                            <th class="px-4 py-3 text-center">สต็อกปัจจุบัน</th>
                            <th class="px-4 py-3 text-center">ลบออก</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <?php foreach ($bomItems as $b): 
                            $hasSage = !empty($b['sage_item_no']);
                        ?>
                        <tr class="hover:bg-slate-50">
                            <td data-label="รหัสอะไหล่" class="px-4 py-3 font-mono font-extrabold text-indigo-600 text-xs">
                                <?= htmlspecialchars($b['spare_code']) ?>
                            </td>
                            <td data-label="ชื่อรายการอะไหล่" class="px-4 py-3 font-bold text-slate-900">
                                <?= htmlspecialchars($b['spare_name']) ?>
                                <?php if (!empty($b['remarks'])): ?>
                                <span class="text-xs text-slate-400 block font-normal"><?= htmlspecialchars($b['remarks']) ?></span>
                                <?php endif; ?>
                            </td>
                            <td data-label="รหัส Sage 300" class="px-4 py-3 text-center">
                                <?php if ($hasSage): ?>
                                <span class="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200"><?= htmlspecialchars($b['sage_item_no']) ?></span>
                                <?php else: ?>
                                <span class="text-slate-400 text-xs italic">คลังเก่า</span>
                                <?php endif; ?>
                            </td>
                            <td data-label="จำนวนมาตรฐาน" class="px-4 py-3 text-center font-bold text-slate-800">
                                <?= number_format($b['default_qty'], 2) ?> <?= htmlspecialchars($b['unit'] ?? 'ชิ้น') ?>
                            </td>
                            <td data-label="สต็อกปัจจุบัน" class="px-4 py-3 text-center font-bold text-emerald-600">
                                <?= number_format($b['stock_qty'], 2) ?> <?= htmlspecialchars($b['unit'] ?? 'ชิ้น') ?>
                            </td>
                            <td data-label="ลบออก" class="px-4 py-3 text-center text-xs">
                                <a href="bom.php?asset_id=<?= $assetId ?>&delete_bom_id=<?= $b['id'] ?>" 
                                   onclick="return confirm('ยืนยันลบอะไหล่ &quot;<?= htmlspecialchars($b['spare_name'], ENT_QUOTES) ?>&quot; ออกจาก BOM ใช่หรือไม่?')"
                                   class="text-rose-600 font-bold hover:underline">
                                    ลบออก
                                </a>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($bomItems)): ?>
                        <tr><td colspan="6" class="cmms-empty-state-cell">ยังไม่มีการเพิ่มรายการอะไหล่ประจำเครื่องนี้ (กรุณาใช้ฟอร์มด้านซ้ายเพื่อเพิ่มอะไหล่)</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

    </div>
    <?php endif; ?>
</div>

<?php renderFooter(); ?>
