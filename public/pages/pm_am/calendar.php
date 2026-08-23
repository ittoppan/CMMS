<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ปฏิทินแผน PM — CMMS-TPT';
$pdo = getDb();

$ym = $_GET['ym'] ?? date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $ym)) { $ym = date('Y-m'); }
[$y, $m] = array_map('intval', explode('-', $ym));
$first = new DateTime(sprintf('%04d-%02d-01', $y, $m));
$monthStart = $first->format('Y-m-d');
$monthEnd   = (clone $first)->modify('last day of this month')->format('Y-m-d');
$today      = date('Y-m-d');
$prev = (clone $first)->modify('-1 month')->format('Y-m');
$next = (clone $first)->modify('+1 month')->format('Y-m');

$pms = $pdo->prepare("
    SELECT p.*, a.name AS asset_name, a.code AS asset_code, u.full_name AS assigned_name
    FROM pm_am p
    LEFT JOIN asset_registry a ON p.asset_id = a.id
    LEFT JOIN users u ON p.assigned_to = u.id
    WHERE p.due_date BETWEEN ? AND ?
    ORDER BY p.due_date ASC
");
$pms->execute([$monthStart, $monthEnd]);
$pms = $pms->fetchAll();

$overdue = $pdo->prepare("
    SELECT p.*, a.name AS asset_name, a.code AS asset_code
    FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id
    WHERE p.due_date < ? AND p.status NOT IN ('completed','cancelled')
    ORDER BY p.due_date ASC
");
$overdue->execute([$monthStart]);
$overdue = $overdue->fetchAll();

$byDay = [];
$doneInMonth = 0; $pendingInMonth = 0; $overdueInMonth = 0;
foreach ($pms as $pm) {
    $d = (int)substr($pm['due_date'], 8, 2);
    $byDay[$d][] = $pm;
    if ($pm['status'] === 'completed') { $doneInMonth++; }
    else {
        $pendingInMonth++;
        if ($pm['due_date'] < $today) $overdueInMonth++;
    }
}

$startDow = (int)$first->format('w');               // 0 = Sunday
$daysInMonth = (int)$first->format('t');
$cells = (int)ceil(($startDow + $daysInMonth) / 7) * 7;
$weekdays = ['อา','จ','อ','พ','พฤ','ศ','ส'];

renderHeader();
function pmChip(array $pm, string $today): string {
    $isDone = $pm['status'] === 'completed';
    $isOverdue = !$isDone && $pm['due_date'] < $today;
    $dueSoon  = !$isDone && !$isOverdue && $pm['due_date'] <= date('Y-m-d', strtotime('+7 days'));
    $color = $isDone ? 'bg-green-100 text-green-800 border-green-200'
           : ($isOverdue ? 'bg-red-100 text-red-800 border-red-200'
           : ($dueSoon  ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-blue-100 text-blue-800 border-blue-200'));
    $code = htmlspecialchars(($pm['asset_code'] ?? '') ?: ('#' . $pm['id']));
    return '<a href="view.php?id=' . (int)$pm['id'] . '" title="' . htmlspecialchars($pm['title'] ?? '') . '" class="block px-1.5 py-0.5 rounded border text-[10px] leading-tight truncate ' . $color . '">'
        . ($isDone ? '✅ ' : ($isOverdue ? '⏰ ' : ($dueSoon ? '⏳ ' : '')))
        . $code . '</a>';
}
?>
<div class="space-y-6">
    <!-- Header + month nav -->
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">📅 ปฏิทินแผน PM</h1>
            <p class="text-sm text-secondary mt-1">ภาพรวมงานป้องกัน (Preventive Maintenance) รายเดือน — <?= $first->format('F Y') ?></p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">← แผน PM</a>
            <a href="calendar.php?ym=<?= $prev ?>" class="h-9 w-9 items-center justify-center bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-sm font-bold inline-flex">‹</a>
            <a href="calendar.php?ym=<?= date('Y-m') ?>" class="h-9 px-3 bg-accent text-white rounded-md text-xs font-bold inline-flex items-center">วันนี้</a>
            <a href="calendar.php?ym=<?= $next ?>" class="h-9 w-9 items-center justify-center bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-sm font-bold inline-flex">›</a>
        </div>
    </div>

    <!-- Stats chips -->
    <div class="flex flex-wrap gap-2 text-sm">
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">✅ เสร็จแล้ว <?= $doneInMonth ?></span>
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">⏳ รอทำ <?= $pendingInMonth ?></span>
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">⏰ เกินในเดือนนี้ <?= $overdueInMonth ?></span>
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-900">🔴 ค้างก่อนเดือนนี้ <?= count($overdue) ?></span>
    </div>

    <!-- Overdue backlog -->
    <?php if (!empty($overdue)): ?>
    <div class="cmms-card p-4 border-red-200">
        <div class="cmms-section-title">🔴 งานค้างเกินจากเดือนก่อนหน้า</div>
        <div class="flex flex-wrap gap-2 mt-2">
            <?php foreach ($overdue as $pm): ?>
            <a href="view.php?id=<?= (int)$pm['id'] ?>" class="cmms-banner error inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold hover:bg-red-100">
                ⏰ <?= htmlspecialchars(($pm['asset_code'] ?? '') . ' — ' . ($pm['title'] ?? '')) ?>
                <span class="text-red-400">(<?= htmlspecialchars(date('d/m/Y', strtotime($pm['due_date']))) ?>)</span>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <!-- Calendar grid -->
    <div class="cmms-card p-3 sm:p-4 overflow-hidden">
        <div class="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
            <?php foreach ($weekdays as $wd): ?>
            <div class="text-[10px] sm:text-xs font-bold text-secondary uppercase py-1"><?= $wd ?></div>
            <?php endforeach; ?>

            <?php for ($i = 0; $i < $startDow; $i++): ?>
            <div class="min-h-[58px] sm:min-h-[84px] rounded-lg bg-muted/40"></div>
            <?php endfor; ?>

            <?php for ($d = 1; $d <= $daysInMonth; $d++): ?>
            <?php
                $dateStr = sprintf('%04d-%02d-%02d', $y, $m, $d);
                $isToday = $dateStr === $today;
                $isWeekend = ((int)(new DateTime($dateStr))->format('w')) === 0;
                $dayPms = $byDay[$d] ?? [];
            ?>
            <div class="min-h-[58px] sm:min-h-[84px] rounded-lg border p-1 flex flex-col gap-0.5 overflow-hidden <?= $isToday ? 'border-accent ring-1 ring-accent/40 bg-accent/5' : ($isWeekend ? 'bg-muted/30 border-border' : 'border-border') ?>">
                <span class="text-[10px] sm:text-xs font-bold <?= $isToday ? 'text-accent' : ($isWeekend ? 'text-secondary/60' : 'text-secondary') ?>"><?= $d ?></span>
                <div class="flex flex-col gap-0.5 overflow-y-auto">
                    <?php foreach ($dayPms as $pm): ?><?= pmChip($pm, $today) ?><?php endforeach; ?>
                </div>
            </div>
            <?php endfor; ?>

            <?php for ($i = $startDow + $daysInMonth; $i < $cells; $i++): ?>
            <div class="min-h-[58px] sm:min-h-[84px] rounded-lg bg-muted/40"></div>
            <?php endfor; ?>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border text-[11px] text-secondary">
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-green-200 border border-green-300"></span> เสร็จแล้ว</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-blue-200 border border-blue-300"></span> ตามกำหนด</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-amber-200 border border-amber-300"></span> ใกล้ครบ (7 วัน)</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-red-200 border border-red-300"></span> เกินกำหนด</span>
        </div>
    </div>
</div>
<?php renderFooter(); ?>
