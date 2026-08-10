<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แผนงาน PM/AM — CMMS-TPT';
$pdo = getDb();

$search         = trim($_GET['search']        ?? '');
$filterStatus   = trim($_GET['status']        ?? '');
$filterPlan     = trim($_GET['plan_id']       ?? '');
$filterDept     = trim($_GET['department_id'] ?? '');
$filterAssigned = trim($_GET['assigned_to']   ?? '');

$conditions = [];
$params = [];
if ($search)         { $conditions[] = '(pm.title LIKE ? OR a.name LIKE ? OR a.code LIKE ?)'; $params = array_merge($params, ["%$search%","%$search%","%$search%"]); }
if ($filterStatus)   { $conditions[] = 'pm.status = ?';        $params[] = $filterStatus; }
if ($filterPlan)     { $conditions[] = 'pm.plan_id = ?';       $params[] = (int)$filterPlan; }
if ($filterDept)     { $conditions[] = 'pm.department_id = ?'; $params[] = (int)$filterDept; }
if ($filterAssigned) { $conditions[] = 'pm.assigned_to = ?';   $params[] = (int)$filterAssigned; }
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

$statusOptions = ['pending'=>'Pending','in_progress'=>'In Progress','completed'=>'Completed','overdue'=>'Overdue','skipped'=>'Skipped'];
$sbadge = ['pending'=>'badge-in_progress','in_progress'=>'badge-info','completed'=>'badge-active','overdue'=>'badge-critical','skipped'=>'badge-inactive'];

$plans = $pdo->query('SELECT id, code, name FROM pm_am_plans WHERE is_active = 1 ORDER BY name')->fetchAll();
$depts = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();
$users = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();

$sql = 'SELECT pm.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS assigned_name,
               p.name AS plan_name, d.name AS department_name
        FROM pm_am pm
        LEFT JOIN asset_registry a ON pm.asset_id = a.id
        LEFT JOIN users u ON pm.assigned_to = u.id
        LEFT JOIN pm_am_plans p ON pm.plan_id = p.id
        LEFT JOIN departments d ON pm.department_id = d.id
        ' . $where . ' ORDER BY pm.due_date ASC';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

renderHeader();
?>

<div class="page-header">
    <div>
        <h1 class="page-title">📋 แผนงาน Preventive Maintenance</h1>
        <p class="page-desc">PM/AM Task Schedule Management (ทั้งหมด <?= count($rows) ?> รายการ)</p>
    </div>
    <div style="display:flex;gap:8px;">
        <a href="calendar.php" class="btn btn-secondary">มุมมองปฏิทิน</a>
        <a href="?assigned_to=<?= $_SESSION['user_id'] ?>" class="btn btn-secondary">งานของฉัน</a>
        <a href="create.php" class="btn btn-primary">+ เพิ่มแผน PM</a>
    </div>
</div>

<div class="filter-bar">
    <form method="GET" style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;width:100%;">
        <div class="search-input-wrap" style="flex:1;min-width:180px;">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" name="search" value="<?= htmlspecialchars($search) ?>" placeholder="ค้นหาหัวข้อ, ทรัพย์สิน...">
        </div>
        <div>
            <select name="status">
                <option value="">สถานะทั้งหมด</option>
                <?php foreach ($statusOptions as $k => $v): ?>
                <option value="<?= $k ?>" <?= $filterStatus === $k ? 'selected' : '' ?>><?= $v ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="plan_id">
                <option value="">แผนงานทั้งหมด</option>
                <?php foreach ($plans as $p): ?>
                <option value="<?= $p['id'] ?>" <?= $filterPlan == $p['id'] ? 'selected' : '' ?>><?= htmlspecialchars($p['code'] . ' - ' . $p['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="department_id">
                <option value="">แผนกทั้งหมด</option>
                <?php foreach ($depts as $d): ?>
                <option value="<?= $d['id'] ?>" <?= $filterDept == $d['id'] ? 'selected' : '' ?>><?= htmlspecialchars($d['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="assigned_to">
                <option value="">ผู้รับผิดชอบทั้งหมด</option>
                <?php foreach ($users as $u): ?>
                <option value="<?= $u['id'] ?>" <?= $filterAssigned == $u['id'] ? 'selected' : '' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">ค้นหา</button>
        <?php if ($search || $filterStatus || $filterPlan || $filterDept || $filterAssigned): ?>
        <a href="?" class="btn btn-ghost">✕ ล้าง</a>
        <?php endif; ?>
    </form>
</div>

<div class="table-wrap">
    <table class="data-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>หัวข้อ PM</th>
                <th>ทรัพย์สิน</th>
                <th>แผนงาน</th>
                <th>แผนก</th>
                <th>กำหนดเสร็จ</th>
                <th>สถานะ</th>
                <th>ผู้รับผิดชอบ</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($rows)): ?>
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p class="empty-state-title">ไม่พบแผน PM</p>
                        <p class="empty-state-desc">ยังไม่มีแผนบำรุงรักษาในเงื่อนไขนี้</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ สร้างแผน PM ใหม่</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($rows as $i => $r):
                $dueDate = $r['due_date'] ?? '';
                $isOverdue = $dueDate && $dueDate < date('Y-m-d') && !in_array($r['status'], ['completed','skipped']);
                $isSoon = $dueDate && !$isOverdue && $dueDate <= date('Y-m-d', strtotime('+3 days')) && !in_array($r['status'], ['completed','skipped']);
            ?>
            <tr style="<?= $isOverdue ? 'background:rgba(248,113,113,0.06);' : '' ?>">
                <td class="row-num"><?= $i + 1 ?></td>
                <td class="col-primary">
                    <a href="view.php?id=<?= $r['id'] ?>" style="color:var(--text-primary);text-decoration:none;font-weight:500;" onmouseover="this.style.color='var(--accent-cyan)'" onmouseout="this.style.color='var(--text-primary)'">
                        <?= htmlspecialchars($r['title']) ?>
                    </a>
                </td>
                <td class="col-primary">
                    <span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code'] ?? '') ?></span>
                    <span style="display:block;"><?= htmlspecialchars($r['asset_name'] ?? '-') ?></span>
                </td>
                <td><?= htmlspecialchars($r['plan_name'] ?? '-') ?></td>
                <td><?= htmlspecialchars($r['department_name'] ?? '-') ?></td>
                <td style="white-space:nowrap;font-size:12px;color:<?= $isOverdue ? 'var(--accent-rose)' : ($isSoon ? 'var(--accent-amber)' : 'var(--text-secondary)') ?>;font-weight:<?= $isOverdue ? '600' : '400' ?>;">
                    <?= htmlspecialchars($dueDate ? date('d M Y', strtotime($dueDate)) : '-') ?>
                </td>
                <td><span class="badge <?= $sbadge[$r['status']] ?? 'badge-info' ?>"><?= $statusOptions[$r['status']] ?? $r['status'] ?></span></td>
                <td><?= htmlspecialchars($r['assigned_name'] ?? '-') ?></td>
                <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <a href="view.php?id=<?= $r['id'] ?>" class="action-link action-link-view btn-sm btn">ดู</a>
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <?php if ($r['status'] !== 'completed'): ?>
                        <a href="complete.php?id=<?= $r['id'] ?>" class="btn btn-sm" style="background:rgba(52,211,153,0.1);color:var(--accent-emerald);border:1px solid rgba(52,211,153,0.2);">ทำเสร็จ</a>
                        <?php endif; ?>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบแผน PM &quot;<?= htmlspecialchars($r['title']) ?>&quot;?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php renderFooter(); ?>
