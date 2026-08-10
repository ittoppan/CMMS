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
        <div><h1 class="text-2xl font-bold text-gray-900">ผู้ใช้ระบบ</h1><p class="mt-1 text-sm text-gray-500">Users</p></div>
        <a href="create.php" class="btn-primary">+ เพิ่มผู้ใช้</a>
    </div>
    <div class="bg-white p-4 rounded-lg shadow">
        <?php include __DIR__ . '/../../../src/components/search_form.php'; ?>
    </div>
    <div class="card overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อผู้ใช้</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อ-นามสกุล</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">อีเมล</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">บทบาท</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">เบอร์โทร</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ LINE</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm font-medium text-gray-900"><?= htmlspecialchars($r['username']) ?></td>
                    <td class="px-4 py-3 text-sm text-gray-700">
                        <div class="flex items-center gap-3">
                            <img src="<?= getImageUrl($r['avatar_path'] ?? '', 'avatar') ?>" class="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-sm flex-shrink-0">
                            <span class="font-bold text-gray-900"><?= htmlspecialchars($r['full_name']) ?></span>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['email']) ?></td>
                    <td class="px-4 py-3 text-sm">
                        <span class="badge bg-primary-100 text-primary-800"><?= htmlspecialchars($r['role_name'] ?? '-') ?></span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['phone'] ?? '-') ?></td>
                    <td class="px-4 py-3 text-sm">
                        <?php if (!empty($r['line_user_id'])): ?>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium badge badge-success">🟢 ผูก LINE แล้ว</span>
                        <?php else: ?>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">⚪ ยังไม่ผูก LINE</span>
                        <?php endif; ?>
                    </td>
                    <td class="px-4 py-3 text-sm">
                        <span class="badge <?= $r['is_active'] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800' ?>"><?= $r['is_active'] ? 'Active' : 'Inactive' ?></span>
                    </td>
                    <td class="px-4 py-3 text-sm space-x-2"><a href="edit.php?id=<?= $r['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a><a href="delete.php?id=<?= $r['id'] ?>" class="text-red-600 hover:text-red-700" onclick="return confirm('ลบรายการนี้?')">ลบ</a></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?>
                <tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูลผู้ใช้</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
