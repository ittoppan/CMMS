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
