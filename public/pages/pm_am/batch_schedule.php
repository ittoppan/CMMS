<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'สร้างแผน PM/AM ประจำปีแบบอัตโนมัติในครั้งเดียว (Annual PM Batch Scheduler) - CMMS-TPT';
$pdo = getDb();

$msg = '';
$error = '';
$countCreated = 0;

// Fetch active machine assets
$assets = $pdo->query("SELECT id, code, name FROM asset_registry WHERE status = 'active' ORDER BY code ASC")->fetchAll();
// Fetch active technicians
$techs = $pdo->query("SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name ASC")->fetchAll();
// Fetch templates
$templates = $pdo->query("SELECT id, code, name FROM checklist_templates ORDER BY id ASC")->fetchAll();

// Handle Batch Schedule Generation
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['generate_batch'])) {
    try {
        $assetId = (int)$_POST['asset_id'];
        $year = (int)$_POST['schedule_year'];
        $assignedTo = (int)$_POST['assigned_to'];
        $templateId = (int)($_POST['template_id'] ?? 1);

        $includeDaily = isset($_POST['freq_daily']);
        $includeMonthly = isset($_POST['freq_monthly']);
        $include6Month = isset($_POST['freq_6month']);
        $includeAnnual = isset($_POST['freq_annual']);

        $stmt = $pdo->prepare("
            INSERT INTO pm_am (title, description, asset_id, frequency, scheduled_date, assigned_to, status, checklist)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', '[]')
        ");

        $targetAssets = ($assetId === 0) ? $assets : array_filter($assets, fn($a) => $a['id'] === $assetId);

        foreach ($targetAssets as $asset) {
            
            // 1. Daily Checks (365 days or 12 monthly daily representatives)
            if ($includeDaily) {
                for ($m = 1; $m <= 12; $m++) {
                    $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $m, $year);
                    // Sample every Monday of the month for manageable daily PMs or all days
                    for ($d = 1; $d <= $daysInMonth; $d += 7) {
                        $dateStr = sprintf('%04d-%02d-%02d', $year, $m, $d);
                        $stmt->execute([
                            "PM ประจำวัน (Daily): {$asset['name']}",
                            "ตรวจเช็คการหล่อลื่น ระดับน้ำมัน และระบบลมประจำวัน (Form F-EN-07)",
                            $asset['id'],
                            'daily',
                            $dateStr,
                            $assignedTo
                        ]);
                        $countCreated++;
                    }
                }
            }

            // 2. Monthly Checks (12 months)
            if ($includeMonthly) {
                for ($m = 1; $m <= 12; $m++) {
                    $dateStr = sprintf('%04d-%02d-01', $year, $m);
                    $stmt->execute([
                        "PM ประจำเดือน {$m}/{$year}: {$asset['name']}",
                        "การตรวจเช็คและเปลี่ยนถ่ายน้ำมันหล่อลื่นประจำเดือน (Form F-EN-06)",
                        $asset['id'],
                        'monthly',
                        $dateStr,
                        $assignedTo
                    ]);
                    $countCreated++;
                }
            }

            // 3. 6-Month Checks (2 times per year: June & December)
            if ($include6Month) {
                foreach ([6, 12] as $m) {
                    $dateStr = sprintf('%04d-%02d-15', $year, $m);
                    $stmt->execute([
                        "PM ครอบคลุม 6 เดือน: {$asset['name']}",
                        "การตรวจเช็คใหญ่ครึ่งปี ตู้คอนโทรลและระบบไฟฟ้า (Form F-EN-14)",
                        $asset['id'],
                        'semi_annual',
                        $dateStr,
                        $assignedTo
                    ]);
                    $countCreated++;
                }
            }

            // 4. Annual Check (1 time per year: December)
            if ($includeAnnual) {
                $dateStr = sprintf('%04d-12-25', $year);
                $stmt->execute([
                    "🏆 PM บำรุงรักษาใหญ่ประจำปี {$year}: {$asset['name']}",
                    "การตรวจเช็คและ Overhaul ใหญ่ประจำปี (Form F-EN-15)",
                    $asset['id'],
                    'annual',
                    $dateStr,
                    $assignedTo
                ]);
                $countCreated++;
            }

        }

        $msg = "สร้างแผน PM/AM ประจำปี {$year} รวมทั้งสิ้น {$countCreated} รายการสำเร็จเรียบร้อย!";

    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
?>

<div class="space-y-6 max-w-4xl mx-auto">
    <!-- Top Header Banner -->
    <div class="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">1-Click Annual Generator</span>
                <span class="text-xs text-indigo-200">ISO Maintenance Scheduler</span>
            </div>
            <h1 class="text-2xl font-black">🗓️ ระบบเพิ่มงาน PM/AM ประจำปีอัตโนมัติในครั้งเดียว</h1>
            <p class="text-xs text-indigo-100 mt-1">สร้างตารางการบำรุงรักษาล่วงหน้าตลอดทั้งปี ทั้งเช็คประจำวัน, ประจำเดือน, ครึ่งปี และบำรุงใหญ่ประจำปี</p>
        </div>
        <a href="calendar.php" class="cmms-banner info card btn font-bold text-xs shadow hover:">
            📅 ดูปฏิทิน PM ทั้งหมด →
        </a>
    </div>

    <?php if ($msg): ?>
    <div class="cmms-banner success p-4 rounded-xl border font-bold text-sm">
        🎉 <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="cmms-banner error p-4 rounded-xl border font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- Generator Form Card -->
    <form method="POST" class="card cmms-card p-5">
        <input type="hidden" name="generate_batch" value="1">

        <h3 class="font-bold text-slate-900 text-base border-b pb-2 flex justify-between">
            <span>⚙️ ตัวเลือกการสร้างแผนงาน PM/AM (Batch Scheduler Controls)</span>
            <span class="text-xs text-indigo-600 font-bold">1-Click Automation</span>
        </h3>

        <!-- Target Machine Selection -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-slate-700 block mb-1">เครื่องจักรเป้าหมาย (Target Machine)</label>
                <select name="asset_id" class="input input-bordered w-full">
                    <option value="0">🏭 ทั้งหมดทุกเครื่องจักรในโรงงาน (All Active Assets)</option>
                    <?php foreach ($assets as $a): ?>
                    <option value="<?= $a['id'] ?>"><?= htmlspecialchars($a['code']) ?> - <?= htmlspecialchars($a['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div>
                <label class="font-bold text-slate-700 block mb-1">ปีที่ต้องการจัดทำแผน (Target Year)</label>
                <select name="schedule_year" class="input input-bordered w-full font-bold font-mono">
                    <option value="2026" selected>2026 (พ.ศ. 2569)</option>
                    <option value="2027">2027 (พ.ศ. 2570)</option>
                </select>
            </div>
        </div>

        <!-- Frequencies Options Checkboxes -->
        <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <span class="font-bold text-slate-900 text-xs block border-b border-slate-200 pb-1">
                📌 เลือกรอบความถี่งาน PM/AM ที่ต้องการสร้างเข้าปฏิทิน:
            </span>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label class="card flex items-center gap-2 p-3 cursor-pointer hover:border-indigo-400">
                    <input type="checkbox" name="freq_daily" checked class="w-4 h-4 text-indigo-600">
                    <div>
                        <span class="font-bold text-slate-900 block">☀️ เช็คประจำวัน (Daily Inspection - F-EN-07)</span>
                        <span class="text-[11px] text-slate-500">สร้างงานเช็คประจำสัปดาห์/ประจำวันตลอด 365 วัน</span>
                    </div>
                </label>

                <label class="card flex items-center gap-2 p-3 cursor-pointer hover:border-indigo-400">
                    <input type="checkbox" name="freq_monthly" checked class="w-4 h-4 text-indigo-600">
                    <div>
                        <span class="font-bold text-slate-900 block">📅 เช็คประจำเดือน (Monthly Maintenance - F-EN-06)</span>
                        <span class="text-[11px] text-slate-500">สร้างงานบำรุงรักษาทุกวันที่ 1 ของทุกเดือน (12 ครั้ง/ปี)</span>
                    </div>
                </label>

                <label class="card flex items-center gap-2 p-3 cursor-pointer hover:border-indigo-400">
                    <input type="checkbox" name="freq_6month" checked class="w-4 h-4 text-indigo-600">
                    <div>
                        <span class="font-bold text-slate-900 block">🗓️ เช็คประจำ 6 เดือน (Semi-Annual Maintenance - F-EN-14)</span>
                        <span class="text-[11px] text-slate-500">สร้างงานตรวจใหญ่รอบครึ่งปี (มิ.ย. & ธ.ค.)</span>
                    </div>
                </label>

                <label class="card flex items-center gap-2 p-3 cursor-pointer hover:border-indigo-400">
                    <input type="checkbox" name="freq_annual" checked class="w-4 h-4 text-indigo-600">
                    <div>
                        <span class="font-bold text-slate-900 block">🏆 เช็คบำรุงใหญ่ประจำปี (Annual Maintenance - F-EN-15)</span>
                        <span class="text-[11px] text-slate-500">สร้างงาน Overhaul บำรุงรักษาใหญ่ปลายปี</span>
                    </div>
                </label>
            </div>
        </div>

        <!-- Assignee & Template -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-slate-700 block mb-1">ช่างผู้รับผิดชอบ (Assigned Technician)</label>
                <select name="assigned_to" class="input input-bordered w-full">
                    <?php foreach ($techs as $t): ?>
                    <option value="<?= $t['id'] ?>"><?= htmlspecialchars($t['full_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div>
                <label class="font-bold text-slate-700 block mb-1">ชุดเทมเพลตเช็คชีท ISO (Checksheet Template)</label>
                <select name="template_id" class="input input-bordered w-full">
                    <?php foreach ($templates as $tmpl): ?>
                    <option value="<?= $tmpl['id'] ?>"><?= htmlspecialchars($tmpl['code']) ?> - <?= htmlspecialchars($tmpl['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <!-- Submit Button -->
        <div class="pt-2">
            <button type="submit" onclick="return confirm('ยืนยันสร้างแผน PM/AM ตลอดทั้งปีใช่หรือไม่?')" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                <span>🚀 กดสร้างแผน PM/AM ประจำปีแบบอัตโนมัติ (Generate Annual Batch Schedule)</span>
            </button>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
