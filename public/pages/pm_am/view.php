<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ดูแผน PM - CMMS-TPT';
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

$statusColors = ['pending'=>'bg-yellow-100 text-yellow-800','in_progress'=>'bg-blue-100 text-blue-800','completed'=>'bg-green-100 text-green-800','overdue'=>'bg-red-100 text-red-800','skipped'=>'bg-gray-100 text-gray-800'];
$statusLabels = ['pending'=>'รอดำเนินการ','in_progress'=>'กำลังดำเนินการ','completed'=>'เสร็จแล้ว','overdue'=>'เลยกำหนด','skipped'=>'ข้าม'];

renderHeader();
?>
<div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปรายการ</a>
            <h1 class="mt-2 text-2xl font-bold text-gray-900">#<?= $id ?>: <?= htmlspecialchars($r['title']) ?></h1>
        </div>
        <div class="flex gap-2">
            <a href="checksheet.php?id=<?= $id ?>" class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">📋 ดู/พิมพ์เช็คชีท ISO (F-EN-02)</a>
            <a href="edit.php?id=<?= $id ?>" class="px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-md hover:bg-slate-700">แก้ไข</a>
            <?php if (!in_array($r['status'], ['completed'])): ?>
            <a href="complete.php?id=<?= $id ?>" class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700">ทำเสร็จ</a>
            <?php endif; ?>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
            <div class="card p-6 space-y-4">
                <div class="flex items-center justify-between">
                    <h2 class="text-lg font-semibold text-gray-800">ข้อมูลแผน PM</h2>
                    <span class="inline-flex px-3 py-1 text-sm font-semibold rounded-full <?= $statusColors[$r['status']] ?? 'bg-gray-100' ?>">
                        <?= htmlspecialchars($statusLabels[$r['status']] ?? $r['status']) ?>
                    </span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span class="font-medium text-gray-600">ทรัพย์สิน:</span> <?= htmlspecialchars(($r['asset_code']??'').' - '.($r['asset_name']??'-')) ?></div>
                    <div><span class="font-medium text-gray-600">แผนงาน:</span> <?= htmlspecialchars(($r['plan_code']??'').' - '.($r['plan_name']??'-')) ?></div>
                    <div><span class="font-medium text-gray-600">แผนก:</span> <?= htmlspecialchars($r['department_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">สถานที่:</span> <?= htmlspecialchars($r['location_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">โซนงาน:</span> <?= htmlspecialchars($r['work_zone_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">ผู้รับผิดชอบ:</span> <?= htmlspecialchars($r['assigned_name']??'-') ?></div>
                    <div><span class="font-medium text-gray-600">ความถี่:</span> <?= htmlspecialchars($r['frequency_type']) ?> (<?= $r['frequency_interval'] ?>)</div>
                    <div><span class="font-medium text-gray-600">กำหนดเสร็จ:</span> <?= htmlspecialchars($r['due_date'] ?? '-') ?></div>
                    <div><span class="font-medium text-gray-600">ทำล่าสุด:</span> <?= htmlspecialchars($r['last_done_date'] ?? '-') ?></div>
                    <?php if ($r['completed_at']): ?>
                    <div><span class="font-medium text-gray-600">เสร็จเมื่อ:</span> <?= htmlspecialchars($r['completed_at']) ?></div>
                    <div><span class="font-medium text-gray-600">เสร็จโดย:</span> <?= htmlspecialchars($r['completed_name'] ?? '-') ?></div>
                    <?php endif; ?>
                </div>
                <?php if ($r['reschedule_reason']): ?>
                <div class="border-t pt-3">
                    <span class="font-medium text-gray-600">เหตุผลที่เลื่อนกำหนดการ:</span>
                    <p class="text-sm text-gray-900 mt-1"><?= nl2br(htmlspecialchars($r['reschedule_reason'])) ?></p>
                </div>
                <?php endif; ?>
            </div>

            <div class="card p-6 space-y-4">
                <h2 class="text-lg font-semibold text-gray-800">รายละเอียด</h2>
                <?php if ($r['description']): ?><div><h3 class="text-sm font-medium text-gray-600">คำอธิบาย</h3><p class="text-sm text-gray-900 mt-1"><?= nl2br(htmlspecialchars($r['description'])) ?></p></div><?php endif; ?>
                <?php if ($r['notes']): ?><div><h3 class="text-sm font-medium text-gray-600">หมายเหตุ</h3><p class="text-sm text-gray-900 mt-1"><?= nl2br(htmlspecialchars($r['notes'])) ?></p></div><?php endif; ?>
                <?php if ($r['work_instruction_file']): ?>
                <div>
                    <h3 class="text-sm font-medium text-gray-600">ไฟล์คำสั่งปฏิบัติงาน</h3>
                    <a href="/<?= htmlspecialchars($r['work_instruction_file']) ?>" target="_blank" class="inline-flex items-center gap-1 mt-1 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm rounded-md hover:bg-primary-100">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        ดาวน์โหลดไฟล์
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
                <h2 class="text-lg font-semibold text-gray-800">ผลการตรวจสอบ (Checklist Templates)</h2>
                <?php foreach ($templates as $t): ?>
                <div class="border rounded-md p-4">
                    <h3 class="font-medium text-gray-800 mb-2"><?= htmlspecialchars($t['code'] . ' - ' . $t['name']) ?></h3>
                    <?php if (isset($templateItems[$t['id']]) && count($templateItems[$t['id']])): ?>
                    <table class="min-w-full text-sm">
                        <thead><tr class="border-b"><th class="text-left py-2">รายการ</th><th class="text-left py-2">ค่า</th><th class="text-left py-2">ผลลัพธ์</th><th class="text-left py-2">หมายเหตุ</th></tr></thead>
                        <tbody>
                            <?php foreach ($templateItems[$t['id']] as $item): ?>
                            <?php $res = $resultMap[$t['id'].'_'.$item['id']] ?? null; ?>
                            <tr class="border-b">
                                <td class="py-2"><?= htmlspecialchars($item['description']) ?></td>
                                <td class="py-2"><?= htmlspecialchars($res['value'] ?? '-') ?></td>
                                <td class="py-2">
                                    <?php if ($res): ?>
                                    <span class="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full <?= $res['result']==='pass'?'bg-green-100 text-green-800':($res['result']==='fail'?'bg-red-100 text-red-800':'bg-gray-100 text-gray-800') ?>">
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
                    <p class="text-sm text-gray-500">ไม่มีรายการตรวจสอบ</p>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>

        <div class="space-y-6">
            <div class="card p-6">
                <h2 class="text-lg font-semibold text-gray-800 mb-4">ระยะเวลา</h2>
                <div class="space-y-2 text-sm">
                    <div><span class="font-medium text-gray-600">สร้าง:</span> <?= htmlspecialchars($r['created_at']) ?></div>
                    <div><span class="font-medium text-gray-600">อัปเดตล่าสุด:</span> <?= htmlspecialchars($r['updated_at']) ?></div>
                    <?php if ($r['completed_at']): ?><div><span class="font-medium text-gray-600">เสร็จ:</span> <?= htmlspecialchars($r['completed_at']) ?></div><?php endif; ?>
                </div>
            </div>

            <div class="card p-6">
                <h2 class="text-lg font-semibold text-gray-800 mb-4">ประวัติการดำเนินการ</h2>
                <div class="space-y-3">
                    <?php if (empty($logs)): ?><p class="text-sm text-gray-500">ไม่มีประวัติการดำเนินการ</p><?php endif; ?>
                    <?php foreach ($logs as $log): ?>
                    <div class="flex items-start gap-4 text-sm border-l-2 border-primary-400 pl-4">
                        <div class="flex-shrink-0 w-32 text-gray-400"><?= htmlspecialchars(date('d/m/Y H:i', strtotime($log['created_at']))) ?></div>
                        <div class="flex-1">
                            <span class="font-medium text-gray-800"><?= htmlspecialchars($log['user_name']??'ระบบ') ?></span>
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
