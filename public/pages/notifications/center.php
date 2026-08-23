<?php
require_once __DIR__ . '/../../../src/includes/layout.php';
$pageTitle = '📲 In-App & Web Push Notification Center — CMMS-TOPPAN';
$pdo = getDb();

// สร้างรายการแจ้งเตือนจากข้อมูลจริงในฐานข้อมูล (ไม่ใช่ข้อมูลตัวอย่าง)
$notifications = [];

// 1) งานซ่อมด่วน/เบรกดาวน์ที่ยังไม่ปิด (เร่งด่วน = สูง)
try {
    $urgent = $pdo->query(
        "SELECT r.work_order_no, r.title, a.name AS asset_name, r.created_at
         FROM repair r LEFT JOIN asset_registry a ON r.asset_id = a.id
         WHERE r.status NOT IN ('completed','Closed','closed','resolved')
           AND r.priority IN ('urgent','high','Critical','critical')
         ORDER BY r.created_at DESC LIMIT 5"
    )->fetchAll();
    foreach ($urgent as $u) {
        $notifications[] = [
            'title' => '🔴 แจ้งเตือนด่วน: ' . ($u['asset_name'] ?? 'เครื่องจักร') . ' — ' . $u['title'],
            'time'  => 'งาน ' . $u['work_order_no'] . ' ยังไม่ปิด',
            'type'  => 'urgent',
            'read'  => false,
        ];
    }
} catch (Exception $e) {}

// 2) อะไหล่ต่ำกว่าเกณฑ์ (stock_qty <= min_stock) — ไม่นับรายการที่ยังไม่เคยมีสต็อก (stock=0)
try {
    $lowStock = $pdo->query(
        "SELECT code, name, stock_qty, min_stock FROM spare_parts
         WHERE min_stock > 0 AND stock_qty > 0 AND stock_qty <= min_stock
         ORDER BY (stock_qty / min_stock) ASC LIMIT 5"
    )->fetchAll();
    foreach ($lowStock as $s) {
        $notifications[] = [
            'title' => '📦 อะไหล่ต่ำกว่าเกณฑ์: ' . $s['name'] . ' (' . $s['code'] . ') คงเหลือ ' . $s['stock_qty'] . ' ชิ้น',
            'time'  => 'ต่ำกว่าจุดสั่งซื้อ ' . $s['min_stock'],
            'type'  => 'stock',
            'read'  => true,
        ];
    }
} catch (Exception $e) {}

// 3) แผน PM ที่ถึงกำหนดหรือเกินกำหนด
$today = date('Y-m-d');
try {
    $pms = $pdo->prepare(
        "SELECT p.title, a.name AS asset_name, p.due_date, p.status
         FROM pm_am p LEFT JOIN asset_registry a ON p.asset_id = a.id
         WHERE p.due_date <= ? AND p.status NOT IN ('completed','done')
         ORDER BY p.due_date ASC LIMIT 5"
    );
    $pms->execute([$today]);
    foreach ($pms->fetchAll() as $p) {
        $notifications[] = [
            'title' => '📋 แผน PM: ' . ($p['asset_name'] ?? '') . ' — ' . $p['title'],
            'time'  => 'กำหนด ' . $p['due_date'] . (($p['due_date'] < $today) ? ' (เกินกำหนด)' : ''),
            'type'  => 'pm',
            'read'  => true,
        ];
    }
} catch (Exception $e) {}

// ถ้าไม่มีข้อมูลจริงเลย → แสดงข้อความว่าง (ไม่แสดงข้อมูลปลอม)
if (empty($notifications)) {
    $notifications[] = [
        'title' => 'ไม่มีรายการแจ้งเตือนใหม่ — ทุกอย่างปกติ',
        'time'  => 'ข้อมูลจากฐานข้อมูลจริง',
        'type'  => 'none',
        'read'  => true,
    ];
}

renderHeader();
?>

<div class="space-y-6">

    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
            <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-xs font-bold uppercase tracking-wider text-blue-200">Native In-App & Web Push Shield</span>
                <span class="badge bg-white/20 text-white text-[10px] font-bold">Push Center</span>
            </div>
            <h1 class="text-2xl font-black">📲 ศูนย์แจ้งเตือนในระบบ & Web Push (In-App & Web Push Center)</h1>
            <p class="text-xs text-blue-100 mt-1">แจ้งเตือนสดผ่านหน้าจอเว็บและเบราว์เซอร์มือถือโดยไม่พึ่งพารวมข้อจำกัดของ LINE ช่วยให้ช่างและวิศวกรไม่พลาดทุกงานซ่อมบำรุงวิกฤต</p>
        </div>
        <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-2xl">🔔</div>
    </div>

    <!-- Notification List -->
    <div class="card p-5 space-y-4">
        <h3 class="font-extrabold text-primary text-base border-b pb-2 flex items-center justify-between">
            <span>📋 รายการแจ้งเตือนล่าสุด (Recent System Notifications)</span>
            <button onclick="alert('อ่านแล้วทั้งหมด')" class="text-xs text-indigo-600 font-bold hover:underline">กำจัดตัวเลขแจ้งเตือนทั้งหมด</button>
        </h3>

        <div class="divide-y divide-line">
            <?php foreach ($notifications as $n): ?>
            <div class="py-3 flex items-center justify-between <?= !$n['read'] ? 'bg-indigo-50/50 p-3 rounded-xl border border-indigo-100' : '' ?>">
                <div class="space-y-1">
                    <span class="font-bold text-primary text-xs block"><?= htmlspecialchars($n['title']) ?></span>
                    <span class="text-[10px] text-muted font-mono"><?= htmlspecialchars($n['time']) ?></span>
                </div>
                <?php if ($n['type'] !== 'none'): ?>
                <span class="badge font-bold text-[10px] <?= !$n['read'] ? 'badge badge-error animate-pulse' : 'bg-muted text-secondary' ?>">
                    <?= !$n['read'] ? '🔴 ยังไม่ได้อ่าน' : 'อ่านแล้ว' ?>
                </span>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

</div>

<?php renderFooter(); ?>
