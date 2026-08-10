<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'บันทึกการยืมอุปกรณ์ — CMMS-TPT';
$pdo = getDb();
$assets  = $pdo->query('SELECT id, code, name FROM asset_registry WHERE status = "active" ORDER BY name')->fetchAll();
$users   = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$reasons = $pdo->query('SELECT id, code, name FROM borrowing_reasons WHERE is_active = 1 ORDER BY name')->fetchAll();

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $stmt = $pdo->prepare('INSERT INTO equipment_borrowing (asset_id, borrower_id, processed_by, borrowing_type, reason_id, reason_detail, borrow_date, expected_return_date, purpose, condition_before, status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $_POST['asset_id'], $_POST['borrower_id'], $_SESSION['user_id'],
            $_POST['borrowing_type'] ?? 'single',
            $toNull($_POST['reason_id'] ?? null),
            $toNull($_POST['reason_detail'] ?? null),
            $_POST['borrow_date'] ?: date('Y-m-d H:i:s'),
            $toNull($_POST['expected_return_date'] ?? null),
            $toNull($_POST['purpose'] ?? null),
            $toNull($_POST['condition_before'] ?? null),
            $_POST['status'] ?? 'borrowed',
            $toNull($_POST['notes'] ?? null)
        ]);
        $success = 'บันทึกการยืมเรียบร้อย';
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
?>
<div class="max-w-2xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="breadcrumb"><span class="breadcrumb-sep">&larr;</span> กลับไปรายการยืม-คืน</a>
        <h1 class="page-title mt-2">📦 บันทึกการยืมอุปกรณ์</h1>
    </div>
    <?php if ($error): ?><div class="alert alert-error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="alert alert-success"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="form-section space-y-4">
        <div class="form-grid">
            <div style="grid-column: span 2;">
                <label class="form-label">อุปกรณ์ / ทรัพย์สิน <span class="req">*</span></label>
                <select name="asset_id" required>
                    <option value="">-- เลือกอุปกรณ์ --</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>"><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">ผู้ยืม <span class="req">*</span></label>
                <select name="borrower_id" required>
                    <option value="">-- เลือกผู้ยืม --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>"><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">ประเภทการยืม</label>
                <select name="borrowing_type">
                    <option value="single">Single — ยืมชิ้นเดียว</option>
                    <option value="group">Group — ยืมเป็นชุด</option>
                </select>
            </div>
            <div>
                <label class="form-label">เหตุผลการยืม (Master)</label>
                <select name="reason_id">
                    <option value="">-- เลือกเหตุผล --</option>
                    <?php foreach ($reasons as $r): ?>
                    <option value="<?= $r['id'] ?>"><?= htmlspecialchars($r['code'] . ' - ' . $r['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="form-label">สถานะการยืม</label>
                <select name="status">
                    <option value="borrowed">Borrowed — อยู่ระหว่างยืม</option>
                    <option value="returned">Returned — คืนแล้ว</option>
                    <option value="overdue">Overdue — เกินกำหนด</option>
                    <option value="lost">Lost — สูญหาย</option>
                </select>
            </div>
            <div>
                <label class="form-label">วันที่ยืม</label>
                <input type="datetime-local" name="borrow_date" value="<?= date('Y-m-d\TH:i') ?>">
            </div>
            <div>
                <label class="form-label">กำหนดคืน</label>
                <input type="date" name="expected_return_date">
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">รายละเอียดเหตุผลการยืม</label>
                <input type="text" name="reason_detail" placeholder="ระบุเหตุผลเพิ่มเติม...">
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">วัตถุประสงค์การใช้งาน</label>
                <textarea name="purpose" rows="2" placeholder="อธิบายงานที่นำไปใช้..."></textarea>
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">สภาพอุปกรณ์ก่อนยืม</label>
                <textarea name="condition_before" rows="2" placeholder="เช่น ปกติสมบูรณ์, มีรอยขีดข่วน..."></textarea>
            </div>
            <div style="grid-column: span 2;">
                <label class="form-label">หมายเหตุ</label>
                <textarea name="notes" rows="2"></textarea>
            </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;">
            <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
            <a href="index.php" class="btn btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
