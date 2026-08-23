<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มบทบาทผู้ใช้ - CMMS-TPT';

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo = getDb();
        $name = trim($_POST['name'] ?? '');
        if ($name === '') throw new Exception('กรุณากรอกชื่อบทบาท');
        $stmt = $pdo->prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
        $stmt->execute([$name, trim($_POST['description'] ?? '') ?: null]);
        $newId = $pdo->lastInsertId();
        header('Location: index.php');
        exit;
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
?>

<div class="max-w-xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปรายการบทบาท</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">เพิ่มบทบาทผู้ใช้ใหม่</h1>
    </div>

    <?php if ($error): ?>
    <div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <form method="post" class="card p-6 space-y-4">
        <div>
            <label for="field_name" class="block text-sm font-medium text-secondary">ชื่อบทบาท <span class="text-red-500">*</span></label>
            <input type="text" id="field_name" name="name" required aria-required="true"
                class="input input-bordered w-full mt-1" placeholder="เช่น Technician, Supervisor, Admin"
                value="<?= htmlspecialchars($_POST['name'] ?? '') ?>">
        </div>
        <div>
            <label for="field_description" class="block text-sm font-medium text-secondary">คำอธิบาย</label>
            <textarea id="field_description" name="description" rows="3" class="input input-bordered w-full mt-1"
                placeholder="อธิบายหน้าที่และสิทธิ์ของบทบาทนี้..."><?= htmlspecialchars($_POST['description'] ?? '') ?></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
