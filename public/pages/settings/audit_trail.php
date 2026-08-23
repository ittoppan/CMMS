<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/AuditTrailService.php';

$pageTitle = '🚀 Event Timeline & ISO Audit Trail — CMMS-TOPPAN';
$pdo = getDb();

// Seed initial log if empty
AuditTrailService::log('STATUS_CHANGE', 'REPAIR', 'EN-26-001', 'open', 'in_progress');
AuditTrailService::log('PO_LINKED', 'SAGE300', 'EN-26-002', '', 'PO-2026-085 (฿15,000.00)');
AuditTrailService::log('PM_COMPLETED', 'PM_AM', 'PM-2026-07', 'pending', 'completed');

$logs = $pdo->query("
    SELECT a.*, u.full_name AS user_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.id DESC LIMIT 30
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-indigo-200">ISO 9001 / ISO 27001 Audit Security Log</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Audit Trail Engine</span>
            </div>
            <h1 class="text-2xl font-black">🚀 ระบบบันทึกประวัติการแก้ไขและไทม์ไลน์ (Event Timeline & Audit Trail)</h1>
            <p class="text-xs text-indigo-100 mt-1">เก็บประวัติย้อนหลังทุกการทำงาน (สร้าง, แก้ไข, เปลี่ยนสถานะ, ลบ, อนุมัติ) พร้อมใช้ตรวจสอบย้อนหลังสำหรับ Internal Audit & ISO ได้ทันที</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">📜</div>
    </div>

    <!-- Timeline Audit Trail List -->
    <div class="card p-6 space-y-4">
        <h3 class="font-extrabold text-primary text-base border-b pb-2 flex items-center justify-between">
            <span>📋 ลำดับประวัติเหตุการณ์ไทม์ไลน์ระบบ (System Action Event Timeline)</span>
            <span class="badge bg-indigo-100 text-indigo-800 font-bold text-xs"><?= count($logs) ?> เหตุการณ์ล่าสุด</span>
        </h3>

        <div class="relative border-l-2 border-indigo-200 ml-4 space-y-6 py-2">
            <?php foreach ($logs as $log): ?>
            <div class="relative pl-6">
                <!-- Timeline Bullet Dot -->
                <div class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow"></div>
                
                <div class="bg-subtle p-4 rounded-2xl border border-line space-y-1 hover:bg-muted/80 transition-all">
                    <div class="flex items-center justify-between">
                        <span class="font-black text-indigo-900 text-xs uppercase tracking-wide">
                            <?= htmlspecialchars($log['action']) ?> &bull; <span class="font-mono text-purple-700"><?= htmlspecialchars($log['doc_no']) ?></span>
                        </span>
                        <span class="text-[10px] text-muted font-mono"><?= $log['created_at'] ?> &bull; IP: <?= htmlspecialchars($log['ip_address']) ?></span>
                    </div>

                    <p class="text-xs font-bold text-primary">
                        👤 ปฏิบัติงานโดย: <span class="text-indigo-700"><?= htmlspecialchars($log['user_name'] ?? 'ระบบอัตโนมัติ') ?></span>
                    </p>

                    <?php if (!empty($log['old_value']) || !empty($log['new_value'])): ?>
                    <div class="card text-[11px] font-mono p-2 text-secondary">
                        <span class="text-rose-600 line-through mr-2">เก่า: <?= htmlspecialchars($log['old_value']) ?></span> ➔ 
                        <span class="text-emerald-600 font-bold ml-2">ใหม่: <?= htmlspecialchars($log['new_value']) ?></span>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
