<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/components/pagination.php';
$pageTitle = 'คลังสต็อกอะไหล่ (Sage 300 + คลังเก่าภายใน) - CMMS-TPT';
$pdo = getDb();

// Handle Match Legacy Item to Sage 300
if (isset($_POST['match_sage_item'])) {
    $spId = (int)$_POST['spare_id'];
    $sageNo = trim($_POST['sage_item_no']);
    if ($spId && $sageNo) {
        $stmt = $pdo->prepare("UPDATE spare_parts SET sage_item_no = ?, updated_at = NOW() WHERE id = ?");
        $stmt->execute([$sageNo, $spId]);
        header("Location: index.php?msg=" . urlencode("ผูกอะไหล่เก่ากับรหัส Sage 300 ($sageNo) เรียบร้อยแล้ว"));
        exit;
    }
}

$search = trim($_GET['search'] ?? '');
$filterSource = trim($_GET['source'] ?? '');
$page = max(1, (int)($_GET['page'] ?? 1));
$limit = max(5, (int)($_GET['limit'] ?? 10));

$conditions = [];
$params = [];

if ($search !== '') {
    $conditions[] = '(sp.name LIKE ? OR sp.code LIKE ? OR sp.sage_item_no LIKE ?)';
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

if ($filterSource === 'sage') {
    $conditions[] = "(sp.sage_item_no IS NOT NULL AND sp.sage_item_no != '')";
} elseif ($filterSource === 'legacy') {
    $conditions[] = "(sp.sage_item_no IS NULL OR sp.sage_item_no = '')";
}

$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

$countStmt = $pdo->prepare("SELECT COUNT(*) FROM spare_parts sp $where");
$countStmt->execute($params);
$totalRecords = (int)$countStmt->fetchColumn();

$totalPages = max(1, ceil($totalRecords / $limit));
if ($page > $totalPages) $page = $totalPages;
$offset = ($page - 1) * $limit;

$stmt = $pdo->prepare("
    SELECT sp.*, sup.name AS supplier_name
    FROM spare_parts sp
    LEFT JOIN suppliers sup ON sp.supplier_id = sup.id
    $where
    ORDER BY sp.id DESC
    LIMIT $limit OFFSET $offset
");
$stmt->execute($params);
$spares = $stmt->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Header Banner -->
    <div class="card flex items-center justify-between flex-wrap gap-4 p-5">
        <div>
            <div class="flex items-center gap-2">
                <span class="badge bg-purple-100 text-purple-800 font-bold">Hybrid Inventory Management</span>
                <span class="text-xs text-slate-400">Sage 300 & Legacy Internal Stock</span>
            </div>
            <h1 class="text-2xl font-black text-slate-900 mt-1">⚙️ คลังสต็อกอะไหล่ (Sage 300 & คลังเก่าภายใน)</h1>
            <p class="text-xs text-slate-500 mt-0.5">รองรับทั้งอะไหล่ในระบบ Sage 300 และอะไหล่เก่ารอ Migration เข้า Sage 300</p>
        </div>
        <div class="flex gap-2">
            <a href="sage_sync.php" class="btn btn-primary text-xs bg-purple-700 border-purple-700 hover:bg-purple-800">
                🔄 ซิงค์คลังอะไหล่ Sage 300
            </a>
            <a href="issue_center.php" class="btn btn-secondary text-xs">📦 ศูนย์เบิก-จ่าย Sage 300</a>
        </div>
    </div>

    <!-- Source Type Filter Bar -->
    <div class="card p-4 flex items-center justify-between flex-wrap gap-4 text-xs">
        <div class="flex items-center gap-2">
            <span class="font-bold text-slate-700">ตัวกรองคลัง:</span>
            <a href="index.php" class="px-3 py-1.5 rounded-lg border font-bold <?= $filterSource === '' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' ?>">
                ทั้งหมด (<?= $totalRecords ?>)
            </a>
            <a href="index.php?source=sage" class="px-3 py-1.5 rounded-lg border font-bold <?= $filterSource === 'sage' ? 'bg-purple-700 text-white border-purple-700' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' ?>">
                🟣 อะไหล่ใน Sage 300
            </a>
            <a href="index.php?source=legacy" class="px-3 py-1.5 rounded-lg border font-bold <?= $filterSource === 'legacy' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' ?>">
                🟠 อะไหล่เก่าภายใน (รอเข้า Sage 300)
            </a>
        </div>

        <form method="GET" class="flex items-center gap-2">
            <input type="hidden" name="source" value="<?= htmlspecialchars($filterSource) ?>">
            <input type="text" name="search" value="<?= htmlspecialchars($search) ?>" placeholder="พิมพ์ค้นหาชื่อ หรือ รหัสอะไหล่..." class="input input-bordered w-full py-1 px-3 text-xs w-64">
            <button type="submit" class="btn btn-secondary text-xs py-1">ค้นหา</button>
        </form>
    </div>

    <!-- Table List -->
    <div class="card overflow-hidden">
        <div class="overflow-x-auto">
            <table class="data-table cmms-stack-table text-sm">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="px-4 py-3 text-left">ประเภทระบบ</th>
                        <th class="px-4 py-3 text-left">รูปภาพอะไหล่</th>
                        <th class="px-4 py-3 text-left">รหัสอะไหล่</th>
                        <th class="px-4 py-3 text-left">ชื่ออะไหล่ / รายละเอียด</th>
                        <th class="px-4 py-3 text-center">Sage 300 Item No</th>
                        <th class="px-4 py-3 text-center">คงเหลือ (Stock)</th>
                        <th class="px-4 py-3 text-right">ราคา/หน่วย</th>
                        <th class="px-4 py-3 text-center">จัดการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($spares as $sp): 
                        $hasSage = !empty($sp['sage_item_no']);
                    ?>
                    <tr class="hover:bg-slate-50">
                        <td data-label="ประเภทระบบ" class="px-4 py-3 text-xs font-bold">
                            <?php if ($hasSage): ?>
                            <span class="badge bg-purple-100 text-purple-800">🟣 Sage 300</span>
                            <?php else: ?>
                            <span class="badge badge badge-warning">🟠 คลังเก่าภายใน</span>
                            <?php endif; ?>
                        </td>
                        <td data-label="รูปภาพอะไหล่" class="px-4 py-3">
                            <img src="<?= getImageUrl($sp['image_url'] ?? null, 'spare') ?>" class="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm bg-slate-50">
                        </td>
                        <td data-label="รหัสอะไหล่" class="px-4 py-3 font-mono font-extrabold text-indigo-600 text-xs"><?= htmlspecialchars($sp['code']) ?></td>
                        <td data-label="ชื่ออะไหล่ / รายละเอียด" class="px-4 py-3 font-bold text-slate-900"><?= htmlspecialchars($sp['name']) ?></td>
                        <td data-label="Sage 300 Item No" class="px-4 py-3 text-center">
                            <?php if ($hasSage): ?>
                            <span class="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200"><?= htmlspecialchars($sp['sage_item_no']) ?></span>
                            <?php else: ?>
                            <span class="text-slate-400 text-xs italic">ยังไม่ได้ผูก Sage</span>
                            <?php endif; ?>
                        </td>
                        <td data-label="คงเหลือ (Stock)" class="px-4 py-3 text-center font-bold text-slate-800">
                            <?= number_format($sp['stock_qty']) ?> <?= htmlspecialchars($sp['unit'] ?? 'ชิ้น') ?>
                            <?php if (($sp['reserved_qty'] ?? 0) > 0): ?>
                            <span class="text-[10px] text-amber-600 block">(จอง <?= number_format($sp['reserved_qty']) ?>)</span>
                            <?php endif; ?>
                        </td>
                        <td data-label="ราคา/หน่วย" class="px-4 py-3 text-right font-mono text-xs">฿<?= number_format($sp['unit_price'], 2) ?></td>
                        <td data-label="จัดการ" class="px-4 py-3 text-center text-xs space-x-1">
                            <a href="edit.php?id=<?= $sp['id'] ?>" class="btn btn-outline btn-sm text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-bold text-[11px] inline-flex items-center gap-1">
                                <i data-lucide="pencil" class="w-3 h-3"></i>
                                <span>แก้ไข</span>
                            </a>
                            <?php if (!$hasSage): ?>
                            <button onclick="openBindModal(<?= $sp['id'] ?>, '<?= htmlspecialchars($sp['name'], ENT_QUOTES) ?>')" class="btn btn-secondary btn-sm text-purple-700 font-bold text-[11px] inline-flex items-center gap-1">
                                <span>🔗</span> <span>ผูก Sage</span>
                            </button>
                            <?php else: ?>
                            <span class="text-emerald-600 font-bold text-[11px]">✔ ผูก Sage แล้ว</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <?php renderPagination($page, $totalPages, $totalRecords, $limit); ?>
    </div>
</div>

<!-- Modal: Bind Legacy Item to Sage 300 -->
<div id="bind-sage-modal" style="display:none;" class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm items-center justify-center p-4">
    <div class="card shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 class="font-bold text-slate-900 text-lg border-b pb-2">🔗 ผูกรายการอะไหล่เก่าเข้ากับ Sage 300</h3>
        <p class="text-xs text-slate-500" id="bind-item-name-label">เลือกรายการอะไหล่ใน Sage 300 เพื่อแมตช์จับคู่</p>

        <form method="POST" class="space-y-3 text-xs">
            <input type="hidden" name="match_sage_item" value="1">
            <input type="hidden" name="spare_id" id="bind-spare-id">

            <div>
                <label class="font-bold text-slate-700 block mb-1">รหัสอะไหล่ใน Sage 300 (Sage Item No)</label>
                <input type="text" name="sage_item_no" required placeholder="เช่น BEARING-6205" class="input input-bordered w-full font-mono font-bold">
            </div>

            <div class="flex justify-end gap-2 pt-2">
                <button type="button" onclick="document.getElementById('bind-sage-modal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary bg-purple-700 border-purple-700 hover:bg-purple-800">บันทึกจับคู่เข้า Sage 300</button>
            </div>
        </form>
    </div>
</div>

<script>
function openBindModal(id, name) {
    document.getElementById('bind-spare-id').value = id;
    document.getElementById('bind-item-name-label').innerText = 'รายการ: ' + name;
    document.getElementById('bind-sage-modal').style.display = 'flex';
}
</script>

<?php renderFooter(); ?>
