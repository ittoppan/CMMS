<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ตั้งค่าการสอบเทียบ - CMMS-TPT';
renderHeader();
$pdo = getDb(); $msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        foreach ($_POST['settings'] as $key => $value) {
            $pdo->prepare('UPDATE settings SET setting_value=? WHERE setting_key=?')->execute([$value, $key]);
        }
        $msg = 'success';
    } catch (Exception $e) { $msg = 'error: '.$e->getMessage(); }
}
$stmt = $pdo->prepare('SELECT * FROM settings WHERE setting_group=? ORDER BY setting_key');
$stmt->execute(['calibration_config']);
$settings = $stmt->fetchAll(); ?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gray-900">ตั้งค่าการสอบเทียบ</h1><p class="mt-1 text-sm text-gray-500">Calibration Config</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if($msg==='success'):?><div class="bg-green-50 text-green-700 text-sm rounded p-3">บันทึกเรียบร้อย</div><?php elseif(str_starts_with($msg,'error')):?><div class="bg-red-50 text-red-700 text-sm rounded p-3"><?=htmlspecialchars($msg)?></div><?php endif;?>
    <form method="post" class="card p-6 space-y-4">
        <?php foreach($settings as$s):?>
        <div><label class="block text-sm font-medium text-gray-700"><?=htmlspecialchars($s['setting_key'])?></label>
            <input type="text" name="settings[<?=htmlspecialchars($s['setting_key'])?>]" value="<?=htmlspecialchars($s['setting_value']??'')?>" class="input input-bordered w-full mt-1 w-full max-w-lg">
            <?php if($s['description']):?><p class="text-xs text-gray-500 mt-1"><?=htmlspecialchars($s['description'])?></p><?php endif;?>
        </div>
        <?php endforeach;?>
        <button type="submit" class="btn-primary">บันทึกทั้งหมด</button>
    </form>
</div>
<?php renderFooter(); ?>
