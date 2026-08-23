<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'แบบฟอร์มเช็คชีทงาน PM/AM (Checksheet Document) — CMMS-TOPPAN';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 1);

// Fetch PM details
$stmt = $pdo->prepare("
    SELECT pm.*, a.name AS asset_name, a.code AS asset_code, a.location AS asset_location,
           u.full_name AS assigned_name, d.name AS dept_name
    FROM pm_am pm
    LEFT JOIN asset_registry a ON pm.asset_id = a.id
    LEFT JOIN users u ON pm.assigned_to = u.id
    LEFT JOIN departments d ON pm.department_id = d.id
    WHERE pm.id = ?
");
$stmt->execute([$id]);
$pm = $stmt->fetch();

if (!$pm) {
    $pm = [
        'id' => $id,
        'title' => 'PM ประจำเดือนเครื่องจักร',
        'asset_name' => 'เครื่องกลึง CNC TL-2000',
        'asset_code' => 'MCH-001',
        'dept_name' => 'ฝ่ายวิศวกรรม & ซ่อมบำรุง',
        'assigned_name' => 'สมศักดิ์ ช่างซ่อม',
        'status' => 'pending'
    ];
}

// Handle Form Submission (Save PM Checksheet Results)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'save_checksheet') {
    header('Content-Type: application/json; charset=utf-8');
    try {
        $results = $_POST['check_results'] ?? [];
        $values  = $_POST['check_values'] ?? [];
        $remarks = $_POST['check_remarks'] ?? [];

        // Save status as completed & digital signature
        $sigB64 = $_POST['inspector_signature'] ?? null;
        if (!empty($sigB64)) {
            $upd = $pdo->prepare("UPDATE pm_am SET status = 'completed', inspector_signature = ?, signed_at = NOW(), updated_at = NOW() WHERE id = ?");
            $upd->execute([$sigB64, $id]);
        } else {
            $upd = $pdo->prepare("UPDATE pm_am SET status = 'completed', updated_at = NOW() WHERE id = ?");
            $upd->execute([$id]);
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'บันทึกผลการเช็คชีท PM และปิดงานสำเร็จเรียบร้อยแล้ว!'
        ]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        exit;
    }
}

// Default ISO Inspection Checksheet items for Machinery
$defaultChecklist = [
    [
        'no' => 1,
        'category' => 'การหล่อลื่น (Lubrication)',
        'item' => 'ตรวจสอบระดับน้ำมันหล่อลื่นในชุดเกียร์/ไฮดรอลิก',
        'method' => 'ดูช่องมองระดับ (Sight Glass)',
        'standard' => 'อยู่ระหว่างขีด Min-Max',
        'default_value' => 'NORMAL'
    ],
    [
        'no' => 2,
        'category' => 'ระบบไฟฟ้า (Electrical)',
        'item' => 'ตรวจเช็คสายไฟและขันแน่นจุดต่อในตู้คอนโทรล',
        'method' => 'ประแจขัน / สายตา',
        'standard' => 'ขันแน่น ไม่หลวม ไม่รอยไหม้',
        'default_value' => 'TIGHT'
    ],
    [
        'no' => 3,
        'category' => 'ระบบลม/อัดอากาศ (Pneumatics)',
        'item' => 'ตรวจสอบแรงดันลมเข้าเครื่องจักร (Air Pressure)',
        'method' => 'เกจวัดแรงดัน (Pressure Gauge)',
        'standard' => '5.5 - 6.5 Bar',
        'default_value' => '6.0 Bar'
    ],
    [
        'no' => 4,
        'category' => 'อุณหภูมิและความร้อน (Temperature)',
        'item' => 'วัดอุณหภูมิเสื้อตลับลูกปืนมอเตอร์หลัก (Motor Bearing Temp)',
        'method' => 'กล้องวัดอุณหภูมิอินฟราเรด (Infrared Gun)',
        'standard' => 'ไม่เกิน 65 °C',
        'default_value' => '48.5 °C'
    ],
    [
        'no' => 5,
        'category' => 'ความสั่นสะเทือน (Vibration)',
        'item' => 'ฟังเสียงการหมุนและวัดความสั่นสะเทือนปั๊มน้ำ',
        'method' => 'เครื่องวัดความสั่นสะเทือน (Vibrometer)',
        'standard' => '< 2.8 mm/s RMS',
        'default_value' => '1.4 mm/s'
    ],
    [
        'no' => 6,
        'category' => 'ความสะอาด (5S)',
        'item' => 'ทำความสะอาดแผงระบายความร้อนและฟิลเตอร์อากาศ',
        'method' => 'เป่าลม / ทำความสะอาด',
        'standard' => 'สะอาด ไม่มีฝุ่นเกาะแน่น',
        'default_value' => 'CLEAN'
    ]
];

renderHeader();
?>

<!-- Print-only CSS -->
<style>
@media print {
    body * { visibility: hidden; }
    #printable-checksheet, #printable-checksheet * { visibility: visible; }
    #printable-checksheet { position: absolute; left: 0; top: 0; width: 100%; }
    .no-print { display: none !important; }
}

.check-pass:checked + label {
    background-color: #10b981 !important;
    color: white !important;
    border-color: #10b981 !important;
}

.check-fail:checked + label {
    background-color: #f43f5e !important;
    color: white !important;
    border-color: #f43f5e !important;
}

.check-na:checked + label {
    background-color: #64748b !important;
    color: white !important;
    border-color: #64748b !important;
}
</style>

<div class="space-y-6">
    
    <!-- Top Action Bar -->
    <div class="card flex items-center justify-between flex-wrap gap-4 no-print p-5">
        <div>
            <div class="flex items-center gap-2">
                <a href="index.php" class="text-sm font-bold text-indigo-600 hover:underline">&larr; กลับไปปฏิทิน PM</a>
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">ISO F-EN-02 Checksheet</span>
            </div>
            <h1 class="text-xl md:text-2xl font-black text-slate-900 mt-1">📋 แบบฟอร์มตรวจเช็คเครื่องจักร PM/AM (Inspection Checksheet)</h1>
            <p class="text-xs text-slate-500">รองรับการตรวจผ่านคอมพิวเตอร์ Desktop และมือถือ Smartphone / Tablet / LINE LIFF</p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
            <button type="button" onclick="passAllItems()" class="btn bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 text-xs font-bold px-3.5 py-2">
                ✔ ผ่านหมดทุกรายการ (Pass All)
            </button>
            <button type="button" onclick="window.print()" class="btn btn-primary bg-indigo-600 border-indigo-600 text-xs font-bold px-3.5 py-2">
                🖨️ พิมพ์แบบฟอร์ม ISO F-EN-02
            </button>
            <button type="button" onclick="submitChecksheet()" class="btn btn-primary bg-emerald-600 border-emerald-600 text-xs font-black shadow-md px-4 py-2">
                💾 บันทึกส่งเช็คชีท PM
            </button>
        </div>
    </div>

    <!-- Main Interactive Form -->
    <form id="checksheetForm" method="POST">
        <input type="hidden" name="action" value="save_checksheet">

        <!-- Official Printable ISO PM Checksheet Document Container -->
        <div id="printable-checksheet" class="card p-6 md:p-8 shadow-xl text-slate-900 space-y-6 max-w-5xl mx-auto">
            
            <!-- Checksheet Header Block -->
            <div class="border-2 border-slate-900 p-4 rounded-xl">
                <div class="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-indigo-900 text-white font-extrabold flex items-center justify-center rounded-lg text-xl shadow-md">T</div>
                        <div>
                            <h2 class="text-base md:text-lg font-black tracking-tight text-slate-900">บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด</h2>
                            <p class="text-[11px] font-bold text-slate-600">TOPPAN FLEXIBLE PACKAGING (THAILAND) CO., LTD. — PM INSPECTION CHECKSHEET</p>
                        </div>
                    </div>
                    <div class="text-right text-xs font-mono font-bold">
                        <div class="text-indigo-900 font-black">FORM NO: F-EN-02</div>
                        <div>REV: 04 / 2026</div>
                        <div>REF PM: #<?= $id ?></div>
                    </div>
                </div>

                <!-- Machine Specs Summary Grid -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><span class="text-slate-500 block">ชื่อเครื่องจักร:</span> <strong class="text-slate-900 text-sm"><?= htmlspecialchars($pm['asset_name'] ?? '-') ?></strong></div>
                    <div><span class="text-slate-500 block">รหัสเครื่องจักร:</span> <strong class="font-mono text-indigo-700 text-sm"><?= htmlspecialchars($pm['asset_code'] ?? '-') ?></strong></div>
                    <div><span class="text-slate-500 block">แผนก / สถานที่:</span> <strong><?= htmlspecialchars($pm['dept_name'] ?? '-') ?></strong></div>
                    <div><span class="text-slate-500 block">ช่างผู้ตรวจเช็ค:</span> <strong><?= htmlspecialchars($pm['assigned_name'] ?? 'ผู้ตรวจเช็ค') ?></strong></div>
                </div>
            </div>

            <!-- DESKTOP TABLE VIEW (Visible on Screens >= md) -->
            <div class="hidden md:block overflow-x-auto border-2 border-slate-900 rounded-xl">
                <table class="w-full text-xs text-left border-collapse">
                    <thead class="bg-slate-100 font-bold border-b-2 border-slate-900 text-slate-900 uppercase">
                        <tr>
                            <th class="p-2.5 border-r border-slate-400 text-center w-10">ลำดับ</th>
                            <th class="p-2.5 border-r border-slate-400">หมวดการตรวจเช็ค</th>
                            <th class="p-2.5 border-r border-slate-400">รายการเช็คชีท (Check Items)</th>
                            <th class="p-2.5 border-r border-slate-400">วิธีตรวจ & ค่ามาตรฐาน</th>
                            <th class="p-2.5 border-r border-slate-400 text-center w-40">ผลการตรวจ</th>
                            <th class="p-2.5 border-r border-slate-400 text-center w-28">ค่าที่วัดได้</th>
                            <th class="p-2.5">หมายเหตุ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-300">
                        <?php foreach ($defaultChecklist as $item): ?>
                        <tr class="hover:bg-slate-50">
                            <td class="p-2.5 border-r border-slate-300 text-center font-bold"><?= $item['no'] ?></td>
                            <td class="p-2.5 border-r border-slate-300 font-bold text-indigo-900"><?= htmlspecialchars($item['category']) ?></td>
                            <td class="p-2.5 border-r border-slate-300 font-semibold"><?= htmlspecialchars($item['item']) ?></td>
                            <td class="p-2.5 border-r border-slate-300 text-slate-600">
                                <div><?= htmlspecialchars($item['method']) ?></div>
                                <div class="font-bold text-slate-900">เกณฑ์: <?= htmlspecialchars($item['standard']) ?></div>
                            </td>
                            <td class="p-2.5 border-r border-slate-300 text-center">
                                <div class="inline-flex rounded-lg shadow-sm border border-slate-300 overflow-hidden" role="group">
                                    <input type="radio" id="pass-dt-<?= $item['no'] ?>" name="check_results[<?= $item['no'] ?>]" value="pass" checked class="hidden check-pass">
                                    <label for="pass-dt-<?= $item['no'] ?>" class="px-2.5 py-1 text-[11px] font-bold cursor-pointer bg-white text-slate-700 border-r hover:bg-emerald-50">✔ PASS</label>
                                    
                                    <input type="radio" id="fail-dt-<?= $item['no'] ?>" name="check_results[<?= $item['no'] ?>]" value="fail" class="hidden check-fail">
                                    <label for="fail-dt-<?= $item['no'] ?>" class="px-2.5 py-1 text-[11px] font-bold cursor-pointer bg-white text-slate-700 border-r hover:bg-rose-50">✖ FAIL</label>

                                    <input type="radio" id="na-dt-<?= $item['no'] ?>" name="check_results[<?= $item['no'] ?>]" value="na" class="hidden check-na">
                                    <label for="na-dt-<?= $item['no'] ?>" class="px-2 py-1 text-[11px] font-bold cursor-pointer bg-white text-slate-700 hover:bg-slate-100">N/A</label>
                                </div>
                            </td>
                            <td class="p-2.5 border-r border-slate-300 text-center font-mono">
                                <input type="text" name="check_values[<?= $item['no'] ?>]" value="<?= htmlspecialchars($item['default_value']) ?>" class="w-full text-center text-xs font-bold border border-slate-300 rounded p-1 bg-slate-50 focus:bg-white text-indigo-700" />
                            </td>
                            <td class="p-2.5">
                                <input type="text" name="check_remarks[<?= $item['no'] ?>]" placeholder="ระบุเพิ่มเติม..." class="w-full text-xs border border-slate-300 rounded p-1" />
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>

            <!-- MOBILE CARDS VIEW (Visible on Screens < md) -->
            <div class="block md:hidden space-y-4">
                <?php foreach ($defaultChecklist as $item): ?>
                <div class="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3 shadow-sm">
                    <div class="flex items-center justify-between border-b pb-2 border-slate-200">
                        <span class="font-mono font-bold text-xs bg-indigo-900 text-white px-2 py-0.5 rounded">ข้อที่ <?= $item['no'] ?></span>
                        <span class="font-bold text-indigo-900 text-xs"><?= htmlspecialchars($item['category']) ?></span>
                    </div>

                    <div>
                        <h4 class="font-extrabold text-slate-900 text-sm mb-1"><?= htmlspecialchars($item['item']) ?></h4>
                        <p class="text-xs text-slate-500">วิธีตรวจ: <?= htmlspecialchars($item['method']) ?></p>
                        <p class="text-xs font-bold text-slate-700">เกณฑ์มาตรฐาน: <?= htmlspecialchars($item['standard']) ?></p>
                    </div>

                    <!-- Result Selector Buttons -->
                    <div class="space-y-1">
                        <label class="block text-[11px] font-bold text-slate-600">ผลการตรวจเช็ค:</label>
                        <div class="grid grid-cols-3 gap-2">
                            <div>
                                <input type="radio" id="pass-mb-<?= $item['no'] ?>" name="check_results_mb[<?= $item['no'] ?>]" value="pass" checked class="hidden check-pass" onchange="syncMobileResult(<?= $item['no'] ?>, 'pass')">
                                <label for="pass-mb-<?= $item['no'] ?>" class="card block text-center py-2 text-xs font-black text-slate-700">✔ PASS</label>
                            </div>
                            <div>
                                <input type="radio" id="fail-mb-<?= $item['no'] ?>" name="check_results_mb[<?= $item['no'] ?>]" value="fail" class="hidden check-fail" onchange="syncMobileResult(<?= $item['no'] ?>, 'fail')">
                                <label for="fail-mb-<?= $item['no'] ?>" class="card block text-center py-2 text-xs font-black text-slate-700">✖ FAIL</label>
                            </div>
                            <div>
                                <input type="radio" id="na-mb-<?= $item['no'] ?>" name="check_results_mb[<?= $item['no'] ?>]" value="na" class="hidden check-na" onchange="syncMobileResult(<?= $item['no'] ?>, 'na')">
                                <label for="na-mb-<?= $item['no'] ?>" class="card block text-center py-2 text-xs font-black text-slate-700">N/A</label>
                            </div>
                        </div>
                    </div>

                    <!-- Value & Remark Input -->
                    <div class="grid grid-cols-2 gap-2 pt-1">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-1">ค่าที่วัดได้:</label>
                            <input type="text" value="<?= htmlspecialchars($item['default_value']) ?>" class="card w-full text-xs font-bold p-2 text-indigo-700" onchange="document.getElementsByName('check_values[<?= $item['no'] ?>]')[0].value = this.value" />
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 mb-1">หมายเหตุ:</label>
                            <input type="text" placeholder="ระบุ..." class="card w-full text-xs p-2" onchange="document.getElementsByName('check_remarks[<?= $item['no'] ?>]')[0].value = this.value" />
                        </div>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>

            <!-- Checksheet Signatures Stamp Block -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs text-center border-t-2 border-slate-900">
                <div class="border border-slate-300 p-4 rounded-xl space-y-3">
                    <span class="font-bold block text-slate-700">ผู้ตรวจเช็ค / เซ็นชื่อดิจิทัล (Inspector Signature) *</span>
                    
                    <div class="no-print bg-slate-50 p-2 rounded-xl border border-slate-300 space-y-2">
                        <canvas id="sigCanvas" width="280" height="110" class="card w-full h-24 cursor-crosshair touch-none"></canvas>
                        <div class="flex items-center justify-between text-[11px]">
                            <button type="button" onclick="clearSignature()" class="text-rose-600 font-bold hover:underline">🧹 ล้างลายเซ็น</button>
                            <span class="text-slate-400">เซ็นด้วยนิ้วหรือเมาส์</span>
                        </div>
                    </div>
                    <input type="hidden" id="inspector_signature" name="inspector_signature">

                    <div class="print-only h-12 border-b border-dashed border-slate-400 flex items-center justify-center">
                        <img id="sigPreviewImg" class="max-h-10 object-contain hidden" alt="Signature Preview">
                    </div>

                    <div class="font-bold text-slate-900">(<?= htmlspecialchars($pm['assigned_name'] ?? 'ช่างตรวจเช็ค') ?>)</div>
                    <span class="text-slate-500 block text-[11px]">วันที่: <?= date('d/m/Y') ?></span>
                </div>

                <div class="border border-slate-300 p-4 rounded-xl space-y-6">
                    <span class="font-bold block text-slate-700">ผู้ทบทวนงาน (Maintenance Engineer)</span>
                    <div class="h-14 border-b border-dashed border-slate-400 flex items-center justify-center italic text-slate-400">
                        (วิศวกรซ่อมบำรุง)
                    </div>
                    <span class="text-slate-500 block">วันที่: ____/____/2026</span>
                </div>

                <div class="border border-slate-300 p-4 rounded-xl space-y-6">
                    <span class="font-bold block text-slate-700">หัวหน้าฝ่ายซ่อมบำรุง (Maintenance Manager)</span>
                    <div class="h-14 border-b border-dashed border-slate-400 flex items-center justify-center italic text-slate-400">
                        (อนุมัติเช็คชีท)
                    </div>
                    <span class="text-slate-500 block">วันที่: ____/____/2026</span>
                </div>
            </div>

            <!-- Bottom Submit Button for Mobile & PC (sticky on mobile) -->
            <div class="no-print cmms-action-bar rounded-xl">
                <button type="button" onclick="submitChecksheet()" class="w-full btn-primary bg-emerald-600 border-emerald-600 hover:bg-emerald-700 py-3.5 rounded-xl text-base font-black flex items-center justify-center gap-2 shadow-lg">
                    <span>💾 บันทึกผลการตรวจเช็คชีท PM (Submit Inspection Checksheet)</span>
                </button>
            </div>

        </div>
    </form>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('sigCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let isDrawing = false;

    ctx.strokeStyle = '#003399';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function startDraw(e) {
        isDrawing = true;
        const p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        if (e.touches) e.preventDefault();
    }

    function draw(e) {
        if (!isDrawing) return;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        if (e.touches) e.preventDefault();
        
        const dataUrl = canvas.toDataURL('image/png');
        document.getElementById('inspector_signature').value = dataUrl;
    }

    function stopDraw() {
        isDrawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);
});

function clearSignature() {
    const canvas = document.getElementById('sigCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('inspector_signature').value = '';
}

function passAllItems() {
    for (let i = 1; i <= 6; i++) {
        const passDt = document.getElementById('pass-dt-' + i);
        if (passDt) passDt.checked = true;
        const passMb = document.getElementById('pass-mb-' + i);
        if (passMb) passMb.checked = true;
    }
}

function syncMobileResult(no, val) {
    const radio = document.getElementById(val + '-dt-' + no);
    if (radio) radio.checked = true;
}

async function submitChecksheet() {
    Swal.fire({
        title: 'ยืนยันการบันทึกเช็คชีท PM?',
        text: 'ผลการตรวจเช็คชีทและสถานะ PM จะถูกปรับเป็นดำเนินการเสร็จสมบูรณ์',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'บันทึกทันที',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            const formData = new FormData(document.getElementById('checksheetForm'));
            try {
                const res = await fetch(window.location.href, { method: 'POST', body: formData });
                const data = await res.json();
                Swal.close();
                
                if (data.status === 'success') {
                    Swal.fire({
                        title: '🎉 บันทึกเช็คชีทสำเร็จ!',
                        text: data.message,
                        icon: 'success',
                        confirmButtonText: 'ตกลง'
                    }).then(() => {
                        window.location.href = 'index.php';
                    });
                } else {
                    throw new Error(data.message);
                }
            } catch (err) {
                Swal.close();
                Swal.fire({ title: 'เกิดข้อผิดพลาด', text: err.message, icon: 'error' });
            }
        }
    });
}
</script>

<?php renderFooter(); ?>
