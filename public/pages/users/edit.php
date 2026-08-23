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
        <h1 class="mt-2 text-2xl font-bold text-primary">แก้ไขผู้ใช้</h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="flex items-center gap-4 p-4 bg-subtle rounded-lg border border-line mb-2">
            <?php if (!empty($row['avatar_path']) && file_exists(__DIR__ . '/../../../' . $row['avatar_path'])): ?>
            <img src="/<?= htmlspecialchars($row['avatar_path']) ?>" class="w-16 h-16 rounded-full object-cover border-2 border-brand-500 shadow-sm">
            <?php else: ?>
            <div class="w-16 h-16 rounded-full bg-brand-600 text-white font-extrabold text-xl flex items-center justify-center border-2 border-brand-500">
                <?= mb_substr($row['full_name'], 0, 1) ?>
            </div>
            <?php endif; ?>
            <div>
                <label for="field_avatar_file" class="block text-sm font-bold text-primary">📸 อัปเดต/เปลี่ยนรูปภาพโปรไฟล์</label>
                <input type="file" id="field_avatar_file" name="avatar_file" accept="image/*" capture="user" class="input input-bordered w-full mt-1 text-xs">
                <p class="text-xs text-muted mt-1">ถ่ายภาพเซลฟี่จากกล้องมือถือ หรือเลือกรูปโปรไฟล์ (JPG, PNG)</p>
            </div>
        </div>

        <h2 class="text-base font-semibold text-primary border-b pb-2">ข้อมูลบัญชี</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label for="field_username" class="block text-sm font-medium text-secondary">ชื่อผู้ใช้ <span class="text-red-500">*</span></label>
                <input type="text" id="field_username" name="username" value="<?= htmlspecialchars($row['username']) ?>" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_email" class="block text-sm font-medium text-secondary">อีเมล <span class="text-red-500">*</span></label>
                <input type="email" id="field_email" name="email" value="<?= htmlspecialchars($row['email']) ?>" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_full_name" class="block text-sm font-medium text-secondary">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
                <input type="text" id="field_full_name" name="full_name" value="<?= htmlspecialchars($row['full_name']) ?>" required aria-required="true" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_password" class="block text-sm font-medium text-secondary">รหัสผ่านใหม่ (เว้นว่างไว้ไม่เปลี่ยน)</label>
                <input type="password" id="field_password" name="password" minlength="4" class="input input-bordered w-full mt-1">
            </div>
        </div>

        <h2 class="text-base font-semibold text-primary border-b pb-2">ข้อมูลพนักงาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label for="field_employee_code" class="block text-sm font-medium text-secondary">รหัสพนักงาน</label>
                <input type="text" id="field_employee_code" name="employee_code" value="<?= htmlspecialchars($row['employee_code'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_position" class="block text-sm font-medium text-secondary">ตำแหน่ง</label>
                <input type="text" id="field_position" name="position" value="<?= htmlspecialchars($row['position'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_role_id" class="block text-sm font-medium text-secondary">บทบาท</label>
                <select id="field_role_id" name="role_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($roles as $r): ?>
                    <option value="<?= $r['id'] ?>" <?= $row['role_id'] == $r['id'] ? 'selected' : '' ?>><?= htmlspecialchars($r['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label for="field_department_id" class="block text-sm font-medium text-secondary">แผนก</label>
                <select id="field_department_id" name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($departments as $d): ?>
                    <option value="<?= $d['id'] ?>" <?= $row['department_id'] == $d['id'] ? 'selected' : '' ?>><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label for="field_phone" class="block text-sm font-medium text-secondary">เบอร์โทร</label>
                <input type="text" id="field_phone" name="phone" value="<?= htmlspecialchars($row['phone'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_line_user_id" class="block text-sm font-medium text-secondary">LINE User ID (สำหรับการแจ้งเตือน LINE)</label>
                <input type="text" id="field_line_user_id" name="line_user_id" value="<?= htmlspecialchars($row['line_user_id'] ?? '') ?>" placeholder="U123456789..." class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label for="field_is_active" class="block text-sm font-medium text-secondary">สถานะ</label>
                <select id="field_is_active" name="is_active" class="input input-bordered w-full mt-1">
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
