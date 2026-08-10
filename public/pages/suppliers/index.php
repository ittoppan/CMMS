<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ผู้จำหน่าย — CMMS-TPT';
renderHeader();

$pdo = getDb();
$search = trim($_GET['search'] ?? '');
$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(s.name LIKE ? OR s.code LIKE ? OR s.contact_person LIKE ? OR s.phone LIKE ?)';
    $params = array_merge($params, ["%$search%","%$search%","%$search%","%$search%"]);
}
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$stmt = $pdo->prepare('SELECT * FROM suppliers s ' . $where . ' ORDER BY s.name');
$stmt->execute($params);
$rows = $stmt->fetchAll();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">🏢 ผู้จำหน่ายและผู้ให้บริการ</h1>
        <p class="page-desc">Suppliers & Vendors Management (ทั้งหมด <?= count($rows) ?> รายการ)</p>
    </div>
    <div>
        <a href="create.php" class="btn btn-primary">+ เพิ่มผู้จำหน่าย</a>
    </div>
</div>

<div class="filter-bar">
    <?php include __DIR__ . '/../../../src/components/search_form.php'; ?>
</div>

<div class="table-wrap">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>รหัสผู้จำหน่าย</th>
                <th>ชื่อบริษัท / ผู้จำหน่าย</th>
                <th>ผู้ติดต่อ</th>
                <th>เบอร์โทรศัพท์</th>
                <th>อีเมล</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <div class="empty-state-icon">🏢</div>
                        <p class="empty-state-title">ไม่มีข้อมูลผู้จำหน่าย</p>
                        <p class="empty-state-desc">ยังไม่มีการบันทึกผู้จำหน่ายในระบบ</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ เพิ่มผู้จำหน่ายแรก</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r): ?>
            <tr>
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-code"><?= htmlspecialchars($r['code']) ?></td>
                <td class="col-primary"><?= htmlspecialchars($r['name']) ?></td>
                <td><?= htmlspecialchars($r['contact_person'] ?? '-') ?></td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:12px;"><?= htmlspecialchars($r['phone'] ?? '-') ?></td>
                <td style="font-size:12px;color:var(--text-secondary);"><?= htmlspecialchars($r['email'] ?? '-') ?></td>
                <td>
                    <span class="badge <?= $r['is_active'] ? 'badge-active' : 'badge-inactive' ?>">
                        <?= $r['is_active'] ? 'Active' : 'Inactive' ?>
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบผู้จำหน่าย &quot;<?= htmlspecialchars($r['name']) ?>&quot;?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
