<?php
/**
 * CMMS-TPT รายงานซ่อมบำรุง (CSV — เปิดใน Excel ได้) — ISO F-EN-05
 *
 * GET /pages/reports/export_excel.php?type=repair|spare_parts|assets&from=YYYY-MM-DD&to=YYYY-MM-DD
 * - ต้อง login เท่านั้น
 * - คำนวณจากข้อมูลจริง ไม่มีค่า fallback จำลอง
 */
session_start();
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/csrf.php';

$pdo = getDb();
requireLogin($pdo); // ป้องกันการดึงข้อมูลทั้งหมดโดยไม่ login

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="CMMS_TOPPAN_Report_' . date('Y-m-d') . '.csv"');

$output = fopen('php://output', 'w');
// UTF-8 BOM สำหรับ Excel ภาษาไทย
fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

$type = $_GET['type'] ?? 'repair';
$from = isset($_GET['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from']) ? $_GET['from'] : null;
$to   = isset($_GET['to'])   && preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'])   ? $_GET['to']   : null;

$where = '';
$params = [];
if ($from && $to && $from <= $to) {
    $where = ' WHERE r.created_at >= ? AND r.created_at <= ? ';
    $params = [$from . ' 00:00:00', $to . ' 23:59:59'];
}

try {
    if ($type === 'spare_parts') {
        fputcsv($output, [
            'รหัสอะไหล่', 'ชื่ออะไหล่', 'หมวดหมู่', 'คงเหลือ', 'ขั้นต่ำ', 'จุดสั่งซื้อ (Reorder)',
            'ราคาต่อหน่วย (บาท)', 'หน่วย', 'สถานที่จัดเก็บ', 'สถานะ'
        ]);
        $rows = $pdo->query("
            SELECT code, name, category, stock_qty, min_stock, reorder_point, unit_price, unit,
                   location, status
            FROM spare_parts
            ORDER BY code ASC
        ")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            fputcsv($output, [
                $row['code'], $row['name'], $row['category'],
                $row['stock_qty'], $row['min_stock'], $row['reorder_point'] ?? $row['min_stock'],
                number_format((float)$row['unit_price'], 2), $row['unit'],
                $row['location'] ?? '', $row['status'] ?? ''
            ]);
        }
    } elseif ($type === 'assets') {
        fputcsv($output, [
            'รหัสครุภัณฑ์', 'ชื่อเครื่องจักร', 'หมวดหมู่', 'สถานที่', 'ผู้รับผิดชอบ',
            'วันที่ซื้อ', 'หมดประกัน', 'สถานะ'
        ]);
        $rows = $pdo->query("
            SELECT a.code, a.name, a.category, a.location, a.manufacturer, a.model,
                   a.purchase_date, a.warranty_expiry, a.status, u.full_name AS responsible
            FROM asset_registry a
            LEFT JOIN users u ON a.responsible_user_id = u.id
            ORDER BY a.code ASC
        ")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            fputcsv($output, [
                $row['code'], $row['name'], $row['category'] ?? '', $row['location'] ?? '',
                $row['responsible'] ?? '', $row['purchase_date'] ?? '', $row['warranty_expiry'] ?? '',
                $row['status'] ?? ''
            ]);
        }
    } else {
        // repair (default)
        fputcsv($output, [
            'เลขที่ใบสั่งซ่อม (WO)', 'รหัสเครื่องจักร', 'ชื่อเครื่องจักร', 'อาการเสีย/ปัญหางานซ่อม',
            'ระดับความสำคัญ', 'สถานะใบงาน', 'ค่าแรงช่าง (บาท)', 'ค่าอะไหล่ (บาท)',
            'เวลาเครื่องหยุด (ชั่วโมง)', 'ยอดต้นทุนซ่อมรวม (บาท)', 'วันที่แจ้งซ่อม', 'วันที่แล้วเสร็จ'
        ]);

        $sql = "
            SELECT r.work_order_no, a.code AS asset_code, a.name AS asset_name, r.title,
                   r.priority, r.status, r.cost_labor, r.cost_parts,
                   IFNULL(TIMESTAMPDIFF(HOUR, r.downtime_start, r.downtime_end), 0) AS downtime_hrs,
                   r.created_at, r.completed_at
            FROM repair r
            LEFT JOIN asset_registry a ON r.asset_id = a.id
            $where
            ORDER BY r.id DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as $row) {
            $labor = (float)($row['cost_labor'] ?? 0);
            $parts = (float)($row['cost_parts'] ?? 0);
            $totalCost = $labor + $parts;
            fputcsv($output, [
                $row['work_order_no'] ?? '', $row['asset_code'] ?? '', $row['asset_name'] ?? '',
                $row['title'] ?? '', $row['priority'] ?? '', $row['status'] ?? '',
                number_format($labor, 2), number_format($parts, 2),
                number_format((float)$row['downtime_hrs'], 2),
                number_format($totalCost, 2),
                $row['created_at'] ?? '', $row['completed_at'] ?? ''
            ]);
        }
    }
} catch (Exception $e) {
    error_log('[export_excel] ' . $e->getMessage());
}

fclose($output);
exit;
