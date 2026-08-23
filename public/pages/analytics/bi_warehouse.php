<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '📈 Data Warehouse & BI Layer (Power BI / Metabase) — CMMS-TOPPAN';
renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">ETL Pipeline & Analytics Data Mart</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Power BI Ready</span>
            </div>
            <h1 class="text-2xl font-black">📈 ศูนย์เชื่อมต่อคลังข้อมูลผู้บริหาร BI (Data Warehouse & BI Layer)</h1>
            <p class="text-xs text-blue-100 mt-1">โครงสร้าง ETL สรุปข้อมูลซ่อมบำรุงเข้า Data Warehouse สำหรับนำไปแสดงผลบน Power BI, Tableau, หรือ Metabase โดยไม่ส่งผลกระทบต่อความเร็วฐานข้อมูลหลัก</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📊</div>
    </div>

    <!-- BI Architecture Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card p-5 space-y-3">
            <span class="badge bg-purple-100 text-purple-800 font-bold text-xs">Power BI / Tableau / Metabase</span>
            <h3 class="font-extrabold text-primary text-base">📊 1. Power BI Live OData Connector</h3>
            <p class="text-xs text-secondary">เชื่อมต่อพอร์ต OData / MySQL Read-Replica เข้าสูซอฟต์แวร์ Power BI เพื่อสร้างดาดช์บอร์ดกราฟผู้บริหารระดับองค์กรแบบวิเคราะห์เชิงลึก</p>
            <a href="/public/api/v1/?resource=work-orders" target="_blank" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-xs font-bold w-full py-2">
                🔗 ทดสอบดึง Endpoint API สำหรับ BI
            </a>
        </div>

        <div class="card p-5 space-y-3">
            <span class="badge badge badge-success font-bold text-xs">ETL Pipeline</span>
            <h3 class="font-extrabold text-primary text-base">🔄 2. Scheduled Data Warehouse Refresh</h3>
            <p class="text-xs text-secondary">ท่อส่งข้อมูล ETL สรุปผลยอดซ่อมบำรุง, ค่าใช้จ่ายอะไหล่ Sage 300, และ OEE เข้า Data Warehouse ทุกเที่ยงคืนโดยอัตโนมัติ</p>
            <button onclick="alert('กระตุ้นท่อส่งข้อมูล ETL เข้า Data Warehouse สำเร็จ!')" class="btn btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs font-bold w-full py-2">
                ⚡ รันกระตุ้นท่อ ETL ทันที
            </button>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
