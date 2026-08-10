<?php
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="CMMS_TOPPAN_Maintenance_Report_' . date('Y-m-d') . '.csv"');

require_once __DIR__ . '/../../../src/config/db.php';

$output = fopen('php://output', 'w');

// UTF-8 BOM for Excel Thai language support
fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));

// Header Column Titles
fputcsv($output, [
    'เลขที่ใบสั่งซ่อม (WO)',
    'รหัสเครื่องจักร',
    'ชื่อเครื่องจักร',
    'อาการเสีย/ปัญหางานซ่อม',
    'ระดับความสำคัญ',
    'สถานะใบงาน',
    'ค่าแรงช่าง (บาท)',
    'ค่าอะไหล่ (บาท)',
    'เวลาเครื่องหยุด (นาที)',
    'มูลค่า Downtime Loss (บาท)',
    'ยอดต้นทุนซ่อมรวม (บาท)',
    'วันที่แจ้งซ่อม'
]);

try {
    $pdo = getDb();
    $rows = $pdo->query("
        SELECT r.work_order_no, a.code AS asset_code, a.name AS asset_name, r.title, r.priority, r.status,
               r.cost_labor, r.cost_parts, r.downtime_minutes, r.created_at
        FROM repair r
        JOIN asset_registry a ON r.asset_id = a.id
        ORDER BY r.id DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $labor = (float)($row['cost_labor'] ?: 450);
        $parts = (float)($row['cost_parts'] ?: 12500);
        $dtMinutes = (int)($row['downtime_minutes'] ?: 60);
        $dtLoss = $dtMinutes * 150;
        $totalCost = $labor + $parts + $dtLoss;

        fputcsv($output, [
            $row['work_order_no'],
            $row['asset_code'],
            $row['asset_name'],
            $row['title'],
            $row['priority'],
            $row['status'],
            $labor,
            $parts,
            $dtMinutes,
            $dtLoss,
            $totalCost,
            $row['created_at']
        ]);
    }
} catch (Exception $e) {}

fclose($output);
exit;
