<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle='แก้ไขคู่มือ - CMMS-TPT';
$pdo=getDb(); $id=(int)($_GET['id']??0);
$row=$pdo->prepare('SELECT * FROM manuals WHERE id=?'); $row->execute([$id]); $row=$row->fetch();
if(!$row){header('Location: index.php');exit;}
$assets=$pdo->query('SELECT id,code,name FROM asset_registry ORDER BY name')->fetchAll();
$error='';$success='';
if($_SERVER['REQUEST_METHOD']==='POST'){
    try{
        $toNull=fn($v)=>($v??'')===''?null:$v;
        $filePath=$row['file_path'];
        if(!empty($_FILES['file']['name'])&&$_FILES['file']['error']===UPLOAD_ERR_OK){
            $dir=__DIR__.'/../../../public/uploads/manuals/';
            if(!is_dir($dir))mkdir($dir,0755,true);
            $ext=pathinfo($_FILES['file']['name'],PATHINFO_EXTENSION);
            $fileName=uniqid('manual_').'.'.$ext;
            move_uploaded_file($_FILES['file']['tmp_name'],$dir.$fileName);
            $filePath='/uploads/manuals/'.$fileName;
        }
        $pdo->prepare('UPDATE manuals SET asset_id=?,title=?,description=?,file_path=?,file_type=?,version=? WHERE id=?')->execute([
            $_POST['asset_id']?:null,$_POST['title'],$toNull($_POST['description']),
            $filePath,$_FILES['file']['type']??$row['file_type'],$toNull($_POST['version']),$id
        ]);
        $success='บันทึกเรียบร้อย';
        $row=$pdo->prepare('SELECT * FROM manuals WHERE id=?'); $row->execute([$id]); $row=$row->fetch();
    }catch(Exception $e){$error=$e->getMessage();}
}
renderHeader();
function sel($a,$b){return $a===$b?'selected':'';} ?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6"><a href="index.php" class="text-sm text-primary-600">&larr; กลับ</a><h1 class="mt-2 text-2xl font-bold">แก้ไขคู่มือ #<?=$id?></h1></div>
    <?php if($error):?><div class="bg-red-50 text-red-700 text-sm rounded p-3 mb-4"><?=htmlspecialchars($error)?></div><?php endif;?>
    <?php if($success):?><div class="bg-green-50 text-green-700 text-sm rounded p-3 mb-4"><?=htmlspecialchars($success)?></div><?php endif;?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2"><label class="block text-sm font-medium">ชื่อเอกสาร</label><input type="text" name="title" value="<?=htmlspecialchars($row['title'])?>" required class="input input-bordered w-full mt-1"></div>
            <div class="sm:col-span-2"><label class="block text-sm font-medium">ทรัพย์สิน</label>
                <select name="asset_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach($assets as $a):?><option value="<?=$a['id']?>" <?=sel($row['asset_id'],$a['id'])?>><?=htmlspecialchars($a['code'].' - '.$a['name'])?></option><?php endforeach;?>
                </select>
            </div>
            <div class="sm:col-span-2"><label class="block text-sm font-medium">อัปโหลดไฟล์ใหม่ (เว้นว่างไว้ถ้าไม่เปลี่ยน)</label><input type="file" name="file" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">ประเภทไฟล์</label><input type="text" name="file_type" value="<?=htmlspecialchars($row['file_type']??'')?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">เวอร์ชัน</label><input type="text" name="version" value="<?=htmlspecialchars($row['version']??'')?>" class="input input-bordered w-full mt-1"></div>
        </div>
        <div><label class="block text-sm font-medium">คำอธิบาย</label><textarea name="description" rows="2" class="input input-bordered w-full mt-1"><?=htmlspecialchars($row['description']??'')?></textarea></div>
        <div class="flex gap-3"><button type="submit" class="btn-primary">บันทึก</button><a href="index.php" class="btn-secondary">ยกเลิก</a></div>
    </form>
</div>
<?php renderFooter(); ?>
