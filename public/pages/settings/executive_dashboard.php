<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'Executive Management Dashboard - CMMS-TPT';
$pdo = getDb();

// 1. Cost by Machine
$costByMachine = $pdo->query("
    SELECT a.name AS asset_name, SUM(r.cost_labor + r.cost_parts + r.cost_outsource) AS total_cost
    FROM repair r JOIN asset_registry a ON r.asset_id = a.id
    GROUP BY r.asset_id ORDER BY total_cost DESC LIMIT 5
")->fetchAll();

// 2. Cost by Department
$costByDept = $pdo->query("
    SELECT d.name AS dept_name, SUM(r.cost_labor + r.cost_parts + r.cost_outsource) AS total_cost
    FROM repair r JOIN departments d ON r.department_id = d.id
    GROUP BY r.department_id ORDER BY total_cost DESC LIMIT 5
")->fetchAll();

// 3. RCA 5Ms Distribution
$rcaStats = $pdo->query("
    SELECT rca_category, COUNT(*) AS count_num
    FROM repair WHERE rca_category IS NOT NULL
    GROUP BY rca_category
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">
    <!-- Header Banner -->
    <div class="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div>
            <div class="flex items-center gap-2">
                <span class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-xs font-bold text-gray-500 uppercase">Executive Single-Page View</span>
            </div>
            <h1 class="text-2xl font-extrabold text-gray-900 mt-1">📊 Executive Management Dashboard (สำหรับผู้บริหารโรงงาน)</h1>
            <p class="text-xs text-gray-500 mt-0.5">ภาพรวมค่าใช้จ่าย Cost breakdown, RCA 5Ms, SLA Downtime Timeline & KPI สรุปผล</p>
        </div>
        <div class="flex gap-2">
            <button onclick="window.print()" class="btn btn-primary text-xs">🖨️ พิมพ์รายงานสรุปผู้บริหาร</button>
        </div>
    </div>

    <!-- Cost Breakdown Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center">
            <span class="text-xs font-bold text-gray-500 uppercase block">รวมค่าแรง (Labor Cost)</span>
            <span class="text-2xl font-extrabold text-brand-600 mt-1 block">
                ฿<?= number_format($pdo->query("SELECT SUM(cost_labor) FROM repair")->fetchColumn() ?: 0, 2) ?>
            </span>
        </div>
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center">
            <span class="text-xs font-bold text-gray-500 uppercase block">รวมค่าอะไหล่ (Parts Cost)</span>
            <span class="text-2xl font-extrabold text-amber-600 mt-1 block">
                ฿<?= number_format($pdo->query("SELECT SUM(cost_parts) FROM repair")->fetchColumn() ?: 0, 2) ?>
            </span>
        </div>
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center">
            <span class="text-xs font-bold text-gray-500 uppercase block">รวม Outsource</span>
            <span class="text-2xl font-extrabold text-indigo-600 mt-1 block">
                ฿<?= number_format($pdo->query("SELECT SUM(cost_outsource) FROM repair")->fetchColumn() ?: 0, 2) ?>
            </span>
        </div>
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm text-center bg-emerald-50 border-emerald-200">
            <span class="text-xs font-bold text-emerald-800 uppercase block">รวมค่าใช้จ่ายซ่อมบำรุงทั้งหมด</span>
            <span class="text-2xl font-extrabold text-emerald-700 mt-1 block">
                ฿<?= number_format($pdo->query("SELECT SUM(cost_labor + cost_parts + cost_outsource) FROM repair")->fetchColumn() ?: 0, 2) ?>
            </span>
        </div>
    </div>

    <!-- Charts Grid -->
    <script src="<?= $relPrefix ?>js/chart.min.js"></script>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Chart 1: Cost by Machine -->
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm">
            <h3 class="font-bold text-gray-900 text-sm mb-3">💰 5 อันดับเครื่องจักรที่มีค่าใช้จ่ายซ่อมบำรุงสูงสุด</h3>
            <div style="height:220px;" class="relative">
                <canvas id="chartCostMachine"></canvas>
            </div>
        </div>

        <!-- Chart 2: RCA 5Ms Pareto -->
        <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm">
            <h3 class="font-bold text-gray-900 text-sm mb-3">🔍 Root Cause Analysis 5Ms Breakdown</h3>
            <div style="height:220px;" class="relative">
                <canvas id="chartRCA"></canvas>
            </div>
        </div>

    </div>

    <!-- Downtime SLA Timeline Example Widget -->
    <div class="card p-5 bg-white rounded-lg border border-gray-200 shadow-sm space-y-4">
        <h3 class="font-bold text-gray-900 text-base">⏱️ ตัวอย่างวิเคราะห์ Downtime Timeline & SLA Response</h3>
        
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs overflow-x-auto gap-4">
            <div class="text-center">
                <span class="font-bold text-slate-800 block">08:10</span>
                <span class="badge badge badge-error mt-1">Stop (เครื่องหยุด)</span>
            </div>
            <div class="text-slate-400">➔</div>
            <div class="text-center">
                <span class="font-bold text-slate-800 block">08:13</span>
                <span class="badge badge badge-info mt-1">แจ้งซ่อม (Reported)</span>
            </div>
            <div class="text-slate-400">➔</div>
            <div class="text-center">
                <span class="font-bold text-slate-800 block">08:15</span>
                <span class="badge bg-indigo-100 text-indigo-800 mt-1">Accept (ช่างรับงาน)</span>
            </div>
            <div class="text-slate-400">➔</div>
            <div class="text-center">
                <span class="font-bold text-slate-800 block">08:20</span>
                <span class="badge badge badge-warning mt-1">Repair (เริ่มซ่อม)</span>
            </div>
            <div class="text-slate-400">➔</div>
            <div class="text-center">
                <span class="font-bold text-slate-800 block">09:01</span>
                <span class="badge badge badge-success mt-1">Complete (ซ่อมเสร็จ)</span>
            </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-center pt-2">
            <div class="p-3 bg-gray-100 rounded">Response Time: <strong>2 นาที (SLA Pass ✔)</strong></div>
            <div class="p-3 bg-gray-100 rounded">Waiting Time: <strong>5 นาที</strong></div>
            <div class="p-3 bg-gray-100 rounded">Repair Time: <strong>41 นาที</strong></div>
            <div class="p-3 badge badge-success font-bold rounded">Total Downtime: <strong>51 นาที</strong></div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    // 1. Cost by Machine Chart
    new Chart(document.getElementById('chartCostMachine').getContext('2d'), {
        type: 'bar',
        data: {
            labels: [<?= implode(',', array_map(fn($item) => "'" . addslashes($item['asset_name']) . "'", $costByMachine)) ?>],
            datasets: [{
                label: 'ค่าใช้จ่ายรวม (บาท)',
                data: [<?= implode(',', array_column($costByMachine, 'total_cost')) ?>],
                backgroundColor: '#2563eb',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. RCA 5Ms Chart
    new Chart(document.getElementById('chartRCA').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Human (คน)', 'Machine (เครื่อง)', 'Method (วิธี)', 'Material (วัตถุดิบ)', 'Environment (สิ่งแวดล้อม)'],
            datasets: [{
                data: [4, 12, 3, 2, 1],
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
});
</script>

<?php renderFooter(); ?>
