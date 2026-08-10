<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ผังองค์กร — CMMS-TPT';
renderHeader();

$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id  = (int)($_POST['id'] ?? 0);
        $uid = (int)$_POST['user_id'];
        $sup = $_POST['supervisor_id'] ? (int)$_POST['supervisor_id'] : null;
        $did = $_POST['department_id'] ? (int)$_POST['department_id'] : null;
        $pos = trim($_POST['position'] ?? '');
        $lvl = (int)($_POST['level'] ?? 0);

        if ($id) {
            $pdo->prepare('UPDATE organizational_chart SET user_id=?, supervisor_id=?, department_id=?, position=?, level=? WHERE id=?')
                ->execute([$uid, $sup, $did, $pos, $lvl, $id]);
            $msg = 'บันทึกการแก้ไขผังองค์กรเรียบร้อย';
        } else {
            $pdo->prepare('INSERT INTO organizational_chart (user_id, supervisor_id, department_id, position, level) VALUES (?,?,?,?,?)')
                ->execute([$uid, $sup, $did, $pos, $lvl]);
            $msg = 'เพิ่มรายการผังองค์กรเรียบร้อย';
        }
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$delId = (int)($_GET['delete'] ?? 0);
if ($delId) {
    try {
        $pdo->prepare('DELETE FROM organizational_chart WHERE id=?')->execute([$delId]);
        $msg = 'ลบรายการผังองค์กรเรียบร้อย';
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$editId  = (int)($_GET['edit'] ?? 0);
$editRow = null;
if ($editId) {
    $s = $pdo->prepare('SELECT * FROM organizational_chart WHERE id = ?');
    $s->execute([$editId]);
    $editRow = $s->fetch();
}

$rows  = $pdo->query('SELECT o.*, u.full_name user_name, s.full_name supervisor_name, d.name department_name FROM organizational_chart o LEFT JOIN users u ON o.user_id=u.id LEFT JOIN users s ON o.supervisor_id=s.id LEFT JOIN departments d ON o.department_id=d.id ORDER BY o.level, u.full_name')->fetchAll();
$users = $pdo->query('SELECT id, full_name FROM users ORDER BY full_name')->fetchAll();
$depts = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">🌳 ผังองค์กร (Organizational Chart)</h1>
        <p class="page-desc">โครงสร้างลำดับขั้นการบังคับบัญชาและการอนุมัติงาน</p>
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
    <h2 class="form-section-title"><?= $editRow ? '✏️ แก้ไขรายการผังองค์กร' : '➕ เพิ่มรายการในผังองค์กร' ?></h2>
    <form method="post" class="form-grid">
        <?php if ($editRow): ?><input type="hidden" name="id" value="<?= $editRow['id'] ?>"><?php endif; ?>
        <div>
            <label class="form-label">ผู้ใช้งาน <span class="req">*</span></label>
            <select name="user_id" required>
                <option value="">-- เลือกผู้ใช้ --</option>
                <?php foreach ($users as $u): ?>
                <option value="<?= $u['id'] ?>" <?= $editRow && $editRow['user_id'] == $u['id'] ? 'selected' : '' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">ผู้บังคับบัญชา (Supervisor)</label>
            <select name="supervisor_id">
                <option value="">-- ไม่มี (ระดับสูงสุด) --</option>
                <?php foreach ($users as $u): ?>
                <option value="<?= $u['id'] ?>" <?= $editRow && $editRow['supervisor_id'] == $u['id'] ? 'selected' : '' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">แผนก (Department)</label>
            <select name="department_id">
                <option value="">-- ไม่ระบุ --</option>
                <?php foreach ($depts as $d): ?>
                <option value="<?= $d['id'] ?>" <?= $editRow && $editRow['department_id'] == $d['id'] ? 'selected' : '' ?>><?= htmlspecialchars($d['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">ตำแหน่งงาน</label>
            <input type="text" name="position" value="<?= $editRow ? htmlspecialchars($editRow['position'] ?? '') : '' ?>" placeholder="เช่น Maintenance Manager">
        </div>
        <div>
            <label class="form-label">ระดับชั้น (Level 0 = สูงสุด)</label>
            <input type="number" name="level" value="<?= $editRow ? $editRow['level'] : '0' ?>" min="0">
        </div>
        <div style="display:flex;gap:10px;align-items:flex-end;">
            <button type="submit" class="btn btn-primary">บันทึกข้อมูล</button>
            <?php if ($editRow): ?><a href="?" class="btn btn-secondary">ยกเลิก</a><?php endif; ?>
        </div>
    </form>
</div>

<div class="table-wrap">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">Level</th>
                <th>พนักงาน</th>
                <th>ตำแหน่ง</th>
                <th>แผนก</th>
                <th>ผู้บังคับบัญชา</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <div class="empty-state-icon">🌳</div>
                        <p class="empty-state-title">ไม่มีข้อมูลผังองค์กร</p>
                        <p class="empty-state-desc">ยังไม่มีการเพิ่มโครงสร้างผังองค์กร</p>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $r): ?>
            <tr>
                <td class="row-num" style="font-weight:700;color:var(--accent-cyan);">L<?= $r['level'] ?></td>
                <td class="col-primary"><?= htmlspecialchars($r['user_name'] ?? '-') ?></td>
                <td><?= htmlspecialchars($r['position'] ?? '-') ?></td>
                <td><?= htmlspecialchars($r['department_name'] ?? '-') ?></td>
                <td>
                    <?php if ($r['supervisor_name']): ?>
                    <span style="color:var(--accent-violet);">👤 <?= htmlspecialchars($r['supervisor_name']) ?></span>
                    <?php else: ?>
                    <span class="badge badge-active">Top Level</span>
                    <?php endif; ?>
                </td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <a href="?edit=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="?delete=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบรายการนี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
