<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ชั่วโมงการผลิต (Production Hours) — CMMS-TPT';
$pdo = getDb();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $id     = (int)($_POST['id'] ?? 0);
        $asset  = (int)($_POST['asset_id'] ?? 0);
        $date   = $_POST['record_date'] ?? date('Y-m-d');
        $hours  = (float)($_POST['hours'] ?? 0);
        $shift  = trim((string)($_POST['shift'] ?? '')) ?: null;
        $notes  = trim((string)($_POST['notes'] ?? '')) ?: null;
        if ($asset <= 0) throw new Exception('กรุณาเลือกทรัพย์สิน');
        if ($id) {
            $pdo->prepare('UPDATE production_hours SET asset_id=?, record_date=?, hours=?, shift=?, notes=? WHERE id=?')
                ->execute([$asset, $date, $hours, $shift, $notes, $id]);
            $msg = 'updated';
        } else {
            $pdo->prepare('INSERT INTO production_hours (asset_id, record_date, hours, shift, notes, created_by) VALUES (?,?,?,?,?,?)')
                ->execute([$asset, $date, $hours, $shift, $notes, (int)($_SESSION['user_id'] ?? 0) ?: null]);
            $msg = 'created';
        }
    } catch (Exception $e) {
        $msg = 'error: ' . $e->getMessage();
    }
}

$delId = (int)($_GET['delete'] ?? 0);
if ($delId) {
    try { $pdo->prepare('DELETE FROM production_hours WHERE id=?')->execute([$delId]); $msg = 'deleted'; }
    catch (Exception $e) { $msg = 'error: ' . $e->getMessage(); }
}

$editId = (int)($_GET['edit'] ?? 0);
$editRow = null;
if ($editId) {
    $s = $pdo->prepare('SELECT * FROM production_hours WHERE id=?');
    $s->execute([$editId]);
    $editRow = $s->fetch();
}

$month = $_GET['month'] ?? date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $month)) $month = date('Y-m');
$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();

$stmt = $pdo->prepare("SELECT ph.*, a.code AS asset_code, a.name AS asset_name, u.full_name AS created_name
    FROM production_hours ph
    LEFT JOIN asset_registry a ON ph.asset_id = a.id
    LEFT JOIN users u ON ph.created_by = u.id
    WHERE DATE_FORMAT(ph.record_date, '%Y-%m') = ?
    ORDER BY ph.record_date DESC, ph.id DESC");
$stmt->execute([$month]);
$rows = $stmt->fetchAll();

$totalHours = array_sum(array_map(fn($r) => (float)$r['hours'], $rows));
$assetCount = count(array_unique(array_map(fn($r) => (int)$r['asset_id'], $rows)));

renderHeader();
?>
<div class="space-y-4">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-primary">⏱️ ชั่วโมงการผลิต (Production Hours)</h1>
            <p class="mt-1 text-sm text-muted">บันทึกเวลาทำงานจริงของเครื่องจักร — ใช้เป็นฐานคำนวณ MTBF / MTTR / OEE / Availability</p>
        </div>
        <a href="index.php" class="text-sm text-primary-600 hover:text-primary-700">&larr; กลับ MTBF/MTTR</a>
    </div>

    <?php if ($msg): ?>
    <div class="<?= str_starts_with($msg, 'error') ? 'cmms-banner error' : 'cmms-banner success' ?> text-sm rounded p-3"><?= htmlspecialchars($msg) ?></div>
    <?php endif; ?>

    <div class="card p-4">
        <h2 class="text-lg font-semibold mb-3"><?= $editRow ? 'แก้ไข' : 'เพิ่ม' ?>ชั่วโมงการผลิต</h2>
        <form method="post" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <?= csrfField() ?>
            <?php if ($editRow): ?><input type="hidden" name="id" value="<?= (int)$editRow['id'] ?>"><?php endif; ?>
            <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-secondary" for="field_asset_id">ทรัพย์สิน <span class="text-red-500">*</span></label>
                <select name="asset_id" id="field_asset_id" required class="input input-bordered w-full mt-1">
                    <option value="">-- เลือกทรัพย์สิน --</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>" <?= $editRow && (int)$editRow['asset_id'] === (int)$a['id'] ? 'selected' : '' ?>><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-secondary" for="field_record_date">วันที่</label>
                <input type="date" name="record_date" id="field_record_date" value="<?= htmlspecialchars($editRow['record_date'] ?? date('Y-m-d')) ?>" required class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-xs font-medium text-secondary" for="field_hours">ชั่วโมงทำงาน</label>
                <input type="number" step="0.5" min="0" name="hours" id="field_hours" value="<?= htmlspecialchars((string)($editRow['hours'] ?? '0')) ?>" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-xs font-medium text-secondary" for="field_shift">กะ (ถ้ามี)</label>
                <input type="text" name="shift" id="field_shift" value="<?= htmlspecialchars($editRow['shift'] ?? '') ?>" placeholder="เช่น A / B / C" class="input input-bordered w-full mt-1">
            </div>
            <div>
                <label class="block text-xs font-medium text-secondary" for="field_notes">หมายเหตุ</label>
                <input type="text" name="notes" id="field_notes" value="<?= htmlspecialchars($editRow['notes'] ?? '') ?>" class="input input-bordered w-full mt-1">
            </div>
            <div class="flex gap-2 items-end">
                <button type="submit" class="btn-primary">บันทึก</button>
                <?php if ($editRow): ?><a href="?" class="btn-secondary">ยกเลิก</a><?php endif; ?>
            </div>
        </form>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="card p-4"><div class="text-xs text-muted">ชั่วโมงรวมเดือนนี้</div><div class="text-2xl font-bold text-primary"><?= number_format($totalHours, 1) ?> ชม.</div></div>
        <div class="card p-4"><div class="text-xs text-muted">เครื่องจักรที่มีบันทึก</div><div class="text-2xl font-bold text-primary"><?= $assetCount ?> เครื่อง</div></div>
        <div class="card p-4"><div class="text-xs text-muted">จำนวนรายการ</div><div class="text-2xl font-bold text-primary"><?= count($rows) ?></div></div>
    </div>

    <div class="card overflow-hidden">
        <div class="p-4 border-b border-line flex items-center justify-between">
            <h2 class="text-lg font-semibold">รายการเดือน <?= htmlspecialchars($month) ?></h2>
            <form method="get" class="flex items-center gap-2">
                <input type="month" name="month" value="<?= htmlspecialchars($month) ?>" class="input input-bordered text-sm">
                <button type="submit" class="btn-secondary btn-sm">ดู</button>
            </form>
        </div>
        <div class="table-wrap">
            <table class="data-table cmms-stack-table">
                <thead class="bg-subtle"><tr><th>วันที่</th><th>ทรัพย์สิน</th><th style="text-align:right;">ชั่วโมง</th><th>กะ</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
                <tbody class="divide-y divide-line">
                <?php foreach ($rows as $r): ?>
                    <tr class="hover:bg-subtle">
                        <td data-label="วันที่" class="px-4 py-3 text-sm"><?= htmlspecialchars($r['record_date']) ?></td>
                        <td data-label="ทรัพย์สิน" class="px-4 py-3 text-sm"><span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code'] ?? '') ?></span> <?= htmlspecialchars($r['asset_name'] ?? '-') ?></td>
                        <td data-label="ชั่วโมง" class="px-4 py-3 text-sm text-right font-mono"><?= number_format((float)$r['hours'], 1) ?></td>
                        <td data-label="กะ" class="px-4 py-3 text-sm"><?= htmlspecialchars($r['shift'] ?? '-') ?></td>
                        <td data-label="หมายเหตุ" class="px-4 py-3 text-sm text-secondary"><?= htmlspecialchars($r['notes'] ?? '-') ?></td>
                        <td data-label="จัดการ" class="px-4 py-3 text-sm space-x-2">
                            <a href="?edit=<?= $r['id'] ?>&month=<?= urlencode($month) ?>" class="text-primary-600">แก้ไข</a>
                            <a href="?delete=<?= $r['id'] ?>&month=<?= urlencode($month) ?>" class="text-red-600" onclick="return confirm('ลบรายการนี้?')">ลบ</a>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if (empty($rows)): ?><tr><td colspan="6" class="cmms-empty-state-cell">ไม่มีข้อมูลในเดือนนี้</td></tr><?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
<?php renderFooter(); ?>
