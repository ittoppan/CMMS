<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ประวัติงานซ่อม - CMMS-TPT';
renderHeader();
$pdo = getDb();

$search = trim($_GET['search'] ?? '');
$filterStatus = trim($_GET['status'] ?? '');
$filterPriority = trim($_GET['priority'] ?? '');
$filterAssigned = trim($_GET['assigned_to'] ?? '');
$filterDept = trim($_GET['department_id'] ?? '');
$filterSafety = trim($_GET['safety_related'] ?? '');
$filterDateFrom = trim($_GET['date_from'] ?? '');
$filterDateTo = trim($_GET['date_to'] ?? '');
$hasRating = trim($_GET['has_rating'] ?? '');

$conditions = [];
$params = [];
if ($search !== '') { $conditions[] = '(r.title LIKE ? OR a.name LIKE ?)'; $params[] = "%$search%"; $params[] = "%$search%"; }
if ($filterStatus !== '') { $conditions[] = 'r.status = ?'; $params[] = $filterStatus; }
if ($filterPriority !== '') { $conditions[] = 'r.priority = ?'; $params[] = $filterPriority; }
if ($filterAssigned !== '') { $conditions[] = 'r.assigned_to = ?'; $params[] = (int)$filterAssigned; }
if ($filterDept !== '') { $conditions[] = 'r.department_id = ?'; $params[] = (int)$filterDept; }
if ($filterSafety === 'yes') { $conditions[] = 'r.safety_related = 1'; }
if ($filterDateFrom !== '') { $conditions[] = 'r.created_at >= ?'; $params[] = $filterDateFrom . ' 00:00:00'; }
if ($filterDateTo !== '') { $conditions[] = 'r.created_at <= ?'; $params[] = $filterDateTo . ' 23:59:59'; }
if ($hasRating === 'yes') { $conditions[] = 'EXISTS (SELECT 1 FROM repair_ratings rr2 WHERE rr2.repair_id = r.id)'; }

$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

$statusOptions = [
    'open'=>'Open','acknowledged'=>'Acknowledged','in_progress'=>'In Progress',
    'waiting_parts'=>'Waiting Parts','waiting_approval'=>'Waiting Approval',
    'resolved'=>'Resolved','closed'=>'Closed','cancelled'=>'Cancelled','rejected'=>'Rejected'
];
$priorityOptions = ['low'=>'Low','medium'=>'Medium','high'=>'High','critical'=>'Critical'];
$users = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$depts = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();

try {
    $sql = "SELECT r.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS assigned_name,
                   rr.rating_score, rr.rating_comment, rr.response_time_hrs, rr.resolve_time_hrs, rr.downtime_hrs
            FROM repair r
            LEFT JOIN asset_registry a ON r.asset_id = a.id
            LEFT JOIN users u ON r.assigned_to = u.id
            LEFT JOIN repair_ratings rr ON r.id = rr.repair_id
            $where
            ORDER BY r.created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $repairs = $stmt->fetchAll();
} catch (Exception $e) {
    echo '<div class="cmms-banner error p-4 rounded">DB Error: ' . htmlspecialchars($e->getMessage()) . '</div>';
    $repairs = [];
}
?>
<div class="space-y-4">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">ประวัติงานซ่อม</h1>
            <p class="mt-1 text-sm text-gray-500">ดูประวัติงานซ่อมทั้งหมด พร้อมผลการประเมิน</p>
        </div>
        <div class="flex gap-2">
            <a href="index.php" class="inline-flex items-center px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-md hover:bg-primary-700">&larr; กลับ</a>
            <span class="inline-flex items-center px-4 py-2 bg-gray-300 text-gray-600 text-sm font-medium rounded-md cursor-not-allowed">ส่งออก (เร็วๆ นี้)</span>
        </div>
    </div>

    <div class="card p-4 shadow">
        <form method="GET" class="flex flex-wrap items-end gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">ค้นหา</label><input type="text" name="search" value="<?= htmlspecialchars($search) ?>" placeholder="ค้นหา..." class="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">สถานะ</label>
                <select name="status" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($statusOptions as $val => $label): ?>
                    <option value="<?= $val ?>" <?= $filterStatus===$val?'selected':'' ?>><?= htmlspecialchars($label) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">ความสำคัญ</label>
                <select name="priority" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($priorityOptions as $val => $label): ?>
                    <option value="<?= $val ?>" <?= $filterPriority===$val?'selected':'' ?>><?= htmlspecialchars($label) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">ช่าง</label>
                <select name="assigned_to" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>" <?= $filterAssigned==(string)$u['id']?'selected':'' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">แผนก</label>
                <select name="department_id" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <?php foreach ($depts as $d): ?>
                    <option value="<?= $d['id'] ?>" <?= $filterDept===(string)$d['id']?'selected':'' ?>><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">จากวันที่</label><input type="date" name="date_from" value="<?= htmlspecialchars($filterDateFrom) ?>" class="px-3 py-2 border border-gray-300 rounded-md text-sm"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">ถึงวันที่</label><input type="date" name="date_to" value="<?= htmlspecialchars($filterDateTo) ?>" class="px-3 py-2 border border-gray-300 rounded-md text-sm"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Safety</label>
                <select name="safety_related" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <option value="yes" <?= $filterSafety==='yes'?'selected':'' ?>>เฉพาะ Safety</option>
                </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">ประเมินผล</label>
                <select name="has_rating" class="px-3 py-2 border border-gray-300 rounded-md text-sm">
                    <option value="">ทั้งหมด</option>
                    <option value="yes" <?= $hasRating==='yes'?'selected':'' ?>>มีประเมินผล</option>
                </select>
            </div>
            <button type="submit" class="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-md hover:bg-primary-700">ค้นหา</button>
            <?php if ($search!==''||$filterStatus!==''||$filterPriority!==''||$filterAssigned!==''||$filterDept!==''||$filterDateFrom!==''||$filterDateTo!==''||$filterSafety!==''||$hasRating!==''): ?>
            <a href="history.php" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 underline">ล้างตัวกรอง</a>
            <?php endif; ?>
        </form>
    </div>

    <div class="card shadow overflow-hidden overflow-x-auto">
        <table class="data-table cmms-stack-table">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">หัวข้อ</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">ทรัพย์สิน</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">ช่าง</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">สำคัญ</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Safety</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">คะแนน</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">เวลา</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php if (empty($repairs)): ?>
                <tr><td colspan="9" class="cmms-empty-state-cell">ไม่มีข้อมูล</td></tr>
                <?php else: ?>
                <?php foreach ($repairs as $r): ?>
                <tr class="hover:bg-gray-50">
                    <td data-label="หัวข้อ" class="px-3 py-3 text-sm font-medium"><a href="view.php?id=<?= $r['id'] ?>" class="text-primary-600 hover:underline"><?= htmlspecialchars($r['title']) ?></a></td>
                    <td data-label="ทรัพย์สิน" class="px-3 py-3 text-sm text-gray-600"><?= htmlspecialchars(($r['asset_code']??'').' - '.($r['asset_name']??'-')) ?></td>
                    <td data-label="ช่าง" class="px-3 py-3 text-sm text-gray-600"><?= htmlspecialchars($r['assigned_name']??'-') ?></td>
                    <td data-label="สถานะ" class="px-3 py-3 text-sm"><?php $sc=['open'=>'status-open','acknowledged'=>'status-acknowledged','in_progress'=>'status-in_progress','waiting_parts'=>'status-waiting_parts','waiting_approval'=>'status-waiting_approval','resolved'=>'status-resolved','closed'=>'status-closed','cancelled'=>'status-cancelled','rejected'=>'status-rejected']; ?><span class="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full <?= $sc[$r['status']]??'status-closed' ?>"><?= htmlspecialchars($statusOptions[$r['status']]??$r['status']) ?></span></td>
                    <td data-label="สำคัญ" class="px-3 py-3 text-sm"><?php $pm=['low'=>'priority-low','medium'=>'priority-medium','high'=>'priority-high','critical'=>'priority-critical']; ?><span class="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full <?= $pm[$r['priority']]??'priority-low' ?>"><?= htmlspecialchars($r['priority']) ?></span></td>
                    <td data-label="Safety" class="px-3 py-3 text-sm text-center"><?= $r['safety_related'] ? '<span class="text-red-500">&#9888;</span>' : '-' ?></td>
                    <td data-label="คะแนน" class="px-3 py-3 text-sm">
                        <?php if ($r['rating_score']): ?>
                        <span class="text-yellow-500"><?= str_repeat('&#9733;', (int)$r['rating_score']) ?></span>
                        <?php else: ?>
                        <span class="text-gray-400">-</span>
                        <?php endif; ?>
                    </td>
                    <td data-label="เวลา" class="px-3 py-3 text-xs text-gray-500">
                        <?php if ($r['resolve_time_hrs']): ?>ซ่อม: <?= htmlspecialchars($r['resolve_time_hrs']) ?>ชม.<?php endif; ?>
                        <?php if ($r['downtime_hrs']): ?><br>DT: <?= htmlspecialchars($r['downtime_hrs']) ?>ชม.<?php endif; ?>
                    </td>
                    <td data-label="วันที่" class="px-3 py-3 text-sm text-gray-500"><?= htmlspecialchars(date('d/m/Y', strtotime($r['created_at']))) ?></td>
                </tr>
                <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
