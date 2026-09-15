<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
require_once __DIR__ . '/../../../src/csrf.php';
$pageTitle = 'การตั้งค่าและสลับสภาพแวดล้อม Sage 300 (TFPT2C Testing vs TFPT1C Production) - CMMS-TPT';
$pdo = getDb();

// Phase 18: หน้าเก็บบันทึกการเชื่อมต่อ ERP = เฉพาะ Admin เท่านั้น (เดิมเปิดทุกคนที่ login ได้)
if (empty($_SESSION['user_id']) || (int)($_SESSION['role_id'] ?? 0) !== 1) {
    header('Location: /login.php');
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    enforceCsrf();
}

/** อ่านค่าจาก .env ตรง ๆ (ไม่เปิดเผยผ่าน env ของ process — พิมพ์ค่าจริงเฉพาะชื่อผู้ใช้) */
function sageEnvFromFile(): array {
    $envPath = __DIR__ . '/../../../.env';
    $vals = ['dsn' => '', 'user' => '', 'comp' => ''];
    if (!file_exists($envPath)) return $vals;
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (str_contains($line, '=')) {
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k); $v = trim($v);
            if ($k === 'SAGE300_ODBC_DSN')   $vals['dsn'] = $v;
            if ($k === 'SAGE300_DB_USER')    $vals['user'] = $v;
            if ($k === 'SAGE300_COMPANY_ID') $vals['comp'] = $v;
        }
    }
    return $vals;
}

function sagePersistEnv(array $changes): void {
    $envPath = __DIR__ . '/../../../.env';
    if (!file_exists($envPath)) { file_put_contents($envPath, ''); }
    $envContent = file_get_contents($envPath);
    foreach ($changes as $key => $val) {
        if (preg_match("/^$key=.*$/m", $envContent)) {
            $envContent = preg_replace("/^$key=.*$/m", "$key=" . addcslashes((string)$val, "\\=#") , $envContent);
        } else {
            $envContent = rtrim($envContent) . PHP_EOL . "$key=$val";
        }
        putenv("$key=$val");
    }
    file_put_contents($envPath, $envContent);
}

$msg = '';
$error = '';
$testResult = null;
$envFromFile = sageEnvFromFile();

// Handle Environment Preset Switcher — สลับเฉพาะ DSN/Company ไม่แตะ user/password ที่ตั้งไว้
if (isset($_POST['switch_env'])) {
    $targetEnv = $_POST['switch_env'];
    if (!in_array($targetEnv, ['TFPT2C', 'TFPT1C'], true)) {
        $error = 'ค่าสภาพแวดล้อมไม่ถูกต้อง';
    } else {
        try {
            $changes = ['SAGE300_ODBC_DSN' => $targetEnv, 'SAGE300_COMPANY_ID' => $targetEnv];
            sagePersistEnv($changes);
            $envFromFile['dsn'] = $targetEnv;
            $envFromFile['comp'] = $targetEnv;
            $msg = "สลับสภาพแวดล้อมไปยัง DSN: $targetEnv (" . ($targetEnv === 'TFPT2C' ? 'ตัวทดสอบ Testing' : 'ตัวจริง Production') . ") เรียบร้อยแล้ว!";
        } catch (Exception $e) {
            $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
        }
    }
}

// Handle Manual Form Save — ฟิลด์รหัสผ่านว่าง/เป็น mask = เก็บค่าเดิมไว้ (ไม่เขียนทับ)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_sage_config'])) {
    try {
        $changes = ['SAGE300_ODBC_DSN' => trim($_POST['sage_dsn'] ?? ''), 'SAGE300_COMPANY_ID' => trim($_POST['sage_comp'] ?? '')];
        $newUser = trim($_POST['sage_user'] ?? '');
        $newPass = (string)($_POST['sage_pass'] ?? '');
        if ($newUser !== '') $changes['SAGE300_DB_USER'] = $newUser;
        if ($newPass !== '' && $newPass !== "••••••••") $changes['SAGE300_DB_PASS'] = $newPass; // mask/ว่าง = ไม่เปลี่ยน
        sagePersistEnv($changes);
        $envFromFile = sageEnvFromFile();
        $msg = 'บันทึกการตั้งค่าการเชื่อมต่อ Sage 300 ODBC DSN เรียบร้อยแล้ว';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Handle Connection Test
if (isset($_POST['test_connection'])) {
    $testResult = Sage300Service::connectOdbc();
}

// ค่าที่ใช้แสดง: จาก .env เท่านั้น — ไม่มีค่า default ฮาร์ดโค้ด (ลบ 'sa'/'sql2u' เดิมแล้ว)
$dsn = $envFromFile['dsn'] !== '' ? $envFromFile['dsn'] : (getenv('SAGE300_ODBC_DSN') ?: 'TFPT2C');
$user = $envFromFile['user'] !== '' ? $envFromFile['user'] : (getenv('SAGE300_DB_USER') ?: '');
$comp = $envFromFile['comp'] !== '' ? $envFromFile['comp'] : (getenv('SAGE300_COMPANY_ID') ?: $dsn);
$pass = ''; // ห้ามนำรหัสผ่านจริงมาแสดง/ฝังใน HTML

$isTestingEnv = ($dsn === 'TFPT2C');

renderHeader();
?>

<div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <?php if ($isTestingEnv): ?>
                <span class="bg-amber-400 text-primary text-xs font-black px-2.5 py-1 rounded-full uppercase">🧪 โหมดทดสอบ (TFPT2C Testing)</span>
                <?php else: ?>
                <span class="bg-emerald-400 text-primary text-xs font-black px-2.5 py-1 rounded-full uppercase">🚀 โหมดใช้งานจริง (TFPT1C Production)</span>
                <?php endif; ?>
                <span class="text-xs text-purple-200">Sage 300 ERP DSN</span>
            </div>
            <h1 class="text-2xl font-black">🔌 การตั้งค่าและสลับสภาพแวดล้อม Sage 300 ERP</h1>
            <p class="text-xs text-purple-100 mt-1">ปัจจุบันเชื่อมต่อ DSN: <strong class="underline font-mono text-white text-sm"><?= htmlspecialchars($dsn) ?></strong> (<?= $isTestingEnv ? 'ก้อนทดสอบ TFPT2C' : 'ก้อนใช้งานจริง TFPT1C' ?>)</p>
        </div>
        <div class="flex gap-2">
            <a href="../spare_parts/sage_sync.php" class="btn bg-amber-400 text-primary font-extrabold text-xs shadow hover:bg-amber-300 gap-1">
                <span>🏷️</span> <span>ตั้งค่าหมวดหมู่อะไหล่ Sage 300 →</span>
            </a>
            <a href="../spare_parts/issue_center.php" class="card btn text-purple-800 font-bold text-xs shadow hover:bg-purple-50">
                📦 ศูนย์เบิก-จ่าย Sage 300
            </a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="cmms-banner success p-4 rounded-xl border font-bold text-sm">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="cmms-banner error p-4 rounded-xl border font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- 1-Click Environment Switcher Buttons -->
    <div class="card p-6 space-y-4">
        <h3 class="font-bold text-primary text-base border-b pb-2 flex justify-between items-center">
            <span>🎛️ ปุ่มสลับสภาพแวดล้อม 1-Click Sage 300 Environment Switcher:</span>
            <span class="text-xs text-indigo-600 font-bold">Testing ↔ Production</span>
        </h3>

        <form method="POST" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <?= csrfField() ?>
            <!-- สลับสภาพแวดล้อมไม่ต้องรับ user/password อีกต่อไป (เก็บเครดิตเดิมใน .env) -->

            <!-- Option 1: TFPT2C (Testing) -->
            <button type="submit" name="switch_env" value="TFPT2C" class="card p-4 border-2 text-left transition-all flex flex-col justify-between <?= $isTestingEnv ? 'border-amber-500 bg-amber-50/60 shadow-md ring-2 ring-amber-400/30' : ' hover:border-amber-300 ' ?>">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-sm font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded">DSN: TFPT2C</span>
                        <?php if ($isTestingEnv): ?>
                        <span class="badge status-active font-extrabold text-xs">✔ ใช้งานอยู่นี้</span>
                        <?php endif; ?>
                    </div>
                    <h4 class="font-extrabold text-primary text-base mt-2">🧪 ฐานข้อมูลสำหรับทดสอบ (TFPT2C Testing)</h4>
                    <p class="text-xs text-muted mt-1">ใช้สำหรับการทดสอบเบิก-จ่ายอะไหล่ ตัดสต็อก และทดสอบกระบวนการทำงานโดยไม่กระทบข้อมูลจริง</p>
                </div>
                <div class="mt-3 text-xs font-bold text-amber-700">กดสลับใช้งาน TFPT2C (ตัวทดสอบ) →</div>
            </button>

            <!-- Option 2: TFPT1C (Production) -->
            <button type="submit" name="switch_env" value="TFPT1C" class="card p-4 border-2 text-left transition-all flex flex-col justify-between <?= !$isTestingEnv ? 'border-emerald-500 bg-emerald-50/60 shadow-md ring-2 ring-emerald-400/30' : ' hover:border-emerald-300 ' ?>">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-sm font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">DSN: TFPT1C</span>
                        <?php if (!$isTestingEnv): ?>
                        <span class="badge status-active font-extrabold text-xs">✔ ใช้งานอยู่นี้</span>
                        <?php endif; ?>
                    </div>
                    <h4 class="font-extrabold text-primary text-base mt-2">🚀 ฐานข้อมูลใช้งานจริง (TFPT1C Production)</h4>
                    <p class="text-xs text-muted mt-1">ใช้สำหรับเมื่อพร้อมเปิดใช้งานระบบ CMMS ตัดบัญชีจริงกับระบบ Sage 300 ในการผลิต</p>
                </div>
                <div class="mt-3 text-xs font-bold text-emerald-700">กดสลับใช้งาน TFPT1C (ตัวจริง) →</div>
            </button>
        </form>
    </div>

    <?php if ($testResult): ?>
    <?php if (!empty($testResult['success'])): ?>
    <div class="cmms-banner success p-4 rounded-xl border font-bold text-sm flex items-center gap-3">
        <span class="text-2xl">🔌</span>
        <div>
            <div class="font-extrabold">ทดสอบการเชื่อมต่อ ODBC DSN (<?= htmlspecialchars($dsn) ?>) สำเร็จเรียบร้อย!</div>
            <div class="text-xs text-emerald-700 font-normal">Driver Mode: <?= htmlspecialchars($testResult['driver'] ?? 'ODBC') ?> | Status: READY FOR TRANSACTION ISSUE & RETURN</div>
        </div>
    </div>
    <?php else: ?>
    <div class="cmms-banner error p-4 rounded-xl border font-bold text-sm space-y-1">
        <div class="font-extrabold">❌ ไม่สามารถเชื่อมต่อกับ ODBC DSN (<?= htmlspecialchars($dsn) ?>) ได้</div>
        <div class="text-xs text-rose-700 font-mono font-normal">Error Trace: <?= htmlspecialchars($testResult['error'] ?? 'ODBC DSN Not Found or Login Failed') ?></div>
        <div class="text-xs text-secondary pt-1">
            * คำแนะนำ: กรุณาตรวจสอบว่ามี System DSN ชื่อ <strong>"<?= htmlspecialchars($dsn) ?>"</strong> ใน ODBC Data Source Administrator บนเครื่อง Host แล้วหรือยัง
        </div>
    </div>
    <?php endif; ?>
    <?php endif; ?>

    <!-- Config Form -->
    <form method="POST" class="card p-6 space-y-6">
        <input type="hidden" name="save_sage_config" value="1">
        <?= csrfField() ?>

        <h3 class="font-bold text-primary text-base border-b pb-2 flex justify-between items-center">
            <span>⚙️ รายละเอียดพารามิเตอร์ ODBC DSN (<?= htmlspecialchars($dsn) ?>)</span>
            <span class="badge bg-purple-100 text-purple-800 font-bold">DSN: <?= htmlspecialchars($dsn) ?></span>
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-secondary block mb-1">ODBC System DSN Name</label>
                <input type="text" name="sage_dsn" value="<?= htmlspecialchars($dsn) ?>" required class="input input-bordered w-full font-mono font-bold">
            </div>

            <div>
                <label class="font-bold text-secondary block mb-1">Sage 300 Company Database ID</label>
                <input type="text" name="sage_comp" value="<?= htmlspecialchars($comp) ?>" required class="input input-bordered w-full font-mono font-bold">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-secondary block mb-1">Sage 300 DB Username</label>
                <input type="text" name="sage_user" value="<?= htmlspecialchars($user) ?>" class="input input-bordered w-full font-mono">
            </div>

            <div>
                <label class="font-bold text-secondary block mb-1">Sage 300 DB Password <span class="text-muted font-normal">(เว้นว่าง = เก็บค่าเดิม)</span></label>
                <input type="password" name="sage_pass" value="<?= $pass !== '' ? htmlspecialchars("••••••••") : '' ?>" autocomplete="new-password" class="input input-bordered w-full font-mono">
            </div>
        </div>

        <!-- Submit Buttons -->
        <div class="pt-3 flex justify-between items-center flex-wrap gap-2">
            <button type="submit" name="test_connection" value="1" class="btn btn-secondary text-xs text-purple-700 border-purple-300 font-bold">
                🔌 กดทดสอบการเชื่อมต่อ ODBC DSN (Test Connection)
            </button>

            <button type="submit" class="btn btn-primary text-xs bg-purple-700 border-purple-700 hover:bg-purple-800">
                💾 บันทึกการตั้งค่า Sage 300 ODBC DSN
            </button>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
