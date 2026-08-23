<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มผู้ใช้ - CMMS-TPT';
$pdo = getDb();
$roles = $pdo->query('SELECT id, name FROM roles ORDER BY name')->fetchAll();
$departments = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();

$error = '';
$success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $password = $_POST['password'];
        if (strlen($password) < 4) throw new Exception('รหัสผ่านต้องอย่างน้อย 4 ตัวอักษร');
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $stmt = $pdo->prepare('INSERT INTO users (role_id, department_id, username, email, password, full_name, phone, employee_code, position, is_active) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $toNull($_POST['role_id'] ?? null),
            $toNull($_POST['department_id'] ?? null),
            $_POST['username'],
            $_POST['email'],
            $hash,
            $_POST['full_name'],
            $toNull($_POST['phone'] ?? null),
            $toNull($_POST['employee_code'] ?? null),
            $toNull($_POST['position'] ?? null),
            $_POST['is_active'] ?? 1
        ]);
        $success = 'เพิ่มผู้ใช้เรียบร้อย';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปผู้ใช้</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">เพิ่มผู้ใช้ใหม่</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="card p-6 space-y-4">
        <h2 class="text-base font-semibold text-primary border-b pb-2">ข้อมูลบัญชี</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label for="field_username" class="block text-sm font-medium text-secondary">ชื่อผู้ใช้ <span class="text-red-500">*</span></label>
                <input type="text" id="field_username" name="username" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_email" class="block text-sm font-medium text-secondary">อีเมล <span class="text-red-500">*</span></label>
                <input type="email" id="field_email" name="email" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_full_name" class="block text-sm font-medium text-secondary">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
                <input type="text" id="field_full_name" name="full_name" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_password" class="block text-sm font-medium text-secondary">รหัสผ่าน <span class="text-red-500">*</span></label>
                <input type="password" id="field_password" name="password" required aria-required="true" minlength="4" class="input input-bordered w-full mt-1">
            </div>
        </div>

        <h2 class="text-base font-semibold text-primary border-b pb-2">ข้อมูลพนักงาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label for="field_employee_code" class="block text-sm font-medium text-secondary">รหัสพนักงาน</label>
                <input type="text" id="field_employee_code" name="employee_code" class="input input-bordered w-full mt-1" placeholder="EMP-001">
            </div>
            <div>
                <label for="field_position" class="block text-sm font-medium text-secondary">ตำแหน่ง</label>
                <input type="text" id="field_position" name="position" class="input input-bordered w-full mt-1" placeholder="เช่น ช่างซ่อม, หัวหน้าช่าง">
            </div>
            <div>
                <label for="field_role_id" class="block text-sm font-medium text-secondary">บทบาท</label>
                <select id="field_role_id" name="role_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($roles as $r): ?>
                    <option value="<?= $r['id'] ?>"><?= htmlspecialchars($r['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label for="field_department_id" class="block text-sm font-medium text-secondary">แผนก</label>
                <select id="field_department_id" name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($departments as $d): ?>
                    <option value="<?= $d['id'] ?>"><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label for="field_phone" class="block text-sm font-medium text-secondary">เบอร์โทร</label>
                <input type="text" id="field_phone" name="phone" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_is_active" class="block text-sm font-medium text-secondary">สถานะ</label>
                <select id="field_is_active" name="is_active" class="input input-bordered w-full mt-1">
                    <option value="1">Active - ใช้งาน</option>
                    <option value="0">Inactive - ปิดใช้งาน</option>
                </select>
            </div>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
