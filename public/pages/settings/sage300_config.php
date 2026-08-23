<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
$pageTitle = 'การตั้งค่าและสลับสภาพแวดล้อม Sage 300 (TFPT2C Testing vs TFPT1C Production) - CMMS-TPT';
$pdo = getDb();

$msg = '';
$error = '';
$testResult = null;

// Handle Environment Preset Switcher
if (isset($_POST['switch_env'])) {
    $targetEnv = $_POST['switch_env']; // 'TFPT2C' or 'TFPT1C'
    
    $dsn = $targetEnv;
    $comp = $targetEnv;
    $user = trim($_POST['sage_user'] ?? 'ADMIN');
    $pass = trim($_POST['sage_pass'] ?? 'ADMIN');

    // Update .env file
    $envPath = __DIR__ . '/../../../.env';
    if (file_exists($envPath)) {
        $envContent = file_get_contents($envPath);
        $envContent = preg_replace('/^SAGE300_ODBC_DSN=.*$/m', "SAGE300_ODBC_DSN=$dsn", $envContent);
        $envContent = preg_replace('/^SAGE300_DB_USER=.*$/m', "SAGE300_DB_USER=$user", $envContent);
        $envContent = preg_replace('/^SAGE300_DB_PASS=.*$/m', "SAGE300_DB_PASS=$pass", $envContent);
        $envContent = preg_replace('/^SAGE300_COMPANY_ID=.*$/m', "SAGE300_COMPANY_ID=$comp", $envContent);
        file_put_contents($envPath, $envContent);
    }

    putenv("SAGE300_ODBC_DSN=$dsn");
    putenv("SAGE300_DB_USER=$user");
    putenv("SAGE300_DB_PASS=$pass");
    putenv("SAGE300_COMPANY_ID=$comp");

    $msg = "สลับสภาพแวดล้อมไปยัง DSN: $dsn (" . ($targetEnv === 'TFPT2C' ? 'ตัวทดสอบ Testing' : 'ตัวจริง Production') . ") เรียบร้อยแล้ว!";
}

// Handle Manual Form Save
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_sage_config'])) {
    try {
        $dsn = trim($_POST['sage_dsn']);
        $user = trim($_POST['sage_user']);
        $pass = trim($_POST['sage_pass']);
        $comp = trim($_POST['sage_comp']);

        $envPath = __DIR__ . '/../../../.env';
        if (file_exists($envPath)) {
            $envContent = file_get_contents($envPath);
            $envContent = preg_replace('/^SAGE300_ODBC_DSN=.*$/m', "SAGE300_ODBC_DSN=$dsn", $envContent);
            $envContent = preg_replace('/^SAGE300_DB_USER=.*$/m', "SAGE300_DB_USER=$user", $envContent);
            $envContent = preg_replace('/^SAGE300_DB_PASS=.*$/m', "SAGE300_DB_PASS=$pass", $envContent);
            $envContent = preg_replace('/^SAGE300_COMPANY_ID=.*$/m', "SAGE300_COMPANY_ID=$comp", $envContent);
            file_put_contents($envPath, $envContent);
        }

        putenv("SAGE300_ODBC_DSN=$dsn");
        putenv("SAGE300_DB_USER=$user");
        putenv("SAGE300_DB_PASS=$pass");
        putenv("SAGE300_COMPANY_ID=$comp");

        $msg = 'บันทึกการตั้งค่าการเชื่อมต่อ Sage 300 ODBC DSN เรียบร้อยแล้ว';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Handle Connection Test
if (isset($_POST['test_connection'])) {
    $testResult = Sage300Service::connectOdbc();
}

$dsn = getenv('SAGE300_ODBC_DSN') ?: 'TFPT2C';
$user = getenv('SAGE300_DB_USER') ?: 'sa';
$pass = getenv('SAGE300_DB_PASS') ?: 'sql2u';
$comp = getenv('SAGE300_COMPANY_ID') ?: 'TFPT2C';

$isTestingEnv = ($dsn === 'TFPT2C');

renderHeader();
?>

<div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <?php if ($isTestingEnv): ?>
                <span class="bg-amber-400 text-slate-900 text-xs font-black px-2.5 py-1 rounded-full uppercase">🧪 โหมดทดสอบ (TFPT2C Testing)</span>
                <?php else: ?>
                <span class="bg-emerald-400 text-slate-900 text-xs font-black px-2.5 py-1 rounded-full uppercase">🚀 โหมดใช้งานจริง (TFPT1C Production)</span>
                <?php endif; ?>
                <span class="text-xs text-purple-200">Sage 300 ERP DSN</span>
            </div>
            <h1 class="text-2xl font-black">🔌 การตั้งค่าและสลับสภาพแวดล้อม Sage 300 ERP</h1>
            <p class="text-xs text-purple-100 mt-1">ปัจจุบันเชื่อมต่อ DSN: <strong class="underline font-mono text-white text-sm"><?= htmlspecialchars($dsn) ?></strong> (<?= $isTestingEnv ? 'ก้อนทดสอบ TFPT2C' : 'ก้อนใช้งานจริง TFPT1C' ?>)</p>
        </div>
        <div class="flex gap-2">
            <a href="../spare_parts/sage_sync.php" class="btn bg-amber-400 text-slate-900 font-extrabold text-xs shadow hover:bg-amber-300 gap-1">
                <span>🏷️</span> <span>ตั้งค่าหมวดหมู่อะไหล่ Sage 300 →</span>
            </a>
            <a href="../spare_parts/issue_center.php" class="btn bg-white text-purple-800 font-bold text-xs shadow hover:bg-purple-50">
                📦 ศูนย์เบิก-จ่าย Sage 300
            </a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 font-bold text-sm">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- 1-Click Environment Switcher Buttons -->
    <div class="card p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-bold text-slate-900 text-base border-b pb-2 flex justify-between items-center">
            <span>🎛️ ปุ่มสลับสภาพแวดล้อม 1-Click Sage 300 Environment Switcher:</span>
            <span class="text-xs text-indigo-600 font-bold">Testing ↔ Production</span>
        </h3>

        <form method="POST" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input type="hidden" name="sage_user" value="<?= htmlspecialchars($user) ?>">
            <input type="hidden" name="sage_pass" value="<?= htmlspecialchars($pass) ?>">

            <!-- Option 1: TFPT2C (Testing) -->
            <button type="submit" name="switch_env" value="TFPT2C" class="p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between <?= $isTestingEnv ? 'border-amber-500 bg-amber-50/60 shadow-md ring-2 ring-amber-400/30' : 'border-slate-200 hover:border-amber-300 bg-white' ?>">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-sm font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded">DSN: TFPT2C</span>
                        <?php if ($isTestingEnv): ?>
                        <span class="badge status-active font-extrabold text-xs">✔ ใช้งานอยู่นี้</span>
                        <?php endif; ?>
                    </div>
                    <h4 class="font-extrabold text-slate-900 text-base mt-2">🧪 ฐานข้อมูลสำหรับทดสอบ (TFPT2C Testing)</h4>
                    <p class="text-xs text-slate-500 mt-1">ใช้สำหรับการทดสอบเบิก-จ่ายอะไหล่ ตัดสต็อก และทดสอบกระบวนการทำงานโดยไม่กระทบข้อมูลจริง</p>
                </div>
                <div class="mt-3 text-xs font-bold text-amber-700">กดสลับใช้งาน TFPT2C (ตัวทดสอบ) →</div>
            </button>

            <!-- Option 2: TFPT1C (Production) -->
            <button type="submit" name="switch_env" value="TFPT1C" class="p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between <?= !$isTestingEnv ? 'border-emerald-500 bg-emerald-50/60 shadow-md ring-2 ring-emerald-400/30' : 'border-slate-200 hover:border-emerald-300 bg-white' ?>">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="font-mono text-sm font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">DSN: TFPT1C</span>
                        <?php if (!$isTestingEnv): ?>
                        <span class="badge status-active font-extrabold text-xs">✔ ใช้งานอยู่นี้</span>
                        <?php endif; ?>
                    </div>
                    <h4 class="font-extrabold text-slate-900 text-base mt-2">🚀 ฐานข้อมูลใช้งานจริง (TFPT1C Production)</h4>
                    <p class="text-xs text-slate-500 mt-1">ใช้สำหรับเมื่อพร้อมเปิดใช้งานระบบ CMMS ตัดบัญชีจริงกับระบบ Sage 300 ในการผลิต</p>
                </div>
                <div class="mt-3 text-xs font-bold text-emerald-700">กดสลับใช้งาน TFPT1C (ตัวจริง) →</div>
            </button>
        </form>
    </div>

    <?php if ($testResult): ?>
    <?php if (!empty($testResult['success'])): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-300 font-bold text-sm flex items-center gap-3">
        <span class="text-2xl">🔌</span>
        <div>
            <div class="font-extrabold">ทดสอบการเชื่อมต่อ ODBC DSN (<?= htmlspecialchars($dsn) ?>) สำเร็จเรียบร้อย!</div>
            <div class="text-xs text-emerald-700 font-normal">Driver Mode: <?= htmlspecialchars($testResult['driver'] ?? 'ODBC') ?> | Status: READY FOR TRANSACTION ISSUE & RETURN</div>
        </div>
    </div>
    <?php else: ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-300 font-bold text-sm space-y-1">
        <div class="font-extrabold">❌ ไม่สามารถเชื่อมต่อกับ ODBC DSN (<?= htmlspecialchars($dsn) ?>) ได้</div>
        <div class="text-xs text-rose-700 font-mono font-normal">Error Trace: <?= htmlspecialchars($testResult['error'] ?? 'ODBC DSN Not Found or Login Failed') ?></div>
        <div class="text-xs text-slate-600 pt-1">
            * คำแนะนำ: กรุณาตรวจสอบว่ามี System DSN ชื่อ <strong>"<?= htmlspecialchars($dsn) ?>"</strong> ใน ODBC Data Source Administrator บนเครื่อง Host แล้วหรือยัง
        </div>
    </div>
    <?php endif; ?>
    <?php endif; ?>

    <!-- Config Form -->
    <form method="POST" class="card p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-6">
        <input type="hidden" name="save_sage_config" value="1">

        <h3 class="font-bold text-slate-900 text-base border-b pb-2 flex justify-between items-center">
            <span>⚙️ รายละเอียดพารามิเตอร์ ODBC DSN (<?= htmlspecialchars($dsn) ?>)</span>
            <span class="badge bg-purple-100 text-purple-800 font-bold">DSN: <?= htmlspecialchars($dsn) ?></span>
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-slate-700 block mb-1">ODBC System DSN Name</label>
                <input type="text" name="sage_dsn" value="<?= htmlspecialchars($dsn) ?>" required class="input input-bordered w-full font-mono font-bold">
            </div>

            <div>
                <label class="font-bold text-slate-700 block mb-1">Sage 300 Company Database ID</label>
                <input type="text" name="sage_comp" value="<?= htmlspecialchars($comp) ?>" required class="input input-bordered w-full font-mono font-bold">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-slate-700 block mb-1">Sage 300 DB Username</label>
                <input type="text" name="sage_user" value="<?= htmlspecialchars($user) ?>" required class="input input-bordered w-full font-mono">
            </div>

            <div>
                <label class="font-bold text-slate-700 block mb-1">Sage 300 DB Password</label>
                <input type="password" name="sage_pass" value="<?= htmlspecialchars($pass) ?>" required class="input input-bordered w-full font-mono">
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
