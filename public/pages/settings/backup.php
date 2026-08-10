<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = __t('backup') . ' - CMMS-TPT';
$pdo = getDb();

$backupDir = __DIR__ . '/../../../backups';
if (!file_exists($backupDir)) {
    mkdir($backupDir, 0777, true);
}

$msg = '';
$error = '';

// Handle manual backup trigger
if (isset($_GET['action']) && $_GET['action'] === 'create') {
    try {
        $filename = 'backup_cmms_tpt_' . date('Y-m-d_H-i-s') . '.sql';
        $filePath = $backupDir . '/' . $filename;

        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $sqlDump = "-- CMMS-TPT Database Dump\n-- Generated: " . date('Y-m-d H:i:s') . "\n\nSET FOREIGN_KEY_CHECKS=0;\n\n";

        foreach ($tables as $table) {
            $createTable = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_ASSOC);
            $sqlDump .= "DROP TABLE IF EXISTS `$table`;\n";
            $sqlDump .= $createTable['Create Table'] . ";\n\n";

            $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                $cols = array_map(fn($c) => "`$c`", array_keys($row));
                $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote($v), array_values($row));
                $sqlDump .= "INSERT INTO `$table` (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ");\n";
            }
            $sqlDump .= "\n";
        }
        $sqlDump .= "SET FOREIGN_KEY_CHECKS=1;\n";

        file_put_contents($filePath, $sqlDump);
        $msg = "สำรองข้อมูลสำเร็จ! ไฟล์: $filename";
    } catch (Exception $e) {
        $error = "เกิดข้อผิดพลาด: " . $e->getMessage();
    }
}

// Fetch existing backups
$files = glob($backupDir . '/*.sql');
rsort($files);

renderHeader();
?>

<div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">💾 <?= __t('backup') ?> (Database Backup & Disaster Recovery)</h1>
            <p class="mt-1 text-sm text-gray-500">สำรองและกู้คืนข้อมูลฐานข้อมูล MySQL ของระบบ CMMS-TPT</p>
        </div>
        <a href="backup.php?action=create" class="btn btn-primary">⚡ สำรองข้อมูลทันที (Backup Now)</a>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-medium">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 font-medium">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- Backup List Table -->
    <div class="card overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-4 border-b border-gray-200">
            <h2 class="font-bold text-gray-900 text-base">📁 ไฟล์สำรองข้อมูลทั้งหมด (Backup Files History)</h2>
        </div>
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50 text-gray-500 uppercase font-semibold text-xs">
                    <tr>
                        <th class="px-4 py-3 text-left">ชื่อไฟล์ .sql</th>
                        <th class="px-4 py-3 text-left">วันที่สำรอง</th>
                        <th class="px-4 py-3 text-left">ขนาดไฟล์</th>
                        <th class="px-4 py-3 text-center">ดาวน์โหลด</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    <?php foreach ($files as $f): 
                        $bName = basename($f);
                        $fSize = round(filesize($f) / 1024, 2);
                        $fDate = date('d/m/Y H:i:s', filemtime($f));
                    ?>
                    <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 font-mono font-bold text-brand-600"><?= htmlspecialchars($bName) ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= $fDate ?></td>
                        <td class="px-4 py-3 text-gray-600"><?= $fSize ?> KB</td>
                        <td class="px-4 py-3 text-center">
                            <a href="/backups/<?= urlencode($bName) ?>" download class="btn btn-secondary btn-sm">⬇️ Download SQL</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($files)): ?>
                    <tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">ยังไม่มีไฟล์สำรองข้อมูล (กดปุ่มสำรองข้อมูลทันทีเพื่อเริ่มสร้าง)</td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
