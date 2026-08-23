<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขบทบาทผู้ใช้ - CMMS-TPT';
$pdo = getDb();

$id = (int)($_GET['id'] ?? 0);
$stmt = $pdo->prepare('SELECT * FROM roles WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) { header('Location: index.php'); exit; }

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $name = trim($_POST['name'] ?? '');
        if ($name === '') throw new Exception('กรุณากรอกชื่อบทบาท');
        $stmt2 = $pdo->prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?');
        $stmt2->execute([$name, trim($_POST['description'] ?? '') ?: null, $id]);
        $success = 'บันทึกการแก้ไขเรียบร้อย';
        $row['name'] = $name;
        $row['description'] = $_POST['description'] ?? '';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
?>

<div class="max-w-xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปรายการบทบาท</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">แก้ไขบทบาทผู้ใช้</h1>
    </div>

    <?php if ($error): ?>
    <div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>
    <?php if ($success): ?>
    <div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div>
    <?php endif; ?>

    <form method="post" class="card p-6 space-y-4">
        <div>
            <label for="field_name" class="block text-sm font-medium text-secondary">ชื่อบทบาท <span class="text-red-500">*</span></label>
            <input type="text" id="field_name" name="name" required aria-required="true"
                class="input input-bordered w-full mt-1"
                value="<?= htmlspecialchars($row['name']) ?>">
        </div>
        <div>
            <label for="field_description" class="block text-sm font-medium text-secondary">คำอธิบาย</label>
            <textarea id="field_description" name="description" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['description'] ?? '') ?></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
