<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ปฏิทิน PM - CMMS-TPT';
$pdo = getDb();

$month = isset($_GET['month']) ? (int)$_GET['month'] : (int)date('m');
$year = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
if ($month < 1) { $month = 12; $year--; }
if ($month > 12) { $month = 1; $year++; }

$firstDay = mktime(0,0,0,$month,1,$year);
$daysInMonth = date('t', $firstDay);
$startDow = (int)date('w', $firstDay);
$prevMonth = $month - 1;
$prevYear = $year;
if ($prevMonth < 1) { $prevMonth = 12; $prevYear--; }
$nextMonth = $month + 1;
$nextYear = $year;
if ($nextMonth > 12) { $nextMonth = 1; $nextYear++; }

$monthStart = sprintf('%04d-%02d-01', $year, $month);
$monthEnd = sprintf('%04d-%02d-%02d', $year, $month, $daysInMonth);

$pmTasks = $pdo->prepare("
    SELECT pm.id, pm.title, pm.status, pm.due_date, a.name AS asset_name
    FROM pm_am pm
    LEFT JOIN asset_registry a ON pm.asset_id = a.id
    WHERE pm.due_date BETWEEN ? AND ?
    ORDER BY pm.due_date
");
$pmTasks->execute([$monthStart, $monthEnd]);
$tasksByDate = [];
foreach ($pmTasks as $t) {
    $tasksByDate[$t['due_date']][] = $t;
}

$holidays = $pdo->prepare("SELECT holiday_date, name FROM holidays WHERE (is_recurring = 0 AND holiday_date BETWEEN ? AND ?) OR (is_recurring = 1 AND MONTH(holiday_date) = ?)");
$holidays->execute([$monthStart, $monthEnd, $month]);
$holidayMap = [];
foreach ($holidays as $h) {
    $dateKey = $h['holiday_date'];
    $holidayMap[$dateKey][] = $h['name'];
}

$statusColors = ['pending'=>'bg-yellow-400','in_progress'=>'bg-blue-400','completed'=>'bg-green-400','overdue'=>'bg-red-400','skipped'=>'bg-gray-400'];
$thaiMonths = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
$dayNames = ['อา','จ','อ','พ','พฤ','ศ','ส'];
$today = date('Y-m-d');

renderHeader();
?>
<div class="space-y-4">
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">ปฏิทินแผน PM</h1>
            <p class="mt-1 text-sm text-gray-500">มุมมองปฏิทินการบำรุงรักษา</p>
        </div>
        <a href="index.php" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">&larr; กลับไปรายการ</a>
    </div>

    <div class="card p-4">
        <div class="flex items-center justify-between mb-4">
            <a href="?month=<?= $prevMonth ?>&year=<?= $prevYear ?>" class="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200">&larr; <?= $thaiMonths[$prevMonth] ?></a>
            <h2 class="text-xl font-bold text-gray-800"><?= $thaiMonths[$month] ?> <?= $year ?></h2>
            <a href="?month=<?= $nextMonth ?>&year=<?= $nextYear ?>" class="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"><?= $thaiMonths[$nextMonth] ?> &rarr;</a>
        </div>

        <div class="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            <?php foreach ($dayNames as $dn): ?>
            <div class="bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-600"><?= $dn ?></div>
            <?php endforeach; ?>

            <?php for ($i = 0; $i < $startDow; $i++): ?>
            <div class="bg-gray-50 min-h-[100px] p-1"></div>
            <?php endfor; ?>

            <?php for ($d = 1; $d <= $daysInMonth; $d++): ?>
            <?php
            $dateStr = sprintf('%04d-%02d-%02d', $year, $month, $d);
            $isToday = $dateStr === $today;
            $dayTasks = $tasksByDate[$dateStr] ?? [];
            $dayHolidays = $holidayMap[$dateStr] ?? [];
            ?>
            <div class="bg-white min-h-[100px] p-1 <?= $isToday ? 'ring-2 ring-primary-400' : '' ?>">
                <div class="text-sm font-medium <?= $isToday ? 'text-primary-600' : 'text-gray-700' ?> mb-1"><?= $d ?></div>
                <?php foreach ($dayHolidays as $hname): ?>
                <div class="text-xs text-red-500 font-medium truncate mb-0.5" title="<?= htmlspecialchars($hname) ?>">&#127775; <?= htmlspecialchars($hname) ?></div>
                <?php endforeach; ?>
                <?php foreach ($dayTasks as $task): ?>
                <a href="view.php?id=<?= $task['id'] ?>" class="block text-xs px-1 py-0.5 rounded <?= $statusColors[$task['status']] ?? 'bg-gray-300' ?> text-white truncate mb-0.5 hover:opacity-80" title="<?= htmlspecialchars($task['title']) ?>">
                    <?= htmlspecialchars(mb_substr($task['title'], 0, 20)) ?>
                </a>
                <?php endforeach; ?>
            </div>
            <?php endfor; ?>
        </div>
    </div>

    <div class="flex items-center gap-4 text-sm text-gray-600">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-yellow-400 inline-block"></span> รอดำเนินการ</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-400 inline-block"></span> กำลังดำเนินการ</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-400 inline-block"></span> เสร็จแล้ว</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-400 inline-block"></span> เลยกำหนด</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-400 inline-block"></span> ข้าม</span>
    </div>
</div>
<?php renderFooter(); ?>
