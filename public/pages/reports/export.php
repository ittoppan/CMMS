<?php
/**
 * Excel Export (.xlsx) — ดาวน์โหลดรายงานเป็นไฟล์ Excel จริง (ไม่ใช่ CSV)
 *
 * ใช้: /pages/reports/export.php?type=repair|pm|stock|assets[&status=&month=]
 * ต้อง login แล้ว
 */
require_once __DIR__ . '/../../../src/includes/layout.php';
require_once __DIR__ . '/../../../src/helpers/xlsx.php';

$pdo = getDb();
$type = $_GET['type'] ?? '';
$type = preg_replace('/[^a-z_]/', '', $type);
$allowed = ['repair', 'pm', 'stock', 'assets'];
if (!in_array($type, $allowed, true)) {
    http_response_code(400);
    exit('Invalid export type. ใช้: repair|pm|stock|assets');
}

$month = preg_match('/^\d{4}-\d{2}$/', $_GET['month'] ?? '') ? $_GET['month'] : date('Y-m');
$status = preg_replace('/[^a-z_]/', '', $_GET['status'] ?? '');

switch ($type) {
    case 'repair':
        $sql = "SELECT r.work_order_no, r.title, r.priority, r.status, r.created_at, r.estimated_completion_date, r.cost_parts, r.cost_labor, r.cost_outsource,
                       a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
                FROM repair r
                LEFT JOIN asset_registry a ON r.asset_id = a.id
                LEFT JOIN users u ON r.assigned_to = u.id
                WHERE DATE_FORMAT(r.created_at, '%Y-%m') = ? ";
        $params = [$month];
        if ($status && in_array($status, ['open','acknowledged','in_progress','waiting_parts','waiting_approval','resolved','closed','cancelled','rejected'], true)) {
            $sql .= "AND r.status = ? "; $params[] = $status;
        }
        $sql .= "ORDER BY r.created_at DESC";
        $rows = $pdo->prepare($sql); $rows->execute($params); $rows = $rows->fetchAll();
        $headers = ['ใบงาน','หัวข้อ','ความสำคัญ','สถานะ','แจ้งวันที่','กำหนดเสร็จ','ค่าอะไหล่','ค่าแรง','ค่าจ้างภายนอก','เครื่องจักร','ชื่อเครื่อง','ผู้รับผิดชอบ'];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [$r['work_order_no'], $r['title'], $r['priority'], $r['status'], $r['created_at'], $r['estimated_completion_date'] ?? '', (float)$r['cost_parts'] ?? 0, (float)$r['cost_labor'] ?? 0, (float)$r['cost_outsource'] ?? 0, $r['asset_code'] ?? '', $r['asset_name'] ?? '', $r['assigned_name'] ?? ''];
        }
        xlsx_download("repair_{$month}.xlsx", $headers, $data);

    case 'pm':
        $stmt = $pdo->prepare("
            SELECT p.title, p.due_date, p.last_done_date, p.status, p.frequency_type, p.frequency_interval,
                   a.code AS asset_code, a.name AS asset_name, u.full_name AS assigned_name
            FROM pm_am p
            LEFT JOIN asset_registry a ON p.asset_id = a.id
            LEFT JOIN users u ON p.assigned_to = u.id
            WHERE DATE_FORMAT(p.due_date, '%Y-%m') = ?
            ORDER BY p.due_date
        ");
        $stmt->execute([$month]);
        $rows = $stmt->fetchAll();
        $headers = ['รายการ','กำหนดชำระ','ทำล่าสุด','สถานะ','ความถี่','รอบ','เครื่องจักร','ชื่อเครื่อง','ผู้รับผิดชอบ'];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [$r['title'], $r['due_date'], $r['last_done_date'] ?? '', $r['status'], $r['frequency_type'], $r['frequency_interval'], $r['asset_code'] ?? '', $r['asset_name'] ?? '', $r['assigned_name'] ?? ''];
        }
        xlsx_download("pm_{$month}.xlsx", $headers, $data);

    case 'stock':
        $rows = $pdo->query("
            SELECT sp.code, sp.name, sp.category, sp.stock_qty, sp.min_stock, sp.max_stock, sp.unit, sp.location, sp.unit_price,
                   su.name AS supplier_name, sp.sage_item_no
            FROM spare_parts sp
            LEFT JOIN suppliers su ON sp.supplier_id = su.id
            ORDER BY sp.category, sp.code
        ")->fetchAll();
        $headers = ['รหัส','ชื่อ','หมวด','คงเหลือ','ขั้นต่ำ','สูงสุด','หน่วย','ตำแหน่ง','ราคา/หน่วย','ผู้จำหน่าย','Sage No.'];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [$r['code'], $r['name'], $r['category'] ?? '', (float)$r['stock_qty'], (float)$r['min_stock'], (float)$r['max_stock'] ?? '', $r['unit'] ?? '', $r['location'] ?? '', (float)$r['unit_price'] ?? 0, $r['supplier_name'] ?? '', $r['sage_item_no'] ?? ''];
        }
        xlsx_download("stock_" . date('Ymd') . ".xlsx", $headers, $data);

    case 'assets':
        $rows = $pdo->query("
            SELECT a.code, a.name, a.category, a.status, a.location_id, d.name AS dept_name,
                   (SELECT COUNT(*) FROM repair r WHERE r.asset_id = a.id) AS repair_count
            FROM asset_registry a
            LEFT JOIN departments d ON a.department_id = d.id
            ORDER BY a.code
        ")->fetchAll();
        $headers = ['รหัส','ชื่อ','หมวด','สถานะ','แผนก','จำนวนงานซ่อม'];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [$r['code'], $r['name'], $r['category'] ?? '', $r['status'] ?? '', $r['dept_name'] ?? '', (int)$r['repair_count']];
        }
        xlsx_download("assets_" . date('Ymd') . ".xlsx", $headers, $data);
}
