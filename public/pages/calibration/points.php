<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'จุดสอบเทียบ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$calibrationId = (int)($_GET['calibration_id'] ?? 0);
if (!$calibrationId) { echo '<div class="text-center py-8 text-gray-500">ไม่ระบุรหัสการสอบเทียบ</div><a href="history.php" class="btn-secondary">กลับ</a>'; renderFooter(); exit; }
$cal = $pdo->prepare('SELECT h.*, a.name AS asset_name, a.code AS asset_code FROM calibration_history h LEFT JOIN asset_registry a ON h.asset_id = a.id WHERE h.id=?');
$cal->execute([$calibrationId]); $cal = $cal->fetch();
if (!$cal) { echo '<div class="text-center py-8 text-gray-500">ไม่พบข้อมูลการสอบเทียบ</div>'; renderFooter(); exit; }
$error = '';
$success = '';
$editId = (int)($_GET['edit'] ?? 0);
$deleteId = (int)($_GET['delete'] ?? 0);
if ($deleteId && $_SERVER['REQUEST_METHOD'] === 'POST') {
    try { $pdo->prepare('DELETE FROM calibration_points WHERE id=? AND calibration_id=?')->execute([$deleteId, $calibrationId]); $success = 'ลบจุดสอบเทียบเรียบร้อย'; } catch (Exception $e) { $error = $e->getMessage(); }
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$deleteId) {
    try {
        $toNull = fn($v) => ($v ?? '') === '' ? null : $v;
        $nominal = $toNull($_POST['nominal_value']);
        $measured = $toNull($_POST['measured_value']);
        $mpe = $toNull($_POST['mpe_value']);
        $correction = $toNull($_POST['correction']);
        $uncertainty = $toNull($_POST['uncertainty']);
        if ($editId) {
            $conformance = $_POST['conformance'] ?? 'conditional';
            $pdo->prepare('UPDATE calibration_points SET point_label=?, nominal_value=?, measured_value=?, correction=?, uncertainty=?, mpe_value=?, conformance=?, notes=? WHERE id=? AND calibration_id=?')->execute([
                $_POST['point_label'], $nominal, $measured, $correction, $uncertainty, $mpe, $conformance, $toNull($_POST['notes']), $editId, $calibrationId
            ]);
            $success = 'บันทึกจุดสอบเทียบเรียบร้อย';
        } else {
            $correctionVal = $correction;
            if ($correctionVal === null && $nominal !== null && $measured !== null) {
                $correctionVal = (float)$measured - (float)$nominal;
            }
            $autoConformance = 'conditional';
            if ($correctionVal !== null && $mpe !== null) {
                $autoConformance = abs((float)$correctionVal) <= (float)$mpe ? 'pass' : 'fail';
            }
            $conformance = $_POST['conformance'] ?? $autoConformance;
            $pdo->prepare('INSERT INTO calibration_points (calibration_id, point_label, nominal_value, measured_value, correction, uncertainty, mpe_value, conformance, notes) VALUES (?,?,?,?,?,?,?,?,?)')->execute([
                $calibrationId, $_POST['point_label'], $nominal, $measured, $correctionVal, $uncertainty, $mpe, $conformance, $toNull($_POST['notes'])
            ]);
            $success = 'เพิ่มจุดสอบเทียบเรียบร้อย';
        }
    } catch (Exception $e) { $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage(); }
}
$stmt = $pdo->prepare('SELECT * FROM calibration_points WHERE calibration_id=? ORDER BY id');
$stmt->execute([$calibrationId]);
$points = $stmt->fetchAll();
$editRow = null;
if ($editId) { $er = $pdo->prepare('SELECT * FROM calibration_points WHERE id=? AND calibration_id=?'); $er->execute([$editId, $calibrationId]); $editRow = $er->fetch(); }
$conformanceLabel = ['pass'=>'ผ่าน','fail'=>'ไม่ผ่าน','conditional'=>'มีเงื่อนไข'];
?>
<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">จุดสอบเทียบ</h1>
            <p class="mt-1 text-sm text-gray-500">Calibration Points — <?= htmlspecialchars(($cal['asset_code'] ?? '') . ' - ' . ($cal['asset_name'] ?? '')) ?> (<?= htmlspecialchars($cal['calibration_date']) ?>)</p>
        </div>
        <a href="history.php?asset_id=<?= $cal['asset_id'] ?>" class="btn-secondary">&larr; กลับไปประวัติ</a>
    </div>
    <?php if ($error): ?><div class="cmms-banner error text-sm rounded p-3 mb-4"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <?php if ($success): ?><div class="cmms-banner success text-sm rounded p-3 mb-4"><?= htmlspecialchars($success) ?></div><?php endif; ?>
    <div class="card p-6">
        <h2 class="text-lg font-semibold mb-4"><?= $editRow ? 'แก้ไขจุดสอบเทียบ' : 'เพิ่มจุดสอบเทียบ' ?></h2>
        <form method="post" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">จุดวัด <span class="text-red-500">*</span></label>
                    <input type="text" name="point_label" value="<?= htmlspecialchars($editRow['point_label'] ?? '') ?>" required class="input input-bordered w-full mt-1" placeholder="เช่น จุดที่ 1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">ค่า nominal</label>
                    <input type="number" name="nominal_value" step="any" value="<?= htmlspecialchars($editRow['nominal_value'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">ค่าที่วัดได้</label>
                    <input type="number" name="measured_value" step="any" value="<?= htmlspecialchars($editRow['measured_value'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Correction</label>
                    <input type="number" name="correction" step="any" value="<?= htmlspecialchars($editRow['correction'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Uncertainty</label>
                    <input type="number" name="uncertainty" step="any" value="<?= htmlspecialchars($editRow['uncertainty'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">ค่า MPE</label>
                    <input type="number" name="mpe_value" step="any" value="<?= htmlspecialchars($editRow['mpe_value'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">ผลการตรวจสอบ</label>
                    <select name="conformance" class="input input-bordered w-full mt-1">
                        <option value="pass" <?= (isset($editRow) && $editRow['conformance'] === 'pass') ? 'selected' : '' ?>>ผ่าน</option>
                        <option value="fail" <?= (isset($editRow) && $editRow['conformance'] === 'fail') ? 'selected' : '' ?>>ไม่ผ่าน</option>
                        <option value="conditional" <?= (isset($editRow) && $editRow['conformance'] === 'conditional') ? 'selected' : '' ?>>มีเงื่อนไข</option>
                    </select>
                </div>
                <div class="sm:col-span-3">
                    <label class="block text-sm font-medium text-gray-700">หมายเหตุ</label>
                    <input type="text" name="notes" value="<?= htmlspecialchars($editRow['notes'] ?? '') ?>" class="input input-bordered w-full mt-1">
                </div>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="btn-primary"><?= $editRow ? 'บันทึก' : 'เพิ่ม' ?></button>
                <?php if ($editRow): ?><a href="?calibration_id=<?= $calibrationId ?>" class="btn-secondary">ยกเลิก</a><?php endif; ?>
            </div>
        </form>
    </div>
    <div class="card overflow-hidden">
        <table class="data-table cmms-stack-table">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จุดวัด</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nominal</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Measured</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correction</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uncertainty</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MPE</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผล</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                <?php foreach ($points as $p): ?>
                <tr class="hover:bg-gray-50">
                    <td data-label="จุดวัด" class="px-4 py-3 text-sm font-medium text-gray-900"><?= htmlspecialchars($p['point_label']) ?></td>
                    <td data-label="Nominal" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($p['nominal_value'] ?? '-') ?></td>
                    <td data-label="Measured" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($p['measured_value'] ?? '-') ?></td>
                    <td data-label="Correction" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($p['correction'] ?? '-') ?></td>
                    <td data-label="Uncertainty" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($p['uncertainty'] ?? '-') ?></td>
                    <td data-label="MPE" class="px-4 py-3 text-sm text-gray-600"><?= htmlspecialchars($p['mpe_value'] ?? '-') ?></td>
                    <td data-label="ผล" class="px-4 py-3 text-sm">
                        <span class="badge <?= $p['conformance'] === 'pass' ? 'status-pass' : ($p['conformance'] === 'fail' ? 'status-fail' : 'status-pending') ?>">
                            <?= htmlspecialchars($conformanceLabel[$p['conformance']] ?? $p['conformance']) ?>
                        </span>
                    </td>
                    <td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2">
                        <a href="?calibration_id=<?= $calibrationId ?>&edit=<?= $p['id'] ?>" class="text-primary-600 hover:text-primary-700">แก้ไข</a>
                        <a href="?calibration_id=<?= $calibrationId ?>&delete=<?= $p['id'] ?>" class="text-red-600 hover:text-red-700" onclick="return confirm('ลบจุดนี้?')">ลบ</a>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($points)): ?>
                <tr><td colspan="8" class="cmms-empty-state-cell">ไม่มีจุดสอบเทียบ</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php renderFooter(); ?>
