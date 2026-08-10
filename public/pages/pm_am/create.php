<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'เพิ่มแผน PM - CMMS-TPT';
$pdo = getDb();

$assets = $pdo->query('SELECT id, code, name FROM asset_registry WHERE status = "active" ORDER BY name')->fetchAll();
$users  = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$plans  = $pdo->query('SELECT id, code, name FROM pm_am_plans WHERE is_active = 1 ORDER BY name')->fetchAll();
$depts  = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
$locs   = $pdo->query('SELECT id, code, name FROM locations ORDER BY name')->fetchAll();
$zones  = $pdo->query('SELECT id, code, name FROM work_zones ORDER BY name')->fetchAll();
$templates = $pdo->query('SELECT id, code, name FROM checklist_templates WHERE is_active = 1 AND category = "pm_am" ORDER BY name')->fetchAll();

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $uploadPath = null;
        if (!empty($_FILES['work_instruction_file']['name'])) {
            $uploadDir = __DIR__ . '/../../../uploads/pm_am/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            $ext = pathinfo($_FILES['work_instruction_file']['name'], PATHINFO_EXTENSION);
            $uploadPath = 'uploads/pm_am/' . uniqid('wi_') . '.' . $ext;
            move_uploaded_file($_FILES['work_instruction_file']['tmp_name'], __DIR__ . '/../../../' . $uploadPath);
        }

        $stmt = $pdo->prepare('INSERT INTO pm_am (asset_id, assigned_to, plan_id, department_id, location_id, work_zone_id, title, description, frequency_type, frequency_interval, due_date, last_done_date, status, checklist, notes, work_instruction_file) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $_POST['asset_id'],
            $_POST['assigned_to'] ?: null,
            $_POST['plan_id'] ?: null,
            $_POST['department_id'] ?: null,
            $_POST['location_id'] ?: null,
            $_POST['work_zone_id'] ?: null,
            $_POST['title'],
            $_POST['description'] ?: null,
            $_POST['frequency_type'],
            $_POST['frequency_interval'] ?: 1,
            $_POST['due_date'] ?: null,
            $_POST['last_done_date'] ?: null,
            $_POST['status'] ?? 'pending',
            $_POST['checklist'] ? json_encode(explode("\n", $_POST['checklist'])) : null,
            $_POST['notes'] ?: null,
            $uploadPath
        ]);
        $pmAmId = $pdo->lastInsertId();

        if (!empty($_POST['checklist_templates'])) {
            $ins = $pdo->prepare('INSERT INTO pm_am_checklist_results (pm_am_id, template_id) VALUES (?,?)');
            foreach ($_POST['checklist_templates'] as $tid) {
                $ins->execute([$pmAmId, (int)$tid]);
            }
        }

        $success = 'เพิ่มแผน PM เรียบร้อย';
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
function sel($a,$b){return $a===$b?'selected':'';} ?>
<div class="max-w-3xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปแผน PM</a>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">เพิ่มแผน Preventive Maintenance</h1>
    </div>
    <?php if ($error): ?><div class="bg-red-50 text-red-700 text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="bg-green-50 text-green-700 text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?><a href="index.php" class="ml-2 underline">กลับไปรายการ</a></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">หัวข้อ <span class="text-red-500">*</span></label>
                <input type="text" name="title" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ทรัพย์สิน <span class="text-red-500">*</span></label>
                <select name="asset_id" required class="input input-bordered w-full mt-1">
                    <option value="">-- เลือกทรัพย์สิน --</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>"><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">แผนงาน (Plan)</label>
                <select name="plan_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($plans as $p): ?>
                    <option value="<?= $p['id'] ?>"><?= htmlspecialchars($p['code'] . ' - ' . $p['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">แผนก</label>
                <select name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($depts as $d): ?>
                    <option value="<?= $d['id'] ?>"><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานที่</label>
                <select name="location_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($locs as $l): ?>
                    <option value="<?= $l['id'] ?>"><?= htmlspecialchars($l['code'] . ' - ' . $l['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">โซนงาน</label>
                <select name="work_zone_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($zones as $z): ?>
                    <option value="<?= $z['id'] ?>"><?= htmlspecialchars($z['code'] . ' - ' . $z['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ผู้รับผิดชอบ</label>
                <select name="assigned_to" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>"><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ประเภทความถี่</label>
                <select name="frequency_type" class="input input-bordered w-full mt-1">
                    <?php foreach (['daily','weekly','monthly','quarterly','yearly','custom'] as $f): ?>
                    <option value="<?= $f ?>" <?= $f==='monthly'?'selected':'' ?>><?= ucfirst($f) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Interval</label>
                <input type="number" name="frequency_interval" class="input input-bordered w-full mt-1" value="1" min="1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">กำหนดเสร็จ</label>
                <input type="date" name="due_date" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">ทำล่าสุด</label>
                <input type="date" name="last_done_date" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">สถานะ</label>
                <select name="status" class="input input-bordered w-full mt-1">
                    <?php foreach (['pending','in_progress','completed','overdue','skipped'] as $s): ?>
                    <option value="<?= $s ?>" <?= $s==='pending'?'selected':'' ?>><?= ucfirst($s) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-gray-700">ไฟล์คำสั่งปฏิบัติงาน</label>
                <input type="file" name="work_instruction_file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" class="input input-bordered w-full mt-1">
                <p class="text-xs text-gray-500 mt-1">PDF, DOC, XLS, รูปภาพ</p>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">คำอธิบาย</label>
            <textarea name="description" rows="2" class="input input-bordered w-full mt-1"></textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <textarea name="notes" rows="2" class="input input-bordered w-full mt-1"></textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700">Checklist (บรรทัดละ 1 รายการ)</label>
            <textarea name="checklist" rows="4" class="input input-bordered w-full mt-1" placeholder="ตรวจสอบระดับน้ำมัน&#10;ตรวจสอบสายพาน&#10;หล่อลื่นชิ้นส่วน"></textarea>
        </div>
        <?php if ($templates): ?>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">เลือก Checklist Template</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                <?php foreach ($templates as $t): ?>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="checklist_templates[]" value="<?= $t['id'] ?>" class="rounded border-gray-300">
                    <?= htmlspecialchars($t['code'] . ' - ' . $t['name']) ?>
                </label>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
        <div>
            <label class="block text-sm font-medium text-gray-700">เหตุผลที่เลื่อนกำหนดการ</label>
            <textarea name="reschedule_reason" rows="2" class="input input-bordered w-full mt-1"></textarea>
        </div>
        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="index.php" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
