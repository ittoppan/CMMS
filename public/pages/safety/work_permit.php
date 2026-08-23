<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'ระบบใบอนุญาตทำงานความปลอดภัย & LOTO (Safety Work Permit & LOTO System) — CMMS-TOPPAN';
$pdo = getDb();

// Handle New Work Permit Submission
$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_permit') {
    try {
        $pType     = $_POST['permit_type'] ?? 'hot_work';
        $location  = trim($_POST['location'] ?? 'แผนกผลิตหลัก');
        $repairId  = (int)($_POST['repair_id'] ?? 1);
        $elec      = isset($_POST['loto_electrical']) ? 1 : 0;
        $pneu      = isset($_POST['loto_pneumatic']) ? 1 : 0;
        $hydr      = isset($_POST['loto_hydraulic']) ? 1 : 0;
        $chem      = isset($_POST['loto_chemical']) ? 1 : 0;
        $sig       = $_POST['safety_signature'] ?? '';

        $pNo = 'WP-' . date('Ym') . '-' . str_pad(mt_rand(1, 999), 3, '0', STR_PAD_LEFT);
        $userId = $_SESSION['user_id'] ?? 1;

        $stmt = $pdo->prepare("
            INSERT INTO work_permits (
                permit_no, repair_id, permit_type, location, requested_by,
                loto_electrical, loto_pneumatic, loto_hydraulic, loto_chemical,
                safety_signature, status, valid_from, valid_until, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', NOW(), DATE_ADD(NOW(), INTERVAL 8 HOUR), NOW())
        ");
        $stmt->execute([
            $pNo, $repairId, $pType, $location, $userId,
            $elec, $pneu, $hydr, $chem, $sig
        ]);

        $msg = "สร้างและอนุมัติใบอนุญาตทำงานความปลอดภัย $pNo สำเร็จเรียบร้อยแล้ว!";
    } catch (Exception $e) {
        $msg = "เกิดข้อผิดพลาด: " . $e->getMessage();
    }
}

// Fetch Permits List
$permits = $pdo->query("
    SELECT wp.*, u.full_name AS requester_name, r.work_order_no
    FROM work_permits wp
    LEFT JOIN users u ON wp.requested_by = u.id
    LEFT JOIN repair r ON wp.repair_id = r.id
    ORDER BY wp.id DESC LIMIT 20
")->fetchAll();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-rose-900 via-rose-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-rose-200">ISO 45001 & Industrial Safety Standard</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">TOPPAN Safety Directives</span>
            </div>
            <h1 class="text-2xl font-black">🛡️ ระบบใบอนุญาตทำงานความปลอดภัย & LOTO (Work Permit & Lockout/Tagout)</h1>
            <p class="text-xs text-rose-100 mt-1">อนุมัติงานเสี่ยงอันตรายสูง (Hot Work / Confined Space / High Work) และตัดระบบพลังงานก่อนเข้าซ่อม</p>
        </div>
        <button onclick="document.getElementById('permitModal').style.display='flex'" class="btn btn-primary bg-white text-rose-900 hover:bg-rose-50 text-xs font-black px-4 py-2.5 rounded-xl shadow-lg">
            + ออกใบอนุญาตทำงานความปลอดภัยใหม่
        </button>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 font-bold rounded-2xl border border-emerald-200 text-xs">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <!-- Active Work Permits List -->
    <div class="card p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
            <span>📋 รายการใบอนุญาตทำงานความปลอดภัย (Safety Work Permits Registry)</span>
            <span class="badge badge badge-error font-bold text-xs"><?= count($permits) ?> เอกสาร</span>
        </h3>

        <div class="overflow-x-auto">
            <table class="w-full text-xs text-left border-collapse">
                <thead class="bg-slate-50 font-bold text-slate-700 uppercase border-b">
                    <tr>
                        <th class="p-3">เลขที่ใบอนุญาต</th>
                        <th class="p-3">ประเภทงานเสี่ยง</th>
                        <th class="p-3">ใบสั่งซ่อม</th>
                        <th class="p-3">สถานที่ปฏิบัติงาน</th>
                        <th class="p-3 text-center">LOTO ISOLATION</th>
                        <th class="p-3 text-center">สถานะการอนุมัติ</th>
                        <th class="p-3 text-center">ระยะเวลาคุ้มครอง</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    <?php foreach ($permits as $p): ?>
                    <tr class="hover:bg-slate-50">
                        <td class="p-3 font-mono font-bold text-rose-700 text-sm"><?= htmlspecialchars($p['permit_no']) ?></td>
                        <td class="p-3 font-bold">
                            <span class="badge <?= match($p['permit_type']) { 'hot_work'=>'priority-high', 'confined_space'=>'status-waiting_approval', 'high_work'=>'badge badge-warning', default=>'badge badge-info' } ?> font-bold text-[10px]">
                                <?= strtoupper(str_replace('_', ' ', $p['permit_type'])) ?>
                            </span>
                        </td>
                        <td class="p-3 font-mono text-indigo-700 font-bold"><?= htmlspecialchars($p['work_order_no'] ?? 'EN-26-XXX') ?></td>
                        <td class="p-3 font-bold text-slate-900"><?= htmlspecialchars($p['location']) ?></td>
                        <td class="p-3 text-center">
                            <div class="flex justify-center gap-1">
                                <?php if ($p['loto_electrical']): ?><span class="badge status-active text-[9px] font-bold">⚡ ไฟฟ้า</span><?php endif; ?>
                                <?php if ($p['loto_pneumatic']): ?><span class="badge badge badge-info text-[9px] font-bold">💨 ลม</span><?php endif; ?>
                                <?php if ($p['loto_hydraulic']): ?><span class="badge status-active text-[9px] font-bold">🛢️ น้ำมัน</span><?php endif; ?>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <span class="badge badge badge-success font-bold text-[10px]">✔ APPROVED (อนุมัติแล้ว)</span>
                        </td>
                        <td class="p-3 text-center text-slate-500 font-mono text-[11px]">
                            8 ชั่วโมง (ถึง <?= date('H:i', strtotime($p['valid_until'])) ?> น.)
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<!-- New Work Permit Modal -->
<div id="permitModal" style="display:none;" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-fade-in">
        <div class="flex justify-between items-center border-b pb-3">
            <h3 class="font-extrabold text-slate-900 text-base">🛡️ สร้างใบอนุญาตทำงานความปลอดภัย & LOTO ใหม่</h3>
            <button onclick="document.getElementById('permitModal').style.display='none'" class="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
        </div>

        <form method="POST" class="space-y-4 text-xs">
            <input type="hidden" name="action" value="create_permit">

            <div>
                <label class="block font-bold text-slate-700 mb-1">ประเภทงานที่ต้องขออนุญาตความปลอดภัย (Permit Type) *</label>
                <select name="permit_type" class="input input-bordered w-full bg-white font-bold">
                    <option value="hot_work">🔥 งานประกายไฟ / เชื่อมความร้อน (Hot Work Permit)</option>
                    <option value="confined_space">🛖 งานปฏิบัติงานในที่อับอากาศ (Confined Space Permit)</option>
                    <option value="high_work">🪜 งานปฏิบัติงานบนที่สูง > 2 เมตร (High Work Permit)</option>
                    <option value="electrical">⚡ งานระบบไฟฟ้าแรงสูง (Electrical Safety Permit)</option>
                </select>
            </div>

            <div>
                <label class="block font-bold text-slate-700 mb-1">สถานที่ / เครื่องจักรที่ปฏิบัติงาน *</label>
                <input type="text" name="location" required value="เครื่องพิมพ์ A-PT-01 แผนกพิมพ์" class="input input-bordered w-full font-bold">
            </div>

            <!-- LOTO Isolation Checkboxes -->
            <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <span class="font-extrabold text-rose-900 block text-xs">🔒 การตัดแยกพลังงานก่อนเริ่มซ่อม (LOTO Isolation Checkpoints)</span>
                <div class="grid grid-cols-2 gap-2 text-slate-800 font-bold">
                    <label class="flex items-center gap-2"><input type="checkbox" name="loto_electrical" checked> ⚡ ตัดระบบไฟฟ้า (Electrical Lockout)</label>
                    <label class="flex items-center gap-2"><input type="checkbox" name="loto_pneumatic" checked> 💨 ปิดวาล์วลม (Pneumatic Lockout)</label>
                    <label class="flex items-center gap-2"><input type="checkbox" name="loto_hydraulic" checked> 🛢️ ปล่อยแรงดันไฮดรอลิก (Hydraulic)</label>
                    <label class="flex items-center gap-2"><input type="checkbox" name="loto_chemical"> 🧪 ปิดวาล์วสารเคมี (Chemical Valve)</label>
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onclick="document.getElementById('permitModal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary bg-rose-600 border-rose-600 hover:bg-rose-700">อนุมัติใบอนุญาตความปลอดภัย</button>
            </div>
        </form>
    </div>
</div>

<?php renderFooter(); ?>
