<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'มอบหมายงานซ่อม - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$r = $pdo->prepare('SELECT r.*, a.name AS asset_name FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id WHERE r.id = ?');
$r->execute([$id]); $r = $r->fetch();
if (!$r) { header('Location: index.php'); exit; }

$users = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$error = ''; $success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $assignedTo = (int)($_POST['assigned_to'] ?? 0);
    $note = trim($_POST['note'] ?? '');
    if (!$assignedTo) {
        $error = 'กรุณาเลือกผู้รับผิดชอบ';
    } else {
        try {
            $pdo->beginTransaction();
            $pdo->prepare('UPDATE repair SET assigned_to = ? WHERE id = ?')->execute([$assignedTo, $id]);
            $userName = $pdo->prepare('SELECT full_name FROM users WHERE id = ?'); $userName->execute([$assignedTo]); $userName = $userName->fetchColumn();
            $desc = 'มอบหมายให้ ' . $userName;
            if ($note) $desc .= ' - ' . $note;
            $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description, old_value, new_value) VALUES (?,?,?,?,?,?)')
                ->execute([$id, $_SESSION['user_id'], 'assigned', $desc, $r['assigned_to'] ?: null, (string)$assignedTo]);
            $pdo->commit();
            $success = 'มอบหมายงานเรียบร้อย';
            echo '<script>setTimeout(function(){ window.location.href="view.php?id=' . $id . '"; }, 1500);</script>';
        } catch (Exception $e) {
            $pdo->rollBack();
            $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
        }
    }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="view.php?id=<?= $id ?>" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">มอบหมายงานซ่อม #<?= $id ?></h1>
    </div>

    <div class="card p-4 mb-4 bg-gray-50">
        <p class="text-sm"><span class="font-medium">หัวข้องาน:</span> <?= htmlspecialchars($r['title']) ?></p>
        <p class="text-sm"><span class="font-medium">ทรัพย์สิน:</span> <?= htmlspecialchars($r['asset_name']??'-') ?></p>
        <p class="text-sm"><span class="font-medium">ผู้รับปัจจุบัน:</span> <?php
            if ($r['assigned_to']) {
                $cn = $pdo->prepare('SELECT full_name FROM users WHERE id = ?'); $cn->execute([$r['assigned_to']]);
                echo htmlspecialchars($cn->fetchColumn() ?: '-');
            } else { echo '-'; }
        ?></p>
    </div>

    <?php if ($error): ?><div class="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="bg-green-50 text-green-700 text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>

    <form method="post" class="card p-6 space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-700">ผู้รับผิดชอบ <span class="text-red-500">*</span></label>
            <select name="assigned_to" class="input input-bordered w-full mt-1" required>
                <option value="">-- เลือกผู้รับผิดชอบ --</option>
                <?php foreach ($users as $u): ?>
                <option value="<?= $u['id'] ?>" <?= $r['assigned_to']==$u['id']?'selected':'' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">หมายเหตุ (ไม่บังคับ)</label>
            <textarea name="note" rows="3" class="input input-bordered w-full mt-1" placeholder="ระบุหมายเหตุการมอบหมาย..."></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">ยืนยันการมอบหมาย</button>
            <a href="view.php?id=<?= $id ?>" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
