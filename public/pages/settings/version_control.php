<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🔁 Version Control (BOM / Checksheet / SOP) — CMMS-TOPPAN';
renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-purple-200">ISO 9001 Document Control Engine</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Version Control</span>
            </div>
            <h1 class="text-2xl font-black">🔁 ระบบควบคุมเวอร์ชันเอกสาร (Version Control for Checksheets & SOPs)</h1>
            <p class="text-xs text-purple-100 mt-1">คุมเวอร์ชันเช็คชีท PM (F-EN-02), คู่มือ SOP, และโครงสร้าง BOM อัตโนมัติ (เช่น v1.0, v1.1) พร้อมประวัติการแก้ไขและวันที่มีผลบังคับใช้ (Effective Date)</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🔁</div>
    </div>

    <!-- Document Version Control Table -->
    <div class="card p-5 space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 ทะเบียนควบคุมเวอร์ชันเอกสาร ISO (ISO Controlled Documents Table)</span>
            <span class="badge bg-purple-100 text-purple-800 font-bold text-xs">ISO Audited</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-800 text-white font-bold uppercase">
                    <tr>
                        <th class="p-3">รหัสเอกสาร ISO</th>
                        <th class="p-3">ชื่อเอกสาร / แบบฟอร์ม</th>
                        <th class="p-3 text-center">เวอร์ชันปัจจุบัน (Current Version)</th>
                        <th class="p-3 text-center">วันที่มีผลบังคับใช้ (Effective Date)</th>
                        <th class="p-3 text-center">สถานะควบคุม</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700">F-EN-02</td>
                        <td class="p-3 font-bold text-slate-900">เช็คชีทการบำรุงรักษาเชิงป้องกันประจำเดือน (PM Checklist)</td>
                        <td class="p-3 text-center font-bold text-purple-800 bg-purple-50 font-mono">v2.1 (Latest)</td>
                        <td class="p-3 text-center font-bold text-slate-700">2026-01-01</td>
                        <td class="p-3 text-center"><span class="badge badge badge-success font-bold text-[10px]">🟢 บังคับใช้ในระบบ</span></td>
                    </tr>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700">F-EN-03</td>
                        <td class="p-3 font-bold text-slate-900">ใบแจ้งซ่อม / ใบสั่งงานซ่อมบำรุง (Work Order Form)</td>
                        <td class="p-3 text-center font-bold text-purple-800 bg-purple-50 font-mono">v1.5 (Latest)</td>
                        <td class="p-3 text-center font-bold text-slate-700">2026-01-01</td>
                        <td class="p-3 text-center"><span class="badge badge badge-success font-bold text-[10px]">🟢 บังคับใช้ในระบบ</span></td>
                    </tr>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-indigo-700">SOP-ELEC-01</td>
                        <td class="p-3 font-bold text-slate-900">คู่มือขั้นตอนการตรวจซ่อมระบบไฟฟ้า PLC พิมพ์ 10 สี</td>
                        <td class="p-3 text-center font-bold text-purple-800 bg-purple-50 font-mono">v1.0 (Initial)</td>
                        <td class="p-3 text-center font-bold text-slate-700">2026-03-15</td>
                        <td class="p-3 text-center"><span class="badge badge badge-success font-bold text-[10px]">🟢 บังคับใช้ในระบบ</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
