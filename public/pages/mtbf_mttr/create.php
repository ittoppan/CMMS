<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มข้อมูล MTBF/MTTR - CMMS-TPT';
$pdo = getDb();
$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $operating = (float)($_POST['operating_hours'] ?? 0);
        $failures  = (int)($_POST['total_failures'] ?? 0);
        $downtime  = (int)($_POST['total_downtime_minutes'] ?? 0);
        $mtbf = $failures > 0 ? round($operating / $failures, 2) : null;
        $mttr = $failures > 0 ? round($downtime / $failures, 2) : null;

        $stmt = $pdo->prepare('INSERT INTO mtbf_mttr (asset_id, year, month, operating_hours, total_failures, total_downtime_minutes, mtbf_hours, mttr_minutes) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$_POST['asset_id'], $_POST['year'], $_POST['month'], $operating, $failures, $downtime, $mtbf, $mttr]);
        $success = 'เพิ่มข้อมูล MTBF/MTTR เรียบร้อย';
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไป MTBF/MTTR</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">เพิ่มข้อมูล MTBF/MTTR</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-secondary">ทรัพย์สิน <span class="text-red-500">*</span></label>
                <select name="asset_id" required class="input input-bordered w-full mt-1">
                    <option value="">-- เลือกทรัพย์สิน --</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>"><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ปี <span class="text-red-500">*</span></label>
                <input type="number" name="year" value="<?= date('Y') ?>" min="2000" max="2099" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">เดือน <span class="text-red-500">*</span></label>
                <input type="number" name="month" value="<?= date('n') ?>" min="1" max="12" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ชั่วโมงทำงาน</label>
                <input type="number" name="operating_hours" step="0.5" class="input input-bordered w-full mt-1" value="0">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">จำนวนครั้งที่เสีย</label>
                <input type="number" name="total_failures" min="0" class="input input-bordered w-full mt-1" value="0">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">Downtime (นาที)</label>
                <input type="number" name="total_downtime_minutes" min="0" class="input input-bordered w-full mt-1" value="0">
            </div>
        </div>
        <div class="bg-subtle rounded-md p-4 text-sm text-secondary">
            MTBF และ MTTR จะคำนวณอัตโนมัติเมื่อบันทึก (MTBF = ชม.ทำงาน/จำนวนครั้งเสีย, MTTR = Downtime นาที/จำนวนครั้งเสีย)
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
