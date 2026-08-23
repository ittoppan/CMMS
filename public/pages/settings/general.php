<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ตั้งค่าทั่วไป - CMMS-TPT';
renderHeader();
$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        foreach ($_POST['settings'] as $key => $value) {
            $stmt = $pdo->prepare('UPDATE settings SET setting_value=? WHERE setting_key=?');
            $stmt->execute([$value, $key]);
        }
        $msg = 'success';
    } catch (Exception $e) { $msg = 'error: ' . $e->getMessage(); }
}

$groups = ['general', 'company'];
$settings = [];
foreach ($groups as $g) {
    $stmt = $pdo->prepare('SELECT * FROM settings WHERE setting_group=? ORDER BY setting_key');
    $stmt->execute([$g]);
    $settings[$g] = $stmt->fetchAll();
}
?>
<div class="space-y-4">
    <div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-primary">ตั้งค่าทั่วไป</h1><p class="mt-1 text-sm text-muted">General Settings</p></div><a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a></div>
    <?php if ($msg === 'success'): ?><div class="cmms-banner success text-sm rounded-md p-3">บันทึกเรียบร้อย</div><?php endif; ?>
    <?php if (str_starts_with($msg, 'error:')): ?><div class="cmms-banner error text-sm rounded-md p-3"><?= htmlspecialchars($msg) ?></div><?php endif; ?>
    <form method="post">
        <?php foreach ($settings as $group => $items): ?>
        <div class="card p-6 mb-4">
            <h2 class="text-lg font-semibold text-primary mb-4 capitalize"><?= $group === 'general' ? 'ทั่วไป' : 'บริษัท' ?></h2>
            <div class="space-y-4">
                <?php foreach ($items as $s): ?>
                <div>
                    <label class="block text-sm font-medium text-secondary"><?= htmlspecialchars($s['setting_key']) ?></label>
                    <input type="text" name="settings[<?= htmlspecialchars($s['setting_key']) ?>]" value="<?= htmlspecialchars($s['setting_value'] ?? '') ?>" class="input input-bordered w-full mt-1 w-full max-w-lg">
                    <?php if ($s['description']): ?><p class="text-xs text-muted mt-1"><?= htmlspecialchars($s['description']) ?></p><?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endforeach; ?>
        <div class="flex gap-3"><button type="submit" class="btn-primary">บันทึกทั้งหมด</button></div>
    </form>
</div>
<?php renderFooter(); ?>
