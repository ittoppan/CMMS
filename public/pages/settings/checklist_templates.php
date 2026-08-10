<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แม่แบบ Checklist — CMMS-TPT';
renderHeader();

$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['add_item'])) {
    try {
        $id     = (int)($_POST['id'] ?? 0);
        $code   = trim($_POST['code']);
        $name   = trim($_POST['name']);
        $desc   = trim($_POST['description'] ?? '');
        $cat    = $_POST['category'] ?? 'pm_am';
        $active = (int)($_POST['is_active'] ?? 1);

        if ($id) {
            $pdo->prepare('UPDATE checklist_templates SET code=?, name=?, description=?, category=?, is_active=? WHERE id=?')
                ->execute([$code, $name, $desc, $cat, $active, $id]);
            $msg = 'บันทึกการแก้ไขแม่แบบ Checklist เรียบร้อย';
        } else {
            $pdo->prepare('INSERT INTO checklist_templates (code, name, description, category, is_active) VALUES (?,?,?,?,?)')
                ->execute([$code, $name, $desc, $cat, $active]);
            $msg = 'สร้างแม่แบบ Checklist เรียบร้อย';
        }
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$delId = (int)($_GET['delete'] ?? 0);
if ($delId) {
    try {
        $pdo->prepare('DELETE FROM checklist_templates WHERE id=?')->execute([$delId]);
        $msg = 'ลบแม่แบบ Checklist เรียบร้อย';
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$editId  = (int)($_GET['edit'] ?? 0);
$editRow = null;
if ($editId) {
    $s = $pdo->prepare('SELECT * FROM checklist_templates WHERE id=?');
    $s->execute([$editId]);
    $editRow = $s->fetch();
}

$rows = $pdo->query('SELECT * FROM checklist_templates ORDER BY code')->fetchAll();
$cats = ['pm_am'=>'PM/AM','calibration'=>'Calibration','safety'=>'Safety','quality'=>'Quality','other'=>'Other'];

// Handle item operations
$itemMsg = '';
$itemDel = (int)($_GET['del_item'] ?? 0);
$tid     = (int)($_GET['tid'] ?? 0);

if ($itemDel && $tid) {
    try {
        $pdo->prepare('DELETE FROM checklist_template_items WHERE id=? AND template_id=?')->execute([$itemDel, $tid]);
        $itemMsg = 'ลบรายการตรวจสอบเรียบร้อย';
    } catch (Exception $e) {
        $itemMsg = 'error: ' . $e->getMessage();
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['add_item'])) {
    try {
        $st = $pdo->prepare('INSERT INTO checklist_template_items (template_id, item_order, item_type, description, expected_value, is_required) VALUES (?,?,?,?,?,?)');
        $st->execute([
            (int)$_POST['tid'],
            (int)$_POST['item_order'],
            $_POST['item_type'],
            trim($_POST['description']),
            trim($_POST['expected_value'] ?? ''),
            (int)($_POST['is_required'] ?? 1)
        ]);
        $itemMsg = 'เพิ่มรายการตรวจสอบเรียบร้อย';
        $tid = (int)$_POST['tid'];
    } catch (Exception $e) {
        $itemMsg = 'error: ' . $e->getMessage();
    }
}

$items = [];
if ($tid) {
    $s = $pdo->prepare('SELECT * FROM checklist_template_items WHERE template_id=? ORDER BY item_order');
    $s->execute([$tid]);
    $items = $s->fetchAll();
}
?>

<div class="page-header">
    <div>
        <h1 class="page-title">📋 แม่แบบรายการตรวจสอบ (Checklist Templates)</h1>
        <p class="page-desc">จัดการรายการตรวจสอบสำหรับงาน PM/AM, สอบเทียบ และความปลอดภัย</p>
    </div>
    <div>
        <a href="index.php" class="btn btn-secondary">&larr; กลับหน้าตั้งค่า</a>
    </div>
</div>

<?php if ($msg): ?>
<div class="alert <?= str_starts_with($msg, 'error') ? 'alert-error' : 'alert-success' ?>">
    <?= htmlspecialchars($msg) ?>
</div>
<?php endif; ?>

<div class="form-section mb-6">
    <h2 class="form-section-title"><?= $editRow ? '✏️ แก้ไขแม่แบบ Checklist' : '➕ สร้างแม่แบบ Checklist ใหม่' ?></h2>
    <form method="post" class="form-grid">
        <?php if ($editRow): ?><input type="hidden" name="id" value="<?= $editRow['id'] ?>"><?php endif; ?>
        <div>
            <label class="form-label">รหัสแม่แบบ <span class="req">*</span></label>
            <input type="text" name="code" value="<?= $editRow ? htmlspecialchars($editRow['code']) : '' ?>" required placeholder="เช่น CHK-PM-001">
        </div>
        <div>
            <label class="form-label">ชื่อแม่แบบ <span class="req">*</span></label>
            <input type="text" name="name" value="<?= $editRow ? htmlspecialchars($editRow['name']) : '' ?>" required placeholder="เช่น เช็คลิสต์ประจำเดือน มอเตอร์">
        </div>
        <div>
            <label class="form-label">หมวดหมู่</label>
            <select name="category">
                <?php foreach ($cats as $ck => $cv): ?>
                <option value="<?= $ck ?>" <?= $editRow && $editRow['category'] === $ck ? 'selected' : '' ?>><?= $cv ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">สถานะ</label>
            <select name="is_active">
                <option value="1" <?= $editRow && !$editRow['is_active'] ? '' : 'selected' ?>>Active</option>
                <option value="0" <?= $editRow && !$editRow['is_active'] ? 'selected' : '' ?>>Inactive</option>
            </select>
        </div>
        <div style="grid-column: span 2;">
            <label class="form-label">คำอธิบาย</label>
            <input type="text" name="description" value="<?= $editRow ? htmlspecialchars($editRow['description'] ?? '') : '' ?>" placeholder="อธิบายการใช้งาน...">
        </div>
        <div style="display:flex;gap:10px;align-items:flex-end;">
            <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
            <?php if ($editRow): ?><a href="?" class="btn btn-secondary">ยกเลิก</a><?php endif; ?>
        </div>
    </form>
</div>

<div class="table-wrap mb-6">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>รหัส</th>
                <th>ชื่อแม่แบบ Checklist</th>
                <th>หมวดหมู่</th>
                <th>สถานะ</th>
                <th>จัดการรายการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p class="empty-state-title">ไม่มีข้อมูลแม่แบบ Checklist</p>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r): ?>
            <tr>
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-code"><?= htmlspecialchars($r['code']) ?></td>
                <td class="col-primary">
                    <a href="?tid=<?= $r['id'] ?>" style="color:var(--accent-cyan);text-decoration:none;font-weight:600;">
                        <?= htmlspecialchars($r['name']) ?> ➔ (จัดการข้อ)
                    </a>
                </td>
                <td><span class="badge badge-info"><?= $cats[$r['category']] ?? $r['category'] ?></span></td>
                <td><span class="badge <?= $r['is_active'] ? 'badge-active' : 'badge-inactive' ?>"><?= $r['is_active'] ? 'Active' : 'Inactive' ?></span></td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <a href="?tid=<?= $r['id'] ?>" class="btn btn-sm btn-secondary">จัดการข้อ</a>
                        <a href="?edit=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="?delete=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบแม่แบบนี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php if ($tid):
    $tpl = $pdo->prepare('SELECT * FROM checklist_templates WHERE id=?');
    $tpl->execute([$tid]);
    $tpl = $tpl->fetch();
    if ($tpl):
?>
<div class="card p-5" style="border:1px solid var(--brand-500);background:var(--bg-raised);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:var(--text-primary);">
            📝 รายการข้อย่อย: <span style="color:var(--accent-cyan);"><?= htmlspecialchars($tpl['name']) ?></span> (<?= htmlspecialchars($tpl['code']) ?>)
        </h3>
        <a href="?" class="btn btn-sm btn-secondary">✕ ปิดหน้าต่างข้อย่อย</a>
    </div>

    <?php if ($itemMsg): ?>
    <div class="alert <?= str_starts_with($itemMsg, 'error') ? 'alert-error' : 'alert-success' ?>">
        <?= htmlspecialchars($itemMsg) ?>
    </div>
    <?php endif; ?>

    <form method="post" style="display:grid;grid-template-columns:80px 140px 1fr 160px auto;gap:10px;align-items:flex-end;background:var(--bg-base);padding:14px;border-radius:var(--radius-md);margin-bottom:16px;border:1px solid var(--border-md);">
        <input type="hidden" name="add_item" value="1">
        <input type="hidden" name="tid" value="<?= $tid ?>">
        <div>
            <label class="form-label">ลำดับ</label>
            <input type="number" name="item_order" value="<?= count($items) + 1 ?>" min="1">
        </div>
        <div>
            <label class="form-label">ประเภทข้อ</label>
            <select name="item_type">
                <option value="yes_no">Yes/No</option>
                <option value="pass_fail">Pass/Fail</option>
                <option value="text">Text (ข้อความ)</option>
                <option value="number">Number (ตัวเลข)</option>
                <option value="measurement">Measurement (วัดค่า)</option>
                <option value="dropdown">Dropdown</option>
            </select>
        </div>
        <div>
            <label class="form-label">รายละเอียดคำถาม/การตรวจ <span class="req">*</span></label>
            <input type="text" name="description" required placeholder="เช่น ตรวจสอบความตึงสายพาน...">
        </div>
        <div>
            <label class="form-label">ค่าที่คาดหวัง</label>
            <input type="text" name="expected_value" placeholder="เช่น Pass หรือ 220V">
        </div>
        <div>
            <button type="submit" class="btn btn-primary">+ เพิ่มข้อ</button>
        </div>
    </form>

    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th class="row-num">ลำดับ</th>
                    <th>ประเภท</th>
                    <th>รายละเอียดคำถาม</th>
                    <th>ค่าคาดหวัง</th>
                    <th>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($items)): ?>
                <tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">ยังไม่มีรายการข้อย่อยในแม่แบบนี้</td></tr>
                <?php else: ?>
                <?php foreach ($items as $i): ?>
                <tr>
                    <td class="row-num"><?= $i['item_order'] ?></td>
                    <td><span class="badge badge-info"><?= $i['item_type'] ?></span></td>
                    <td class="col-primary"><?= htmlspecialchars($i['description']) ?></td>
                    <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent-emerald);"><?= htmlspecialchars($i['expected_value'] ?? '-') ?></td>
                    <td>
                        <a href="?tid=<?= $tid ?>&del_item=<?= $i['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบข้อนี้?">ลบข้อ</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php endif; endif; ?>

<?php renderFooter(); ?>
