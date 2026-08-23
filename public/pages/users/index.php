<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ผู้ใช้ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$search = trim($_GET['search'] ?? '');
$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)';
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$stmt = $pdo->prepare("SELECT u.*, r.name AS role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id $where ORDER BY u.created_at DESC");
$stmt->execute($params);
$rows = $stmt->fetchAll();
?>

<div class="space-y-4">
    <div class="flex items-center justify-between">
        <div><h1 class="text-2xl font-bold text-primary">ผู้ใช้ระบบ</h1><p class="mt-1 text-sm text-muted">Users</p></div>
        <a href="create.php" class="btn-primary">+ เพิ่มผู้ใช้</a>
    </div>
    <div class="card p-4 shadow">
        <?php include __DIR__ . '/../../../src/components/search_form.php'; ?>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table">
            <thead class="bg-subtle">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">ชื่อผู้ใช้</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">ชื่อ-นามสกุล</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">อีเมล</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">บทบาท</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">เบอร์โทร</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">สถานะ LINE</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">สถานะ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-muted uppercase">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-line">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-subtle">
                    <td data-label="ชื่อผู้ใช้" class="px-4 py-3 text-sm font-medium text-primary"><?= htmlspecialchars($r['username']) ?></td>
                    <td data-label="ชื่อ-นามสกุล" class="px-4 py-3 text-sm text-secondary">
                        <div class="flex items-center gap-3">
                            <img src="<?= getImageUrl($r['avatar_path'] ?? '', 'avatar') ?>" class="w-8 h-8 rounded-full object-cover border border-line shadow-sm flex-shrink-0">
                            <span class="font-bold text-primary"><?= htmlspecialchars($r['full_name']) ?></span>
                        </div>
                    </td>
                    <td data-label="อีเมล" class="px-4 py-3 text-sm text-secondary"><?= htmlspecialchars($r['email']) ?></td>
                    <td data-label="บทบาท" class="px-4 py-3 text-sm">
                        <span class="badge bg-primary-100 text-primary-800"><?= htmlspecialchars($r['role_name'] ?? '-') ?></span>
                    </td>
                    <td data-label="เบอร์โทร" class="px-4 py-3 text-sm text-secondary"><?= htmlspecialchars($r['phone'] ?? '-') ?></td>
                    <td data-label="สถานะ LINE" class="px-4 py-3 text-sm">
                        <?php if (!empty($r['line_user_id'])): ?>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium badge badge-success">🟢 ผูก LINE แล้ว</span>
                        <?php else: ?>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium status-inactive">⚪ ยังไม่ผูก LINE</span>
                        <?php endif; ?>
                    </td>
                    <td data-label="สถานะ" class="px-4 py-3 text-sm">
                        <span class="badge <?= $r['is_active'] ? 'status-active' : 'status-inactive' ?>"><?= $r['is_active'] ? 'Active' : 'Inactive' ?></span>
                    </td>
                    <td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2"><a href="edit.php?id=<?= $r['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a><a href="delete.php?id=<?= $r['id'] ?>" class="text-red-600 hover:text-red-700" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?>
                <tr><td colspan="7" class="cmms-empty-state-cell">ไม่มีข้อมูลผู้ใช้</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
