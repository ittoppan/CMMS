<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'อัปโหลดคู่มือ - CMMS-TPT';
$pdo = getDb();
$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $filePath = $_POST['file_path'] ?? '';
        if (!empty($_FILES['file']['name']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
            $uploadDir = __DIR__ . '/../../../public/uploads/manuals/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            $ext = pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION);
            $fileName = uniqid('manual_') . '.' . $ext;
            move_uploaded_file($_FILES['file']['tmp_name'], $uploadDir . $fileName);
            $filePath = '/uploads/manuals/' . $fileName;
        }
        $stmt = $pdo->prepare('INSERT INTO manuals (asset_id, title, description, file_path, file_type, version, uploaded_by) VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            $_POST['asset_id'], $_POST['title'], $_POST['description'],
            $filePath, $_FILES['file']['type'] ?? $_POST['file_type'], $_POST['version'], $_SESSION['user_id']
        ]);
        $success = 'อัปโหลดคู่มือเรียบร้อย';
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปคู่มือ</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">อัปโหลดคู่มือ</h1>
    </div>
    <?php if ($error): ?><div class="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="bg-green-50 text-green-700 text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">ชื่อเอกสาร <span class="text-red-500">*</span></label>
                <input type="text" name="title" required class="input input-bordered w-full mt-1">
            </div>
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">ทรัพย์สินที่เกี่ยวข้อง</label>
                <select name="asset_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>"><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">อัปโหลดไฟล์</label>
                <input type="file" name="file" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">หรือ URL ไฟล์</label>
                <input type="text" name="file_path" class="input input-bordered w-full mt-1" placeholder="/uploads/manuals/file.pdf">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ประเภทไฟล์</label>
                <input type="text" name="file_type" class="input input-bordered w-full mt-1" placeholder="application/pdf">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">เวอร์ชัน</label>
                <input type="text" name="version" class="input input-bordered w-full mt-1" placeholder="1.0">
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">คำอธิบาย</label>
            <textarea name="description" rows="2" class="input input-bordered w-full mt-1"></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
