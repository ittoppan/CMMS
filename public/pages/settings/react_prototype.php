<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '⚛️ Interactive React + Tailwind Component Wireframe Sandbox — CMMS-TOPPAN';
renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Production-Ready React & Tailwind Wireframe Prototype</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">React Wireframe</span>
            </div>
            <h1 class="text-2xl font-black">⚛️ ต้นแบบ UI Wireframe ระบบ CMMS-TOPPAN (React + Tailwind + Lucide)</h1>
            <p class="text-xs text-blue-100 mt-1">หน้าจำลองต้นแบบคอมโพเนนต์ React (Component Sandbox) ครอบคลุม Mobile PWA และ Desktop Web App</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">⚛️</div>
    </div>

    <!-- Wireframe View Switcher Tabs -->
    <div class="flex gap-2 border-b border-line  pb-3">
        <button onclick="showView('desktop')" id="btn-desktop" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2">
            🖥️ Desktop View (สำหรับวิศวกร & ผู้บริหาร)
        </button>
        <button onclick="showView('mobile')" id="btn-mobile" class="px-4 py-2 bg-muted  text-secondary  rounded-xl text-xs font-bold flex items-center gap-2">
            📱 Mobile PWA View (สำหรับช่างหน้างาน)
        </button>
    </div>

    <!-- Desktop View Wireframe Container -->
    <div id="view-desktop" class="space-y-6">
        <!-- Reusable KPI Cards Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="card p-5 space-y-2">
                <div class="flex justify-between items-center text-xs text-muted font-bold">
                    <span>AVAILABILITY %</span>
                    <span class="text-emerald-500 font-black">↗ +1.2%</span>
                </div>
                <div class="text-2xl font-black text-primary dark:text-white">98.5%</div>
                <div class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div class="bg-indigo-600 h-full w-[98.5%]"></div>
                </div>
            </div>

            <div class="card p-5 space-y-2">
                <div class="flex justify-between items-center text-xs text-muted font-bold">
                    <span>MTBF (MEAN TIME BETWEEN FAILURES)</span>
                    <span class="text-emerald-500 font-black">↗ +14 hrs</span>
                </div>
                <div class="text-2xl font-black text-primary dark:text-white">142.5 hrs</div>
                <div class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div class="bg-purple-600 h-full w-[85%]"></div>
                </div>
            </div>

            <div class="card p-5 space-y-2">
                <div class="flex justify-between items-center text-xs text-muted font-bold">
                    <span>MTTR (MEAN TIME TO REPAIR)</span>
                    <span class="text-emerald-500 font-black">↘ -8 mins</span>
                </div>
                <div class="text-2xl font-black text-primary dark:text-white">45.2 mins</div>
                <div class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div class="bg-emerald-600 h-full w-[70%]"></div>
                </div>
            </div>

            <div class="card p-5 space-y-2">
                <div class="flex justify-between items-center text-xs text-muted font-bold">
                    <span>MAINTENANCE COST (SAGE 300)</span>
                    <span class="text-rose-500 font-black">฿ 248,500</span>
                </div>
                <div class="text-2xl font-black text-indigo-900 dark:text-indigo-400">฿ 248,500.00</div>
                <div class="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div class="bg-amber-500 h-full w-[60%]"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Mobile View Wireframe Container -->
    <div id="view-mobile" style="display:none;" class="max-w-md mx-auto bg-slate-900 text-white rounded-3xl p-5 shadow-2xl border-4 border-slate-700 space-y-5">
        <div class="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
                <span class="text-[10px] text-indigo-400 font-bold uppercase block">Amata Chonburi Plant</span>
                <span class="text-sm font-black">📱 ช่างซ่อมบำรุง (Mobile PWA)</span>
            </div>
            <span class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
        </div>

        <div class="grid grid-cols-2 gap-2">
            <a href="/request.php" class="p-3 bg-gradient-to-r from-rose-600 to-indigo-600 text-white rounded-2xl text-xs font-black text-center shadow-lg">
                🚨 แจ้งซ่อมด่วน
            </a>
            <a href="/pages/qr/scanner.php" class="p-3 bg-slate-800 text-white rounded-2xl text-xs font-black text-center border border-slate-700">
                📱 สแกน QR หน้าตู้
            </a>
        </div>
    </div>

</div>

<script>
function showView(type) {
    document.getElementById('view-desktop').style.display = type === 'desktop' ? 'block' : 'none';
    document.getElementById('view-mobile').style.display = type === 'mobile' ? 'block' : 'none';
    
    document.getElementById('btn-desktop').className = type === 'desktop' ? 'px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2' : 'px-4 py-2 bg-muted dark:bg-slate-700 text-secondary dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2';
    document.getElementById('btn-mobile').className = type === 'mobile' ? 'px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2' : 'px-4 py-2 bg-muted dark:bg-slate-700 text-secondary dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2';
}
</script>

<?php renderFooter(); ?>
