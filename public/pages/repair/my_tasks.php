<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'งานของฉัน — CMMS-TPT';
$pdo = getDb();
$userId = (int)$_SESSION['user_id'];

// Handle status transitions BEFORE rendering (same pattern as index.php)
$transitions = [
    'acknowledge' => ['status'=>'acknowledged', 'prev'=>'open',                          'action'=>'acknowledged', 'desc'=>'รับทราบงานซ่อม', 'field'=>'acknowledged_at'],
    'start'       => ['status'=>'in_progress',  'prev'=>'acknowledged',                   'action'=>'in_progress',  'desc'=>'เริ่มดำเนินการซ่อม', 'field'=>'actual_start_at'],
    'wait_parts'  => ['status'=>'waiting_parts','prev'=>'in_progress',                   'action'=>'waiting_parts','desc'=>'รออะไหล่', 'field'=>null],
    'resolve'     => ['status'=>'resolved',     'prev'=>"'in_progress','waiting_parts','waiting_approval'",'action'=>'resolved','desc'=>'ดำเนินการซ่อมเสร็จ','field'=>null],
];
foreach ($transitions as $key => $t) {
    if (isset($_GET[$key])) {
        $rid = (int)$_GET[$key];
        $fieldSql = $t['field'] ? ", {$t['field']}=NOW()" : '';
        $pdo->prepare("UPDATE repair SET status=? {$fieldSql} WHERE id=? AND assigned_to=?")->execute([$t['status'], $rid, $userId]);
        $pdo->prepare("INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)")->execute([$rid, $userId, $t['action'], $t['desc']]);
        header('Location: my_tasks.php'); exit;
    }
}

$statusOptions = [
    'open'=>'Open','acknowledged'=>'Acknowledged','in_progress'=>'In Progress',
    'waiting_parts'=>'Waiting Parts','waiting_approval'=>'Waiting Approval','resolved'=>'Resolved'
];
$sbadge = ['open'=>'badge-open','acknowledged'=>'badge-info','in_progress'=>'badge-in_progress','waiting_parts'=>'badge-medium','waiting_approval'=>'badge-medium','resolved'=>'badge-active'];
$pbadge = ['low'=>'badge-low','medium'=>'badge-medium','high'=>'badge-high','critical'=>'badge-critical'];

$today = date('Y-m-d');
try {
    $stmt = $pdo->prepare("
        SELECT r.*, a.name AS asset_name, a.code AS asset_code,
               TIMESTAMPDIFF(HOUR, r.created_at, NOW()) AS age_hours
        FROM repair r
        LEFT JOIN asset_registry a ON r.asset_id = a.id
        WHERE r.assigned_to = ?
          AND r.status NOT IN ('closed','cancelled','rejected')
        ORDER BY FIELD(r.priority,'critical','high','medium','low') ASC,
                 CASE WHEN r.estimated_completion_date IS NOT NULL AND r.estimated_completion_date < CURDATE() THEN 0 ELSE 1 END ASC,
                 r.created_at ASC
    ");
    $stmt->execute([$userId]);
    $repairs = $stmt->fetchAll();
} catch (Exception $e) {
    $repairs = [];
    $dbError = $e->getMessage();
}

$total   = count($repairs);
$overdue = 0; $critical = 0; $active = 0;
foreach ($repairs as $r) {
    if (!empty($r['estimated_completion_date']) && $r['estimated_completion_date'] < $today && !in_array($r['status'], ['resolved','closed'], true)) $overdue++;
    if (in_array($r['priority'], ['high','critical'], true) && !in_array($r['status'], ['resolved','closed'], true)) $critical++;
    if (in_array($r['status'], ['in_progress','waiting_parts','waiting_approval'], true)) $active++;
}

renderHeader();
?>
<div class="space-y-6">
    <!-- Header -->
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">👷 งานของฉัน</h1>
            <p class="text-sm text-secondary mt-1">My Tasks — งานซ่อมที่คุณรับผิดชอบ (ไม่รวมงานที่ปิดแล้ว)</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">← งานทั้งหมด</a>
            <a href="kanban.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">📊 Kanban</a>
        </div>
    </div>

    <!-- Stat cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="cmms-card cmms-stat-card"><span class="cmms-stat-label">งานค้างทั้งหมด</span><span class="cmms-stat-value"><?= $total ?></span><span class="cmms-stat-hint">ที่ยังไม่ปิด</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#dc2626"><span class="cmms-stat-label">เกินกำหนด</span><span class="cmms-stat-value"><?= $overdue ?></span><span class="cmms-stat-hint">เลย estimated completion</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#ea580c"><span class="cmms-stat-label">เร่งด่วน</span><span class="cmms-stat-value"><?= $critical ?></span><span class="cmms-stat-hint">High / Critical</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#16a34a"><span class="cmms-stat-label">กำลังทำ</span><span class="cmms-stat-value"><?= $active ?></span><span class="cmms-stat-hint">In Progress ขึ้นไป</span></div>
    </div>

    <!-- Status chips -->
    <div class="flex flex-wrap gap-2 text-sm">
        <?php
        $counts = [];
        foreach ($repairs as $r) { $counts[$r['status']] = ($counts[$r['status']] ?? 0) + 1; }
        foreach ($statusOptions as $st => $lbl): if (!isset($counts[$st])) continue; ?>
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold <?= $sbadge[$st] ?? 'badge-inactive' ?>"><?= htmlspecialchars($lbl) ?> (<?= $counts[$st] ?>)</span>
        <?php endforeach; ?>
    </div>

    <!-- Task list -->
    <?php if (empty($repairs)): ?>
    <div class="cmms-card p-10 text-center">
        <div class="text-4xl mb-3">🎉</div>
        <p class="text-secondary font-medium">ไม่มีงานที่ได้รับมอบหมาย</p>
        <p class="text-xs text-secondary mt-1">เมื่อมีงานซ่อมถูก assign ให้คุณ จะมาแสดงที่นี่</p>
    </div>
    <?php else: ?>
    <div class="cmms-card overflow-hidden">
        <div class="overflow-x-auto">
            <table class="data-table w-full text-sm">
                <thead>
                    <tr>
                        <th class="px-4 py-3 text-left">หัวข้องาน</th>
                        <th class="px-4 py-3 text-left">เครื่องจักร</th>
                        <th class="px-4 py-3 text-left">สถานะ</th>
                        <th class="px-4 py-3 text-left">กำหนดเสร็จ</th>
                        <th class="px-4 py-3 text-left">ค้างมา</th>
                        <th class="px-4 py-3 text-left">จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($repairs as $r):
                    $isOverdue = !empty($r['estimated_completion_date']) && $r['estimated_completion_date'] < $today && !in_array($r['status'], ['resolved','closed'], true);
                    $ageD = (int)floor($r['age_hours'] / 24);
                ?>
                    <tr class="<?= $isOverdue ? 'bg-red-50/60' : '' ?>">
                        <td class="px-4 py-3">
                            <div class="font-semibold text-primary flex items-center gap-1.5 flex-wrap">
                                <?= htmlspecialchars($r['title']) ?>
                                <?php if ($r['priority'] === 'critical'): ?><span class="badge <?= $pbadge['critical'] ?>">CRITICAL</span><?php endif; ?>
                                <?php if ($isOverdue): ?><span class="badge badge-critical">⏰ เกินกำหนด</span><?php endif; ?>
                            </div>
                            <div class="text-xs text-secondary mt-0.5"><?= htmlspecialchars($r['work_order_no']) ?> · <?= htmlspecialchars($r['repair_type_name'] ?? '-') ?></div>
                        </td>
                        <td class="px-4 py-3 text-secondary"><?= htmlspecialchars(($r['asset_code'] ?? '') . ' - ' . ($r['asset_name'] ?? '-')) ?></td>
                        <td class="px-4 py-3"><span class="badge <?= $sbadge[$r['status']] ?? 'badge-inactive' ?>"><?= htmlspecialchars($statusOptions[$r['status']] ?? $r['status']) ?></span></td>
                        <td class="px-4 py-3 text-secondary">
                            <?= !empty($r['estimated_completion_date']) ? htmlspecialchars(date('d/m/Y', strtotime($r['estimated_completion_date']))) : '<span class="text-secondary/50">—</span>' ?>
                        </td>
                        <td class="px-4 py-3">
                            <?php if ($ageD >= 1): ?><span class="badge badge-high"><?= $ageD ?> วัน</span>
                            <?php else: ?><span class="text-xs text-secondary"><?= max(0,(int)$r['age_hours']) ?> ชม.</span><?php endif; ?>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                            <div class="table-actions">
                                <a href="view.php?id=<?= $r['id'] ?>" class="h-8 px-2.5 inline-flex items-center rounded-md bg-muted hover:bg-border/30 text-primary border border-border text-xs font-semibold">ดู</a>
                                <?php if ($r['status'] === 'open'): ?>
                                <a href="my_tasks.php?acknowledge=<?= $r['id'] ?>" class="h-8 px-2.5 inline-flex items-center rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold" onclick="return confirm('รับทราบงานนี้?')">รับทราบ</a>
                                <?php endif; ?>
                                <?php if ($r['status'] === 'acknowledged'): ?>
                                <a href="my_tasks.php?start=<?= $r['id'] ?>" class="h-8 px-2.5 inline-flex items-center rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold" onclick="return confirm('เริ่มดำเนินการ?')">เริ่มงาน</a>
                                <?php endif; ?>
                                <?php if (in_array($r['status'], ['in_progress','waiting_parts'], true)): ?>
                                <a href="my_tasks.php?wait_parts=<?= $r['id'] ?>" class="h-8 px-2.5 inline-flex items-center rounded-md bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold" onclick="return confirm('เปลี่ยนเป็นรออะไหล่?')">รออะไหล่</a>
                                <?php endif; ?>
                                <?php if (in_array($r['status'], ['in_progress','waiting_parts','waiting_approval'], true)): ?>
                                <a href="my_tasks.php?resolve=<?= $r['id'] ?>" class="h-8 px-2.5 inline-flex items-center rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-semibold" onclick="return confirm('ดำเนินการซ่อมเสร็จ?')">เสร็จ</a>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php endif; ?>
</div>
<?php renderFooter(); ?>
