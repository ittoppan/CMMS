<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'วันหยุด - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0); $date = $_POST['holiday_date']; $name = $_POST['name']; $recur = (int)($_POST['is_recurring'] ?? 0); $desc = $_POST['description'];
        if ($id) { $pdo->prepare('UPDATE holidays SET holiday_date=?,name=?,is_recurring=?,description=? WHERE id=?')->execute([$date,$name,$recur,$desc,$id]); $msg='updated'; }
        else { $pdo->prepare('INSERT INTO holidays (holiday_date,name,is_recurring,description) VALUES (?,?,?,?)')->execute([$date,$name,$recur,$desc]); $msg='created'; }
    } catch (Exception $e) { $msg='error: '.$e->getMessage(); }
}
$delId=(int)($_GET['delete']??0); if($delId){try{$pdo->prepare('DELETE FROM holidays WHERE id=?')->execute([$delId]);$msg='deleted';}catch(Exception$e){$msg='error: '.$e->getMessage();}}
$editId=(int)($_GET['edit']??0);$editRow=null;if($editId){$s=$pdo->prepare('SELECT*FROM holidays WHERE id=?');$s->execute([$editId]);$editRow=$s->fetch();}
$rows=$pdo->query('SELECT*FROM holidays ORDER BY holiday_date DESC')->fetchAll(); ?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">วันหยุด</h1><p class="mt-1 text-sm text-gray-500">Holidays</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg):?><div class="<?=str_starts_with($msg,'error')?'bg-red-50 text-red-700':'bg-green-50 text-green-700'?> text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <div class="card p-4"><h2 class="text-lg font-semibold mb-3"><?=$editRow?'แก้ไข':'เพิ่ม'?>วันหยุด</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3"><?php if($editRow):?><input type="hidden" name="id" value="<?=$editRow['id']?>"><?php endif;?>
            <div><label class="block text-xs font-medium text-gray-600">วันที่</label><input type="date" name="holiday_date" value="<?=$editRow?$editRow['holiday_date']:''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ชื่อวันหยุด</label><input type="text" name="name" value="<?=$editRow?htmlspecialchars($editRow['name']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">เกิดขึ้นทุกปี</label><select name="is_recurring" class="input input-bordered w-full mt-1"><option value="0" <?=$editRow&&$editRow['is_recurring']?:'selected'?>>ไม่</option><option value="1" <?=$editRow&&$editRow['is_recurring']?'selected':''?>>ใช่</option></select></div>
            <div><label class="block text-xs font-medium text-gray-600">คำอธิบาย</label><input type="text" name="description" value="<?=$editRow?htmlspecialchars($editRow['description']??''):''?>" class="input input-bordered w-full mt-1"></div>
            <div class="flex gap-2 items-end"><button type="submit" class="btn-primary">บันทึก</button><?php if($editRow):?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif;?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th>วันที่</th><th>ชื่อ</th><th>ทุกปี</th><th>คำอธิบาย</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200"><?php foreach($rows as$r):?><tr class="hover:bg-gray-50"><td class="px-4 py-3 text-sm"><?=$r['holiday_date']?></td><td class="px-4 py-3 text-sm font-medium"><?=htmlspecialchars($r['name'])?></td><td class="px-4 py-3 text-sm"><?=$r['is_recurring']?'ใช่':'ไม่'?></td><td class="px-4 py-3 text-sm text-gray-600"><?=htmlspecialchars($r['description']??'-')?></td><td class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?=$r['id']?>" class="text-primary-600">แก้ไข</a><a href="?delete=<?=$r['id']?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr><?php endforeach;?><?php if(empty($rows)):?><tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูล</td></tr><?php endif;?></tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
