<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขผู้ใช้ - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) { header('Location: index.php'); exit; }

$roles = $pdo->query('SELECT id, name FROM roles ORDER BY name')->fetchAll();
$departments = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();

$error = '';
$success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;

        // Process profile avatar image upload
        $avatarPath = $row['avatar_path'] ?? null;
        if (!empty($_FILES['avatar_file']['name'])) {
            $upDir = __DIR__ . '/../../../uploads/avatars/';
            if (!is_dir($upDir)) mkdir($upDir, 0775, true);
            $ext = pathinfo($_FILES['avatar_file']['name'], PATHINFO_EXTENSION);
            $fname = uniqid('user_') . '.' . $ext;
            move_uploaded_file($_FILES['avatar_file']['tmp_name'], $upDir . $fname);
            $avatarPath = 'uploads/avatars/' . $fname;
        }

        if ($_POST['password'] ?? '') {
            $hash = password_hash($_POST['password'], PASSWORD_BCRYPT);
            $pdo->prepare('UPDATE users SET role_id=?, department_id=?, username=?, email=?, password=?, full_name=?, phone=?, employee_code=?, position=?, line_user_id=?, avatar_path=?, is_active=? WHERE id=?')
                ->execute([
                    $toNull($_POST['role_id'] ?? null), $toNull($_POST['department_id'] ?? null),
                    $_POST['username'], $_POST['email'], $hash, $_POST['full_name'],
                    $toNull($_POST['phone'] ?? null), $toNull($_POST['employee_code'] ?? null),
                    $toNull($_POST['position'] ?? null), $toNull($_POST['line_user_id'] ?? null), $avatarPath, $_POST['is_active'] ?? 1, $id
                ]);
        } else {
            $pdo->prepare('UPDATE users SET role_id=?, department_id=?, username=?, email=?, full_name=?, phone=?, employee_code=?, position=?, line_user_id=?, avatar_path=?, is_active=? WHERE id=?')
                ->execute([
                    $toNull($_POST['role_id'] ?? null), $toNull($_POST['department_id'] ?? null),
                    $_POST['username'], $_POST['email'], $_POST['full_name'],
                    $toNull($_POST['phone'] ?? null), $toNull($_POST['employee_code'] ?? null),
                    $toNull($_POST['position'] ?? null), $toNull($_POST['line_user_id'] ?? null), $avatarPath, $_POST['is_active'] ?? 1, $id
                ]);
        }
        $success = 'บันทึกข้อมูลเรียบร้อย';
        $stmt2 = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt2->execute([$id]);
        $row = $stmt2->fetch();
    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">แก้ไขผู้ใช้</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 mb-2">
            <?php if (!empty($row['avatar_path']) && file_exists(__DIR__ . '/../../../' . $row['avatar_path'])): ?>
            <img src="/<?= htmlspecialchars($row['avatar_path']) ?>" class="w-16 h-16 rounded-full object-cover border-2 border-brand-500 shadow-sm">
            <?php else: ?>
            <div class="w-16 h-16 rounded-full bg-brand-600 text-white font-extrabold text-xl flex items-center justify-center border-2 border-brand-500">
                <?= mb_substr($row['full_name'], 0, 1) ?>
            </div>
            <?php endif; ?>
            <div>
                <label class="block text-sm font-bold text-gray-900">📸 อัปเดต/เปลี่ยนรูปภาพโปรไฟล์</label>
                <input type="file" name="avatar_file" accept="image/*" capture="user" class="input input-bordered w-full mt-1 text-xs">
                <p class="text-xs text-gray-500 mt-1">ถ่ายภาพเซลฟี่จากกล้องมือถือ หรือเลือกรูปโปรไฟล์ (JPG, PNG)</p>
            </div>
        </div>

        <h2 class="text-base font-semibold text-gray-800 border-b pb-2">ข้อมูลบัญชี</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">ชื่อผู้ใช้ <span class="text-red-500">*</span></label>
                <input type="text" name="username" value="<?= htmlspecialchars($row['username']) ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">อีเมล <span class="text-red-500">*</span></label>
                <input type="email" name="email" value="<?= htmlspecialchars($row['email']) ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
                <input type="text" name="full_name" value="<?= htmlspecialchars($row['full_name']) ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">รหัสผ่านใหม่ (เว้นว่างไว้ไม่เปลี่ยน)</label>
                <input type="password" name="password" minlength="4" class="input input-bordered w-full mt-1">
            </div>
        </div>

        <h2 class="text-base font-semibold text-gray-800 border-b pb-2">ข้อมูลพนักงาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">รหัสพนักงาน</label>
                <input type="text" name="employee_code" value="<?= htmlspecialchars($row['employee_code'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ตำแหน่ง</label>
                <input type="text" name="position" value="<?= htmlspecialchars($row['position'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">บทบาท</label>
                <select name="role_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($roles as $r): ?>
                    <option value="<?= $r['id'] ?>" <?= $row['role_id'] == $r['id'] ? 'selected' : '' ?>><?= htmlspecialchars($r['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">แผนก</label>
                <select name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($departments as $d): ?>
                    <option value="<?= $d['id'] ?>" <?= $row['department_id'] == $d['id'] ? 'selected' : '' ?>><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">เบอร์โทร</label>
                <input type="text" name="phone" value="<?= htmlspecialchars($row['phone'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">LINE User ID (สำหรับการแจ้งเตือน LINE)</label>
                <input type="text" name="line_user_id" value="<?= htmlspecialchars($row['line_user_id'] ?? '') ?>" placeholder="U123456789..." class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานะ</label>
                <select name="is_active" class="input input-bordered w-full mt-1">
                    <option value="1" <?= $row['is_active'] ? 'selected' : '' ?>>Active - ใช้งาน</option>
                    <option value="0" <?= !$row['is_active'] ? 'selected' : '' ?>>Inactive - ปิดใช้งาน</option>
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
