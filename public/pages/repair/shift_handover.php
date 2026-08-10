<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/NotificationService.php';

$pageTitle = 'ระบบส่งมอบงานระหว่างกะช่าง (Shift Handover & Digital Sign-off) - CMMS-TPT';
$pdo = getDb();
$userId = (int)($_SESSION['user_id'] ?? 1);

$msg = '';
$error = '';

// Handle Shift Handover Submit
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['submit_handover'])) {
    try {
        $fromShift = trim($_POST['from_shift'] ?? 'กะเช้า (08:00 - 20:00)');
        $toShift   = trim($_POST['to_shift'] ?? 'กะดึก (20:00 - 08:00)');
        $notes     = trim($_POST['handover_notes'] ?? '');

        // Fetch pending repairs
        $pendingRepairs = $pdo->query("
            SELECT r.*, a.code AS asset_code, a.name AS asset_name
            FROM repair r
            LEFT JOIN asset_registry a ON r.asset_id = a.id
            WHERE r.status IN ('open', 'acknowledged', 'in_progress', 'waiting_parts', 'waiting_approval')
        ")->fetchAll();

        $itemCount = count($pendingRepairs);

        // Send LINE Flex Message to Next Shift Leader
        $lineText = "\n🔄 [รายงานส่งมอบงานระหว่างกะช่าง (Shift Handover)]\n"
                  . "----------------------------------\n"
                  . "จาก: $fromShift ➔ ไปยัง: $toShift\n"
                  . "ผู้ส่งมอบ: " . ($_SESSION['full_name'] ?? 'ช่างส่งกะ') . "\n"
                  . "งานค้างซ่อมที่ต้องติดตามต่อ: $itemCount รายการ\n"
                  . "----------------------------------\n"
                  . "หมายเหตุส่งกะ: $notes\n"
                  . "----------------------------------\n"
                  . "📲 เปิดระบบ CMMS เพื่อตรวจสอบและลงชื่อรับกะ";

        NotificationService::sendLineMessage($lineText);

        $msg = "ส่งมอบงานระหว่างกะเรียบร้อยแล้ว! ส่งข้อความสรุปงานค้าง ($itemCount รายการ) เข้า LINE กลุ่มช่างสำเร็จ";
    } catch (Exception $e) {
        $error = "เกิดข้อผิดพลาด: " . $e->getMessage();
    }
}

// Fetch active pending repair tasks
$pendingTasks = $pdo->query("
    SELECT r.*, a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    LEFT JOIN users u ON r.assigned_to = u.id
    WHERE r.status IN ('open', 'acknowledged', 'in_progress', 'waiting_parts', 'waiting_approval')
    ORDER BY r.priority = 'critical' DESC, r.created_at DESC
")->fetchAll();

renderHeader();
?>

<div class="space-y-6 max-w-5xl mx-auto">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-teal-700 via-emerald-700 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between flex-wrap gap-4 border border-teal-500/30">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Shift Operations</span>
                <span class="text-xs text-teal-200">Digital Sign-off & LINE Summary</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="repeat" class="w-7 h-7 text-teal-200"></i>
                <span>ระบบส่งมอบงานระหว่างกะช่าง (Shift Handover & Digital Sign-off)</span>
            </h1>
            <p class="text-xs text-teal-100 mt-1">สรุปงานค้างซ่อม เครื่องจักรต้องเฝ้าระวัง และส่งมอบงานกะถัดไปผ่าน LINE อัตโนมัติ ป้องกันข้อมูลตกหล่น</p>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 font-bold text-xs flex items-center gap-2">
        <i data-lucide="check-circle" class="w-4 h-4"></i>
        <span><?= htmlspecialchars($msg) ?></span>
    </div>
    <?php endif; ?>

    <!-- Pending Tasks Summary Card -->
    <div class="card p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-3 flex items-center justify-between">
            <span>📋 รายการงานซ่อมค้างที่ต้องส่งมอบเข้ากะถัดไป (<?= count($pendingTasks) ?> รายการ)</span>
            <span class="badge badge badge-warning text-xs font-bold">Pending Tasks</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
                <thead class="bg-slate-50 font-bold text-slate-600 uppercase">
                    <tr>
                        <th class="px-4 py-3 text-left">เลขที่ใบสั่งซ่อม</th>
                        <th class="px-4 py-3 text-left">เครื่องจักร</th>
                        <th class="px-4 py-3 text-left">อาการเสีย</th>
                        <th class="px-4 py-3 text-center">ความเร่งด่วน</th>
                        <th class="px-4 py-3 text-center">สถานะปัจจุบัน</th>
                        <th class="px-4 py-3 text-left">ช่างผู้รับผิดชอบ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 font-medium">
                    <?php foreach ($pendingTasks as $t): ?>
                    <tr class="hover:bg-slate-50">
                        <td class="px-4 py-3 font-mono font-bold text-indigo-600">#WO-<?= $t['id'] ?></td>
                        <td class="px-4 py-3 font-bold text-slate-900"><?= htmlspecialchars($t['asset_code'] ?? '') ?> - <?= htmlspecialchars($t['asset_name'] ?? '') ?></td>
                        <td class="px-4 py-3 text-slate-700"><?= htmlspecialchars($t['title']) ?></td>
                        <td class="px-4 py-3 text-center">
                            <span class="badge <?= $t['priority'] === 'critical' ? 'badge badge-error font-bold' : 'bg-slate-100 text-slate-700' ?>">
                                <?= strtoupper($t['priority']) ?>
                            </span>
                        </td>
                        <td class="px-4 py-3 text-center font-bold text-amber-600"><?= htmlspecialchars($t['status']) ?></td>
                        <td class="px-4 py-3 text-slate-800 font-semibold"><?= htmlspecialchars($t['assigned_name'] ?? 'ยังไม่ได้มอบหมาย') ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Handover Form -->
    <form method="POST" class="card p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <input type="hidden" name="submit_handover" value="1">

        <h3 class="font-extrabold text-slate-900 text-base border-b pb-3 flex items-center gap-2">
            <i data-lucide="edit-3" class="w-5 h-5 text-teal-600"></i>
            <span>กรอกรายละเอียดการส่งมอบกะ & ลงชื่อส่งกะ</span>
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
                <label class="font-bold text-slate-700 block mb-1">กะผู้ส่งมอบ (From Shift):</label>
                <select name="from_shift" class="input input-bordered w-full font-bold text-slate-800">
                    <option value="กะเช้า (08:00 - 20:00)">กะเช้า (08:00 - 20:00)</option>
                    <option value="กะดึก (20:00 - 08:00)">กะดึก (20:00 - 08:00)</option>
                </select>
            </div>
            <div>
                <label class="font-bold text-slate-700 block mb-1">กะผู้รับมอบ (To Shift):</label>
                <select name="to_shift" class="input input-bordered w-full font-bold text-slate-800">
                    <option value="กะดึก (20:00 - 08:00)">กะดึก (20:00 - 08:00)</option>
                    <option value="กะเช้า (08:00 - 20:00)">กะเช้า (08:00 - 20:00)</option>
                </select>
            </div>
        </div>

        <div class="text-xs">
            <label class="font-bold text-slate-700 block mb-1">หมายเหตุสำคัญส่งถึงกะถัดไป (Handover Notes):</label>
            <textarea name="handover_notes" rows="4" placeholder="ระบุเครื่องจักรที่ต้องเฝ้าระวัง อะไหล่ที่รอของเข้า หรือคำแนะนำเพิ่มเติม..." class="input input-bordered w-full text-xs font-medium"></textarea>
        </div>

        <div class="pt-2 flex justify-end">
            <button type="submit" class="btn btn-primary bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg gap-2">
                <i data-lucide="send" class="w-4 h-4"></i>
                <span>🚀 ลงชื่อส่งมอบกะ & ส่งสรุปเข้า LINE</span>
            </button>
        </div>
    </form>
</div>

<?php renderFooter(); ?>
