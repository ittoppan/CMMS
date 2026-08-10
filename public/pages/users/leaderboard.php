<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = __t('leaderboard') . ' - CMMS-TPT';
$pdo = getDb();

// Fetch Technicians & KPI metrics
$stmt = $pdo->query("
    SELECT u.id, u.full_name, u.employee_code, u.position, u.avatar_path, d.name AS dept_name,
           COUNT(r.id) AS total_assigned,
           SUM(CASE WHEN r.status IN ('resolved','closed') THEN 1 ELSE 0 END) AS completed_count,
           SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
           AVG(rr.rating_score) AS avg_rating
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN repair r ON r.assigned_to = u.id
    LEFT JOIN repair_ratings rr ON r.id = rr.repair_id
    WHERE u.is_active = 1
    GROUP BY u.id
    ORDER BY completed_count DESC, avg_rating DESC
");
$techs = $stmt->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">🏆 <?= __t('leaderboard') ?> (Technician KPI Leaderboard)</h1>
            <p class="mt-1 text-sm text-gray-500">ตารางสรุปผลงานและการปิดงานซ่อมของทีมช่างบำรุงรักษา</p>
        </div>
        <div class="flex gap-2">
            <a href="/pages/users/" class="btn btn-secondary">👥 รายชื่อผู้ใช้</a>
            <a href="/pages/repair/kanban.php" class="btn btn-primary">📊 Kanban Board</a>
        </div>
    </div>

    <!-- Leaderboard Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <?php 
        $top3 = array_slice($techs, 0, 3);
        $badges = ['🥇 อันดับ 1 (Gold)', '🥈 อันดับ 2 (Silver)', '🥉 อันดับ 3 (Bronze)'];
        $colors = ['#fef3c7', '#f1f5f9', '#ffedd5'];
        $borders = ['#f59e0b', '#94a3b8', '#ea580c'];
        foreach ($top3 as $idx => $top):
        ?>
        <div class="card p-5 rounded-xl shadow-sm border-2 text-center flex flex-col items-center" style="background:<?= $colors[$idx] ?>; border-color:<?= $borders[$idx] ?>;">
            <div class="text-xs font-extrabold text-gray-700 mb-2 uppercase"><?= $badges[$idx] ?></div>
            <img src="<?= getImageUrl($top['avatar_path'] ?? '', 'avatar') ?>" class="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md mb-2">
            <div class="text-base font-black text-gray-900 mb-0.5"><?= htmlspecialchars($top['full_name']) ?></div>
            <div class="text-xs text-gray-600 mb-3"><?= htmlspecialchars($top['position'] ?? 'Technician') ?> (<?= htmlspecialchars($top['dept_name'] ?? 'ฝ่ายช่าง') ?>)</div>
            
            <div class="grid grid-cols-2 gap-2 text-center pt-2 border-t border-gray-300">
                <div>
                    <span class="text-xl font-bold text-emerald-600"><?= $top['completed_count'] ?></span>
                    <span class="text-xs text-gray-600 block">งานซ่อมเสร็จสิ้น</span>
                </div>
                <div>
                    <span class="text-xl font-bold text-amber-600">⭐ <?= number_format($top['avg_rating'] ?: 5.0, 1) ?></span>
                    <span class="text-xs text-gray-600 block">ดาวความพึงพอใจ</span>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

    <!-- Full Ranking Table -->
    <div class="card overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-4 border-b border-gray-200">
            <h2 class="font-bold text-gray-900 text-base">📊 ตารางเปรียบเทียบผลงานทีมช่างทั้งหมด</h2>
        </div>
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50 text-gray-500 uppercase font-semibold text-xs">
                    <tr>
                        <th class="px-4 py-3 text-left">อันดับ</th>
                        <th class="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                        <th class="px-4 py-3 text-left">ตำแหน่ง/แผนก</th>
                        <th class="px-4 py-3 text-center">งานที่รับมอบหมาย</th>
                        <th class="px-4 py-3 text-center">กำลังซ่อม</th>
                        <th class="px-4 py-3 text-center">ปิดงานแล้ว</th>
                        <th class="px-4 py-3 text-center">อัตราสำเร็จ (%)</th>
                        <th class="px-4 py-3 text-center">คะแนนเฉลี่ย</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    <?php foreach ($techs as $rank => $t): 
                        $rate = $t['total_assigned'] > 0 ? round(($t['completed_count'] / $t['total_assigned']) * 100) : 0;
                    ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 font-bold text-center"><?= $rank + 1 ?></td>
                        <td class="px-4 py-3 font-medium text-gray-900"><?= htmlspecialchars($t['full_name']) ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= htmlspecialchars($t['position'] ?? '-') ?> (<?= htmlspecialchars($t['dept_name'] ?? '-') ?>)</td>
                        <td class="px-4 py-3 text-center font-bold count-up"><?= $t['total_assigned'] ?></td>
                        <td class="px-4 py-3 text-center text-amber-600 font-bold count-up"><?= $t['in_progress_count'] ?></td>
                        <td class="px-4 py-3 text-center text-emerald-600 font-bold count-up"><?= $t['completed_count'] ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="badge badge badge-info"><span class="count-up"><?= $rate ?></span>%</span>
                        </td>
                        <td class="px-4 py-3 text-center font-bold text-amber-500">
                            ⭐ <?= number_format($t['avg_rating'] ?: 5.0, 1) ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
