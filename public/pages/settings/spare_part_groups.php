<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'กลุ่มอะไหล่ - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['add_item']) && !isset($_POST['del_item'])) {
    try {
        $id = (int)($_POST['id'] ?? 0); $code = $_POST['code']; $name = $_POST['name']; $desc = $_POST['description']; $active = (int)($_POST['is_active'] ?? 1);
        if ($id) { $pdo->prepare('UPDATE spare_part_groups SET code=?,name=?,description=?,is_active=? WHERE id=?')->execute([$code,$name,$desc,$active,$id]); $msg='updated'; }
        else { $pdo->prepare('INSERT INTO spare_part_groups (code,name,description,is_active) VALUES (?,?,?,?)')->execute([$code,$name,$desc,$active]); $msg='created'; }
    } catch (Exception $e) { $msg='error: '.$e->getMessage(); }
}
$delId=(int)($_GET['delete']??0); if($delId){try{$pdo->prepare('DELETE FROM spare_part_groups WHERE id=?')->execute([$delId]);$msg='deleted';}catch(Exception$e){$msg='error: '.$e->getMessage();}}
$editId=(int)($_GET['edit']??0);$editRow=null;if($editId){$s=$pdo->prepare('SELECT*FROM spare_part_groups WHERE id=?');$s->execute([$editId]);$editRow=$s->fetch();}
$rows=$pdo->query('SELECT*FROM spare_part_groups ORDER BY code')->fetchAll();

// Item management
$itemMsg = '';
$gid = (int)($_GET['gid'] ?? 0);
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_item'])) {
    try { $gid=(int)$_POST['gid']; $pid=(int)$_POST['spare_part_id'];
        $pdo->prepare('INSERT IGNORE INTO spare_part_group_items (group_id,spare_part_id) VALUES (?,?)')->execute([$gid,$pid]);
        $itemMsg='added'; } catch(Exception $e) { $itemMsg='error: '.$e->getMessage(); }
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['del_item'])) {
    try { $pdo->prepare('DELETE FROM spare_part_group_items WHERE group_id=? AND spare_part_id=?')->execute([(int)$_POST['gid'],(int)$_POST['spare_part_id']]); $itemMsg='removed'; } catch(Exception $e) { $itemMsg='error: '.$e->getMessage(); }
}
$items = []; $availParts = [];
if ($gid) {
    $s=$pdo->prepare('SELECT sp.id, sp.code, sp.name FROM spare_part_group_items gi JOIN spare_parts sp ON gi.spare_part_id=sp.id WHERE gi.group_id=? ORDER BY sp.code'); $s->execute([$gid]); $items=$s->fetchAll();
    $availParts=$pdo->query('SELECT id, code, name FROM spare_parts ORDER BY code')->fetchAll();
}
?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">กลุ่มอะไหล่</h1><p class="mt-1 text-sm text-gray-500">Spare Part Groups</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg):?><div class="<?=str_starts_with($msg,'error')?'bg-red-50 text-red-700':'bg-green-50 text-green-700'?> text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <div class="card p-4"><h2 class="text-lg font-semibold mb-3"><?=$editRow?'แก้ไข':'เพิ่ม'?>กลุ่มอะไหล่</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3"><?php if($editRow):?><input type="hidden" name="id" value="<?=$editRow['id']?>"><?php endif;?>
            <div><label class="block text-xs font-medium text-gray-600">รหัสกลุ่ม</label><input type="text" name="code" value="<?=$editRow?htmlspecialchars($editRow['code']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ชื่อกลุ่ม</label><input type="text" name="name" value="<?=$editRow?htmlspecialchars($editRow['name']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">คำอธิบาย</label><input type="text" name="description" value="<?=$editRow?htmlspecialchars($editRow['description']??''):''?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1"<?=$editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0"<?=$editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="flex gap-2 items-end"><button type="submit" class="btn-primary">บันทึก</button><?php if($editRow):?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif;?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th>รหัส</th><th>ชื่อ</th><th>คำอธิบาย</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200"><?php foreach($rows as$r):?><tr class="hover:bg-gray-50"><td class="px-4 py-3 text-sm font-medium"><?=htmlspecialchars($r['code'])?></td><td class="px-4 py-3 text-sm"><a href="?gid=<?=$r['id']?>" class="text-primary-600 hover:underline"><?=htmlspecialchars($r['name'])?></a></td><td class="px-4 py-3 text-sm text-gray-600"><?=htmlspecialchars($r['description']??'-')?></td><td class="px-4 py-3 text-sm"><span class="badge <?=$r['is_active']?'status-active':'status-inactive'?>"><?=$r['is_active']?'Active':'Inactive'?></span></td><td class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?=$r['id']?>" class="text-primary-600">แก้ไข</a><a href="?delete=<?=$r['id']?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr><?php endforeach;?><?php if(empty($rows)):?><tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูล</td></tr><?php endif;?></tbody>
        </table>
    </div>
    <?php if ($gid): $grp=$pdo->prepare('SELECT * FROM spare_part_groups WHERE id=?'); $grp->execute([$gid]); $grp=$grp->fetch(); if ($grp): ?>
    <div class="card p-4">
        <div class="flex items-center justify-between mb-3"><h3 class="text-lg font-semibold">อะไหล่ในกลุ่ม: <?=htmlspecialchars($grp['name'])?></h3><a href="?" class="text-sm text-primary-600">ปิด</a></div>
        <?php if($itemMsg):?><div class="<?=str_starts_with($itemMsg,'error')?'bg-red-50 text-red-700':'bg-green-50 text-green-700'?> text-sm rounded p-2 mb-3"><?=htmlspecialchars($itemMsg)?></div><?php endif;?>
        <form method="post" class="flex gap-2 items-end mb-4">
            <input type="hidden" name="add_item" value="1"><input type="hidden" name="gid" value="<?=$gid?>">
            <div><label class="block text-xs font-medium">เพิ่มอะไหล่</label><select name="spare_part_id" class="input input-bordered w-full mt-1"><?php foreach($availParts as$p):?><option value="<?=$p['id']?>"><?=htmlspecialchars($p['code'].' - '.$p['name'])?></option><?php endforeach;?></select></div>
            <button type="submit" class="btn-primary text-sm px-3 py-2">เพิ่ม</button>
        </form>
        <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th>รหัสอะไหล่</th><th>ชื่อ</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200"><?php foreach($items as$i):?><tr class="hover:bg-gray-50"><td class="px-4 py-2 text-sm"><?=htmlspecialchars($i['code'])?></td><td class="px-4 py-2 text-sm"><?=htmlspecialchars($i['name'])?></td><td class="px-4 py-2 text-sm"><form method="post" class="inline"><input type="hidden" name="del_item" value="1"><input type="hidden" name="gid" value="<?=$gid?>"><input type="hidden" name="spare_part_id" value="<?=$i['id']?>"><button type="submit" class="text-red-600 text-sm" onclick="return confirm('ลบรายการนี้?')">ลบ</button></form></td></tr><?php endforeach;?><?php if(empty($items)):?><tr><td colspan="3" class="px-4 py-4 text-center text-gray-500">ยังไม่มีอะไหล่ในกลุ่มนี้</td></tr><?php endif;?></tbody>
        </table>
    </div>
    <?php endif; endif; ?>
</div>
<?php renderFooter(); ?>
