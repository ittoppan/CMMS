<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🧠 Maintenance Knowledge Base & SOP Center — CMMS-TOPPAN';
renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Standard Operating Procedures (SOP) & Lessons Learned</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Knowledge Base</span>
            </div>
            <h1 class="text-2xl font-black">🧠 ศูนย์รวมความรู้และคู่มือมาตรฐานการซ่อม (Maintenance Knowledge Base & SOP)</h1>
            <p class="text-xs text-blue-100 mt-1">คลังเก็บคู่มือ SOP, วิดีโอขั้นตอนการซ่อม, และบทเรียนการแก้ปัญหา (Lessons Learned) ป้องกันความรู้สูญหายตามตัวบุคคล</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📚</div>
    </div>

    <!-- SOP Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span class="badge badge badge-info font-bold text-[10px]">SOP-ELEC-01</span>
            <h3 class="font-extrabold text-slate-900 text-base">📄 ขั้นตอนการตรวจเช็คระบบไฟฟ้าตู้ PLC พิมพ์ 10 สี</h3>
            <p class="text-xs text-slate-600">ขั้นตอนมาตรฐานการวัดแรงดันไฟฟ้าและตรวจซ่อมการสื่อสารอินเวอร์เตอร์ Siemens S120</p>
            <a href="#" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs font-bold w-full py-2">📖 เปิดดูคู่มือ SOP</a>
        </div>

        <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span class="badge bg-purple-100 text-purple-800 font-bold text-[10px]">SOP-HYDR-02</span>
            <h3 class="font-extrabold text-slate-900 text-base">📄 วิธีการอัดจารบีและเปลี่ยนตลับลูกปืนมอเตอร์หลัก</h3>
            <p class="text-xs text-slate-600">คำแนะนำปริมาณการเติมจารบีเทียบตามเบอร์ลูกปืน (SKF Standard)</p>
            <a href="#" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs font-bold w-full py-2">📖 เปิดดูคู่มือ SOP</a>
        </div>

        <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span class="badge badge badge-success font-bold text-[10px]">SOP-PNEU-03</span>
            <h3 class="font-extrabold text-slate-900 text-base">📄 การปรับตั้งความตึงสายพานเครื่องสลิตติ้ง</h3>
            <p class="text-xs text-slate-600">เกณฑ์มาตรฐานแรงดึงสายพานลำเลียงม้วนพลาสติก ป้องกันสายพานรูดสลิป</p>
            <a href="#" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs font-bold w-full py-2">📖 เปิดดูคู่มือ SOP</a>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
