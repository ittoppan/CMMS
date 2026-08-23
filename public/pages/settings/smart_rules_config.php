<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ตั้งค่าเงื่อนไขและกฎเกณฑ์อัจฉริยะ (Smart Rules & Thresholds Engine) - CMMS-TPT';
$pdo = getDb();

$msg = '';
$msgType = '';

// Handle Settings Save
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_smart_rules'])) {
    try {
        $rules = [
            'spare_approval_price_threshold' => (float)($_POST['spare_approval_price_threshold'] ?? 5000),
            'rca_downtime_threshold'          => (float)($_POST['rca_downtime_threshold'] ?? 2.0),
            'iot_temp_threshold'              => (float)($_POST['iot_temp_threshold'] ?? 75.0),
            'iot_vibration_threshold'         => (float)($_POST['iot_vibration_threshold'] ?? 4.5),
            'auto_reorder_alert_enabled'      => isset($_POST['auto_reorder_alert_enabled']) ? '1' : '0',
            'executive_report_email'          => trim($_POST['executive_report_email'] ?? 'executive@toppan.co.th')
        ];

        foreach ($rules as $key => $val) {
            $pdo->prepare("
                INSERT INTO settings (setting_key, setting_value, setting_group, description)
                VALUES (?, ?, 'SmartRules', 'Enterprise Threshold Rule')
                ON DUPLICATE KEY UPDATE setting_value = ?
            ")->execute([$key, (string)$val, (string)$val]);
        }

        $msg = 'บันทึกการตั้งค่าเงื่อนไขและกฎเกณฑ์อัจฉริยะ (Smart Rules) เรียบร้อยแล้ว!';
        $msgType = 'success';
    } catch (Exception $e) {
        $msg = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
        $msgType = 'error';
    }
}

// Fetch current values
$sparePriceLimit = (float)($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'spare_approval_price_threshold'")->fetchColumn() ?: 5000);
$rcaDowntime     = (float)($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'rca_downtime_threshold'")->fetchColumn() ?: 2.0);
$iotTemp         = (float)($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'iot_temp_threshold'")->fetchColumn() ?: 75.0);
$iotVib          = (float)($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'iot_vibration_threshold'")->fetchColumn() ?: 4.5);
$autoReorder     = ($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'auto_reorder_alert_enabled'")->fetchColumn() ?: '1') === '1';
$execEmail       = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'executive_report_email'")->fetchColumn() ?: 'executive@toppan.co.th';

renderHeader();
?>

<div class="space-y-6 max-w-4xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-indigo-700 via-purple-700 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-indigo-500/30">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Enterprise Control Engine</span>
                <span class="text-xs text-indigo-200">Dynamic Rules & Thresholds</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="sliders" class="w-7 h-7 text-indigo-300"></i>
                <span>ศูนย์ตั้งค่าเงื่อนไขและกฎเกณฑ์อัจฉริยะ (Smart Rules & Thresholds Engine)</span>
            </h1>
            <p class="text-xs text-indigo-100 mt-1">กำหนดราคาอนุมัติเบิกอะไหล่, เกณฑ์เวลา Downtime ที่ต้องทำ 5-Why RCA, ขีดจำกัด IoT Alert และการส่งรายงานผู้บริหาร</p>
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

    <form method="POST" class="card cmms-card p-6 space-y-6">
        <input type="hidden" name="save_smart_rules" value="1">

        <!-- Rule 1: High-Cost Spare Parts Approval Threshold -->
        <div class="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
            <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs">1</span>
                <span>💰 เงื่อนไขอนุมัติเบิกอะไหล่มูลค่าสูง (High-Cost Spare LINE Approval)</span>
            </h3>
            <p class="text-xs text-slate-600">หากการขอเบิกอะไหล่รายการใดมีมูลค่ารวม (`ราคาต่อหน่วย × จำนวน`) เกินกว่าที่ระบุ ระบบจะส่ง **LINE Flex Card ขออนุมัติ 1-Click** ไปยังผู้จัดการก่อนตัดสต็อกใน Sage 300</p>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold text-slate-700 block mb-1">วงเงินอนุมัติอัตโนมัติสูงสุด (บาท):</label>
                    <div class="relative">
                        <input type="number" step="500" name="spare_approval_price_threshold" value="<?= htmlspecialchars($sparePriceLimit) ?>" class="input input-bordered w-full text-xs font-mono font-bold text-amber-700 pl-8">
                        <span class="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">฿</span>
                    </div>
                    <span class="text-[11px] text-slate-400 mt-1 block">ตัวอย่าง: ระบุ `5000` บาท (รายการที่เบิกเกิน 5,000 บาทต้องรออนุมัติ)</span>
                </div>
            </div>
        </div>

        <!-- Rule 2: High Downtime RCA 5-Why Enforcement -->
        <div class="p-4 bg-rose-50/60 border border-rose-200 rounded-xl space-y-3">
            <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center font-black text-xs">2</span>
                <span>🧠 เงื่อนไขเวลา Downtime ที่ต้องกรอก 5-Why RCA (ISO 9001/14001 Enforcement)</span>
            </h3>
            <p class="text-xs text-slate-600">หากงานซ่อมใดมีเวลาหยุดเครื่อง (Downtime) สูงเกินกว่าที่ระบุ ระบบจะบังคับให้ช่างกรอกสาเหตุรากเหง้า 5-Why และแนวทางป้องกันแก้ไขก่อนปิดงาน</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold text-slate-700 block mb-1">เกณฑ์เวลา Downtime สูงสุด (ชั่วโมง):</label>
                    <div class="relative">
                        <input type="number" step="0.5" name="rca_downtime_threshold" value="<?= htmlspecialchars($rcaDowntime) ?>" class="input input-bordered w-full text-xs font-mono font-bold text-rose-700 pl-8">
                        <span class="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">⏱️</span>
                    </div>
                    <span class="text-[11px] text-slate-400 mt-1 block">ตัวอย่าง: ระบุ `2.0` ชั่วโมง (งานซ่อมที่เครื่องหยุดเกิน 2 ชม. ต้องทำ RCA 5-Why)</span>
                </div>
            </div>
        </div>

        <!-- Rule 3: Predictive Anomaly Thresholds -->
        <div class="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
            <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-xs">3</span>
                <span>🔮 ขีดจำกัดทำนายเครื่องจักรผิดปกติ (IoT Predictive Anomaly Thresholds)</span>
            </h3>
            <p class="text-xs text-slate-600">กำหนดค่าขีดจำกัดอุณหภูมิและความสั่นสะเทือนจากเซ็นเซอร์ IoT หากวัดค่าได้สูงเกินกำหนด ระบบจะส่งเตือนเข้า LINE กลุ่มช่างทันที</p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-bold text-slate-700 block mb-1">ขีดจำกัดอุณหภูมิวิกฤต (°C):</label>
                    <input type="number" step="1" name="iot_temp_threshold" value="<?= htmlspecialchars($iotTemp) ?>" class="input input-bordered w-full text-xs font-mono font-bold text-indigo-700">
                </div>
                <div>
                    <label class="text-xs font-bold text-slate-700 block mb-1">ขีดจำกัดความสั่นสะเทือน (mm/s):</label>
                    <input type="number" step="0.1" name="iot_vibration_threshold" value="<?= htmlspecialchars($iotVib) ?>" class="input input-bordered w-full text-xs font-mono font-bold text-indigo-700">
                </div>
            </div>
        </div>

        <!-- Rule 4: Auto Reorder Point Alert & Executive Report Email -->
        <div class="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
            <h3 class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs">4</span>
                <span>📦 การแจ้งเตือนจัดซื้ออะไหล่ & รายงานผู้บริหารประจำเดือน</span>
            </h3>

            <div class="space-y-3">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="auto_reorder_alert_enabled" value="1" <?= $autoReorder ? 'checked' : '' ?> class="rounded text-emerald-600 focus:ring-emerald-500">
                    <span class="text-xs font-bold text-slate-800">เปิดใช้งานระบบส่งการแจ้งเตือนจัดซื้ออัตโนมัติเมื่ออะไหล่ต่ำกว่า Min Stock</span>
                </label>

                <div>
                    <label class="text-xs font-bold text-slate-700 block mb-1">อีเมลผู้บริหารสำหรับรับรายงานประจำเดือน (Executive Report Recipient):</label>
                    <input type="email" name="executive_report_email" value="<?= htmlspecialchars($execEmail) ?>" class="input input-bordered w-full text-xs font-mono font-bold text-emerald-700">
                </div>
            </div>
        </div>

        <!-- Submit Button -->
        <div class="pt-2 flex justify-end">
            <button type="submit" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg gap-2">
                <i data-lucide="save" class="w-4 h-4"></i>
                <span>บันทึกการตั้งค่าเงื่อนไขทั้งหมด</span>
            </button>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
