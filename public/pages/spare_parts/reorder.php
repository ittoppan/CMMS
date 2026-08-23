<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/xlsx.php';
require_once __DIR__ . '/../../../src/services/NotificationService.php';
$pageTitle = 'รายการสั่งซื้อ (Reorder List) — CMMS-TPT';
$pdo = getDb();

$flash = null; // ['ok'|'err', message]

// ---- สร้างใบสั่งซื้ออัตโนมัติ (Auto PO) จากรายการที่ต่ำกว่า min_stock ----
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && isset($_POST['create_po'])) {
    try {
        $pdo->beginTransaction();
        $sql = "SELECT sp.id, sp.code, sp.name, sp.stock_qty, sp.min_stock, sp.max_stock, sp.unit, sp.unit_price,
                       sp.supplier_id, su.name AS supplier_name
                FROM spare_parts sp
                LEFT JOIN suppliers su ON sp.supplier_id = su.id
                WHERE sp.min_stock > 0 AND sp.stock_qty <= sp.min_stock
                ORDER BY su.name, sp.code";
        $rows = $pdo->query($sql)->fetchAll();

        $bySup = [];
        foreach ($rows as $r) {
            $max = (float)$r['max_stock'];
            $stock = (float)$r['stock_qty'];
            $suggest = $max > 0 ? max(0, $max - $stock) : max(0, 2 * (float)$r['min_stock'] - $stock);
            if ($suggest <= 0) continue;
            $bySup[(int)($r['supplier_id'] ?: 0)][] = [$r, (int)round($suggest)];
        }

        if (empty($bySup)) {
            throw new Exception('ไม่มีรายการที่ต้องสั่งซื้อ');
        }

        $created = 0; $totalItems = 0;
        $insReq = $pdo->prepare("INSERT INTO requisitions (requested_by, status, created_at) VALUES (?, 'pending', NOW())");
        $insItem = $pdo->prepare("INSERT INTO requisition_items (requisition_id, spare_part_id, quantity, unit_cost, created_at) VALUES (?, ?, ?, ?, NOW())");

        foreach ($bySup as $supId => $items) {
            $supName = $items[0][0]['supplier_name'] ?: 'ไม่ระบุผู้จำหน่าย';
            $insReq->execute([$_SESSION['user_id'] ?? 1]);
            $reqId = (int)$pdo->lastInsertId();
            foreach ($items as [$r, $suggest]) {
                $insItem->execute([$reqId, $r['id'], $suggest, $r['unit_price'] ?: 0]);
                $totalItems++;
            }
            $created++;
        }

        $pdo->commit();
        $msg = "สร้างใบสั่งซื้อ (Auto PO) สำเร็จ: {$created} ใบ / {$totalItems} รายการ";
        NotificationService::sendLineMessage("🛒 [AUTO PO] {$msg} — ส่งฝ่ายจัดซื้อพิจารณา");
        $flash = ['ok', $msg];
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $flash = ['err', 'สร้างใบสั่งซื้อไม่สำเร็จ: ' . $e->getMessage()];
    }
}

// ---- ดาวน์โหลด Excel ----
if (isset($_GET['download'])) {
    $rows = $pdo->query("
        SELECT sp.code, sp.name, sp.stock_qty, sp.min_stock, sp.max_stock, sp.unit, sp.sage_item_no,
               su.name AS supplier_name
        FROM spare_parts sp
        LEFT JOIN suppliers su ON sp.supplier_id = su.id
        WHERE sp.stock_qty <= sp.min_stock
        ORDER BY su.name, sp.category, sp.code
    ")->fetchAll();
    $headers = ['รหัส', 'ชื่อ', 'ผู้จำหน่าย', 'คงเหลือ', 'ขั้นต่ำ', 'จำนวนสั่งแนะนำ', 'หน่วย', 'Sage No.'];
    $data = [];
    foreach ($rows as $r) {
        $max = (float)$r['max_stock'];
        $stock = (float)$r['stock_qty'];
        $suggest = $max > 0 ? max(0, $max - $stock) : max(0, 2 * (float)$r['min_stock'] - $stock);
        $data[] = [$r['code'], $r['name'], $r['supplier_name'] ?? '-', $stock, (float)$r['min_stock'], (int)round($suggest), $r['unit'] ?? '', $r['sage_item_no'] ?? ''];
    }
    xlsx_download("reorder_list_" . date('Ymd') . ".xlsx", $headers, $data);
}

$rows = $pdo->query("
    SELECT sp.code, sp.name, sp.category, sp.stock_qty, sp.min_stock, sp.max_stock, sp.unit, sp.location, sp.sage_item_no, sp.unit_price,
           su.name AS supplier_name, su.id AS supplier_id
    FROM spare_parts sp
    LEFT JOIN suppliers su ON sp.supplier_id = su.id
    WHERE sp.stock_qty <= sp.min_stock
    ORDER BY su.name, (sp.stock_qty / NULLIF(sp.min_stock, 0)) ASC
")->fetchAll();

$bySupplier = [];
$totalItems = count($rows);
$totalShort = 0; $totalSuggest = 0; $estCost = 0.0;
foreach ($rows as $r) {
    $sup = $r['supplier_name'] ?: 'ไม่ระบุผู้จำหน่าย';
    $bySupplier[$sup][] = $r;
    $short = max(0, (float)$r['min_stock'] - (float)$r['stock_qty']);
    $max = (float)$r['max_stock'];
    $suggest = $max > 0 ? max(0, $max - (float)$r['stock_qty']) : max(0, 2 * (float)$r['min_stock'] - (float)$r['stock_qty']);
    $r['_short'] = $short; $r['_suggest'] = (int)round($suggest);
    $totalShort += $short; $totalSuggest += $r['_suggest'];
    $estCost += $r['_suggest'] * (float)($r['unit_price'] ?? 0);
}

renderHeader();
?>
<div class="space-y-6">
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">🛒 รายการสั่งซื้อ (Reorder List)</h1>
            <p class="text-sm text-secondary mt-1">อะไหล่ที่สต็อกต่ำกว่าจุดขั้นต่ำ — จัดกลุ่มตามผู้จำหน่าย เพื่อส่งฝ่ายจัดซื้อ</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
            <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">← คลังสต็อก</a>
            <a href="reorder.php?download=1" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-bold inline-flex items-center gap-1.5">📥 ดาวน์โหลด Excel</a>
            <form method="post" action="reorder.php" onsubmit="return confirm('สร้างใบสั่งซื้ออัตโนมัติจากรายการทั้งหมด? (จัดกลุ่มตามผู้จำหน่าย)');">
                <button type="submit" name="create_po" value="1" class="h-9 px-3.5 bg-accent text-white rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition-colors hover:opacity-90">🛒 สร้างใบสั่งซื้อ (Auto PO)</button>
            </form>
        </div>
    </div>

    <?php if ($flash): ?>
    <div class="cmms-banner success cmms-card px-4 py-3 text-sm font-semibold <?= $flash[0] === 'ok' ? ' border ' : ' border ' ?>">
        <?= $flash[0] === 'ok' ? '✅' : '❌' ?> <?= htmlspecialchars($flash[1]) ?>
    </div>
    <?php endif; ?>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="cmms-card cmms-stat-card"><span class="cmms-stat-label">รายการที่ต้องสั่ง</span><span class="cmms-stat-value"><?= $totalItems ?></span><span class="cmms-stat-hint">ต่ำกว่า min_stock</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#ea580c"><span class="cmms-stat-label">จำนวนขาดรวม</span><span class="cmms-stat-value"><?= number_format($totalShort) ?></span><span class="cmms-stat-hint">หน่วยตามรายการ</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#16a34a"><span class="cmms-stat-label">จำนวนสั่งแนะนำ</span><span class="cmms-stat-value"><?= number_format($totalSuggest) ?></span><span class="cmms-stat-hint">ถึง max_stock / 2×min</span></div>
        <div class="cmms-card cmms-stat-card" style="--color-accent:#7c3aed"><span class="cmms-stat-label">ผู้จำหน่าย</span><span class="cmms-stat-value"><?= count($bySupplier) ?></span><span class="cmms-stat-hint">ราย</span></div>
    </div>

    <?php foreach ($bySupplier as $sup => $items): ?>
    <div class="cmms-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
            <div class="cmms-section-title mb-0">🏭 <?= htmlspecialchars($sup) ?> <span class="text-xs text-secondary font-normal">(<?= count($items) ?> รายการ)</span></div>
            <span class="text-xs font-bold text-secondary"><?= number_format(array_sum(array_map(fn($x) => $x['_suggest'], $items))) ?> หน่วย</span>
        </div>
        <div class="overflow-x-auto">
            <table class="data-table w-full text-sm">
                <thead><tr>
                    <th class="px-4 py-3 text-left">รหัส</th>
                    <th class="px-4 py-3 text-left">ชื่อ</th>
                    <th class="px-4 py-3 text-left">คงเหลือ</th>
                    <th class="px-4 py-3 text-left">ขั้นต่ำ</th>
                    <th class="px-4 py-3 text-left">ขาด</th>
                    <th class="px-4 py-3 text-left">สั่งแนะนำ</th>
                    <th class="px-4 py-3 text-left">ตำแหน่ง</th>
                </tr></thead>
                <tbody>
                <?php foreach ($items as $r): ?>
                <tr>
                    <td class="px-4 py-3 font-semibold text-primary"><?= htmlspecialchars($r['code']) ?></td>
                    <td class="px-4 py-3 text-secondary"><?= htmlspecialchars(mb_strimwidth((string)$r['name'], 0, 42, '…')) ?></td>
                    <td class="px-4 py-3"><span class="badge badge-critical font-semibold"><?= (float)$r['stock_qty'] ?> <?= htmlspecialchars($r['unit'] ?? '') ?></span></td>
                    <td class="px-4 py-3 text-secondary"><?= (float)$r['min_stock'] ?></td>
                    <td class="px-4 py-3 text-secondary"><?= number_format($r['_short']) ?></td>
                    <td class="px-4 py-3"><span class="badge badge-active font-bold"><?= number_format($r['_suggest']) ?></span></td>
                    <td class="px-4 py-3 text-secondary"><?= htmlspecialchars($r['location'] ?? '-') ?></td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<?php renderFooter(); ?>
