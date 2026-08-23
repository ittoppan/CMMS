<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'การแจ้งเตือนทางอีเมล - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id = (int)($_POST['id'] ?? 0); $module = $_POST['module']; $event = $_POST['event']; $subj = $_POST['subject']; $body = $_POST['template_body']; $recip = $_POST['recipients']; $active = (int)($_POST['is_active'] ?? 1);
        if ($id) { $pdo->prepare('UPDATE email_notifications SET module=?,event=?,subject=?,template_body=?,recipients=?,is_active=? WHERE id=?')->execute([$module,$event,$subj,$body,$recip,$active,$id]); $msg='updated'; }
        else { $pdo->prepare('INSERT INTO email_notifications (module,event,subject,template_body,recipients,is_active) VALUES (?,?,?,?,?,?)')->execute([$module,$event,$subj,$body,$recip,$active]); $msg='created'; }
    } catch (Exception $e) { $msg='error: '.$e->getMessage(); }
}
$delId=(int)($_GET['delete']??0); if($delId){try{$pdo->prepare('DELETE FROM email_notifications WHERE id=?')->execute([$delId]);$msg='deleted';}catch(Exception$e){$msg='error: '.$e->getMessage();}}
$editId=(int)($_GET['edit']??0);$editRow=null;if($editId){$s=$pdo->prepare('SELECT*FROM email_notifications WHERE id=?');$s->execute([$editId]);$editRow=$s->fetch();}
$rows=$pdo->query('SELECT*FROM email_notifications ORDER BY module, event')->fetchAll(); ?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-primary">การแจ้งเตือนทางอีเมล</h1><p class="mt-1 text-sm text-muted">Email Notifications</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg):?><div class="<?= str_starts_with($msg,'error') ? 'cmms-banner error' : 'cmms-banner success' ?>"text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <div class="card p-4"><h2 class="text-lg font-semibold mb-3"><?=$editRow?'แก้ไข':'เพิ่ม'?>การแจ้งเตือน</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-2 gap-3"><?php if($editRow):?><input type="hidden" name="id" value="<?=$editRow['id']?>"><?php endif;?>
            <div><label class="block text-xs font-medium text-secondary">โมดูล</label><select name="module" class="input input-bordered w-full mt-1"><option value="repair" <?=$editRow&&$editRow['module']==='repair'?'selected':''?>>Repair</option><option value="pm_am" <?=$editRow&&$editRow['module']==='pm_am'?'selected':''?>>PM/AM</option><option value="calibration" <?=$editRow&&$editRow['module']==='calibration'?'selected':''?>>Calibration</option></select></div>
            <div><label class="block text-xs font-medium text-secondary">เหตุการณ์</label><input type="text" name="event" value="<?=$editRow?htmlspecialchars($editRow['event']):''?>" required class="input input-bordered w-full mt-1" placeholder="e.g. repair_created"></div>
            <div><label class="block text-xs font-medium text-secondary">หัวข้ออีเมล</label><input type="text" name="subject" value="<?=$editRow?htmlspecialchars($editRow['subject']??''):''?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-xs font-medium text-secondary">ผู้รับ (comma-separated)</label><input type="text" name="recipients" value="<?=$editRow?htmlspecialchars($editRow['recipients']??''):''?>" class="input input-bordered w-full mt-1" placeholder="email หรือ role ID"></div>
            <div class="sm:col-span-2"><label class="block text-xs font-medium text-secondary">เนื้อหา (Template)</label><textarea name="template_body" rows="4" class="input input-bordered w-full mt-1 w-full"><?=$editRow?htmlspecialchars($editRow['template_body']??''):''?></textarea></div>
            <div><label class="block text-xs font-medium text-secondary">สถานะ</label><select name="is_active" class="input input-bordered w-full mt-1"><option value="1"<?=$editRow&&!$editRow['is_active']?:'selected'?>>Active</option><option value="0"<?=$editRow&&!$editRow['is_active']?'selected':''?>>Inactive</option></select></div>
            <div class="flex gap-2 items-end"><button type="submit" class="btn-primary">บันทึก</button><?php if($editRow):?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif;?></div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table"><thead class="bg-subtle"><tr><th>โมดูล</th><th>เหตุการณ์</th><th>หัวข้อ</th><th>ผู้รับ</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody class="divide-y divide-line"><?php foreach($rows as$r):?><tr class="hover:bg-subtle"><td data-label="โมดูล" class="px-4 py-3 text-sm"><?=$r['module']?></td><td data-label="เหตุการณ์" class="px-4 py-3 text-sm"><code class="bg-muted px-1 rounded text-xs"><?=htmlspecialchars($r['event'])?></code></td><td data-label="หัวข้อ" class="px-4 py-3 text-sm max-w-xs truncate"><?=htmlspecialchars($r['subject']??'-')?></td><td data-label="ผู้รับ" class="px-4 py-3 text-sm max-w-xs truncate"><?=htmlspecialchars($r['recipients']??'-')?></td><td data-label="สถานะ" class="px-4 py-3 text-sm"><span class="badge <?=$r['is_active']?'status-active':'status-inactive'?>"><?=$r['is_active']?'Active':'Inactive'?></span></td><td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2"><a href="?edit=<?=$r['id']?>" class="text-primary-600">แก้ไข</a><a href="?delete=<?=$r['id']?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td></tr><?php endforeach;?><?php if(empty($rows)):?><tr><td colspan="6" class="cmms-empty-state-cell">ไม่มีข้อมูล</td></tr><?php endif;?></tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
