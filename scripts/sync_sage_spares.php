<?php
/**
 * Sage 300 Re-Sync Script (CLI)
 * ---------------------------------
 * ดึงข้อมูลอะไหล่จริงจาก Sage 300 (item master + stock + ราคา) แล้วอัปเดตตาราง spare_parts
 *
 * วิธีใช้:
 *   php scripts/sync_sage_spares.php            # dry-run: แสดงผลที่จะเปลี่ยน ไม่เขียน DB
 *   php scripts/sync_sage_spares.php --apply    # เขียนจริง (upsert)
 *   php scripts/sync_sage_spares.php --category REPMEN   # sync เฉพาะหมวด
 *   php scripts/sync_sage_spares.php --apply --category SUPAAD
 *
 * หลักการ:
 *   - แหล่ง stock_qty / unit_price / name / unit / location = Sage 300 (ข้อมูลจริง)
 *   - min_stock / max_stock เป็นค่า CMMS เท่านั้น — สคริปต์นี้ไม่แตะ (ไม่ overwrite)
 *   - ทุก run เขียน log ลง sage_sync_log (dry-run ก็ log ด้วย status=DRY_RUN)
 *   - ถ้า ODBC ล้มเหลว: คืน error ชัดเจน ไม่มี dummy fallback
 */
require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/helpers/sage300.php';

$apply = in_array('--apply', $argv, true);
$categoryFilter = null;
foreach ($argv as $i => $a) {
    if ($a === '--category' && isset($argv[$i + 1])) $categoryFilter = trim($argv[$i + 1]);
}

$pdo = getDb();

// ---- อ่าน config จาก settings ----
function setting($pdo, $key, $default = null) {
    try {
        $v = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = " . $pdo->quote($key))->fetchColumn();
        return $v !== false && $v !== null ? $v : $default;
    } catch (Exception $e) { return $default; }
}

$allowedCats = array_values(array_filter(array_map('trim', explode(',', (string)setting($pdo, 'sage300_allowed_categories', 'REPMEN, SUPAAD, STAAAD, PACWHC')))));
if ($categoryFilter) {
    $allowedCats = [$categoryFilter];
}
if (empty($allowedCats)) {
    fwrite(STDERR, "ERROR: ไม่มีหมวดหมู่อนุญาต (sage300_allowed_categories ว่าง)\n");
    exit(1);
}

$syncConfig = json_decode((string)setting($pdo, 'sage_sync_config', '{}'), true) ?: [];
$mode = $syncConfig['mode'] ?? 'full';
$overwrite = !empty($syncConfig['overwrite']);

echo "=== Sage 300 Re-Sync ===\n";
echo "Mode      : " . ($apply ? "APPLY (เขียนจริง)" : "DRY-RUN (ไม่เขียน)") . "\n";
echo "Categories: " . implode(', ', $allowedCats) . "\n";
echo "Sync mode : $mode | overwrite: " . ($overwrite ? 'yes' : 'no') . "\n\n";

// ---- ดึงข้อมูลจาก Sage 300 ----
$items = Sage300Service::getItemMaster('', $allowedCats);
if (!is_array($items) || empty($items)) {
    $msg = "Sage 300 คืนค่าว่าง/ล้มเหลว (categories: " . implode(',', $allowedCats) . ")";
    fwrite(STDERR, "ERROR: $msg\n");
    try {
        $pdo->prepare("INSERT INTO sage_sync_log (sync_type, status, item_code, doc_no, error_message, created_at) VALUES ('SAGE_SYNC', 'ERROR', ?, ?, ?, NOW())")
            ->execute([implode(',', $allowedCats), '', $msg]);
    } catch (Exception $e) {}
    exit(1);
}
echo "Sage 300 items: " . count($items) . "\n\n";

// ---- เปรียบเทียบกับ DB ----
$newCount = 0; $updateCount = 0; $skipCount = 0; $noChange = 0;
$changes = [];

foreach ($items as $item) {
    $itemNo = trim($item['item_no'] ?? '');
    if ($itemNo === '') { $skipCount++; continue; }

    // ข้ามรายการงานบริการ (SER*) — เป็นงาน/บริการ (JOB, อบรม, ซ่อม) ไม่ใช่อะไหล่สต็อก
    if (str_starts_with($itemNo, 'SER')) { $skipCount++; continue; }

    $name     = trim($item['description'] ?? '') ?: $itemNo;
    $unit     = trim($item['unit'] ?? 'PCS') ?: 'PCS';
    $location = trim($item['location'] ?? '') ?: null; // null = Sage ไม่มีค่า → เก็บค่าเดิมใน CMMS
    $unitPrice = (float)($item['avg_cost'] ?? 0);
    $stockQty  = (float)($item['qty_on_hand'] ?? 0);
    $category  = trim($item['category'] ?? '');

    $check = $pdo->prepare("SELECT id, name, unit, location, unit_price, stock_qty FROM spare_parts WHERE code = ? OR sage_item_no = ?");
    $check->execute([$itemNo, $itemNo]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        // มีอยู่แล้ว — ดูว่าค่าต่างจาก Sage หรือไม่
        $diffs = [];
        if ((string)$existing['name'] !== $name) $diffs[] = "name: '{$existing['name']}' -> '$name'";
        if ((string)$existing['unit'] !== $unit) $diffs[] = "unit: '{$existing['unit']}' -> '$unit'";
        if ((float)$existing['unit_price'] !== $unitPrice) $diffs[] = "unit_price: {$existing['unit_price']} -> $unitPrice";
        if ((float)$existing['stock_qty'] !== $stockQty) $diffs[] = "stock_qty: {$existing['stock_qty']} -> $stockQty";
        // location: อัปเดตเฉพาะเมื่อ Sage มีค่า (ไม่ล้างค่าเดิมที่ CMMS ตั้งเอง)
        if ($location !== null && (string)($existing['location'] ?? '') !== $location) $diffs[] = "location: '{$existing['location']}' -> '$location'";

        if (empty($diffs)) { $noChange++; continue; }

        if ($mode === 'new_only' || !$overwrite) { $skipCount++; continue; }

        $updateCount++;
        $changes[] = "UPDATE $itemNo: " . implode(' | ', $diffs);
        if ($apply) {
            $sql = "UPDATE spare_parts SET name = ?, unit = ?, unit_price = ?, stock_qty = ?, category = ?, sage_item_no = ?, sage_sync_status = 'synced', last_synced_at = NOW()";
            $params = [$name, $unit, $unitPrice, $stockQty, $category, $itemNo];
            if ($location !== null) { $sql .= ", location = ?"; $params[] = $location; }
            $sql .= " WHERE id = ?"; $params[] = $existing['id'];
            $pdo->prepare($sql)->execute($params);
        }
    } else {
        // รายการใหม่
        $newCount++;
        $changes[] = "INSERT $itemNo: $name | unit=$unit | price=$unitPrice | stock=$stockQty | loc=$location";
        if ($apply) {
            $pdo->prepare(
                "INSERT INTO spare_parts (code, name, category, sage_category, unit, location, unit_price, stock_qty, min_stock, max_stock, sage_item_no, sage_sync_status, last_synced_at)
                 VALUES (?, ?, ?, 'Spare Parts', ?, ?, ?, ?, 0, 0, ?, 'synced', NOW())"
            )->execute([$itemNo, $name, $category, $unit, $location, $unitPrice, $stockQty, $itemNo]);
        }
    }
}

// ---- สรุป + log ----
echo "--- สรุป ---\n";
echo "ใหม่      : $newCount\n";
echo "อัปเดต    : $updateCount\n";
echo "ไม่เปลี่ยน : $noChange\n";
echo "ข้าม      : $skipCount\n";
if (!empty($changes)) {
    echo "\n--- รายละเอียด (แสดงสูงสุด 50 รายการ) ---\n";
    foreach (array_slice($changes, 0, 50) as $c) echo "  $c\n";
    if (count($changes) > 50) echo "  ... และอีก " . (count($changes) - 50) . " รายการ\n";
}

$status = $apply ? 'SUCCESS' : 'DRY_RUN';
$summary = "mode=$mode | เพิ่ม $newCount | อัปเดต $updateCount | ไม่เปลี่ยน $noChange | ข้าม $skipCount | cats=" . implode(',', $allowedCats) . ($apply ? '' : ' (dry-run)');
try {
    $pdo->prepare("INSERT INTO sage_sync_log (sync_type, status, item_code, doc_no, error_message, created_at) VALUES ('SAGE_SYNC', ?, ?, ?, ?, NOW())")
        ->execute([$status, implode(',', $allowedCats), '', $summary]);
} catch (Exception $e) {
    fwrite(STDERR, "WARN: log ล้มเหลว: " . $e->getMessage() . "\n");
}

echo "\n" . ($apply ? "✔ Sync เสร็จสิ้น (APPLY)" : "ℹ Dry-run เสร็จ — ใช้ --apply เพื่อเขียนจริง") . "\n";