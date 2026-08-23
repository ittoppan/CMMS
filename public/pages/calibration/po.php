<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ติดตาม PO การสอบเทียบ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$suppliers = $pdo->query('SELECT id, code, name FROM suppliers WHERE is_active = 1 ORDER BY name')->fetchAll();
$error = '';
$success = '';
$editId = (int)($_GET['edit'] ?? 0);
$deleteId = (int)($_GET['delete'] ?? 0);
if ($deleteId && $_SERVER['REQUEST_METHOD'] === 'POST') {
    try { $pdo->prepare('DELETE FROM po_calibration WHERE id=?')->execute([$deleteId]); $success = 'ลบ PO เรียบร้อย'; } catch (Exception $e) { $error = $e->getMessage(); }
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$deleteId) {
    try {
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        if ($editId) {
            $pdo->prepare('UPDATE po_calibration SET calibration_id=?, po_number=?, supplier_id=?, po_date=?, amount=?, status=?, notes=? WHERE id=?')->execute([
                $_POST['calibration_id'] ?: null,
                $_POST['po_number'],
                $_POST['supplier_id'] ?: null,
                $_POST['po_date'] ?: null,
                $toNull($_POST['amount']),
                $_POST['status'] ?? 'open',
                $toNull($_POST['notes']),
                $editId
            ]);
            $success = 'บันทึก PO เรียบร้อย';
        } else {
            $pdo->prepare('INSERT INTO po_calibration (calibration_id, po_number, supplier_id, po_date, amount, status, notes, created_by) VALUES (?,?,?,?,?,?,?,?)')->execute([
                $_POST['calibration_id'] ?: null,
                $_POST['po_number'],
                $_POST['supplier_id'] ?: null,
                $_POST['po_date'] ?: null,
                $toNull($_POST['amount']),
                $_POST['status'] ?? 'open',
                $toNull($_POST['notes']),
                $_SESSION['user_id'] ?? null
            ]);
            $success = 'เพิ่ม PO เรียบร้อย';
        }
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
$stmt = $pdo->query('SELECT p.*, s.name AS supplier_name, s.code AS supplier_code, h.calibration_date, a.name AS asset_name FROM po_calibration p LEFT JOIN suppliers s ON p.supplier_id = s.id LEFT JOIN calibration_history h ON p.calibration_id = h.id LEFT JOIN asset_registry a ON h.asset_id = a.id ORDER BY p.po_date DESC');
$rows = $stmt->fetchAll();
$editRow = null;
if ($editId) { $er = $pdo->prepare('SELECT * FROM po_calibration WHERE id=?'); $er->execute([$editId]); $editRow = $er->fetch(); }
$calHistories = $pdo->query('SELECT h.id, a.code, a.name, h.calibration_date FROM calibration_history h LEFT JOIN asset_registry a ON h.asset_id = a.id ORDER BY h.calibration_date DESC LIMIT 100')->fetchAll();
$statusLabel = ['open'=>'เปิด','partial'=>'บางส่วน','completed'=>'เสร็จสิ้น','cancelled'=>'ยกเลิก'];
$statusBadge = ['open'=>'status-open','partial'=>'status-in_progress','completed'=>'status-completed','cancelled'=>'status-cancelled'];
?>
<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div><h1 class="text-2xl font-bold text-gray-900">ติดตาม PO การสอบเทียบ</h1><p class="mt-1 text-sm text-gray-500">Purchase Order Tracking</p></div>
        <a href="index.php" class="btn-secondary">&larr; กลับไปสอบเทียบ</a>
    </div>
    <?php if ($error): ?><div class="bg-red-50 text-red-700 text-sm rounded p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="bg-green-50 text-green-700 text-sm rounded p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <div class="card p-6">
        <h2 class="text-lg font-semibold mb-4"><?= $editRow ? 'แก้ไข PO' : 'เพิ่ม PO' ?></h2>
        <form method="post" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">เลขที่ PO <span class="text-red-500">*</span></label>
                    <input type="text" name="po_number" value="<?= htmlspecialchars($editRow['po_number'] ?? '') ?>" required class="input input-bordered w-full mt-1" placeholder="PO-XXXX">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">ผู้จำหน่าย</label>
                    <select name="supplier_id" class="input input-bordered w-full mt-1">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($suppliers as $s): ?>
                        <option value="<?= $s['id'] ?>" <?= (isset($editRow) && (int)$editRow['supplier_id'] === (int)$s['id']) ? 'selected' : '' ?>><?= htmlspecialchars($s['code'] . ' - ' . $s['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">วันที่ PO</label>
                    <input type="date" name="po_date" value="<?= htmlspecialchars($editRow['po_date'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">จำนวนเงิน</label>
                    <input type="number" name="amount" step="0.01" value="<?= htmlspecialchars($editRow['amount'] ?? '') ?>" class="input input-bordered w-full mt-1" placeholder="0.00">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">สถานะ</label>
                    <select name="status" class="input input-bordered w-full mt-1">
                        <option value="open" <?= (isset($editRow) && $editRow['status'] === 'open') ? 'selected' : '' ?>>เปิด</option>
                        <option value="partial" <?= (isset($editRow) && $editRow['status'] === 'partial') ? 'selected' : '' ?>>บางส่วน</option>
                        <option value="completed" <?= (isset($editRow) && $editRow['status'] === 'completed') ? 'selected' : '' ?>>เสร็จสิ้น</option>
                        <option value="cancelled" <?= (isset($editRow) && $editRow['status'] === 'cancelled') ? 'selected' : '' ?>>ยกเลิก</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">การสอบเทียบที่เกี่ยวข้อง</label>
                    <select name="calibration_id" class="input input-bordered w-full mt-1">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($calHistories as $ch): ?>
                        <option value="<?= $ch['id'] ?>" <?= (isset($editRow) && (int)$editRow['calibration_id'] === (int)$ch['id']) ? 'selected' : '' ?>><?= htmlspecialchars(($ch['code'] ?? '') . ' - ' . ($ch['name'] ?? '') . ' (' . $ch['calibration_date'] . ')') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="sm:col-span-3">
                    <label class="block text-sm font-medium text-gray-700">หมายเหตุ</label>
                    <input type="text" name="notes" value="<?= htmlspecialchars($editRow['notes'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="btn-primary"><?= $editRow ? 'บันทึก' : 'เพิ่ม' ?></button>
                <?php if ($editRow): ?><a href="po.php" class="btn-secondary">ยกเลิก</a><?php endif; ?>
            </div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขที่ PO</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้จำหน่าย</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวนเงิน</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">การสอบเทียบ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm font-medium text-gray-900"><?= htmlspecialchars($r['po_number']) ?></td>
                    <td class="px-4 py-3 text-sm text-gray-700"><?= htmlspecialchars(($r['supplier_code'] ?? '') . ' - ' . ($r['supplier_name'] ?? '-')) ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['po_date'] ?? '-') ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= $r['amount'] ? number_format((float)$r['amount'], 2) : '-' ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars(($r['asset_name'] ?? '') . ($r['calibration_date'] ? ' (' . $r['calibration_date'] . ')' : '')) ?: '-' ?></td>
                    <td class="px-4 py-3 text-sm">
                        <span class="badge <?= $statusBadge[$r['status']] ?? 'bg-gray-100' ?>"><?= htmlspecialchars($statusLabel[$r['status']] ?? $r['status']) ?></span>
                    </td>
                    <td class="px-4 py-3 text-sm space-x-2">
                        <a href="?edit=<?= $r['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a>
                        <a href="?delete=<?= $r['id'] ?>" class="text-red-600 hover:text-red-700" onclick="return confirm('ลบ PO นี้?')">ลบ</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?>
                <tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูล PO</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
