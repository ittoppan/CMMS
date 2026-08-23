<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'à¸”à¸¹à¹à¸œà¸™ PM - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$r = $pdo->prepare('
    SELECT pm.*, a.name AS asset_name, a.code AS asset_code,
           u.full_name AS assigned_name, cu.full_name AS completed_name,
           p.name AS plan_name, p.code AS plan_code,
           d.name AS department_name, l.name AS location_name, wz.name AS work_zone_name
    FROM pm_am pm
    LEFT JOIN asset_registry a ON pm.asset_id = a.id
    LEFT JOIN users u ON pm.assigned_to = u.id
    LEFT JOIN users cu ON pm.completed_by = cu.id
    LEFT JOIN pm_am_plans p ON pm.plan_id = p.id
    LEFT JOIN departments d ON pm.department_id = d.id
    LEFT JOIN locations l ON pm.location_id = l.id
    LEFT JOIN work_zones wz ON pm.work_zone_id = wz.id
    WHERE pm.id = ?
'); $r->execute([$id]); $r = $r->fetch();
if (!$r) { header('Location: index.php'); exit; }

$checklist = json_decode($r['checklist'] ?? '[]', true);
$templates = $pdo->prepare('
    SELECT ct.* FROM pm_am_checklist_results pcr
    JOIN checklist_templates ct ON pcr.template_id = ct.id
    WHERE pcr.pm_am_id = ? GROUP BY ct.id
');
$templates->execute([$id]); $templates = $templates->fetchAll();

$templateItems = [];
if ($templates) {
    $items = $pdo->prepare('SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY item_order');
    foreach ($templates as $t) {
        $items->execute([$t['id']]);
        $templateItems[$t['id']] = $items->fetchAll();
    }
}

$checklistResults = $pdo->prepare('SELECT * FROM pm_am_checklist_results WHERE pm_am_id = ?');
$checklistResults->execute([$id]); $checklistResults = $checklistResults->fetchAll();
$resultMap = [];
foreach ($checklistResults as $cr) {
    if ($cr['item_id']) $resultMap[$cr['template_id'] . '_' . $cr['item_id']] = $cr;
}

$logs = [];
try {
    $logsStmt = $pdo->prepare("SELECT * FROM repair_activity_log WHERE module = 'pm_am' AND module_id = ? ORDER BY created_at DESC");
    $logsStmt->execute([$id]);
    $logs = $logsStmt->fetchAll();
} catch (Exception $e) { $logs = []; }

$statusColors = ['pending'=>'status-pending','in_progress'=>'status-in_progress','completed'=>'status-completed','overdue'=>'status-overdue','skipped'=>'status-closed'];
$statusLabels = ['pending'=>'à¸£à¸­à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£','in_progress'=>'à¸à¸³à¸¥à¸±à¸‡à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£','completed'=>'à¹€à¸ªà¸£à¹‡à¸ˆà¹à¸¥à¹‰à¸§','overdue'=>'à¹€à¸¥à¸¢à¸à¸³à¸«à¸™à¸”','skipped'=>'à¸‚à¹‰à¸²à¸¡'];

renderHeader();
?>
<div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; à¸à¸¥à¸±à¸šà¹„à¸›à¸£à¸²à¸¢à¸à¸²à¸£</a>
            <h1 class="mt-2 text-2xl font-bold text-gray-900">#<?= $id ?>: <?= htmlspecialchars($r['title']) ?></h1>
        </div>
        <div class="flex gap-2">
            <a href="checksheet.php?id=<?= $id ?>" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">ðŸ“‹ à¸”à¸¹/à¸žà¸´à¸¡à¸žà¹Œà¹€à¸Šà¹‡à¸„à¸Šà¸µà¸— ISO (F-EN-02)</a>
            <a href="edit.php?id=<?= $id ?>" class="px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-md hover:bg-slate-700">à¹à¸à¹‰à¹„à¸‚</a>
            <?php if (!in_array($r['status'], ['completed'])): ?>
            <a href="complete.php?id=<?= $id ?>" class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700">à¸—à¸³à¹€à¸ªà¸£à¹‡à¸ˆ</a>
            <?php endif; ?>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
            <div class="card p-6 space-y-4">
                <div class="flex items-center justify-between">
                    <h2 class="text-lg font-semibold text-gray-800">à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹à¸œà¸™ PM</h2>
                    <span class="inline-flex px-3 py-1 text-sm font-semibold rounded-full <?= $statusColors[$r['status']] ?? 'status-closed' ?>">
                        <?= htmlspecialchars($statusLabels[$r['status']] ?? $r['status']) ?>
                    </span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span class="font-medium text-gray-600">à¸—à¸£à¸±à¸žà¸¢à¹Œà¸ªà¸´à¸™:</span> <?= htmlspecialchars(($r['asset_code']??'').' - '.($r['asset_name']??'-')) ?></div>
                    <div><span class="font-medium text-gray-600">à¹à¸œà¸™à¸‡à¸²à¸™:</span> <?= htmlspecialchars(($r['plan_code']??'').' - '.($r['plan_name']??'-')) ?></div>
                    <div><span class="font-medium text-gray-600">à¹à¸œà¸™à¸:</span> <?= htmlspecialchars($r['department_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">à¸ªà¸–à¸²à¸™à¸—à¸µà¹ˆ:</span> <?= htmlspecialchars($r['location_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">à¹‚à¸‹à¸™à¸‡à¸²à¸™:</span> <?= htmlspecialchars($r['work_zone_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">à¸œà¸¹à¹‰à¸£à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸š:</span> <?= htmlspecialchars($r['assigned_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">à¸„à¸§à¸²à¸¡à¸–à¸µà¹ˆ:</span> <?= htmlspecialchars($r['frequency_type']) ?> (<?= $r['frequency_interval'] ?>)</div>
                    <div><span class="font-medium text-gray-600">à¸à¸³à¸«à¸™à¸”à¹€à¸ªà¸£à¹‡à¸ˆ:</span> <?= htmlspecialchars($r['due_date'] ?? '-') ?></div>
                    <div><span class="font-medium text-gray-600">à¸—à¸³à¸¥à¹ˆà¸²à¸ªà¸¸à¸”:</span> <?= htmlspecialchars($r['last_done_date'] ?? '-') ?></div>
                    <?php if ($r['completed_at']): ?>
                    <div><span class="font-medium text-gray-600">à¹€à¸ªà¸£à¹‡à¸ˆà¹€à¸¡à¸·à¹ˆà¸­:</span> <?= htmlspecialchars($r['completed_at']) ?></div>
                    <div><span class="font-medium text-gray-600">à¹€à¸ªà¸£à¹‡à¸ˆà¹‚à¸”à¸¢:</span> <?= htmlspecialchars($r['completed_name'] ?? '-') ?></div>
                    <?php endif; ?>
                </div>
                <?php if ($r['reschedule_reason']): ?>
                <div class="border-t pt-3">
                    <span class="font-medium text-gray-600">à¹€à¸«à¸•à¸¸à¸œà¸¥à¸—à¸µà¹ˆà¹€à¸¥à¸·à¹ˆà¸­à¸™à¸à¸³à¸«à¸™à¸”à¸à¸²à¸£:</span>
                    <p class="text-sm text-gray-900 mt-1"><?= nl2br(htmlspecialchars($r['reschedule_reason'])) ?></p>
                </div>
                <?php endif; ?>
            </div>

            <div class="card p-6 space-y-4">
                <h2 class="text-lg font-semibold text-gray-800">à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”</h2>
                <?php if ($r['description']): ?><div><h3 class="text-sm font-medium text-gray-600">à¸„à¸³à¸­à¸˜à¸´à¸šà¸²à¸¢</h3><p class="text-sm text-gray-900 mt-1"><?= nl2br(htmlspecialchars($r['description'])) ?></p></div><?php endif; ?>
                <?php if ($r['notes']): ?><div><h3 class="text-sm font-medium text-gray-600">à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸</h3><p class="text-sm text-gray-900 mt-1"><?= nl2br(htmlspecialchars($r['notes'])) ?></p></div><?php endif; ?>
                <?php if ($r['work_instruction_file']): ?>
                <div>
                    <h3 class="text-sm font-medium text-gray-600">à¹„à¸Ÿà¸¥à¹Œà¸„à¸³à¸ªà¸±à¹ˆà¸‡à¸›à¸à¸´à¸šà¸±à¸•à¸´à¸‡à¸²à¸™</h3>
                    <a href="/<?= htmlspecialchars($r['work_instruction_file']) ?>" target="_blank" class="inline-flex items-center gap-1 mt-1 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm rounded-md hover:bg-primary-100">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        à¸”à¸²à¸§à¸™à¹Œà¹‚à¸«à¸¥à¸”à¹„à¸Ÿà¸¥à¹Œ
                    </a>
                </div>
                <?php endif; ?>
            </div>

            <?php if (is_array($checklist) && count($checklist)): ?>
            <div class="card p-6 space-y-3">
                <h2 class="text-lg font-semibold text-gray-800">Checklist</h2>
                <ul class="list-disc list-inside text-sm text-gray-700 space-y-1">
                    <?php foreach ($checklist as $item): ?>
                    <li><?= htmlspecialchars($item) ?></li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <?php endif; ?>

            <?php if ($templates): ?>
            <div class="card p-6 space-y-4">
                <h2 class="text-lg font-semibold text-gray-800">à¸œà¸¥à¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š (Checklist Templates)</h2>
                <?php foreach ($templates as $t): ?>
                <div class="border rounded-md p-4">
                    <h3 class="font-medium text-gray-800 mb-2"><?= htmlspecialchars($t['code'] . ' - ' . $t['name']) ?></h3>
                    <?php if (isset($templateItems[$t['id']]) && count($templateItems[$t['id']])): ?>
                    <table class="min-w-full text-sm">
                        <thead><tr class="border-b"><th class="text-left py-2">à¸£à¸²à¸¢à¸à¸²à¸£</th><th class="text-left py-2">à¸„à¹ˆà¸²</th><th class="text-left py-2">à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œ</th><th class="text-left py-2">à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸</th></tr></thead>
                        <tbody>
                            <?php foreach ($templateItems[$t['id']] as $item): ?>
                            <?php $res = $resultMap[$t['id'].'_'.$item['id']] ?? null; ?>
                            <tr class="border-b">
                                <td class="py-2"><?= htmlspecialchars($item['description']) ?></td>
                                <td class="py-2"><?= htmlspecialchars($res['value'] ?? '-') ?></td>
                                <td class="py-2">
                                    <?php if ($res): ?>
                                    <span class="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full <?= $res['result']==='pass'?'status-pass':($res['result']==='fail'?'status-fail':'status-closed') ?>">
                                        <?= $res['result'] ?>
                                    </span>
                                    <?php else: ?>
                                    <span class="text-gray-400">-</span>
                                    <?php endif; ?>
                                </td>
                                <td class="py-2 text-gray-500"><?= htmlspecialchars($res['notes'] ?? '-') ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <?php else: ?>
                    <p class="text-sm text-gray-500">à¹„à¸¡à¹ˆà¸¡à¸µà¸£à¸²à¸¢à¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸š</p>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>

        <div class="space-y-6">
            <div class="card p-6">
                <h2 class="text-lg font-semibold text-gray-800 mb-4">à¸£à¸°à¸¢à¸°à¹€à¸§à¸¥à¸²</h2>
                <div class="space-y-2 text-sm">
                    <div><span class="font-medium text-gray-600">à¸ªà¸£à¹‰à¸²à¸‡:</span> <?= htmlspecialchars($r['created_at']) ?></div>
                    <div><span class="font-medium text-gray-600">à¸­à¸±à¸›à¹€à¸”à¸•à¸¥à¹ˆà¸²à¸ªà¸¸à¸”:</span> <?= htmlspecialchars($r['updated_at']) ?></div>
                    <?php if ($r['completed_at']): ?><div><span class="font-medium text-gray-600">à¹€à¸ªà¸£à¹‡à¸ˆ:</span> <?= htmlspecialchars($r['completed_at']) ?></div><?php endif; ?>
                </div>
            </div>

            <div class="card p-6">
                <h2 class="text-lg font-semibold text-gray-800 mb-4">à¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£</h2>
                <div class="space-y-3">
                    <?php if (empty($logs)): ?><p class="text-sm text-gray-500">à¹„à¸¡à¹ˆà¸¡à¸µà¸›à¸£à¸°à¸§à¸±à¸•à¸´à¸à¸²à¸£à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£</p><?php endif; ?>
                    <?php foreach ($logs as $log): ?>
                    <div class="flex items-start gap-4 text-sm border-l-2 border-primary-400 pl-4">
                        <div class="flex-shrink-0 w-32 text-gray-400"><?= htmlspecialchars(date('d/m/Y H:i', strtotime($log['created_at']))) ?></div>
                        <div class="flex-1">
                            <span class="font-medium text-gray-800"><?= htmlspecialchars($log['user_name']??'à¸£à¸°à¸šà¸š') ?></span>
                            <span class="text-gray-600 ml-2"><?= htmlspecialchars($log['description'] ?? $log['action']) ?></span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</div>
<?php renderFooter(); ?>
