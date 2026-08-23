<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ระบบเชื่อมต่อมอนิเตอร์เซนเซอร์ IoT Realtime (IoT Vibration & Temp Monitor) — CMMS-TOPPAN';
$pdo = getDb();

// Fetch IoT Devices
$devices = $pdo->query("
    SELECT id.*, a.code AS asset_code, a.name AS asset_name
    FROM iot_devices id
    JOIN asset_registry a ON id.asset_id = a.id
    ORDER BY id.id ASC
")->fetchAll();

renderHeader();
?>

<!-- Local Chart.js -->
<script src="<?= $relPrefix ?>js/chart.min.js"></script>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-purple-200">Realtime Modbus / MQTT Telemetry Stream</span>
                <span class="badge bg-indigo-500/30 text-white text-[10px] font-bold">Fiix & SAP IoT Benchmark</span>
            </div>
            <h1 class="text-2xl font-black">⚡ ระบบมอนิเตอร์เซนเซอร์ IoT ความสั่นสะเทือนและอุณหภูมิ Realtime</h1>
            <p class="text-xs text-purple-100 mt-1">วัดความสั่นสะเทือน (Vibration mm/s) และอุณหภูมิเสื้อตลับลูกปืนมอเตอร์หลัก 24 ชม.</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📡</div>
    </div>

    <!-- Live Telemetry Gauges -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <?php foreach ($devices as $dev): ?>
        <?php
            $isAlarm = ($dev['status'] === 'alarm');
            $statusBg = $isAlarm ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200 bg-white';
            $statusBadge = $isAlarm ? 'status-fail animate-pulse' : 'status-active';
        ?>
        <div class="card p-5 border-2 rounded-2xl shadow-sm space-y-4 <?= $statusBg ?>">
            <div class="flex items-center justify-between">
                <div>
                    <span class="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200"><?= htmlspecialchars($dev['device_code']) ?></span>
                    <h3 class="font-black text-slate-900 text-base mt-1"><?= htmlspecialchars($dev['asset_code']) ?> - <?= htmlspecialchars($dev['asset_name']) ?></h3>
                </div>
                <span class="badge font-bold text-xs <?= $statusBadge ?>"><?= strtoupper($dev['status']) ?></span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-center">
                <div class="p-3 bg-white border rounded-xl space-y-1">
                    <span class="text-[10px] font-bold text-slate-500 uppercase block">VIBRATION (ความสั่น)</span>
                    <div id="vib-<?= $dev['id'] ?>" class="text-2xl font-black <?= $isAlarm ? 'text-rose-600' : 'text-indigo-900' ?>">
                        <?= $isAlarm ? '4.8' : '1.4' ?> <span class="text-xs font-normal">mm/s</span>
                    </div>
                    <span class="text-[9px] text-slate-400 font-bold">เกณฑ์เตือน: > <?= $dev['vibration_threshold'] ?> mm/s</span>
                </div>

                <div class="p-3 bg-white border rounded-xl space-y-1">
                    <span class="text-[10px] font-bold text-slate-500 uppercase block">TEMP (อุณหภูมิ)</span>
                    <div id="temp-<?= $dev['id'] ?>" class="text-2xl font-black text-purple-700">
                        <?= $isAlarm ? '68.5' : '48.2' ?> <span class="text-xs font-normal">°C</span>
                    </div>
                    <span class="text-[9px] text-slate-400 font-bold">เกณฑ์เตือน: > <?= $dev['temp_threshold'] ?> °C</span>
                </div>
            </div>

            <div class="h-32">
                <canvas id="chart-<?= $dev['id'] ?>"></canvas>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    <?php foreach ($devices as $dev): ?>
    const ctx<?= $dev['id'] ?> = document.getElementById('chart-<?= $dev['id'] ?>').getContext('2d');
    new Chart(ctx<?= $dev['id'] ?>, {
        type: 'line',
        data: {
            labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
            datasets: [{
                label: 'Vibration (mm/s)',
                data: [1.2, 1.4, 1.3, 1.5, <?= $dev['status'] === 'alarm' ? '4.8' : '1.4' ?>, 1.6],
                borderColor: '<?= $dev['status'] === 'alarm' ? '#e11d48' : '#4f46e5' ?>',
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
    <?php endforeach; ?>
});
</script>

<?php renderFooter(); ?>
