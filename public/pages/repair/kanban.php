<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'Kanban Board - งานซ่อม CMMS-TPT';
$currentScript = $_SERVER['SCRIPT_NAME'] ?? '';
renderHeader();

$pdo = getDb();

// Handle AJAX status change
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'move_status') {
    header('Content-Type: application/json');
    $id = (int)($_POST['repair_id'] ?? 0);
    $newStatus = trim($_POST['new_status'] ?? '');
    $validStatuses = ['open', 'acknowledged', 'in_progress', 'waiting_parts', 'waiting_approval', 'resolved', 'closed'];

    if ($id > 0 && in_array($newStatus, $validStatuses)) {
        try {
            $extra = '';
            if ($newStatus === 'acknowledged') $extra = ', acknowledged_at=NOW()';
            if ($newStatus === 'in_progress') $extra = ', actual_start_at=NOW()';
            
            $stmt = $pdo->prepare("UPDATE repair SET status=? $extra, updated_at=NOW() WHERE id=?");
            $stmt->execute([$newStatus, $id]);

            // Log activity
            $pdo->prepare("INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?, ?, ?, ?)")
                ->execute([$id, $_SESSION['user_id'] ?? 1, 'status_changed', "ย้ายสถานะเป็น $newStatus via Kanban"]);

            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
    }
    exit;
}

// Fetch all active repair orders
$stmt = $pdo->query("
    SELECT r.*, a.name AS asset_name, a.code AS asset_code,
           u.full_name AS assigned_name, cu.full_name AS created_name,
           wz.name AS work_zone_name, loc.name AS location_name
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    LEFT JOIN users u ON r.assigned_to = u.id
    LEFT JOIN users cu ON r.created_by = cu.id
    LEFT JOIN work_zones wz ON r.work_zone_id = wz.id
    LEFT JOIN locations loc ON r.location_id = loc.id
    WHERE r.status != 'cancelled' AND r.status != 'rejected'
    ORDER BY r.priority = 'critical' DESC, r.priority = 'high' DESC, r.created_at DESC
");
$repairs = $stmt->fetchAll();

// Group repairs by status column
$columns = [
    'open'            => ['title' => '📌 รอมอบหมาย', 'count' => 0, 'items' => [], 'color' => '#3b82f6', 'bg' => '#eff6ff'],
    'acknowledged'    => ['title' => '👨‍🔧 ช่างรับงาน', 'count' => 0, 'items' => [], 'color' => '#6366f1', 'bg' => '#eef2ff'],
    'in_progress'     => ['title' => '⚡ กำลังซ่อม', 'count' => 0, 'items' => [], 'color' => '#d97706', 'bg' => '#fffbeb'],
    'waiting_parts'   => ['title' => '📦 รออะไหล่/อนุมัติ', 'count' => 0, 'items' => [], 'color' => '#ea580c', 'bg' => '#fff7ed'],
    'resolved'        => ['title' => '✅ ดำเนินการเสร็จ', 'count' => 0, 'items' => [], 'color' => '#16a34a', 'bg' => '#f0fdf4'],
    'closed'          => ['title' => '🔒 ปิดงานซ่อม', 'count' => 0, 'items' => [], 'color' => '#475569', 'bg' => '#f8fafc'],
];

foreach ($repairs as $r) {
    $st = $r['status'];
    if ($st === 'waiting_approval') $st = 'waiting_parts';
    if (isset($columns[$st])) {
        $columns[$st]['items'][] = $r;
        $columns[$st]['count']++;
    }
}
?>

<style>
  .kanban-board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    align-items: start;
    min-height: calc(100vh - 220px);
  }
  .kanban-col {
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius-lg);
    padding: 12px;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  }
  .kanban-col-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 2px solid;
    font-weight: 700;
    font-size: 13px;
  }
  .kanban-col-count {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 1px 8px;
    font-size: 11px;
    font-weight: 700;
  }
  .kanban-cards {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-right: 2px;
    min-height: 100px;
  }
  .kanban-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius-md);
    padding: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    cursor: grab;
    transition: all var(--t-fast);
    position: relative;
  }
  .kanban-card:hover {
    box-shadow: 0 6px 16px rgba(0,0,0,0.08);
    transform: translateY(-2px);
    border-color: #cbd5e1;
  }
  .kanban-card.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }
  .drag-over {
    background: #e2e8f0;
    border: 2px dashed #94a3b8;
  }
  .kanban-card-title {
    font-weight: 700;
    font-size: 13px;
    color: #0f172a;
    margin-bottom: 6px;
    display: block;
    text-decoration: none;
  }
  .kanban-card-title:hover {
    color: #2563eb;
  }
</style>

<div class="space-y-4">
    <!-- Page Header (Astryx LayoutHeader) -->
    <div class="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-border">
        <div>
            <div class="flex items-center gap-2">
                <a href="index.php" class="text-xs text-accent hover:underline font-medium">&larr; มุมมองตาราง</a>
                <span class="badge bg-accent/10 text-accent border border-accent/20">Kanban View</span>
            </div>
            <h1 class="mt-1 text-2xl font-semibold text-primary">กระดานติดตามงานซ่อม (Kanban Board)</h1>
        </div>
        <div class="flex gap-2">
            <a href="create.php" class="h-9 px-3.5 bg-accent hover:bg-accent/90 text-white rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs">+ แจ้งซ่อมใหม่ (F-EN-03)</a>
            <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">📋 ตารางงานซ่อม</a>
        </div>
    </div>

    <!-- Kanban Board Grid -->
    <div class="kanban-board">
        <?php foreach ($columns as $colKey => $col): ?>
        <div class="kanban-col" data-status="<?= $colKey ?>">
            <div class="kanban-col-header" style="border-bottom-color: <?= $col['color'] ?>; color: <?= $col['color'] ?>;">
                <span><?= $col['title'] ?></span>
                <span class="kanban-col-count" id="count-<?= $colKey ?>"><?= $col['count'] ?></span>
            </div>

            <div class="kanban-cards" id="col-<?= $colKey ?>" ondragover="allowDrop(event)" ondrop="dropCard(event, '<?= $colKey ?>')">
                <?php foreach ($col['items'] as $item): ?>
                <div class="kanban-card"
                     id="card-<?= $item['id'] ?>"
                     draggable="true"
                     ondragstart="dragStart(event, <?= $item['id'] ?>)">
                    
                    <div class="flex items-center justify-between mb-2">
                        <span class="font-mono text-xs font-bold text-indigo-600"><?= formatWorkOrderNo($item['id'], $item['created_at'], $item['work_order_no'] ?? null) ?></span>
                        <span class="badge <?= match($item['priority']) {
                            'critical' => 'badge-critical',
                            'high'     => 'badge-high',
                            'medium'   => 'badge-medium',
                            default    => 'badge-low'
                        } ?>"><?= strtoupper($item['priority']) ?></span>
                    </div>

                    <a href="view.php?id=<?= $item['id'] ?>" class="kanban-card-title truncate" title="<?= htmlspecialchars($item['title']) ?>">
                        <?= htmlspecialchars($item['title']) ?>
                    </a>

                    <div class="text-xs text-gray-600 mb-2 space-y-1">
                        <div><strong>เครื่อง:</strong> <?= htmlspecialchars($item['asset_code'] ?? '-') ?> - <?= htmlspecialchars($item['asset_name'] ?? '-') ?></div>
                        <?php if ($item['work_zone_name']): ?>
                        <div><strong>โซน:</strong> <?= htmlspecialchars($item['work_zone_name']) ?></div>
                        <?php endif; ?>
                    </div>

                    <div class="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 mt-2">
                        <div class="flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-brand-500 inline-block"></span>
                            <span><?= htmlspecialchars($item['assigned_name'] ?? 'ยังไม่มอบหมาย') ?></span>
                        </div>
                        <span><?= date('d/m H:i', strtotime($item['created_at'])) ?></span>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<script>
let draggedRepairId = null;

function dragStart(ev, repairId) {
    draggedRepairId = repairId;
    ev.dataTransfer.setData("text/plain", repairId);
    ev.target.classList.add('dragging');
}

function allowDrop(ev) {
    ev.preventDefault();
    const col = ev.target.closest('.kanban-cards');
    if (col) col.classList.add('drag-over');
}

document.addEventListener('dragend', (ev) => {
    if (ev.target.classList.contains('kanban-card')) {
        ev.target.classList.remove('dragging');
    }
    document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
});

async function dropCard(ev, newStatus) {
    ev.preventDefault();
    document.querySelectorAll('.kanban-cards').forEach(c => c.classList.remove('drag-over'));
    
    if (!draggedRepairId) return;
    const cardEl = document.getElementById('card-' + draggedRepairId);
    const targetCol = document.getElementById('col-' + newStatus);
    
    if (cardEl && targetCol) {
        targetCol.appendChild(cardEl);
        
        // Send AJAX update
        const formData = new FormData();
        formData.append('action', 'move_status');
        formData.append('repair_id', draggedRepairId);
        formData.append('new_status', newStatus);

        try {
            const res = await fetch('kanban.php', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                console.log('Status updated to ' + newStatus);
            } else {
                alert('ไม่สามารถเปลี่ยนสถานะได้: ' + data.message);
                location.reload();
            }
        } catch (err) {
            console.error(err);
        }
    }
}
</script>

<?php renderFooter(); ?>
