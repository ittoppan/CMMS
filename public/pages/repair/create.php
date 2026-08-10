<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'สร้างงานซ่อม — CMMS-TPT';
$pdo = getDb();

$assets       = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();
$users        = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$repairTypes  = $pdo->query('SELECT id, code, name FROM repair_types ORDER BY name')->fetchAll();
$failureCodes = $pdo->query('SELECT id, code, name FROM failure_codes ORDER BY name')->fetchAll();
$repairCodes  = $pdo->query('SELECT id, code, name FROM repair_codes ORDER BY name')->fetchAll();
$workZones    = $pdo->query('SELECT id, code, name FROM work_zones ORDER BY name')->fetchAll();
$locations    = $pdo->query('SELECT id, code, name FROM locations ORDER BY name')->fetchAll();
$departments  = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
$tags         = $pdo->query('SELECT id, name, color FROM repair_tags ORDER BY name')->fetchAll();

$error = ''; $success = '';

function logActivity($pdo, $repairId, $action, $desc) {
    $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)')
        ->execute([$repairId, $_SESSION['user_id'], $action, $desc]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo->beginTransaction();
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $toZero = fn($v) => (float)($v ?? 0);
        $safety = (int)(!empty($_POST['safety_related']));

        $stmt = $pdo->prepare('INSERT INTO repair (asset_id, assigned_to, created_by, priority, status, title, description, failure_report, diagnosis, resolution, downtime_start, downtime_end, cost_parts, cost_labor, notes, repair_type_id, failure_code_id, repair_code_id, work_zone_id, location_id, department_id, safety_related, product_lot_no, machine_status, production_line_status, estimated_completion_date, root_cause, solution) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $_POST['asset_id'], $toNull($_POST['assigned_to'] ?? null), $_SESSION['user_id'],
            $_POST['priority'] ?? 'medium', $_POST['status'] ?? 'open', $_POST['title'],
            $toNull($_POST['description'] ?? null), $toNull($_POST['failure_report'] ?? null),
            $toNull($_POST['diagnosis'] ?? null), $toNull($_POST['resolution'] ?? null),
            $toNull($_POST['downtime_start'] ?? null), $toNull($_POST['downtime_end'] ?? null),
            $toZero($_POST['cost_parts'] ?? 0), $toZero($_POST['cost_labor'] ?? 0),
            $toNull($_POST['notes'] ?? null),
            $toNull($_POST['repair_type_id'] ?? null), $toNull($_POST['failure_code_id'] ?? null),
            $toNull($_POST['repair_code_id'] ?? null), $toNull($_POST['work_zone_id'] ?? null),
            $toNull($_POST['location_id'] ?? null), $toNull($_POST['department_id'] ?? null),
            $safety, $toNull($_POST['product_lot_no'] ?? null),
            $toNull($_POST['machine_status'] ?? null), $toNull($_POST['production_line_status'] ?? null),
            $toNull($_POST['estimated_completion_date'] ?? null),
            $toNull($_POST['root_cause'] ?? null), $toNull($_POST['solution'] ?? null)
        ]);
        $repairId = $pdo->lastInsertId();
        $woNo = 'EN-' . date('y') . '-' . str_pad($repairId, 3, '0', STR_PAD_LEFT);
        $pdo->prepare("UPDATE repair SET work_order_no = ? WHERE id = ?")->execute([$woNo, $repairId]);

        if (!empty($_POST['tags']) && is_array($_POST['tags'])) {
            $ts = $pdo->prepare('INSERT INTO repair_tag_pivot (repair_id, tag_id) VALUES (?,?)');
            foreach ($_POST['tags'] as $tid) { $ts->execute([$repairId, (int)$tid]); }
        }

        $upDir = __DIR__ . '/../../../uploads/repair/';
        $pubDir = __DIR__ . '/../../../public/uploads/repair/';
        if (!is_dir($upDir)) mkdir($upDir, 0775, true);
        if (!is_dir($pubDir)) mkdir($pubDir, 0775, true);
        $is = $pdo->prepare('INSERT INTO repair_attachments (repair_id, file_name, file_path, file_type, file_size, category, uploaded_by) VALUES (?,?,?,?,?,?,?)');

        // Process Photo Uploads & Camera Captures
        if (!empty($_FILES['failure_image']['name'][0])) {
            foreach ($_FILES['failure_image']['name'] as $i => $name) {
                if ($_FILES['failure_image']['error'][$i] !== UPLOAD_ERR_OK) continue;
                $ext = pathinfo($name, PATHINFO_EXTENSION) ?: 'jpg';
                $fname = uniqid('img_') . '.' . $ext;
                if (move_uploaded_file($_FILES['failure_image']['tmp_name'][$i], $upDir . $fname)) {
                    @copy($upDir . $fname, $pubDir . $fname);
                    $is->execute([$repairId, $name, 'uploads/repair/' . $fname, mime_content_type($upDir . $fname), $_FILES['failure_image']['size'][$i], 'failure_image', $_SESSION['user_id']]);
                }
            }
        }

        // Process Video Uploads & Camera Recordings
        if (!empty($_FILES['failure_video']['name'][0])) {
            foreach ($_FILES['failure_video']['name'] as $i => $name) {
                if ($_FILES['failure_video']['error'][$i] !== UPLOAD_ERR_OK) continue;
                $ext = pathinfo($name, PATHINFO_EXTENSION) ?: 'mp4';
                $fname = uniqid('vid_') . '.' . $ext;
                if (move_uploaded_file($_FILES['failure_video']['tmp_name'][$i], $upDir . $fname)) {
                    @copy($upDir . $fname, $pubDir . $fname);
                    $is->execute([$repairId, $name, 'uploads/repair/' . $fname, mime_content_type($upDir . $fname), $_FILES['failure_video']['size'][$i], 'failure_video', $_SESSION['user_id']]);
                }
            }
        }

        logActivity($pdo, $repairId, 'created', 'สร้างงานซ่อมใหม่');
        $pdo->commit();
        $success = 'สร้างงานซ่อมเรียบร้อย';
        echo '<script>setTimeout(function(){ window.location.href="view.php?id=' . $repairId . '"; }, 1000);</script>';
    } catch (Exception $e) {
        $pdo->rollBack();
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}
renderHeader();
?>
<div class="max-w-4xl mx-auto">
    <div class="mb-6 flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-border">
        <div>
            <a href="index.php" class="text-xs text-accent hover:underline font-medium">&larr; กลับไปงานซ่อม</a>
            <h1 class="text-2xl font-semibold text-primary tracking-tight mt-1">🔧 สร้างใบสั่งงานซ่อมใหม่ (New Work Order)</h1>
        </div>
        <a href="request.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-accent border border-border rounded-md font-semibold text-xs inline-flex items-center gap-1.5 transition-colors">
            👨🏻‍🔧 แบบฟอร์มแจ้งซ่อมสำหรับผู้ใช้งานทั่วไป (User Request Form) &rarr;
        </a>
    </div>

    <?php if ($error): ?><div class="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-md text-sm mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-md text-sm mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>

    <form method="post" enctype="multipart/form-data" class="space-y-6">

        <div class="form-section">
            <h2 class="form-section-title">📌 ข้อมูลทั่วไป</h2>
            <div class="form-grid">
                <div style="grid-column: span 2;">
                    <label class="form-label">หัวข้องานซ่อม <span class="req">*</span></label>
                    <input type="text" name="title" required placeholder="เช่น เสียงดังผิดปกติที่มอเตอร์หลัก...">
                </div>
                <div style="grid-column: span 2;">
                    <label class="form-label">ทรัพย์สิน / เครื่องจักร <span class="req">*</span></label>
                    <select name="asset_id" required>
                        <option value="">-- เลือกทรัพย์สิน --</option>
                        <?php foreach ($assets as $a): ?>
                        <option value="<?= $a['id'] ?>"><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">ช่างผู้รับผิดชอบ</label>
                    <select name="assigned_to">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($users as $u): ?>
                        <option value="<?= $u['id'] ?>"><?= htmlspecialchars($u['full_name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">ระดับความสำคัญ</label>
                    <select name="priority">
                        <?php foreach (['low'=>'Low — ต่ำ','medium'=>'Medium — ปานกลาง','high'=>'High — สูง','critical'=>'Critical — วิกฤต'] as $pk => $pl): ?>
                        <option value="<?= $pk ?>" <?= $pk==='medium'?'selected':'' ?>><?= htmlspecialchars($pl) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">สถานะเริ่มต้น</label>
                    <select name="status">
                        <?php foreach (['open'=>'Open','acknowledged'=>'Acknowledged','in_progress'=>'In Progress','waiting_parts'=>'Waiting Parts','waiting_approval'=>'Waiting Approval'] as $s => $lbl): ?>
                        <option value="<?= $s ?>" <?= $s==='open'?'selected':'' ?>><?= $lbl ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
        </div>

        <div class="form-section">
            <h2 class="form-section-title">⚙️ ข้อมูลจำเพาะทางเทคนิค</h2>
            <div class="form-grid">
                <div>
                    <label class="form-label">ประเภทการซ่อม</label>
                    <select name="repair_type_id">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($repairTypes as $rt): ?>
                        <option value="<?= $rt['id'] ?>"><?= htmlspecialchars($rt['code'].' - '.$rt['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">รหัสอาการเสีย (Failure Code)</label>
                    <select name="failure_code_id">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($failureCodes as $fc): ?>
                        <option value="<?= $fc['id'] ?>"><?= htmlspecialchars($fc['code'].' - '.$fc['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">รหัสการซ่อม (Repair Code)</label>
                    <select name="repair_code_id">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($repairCodes as $rc): ?>
                        <option value="<?= $rc['id'] ?>"><?= htmlspecialchars($rc['code'].' - '.$rc['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">โซนงาน (Work Zone)</label>
                    <select name="work_zone_id">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($workZones as $wz): ?>
                        <option value="<?= $wz['id'] ?>"><?= htmlspecialchars($wz['code'].' - '.$wz['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">สถานที่ (Location)</label>
                    <select name="location_id">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($locations as $loc): ?>
                        <option value="<?= $loc['id'] ?>"><?= htmlspecialchars($loc['code'].' - '.$loc['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">แผนก (Department)</label>
                    <select name="department_id">
                        <option value="">-- ไม่ระบุ --</option>
                        <?php foreach ($departments as $d): ?>
                        <option value="<?= $d['id'] ?>"><?= htmlspecialchars($d['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="form-label">Lot No. สินค้า</label>
                    <input type="text" name="product_lot_no" placeholder="เช่น LOT-2026-07">
                </div>
                <div>
                    <label class="form-label">สถานะเครื่องจักร</label>
                    <select name="machine_status">
                        <option value="">-- ไม่ระบุ --</option>
                        <option value="running">Running — เดินเครื่องอยู่</option>
                        <option value="stopped">Stopped — เครื่องหยุดทำงาน</option>
                        <option value="idle">Idle — ว่างงาน</option>
                        <option value="standby">Standby — สำรอง</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">สถานะสายการผลิต</label>
                    <select name="production_line_status">
                        <option value="">-- ไม่ระบุ --</option>
                        <option value="normal">Normal — ปกติ</option>
                        <option value="stopped">Stopped — ไลน์หยุด</option>
                        <option value="slowdown">Slowdown — ไลน์ชะลอตัว</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">วันที่คาดว่าจะเสร็จ</label>
                    <input type="datetime-local" name="estimated_completion_date">
                </div>
                <div style="display:flex;align-items:center;margin-top:20px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--accent-rose);font-weight:600;">
                        <input type="checkbox" name="safety_related" value="1" style="width:16px;height:16px;">
                        ⚠️ เกี่ยวกับความปลอดภัย (Safety Related)
                    </label>
                </div>
            </div>
        </div>

        <div class="form-section">
            <h2 class="form-section-title">📝 รายละเอียดและวิเคราะห์</h2>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                <div>
                    <label class="form-label">รายละเอียดอาการเสีย</label>
                    <textarea name="description" rows="3"></textarea>
                </div>
                <div>
                    <label class="form-label">รายงานการเกิดความเสียหาย</label>
                    <textarea name="failure_report" rows="3"></textarea>
                </div>
                <div>
                    <label class="form-label">การวินิจฉัยทางเทคนิค</label>
                    <textarea name="diagnosis" rows="3"></textarea>
                </div>
                <div>
                    <label class="form-label">แนวทางการแก้ไข</label>
                    <textarea name="resolution" rows="3"></textarea>
                </div>
                <div>
                    <label class="form-label">สาเหตุหลัก (Root Cause)</label>
                    <textarea name="root_cause" rows="3"></textarea>
                </div>
                <div>
                    <label class="form-label">วิธีป้องกัน/แก้ไขยั่งยืน (Solution)</label>
                    <textarea name="solution" rows="3"></textarea>
                </div>
            </div>
        </div>

        <div class="form-section">
            <h2 class="form-section-title">💰 ค่าใช้จ่ายและระยะเวลา Downtime</h2>
            <div class="form-grid">
                <div>
                    <label class="form-label">ค่าแรง (บาท)</label>
                    <input type="number" name="cost_labor" step="0.01" value="0">
                </div>
                <div>
                    <label class="form-label">ค่าอะไหล่ (บาท)</label>
                    <input type="number" name="cost_parts" step="0.01" value="0">
                </div>
                <div>
                    <label class="form-label">เริ่มเวลาเครื่องหยุด (Downtime Start)</label>
                    <input type="datetime-local" name="downtime_start">
                </div>
                <div>
                    <label class="form-label">สิ้นสุดเวลาหยุด (Downtime End)</label>
                    <input type="datetime-local" name="downtime_end">
                </div>
            </div>
        </div>

        <div class="form-section">
            <h2 class="form-section-title">🏷️ แท็ก & ไฟล์แนบ</h2>
            <div style="margin-bottom:16px;">
                <label class="form-label" style="margin-bottom:8px;">แท็กป้ายกำกับ</label>
                <div style="display:flex;flex-wrap:wrap;gap:10px;">
                    <?php foreach ($tags as $tag): ?>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="tags[]" value="<?= $tag['id'] ?>" style="width:16px;height:16px;">
                        <span class="badge" style="background-color:<?= htmlspecialchars($tag['color']) ?>;color:white;"><?= htmlspecialchars($tag['name']) ?></span>
                    </label>
                    <?php endforeach; ?>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label class="form-label font-bold text-blue-900 flex items-center gap-1">
                        📸 ถ่ายภาพจากกล้อง / แนบรูปภาพ (.JPG, .PNG)
                    </label>
                    <input type="file" name="failure_image[]" multiple accept="image/*" capture="environment" class="input input-bordered w-full mt-1">
                    <p class="text-xs text-blue-700 mt-1">กดที่กล่องเพื่อเปิดกล้องถ่ายภาพบนมือถือทันที หรือเลือกจากคลังภาพ (รองรับสูงสุด 1 รูปตามมาตรฐาน F-EN-03 หรือหลายรูปได้)</p>
                </div>
                
                <div class="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <label class="form-label font-bold text-indigo-900 flex items-center gap-1">
                        🎥 อัดวิดีโอจากกล้อง / แนบไฟล์วิดีโอ (.MP4, .MOV)
                    </label>
                    <input type="file" name="failure_video[]" multiple accept="video/*" capture="environment" class="input input-bordered w-full mt-1">
                    <p class="text-xs text-indigo-700 mt-1">กดที่กล่องเพื่อเปิดกล้องอัดวิดีโออาการเสียบนมือถือทันที (ความยาวไม่เกิน 1 นาที)</p>
                </div>
            </div>
        </div>

        <div style="display:flex;gap:10px;">
            <button type="submit" class="btn btn-primary btn-lg">บันทึกสร้างงานซ่อม (F-EN-03)</button>
            <a href="index.php" class="btn btn-secondary btn-lg">ยกเลิก</a>
        </div>
    </form>
</div>
<?php renderFooter(); ?>
