<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'สิทธิ์การใช้งาน — CMMS-TPT';
renderHeader();

$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id    = (int)($_POST['id'] ?? 0);
        $rid   = $_POST['role_id'] ? (int)$_POST['role_id'] : null;
        $uid   = $_POST['user_id'] ? (int)$_POST['user_id'] : null;
        $mod   = $_POST['module'];
        $perm  = $_POST['permission'];
        $grant = (int)($_POST['is_granted'] ?? 1);

        if ($id) {
            $pdo->prepare('UPDATE user_permissions SET role_id=?, user_id=?, module=?, permission=?, is_granted=? WHERE id=?')
                ->execute([$rid, $uid, $mod, $perm, $grant, $id]);
            $msg = 'บันทึกการแก้ไขสิทธิ์การใช้งานเรียบร้อย';
        } else {
            $pdo->prepare('INSERT INTO user_permissions (role_id, user_id, module, permission, is_granted) VALUES (?,?,?,?,?)')
                ->execute([$rid, $uid, $mod, $perm, $grant]);
            $msg = 'เพิ่มกำหนดสิทธิ์การใช้งานเรียบร้อย';
        }
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$delId = (int)($_GET['delete'] ?? 0);
if ($delId) {
    try {
        $pdo->prepare('DELETE FROM user_permissions WHERE id=?')->execute([$delId]);
        $msg = 'ลบสิทธิ์การใช้งานเรียบร้อย';
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$editId  = (int)($_GET['edit'] ?? 0);
$editRow = null;
if ($editId) {
    $s = $pdo->prepare('SELECT * FROM user_permissions WHERE id=?');
    $s->execute([$editId]);
    $editRow = $s->fetch();
}

$rows  = $pdo->query('SELECT p.*, r.name role_name, u.full_name user_name FROM user_permissions p LEFT JOIN roles r ON p.role_id=r.id LEFT JOIN users u ON p.user_id=u.id ORDER BY p.module, p.permission')->fetchAll();
$roles = $pdo->query('SELECT id, name FROM roles ORDER BY name')->fetchAll();
$users = $pdo->query('SELECT id, full_name FROM users ORDER BY full_name')->fetchAll();

$modules = ['repair','pm_am','calibration','spare_parts','asset_registry','settings','users','suppliers','equipment_borrowing','manuals','mtbf_mttr','reports'];
$permissions = ['view','create','edit','delete','approve','assign'];
?>

<div class="page-header">
    <div>
        <h1 class="page-title">🔐 สิทธิ์การใช้งานรายละเอียด (Granular Permissions)</h1>
        <p class="page-desc">กำหนดสิทธิ์เข้าถึง (View, Create, Edit, Delete, Approve, Assign) รายโมดูลตามบทบาทหรือรายผู้ใช้</p>
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
    <h2 class="form-section-title"><?= $editRow ? '✏️ แก้ไขกำหนดสิทธิ์' : '➕ เพิ่มกำหนดสิทธิ์การใช้งาน' ?></h2>
    <form method="post" class="form-grid">
        <?php if ($editRow): ?><input type="hidden" name="id" value="<?= $editRow['id'] ?>"><?php endif; ?>
        <div>
            <label class="form-label">บทบาท (Role Scope)</label>
            <select name="role_id">
                <option value="">-- ทั้งหมด (หรือระบุผู้ใช้) --</option>
                <?php foreach ($roles as $r): ?>
                <option value="<?= $r['id'] ?>" <?= $editRow && $editRow['role_id'] == $r['id'] ? 'selected' : '' ?>><?= htmlspecialchars($r['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">ผู้ใช้เฉพาะราย (User Scope)</label>
            <select name="user_id">
                <option value="">-- ทั้งหมด (อิงตามบทบาท) --</option>
                <?php foreach ($users as $u): ?>
                <option value="<?= $u['id'] ?>" <?= $editRow && $editRow['user_id'] == $u['id'] ? 'selected' : '' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">โมดูลระบบ <span class="req">*</span></label>
            <select name="module" required>
                <?php foreach ($modules as $m): ?>
                <option value="<?= $m ?>" <?= $editRow && $editRow['module'] === $m ? 'selected' : '' ?>><?= $m ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">ประเภทสิทธิ์ <span class="req">*</span></label>
            <select name="permission" required>
                <?php foreach ($permissions as $p): ?>
                <option value="<?= $p ?>" <?= $editRow && $editRow['permission'] === $p ? 'selected' : '' ?>><?= $p ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="form-label">สถานะการอนุญาต</label>
            <select name="is_granted">
                <option value="1" <?= $editRow && !$editRow['is_granted'] ? '' : 'selected' ?>>Granted — อนุญาต</option>
                <option value="0" <?= $editRow && !$editRow['is_granted'] ? 'selected' : '' ?>>Denied — ไม่อนุญาต</option>
            </select>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-end;">
            <button type="submit" class="btn btn-primary">บันทึกสิทธิ์</button>
            <?php if ($editRow): ?><a href="?" class="btn btn-secondary">ยกเลิก</a><?php endif; ?>
        </div>
    </form>
</div>

<div class="table-wrap">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>บทบาท (Role)</th>
                <th>ผู้ใช้ (User Scope)</th>
                <th>โมดูล</th>
                <th>สิทธิ์การกระทำ</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <div class="empty-state-icon">🔐</div>
                        <p class="empty-state-title">ไม่มีข้อมูลกำหนดสิทธิ์เฉพาะ</p>
                        <p class="empty-state-desc">สิทธิ์ปัจจุบันถูกกำหนดโดยค่าเริ่มต้นของระบบ</p>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r): ?>
            <tr>
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-primary"><?= htmlspecialchars($r['role_name'] ?? 'ทุกบทบาท (*)') ?></td>
                <td><?= htmlspecialchars($r['user_name'] ?? 'ทุกคน (*)') ?></td>
                <td><span class="badge badge-info"><?= htmlspecialchars($r['module']) ?></span></td>
                <td><code style="font-family:'JetBrains Mono',monospace;color:var(--accent-cyan);"><?= htmlspecialchars($r['permission']) ?></code></td>
                <td>
                    <span class="badge <?= $r['is_granted'] ? 'badge-active' : 'badge-critical' ?>">
                        <?= $r['is_granted'] ? 'Granted' : 'Denied' ?>
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <a href="?edit=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="?delete=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบสิทธิ์นี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
