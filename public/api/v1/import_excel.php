<?php
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/xlsx.php';
require_once __DIR__ . '/../../../src/helpers/xlsx_read.php';
header('Content-Type: application/json; charset=utf-8');
session_start();

/**
 * import_excel.php — นำเข้าข้อมูลจากไฟล์ Excel (.xlsx)
 *
 * กระแสการทำงาน (แม่แบบ + ตรวจสอบ + ยืนยัน):
 *   1. GET  ?action=template&dataset=repair        → ดาวน์โหลดแม่แบบ .xlsx
 *   2. POST ?action=validate  (multipart file)      → อ่านไฟล์ ตรวจรายแถว คืน preview (ไม่บันทึก)
 *   3. POST ?action=import    (JSON rows)           → ตรวจซ้ำบนเซิร์ฟเวอร์ แล้ว insert (transaction)
 *
 * dataset ที่รองรับ: repair | asset | pm_am | spare_parts | calibration
 */

const IMP_MAX_ROWS = 5000;
const IMP_MAX_FILE_BYTES = 10 * 1024 * 1024;

/* ====================== ข้อมูลชุดแต่ละชนิด ====================== */
$IMPORT_DATASETS = [
    'repair' => [
        'label' => 'ใบสั่งงานซ่อม (Repair)',
        'table' => 'repair',
        'columns' => [
            ['label' => 'รหัสเครื่องจักร',            'field' => 'asset_id', 'type' => 'asset',    'required' => true],
            ['label' => 'หัวข้อแจ้งซ่อม',             'field' => 'title',     'type' => 'text',     'required' => true],
            ['label' => 'หมายเลขงาน',                'field' => 'work_order_no', 'type' => 'text'],
            ['label' => 'รายละเอียด / อาการ',        'field' => 'description',  'type' => 'text'],
            ['label' => 'ความเร่งด่วน',               'field' => 'priority',  'type' => 'enum',     'enum' => ['low', 'medium', 'high', 'critical'], 'default' => 'medium'],
            ['label' => 'สถานะ',                      'field' => 'status',    'type' => 'text',     'default' => 'open'],
            ['label' => 'ประเภทงาน',                  'field' => 'source_type','type' => 'enum',   'enum' => ['breakdown', 'pm', 'modify', 'build'], 'default' => 'breakdown'],
            ['label' => 'รหัสช่างผู้รับงาน',          'field' => 'assigned_to','type' => 'user'],
            ['label' => 'แผนก',                       'field' => 'department_id','type' => 'dept'],
            ['label' => 'เวลาเสีย (นาที)',            'field' => 'downtime_minutes','type' => 'int','default' => 0],
            ['label' => 'วันที่เริ่มซ่อม',             'field' => 'actual_start_at','type' => 'datetime'],
            ['label' => 'กำหนดแล้วเสร็จ',             'field' => 'estimated_completion_date','type' => 'datetime'],
            ['label' => 'วันที่แล้วเสร็จ',            'field' => 'completed_at','type' => 'datetime'],
            ['label' => 'วันที่แจ้งงาน',              'field' => 'created_at','type' => 'datetime'],
            ['label' => 'ค่าอะไหล่',                  'field' => 'cost_parts','type' => 'money',   'default' => 0],
            ['label' => 'ค่าแรง',                     'field' => 'cost_labor','type' => 'money',   'default' => 0],
            ['label' => 'ค่าจ้างภายนอก',              'field' => 'cost_outsource','type' => 'money','default' => 0],
            ['label' => 'วิธีการแก้ไข / หมายเหตุ',    'field' => 'resolution','type' => 'text'],
        ],
    ],
    'asset' => [
        'label' => 'ทะเบียนเครื่องจักร (Asset)',
        'table' => 'asset_registry',
        'unique' => ['code'],
        'columns' => [
            ['label' => 'รหัสเครื่องจักร',            'field' => 'code',          'type' => 'text', 'required' => true],
            ['label' => 'ชื่อเครื่องจักร',            'field' => 'name',          'type' => 'text', 'required' => true],
            ['label' => 'หมวดหมู่',                   'field' => 'category',      'type' => 'text'],
            ['label' => 'รายละเอียด',                 'field' => 'description',   'type' => 'text'],
            ['label' => 'สถานที่ติดตั้ง',              'field' => 'location',      'type' => 'text'],
            ['label' => 'ความสำคัญ (A/B/C)',          'field' => 'criticality',   'type' => 'enum', 'enum' => ['A', 'B', 'C'], 'default' => 'B'],
            ['label' => 'แผนกที่ดูแล',                'field' => 'department',    'type' => 'text'],
            ['label' => 'ผู้ผลิต',                     'field' => 'manufacturer',  'type' => 'text'],
            ['label' => 'รุ่น',                        'field' => 'model',         'type' => 'text'],
            ['label' => 'เลขซีเรียล',                 'field' => 'serial_number', 'type' => 'text'],
            ['label' => 'วันที่ซื้อ',                  'field' => 'purchase_date', 'type' => 'date'],
            ['label' => 'หมดประกัน',                  'field' => 'warranty_expiry','type' => 'date'],
            ['label' => 'สถานะเครื่อง',               'field' => 'status',        'type' => 'enum', 'enum' => ['active', 'inactive', 'disposed', 'under_repair'], 'default' => 'active'],
            ['label' => 'ตำแหน่ง X',                  'field' => 'floor_x',       'type' => 'int',  'default' => 10],
            ['label' => 'ตำแหน่ง Y',                  'field' => 'floor_y',       'type' => 'int',  'default' => 10],
            ['label' => 'ชั่วโมงเดินเครื่อง/เดือน',   'field' => 'running_hours_month','type' => 'num','default' => 720],
        ],
    ],
    'pm_am' => [
        'label' => 'แผนซ่อมบำรุงเชิงป้องกัน (PM/AM)',
        'table' => 'pm_am',
        'columns' => [
            ['label' => 'รหัสเครื่องจักร',            'field' => 'asset_id',      'type' => 'asset', 'required' => true],
            ['label' => 'หัวข้อ PM',                   'field' => 'title',         'type' => 'text',  'required' => true],
            ['label' => 'รายละเอียด',                 'field' => 'description',   'type' => 'text'],
            ['label' => 'ความถี่',                     'field' => 'frequency_type','type' => 'enum', 'enum' => ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], 'default' => 'monthly'],
            ['label' => 'จำนวนรอบ',                   'field' => 'frequency_interval','type' => 'int','default' => 1],
            ['label' => 'กำหนดตรวจครั้งถัดไป',        'field' => 'due_date',      'type' => 'date'],
            ['label' => 'สถานะ',                       'field' => 'status',        'type' => 'enum', 'enum' => ['pending', 'in_progress', 'completed', 'overdue', 'skipped'], 'default' => 'pending'],
            ['label' => 'รหัสช่างผู้รับผิดชอบ',       'field' => 'assigned_to',   'type' => 'user'],
            ['label' => 'แผนก',                        'field' => 'department_id', 'type' => 'dept'],
            ['label' => 'หมายเหตุ',                    'field' => 'notes',         'type' => 'text'],
        ],
    ],
    'spare_parts' => [
        'label' => 'อะไหล่ / สต็อก (Spare Parts)',
        'table' => 'spare_parts',
        'unique' => ['code'],
        'columns' => [
            ['label' => 'รหัสอะไหล่',                 'field' => 'code',         'type' => 'text', 'required' => true],
            ['label' => 'ชื่ออะไหล่',                 'field' => 'name',         'type' => 'text', 'required' => true],
            ['label' => 'หมวดหมู่',                    'field' => 'category',     'type' => 'text'],
            ['label' => 'รายละเอียด',                  'field' => 'description',  'type' => 'text'],
            ['label' => 'หน่วยนับ',                    'field' => 'unit',         'type' => 'text', 'default' => 'ชิ้น'],
            ['label' => 'คงคลัง',                      'field' => 'stock_qty',    'type' => 'num',  'default' => 0],
            ['label' => 'จำนวนสำรอง',                 'field' => 'reserved_qty', 'type' => 'num',  'default' => 0],
            ['label' => 'ขั้นต่ำ',                     'field' => 'min_stock',    'type' => 'num',  'default' => 0],
            ['label' => 'สูงสุด',                      'field' => 'max_stock',    'type' => 'num',  'default' => 0],
            ['label' => 'ตำแหน่งจัดเก็บ',              'field' => 'location',     'type' => 'text'],
            ['label' => 'ราคาต่อหน่วย',               'field' => 'unit_price',   'type' => 'money','default' => 0],
            ['label' => 'ซัพพลายเออร์',               'field' => 'supplier_id',  'type' => 'supplier'],
        ],
    ],
    'calibration' => [
        'label' => 'ข้อมูลสอบเทียบ (Calibration)',
        'table' => 'calibration',
        'columns' => [
            ['label' => 'รหัสเครื่องจักร',            'field' => 'asset_id',       'type' => 'asset', 'required' => true],
            ['label' => 'วันที่สอบเทียบ',             'field' => 'calibration_date','type' => 'date', 'required' => true],
            ['label' => 'สอบเทียบครั้งถัดไป',         'field' => 'next_calibration_date','type' => 'date'],
            ['label' => 'ประเภท',                     'field' => 'calibration_type','type' => 'enum', 'enum' => ['full', 'abbreviated'], 'default' => 'full'],
            ['label' => 'ผลสอบเทียบ',                 'field' => 'result',         'type' => 'enum', 'enum' => ['pass', 'fail', 'conditional'], 'default' => 'pass'],
            ['label' => 'สถานะ',                       'field' => 'status',         'type' => 'enum', 'enum' => ['scheduled', 'in_progress', 'completed', 'overdue', 'cancelled'], 'default' => 'scheduled'],
            ['label' => 'เลขที่ใบรับรอง',              'field' => 'certificate_number','type' => 'text'],
            ['label' => 'ค่าใช้จ่าย',                  'field' => 'total_cost',    'type' => 'money'],
            ['label' => 'เลขที่ PO',                    'field' => 'po_number',     'type' => 'text'],
            ['label' => 'ซัพพลายเออร์',               'field' => 'supplier_id',   'type' => 'supplier'],
            ['label' => 'มาตรฐานที่ใช้',               'field' => 'standard_used', 'type' => 'text'],
            ['label' => 'หมายเหตุ',                    'field' => 'notes',         'type' => 'text'],
        ],
    ],
];

/* ตัวอย่างข้อมูลในแม่แบบ (label => ค่า) — ใช้เพื่อเตือนว่าบรรทัดตัวอย่างต้องลบออก */
$IMP_EXAMPLES = [
    'repair' => ['รหัสเครื่องจักร' => 'MCH-001', 'หัวข้อแจ้งซ่อม' => 'มอเตอร์สายพานมีเสียงดัง', 'ความเร่งด่วน' => 'medium', 'สถานะ' => 'open', 'ประเภทงาน' => 'breakdown'],
    'asset'  => ['รหัสเครื่องจักร' => 'MCH-001', 'ชื่อเครื่องจักร' => 'เครื่องพิมพ์บรรจุภัณฑ์ 10 สี', 'หมวดหมู่' => 'Machine', 'ความสำคัญ (A/B/C)' => 'B', 'สถานะเครื่อง' => 'active'],
    'pm_am'  => ['รหัสเครื่องจักร' => 'MCH-001', 'หัวข้อ PM' => 'PM ประจำเดือน ตรวจสอบระบบไฟฟ้า', 'ความถี่' => 'monthly', 'จำนวนรอบ' => 1, 'สถานะ' => 'pending'],
    'spare_parts' => ['รหัสอะไหล่' => 'SP-0001', 'ชื่ออะไหล่' => 'O-RING NBR #640131', 'หน่วยนับ' => 'ชิ้น'],
    'calibration' => ['รหัสเครื่องจักร' => 'MCH-001', 'วันที่สอบเทียบ' => '2026-09-15', 'ประเภท' => 'full', 'ผลสอบเทียบ' => 'pass'],
];

/* ====================== ฟังก์ชันช่วย ====================== */

function imp_json(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/** แปลงคอลัมน์/คุณสมบัติ */
function imp_parse_num($v) {
    if ($v === null || trim((string)$v) === '') return null;
    $s = str_replace([',', ' '], '', trim((string)$v));
    if ($s === '' || !preg_match('/^-?\d+(\.\d+)?$/', $s)) return null;
    return (float)$s;
}

function imp_parse_date($v, bool $wantTime) {
    if ($v === null || trim((string)$v) === '') return null;
    $s = trim((string)$v);
    // Excel serial number
    if (is_numeric($s)) {
        $f = (float)$s;
        if ($f >= 20000 && $f < 83000) {
            $sec = (int)round(($f - 25569) * 86400);
            return $wantTime ? gmdate('Y-m-d H:i:s', $sec) : gmdate('Y-m-d', $sec);
        }
        if (preg_match('/^\d{8}$/', $s)) { // yyyymmdd
            return $wantTime ? ($s . ' 00:00:00') : substr($s, 0, 4) . '-' . substr($s, 4, 2) . '-' . substr($s, 6, 2);
        }
        return false;
    }
    $formats = ['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d', 'Y-m-d\TH:i:s', 'd/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y', 'd-m-Y H:i:s', 'd-m-Y H:i', 'd-m-Y', 'Y/m/d H:i:s', 'Y/m/d H:i', 'Y/m/d'];
    foreach ($formats as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $s);
        if ($dt instanceof DateTime) {
            $hasTime = str_contains($fmt, 'H');
            return $hasTime ? $dt->format('Y-m-d H:i:s') : $dt->format('Y-m-d');
        }
    }
    // ถ้ามีแค่เวลา "07:30:00" ต่อวันนี้
    if ($wantTime && preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $s)) {
        return date('Y-m-d') . ' ' . $s . ((strlen($s) === 5) ? ':00' : '');
    }
    return false;
}

/** ตรวจสอบแถวเดียว คืน [data, errors[]] */
function imp_validate_row(array $cells, array $cfg, array $lk): array {
    $data = [];
    $errs = [];
    foreach ($cfg['columns'] as $col) {
        $label = $col['label'];
        $raw = array_key_exists($label, $cells) ? trim((string)$cells[$label]) : '';
        if ($raw === '') {
            if (!empty($col['required'])) {
                $errs[] = 'คอลัมน์ "' . $label . '" ต้องระบุ';
            } elseif (array_key_exists('default', $col)) {
                $data[$col['field']] = $col['default'];
            }
            continue;
        }
        switch ($col['type']) {
            case 'text':
                $data[$col['field']] = $raw;
                break;
            case 'enum':
                $norm = strtoupper($raw);
                $allowed = array_map('strtoupper', $col['enum']);
                $idx = array_search($norm, $allowed, true);
                if ($idx === false) {
                    $errs[] = '"' . $label . '" ต้องเป็นหนึ่งใน: ' . implode(' / ', $col['enum']);
                    break;
                }
                $data[$col['field']] = $col['enum'][$idx];
                break;
            case 'asset':
                $key = mb_strtolower($raw);
                if (!isset($lk['assets'][$key])) { $errs[] = 'ไม่พบเครื่องจักร "' . $raw . '" ในระบบ'; break; }
                $data[$col['field']] = $lk['assets'][$key];
                break;
            case 'user':
                $key = mb_strtolower($raw);
                if (!isset($lk['users'][$key])) { $errs[] = 'ไม่พบรหัสผู้ใช้ "' . $raw . '"'; break; }
                $data[$col['field']] = $lk['users'][$key];
                break;
            case 'dept':
                $key = mb_strtolower($raw);
                if (!isset($lk['depts'][$key])) { $errs[] = 'ไม่พบแผนก "' . $raw . '"'; break; }
                $data[$col['field']] = $lk['depts'][$key];
                break;
            case 'supplier':
                $key = mb_strtolower($raw);
                if (!isset($lk['suppliers'][$key])) { $errs[] = 'ไม่พบซัพพลายเออร์ "' . $raw . '"'; break; }
                $data[$col['field']] = $lk['suppliers'][$key];
                break;
            case 'date': case 'datetime':
                $wantTime = $col['type'] === 'datetime';
                $d = imp_parse_date($raw, $wantTime);
                if ($d === false) { $errs[] = '"' . $label . '" ต้องเป็น' . ($wantTime ? 'วันที่-เวลา' : 'วันที่') . ' (เช่น ' . ($wantTime ? '2026-05-08 07:30:00' : '2026-05-08') . ')'; break; }
                $data[$col['field']] = $d;
                break;
            case 'int': case 'num': case 'money':
                $n = imp_parse_num($raw);
                if ($n === null) { $errs[] = '"' . $label . '" ต้องเป็นตัวเลข (เช่น 10 หรือ 1234.50)'; break; }
                $data[$col['field']] = ($col['type'] === 'int') ? (int)$n : round((float)$n, 2);
                break;
        }
    }
    return [$data, $errs];
}

/** ตรวจซ้ำในไฟล์/กับฐานข้อมูล สำหรับคอลัมน์ unique */
function imp_unique_checks(array $okRows, array $cfg, PDO $pdo): array {
    // $okRows: [ [rowNo, cells, data] ]
    if (empty($cfg['unique']) || empty($okRows)) return $okRows;
    $field = $cfg['unique'][0];

    $used = [];
    $st = $pdo->query("SELECT `$field` FROM `{$cfg['table']}`");
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $c) $used[mb_strtolower(trim((string)$c))] = true;

    $seen = [];
    $out = [];
    foreach ($okRows as $row) {
        $code = trim((string)($row['data'][$field] ?? ''));
        $k = mb_strtolower($code);
        if ($k === '') continue;
        if (isset($used[$k])) {
            $row['errors'][] = 'รหัส "' . $code . '" มีอยู่แล้วในระบบ (ต้องไม่ซ้ำ)';
        } elseif (isset($seen[$k])) {
            $row['errors'][] = 'รหัส "' . $code . '" ซ้ำกับบรรทัดอื่นในไฟล์ (ต้องไม่ซ้ำ)';
        } else {
            $seen[$k] = true;
        }
        $out[] = $row;
    }
    return $out;
}

/** สร้างแถวตัวอย่างสำหรับแม่แบบ */
function imp_example_cells(array $cfg): array {
    $out = [];
    foreach ($cfg['columns'] as $col) {
        $out[$col['label']] = '';
    }
    return $out;
}

function imp_is_example_row(array $cells, array $examples): bool {
    if (empty($examples)) return false;
    foreach ($examples as $label => $val) {
        if (trim((string)($cells[$label] ?? '')) !== trim((string)$val)) return false;
    }
    return true;
}

/* ====================== build lookup tables ====================== */
function imp_build_lookups(PDO $pdo): array {
    $lk = ['assets' => [], 'users' => [], 'depts' => [], 'suppliers' => []];
    foreach ($pdo->query("SELECT id, code FROM asset_registry") as $r) $lk['assets'][mb_strtolower(trim($r['code']))] = (int)$r['id'];
    foreach ($pdo->query("SELECT id, username FROM users WHERE is_active = 1") as $r) $lk['users'][mb_strtolower(trim($r['username']))] = (int)$r['id'];
    foreach ($pdo->query("SELECT id, name FROM departments") as $r) $lk['depts'][mb_strtolower(trim($r['name']))] = (int)$r['id'];
    foreach ($pdo->query("SELECT id, name FROM suppliers") as $r) $lk['suppliers'][mb_strtolower(trim($r['name']))] = (int)$r['id'];
    return $lk;
}

/* ====================== INSERT per dataset ====================== */
function imp_insert_repair(PDO $pdo, array $d, int $userId): void {
    $sql = "INSERT INTO repair
            (asset_id, title, work_order_no, description, priority, status, source_type,
             assigned_to, department_id, downtime_minutes, actual_start_at,
             estimated_completion_date, completed_at, created_at,
             cost_parts, cost_labor, cost_outsource, resolution, created_by)
            VALUES (:asset_id, :title, :work_order_no, :description, :priority, :status, :source_type,
             :assigned_to, :department_id, :downtime_minutes, :actual_start_at,
             :estimated_completion_date, :completed_at, :created_at,
             :cost_parts, :cost_labor, :cost_outsource, :resolution, :created_by)";
    $st = $pdo->prepare($sql);
    $st->execute([
        'asset_id' => $d['asset_id'],
        'title' => $d['title'],
        'work_order_no' => $d['work_order_no'] ?? null,
        'description' => $d['description'] ?? null,
        'priority' => $d['priority'] ?? 'medium',
        'status' => $d['status'] ?? 'open',
        'source_type' => $d['source_type'] ?? 'breakdown',
        'assigned_to' => $d['assigned_to'] ?? null,
        'department_id' => $d['department_id'] ?? null,
        'downtime_minutes' => $d['downtime_minutes'] ?? 0,
        'actual_start_at' => $d['actual_start_at'] ?? null,
        'estimated_completion_date' => $d['estimated_completion_date'] ?? null,
        'completed_at' => $d['completed_at'] ?? null,
        'created_at' => $d['created_at'] ?? date('Y-m-d H:i:s'),
        'cost_parts' => $d['cost_parts'] ?? 0,
        'cost_labor' => $d['cost_labor'] ?? 0,
        'cost_outsource' => $d['cost_outsource'] ?? 0,
        'resolution' => $d['resolution'] ?? null,
        'created_by' => $userId,
    ]);
}

function imp_insert_asset(PDO $pdo, array $d): void {
    $sql = "INSERT INTO asset_registry
            (code, name, category, description, location, criticality, department,
             manufacturer, model, serial_number, purchase_date, warranty_expiry,
             status, floor_x, floor_y, running_hours_month)
            VALUES (:code, :name, :category, :description, :location, :criticality, :department,
             :manufacturer, :model, :serial_number, :purchase_date, :warranty_expiry,
             :status, :floor_x, :floor_y, :running_hours_month)";
    $st = $pdo->prepare($sql);
    $st->execute([
        'code' => trim($d['code']),
        'name' => $d['name'],
        'category' => $d['category'] ?? null,
        'description' => $d['description'] ?? null,
        'location' => $d['location'] ?? null,
        'criticality' => ($d['criticality'] ?? 'B') === 'C' ? 'C' : ($d['criticality'] ?? 'B'),
        'department' => $d['department'] ?? null,
        'manufacturer' => $d['manufacturer'] ?? null,
        'model' => $d['model'] ?? null,
        'serial_number' => $d['serial_number'] ?? null,
        'purchase_date' => $d['purchase_date'] ?? null,
        'warranty_expiry' => $d['warranty_expiry'] ?? null,
        'status' => $d['status'] ?? 'active',
        'floor_x' => $d['floor_x'] ?? 10,
        'floor_y' => $d['floor_y'] ?? 10,
        'running_hours_month' => $d['running_hours_month'] ?? 720,
    ]);
}

function imp_insert_pm(PDO $pdo, array $d): void {
    $sql = "INSERT INTO pm_am
            (asset_id, title, description, frequency_type, frequency_interval, due_date,
             status, assigned_to, department_id, notes)
            VALUES (:asset_id, :title, :description, :frequency_type, :frequency_interval, :due_date,
             :status, :assigned_to, :department_id, :notes)";
    $st = $pdo->prepare($sql);
    $st->execute([
        'asset_id' => $d['asset_id'],
        'title' => $d['title'],
        'description' => $d['description'] ?? null,
        'frequency_type' => $d['frequency_type'] ?? 'monthly',
        'frequency_interval' => $d['frequency_interval'] ?? 1,
        'due_date' => $d['due_date'] ?? null,
        'status' => $d['status'] ?? 'pending',
        'assigned_to' => $d['assigned_to'] ?? null,
        'department_id' => $d['department_id'] ?? null,
        'notes' => $d['notes'] ?? null,
    ]);
}

function imp_insert_spare(PDO $pdo, array $d): void {
    $sql = "INSERT INTO spare_parts
            (supplier_id, code, name, description, category, unit, stock_qty, reserved_qty,
             min_stock, max_stock, location, unit_price)
            VALUES (:supplier_id, :code, :name, :description, :category, :unit, :stock_qty, :reserved_qty,
             :min_stock, :max_stock, :location, :unit_price)";
    $st = $pdo->prepare($sql);
    $st->execute([
        'supplier_id' => $d['supplier_id'] ?? null,
        'code' => trim($d['code']),
        'name' => $d['name'],
        'description' => $d['description'] ?? null,
        'category' => $d['category'] ?? null,
        'unit' => $d['unit'] ?? 'ชิ้น',
        'stock_qty' => $d['stock_qty'] ?? 0,
        'reserved_qty' => $d['reserved_qty'] ?? 0,
        'min_stock' => $d['min_stock'] ?? 0,
        'max_stock' => $d['max_stock'] ?? 0,
        'location' => $d['location'] ?? null,
        'unit_price' => $d['unit_price'] ?? 0,
    ]);
}

function imp_insert_calibration(PDO $pdo, array $d): void {
    $sql = "INSERT INTO calibration
            (asset_id, calibration_type, calibration_date, next_calibration_date,
             standard_used, result, status, certificate_number, total_cost, po_number,
             supplier_id, notes)
            VALUES (:asset_id, :calibration_type, :calibration_date, :next_calibration_date,
             :standard_used, :result, :status, :certificate_number, :total_cost, :po_number,
             :supplier_id, :notes)";
    $st = $pdo->prepare($sql);
    $st->execute([
        'asset_id' => $d['asset_id'],
        'calibration_type' => $d['calibration_type'] ?? 'full',
        'calibration_date' => $d['calibration_date'],
        'next_calibration_date' => $d['next_calibration_date'] ?? null,
        'standard_used' => $d['standard_used'] ?? null,
        'result' => $d['result'] ?? 'pass',
        'status' => $d['status'] ?? 'scheduled',
        'certificate_number' => $d['certificate_number'] ?? null,
        'total_cost' => $d['total_cost'] ?? null,
        'po_number' => $d['po_number'] ?? null,
        'supplier_id' => $d['supplier_id'] ?? null,
        'notes' => $d['notes'] ?? null,
    ]);
}

$IMP_INSERT = [
    'repair' => 'imp_insert_repair',
    'asset' => 'imp_insert_asset',
    'pm_am' => 'imp_insert_pm',
    'spare_parts' => 'imp_insert_spare',
    'calibration' => 'imp_insert_calibration',
];

/* ====================== รัน ====================== */
try {
    $pdo = getDb();
    $user = requireLogin($pdo);

    $action = $_GET['action'] ?? ($_SERVER['REQUEST_METHOD'] === 'POST' ? 'validate' : '');
    $dataset = $_POST['dataset'] ?? $_GET['dataset'] ?? '';
    $body = null;
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'import') {
        $body = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($body)) $body = [];
        if (empty($dataset)) $dataset = $body['dataset'] ?? '';
    }

    if (!isset($IMPORT_DATASETS[$dataset])) {
        imp_json(400, ['error' => 'ไม่พบชุดข้อมูล "' . $dataset . '" — เลือก: repair, asset, pm_am, spare_parts, calibration']);
    }
    $cfg = $IMPORT_DATASETS[$dataset];

    /* ---------- ดาวน์โหลดแม่แบบ ---------- */
    if ($action === 'template') {
        $labels = array_map(fn($c) => $c['label'], $cfg['columns']);
        $exampleCells = imp_example_cells($cfg);
        $ex = $GLOBALS['IMP_EXAMPLES'][$dataset] ?? [];
        $exampleRow = [];
        foreach ($cfg['columns'] as $col) {
            $exampleRow[] = $ex[$col['label']] ?? '';
        }
        xlsx_download('CMMS_import_' . $dataset . '_template.xlsx', $labels, [$exampleRow]);
    }

    if (!in_array($action, ['validate', 'import'], true)) {
        imp_json(400, ['error' => 'action ต้องเป็น template / validate / import']);
    }

    $lk = imp_build_lookups($pdo);

    /* ---------- ตรวจสอบไฟล์แล้วพรีวิว ---------- */
    if ($action === 'validate') {
        if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? 1) !== UPLOAD_ERR_OK) {
            imp_json(400, ['error' => 'ไม่พบไฟล์ที่อัปโหลด หรือไฟล์เกินขนาด']);
        }
        $f = $_FILES['file'];
        if ($f['size'] > IMP_MAX_FILE_BYTES) imp_json(400, ['error' => 'ไฟล์ใหญ่เกิน 10MB กรุณาแบ่งไฟล์']);
        if (!str_ends_with(strtolower($f['name'] ?? ''), '.xlsx')) {
            imp_json(400, ['error' => 'รองรับเฉพาะไฟล์ .xlsx (Excel 2007+)']);
        }

        $tmp = $f['tmp_name'];
        try {
            $book = xlsx_read($tmp);
        } catch (Throwable $e) {
            imp_json(400, ['error' => $e->getMessage()]);
        }
        $allRows = $book['rows'];
        if (empty($allRows)) imp_json(400, ['error' => 'ไฟล์ไม่มีข้อมูล (ต้องมีแถวหัวข้อ + ข้อมูล)']);

        // ตรวจหัวคอลัมน์บรรทัดแรก
        $headerRow = array_shift($allRows);
        $labels = array_map(fn($c) => $c['label'], $cfg['columns']);
        $colIndex = []; // label => column index
        $headerInfo = [];
        $sheetErrors = [];
        foreach ($headerRow as $idx => $h) {
            $h = trim((string)$h);
            $hClean = rtrim($h, "* \t");
            $found = array_search($hClean, $labels, true);
            if ($found !== false) {
                $colIndex[$labels[$found]] = $idx;
                $headerInfo[] = ['label' => $labels[$found], 'recognized' => true, 'required' => !empty($cfg['columns'][$found]['required'])];
            } else {
                $headerInfo[] = ['label' => $h, 'recognized' => false, 'required' => false];
            }
        }
        foreach ($cfg['columns'] as $col) {
            if (!empty($col['required']) && !array_key_exists($col['label'], $colIndex)) {
                $sheetErrors[] = 'ไฟล์ขาดคอลัมน์ที่ต้องระบุ: "' . $col['label'] . '"';
            }
        }

        if (count($allRows) > IMP_MAX_ROWS) {
            imp_json(400, ['error' => 'ไฟล์มีมากเกิน ' . IMP_MAX_ROWS . ' แถว กรุณาแบ่งไฟล์']);
        }

        // เตรียม raw cells ต่อแถว
        $rawList = [];
        foreach ($allRows as $rowNo => $vals) {
            $cells = [];
            foreach ($labels as $label) {
                if (isset($colIndex[$label])) {
                    $cells[$label] = $vals[$colIndex[$label]] ?? '';
                }
            }
            $rawList[] = ['row' => $rowNo + 2, 'cells' => $cells];
        }

        $outRows = [];
        $grid = [];
        foreach ($rawList as $item) {
            $cellLine = $item['cells'];
            $errors = [];
            if (imp_is_example_row($cellLine, $GLOBALS['IMP_EXAMPLES'][$dataset] ?? [])) {
                $errors[] = 'แถวนี้คือตัวอย่างที่มากับแม่แบบ — ลบออกก่อนนำเข้า';
            }
            [$data, $vErrs] = imp_validate_row($cellLine, $cfg, $lk);
            $errors = array_merge($errors, $vErrs);
            $grid[] = ['row' => $item['row'], 'cells' => $cellLine, 'data' => $data, 'errors' => $errors];
        }
        // ตรวจ unique ภายในไฟล์/กับ DB (เฉพาะผ่าน format)
        $okRows = []; foreach ($grid as $g) if (empty($g['errors'])) $okRows[] = $g;
        $checked = imp_unique_checks($okRows, $cfg, $pdo);
        $ucMap = []; foreach ($checked as $g) $ucMap[$g['row']] = $g['errors'];

        $outRows = [];
        $okCnt = 0;
        foreach ($grid as $g) {
            $errs = $g['errors'];
            if (isset($ucMap[$g['row']])) $errs = array_merge($errs, $ucMap[$g['row']]);
            $isOk = empty($errs);
            if ($isOk) $okCnt++;
            $outRows[] = ['row' => $g['row'], 'ok' => $isOk, 'errors' => $errs, 'cells' => strip_emoji_for_json($g['cells'])];
        }

        imp_json(200, [
            'status' => 'success',
            'dataset' => $dataset,
            'dataset_label' => $cfg['label'],
            'sheet' => $book['sheet'],
            'headers' => $headerInfo,
            'sheet_errors' => $sheetErrors,
            'rows' => $outRows,
            'summary' => ['total' => count($outRows), 'ok' => $okCnt, 'error' => count($outRows) - $okCnt],
        ]);
    }

    /* ---------- นำเข้าจริง (ตรวจซ้ำบนเซิร์ฟเวอร์) ---------- */
    if ($action === 'import') {
        $rowsIn = is_array($body['rows'] ?? null) ? $body['rows'] : null;
        if ($rowsIn === null) imp_json(400, ['error' => 'ไม่มีข้อมูลแถวที่ยืนยันการนำเข้า']);
        if (count($rowsIn) > IMP_MAX_ROWS) imp_json(400, ['error' => 'จำนวนแถวเกิน ' . IMP_MAX_ROWS]);

        $labels = array_map(fn($c) => $c['label'], $cfg['columns']);
        $grid = [];
        foreach ($rowsIn as $i => $it) {
            $cells = [];
            foreach ($labels as $label) {
                $cells[$label] = isset($it['cells'][$label]) ? trim((string)$it['cells'][$label]) : '';
            }
            $errors = [];
            if (imp_is_example_row($cells, $GLOBALS['IMP_EXAMPLES'][$dataset] ?? [])) {
                $errors[] = 'แถวนี้คือตัวอย่างที่มากับแม่แบบ — ลบออกก่อนนำเข้า';
            }
            [$data, $vErrs] = imp_validate_row($cells, $cfg, $lk);
            $errors = array_merge($errors, $vErrs);
            $grid[] = ['row' => (int)($it['row'] ?? ($i + 2)), 'cells' => $cells, 'data' => $data, 'errors' => $errors];
        }

        // unique + insert แบบ transaction
        $pdo->beginTransaction();
        try {
            $okRows = []; foreach ($grid as $g) if (empty($g['errors'])) $okRows[] = $g;
            $checked = imp_unique_checks($okRows, $cfg, $pdo);
            $ucMap = []; foreach ($checked as $g) $ucMap[$g['row']] = $g['errors'];
            unset($checked);

            $inserted = 0; $failedXml = [];
            $fn = $IMP_INSERT[$dataset];
            foreach ($grid as $g) {
                $errs = $g['errors'];
                if (isset($ucMap[$g['row']])) $errs = array_merge($errs, $ucMap[$g['row']]);
                if (!empty($errs)) {
                    $failedXml[] = ['row' => $g['row'], 'errors' => $errs];
                    continue;
                }
                $fn($pdo, $g['data'], (int)$user['id']);
                $inserted++;
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            imp_json(500, ['error' => 'นำเข้าไม่สำเร็จ: ' . $e->getMessage()]);
        }

        imp_json(200, [
            'status' => 'success',
            'inserted' => $inserted,
            'failed' => count($failedXml),
            'total' => count($grid),
            'errors' => $failedXml,
        ]);
    }

    imp_json(400, ['error' => 'action ต้องเป็น template / validate / import']);
} catch (Throwable $e) {
    imp_json(500, ['error' => $e->getMessage()]);
}

/* JSON_UNESCAPED_UNICODE ปลอดภัยอยู่แล้ว แต่กันค่าแปลก ๆ (null byte) */
function strip_emoji_for_json(array $cells): array {
    foreach ($cells as $k => $v) {
        $v = (string)$v;
        if (str_contains($v, "\0")) $cells[$k] = preg_replace('/\x00+/', '', $v);
    }
    return $cells;
}