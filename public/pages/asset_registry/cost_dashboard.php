<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ต้นทุนซ่อมต่อเครื่องจักร — CMMS-TPT';
$pdo = getDb();

$month = preg_match('/^\d{4}-\d{2}$/', $_GET['month'] ?? '') ? $_GET['month'] : date('Y-m');
$prevM = date('Y-m', strtotime($month . '-01 -1 month'));
$nextM = date('Y-m', strtotime($month . '-01 +1 month'));

$rows = $pdo->prepare("
    SELECT a.id AS asset_id, a.code, a.name,
           COALESCE(SUM(r.cost_parts), 0)     AS parts,
           COALESCE(SUM(r.cost_labor), 0)     AS labor,
           COALESCE(SUM(r.cost_outsource), 0) AS outsource,
           COUNT(r.id)                        AS job_count
    FROM repair r
    JOIN asset_registry a ON r.asset_id = a.id
    WHERE DATE_FORMAT(r.created_at, '%Y-%m') = ?
      AND r.status IN ('resolved','closed')
    GROUP BY a.id, a.code, a.name
    HAVING (parts + labor + outsource) > 0
    ORDER BY (parts + labor + outsource) DESC
");
$rows->execute([$month]);
$rows = $rows->fetchAll();

$totalParts = 0; $totalLabor = 0; $totalOut = 0; $totalJobs = 0;
foreach ($rows as $r) { $totalParts += $r['parts']; $totalLabor += $r['labor']; $totalOut += $r['outsource']; $totalJobs += $r['job_count']; }
$grand = $totalParts + $totalLabor + $totalOut;
$top5 = array_slice($rows, 0, 5);
$maxTop = $top5 ? max(array_map(fn($x) => $x['parts'] + $x['labor'] + $x['outsource'], $top5)) : 1;

renderHeader();
?>
<div class="space-y-6">
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">💰 ต้นทุนซ่อมต่อเครื่องจักร</h1>
            <p class="text-sm text-secondary mt-1">ค่าแรง + ค่าอะไหล่ + ค่าจ้างภายนอก จากใบงานที่ปิดแล้ว — <?= date('F Y', strtotime($month . '-01')) ?></p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">← ทะเบียนครุภัณฑ์</a>
            <a href="cost_dashboard.php?month=<?= $prevM ?>" class="h-9 w-9 items-center justify-center bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-sm font-bold inline-flex">‹</a>
            <form method="GET" class="flex items-center gap-1">
                <input type="month" name="month" value="<?= $month ?>" class="h-9 px-2 rounded-md border border-border bg-white dark:bg-slate-900 text-xs font-semibold">
                <button class="h-9 px-3 bg-accent text-white rounded-md text-xs font-bold">ดู</button>
            </form>
            <a href="cost_dashboard.php?month=<?= $nextM ?>" class="h-9 w-9 items-center justify-center bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-sm font-bold inline-flex">›</a>
        </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="cmms-card cmms-stat-card"><span class="cmms-stat-label">รวมต้นทุน</span><span class="cmms-stat-value">฿<?= number_format($grand) ?></span><span class="cmms-stat-hint"><?= $totalJobs ?> ใบงานที่ปิด</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#16a34a"><span class="cmms-stat-label">ค่าอะไหล่</span><span class="cmms-stat-value">฿<?= number_format($totalParts) ?></span><span class="cmms-stat-hint">spare parts</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#ea580c"><span class="cmms-stat-label">ค่าแรง</span><span class="cmms-stat-value">฿<?= number_format($totalLabor) ?></span><span class="cmms-stat-hint">labor</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#7c3aed"><span class="cmms-stat-label">จ้างภายนอก</span><span class="cmms-stat-value">฿<?= number_format($totalOut) ?></span><span class="cmms-stat-hint">outsource</span></div>
    </div>

    <?php if (empty($rows)): ?>
    <div class="cmms-card p-10 text-center">
        <div class="text-4xl mb-3">📭</div>
        <p class="text-secondary font-medium">ยังไม่มีใบงานที่ปิดแล้วในเดือนนี้</p>
        <p class="text-xs text-secondary mt-1">ต้นทุนจะคำนวณจากใบงานสถานะ Resolved / Closed ที่กรอกค่าอะไหล่-ค่าแรง</p>
    </div>
    <?php else: ?>

    <!-- Top 5 -->
    <div class="cmms-card p-4">
        <div class="cmms-section-title">🏆 Top 5 เครื่องจักรที่ใช้ค่าซ่อมสูงสุด</div>
        <div class="space-y-3 mt-3">
            <?php foreach ($top5 as $i => $r): $total = $r['parts'] + $r['labor'] + $r['outsource']; $w = (int)round($total / $maxTop * 100); ?>
            <div>
                <div class="flex items-center justify-between text-sm mb-1">
                    <span class="font-semibold text-primary"><?= $i + 1 ?>. <?= htmlspecialchars($r['code']) ?> — <?= htmlspecialchars(mb_strimwidth((string)$r['name'], 0, 34, '…')) ?></span>
                    <span class="font-bold text-accent">฿<?= number_format($total) ?></span>
                </div>
                <div class="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-accent to-indigo-500" style="width:<?= max(3, $w) ?>%"></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Full table -->
    <div class="cmms-card overflow-hidden">
        <div class="overflow-x-auto">
            <table class="data-table w-full text-sm">
                <thead><tr>
                    <th class="px-4 py-3 text-left">เครื่องจักร</th>
                    <th class="px-4 py-3 text-left">ใบงาน</th>
                    <th class="px-4 py-3 text-right">ค่าอะไหล่</th>
                    <th class="px-4 py-3 text-right">ค่าแรง</th>
                    <th class="px-4 py-3 text-right">จ้างภายนอก</th>
                    <th class="px-4 py-3 text-right">รวม</th>
                </tr></thead>
                <tbody>
                <?php foreach ($rows as $r): $total = $r['parts'] + $r['labor'] + $r['outsource']; ?>
                <tr>
                    <td class="px-4 py-3 font-semibold text-primary"><?= htmlspecialchars($r['code']) ?> <span class="text-secondary font-normal text-xs"><?= htmlspecialchars(mb_strimwidth((string)$r['name'], 0, 28, '…')) ?></span></td>
                    <td class="px-4 py-3 text-secondary"><?= (int)$r['job_count'] ?></td>
                    <td class="px-4 py-3 text-right">฿<?= number_format($r['parts']) ?></td>
                    <td class="px-4 py-3 text-right">฿<?= number_format($r['labor']) ?></td>
                    <td class="px-4 py-3 text-right">฿<?= number_format($r['outsource']) ?></td>
                    <td class="px-4 py-3 text-right font-bold text-accent">฿<?= number_format($total) ?></td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php endif; ?>
</div>
<?php renderFooter(); ?>
