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
        <h1 class="mt-2 text-2xl font-bold text-gray-900">เพิ่มผู้ใช้ใหม่</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="card p-6 space-y-4">
        <h2 class="text-base font-semibold text-gray-800 border-b pb-2">ข้อมูลบัญชี</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">ชื่อผู้ใช้ <span class="text-red-500">*</span></label>
                <input type="text" name="username" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">อีเมล <span class="text-red-500">*</span></label>
                <input type="email" name="email" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
                <input type="text" name="full_name" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">รหัสผ่าน <span class="text-red-500">*</span></label>
                <input type="password" name="password" required minlength="4" class="input input-bordered w-full mt-1">
            </div>
        </div>

        <h2 class="text-base font-semibold text-gray-800 border-b pb-2">ข้อมูลพนักงาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">รหัสพนักงาน</label>
                <input type="text" name="employee_code" class="input input-bordered w-full mt-1" placeholder="EMP-001">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ตำแหน่ง</label>
                <input type="text" name="position" class="input input-bordered w-full mt-1" placeholder="เช่น ช่างซ่อม, หัวหน้าช่าง">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">บทบาท</label>
                <select name="role_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($roles as $r): ?>
                    <option value="<?= $r['id'] ?>"><?= htmlspecialchars($r['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">แผนก</label>
                <select name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($departments as $d): ?>
                    <option value="<?= $d['id'] ?>"><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">เบอร์โทร</label>
                <input type="text" name="phone" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานะ</label>
                <select name="is_active" class="input input-bordered w-full mt-1">
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
