<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '🎨 Full Stack UI Suite: Tailwind + Shadcn UI + Lucide + Recharts + TanStack Table — CMMS-TOPPAN';
renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="card p-6 bg-slate-900 text-white rounded-xl shadow-xl flex items-center justify-between border border-slate-800">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-300">Modern Industrial Tech Stack</span>
                <span class="badge badge-secondary text-[10px]">Full Suite Active</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="layers" class="w-7 h-7 text-indigo-400"></i>
                <span>Tailwind CSS + shadcn/ui + Lucide + Recharts + TanStack Table</span>
            </h1>
            <p class="text-xs text-muted mt-1">ชุดเครื่องมือพัฒนา UI มาตรฐานระดับโลกสำหรับ CMMS-TOPPAN รองรับ Responsive, Interactive Data Table, Live Analytics และ HSL Theme Tokens</p>
        </div>
        <div class="flex gap-2">
            <span class="badge bg-indigo-500/20 text-indigo-300 border-indigo-500/30">Tailwind CSS</span>
            <span class="badge bg-purple-500/20 text-purple-300 border-purple-500/30">shadcn/ui</span>
            <span class="badge bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Lucide</span>
            <span class="badge bg-cyan-500/20 text-cyan-300 border-cyan-500/30">Recharts</span>
            <span class="badge bg-amber-500/20 text-amber-300 border-amber-500/30">TanStack Table</span>
        </div>
    </div>

    <!-- Tech Stack Grid Overview -->
    <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div class="card p-4 space-y-2 border-l-4 border-indigo-500">
            <div class="flex items-center gap-2 text-indigo-600 font-black text-sm">
                <i data-lucide="palette" class="w-4 h-4"></i>
                <span>1. Tailwind CSS</span>
            </div>
            <p class="text-xs text-muted">Utility-First CSS framework กำหนด layout และ HSL variable colors</p>
        </div>
        <div class="card p-4 space-y-2 border-l-4 border-purple-500">
            <div class="flex items-center gap-2 text-purple-600 font-black text-sm">
                <i data-lucide="layout" class="w-4 h-4"></i>
                <span>2. shadcn/ui</span>
            </div>
            <p class="text-xs text-muted">Accessible design system primitives (`Button`, `Card`, `Badge`, `Dialog`, `Sidebar-16`)</p>
        </div>
        <div class="card p-4 space-y-2 border-l-4 border-emerald-500">
            <div class="flex items-center gap-2 text-emerald-600 font-black text-sm">
                <i data-lucide="sparkles" class="w-4 h-4"></i>
                <span>3. Lucide Icons</span>
            </div>
            <p class="text-xs text-muted">ชุดไอคอน SVG คุณภาพสูง เกลี้ยงเกลา ตรงตามมาตรฐาน Shadcn UI</p>
        </div>
        <div class="card p-4 space-y-2 border-l-4 border-cyan-500">
            <div class="flex items-center gap-2 text-cyan-600 font-black text-sm">
                <i data-lucide="line-chart" class="w-4 h-4"></i>
                <span>4. Recharts</span>
            </div>
            <p class="text-xs text-muted">Engine แสดงผลกราฟวิเคราะห์ OEE, MTBF/MTTR และ Downtime แบบ Realtime</p>
        </div>
        <div class="card p-4 space-y-2 border-l-4 border-amber-500">
            <div class="flex items-center gap-2 text-amber-600 font-black text-sm">
                <i data-lucide="table" class="w-4 h-4"></i>
                <span>5. TanStack Table</span>
            </div>
            <p class="text-xs text-muted">Headless table engine รองรับการ Sort, Filter, และ Pagination ข้อมูลขนาดใหญ่</p>
        </div>
    </div>

    <!-- Live Demo: Recharts Analytics Engine -->
    <div class="card p-6 space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
            <div>
                <h3 class="font-extrabold text-primary text-base flex items-center gap-2">
                    <i data-lucide="bar-chart-3" class="w-5 h-5 text-cyan-600"></i>
                    <span>📊 Recharts Live Demo (OEE & MTBF Performance Chart)</span>
                </h3>
                <p class="text-xs text-muted">กราฟจำลองการวิเคราะห์ประสิทธิภาพเครื่องจักรประจำเดือน</p>
            </div>
            <span class="badge status-open">Recharts v2 Active</span>
        </div>
        <div class="h-64">
            <canvas id="rechartsDemoCanvas" class="w-full h-full"></canvas>
        </div>
    </div>

    <!-- Live Demo: TanStack Table Engine -->
    <div class="card p-6 space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
            <div>
                <h3 class="font-extrabold text-primary text-base flex items-center gap-2">
                    <i data-lucide="table-properties" class="w-5 h-5 text-amber-600"></i>
                    <span>📋 TanStack Table Engine Demo (Interactive Sorting & Filtering Table)</span>
                </h3>
                <p class="text-xs text-muted">คลิกที่หัวตารางเพื่อจัดเรียงข้อมูลแบบพรีเมียม (Sort by Column)</p>
            </div>
            <span class="badge badge badge-warning">TanStack Table v8</span>
        </div>

        <div class="overflow-x-auto">
            <table class="table-shadcn tanstack-table">
                <thead>
                    <tr>
                        <th class="cursor-pointer">WO Number <i data-lucide="arrow-up-down" class="w-3 h-3 inline"></i></th>
                        <th class="cursor-pointer">ชื่อเครื่องจักร <i data-lucide="arrow-up-down" class="w-3 h-3 inline"></i></th>
                        <th class="cursor-pointer">อาการเสีย / รายงานซ่อม <i data-lucide="arrow-up-down" class="w-3 h-3 inline"></i></th>
                        <th class="cursor-pointer text-center">MTBF (ชม.) <i data-lucide="arrow-up-down" class="w-3 h-3 inline"></i></th>
                        <th class="cursor-pointer text-center">สถานะงาน <i data-lucide="arrow-up-down" class="w-3 h-3 inline"></i></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="font-mono font-bold text-indigo-600">EN-26-001</td>
                        <td class="font-bold text-primary">Extruder Machine Line #1</td>
                        <td>มอเตอร์ขับสายพานลำเลียงร้อนจัด (Overheat)</td>
                        <td class="text-center font-mono font-bold text-emerald-600">420</td>
                        <td class="text-center"><span class="badge badge badge-warning">In Progress</span></td>
                    </tr>
                    <tr>
                        <td class="font-mono font-bold text-indigo-600">EN-26-002</td>
                        <td class="font-bold text-primary">Slitter Rewinder Machine B-02</td>
                        <td>เปลี่ยนลูกปืนแบริ่งแกนหมุนม้วนฟิล์ม</td>
                        <td class="text-center font-mono font-bold text-emerald-600">650</td>
                        <td class="text-center"><span class="badge badge badge-success">Completed</span></td>
                    </tr>
                    <tr>
                        <td class="font-mono font-bold text-indigo-600">EN-26-003</td>
                        <td class="font-bold text-primary">Gravure Printing Press #3</td>
                        <td>ระบบจ่ายหมึกพิมพ์แรงดันตก (Pressure Drop)</td>
                        <td class="text-center font-mono font-bold text-rose-600">180</td>
                        <td class="text-center"><span class="badge badge-destructive">Critical</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    if (window.RechartsEngine) {
        window.RechartsEngine.renderBarChart(
            'rechartsDemoCanvas',
            ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'],
            [
                { label: 'Availability (%)', data: [98.2, 97.8, 98.5, 99.1, 98.9, 99.4], backgroundColor: '#6366f1' },
                { label: 'Performance (%)', data: [94.5, 95.1, 96.2, 95.8, 96.5, 97.1], backgroundColor: '#a855f7' }
            ],
            'ผลการวัดค่า OEE ประจำครึ่งปีแรก (CMMS-TOPPAN Analytics)'
        );
    }
});
</script>

<?php renderFooter(); ?>
