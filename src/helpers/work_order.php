<?php
/**
 * src/helpers/work_order.php - สร้างเลขใบงานมาตรฐานเดียวทั้งระบบ
 * Format: EN-{YYMM}-{NNN}  เช่น EN-2608-001
 *
 * ใช้ใน: public/api/v1/repair.php, public/pages/repair/request.php, public/pages/repair/create.php
 */

if (!function_exists('generateWorkOrderNo')) {
    function generateWorkOrderNo(PDO $pdo): string {
        $yymm = date('ym'); // e.g. 2608
        $prefix = "EN-" . $yymm . "-";

        $stmt = $pdo->prepare("SELECT work_order_no FROM repair WHERE work_order_no LIKE ? ORDER BY work_order_no DESC LIMIT 1");
        $stmt->execute([$prefix . '%']);
        $last = $stmt->fetchColumn();

        if ($last) {
            $lastSeq = (int)substr($last, -3);
            $nextSeq = $lastSeq + 1;
        } else {
            $nextSeq = 1;
        }

        return $prefix . str_pad($nextSeq, 3, '0', STR_PAD_LEFT);
    }
}

/**
 * บันทึกอะไหล่ที่ใช้ซ่อม (ใบเบิกจากใบซ่อม) ลง repair_spare_parts + ตัดสต็อก
 *
 * - replace=true: ลบรายการเดิมของใบซ่อมก่อน แล้ว insert ใหม่ (ใช้ตอนแก้ใบ)
 * - ตัด stock_qty ใน spare_parts อัตโนมัติเมื่อ setting spare_deduct_stock = 1
 * - ราคาต่อหน่วย: ใช้ unit_price ที่ส่งมา ถ้าไม่มีใช้ราคาปัจจุบันใน spare_parts
 *
 * @param PDO    $pdo
 * @param int    $repairId
 * @param array  $items    รายการ [['spare_part_id'=>N,'quantity_used'=>N,'unit_price'?=>N], ...]
 * @param bool   $replace  true = แทนที่ทั้งชุด (ลบเดิมก่อน)
 * @return array ['rows'=>int, 'cost_parts'=>float]
 */
if (!function_exists('saveRepairSpareParts')) {
    function saveRepairSpareParts(PDO $pdo, int $repairId, array $items, bool $replace = false): array {
        $deduct = getSettingValue('spare_deduct_stock', '1') === '1';
        $ins = $pdo->prepare('INSERT INTO repair_spare_parts (repair_id, spare_part_id, quantity_used, unit_price) VALUES (?,?,?,?)');
        $getPrice = $pdo->prepare('SELECT stock_qty, unit_price FROM spare_parts WHERE id = ?');
        $setStock = $pdo->prepare('UPDATE spare_parts SET stock_qty = ? WHERE id = ?');
        $costParts = 0.0;
        $rows = 0;

        if ($replace) {
            $pdo->prepare('DELETE FROM repair_spare_parts WHERE repair_id = ?')->execute([$repairId]);
        }

        $pdo->beginTransaction();
        try {
            foreach ($items as $it) {
                $spId = (int)($it['spare_part_id'] ?? 0);
                $qty = max(0, (float)($it['quantity_used'] ?? 0));
                if (!$spId || $qty <= 0) continue;
                $getPrice->execute([$spId]);
                $sp = $getPrice->fetch();
                if (!$sp) continue;
                $price = max(0, (float)($it['unit_price'] ?? $sp['unit_price'] ?? 0));
                $ins->execute([$repairId, $spId, $qty, $price]);
                $rows++;
                $costParts += $qty * $price;
                if ($deduct) {
                    $setStock->execute([max(0, (float)$sp['stock_qty'] - $qty), $spId]);
                }
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
        return ['rows' => $rows, 'cost_parts' => round($costParts, 2)];
    }
}
