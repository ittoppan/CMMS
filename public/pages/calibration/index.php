<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'สอบเทียบเครื่องมือวัด — CMMS-TPT';
$pdo = getDb();

$search       = trim($_GET['search'] ?? '');
$filterStatus = trim($_GET['status'] ?? '');
$filterAsset  = trim($_GET['asset_id'] ?? '');
$filterResult = trim($_GET['result'] ?? '');
$filterType   = trim($_GET['calibration_type'] ?? '');

$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(a.name LIKE ? OR a.code LIKE ? OR c.certificate_number LIKE ?)';
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($filterStatus !== '') { $conditions[] = 'c.status = ?';           $params[] = $filterStatus; }
if ($filterAsset !== '')  { $conditions[] = 'c.asset_id = ?';         $params[] = (int)$filterAsset; }
if ($filterResult !== '') { $conditions[] = 'c.result = ?';           $params[] = $filterResult; }
if ($filterType !== '')   { $conditions[] = 'c.calibration_type = ?'; $params[] = $filterType; }

$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$sql = 'SELECT c.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS performer_name
        FROM calibration c
        LEFT JOIN asset_registry a ON c.asset_id = a.id
        LEFT JOIN users u ON c.performed_by = u.id ' . $where . '
        ORDER BY c.next_calibration_date ASC, c.calibration_date DESC';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$assets = $pdo->query('SELECT id, code, name FROM asset_registry ORDER BY name')->fetchAll();

$statusBadge = ['scheduled'=>'badge-info','in_progress'=>'badge-in_progress','completed'=>'badge-active','overdue'=>'badge-critical','cancelled'=>'badge-inactive'];
$statusLabel = ['scheduled'=>'รอดำเนินการ','in_progress'=>'กำลังดำเนินการ','completed'=>'เสร็จสิ้น','overdue'=>'เกินกำหนด','cancelled'=>'ยกเลิก'];
$resultBadge = ['pass'=>'badge-active','fail'=>'badge-critical','conditional'=>'badge-medium'];
$resultLabel = ['pass'=>'ผ่าน','fail'=>'ไม่ผ่าน','conditional'=>'มีเงื่อนไข'];
$typeLabel   = ['full'=>'เต็มรูปแบบ','abbreviated'=>'แบบย่อ'];
$today = date('Y-m-d');

renderHeader();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">📐 สอบเทียบเครื่องมือวัด</h1>
        <p class="page-desc">Calibration & Instrument Accuracy Tracking (ทั้งหมด <?= count($rows) ?> รายการ)</p>
    </div>
    <div style="display:flex;gap:8px;">
        <a href="po.php" class="btn btn-secondary">PO สอบเทียบ</a>
        <a href="calendar.php" class="btn btn-secondary">ปฏิทิน</a>
        <a href="create.php" class="btn btn-primary">+ เพิ่มรายการสอบเทียบ</a>
    </div>
</div>

<div class="filter-bar">
    <form method="GET" style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;width:100%;">
        <div class="search-input-wrap" style="flex:1;min-width:180px;">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" name="search" value="<?= htmlspecialchars($search) ?>" placeholder="ค้นหาชื่อ, รหัส, ใบรับรอง...">
        </div>
        <div>
            <select name="status">
                <option value="">สถานะทั้งหมด</option>
                <?php foreach ($statusLabel as $k => $v): ?>
                <option value="<?= $k ?>" <?= $filterStatus === $k ? 'selected' : '' ?>><?= $v ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="asset_id">
                <option value="">ทรัพย์สินทั้งหมด</option>
                <?php foreach ($assets as $a): ?>
                <option value="<?= $a['id'] ?>" <?= $filterAsset == $a['id'] ? 'selected' : '' ?>><?= htmlspecialchars($a['code'] . ' - ' . $a['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="result">
                <option value="">ผลลัพธ์ทั้งหมด</option>
                <?php foreach ($resultLabel as $k => $v): ?>
                <option value="<?= $k ?>" <?= $filterResult === $k ? 'selected' : '' ?>><?= $v ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="calibration_type">
                <option value="">ประเภททั้งหมด</option>
                <?php foreach ($typeLabel as $k => $v): ?>
                <option value="<?= $k ?>" <?= $filterType === $k ? 'selected' : '' ?>><?= $v ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">ค้นหา</button>
        <?php if ($search || $filterStatus || $filterAsset || $filterResult || $filterType): ?>
        <a href="?" class="btn btn-ghost">✕ ล้าง</a>
        <?php endif; ?>
    </form>
</div>

<div class="table-wrap">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>ทรัพย์สิน / เครื่องมือ</th>
                <th>วันที่สอบเทียบ</th>
                <th>ครั้งถัดไป</th>
                <th>ประเภท</th>
                <th>ผลลัพธ์</th>
                <th>สถานะ</th>
                <th>ผู้ดำเนินการ</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-icon">📐</div>
                        <p class="empty-state-title">ไม่มีข้อมูลการสอบเทียบ</p>
                        <p class="empty-state-desc">ยังไม่มีบันทึกการสอบเทียบเครื่องมือในระบบ</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ เพิ่มรายการแรก</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r):
                $isOverdue = $r['next_calibration_date'] && $r['next_calibration_date'] < $today && $r['status'] !== 'completed' && $r['status'] !== 'cancelled';
                $daysRemaining = $r['next_calibration_date'] ? floor((strtotime($r['next_calibration_date']) - time()) / 86400) : null;
            ?>
            <tr style="<?= $isOverdue ? 'background:rgba(248,113,113,0.06);' : '' ?>">
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-primary">
                    <span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code'] ?? '') ?></span>
                    <span style="display:block;"><?= htmlspecialchars($r['asset_name'] ?? '-') ?></span>
                </td>
                <td style="white-space:nowrap;font-size:12px;"><?= htmlspecialchars($r['calibration_date']) ?></td>
                <td style="white-space:nowrap;font-size:12px;color:<?= $isOverdue ? 'var(--accent-rose)' : 'var(--text-secondary)' ?>;">
                    <?= htmlspecialchars($r['next_calibration_date'] ?? '-') ?>
                    <?php if ($daysRemaining !== null): ?>
                    <span style="font-size:11px;display:block;color:<?= $daysRemaining <= 0 ? 'var(--accent-rose)' : ($daysRemaining <= 30 ? 'var(--accent-amber)' : 'var(--text-muted)') ?>;">
                        (<?= $daysRemaining <= 0 ? 'เลยกำหนด' : 'เหลือ ' . $daysRemaining . ' วัน' ?>)
                    </span>
                    <?php endif; ?>
                </td>
                <td style="font-size:12px;"><?= htmlspecialchars($typeLabel[$r['calibration_type']] ?? '-') ?></td>
                <td>
                    <?php if ($r['result']): ?>
                    <span class="badge <?= $resultBadge[$r['result']] ?? 'badge-info' ?>"><?= $resultLabel[$r['result']] ?? $r['result'] ?></span>
                    <?php else: ?>—<?php endif; ?>
                </td>
                <td><span class="badge <?= $statusBadge[$r['status']] ?? 'badge-info' ?>"><?= $statusLabel[$r['status']] ?? $r['status'] ?></span></td>
                <td style="font-size:12px;"><?= htmlspecialchars($r['performer_name'] ?? '-') ?></td>
                <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <?php if ($r['status'] !== 'completed' && $r['status'] !== 'cancelled'): ?>
                        <a href="mark_complete.php?id=<?= $r['id'] ?>" class="btn btn-sm" style="background:rgba(52,211,153,0.1);color:var(--accent-emerald);border:1px solid rgba(52,211,153,0.2);" onclick="return confirm('ยืนยันการเสร็จสิ้น?')">เสร็จสิ้น</a>
                        <?php endif; ?>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบรายการสอบเทียบนี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
