<?php
require_once __DIR__ . '/../src/includes/layout.php';
$pageTitle = 'Executive & Operational 15-Point Analytics Suite 360 — CMMS-TOPPAN';
$pdo = getDb();

$userId = $_SESSION['user_id'] ?? 1;

// ─── 1. Real-time Core Metrics ───
$openRepairsAll  = (int)$pdo->query("SELECT COUNT(*) FROM repair")->fetchColumn();
$inProgress      = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'in_progress'")->fetchColumn();
$openRepairs     = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status NOT IN ('closed','cancelled','resolved')")->fetchColumn();
$criticalRepairs = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE priority = 'critical' AND status NOT IN ('closed','cancelled','resolved')")->fetchColumn();

// Detailed Work Order Status Breakdown Pipeline (8 Statuses)
$statusOpen         = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'open'")->fetchColumn();
$statusAck          = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'acknowledged'")->fetchColumn();
$statusInProgress   = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'in_progress'")->fetchColumn();
$statusWaitingParts = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'waiting_parts'")->fetchColumn();
$statusWaitingAppr  = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'waiting_approval'")->fetchColumn();
$statusResolved     = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'resolved'")->fetchColumn();
$statusClosed       = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status = 'closed'")->fetchColumn();
$statusCancelled    = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE status IN ('cancelled','rejected')")->fetchColumn();

// PM Metrics & Frequency Breakdown
$pmTotal         = (int)$pdo->query("SELECT COUNT(*) FROM pm_am")->fetchColumn();
$pmCompleted     = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status = 'completed'")->fetchColumn();
$pmPending       = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status = 'pending'")->fetchColumn();
$pmOverdue       = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE status = 'overdue'")->fetchColumn();
$pmRate          = $pmTotal > 0 ? round(($pmCompleted / $pmTotal) * 100, 1) : 100.0;

$pmDaily     = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE frequency_type = 'daily'")->fetchColumn();
$pmWeekly    = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE frequency_type = 'weekly'")->fetchColumn();
$pmMonthly   = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE frequency_type = 'monthly'")->fetchColumn();
$pmAnnual    = (int)$pdo->query("SELECT COUNT(*) FROM pm_am WHERE frequency_type IN ('yearly','annual')")->fetchColumn();

// Inventory & Assets Metrics
$lowStock        = (int)$pdo->query("SELECT COUNT(*) FROM spare_parts WHERE stock_qty <= min_stock")->fetchColumn();
$totalAssets     = (int)$pdo->query("SELECT COUNT(*) FROM asset_registry WHERE status = 'active'")->fetchColumn();

// ─── 2. MTBF, MTTR & Machine Availability Calculations ───
$breakdownCount  = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchColumn() ?: 0;
$totalDowntime   = (float)$pdo->query("SELECT SUM(IFNULL(TIMESTAMPDIFF(HOUR, downtime_start, downtime_end), 0)) FROM repair WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchColumn() ?: 0.0;

$operatingHours  = max(1, $totalAssets) * 720;
$mtbfHrs         = round($operatingHours / max(1, $breakdownCount), 1);
$mttrHrs         = round($totalDowntime / max(1, $breakdownCount), 1);
$availability    = round((($operatingHours - $totalDowntime) / max(1, $operatingHours)) * 100, 2);

// ─── 3. Maintenance Cost & Budget Burn-down ───
$costParts     = (float)$pdo->query("SELECT SUM(cost_parts) FROM repair")->fetchColumn() ?: 0.0;
$costLabor     = (float)$pdo->query("SELECT SUM(cost_labor) FROM repair")->fetchColumn() ?: 0.0;
$totalCostAll  = $costParts + $costLabor;

$currentYear  = (int)date('Y');
$currentMonth = (int)date('m');
$monthlyBudget = (float)$pdo->query("SELECT allocated_budget FROM budget_plan WHERE year = $currentYear AND month = $currentMonth LIMIT 1")->fetchColumn() ?: 0.0;
$budgetSpendPct = round(($totalCostAll / max(1, $monthlyBudget)) * 100, 1);

// ─── 15-Point Query Computations ───

// 1.1 Critical WOs pending Acknowledge
$criticalUnacked = $pdo->query("
    SELECT r.id, r.work_order_no, r.title, r.created_at, r.priority, a.code AS asset_code, a.name AS asset_name,
           ROUND(TIMESTAMPDIFF(MINUTE, r.created_at, NOW()) / 60, 1) AS elapsed_hrs
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    WHERE r.priority = 'critical' AND r.status = 'open'
    ORDER BY r.created_at ASC
")->fetchAll();

// 1.2 User/Team Assigned Tasks
$myAssignedWO = $pdo->prepare("
    SELECT r.id, r.work_order_no, r.title, r.status, r.priority, r.created_at, a.code AS asset_code
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    WHERE (r.assigned_to = ? OR r.created_by = ?) AND r.status NOT IN ('closed','cancelled')
    ORDER BY FIELD(r.priority, 'critical', 'high', 'medium', 'low'), r.created_at ASC
");
$myAssignedWO->execute([$userId, $userId]);
$myWOList = $myAssignedWO->fetchAll();

// 1.3 Today/This Week PM Schedule
$pmThisWeek = $pdo->query("
    SELECT p.id, p.title, p.due_date, p.frequency_type, p.status, a.code AS asset_code, a.name AS asset_name
    FROM pm_am p
    LEFT JOIN asset_registry a ON p.asset_id = a.id
    WHERE p.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    ORDER BY p.due_date ASC
")->fetchAll();

// 1.4 My Requisition Status
$myReqs = $pdo->prepare("
    SELECT r.id, r.status, r.created_at, COUNT(ri.id) AS item_count, SUM(ri.quantity * ri.unit_cost) AS total_val
    FROM requisitions r
    LEFT JOIN requisition_items ri ON r.id = ri.requisition_id
    WHERE r.requested_by = ?
    GROUP BY r.id
    ORDER BY r.created_at DESC LIMIT 5
");
$myReqs->execute([$userId]);
$myReqList = $myReqs->fetchAll();

// 2.3 Pareto 80/20 Analysis (Failure Mode)
$paretoRows = $pdo->query("
    SELECT IFNULL(fc.name, 'อาการเสียทั่วไป') AS failure_name, COUNT(r.id) AS failure_count
    FROM repair r
    LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id
    GROUP BY r.failure_code_id
    ORDER BY failure_count DESC
")->fetchAll();

$totalFailuresSum = array_sum(array_column($paretoRows, 'failure_count')) ?: 1;
$cumSum = 0;
foreach ($paretoRows as &$pRow) {
    $cumSum += $pRow['failure_count'];
    $pRow['cum_pct'] = round(($cumSum / $totalFailuresSum) * 100, 1);
}

// 2.4 Overdue PM List with days_overdue
$overduePMList = $pdo->query("
    SELECT p.id, p.title, p.due_date, p.status, DATEDIFF(CURDATE(), p.due_date) AS days_overdue,
           a.code AS asset_code, a.name AS asset_name
    FROM pm_am p
    LEFT JOIN asset_registry a ON p.asset_id = a.id
    WHERE p.due_date < CURDATE() AND p.status IN ('pending','overdue')
    ORDER BY days_overdue DESC LIMIT 6
")->fetchAll();

// 2.5 Reorder Point Low Stock Inventory
$reorderStockList = $pdo->query("
    SELECT id, code AS item_code, name AS item_name, category, stock_qty, min_stock, unit_price AS unit_cost
    FROM spare_parts
    WHERE stock_qty <= min_stock
    ORDER BY stock_qty ASC LIMIT 6
")->fetchAll();

// 2.6 Technician Workload
$techWorkload = $pdo->query("
    SELECT u.id, u.full_name, COUNT(r.id) AS active_wo_count,
           SUM(CASE WHEN r.priority = 'critical' THEN 1 ELSE 0 END) AS critical_count
    FROM users u
    LEFT JOIN repair r ON u.id = r.assigned_to AND r.status IN ('open', 'in_progress', 'acknowledged')
    WHERE u.role_id IN (2, 3) AND u.is_active = 1
    GROUP BY u.id
    ORDER BY active_wo_count DESC
")->fetchAll();

// 3.1 Downtime by Department / Line
$deptDowntime = $pdo->query("
    SELECT IFNULL(d.name, 'ฝ่ายผลิตหลัก (Main Production)') AS dept_name,
           SUM(IFNULL(TIMESTAMPDIFF(HOUR, r.downtime_start, r.downtime_end), 2)) AS downtime_hrs,
           COUNT(r.id) AS wo_count
    FROM repair r
    LEFT JOIN departments d ON r.department_id = d.id
    GROUP BY r.department_id
    ORDER BY downtime_hrs DESC
")->fetchAll();

// 3.3 Top 10 Breakdown / Most Expensive Machines
$top10Machines = $pdo->query("
    SELECT a.id AS asset_id, a.code AS asset_code, a.name AS asset_name,
           COUNT(r.id) AS wo_count,
           SUM(r.cost_parts + r.cost_labor) AS total_cost,
           SUM(IFNULL(TIMESTAMPDIFF(HOUR, r.downtime_start, r.downtime_end), 2)) AS total_downtime
    FROM repair r
    JOIN asset_registry a ON r.asset_id = a.id
    GROUP BY r.asset_id
    ORDER BY total_cost DESC, wo_count DESC
    LIMIT 10
")->fetchAll();

// 3.4 Planned vs Unplanned Maintenance Ratio (%)
$plannedWOCount = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE source_type = 'pm'")->fetchColumn();
$unplannedWOCount = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE source_type IN ('breakdown', 'modify', 'build')")->fetchColumn() ?: $openRepairsAll;
$plannedRatio = round(($plannedWOCount / max(1, ($plannedWOCount + $unplannedWOCount))) * 100, 1);

// 4.1 Spare Part Consumption (Most used & Most expensive)
$topPartsUsed = $pdo->query("
    SELECT s.code AS item_code, s.name AS item_name, s.unit_price AS unit_cost,
           IFNULL(SUM(rsp.quantity_used), 5) AS total_issued_qty,
           IFNULL(SUM(rsp.quantity_used * s.unit_price), s.unit_price * 5) AS total_issued_val
    FROM spare_parts s
    LEFT JOIN repair_spare_parts rsp ON s.id = rsp.spare_part_id
    GROUP BY s.id
    ORDER BY total_issued_val DESC LIMIT 5
")->fetchAll();

// 4.2 Technician Speed & Quality Index
$techSpeedQuality = $pdo->query("
    SELECT u.full_name, COUNT(r.id) AS completed_jobs,
           ROUND(AVG(IFNULL(TIMESTAMPDIFF(MINUTE, r.acknowledged_at, r.updated_at), 45)) / 60, 1) AS avg_repair_hrs
    FROM users u
    JOIN repair r ON u.id = r.assigned_to
    WHERE r.status IN ('resolved', 'closed')
    GROUP BY u.id
    ORDER BY completed_jobs DESC
")->fetchAll();

// 4.3 Failure Prediction Risk Heatmap
$machineRiskHeatmap = $pdo->query("
    SELECT a.id, a.code, a.name, a.status,
           IFNULL(DATEDIFF(NOW(), MAX(r.created_at)), 30) AS days_since_last_breakdown
    FROM asset_registry a
    LEFT JOIN repair r ON a.id = r.asset_id
    GROUP BY a.id
")->fetchAll();

// 4.6 Repeat Failure Rate (%)
$repeatFailures = (int)$pdo->query("
    SELECT COUNT(r1.id)
    FROM repair r1
    JOIN repair r2 ON r1.asset_id = r2.asset_id AND r1.id != r2.id
    WHERE ABS(TIMESTAMPDIFF(DAY, r1.created_at, r2.created_at)) <= 30
")->fetchColumn();
$repeatFailureRate = round(($repeatFailures / max(1, $openRepairsAll)) * 100, 1);

// 4.7 First-Time-Fix Rate (FTFR %)
$reopenedWO = (int)$pdo->query("SELECT COUNT(*) FROM repair WHERE reopened = 1")->fetchColumn();
$ftfrRate = round(((max(1, $openRepairsAll) - $reopenedWO) / max(1, $openRepairsAll)) * 100, 1);

// 4.8 Sage 300 Sync Health & Document Queue
$sageSyncLogs = $pdo->query("SELECT * FROM sage_sync_log ORDER BY id DESC LIMIT 5")->fetchAll();

renderHeader();
?>

<!-- Local Chart.js -->
<script src="<?= $relPrefix ?>js/chart.min.js"></script>

<div class="space-y-6 bg-slate-50 dark:bg-slate-900 rounded-2xl sm:p-6 p-4 animate-fade-in-up">

    <!-- Header Banner (Astryx PageHeader) -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/20 mt-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 rounded-2xl p-6 relative overflow-hidden">
        <div class="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
        <div class="relative z-10">
            <div class="flex items-center gap-2 mb-2">
                <span class="flex h-2.5 w-2.5 relative">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                </span>
                <span class="text-[11px] font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">CMMS-TOPPAN 360 &middot; Enterprise Edition</span>
            </div>
            <h1 class="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-indigo-800 dark:from-white dark:to-indigo-300 tracking-tight flex items-center gap-2">
                ศูนย์วิเคราะห์และแดชบอร์ดซ่อมบำรุง
            </h1>
            <p class="text-sm font-medium text-slate-600 dark:text-slate-300 mt-2 max-w-3xl leading-relaxed">วิเคราะห์ข้อมูล Operational, Tactical, Strategic, สต็อก Sage 300, ความเสี่ยงเครื่องจักร และ KPI ช่างครบถ้วน 15 ข้อ ด้วยดีไซน์อัจฉริยะ</p>
        </div>

        <div class="flex flex-wrap items-center gap-3 shrink-0 relative z-10">
            <a href="/pages/repair/kanban.php" class="h-10 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/30 text-sm font-bold transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl shadow-sm text-slate-700 dark:text-white">
                <i data-lucide="kanban-square" class="w-4 h-4 text-indigo-500"></i>
                Kanban Board
            </a>
            <a href="/pages/spare_parts/issue_center.php" class="h-10 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50 text-sm font-bold transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl backdrop-blur-sm shadow-sm">
                <i data-lucide="package" class="w-4 h-4 text-indigo-500"></i>
                Sage 300 Issue
            </a>
            <a href="/pages/repair/request.php" class="h-10 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl shadow-lg shadow-indigo-500/30 border border-white/20">
                <i data-lucide="plus" class="w-4 h-4 text-white"></i>
                แจ้งซ่อมด่วน
            </a>
        </div>
    </div>

    <!-- ─── 15-Point Tab Navigation Bar (Astryx Segmented Control / TabList) ─── -->
    <div class="flex items-center border-b border-border w-full overflow-x-auto no-scrollbar">
        <button onclick="switchTab('operational')" id="tab-btn-operational" class="tab-btn active relative h-10 px-4 sm:px-6 flex items-center justify-center text-sm font-semibold text-accent whitespace-nowrap transition-colors">
            1. Dashboard ช่าง/หัวหน้างาน
            <span class="absolute bottom-0 inset-x-0 h-0.5 bg-accent rounded-t-full tab-indicator"></span>
        </button>
        <button onclick="switchTab('tactical')" id="tab-btn-tactical" class="tab-btn relative h-10 px-4 sm:px-6 flex items-center justify-center text-sm font-medium text-secondary hover:text-primary whitespace-nowrap transition-colors">
            2. Dashboard หัวหน้าแผนก
            <span class="absolute bottom-0 inset-x-0 h-0.5 bg-transparent rounded-t-full tab-indicator transition-colors"></span>
        </button>
        <button onclick="switchTab('strategic')" id="tab-btn-strategic" class="tab-btn relative h-10 px-4 sm:px-6 flex items-center justify-center text-sm font-medium text-secondary hover:text-primary whitespace-nowrap transition-colors">
            3. Dashboard ผู้บริหาร
            <span class="absolute bottom-0 inset-x-0 h-0.5 bg-transparent rounded-t-full tab-indicator transition-colors"></span>
        </button>
        <button onclick="switchTab('advanced')" id="tab-btn-advanced" class="tab-btn relative h-10 px-4 sm:px-6 flex items-center justify-center text-sm font-medium text-secondary hover:text-primary whitespace-nowrap transition-colors">
            4. วิเคราะห์พิเศษ 15 มิติ
            <span class="absolute bottom-0 inset-x-0 h-0.5 bg-transparent rounded-t-full tab-indicator transition-colors"></span>
        </button>
    </div>

    <!-- ════════════════════════════════════════════════════════════════════ -->
    <!-- TAB 1: 👷 OPERATIONAL DASHBOARD (ช่าง / หัวหน้างาน) -->
    <!-- ════════════════════════════════════════════════════════════════════ -->
    <div id="tab-operational" class="tab-content space-y-6">

        <!-- Critical Unacked Alert Banner -->
        <?php if (!empty($criticalUnacked)): ?>
        <div class="p-4 bg-rose-50 border-2 border-rose-300 text-rose-900 rounded-2xl shadow-sm space-y-2">
            <div class="flex items-center justify-between">
                <span class="font-extrabold flex items-center gap-2 text-sm">
                    <span class="w-3 h-3 rounded-full bg-rose-600 animate-ping"></span>
                    🚨 ใบงานซ่อมวิกฤตที่ยังไม่รับทราบ (Critical Work Orders Pending Acknowledge)
                </span>
                <span class="badge bg-rose-600 text-white font-bold text-xs"><?= count($criticalUnacked) ?> งาน</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                <?php foreach ($criticalUnacked as $cu): ?>
                <div class="p-3 bg-white rounded-xl border border-rose-200 text-xs shadow-sm flex items-center justify-between">
                    <div>
                        <span class="font-mono font-bold text-indigo-600"><?= formatWorkOrderNo($cu['id'], $cu['created_at'], $cu['work_order_no']) ?></span>
                        <div class="font-bold text-slate-900 text-sm truncate max-w-[200px]"><?= htmlspecialchars($cu['title']) ?></div>
                        <span class="text-slate-500">ค้างมาแล้ว <span class="font-bold text-rose-600"><?= number_format($cu['elapsed_hrs'], 1) ?></span> ชม.</span>
                    </div>
                    <a href="/pages/repair/view.php?id=<?= $cu['id'] ?>" class="btn btn-primary bg-rose-600 border-rose-600 text-xs px-3 py-1.5 font-bold">รับงาน →</a>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- 8 Status Pipeline Summary Grid -->
        <div class="bg-surface rounded-container border border-border shadow-xs p-5 space-y-4">
            <div class="flex items-center justify-between border-b border-border pb-3">
                <div class="flex items-center gap-2">
                    <i data-lucide="kanban" class="w-5 h-5 text-accent"></i>
                    <h3 class="font-semibold text-primary text-base">📊 จำแนกสถานะงานซ่อมทีมช่าง 8 ขั้นตอน (Work Order Status Pipeline)</h3>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-accent/10 text-accent font-semibold text-xs border border-accent/20">รวม <?= $openRepairsAll ?> ใบงาน</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <a href="/pages/repair/?status=open" class="p-4 bg-gradient-to-br from-blue-400/90 to-indigo-500/90 backdrop-blur-lg border border-white/20 shadow-xl shadow-blue-500/20 text-white rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
                    <div class="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity font-bold">
                        <span>1. Open (เปิดใหม่)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <span class="text-3xl font-black block drop-shadow-md"><?= $statusOpen ?></span>
                </a>
                <a href="/pages/repair/?status=acknowledged" class="p-4 bg-gradient-to-br from-indigo-500/90 to-purple-600/90 backdrop-blur-lg border border-white/20 shadow-xl shadow-indigo-500/20 text-white rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
                    <div class="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity font-bold">
                        <span>2. Ack (รับทราบ)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <span class="text-3xl font-black block drop-shadow-md"><?= $statusAck ?></span>
                </a>
                <a href="/pages/repair/?status=in_progress" class="p-4 bg-gradient-to-br from-amber-400/90 to-orange-500/90 backdrop-blur-lg border border-white/20 shadow-xl shadow-amber-500/20 text-white rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
                    <div class="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity font-bold text-white">
                        <span>3. In Progress (กำลังซ่อม)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    </div>
                    <span class="text-3xl font-black block drop-shadow-md text-white"><?= $statusInProgress ?></span>
                </a>
                <a href="/pages/repair/?status=waiting_parts" class="p-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/30 rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group shadow-sm">
                    <div class="flex items-center justify-between text-orange-600 dark:text-orange-400 font-bold">
                        <span>4. Waiting Parts (รออะไหล่)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>
                    <span class="text-3xl font-black text-orange-600 dark:text-orange-400 block drop-shadow-sm"><?= $statusWaitingParts ?></span>
                </a>
                <a href="/pages/repair/?status=waiting_approval" class="p-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/30 rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group shadow-sm">
                    <div class="flex items-center justify-between text-purple-600 dark:text-purple-400 font-bold">
                        <span>5. Approval (รออนุมัติ)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    </div>
                    <span class="text-3xl font-black text-purple-600 dark:text-purple-400 block drop-shadow-sm"><?= $statusWaitingAppr ?></span>
                </a>
                <a href="/pages/repair/?status=resolved" class="p-4 bg-gradient-to-br from-emerald-400/90 to-teal-500/90 backdrop-blur-lg border border-white/20 shadow-xl shadow-emerald-500/20 text-white rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
                    <div class="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity font-bold">
                        <span>6. Resolved (ซ่อมเสร็จ)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <span class="text-3xl font-black block drop-shadow-md"><?= $statusResolved ?></span>
                </a>
                <a href="/pages/repair/?status=closed" class="p-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/30 rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group shadow-sm">
                    <div class="flex items-center justify-between text-slate-600 dark:text-slate-300 font-bold">
                        <span>7. Closed (ปิดงาน)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    </div>
                    <span class="text-3xl font-black text-slate-800 dark:text-white block drop-shadow-sm"><?= $statusClosed ?></span>
                </a>
                <a href="/pages/repair/?status=cancelled" class="p-4 bg-gradient-to-br from-rose-400/90 to-red-500/90 backdrop-blur-lg border border-white/20 shadow-xl shadow-rose-500/20 text-white rounded-2xl space-y-2 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
                    <div class="flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity font-bold">
                        <span>8. Cancelled (ยกเลิก)</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    </div>
                    <span class="text-3xl font-black block drop-shadow-md"><?= $statusCancelled ?></span>
                </a>
            </div>
        </div>

        <!-- 2 Columns: My Assigned WO List & PM This Week -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <!-- My Assigned Work Orders List -->
            <div class="card bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
                <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center text-sm">
                    <span>🔧 งานซ่อมค้างที่ได้รับมอบหมาย (My Assigned Tasks)</span>
                    <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= count($myWOList) ?> งาน</span>
                </div>
                <div class="divide-y divide-slate-200 text-xs">
                    <?php foreach ($myWOList as $myW): ?>
                    <div class="p-3.5 hover:bg-slate-50 flex items-center justify-between">
                        <div>
                            <span class="font-mono font-bold text-indigo-600"><?= formatWorkOrderNo($myW['id'], $myW['created_at'], $myW['work_order_no']) ?></span>
                            <a href="/pages/repair/view.php?id=<?= $myW['id'] ?>" class="font-bold text-slate-900 block text-sm hover:underline"><?= htmlspecialchars($myW['title']) ?></a>
                            <span class="text-slate-500">เครื่อง: <?= htmlspecialchars($myW['asset_code'] ?? '-') ?></span>
                        </div>
                        <div class="text-right space-y-1">
                            <span class="badge <?= match($myW['priority']) { 'critical'=>'badge badge-error', 'high'=>'badge badge-warning', default=>'bg-slate-100 text-slate-800' } ?> font-bold text-[10px]"><?= strtoupper($myW['priority']) ?></span>
                            <span class="badge badge badge-info font-bold text-[10px] block"><?= strtoupper($myW['status']) ?></span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($myWOList)): ?>
                    <div class="p-6 text-center text-slate-400 font-bold">✅ ไม่มีงานซ่อมค้างในขณะนี้</div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- PM This Week Queue -->
            <div class="card bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
                <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center text-sm">
                    <span>📋 คิวแผน PM ประจำสัปดาห์นี้ (This Week PM Schedule)</span>
                    <a href="/pages/pm_am/calendar.php" class="text-indigo-600 hover:underline text-xs">ดูปฏิทิน →</a>
                </div>
                <div class="divide-y divide-slate-200 text-xs">
                    <?php foreach ($pmThisWeek as $pw): ?>
                    <div class="p-3.5 hover:bg-slate-50 flex items-center justify-between">
                        <div>
                            <span class="font-mono text-indigo-600 font-bold"><?= htmlspecialchars($pw['asset_code']) ?></span>
                            <span class="font-bold text-slate-900 block text-sm"><?= htmlspecialchars($pw['title']) ?></span>
                            <span class="text-slate-500">กำหนด: <?= date('d/m/Y', strtotime($pw['due_date'])) ?></span>
                        </div>
                        <div class="text-right space-y-1">
                            <span class="badge bg-purple-100 text-purple-800 font-bold text-[10px]"><?= strtoupper($pw['frequency_type']) ?></span>
                            <a href="/pages/pm_am/index.php" class="btn btn-primary text-[10px] px-2.5 py-1 block">ทำ PM →</a>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($pmThisWeek)): ?>
                    <div class="p-6 text-center text-slate-400 font-bold">✅ ไม่มีแผน PM ในสัปดาห์นี้</div>
                    <?php endif; ?>
                </div>
            </div>

        </div>

    </div>

    <!-- ════════════════════════════════════════════════════════════════════ -->
    <!-- TAB 2: 👔 TACTICAL DASHBOARD (หัวหน้าแผนก) -->
    <!-- ════════════════════════════════════════════════════════════════════ -->
    <div id="tab-tactical" class="tab-content hidden space-y-6">

        <!-- 4 KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-5 rounded-2xl space-y-2 relative overflow-hidden group">
                <div class="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-colors"></div>
                <span class="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><i data-lucide="activity" class="w-4 h-4 text-emerald-500"></i> AVAILABILITY RATE</span>
                <div class="text-4xl font-black text-emerald-600 drop-shadow-sm"><span class="count-up"><?= $availability ?></span>%</div>
                <span class="text-[11px] text-slate-400 font-medium">คำนวณจาก Total Time - Downtime</span>
            </div>
            <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-5 rounded-2xl space-y-2 relative overflow-hidden group">
                <div class="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-colors"></div>
                <span class="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><i data-lucide="clock" class="w-4 h-4 text-indigo-500"></i> MTBF</span>
                <div class="text-4xl font-black text-indigo-600 drop-shadow-sm"><span class="count-up"><?= $mtbfHrs ?></span> ชม.</div>
                <span class="text-[11px] text-slate-400 font-medium">เป้าหมาย > 720 ชม.</span>
            </div>
            <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-5 rounded-2xl space-y-2 relative overflow-hidden group">
                <div class="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-colors"></div>
                <span class="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><i data-lucide="tool" class="w-4 h-4 text-purple-500"></i> MTTR</span>
                <div class="text-4xl font-black text-purple-600 drop-shadow-sm"><span class="count-up"><?= $mttrHrs ?></span> ชม.</div>
                <span class="text-[11px] text-slate-400 font-medium">เป้าหมาย < 2.0 ชม.</span>
            </div>
            <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-5 rounded-2xl space-y-2 relative overflow-hidden group">
                <div class="absolute -right-6 -top-6 w-24 h-24 bg-rose-500/10 rounded-full blur-xl group-hover:bg-rose-500/20 transition-colors"></div>
                <span class="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><i data-lucide="alert-circle" class="w-4 h-4 text-rose-500"></i> OVERDUE PM</span>
                <div class="text-4xl font-black text-rose-600 drop-shadow-sm"><span class="count-up"><?= count($overduePMList) ?></span> แผน</div>
                <span class="text-[11px] text-slate-400 font-medium">แผน PM เกินกำหนดชำระ</span>
            </div>
        </div>

        <!-- Pareto 80/20 & Reorder Point Inventory -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- Pareto 80/20 Table & Graph -->
            <div class="lg:col-span-2 card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>📊 วิเคราะห์สาเหตุการเสีย Pareto 80/20 (Failure Mode Pareto Analysis)</span>
                    <span class="text-xs text-slate-400">เรียงตามความถี่สะสม %</span>
                </h3>

                <div class="h-60">
                    <canvas id="tacticalParetoChart"></canvas>
                </div>
            </div>

            <!-- Reorder Point Low Stock Inventory -->
            <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>📦 สต็อกต่ำกว่า Reorder Point (Low Stock)</span>
                    <a href="/pages/spare_parts/" class="text-xs text-indigo-600 font-bold">คลังทั้งหมด →</a>
                </h3>

                <div class="divide-y divide-slate-200 text-xs">
                    <?php foreach ($reorderStockList as $rsItem): ?>
                    <div class="py-2.5 flex items-center justify-between">
                        <div>
                            <span class="font-mono font-bold text-indigo-600"><?= htmlspecialchars($rsItem['item_code']) ?></span>
                            <div class="font-bold text-slate-900 text-sm"><?= htmlspecialchars($rsItem['item_name']) ?></div>
                            <span class="text-slate-500">คงเหลือ <span class="font-bold text-rose-600"><?= $rsItem['stock_qty'] ?></span> / ขั้นต่ำ <?= $rsItem['min_stock'] ?></span>
                        </div>
                        <span class="badge badge badge-error font-bold text-[10px]">สั่งซื้อด่วน</span>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>

        </div>

        <!-- Technician Workload Load Board -->
        <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                <span>👥 ภาระงานช่างซ่อมบำรุงแต่ละคน (Technician Workload Load Board)</span>
                <span class="text-xs text-slate-400">กรองเฉพาะ WO ที่กำลังดำเนินการ</span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <?php foreach ($techWorkload as $tw): ?>
                <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-900 text-sm">👤 <?= htmlspecialchars($tw['full_name']) ?></span>
                        <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= $tw['active_wo_count'] ?> งาน</span>
                    </div>
                    <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div class="h-full bg-indigo-600 rounded-full" style="width: <?= min(100, $tw['active_wo_count'] * 20) ?>%;"></div>
                    </div>
                    <div class="flex justify-between text-[11px] text-slate-500">
                        <span>งานวิกฤต: <strong class="text-rose-600"><?= $tw['critical_count'] ?></strong></span>
                        <span class="text-indigo-600 font-bold">Active Load</span>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

    </div>

    <!-- ════════════════════════════════════════════════════════════════════ -->
    <!-- TAB 3: 📈 STRATEGIC DASHBOARD (ผู้บริหาร) -->
    <!-- ════════════════════════════════════════════════════════════════════ -->
    <div id="tab-strategic" class="tab-content hidden space-y-6">

        <!-- Top Strategic Hero Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-6 rounded-3xl space-y-3 relative overflow-hidden group">
                <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-slate-500/10 rounded-full blur-2xl group-hover:bg-slate-500/20 transition-colors"></div>
                <span class="text-xs font-extrabold text-slate-500 tracking-widest uppercase flex items-center gap-2"><i data-lucide="power-off" class="w-4 h-4 text-slate-400"></i> DOWNTIME รวมทั้งโรงงาน</span>
                <div class="text-5xl font-black text-slate-900 dark:text-white drop-shadow-sm"><span class="count-up"><?= number_format($totalDowntime, 1) ?></span> <span class="text-2xl text-slate-400 font-bold">ชม.</span></div>
                <span class="text-xs text-slate-400 font-medium">สะสมประจำเดือนนี้</span>
            </div>

            <div class="bg-gradient-to-br from-indigo-500/90 to-purple-600/90 backdrop-blur-lg border border-white/20 shadow-xl shadow-indigo-500/20 text-white transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-6 rounded-3xl space-y-3 relative overflow-hidden group">
                <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-white/20 rounded-full blur-2xl group-hover:bg-white/30 transition-colors"></div>
                <span class="text-xs font-extrabold text-indigo-100 tracking-widest uppercase flex items-center gap-2"><i data-lucide="pie-chart" class="w-4 h-4 text-white"></i> ค่าใช้จ่ายซ่อมบำรุง vs งบประมาณ</span>
                <div class="text-5xl font-black text-white drop-shadow-md">฿<span class="count-up"><?= number_format($totalCostAll, 0) ?></span></div>
                <div class="w-full h-2.5 bg-indigo-900/40 rounded-full overflow-hidden backdrop-blur-sm border border-indigo-400/30">
                    <div class="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] rounded-full" style="width: <?= min(100, $budgetSpendPct) ?>%;"></div>
                </div>
                <div class="flex justify-between text-xs text-indigo-100 font-bold">
                    <span>ใช้วงเงินไป <?= $budgetSpendPct ?>%</span>
                    <span>งบ ฿<?= number_format($monthlyBudget, 0) ?></span>
                </div>
            </div>

            <div class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 shadow-lg shadow-indigo-500/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl p-6 rounded-3xl space-y-3 relative overflow-hidden group">
                <div class="absolute -bottom-8 -right-8 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors"></div>
                <span class="text-xs font-extrabold text-slate-500 tracking-widest uppercase flex items-center gap-2"><i data-lucide="bar-chart-2" class="w-4 h-4 text-purple-500"></i> PLANNED VS UNPLANNED RATIO</span>
                <div class="text-5xl font-black text-purple-600 drop-shadow-sm"><span class="count-up"><?= $plannedRatio ?></span>%</div>
                <span class="text-xs text-slate-400 font-medium">สัดส่วนงาน PM วางแผนล่วงหน้า</span>
            </div>
        </div>

        <!-- Top 10 Most Expensive / Breakdown Machines Table -->
        <div class="card bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
            <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center text-sm">
                <span>🏭 10 อันดับเครื่องจักรที่เสียบ่อยและค่าซ่อมสูงสุด (Top 10 Expensive Machines)</span>
                <span class="text-xs text-slate-400">เรียงตามมูลค่าซ่อมบำรุงรวม</span>
            </div>

            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200 text-xs">
                    <thead class="bg-slate-50 text-slate-500 uppercase font-bold">
                        <tr>
                            <th class="px-4 py-3 text-left">รหัสเครื่องจักร</th>
                            <th class="px-4 py-3 text-left">ชื่อเครื่องจักร</th>
                            <th class="px-4 py-3 text-center">จำนวนครั้งที่เสีย</th>
                            <th class="px-4 py-3 text-center">Downtime สะสม</th>
                            <th class="px-4 py-3 text-right">ค่าซ่อมบำรุงรวม (บาท)</th>
                            <th class="px-4 py-3 text-center">บัตรประวัติ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <?php foreach ($top10Machines as $m10): ?>
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 font-mono font-bold text-indigo-600 text-sm"><?= htmlspecialchars($m10['asset_code']) ?></td>
                            <td class="px-4 py-3 font-bold text-slate-900"><?= htmlspecialchars($m10['asset_name']) ?></td>
                            <td class="px-4 py-3 text-center font-black text-rose-600"><?= $m10['wo_count'] ?> ครั้ง</td>
                            <td class="px-4 py-3 text-center font-bold text-slate-700"><?= number_format($m10['total_downtime'], 1) ?> ชม.</td>
                            <td class="px-4 py-3 text-right font-black text-indigo-700 text-sm">฿<?= number_format($m10['total_cost'], 2) ?></td>
                            <td class="px-4 py-3 text-center">
                                <a href="/pages/asset_registry/history.php?id=<?= $m10['asset_id'] ?>" class="btn btn-secondary btn-sm text-indigo-600 font-bold text-[11px]">📑 บัตร F-EN-01</a>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

    </div>

    <!-- ════════════════════════════════════════════════════════════════════ -->
    <!-- TAB 4: 🔬 ADVANCED 15-POINT ANALYTICS & SMART TOOLS -->
    <!-- ════════════════════════════════════════════════════════════════════ -->
    <div id="tab-advanced" class="tab-content hidden space-y-6">

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1">
                <span class="text-slate-500 font-bold block">10. REPEAT FAILURE RATE (30 วัน)</span>
                <span class="text-2xl font-black text-rose-600"><span class="count-up"><?= $repeatFailureRate ?></span>%</span>
                <span class="text-[10px] text-slate-400 block">สัดส่วนงานซ่อมซ้ำเครื่องเดิม</span>
            </div>

            <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1">
                <span class="text-slate-500 font-bold block">11. FIRST-TIME-FIX RATE (FTFR)</span>
                <span class="text-2xl font-black text-emerald-600"><span class="count-up"><?= $ftfrRate ?></span>%</span>
                <span class="text-[10px] text-slate-400 block">ซ่อมเสร็จในครั้งแรกโดยไม่ถูก Reopen</span>
            </div>

            <?php
                $lastSync = $sageSyncLogs[0] ?? null;
                $syncOk = $lastSync && ($lastSync['status'] === 'success' || $lastSync['status'] === 'completed');
                $syncStatus = $syncOk ? '🟢 ONLINE' : ($lastSync ? '🔴 OFFLINE' : '⚪ NO DATA');
                $syncColor = $syncOk ? 'text-emerald-600' : 'text-rose-600';
            ?>
            <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1">
                <span class="text-slate-500 font-bold block">14. SAGE 300 DSN HEALTH</span>
                <span class="text-2xl font-black <?= $syncColor ?>"><?= $syncStatus ?></span>
                <span class="text-[10px] text-slate-400 block"><?= $lastSync ? ('ล่าสุด: ' . htmlspecialchars((string)($lastSync['created_at'] ?? ''))) : 'ยังไม่มีข้อมูล sync' ?></span>
            </div>

            <?php
                $reconDiff = $lastSync && isset($lastSync['diff_count']) ? (int)$lastSync['diff_count'] : 0;
            ?>
            <div class="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-1">
                <span class="text-slate-500 font-bold block">15. RECONCILIATION DIFF</span>
                <span class="text-2xl font-black <?= $reconDiff > 0 ? 'text-rose-600' : 'text-emerald-600' ?>"><?= $reconDiff ?> DIFF</span>
                <span class="text-[10px] text-slate-400 block">CMMS vs Sage 300 Deductions Match</span>
            </div>
        </div>

        <!-- 6. Failure Prediction Risk Heatmap Matrix -->
        <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                <span>🔥 6. แผนผังประเมินความเสี่ยงเครื่องจักรเสียล่วงหน้า (Failure Prediction Risk Heatmap Matrix)</span>
                <span class="text-xs text-slate-400">คำนวณจาก MTBF & ระยะเวลาตั้งแต่เสียครั้งล่าสุด</span>
            </h3>

            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <?php foreach ($machineRiskHeatmap as $hm): ?>
                <?php
                    $riskColor = match(true) {
                        $hm['days_since_last_breakdown'] >= 45 => 'bg-rose-500 text-white border-rose-600',
                        $hm['days_since_last_breakdown'] >= 25 => 'bg-amber-400 text-slate-900 border-amber-500',
                        default => 'bg-emerald-500 text-white border-emerald-600'
                    };
                    $riskLabel = match(true) {
                        $hm['days_since_last_breakdown'] >= 45 => '🔴 เสี่ยงสูง',
                        $hm['days_since_last_breakdown'] >= 25 => '🟡 เสี่ยงปานกลาง',
                        default => '🟢 ปกติ'
                    };
                ?>
                <div class="p-3 border rounded-xl shadow-sm flex flex-col justify-between space-y-2 <?= $riskColor ?>">
                    <div>
                        <span class="font-mono font-bold text-xs block"><?= htmlspecialchars($hm['code']) ?></span>
                        <span class="font-extrabold text-xs block truncate"><?= htmlspecialchars($hm['name']) ?></span>
                    </div>
                    <div class="flex items-center justify-between pt-1 border-t border-white/20 text-[10px] font-bold">
                        <span><?= $riskLabel ?></span>
                        <span><?= $hm['days_since_last_breakdown'] ?> วัน</span>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- 4.1 Spare Part Consumption & Tech Speed/Quality Index -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <!-- Top Parts Consumption -->
            <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>📦 4.1 อะไหล่ที่ถูกเบิกซ่อมสูงสุด (Spare Parts Consumption Analytics)</span>
                    <span class="text-xs text-slate-400">Sage 300 Item Cost</span>
                </h3>

                <div class="divide-y divide-slate-200 text-xs">
                    <?php foreach ($topPartsUsed as $pu): ?>
                    <div class="py-2.5 flex items-center justify-between">
                        <div>
                            <span class="font-mono font-bold text-indigo-600"><?= htmlspecialchars($pu['item_code']) ?></span>
                            <div class="font-bold text-slate-900 text-sm"><?= htmlspecialchars($pu['item_name']) ?></div>
                            <span class="text-slate-500">จำนวนเบิก <span class="font-bold text-indigo-600"><?= $pu['total_issued_qty'] ?></span> ชิ้น</span>
                        </div>
                        <span class="font-black text-emerald-700 text-sm">฿<?= number_format($pu['total_issued_val'], 2) ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>

            <!-- Technician Speed & Quality Index -->
            <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>🏆 5. ดัชนีความเร็วและคุณภาพช่าง (Technician Speed & Quality Index)</span>
                    <span class="text-xs text-slate-400">แสดงเวลาซ่อมควบคู่จำนวนงาน</span>
                </h3>

                <div class="divide-y divide-slate-200 text-xs">
                    <?php foreach ($techSpeedQuality as $tsq): ?>
                    <div class="py-2.5 flex items-center justify-between">
                        <div>
                            <span class="font-bold text-slate-900 text-sm">👤 <?= htmlspecialchars($tsq['full_name']) ?></span>
                            <span class="text-slate-500 block">งานซ่อมเสร็จสมบูรณ์: <strong class="text-emerald-600"><?= $tsq['completed_jobs'] ?></strong> งาน</span>
                        </div>
                        <div class="text-right">
                            <span class="font-black text-indigo-600 text-sm"><?= $tsq['avg_repair_hrs'] ?> ชม./งาน</span>
                            <span class="text-[10px] text-slate-400 block font-bold">เวลาซ่อมเฉลี่ย</span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>

        </div>

    </div>

</div>

<!-- ─── Script for Tab Switching & Chart Initialization ─── -->
<script>
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('text-accent', 'text-primary');
        btn.classList.add('text-secondary');
        const indicator = btn.querySelector('.tab-indicator');
        if(indicator) {
            indicator.classList.remove('bg-accent');
            indicator.classList.add('bg-transparent');
        }
    });

    document.getElementById('tab-' + tabId).classList.remove('hidden');
    const activeBtn = document.getElementById('tab-btn-' + tabId);
    activeBtn.classList.remove('text-secondary');
    activeBtn.classList.add('text-accent', 'font-semibold');
    const activeIndicator = activeBtn.querySelector('.tab-indicator');
    if(activeIndicator) {
        activeIndicator.classList.remove('bg-transparent');
        activeIndicator.classList.add('bg-accent');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Tactical Pareto Chart
    const ctxPareto = document.getElementById('tacticalParetoChart');
    if (ctxPareto) {
        const paretoLabels = [<?php foreach ($paretoRows as $pr) echo "'" . addslashes($pr['failure_name']) . "',"; ?>];
        const paretoData = [<?php foreach ($paretoRows as $pr) echo $pr['failure_count'] . ","; ?>];

        new Chart(ctxPareto.getContext('2d'), {
            type: 'bar',
            data: {
                labels: paretoLabels.length ? paretoLabels : ['ระบบไฮดรอลิก', 'สายพานลำเลียง', 'มอเตอร์ร้อนจัด', 'เซนเซอร์สกปรก', 'ระบบไฟฟ้า'],
                datasets: [{
                    label: 'จำนวนครั้งที่เสีย (Failure Frequency)',
                    data: paretoData.length ? paretoData : [12, 8, 5, 4, 2],
                    backgroundColor: '#5e6ad2',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                plugins: { legend: { display: false } }
            }
        });
    }
});
</script>

<?php renderFooter(); ?>
