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
$lineCallback = getenv('LINE_CALLBACK_URL') ?: (function_exists('publicBaseUrl') ? publicBaseUrl() . '/line_callback.php' : '');
$checks[] = ['name' => 'LINE OAuth Callback URL', 'status' => 'pass', 'detail' => $lineCallback];

// Disk Usage
$freeSpace = round(disk_free_space("C:") / (1024 * 1024 * 1024), 2);
$totalSpace = round(disk_total_space("C:") / (1024 * 1024 * 1024), 2);

// ---- ระบบอัตโนมัติ (Watchdog / Tunnel / Backup / Alert) ----
$root = dirname(__DIR__, 3);

// Tunnel URL
$tunnelUrl = '';
$tunnelFile = $root . '/logs/tunnel-url.txt';
if (is_file($tunnelFile)) {
    $tunnelUrl = trim((string)file_get_contents($tunnelFile));
}
$tunnelOk = false;
if ($tunnelUrl !== '' && preg_match('#^https?://#', $tunnelUrl)) {
    try {
        $ch = curl_init($tunnelUrl . '/login');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_NOBODY => true, CURLOPT_FOLLOWLOCATION => true]);
        curl_exec($ch);
        $tunnelOk = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200;
        curl_close($ch);
    } catch (Exception $e) {}
}

// Watchdog last run (parse watchdog.log)
$watchdogLast = '-';
$watchdogLog = $root . '/logs/watchdog.log';
if (is_file($watchdogLog)) {
    $lines = array_filter(explode("\n", (string)file_get_contents($watchdogLog)));
    $last = end($lines);
    if ($last) $watchdogLast = mb_substr(trim($last), 0, 150);
}

// Alert check last run
$alertCheckDate = '-';
$acFile = $root . '/logs/alert_check.date';
if (is_file($acFile)) $alertCheckDate = trim((string)file_get_contents($acFile));

// Backup last run (newest file in backups/)
$backupLast = '-';
$backupDir = $root . '/backups';
if (is_dir($backupDir)) {
    $files = glob($backupDir . '/*');
    if ($files) {
        $newest = array_reduce($files, fn($a, $b) => (filemtime($b) > filemtime($a)) ? $b : $a);
        $backupLast = date('Y-m-d H:i', filemtime($newest)) . ' — ' . basename($newest);
    }
}

// Recent notifications
$recentNotifs = [];
try {
    $recentNotifs = $pdo->query("SELECT channel, status, LEFT(content, 90) AS content, created_at FROM notification_logs ORDER BY id DESC LIMIT 5")->fetchAll();
} catch (Exception $e) {}

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

    <!-- Automation Status -->
    <div class="card overflow-hidden bg-white rounded-lg shadow-sm border border-gray-200">
        <div class="p-4 border-b border-gray-200">
            <h2 class="font-bold text-gray-900 text-base">🤖 ระบบอัตโนมัติ (Watchdog / Tunnel / Backup)</h2>
        </div>
        <div class="divide-y divide-gray-200">
            <div class="p-4 flex items-center justify-between">
                <div>
                    <div class="font-bold text-gray-900 text-sm">Tunnel URL (Cloudflare)</div>
                    <div class="text-xs text-gray-500 mt-0.5 break-all"><?= htmlspecialchars($tunnelUrl ?: 'ยังไม่มี (รัน scripts\tunnel-quick.ps1)') ?></div>
                </div>
                <?php if ($tunnelUrl): ?>
                    <?php if ($tunnelOk): ?>
                        <span class="badge badge badge-success font-bold px-3 py-1 text-xs">🟢 ใช้งานได้</span>
                    <?php else: ?>
                        <span class="badge badge badge-error font-bold px-3 py-1 text-xs">❌ เข้าไม่ได้</span>
                    <?php endif; ?>
                <?php else: ?>
                    <span class="badge badge badge-warning font-bold px-3 py-1 text-xs">⚠️ ไม่ได้ตั้ง</span>
                <?php endif; ?>
            </div>
            <div class="p-4 flex items-center justify-between">
                <div>
                    <div class="font-bold text-gray-900 text-sm">Watchdog (restart อัตโนมัติทุก 1 นาที)</div>
                    <div class="text-xs text-gray-500 mt-0.5"><?= htmlspecialchars($watchdogLast) ?></div>
                </div>
                <span class="badge badge badge-info font-bold px-3 py-1 text-xs">⏱ ตรวจทุกนาที</span>
            </div>
            <div class="p-4 flex items-center justify-between">
                <div>
                    <div class="font-bold text-gray-900 text-sm">แจ้งเตือนอัตโนมัติ (PM + สต็อกต่ำ)</div>
                    <div class="text-xs text-gray-500 mt-0.5">ตรวจครั้งล่าสุด: <?= htmlspecialchars($alertCheckDate) ?> (รันวันละ 1 ครั้ง)</div>
                </div>
                <span class="badge badge badge-info font-bold px-3 py-1 text-xs">📅 รายวัน</span>
            </div>
            <div class="p-4 flex items-center justify-between">
                <div>
                    <div class="font-bold text-gray-900 text-sm">Backup ฐานข้อมูล + uploads</div>
                    <div class="text-xs text-gray-500 mt-0.5">ล่าสุด: <?= htmlspecialchars($backupLast) ?></div>
                </div>
                <span class="badge badge badge-info font-bold px-3 py-1 text-xs">🌙 กลางคืน</span>
            </div>
            <div class="p-4">
                <div class="font-bold text-gray-900 text-sm mb-2">🔔 การแจ้งเตือนล่าสุด (notification_logs)</div>
                <?php if (empty($recentNotifs)): ?>
                    <div class="text-xs text-gray-500">ยังไม่มี log การแจ้งเตือน</div>
                <?php else: ?>
                    <div class="overflow-x-auto">
                        <table class="table table-sm w-full text-xs">
                            <thead><tr class="text-gray-500"><th>เวลา</th><th>ช่องทาง</th><th>สถานะ</th><th>ข้อความ</th></tr></thead>
                            <tbody>
                            <?php foreach ($recentNotifs as $n): ?>
                                <tr>
                                    <td class="whitespace-nowrap"><?= htmlspecialchars($n['created_at']) ?></td>
                                    <td><?= htmlspecialchars($n['channel']) ?></td>
                                    <td>
                                        <?php if ($n['status'] === 'SENT'): ?>
                                            <span class="badge badge-success text-[10px]">ส่งสำเร็จ</span>
                                        <?php elseif ($n['status'] === 'PENDING_CONFIG'): ?>
                                            <span class="badge badge-warning text-[10px]">ยังไม่ตั้ง token</span>
                                        <?php else: ?>
                                            <span class="badge badge-error text-[10px]"><?= htmlspecialchars($n['status']) ?></span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="break-all"><?= htmlspecialchars($n['content']) ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </table>
                    </div>
                <?php endif; ?>
            </div>
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
