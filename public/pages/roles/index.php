<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'จัดการบทบาทผู้ใช้ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$search = trim($_GET['search'] ?? '');
$where = '';
$params = [];
if ($search !== '') {
    $where = 'WHERE r.name LIKE ? OR r.description LIKE ?';
    $params = ["%$search%", "%$search%"];
}
$stmt = $pdo->prepare("
    SELECT r.*, COUNT(u.id) AS user_count
    FROM roles r
    LEFT JOIN users u ON u.role_id = r.id
    $where
    GROUP BY r.id
    ORDER BY r.name
");
$stmt->execute($params);
$rows = $stmt->fetchAll();
?>

<div class="space-y-4">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">จัดการบทบาทผู้ใช้</h1>
            <p class="mt-1 text-sm text-gray-500">กำหนดบทบาทและสิทธิ์การใช้งานระบบ</p>
        </div>
        <a href="create.php" class="btn-primary">+ เพิ่มบทบาท</a>
    </div>

    <div class="bg-white p-4 rounded-lg shadow">
        <form method="get" class="flex gap-3">
            <input type="text" name="search" value="<?= htmlspecialchars($search) ?>"
                placeholder="ค้นหาชื่อบทบาท..." class="input input-bordered w-full flex-1">
            <button type="submit" class="btn-primary">ค้นหา</button>
            <?php if ($search): ?>
                <a href="index.php" class="btn-secondary">ล้าง</a>
            <?php endif; ?>
        </form>
    </div>

    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อบทบาท</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">คำอธิบาย</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จำนวนผู้ใช้</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สร้างเมื่อ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($rows as $r): ?>
                <tr class="hover:bg-gray-50">
                    <td data-label="#" class="px-4 py-3 text-sm text-gray-500"><?= $r['id'] ?></td>
                    <td data-label="ชื่อบทบาท" class="px-4 py-3 text-sm font-semibold text-gray-900"><?= htmlspecialchars($r['name']) ?></td>
                    <td data-label="คำอธิบาย" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['description'] ?? '-') ?></td>
                    <td data-label="จำนวนผู้ใช้" class="px-4 py-3 text-sm">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            <?= $r['user_count'] > 0 ? 'badge badge-info' : 'bg-gray-100 text-gray-600' ?>">
                            <?= $r['user_count'] ?> คน
                        </span>
                    </td>
                    <td data-label="สร้างเมื่อ" class="px-4 py-3 text-sm text-gray-500"><?= htmlspecialchars(substr($r['created_at'], 0, 10)) ?></td>
                    <td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2">
                        <a href="edit.php?id=<?= $r['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a>
                        <?php if ($r['user_count'] == 0): ?>
                        <a href="delete.php?id=<?= $r['id'] ?>"
                            class="text-red-600 hover:text-red-700"
                            onclick="return confirm('ลบบทบาท \"<?= htmlspecialchars($r['name']) ?>\" ใช่หรือไม่?')">ลบ</a>
                        <?php else: ?>
                        <span class="text-gray-400 cursor-not-allowed" title="ไม่สามารถลบได้ เนื่องจากมีผู้ใช้งานอยู่">ลบ</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?>
                <tr><td colspan="6" class="cmms-empty-state-cell">ไม่มีข้อมูลบทบาทผู้ใช้</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <!-- Tip card -->
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <strong>💡 หมายเหตุ:</strong> บทบาทที่มีผู้ใช้งานอยู่จะไม่สามารถลบได้ กรุณาย้ายผู้ใช้ไปบทบาทอื่นก่อนลบ
        หากต้องการกำหนดสิทธิ์ละเอียด ไปที่ <a href="../settings/user_permissions.php" class="underline font-semibold">ตั้งค่าสิทธิ์</a>
    </div>
</div>

<?php renderFooter(); ?>
