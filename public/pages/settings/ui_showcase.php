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

<!-- ============================================================
     Design System v2 — canonical components (living style guide)
     CSS: ui-polish.css §11–§20. Copy these, never re-invent.
     ============================================================ -->
<div class="card p-6 space-y-6" id="shot-element">
    <div class="border-b border-line pb-3">
        <h2 class="text-xl font-black text-primary flex items-center gap-2">
            <span class="badge status-open text-xs">DS v2</span>
            Canonical Components — ใช้ชุดนี้เท่านั้น (ui-polish.css §11–§20)
        </h2>
        <p class="text-sm text-muted mt-1">Status badges · Banners · Stat tiles · Forms · Data table · Loading/Empty · Modal · Tokens</p>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">1) Status / Priority badges — <code>.badge.status-* / .priority-*</code></h3>
        <div class="flex flex-wrap gap-1.5">
            <?php foreach (['open','acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled','rejected','pending','completed','overdue','active','inactive','under_repair','disposed','in_stock','low_stock','pass','fail'] as $k): ?>
                <span class="badge status-<?= $k ?>"><?= $k ?></span>
            <?php endforeach; ?>
            <?php foreach (['low','medium','high','critical'] as $k): ?>
                <span class="badge priority-<?= $k ?>"><?= $k ?></span>
            <?php endforeach; ?>
        </div>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">2) Banners — <code>.cmms-banner.{success|error|warning|info}</code></h3>
        <div class="space-y-2">
            <div class="cmms-banner success">บันทึกเรียบร้อย — ข้อมูลอัปเดตแล้ว</div>
            <div class="cmms-banner error">เกิดข้อผิดพลาด — กรุณาตรวจสอบข้อมูลอีกครั้ง</div>
            <div class="cmms-banner warning">อะไหล่ใกล้หมด — คงเหลือ 3 ชิ้น ต่ำกว่า min stock</div>
            <div class="cmms-banner info">ระบบจะปิดปรับปรุง ศุกร์ 22:00–23:00</div>
        </div>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">3) Pipeline stat tiles — <code>.cmms-stat-tile.{key|glass}</code></h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <a href="#" class="cmms-stat-tile cmms-stat-tile-open space-y-1"><span class="font-bold opacity-80">Open</span><span class="text-2xl font-black block">12</span></a>
            <a href="#" class="cmms-stat-tile cmms-stat-tile-acknowledged space-y-1"><span class="font-bold opacity-80">Ack</span><span class="text-2xl font-black block">8</span></a>
            <a href="#" class="cmms-stat-tile cmms-stat-tile-in_progress space-y-1"><span class="font-bold opacity-80">In Progress</span><span class="text-2xl font-black block">5</span></a>
            <a href="#" class="cmms-stat-tile cmms-stat-tile-resolved space-y-1"><span class="font-bold opacity-80">Resolved</span><span class="text-2xl font-black block">21</span></a>
            <a href="#" class="cmms-stat-tile cmms-stat-tile-cancelled space-y-1"><span class="font-bold opacity-80">Cancelled</span><span class="text-2xl font-black block">2</span></a>
            <a href="#" class="cmms-stat-tile cmms-stat-tile-glass space-y-1"><span class="font-bold opacity-70">Glass</span><span class="text-2xl font-black block">7</span></a>
        </div>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">4) Form system — <code>.form-section/.form-grid/.form-label/.form-actions</code></h3>
        <form class="form-section" onsubmit="return false">
            <div class="form-section-title">ตัวอย่างฟอร์มมาตรฐาน</div>
            <p class="form-required-legend"><span class="req">*</span> ฟิลด์ที่มีเครื่องหมายดอกจันจำเป็นต้องกรอก</p>
            <div class="form-grid">
                <div>
                    <label class="form-label" for="ds-demo-name">ชื่อเครื่องจักร <span class="req">*</span></label>
                    <input class="input input-bordered w-full" id="ds-demo-name" name="name" required aria-required="true" placeholder="MCH-001">
                    <span class="form-hint">รหัสเครื่องจาก asset registry</span>
                </div>
                <div>
                    <label class="form-label" for="ds-demo-prio">ความสำคัญ</label>
                    <select class="select-field w-full" id="ds-demo-prio" name="priority">
                        <option>low</option><option selected>medium</option><option>high</option><option>critical</option>
                    </select>
                </div>
                <div>
                    <label class="form-label" for="ds-demo-note">หมายเหตุ</label>
                    <textarea class="textarea-field" id="ds-demo-note" rows="2" placeholder="รายละเอียดเพิ่มเติม"></textarea>
                </div>
            </div>
            <div class="form-error">ตัวอย่างข้อความ error (.form-error)</div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">บันทึก</button>
                <button type="reset" class="btn btn-secondary">ยกเลิก</button>
            </div>
        </form>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">5) Data table — <code>.data-table.cmms-stack-table</code> + <code>data-label</code></h3>
        <div class="table-wrap">
            <table class="data-table cmms-stack-table">
                <thead><tr><th>WO</th><th>เครื่อง</th><th>สถานะ</th></tr></thead>
                <tbody>
                    <tr><td data-label="WO">EN-2608-001</td><td data-label="เครื่อง">Injection #3</td><td data-label="สถานะ"><span class="badge status-in_progress">in_progress</span></td></tr>
                    <tr><td data-label="WO">EN-2608-002</td><td data-label="เครื่อง">Aging Room</td><td data-label="สถานะ"><span class="badge priority-critical">critical</span></td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">6) Loading / Empty — <code>.cmms-skeleton/.cmms-spinner/.cmms-empty-state</code></h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
            <div class="space-y-2"><div class="cmms-skeleton h-4 w-3/4"></div><div class="cmms-skeleton h-4 w-full"></div><div class="cmms-skeleton h-4 w-1/2"></div></div>
            <div><span class="cmms-spinner"></span> <span class="text-sm text-secondary">กำลังโหลด…</span></div>
            <div class="cmms-empty-state">ยังไม่มีรายการ — ตัวอย่าง empty state</div>
        </div>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">7) Modal — <code>.cmms-modal-backdrop/.cmms-modal-panel</code> + <code>CMMS_UI.openModal/closeModal</code></h3>
        <button class="btn btn-primary" onclick="openModal('ds-demo-modal')">เปิด modal ตัวอย่าง</button>
        <div id="ds-demo-modal" class="cmms-modal-backdrop" onclick="if (event.target === this) closeModal('ds-demo-modal')">
            <div class="cmms-modal-panel p-5 space-y-3">
                <div class="flex items-center justify-between border-b border-line pb-2">
                    <strong class="text-primary">ตัวอย่าง Modal มาตรฐาน</strong>
                    <button class="btn btn-ghost btn-sm" onclick="closeModal('ds-demo-modal')">✕</button>
                </div>
                <p class="text-sm text-secondary">Focus trap + ESC + คืน focus อัตโนมัติ — ทำงานผ่าน cmms-ui-engine.js</p>
                <div class="flex justify-end gap-2"><button class="btn btn-primary" onclick="closeModal('ds-demo-modal')">ตกลง</button></div>
            </div>
        </div>
    </div>

    <div>
        <h3 class="font-extrabold text-primary text-sm mb-2">8) Semantic color tokens — <code>.text-primary/.text-secondary/.text-muted/.bg-subtle/.bg-muted</code></h3>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div class="p-3 rounded-lg bg-subtle border border-line text-primary">text-primary<br>bg-subtle</div>
            <div class="p-3 rounded-lg bg-muted border border-line text-secondary">text-secondary<br>bg-muted</div>
            <div class="p-3 rounded-lg bg-muted border border-line text-muted">text-muted<br>bg-muted</div>
            <div class="p-3 rounded-lg bg-subtle border border-line"><span class="badge status-pass">pass</span> <span class="badge status-fail">fail</span></div>
            <div class="p-3 rounded-lg bg-subtle border border-line"><span class="badge priority-high">high</span> <span class="badge priority-low">low</span></div>
        </div>
    </div>
</div>

<?php renderFooter(); ?>
