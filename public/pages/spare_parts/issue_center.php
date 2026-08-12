<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
$pageTitle = 'Unified Material & Spare Issue Center (ศูนย์ควบคุมการเบิก-จ่ายวัสดุ & Sage 300) - CMMS-TPT';
$pdo = getDb();
$userId = (int)($_SESSION['user_id'] ?? 1);

// Export CSV Report for Sage 300 Key-in
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="Sage300_Issue_Report_' . date('Ymd_His') . '.csv"');
    
    $out = fopen('php://output', 'w');
    fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF)); // UTF-8 BOM
    fputcsv($out, ['เลขใบเบิก', 'Work Order', 'รหัสเครื่องจักร', 'ชื่อเครื่องจักร', 'รหัสอะไหล่', 'ชื่ออะไหล่', 'จำนวนเบิก', 'หน่วยนับ', 'ต้นทุนเฉลี่ย (บาท)', 'ราคารวม (บาท)', 'ผู้ขอเบิก', 'วันที่เบิก', 'สถานะ']);

    $rows = $pdo->query("
        SELECT r.id AS req_id, r.work_order_id, r.created_at, r.status,
               a.code AS asset_code, a.name AS asset_name,
               sp.code AS spare_code, sp.name AS spare_name, sp.unit AS unit_name,
               sri.qty_requested, sri.unit_cost, (sri.qty_requested * sri.unit_cost) AS total_cost,
               u1.full_name AS requester_name
        FROM spare_issue_requests r
        JOIN spare_issue_items sri ON r.id = sri.request_id
        JOIN spare_parts sp ON sri.spare_part_id = sp.id
        LEFT JOIN repair wo ON r.work_order_id = wo.id
        LEFT JOIN asset_registry a ON wo.asset_id = a.id
        LEFT JOIN users u1 ON r.requested_by = u1.id
        ORDER BY r.id DESC
    ")->fetchAll();

    foreach ($rows as $rw) {
        fputcsv($out, [
            'REQ-#' . $rw['req_id'],
            'WO-#' . $rw['work_order_id'],
            $rw['asset_code'] ?? '-',
            $rw['asset_name'] ?? '-',
            $rw['spare_code'],
            $rw['spare_name'],
            $rw['qty_requested'],
            $rw['unit_name'] ?? 'PCS',
            number_format($rw['unit_cost'], 2),
            number_format($rw['total_cost'], 2),
            $rw['requester_name'],
            $rw['created_at'],
            $rw['status']
        ]);
    }
    fclose($out);
    exit;
}

$msg = '';
$error = '';

// Handle Direct Counter Issue Creation
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['create_direct_issue'])) {
    try {
        $woId = (int)$_POST['work_order_id'];
        $spareId = (int)$_POST['spare_part_id'];
        $qty = (float)$_POST['qty'];

        if ($woId <= 0 || $spareId <= 0 || $qty <= 0) {
            throw new Exception("กรุณากรอกข้อมูลเลือกใบสั่งซ่อม อะไหล่ และจำนวนให้ถูกต้อง");
        }

        // Fetch Spare details
        $spStmt = $pdo->prepare("SELECT * FROM spare_parts WHERE id = ?");
        $spStmt->execute([$spareId]);
        $spare = $spStmt->fetch();

        if (!$spare) throw new Exception("ไม่พบรายการอะไหล่ในระบบ");

        $totalVal = $qty * (float)$spare['unit_price'];
        $priceThreshold = (float)($pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'spare_approval_price_threshold'")->fetchColumn() ?: 5000);

        require_once __DIR__ . '/../../../src/services/ApprovalService.php';

        if ($totalVal >= $priceThreshold) {
            // Requires 1-Click LINE Approval
            $stmt = $pdo->prepare("
                INSERT INTO spare_issue_requests (work_order_id, requested_by, status, remarks, created_at)
                VALUES (?, ?, 'Pending', 'ขอเบิกอะไหล่มูลค่าสูงเกินเกณฑ์ รอการอนุมัติ', NOW())
            ");
            $stmt->execute([$woId, $userId]);
            $reqId = $pdo->lastInsertId();

            $itemStmt = $pdo->prepare("
                INSERT INTO spare_issue_items (request_id, spare_part_id, qty_requested, qty_issued, unit_cost)
                VALUES (?, ?, ?, 0, ?)
            ");
            $itemStmt->execute([$reqId, $spareId, $qty, $spare['unit_price']]);

            $uName = $_SESSION['full_name'] ?? 'ช่างซ่อมบำรุง';
            ApprovalService::createApprovalRequest(
                'spare_issue',
                (int)$reqId,
                'REQ-#' . $reqId,
                'ขอเบิกอะไหล่ ' . $spare['name'] . ' (' . number_format($totalVal, 2) . ' บาท)',
                $uName,
                ['อะไหล่' => $spare['name'], 'จำนวน' => $qty . ' ' . $spare['unit'], 'ราคารวม' => number_format($totalVal, 2) . ' บาท']
            );

            $msg = "📩 การขอเบิกอะไหล่มูลค่าสูง (" . number_format($totalVal, 2) . " บาท) เกินเกณฑ์อนุมัติ " . number_format($priceThreshold, 2) . " บาท ระบบส่งคำขอ 1-Click Approval เข้า LINE & Email ผู้จัดการเรียบร้อยแล้ว!";
        } else {
            // Direct Counter Issue Below Threshold
            $stmt = $pdo->prepare("
                INSERT INTO spare_issue_requests (work_order_id, requested_by, approved_by, issued_by, status, remarks, created_at)
                VALUES (?, ?, ?, ?, 'Issued', 'เบิกจ่ายด่วนหน้าสโตร์', NOW())
            ");
            $stmt->execute([$woId, $userId, $userId, $userId]);
            $reqId = $pdo->lastInsertId();

            $itemStmt = $pdo->prepare("
                INSERT INTO spare_issue_items (request_id, spare_part_id, qty_requested, qty_issued, unit_cost)
                VALUES (?, ?, ?, ?, ?)
            ");
            $itemStmt->execute([$reqId, $spareId, $qty, $qty, $spare['unit_price']]);

            $items = [['spare_part_id' => $spareId, 'qty_issued' => $qty, 'unit_cost' => $spare['unit_price']]];
            $sageRes = Sage300Service::postInventoryIssue($woId, $items, $userId);

            if ($sageRes['success']) {
                $pdo->prepare("UPDATE spare_issue_requests SET sage_doc_no = ? WHERE id = ?")
                    ->execute([$sageRes['sage_doc_no'], $reqId]);
                $msg = "⚡ จ่ายอะไหล่ด่วนสำเร็จ และสั่งตัดสต็อก Sage 300 เรียบร้อย! เอกสาร Sage: " . $sageRes['sage_doc_no'];
            }
        }

    } catch (Exception $e) {
        $error = "เกิดข้อผิดพลาด: " . $e->getMessage();
    }
}

// Handle Queue Actions (Approve, Issue, Return, Reject)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $reqId = (int)($_POST['request_id'] ?? 0);
    $action = $_POST['action'];

    try {
        if ($action === 'approve') {
            $pdo->prepare("UPDATE spare_issue_requests SET status = 'Approved', approved_by = ?, updated_at = NOW() WHERE id = ?")
                ->execute([$userId, $reqId]);
            Sage300Service::logAudit($userId, 'Spare_Issue', 'Approve_Requisition', 'Requested', "Approved Req #$reqId");
            $msg = 'อนุมัติใบขอเบิกอะไหล่เรียบร้อยแล้ว';
        } 
        elseif ($action === 'issue') {
            $stmt = $pdo->prepare("SELECT sri.*, sp.name AS spare_name FROM spare_issue_items sri JOIN spare_parts sp ON sri.spare_part_id = sp.id WHERE sri.request_id = ?");
            $stmt->execute([$reqId]);
            $items = $stmt->fetchAll();

            $rStmt = $pdo->prepare("SELECT work_order_id FROM spare_issue_requests WHERE id = ?");
            $rStmt->execute([$reqId]);
            $woId = (int)$rStmt->fetchColumn();

            $sageRes = Sage300Service::postInventoryIssue($woId, $items, $userId);

            if ($sageRes['success']) {
                $pdo->prepare("UPDATE spare_issue_requests SET status = 'Issued', issued_by = ?, sage_doc_no = ?, updated_at = NOW() WHERE id = ?")
                    ->execute([$userId, $sageRes['sage_doc_no'], $reqId]);
                $msg = "จ่ายอะไหล่และตัดสต็อกใน Sage 300 เรียบร้อย! เอกสาร Sage: " . $sageRes['sage_doc_no'];
            }
        }
        elseif ($action === 'return') {
            $stmt = $pdo->prepare("SELECT sri.*, sp.name AS spare_name FROM spare_issue_items sri JOIN spare_parts sp ON sri.spare_part_id = sp.id WHERE sri.request_id = ?");
            $stmt->execute([$reqId]);
            $items = $stmt->fetchAll();

            $rStmt = $pdo->prepare("SELECT work_order_id FROM spare_issue_requests WHERE id = ?");
            $rStmt->execute([$reqId]);
            $woId = (int)$rStmt->fetchColumn();

            foreach ($items as &$it) {
                $it['qty_returned'] = $it['qty_issued'];
            }

            $sageRes = Sage300Service::postInventoryReturn($woId, $items, $userId);

            if ($sageRes['success']) {
                $pdo->prepare("UPDATE spare_issue_requests SET status = 'Returned', updated_at = NOW() WHERE id = ?")
                    ->execute([$reqId]);
                $msg = "คืนอะไหล่และอัปเดตสต็อกใน Sage 300 เรียบร้อย! เอกสาร Sage: " . $sageRes['sage_doc_no'];
            }
        }
        elseif ($action === 'reject') {
            $pdo->prepare("UPDATE spare_issue_requests SET status = 'Cancelled', updated_at = NOW() WHERE id = ?")
                ->execute([$reqId]);
            $msg = 'ปฏิเสธใบขอเบิกอะไหล่เรียบร้อยแล้ว';
        }
    } catch (Exception $e) {
        $error = 'เกิดข้อผิดพลาด: ' . $e->getMessage();
    }
}

// Fetch all Requisitions Queue
$stmt = $pdo->query("
    SELECT r.*, 
           MAX(wo.title) AS wo_title, 
           MAX(a.code) AS asset_code, 
           MAX(a.name) AS asset_name,
           MAX(sp.code) AS spare_code, 
           MAX(sp.name) AS spare_name, 
           MAX(sp.image_url) AS spare_image,
           MAX(u1.full_name) AS requester_name, 
           MAX(u2.full_name) AS approver_name, 
           MAX(u3.full_name) AS issuer_name
    FROM spare_issue_requests r
    LEFT JOIN spare_issue_items sri ON r.id = sri.request_id
    LEFT JOIN spare_parts sp ON sri.spare_part_id = sp.id
    LEFT JOIN repair wo ON r.work_order_id = wo.id
    LEFT JOIN asset_registry a ON wo.asset_id = a.id
    LEFT JOIN users u1 ON r.requested_by = u1.id
    LEFT JOIN users u2 ON r.approved_by = u2.id
    LEFT JOIN users u3 ON r.issued_by = u3.id
    GROUP BY r.id
    ORDER BY r.created_at DESC
");
$requests = $stmt->fetchAll();

// Fetch Active Repair Orders for Direct Store Form Dropdown
$repairs = $pdo->query("
    SELECT r.id, r.title, a.code AS asset_code, a.name AS asset_name 
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    WHERE r.status != 'Completed'
    ORDER BY r.id DESC
")->fetchAll();

// Fetch Spare Parts for Direct Store Form Dropdown
$spares = $pdo->query("SELECT id, code, name, unit, stock_qty, unit_price, sage_item_no FROM spare_parts ORDER BY code ASC")->fetchAll();

$dsn = getenv('SAGE300_ODBC_DSN') ?: 'TFPT2C';

renderHeader();
?>

<div class="space-y-6">
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 rounded-2xl shadow-lg flex items-center justify-between flex-wrap gap-4">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase">Unified Material & Spare Issue Center</span>
                <span class="text-xs text-purple-200">Sage 300 ODBC: <?= htmlspecialchars($dsn) ?></span>
            </div>
            <h1 class="text-2xl font-black">📦 ศูนย์บริการเบิก-จ่ายอะไหล่ & Sage 300 (Unified Issue Center 360)</h1>
            <p class="text-xs text-purple-100 mt-1">รวมศูนย์จัดการคำขอเบิกจากช่าง, จ่ายของด่วนหน้าเคาน์เตอร์สโตร์, ตัดสต็อกและส่งบัญชี Sage 300 ในหน้าเดียว</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="?export=csv" class="btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow">
                📥 ดาวน์โหลด CSV คีย์ Sage 300
            </a>
            <a href="../settings/sage300_config.php" class="btn bg-white text-purple-800 font-bold text-xs shadow hover:bg-purple-50">
                🔌 ตั้งค่า Sage 300 (<?= htmlspecialchars($dsn) ?>)
            </a>
        </div>
    </div>

    <?php if ($msg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 font-bold text-sm">
        ✅ <?= htmlspecialchars($msg) ?>
    </div>
    <?php endif; ?>

    <?php if ($error): ?>
    <div class="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 font-bold text-sm">
        ❌ <?= htmlspecialchars($error) ?>
    </div>
    <?php endif; ?>

    <!-- Quick Stats Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="card cmms-card cmms-stat-card p-4">
            <span class="cmms-stat-label text-amber-600">คิวรอจ่ายของ</span>
            <span class="cmms-stat-value text-amber-600"><?= count(array_filter($requests, fn($r) => in_array($r['status'], ['Requested', 'Approved']))) ?></span>
            <span class="cmms-stat-hint">Requested / Approved</span>
        </div>
        <div class="card cmms-card cmms-stat-card p-4">
            <span class="cmms-stat-label text-emerald-600">จ่ายแล้ว (Sage)</span>
            <span class="cmms-stat-value text-emerald-600"><?= count(array_filter($requests, fn($r) => $r['status'] === 'Issued')) ?></span>
            <span class="cmms-stat-hint">ตัดสต็อกแล้ว</span>
        </div>
        <div class="card cmms-card cmms-stat-card p-4">
            <span class="cmms-stat-label text-purple-600">คืนอะไหล่</span>
            <span class="cmms-stat-value text-purple-600"><?= count(array_filter($requests, fn($r) => $r['status'] === 'Returned')) ?></span>
            <span class="cmms-stat-hint">Returned</span>
        </div>
        <div class="card cmms-card cmms-stat-card p-4">
            <span class="cmms-stat-label">Sage 300 DSN</span>
            <span class="cmms-stat-value text-base font-mono" style="font-size: .95rem; word-break: break-all;"><?= htmlspecialchars($dsn) ?></span>
            <span class="cmms-stat-hint">การเชื่อมต่อ</span>
        </div>
    </div>

    <!-- 2 Column Layout: Left = Quick Issue Form, Right = Requisition Queue -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Form: จ่ายของด่วนหน้าสโตร์ (Direct Store Counter Issue Form) -->
        <div class="card cmms-card p-5 space-y-4">
            <h3 class="font-extrabold text-slate-900 text-base border-b pb-2 flex items-center justify-between">
                <span>⚡ จ่ายของด่วนหน้าสโตร์ (Direct Store Counter Issue)</span>
                <span class="badge bg-purple-100 text-purple-800 font-bold text-xs">Instant Issue</span>
            </h3>

            <form method="POST" class="space-y-4 text-xs">
                <input type="hidden" name="create_direct_issue" value="1">

                <div>
                    <label class="font-bold text-slate-700 block mb-1">เลือกใบสั่งซ่อม F-EN-03 (Work Order)</label>
                    <select name="work_order_id" required class="input input-bordered w-full font-medium">
                        <option value="">-- เลือกใบสั่งซ่อมที่ช่างมาเบิก --</option>
                        <?php foreach ($repairs as $r): ?>
                        <option value="<?= $r['id'] ?>">#WO-<?= $r['id'] ?> - <?= htmlspecialchars($r['asset_code']) ?> (<?= htmlspecialchars(mb_substr($r['title'], 0, 25)) ?>...)</option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label class="font-bold text-slate-700 block mb-1">เลือกรายการอะไหล่ (Sage 300 / คลังเก่า)</label>
                    <select name="spare_part_id" required class="input input-bordered w-full font-mono">
                        <option value="">-- ค้นหาและเลือกรายการอะไหล่ --</option>
                        <?php foreach ($spares as $sp): ?>
                        <option value="<?= $sp['id'] ?>">
                            <?= htmlspecialchars($sp['code']) ?> - <?= htmlspecialchars($sp['name']) ?> (คงเหลือ: <?= number_format($sp['stock_qty']) ?> <?= htmlspecialchars($sp['unit'] ?? 'ชิ้น') ?>)
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div>
                    <label class="font-bold text-slate-700 block mb-1">จำนวนที่เบิกจ่ายให้ช่าง</label>
                    <input type="number" step="0.01" min="0.01" name="qty" required value="1" class="input input-bordered w-full font-bold text-sm">
                </div>

                <button type="submit" onclick="return confirm('ยืนยันจ่ายของด่วนและสั่งตัดสต็อกเข้า Sage 300 ใช่หรือไม่?')" class="btn btn-primary bg-purple-700 border-purple-700 hover:bg-purple-800 text-xs w-full py-3 font-extrabold shadow-md">
                    ⚡ จ่ายของทันที & ตัดสต็อก Sage 300
                </button>
            </form>
        </div>

        <!-- Table: คิวรายการขอเบิกจากช่าง & สถานะการจ่ายของ (Requisitions Queue) -->
        <div class="lg:col-span-2 card bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-3">
            <div class="p-4 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center">
                <span>📋 คิวรายการขอเบิกจากช่าง & ประวัติการตัดสต็อก (Requisitions Queue)</span>
                <span class="text-xs text-slate-400">เรียงตามวันที่ล่าสุด</span>
            </div>

            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200 text-sm cmms-stack-table">
                    <thead class="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                        <tr>
                            <th class="px-4 py-3 text-left">เลขที่ใบเบิก / WO</th>
                            <th class="px-4 py-3 text-left">รูปอะไหล่</th>
                            <th class="px-4 py-3 text-left">เครื่องจักร / อาการเสีย</th>
                            <th class="px-4 py-3 text-left">ผู้ขอเบิก</th>
                            <th class="px-4 py-3 text-center">สถานะ</th>
                            <th class="px-4 py-3 text-center">เอกสาร Sage 300</th>
                            <th class="px-4 py-3 text-center">การดำเนินการ (Actions)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <?php foreach ($requests as $rq): ?>
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 font-mono text-xs" data-label="ใบเบิก / WO">
                                <span class="font-extrabold text-indigo-600 block">#REQ-<?= $rq['id'] ?></span>
                                <span class="text-slate-400 block font-bold">#WO-<?= $rq['work_order_id'] ?></span>
                            </td>
                            <td class="px-4 py-3" data-hide-label>
                                <img src="<?= getImageUrl($rq['spare_image'] ?? null, 'spare') ?>" class="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm bg-slate-50" title="<?= htmlspecialchars($rq['spare_name'] ?? 'อะไหล่') ?>">
                            </td>
                            <td class="px-4 py-3" data-label="เครื่องจักร / อาการเสีย">
                                <span class="font-bold text-slate-900 block text-xs"><?= htmlspecialchars($rq['asset_code'] ?? '-') ?> - <?= htmlspecialchars($rq['asset_name'] ?? '-') ?></span>
                                <span class="text-[11px] text-slate-500 block truncate max-w-xs"><?= htmlspecialchars($rq['wo_title'] ?? '-') ?></span>
                                <?php if (!empty($rq['spare_name'])): ?>
                                <span class="text-[11px] text-indigo-600 font-bold block mt-0.5">⚙️ อะไหล่: <?= htmlspecialchars($rq['spare_name']) ?></span>
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-xs text-slate-700 font-medium" data-label="ผู้ขอเบิก">
                                <?= htmlspecialchars($rq['requester_name'] ?? 'ช่างผู้เบิก') ?>
                                <span class="text-[10px] text-slate-400 block"><?= date('d/m/Y H:i', strtotime($rq['created_at'])) ?></span>
                            </td>
                            <td class="px-4 py-3 text-center" data-label="สถานะ">
                                <span class="badge <?= match($rq['status']) {
                                    'Requested' => 'badge badge-warning',
                                    'Approved'  => 'badge badge-info',
                                    'Issued'    => 'badge badge-success',
                                    'Returned'  => 'bg-purple-100 text-purple-800',
                                    'Cancelled' => 'badge badge-error',
                                    default     => 'bg-slate-100 text-slate-800'
                                } ?>">
                                    <?= htmlspecialchars($rq['status']) ?>
                                </span>
                            </td>
                            <td class="px-4 py-3 text-center font-mono text-xs" data-label="เอกสาร Sage">
                                <?php if (!empty($rq['sage_doc_no'])): ?>
                                <span class="badge bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px]"><?= htmlspecialchars($rq['sage_doc_no']) ?></span>
                                <?php else: ?>
                                <span class="text-slate-400 text-xs italic">-</span>
                                <?php endif; ?>
                            </td>
                            <td class="px-4 py-3 text-center space-x-1 text-xs" data-label="การดำเนินการ">
                                <form method="POST" class="inline-block">
                                    <input type="hidden" name="request_id" value="<?= $rq['id'] ?>">

                                    <?php if ($rq['status'] === 'Requested'): ?>
                                    <button type="submit" name="action" value="approve" class="btn btn-secondary btn-sm text-blue-600 font-bold">✔ อนุมัติ</button>
                                    <button type="submit" name="action" value="reject" class="btn btn-secondary btn-sm text-rose-600 font-bold">❌ ปฏิเสธ</button>
                                    <?php endif; ?>

                                    <?php if (in_array($rq['status'], ['Requested', 'Approved'])): ?>
                                    <button type="submit" name="action" value="issue" onclick="return confirm('ยืนยันจ่ายของให้ช่างและตัดสต็อก Sage 300 ใช่หรือไม่?')" class="btn btn-primary btn-sm bg-purple-700 border-purple-700 hover:bg-purple-800 font-bold">
                                        📦 สโตร์จ่ายของ (Issue)
                                    </button>
                                    <?php endif; ?>

                                    <?php if ($rq['status'] === 'Issued'): ?>
                                    <button type="submit" name="action" value="return" onclick="return confirm('ยืนยันคืนอะไหล่เข้าสต็อก Sage 300 ใช่หรือไม่?')" class="btn btn-secondary btn-sm text-purple-700 font-bold">
                                        🔄 คืนอะไหล่
                                    </button>
                                    <?php endif; ?>
                                </form>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                        <?php if (empty($requests)): ?>
                        <tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">ยังไม่มีคิวคำขอเบิกอะไหล่ในระบบ</td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

    </div>
</div>

<?php renderFooter(); ?>
