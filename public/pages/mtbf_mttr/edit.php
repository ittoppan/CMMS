<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle='แก้ไข MTBF/MTTR - CMMS-TPT';
$pdo=getDb(); $id=(int)($_GET['id']??0);
$row=$pdo->prepare('SELECT * FROM mtbf_mttr WHERE id=?'); $row->execute([$id]); $row=$row->fetch();
if(!$row){header('Location: index.php');exit;}
$assets=$pdo->query('SELECT id,code,name FROM asset_registry ORDER BY name')->fetchAll();
$error='';$success='';
if($_SERVER['REQUEST_METHOD']==='POST'){
    try{
        $operating=(float)($_POST['operating_hours']??0); $failures=(int)($_POST['total_failures']??0); $downtime=(int)($_POST['total_downtime_minutes']??0);
        $mtbf=$failures>0?round($operating/$failures,2):null; $mttr=$failures>0?round($downtime/$failures,2):null;
        $pdo->prepare('UPDATE mtbf_mttr SET asset_id=?,year=?,month=?,operating_hours=?,total_failures=?,total_downtime_minutes=?,mtbf_hours=?,mttr_minutes=? WHERE id=?')->execute([
            $_POST['asset_id'],$_POST['year'],$_POST['month'],$operating,$failures,$downtime,$mtbf,$mttr,$id
        ]);
        $success='บันทึกเรียบร้อย';
        $row=$pdo->prepare('SELECT * FROM mtbf_mttr WHERE id=?'); $row->execute([$id]); $row=$row->fetch();
    }catch(Exception $e){$error=$e->getMessage();}
}
renderHeader();
function sel($a,$b){return $a===$b?'selected':'';} ?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6"><a href="index.php" class="text-sm text-primary-600">&larr; กลับ</a><h1 class="mt-2 text-2xl font-bold">แก้ไข MTBF/MTTR #<?=$id?></h1></div>
    <?php if($error):?><div class="bg-red-50 text-red-700 text-sm rounded p-3 mb-4"><?=htmlspecialchars($error)?></div><?php endif;?>
    <?php if($success):?><div class="bg-green-50 text-green-700 text-sm rounded p-3 mb-4"><?=htmlspecialchars($success)?></div><?php endif;?>
    <form method="post" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2"><label class="block text-sm font-medium">ทรัพย์สิน</label>
                <select name="asset_id" required class="input input-bordered w-full mt-1">
                    <?php foreach($assets as $a):?><option value="<?=$a['id']?>" <?=sel($row['asset_id'],$a['id'])?>><?=htmlspecialchars($a['code'].' - '.$a['name'])?></option><?php endforeach;?>
                </select>
            </div>
            <div><label class="block text-sm font-medium">ปี</label><input type="number" name="year" value="<?=$row['year']?>" min="2000" max="2099" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">เดือน</label><input type="number" name="month" value="<?=$row['month']?>" min="1" max="12" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">ชั่วโมงทำงาน</label><input type="number" name="operating_hours" step="0.5" value="<?=$row['operating_hours']?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">จำนวนครั้งเสีย</label><input type="number" name="total_failures" min="0" value="<?=$row['total_failures']?>" class="input input-bordered w-full mt-1"></div>
            <div><label class="block text-sm font-medium">Downtime (นาที)</label><input type="number" name="total_downtime_minutes" min="0" value="<?=$row['total_downtime_minutes']?>" class="input input-bordered w-full mt-1"></div>
        </div>
        <div class="bg-gray-50 rounded-md p-4 text-sm text-gray-600">MTBF = ชม.ทำงาน/จำนวนครั้งเสีย, MTTR = นาที Downtime/จำนวนครั้งเสีย</div>
        <div class="flex gap-3"><button type="submit" class="btn-primary">บันทึก</button><a href="index.php" class="btn-secondary">ยกเลิก</a></div>
    </form>
</div>
<?php renderFooter(); ?>
