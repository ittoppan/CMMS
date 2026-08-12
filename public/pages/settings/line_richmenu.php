<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'LINE Rich Menu Configurator Center - CMMS-TPT';
renderHeader();
?>

<div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-600 to-teal-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Official LINE OA Integration</span>
                <span class="text-xs text-emerald-200">Rich Menu 6-Tile Layout</span>
            </div>
            <h1 class="text-2xl font-black">📱 LINE Rich Menu Configurator & Action Center</h1>
            <p class="text-xs text-emerald-100 mt-1">ตั้งค่าเมนูลัด 6 ช่องบนหน้าจอแอป LINE Official Account (`@823cenqj`) สำหรับช่างและผู้ใช้งาน</p>
        </div>
        <a href="https://manager.line.biz/" target="_blank" class="btn bg-white text-emerald-800 font-extrabold text-xs shadow hover:bg-emerald-50">
            🔗 เปิด LINE Official Account Manager →
        </a>
    </div>

    <!-- 6 Rich Menu Action Tiles Grid -->
    <div class="card cmms-card p-6 space-y-4">
        <h3 class="font-bold text-slate-900 text-base border-b pb-2 flex justify-between items-center">
            <span>🎛️ ปุ่มเมนูลัด 6 ช่องบนหน้าจอ LINE (6-Tile Action Matrix)</span>
            <span class="text-xs text-slate-400">Target Action URLs</span>
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <!-- Tile 1: แจ้งซ่อมด่วน -->
            <div class="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div class="w-8 h-8 rounded-lg bg-rose-600 text-white font-bold flex items-center justify-center text-sm">1</div>
                <h4 class="font-bold text-slate-900 text-sm">🔧 แจ้งซ่อมด่วน (F-EN-03)</h4>
                <p class="text-[11px] text-slate-600">เปิดหน้าแจ้งซ่อมด่วน ถ่ายภาพ/คลิปวิดีโอส่งเข้าช่าง</p>
                <div class="bg-white p-2 rounded border border-rose-200 font-mono text-[10px] text-slate-700 break-all select-all">
                    https://ommatophorous-robert-fortifyingly.ngrok-free.app/pages/repair/create.php
                </div>
            </div>

            <!-- Tile 2: Kanban Board -->
            <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                <div class="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">2</div>
                <h4 class="font-bold text-slate-900 text-sm">📌 กระดานติดตามงาน (Kanban)</h4>
                <p class="text-[11px] text-slate-600">ติดตามสถานะงานซ่อมแบบการ์ดลากวาง Real-time</p>
                <div class="bg-white p-2 rounded border border-indigo-200 font-mono text-[10px] text-slate-700 break-all select-all">
                    https://ommatophorous-robert-fortifyingly.ngrok-free.app/pages/repair/kanban.php
                </div>
            </div>

            <!-- Tile 3: เบิก Sage 300 -->
            <div class="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                <div class="w-8 h-8 rounded-lg bg-purple-600 text-white font-bold flex items-center justify-center text-sm">3</div>
                <h4 class="font-bold text-slate-900 text-sm">📦 เบิกอะไหล่ & Sage 300</h4>
                <p class="text-[11px] text-slate-600">ศูนย์อนุมัติและจ่ายอะไหล่คลัง Sage 300</p>
                <div class="bg-white p-2 rounded border border-purple-200 font-mono text-[10px] text-slate-700 break-all select-all">
                    https://ommatophorous-robert-fortifyingly.ngrok-free.app/pages/spare_parts/issue_center.php
                </div>
            </div>

            <!-- Tile 4: แผน PM & Checksheet -->
            <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div class="w-8 h-8 rounded-lg bg-amber-600 text-white font-bold flex items-center justify-center text-sm">4</div>
                <h4 class="font-bold text-slate-900 text-sm">📋 แผน PM & เช็คชีท (F-EN-02)</h4>
                <p class="text-[11px] text-slate-600">ปฏิทินงาน PM และเปิดทำแบบฟอร์มเช็คชีท ISO</p>
                <div class="bg-white p-2 rounded border border-amber-200 font-mono text-[10px] text-slate-700 break-all select-all">
                    https://ommatophorous-robert-fortifyingly.ngrok-free.app/pages/pm_am/calendar.php
                </div>
            </div>

            <!-- Tile 5: ทะเบียนทรัพย์สิน & QR -->
            <div class="p-4 bg-cyan-50 border border-cyan-200 rounded-xl space-y-2">
                <div class="w-8 h-8 rounded-lg bg-cyan-600 text-white font-bold flex items-center justify-center text-sm">5</div>
                <h4 class="font-bold text-slate-900 text-sm">🏭 ทะเบียนทรัพย์สิน & สแกน QR</h4>
                <p class="text-[11px] text-slate-600">ค้นหาประวัติเครื่องจักร สแกน QR Code หน้าเครื่อง</p>
                <div class="bg-white p-2 rounded border border-cyan-200 font-mono text-[10px] text-slate-700 break-all select-all">
                    https://ommatophorous-robert-fortifyingly.ngrok-free.app/pages/asset_registry/
                </div>
            </div>

            <!-- Tile 6: Executive Dashboard -->
            <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div class="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">6</div>
                <h4 class="font-bold text-slate-900 text-sm">📊 Executive Dashboard</h4>
                <p class="text-[11px] text-slate-600">รายงานวิเคราะห์ Cost, MTBF/MTTR & RCA 5Ms</p>
                <div class="bg-white p-2 rounded border border-emerald-200 font-mono text-[10px] text-slate-700 break-all select-all">
                    https://ommatophorous-robert-fortifyingly.ngrok-free.app/pages/settings/executive_dashboard.php
                </div>
            </div>

        </div>
    </div>

    <!-- Instructions Guide -->
    <div class="card cmms-card p-6 space-y-3">
        <h3 class="font-bold text-slate-900 text-sm border-b pb-2">🛠️ วิธีการนำ URL ไปวางใน LINE Official Account Manager:</h3>
        <ol class="list-decimal list-inside text-xs text-slate-700 space-y-2 leading-relaxed">
            <li>เปิดเข้า <a href="https://manager.line.biz/" target="_blank" class="text-indigo-600 font-bold hover:underline">LINE Official Account Manager</a> และเลือกบัญชี <strong>@823cenqj</strong></li>
            <li>เข้าที่เมนู <strong>Rich Menus (ริชเมนู) ➔ สร้างใหม่ (Create New)</strong></li>
            <li>เลือกเทมเพลตแบบ <strong>6 ช่อง (Large - 6 tiles)</strong></li>
            <li>คัดลอก URL ในกล่องด้านบนทั้ง 6 ช่องไปวางตั้งค่าให้ตรงกับปุ่มกดแต่ละช่อง</li>
            <li>กด <strong>"บันทึกและเปิดใช้งาน"</strong> เมนูลัด 6 ปุ่มจะแสดงผลบนหน้าจอ LINE ของผู้ใช้ทันที!</li>
        </ol>
    </div>
</div>

<?php renderFooter(); ?>
