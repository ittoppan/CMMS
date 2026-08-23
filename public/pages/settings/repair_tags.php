<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แท็กงานซ่อม - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0); $name = $_POST['name']; $color = $_POST['color']; $active = (int)($_POST['is_active'] ?? 1);
        if ($id) { $pdo->prepare('UPDATE repair_tags SET name=?,color=?,is_active=? WHERE id=?')->execute([$name,$color,$active,$id]); $msg='updated'; }
        else { $pdo->prepare('INSERT INTO repair_tags (name,color,is_active) VALUES (?,?,?)')->execute([$name,$color,$active]); $msg='created'; }
    } catch (Exception $e) { $msg='error: '.$e->getMessage(); }
}
$delId=(int)($_GET['delete']??0); if($delId){try{$pdo->prepare('DELETE FROM repair_tags WHERE id=?')->execute([$delId]);$msg='deleted';}catch(Exception$e){$msg='error: '.$e->getMessage();}}
$editId=(int)($_GET['edit']??0);$editRow=null;if($editId){$s=$pdo->prepare('SELECT*FROM repair_tags WHERE id=?');$s->execute([$editId]);$editRow=$s->fetch();}
$rows=$pdo->query('SELECT*FROM repair_tags ORDER BY name')->fetchAll(); ?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-primary">แท็กงานซ่อม</h1><p class="mt-1 text-sm text-muted">Repair Tags</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg):?><div class="<?= str_starts_with($msg,'error') ? 'cmms-banner error' : 'cmms-banner success' ?>"text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <div class="card p-4"><h2 class="text-lg font-semibold mb-3"><?=$editRow?'แก้ไข':'เพิ่ม'?>แท็ก</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3"><?php if($editRow):?><input type="hidden" name="id" value="<?=$editRow['id']?>"><?php endif;?>
            <div><label class="block text-xs font-medium text-secondary">ชื่อแท็ก</label><input type="text" name="name" value="<?=$editRow?htmlspecialchars($editRow['name']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-secondary">สี</label><input type="color" name="color" value="<?=$editRow?htmlspecialchars($editRow['color']):'#3B82F6'?>" class="input input-bordered w-full mt-1 h-10 w-20 p-1"></div>
            <div><label class="block text-xs font-medium text-secondary">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1"<?=$editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0"<?=$editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="flex gap-2 items-end"><button type="submit" class="btn-primary">บันทึก</button><?php if($editRow):?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif;?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table"><thead class="bg-subtle"><tr><th>ชื่อแท็ก</th><th>สี</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-line"><?php foreach($rows as$r):?><tr class="hover:bg-subtle"><td data-label="ชื่อแท็ก" class="px-4 py-3 text-sm"><?=htmlspecialchars($r['name'])?></td><td data-label="สี" class="px-4 py-3 text-sm"><span class="inline-block w-6 h-6 rounded border" style="background:<?=htmlspecialchars($r['color'])?>"></span> <?=htmlspecialchars($r['color'])?></td><td data-label="สถานะ" class="px-4 py-3 text-sm"><span class="badge <?=$r['is_active']?'status-active':'status-inactive'?>"><?=$r['is_active']?'Active':'Inactive'?></span></td><td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?=$r['id']?>" class="text-primary-600">แก้ไข</a><a href="?delete=<?=$r['id']?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr><?php endforeach;?><?php if(empty($rows)):?><tr><td colspan="4" class="cmms-empty-state-cell">ไม่มีข้อมูล</td></tr><?php endif;?></tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
