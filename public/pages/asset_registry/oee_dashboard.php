<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'OEE / Downtime — CMMS-TPT';
$pdo = getDb();

$month = preg_match('/^\d{4}-\d{2}$/', $_GET['month'] ?? '') ? $_GET['month'] : date('Y-m');
$prevM = date('Y-m', strtotime($month . '-01 -1 month'));
$nextM = date('Y-m', strtotime($month . '-01 +1 month'));

// ข้อมูลต่อเครื่องจักร: ชั่วโมงวางแผน (production_hours) + downtime (repair)
$rows = $pdo->prepare("
    SELECT a.id AS asset_id, a.code, a.name,
           COALESCE(ph.sched_hours, 0) AS sched_hours,
           COALESCE(dt.downtime_hours, 0) AS downtime_hours,
           COALESCE(dt.brk_count, 0) AS brk_count
    FROM asset_registry a
    LEFT JOIN (
        SELECT asset_id, SUM(hours) AS sched_hours
        FROM production_hours WHERE DATE_FORMAT(record_date, '%Y-%m') = ?
        GROUP BY asset_id
    ) ph ON ph.asset_id = a.id
    LEFT JOIN (
        SELECT asset_id, SUM(downtime_minutes) / 60 AS downtime_hours, COUNT(*) AS brk_count
        FROM repair
        WHERE downtime_minutes > 0 AND DATE_FORMAT(downtime_start, '%Y-%m') = ?
        GROUP BY asset_id
    ) dt ON dt.asset_id = a.id
    WHERE ph.sched_hours IS NOT NULL OR dt.downtime_hours IS NOT NULL
    ORDER BY dt.downtime_hours DESC, a.code
");
$rows->execute([$month, $month]);
$rows = $rows->fetchAll();

$totalDowntime = 0; $totalSched = 0; $totalBrk = 0; $machines = 0; $availSum = 0.0; $availCount = 0;
foreach ($rows as $r) {
    $totalDowntime += $r['downtime_hours'];
    $totalSched += $r['sched_hours'];
    $totalBrk += $r['brk_count'];
    $machines++;
    if ($r['sched_hours'] > 0) { $availSum += max(0, 1 - $r['downtime_hours'] / $r['sched_hours']); $availCount++; }
}
$avgAvail = $availCount ? $availSum / $availCount * 100 : null;

// แนวโน้ม 6 เดือน (downtime ชั่วโมง)
$trend = $pdo->query("
    SELECT DATE_FORMAT(downtime_start, '%Y-%m') ym, SUM(downtime_minutes) / 60 h, COUNT(*) c
    FROM repair WHERE downtime_minutes > 0 AND downtime_start >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY ym ORDER BY ym
")->fetchAll();
$trendMax = $trend ? max(array_map(fn($x) => (float)$x['h'], $trend)) : 1;

renderHeader();
?>
<div class="space-y-6">
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">⏱️ OEE / Downtime Dashboard</h1>
            <p class="text-sm text-secondary mt-1">ชั่วโมงหยุดเดินเครื่อง + ความพร้อมใช้งาน (Availability) — <?= date('F Y', strtotime($month . '-01')) ?></p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">← ทะเบียนครุภัณฑ์</a>
            <a href="oee_dashboard.php?month=<?= $prevM ?>" class="h-9 w-9 items-center justify-center bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-sm font-bold inline-flex">‹</a>
            <form method="GET" class="flex items-center gap-1">
                <input type="month" name="month" value="<?= $month ?>" class="h-9 px-2 rounded-md border border-border bg-white dark:bg-slate-900 text-xs font-semibold">
                <button class="h-9 px-3 bg-accent text-white rounded-md text-xs font-bold">ดู</button>
            </form>
            <a href="oee_dashboard.php?month=<?= $nextM ?>" class="h-9 w-9 items-center justify-center bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-sm font-bold inline-flex">›</a>
        </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="cmms-card cmms-stat-card"><span class="cmms-stat-label">Downtime รวม</span><span class="cmms-stat-value"><?= number_format($totalDowntime, 1) ?> ชม.</span><span class="cmms-stat-hint"><?= $totalBrk ?> ครั้งที่หยุด</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#16a34a"><span class="cmms-stat-label">ชั่วโมงวางแผน</span><span class="cmms-stat-value"><?= number_format($totalSched, 1) ?> ชม.</span><span class="cmms-stat-hint">production_hours</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#ea580c"><span class="cmms-stat-label">Availability เฉลี่ย</span><span class="cmms-stat-value"><?= $avgAvail !== null ? number_format($avgAvail, 1) . '%' : '—' ?></span><span class="cmms-stat-hint">เฉพาะเครื่องที่มีข้อมูล</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#7c3aed"><span class="cmms-stat-label">เครื่องที่ติดตาม</span><span class="cmms-stat-value"><?= $machines ?></span><span class="cmms-stat-hint">เครื่อง</span></div>
    </div>

    <?php if (empty($rows)): ?>
    <div class="cmms-card p-10 text-center">
        <div class="text-4xl mb-3">📭</div>
        <p class="text-secondary font-medium">ยังไม่มีข้อมูล downtime หรือ production hours ในเดือนนี้</p>
        <p class="text-xs text-secondary mt-1">Downtime มาจากใบงานซ่อมที่กรอก downtime_start/end — production hours มาจากหน้า Production Hours</p>
    </div>
    <?php else: ?>

    <!-- Trend 6 เดือน -->
    <div class="cmms-card p-4">
        <div class="cmms-section-title">📉 แนวโน้ม Downtime 6 เดือนล่าสุด (ชั่วโมง)</div>
        <div class="flex items-end gap-2 h-32 mt-3">
            <?php foreach ($trend as $t):
                $h = (float)$t['h'];
                $barH = max(4, (int)round($h / $trendMax * 100));
                $label = (new DateTime($t['ym'] . '-01'))->format('M');
                $isCur = $t['ym'] === $month;
            ?>
            <div class="flex-1 flex flex-col items-center gap-1">
                <span class="text-[10px] font-bold <?= $isCur ? 'text-accent' : 'text-secondary' ?>"><?= number_format($h, 1) ?></span>
                <div class="w-full rounded-t-md <?= $isCur ? 'bg-gradient-to-t from-accent to-indigo-400' : 'bg-slate-300 dark:bg-slate-700' ?>" style="height:<?= $barH ?>%"></div>
                <span class="text-[10px] text-secondary"><?= $label ?></span>
            </div>
            <?php endforeach; ?>
            <?php if (!$trend): ?><p class="text-sm text-secondary">ยังไม่มีข้อมูล</p><?php endif; ?>
        </div>
    </div>

    <!-- ตารางต่อเครื่อง -->
    <div class="cmms-card overflow-hidden">
        <div class="overflow-x-auto">
            <table class="data-table w-full text-sm">
                <thead><tr>
                    <th class="px-4 py-3 text-left">เครื่องจักร</th>
                    <th class="px-4 py-3 text-right">ชม.วางแผน</th>
                    <th class="px-4 py-3 text-right">Downtime</th>
                    <th class="px-4 py-3 text-right">ครั้งที่หยุด</th>
                    <th class="px-4 py-3 text-right">Availability</th>
                    <th class="px-4 py-3" style="width:24%">สัดส่วน</th>
                </tr></thead>
                <tbody>
                <?php foreach ($rows as $r):
                    $avail = $r['sched_hours'] > 0 ? max(0, 1 - $r['downtime_hours'] / $r['sched_hours']) : null;
                    $w = $r['sched_hours'] > 0 ? (int)round($r['downtime_hours'] / $r['sched_hours'] * 100) : 0;
                    $availColor = $avail === null ? 'text-secondary' : ($avail >= 0.95 ? 'text-green-600' : ($avail >= 0.85 ? 'text-amber-600' : 'text-red-600'));
                ?>
                <tr>
                    <td class="px-4 py-3 font-semibold text-primary"><?= htmlspecialchars($r['code']) ?> <span class="text-secondary font-normal text-xs"><?= htmlspecialchars(mb_strimwidth((string)$r['name'], 0, 26, '…')) ?></span></td>
                    <td class="px-4 py-3 text-right text-secondary"><?= number_format($r['sched_hours'], 1) ?></td>
                    <td class="px-4 py-3 text-right font-semibold text-red-600"><?= number_format($r['downtime_hours'], 1) ?> ชม.</td>
                    <td class="px-4 py-3 text-right text-secondary"><?= (int)$r['brk_count'] ?></td>
                    <td class="px-4 py-3 text-right font-bold <?= $availColor ?>"><?= $avail !== null ? number_format($avail * 100, 1) . '%' : '—' ?></td>
                    <td class="px-4 py-3">
                        <?php if ($r['sched_hours'] > 0): ?>
                        <div class="h-2 rounded-full bg-muted overflow-hidden">
                            <div class="h-full rounded-full <?= $w > 15 ? 'bg-red-500' : ($w > 5 ? 'bg-amber-500' : 'bg-green-500') ?>" style="width:<?= min(100, $w) ?>%"></div>
                        </div>
                        <?php else: ?><span class="text-xs text-secondary/60">ไม่มีข้อมูล</span><?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php endif; ?>
</div>
<?php renderFooter(); ?>
