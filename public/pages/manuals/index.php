<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'คู่มือและเอกสาร — CMMS-TPT';
renderHeader();

$pdo = getDb();
$search = trim($_GET['search'] ?? '');
$conditions = [];
$params = [];
if ($search !== '') {
    $conditions[] = '(m.title LIKE ? OR a.name LIKE ? OR a.code LIKE ?)';
    $params = array_merge($params, ["%$search%","%$search%","%$search%"]);
}
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
$stmt = $pdo->prepare("
    SELECT m.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS uploader_name
    FROM manuals m
    LEFT JOIN asset_registry a ON m.asset_id = a.id
    LEFT JOIN users u ON m.uploaded_by = u.id
    $where
    ORDER BY m.created_at DESC
");
$stmt->execute($params);
$rows = $stmt->fetchAll();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">📚 คู่มือและเอกสารเทคนิค</h1>
        <p class="page-desc">Technical Manuals, Drawings & Documents (ทั้งหมด <?= count($rows) ?> รายการ)</p>
    </div>
    <div>
        <a href="create.php" class="btn btn-primary">+ อัปโหลดคู่มือใหม่</a>
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
                <th>ชื่อเอกสาร / คู่มือ</th>
                <th>ทรัพย์สิน</th>
                <th>ประเภทไฟล์</th>
                <th>เวอร์ชัน</th>
                <th>ผู้อัปโหลด</th>
                <th>วันที่อัปโหลด</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <div class="empty-state-icon">📚</div>
                        <p class="empty-state-title">ไม่มีข้อมูลคู่มือ</p>
                        <p class="empty-state-desc">ยังไม่มีการอัปโหลดคู่มือหรือเอกสารเทคนิค</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ อัปโหลดคู่มือแรก</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r): ?>
            <tr>
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-primary">
                    <a href="/<?= htmlspecialchars(ltrim($r['file_path'], '/')) ?>"
                       target="_blank" style="color:var(--text-primary);text-decoration:none;font-weight:600;"
                       onmouseover="this.style.color='var(--accent-cyan)'" onmouseout="this.style.color='var(--text-primary)'">
                        📄 <?= htmlspecialchars($r['title']) ?>
                    </a>
                </td>
                <td class="col-primary">
                    <?php if (!empty($r['asset_name'])): ?>
                    <span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code'] ?? '') ?></span>
                    <span style="display:block;"><?= htmlspecialchars($r['asset_name']) ?></span>
                    <?php else: ?>—<?php endif; ?>
                </td>
                <td><span class="badge badge-info"><?= htmlspecialchars($r['file_type'] ?? 'DOC') ?></span></td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:12px;"><?= htmlspecialchars($r['version'] ?? 'v1.0') ?></td>
                <td style="font-size:12px;"><?= htmlspecialchars($r['uploader_name'] ?? '-') ?></td>
                <td style="white-space:nowrap;font-size:12px;color:var(--text-muted);"><?= date('d M Y', strtotime($r['created_at'])) ?></td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <a href="/<?= htmlspecialchars(ltrim($r['file_path'], '/')) ?>" target="_blank" class="action-link action-link-view btn-sm btn">เปิดอ่าน</a>
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบเอกสารคู่มือนี้?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
