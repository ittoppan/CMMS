<?php
/**
 * scripts/auto_requisition.php — สร้างใบขอซื้อ (requisition) อัตโนมัติจากสต็อกต่ำ
 *
 * เมื่อเปิด auto_req_low_stock=1 ระบบจะวนหารายการอะไหล่ที่ stock_qty <= min_stock
 * (ยังไม่เคยขอซื้อในวันนี้) รวมเป็นใบขอซื้อ 1 ใบต่อวัน (status=pending) แล้ว
 * แจ้งเตือนหัวหน้า/แอดมินทาง LINE เพื่อให้ไปอนุมัติ/สั่งซื้อที่หน้า ศูนย์เบิก-จ่าย
 *
 * ใช้: php auto_requisition.php [--force]
 * Dedup: วันละครั้ง ผ่าน notification_logs (needle AUTO-REQ:YYYY-MM-DD)
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/services/NotificationService.php';
require_once __DIR__ . '/../src/helpers/notification.php';

$force = in_array('--force', $argv, true);
$pdo = getDb();
$today = date('Y-m-d');

// ตั้งค่าเปิด/ปิด
$enabled = '0';
try {
    $enabled = (string)$pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'auto_req_low_stock'")->fetchColumn();
} catch (Throwable $e) {}
if ($enabled !== '1') {
    echo "auto requisition disabled (auto_req_low_stock != 1)\n";
    exit(0);
}

// dedup รายวัน
if (!$force) {
    $stmt = $pdo->prepare("SELECT 1 FROM notification_logs WHERE channel = 'LINE' AND content LIKE ? LIMIT 1");
    $stmt->execute(['%AUTO-REQ:' . $today . '%']);
    if ($stmt->fetchColumn()) {
        echo "skip — ใบขอซื้อ {$today} สร้างไปแล้ว (ใช้ --force เพื่อสร้างซ้ำ)\n";
        exit(0);
    }
}

// รายการสต็อกต่ำที่ยังไม่ถูกขอซื้อวันนี้
$rows = $pdo->query("
    SELECT p.id, p.code, p.name, p.stock_qty, p.min_stock, p.unit, p.unit_price, p.location
    FROM spare_parts p
    WHERE p.stock_qty <= p.min_stock
      AND NOT EXISTS (
        SELECT 1 FROM requisition_items ri
        JOIN requisitions r ON ri.requisition_id = r.id
        WHERE ri.spare_part_id = p.id AND DATE(r.created_at) = '" . $today . "'
      )
    ORDER BY (p.stock_qty = 0) DESC, (p.stock_qty / NULLIF(p.min_stock,0)) ASC
    LIMIT 100
")->fetchAll();

if (empty($rows)) {
    echo "no low stock items today\n";
    exit(0);
}

// สร้างใบขอซื้อ 1 ใบ
$pdo->beginTransaction();
try {
    $ins = $pdo->prepare("INSERT INTO requisitions (repair_id, requested_by, status, created_at) VALUES (NULL, 1, 'pending', NOW())");
    $ins->execute();
    $reqId = (int)$pdo->lastInsertId();

    $item = $pdo->prepare("INSERT INTO requisition_items (requisition_id, spare_part_id, quantity, unit_cost, created_at) VALUES (?,?,?,?,NOW())");
    $summary = [];
    foreach ($rows as $r) {
        // ปริมาณที่ขอ = min_stock * 2 - stock_qty (ขั้นต่ำ 1)
        $qty = max(1, (int)$r['min_stock'] * 2 - (int)$r['stock_qty']);
        $item->execute([$reqId, (int)$r['id'], $qty, (float)$r['unit_price']]);
        $summary[] = $r['code'] . ' (' . $r['stock_qty'] . '/' . $r['min_stock'] . ')' . " ×{$qty}";
    }
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    echo "ERROR: {$e->getMessage()}\n";
    exit(1);
}

// แจ้งเตือนหัวหน้า/แอดมินผ่าน LINE
$msg = "\n📦 [CMMS ใบขอซื้ออัตโนมัติ] #REQ-{$reqId}\n"
     . "อะไหล่ต่ำกว่าจุดสั่งซื้อ " . count($summary) . " รายการ:\n"
     . "- " . implode("\n- ", array_slice($summary, 0, 20))
     . (count($summary) > 20 ? "\n…และอีก " . (count($summary) - 20) . " รายการ" : '')
     . "\n----------------------------------\n"
     . "📋 ตรวจสอบ/อนุมัติ: " . rtrim((string)publicBaseUrl(), '/') . "/pages/spare_parts/issue_center/";

$sent = 0;
if (getSettingValue('line_notify_enabled', '0') === '1') {
    try {
        NotificationService::sendLineMessage($msg);
        $sent = 1;
    } catch (Throwable $e) {
        echo "LINE failed: {$e->getMessage()}\n";
    }
}
echo "== auto requisition REQ-{$reqId} created (" . count($rows) . " items, LINE sent={$sent}) ==\n";
exit(0);
