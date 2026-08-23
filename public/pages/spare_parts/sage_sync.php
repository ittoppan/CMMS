<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
$pageTitle = 'ซิงค์คลังอะไหล่จาก Sage 300 ERP - CMMS-TPT';
$pdo = getDb();

$msg = '';
$error = '';
$syncedItems = [];

$dsn = getenv('SAGE300_ODBC_DSN') ?: 'TFPT2C';

// Fetch current allowed categories setting
$currentCatsStr = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'sage300_allowed_categories'")->fetchColumn();
if (!$currentCatsStr) {
    $currentCatsStr = '15400, 15401, 15402, 15403, 15404, SPARE, MECH, ELEC, TOOL, HARDWARE, PNEUMATIC, HYDRAULIC';
}
$currentCatsArray = array_values(array_filter(array_map('trim', explode(',', $currentCatsStr))));

// Handle 1-Click Sync Execution
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['exec_sync'])) {
    try {
        // Fetch Master Items from Sage 300 specifically filtered by allowed categories
        $sageItems = Sage300Service::getItemMaster('', $currentCatsArray);
        $countNew = 0;
        $countUpdated = 0;

        foreach ($sageItems as $item) {
            $itemNo = trim($item['item_no']);
            if (empty($itemNo)) continue;

            $category = trim($item['category'] ?? '');
            // Enforce Strict Category Filtering
            if (!empty($currentCatsArray) && !in_array($category, $currentCatsArray)) {
                continue; // Skip items from non-allowed categories!
            }

            $description = trim($item['description'] ?? '');
            if (empty($description)) $description = $itemNo;
            if (mb_detect_encoding($description, 'UTF-8', true) === false) {
                $description = @iconv("CP874", "UTF-8//IGNORE", $description) ?: $description;
            }

            $unit = trim($item['unit'] ?? 'PCS') ?: 'PCS';
            if (mb_detect_encoding($unit, 'UTF-8', true) === false) {
                $unit = @iconv("CP874", "UTF-8//IGNORE", $unit) ?: $unit;
            }

            $location = trim($item['location'] ?? 'WH-MAIN') ?: 'WH-MAIN';
            if (mb_detect_encoding($location, 'UTF-8', true) === false) {
                $location = @iconv("CP874", "UTF-8//IGNORE", $location) ?: $location;
            }
            $unitPrice = (float)($item['avg_cost'] ?? 0);
            $stockQty = (float)($item['qty_on_hand'] ?? 0);

            $check = $pdo->prepare("SELECT id FROM spare_parts WHERE code = ? OR sage_item_no = ?");
            $check->execute([$itemNo, $itemNo]);
            $existing = $check->fetch();

            if ($existing) {
                // Update existing item in CMMS
                $stmt = $pdo->prepare("
                    UPDATE spare_parts 
                    SET name = ?, category = ?, unit = ?, location = ?, unit_price = ?, stock_qty = ?, sage_item_no = ?, updated_at = NOW()
                    WHERE id = ?
                ");
                $stmt->execute([
                    $description,
                    $category,
                    $unit,
                    $location,
                    $unitPrice,
                    $stockQty,
                    $itemNo,
                    $existing['id']
                ]);
                $countUpdated++;
            } else {
                // Insert new item into CMMS
                $stmt = $pdo->prepare("
                    INSERT INTO spare_parts (code, name, category, unit, location, unit_price, stock_qty, sage_item_no, min_stock, max_stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, 100)
                ");
                $stmt->execute([
                    $itemNo,
                    $description,
                    $category,
                    $unit,
                    $location,
                    $unitPrice,
                    $stockQty,
                    $itemNo
                ]);
                $countNew++;
            }
        }
        
        // Optional Purge of Unselected Category items
        if (!empty($_POST['purge_unselected']) && !empty($currentCatsArray)) {
            $inClause = "'" . implode("','", array_map('addslashes', $currentCatsArray)) . "'";
            $deletedCount = $pdo->exec("
                DELETE FROM spare_parts 
                WHERE category NOT IN ($inClause) 
                AND id NOT IN (SELECT DISTINCT spare_part_id FROM spare_issue_items)
            ");
            $msg .= " (และล้างอะไหล่เก่าใน CMMS ที่ไม่อยู่ในหมวดหมู่ที่เลือกออกจำนวน {$deletedCount} รายการเรียบร้อยแล้ว)";
        }

        $msg = "ดึงและซิงค์คลังอะไหล่จาก Sage 300 (DSN: $dsn) เรียบร้อยแล้ว! (เพิ่มใหม่ {$countNew} รายการ | อัปเดต {$countUpdated} รายการ)" . (isset($deletedCount) && $deletedCount > 0 ? " | ลบอะไหล่นอกหมวดหมู่ {$deletedCount} รายการ" : "");
        $syncedItems = $sageItems;

    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาดในการซิงค์: ' . $e->getMessage();
    }
}

// Handle Direct Purge Action Button
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['purge_now']) && !empty($currentCatsArray)) {
    try {
        $inClause = "'" . implode("','", array_map('addslashes', $currentCatsArray)) . "'";
        $deletedCount = $pdo->exec("
            DELETE FROM spare_parts 
            WHERE category NOT IN ($inClause) 
            AND id NOT IN (SELECT DISTINCT spare_part_id FROM spare_issue_items)
        ");
        $msg = "🧹 ล้างอะไหล่ในระบบ CMMS ที่ไม่อยู่ในหมวดหมู่ที่เลือก ({$currentCatsStr}) ออกเรียบร้อยแล้ว จำนวน {$deletedCount} รายการ!";
    } catch (Exception $e) {
        $error = "เกิดข้อผิดพลาดในการล้างข้อมูล: " . $e->getMessage();
    }
}

// Handle Category Filter Settings Save
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_categories'])) {
    try {
        $cats = $_POST['categories'] ?? [];
        $customCats = trim($_POST['custom_categories'] ?? '');
        if (!empty($customCats)) {
            $extra = array_map('trim', explode(',', $customCats));
            $cats = array_merge($cats, $extra);
        }
        $catsStr = implode(', ', array_unique(array_filter($cats)));

        $pdo->prepare("
            INSERT INTO settings (setting_key, setting_value, setting_group, description)
            VALUES ('sage300_allowed_categories', ?, 'ERP_Integrations', 'Sage 300 Allowed Categories')
            ON DUPLICATE KEY UPDATE setting_value = ?
        ")->execute([$catsStr, $catsStr]);

        $msg = "บันทึกการตั้งค่าหมวดหมู่และประเภทอะไหล่ Sage 300 เรียบร้อยแล้ว! (หมวดหมู่ที่อนุญาต: $catsStr)";
        $currentCatsStr = $catsStr;
        $currentCatsArray = array_values(array_filter(array_map('trim', explode(',', $currentCatsStr))));

        // Purge if requested during save
        if (!empty($_POST['purge_on_save']) && !empty($currentCatsArray)) {
            $inClause = "'" . implode("','", array_map('addslashes', $currentCatsArray)) . "'";
            $deletedCount = $pdo->exec("
                DELETE FROM spare_parts 
                WHERE category NOT IN ($inClause) 
                AND id NOT IN (SELECT DISTINCT spare_part_id FROM spare_issue_items)
            ");
            $msg .= " (และล้างอะไหล่นอกหมวดหมู่เก่าออก {$deletedCount} รายการ)";
        }

    } catch (Exception $e) {
        $error = "เกิดข้อผิดพลาดในการบันทึกหมวดหมู่: " . $e->getMessage();
    }
}

$currentCatsStr = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'sage300_allowed_categories'")->fetchColumn();
if (!$currentCatsStr) {
    $currentCatsStr = '15400, 15401, 15402, 15403, 15404, SPARE, MECH, ELEC, TOOL, HARDWARE, PNEUMATIC, HYDRAULIC';
}
$currentCatsArray = array_map('trim', explode(',', $currentCatsStr));

// Fetch all spare parts currently in CMMS
$spares = $pdo->query("SELECT * FROM spare_parts ORDER BY id DESC")->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Sage 300 Inventory Control Sync</span>
                <span class="text-xs text-purple-200">Categories: 15400 - 15404 | DSN: <?= htmlspecialchars($dsn) ?></span>
            </div>
            <h1 class="text-2xl font-black">🔄 ระบบดึงและซิงค์คลังอะไหล่จาก Sage 300 ERP (Category 15400-15404)</h1>
            <p class="text-xs text-purple-100 mt-1">กรองเฉพาะหมวดหมู่ <strong>15400 ถึง 15404</strong> ใน Sage 300 ดึงข้อมูลรายการอะไหล่, ยอดคงเหลือ, ราคาเฉลี่ย และหน่วยนับเข้าสู่ CMMS</p>
        </div>
        <div class="flex gap-2">
            <a href="index.php" class="btn bg-white text-purple-800 font-bold text-xs shadow hover:bg-purple-50">
                ⚙️ ดูคลังอะไหล่ทั้งหมด →
            </a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 font-bold text-sm">
        🎉 <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- Category Filter Settings Card -->
    <div class="card cmms-card p-5">
        <div class="flex items-center justify-between border-b pb-3">
            <div>
                <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>🏷️ กำหนดรหัสหมวดหมู่อะไหล่ Sage 300 (Category Codes) ที่ต้องการซิงค์</span>
                    <span class="badge bg-indigo-100 text-indigo-800 text-[10px] font-bold">Sage 300 Category Codes</span>
                </h3>
                <p class="text-xs text-slate-500 mt-0.5">ระบบจะดึงเฉพาะรายการสินค้าที่มี **รหัสหมวดหมู่ (Category Code)** ตรงกับที่ระบุด้านล่าง และตัดรายการที่ไม่เกี่ยวข้องออกโดยอัตโนมัติ</p>
            </div>
        </div>

        <form method="POST" class="space-y-4 text-xs">
            <input type="hidden" name="save_categories" value="1">

            <!-- Active Categories Badges -->
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span class="text-xs font-bold text-slate-700 block">รหัสหมวดหมู่ Sage 300 ที่เปิดใช้งานซิงค์อยู่ในปัจจุบัน:</span>
                <div class="flex flex-wrap gap-2">
                    <?php foreach ($currentCatsArray as $cCode): ?>
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-mono font-bold shadow-sm">
                        <span>รหัส: <?= htmlspecialchars($cCode) ?></span>
                    </span>
                    <?php endforeach; ?>
                </div>
            </div>

            <!-- Quick Selection Checkboxes for Sage 300 Codes -->
            <div>
                <label class="font-bold text-slate-800 block mb-2">เลือกปุ่มรหัสหมวดหมู่ใน Sage 300 (Category Code Quick Select):</label>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                    <?php
                    $sageCodes = ['15400', '15401', '15402', '15403', '15404', '15405', '15406', '15407', '15408', '15409', '15410', '15420'];
                    foreach ($sageCodes as $code):
                        $checked = in_array($code, $currentCatsArray) ? 'checked' : '';
                    ?>
                    <label class="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:bg-indigo-50/50 cursor-pointer transition-all font-mono font-bold">
                        <input type="checkbox" name="categories[]" value="<?= $code ?>" <?= $checked ?> class="rounded text-indigo-600 focus:ring-indigo-500">
                        <span class="text-xs font-bold text-slate-900"><?= $code ?></span>
                    </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <!-- Manual Custom Input Field for any Sage 300 Code -->
            <div class="pt-2">
                <label class="font-bold text-slate-800 block mb-1">พิมพ์ระบุรหัสหมวดหมู่ใน Sage 300 แบบกำหนดเอง (คั่นด้วยเครื่องหมายจุลภาค , ):</label>
                <input type="text" name="custom_categories" value="<?= htmlspecialchars($currentCatsStr) ?>" placeholder="เช่น 15401, 15402, 15403" class="input input-bordered w-full text-xs font-mono font-bold text-indigo-600">
                <span class="text-[11px] text-slate-400 block mt-1">ตัวอย่าง: หากต้องการซิงค์เฉพาะหมวดหมู่ <strong>15401</strong> ให้พิมพ์ระบุเพียง <strong>15401</strong></span>
            </div>

            <div class="bg-rose-50 border border-rose-200 p-3 rounded-lg flex items-center justify-between flex-wrap gap-2">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="purge_on_save" value="1" class="rounded text-rose-600 focus:ring-rose-500">
                    <span class="text-xs font-bold text-rose-800">🧹 ลบ/ล้าง รายการอะไหล่เก่าในระบบ CMMS ที่ไม่อยู่ในรหัสหมวดหมู่ที่ระบุออกทันที</span>
                </label>
            </div>

            <div class="flex justify-between items-center pt-2">
                <button type="submit" name="purge_now" value="1" onclick="return confirm('ยืนยันลบอะไหล่เก่าที่ไม่ตรงกับรหัสหมวดหมู่ที่ระบุออกใช่หรือไม่?')" class="btn btn-outline border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold gap-1">
                    <span>🧹</span> <span>ล้างอะไหล่นอกหมวดหมู่ที่เลือกออกบัดนี้</span>
                </button>
                <button type="submit" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-sm">
                    💾 บันทึกการตั้งค่าหมวดหมู่ Sage 300
                </button>
            </div>
        </form>
    </div>

    <!-- 1-Click Sync Controls Card -->
    <div class="card cmms-card p-5">
        <div class="flex items-center justify-between flex-wrap gap-4 border-b pb-3">
            <div>
                <h3 class="font-bold text-slate-900 text-base">⚡ สั่งซิงค์คลังอะไหล่จาก Sage 300 (1-Click Inventory Sync)</h3>
                <p class="text-xs text-slate-500 mt-0.5">กดปุ่มด้านล่างเพื่อดึงข้อมูล Item Master เฉพาะหมวดหมู่ <strong class="font-mono text-indigo-600"><?= htmlspecialchars($currentCatsStr) ?></strong> จาก Sage 300 DSN: <strong><?= htmlspecialchars($dsn) ?></strong></p>
            </div>
            <form method="POST" class="flex flex-col items-end gap-2">
                <input type="hidden" name="exec_sync" value="1">
                <label class="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                    <input type="checkbox" name="purge_unselected" value="1" class="rounded text-rose-600">
                    <span>ล้างอะไหล่เก่าที่ไม่ตรงกับหมวดหมู่ที่เลือกออกด้วย</span>
                </label>
                <button type="submit" onclick="return confirm('ยืนยันดึงและซิงค์คลังอะไหล่จาก Sage 300 ใช่หรือไม่?')" class="btn btn-primary bg-purple-700 border-purple-700 hover:bg-purple-800 text-xs px-5 py-3 font-extrabold shadow-lg">
                    🔄 กดดึงและซิงค์คลังอะไหล่จาก Sage 300 บัดนี้
                </button>
            </form>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span class="text-slate-500 block">จำนวนรายการอะไหล่ใน CMMS:</span>
                <strong class="text-lg text-slate-900 font-bold"><?= count($spares) ?> รายการ</strong>
            </div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span class="text-slate-500 block">DSN ฐานข้อมูลที่เชื่อมต่อ:</span>
                <strong class="text-lg text-purple-700 font-mono font-bold"><?= htmlspecialchars($dsn) ?></strong>
            </div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span class="text-slate-500 block">สถานะการซิงค์ข้อมูล:</span>
                <strong class="text-lg text-emerald-600 font-bold">READY TO SYNC</strong>
            </div>
        </div>
    </div>

    <!-- CMMS Spare Parts Catalog Table -->
    <div class="card overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center">
            <span>📦 รายการอะไหล่ทั้งหมดที่ซิงค์มาจาก Sage 300 (CMMS Master Catalog)</span>
            <span class="text-xs text-purple-600 font-bold">Sage 300 Matched</span>
        </div>

        <div class="overflow-x-auto">
            <table class="data-table cmms-stack-table text-sm">
                <thead class="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                    <tr>
                        <th class="px-4 py-3 text-left">รหัสอะไหล่ (Sage Item No)</th>
                        <th class="px-4 py-3 text-left">ชื่อรายการอะไหล่</th>
                        <th class="px-4 py-3 text-left">หมวดหมู่</th>
                        <th class="px-4 py-3 text-center">สถานที่เก็บ</th>
                        <th class="px-4 py-3 text-center">คงเหลือ (On Hand)</th>
                        <th class="px-4 py-3 text-right">ราคาเฉลี่ย/หน่วย</th>
                        <th class="px-4 py-3 text-center">สถานะ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($spares as $sp): ?>
                    <tr class="hover:bg-slate-50">
                        <td data-label="รหัสอะไหล่ (Sage Item No)" class="px-4 py-3 font-mono font-extrabold text-indigo-600 text-xs"><?= htmlspecialchars($sp['code']) ?></td>
                        <td data-label="ชื่อรายการอะไหล่" class="px-4 py-3 font-bold text-slate-900"><?= htmlspecialchars($sp['name']) ?></td>
                        <td data-label="หมวดหมู่" class="px-4 py-3 text-xs text-slate-600"><?= htmlspecialchars($sp['category'] ?? 'General') ?></td>
                        <td data-label="สถานที่เก็บ" class="px-4 py-3 text-center text-xs text-slate-600"><?= htmlspecialchars($sp['location'] ?? '-') ?></td>
                        <td data-label="คงเหลือ (On Hand)" class="px-4 py-3 text-center font-bold text-slate-800"><?= number_format($sp['stock_qty']) ?> <?= htmlspecialchars($sp['unit'] ?? 'ชิ้น') ?></td>
                        <td data-label="ราคาเฉลี่ย/หน่วย" class="px-4 py-3 text-right font-mono text-xs">฿<?= number_format($sp['unit_price'], 2) ?></td>
                        <td data-label="สถานะ" class="px-4 py-3 text-center">
                            <span class="badge bg-purple-100 text-purple-800 text-xs font-bold">Sage 300</span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
