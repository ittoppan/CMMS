<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ศูนย์รวมตั้งค่าเปิด-ปิดฟีเจอร์และโมดูลทั้งหมด (Master Module Feature Switcher) - CMMS-TPT';
$pdo = getDb();

$msg = '';
$msgType = '';

// All Modules Master Register
$allModules = [
    'General & Workflows' => [
        'feature_line_approval'   => ['label' => '📩 ระบบอนุมัติ 1-Click ผ่าน LINE & Email', 'desc' => 'ส่งการ์ดอนุมัติใบสั่งซ่อม ใบอนุญาต LOTO และการเบิกอะไหล่เข้า LINE'],
        'feature_sage_sync'       => ['label' => '📦 ระบบเชื่อมต่อคลังอะไหล่ Sage 300 ERP', 'desc' => 'ซิงค์ข้อมูลไอเทมและตัดสต็อก Sage 300 IC อัตโนมัติ'],
        'feature_spare_images'    => ['label' => '🖼️ ระบบรูปภาพอะไหล่ Visual Thumbnails', 'desc' => 'แสดงรูปภาพประกอบในคลังสต็อกและหน้าเบิก-จ่าย'],
        'feature_smart_rules'     => ['label' => '🧠 ศูนย์ตั้งค่าเงื่อนไขอัจฉริยะ & ราคาอนุมัติ', 'desc' => 'กำหนดวงเงินเบิกอะไหล่และเกณฑ์ Downtime 5-Why'],
        'feature_pwa'             => ['label' => '📱 ระบบ Progressive Web App (PWA)', 'desc' => 'รองรับการติดตั้งแอป CMMS ลงบนสมาร์ตโฟน'],
    ],
    'Maintenance & Operations' => [
        'feature_shift_handover'  => ['label' => '🔄 ระบบส่งมอบงานระหว่างกะช่าง & Sign-off', 'desc' => 'สรุปงานค้างซ่อมส่งมอบเข้า LINE กะถัดไปพร้อมปุ่มเซ็นรับกะ'],
        'feature_plant_map'       => ['label' => '🏭 แผนผังโรงงาน 2D (Interactive Plant Map)', 'desc' => 'แสดงตำแหน่งและไฟสีสถานะเครื่องจักร Real-time'],
        'feature_supplier_rating' => ['label' => '📊 ระบบประเมินเกรดผู้จำหน่ายอะไหล่ (Vendor Rating)', 'desc' => 'คำนวณเกรด A/B/C ผู้ขายจาก lead time และคุณภาพ'],
        'feature_esg_carbon'      => ['label' => '📈 พลังงานสูญเสีย & คาร์บอนฟุตพริ้นท์ (ESG Carbon)', 'desc' => 'คำนวณค่าคาร์บอนและพลังงานที่เสียไปช่วง Downtime'],
        'feature_sop_chatbot'     => ['label' => '🤖 AI Chatbot ตอบคู่มือการซ่อมบำรุง 24 ชม.', 'desc' => 'ผู้ช่วยตอบวิธีแก้ไข Error Code และขั้นตอนซ่อม'],
    ],
    'Safety, IoT & Advanced' => [
        'feature_calibration'     => ['label' => '📐 ระบบสอบเทียบเครื่องมือวัด (Calibration)', 'desc' => 'ทะเบียนและปฏิทินนัดสอบเทียบเครื่องมือวัด'],
        'feature_borrowing'       => ['label' => '🛠️ ระบบยืม-คืนเครื่องมือช่าง (Tool Borrowing)', 'desc' => 'เบิกยืมและติดตามการคืนเครื่องมือช่าง'],
        'feature_work_permits'    => ['label' => '🛡️ ระบบใบอนุญาตทำงานความปลอดภัย LOTO', 'desc' => 'ออกเอกสาร Work Permit และ LOTO'],
        'feature_iot_monitor'     => ['label' => '⚡ ระบบติดตามเซ็นเซอร์ IoT (IoT Sensor)', 'desc' => 'ตรวจวัดอุณหภูมิและความสั่นสะเทือน Real-time'],
        'feature_predictive'      => ['label' => '🔮 ระบบ AI Predictive Maintenance', 'desc' => 'ทำนายโอกาสการเกิดเครื่องจักรชำรุดล่วงหน้า'],
    ],
    'Users, Reports & Integration' => [
        'feature_skill_matrix'    => ['label' => '👷 ระบบ Skill Matrix ทักษะช่าง', 'desc' => 'ประเมินระดับทักษะความสามารถของช่างซ่อมบำรุง'],
        'feature_executive_pdf'   => ['label' => '📄 รายงาน PDF สรุปผู้บริหารประจำเดือน', 'desc' => 'ออกรายงาน PDF สรุป OEE, MTBF, MTTR และงบประมาณ'],
        'feature_line_richmenu'   => ['label' => '📱 ตั้งค่า LINE Official Account Rich Menu', 'desc' => 'เชื่อมต่อเมนูลัด 6 ช่องบนแอป LINE'],
        'feature_line_binding'    => ['label' => '📲 ผูกบัญชี LINE (LINE Account Binding)', 'desc' => 'ลงทะเบียนสแกน QR Code ผูก LINE ID'],
        'feature_user_permissions'=> ['label' => '🔐 ระบบ Granular Permission Matrix', 'desc' => 'ตารางกำหนดสิทธิ์ละเอียด 56 รายการแยกตามบทบาท'],
    ]
];

// Handle Form Submission: Save Feature Switches
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_switches'])) {
    try {
        foreach ($allModules as $group => $modules) {
            foreach ($modules as $key => $meta) {
                $enabled = isset($_POST['switches'][$key]) ? '1' : '0';
                $pdo->prepare("
                    INSERT INTO settings (setting_key, setting_value, setting_group, description)
                    VALUES (?, ?, 'FeatureSwitches', ?)
                    ON DUPLICATE KEY UPDATE setting_value = ?
                ")->execute([$key, $enabled, $meta['label'], $enabled]);
            }
        }
        $msg = 'บันทึกการตั้งค่าเปิด-ปิดฟีเจอร์ระบบเรียบร้อยแล้ว!';
        $msgType = 'success';
    } catch (Exception $e) {
        $msg = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
        $msgType = 'error';
    }
}

// Fetch Current Settings
$currentSwitches = $pdo->query("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'feature_%'")->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

renderHeader();
?>

<div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-slate-700">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-bold px-2.5 py-1 rounded-full uppercase">System Control Center</span>
                <span class="text-xs text-slate-300">Master Module Feature Switcher</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="sliders-horizontal" class="w-7 h-7 text-indigo-400"></i>
                <span>ศูนย์ตั้งค่าเปิด-ปิดโมดูลระบบทั้งหมด (Module Feature Switcher)</span>
            </h1>
            <p class="text-xs text-slate-300 mt-1">สามารถเลือกเปิดใช้งาน (ON) หรือปิดซ่อน (OFF) แต่ละโมดูลและฟีเจอร์ในระบบได้อย่างอิสระ เมนูที่ถูกปิดจะซ่อนจาก Sidebar โดยอัตโนมัติ</p>
        </div>
        <div class="flex gap-2">
            <a href="index.php" class="btn bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold">
                &larr; กลับหน้าตั้งค่า
            </a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 <?= $msgType === 'success' ? 'cmms-banner success' : 'cmms-banner error' ?> font-bold rounded-xl border text-xs flex items-center gap-2">
        <i data-lucide="<?= $msgType === 'success' ? 'check-circle' : 'alert-circle' ?>" class="w-4 h-4"></i>
        <span><?= htmlspecialchars($msg) ?></span>
    </div>
    <?php endif; ?>

    <form method="POST" class="space-y-6">
        <input type="hidden" name="save_switches" value="1">

        <?php foreach ($allModules as $groupTitle => $modules): ?>
        <div class="card p-6 space-y-4">
            <h3 class="font-extrabold text-slate-900 text-base border-b pb-3 flex items-center justify-between">
                <span>📁 <?= htmlspecialchars($groupTitle) ?></span>
                <span class="text-xs font-bold text-slate-400"><?= count($modules) ?> Modules</span>
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <?php foreach ($modules as $key => $meta): 
                    $isEnabled = !isset($currentSwitches[$key]) || $currentSwitches[$key] !== '0';
                ?>
                <div class="p-4 rounded-xl border transition-all flex items-start justify-between gap-3 <?= $isEnabled ? 'bg-indigo-50/40 border-indigo-200' : 'bg-slate-50 border-slate-200 opacity-60' ?>">
                    <div class="space-y-1">
                        <label for="switch-<?= $key ?>" class="font-bold text-slate-900 text-xs cursor-pointer block">
                            <?= htmlspecialchars($meta['label']) ?>
                        </label>
                        <p class="text-[11px] text-slate-500 leading-normal"><?= htmlspecialchars($meta['desc']) ?></p>
                    </div>

                    <!-- Custom Toggle Switch -->
                    <label class="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                        <input type="checkbox" id="switch-<?= $key ?>" name="switches[<?= $key ?>]" value="1" <?= $isEnabled ? 'checked' : '' ?> class="sr-only peer">
                        <div class="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endforeach; ?>

        <!-- Floating Submit Bar -->
        <div class="sticky bottom-4 bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between flex-wrap gap-3">
            <span class="text-xs text-slate-300 font-medium">💡 คำแนะนำ: เมื่อกดบันทึก เมนูย่อยของฟีเจอร์ที่ถูกปิด (OFF) จะถูกซ่อนจากแถบเมนูข้างโดยอัตโนมัติ</span>
            <button type="submit" class="btn btn-primary bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg gap-2">
                <i data-lucide="save" class="w-4 h-4"></i>
                <span>💾 บันทึกการตั้งค่าเปิด-ปิดฟีเจอร์</span>
            </button>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
