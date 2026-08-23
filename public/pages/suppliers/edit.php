<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle='แก้ไขผู้จำหน่าย - CMMS-TPT';
$pdo=getDb(); $id=(int)($_GET['id']??0);
$row=$pdo->prepare('SELECT * FROM suppliers WHERE id=?'); $row->execute([$id]); $row=$row->fetch();
if(!$row){header('Location: index.php');exit;}
$error='';$success='';
if($_SERVER['REQUEST_METHOD']==='POST'){
    try{
        $pdo->prepare('UPDATE suppliers SET code=?,name=?,contact_person=?,email=?,phone=?,address=?,tax_id=?,is_active=? WHERE id=?')->execute([
            $_POST['code'],$_POST['name'],$_POST['contact_person'],$_POST['email'],$_POST['phone'],$_POST['address'],$_POST['tax_id'],$_POST['is_active']??1,$id
        ]);
        $success='บันทึกเรียบร้อย';
        $row=$pdo->prepare('SELECT * FROM suppliers WHERE id=?'); $row->execute([$id]); $row=$row->fetch();
    }catch(Exception $e){$error=$e->getMessage();}
}
renderHeader(); ?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6"><a href="index.php" class="text-sm text-primary-600">&larr; กลับ</a><h1 class="mt-2 text-2xl font-bold">แก้ไขผู้จำหน่าย</h1></div>
    <?php if($error):?><div class="cmms-banner error text-sm rounded p-3 mb-4"><?=htmlspecialchars($error)?></div><?php endif;?>
    <?php if($success):?><div class="cmms-banner success text-sm rounded p-3 mb-4"><?=htmlspecialchars($success)?></div><?php endif;?>
    <form method="post" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium">รหัสผู้จำหน่าย</label><input type="text" name="code" value="<?=htmlspecialchars($row['code'])?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">ชื่อบริษัท</label><input type="text" name="name" value="<?=htmlspecialchars($row['name'])?>" required class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">ผู้ติดต่อ</label><input type="text" name="contact_person" value="<?=htmlspecialchars($row['contact_person']??'')?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">เบอร์โทร</label><input type="text" name="phone" value="<?=htmlspecialchars($row['phone']??'')?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">อีเมล</label><input type="email" name="email" value="<?=htmlspecialchars($row['email']??'')?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">เลขประจำตัวผู้เสียภาษี</label><input type="text" name="tax_id" value="<?=htmlspecialchars($row['tax_id']??'')?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">สถานะ</label>
                <select name="is_active" class="input input-bordered w-full mt-1">
                    <option value="1" <?=$row['is_active']?'selected':''?>>Active</option>
                    <option value="0" <?=!$row['is_active']?'selected':''?>>Inactive</option>
                </select>
            </div>
        </div>
        <div><label class="block text-sm font-medium">ที่อยู่</label><textarea name="address" rows="3" class="input input-bordered w-full mt-1"><?=htmlspecialchars($row['address']??'')?></textarea></div>
        <div class="flex gap-3"><button type="submit" class="btn-primary">บันทึก</button><a href="index.php" class="btn-secondary">ยกเลิก</a></div>
    </form>
</div>
<?php renderFooter(); ?>
