<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'จัดการสถานที่ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0);
        $code = $_POST['code']; $name = $_POST['name']; $type = $_POST['type']; $parent = $_POST['parent_id'] ? (int)$_POST['parent_id'] : null; $desc = $_POST['description']; $active = (int)($_POST['is_active'] ?? 1);
        if ($id) {
            $pdo->prepare('UPDATE locations SET code=?,name=?,type=?,parent_id=?,description=?,is_active=? WHERE id=?')->execute([$code,$name,$type,$parent,$desc,$active,$id]);
            $msg = 'updated';
        } else {
            $pdo->prepare('INSERT INTO locations (code,name,type,parent_id,description,is_active) VALUES (?,?,?,?,?,?)')->execute([$code,$name,$type,$parent,$desc,$active]);
            $msg = 'created';
        }
    } catch (Exception $e) { $msg = 'error: ' . $e->getMessage(); }
}
$delId = (int)($_GET['delete'] ?? 0);
if ($delId) { try { $pdo->prepare('DELETE FROM locations WHERE id=?')->execute([$delId]); $msg='deleted'; } catch (Exception $e) { $msg='error: '.$e->getMessage(); } }

$editId = (int)($_GET['edit'] ?? 0);
$editRow = null;
if ($editId) { $stmt=$pdo->prepare('SELECT * FROM locations WHERE id=?'); $stmt->execute([$editId]); $editRow=$stmt->fetch(); }

$rows = $pdo->query('SELECT l.*, p.name parent_name FROM locations l LEFT JOIN locations p ON l.parent_id=p.id ORDER BY l.code')->fetchAll();
$parents = $pdo->query('SELECT id, code, name FROM locations ORDER BY code')->fetchAll();
?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">จัดการสถานที่</h1><p class="mt-1 text-sm text-gray-500">Locations (Parent/Child)</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if ($msg): ?><div class="<?= str_starts_with($msg,'error')?'bg-red-50 text-red-700':'bg-green-50 text-green-700'?> text-sm rounded-md p-3"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
    <div class="card p-4">
        <h2 class="text-lg font-semibold mb-3"><?= $editRow ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่' ?></h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <?php if ($editRow): ?><input type="hidden" name="id" value="<?= $editRow['id'] ?>"><?php endif; ?>
            <div><label class="block text-xs font-medium text-gray-600">รหัสสถานที่</label><input type="text" name="code" value="<?= $editRow?htmlspecialchars($editRow['code']):'' ?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ชื่อสถานที่</label><input type="text" name="name" value="<?= $editRow?htmlspecialchars($editRow['name']):'' ?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ประเภท</label><select name="type" class="input input-bordered w-full mt-1"><?php foreach(['building','floor','zone','area','sub_location'] as $t): ?><option value="<?=$t?>" <?= $editRow&&$editRow['type']===$t?'selected':'' ?>><?=$t?></option><?php endforeach; ?></select></div>
            <div><label class="block text-xs font-medium text-gray-600">สถานที่หลัก (Parent)</label><select name="parent_id" class="input input-bordered w-full mt-1"><option value="">ไม่มี</option><?php foreach ($parents as $p): ?><option value="<?=$p['id']?>" <?= $editRow&&$editRow['parent_id']==$p['id']?'selected':'' ?>><?=htmlspecialchars($p['code'].' - '.$p['name'])?></option><?php endforeach; ?></select></div>
            <div><label class="block text-xs font-medium text-gray-600">คำอธิบาย</label><input type="text" name="description" value="<?= $editRow?htmlspecialchars($editRow['description']??''):'' ?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1" <?= $editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0" <?= $editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="sm:col-span-3 flex gap-2"><button type="submit" class="btn-primary">บันทึก</button><?php if ($editRow): ?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif; ?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table">
            <thead class="bg-gray-50"><tr><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">รหัส</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อ</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ประเภท</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานที่หลัก</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th><th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-gray-50"><td data-label="รหัส" class="px-4 py-3 text-sm font-medium text-gray-900"><?= htmlspecialchars($r['code']) ?></td><td data-label="ชื่อ" class="px-4 py-3 text-sm text-gray-700"><?= htmlspecialchars($r['name']) ?></td><td data-label="ประเภท" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['type']) ?></td><td data-label="สถานที่หลัก" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['parent_name']??'-') ?></td><td data-label="สถานะ" class="px-4 py-3 text-sm"><span class="badge <?= $r['is_active']?'status-active':'status-inactive' ?>"><?= $r['is_active']?'Active':'Inactive' ?></span></td><td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?= $r['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a><a href="?delete=<?= $r['id'] ?>" class="text-red-600 hover:text-red-700" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?><tr><td colspan="6" class="cmms-empty-state-cell">ไม่มีข้อมูลสถานที่</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
