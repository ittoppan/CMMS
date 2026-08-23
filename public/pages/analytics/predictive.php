<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/PredictiveService.php';

$pageTitle = 'ระบบปัญญาประดิษฐ์วิเคราะห์พฤติกรรมความเสี่ยงเครื่องจักร (AI Predictive Maintenance) — CMMS-TOPPAN';
$risks = PredictiveService::analyzeMachineRisks();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-purple-200">AI Machine Anomaly & Failure Risk Detector</span>
            </div>
            <h1 class="text-2xl font-black">🔮 ระบบวิเคราะห์ทำนายแนวโน้มเครื่องจักรเสียล่วงหน้า</h1>
            <p class="text-xs text-purple-100 mt-1">บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด (TOPPAN)</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🤖</div>
    </div>

    <!-- AI Risk Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <?php foreach ($risks as $r): ?>
        <?php
            $cardBorder = match($r['risk_level']) {
                'HIGH_ANOMALY' => 'border-rose-400 bg-rose-50/50',
                'MEDIUM_RISK' => 'border-amber-300 bg-amber-50/50',
                default => 'border-slate-200 bg-white'
            };
            $scoreColor = match($r['risk_level']) {
                'HIGH_ANOMALY' => 'text-rose-600',
                'MEDIUM_RISK' => 'text-amber-600',
                default => 'text-emerald-600'
            };
        ?>
        <div class="card p-5 border-2 rounded-2xl shadow-sm space-y-3 transition-all hover:shadow-md <?= $cardBorder ?>">
            <div class="flex items-center justify-between">
                <span class="cmms-banner info font-mono text-xs font-bold px-2 py-0.5 rounded border"><?= htmlspecialchars($r['code']) ?></span>
                <span class="text-2xl font-black <?= $scoreColor ?>"><?= $r['risk_score'] ?>%</span>
            </div>

            <div>
                <h3 class="font-black text-slate-900 text-base"><?= htmlspecialchars($r['name']) ?></h3>
                <span class="text-xs text-slate-500">ผ่านการเสียมาแล้ว: <strong class="text-slate-800"><?= $r['days_since_failure'] ?> วัน</strong> (รวม <?= $r['total_failures'] ?> ครั้ง)</span>
            </div>

            <!-- Risk Progress Bar -->
            <div class="space-y-1">
                <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div class="h-full rounded-full <?= match($r['risk_level']) { 'HIGH_ANOMALY'=>'bg-rose-600', 'MEDIUM_RISK'=>'bg-amber-500', default=>'bg-emerald-500' } ?>" style="width: <?= $r['risk_score'] ?>%;"></div>
                </div>
            </div>

            <div class="p-3 bg-white/80 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                <?= $r['recommendation'] ?>
            </div>

            <div class="pt-1 flex gap-2">
                <a href="/pages/repair/request.php?machineName=<?= urlencode($r['code']) ?>" class="btn btn-primary text-xs font-bold flex-1 py-2">🛠️ ออกใบงานซ่อม</a>
                <a href="/pages/pm_am/checksheet.php?code=<?= urlencode($r['code']) ?>" class="btn btn-secondary text-xs font-bold flex-1 py-2">📋 ทำ PM ด่วน</a>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

</div>

<?php renderFooter(); ?>
