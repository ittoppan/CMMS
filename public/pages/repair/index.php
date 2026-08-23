<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'งานซ่อมบำรุง — CMMS-TPT';

$pdo = getDb();

// Handle status transitions BEFORE rendering
$transitions = [
    'acknowledge' => ['status'=>'acknowledged', 'prev'=>'open',                              'action'=>'acknowledged', 'desc'=>'รับทราบงานซ่อม', 'field'=>'acknowledged_at'],
    'start'       => ['status'=>'in_progress',  'prev'=>'acknowledged',                       'action'=>'in_progress',  'desc'=>'เริ่มดำเนินการซ่อม', 'field'=>'actual_start_at'],
    'wait_parts'  => ['status'=>'waiting_parts','prev'=>'in_progress',                       'action'=>'waiting_parts','desc'=>'รออะไหล่', 'field'=>null],
    'resolve'     => ['status'=>'resolved',     'prev'=>"'in_progress','waiting_parts','waiting_approval'",'action'=>'resolved','desc'=>'ดำเนินการซ่อมเสร็จ','field'=>null],
];
foreach ($transitions as $key => $t) {
    if (isset($_GET[$key])) {
        $rid = (int)$_GET[$key];
        $fieldSql = $t['field'] ? ", {$t['field']}=NOW()" : '';
        $pdo->prepare("UPDATE repair SET status=? {$fieldSql} WHERE id=?")->execute([$t['status'], $rid]);
        $pdo->prepare("INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)")->execute([$rid, $_SESSION['user_id'], $t['action'], $t['desc']]);
        header('Location: index.php'); exit;
    }
}

// Filters
$search         = trim($_GET['search']         ?? '');
$filterStatus   = trim($_GET['status']         ?? '');
$filterPriority = trim($_GET['priority']       ?? '');
$filterAssigned = trim($_GET['assigned_to']    ?? '');
$filterDept     = trim($_GET['department_id']  ?? '');
$filterSafety   = trim($_GET['safety_related'] ?? '');

$conditions = [];
$params = [];
if ($search)         { $conditions[] = '(r.title LIKE ? OR a.name LIKE ? OR a.code LIKE ?)'; $params = array_merge($params, ["%$search%","%$search%","%$search%"]); }
if ($filterStatus)   { $conditions[] = 'r.status = ?';        $params[] = $filterStatus; }
if ($filterPriority) { $conditions[] = 'r.priority = ?';      $params[] = $filterPriority; }
if ($filterAssigned) { $conditions[] = 'r.assigned_to = ?';   $params[] = (int)$filterAssigned; }
if ($filterDept)     { $conditions[] = 'r.department_id = ?'; $params[] = (int)$filterDept; }
if ($filterSafety === 'yes') { $conditions[] = 'r.safety_related = 1'; }
$where = count($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

$statusOptions  = ['open'=>'Open','acknowledged'=>'Acknowledged','in_progress'=>'In Progress','waiting_parts'=>'Waiting Parts','waiting_approval'=>'Waiting Approval','resolved'=>'Resolved','closed'=>'Closed','cancelled'=>'Cancelled','rejected'=>'Rejected'];
$priorityOptions= ['low'=>'Low','medium'=>'Medium','high'=>'High','critical'=>'Critical'];
$users = $pdo->query('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name')->fetchAll();
$depts = $pdo->query('SELECT id, name FROM departments ORDER BY name')->fetchAll();

// Status counts
$counts = $pdo->query("SELECT status, COUNT(*) cnt FROM repair GROUP BY status")->fetchAll();
$countMap = array_column($counts, 'cnt', 'status');
$totalRepairs = array_sum($countMap);

// Data
$perPage = 25;
$page = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $perPage;
try {
    // นับทั้งหมดก่อน (สำหรับ pagination — นับตามตัวกรองปัจจุบัน)
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id $where");
    $countStmt->execute($params);
    $filteredTotal = (int)$countStmt->fetchColumn();
    $totalPages = max(1, (int)ceil($filteredTotal / $perPage));
    if ($page > $totalPages) { $page = $totalPages; $offset = ($page - 1) * $perPage; }

    $stmt = $pdo->prepare("
        SELECT r.*, a.name AS asset_name, a.code AS asset_code,
               u.full_name AS assigned_name, rt.name AS repair_type_name
        FROM repair r
        LEFT JOIN asset_registry a ON r.asset_id = a.id
        LEFT JOIN users u ON r.assigned_to = u.id
        LEFT JOIN repair_types rt ON r.repair_type_id = rt.id
        $where ORDER BY FIELD(r.priority,'critical','high','medium','low'), r.created_at DESC
        LIMIT $perPage OFFSET $offset
    ");
    $stmt->execute($params);
    $repairs = $stmt->fetchAll();
} catch (Exception $e) {
    $repairs = [];
    $dbError = $e->getMessage();
}

renderHeader();

// Badge CSS per status & priority
$sbadge = ['open'=>'badge-open','acknowledged'=>'badge-info','in_progress'=>'badge-in_progress','waiting_parts'=>'badge-medium','waiting_approval'=>'badge-medium','resolved'=>'badge-active','closed'=>'badge-inactive','cancelled'=>'badge-inactive','rejected'=>'badge-critical'];
$pbadge = ['low'=>'badge-low','medium'=>'badge-medium','high'=>'badge-high','critical'=>'badge-critical'];
?>

<!-- Page Header (Astryx LayoutHeader) -->
<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border mb-6">
    <div>
        <h1 class="text-2xl font-semibold text-primary tracking-tight">🔧 งานซ่อมบำรุง</h1>
        <p class="text-sm text-secondary mt-1">Repair & Work Order Management &mdash; ทั้งหมด <?= $totalRepairs ?> รายการ</p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
        <a href="kanban.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">
            📊 Kanban Board
        </a>
        <a href="my_tasks.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            งานของฉัน
        </a>
        <a href="history.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ประวัติ
        </a>
        <a href="create.php" class="h-9 px-3.5 bg-accent hover:bg-accent/90 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            สร้างงานซ่อม
        </a>
    </div>
</div>

<!-- Status Summary Chips -->
<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
    <?php
    $allStatuses = ['open','acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled'];
    foreach ($allStatuses as $st):
        $cnt = (int)($countMap[$st] ?? 0);
        if ($cnt === 0) continue;
    ?>
    <a href="?status=<?= $st ?><?= $filterPriority ? '&priority='.$filterPriority : '' ?>"
       class="badge <?= $sbadge[$st] ?? 'badge-info' ?>" style="text-decoration:none;cursor:pointer;">
        <?= $statusOptions[$st] ?? $st ?> <strong>(<?= $cnt ?>)</strong>
    </a>
    <?php endforeach; ?>
    <?php if ($filterStatus): ?>
    <a href="?" class="badge badge-inactive" style="text-decoration:none;">✕ ล้างตัวกรอง</a>
    <?php endif; ?>
</div>

<!-- Filter Bar -->
<div class="filter-bar" style="margin-bottom:16px;">
    <form method="GET" style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;width:100%;">
        <div class="search-input-wrap" style="flex:1;min-width:180px;">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" name="search" value="<?= htmlspecialchars($search) ?>" placeholder="ค้นหาชื่องาน, เครื่องจักร...">
        </div>
        <div>
            <select name="status">
                <option value="">สถานะทั้งหมด</option>
                <?php foreach ($statusOptions as $v => $l): ?>
                <option value="<?= $v ?>" <?= $filterStatus === $v ? 'selected' : '' ?>><?= $l ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="priority">
                <option value="">ทุกระดับ</option>
                <?php foreach ($priorityOptions as $v => $l): ?>
                <option value="<?= $v ?>" <?= $filterPriority === $v ? 'selected' : '' ?>><?= $l ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="assigned_to">
                <option value="">ช่างทั้งหมด</option>
                <?php foreach ($users as $u): ?>
                <option value="<?= $u['id'] ?>" <?= $filterAssigned == $u['id'] ? 'selected' : '' ?>><?= htmlspecialchars($u['full_name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <select name="safety_related">
                <option value="">Safety ทั้งหมด</option>
                <option value="yes" <?= $filterSafety === 'yes' ? 'selected' : '' ?>>Safety เท่านั้น</option>
            </select>
        </div>
        <button type="submit" class="btn btn-primary">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            กรอง
        </button>
        <?php if ($search || $filterStatus || $filterPriority || $filterAssigned || $filterSafety): ?>
        <a href="?" class="btn btn-ghost">✕ ล้าง</a>
        <?php endif; ?>
    </form>
</div>

<?php if (isset($dbError)): ?>
<div class="alert alert-error">⚠ Database Error: <?= htmlspecialchars($dbError) ?></div>
<?php endif; ?>

<!-- Data Table -->
<div class="table-wrap">
    <table class="data-table cmms-stack-table">
        <thead>
            <tr>
                <th class="row-num">#</th>
                <th>หัวข้องาน</th>
                <th>ทรัพย์สิน</th>
                <th>ผู้รับผิดชอบ</th>
                <th>สถานะ</th>
                <th>ความสำคัญ</th>
                <th>Safety</th>
                <th>วันที่</th>
                <th>จัดการ</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($repairs)): ?>
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-icon">🔧</div>
                        <p class="empty-state-title">ไม่พบงานซ่อม</p>
                        <p class="empty-state-desc">ไม่มีรายการงานซ่อมที่ตรงกับเงื่อนไข</p>
                        <a href="create.php" class="btn btn-primary btn-sm">+ สร้างงานซ่อมใหม่</a>
                    </div>
                </td>
            </tr>
            <?php else: ?>
            <?php foreach ($repairs as $i => $r): ?>
            <tr>
                <td data-label="#" class="row-num"><?= $i + 1 ?></td>
                <td data-label="หัวข้องาน" class="col-primary">
                    <div class="flex items-center gap-2 mb-0.5">
                        <span class="badge bg-indigo-100 text-indigo-800 font-mono font-bold text-[11px]"><?= formatWorkOrderNo($r['id'], $r['created_at'], $r['work_order_no'] ?? null) ?></span>
                        <a href="view.php?id=<?= $r['id'] ?>" style="color:var(--text-primary);text-decoration:none;font-weight:600;" onmouseover="this.style.color='var(--accent-cyan)'" onmouseout="this.style.color='var(--text-primary)'">
                            <?= htmlspecialchars($r['title']) ?>
                        </a>
                    </div>
                    <?php if (!empty($r['repair_type_name'])): ?>
                    <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:1px;"><?= htmlspecialchars($r['repair_type_name']) ?></span>
                    <?php endif; ?>
                </td>
                <td data-label="ทรัพย์สิน">
                    <?php if ($r['asset_code']): ?>
                    <span class="font-mono" style="font-size:11px;color:var(--accent-cyan);"><?= htmlspecialchars($r['asset_code']) ?></span>
                    <span style="display:block;font-size:12px;"><?= htmlspecialchars($r['asset_name'] ?? '—') ?></span>
                    <?php else: ?>—<?php endif; ?>
                </td>
                <td data-label="ผู้รับผิดชอบ"><?= htmlspecialchars($r['assigned_name'] ?? '—') ?></td>
                <td data-label="สถานะ"><span class="badge <?= $sbadge[$r['status']] ?? 'badge-info' ?>"><?= $statusOptions[$r['status']] ?? $r['status'] ?></span></td>
                <td data-label="ความสำคัญ"><span class="badge <?= $pbadge[$r['priority']] ?? 'badge-info' ?>"><?= ucfirst($r['priority']) ?></span></td>
                <td data-label="Safety" style="text-align:center;">
                    <?= $r['safety_related'] ? '<span style="font-size:16px;" title="Safety Related">⚠️</span>' : '<span style="color:var(--text-muted);">—</span>' ?>
                </td>
                <td data-label="วันที่" style="white-space:nowrap;font-size:12px;color:var(--text-muted);"><?= date('d M Y', strtotime($r['created_at'])) ?></td>
                <td data-label="จัดการ">
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <a href="view.php?id=<?= $r['id'] ?>" class="action-link action-link-view btn-sm btn">ดู</a>
                        <a href="edit.php?id=<?= $r['id'] ?>" class="action-link action-link-edit btn-sm btn">แก้ไข</a>
                        <?php if ($r['status'] === 'open'): ?>
                        <a href="?acknowledge=<?= $r['id'] ?>" class="btn btn-sm" style="background:rgba(167,139,250,0.12);color:var(--accent-violet);border:1px solid rgba(167,139,250,0.2);" onclick="return confirm('รับทราบงานซ่อมนี้?')">รับทราบ</a>
                        <?php elseif ($r['status'] === 'acknowledged'): ?>
                        <a href="?start=<?= $r['id'] ?>" class="btn btn-sm" style="background:rgba(251,191,36,0.1);color:var(--accent-amber);border:1px solid rgba(251,191,36,0.2);" onclick="return confirm('เริ่มงานซ่อมนี้?')">เริ่มงาน</a>
                        <?php elseif ($r['status'] === 'in_progress'): ?>
                        <a href="?wait_parts=<?= $r['id'] ?>" class="btn btn-sm" style="background:rgba(251,191,36,0.1);color:var(--accent-amber);border:1px solid rgba(251,191,36,0.2);" onclick="return confirm('เปลี่ยนเป็นรออะไหล่?')">รออะไหล่</a>
                        <a href="?resolve=<?= $r['id'] ?>" class="btn btn-sm" style="background:rgba(52,211,153,0.1);color:var(--accent-emerald);border:1px solid rgba(52,211,153,0.2);" onclick="return confirm('ยืนยันซ่อมเสร็จ?')">เสร็จ</a>
                        <?php endif; ?>
                        <a href="assign.php?id=<?= $r['id'] ?>" class="btn btn-sm btn-ghost">มอบหมาย</a>
                        <a href="delete.php?id=<?= $r['id'] ?>" class="action-link action-link-delete btn-sm btn" data-confirm="ลบงานซ่อม &quot;<?= htmlspecialchars($r['title']) ?>&quot; ใช่หรือไม่?">ลบ</a>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php if ($totalPages > 1): ?>
<!-- Pagination -->
<div class="flex items-center justify-between flex-wrap gap-3 mt-4">
    <span class="text-xs text-secondary">แสดง <?= count($repairs) ?> จาก <?= $filteredTotal ?> รายการ (หน้า <?= $page ?>/<?= $totalPages ?>)</span>
    <div class="flex items-center gap-1.5">
        <?php
        $qs = function($p) use ($search, $filterStatus, $filterPriority, $filterAssigned, $filterSafety) {
            $q = [];
            if ($search) $q['search'] = $search;
            if ($filterStatus) $q['status'] = $filterStatus;
            if ($filterPriority) $q['priority'] = $filterPriority;
            if ($filterAssigned) $q['assigned_to'] = $filterAssigned;
            if ($filterSafety) $q['safety_related'] = $filterSafety;
            $q['page'] = $p;
            return '?' . http_build_query($q);
        };
        $start = max(1, $page - 2);
        $end = min($totalPages, $page + 2);
        ?>
        <?php if ($page > 1): ?>
        <a href="<?= $qs($page - 1) ?>" class="btn btn-sm btn-ghost">‹ ก่อนหน้า</a>
        <?php endif; ?>
        <?php for ($p = $start; $p <= $end; $p++): ?>
        <a href="<?= $qs($p) ?>" class="btn btn-sm <?= $p === $page ? 'btn-primary' : 'btn-ghost' ?>"><?= $p ?></a>
        <?php endfor; ?>
        <?php if ($page < $totalPages): ?>
        <a href="<?= $qs($page + 1) ?>" class="btn btn-sm btn-ghost">ถัดไป ›</a>
        <?php endif; ?>
    </div>
</div>
<?php endif; ?>

<?php renderFooter(); ?>
