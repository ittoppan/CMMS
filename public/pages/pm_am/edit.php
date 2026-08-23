<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขแผน PM - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$row = $pdo->prepare('SELECT * FROM pm_am WHERE id = ?'); $row->execute([$id]); $row = $row->fetch();
if (!$row) { header('Location: index.php'); exit; }

$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();
$users  = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$plans  = $pdo->query('SELECT id, code, name FROM pm_am_plans WHERE is_active = 1 ORDER BY name')->fetchAll();
$depts  = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
$locs   = $pdo->query('SELECT id, code, name FROM locations ORDER BY name')->fetchAll();
$zones  = $pdo->query('SELECT id, code, name FROM work_zones ORDER BY name')->fetchAll();
$templates = $pdo->query('SELECT id, code, name FROM checklist_templates WHERE is_active = 1 AND category = "pm_am" ORDER BY name')->fetchAll();
$selectedTemplates = $pdo->prepare('SELECT template_id FROM pm_am_checklist_results WHERE pm_am_id = ? GROUP BY template_id');
$selectedTemplates->execute([$id]);
$selectedTplIds = array_column($selectedTemplates->fetchAll(), 'template_id');

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $toNull = fn($v)=>($v??'')===''?null:$v;
        $uploadPath = $row['work_instruction_file'];
        if (!empty($_FILES['work_instruction_file']['name'])) {
            $uploadDir = __DIR__ . '/../../../uploads/pm_am/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            $ext = pathinfo($_FILES['work_instruction_file']['name'], PATHINFO_EXTENSION);
            $uploadPath = 'uploads/pm_am/' . uniqid('wi_') . '.' . $ext;
            move_uploaded_file($_FILES['work_instruction_file']['tmp_name'], __DIR__ . '/../../../' . $uploadPath);
        }

        $pdo->prepare('UPDATE pm_am SET asset_id=?, assigned_to=?, plan_id=?, department_id=?, location_id=?, work_zone_id=?, title=?, description=?, frequency_type=?, frequency_interval=?, due_date=?, last_done_date=?, status=?, checklist=?, notes=?, work_instruction_file=?, reschedule_reason=? WHERE id=?')->execute([
            $_POST['asset_id'],
            $toNull($_POST['assigned_to']),
            $toNull($_POST['plan_id']),
            $toNull($_POST['department_id']),
            $toNull($_POST['location_id']),
            $toNull($_POST['work_zone_id']),
            $_POST['title'],
            $toNull($_POST['description']),
            $_POST['frequency_type'],
            $_POST['frequency_interval'] ?: 1,
            $toNull($_POST['due_date']),
            $toNull($_POST['last_done_date']),
            $_POST['status'] ?? 'pending',
            $_POST['checklist'] ? json_encode(explode("\n", $_POST['checklist'])) : $row['checklist'],
            $toNull($_POST['notes']),
            $uploadPath,
            $toNull($_POST['reschedule_reason']),
            $id
        ]);

        if (isset($_POST['checklist_templates'])) {
            $pdo->prepare('DELETE FROM pm_am_checklist_results WHERE pm_am_id = ?')->execute([$id]);
            $ins = $pdo->prepare('INSERT INTO pm_am_checklist_results (pm_am_id, template_id) VALUES (?,?)');
            foreach ($_POST['checklist_templates'] as $tid) {
                $ins->execute([$id, (int)$tid]);
            }
        }

        $success = 'บันทึกเรียบร้อย';
        $row = $pdo->prepare('SELECT * FROM pm_am WHERE id=?'); $row->execute([$id]); $row = $row->fetch();
    } catch (Exception $e) { $error = $e->getMessage(); }
}
renderHeader();
function sel($a,$b){return $a===$b?'selected':'';}
function chk($arr,$val){return in_array($val,$arr)?'checked':'';} ?>
<div class="max-w-3xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปแผน PM</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">แก้ไขแผน PM #<?= $id ?></h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">หัวข้อ <span class="text-red-500">*</span></label>
                <input type="text" name="title" value="<?= htmlspecialchars($row['title']) ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ทรัพย์สิน <span class="text-red-500">*</span></label>
                <select name="asset_id" required class="input input-bordered w-full mt-1">
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= sel($row['asset_id'], $a['id']) ?>><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">แผนงาน (Plan)</label>
                <select name="plan_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($plans as $p): ?>
                    <option value="<?= $p['id'] ?>" <?= sel($row['plan_id'], $p['id']) ?>><?= htmlspecialchars($p['code'] . ' - ' . $p['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">แผนก</label>
                <select name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($depts as $d): ?>
                    <option value="<?= $d['id'] ?>" <?= sel($row['department_id'], $d['id']) ?>><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานที่</label>
                <select name="location_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($locs as $l): ?>
                    <option value="<?= $l['id'] ?>" <?= sel($row['location_id'], $l['id']) ?>><?= htmlspecialchars($l['code'] . ' - ' . $l['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">โซนงาน</label>
                <select name="work_zone_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($zones as $z): ?>
                    <option value="<?= $z['id'] ?>" <?= sel($row['work_zone_id'], $z['id']) ?>><?= htmlspecialchars($z['code'] . ' - ' . $z['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ผู้รับผิดชอบ</label>
                <select name="assigned_to" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>" <?= sel($row['assigned_to'], $u['id']) ?>><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ประเภทความถี่</label>
                <select name="frequency_type" class="input input-bordered w-full mt-1">
                    <?php foreach (['daily','weekly','monthly','quarterly','yearly','custom'] as $f): ?>
                    <option value="<?= $f ?>" <?= sel($row['frequency_type'], $f) ?>><?= ucfirst($f) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Interval</label>
                <input type="number" name="frequency_interval" class="input input-bordered w-full mt-1" value="<?= $row['frequency_interval'] ?>" min="1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">กำหนดเสร็จ</label>
                <input type="date" name="due_date" class="input input-bordered w-full mt-1" value="<?= $row['due_date'] ?? '' ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ทำล่าสุด</label>
                <input type="date" name="last_done_date" class="input input-bordered w-full mt-1" value="<?= $row['last_done_date'] ?? '' ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานะ</label>
                <select name="status" class="input input-bordered w-full mt-1">
                    <?php foreach (['pending','in_progress','completed','overdue','skipped'] as $s): ?>
                    <option value="<?= $s ?>" <?= sel($row['status'], $s) ?>><?= ucfirst($s) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">ไฟล์คำสั่งปฏิบัติงาน</label>
                <?php if ($row['work_instruction_file']): ?>
                <div class="mb-2 text-sm">
                    <a href="/<?= htmlspecialchars($row['work_instruction_file']) ?>" target="_blank" class="text-primary-600 hover:underline">ดูไฟล์ปัจจุบัน</a>
                </div>
                <?php endif; ?>
                <input type="file" name="work_instruction_file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" class="input input-bordered w-full mt-1">
                <p class="text-xs text-gray-500 mt-1">เว้นว่างไว้หากไม่ต้องการเปลี่ยนไฟล์</p>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">คำอธิบาย</label>
            <textarea name="description" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['description'] ?? '') ?></textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <textarea name="notes" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['notes'] ?? '') ?></textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Checklist (บรรทัดละ 1 รายการ)</label>
            <textarea name="checklist" rows="4" class="input input-bordered w-full mt-1"><?php $cl = json_decode($row['checklist'] ?? '[]'); echo is_array($cl) ? implode("\n", $cl) : '' ?></textarea>
        </div>
        <?php if ($templates): ?>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">เลือก Checklist Template</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                <?php foreach ($templates as $t): ?>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="checklist_templates[]" value="<?= $t['id'] ?>" class="rounded border-gray-300" <?= chk($selectedTplIds, $t['id']) ?>>
                    <?= htmlspecialchars($t['code'] . ' - ' . $t['name']) ?>
                </label>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
        <div>
            <label class="block text-sm font-medium text-gray-700">เหตุผลที่เลื่อนกำหนดการ</label>
            <textarea name="reschedule_reason" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['reschedule_reason'] ?? '') ?></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
