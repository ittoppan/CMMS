<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/DataGovernanceService.php';

$pageTitle = '🧠 Data Governance & Master Data Control — CMMS-TOPPAN';
$duplicates = DataGovernanceService::findDuplicateParts();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Data Quality & Format Standardization Engine</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Data Governance</span>
            </div>
            <h1 class="text-2xl font-black">🧠 ศูนย์ควบคุมคุณภาพข้อมูลหลัก (Data Governance & Master Data Control)</h1>
            <p class="text-xs text-blue-100 mt-1">ป้องกันข้อมูลขยะและ KPI เพี้ยน บังคับรูปแบบรหัสเครื่องจักรมาตรฐาน (เช่น `A-PT-01`), ตรวจจับอะไหล่ซ้ำ, และระบบอนุมัติแก้ไข Master Data</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🧠</div>
    </div>

    <!-- Governance Rules Overview -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="card p-5 space-y-2">
            <span class="font-extrabold text-indigo-900 text-sm block">🏷️ 1. บังคับรูปแบบรหัสเครื่องจักร (Code Standard)</span>
            <p class="text-xs text-secondary">บังคับรูปแบบ `หมวด-สายการผลิต-ลำดับ` (เช่น <code class="bg-muted px-1.5 py-0.5 rounded font-mono text-indigo-700 font-bold">A-PT-01</code>) ป้องกันการพิมพ์ผิดเป็น <code class="line-through text-rose-500">APT01</code> หรือ <code class="line-through text-rose-500">apt-1</code></p>
        </div>

        <div class="card p-5 space-y-2">
            <span class="font-extrabold text-purple-900 text-sm block">📦 2. ตรวจจับอะไหล่ซ้ำซ้อน (Duplicate Detection)</span>
            <p class="text-xs text-secondary">ระบบ AI สแกนชื่อและรหัสอะไหล่ซ้ำซ้อนจากคลัง Sage 300 ERP เพื่อยุบรวมข้อมูลคลังอะไหล่ให้อยู่ในมาตรฐานเดียวกัน</p>
        </div>

        <div class="card p-5 space-y-2">
            <span class="font-extrabold text-emerald-900 text-sm block">🔐 3. ขั้นตอนการอนุมัติ Master Data (Approval Flow)</span>
            <p class="text-xs text-secondary">การแก้ไขชื่อเครื่องจักร, หมวดหมู่, หรือสเปกอะไหล่หลัก ต้องผ่านการอนุมัติจากวิศวกรหัวหน้างานเพื่อความถูกต้อง 100%</p>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
