<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/notification.php';
$pageTitle = 'Visual LINE Flex Message Studio Pro - CMMS-TPT';
$pdo = getDb();
$userId = (int)($_SESSION['user_id'] ?? 1);

$msg = '';
$error = '';

// Handle Sending Live Test Flex Message
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['send_test_flex'])) {
    try {
        $uStmt = $pdo->prepare("SELECT line_user_id, full_name FROM users WHERE id = ?");
        $uStmt->execute([$userId]);
        $currUser = $uStmt->fetch();

        if (empty($currUser['line_user_id'])) {
            $error = 'บัญชีของคุณยังไม่ได้ผูก LINE ID กรุณาผูกบัญชีในหน้า "ผูก LINE" ก่อนทดสอบยิงข้อความ';
        } else {
            $title = $_POST['flex_title'] ?? 'แจ้งเตือนงานซ่อม #WO-1002';
            $message = $_POST['flex_body'] ?? 'เครื่องจักร: Press Machine 01 | ความด่วน: Critical';
            $targetUrl = $_POST['flex_btn_url'] ?? publicBaseUrl() . '/pages/repair/view.php?id=1';

            $res = sendLinePushMessage($currUser['line_user_id'], $title, $message, $targetUrl);
            if ($res) {
                $msg = "ยิงข้อความ LINE Flex Message สดสำเร็จไปยังไลน์ของคุณ (" . htmlspecialchars($currUser['full_name']) . ") เรียบร้อย!";
            } else {
                $error = 'การส่ง LINE Push Message ไม่สำเร็จ กรุณาตรวจสอบ LINE Channel Access Token';
            }
        }
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

renderHeader();
?>

<div class="space-y-6">
    
    <!-- Top Header Banner -->
    <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
            <div class="flex items-center gap-2">
                <span class="badge bg-indigo-100 text-indigo-800 font-bold">Flex Studio Pro v3.0</span>
                <span class="text-xs text-emerald-600 font-bold">✨ Supported: 1-Click Templates, Photos, Sage 300 & KPI Badges</span>
            </div>
            <h1 class="text-2xl font-black text-slate-900 mt-1">📱 Visual LINE Flex Message Builder Studio Pro</h1>
            <p class="text-xs text-slate-500 mt-0.5">เลือกใช้แม่แบบสากล 4 แบบ หรือออกแบบการ์ดรูปภาพเปรียบเทียบก่อน-หลังซ่อม Real-time</p>
        </div>
        <div class="flex gap-2">
            <a href="../../bind_line.php" class="btn btn-secondary text-xs">📲 ผูกบัญชี LINE</a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-medium">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 font-medium font-bold">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- 1-Click Preset Template Selector -->
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <h3 class="font-bold text-slate-900 text-sm flex items-center justify-between">
            <span>⚡ เลือกใช้แม่แบบสำเร็จรูป 1-Click Preset Templates:</span>
            <span class="text-xs text-indigo-600 font-bold">4 Ready-to-Use Enterprise Templates</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <button type="button" onclick="loadPreset('breakdown')" class="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-left transition-all">
                <div class="text-xs font-black text-rose-700">🔴 1. แจ้งซ่อมด่วน (Emergency)</div>
                <p class="text-[11px] text-slate-600 mt-1">การ์ดแจ้งซ่อมฉุกเฉิน + รูปภาพความเสียหายก่อนซ่อม</p>
            </button>
            <button type="button" onclick="loadPreset('sage300')" class="p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-left transition-all">
                <div class="text-xs font-black text-purple-700">📦 2. อนุมัติเบิก Sage 300</div>
                <p class="text-[11px] text-slate-600 mt-1">การ์ดขออนุมัติเบิกอะไหล่ + ปุ่มอนุมัติจ่ายของ</p>
            </button>
            <button type="button" onclick="loadPreset('pm_am')" class="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-left transition-all">
                <div class="text-xs font-black text-amber-700">📋 3. เตือนแผน PM & Checksheet</div>
                <p class="text-[11px] text-slate-600 mt-1">การ์ดแจ้งเตือนแผน PM + ปุ่มกรอกเช็คชีท ISO</p>
            </button>
            <button type="button" onclick="loadPreset('completed')" class="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-left transition-all">
                <div class="text-xs font-black text-emerald-700">✅ 4. ซ่อมเสร็จแล้ว (Done)</div>
                <p class="text-[11px] text-slate-600 mt-1">การ์ดซ่อมเสร็จ + รูป Before/After & Cost</p>
            </button>
        </div>
    </div>

    <!-- Studio Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left Column: Controls & Dynamic Data Variables (2 cols wide) -->
        <div class="lg:col-span-2 space-y-6">

            <!-- Database Variables Palette -->
            <div class="card p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
                <h3 class="font-bold text-slate-900 text-sm flex items-center justify-between border-b pb-2">
                    <span>🗄️ ฟิลด์ข้อมูลจาก Database & รูปภาพ (คลิกเพื่อแทรก):</span>
                    <span class="text-xs text-indigo-600 font-bold">📷 Dynamic Variables</span>
                </h3>
                <div class="flex flex-wrap gap-2 text-xs">
                    <button onclick="insertVar('{before_image}')" class="px-2.5 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded font-mono font-bold">🖼️ {before_image} (รูปก่อนซ่อม)</button>
                    <button onclick="insertVar('{after_image}')" class="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded font-mono font-bold">🖼️ {after_image} (รูปหลังซ่อม)</button>
                    <button onclick="insertVar('{work_order_id}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{work_order_id}</button>
                    <button onclick="insertVar('{title}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{title}</button>
                    <button onclick="insertVar('{asset_name}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{asset_name}</button>
                    <button onclick="insertVar('{asset_code}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{asset_code}</button>
                    <button onclick="insertVar('{priority}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{priority}</button>
                    <button onclick="insertVar('{status}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{status}</button>
                    <button onclick="insertVar('{assigned_name}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{assigned_name}</button>
                    <button onclick="insertVar('{downtime_hours}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{downtime_hours}</button>
                    <button onclick="insertVar('{total_cost}')" class="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded font-mono font-bold">{total_cost}</button>
                </div>
            </div>

            <!-- Design Controls Form -->
            <form method="POST" class="card p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                <input type="hidden" name="send_test_flex" value="1">
                
                <h3 class="font-bold text-slate-900 text-sm border-b pb-2 flex justify-between">
                    <span>🎨 กำหนดค่าการออกแบบ Flex Card & รูปภาพ</span>
                    <span class="text-xs text-indigo-600 font-bold">Advanced Controls</span>
                </h3>

                <!-- Image Options -->
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                    <span class="font-bold text-slate-800 block">🖼️ โหมดการแสดงผลรูปภาพเครื่องจักร/การซ่อม:</span>
                    <div class="flex items-center gap-6">
                        <label class="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input type="radio" name="image_mode" id="img-mode-ba" value="before_after" checked onchange="updatePreview()">
                            <span>รูปเปรียบเทียบ ก่อนซ่อม vs หลังซ่อม (Before & After)</span>
                        </label>
                        <label class="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input type="radio" name="image_mode" id="img-mode-single" value="single" onchange="updatePreview()">
                            <span>รูปภาพอาการเสียเดี่ยว (Single Hero Photo)</span>
                        </label>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">สีแถบหัวข้อการ์ด (Theme Color)</label>
                        <select id="input-header-bg" onchange="updatePreview()" class="input input-bordered w-full">
                            <option value="#dc2626" selected>🔴 Red (#dc2626 - สำหรับแจ้งซ่อมด่วน Critical)</option>
                            <option value="#4f46e5">🔵 Indigo (#4f46e5 - มาตรฐาน CMMS)</option>
                            <option value="#7c3aed">🟣 Purple (#7c3aed - สำหรับ Sage 300)</option>
                            <option value="#16a34a">🟢 Green (#16a34a - สำหรับงานซ่อมเสร็จแล้ว Completed)</option>
                            <option value="#d97706">🟠 Amber (#d97706 - สำหรับงานเตือน PM/AM)</option>
                        </select>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ข้อความหัวการ์ด (Header Title)</label>
                        <input type="text" id="input-header-title" value="🚨 ใบแจ้งซ่อมวิศวกรรม #{work_order_id}" onkeyup="updatePreview()" class="input input-bordered w-full">
                    </div>
                </div>

                <div class="text-xs">
                    <label class="font-bold text-slate-700 block mb-1">รายละเอียดและสรุปข้อมูล (Body Content)</label>
                    <textarea id="input-body-text" rows="4" onkeyup="updatePreview()" class="input input-bordered w-full">เครื่องจักร: {asset_code} - {asset_name}
อาการเสีย: {title}
ความเร่งด่วน: {priority} | สถานะ: {status}
เวลา Downtime: {downtime_hours} ชม. | ค่าซ่อม: {total_cost} บาท
ช่างผู้ดูแล: {assigned_name}</textarea>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">ข้อความบนปุ่มกด (Action Button Label)</label>
                        <input type="text" id="input-btn-label" value="🔍 ดูรายละเอียดใบสั่งซ่อม & อนุมัติ" onkeyup="updatePreview()" class="input input-bordered w-full">
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 block mb-1">Action Target URL (ลิงก์เมื่อกดปุ่ม)</label>
                        <input type="text" name="flex_btn_url" id="input-btn-url" value="<?= publicBaseUrl() ?>/pages/repair/view.php?id=1" onkeyup="updatePreview()" class="input input-bordered w-full">
                    </div>
                </div>

                <input type="hidden" name="flex_title" id="hidden-flex-title">
                <input type="hidden" name="flex_body" id="hidden-flex-body">

                <div class="pt-2 flex justify-between items-center">
                    <button type="button" onclick="showToast('info', 'บันทึกรูปแบบ Flex Message Pro Template เรียบร้อย')" class="btn btn-secondary text-xs">💾 บันทึกเทมเพลต</button>
                    <button type="submit" class="btn btn-primary text-xs bg-emerald-600 border-emerald-600 hover:bg-emerald-700">🚀 ยิงทดสอบเข้า LINE มือถือจริง</button>
                </div>
            </form>

        </div>

        <!-- Right Column: Smartphone Flex Message Simulator Preview -->
        <div class="space-y-4">
            <h3 class="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>📱 พรีวิวบนแอป LINE (Live Preview Pro)</span>
                <span class="text-xs text-emerald-600 font-bold">Live Flex Container</span>
            </h3>

            <!-- Smartphone Frame mockup -->
            <div class="bg-slate-900 p-4 rounded-3xl shadow-2xl border-4 border-slate-800 max-w-sm mx-auto">
                
                <!-- LINE Chat Window Screen -->
                <div class="bg-[#8cabd9] rounded-2xl p-3 min-h-[480px] space-y-3 font-sans">
                    
                    <div class="text-center text-[10px] text-white/80 font-bold">วันนี้ <?= date('H:i') ?></div>

                    <!-- LINE Flex Message Bubble Container -->
                    <div class="bg-white rounded-xl shadow-md overflow-hidden max-w-[270px] text-xs">
                        
                        <!-- Flex Header -->
                        <div id="preview-header-bg" class="bg-rose-600 text-white p-3 font-bold text-sm flex items-center justify-between">
                            <span id="preview-header-title">🚨 ใบแจ้งซ่อม #WO-1002</span>
                            <span id="preview-header-badge" class="bg-white/20 text-white text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase">CRITICAL</span>
                        </div>

                        <!-- Before & After Photos Container -->
                        <div id="preview-photos-container" class="p-2 bg-slate-100 border-b border-slate-200">
                            <div class="grid grid-cols-2 gap-1.5">
                                <div class="relative rounded overflow-hidden border border-rose-300 bg-white">
                                    <img src="https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=300&q=80" class="w-full h-20 object-cover">
                                    <span class="absolute bottom-0 left-0 right-0 bg-rose-600/90 text-white text-[8px] font-black text-center py-0.5 uppercase">ก่อนซ่อม (BEFORE)</span>
                                </div>
                                <div class="relative rounded overflow-hidden border border-emerald-300 bg-white">
                                    <img src="https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=300&q=80" class="w-full h-20 object-cover">
                                    <span class="absolute bottom-0 left-0 right-0 bg-emerald-600/90 text-white text-[8px] font-black text-center py-0.5 uppercase">หลังซ่อม (AFTER)</span>
                                </div>
                            </div>
                        </div>

                        <!-- Single Photo Container (Hidden by default) -->
                        <div id="preview-single-photo" style="display:none;" class="bg-slate-100 border-b border-slate-200">
                            <img src="https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80" class="w-full h-28 object-cover">
                        </div>

                        <!-- Flex Body -->
                        <div class="p-3 space-y-2 text-slate-700 font-medium leading-relaxed">
                            <div id="preview-body-text" class="whitespace-pre-wrap text-xs">
เครื่องจักร: MCH-01 - Press Machine 01
อาการเสีย: มีเสียงดังผิดปกติที่มอเตอร์
ความเร่งด่วน: CRITICAL | สถานะ: IN_PROGRESS
เวลา Downtime: 2.5 ชม. | ค่าซ่อม: 4,500 บาท
ช่างผู้ดูแล: สมศักดิ์ ช่างซ่อมบำรุง
                            </div>
                        </div>

                        <!-- Flex Footer Buttons -->
                        <div class="p-2 border-t border-slate-100 bg-slate-50 space-y-1.5">
                            <a id="preview-btn-label" href="#" onclick="return false;" class="block w-full py-2 bg-indigo-600 text-white text-center rounded-lg font-bold text-xs shadow-sm hover:bg-indigo-700">
                                🔍 ดูรายละเอียดใบสั่งซ่อม & อนุมัติ
                            </a>
                        </div>
                    </div>

                </div>

            </div>
        </div>

    </div>
</div>

<script>
let lastActiveInput = document.getElementById('input-body-text');

document.getElementById('input-header-title').addEventListener('focus', function() { lastActiveInput = this; });
document.getElementById('input-body-text').addEventListener('focus', function() { lastActiveInput = this; });

function loadPreset(type) {
    if (type === 'breakdown') {
        document.getElementById('input-header-bg').value = '#dc2626';
        document.getElementById('input-header-title').value = '🚨 ใบแจ้งซ่อมฉุกเฉิน #{work_order_id}';
        document.getElementById('input-body-text').value = `เครื่องจักร: {asset_code} - {asset_name}\nอาการเสีย: {title}\nความเร่งด่วน: {priority} | สถานะ: {status}\nผู้แจ้งซ่อม: ประสิทธิ์ ผู้ควบคุม`;
        document.getElementById('input-btn-label').value = '⚡ รับงานซ่อมด่วน';
        document.getElementById('img-mode-single').checked = true;
    } else if (type === 'sage300') {
        document.getElementById('input-header-bg').value = '#7c3aed';
        document.getElementById('input-header-title').value = '📦 ขออนุมัติเบิกอะไหล่ Sage 300 #{work_order_id}';
        document.getElementById('input-body-text').value = `ใบสั่งซ่อม: #{work_order_id}\nรายการอะไหล่: Bearing 6204 (จำนวน 2 ชิ้น)\nผู้ขอเบิก: สมศักดิ์ ช่างซ่อม\nคลังตัดยอด: Sage 300 IC Main Store`;
        document.getElementById('input-btn-label').value = '✔ กดอนุมัติการเบิก (Approve)';
        document.getElementById('img-mode-single').checked = true;
    } else if (type === 'pm_am') {
        document.getElementById('input-header-bg').value = '#d97706';
        document.getElementById('input-header-title').value = '📋 เตือนแผนงาน PM ประจำสัปดาห์ #{work_order_id}';
        document.getElementById('input-body-text').value = `เครื่องจักร: {asset_code} - {asset_name}\nแผนงาน: ตรวจสอบระดับน้ำมันหล่อลื่นและระบบลม\nกำหนดเสร็จ: {created_at}\nช่างผู้รับผิดชอบ: {assigned_name}`;
        document.getElementById('input-btn-label').value = '📝 เปิดกรอกแบบฟอร์มเช็คชีท ISO (F-EN-02)';
        document.getElementById('img-mode-single').checked = true;
    } else if (type === 'completed') {
        document.getElementById('input-header-bg').value = '#16a34a';
        document.getElementById('input-header-title').value = '✅ ซ่อมเสร็จเรียบร้อย #{work_order_id}';
        document.getElementById('input-body-text').value = `เครื่องจักร: {asset_code} - {asset_name}\nเวลา Downtime ทั้งหมด: {downtime_hours} ชม.\nสรุปค่าซ่อมรวม: {total_cost} บาท\nช่างผู้ปิดงาน: {assigned_name}`;
        document.getElementById('input-btn-label').value = '📊 ประเมินผลงาน & ปิดใบสั่งซ่อม';
        document.getElementById('img-mode-ba').checked = true;
    }
    updatePreview();
    showToast('success', 'โหลดแม่แบบสำเร็จรูปเรียบร้อยแล้ว!');
}

function insertVar(variableStr) {
    if (lastActiveInput) {
        const start = lastActiveInput.selectionStart;
        const end = lastActiveInput.selectionEnd;
        const val = lastActiveInput.value;
        lastActiveInput.value = val.substring(0, start) + variableStr + val.substring(end);
        lastActiveInput.focus();
        lastActiveInput.selectionStart = lastActiveInput.selectionEnd = start + variableStr.length;
        updatePreview();
    }
}

function updatePreview() {
    const bg = document.getElementById('input-header-bg').value;
    const title = document.getElementById('input-header-title').value;
    const body = document.getElementById('input-body-text').value;
    const btnLabel = document.getElementById('input-btn-label').value;

    const imgMode = document.querySelector('input[name="image_mode"]:checked').value;
    if (imgMode === 'before_after') {
        document.getElementById('preview-photos-container').style.display = 'block';
        document.getElementById('preview-single-photo').style.display = 'none';
    } else {
        document.getElementById('preview-photos-container').style.display = 'none';
        document.getElementById('preview-single-photo').style.display = 'block';
    }

    document.getElementById('preview-header-bg').style.backgroundColor = bg;
    document.getElementById('preview-header-title').innerText = title.replace(/{work_order_id}/g, 'WO-1002');
    document.getElementById('preview-body-text').innerText = body
        .replace(/{before_image}/g, '[รูปภาพก่อนซ่อม]')
        .replace(/{after_image}/g, '[รูปภาพหลังซ่อม]')
        .replace(/{work_order_id}/g, 'WO-1002')
        .replace(/{title}/g, 'เสียงดังผิดปกติที่มอเตอร์')
        .replace(/{asset_code}/g, 'MCH-01')
        .replace(/{asset_name}/g, 'Press Machine 01')
        .replace(/{priority}/g, 'CRITICAL')
        .replace(/{status}/g, 'IN_PROGRESS')
        .replace(/{downtime_hours}/g, '2.5')
        .replace(/{total_cost}/g, '4,500')
        .replace(/{assigned_name}/g, 'สมศักดิ์ ช่างซ่อมบำรุง');

    document.getElementById('preview-btn-label').innerText = btnLabel;

    document.getElementById('hidden-flex-title').value = title;
    document.getElementById('hidden-flex-body').value = body;
}

document.addEventListener('DOMContentLoaded', updatePreview);
</script>

<?php renderFooter(); ?>
