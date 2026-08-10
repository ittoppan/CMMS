<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ปฏิทินสอบเทียบ - CMMS-TPT';
renderHeader();
$pdo = getDb();
$month = isset($_GET['month']) ? (int)$_GET['month'] : (int)date('m');
$year  = isset($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
if ($month < 1) { $month = 12; $year--; }
if ($month > 12) { $month = 1; $year++; }
$firstDay = mktime(0, 0, 0, $month, 1, $year);
$daysInMonth = date('t', $firstDay);
$startDow = (int)date('w', $firstDay);
$prevMonth = $month - 1; $prevYear = $year;
if ($prevMonth < 1) { $prevMonth = 12; $prevYear--; }
$nextMonth = $month + 1; $nextYear = $year;
if ($nextMonth > 12) { $nextMonth = 1; $nextYear++; }
$startDate = sprintf('%04d-%02d-01', $year, $month);
$endDate   = sprintf('%04d-%02d-%02d', $year, $month, $daysInMonth);
$stmt = $pdo->prepare('SELECT c.id, c.title, c.asset_id, a.name AS asset_name, c.next_calibration_date, c.status FROM calibration c LEFT JOIN asset_registry a ON c.asset_id = a.id WHERE c.next_calibration_date BETWEEN ? AND ? AND c.status NOT IN ("cancelled") ORDER BY c.next_calibration_date');
$stmt->execute([$startDate, $endDate]);
$calibrations = $stmt->fetchAll();
$calByDay = [];
foreach ($calibrations as $c) {
    $day = (int)date('j', strtotime($c['next_calibration_date']));
    $calByDay[$day][] = $c;
}
$statusColor = [
    'scheduled'   => 'bg-blue-500',
    'in_progress' => 'bg-yellow-500',
    'completed'   => 'bg-green-500',
    'overdue'     => 'bg-red-500',
];
$thaiMonths = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
$today = (int)date('j');
$curMonth = (int)date('m');
$curYear = (int)date('Y');
?>
<div class="space-y-4">
    <div class="flex items-center justify-between">
        <div><h1 class="text-2xl font-bold text-gray-900">ปฏิทินสอบเทียบ</h1><p class="mt-1 text-sm text-gray-500">Calibration Calendar</p></div>
        <a href="index.php" class="btn-secondary">&larr; กลับไปรายการ</a>
    </div>
    <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between mb-4">
            <a href="?month=<?= $prevMonth ?>&year=<?= $prevYear ?>" class="px-3 py-1 text-sm border rounded hover:bg-gray-50">&larr; <?= $thaiMonths[$prevMonth] ?></a>
            <h2 class="text-lg font-semibold"><?= $thaiMonths[$month] ?> <?= $year + 543 ?></h2>
            <a href="?month=<?= $nextMonth ?>&year=<?= $nextYear ?>" class="px-3 py-1 text-sm border rounded hover:bg-gray-50"><?= $thaiMonths[$nextMonth] ?> &rarr;</a>
        </div>
        <div class="grid grid-cols-7 gap-px bg-gray-200 rounded overflow-hidden">
            <?php $dayNames = ['อา','จ','อ','พ','พฤ','ศ','ส']; ?>
            <?php foreach ($dayNames as $dn): ?>
            <div class="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-600"><?= $dn ?></div>
            <?php endforeach; ?>
            <?php for ($i = 0; $i < $startDow; $i++): ?>
            <div class="bg-gray-100 min-h-[80px]"></div>
            <?php endfor; ?>
            <?php for ($d = 1; $d <= $daysInMonth; $d++):
                $isToday = ($d === $today && $month === $curMonth && $year === $curYear);
                $items = $calByDay[$d] ?? [];
            ?>
            <div class="bg-white min-h-[80px] p-1 <?= $isToday ? 'ring-2 ring-primary-500 ring-inset' : '' ?>">
                <div class="text-xs font-medium <?= $isToday ? 'text-primary-600' : 'text-gray-700' ?> mb-1"><?= $d ?></div>
                <?php foreach ($items as $cal): ?>
                <a href="edit.php?id=<?= $cal['id'] ?>" class="block text-xs mb-0.5 px-1 py-0.5 rounded text-white truncate <?= $statusColor[$cal['status']] ?? 'bg-gray-500' ?>" title="<?= htmlspecialchars($cal['asset_name'] ?? '') ?>">
                    <?= htmlspecialchars(mb_substr($cal['asset_name'] ?? 'ไม่ระบุ', 0, 15)) ?>
                </a>
                <?php endforeach; ?>
            </div>
            <?php endfor; ?>
        </div>
    </div>
    <div class="flex gap-4 text-sm text-gray-600">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-500 inline-block"></span> รอดำเนินการ</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-yellow-500 inline-block"></span> กำลังดำเนินการ</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span> เสร็จสิ้น</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-500 inline-block"></span> เกินกำหนด</span>
    </div>
</div>
<?php renderFooter(); ?>
