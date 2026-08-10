<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ตรวจสอบสุขภาพระบบ (System Health Check) - CMMS-TPT';
$pdo = getDb();

// Diagnostic checks
$checks = [];

// 1. MySQL Database Check
try {
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    $checks[] = ['name' => 'ฐานข้อมูล MySQL (Database Connection)', 'status' => 'pass', 'detail' => 'เชื่อมต่อปกติ (' . count($tables) . ' ตาราง)'];
} catch (Exception $e) {
    $checks[] = ['name' => 'ฐานข้อมูล MySQL (Database Connection)', 'status' => 'fail', 'detail' => 'เกิดข้อผิดพลาด: ' . $e->getMessage()];
}

// 2. Upload Directory Permissions Check
$upDir = __DIR__ . '/../../../uploads/repair/';
if (is_dir($upDir) && is_writable($upDir)) {
    $checks[] = ['name' => 'โฟลเดอร์จัดเก็บรูปภาพ/วิดีโอ (Upload Directory)', 'status' => 'pass', 'detail' => 'โฟลเดอร์ uploads/repair/ เขียนไฟล์ได้ปกติ'];
} else {
    $checks[] = ['name' => 'โฟลเดอร์จัดเก็บรูปภาพ/วิดีโอ (Upload Directory)', 'status' => 'warn', 'detail' => 'โฟลเดอร์ uploads/repair/ อาจไม่มีสิทธิ์เขียนไฟล์'];
}

// 3. PHP Extensions Check
$exts = ['curl', 'pdo_mysql', 'mbstring', 'gd', 'json'];
$missingExts = [];
foreach ($exts as $ext) {
    if (!extension_loaded($ext)) $missingExts[] = $ext;
}
if (empty($missingExts)) {
    $checks[] = ['name' => 'PHP Extensions Required', 'status' => 'pass', 'detail' => 'ส่วนขยาย PHP ครบถ้วน (' . implode(', ', $exts) . ')'];
} else {
    $checks[] = ['name' => 'PHP Extensions Required', 'status' => 'warn', 'detail' => 'ขาดส่วนขยาย: ' . implode(', ', $missingExts)];
}

// 4. LINE Integration Callback Check
$lineCallback = getenv('LINE_CALLBACK_URL') ?: 'https://ommatophorous-robert-fortifyingly.ngrok-free.app/line_callback.php';
$checks[] = ['name' => 'LINE OAuth Callback URL', 'status' => 'pass', 'detail' => $lineCallback];

// Disk Usage
$freeSpace = round(disk_free_space("C:") / (1024 * 1024 * 1024), 2);
$totalSpace = round(disk_total_space("C:") / (1024 * 1024 * 1024), 2);

renderHeader();
?>

<div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900">🩺 ตรวจสอบสุขภาพระบบ (System Health Diagnostics)</h1>
            <p class="mt-1 text-sm text-gray-500">รายงานความสมบูรณ์ของฐานข้อมูล เซิร์ฟเวอร์ IIS และการเชื่อมต่อ LINE</p>
        </div>
        <a href="health.php" class="btn btn-secondary">🔄 รีเฟรชสถานะ</a>
    </div>

    <!-- Server Disk Summary -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <span class="text-xs font-bold text-gray-500 block">พื้นที่ว่างฮาร์ดดิสก์ (Drive C:)</span>
            <span class="text-2xl font-extrabold text-brand-600 mt-1 block"><?= $freeSpace ?> GB / <?= $totalSpace ?> GB</span>
        </div>
        <div class="card p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <span class="text-xs font-bold text-gray-500 block">เวอร์ชัน PHP</span>
            <span class="text-2xl font-extrabold text-emerald-600 mt-1 block">PHP <?= phpversion() ?></span>
        </div>
        <div class="card p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <span class="text-xs font-bold text-gray-500 block">Web Server Host</span>
            <span class="text-lg font-bold text-gray-800 mt-1 block truncate"><?= $_SERVER['HTTP_HOST'] ?></span>
        </div>
    </div>

    <!-- Diagnostic Checks Table -->
    <div class="card overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-4 border-b border-gray-200">
            <h2 class="font-bold text-gray-900 text-base">📋 รายงานผลการตรวจสอบ 4 จุดสำคัญ</h2>
        </div>
        <div class="divide-y divide-gray-200">
            <?php foreach ($checks as $c): ?>
            <div class="p-4 flex items-center justify-between">
                <div>
                    <div class="font-bold text-gray-900 text-sm"><?= htmlspecialchars($c['name']) ?></div>
                    <div class="text-xs text-gray-500 mt-0.5"><?= htmlspecialchars($c['detail']) ?></div>
                </div>
                <div>
                    <?php if ($c['status'] === 'pass'): ?>
                    <span class="badge badge badge-success font-bold px-3 py-1 text-xs">🟢 ผ่าน (Pass)</span>
                    <?php elseif ($c['status'] === 'warn'): ?>
                    <span class="badge badge badge-warning font-bold px-3 py-1 text-xs">⚠️ เตือน (Warning)</span>
                    <?php else: ?>
                    <span class="badge badge badge-error font-bold px-3 py-1 text-xs">❌ ไม่ผ่าน (Failed)</span>
                    <?php endif; ?>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
