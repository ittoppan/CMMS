<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/services/ApprovalService.php';

$pageTitle = '📩 ศูนย์อนุมัติเอกสาร (LINE & Email 1-Click Approval Center) — CMMS-TOPPAN';
$pdo = getDb();

$msg = '';
$msgType = '';

// Handle Form Action: Create Test Approval Request
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'create_request') {
    try {
        $reqType  = trim($_POST['request_type'] ?? 'repair');
        $docNo    = trim($_POST['document_no'] ?? ('EN-' . date('y') . '-' . rand(100, 999)));
        $title    = trim($_POST['title'] ?? 'ขออนุมัติซ่อมเปลี่ยนอะไหล่มอเตอร์');
        $name     = trim($_POST['requester_name'] ?? $_SESSION['full_name'] ?? 'ช่างซ่อมบำรุง');
        $email    = trim($_POST['approver_email'] ?? 'manager@toppan.co.th');

        $res = ApprovalService::createApprovalRequest($reqType, rand(100, 999), $docNo, $title, $name, [
            'แผนก' => 'วิศวกรรมการผลิต',
            'ประมาณการค่าใช้จ่าย' => '฿ 45,000.00',
            'ความสำคัญ' => '🔴 สูงมาก (Breakdown Risk)'
        ], $email);

        if ($res['success']) {
            $msg = "สร้างคำขออนุมัติเอกสาร $docNo สำเร็จ! ระบบได้ส่งแจ้งเตือนปุ่ม 1-Click อนุมัติไปยัง LINE และ Email เรียบร้อยแล้ว";
            $msgType = 'success';
        }
    } catch (Exception $e) {
        $msg = "เกิดข้อผิดพลาด: " . $e->getMessage();
        $msgType = 'error';
    }
}

// Fetch all approval requests
$requests = $pdo->query("SELECT * FROM approval_requests ORDER BY id DESC LIMIT 50")->fetchAll();

$pendingCount  = (int)$pdo->query("SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'")->fetchColumn();
$approvedCount = (int)$pdo->query("SELECT COUNT(*) FROM approval_requests WHERE status = 'approved'")->fetchColumn();
$rejectedCount = (int)$pdo->query("SELECT COUNT(*) FROM approval_requests WHERE status = 'rejected'")->fetchColumn();

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="card p-6 bg-slate-900 text-white rounded-xl shadow-xl flex items-center justify-between border border-slate-800">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-slate-300">LINE & Email 1-Click Approval Engine</span>
                <span class="badge badge-default text-[10px]">Instant CTA Active</span>
            </div>
            <h1 class="text-2xl font-black flex items-center gap-2">
                <i data-lucide="send" class="w-7 h-7 text-indigo-400"></i>
                <span>ศูนย์การอนุมัติเอกสารผ่าน LINE & Email (1-Click Approval)</span>
            </h1>
            <p class="text-xs text-slate-400 mt-1">อนุมัติหรือปฏิเสธใบสั่งซ่อม F-EN-03, ใบ LOTO, และใบขอเบิกอะไหล่ผ่าน LINE Flex Message หรือ Email ได้ใน 1 สัมผัส</p>
        </div>
        <button onclick="document.getElementById('modalCreate').style.display='flex'" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-2">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>สร้างคำขออนุมัติใหม่</span>
        </button>
    </div>

    <!-- Alert Banner -->
    <?php if ($msg): ?>
    <div class="p-4 <?= $msgType === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200' ?> font-bold rounded-xl border text-xs flex items-center gap-2">
        <i data-lucide="<?= $msgType === 'success' ? 'check-circle' : 'alert-circle' ?>" class="w-4 h-4"></i>
        <span><?= htmlspecialchars($msg) ?></span>
    </div>
    <?php endif; ?>

    <!-- KPI Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-5 space-y-2 border-l-4 border-amber-500">
            <div class="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>คำขอรออนุมัติ (PENDING)</span>
                <i data-lucide="clock" class="w-4 h-4 text-amber-500"></i>
            </div>
            <div class="text-2xl font-black text-amber-600"><?= $pendingCount ?></div>
            <p class="text-[11px] text-slate-400">รอการกดอนุมัติผ่าน LINE / Email</p>
        </div>

        <div class="card p-5 space-y-2 border-l-4 border-emerald-500">
            <div class="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>อนุมัติสำเร็จแล้ว (APPROVED)</span>
                <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500"></i>
            </div>
            <div class="text-2xl font-black text-emerald-600"><?= $approvedCount ?></div>
            <p class="text-[11px] text-slate-400">ดำเนินการอนุมัติสำเร็จเรียบร้อย</p>
        </div>

        <div class="card p-5 space-y-2 border-l-4 border-rose-500">
            <div class="flex justify-between items-center text-xs text-slate-500 font-bold">
                <span>ปฏิเสธคำขอ (REJECTED)</span>
                <i data-lucide="x-circle" class="w-4 h-4 text-rose-500"></i>
            </div>
            <div class="text-2xl font-black text-rose-600"><?= $rejectedCount ?></div>
            <p class="text-[11px] text-slate-400">ไม่อนุมัติพร้อมระบุเหตุผล</p>
        </div>
    </div>

    <!-- Approval Requests Table -->
    <div class="card p-6 space-y-4">
        <div class="flex items-center justify-between border-b pb-3">
            <div>
                <h3 class="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <i data-lucide="list-checks" class="w-5 h-5 text-indigo-600"></i>
                    <span>ประวัติคำขออนุมัติทั้งหมด (Approval Request Logs)</span>
                </h3>
                <p class="text-xs text-slate-500">แสดงผลคำขออนุมัติล่าสุด ลิงก์ 1-Click และสถานะการตอบรับ</p>
            </div>
        </div>

        <div class="overflow-x-auto">
            <table class="table-shadcn tanstack-table">
                <thead>
                    <tr>
                        <th>เลขที่เอกสาร</th>
                        <th>ประเภท</th>
                        <th>หัวข้อคำขออนุมัติ</th>
                        <th>ผู้ส่งเรื่อง</th>
                        <th>ผู้อนุมัติ (Email)</th>
                        <th class="text-center">สถานะ</th>
                        <th class="text-center">1-Click Link</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($requests)): ?>
                    <tr><td colspan="7" class="text-center py-6 text-slate-400">ยังไม่มีคำขออนุมัติในระบบ</td></tr>
                    <?php else: ?>
                    <?php foreach ($requests as $r): ?>
                    <tr>
                        <td class="font-mono font-bold text-indigo-600"><?= htmlspecialchars($r['document_no']) ?></td>
                        <td><span class="badge badge-outline text-[10px] uppercase"><?= htmlspecialchars($r['request_type']) ?></span></td>
                        <td class="font-bold text-slate-900"><?= htmlspecialchars($r['title']) ?></td>
                        <td><?= htmlspecialchars($r['requester_name']) ?></td>
                        <td class="font-mono text-slate-600 text-xs"><?= htmlspecialchars($r['approver_email']) ?></td>
                        <td class="text-center">
                            <?php if ($r['status'] === 'approved'): ?>
                            <span class="badge badge badge-success border-emerald-200">✅ อนุมัติแล้ว</span>
                            <?php elseif ($r['status'] === 'rejected'): ?>
                            <span class="badge badge-destructive">❌ ไม่อนุมัติ</span>
                            <?php else: ?>
                            <span class="badge badge badge-warning border-amber-200">⏳ รออนุมัติ</span>
                            <?php endif; ?>
                        </td>
                        <td class="text-center">
                            <a href="/approve.php?token=<?= $r['approval_token'] ?>" target="_blank" class="btn btn-outline btn-sm text-[11px] gap-1">
                                <i data-lucide="external-link" class="w-3 h-3"></i>
                                <span>เปิดหน้าอนุมัติ</span>
                            </a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

</div>

<!-- Modal: Create New Test Approval Request -->
<div id="modalCreate" style="display:none;" class="dialog-overlay flex items-center justify-center p-4">
    <div class="dialog-content max-w-md w-full">
        <div class="flex items-center justify-between border-b pb-3">
            <h3 class="font-black text-slate-900 text-base flex items-center gap-2">
                <i data-lucide="plus-circle" class="w-5 h-5 text-indigo-600"></i>
                <span>สร้างคำขออนุมัติผ่าน LINE / Email</span>
            </h3>
            <button onclick="document.getElementById('modalCreate').style.display='none'" class="text-slate-400 hover:text-slate-600">
                <i data-lucide="x" class="w-5 h-5"></i>
            </button>
        </div>

        <form method="POST" class="space-y-4">
            <input type="hidden" name="action" value="create_request">

            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">ประเภทเอกสาร:</label>
                <select name="request_type" class="select-field text-xs font-bold">
                    <option value="repair">🔧 ใบสั่งงานซ่อมบำรุง F-EN-03</option>
                    <option value="loto">🛡️ ใบอนุญาตความปลอดภัย LOTO</option>
                    <option value="requisition">📦 ใบขอเบิกอะไหล่ Sage 300</option>
                </select>
            </div>

            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">เลขที่เอกสาร:</label>
                <input type="text" name="document_no" value="EN-<?= date('y') ?>-<?= rand(100, 999) ?>" class="input input-bordered w-full text-xs font-mono font-bold" required>
            </div>

            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">หัวข้อรายการที่ขออนุมัติ:</label>
                <input type="text" name="title" value="อนุมัติงานซ่อมเปลี่ยนซีลยางกระบอกสูบไฮดรอลิก" class="input input-bordered w-full text-xs font-bold" required>
            </div>

            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">ผู้ส่งเรื่องขออนุมัติ:</label>
                <input type="text" name="requester_name" value="<?= htmlspecialchars($_SESSION['full_name'] ?? 'ช่างซ่อมบำรุง') ?>" class="input input-bordered w-full text-xs font-bold" required>
            </div>

            <div class="space-y-1">
                <label class="text-xs font-bold text-slate-700">อีเมลผู้อนุมัติ (Approver Email):</label>
                <input type="email" name="approver_email" value="manager@toppan.co.th" class="input input-bordered w-full text-xs font-mono font-bold" required>
            </div>

            <div class="pt-3 border-t flex justify-end gap-2">
                <button type="button" onclick="document.getElementById('modalCreate').style.display='none'" class="btn btn-outline text-xs">ยกเลิก</button>
                <button type="submit" class="btn btn-primary bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold gap-2">
                    <i data-lucide="send" class="w-3.5 h-3.5"></i>
                    <span>ส่งคำขออนุมัติทันที</span>
                </button>
            </div>
        </form>
    </div>
</div>

<?php renderFooter(); ?>
