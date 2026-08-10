<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'งานของฉัน - CMMS-TPT';
renderHeader();
$pdo = getDb();
$userId = (int)$_SESSION['user_id'];

$statusOptions = [
    'open'=>'Open','acknowledged'=>'Acknowledged','in_progress'=>'In Progress',
    'waiting_parts'=>'Waiting Parts','waiting_approval'=>'Waiting Approval',
    'resolved'=>'Resolved'
];
$statusColors = [
    'open'=>'bg-blue-100 text-blue-800','acknowledged'=>'bg-indigo-100 text-indigo-800',
    'in_progress'=>'bg-yellow-100 text-yellow-800','waiting_parts'=>'bg-orange-100 text-orange-800',
    'waiting_approval'=>'bg-purple-100 text-purple-800','resolved'=>'bg-green-100 text-green-800'
];

try {
    $stmt = $pdo->prepare("
        SELECT r.*, a.name AS asset_name, a.code AS asset_code
        FROM repair r
        LEFT JOIN asset_registry a ON r.asset_id = a.id
        WHERE r.assigned_to = ?
          AND r.status NOT IN ('closed','cancelled','rejected')
        ORDER BY FIELD(r.priority,'critical','high','medium','low') ASC, r.created_at ASC
    ");
    $stmt->execute([$userId]);
    $repairs = $stmt->fetchAll();
} catch (Exception $e) {
    echo '<div class="bg-red-50 text-red-700 p-4 rounded">DB Error: ' . htmlspecialchars($e->getMessage()) . '</div>';
    $repairs = [];
}

$counts = ['open'=>0,'acknowledged'=>0,'in_progress'=>0,'waiting_parts'=>0,'waiting_approval'=>0,'resolved'=>0];
foreach ($repairs as $r) { if (isset($counts[$r['status']])) $counts[$r['status']]++; }
?>
<div class="space-y-4">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">งานของฉัน</h1>
            <p class="mt-1 text-sm text-gray-500">รายการงานซ่อมที่รับผิดชอบ (ไม่รวมงานที่ปิดแล้ว)</p>
        </div>
        <a href="index.php" class="inline-flex items-center px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-md hover:bg-primary-700">&larr; กลับไปงานทั้งหมด</a>
    </div>

    <div class="flex flex-wrap gap-2 text-sm">
        <?php foreach ($counts as $st => $cnt): ?>
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold <?= $statusColors[$st] ?>">
            <?= htmlspecialchars($statusOptions[$st]) ?> (<?= $cnt ?>)
        </span>
        <?php endforeach; ?>
    </div>

    <div class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้องาน</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ทรัพย์สิน</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ความสำคัญ</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php if (empty($repairs)): ?>
                <tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">ไม่มีงานที่ได้รับมอบหมาย</td></tr>
                <?php else: ?>
                <?php foreach ($repairs as $r): ?>
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm font-medium text-gray-900"><?= htmlspecialchars($r['title']) ?></td>
                    <td class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars(($r['asset_code']??'').' - '.($r['asset_name']??'-')) ?></td>
                    <td class="px-4 py-3 text-sm">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full <?= $statusColors[$r['status']] ?? 'bg-gray-100' ?>">
                            <?= htmlspecialchars($statusOptions[$r['status']] ?? $r['status']) ?>
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full
                            <?php $pm=['low'=>'bg-gray-100 text-gray-800','medium'=>'badge badge-info','high'=>'bg-orange-100 text-orange-800','critical'=>'bg-red-100 text-red-800']; echo $pm[$r['priority']]??'bg-gray-100'; ?>">
                            <?= htmlspecialchars($r['priority']) ?>
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-500"><?= htmlspecialchars(date('d/m/Y', strtotime($r['created_at']))) ?></td>
                    <td class="px-4 py-3 text-sm whitespace-nowrap">
                        <div class="flex gap-1">
                            <a href="view.php?id=<?= $r['id'] ?>" class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200">ดู</a>
                            <?php if ($r['status'] === 'open'): ?>
                            <a href="index.php?acknowledge=<?= $r['id'] ?>" class="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700" onclick="return confirm('รับทราบงานนี้?')">รับทราบ</a>
                            <?php endif; ?>
                            <?php if ($r['status'] === 'acknowledged'): ?>
                            <a href="index.php?start=<?= $r['id'] ?>" class="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700" onclick="return confirm('เริ่มดำเนินการ?')">เริ่มงาน</a>
                            <?php endif; ?>
                            <?php if ($r['status'] === 'in_progress' || $r['status'] === 'waiting_parts'): ?>
                            <a href="index.php?resolve=<?= $r['id'] ?>" class="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700" onclick="return confirm('ดำเนินการเสร็จ?')">ซ่อมเสร็จ</a>
                            <?php endif; ?>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
