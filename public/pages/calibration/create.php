<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มรายการสอบเทียบ - CMMS-TPT';
$pdo = getDb();
$assets = $pdo->query('SELECT id, code, name FROM asset_registry WHERE status IN ("active","under_repair") ORDER BY name')->fetchAll();
$users  = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$suppliers = $pdo->query('SELECT id, code, name FROM suppliers WHERE is_active = 1 ORDER BY name')->fetchAll();
$uploadDir = __DIR__ . '/../../../uploads/calibration/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
$error = '';
$success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $certificateFile = '';
        if (!empty($_FILES['certificate_file']['name'])) {
            $ext = pathinfo($_FILES['certificate_file']['name'], PATHINFO_EXTENSION);
            $certificateFile = uniqid('cert_') . '.' . $ext;
            move_uploaded_file($_FILES['certificate_file']['tmp_name'], $uploadDir . $certificateFile);
        }
        $stmt = $pdo->prepare('INSERT INTO calibration (asset_id, performed_by, calibration_date, next_calibration_date, standard_used, result, certificate_number, certificate_file, calibration_type, total_cost, po_number, supplier_id, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $_POST['asset_id'],
            $_POST['performed_by'] ?: null,
            $_POST['calibration_date'],
            $_POST['next_calibration_date'] ?: null,
            $_POST['standard_used'] ?: null,
            $_POST['result'] ?? 'pass',
            $_POST['certificate_number'] ?: null,
            $certificateFile ?: null,
            $_POST['calibration_type'] ?? 'full',
            $_POST['total_cost'] ?: null,
            $_POST['po_number'] ?: null,
            $_POST['supplier_id'] ?: null,
            $_POST['status'] ?? 'scheduled',
            $_POST['notes'] ?: null
        ]);
        $success = 'เพิ่มรายการสอบเทียบเรียบร้อย';
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>
<div class="max-w-3xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปสอบเทียบ</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">เพิ่มรายการสอบเทียบ</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
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
                <label class="block text-sm font-medium text-secondary">วันที่สอบเทียบ <span class="text-red-500">*</span></label>
                <input type="date" name="calibration_date" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สอบเทียบครั้งถัดไป</label>
                <input type="date" name="next_calibration_date" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ประเภทการสอบเทียบ</label>
                <select name="calibration_type" class="input input-bordered w-full mt-1">
                    <option value="full">เต็มรูปแบบ (Full)</option>
                    <option value="abbreviated">แบบย่อ (Abbreviated)</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ผลลัพธ์</label>
                <select name="result" class="input input-bordered w-full mt-1">
                    <option value="pass">ผ่าน</option>
                    <option value="fail">ไม่ผ่าน</option>
                    <option value="conditional">มีเงื่อนไข</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานะ</label>
                <select name="status" class="input input-bordered w-full mt-1">
                    <option value="scheduled">รอดำเนินการ</option>
                    <option value="in_progress">กำลังดำเนินการ</option>
                    <option value="completed">เสร็จสิ้น</option>
                    <option value="overdue">เกินกำหนด</option>
                    <option value="cancelled">ยกเลิก</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">มาตรฐานที่ใช้</label>
                <input type="text" name="standard_used" class="input input-bordered w-full mt-1" placeholder="Gauge Block Class 1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">เลขที่ใบรับรอง</label>
                <input type="text" name="certificate_number" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ต้นทุนรวม (บาท)</label>
                <input type="number" name="total_cost" step="0.01" class="input input-bordered w-full mt-1" placeholder="0.00">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">เลขที่ PO</label>
                <input type="text" name="po_number" class="input input-bordered w-full mt-1" placeholder="PO-XXXX">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ผู้จำหน่าย</label>
                <select name="supplier_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($suppliers as $s): ?>
                    <option value="<?= $s['id'] ?>"><?= htmlspecialchars($s['code'] . ' - ' . $s['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ผู้ดำเนินการ</label>
                <select name="performed_by" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>"><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ไฟล์ใบรับรอง</label>
                <input type="file" name="certificate_file" accept=".pdf,.jpg,.jpeg,.png" class="input input-bordered w-full mt-1">
                <p class="text-xs text-muted mt-1">PDF, JPG, PNG เท่านั้น</p>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-secondary">หมายเหตุ</label>
            <textarea name="notes" rows="2" class="input input-bordered w-full mt-1"></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
