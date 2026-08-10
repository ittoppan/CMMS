<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ยืม-คืน อุปกรณ์ — CMMS-TPT';
$pdo = getDb();

$search = trim($_GET['search'] ?? '');
$filterStatus = trim($_GET['status'] ?? '');
$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(u1.full_name LIKE ? OR a.name LIKE ? OR a.code LIKE ?)';
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($filterStatus !== '') {
    $conditions[] = 'eb.status = ?';
    $params[] = $filterStatus;
}
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

$stmt = $pdo->prepare('
    SELECT eb.*, a.name AS asset_name, a.code AS asset_code,
           u1.full_name AS borrower_name, u2.full_name AS processor_name,
           br.name AS reason_name
    FROM equipment_borrowing eb
    LEFT JOIN asset_registry a ON eb.asset_id = a.id
    LEFT JOIN users u1 ON eb.borrower_id = u1.id
    LEFT JOIN users u2 ON eb.processed_by = u2.id
    LEFT JOIN borrowing_reasons br ON eb.reason_id = br.id
    ' . $where . '
    ORDER BY eb.borrow_date DESC
');
$stmt->execute($params);
$rows = $stmt->fetchAll();

$sbadge = ['borrowed'=>'badge-in_progress','returned'=>'badge-active','overdue'=>'badge-critical','lost'=>'badge-inactive'];
$statusOptions = ['borrowed'=>'Borrowed','returned'=>'Returned','overdue'=>'Overdue','lost'=>'Lost'];

renderHeader();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">📦 ยืม-คืน อุปกรณ์</h1>
        <p class="page-desc">Equipment Borrowing & Return Management (ทั้งหมด <?= count($rows) ?> รายการ)</p>
    </div>
    <div>
        <a href="create.php" class="btn btn-primary">+ บันทึกการยืม</a>
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
                <th>อุปกรณ์</th>
                <th>ผู้ยืม</th>
                <th>เหตุผล</th>
                <th>วันที่ยืม</th>
                <th>กำหนดคืน</th>
                <th>คืนจริง</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-icon">📦</div>
                        <p class="empty-state-title">ไม่มีรายการยืม-คืน</p>
                        <p class="empty-state-desc">ยังไม่มีประวัติการยืมอุปกรณ์ในระบบ</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ บันทึกการยืมแรก</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r): ?>
            <tr>
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-primary">
                    <span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code'] ?? '') ?></span>
                    <span style="display:block;"><?= htmlspecialchars($r['asset_name'] ?? '-') ?></span>
                </td>
                <td class="col-primary"><?= htmlspecialchars($r['borrower_name'] ?? '-') ?></td>
                <td><?= htmlspecialchars($r['reason_name'] ?? $r['purpose'] ?? '-') ?></td>
                <td style="white-space:nowrap;font-size:12px;"><?= htmlspecialchars(substr($r['borrow_date'], 0, 16)) ?></td>
                <td style="white-space:nowrap;font-size:12px;"><?= htmlspecialchars($r['expected_return_date'] ?? '-') ?></td>
                <td style="white-space:nowrap;font-size:12px;"><?= htmlspecialchars($r['actual_return_date'] ? substr($r['actual_return_date'], 0, 16) : '-') ?></td>
                <td>
                    <span class="badge <?= $sbadge[$r['status']] ?? 'badge-info' ?>">
                        <?= $statusOptions[$r['status']] ?? $r['status'] ?>
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบรายการยืมนี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
