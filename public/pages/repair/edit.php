<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แก้ไขงานซ่อม - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$row = $pdo->prepare('SELECT * FROM repair WHERE id = ?'); $row->execute([$id]); $row = $row->fetch();
if (!$row) { header('Location: index.php'); exit; }

$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();
$users = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$repairTypes = $pdo->query('SELECT id, code, name FROM repair_types ORDER BY name')->fetchAll();
$failureCodes = $pdo->query('SELECT id, code, name FROM failure_codes ORDER BY name')->fetchAll();
$repairCodes = $pdo->query('SELECT id, code, name FROM repair_codes ORDER BY name')->fetchAll();
$workZones = $pdo->query('SELECT id, code, name FROM work_zones ORDER BY name')->fetchAll();
$locations = $pdo->query('SELECT id, code, name FROM locations ORDER BY name')->fetchAll();
$departments = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
$tags = $pdo->query('SELECT id, name, color FROM repair_tags ORDER BY name')->fetchAll();
$existingTagIds = $pdo->prepare('SELECT tag_id FROM repair_tag_pivot WHERE repair_id = ?'); $existingTagIds->execute([$id]); $existingTagIds = array_column($existingTagIds->fetchAll(), 'tag_id');
$attachments = $pdo->prepare('SELECT * FROM repair_attachments WHERE repair_id = ?'); $attachments->execute([$id]); $attachments = $attachments->fetchAll();
$rejectionReasons = $pdo->query('SELECT id, code, name FROM rejection_reasons WHERE module = "repair" ORDER BY name')->fetchAll();

function logActivity($pdo, $repairId, $action, $desc) {
    $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)')
        ->execute([$repairId, $_SESSION['user_id'], $action, $desc]);
}

$error = ''; $success = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo->beginTransaction();
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $toZero = fn($v) => (float)($v ?? 0);
        $safety = (int)(!empty($_POST['safety_related']));
        $oldStatus = $row['status'];
        $newStatus = $_POST['status'] ?? $oldStatus;

        // Check RCA 5-Why Enforcement Threshold
        if (in_array($newStatus, ['resolved', 'closed'])) {
            $dtStart = !empty($_POST['downtime_start']) ? strtotime($_POST['downtime_start']) : 0;
            $dtEnd = !empty($_POST['downtime_end']) ? strtotime($_POST['downtime_end']) : time();
            $downtimeHours = ($dtStart > 0 && $dtEnd > $dtStart) ? round(($dtEnd - $dtStart) / 3600, 2) : 0;
            $rcaThreshold = (float)($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'rca_downtime_threshold'")->fetchColumn() ?: 2.0);

            if ($downtimeHours >= $rcaThreshold && empty(trim($_POST['root_cause'] ?? ''))) {
                throw new Exception("งานซ่อมนี้มีเวลา Downtime " . $downtimeHours . " ชม. เกินเกณฑ์ที่กำหนด (" . $rcaThreshold . " ชม.) บังคับให้ระบุสาเหตุรากเหง้า (Root Cause 5-Why) ตามมาตรฐาน ISO 9001/14001 ก่อนปิดงาน");
            }
        }

        $pdo->prepare('UPDATE repair SET asset_id=?, assigned_to=?, priority=?, status=?, title=?, description=?, failure_report=?, diagnosis=?, resolution=?, downtime_start=?, downtime_end=?, cost_parts=?, cost_labor=?, notes=?, repair_type_id=?, failure_code_id=?, repair_code_id=?, work_zone_id=?, location_id=?, department_id=?, safety_related=?, product_lot_no=?, machine_status=?, production_line_status=?, estimated_completion_date=?, root_cause=?, solution=?, rejection_reason_id=?, rejection_note=? WHERE id=?')
            ->execute([
            $_POST['asset_id'], $toNull($_POST['assigned_to']), $_POST['priority'] ?? 'medium', $newStatus, $_POST['title'],
            $toNull($_POST['description']), $toNull($_POST['failure_report']), $toNull($_POST['diagnosis']), $toNull($_POST['resolution']),
            $toNull($_POST['downtime_start']), $toNull($_POST['downtime_end']), $toZero($_POST['cost_parts']), $toZero($_POST['cost_labor']),
            $toNull($_POST['notes']), $toNull($_POST['repair_type_id']), $toNull($_POST['failure_code_id']),
            $toNull($_POST['repair_code_id']), $toNull($_POST['work_zone_id']), $toNull($_POST['location_id']),
            $toNull($_POST['department_id']), $safety, $toNull($_POST['product_lot_no']),
            $toNull($_POST['machine_status']), $toNull($_POST['production_line_status']),
            $toNull($_POST['estimated_completion_date']), $toNull($_POST['root_cause']), $toNull($_POST['solution']),
            $toNull($_POST['rejection_reason_id']), $toNull($_POST['rejection_note']), $id
        ]);

        $pdo->prepare('DELETE FROM repair_tag_pivot WHERE repair_id = ?')->execute([$id]);
        if (!empty($_POST['tags']) && is_array($_POST['tags'])) {
            $ts = $pdo->prepare('INSERT INTO repair_tag_pivot (repair_id, tag_id) VALUES (?,?)');
            foreach ($_POST['tags'] as $tid) { $ts->execute([$id, (int)$tid]); }
        }

        if (!empty($_FILES['failure_image']['name'][0])) {
            $upDir = __DIR__ . '/../../../uploads/repair/';
            $pubDir = __DIR__ . '/../../../public/uploads/repair/';
            if (!is_dir($upDir)) mkdir($upDir, 0775, true);
            if (!is_dir($pubDir)) mkdir($pubDir, 0775, true);
            $is = $pdo->prepare('INSERT INTO repair_attachments (repair_id, file_name, file_path, file_type, file_size, category, uploaded_by) VALUES (?,?,?,?,?,?,?)');
            foreach ($_FILES['failure_image']['name'] as $i => $name) {
                if ($_FILES['failure_image']['error'][$i] !== UPLOAD_ERR_OK) continue;
                $ext = pathinfo($name, PATHINFO_EXTENSION);
                $fname = uniqid('rep_') . '.' . $ext;
                if (move_uploaded_file($_FILES['failure_image']['tmp_name'][$i], $upDir . $fname)) {
                    @copy($upDir . $fname, $pubDir . $fname);
                    $is->execute([$id, $name, 'uploads/repair/' . $fname, mime_content_type($upDir . $fname), $_FILES['failure_image']['size'][$i], 'failure_image', $_SESSION['user_id']]);
                }
            }
        }

        // รูปหลังซ่อม (After) — แยกหมวด category=after_image
        if (!empty($_FILES['after_image']['name'][0])) {
            $upDir = __DIR__ . '/../../../uploads/repair/';
            $pubDir = __DIR__ . '/../../../public/uploads/repair/';
            if (!is_dir($upDir)) mkdir($upDir, 0775, true);
            if (!is_dir($pubDir)) mkdir($pubDir, 0775, true);
            $is = $pdo->prepare('INSERT INTO repair_attachments (repair_id, file_name, file_path, file_type, file_size, category, uploaded_by) VALUES (?,?,?,?,?,?,?)');
            foreach ($_FILES['after_image']['name'] as $i => $name) {
                if ($_FILES['after_image']['error'][$i] !== UPLOAD_ERR_OK) continue;
                $ext = pathinfo($name, PATHINFO_EXTENSION);
                $fname = uniqid('aft_') . '.' . $ext;
                if (move_uploaded_file($_FILES['after_image']['tmp_name'][$i], $upDir . $fname)) {
                    @copy($upDir . $fname, $pubDir . $fname);
                    $is->execute([$id, $name, 'uploads/repair/' . $fname, mime_content_type($upDir . $fname), $_FILES['after_image']['size'][$i], 'after_image', $_SESSION['user_id']]);
                }
            }
        }

        // ส่ง LINE แจ้ง "ซ่อมเสร็จ" เมื่อสถานะเปลี่ยนเป็น resolved/closed พร้อมรูปก่อน+หลังซ่อม
        if ($oldStatus !== $newStatus && in_array($newStatus, ['resolved', 'closed']) && !in_array($oldStatus, ['resolved', 'closed'])) {
            try {
                require_once __DIR__ . '/../../../src/helpers/notification.php';
                $q = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_enabled'");
                $q->execute();
                if ($q->fetchColumn() === '1') {
                    $assetCode = ''; $assetName = '';
                    if (!empty($row['asset_id'])) {
                        $st = $pdo->prepare("SELECT code, name FROM asset_registry WHERE id = ?");
                        $st->execute([(int)$row['asset_id']]);
                        $a = $st->fetch();
                        if ($a) { $assetCode = $a['code']; $assetName = $a['name']; }
                    }
                    $dtStart = !empty($row['downtime_start']) ? strtotime($row['downtime_start']) : 0;
                    $dtEnd = !empty($row['downtime_end']) ? strtotime($row['downtime_end']) : time();
                    $dtHours = ($dtStart > 0 && $dtEnd > $dtStart) ? round(($dtEnd - $dtStart) / 3600, 2) : 0;
                    $totalCost = (float)($row['cost_parts'] ?? 0) + (float)($row['cost_labor'] ?? 0);

                    $title = '✅ ซ่อมเสร็จ: ' . ($row['work_order_no'] ?? "งาน #$id");
                    $body = "เครื่องจักร: " . ($assetCode ?: '-') . ($assetName ? " - $assetName" : '') .
                        "\nรายการ: " . mb_substr($row['title'] ?? '-', 0, 120) .
                        ($dtHours > 0 ? "\n⏱ Downtime: {$dtHours} ชม." : '') .
                        ($totalCost > 0 ? "\n💰 ค่าซ่อมรวม: " . number_format($totalCost, 2) . " บาท" : '') .
                        "\n📸 ดูรูปก่อน/หลังซ่อมด้านล่าง";
                    $detailUrl = publicBaseUrl() . '/repair/view?id=' . $id;

                    $targets = [];
                    $grp = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_maintenance_group_id'");
                    $grp->execute();
                    $gid = $grp->fetchColumn();
                    if ($gid) $targets[] = (string)$gid;
                    if (!empty($row['assigned_to'])) {
                        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                        $st->execute([(int)$row['assigned_to']]);
                        $lid = $st->fetchColumn();
                        if ($lid) $targets[] = (string)$lid;
                    }
                    // ผู้แจ้งซ่อม (requester) — ต้องรู้ว่างานเสร็จแล้ว
                    if (!empty($row['created_by'])) {
                        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                        $st->execute([(int)$row['created_by']]);
                        $lid = $st->fetchColumn();
                        if ($lid) $targets[] = (string)$lid;
                    }
                    if (empty($targets)) {
                        $st = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''");
                        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $lid) $targets[] = (string)$lid;
                    }

                    $photos = [
                        'before' => repairPhotoUrls($id, 'failure_image', 2),
                        'after'  => repairPhotoUrls($id, 'after_image', 2)
                    ];

                    foreach (array_unique($targets) as $tid) {
                        sendLinePushMessage($tid, $title, $body, $detailUrl, $photos);
                    }
                }
            } catch (Exception $e) {
                error_log("[repair/edit.php] LINE completed notify failed: " . $e->getMessage());
            }
        }

        if ($oldStatus !== $newStatus) {
            logActivity($pdo, $id, $newStatus, 'เปลี่ยนสถานะจาก ' . $oldStatus . ' เป็น ' . $newStatus);
        }
        logActivity($pdo, $id, 'updated', 'แก้ไขข้อมูลงานซ่อม');
        $pdo->commit();
        $success = 'บันทึกการแก้ไขเรียบร้อย';
        $row = $pdo->prepare('SELECT * FROM repair WHERE id = ?'); $row->execute([$id]); $row = $row->fetch();
    } catch (Exception $e) { $pdo->rollBack(); $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
renderHeader();
function opt($v, $o) { return $v === $o ? 'selected' : ''; }
function chk($id, $list) { return in_array($id, $list) ? 'checked' : ''; }
?>
<div class="max-w-4xl mx-auto">
    <div class="mb-6">
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับไปงานซ่อม</a>
        <h1 class="mt-2 text-2xl font-bold text-primary">แก้ไขงานซ่อม #<?= $id ?></h1>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded-md p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <form method="post" enctype="multipart/form-data" class="card p-6 space-y-4">
        <h2 class="text-lg font-semibold text-primary border-b pb-2">ข้อมูลทั่วไป</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-secondary">หัวข้องาน</label>
                <input type="text" name="title" value="<?= htmlspecialchars($row['title']) ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div class="sm:col-span-2">
                <label class="block text-sm font-medium text-secondary">ทรัพย์สิน</label>
                <select name="asset_id" required class="input input-bordered w-full mt-1">
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= $row['asset_id']==$a['id']?'selected':'' ?>><?= htmlspecialchars($a['code'].' - '.$a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ช่างผู้รับ</label>
                <select name="assigned_to" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($users as $u): ?>
                    <option value="<?= $u['id'] ?>" <?= opt($row['assigned_to'],$u['id']) ?>><?= htmlspecialchars($u['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ความสำคัญ</label>
                <select name="priority" class="input input-bordered w-full mt-1">
                    <?php foreach (['low'=>'Low','medium'=>'Medium','high'=>'High','critical'=>'Critical'] as $pk => $pl): ?>
                    <option value="<?= $pk ?>" <?= opt($row['priority'],$pk) ?>><?= htmlspecialchars($pl) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานะ</label>
                <select name="status" class="input input-bordered w-full mt-1">
                    <?php foreach (['open','acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled','rejected'] as $s): ?>
                    <option value="<?= $s ?>" <?= opt($row['status'],$s) ?>><?= ucfirst(str_replace('_',' ',$s)) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ข้อมูลจำเพาะ</h2>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">ประเภทการซ่อม</label>
                <select name="repair_type_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($repairTypes as $rt): ?>
                    <option value="<?= $rt['id'] ?>" <?= opt($row['repair_type_id'],$rt['id']) ?>><?= htmlspecialchars($rt['code'].' - '.$rt['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">รหัสอาการเสีย</label>
                <select name="failure_code_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($failureCodes as $fc): ?>
                    <option value="<?= $fc['id'] ?>" <?= opt($row['failure_code_id'],$fc['id']) ?>><?= htmlspecialchars($fc['code'].' - '.$fc['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">รหัสการซ่อม</label>
                <select name="repair_code_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($repairCodes as $rc): ?>
                    <option value="<?= $rc['id'] ?>" <?= opt($row['repair_code_id'],$rc['id']) ?>><?= htmlspecialchars($rc['code'].' - '.$rc['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">โซนงาน</label>
                <select name="work_zone_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($workZones as $wz): ?>
                    <option value="<?= $wz['id'] ?>" <?= opt($row['work_zone_id'],$wz['id']) ?>><?= htmlspecialchars($wz['code'].' - '.$wz['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานที่</label>
                <select name="location_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($locations as $loc): ?>
                    <option value="<?= $loc['id'] ?>" <?= opt($row['location_id'],$loc['id']) ?>><?= htmlspecialchars($loc['code'].' - '.$loc['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">แผนก</label>
                <select name="department_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($departments as $d): ?>
                    <option value="<?= $d['id'] ?>" <?= opt($row['department_id'],$d['id']) ?>><?= htmlspecialchars($d['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">Lot No.</label>
                <input type="text" name="product_lot_no" class="input input-bordered w-full mt-1" value="<?= htmlspecialchars($row['product_lot_no']??'') ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานะเครื่องจักร</label>
                <select name="machine_status" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach (['running'=>'Running','stopped'=>'Stopped','idle'=>'Idle','standby'=>'Standby'] as $mk=>$mv): ?>
                    <option value="<?= $mk ?>" <?= opt($row['machine_status'],$mk) ?>><?= $mv ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สถานะสายการผลิต</label>
                <select name="production_line_status" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach (['normal'=>'Normal','stopped'=>'Stopped','slowdown'=>'Slowdown'] as $pk2=>$pv): ?>
                    <option value="<?= $pk2 ?>" <?= opt($row['production_line_status'],$pk2) ?>><?= $pv ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">วันที่คาดว่าจะเสร็จ</label>
                <input type="datetime-local" name="estimated_completion_date" class="input input-bordered w-full mt-1" value="<?= str_replace(' ','T',$row['estimated_completion_date']??'') ?>">
            </div>
            <div class="flex items-center mt-6">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="safety_related" value="1" class="w-4 h-4 text-red-600 border-line rounded focus:ring-red-500" <?= $row['safety_related']?'checked':'' ?>>
                    <span class="text-sm font-medium text-secondary">เกี่ยวกับความปลอดภัย (Safety)</span>
                </label>
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">รายละเอียดงาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">รายละเอียด</label>
                <textarea name="description" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['description']??'') ?></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">รายงานอาการเสีย</label>
                <textarea name="failure_report" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['failure_report']??'') ?></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">การวินิจฉัย</label>
                <textarea name="diagnosis" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['diagnosis']??'') ?></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">แนวทางแก้ไข</label>
                <textarea name="resolution" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['resolution']??'') ?></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สาเหตุหลัก (Root Cause)</label>
                <textarea name="root_cause" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['root_cause']??'') ?></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">วิธีแก้ไข (Solution)</label>
                <textarea name="solution" rows="3" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['solution']??'') ?></textarea>
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ค่าใช้จ่ายและระยะเวลา</h2>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">ค่าแรง</label>
                <input type="number" name="cost_labor" step="0.01" class="input input-bordered w-full mt-1" value="<?= $row['cost_labor'] ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">ค่าอะไหล่</label>
                <input type="number" name="cost_parts" step="0.01" class="input input-bordered w-full mt-1" value="<?= $row['cost_parts'] ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">เริ่มหยุด</label>
                <input type="datetime-local" name="downtime_start" class="input input-bordered w-full mt-1" value="<?= str_replace(' ','T',$row['downtime_start']??'') ?>">
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">สิ้นสุดหยุด</label>
                <input type="datetime-local" name="downtime_end" class="input input-bordered w-full mt-1" value="<?= str_replace(' ','T',$row['downtime_end']??'') ?>">
            </div>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">แท็ก</h2>
        <div class="flex flex-wrap gap-3">
            <?php foreach ($tags as $tag): ?>
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="tags[]" value="<?= $tag['id'] ?>" class="w-4 h-4 text-primary-600 border-line rounded" <?= chk($tag['id'], $existingTagIds) ?>>
                <span class="px-2 py-0.5 text-xs font-semibold rounded-full text-white" style="background-color:<?= htmlspecialchars($tag['color']) ?>"><?= htmlspecialchars($tag['name']) ?></span>
            </label>
            <?php endforeach; ?>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">ไฟล์แนบ</h2>
        <?php if ($attachments): ?>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <?php foreach ($attachments as $att): ?>
            <div class="relative border rounded p-2">
                <?php if (str_starts_with($att['file_type']??'','image/')): ?>
                <img src="/<?= htmlspecialchars($att['file_path']) ?>" class="w-full h-20 object-cover rounded" alt="<?= htmlspecialchars($att['file_name']) ?>">
                <?php else: ?>
                <span class="text-xs"><?= htmlspecialchars($att['file_name']) ?></span>
                <?php endif; ?>
                <a href="?del_att=<?= $att['id'] ?>&id=<?= $id ?>" class="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600" onclick="return confirm('ลบไฟล์นี้?')">&times;</a>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
        <div>
            <label class="block text-sm font-medium text-secondary">📸 รูปก่อนซ่อม (Before) — failure_image</label>
            <input type="file" name="failure_image[]" multiple accept="image/*" class="input input-bordered w-full mt-1">
            <p class="text-xs text-muted mt-1">รูปสภาพเครื่องก่อนซ่อม / อาการเสีย (เลือกหลายไฟล์ได้) — ใช้ส่ง LINE ตอนแจ้งงานและตอนปิดงาน</p>
        </div>
        <div>
            <label class="block text-sm font-medium text-secondary">📸 รูปหลังซ่อม (After)</label>
            <input type="file" name="after_image[]" multiple accept="image/*" class="input input-bordered w-full mt-1">
            <p class="text-xs text-muted mt-1">รูปหลังซ่อมเสร็จ — ใช้ส่ง LINE ตอนปิดงาน (สถานะเปลี่ยนเป็น ซ่อมเสร็จ)</p>
        </div>

        <h2 class="text-lg font-semibold text-primary border-b pb-2">การปฏิเสธงาน</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-secondary">เหตุผลที่ปฏิเสธ</label>
                <select name="rejection_reason_id" class="input input-bordered w-full mt-1">
                    <option value="">-- ไม่ระบุ --</option>
                    <?php foreach ($rejectionReasons as $rr): ?>
                    <option value="<?= $rr['id'] ?>" <?= opt($row['rejection_reason_id'],$rr['id']) ?>><?= htmlspecialchars($rr['code'].' - '.$rr['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-secondary">หมายเหตุปฏิเสธ</label>
                <textarea name="rejection_note" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['rejection_note']??'') ?></textarea>
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-secondary">หมายเหตุ</label>
            <textarea name="notes" rows="2" class="input input-bordered w-full mt-1"><?= htmlspecialchars($row['notes']??'') ?></textarea>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="btn-primary">บันทึก</button>
            <a href="view.php?id=<?= $id ?>" class="btn-secondary">ยกเลิก</a>
        </div>
    </form>

    <div class="mt-8">
        <h2 class="text-lg font-semibold text-primary border-b pb-2 mb-4">ประวัติการดำเนินการ</h2>
        <div class="space-y-2">
            <?php
            $logs = $pdo->prepare('SELECT l.*, u.full_name FROM repair_activity_log l LEFT JOIN users u ON l.user_id = u.id WHERE l.repair_id = ? ORDER BY l.created_at DESC');
            $logs->execute([$id]); $logs = $logs->fetchAll();
            ?>
            <?php if (empty($logs)): ?>
            <p class="text-sm text-muted">ไม่มีประวัติ</p>
            <?php else: ?>
            <?php foreach ($logs as $log): ?>
            <div class="flex items-start gap-3 text-sm border-b border-line pb-2">
                <span class="text-muted whitespace-nowrap"><?= htmlspecialchars(date('d/m/Y H:i', strtotime($log['created_at']))) ?></span>
                <span class="font-medium text-secondary"><?= htmlspecialchars($log['full_name']??'ระบบ') ?></span>
                <span class="text-secondary"><?= htmlspecialchars($log['description'] ?? $log['action']) ?></span>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>
</div>
<?php
if (isset($_GET['del_att'])) {
    $aid = (int)$_GET['del_att'];
    $att = $pdo->prepare('SELECT file_path FROM repair_attachments WHERE id = ? AND repair_id = ?'); $att->execute([$aid, $id]); $att = $att->fetch();
    if ($att) {
        $fp = __DIR__ . '/../../../' . $att['file_path'];
        if (file_exists($fp)) unlink($fp);
        $pdo->prepare('DELETE FROM repair_attachments WHERE id = ?')->execute([$aid]);
        echo '<script>location.href="edit.php?id=' . $id . '";</script>'; exit;
    }
}
renderFooter();
?>
