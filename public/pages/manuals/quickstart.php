<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'คู่มือการใช้งานระบบ CMMS-TPT (User Quick Start Guide)';
renderHeader();
?>

<div class="max-w-5xl mx-auto space-y-6">
    <!-- Banner Header -->
    <div class="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 rounded-2xl shadow-lg">
        <div class="flex items-center gap-3 mb-2">
            <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Official Documentation</span>
            <span class="text-xs text-indigo-200">CMMS-TPT Master Edition</span>
        </div>
        <h1 class="text-2xl font-black">📖 คู่มือการเริ่มต้นใช้งานระบบ CMMS-TPT (User Quick Start Guide)</h1>
        <p class="text-xs text-indigo-100 mt-1">คู่มือสรุปขั้นตอนการทำงานสำหรับผู้ใช้, ช่างวิศวกรรม, เจ้าหน้าที่สโตร์ และผู้บริหาร</p>
    </div>

    <!-- 4 Main Workflow Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

        <!-- Card 1: Operator / Reporter -->
        <div class="card p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center gap-3 border-b border-slate-100 pb-3">
                <span class="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">📱</span>
                <div>
                    <h3 class="font-bold text-slate-900 text-base">1. สำหรับผู้แจ้งซ่อม (Operators)</h3>
                    <p class="text-xs text-slate-500">ขั้นตอนการแจ้งซ่อมผ่านมือถือ & QR Code</p>
                </div>
            </div>
            <ol class="list-decimal list-inside text-xs text-slate-700 space-y-2 leading-relaxed">
                <li>สแกน <strong>QR Code</strong> ที่ติดอยู่บนตัวเครื่องจักร หรือเปิดลิงก์ระบบบนมือถือ</li>
                <li>กดปุ่ม <strong>"+ แจ้งซ่อมด่วน (F-EN-03)"</strong></li>
                <li>กรอกหัวข้อ อาการเสีย และเลือกระดับความเร่งด่วน</li>
                <li>กดที่กล่อง <strong>"📸 ถ่ายภาพจากกล้อง"</strong> เพื่อกดถ่ายรูปอาการเสียหรืออัดวิดีโอ (<1 นาที)</li>
                <li>กด <strong>"บันทึกสร้างงานซ่อม"</strong> ระบบจะส่งแจ้งเตือนเข้า LINE ช่างทันที</li>
            </ol>
        </div>

        <!-- Card 2: Maintenance Technician -->
        <div class="card p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center gap-3 border-b border-slate-100 pb-3">
                <span class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">🔧</span>
                <div>
                    <h3 class="font-bold text-slate-900 text-base">2. สำหรับช่างซ่อมบำรุง (Technicians)</h3>
                    <p class="text-xs text-slate-500">การรับงาน ปิดงาน และขอเบิกอะไหล่</p>
                </div>
            </div>
            <ol class="list-decimal list-inside text-xs text-slate-700 space-y-2 leading-relaxed">
                <li>เปิดเข้าเมนู <strong>"งานของฉัน"</strong> หรือดูบน <strong>Kanban Board</strong></li>
                <li>กดเปลี่ยนสถานะเป็น <strong>"In Progress (กำลังซ่อม)"</strong></li>
                <li>หากต้องการใช้อะไหล่ กด <strong>"ขอเบิกอะไหล่"</strong> เพื่อส่งเรื่องหาหัวหน้างานและสโตร์</li>
                <li>เมื่อซ่อมเสร็จ ถ่ายรูปหลังซ่อม กรอกชั่วโมง Downtime และกด <strong>"ปิดงานซ่อม"</strong></li>
            </ol>
        </div>

        <!-- Card 3: Store & Sage 300 -->
        <div class="card p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center gap-3 border-b border-slate-100 pb-3">
                <span class="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg">📦</span>
                <div>
                    <h3 class="font-bold text-slate-900 text-base">3. สำหรับเจ้าหน้าที่สโตร์ (Storekeeper)</h3>
                    <p class="text-xs text-slate-500">การจ่ายของ ตัดสต็อก และเชื่อม Sage 300</p>
                </div>
            </div>
            <ol class="list-decimal list-inside text-xs text-slate-700 space-y-2 leading-relaxed">
                <li>เปิดเข้าเมนู <strong>"📦 เบิก Sage 300 (Spare Issue Center)"</strong></li>
                <li>ตรวจสอบใบขอเบิกที่ได้รับการอนุมัติจากหัวหน้าวิศวกรรม</li>
                <li>หยิบอะไหล่จ่ายให้ช่าง และกดปุ่ม <strong>"จ่ายของ (Store Issue)"</strong> ในระบบ</li>
                <li>กดปุ่ม <strong>"📥 ดาวน์โหลดรายงานคีย์ Sage 300 (CSV)"</strong> สรุปยอดตัดสต็อกเข้า Sage 300</li>
            </ol>
        </div>

        <!-- Card 4: Management & ISO Audit -->
        <div class="card p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center gap-3 border-b border-slate-100 pb-3">
                <span class="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">📊</span>
                <div>
                    <h3 class="font-bold text-slate-900 text-base">4. สำหรับผู้บริหาร & ตรวจสอบ ISO</h3>
                    <p class="text-xs text-slate-500">รายงานวิเคราะห์ Cost, MTBF/MTTR & ISO Print</p>
                </div>
            </div>
            <ol class="list-decimal list-inside text-xs text-slate-700 space-y-2 leading-relaxed">
                <li>เปิดดู <strong>Executive Dashboard</strong> เพื่อดูสรุป Cost by Machine และ RCA 5Ms</li>
                <li>สั่งพิมพ์แบบฟอร์ม ISO <strong>F-EN-03 (ใบแจ้งซ่อม)</strong> หรือ <strong>F-EN-01 (บัตรประวัติเครื่องจักร)</strong></li>
                <li>ตรวจสอบปฏิทินงาน PM & AM และแบบฟอร์มเช็คชีท <strong>F-EN-02</strong></li>
            </ol>
        </div>

    </div>
</div>

<?php renderFooter(); ?>
