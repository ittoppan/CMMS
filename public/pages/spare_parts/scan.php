<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = 'สแกนบาร์โค้ดอะไหล่ — CMMS-TPT';
$pdo = getDb();

$code = trim($_GET['code'] ?? '');
$part = null;
if ($code !== '') {
    $stmt = $pdo->prepare("
        SELECT sp.*, su.name AS supplier_name
        FROM spare_parts sp
        LEFT JOIN suppliers su ON sp.supplier_id = su.id
        WHERE sp.code = ? OR sp.sage_item_no = ? OR sp.name LIKE ?
        LIMIT 1
    ");
    $stmt->execute([$code, $code, "%$code%"]);
    $part = $stmt->fetch() ?: null;
}

renderHeader();
?>
<div class="space-y-6">
    <div class="cmms-section flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-2xl font-semibold text-primary tracking-tight">📷 สแกนบาร์โค้ดอะไหล่</h1>
            <p class="text-sm text-secondary mt-1">สแกนด้วยกล้องมือถือ หรือพิมพ์รหัส — ตรวจสต็อกแล้วเบิกได้เลย</p>
        </div>
        <a href="index.php" class="h-9 px-3.5 bg-muted hover:bg-border/30 text-primary border border-border rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors">← คลังสต็อก</a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Camera scanner -->
        <div class="cmms-card p-4">
            <div class="cmms-section-title">🎥 สแกนด้วยกล้อง</div>
            <div id="reader" class="w-full overflow-hidden rounded-lg bg-muted/40"></div>
            <p class="text-xs text-secondary mt-2">เล็งกล้องไปที่บาร์โค้ด / QR บนชั้นวางหรือกล่องอะไหล่</p>
        </div>

        <!-- Manual lookup -->
        <div class="cmms-card p-4 space-y-4">
            <div class="cmms-section-title">⌨️ หรือค้นหาด้วยรหัส</div>
            <form method="GET" class="flex gap-2">
                <input type="text" name="code" value="<?= htmlspecialchars($code) ?>" placeholder="รหัสอะไหล่ / Sage No. / ชื่อ..." autofocus
                       class="card flex-1 h-11 px-3 border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/40">
                <button type="submit" class="h-11 px-4 bg-accent text-white rounded-lg text-sm font-bold">ค้นหา</button>
            </form>

            <?php if ($code !== ''): ?>
                <?php if (!$part): ?>
                <div class="cmms-banner error p-4 rounded-lg border text-sm font-semibold">❌ ไม่พบอะไหล่ "<?= htmlspecialchars($code) ?>"</div>
                <?php else:
                    $low = (float)$part['stock_qty'] <= (float)$part['min_stock'];
                ?>
                <div class="rounded-xl border border-border overflow-hidden">
                    <div class="px-4 py-3 bg-accent/5 border-b border-border flex items-center justify-between">
                        <div>
                            <div class="font-bold text-primary"><?= htmlspecialchars($part['code']) ?></div>
                            <div class="text-xs text-secondary mt-0.5"><?= htmlspecialchars($part['name']) ?></div>
                        </div>
                        <?php if ($low): ?><span class="badge badge-critical">⚠️ สต็อกต่ำ</span><?php else: ?><span class="badge badge-active">✅ ปกติ</span><?php endif; ?>
                    </div>
                    <div class="grid grid-cols-2 gap-3 p-4 text-sm">
                        <div><div class="text-xs text-secondary">คงเหลือ</div><div class="text-xl font-extrabold <?= $low ? 'text-red-600' : 'text-green-600' ?>"><?= (float)$part['stock_qty'] ?> <?= htmlspecialchars($part['unit'] ?? '') ?></div></div>
                        <div><div class="text-xs text-secondary">ขั้นต่ำ / สูงสุด</div><div class="font-semibold text-primary"><?= (float)$part['min_stock'] ?> / <?= (float)$part['max_stock'] ?></div></div>
                        <div><div class="text-xs text-secondary">ตำแหน่ง</div><div class="font-semibold text-primary"><?= htmlspecialchars($part['location'] ?? '-') ?></div></div>
                        <div><div class="text-xs text-secondary">ผู้จำหน่าย</div><div class="font-semibold text-primary"><?= htmlspecialchars($part['supplier_name'] ?? '-') ?></div></div>
                        <div><div class="text-xs text-secondary">Sage No.</div><div class="font-semibold text-primary"><?= htmlspecialchars($part['sage_item_no'] ?? '-') ?></div></div>
                        <div><div class="text-xs text-secondary">ราคา/หน่วย</div><div class="font-semibold text-primary"><?= number_format((float)$part['unit_price'], 2) ?></div></div>
                    </div>
                    <div class="flex gap-2 p-3 border-t border-border">
                        <a href="issue_center.php?part=<?= (int)$part['id'] ?>" class="flex-1 h-10 inline-flex items-center justify-center bg-accent text-white rounded-lg text-sm font-bold">📦 เบิกจ่าย</a>
                        <a href="edit.php?id=<?= (int)$part['id'] ?>" class="h-10 px-3 inline-flex items-center justify-center bg-muted text-primary border border-border rounded-lg text-xs font-semibold">แก้ไข</a>
                    </div>
                </div>
                <?php endif; ?>
            <?php endif; ?>
        </div>
    </div>
</div>

<script src="https://unpkg.com/html5-qrcode"></script>
<script>
(function () {
    const el = document.getElementById('reader');
    if (!el || typeof Html5Qrcode === 'undefined') return;
    const qr = new Html5Qrcode('reader');
    qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 150 } },
        (text) => { qr.stop().then(() => { location.href = 'scan.php?code=' + encodeURIComponent(text); }).catch(()=>{}); },
        () => {}
    ).catch((err) => {
        el.innerHTML = '<p class="p-4 text-sm text-secondary">⚠️ เปิดกล้องไม่ได้ — ใช้ช่องค้นหารหัสแทนได้ (' + (err && err.message ? err.message.slice(0, 60) : '') + ')</p>';
    });
})();
</script>
<?php renderFooter(); ?>
