<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/sage300.php';
$pageTitle = 'ดูงานซ่อม - CMMS-TPT';
$pdo = getDb();
$id = (int)($_GET['id'] ?? 0);
$r = $pdo->prepare('
    SELECT r.*, a.name AS asset_name, a.code AS asset_code,
           u.full_name AS assigned_name, cu.full_name AS created_name,
           rt.name AS repair_type_name, fc.name AS failure_code_name, rcc.name AS repair_code_name,
           wz.name AS work_zone_name, loc.name AS location_name, dp.name AS department_name,
           rr.name AS rejection_reason_name
    FROM repair r
    LEFT JOIN asset_registry a ON r.asset_id = a.id
    LEFT JOIN users u ON r.assigned_to = u.id
    LEFT JOIN users cu ON r.created_by = cu.id
    LEFT JOIN repair_types rt ON r.repair_type_id = rt.id
    LEFT JOIN failure_codes fc ON r.failure_code_id = fc.id
    LEFT JOIN repair_codes rcc ON r.repair_code_id = rcc.id
    LEFT JOIN work_zones wz ON r.work_zone_id = wz.id
    LEFT JOIN locations loc ON r.location_id = loc.id
    LEFT JOIN departments dp ON r.department_id = dp.id
    LEFT JOIN rejection_reasons rr ON r.rejection_reason_id = rr.id
    WHERE r.id = ?
'); $r->execute([$id]); $r = $r->fetch();
if (!$r) { header('Location: index.php'); exit; }

// Handle Status Change
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $action = $_POST['action'];
    $validActions = ['acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed'];
    if (in_array($action, $validActions)) {
        $extra = '';
        if ($action === 'acknowledged') $extra = ', acknowledged_at=NOW()';
        if ($action === 'in_progress') $extra = ', actual_start_at=NOW()';
        $pdo->prepare("UPDATE repair SET status=? $extra WHERE id=?")->execute([$action, $id]);
        $pdo->prepare("INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)")
            ->execute([$id, $_SESSION['user_id'] ?? 1, $action, $action]);

        // ส่ง LINE "ซ่อมเสร็จ" เมื่อปิดงาน (resolved/closed) พร้อมรูปก่อน+หลังซ่อม
        if (in_array($action, ['resolved', 'closed']) && !in_array($r['status'], ['resolved', 'closed'])) {
            try {
                require_once __DIR__ . '/../../../src/helpers/notification.php';
                $q = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_notify_enabled'");
                $q->execute();
                if ($q->fetchColumn() === '1') {
                    $assetCode = $r['asset_code'] ?? ''; $assetName = $r['asset_name'] ?? '';
                    $dtStart = !empty($r['downtime_start']) ? strtotime($r['downtime_start']) : 0;
                    $dtEnd = !empty($r['downtime_end']) ? strtotime($r['downtime_end']) : time();
                    $dtHours = ($dtStart > 0 && $dtEnd > $dtStart) ? round(($dtEnd - $dtStart) / 3600, 2) : 0;
                    $totalCost = (float)($r['cost_parts'] ?? 0) + (float)($r['cost_labor'] ?? 0);

                    $title = '✅ ซ่อมเสร็จ: ' . ($r['work_order_no'] ?? "งาน #$id");
                    $body = "เครื่องจักร: " . ($assetCode ?: '-') . ($assetName ? " - $assetName" : '') .
                        "\nรายการ: " . mb_substr($r['title'] ?? '-', 0, 120) .
                        ($dtHours > 0 ? "\n⏱ Downtime: {$dtHours} ชม." : '') .
                        ($totalCost > 0 ? "\n💰 ค่าซ่อมรวม: " . number_format($totalCost, 2) . " บาท" : '') .
                        "\n📸 ดูรูปก่อน/หลังซ่อมด้านล่าง";
                    $detailUrl = publicBaseUrl() . '/repair/view?id=' . $id;

                    $targets = [];
                    $grp = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'line_maintenance_group_id'");
                    $grp->execute();
                    $gid = $grp->fetchColumn();
                    if ($gid) $targets[] = (string)$gid;
                    if (!empty($r['assigned_to'])) {
                        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                        $st->execute([(int)$r['assigned_to']]);
                        $lid = $st->fetchColumn();
                        if ($lid) $targets[] = (string)$lid;
                    }
                    // ผู้แจ้งซ่อม (requester) — ต้องรู้ว่างานเสร็จแล้ว
                    if (!empty($r['created_by'])) {
                        $st = $pdo->prepare("SELECT line_user_id FROM users WHERE id = ? AND is_active = 1");
                        $st->execute([(int)$r['created_by']]);
                        $lid = $st->fetchColumn();
                        if ($lid) $targets[] = (string)$lid;
                    }
                    if (empty($targets)) {
                        $st = $pdo->query("SELECT line_user_id FROM users WHERE is_active = 1 AND line_user_id IS NOT NULL AND line_user_id != ''");
                        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $lid) $targets[] = (string)$lid;
                    }

                    $photos = [
                        'before' => repairPhotoUrls($id, 'failure_image', 2),
                        'after'  => repairPhotoUrls($id, 'after_image', 2)
                    ];
                    foreach (array_unique($targets) as $tid) {
                        sendLinePushMessage($tid, $title, $body, $detailUrl, $photos);
                    }
                }
            } catch (Exception $e) {
                error_log("[repair/view.php] LINE completed notify failed: " . $e->getMessage());
            }
        }

        header("Location: view.php?id=$id"); exit;
    }
}

// Handle Spare Requisition Submission
$reqMsg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['submit_spare_requisition'])) {
    $spId = (int)$_POST['spare_part_id'];
    $qty = (float)$_POST['qty'];
    $userId = (int)($_SESSION['user_id'] ?? 1);
    if ($spId > 0 && $qty > 0) {
        $spInfo = $pdo->query("SELECT unit_price FROM spare_parts WHERE id = $spId")->fetch();
        $pdo->prepare("INSERT INTO spare_issue_requests (work_order_id, requested_by, status, remarks, created_at) VALUES (?, ?, 'Requested', 'ขอเบิกอะไหล่ผ่านหน้างานซ่อม', NOW())")
            ->execute([$id, $userId]);
        $reqId = $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO spare_issue_items (request_id, spare_part_id, qty_requested, unit_cost) VALUES (?, ?, ?, ?)")
            ->execute([$reqId, $spId, $qty, $spInfo['unit_price'] ?? 0]);
        
        $reqMsg = 'ส่งขอเบิกอะไหล่เรียบร้อยแล้ว รอหัวหน้างานและสโตร์ดำเนินการ';
    }
}

$attachments = $pdo->prepare('SELECT * FROM repair_attachments WHERE repair_id = ?'); $attachments->execute([$id]); $attachments = $attachments->fetchAll();
$logs = $pdo->prepare('SELECT l.*, u.full_name FROM repair_activity_log l LEFT JOIN users u ON l.user_id = u.id WHERE l.repair_id = ? ORDER BY l.created_at ASC');
$logs->execute([$id]); $logs = $logs->fetchAll();
$spareParts = $pdo->prepare('SELECT sp.name, sp.code, rsp.quantity_used, rsp.unit_price FROM repair_spare_parts rsp JOIN spare_parts sp ON rsp.spare_part_id = sp.id WHERE rsp.repair_id = ?');
$spareParts->execute([$id]); $spareParts = $spareParts->fetchAll();
$rating = $pdo->prepare('SELECT * FROM repair_ratings WHERE repair_id = ?'); $rating->execute([$id]); $rating = $rating->fetch();
$tags = $pdo->prepare('SELECT t.name, t.color FROM repair_tag_pivot rtp JOIN repair_tags t ON rtp.tag_id = t.id WHERE rtp.repair_id = ?');
$tags->execute([$id]); $tags = $tags->fetchAll();

// Fetch Machine Specific BOM Spares
$bomSpares = [];
if (!empty($r['asset_id'])) {
    $bStmt = $pdo->prepare("
        SELECT mb.*, sp.id AS spare_part_id, sp.code, sp.name, sp.unit, sp.stock_qty, sp.unit_price, sp.sage_item_no
        FROM machine_bom mb
        JOIN spare_parts sp ON mb.spare_part_id = sp.id
        WHERE mb.asset_id = ?
    ");
    $bStmt->execute([$r['asset_id']]);
    $bomSpares = $bStmt->fetchAll();
}

// Fetch All Spares for Search Fallback
$allSpares = $pdo->query("SELECT id, code, name, unit, stock_qty, unit_price, sage_item_no FROM spare_parts ORDER BY code ASC LIMIT 200")->fetchAll();

$statusColors = [
    'open'=>'status-open','acknowledged'=>'status-acknowledged',
    'in_progress'=>'status-in_progress','waiting_parts'=>'status-waiting_parts',
    'waiting_approval'=>'status-waiting_approval','resolved'=>'status-resolved',
    'closed'=>'status-closed','cancelled'=>'status-cancelled','rejected'=>'status-rejected'
];
$statusLabels = [
    'open'=>'Open','acknowledged'=>'Acknowledged','in_progress'=>'In Progress',
    'waiting_parts'=>'Waiting Parts','waiting_approval'=>'Waiting Approval',
    'resolved'=>'Resolved','closed'=>'Closed','cancelled'=>'Cancelled','rejected'=>'Rejected'
];

$nextStatusMap = [
    'open' => ['acknowledged'=>'รับทราบงาน (Acknowledge)'],
    'acknowledged' => ['in_progress'=>'เริ่มดำเนินการ (Start)'],
    'in_progress' => ['waiting_parts'=>'รออะไหล่','waiting_approval'=>'ขออนุมัติ','resolved'=>'ดำเนินการเสร็จ'],
    'waiting_parts' => ['resolved'=>'ดำเนินการเสร็จ'],
    'waiting_approval' => ['resolved'=>'ดำเนินการเสร็จ'],
    'resolved' => ['closed'=>'ปิดงาน'],
];

renderHeader();
?>

<div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-border">
        <div class="flex items-center gap-3">
            <a href="index.php" class="text-secondary hover:text-primary font-medium text-xs">← กลับไปงานซ่อม</a>
            <h1 class="text-2xl font-semibold text-primary">ใบสั่งซ่อม <?= formatWorkOrderNo($r['id'], $r['created_at'], $r['work_order_no'] ?? null) ?></h1>
            <span class="badge bg-muted text-primary border border-border"><?= $statusLabels[$r['status']] ?? $r['status'] ?></span>
        </div>
        <div class="flex gap-2">
            <button onclick="document.getElementById('smart-req-modal').style.display='flex'" class="h-9 px-3.5 bg-accent hover:bg-accent/90 text-white rounded-md text-xs font-semibold inline-flex items-center gap-2 transition-colors shadow-xs">
                <span>📦 ขอเบิกอะไหล่ซ่อมเครื่องนี้ (Machine BOM First)</span>
            </button>
            <a href="print.php?id=<?= $id ?>" target="_blank" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">🖨️ พิมพ์ใบสั่งงานซ่อม (F-EN-03)</a>
        </div>
    </div>

    <?php if ($reqMsg): ?>
    <div class="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 font-bold text-sm">
        ✅ <?= htmlspecialchars($reqMsg) ?>
    </div>
    <?php endif; ?>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-6">
            <div class="card cmms-card p-6 space-y-4">
                <div class="border-b pb-3 flex justify-between items-center">
                    <div>
                        <span class="font-mono text-xs font-bold text-indigo-600"><?= htmlspecialchars($r['asset_code'] ?? 'MCH-SYS') ?></span>
                        <h2 class="text-xl font-extrabold text-slate-900"><?= htmlspecialchars($r['asset_name'] ?? 'ไม่ระบุเครื่องจักร') ?></h2>
                    </div>
                    <span class="text-xs text-slate-500 font-bold">แผนก: <?= htmlspecialchars($r['department_name'] ?? '-') ?></span>
                </div>

                <div>
                    <h3 class="text-xs font-bold text-slate-500 uppercase">อาการเสีย / หัวข้อปัญหา</h3>
                    <p class="text-base font-bold text-slate-900 mt-0.5"><?= htmlspecialchars($r['title']) ?></p>
                </div>

                <?php if ($r['description']): ?>
                <div>
                    <h3 class="text-xs font-bold text-slate-500 uppercase">รายละเอียดอาการเพิ่มเติม</h3>
                    <p class="text-sm text-slate-700 mt-0.5 bg-slate-50 p-3 rounded-lg border border-slate-100"><?= nl2br(htmlspecialchars($r['description'])) ?></p>
                </div>
                <?php endif; ?>

                <?php if (!empty($attachments)): ?>
                <div>
                    <h3 class="text-xs font-bold text-slate-500 uppercase">📸 รูปถ่ายหน้างาน (ก่อน / หลังซ่อม)</h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                        <?php foreach ($attachments as $att):
                            $aPath = htmlspecialchars(ltrim($att['file_path'], '/'));
                            $aLabel = $att['category'] === 'after_image' ? 'หลังซ่อม' : ($att['category'] === 'failure_image' ? 'ก่อนซ่อม' : 'แนบ');
                            $aColor = $att['category'] === 'after_image' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600';
                        ?>
                        <a href="/<?= $aPath ?>" target="_blank" class="group relative rounded-xl overflow-hidden border border-slate-200">
                            <img src="/<?= $aPath ?>" alt="<?= htmlspecialchars($att['file_name']) ?>" class="w-full h-28 object-cover group-hover:scale-105 transition-transform" loading="lazy">
                            <span class="absolute top-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full <?= $aColor ?>"><?= $aLabel ?></span>
                        </a>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>
            </div>

            <!-- Machine BOM Fast Spares List Preview -->
            <div class="card cmms-card p-5 space-y-3">
                <div class="flex justify-between items-center border-b pb-2">
                    <h3 class="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <span>⚙️ รายการอะไหล่มาตรฐานประจำเครื่องนี้ (Machine BOM Catalog)</span>
                        <span class="badge bg-indigo-100 text-indigo-800 text-[10px] font-bold"><?= count($bomSpares) ?> รายการ</span>
                    </h3>
                    <button onclick="document.getElementById('smart-req-modal').style.display='flex'" class="text-xs text-indigo-600 font-bold hover:underline">+ เลือกเบิกอะไหล่ →</button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <?php foreach ($bomSpares as $b): ?>
                    <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                        <div>
                            <span class="font-mono text-[10px] font-bold text-indigo-600"><?= htmlspecialchars($b['code']) ?></span>
                            <span class="font-bold text-slate-900 block"><?= htmlspecialchars($b['name']) ?></span>
                            <span class="text-[10px] text-slate-400">คงเหลือ: <?= number_format($b['stock_qty']) ?> <?= htmlspecialchars($b['unit'] ?? 'ชิ้น') ?></span>
                        </div>
                        <button onclick="quickSelectBom(<?= $b['spare_part_id'] ?>, '<?= htmlspecialchars($b['name'], ENT_QUOTES) ?>')" class="btn btn-secondary btn-sm text-indigo-600 font-bold text-[11px]">
                            + เบิกชิ้นนี้
                        </button>
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($bomSpares)): ?>
                    <div class="col-span-2 text-center py-4 text-slate-400">ยังไม่ได้ตั้งค่าอะไหล่มาตรฐานประจำเครื่องนี้ (สามารถเลือกค้นหาเบิกอะไหล่ทั่วไปได้)</div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Existing Spare Parts Used Table -->
            <?php if ($spareParts): ?>
            <div class="card cmms-card p-6">
                <h2 class="text-lg font-bold text-slate-900 mb-4">รายการอะไหล่ที่เบิกใช้ในงานนี้</h2>
                <table class="data-table cmms-stack-table text-sm">
                    <thead class="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                        <tr><th class="text-left py-2 px-3">รหัส</th><th class="text-left py-2 px-3">ชื่ออะไหล่</th><th class="text-right py-2 px-3">จำนวน</th><th class="text-right py-2 px-3">ราคา/หน่วย</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <?php foreach ($spareParts as $sp): ?>
                        <tr>
                            <td data-label="รหัส" class="py-2 px-3 font-mono font-bold text-indigo-600 text-xs"><?= htmlspecialchars($sp['code']) ?></td>
                            <td data-label="ชื่ออะไหล่" class="py-2 px-3 font-bold text-slate-900"><?= htmlspecialchars($sp['name']) ?></td>
                            <td data-label="จำนวน" class="py-2 px-3 text-right font-bold"><?= htmlspecialchars($sp['quantity_used']) ?></td>
                            <td data-label="ราคา/หน่วย" class="py-2 px-3 text-right font-mono text-xs">฿<?= number_format($sp['unit_price']??0,2) ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <?php endif; ?>
        </div>

        <!-- Sidebar Actions & Info -->
        <div class="space-y-6">
            <div class="card cmms-card p-6">
                <h2 class="text-base font-extrabold text-slate-900 mb-4 border-b pb-2">เปลี่ยนสถานะงานซ่อม</h2>
                <div class="space-y-2">
                    <?php $actions = $nextStatusMap[$r['status']] ?? []; ?>
                    <?php if ($actions): ?>
                    <?php foreach ($actions as $nextSt => $actionLabel): ?>
                    <form method="post" action="?id=<?= $id ?>">
                        <input type="hidden" name="action" value="<?= $nextSt ?>">
                        <button type="submit" class="w-full px-4 py-2 text-xs font-bold text-white rounded-lg transition-all shadow-sm
                            <?php $ac = ['acknowledged'=>'bg-indigo-600 hover:bg-indigo-700','in_progress'=>'bg-yellow-600 hover:bg-yellow-700','waiting_parts'=>'bg-orange-600 hover:bg-orange-700','waiting_approval'=>'bg-purple-600 hover:bg-purple-700','resolved'=>'bg-green-600 hover:bg-green-700','closed'=>'bg-slate-700 hover:bg-slate-800']; echo $ac[$nextSt]??'bg-indigo-600'; ?>">
                            <?= htmlspecialchars($actionLabel) ?>
                        </button>
                    </form>
                    <?php endforeach; ?>
                    <?php else: ?>
                    <p class="text-xs text-slate-400">งานอยู่ในสถานะสิ้นสุดแล้ว</p>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Smart Machine BOM First Requisition -->
<div id="smart-req-modal" style="display:none;" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6 space-y-5">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b pb-3">
            <div>
                <span class="badge bg-indigo-100 text-indigo-800 text-xs font-bold">Smart Machine BOM Requisition</span>
                <h3 class="font-black text-slate-900 text-lg mt-0.5">📦 ขอเบิกอะไหล่ซ่อมเครื่อง: <?= htmlspecialchars($r['asset_name'] ?? 'เครื่องจักร') ?></h3>
            </div>
            <button onclick="document.getElementById('smart-req-modal').style.display='none'" class="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
        </div>

        <!-- 2 Tab Selector -->
        <div class="flex border-b text-xs font-bold">
            <button id="tab-btn-bom" onclick="switchReqTab('bom')" class="px-4 py-2 border-b-2 border-indigo-600 text-indigo-600">
                ⚙️ 1. อะไหล่แนะนำประจำเครื่องนี้ (Machine BOM)
            </button>
            <button id="tab-btn-all" onclick="switchReqTab('all')" class="px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700">
                🔍 2. ค้นหาอะไหล่ทั้งหมดในคลัง (Search All Spares)
            </button>
        </div>

        <form method="POST" class="space-y-4 text-xs">
            <input type="hidden" name="submit_spare_requisition" value="1">
            <input type="hidden" name="spare_part_id" id="modal-spare-id">

            <!-- TAB 1: Machine BOM List -->
            <div id="tab-content-bom" class="space-y-3">
                <p class="text-slate-500">รายการอะไหล่มาตรฐานที่ผูกไว้กับเครื่องจักร <strong><?= htmlspecialchars($r['asset_code'] ?? '') ?></strong>:</p>
                <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
                    <?php foreach ($bomSpares as $b): ?>
                    <div onclick="selectModalSpare(<?= $b['spare_part_id'] ?>, '<?= htmlspecialchars($b['name'], ENT_QUOTES) ?>')" class="p-3 bg-slate-50 hover:bg-indigo-50 border rounded-xl cursor-pointer transition-all flex items-center justify-between">
                        <div>
                            <span class="font-mono text-xs font-extrabold text-indigo-600"><?= htmlspecialchars($b['code']) ?></span>
                            <span class="font-bold text-slate-900 block"><?= htmlspecialchars($b['name']) ?></span>
                            <span class="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-mono">Sage: <?= htmlspecialchars($b['sage_item_no'] ?? '-') ?></span>
                        </div>
                        <div class="text-right">
                            <span class="font-bold text-slate-800 block">คงเหลือ: <?= number_format($b['stock_qty']) ?> <?= htmlspecialchars($b['unit'] ?? 'ชิ้น') ?></span>
                            <span class="text-xs text-indigo-600 font-bold">กดเลือกชิ้นนี้ →</span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <?php if (empty($bomSpares)): ?>
                    <div class="text-center py-6 text-slate-400">ไม่มีรายการอะไหล่ประจำเครื่องนี้ กรุณากดแท็บที่ 2 เพื่อค้นหาอะไหล่อื่นๆ</div>
                    <?php endif; ?>
                </div>
            </div>

            <!-- TAB 2: Search All Spares -->
            <div id="tab-content-all" style="display:none;" class="space-y-3">
                <p class="text-slate-500">เลือกรายการอะไหล่อื่นๆ จากทั้งคลัง Sage 300 และคลังเก่า:</p>
                <select id="modal-select-all" onchange="selectModalSpare(this.value, this.options[this.selectedIndex].text)" class="input input-bordered w-full font-mono">
                    <option value="">-- พิมพ์ค้นหาชื่อง่ายๆ หรือรหัสอะไหล่ --</option>
                    <?php foreach ($allSpares as $sp): ?>
                    <option value="<?= $sp['id'] ?>">
                        <?= htmlspecialchars($sp['code']) ?> - <?= htmlspecialchars($sp['name']) ?> (คงเหลือ: <?= number_format($sp['stock_qty']) ?> <?= htmlspecialchars($sp['unit'] ?? 'ชิ้น') ?>)
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <!-- Selected Spare Indicator & Quantity -->
            <div class="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                <div class="font-bold text-indigo-900 text-sm">
                    อะไหล่ที่เลือก: <span id="modal-selected-name" class="text-purple-700 font-extrabold">(ยังไม่ได้เลือกรายการ)</span>
                </div>
                <div class="flex items-center gap-3">
                    <label class="font-bold text-slate-700">จำนวนที่ขอเบิก:</label>
                    <input type="number" step="0.01" min="0.01" name="qty" required value="1" class="input input-bordered w-full w-32 font-bold text-sm">
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onclick="document.getElementById('smart-req-modal').style.display='none'" class="btn btn-secondary">ยกเลิก</button>
                <button type="submit" class="btn btn-primary bg-purple-700 border-purple-700 hover:bg-purple-800">ส่งคำขอเบิกอะไหล่</button>
            </div>
        </form>

    </div>
</div>

<script>
function switchReqTab(tab) {
    if (tab === 'bom') {
        document.getElementById('tab-content-bom').style.display = 'block';
        document.getElementById('tab-content-all').style.display = 'none';
        document.getElementById('tab-btn-bom').className = 'px-4 py-2 border-b-2 border-indigo-600 text-indigo-600 font-bold';
        document.getElementById('tab-btn-all').className = 'px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700';
    } else {
        document.getElementById('tab-content-bom').style.display = 'none';
        document.getElementById('tab-content-all').style.display = 'block';
        document.getElementById('tab-btn-bom').className = 'px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700';
        document.getElementById('tab-btn-all').className = 'px-4 py-2 border-b-2 border-indigo-600 text-indigo-600 font-bold';
    }
}

function selectModalSpare(id, name) {
    if (!id) return;
    document.getElementById('modal-spare-id').value = id;
    document.getElementById('modal-selected-name').innerText = name;
}

function quickSelectBom(id, name) {
    document.getElementById('smart-req-modal').style.display = 'flex';
    switchReqTab('bom');
    selectModalSpare(id, name);
}
</script>

<?php renderFooter(); ?>
