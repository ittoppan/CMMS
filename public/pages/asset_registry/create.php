<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มทรัพย์สิน - CMMS-TPT';
$pdo = getDb();

$users       = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$departments = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
$locations   = $pdo->query('SELECT id, code, name FROM locations ORDER BY name')->fetchAll();
$workZones   = $pdo->query('SELECT id, code, name FROM work_zones ORDER BY name')->fetchAll();

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;

        // Handle image upload
        $imagePath = null;
        if (!empty($_FILES['image_file']['name'])) {
            $upDir = __DIR__ . '/../../../uploads/assets/';
            if (!is_dir($upDir)) mkdir($upDir, 0775, true);
            $ext = pathinfo($_FILES['image_file']['name'], PATHINFO_EXTENSION);
            $fname = uniqid('asset_') . '.' . $ext;
            move_uploaded_file($_FILES['image_file']['tmp_name'], $upDir . $fname);
            $imagePath = 'uploads/assets/' . $fname;
        }

        // Handle manual upload
        $manualPath = null;
        if (!empty($_FILES['instruction_manual']['name'])) {
            $manDir = __DIR__ . '/../../../uploads/manuals/';
            if (!is_dir($manDir)) mkdir($manDir, 0775, true);
            $ext2 = pathinfo($_FILES['instruction_manual']['name'], PATHINFO_EXTENSION);
            $fname2 = uniqid('manual_') . '.' . $ext2;
            move_uploaded_file($_FILES['instruction_manual']['tmp_name'], $manDir . $fname2);
            $manualPath = 'uploads/manuals/' . $fname2;
        }

        $stmt = $pdo->prepare('INSERT INTO asset_registry
            (code, name, description, category, location, department, manufacturer, model,
             serial_number, purchase_date, warranty_expiry, status,
             responsible_user_id, department_id, location_id, work_zone_id,
             barcode, image_path, instruction_manual)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $_POST['code'], $_POST['name'],
            $toNull($_POST['description'] ?? null), $toNull($_POST['category'] ?? null),
            $toNull($_POST['location'] ?? null),    $toNull($_POST['department'] ?? null),
            $toNull($_POST['manufacturer'] ?? null),$toNull($_POST['model'] ?? null),
            $toNull($_POST['serial_number'] ?? null),
            $toNull($_POST['purchase_date'] ?? null), $toNull($_POST['warranty_expiry'] ?? null),
            $_POST['status'] ?? 'active',
            $toNull($_POST['responsible_user_id'] ?? null),
            $toNull($_POST['department_id'] ?? null),
            $toNull($_POST['location_id'] ?? null),
            $toNull($_POST['work_zone_id'] ?? null),
            $toNull($_POST['barcode'] ?? null),
            $imagePath,
            $manualPath,
        ]);
        $success = 'เพิ่มทรัพย์สินเรียบร้อย';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
?>

<div class="max-w-3xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปทะเบียนทรัพย์สิน</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">เพิ่มทรัพย์สินใหม่</h1>
    </div>

    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>

    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-6">

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ข้อมูลพื้นฐาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">รหัสทรัพย์สิน <span class="text-red-500">*</span></label>
                <input type="text" name="code" required class="input input-bordered w-full mt-1"
                    value="AST-<?= date('Ymd') ?>-">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ชื่อทรัพย์สิน <span class="text-red-500">*</span></label>
                <input type="text" name="name" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">หมวดหมู่</label>
                <input type="text" name="category" class="input input-bordered w-full mt-1" placeholder="Machine, Instrument, Vehicle...">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานะ</label>
                <select name="status" class="input input-bordered w-full mt-1">
                    <option value="active">Active - ใช้งานอยู่</option>
                    <option value="inactive">Inactive - ไม่ได้ใช้งาน</option>
                    <option value="disposed">Disposed - จำหน่ายแล้ว</option>
                    <option value="under_repair">Under Repair - อยู่ระหว่างซ่อม</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">Barcode</label>
                <input type="text" name="barcode" class="input input-bordered w-full mt-1" placeholder="Barcode หรือ QR code value">
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ผู้รับผิดชอบ / ที่ตั้ง</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">ผู้รับผิดชอบหลัก</label>
                <select name="responsible_user_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>"><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">แผนก (จากระบบ)</label>
                <select name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($departments as $d): ?>
                    <option value="<?= $d['id'] ?>"><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานที่ (จากระบบ)</label>
                <select name="location_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($locations as $loc): ?>
                    <option value="<?= $loc['id'] ?>"><?= htmlspecialchars($loc['code'] . ' - ' . $loc['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">โซนงาน</label>
                <select name="work_zone_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($workZones as $wz): ?>
                    <option value="<?= $wz['id'] ?>"><?= htmlspecialchars($wz['code'] . ' - ' . $wz['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานที่ (ข้อความ)</label>
                <input type="text" name="location" class="input input-bordered w-full mt-1" placeholder="เช่น อาคาร A ชั้น 2">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">แผนก (ข้อความ)</label>
                <input type="text" name="department" class="input input-bordered w-full mt-1" placeholder="เช่น แผนกช่าง">
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ข้อมูลทางเทคนิค</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">ผู้ผลิต</label>
                <input type="text" name="manufacturer" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">รุ่น</label>
                <input type="text" name="model" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">Serial Number</label>
                <input type="text" name="serial_number" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">วันที่ซื้อ</label>
                <input type="date" name="purchase_date" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">หมดประกัน</label>
                <input type="date" name="warranty_expiry" class="input input-bordered w-full mt-1">
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ไฟล์แนบ</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary font-bold text-blue-900">📸 ถ่ายภาพเครื่องจักรจากกล้อง / แนบรูปภาพทรัพย์สิน</label>
                <input type="file" name="image_file" accept="image/*" capture="environment" class="input input-bordered w-full mt-1">
                <p class="text-xs text-blue-600 mt-1">กดที่กล่องเพื่อถ่ายภาพเครื่องจักรบนมือถือทันที (JPG, PNG, WebP)</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">คู่มือการใช้งาน (ไฟล์)</label>
                <input type="file" name="instruction_manual" accept=".pdf,.doc,.docx" class="input input-bordered w-full mt-1">
                <p class="text-xs text-muted mt-1">PDF, DOC, DOCX</p>
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-secondary">คำอธิบาย</label>
            <textarea name="description" rows="2" class="input input-bordered w-full mt-1"></textarea>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
