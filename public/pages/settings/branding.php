<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ศูนย์ควบคุมและตั้งค่าภาพลักษณ์ระบบ 360 (Ultimate Master Configuration Suite) - CMMS-TPT';
$pdo = getDb();

// Helper to get setting
function getSettingVal($pdo, $key, $default = '') {
    $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = ?");
    $stmt->execute([$key]);
    $res = $stmt->fetchColumn();
    return $res !== false ? $res : $default;
}

// Helper to save setting
function saveSettingVal($pdo, $key, $val, $group = 'general') {
    $chk = $pdo->prepare("SELECT id FROM settings WHERE setting_key = ?");
    $chk->execute([$key]);
    if ($chk->fetch()) {
        $pdo->prepare("UPDATE settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?")->execute([$val, $key]);
    } else {
        $pdo->prepare("INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)")->execute([$key, $val, $group]);
    }
}

// Helper to handle image uploads
function handleImageUpload($fileKey, $prefix, $pdo) {
    if (isset($_FILES[$fileKey]) && $_FILES[$fileKey]['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES[$fileKey];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'];
        if (!in_array($ext, $allowed)) {
            throw new Exception("รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, SVG, WEBP, ICO) เท่านั้น");
        }

        $targetDir = __DIR__ . '/../../../uploads/branding/';
        $publicDir = __DIR__ . '/../../../public/uploads/branding/';
        if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);
        if (!is_dir($publicDir)) mkdir($publicDir, 0777, true);

        $fileName = $prefix . '_' . time() . '.' . $ext;
        $targetPath = $targetDir . $fileName;
        $publicPath = $publicDir . $fileName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            @copy($targetPath, $publicPath);
            saveSettingVal($pdo, $fileKey, 'uploads/branding/' . $fileName);
        }
    }
}

$msg = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        // Module 1: Corporate Identity & Details
        saveSettingVal($pdo, 'app_name', trim($_POST['app_name'] ?? 'CMMS-TPT'));
        saveSettingVal($pdo, 'company_name', trim($_POST['company_name'] ?? 'บริษัท ไทยปาร์คเกอร์ไรซิ่ง จำกัด (TPT)'));
        saveSettingVal($pdo, 'company_tagline', trim($_POST['company_tagline'] ?? 'ระบบบริหารจัดการงานซ่อมบำรุงรักษาและคลังอะไหล่อุตสาหกรรม'));
        saveSettingVal($pdo, 'company_address', trim($_POST['company_address'] ?? ''));
        saveSettingVal($pdo, 'company_phone', trim($_POST['company_phone'] ?? ''));
        saveSettingVal($pdo, 'company_tax_id', trim($_POST['company_tax_id'] ?? ''));

        // Module 2: Color Palette & Typography
        saveSettingVal($pdo, 'theme_preset', $_POST['theme_preset'] ?? 'indigo');
        saveSettingVal($pdo, 'theme_primary_hex', trim($_POST['theme_primary_hex'] ?? '#4f46e5'));
        saveSettingVal($pdo, 'theme_secondary_hex', trim($_POST['theme_secondary_hex'] ?? '#10b981'));
        saveSettingVal($pdo, 'theme_font_family', $_POST['theme_font_family'] ?? 'Sarabun');
        saveSettingVal($pdo, 'border_radius_style', $_POST['border_radius_style'] ?? 'rounded-xl');
        saveSettingVal($pdo, 'sidebar_style', $_POST['sidebar_style'] ?? 'dark_slate');
        saveSettingVal($pdo, 'topbar_style', $_POST['topbar_style'] ?? 'clean_white');
        saveSettingVal($pdo, 'logo_position', $_POST['logo_position'] ?? 'both');

        // Module 3: ISO Forms & Report Printing
        saveSettingVal($pdo, 'iso_header_title', trim($_POST['iso_header_title'] ?? ''));
        saveSettingVal($pdo, 'iso_footer_note', trim($_POST['iso_footer_note'] ?? ''));
        saveSettingVal($pdo, 'iso_form_code_prefix', trim($_POST['iso_form_code_prefix'] ?? 'F-EN-03'));
        saveSettingVal($pdo, 'iso_watermark_enabled', $_POST['iso_watermark_enabled'] ?? '1');

        // Module 4: Login Screen Setup
        saveSettingVal($pdo, 'login_welcome_text', trim($_POST['login_welcome_text'] ?? ''));
        saveSettingVal($pdo, 'login_notice_text', trim($_POST['login_notice_text'] ?? ''));
        saveSettingVal($pdo, 'login_card_position', $_POST['login_card_position'] ?? 'center');

        // Module 5: Notifications & Audio
        saveSettingVal($pdo, 'line_notify_enabled', $_POST['line_notify_enabled'] ?? '1');
        saveSettingVal($pdo, 'email_notify_enabled', $_POST['email_notify_enabled'] ?? '0');
        saveSettingVal($pdo, 'notification_sound', $_POST['notification_sound'] ?? 'chime');

        // Module 6: Security & Policy
        saveSettingVal($pdo, 'session_timeout_mins', $_POST['session_timeout_mins'] ?? '60');
        saveSettingVal($pdo, 'max_login_attempts', $_POST['max_login_attempts'] ?? '5');
        saveSettingVal($pdo, 'demo_login_enabled', $_POST['demo_login_enabled'] ?? '1');

        // Module 7: Work Order & Labor Policy
        saveSettingVal($pdo, 'standard_labor_rate', (float)($_POST['standard_labor_rate'] ?? 250.00));
        saveSettingVal($pdo, 'work_hours_per_day', (float)($_POST['work_hours_per_day'] ?? 8.0));
        saveSettingVal($pdo, 'require_root_cause', $_POST['require_root_cause'] ?? '1');

        // Module 8: Spare Parts & Store Policy
        saveSettingVal($pdo, 'spare_require_approval', $_POST['spare_require_approval'] ?? '1');
        saveSettingVal($pdo, 'auto_sage_sync', $_POST['auto_sage_sync'] ?? '1');
        saveSettingVal($pdo, 'default_warehouse', $_POST['default_warehouse'] ?? 'TPTSUP');

        // Module 9: Feature Module Toggles
        saveSettingVal($pdo, 'enable_machine_bom', $_POST['enable_machine_bom'] ?? '1');
        saveSettingVal($pdo, 'enable_mtbf_analytics', $_POST['enable_mtbf_analytics'] ?? '1');
        saveSettingVal($pdo, 'enable_borrowing', $_POST['enable_borrowing'] ?? '1');
        saveSettingVal($pdo, 'enable_leaderboard', $_POST['enable_leaderboard'] ?? '1');

        // Module 10: System Defaults & Maintenance
        saveSettingVal($pdo, 'system_currency', $_POST['system_currency'] ?? '฿ THB');
        saveSettingVal($pdo, 'date_format', $_POST['date_format'] ?? 'd/m/Y');
        saveSettingVal($pdo, 'system_mode', $_POST['system_mode'] ?? 'online');

        // Image Upload Handlers
        handleImageUpload('company_logo', 'logo_main', $pdo);
        handleImageUpload('company_logo_dark', 'logo_dark', $pdo);
        handleImageUpload('favicon_icon', 'favicon', $pdo);
        handleImageUpload('login_bg_image', 'login_bg', $pdo);
        handleImageUpload('iso_stamp_image', 'iso_stamp', $pdo);

        $msg = '🎉 บันทึกการตั้งค่าทั้ง 10 หมวดหมู่ของระบบ CMMS-TPT เรียบร้อยสมบูรณ์แล้ว!';
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Load All Settings Values
$appName = getSettingVal($pdo, 'app_name', 'CMMS-TPT');
$companyName = getSettingVal($pdo, 'company_name', 'บริษัท ไทยปาร์คเกอร์ไรซิ่ง จำกัด (TPT)');
$companyTagline = getSettingVal($pdo, 'company_tagline', 'ระบบบริหารจัดการงานซ่อมบำรุงรักษาและคลังอะไหล่อุตสาหกรรม');
$companyAddress = getSettingVal($pdo, 'company_address', '123 ถนนวิภาวดีรังสิต แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900');
$companyPhone = getSettingVal($pdo, 'company_phone', '02-123-4567');
$companyTaxId = getSettingVal($pdo, 'company_tax_id', '0105537000000');

$themePreset = getSettingVal($pdo, 'theme_preset', 'indigo');
$primaryHex = getSettingVal($pdo, 'theme_primary_hex', '#4f46e5');
$secondaryHex = getSettingVal($pdo, 'theme_secondary_hex', '#10b981');
$fontFamily = getSettingVal($pdo, 'theme_font_family', 'Sarabun');
$borderRadiusStyle = getSettingVal($pdo, 'border_radius_style', 'rounded-xl');
$sidebarStyle = getSettingVal($pdo, 'sidebar_style', 'dark_slate');
$topbarStyle = getSettingVal($pdo, 'topbar_style', 'clean_white');
$logoPos = getSettingVal($pdo, 'logo_position', 'both');

$isoHeaderTitle = getSettingVal($pdo, 'iso_header_title', 'บริษัท ไทยปาร์คเกอร์ไรซิ่ง จำกัด — ฝ่ายวิศวกรรมและซ่อมบำรุง');
$isoFooterNote = getSettingVal($pdo, 'iso_footer_note', 'เอกสารควบคุมตามมาตรฐาน ISO 9001 / ISO 14001 ห้ามคัดลอกโดยไม่ได้รับอนุญาต');
$isoCodePrefix = getSettingVal($pdo, 'iso_form_code_prefix', 'F-EN-03');
$isoWatermark = getSettingVal($pdo, 'iso_watermark_enabled', '1');

$loginWelcomeText = getSettingVal($pdo, 'login_welcome_text', 'ยินดีต้อนรับสู่ระบบบริหารงานซ่อมบำรุงรักษา CMMS-TPT');
$loginNoticeText = getSettingVal($pdo, 'login_notice_text', 'ระบบนี้สำหรับพนักงานและช่างบำรุงรักษาที่ได้รับอนุญาตเท่านั้น');
$loginCardPos = getSettingVal($pdo, 'login_card_position', 'center');

$lineNotifyEnabled = getSettingVal($pdo, 'line_notify_enabled', '1');
$emailNotifyEnabled = getSettingVal($pdo, 'email_notify_enabled', '0');
$notificationSound = getSettingVal($pdo, 'notification_sound', 'chime');

$sessionTimeout = getSettingVal($pdo, 'session_timeout_mins', '60');
$maxLoginAttempts = getSettingVal($pdo, 'max_login_attempts', '5');
$demoLoginEnabled = getSettingVal($pdo, 'demo_login_enabled', '1');

$standardLaborRate = getSettingVal($pdo, 'standard_labor_rate', '250.00');
$workHoursPerDay = getSettingVal($pdo, 'work_hours_per_day', '8.0');
$requireRootCause = getSettingVal($pdo, 'require_root_cause', '1');

$spareRequireApproval = getSettingVal($pdo, 'spare_require_approval', '1');
$autoSageSync = getSettingVal($pdo, 'auto_sage_sync', '1');
$defaultWarehouse = getSettingVal($pdo, 'default_warehouse', 'TPTSUP');

$enableMachineBom = getSettingVal($pdo, 'enable_machine_bom', '1');
$enableMtbf = getSettingVal($pdo, 'enable_mtbf_analytics', '1');
$enableBorrowing = getSettingVal($pdo, 'enable_borrowing', '1');
$enableLeaderboard = getSettingVal($pdo, 'enable_leaderboard', '1');

$systemCurrency = getSettingVal($pdo, 'system_currency', '฿ THB');
$dateFormat = getSettingVal($pdo, 'date_format', 'd/m/Y');
$systemMode = getSettingVal($pdo, 'system_mode', 'online');

$companyLogo = getSettingVal($pdo, 'company_logo', '');
$companyLogoDark = getSettingVal($pdo, 'company_logo_dark', '');
$faviconIcon = getSettingVal($pdo, 'favicon_icon', '');
$loginBgImage = getSettingVal($pdo, 'login_bg_image', '');
$isoStampImage = getSettingVal($pdo, 'iso_stamp_image', '');

renderHeader();
?>

<div class="space-y-6">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">10-in-1 Ultimate Master Personalization Suite</span>
                <span class="text-xs text-purple-200">ISO 9001 & Enterprise Standard</span>
            </div>
            <h1 class="text-2xl font-black">⚙️ ศูนย์ควบคุมและตั้งค่าภาพลักษณ์ระบบ 360 (Master Configuration Suite)</h1>
            <p class="text-xs text-purple-100 mt-1">ตั้งค่าแบรนด์ โลโก้ ธีมสี การพิมพ์ ISO แจ้งเตือน นโยบายความปลอดภัย และสิทธิ์ระบบในที่เดียว</p>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="cmms-banner success p-4 rounded-xl border font-bold text-sm">
        <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="cmms-banner error p-4 rounded-xl border font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <form method="POST" enctype="multipart/form-data" class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Column 1 & 2: 10 Master Configuration Modules -->
        <div class="lg:col-span-2 space-y-6">

            <!-- MODULE 1: Corporate Identity & Legal Info -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>🏷️ 1. ข้อมูลองค์กรและชุดโลโก้ (Corporate Identity & Assets)</span>
                    <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs">Module 1</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ชื่อสั้นของระบบ (App Short Title)</label>
                        <input type="text" name="app_name" value="<?= htmlspecialchars($appName) ?>" required class="input input-bordered w-full font-extrabold text-sm">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ชื่อเต็มองค์กร / บริษัท (Company Full Name)</label>
                        <input type="text" name="company_name" value="<?= htmlspecialchars($companyName) ?>" required class="input input-bordered w-full font-bold text-sm">
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">เบอร์โทรศัพท์ติดต่อองค์กร</label>
                        <input type="text" name="company_phone" value="<?= htmlspecialchars($companyPhone) ?>" class="input input-bordered w-full">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                        <input type="text" name="company_tax_id" value="<?= htmlspecialchars($companyTaxId) ?>" class="input input-bordered w-full font-mono">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ตำแหน่งแสดงผลโลโก้</label>
                        <select name="logo_position" class="input input-bordered w-full font-bold">
                            <option value="both" <?= $logoPos === 'both' ? 'selected' : '' ?>>ทั้งมุมซ้าย & มุมขวา (แนะนำ)</option>
                            <option value="header_only" <?= $logoPos === 'header_only' ? 'selected' : '' ?>>มุมขวาบน (Header Corner)</option>
                            <option value="sidebar_only" <?= $logoPos === 'sidebar_only' ? 'selected' : '' ?>>มุมซ้ายบน (Sidebar Only)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="font-bold text-slate-700 block mb-1 text-xs">ที่อยู่สถานประกอบการ (Company Address)</label>
                    <input type="text" name="company_address" value="<?= htmlspecialchars($companyAddress) ?>" class="input input-bordered w-full text-xs">
                </div>

                <!-- Logotype Uploaders -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-center">
                        <label class="font-bold text-slate-700 block text-xs">โลโก้หลัก (Light Theme)</label>
                        <div class="card w-full h-14 p-2 flex items-center justify-center mx-auto">
                            <img src="<?= getImageUrl($companyLogo, 'asset') ?>" class="max-h-full object-contain">
                        </div>
                        <input type="file" name="company_logo" accept="image/*" class="cmms-banner info block w-full text-[11px] text-slate-500 file:py-1 file:px-2 file:rounded-lg file:border-0 file: file: cursor-pointer">
                    </div>

                    <div class="p-3 bg-slate-800 text-white border border-slate-700 rounded-xl space-y-2 text-center">
                        <label class="font-bold text-slate-200 block text-xs">โลโก้โหมดมืด (Dark Theme)</label>
                        <div class="w-full h-14 bg-slate-900 border border-slate-700 rounded-lg p-2 flex items-center justify-center shadow-sm mx-auto">
                            <img src="<?= getImageUrl($companyLogoDark ?: $companyLogo, 'asset') ?>" class="max-h-full object-contain">
                        </div>
                        <input type="file" name="company_logo_dark" accept="image/*" class="block w-full text-[11px] text-slate-400 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200 cursor-pointer">
                    </div>

                    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-center">
                        <label class="font-bold text-slate-700 block text-xs">Favicon แท็บเบราว์เซอร์</label>
                        <div class="card w-full h-14 p-2 flex items-center justify-center mx-auto">
                            <img src="<?= getImageUrl($faviconIcon, 'asset') ?>" class="w-7 h-7 object-contain">
                        </div>
                        <input type="file" name="favicon_icon" accept="image/*" class="cmms-banner info block w-full text-[11px] text-slate-500 file:py-1 file:px-2 file:rounded-lg file:border-0 file: file: cursor-pointer">
                    </div>
                </div>
            </div>

            <!-- MODULE 2: Color Palette, Fonts & UI Styles -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>🎨 2. โทนสี ฟอนต์ และสไตล์ระบบ (Theme & Typography)</span>
                    <span class="badge bg-purple-100 text-purple-800 font-bold text-xs">Module 2</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ฟอนต์ภาษาไทยหลัก (System Font)</label>
                        <select name="theme_font_family" class="input input-bordered w-full font-bold text-xs">
                            <option value="Sarabun" <?= $fontFamily === 'Sarabun' ? 'selected' : '' ?>>Sarabun (ทางการ ISO - แนะนำ)</option>
                            <option value="Prompt" <?= $fontFamily === 'Prompt' ? 'selected' : '' ?>>Prompt (โมเดิร์นทันสมัย)</option>
                            <option value="Kanit" <?= $fontFamily === 'Kanit' ? 'selected' : '' ?>>Kanit (กลมมนหนาเด่น)</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">สไตล์ความโค้งมน (Border Radius)</label>
                        <select name="border_radius_style" class="input input-bordered w-full font-bold text-xs">
                            <option value="rounded-xl" <?= $borderRadiusStyle === 'rounded-xl' ? 'selected' : '' ?>>Rounded Modern (12px)</option>
                            <option value="rounded-md" <?= $borderRadiusStyle === 'rounded-md' ? 'selected' : '' ?>>Minimal Sharp (6px)</option>
                            <option value="rounded-2xl" <?= $borderRadiusStyle === 'rounded-2xl' ? 'selected' : '' ?>>Pill Curved (20px)</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">สไตล์ Sidebar ด้านซ้าย</label>
                        <select name="sidebar_style" class="input input-bordered w-full font-bold text-xs">
                            <option value="dark_slate" <?= $sidebarStyle === 'dark_slate' ? 'selected' : '' ?>>Cruip Dark Slate (#0f172a)</option>
                            <option value="midnight_navy" <?= $sidebarStyle === 'midnight_navy' ? 'selected' : '' ?>>Midnight Navy (#1e1b4b)</option>
                            <option value="pure_light" <?= $sidebarStyle === 'pure_light' ? 'selected' : '' ?>>Pure White Light (#ffffff)</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div class="p-3 bg-slate-50 border rounded-xl flex items-center justify-between">
                        <span class="font-bold text-slate-700">สีเน้นหลัก (Primary Hex):</span>
                        <input type="color" name="theme_primary_hex" value="<?= htmlspecialchars($primaryHex) ?>" class="w-12 h-8 rounded cursor-pointer border-0">
                    </div>
                    <div class="p-3 bg-slate-50 border rounded-xl flex items-center justify-between">
                        <span class="font-bold text-slate-700">สีเน้นรอง (Secondary Hex):</span>
                        <input type="color" name="theme_secondary_hex" value="<?= htmlspecialchars($secondaryHex) ?>" class="w-12 h-8 rounded cursor-pointer border-0">
                    </div>
                </div>
            </div>

            <!-- MODULE 3: ISO Forms & Report Printing Customization -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>📄 3. แบบฟอร์ม ISO และการพิมพ์รายงาน (ISO Forms Setup)</span>
                    <span class="badge badge badge-warning font-bold text-xs">Module 3</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">รหัสอ้างอิงแบบฟอร์ม ISO (Form Code Prefix)</label>
                        <input type="text" name="iso_form_code_prefix" value="<?= htmlspecialchars($isoCodePrefix) ?>" class="input input-bordered w-full font-bold font-mono">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">เปิดใช้งานลายน้ำ ISO (Watermark)</label>
                        <select name="iso_watermark_enabled" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $isoWatermark === '1' ? 'selected' : '' ?>>เปิดใช้งาน (Controlled Copy)</option>
                            <option value="0" <?= $isoWatermark === '0' ? 'selected' : '' ?>>ปิดใช้งาน</option>
                        </select>
                    </div>
                </div>

                <div class="space-y-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ข้อความส่วนหัว ISO (ISO Header Title)</label>
                        <input type="text" name="iso_header_title" value="<?= htmlspecialchars($isoHeaderTitle) ?>" class="input input-bordered w-full font-bold">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ข้อความประกาศท้ายแบบฟอร์ม (ISO Footer Note)</label>
                        <input type="text" name="iso_footer_note" value="<?= htmlspecialchars($isoFooterNote) ?>" class="input input-bordered w-full">
                    </div>
                </div>
            </div>

            <!-- MODULE 4: Work Order & Labor Policy -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>⏱️ 4. กฎการซ่อมบำรุงและค่าแรง (Work Order & Labor Policy)</span>
                    <span class="badge badge badge-info font-bold text-xs">Module 4</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ค่าแรงมาตรฐาน (บาท/ชม.)</label>
                        <input type="number" step="0.01" name="standard_labor_rate" value="<?= htmlspecialchars($standardLaborRate) ?>" class="input input-bordered w-full font-bold">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">เวลาทำงานมาตรฐาน (ชม./วัน)</label>
                        <input type="number" step="0.5" name="work_hours_per_day" value="<?= htmlspecialchars($workHoursPerDay) ?>" class="input input-bordered w-full font-bold">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">บังคับระบุสาเหตุการเสีย (Root Cause)</label>
                        <select name="require_root_cause" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $requireRootCause === '1' ? 'selected' : '' ?>>บังคับระบุ (Required)</option>
                            <option value="0" <?= $requireRootCause === '0' ? 'selected' : '' ?>>ระบุหรือไม่ก็ได้</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- MODULE 5: Spare Parts & Store Policy -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>📦 5. นโยบายเบิกอะไหล่ & ตัด Sage 300 (Store Policy)</span>
                    <span class="badge bg-purple-100 text-purple-800 font-bold text-xs">Module 5</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ต้องอนุมัติก่อนเบิกอะไหล่</label>
                        <select name="spare_require_approval" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $spareRequireApproval === '1' ? 'selected' : '' ?>>ต้องอนุมัติก่อน (Require Approval)</option>
                            <option value="0" <?= $spareRequireApproval === '0' ? 'selected' : '' ?>>จ่ายของได้ทันที</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ตัดสต็อก Sage 300 อัตโนมัติ</label>
                        <select name="auto_sage_sync" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $autoSageSync === '1' ? 'selected' : '' ?>>ตัดสต็อกสดทันที (Realtime)</option>
                            <option value="0" <?= $autoSageSync === '0' ? 'selected' : '' ?>>สร้างคิวตัดภายหลัง</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">รหัสคลังสินค้าเริ่มต้น (Sage 300)</label>
                        <input type="text" name="default_warehouse" value="<?= htmlspecialchars($defaultWarehouse) ?>" class="input input-bordered w-full font-bold font-mono">
                    </div>
                </div>
            </div>

            <!-- MODULE 6: Notifications & Audio -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>🔔 6. ระบบแจ้งเตือน & เอฟเฟกต์เสียง (Notifications & Audio)</span>
                    <span class="badge badge badge-success font-bold text-xs">Module 6</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">แจ้งเตือนผ่าน LINE Notify/LIFF</label>
                        <select name="line_notify_enabled" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $lineNotifyEnabled === '1' ? 'selected' : '' ?>>เปิดใช้งาน (Enabled)</option>
                            <option value="0" <?= $lineNotifyEnabled === '0' ? 'selected' : '' ?>>ปิดใช้งาน</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">แจ้งเตือนผ่าน Email</label>
                        <select name="email_notify_enabled" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $emailNotifyEnabled === '1' ? 'selected' : '' ?>>เปิดใช้งาน</option>
                            <option value="0" <?= $emailNotifyEnabled === '0' ? 'selected' : '' ?>>ปิดใช้งาน (Disabled)</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">เสียงเอฟเฟกต์แจ้งเตือน</label>
                        <select name="notification_sound" class="input input-bordered w-full font-bold">
                            <option value="chime" <?= $notificationSound === 'chime' ? 'selected' : '' ?>>Chime Bell (นุ่มนวล)</option>
                            <option value="pop" <?= $notificationSound === 'pop' ? 'selected' : '' ?>>Pop Alert</option>
                            <option value="mute" <?= $notificationSound === 'mute' ? 'selected' : '' ?>>ปิดเสียง (Mute)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- MODULE 7: Security & Session Policy -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>🛡️ 7. นโยบายความปลอดภัยและเซสชัน (Security Policy)</span>
                    <span class="badge badge badge-error font-bold text-xs">Module 7</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">หมดเวลาเซสชันอัตโนมัติ (Session Timeout)</label>
                        <select name="session_timeout_mins" class="input input-bordered w-full font-bold">
                            <option value="30" <?= $sessionTimeout === '30' ? 'selected' : '' ?>>30 นาที</option>
                            <option value="60" <?= $sessionTimeout === '60' ? 'selected' : '' ?>>60 นาที (แนะนำ)</option>
                            <option value="120" <?= $sessionTimeout === '120' ? 'selected' : '' ?>>120 นาที</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">จำนวนครั้งล็อกอินผิดพลาดสูงสุดก่อนล็อกบัญชี</label>
                        <select name="max_login_attempts" class="input input-bordered w-full font-bold">
                            <option value="3" <?= $maxLoginAttempts === '3' ? 'selected' : '' ?>>3 ครั้ง</option>
                            <option value="5" <?= $maxLoginAttempts === '5' ? 'selected' : '' ?>>5 ครั้ง (แนะนำ)</option>
                            <option value="10" <?= $maxLoginAttempts === '10' ? 'selected' : '' ?>>10 ครั้ง</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ปุ่มบัญชีทดสอบบนหน้า Login (Demo Accounts)</label>
                        <select name="demo_login_enabled" class="input input-bordered w-full font-bold">
                            <option value="1" <?= $demoLoginEnabled === '1' ? 'selected' : '' ?>>แสดง (สำหรับทดสอบ)</option>
                            <option value="0" <?= $demoLoginEnabled === '0' ? 'selected' : '' ?>>ซ่อน (แนะนำเมื่อใช้งานจริง)</option>
                        </select>
                        <p class="text-[10px] text-slate-400 mt-1">ปุ่ม admin/manager/tech01 (รหัส default) — ควรซ่อนเมื่อใช้งานจริง</p>
                    </div>
                </div>
            </div>

            <!-- MODULE 8: Feature Module Toggles -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>🌐 8. การเปิด/ปิด โมดูลระบบ (Module Feature Toggles)</span>
                    <span class="badge bg-cyan-100 text-cyan-800 font-bold text-xs">Module 8</span>
                </h3>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <label class="p-3 border rounded-xl cursor-pointer hover:bg-indigo-50 flex items-center gap-2">
                        <input type="checkbox" name="enable_machine_bom" value="1" <?= $enableMachineBom === '1' ? 'checked' : '' ?>>
                        <span class="font-bold text-slate-800">Machine BOM</span>
                    </label>
                    <label class="p-3 border rounded-xl cursor-pointer hover:bg-indigo-50 flex items-center gap-2">
                        <input type="checkbox" name="enable_mtbf_analytics" value="1" <?= $enableMtbf === '1' ? 'checked' : '' ?>>
                        <span class="font-bold text-slate-800">MTBF/MTTR</span>
                    </label>
                    <label class="p-3 border rounded-xl cursor-pointer hover:bg-indigo-50 flex items-center gap-2">
                        <input type="checkbox" name="enable_borrowing" value="1" <?= $enableBorrowing === '1' ? 'checked' : '' ?>>
                        <span class="font-bold text-slate-800">ยืม-คืนอุปกรณ์</span>
                    </label>
                    <label class="p-3 border rounded-xl cursor-pointer hover:bg-indigo-50 flex items-center gap-2">
                        <input type="checkbox" name="enable_leaderboard" value="1" <?= $enableLeaderboard === '1' ? 'checked' : '' ?>>
                        <span class="font-bold text-slate-800">ตาราง KPI ช่าง</span>
                    </label>
                </div>
            </div>

            <!-- MODULE 9: System Defaults & Formats -->
            <div class="card cmms-card p-6 space-y-4">
                <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                    <span>⚙️ 9. ค่าเริ่มต้นระบบและการแสดงผล (System Defaults)</span>
                    <span class="badge bg-slate-100 text-slate-800 font-bold text-xs">Module 9</span>
                </h3>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">สัญลักษณ์สกุลเงิน</label>
                        <input type="text" name="system_currency" value="<?= htmlspecialchars($systemCurrency) ?>" class="input input-bordered w-full font-bold">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">รูปแบบวันที่ (Date Format)</label>
                        <select name="date_format" class="input input-bordered w-full font-bold">
                            <option value="d/m/Y" <?= $dateFormat === 'd/m/Y' ? 'selected' : '' ?>>DD/MM/YYYY (25/07/2026)</option>
                            <option value="Y-m-d" <?= $dateFormat === 'Y-m-d' ? 'selected' : '' ?>>YYYY-MM-DD (2026-07-25)</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">สถานะเซิร์ฟเวอร์ (Server Mode)</label>
                        <select name="system_mode" class="input input-bordered w-full font-bold text-emerald-700">
                            <option value="online" <?= $systemMode === 'online' ? 'selected' : '' ?>>🟢 ออนไลน์ปกติ (Online)</option>
                            <option value="maintenance" <?= $systemMode === 'maintenance' ? 'selected' : '' ?>>🔴 ปิดปรับปรุงระบบ (Maintenance)</option>
                        </select>
                    </div>
                </div>
            </div>

            <button type="submit" class="btn btn-primary bg-purple-700 border-purple-700 hover:bg-purple-800 text-xs w-full py-4 font-black shadow-xl">
                💾 บันทึกการตั้งค่าระบบทั้ง 10 หมวดหมู่
            </button>
        </div>

        <!-- Column 3: Live Preview Studio Panel -->
        <div class="card p-6 bg-slate-900 text-white rounded-2xl shadow-2xl space-y-4">
            <h3 class="font-extrabold text-white text-base border-b border-slate-700 pb-2 flex items-center justify-between">
                <span>👁️ สตูดิโอตัวอย่างสด 360 (Live Studio Preview)</span>
                <span class="badge bg-emerald-500 text-white text-[10px] font-bold">Realtime</span>
            </h3>

            <!-- Simulated Desktop Topbar Header -->
            <div class="p-3 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-400">มุมขวาบน (Header):</span>
                <div class="flex items-center gap-2">
                    <img id="preview-header-logo" src="<?= getImageUrl($companyLogo, 'asset') ?>" class="card w-7 h-7 rounded-md object-contain p-0.5">
                    <span id="preview-company-name" class="text-xs font-black text-white"><?= htmlspecialchars($companyName) ?></span>
                </div>
            </div>

            <!-- Simulated Button Components -->
            <div class="p-4 bg-slate-800 rounded-xl border border-slate-700 space-y-3 text-xs">
                <span class="text-slate-400 block font-bold text-[11px]">ตัวอย่างปุ่มและ Badge ในระบบ:</span>
                <div class="flex items-center gap-2 flex-wrap">
                    <button id="preview-btn-primary" type="button" style="background-color:<?= htmlspecialchars($primaryHex) ?>;" class="px-4 py-2 text-white font-bold rounded-xl shadow transition-all">
                        ปุ่มหลัก (Primary)
                    </button>
                    <span id="preview-badge" style="background-color:<?= htmlspecialchars($secondaryHex) ?>33; color:<?= htmlspecialchars($secondaryHex) ?>;" class="px-3 py-1 font-bold rounded-full text-xs border border-emerald-500/30">
                        Accent Badge
                    </span>
                </div>
            </div>

            <!-- ISO Document Header Preview -->
            <div class="card p-3 text-slate-900 space-y-1 text-xs">
                <span class="text-[10px] font-bold text-slate-400 uppercase block">ตัวอย่างส่วนหัวเอกสาร ISO F-EN:</span>
                <div class="font-extrabold text-indigo-900 border-b pb-1 text-[11px]"><?= htmlspecialchars($isoHeaderTitle) ?></div>
                <div class="text-[9px] text-slate-500 italic pt-0.5"><?= htmlspecialchars($isoFooterNote) ?></div>
            </div>
        </div>

    </form>
</div>

<?php renderFooter(); ?>
