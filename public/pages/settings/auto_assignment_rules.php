<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'กฎการมอบหมายงานอัตโนมัติ - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0); $mod = $_POST['module']; $name = $_POST['rule_name']; $ct = $_POST['criteria_type']; $cv = (int)$_POST['criteria_value']; $aid = (int)$_POST['assignee_id']; $pri = (int)($_POST['priority'] ?? 0); $active = (int)($_POST['is_active'] ?? 1);
        if ($id) { $pdo->prepare('UPDATE auto_assignment_rules SET module=?,rule_name=?,criteria_type=?,criteria_value=?,assignee_id=?,priority=?,is_active=? WHERE id=?')->execute([$mod,$name,$ct,$cv,$aid,$pri,$active,$id]); $msg='updated'; }
        else { $pdo->prepare('INSERT INTO auto_assignment_rules (module,rule_name,criteria_type,criteria_value,assignee_id,priority,is_active) VALUES (?,?,?,?,?,?,?)')->execute([$mod,$name,$ct,$cv,$aid,$pri,$active]); $msg='created'; }
    } catch (Exception $e) { $msg='error: '.$e->getMessage(); }
}
$delId=(int)($_GET['delete']??0); if($delId){try{$pdo->prepare('DELETE FROM auto_assignment_rules WHERE id=?')->execute([$delId]);$msg='deleted';}catch(Exception$e){$msg='error: '.$e->getMessage();}}
$editId=(int)($_GET['edit']??0);$editRow=null;if($editId){$s=$pdo->prepare('SELECT*FROM auto_assignment_rules WHERE id=?');$s->execute([$editId]);$editRow=$s->fetch();}
$rows=$pdo->query('SELECT r.*, u.full_name assignee_name FROM auto_assignment_rules r LEFT JOIN users u ON r.assignee_id=u.id ORDER BY r.module, r.priority')->fetchAll();
$users=$pdo->query('SELECT id, full_name FROM users ORDER BY full_name')->fetchAll(); ?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">กฎการมอบหมายงานอัตโนมัติ</h1><p class="mt-1 text-sm text-gray-500">Auto Assignment Rules</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg):?><div class="<?= str_starts_with($msg,'error') ? 'cmms-banner error' : 'cmms-banner success' ?>"text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <div class="card p-4"><h2 class="text-lg font-semibold mb-3"><?=$editRow?'แก้ไข':'เพิ่ม'?>กฎ</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3"><?php if($editRow):?><input type="hidden" name="id" value="<?=$editRow['id']?>"><?php endif;?>
            <div><label class="block text-xs font-medium text-gray-600">โมดูล</label><select name="module" class="input input-bordered w-full mt-1"><option value="repair" <?=$editRow&&$editRow['module']==='repair'?'selected':''?>>Repair</option><option value="pm_am" <?=$editRow&&$editRow['module']==='pm_am'?'selected':''?>>PM/AM</option><option value="calibration" <?=$editRow&&$editRow['module']==='calibration'?'selected':''?>>Calibration</option></select></div>
            <div><label class="block text-xs font-medium text-gray-600">ชื่อกฎ</label><input type="text" name="rule_name" value="<?=$editRow?htmlspecialchars($editRow['rule_name']):''?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ประเภทเงื่อนไข</label><select name="criteria_type" class="input input-bordered w-full mt-1"><?php foreach(['location','asset_type','asset','checklist_template','plan','department','work_zone'] as$c):?><option value="<?=$c?>" <?=$editRow&&$editRow['criteria_type']===$c?'selected':''?>><?=$c?></option><?php endforeach;?></select></div>
            <div><label class="block text-xs font-medium text-gray-600">ค่าเงื่อนไข (ID)</label><input type="number" name="criteria_value" value="<?=$editRow?$editRow['criteria_value']:'0'?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">ผู้รับมอบหมาย</label><select name="assignee_id" class="input input-bordered w-full mt-1"><?php foreach($users as$u):?><option value="<?=$u['id']?>" <?=$editRow&&$editRow['assignee_id']==$u['id']?'selected':''?>><?=htmlspecialchars($u['full_name'])?></option><?php endforeach;?></select></div>
            <div><label class="block text-xs font-medium text-gray-600">ลำดับความสำคัญ</label><input type="number" name="priority" value="<?=$editRow?$editRow['priority']:'0'?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-gray-600">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1"<?=$editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0"<?=$editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="flex gap-2 items-end"><button type="submit" class="btn-primary">บันทึก</button><?php if($editRow):?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif;?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table"><thead class="bg-gray-50"><tr><th>โมดูล</th><th>ชื่อกฎ</th><th>เงื่อนไข</th><th>ผู้รับมอบหมาย</th><th>ลำดับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-gray-200"><?php foreach($rows as$r):?><tr class="hover:bg-gray-50"><td data-label="โมดูล" class="px-4 py-3 text-sm"><?=$r['module']?></td><td data-label="ชื่อกฎ" class="px-4 py-3 text-sm font-medium"><?=htmlspecialchars($r['rule_name'])?></td><td data-label="เงื่อนไข" class="px-4 py-3 text-sm"><?=$r['criteria_type']?> #<?=$r['criteria_value']?></td><td data-label="ผู้รับมอบหมาย" class="px-4 py-3 text-sm"><?=htmlspecialchars($r['assignee_name']??'-')?></td><td data-label="ลำดับ" class="px-4 py-3 text-sm"><?=$r['priority']?></td><td data-label="สถานะ" class="px-4 py-3 text-sm"><span class="badge <?=$r['is_active']?'status-active':'status-inactive'?>"><?=$r['is_active']?'Active':'Inactive'?></span></td><td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?=$r['id']?>" class="text-primary-600">แก้ไข</a><a href="?delete=<?=$r['id']?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr><?php endforeach;?><?php if(empty($rows)):?><tr><td colspan="7" class="cmms-empty-state-cell">ไม่มีข้อมูล</td></tr><?php endif;?></tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
