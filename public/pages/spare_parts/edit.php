<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขอะไหล่ - CMMS-TPT';
$pdo = getDb();

$id = (int)($_GET['id'] ?? 0);
$part = $pdo->prepare('SELECT * FROM spare_parts WHERE id = ?');
$part->execute([$id]);
$row = $part->fetch();
if (!$row) { header('Location: index.php'); exit; }

$suppliers = $pdo->query('SELECT id, name FROM suppliers WHERE is_active = 1 ORDER BY name')->fetchAll();

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $imageUrl = $row['image_url'] ?? null;
        if (!empty($_FILES['spare_image']['name']) && $_FILES['spare_image']['error'] === UPLOAD_ERR_OK) {
            $upDir = __DIR__ . '/../../../public/uploads/spares/';
            if (!is_dir($upDir)) mkdir($upDir, 0777, true);
            $ext = pathinfo($_FILES['spare_image']['name'], PATHINFO_EXTENSION);
            $fileName = 'spare_' . time() . '_' . rand(100, 999) . '.' . strtolower($ext);
            if (move_uploaded_file($_FILES['spare_image']['tmp_name'], $upDir . $fileName)) {
                $imageUrl = '/uploads/spares/' . $fileName;
            }
        } elseif (isset($_POST['image_url']) && trim($_POST['image_url']) !== '') {
            $imageUrl = trim($_POST['image_url']);
        }

        $stmt = $pdo->prepare('UPDATE spare_parts SET supplier_id=?, code=?, name=?, description=?, category=?, unit=?, stock_qty=?, min_stock=?, max_stock=?, location=?, unit_price=?, image_url=? WHERE id=?');
        $stmt->execute([
            $_POST['supplier_id'] ?: null, $_POST['code'], $_POST['name'], $_POST['description'],
            $_POST['category'], $_POST['unit'], $_POST['stock_qty'] ?: 0, $_POST['min_stock'] ?: 0,
            $_POST['max_stock'] ?: 0, $_POST['location'], $_POST['unit_price'] ?: 0, $imageUrl, $id
        ]);
        $success = 'บันทึกการแก้ไขและอัปเดตรูปภาพเรียบร้อยแล้ว';
        $row = array_merge($row, $_POST);
        $row['image_url'] = $imageUrl;
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>

<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปอะไหล่</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">แก้ไขอะไหล่ (พร้อมรูปภาพ)</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">รหัสอะไหล่ <span class="text-red-500">*</span></label>
                <input type="text" name="code" required class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['code']) ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ชื่ออะไหล่ <span class="text-red-500">*</span></label>
                <input type="text" name="name" required class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['name']) ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">หมวดหมู่</label>
                <input type="text" name="category" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['category'] ?? '') ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">หน่วย</label>
                <input type="text" name="unit" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['unit'] ?? 'ชิ้น') ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">จำนวนในสต็อก</label>
                <input type="number" name="stock_qty" step="0.01" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['stock_qty']) ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สต็อกขั้นต่ำ</label>
                <input type="number" name="min_stock" step="0.01" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['min_stock']) ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สต็อกสูงสุด</label>
                <input type="number" name="max_stock" step="0.01" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['max_stock']) ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ราคาต่อหน่วย</label>
                <input type="number" name="unit_price" step="0.01" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['unit_price']) ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ผู้จำหน่าย</label>
                <select name="supplier_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($suppliers as $s): ?>
                    <option value="<?= $s['id'] ?>" <?= $row['supplier_id']==$s['id']?'selected':'' ?>><?= htmlspecialchars($s['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ตำแหน่งจัดเก็บ</label>
                <input type="text" name="location" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['location'] ?? '') ?>">
            </div>
            <div class="sm:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <label class="block text-xs font-bold text-slate-800">🖼️ รูปภาพประจำรายการอะไหล่ (Spare Part Image)</label>
                <div class="flex items-center gap-4">
                    <img src="<?= getImageUrl($row['image_url'] ?? null, 'spare') ?>" class="card w-16 h-16 object-cover shrink-0">
                    <div class="flex-1 space-y-1">
                        <input type="file" name="spare_image" accept="image/*" class="cmms-banner info block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file: file: hover:file:bg-indigo-100 transition-all cursor-pointer">
                        <span class="text-[11px] text-slate-400 block">อัปโหลดไฟล์ใหม่ หรือแก้ URL รูปภาพด้านล่าง</span>
                        <input type="text" name="image_url" value="<?= htmlspecialchars($row['image_url'] ?? '') ?>" placeholder="หรือระบุ URL รูปภาพที่นี่..." class="input input-bordered w-full text-xs font-mono">
                    </div>
                </div>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">คำอธิบาย</label>
            <textarea name="description" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['description'] ?? '') ?></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
