<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขการยืม-คืน — CMMS-TPT';
$pdo = getDb();
$id  = (int)($_GET['id'] ?? 0);

$stmt = $pdo->prepare('SELECT * FROM equipment_borrowing WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) { header('Location: index.php'); exit; }

$assets  = $pdo->query('SELECT id, code, name FROM asset_registry WHERE status = "active" ORDER BY name')->fetchAll();
$users   = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$reasons = $pdo->query('SELECT id, code, name FROM borrowing_reasons WHERE is_active = 1 ORDER BY name')->fetchAll();

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $stmt2 = $pdo->prepare('UPDATE equipment_borrowing SET asset_id=?, borrower_id=?, borrowing_type=?, reason_id=?, reason_detail=?, borrow_date=?, expected_return_date=?, actual_return_date=?, purpose=?, condition_before=?, condition_after=?, status=?, notes=? WHERE id=?');
        $stmt2->execute([
            $_POST['asset_id'], $_POST['borrower_id'],
            $_POST['borrowing_type'] ?? 'single',
            $toNull($_POST['reason_id'] ?? null),
            $toNull($_POST['reason_detail'] ?? null),
            $_POST['borrow_date'],
            $toNull($_POST['expected_return_date'] ?? null),
            $toNull($_POST['actual_return_date'] ?? null),
            $toNull($_POST['purpose'] ?? null),
            $toNull($_POST['condition_before'] ?? null),
            $toNull($_POST['condition_after'] ?? null),
            $_POST['status'] ?? 'borrowed',
            $toNull($_POST['notes'] ?? null),
            $id
        ]);
        $success = 'บันทึกการแก้ไขเรียบร้อย';
        $stmt3 = $pdo->prepare('SELECT * FROM equipment_borrowing WHERE id = ?');
        $stmt3->execute([$id]);
        $row = $stmt3->fetch();
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="breadcrumb"><span class="breadcrumb-sep">&larr;</span> กลับไปรายการยืม-คืน</a>
        <h1 class="page-title mt-2">✏️ แก้ไขรายการยืม-คืน #<?= $id ?></h1>
    </div>
    <?php if ($error): ?><div class="alert alert-error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="alert alert-success"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="form-section space-y-4">
        <div class="form-grid">
            <div style="grid-column: span 2;">
                <label class="form-label">อุปกรณ์ / ทรัพย์สิน <span class="req">*</span></label>
                <select name="asset_id" required>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= $row['asset_id'] == $a['id'] ? 'selected' : '' ?>><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">ผู้ยืม <span class="req">*</span></label>
                <select name="borrower_id" required>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>" <?= $row['borrower_id'] == $u['id'] ? 'selected' : '' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">ประเภทการยืม</label>
                <select name="borrowing_type">
                    <option value="single" <?= ($row['borrowing_type'] ?? '') === 'single' ? 'selected' : '' ?>>Single — ยืมชิ้นเดียว</option>
                    <option value="group" <?= ($row['borrowing_type'] ?? '') === 'group' ? 'selected' : '' ?>>Group — ยืมเป็นชุด</option>
                </select>
            </div>
            <div>
                <label class="form-label">เหตุผลการยืม (Master)</label>
                <select name="reason_id">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($reasons as $r): ?>
                    <option value="<?= $r['id'] ?>" <?= ($row['reason_id'] ?? '') == $r['id'] ? 'selected' : '' ?>><?= htmlspecialchars($r['code'] . ' - ' . $r['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">สถานะการยืม</label>
                <select name="status">
                    <?php foreach (['borrowed'=>'Borrowed','returned'=>'Returned','overdue'=>'Overdue','lost'=>'Lost'] as $st => $lbl): ?>
                    <option value="<?= $st ?>" <?= $row['status'] === $st ? 'selected' : '' ?>><?= $lbl ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">วันที่ยืม</label>
                <input type="datetime-local" name="borrow_date" value="<?= str_replace(' ', 'T', $row['borrow_date']) ?>">
            </div>
            <div>
                <label class="form-label">กำหนดคืน</label>
                <input type="date" name="expected_return_date" value="<?= htmlspecialchars($row['expected_return_date'] ?? '') ?>">
            </div>
            <div>
                <label class="form-label">วันที่คืนจริง</label>
                <input type="datetime-local" name="actual_return_date" value="<?= str_replace(' ', 'T', $row['actual_return_date'] ?? '') ?>">
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">รายละเอียดเหตุผลการยืม</label>
                <input type="text" name="reason_detail" value="<?= htmlspecialchars($row['reason_detail'] ?? '') ?>">
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">วัตถุประสงค์การใช้งาน</label>
                <textarea name="purpose" rows="2"><?= htmlspecialchars($row['purpose'] ?? '') ?></textarea>
            </div>
            <div>
                <label class="form-label">สภาพก่อนยืม</label>
                <textarea name="condition_before" rows="2"><?= htmlspecialchars($row['condition_before'] ?? '') ?></textarea>
            </div>
            <div>
                <label class="form-label">สภาพหลังคืน</label>
                <textarea name="condition_after" rows="2"><?= htmlspecialchars($row['condition_after'] ?? '') ?></textarea>
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">หมายเหตุ</label>
                <textarea name="notes" rows="2"><?= htmlspecialchars($row['notes'] ?? '') ?></textarea>
            </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;">
            <button type="submit" class="btn btn-primary">บันทึกการแก้ไข</button>
            <a href="index.php" class="btn btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
