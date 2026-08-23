<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'จัดการแผนก - CMMS-TPT';
renderHeader();
$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0);
        $code = $_POST['code']; $name = $_POST['name']; $desc = $_POST['description']; $active = (int)($_POST['is_active'] ?? 1);
        if ($id) {
            $pdo->prepare('UPDATE departments SET code=?,name=?,description=?,is_active=? WHERE id=?')->execute([$code,$name,$desc,$active,$id]);
            $msg = 'updated';
        } else {
            $pdo->prepare('INSERT INTO departments (code,name,description,is_active) VALUES (?,?,?,?)')->execute([$code,$name,$desc,$active]);
            $msg = 'created';
        }
    } catch (Exception $e) { $msg = 'error: ' . $e->getMessage(); }
}
$delId = (int)($_GET['delete'] ?? 0);
if ($delId) { try { $pdo->prepare('DELETE FROM departments WHERE id=?')->execute([$delId]); $msg='deleted'; } catch (Exception $e) { $msg='error: '.$e->getMessage(); } }

$editId = (int)($_GET['edit'] ?? 0);
$editRow = null;
if ($editId) { $stmt=$pdo->prepare('SELECT * FROM departments WHERE id=?'); $stmt->execute([$editId]); $editRow=$stmt->fetch(); }

$rows = $pdo->query('SELECT * FROM departments ORDER BY code')->fetchAll();
?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">จัดการแผนก</h1><p class="mt-1 text-sm text-gray-500">Departments</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if ($msg): ?><div class="<?= str_starts_with($msg,'error')?'bg-red-50 text-red-700':'bg-green-50 text-green-700'?> text-sm rounded-md p-3"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
    <div class="card p-4">
        <h2 class="text-lg font-semibold mb-3"><?= $editRow ? 'แก้ไขแผนก' : 'เพิ่มแผนก' ?></h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <?php if ($editRow): ?><input type="hidden" name="id" value="<?= $editRow['id'] ?>"><?php endif; ?>
            <div><label class="block text-xs font-medium text-gray-600">รหัสแผนก</label><input type="text" name="code" value="<?= $editRow?htmlspecialchars($editRow['code']):'' ?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ชื่อแผนก</label><input type="text" name="name" value="<?= $editRow?htmlspecialchars($editRow['name']):'' ?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">คำอธิบาย</label><input type="text" name="description" value="<?= $editRow?htmlspecialchars($editRow['description']??''):'' ?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1" <?= $editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0" <?= $editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="sm:col-span-4 flex gap-2"><button type="submit" class="btn-primary">บันทึก</button><?php if ($editRow): ?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif; ?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table">
            <thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">รหัส</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อแผนก</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">คำอธิบาย</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-gray-50"><td data-label="รหัส" class="px-4 py-3 text-sm font-medium text-gray-900"><?= htmlspecialchars($r['code']) ?></td><td data-label="ชื่อแผนก" class="px-4 py-3 text-sm text-gray-700"><?= htmlspecialchars($r['name']) ?></td><td data-label="คำอธิบาย" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['description']??'-') ?></td><td data-label="สถานะ" class="px-4 py-3 text-sm"><span class="badge <?= $r['is_active']?'status-active':'status-inactive' ?>"><?= $r['is_active']?'Active':'Inactive' ?></span></td><td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?= $r['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a><a href="?delete=<?= $r['id'] ?>" class="text-red-600 hover:text-red-700" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?><tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูลแผนก</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
