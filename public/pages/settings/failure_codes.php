<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'รหัสสาเหตุเสียหาย - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0); $code = $_POST['code']; $name = $_POST['name']; $desc = $_POST['description']; $cat = $_POST['category']; $active = (int)($_POST['is_active'] ?? 1);
        if ($id) { $pdo->prepare('UPDATE failure_codes SET code=?,name=?,description=?,category=?,is_active=? WHERE id=?')->execute([$code,$name,$desc,$cat,$active,$id]); $msg='updated'; }
        else { $pdo->prepare('INSERT INTO failure_codes (code,name,description,category,is_active) VALUES (?,?,?,?,?)')->execute([$code,$name,$desc,$cat,$active]); $msg='created'; }
    } catch (Exception $e) { $msg='error: '.$e->getMessage(); }
}
$delId=(int)($_GET['delete']??0); if($delId){try{$pdo->prepare('DELETE FROM failure_codes WHERE id=?')->execute([$delId]);$msg='deleted';}catch(Exception$e){$msg='error: '.$e->getMessage();}}
$editId=(int)($_GET['edit']??0);$editRow=null;if($editId){$s=$pdo->prepare('SELECT*FROM failure_codes WHERE id=?');$s->execute([$editId]);$editRow=$s->fetch();}
$rows=$pdo->query('SELECT*FROM failure_codes ORDER BY code')->fetchAll(); ?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">รหัสสาเหตุเสียหาย</h1><p class="mt-1 text-sm text-gray-500">Failure Codes</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg):?><div class="<?=str_starts_with($msg,'error')?'bg-red-50 text-red-700':'bg-green-50 text-green-700'?> text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <div class="card p-4"><h2 class="text-lg font-semibold mb-3"><?=$editRow?'แก้ไข':'เพิ่ม'?>รหัสสาเหตุเสียหาย</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3"><?php if($editRow):?><input type="hidden" name="id" value="<?=$editRow['id']?>"><?php endif;?>
            <div><label class="block text-xs font-medium text-gray-600">รหัส</label><input type="text" name="code" value="<?=$editRow?htmlspecialchars($editRow['code']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ชื่อสาเหตุ</label><input type="text" name="name" value="<?=$editRow?htmlspecialchars($editRow['name']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">คำอธิบาย</label><input type="text" name="description" value="<?=$editRow?htmlspecialchars($editRow['description']??''):''?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">หมวดหมู่</label><input type="text" name="category" value="<?=$editRow?htmlspecialchars($editRow['category']??''):''?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1"<?=$editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0"<?=$editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="flex gap-2 items-end"><button type="submit" class="btn-primary">บันทึก</button><?php if($editRow):?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif;?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th>รหัส</th><th>ชื่อ</th><th>คำอธิบาย</th><th>หมวดหมู่</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200"><?php foreach($rows as$r):?><tr class="hover:bg-gray-50"><td class="px-4 py-3 text-sm font-medium text-gray-900"><?=htmlspecialchars($r['code'])?></td><td class="px-4 py-3 text-sm"><?=htmlspecialchars($r['name'])?></td><td class="px-4 py-3 text-sm text-gray-600"><?=htmlspecialchars($r['description']??'-')?></td><td class="px-4 py-3 text-sm text-gray-600"><?=htmlspecialchars($r['category']??'-')?></td><td class="px-4 py-3 text-sm"><span class="badge <?=$r['is_active']?'status-active':'status-inactive'?>"><?=$r['is_active']?'Active':'Inactive'?></span></td><td class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?=$r['id']?>" class="text-primary-600">แก้ไข</a><a href="?delete=<?=$r['id']?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr><?php endforeach;?><?php if(empty($rows)):?><tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูล</td></tr><?php endif;?></tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
