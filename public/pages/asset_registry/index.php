<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/components/pagination.php';
$pageTitle = 'ทะเบียนทรัพย์สิน - CMMS-TPT';
renderHeader();

$search = trim($_GET['search'] ?? '');
$filterStatus = trim($_GET['status'] ?? '');
$page = max(1, (int)($_GET['page'] ?? 1));
$limit = max(5, (int)($_GET['limit'] ?? 10));

$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(a.name LIKE ? OR a.code LIKE ? OR a.location LIKE ? OR a.barcode LIKE ?)';
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($filterStatus !== '') {
    $conditions[] = 'a.status = ?';
    $params[] = $filterStatus;
}
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$pdo = getDb();

// Count Total Records
$countStmt = $pdo->prepare("SELECT COUNT(*) FROM asset_registry a $where");
$countStmt->execute($params);
$totalRecords = (int)$countStmt->fetchColumn();

$totalPages = max(1, ceil($totalRecords / $limit));
if ($page > $totalPages) $page = $totalPages;
$offset = ($page - 1) * $limit;

// Fetch Paginated Assets
$stmt = $pdo->prepare("
    SELECT a.*,
           u.full_name AS responsible_name,
           d.name AS dept_name,
           l.name AS loc_name
    FROM asset_registry a
    LEFT JOIN users u ON a.responsible_user_id = u.id
    LEFT JOIN departments d ON a.department_id = d.id
    LEFT JOIN locations l ON a.location_id = l.id
    $where
    ORDER BY a.id DESC
    LIMIT $limit OFFSET $offset
");
$stmt->execute($params);
$rows = $stmt->fetchAll();

$activeCount = (int)$pdo->query("SELECT COUNT(*) FROM asset_registry WHERE status = 'active'")->fetchColumn();
?>

<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">🏭 ทะเบียนทรัพย์สิน & เครื่องจักร</h1>
            <p class="mt-1 text-sm text-slate-500">เครื่องจักร อุปกรณ์ และเครื่องมือวัด (ทั้งหมด <?= number_format($totalRecords) ?> รายการ | ใช้งาน <?= number_format($activeCount) ?>)</p>
        </div>
        <div class="flex gap-2">
            <a href="asset_analytics.php" class="btn btn-secondary text-xs">📊 วิเคราะห์เครื่องจักร 360</a>
            <a href="qr_batch.php" target="_blank" class="btn btn-secondary text-xs">🖨️ พิมพ์ QR แบบชุด (A4)</a>
            <a href="create.php" class="btn-primary text-xs">+ เพิ่มทรัพย์สินใหม่</a>
        </div>
    </div>

    <div class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <?php
        $statusOptions = ['active' => 'ใช้งาน', 'inactive' => 'ไม่ได้ใช้งาน', 'under_repair' => 'อยู่ระหว่างซ่อม', 'disposed' => 'จำหน่าย'];
        include __DIR__ . '/../../../src/components/search_form.php';
        ?>
    </div>

    <div class="card overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
        <div class="overflow-x-auto">
            <table class="data-table cmms-stack-table text-sm">
                <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold uppercase text-xs">
                    <tr>
                        <th class="px-4 py-3 text-left">รหัส</th>
                        <th class="px-4 py-3 text-left">ชื่อทรัพย์สิน</th>
                        <th class="px-4 py-3 text-left">หมวดหมู่</th>
                        <th class="px-4 py-3 text-left">แผนก / สถานที่</th>
                        <th class="px-4 py-3 text-left">ผู้รับผิดชอบ</th>
                        <th class="px-4 py-3 text-center">สถานะ</th>
                        <th class="px-4 py-3 text-center">จัดการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-700/50">
                    <?php foreach ($rows as $a): ?>
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td data-label="รหัส" class="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                            <?= htmlspecialchars($a['code']) ?>
                            <?php if (!empty($a['barcode'])): ?>
                            <span class="text-[10px] text-slate-400 block font-normal"><?= htmlspecialchars($a['barcode']) ?></span>
                            <?php endif; ?>
                        </td>
                        <td data-label="ชื่อทรัพย์สิน" class="px-4 py-3 text-slate-900 dark:text-slate-100">
                            <div class="flex items-center gap-3">
                                <img src="<?= getImageUrl($a['image_path'] ?? '', 'asset') ?>" class="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm shrink-0">
                                <div>
                                    <span class="font-bold text-slate-900 dark:text-slate-100 block"><?= htmlspecialchars($a['name']) ?></span>
                                    <?php if (!empty($a['manufacturer']) || !empty($a['model'])): ?>
                                    <span class="text-xs text-slate-400 block font-medium"><?= htmlspecialchars(trim(($a['manufacturer'] ?? '') . ' ' . ($a['model'] ?? ''))) ?></span>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </td>
                        <td data-label="หมวดหมู่" class="px-4 py-3 text-slate-600 dark:text-slate-300 font-medium"><?= htmlspecialchars($a['category'] ?? '-') ?></td>
                        <td data-label="แผนก / สถานที่" class="px-4 py-3 text-slate-600 dark:text-slate-300">
                            <span class="font-bold"><?= htmlspecialchars($a['dept_name'] ?? $a['department'] ?? '-') ?></span>
                            <?php $loc = $a['loc_name'] ?? $a['location'] ?? ''; if ($loc): ?>
                            <span class="text-xs text-slate-400 block"><?= htmlspecialchars($loc) ?></span>
                            <?php endif; ?>
                        </td>
                        <td data-label="ผู้รับผิดชอบ" class="px-4 py-3 text-slate-600 dark:text-slate-300"><?= htmlspecialchars($a['responsible_name'] ?? '-') ?></td>
                        <td data-label="สถานะ" class="px-4 py-3 text-center">
                            <span class="badge <?= match($a['status']) {
                                'active'       => 'badge badge-success',
                                'inactive'     => 'status-inactive',
                                'disposed'     => 'badge badge-error',
                                'under_repair' => 'badge badge-warning',
                                default        => 'bg-slate-100 text-slate-800'
                            } ?>">
                                <?= htmlspecialchars($a['status']) ?>
                            </span>
                        </td>
                        <td data-label="จัดการ" class="px-4 py-3 text-center space-x-2 text-xs">
                            <a href="asset_analytics.php?asset_id=<?= $a['id'] ?>" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">📊 360</a>
                            <a href="history.php?id=<?= $a['id'] ?>" class="text-slate-700 dark:text-slate-200 font-bold hover:underline">📜 ประวัติ</a>
                            <a href="qr_sticker.php?id=<?= $a['id'] ?>" target="_blank" class="text-cyan-600 font-bold hover:underline">📲 QR</a>
                            <a href="edit.php?id=<?= $a['id'] ?>" class="text-slate-600 font-bold hover:underline">แก้ไข</a>
                            <a href="delete.php?id=<?= $a['id'] ?>" class="text-rose-600 font-bold hover:underline"
                                onclick="return confirm('ลบทรัพย์สิน &quot;<?= htmlspecialchars($a['name']) ?>&quot; ใช่หรือไม่?')">ลบ</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($rows)): ?>
                    <tr><td colspan="7" class="cmms-empty-state-cell">ไม่พบข้อมูลทรัพย์สินในหน้านี้</td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

        <!-- Render Pagination Bar -->
        <?php renderPagination($page, $totalPages, $totalRecords, $limit); ?>

    </div>
</div>

<?php renderFooter(); ?>
