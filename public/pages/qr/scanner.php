<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ระบบสแกน QR Code เครื่องจักรและอะไหล่ (Live Camera QR Scanner) — CMMS-TOPPAN';
renderHeader();
?>

<!-- HTML5 QR Code Scanner Library -->
<script src="https://unpkg.com/html5-qrcode"></script>

<div class="max-w-3xl mx-auto space-y-6">

    <!-- Header Panel -->
    <div class="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Mobile Live Camera Scanner</span>
            <h1 class="text-2xl font-black mt-1">📱 ระบบสแกน QR Code เครื่องจักรและอะไหล่สด</h1>
            <p class="text-xs text-blue-100 mt-1">บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด (TOPPAN)</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📷</div>
    </div>

    <!-- Live Camera Scanner Card -->
    <div class="card p-6 shadow-lg space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
            <span class="font-extrabold text-primary text-base">กล้องสแกน QR Code (Scan Tag Code)</span>
            <span id="scanStatus" class="badge badge badge-success font-bold text-xs">พร้อมสแกน</span>
        </div>

        <!-- Camera Render Box -->
        <div id="qr-reader" class="w-full rounded-xl overflow-hidden border-2 border-indigo-500 bg-slate-900 min-h-[300px]"></div>

        <!-- Scan Result Action Dialog -->
        <div id="scanResultBox" class="hidden p-5 bg-indigo-50 border-2 border-indigo-300 rounded-2xl space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-indigo-700">ผลการสแกน QR CODE:</span>
                <span id="scannedCode" class="card font-mono text-lg font-black text-indigo-900 px-3 py-1 border border-indigo-200"></span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                <a id="btnReportRepair" href="#" class="btn btn-primary bg-rose-600 border-rose-600 hover:bg-rose-700 text-xs font-black py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md">
                    <span>🛠️ แจ้งซ่อมด่วน</span>
                </a>
                <a id="btnAssetHistory" href="#" class="btn btn-primary bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-xs font-black py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md">
                    <span>📑 ดูบัตร F-EN-01</span>
                </a>
                <a id="btnPMChecksheet" href="#" class="btn btn-primary bg-emerald-600 border-emerald-600 hover:bg-emerald-700 text-xs font-black py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md">
                    <span>📋 เช็คชีท PM</span>
                </a>
            </div>
        </div>
    </div>

</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    const html5QrCode = new Html5Qrcode("qr-reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            // QR Code Scanned Successfully!
            document.getElementById('scannedCode').textContent = decodedText;
            document.getElementById('scanResultBox').classList.remove('hidden');

            document.getElementById('btnReportRepair').href = '/pages/repair/request.php?machineName=' + encodeURIComponent(decodedText);
            document.getElementById('btnAssetHistory').href = '/pages/asset_registry/history.php?code=' + encodeURIComponent(decodedText);
            document.getElementById('btnPMChecksheet').href = '/pages/pm_am/checksheet.php?code=' + encodeURIComponent(decodedText);

            Swal.fire({
                title: '🎉 สแกนพบรหัส: ' + decodedText,
                text: 'กรุณาเลือกรายการที่ต้องการดำเนินการด้านล่าง',
                icon: 'success',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        },
        (errorMessage) => {
            // Scanning in progress
        }
    ).catch(err => {
        console.log("Camera access soft notice:", err);
        document.getElementById('qr-reader').innerHTML = `
            <div class="p-8 text-center text-muted font-bold space-y-2">
                <div class="text-4xl">📷</div>
                <p>กรุณาอนุญาตสิทธิ์การใช้งานกล้องบนมือถือ หรือพิมพ์รหัสเครื่องจักรในช่องด้านล่าง</p>
                <div class="pt-2 flex justify-center gap-2">
                    <input type="text" id="manualCode" placeholder="เช่น MCH-001, A-PT-01" class="px-4 py-2 border rounded-xl font-mono text-sm text-primary" />
                    <button type="button" onclick="manualSimulateScan()" class="btn btn-primary text-xs font-bold">ตกลง</button>
                </div>
            </div>
        `;
    });
});

function manualSimulateScan() {
    const val = document.getElementById('manualCode').value.trim();
    if (!val) return;
    document.getElementById('scannedCode').textContent = val;
    document.getElementById('scanResultBox').classList.remove('hidden');
    document.getElementById('btnReportRepair').href = '/pages/repair/request.php?machineName=' + encodeURIComponent(val);
    document.getElementById('btnAssetHistory').href = '/pages/asset_registry/history.php?code=' + encodeURIComponent(val);
    document.getElementById('btnPMChecksheet').href = '/pages/pm_am/checksheet.php?code=' + encodeURIComponent(val);
}
</script>

<?php renderFooter(); ?>
