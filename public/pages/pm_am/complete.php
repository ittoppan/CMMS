<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ทำ PM เสร็จ - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$r = $pdo->prepare('SELECT * FROM pm_am WHERE id = ?'); $r->execute([$id]); $r = $r->fetch();
if (!$r || $r['status'] === 'completed') { header('Location: index.php'); exit; }

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

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo->beginTransaction();

        $nextDueDate = null;
        $freqType = $r['frequency_type'];
        $freqInterval = (int)($r['frequency_interval'] ?: 1);
        $today = date('Y-m-d');
        switch ($freqType) {
            case 'daily': $nextDueDate = date('Y-m-d', strtotime("+{$freqInterval} days", strtotime($today))); break;
            case 'weekly': $nextDueDate = date('Y-m-d', strtotime("+{$freqInterval} weeks", strtotime($today))); break;
            case 'monthly': $nextDueDate = date('Y-m-d', strtotime("+{$freqInterval} months", strtotime($today))); break;
            case 'quarterly': $nextDueDate = date('Y-m-d', strtotime("+" . ($freqInterval * 3) . " months", strtotime($today))); break;
            case 'yearly': $nextDueDate = date('Y-m-d', strtotime("+{$freqInterval} years", strtotime($today))); break;
        }

        $pdo->prepare('UPDATE pm_am SET status=?, completed_at=NOW(), completed_by=?, last_done_date=?, due_date=? WHERE id=?')
            ->execute(['completed', $_SESSION['user_id'], $today, $nextDueDate, $id]);

        $notesText = trim($_POST['notes'] ?? '');
        try {
            $pdo->prepare("INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)")
                ->execute([$id, $_SESSION['user_id'], 'pm_am_completed', 'ทำ PM เสร็จ' . ($notesText ? ': ' . $notesText : '')]);
        } catch (Exception $e) {}

        if (!empty($_POST['notes'])) {
            $pdo->prepare('UPDATE pm_am SET notes = CONCAT(IFNULL(notes,""), ?) WHERE id = ?')
                ->execute(["\nบันทึก: " . $_POST['notes'], $id]);
        }

        if (!empty($_POST['checklist_result'])) {
            $pdo->prepare('DELETE FROM pm_am_checklist_results WHERE pm_am_id = ?')->execute([$id]);
            $ins = $pdo->prepare('INSERT INTO pm_am_checklist_results (pm_am_id, template_id, item_id, value, result, notes) VALUES (?,?,?,?,?,?)');
            foreach ($_POST['checklist_result'] as $key => $data) {
                $parts = explode('_', $key);
                $itemId = (int)($parts[1] ?? 0);
                $templateId = (int)($parts[0] ?? 0);
                if ($itemId && $templateId && !empty($data['result'])) {
                    $ins->execute([
                        $id, $templateId, $itemId,
                        $data['value'] ?? null,
                        $data['result'],
                        $data['notes'] ?? null
                    ]);
                }
            }
        }

        $pdo->commit();
        $success = 'บันทึกผลการดำเนินการเรียบร้อย';
        echo '<script>setTimeout(function(){location.href="view.php?id=' . $id . '";},1500);</script>';
    } catch (Exception $e) {
        $pdo->rollBack();
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
function sel($a,$b){return $a===$b?'selected':'';} ?>
<div class="max-w-3xl mx-auto">
    <div class="mb-6">
        <a href="view.php?id=<?= $id ?>" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปรายละเอียด</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">ทำ PM เสร็จ: <?= htmlspecialchars($r['title']) ?></h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" class="card p-6 space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><span class="font-medium text-secondary">ทรัพย์สิน:</span> <?= htmlspecialchars($r['asset_id']) ?></div>
            <div><span class="font-medium text-secondary">ความถี่:</span> <?= htmlspecialchars($r['frequency_type']) ?> (<?= $r['frequency_interval'] ?>)</div>
            <div><span class="font-medium text-secondary">กำหนดส่งเดิม:</span> <?= htmlspecialchars($r['due_date'] ?? '-') ?></div>
            <div>
                <span class="font-medium text-secondary">กำหนดครั้งถัดไป:</span>
                <?php
                $nextCalc = null;
                $today = date('Y-m-d');
                switch ($r['frequency_type']) {
                    case 'daily': $nextCalc = date('Y-m-d', strtotime("+" . (int)$r['frequency_interval'] . " days", strtotime($today))); break;
                    case 'weekly': $nextCalc = date('Y-m-d', strtotime("+" . (int)$r['frequency_interval'] . " weeks", strtotime($today))); break;
                    case 'monthly': $nextCalc = date('Y-m-d', strtotime("+" . (int)$r['frequency_interval'] . " months", strtotime($today))); break;
                    case 'quarterly': $nextCalc = date('Y-m-d', strtotime("+" . ((int)$r['frequency_interval'] * 3) . " months", strtotime($today))); break;
                    case 'yearly': $nextCalc = date('Y-m-d', strtotime("+" . (int)$r['frequency_interval'] . " years", strtotime($today))); break;
                }
                ?>
                <span class="font-semibold"><?= $nextCalc ?? 'ไม่สามารถคำนวณ' ?></span>
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-secondary mb-2">บันทึกการปฏิบัติงาน</label>
            <textarea name="notes" rows="3" class="input input-bordered w-full" placeholder="บันทึกผลการปฏิบัติงาน ปัญหาที่พบ ฯลฯ"></textarea>
        </div>

        <?php if ($templates): ?>
        <div>
            <h2 class="text-lg font-semibold text-primary mb-4">ผลการตรวจสอบตาม Checklist</h2>
            <?php foreach ($templates as $t): ?>
            <div class="border rounded-md p-4 mb-4">
                <h3 class="font-medium text-primary mb-3"><?= htmlspecialchars($t['code'] . ' - ' . $t['name']) ?></h3>
                <?php if (isset($templateItems[$t['id']]) && count($templateItems[$t['id']])): ?>
                <div class="space-y-3">
                    <?php foreach ($templateItems[$t['id']] as $item): ?>
                    <div class="border-b pb-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex-1">
                                <label class="text-sm font-medium text-secondary"><?= htmlspecialchars($item['description']) ?></label>
                                <?php if ($item['expected_value']): ?><span class="text-xs text-muted ml-2">(ค่าที่คาดหวัง: <?= htmlspecialchars($item['expected_value']) ?>)</span><?php endif; ?>
                            </div>
                            <div class="flex items-center gap-2">
                                <select name="checklist_result[<?= $t['id'] ?>_<?= $item['id'] ?>][result]" class="text-sm border border-line rounded-md px-2 py-1">
                                    <option value="">--</option>
                                    <option value="pass">ผ่าน</option>
                                    <option value="fail">ไม่ผ่าน</option>
                                    <option value="na">N/A</option>
                                </select>
                            </div>
                        </div>
                        <?php if ($item['item_type'] === 'text' || $item['item_type'] === 'number' || $item['item_type'] === 'measurement'): ?>
                        <div class="mt-2">
                            <input type="text" name="checklist_result[<?= $t['id'] ?>_<?= $item['id'] ?>][value]" placeholder="ค่าที่วัดได้" class="w-full text-sm border border-line rounded-md px-2 py-1">
                        </div>
                        <?php endif; ?>
                        <div class="mt-1">
                            <input type="text" name="checklist_result[<?= $t['id'] ?>_<?= $item['id'] ?>][notes]" placeholder="หมายเหตุ" class="w-full text-sm border border-line rounded-md px-2 py-1">
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php else: ?>
                <p class="text-sm text-muted">ไม่มีรายการใน template นี้</p>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึกผล</button>
            <a href="view.php?id=<?= $id ?>" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
