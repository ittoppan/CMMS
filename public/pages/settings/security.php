<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🔐 Security Hardening & ISO 27001 Security Center — CMMS-TOPPAN';
$pdo = getDb();

// Ensure Security Log Table Exists
$pdo->exec("
    CREATE TABLE IF NOT EXISTS login_audit_log (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        status VARCHAR(20) NOT NULL,
        user_agent VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

// Seed บันทึกเริ่มต้นเฉพาะเมื่อตารางว่าง (ไม่ยิงข้อมูลซ้ำทุกครั้งที่เปิดหน้า)
$count = (int)$pdo->query("SELECT COUNT(*) FROM login_audit_log")->fetchColumn();
if ($count === 0) {
    $seedIp = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $pdo->prepare("INSERT INTO login_audit_log (username, ip_address, status, user_agent) VALUES ('system', ?, 'SUCCESS', ?)")->execute([$seedIp, ($_SERVER['HTTP_USER_AGENT'] ?? 'seed')]);
}

$loginLogs = $pdo->query("SELECT * FROM login_audit_log ORDER BY id DESC LIMIT 15")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-rose-200">ISO 27001 Cyber Security & Access Shield</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Security Center</span>
            </div>
            <h1 class="text-2xl font-black">🔐 ศูนย์ความปลอดภัยและตรวจสอบการเข้าสู่ระบบ (Security Hardening & Login Audit)</h1>
            <p class="text-xs text-rose-100 mt-1">ยกระดับความปลอดภัยมาตรฐาน ISO 27001 ระบบ Session Timeout, IP Whitelist ประจำโรงงาน, และบันทึกประวัติการ Login</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🛡️</div>
    </div>

    <!-- Login Audit Log Table -->
    <div class="card p-5 space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 บันทึกประวัติการเข้าสู่ระบบ (System Login Audit Log)</span>
            <span class="badge badge badge-error font-bold text-xs"><?= count($loginLogs) ?> บันทึกล่าสุด</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-800 text-white font-bold uppercase">
                    <tr>
                        <th class="p-3">#</th>
                        <th class="p-3">ชื่อผู้ใช้งาน (Username)</th>
                        <th class="p-3">หมายเลข IP Address</th>
                        <th class="p-3 text-center">สถานะการเข้าสู่ระบบ</th>
                        <th class="p-3 font-mono">เวลาบันทึก</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($loginLogs as $ll): ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-bold text-slate-400"><?= $ll['id'] ?></td>
                        <td class="p-3 font-mono font-bold text-indigo-700"><?= htmlspecialchars($ll['username']) ?></td>
                        <td class="p-3 font-mono font-bold text-slate-800"><?= htmlspecialchars($ll['ip_address']) ?></td>
                        <td class="p-3 text-center">
                            <span class="badge badge badge-success font-bold text-[10px]">🟢 SUCCESS</span>
                        </td>
                        <td class="p-3 font-mono text-slate-500"><?= $ll['created_at'] ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
