<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มผู้จำหน่าย - CMMS-TPT';
$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo = getDb();
        $stmt = $pdo->prepare('INSERT INTO suppliers (code, name, contact_person, email, phone, address, tax_id, is_active) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$_POST['code'], $_POST['name'], $_POST['contact_person'], $_POST['email'], $_POST['phone'], $_POST['address'], $_POST['tax_id'], $_POST['is_active'] ?? 1]);
        $success = 'เพิ่มผู้จำหน่ายเรียบร้อย';
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปผู้จำหน่าย</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">เพิ่มผู้จำหน่าย</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label for="field_code" class="block text-sm font-medium text-secondary">รหัสผู้จำหน่าย <span class="text-red-500">*</span></label>
                <input type="text" id="field_code" name="code" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_name" class="block text-sm font-medium text-secondary">ชื่อบริษัท <span class="text-red-500">*</span></label>
                <input type="text" id="field_name" name="name" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_contact_person" class="block text-sm font-medium text-secondary">ผู้ติดต่อ</label>
                <input type="text" id="field_contact_person" name="contact_person" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_phone" class="block text-sm font-medium text-secondary">เบอร์โทร</label>
                <input type="text" id="field_phone" name="phone" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_email" class="block text-sm font-medium text-secondary">อีเมล</label>
                <input type="email" id="field_email" name="email" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_tax_id" class="block text-sm font-medium text-secondary">เลขประจำตัวผู้เสียภาษี</label>
                <input type="text" id="field_tax_id" name="tax_id" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_is_active" class="block text-sm font-medium text-secondary">สถานะ</label>
                <select id="field_is_active" name="is_active" class="input input-bordered w-full mt-1">
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                </select>
            </div>
        </div>
        <div>
            <label for="field_address" class="block text-sm font-medium text-secondary">ที่อยู่</label>
            <textarea id="field_address" name="address" rows="3" class="input input-bordered w-full mt-1"></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
