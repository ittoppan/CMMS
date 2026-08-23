<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขสอบเทียบ - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$row = $pdo->prepare('SELECT * FROM calibration WHERE id=?'); $row->execute([$id]); $row = $row->fetch();
if (!$row) { header('Location: index.php'); exit; }
$assets = $pdo->query('SELECT id,code,name FROM asset_registry WHERE status IN ("active","under_repair") ORDER BY name')->fetchAll();
$users = $pdo->query('SELECT id,full_name FROM users WHERE is_active=1 ORDER BY full_name')->fetchAll();
$suppliers = $pdo->query('SELECT id,code,name FROM suppliers WHERE is_active=1 ORDER BY name')->fetchAll();
$uploadDir = __DIR__ . '/../../../uploads/calibration/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
$error = '';
$success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $certificateFile = $row['certificate_file'];
        if (!empty($_FILES['certificate_file']['name'])) {
            if ($certificateFile && file_exists($uploadDir . $certificateFile)) unlink($uploadDir . $certificateFile);
            $ext = pathinfo($_FILES['certificate_file']['name'], PATHINFO_EXTENSION);
            $certificateFile = uniqid('cert_') . '.' . $ext;
            move_uploaded_file($_FILES['certificate_file']['tmp_name'], $uploadDir . $certificateFile);
        }
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $pdo->prepare('UPDATE calibration SET asset_id=?,performed_by=?,calibration_date=?,next_calibration_date=?,standard_used=?,result=?,certificate_number=?,certificate_file=?,calibration_type=?,total_cost=?,po_number=?,supplier_id=?,status=?,notes=? WHERE id=?')->execute([
            $_POST['asset_id'],
            $toNull($_POST['performed_by']),
            $_POST['calibration_date'],
            $toNull($_POST['next_calibration_date']),
            $toNull($_POST['standard_used']),
            $_POST['result'] ?? 'pass',
            $toNull($_POST['certificate_number']),
            $certificateFile,
            $_POST['calibration_type'] ?? 'full',
            $toNull($_POST['total_cost']),
            $toNull($_POST['po_number']),
            $toNull($_POST['supplier_id']),
            $_POST['status'] ?? 'scheduled',
            $toNull($_POST['notes']),
            $id
        ]);
        $success = 'บันทึกเรียบร้อย';
        $row = $pdo->prepare('SELECT * FROM calibration WHERE id=?'); $row->execute([$id]); $row = $row->fetch();
    } catch (Exception $e) { $error = $e->getMessage(); }
}
renderHeader();
function sel($a, $b) { return $a === $b ? 'selected' : ''; }
?>
<div class="max-w-3xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">แก้ไขรายการสอบเทียบ #<?= $id ?></h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">ทรัพย์สิน <span class="text-red-500">*</span></label>
                <select name="asset_id" required class="input input-bordered w-full mt-1">
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= sel($row['asset_id'], $a['id']) ?>><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">วันที่สอบเทียบ <span class="text-red-500">*</span></label>
                <input type="date" name="calibration_date" value="<?= $row['calibration_date'] ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สอบเทียบครั้งถัดไป</label>
                <input type="date" name="next_calibration_date" value="<?= $row['next_calibration_date'] ?? '' ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ประเภทการสอบเทียบ</label>
                <select name="calibration_type" class="input input-bordered w-full mt-1">
                    <option value="full" <?= sel($row['calibration_type'], 'full') ?>>เต็มรูปแบบ (Full)</option>
                    <option value="abbreviated" <?= sel($row['calibration_type'], 'abbreviated') ?>>แบบย่อ (Abbreviated)</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ผลลัพธ์</label>
                <select name="result" class="input input-bordered w-full mt-1">
                    <?php foreach (['pass' => 'ผ่าน', 'fail' => 'ไม่ผ่าน', 'conditional' => 'มีเงื่อนไข'] as $k => $v): ?>
                    <option value="<?= $k ?>" <?= sel($row['result'], $k) ?>><?= $v ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานะ</label>
                <select name="status" class="input input-bordered w-full mt-1">
                    <?php $sl = ['scheduled' => 'รอดำเนินการ', 'in_progress' => 'กำลังดำเนินการ', 'completed' => 'เสร็จสิ้น', 'overdue' => 'เกินกำหนด', 'cancelled' => 'ยกเลิก']; ?>
                    <?php foreach ($sl as $k => $v): ?>
                    <option value="<?= $k ?>" <?= sel($row['status'], $k) ?>><?= $v ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">มาตรฐานที่ใช้</label>
                <input type="text" name="standard_used" value="<?= htmlspecialchars($row['standard_used'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">เลขที่ใบรับรอง</label>
                <input type="text" name="certificate_number" value="<?= htmlspecialchars($row['certificate_number'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ต้นทุนรวม (บาท)</label>
                <input type="number" name="total_cost" step="0.01" value="<?= htmlspecialchars($row['total_cost'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">เลขที่ PO</label>
                <input type="text" name="po_number" value="<?= htmlspecialchars($row['po_number'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ผู้จำหน่าย</label>
                <select name="supplier_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($suppliers as $s): ?>
                    <option value="<?= $s['id'] ?>" <?= sel($row['supplier_id'], $s['id']) ?>><?= htmlspecialchars($s['code'] . ' - ' . $s['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ผู้ดำเนินการ</label>
                <select name="performed_by" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>" <?= sel($row['performed_by'], $u['id']) ?>><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ไฟล์ใบรับรอง</label>
                <input type="file" name="certificate_file" accept=".pdf,.jpg,.jpeg,.png" class="input input-bordered w-full mt-1">
                <?php if ($row['certificate_file']): ?>
                <p class="text-xs text-gray-500 mt-1">ไฟล์ปัจจุบัน: <?= htmlspecialchars($row['certificate_file']) ?></p>
                <?php endif; ?>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <textarea name="notes" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['notes'] ?? '') ?></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
