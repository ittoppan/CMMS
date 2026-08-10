<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'MTBF / MTTR Reliability Metrics — CMMS-TPT';
renderHeader();

$pdo = getDb();
$search = trim($_GET['search'] ?? '');
$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(a.name LIKE ? OR a.code LIKE ? OR mt.failure_type LIKE ?)';
    $params = array_merge($params, ["%$search%","%$search%","%$search%"]);
}
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$stmt = $pdo->prepare("
    SELECT mt.*, a.name AS asset_name, a.code AS asset_code
    FROM mtbf_mttr mt
    LEFT JOIN asset_registry a ON mt.asset_id = a.id
    $where
    ORDER BY mt.year DESC, mt.month DESC
");
$stmt->execute($params);
$rows = $stmt->fetchAll();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">📊 MTBF / MTTR Reliability Metrics</h1>
        <p class="page-desc">Mean Time Between Failures & Mean Time To Repair (ทั้งหมด <?= count($rows) ?> รายการ)</p>
    </div>
    <div>
        <a href="create.php" class="btn btn-primary">+ บันทึกข้อมูล MTBF/MTTR</a>
    </div>
</div>

<div class="filter-bar">
    <?php include __DIR__ . '/../../../src/components/search_form.php'; ?>
</div>

<div class="table-wrap">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>ทรัพย์สิน</th>
                <th>ปี/เดือน</th>
                <th style="text-align:right;">ชม.ทำงาน</th>
                <th style="text-align:right;">จำนวนครั้งเสีย</th>
                <th style="text-align:right;">Downtime (นาที)</th>
                <th style="text-align:right;">MTBF (ชม.)</th>
                <th style="text-align:right;">MTTR (นาที)</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <p class="empty-state-title">ไม่มีข้อมูล MTBF/MTTR</p>
                        <p class="empty-state-desc">ยังไม่มีบันทึกดัชนีความน่าเชื่อถือเครื่องจักร</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ เพิ่มรายการแรก</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r): ?>
            <tr>
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-primary">
                    <span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code'] ?? '') ?></span>
                    <span style="display:block;"><?= htmlspecialchars($r['asset_name'] ?? '-') ?></span>
                </td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-secondary);"><?= sprintf('%04d/%02d', $r['year'], $r['month']) ?></td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;"><?= number_format($r['operating_hours'], 1) ?></td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:<?= $r['total_failures'] > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)' ?>;"><?= number_format($r['total_failures']) ?></td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;"><?= number_format($r['total_downtime_minutes']) ?></td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--accent-emerald);"><?= $r['mtbf_hours'] !== null ? number_format($r['mtbf_hours'], 1) : '-' ?></td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--accent-amber);"><?= $r['mttr_minutes'] !== null ? number_format($r['mttr_minutes'], 1) : '-' ?></td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบข้อมูล MTBF/MTTR รายการนี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
