<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/RCAService.php';

$pageTitle = '🧠 Root Cause Analysis (RCA Engine) — CMMS-TOPPAN';
$pdo = getDb();

$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'save_rca') {
    try {
        RCAService::createRCARecord($_POST);
        $msg = "บันทึกการวิเคราะห์หาสาเหตุรากเหง้า RCA (5-Why & Fishbone) สำเร็จเรียบร้อย!";
    } catch (Exception $e) {
        $msg = "เกิดข้อผิดพลาด: " . $e->getMessage();
    }
}

// Fetch Work Orders & RCA Records
$repairs = $pdo->query("SELECT r.id, r.work_order_no, r.title, a.code AS asset_code FROM repair r JOIN asset_registry a ON r.asset_id = a.id ORDER BY r.id DESC LIMIT 20")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-purple-200">Zero Recurring Failure Engine</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">ISO 55000 RCA</span>
            </div>
            <h1 class="text-2xl font-black">🧠 ระบบวิเคราะห์หาสาเหตุรากเหง้า RCA (Root Cause Analysis Engine)</h1>
            <p class="text-xs text-purple-100 mt-1">ขจัดปัญหาเครื่องจักรเสียซ้ำซากด้วยเทคนิค 5 Why Analysis, Fishbone Diagram (6M), และรหัสอาการเสียมาตรฐาน (Failure Code Standard)</p>
        </div>
        <button onclick="document.getElementById('rcaModal').style.display='flex'" class="btn btn-primary bg-white text-purple-900 hover:bg-purple-50 text-xs font-black px-4 py-2.5 rounded-xl shadow-lg">
            + บันทึกวิเคราะห์ RCA ใบงานใหม่
        </button>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 font-bold rounded-2xl border border-emerald-200 text-xs">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <!-- Visual 6M Fishbone Diagram Showcase -->
    <div class="card p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>🐟 แผงผังแสดงก้างปลาวิเคราะห์ 6M (Fishbone / Ishikawa Diagram)</span>
            <span class="text-xs text-slate-400">วิธีวิเคราะห์ครอบคลุม 6 มิติ</span>
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-4 bg-blue-50/80 rounded-xl border border-blue-200 space-y-1">
                <span class="font-bold text-blue-900 text-xs block">👤 1. Man (คน/ช่าง)</span>
                <p class="text-[11px] text-slate-600">ทักษะช่างไม่เพียงพอ, สื่อสารผิดพลาด, ความเมื่อยล้าในการทำงาน</p>
            </div>
            <div class="p-4 bg-purple-50/80 rounded-xl border border-purple-200 space-y-1">
                <span class="font-bold text-purple-900 text-xs block">⚙️ 2. Machine (เครื่องจักร)</span>
                <p class="text-[11px] text-slate-600">อะไหล่เสื่อมสภาพ, ตลับลูกปืนร้อนจัด, สายพานหย่อน</p>
            </div>
            <div class="p-4 bg-amber-50/80 rounded-xl border border-amber-200 space-y-1">
                <span class="font-bold text-amber-900 text-xs block">📦 3. Material (วัตถุดิบ/อะไหล่)</span>
                <p class="text-[11px] text-slate-600">สเปกอะไหล่ไม่ตรงมาตรฐาน, สารหล่อลื่นไม่ได้คุณภาพ</p>
            </div>
            <div class="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-1">
                <span class="font-bold text-emerald-900 text-xs block">📋 4. Method (วิธีการ)</span>
                <p class="text-[11px] text-slate-600">ไม่มีเช็คชีทมาตรฐาน, ขั้นตอน PM ไม่ครอบคลุม</p>
            </div>
            <div class="p-4 bg-cyan-50/80 rounded-xl border border-cyan-200 space-y-1">
                <span class="font-bold text-cyan-900 text-xs block">📐 5. Measurement (การวัด)</span>
                <p class="text-[11px] text-slate-600">เซนเซอร์ตั้งค่าคลาดเคลื่อน, เครื่องมือวัดไม่ได้สอบเทียบ</p>
            </div>
            <div class="p-4 bg-rose-50/80 rounded-xl border border-rose-200 space-y-1">
                <span class="font-bold text-rose-900 text-xs block">🌡️ 6. Environment (สภาพแวดล้อม)</span>
                <p class="text-[11px] text-slate-600">ความร้อนสะสมในโรงงาน, ความชื้นสูง, ฝุ่นเคมีเกาะตู้คอนโทรล</p>
            </div>
        </div>
    </div>

</div>

<!-- Modal Create RCA -->
<div id="rcaModal" style="display:none;" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
    <div class="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
        <div class="flex justify-between items-center border-b pb-3">
            <h3 class="font-extrabold text-slate-900 text-base">🧠 บันทึกการวิเคราะห์หาสาเหตุรากเหง้า (RCA Form)</h3>
            <button onclick="document.getElementById('rcaModal').style.display='none'" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
        </div>

        <form method="POST" class="space-y-4 text-xs">
            <input type="hidden" name="action" value="save_rca">

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block font-bold text-slate-700 mb-1">เลือกใบสั่งซ่อมบำรุง *</label>
                    <select name="repair_id" class="input input-bordered w-full font-bold">
                        <?php foreach ($repairs as $r): ?>
                        <option value="<?= $r['id'] ?>"><?= htmlspecialchars($r['work_order_no'] ?? 'WO') ?> — <?= htmlspecialchars($r['asset_code']) ?> (<?= htmlspecialchars($r['title']) ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div>
                    <label class="block font-bold text-purple-900 mb-1">รหัสอาการเสียมาตรฐาน (Failure Code) *</label>
                    <select name="failure_code" class="input input-bordered w-full font-mono font-bold border-purple-300">
                        <option value="FAIL-MECH-01">FAIL-MECH-01: ตลับลูกปืนติดล็อก (Bearing Lock)</option>
                        <option value="FAIL-ELEC-02">FAIL-ELEC-02: มอเตอร์โอเวอร์โหลด (Motor Overload)</option>
                        <option value="FAIL-HYDR-03">FAIL-HYDR-03: แรงดันไฮดรอลิกตก (Low Pressure)</option>
                        <option value="FAIL-PNEU-04">FAIL-PNEU-04: สายลมรั่วซึม (Pneumatic Leak)</option>
                        <option value="FAIL-SENS-05">FAIL-SENS-05: เซนเซอร์ตรวจจับผิดพลาด (Sensor Fault)</option>
                    </select>
                </div>
            </div>

            <!-- 5 Why Analysis -->
            <div class="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
                <span class="font-extrabold text-purple-900 text-xs block">❓ การวิเคราะห์ 5 Why Analysis (ถาม Why ต่อเนื่อง 5 ครั้ง)</span>
                <input type="text" name="why1" placeholder="Why 1: ทำไมเครื่องจักรถึงหยุดทำงาน? (เช่น มอเตอร์ตัดการทำงาน)" class="input input-bordered w-full bg-white">
                <input type="text" name="why2" placeholder="Why 2: ทำไมมอเตอร์ถึงตัดการทำงาน? (เช่น ความร้อนสูงเกินเกณฑ์)" class="input input-bordered w-full bg-white">
                <input type="text" name="why3" placeholder="Why 3: ทำไมความร้อนถึงสูงเกินเกณฑ์? (เช่น ตลับลูกปืนฝืดหมุนไม่สะดวก)" class="input input-bordered w-full bg-white">
                <input type="text" name="why4" placeholder="Why 4: ทำไมตลับลูกปืนถึงฝืด? (เช่น ขาดการอัดจารบีตามระยะ)" class="input input-bordered w-full bg-white">
                <input type="text" name="why5" placeholder="Why 5: ทำไมถึงขาดการอัดจารบี? (สาเหตุรากเหง้า: ไม่มีรายการเช็คชีทอัดจารบีในแผน PM)" class="input input-bordered w-full bg-white">
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onclick="document.getElementById('rcaModal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary bg-purple-700 hover:bg-purple-800 font-bold">บันทึกผลการวิเคราะห์ RCA</button>
            </div>
        </form>
    </div>
</div>

<?php renderFooter(); ?>
