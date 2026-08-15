<?php
/**
 * CMMS-TPT Menu Catalog — แหล่งข้อมูลเดียวของรายการเมนู PWA
 *
 * ใช้ร่วมกันทั้ง:
 *  - API menu_permissions.php (คืนรายการเมนูให้หน้า Settings / Sidebar)
 *  - หน้า /settings/menus (ตั้งค่า role × เมนู)
 *
 * คีย์เมนู (menu_key) = เส้นทาง href ใน Next.js หน้าสัมบูรณ์
 * เพื่อให้ frontend filter เมนูด้วย key เดียวกับ route ที่ใช้จริง
 */
return [
    // ---- 1. งานซ่อมบำรุง ----
    ['key' => 'dashboard',                 'href' => '/dashboard',                 'label' => 'แดชบอร์ดภาพรวม',       'section' => 'งานซ่อมบำรุง'],
    ['key' => 'repair/request',            'href' => '/repair/request',            'label' => 'ฟอร์มแจ้งซ่อมด่วน',      'section' => 'งานซ่อมบำรุง'],
    ['key' => 'repair/assign',             'href' => '/repair/assign',             'label' => 'แจกงานซ่อม',             'section' => 'งานซ่อมบำรุง'],
    ['key' => 'repair/my_tasks',           'href' => '/repair/my_tasks',           'label' => 'งานซ่อมของฉัน',          'section' => 'งานซ่อมบำรุง'],
    ['key' => 'repair/tracking',           'href' => '/repair/tracking',           'label' => 'ติดตามงานซ่อม',          'section' => 'งานซ่อมบำรุง'],
    ['key' => 'repair/kanban',             'href' => '/repair/kanban',             'label' => 'Kanban Board',           'section' => 'งานซ่อมบำรุง'],
    ['key' => 'repair/history',            'href' => '/repair/history',            'label' => 'ประวัติงานซ่อม',         'section' => 'งานซ่อมบำรุง'],

    // ---- 2. PM & เครื่องจักร ----
    ['key' => 'pm_am/calendar',            'href' => '/pm_am/calendar',            'label' => 'ปฏิทิน PM/AM',           'section' => 'PM & เครื่องจักร'],
    ['key' => 'pm_am/create',              'href' => '/pm_am/create',              'label' => 'สร้างแผน PM',            'section' => 'PM & เครื่องจักร'],
    ['key' => 'pm_am/batch_schedule',      'href' => '/pm_am/batch_schedule',      'label' => 'สร้างแผนแบบกลุ่ม',       'section' => 'PM & เครื่องจักร'],
    ['key' => 'pm_am/checksheet',          'href' => '/pm_am/checksheet',          'label' => 'ทำเช็คชีท PM',           'section' => 'PM & เครื่องจักร'],
    ['key' => 'asset_registry',            'href' => '/asset_registry',            'label' => 'ทะเบียนเครื่องจักร',     'section' => 'PM & เครื่องจักร'],
    ['key' => 'qr-sheet',                  'href' => '/qr-sheet',                  'label' => 'QR Sheet เครื่องจักร',   'section' => 'PM & เครื่องจักร'],
    ['key' => 'asset_registry/bom_tree',   'href' => '/asset_registry/bom_tree',   'label' => 'BOM Tree ชิ้นส่วน',      'section' => 'PM & เครื่องจักร'],
    ['key' => 'asset_registry/criticality','href' => '/asset_registry/criticality','label' => 'ลำดับความสำคัญ A/B/C',  'section' => 'PM & เครื่องจักร'],
    ['key' => 'equipment_borrowing',       'href' => '/equipment_borrowing',       'label' => 'ยืม-คืนอุปกรณ์',         'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration',               'href' => '/calibration',               'label' => 'สอบเทียบเครื่องมือวัด',  'section' => 'PM & เครื่องจักร'],
    ['key' => 'inspections',               'href' => '/inspections',               'label' => 'ตรวจเช็ครอบ (Checklist)','section' => 'PM & เครื่องจักร'],
    ['key' => 'inspections/templates',     'href' => '/inspections/templates',     'label' => 'จัดการ Template ตรวจ',  'section' => 'PM & เครื่องจักร'],

    // ---- 3. คลังอะไหล่ ----
    ['key' => 'spare_parts',               'href' => '/spare_parts',               'label' => 'คลังสต็อกอะไหล่',        'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/issue_center',  'href' => '/spare_parts/issue_center',  'label' => 'ศูนย์เบิก-จ่าย',         'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/sage_po',       'href' => '/spare_parts/sage_po',       'label' => 'รับอะไหล่จาก PO',        'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/optimization',  'href' => '/spare_parts/optimization',  'label' => 'AI EOQ & Dead Stock',    'section' => 'คลังอะไหล่'],

    // ---- 4. วิเคราะห์ & รายงาน ----
    ['key' => 'analytics',                 'href' => '/analytics',                 'label' => 'Data Warehouse & BI',    'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'andon-board',               'href' => '/andon-board',               'label' => 'จอ Andon TV (โรงงาน)',   'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'reports/monthly_pdf',       'href' => '/reports/monthly_pdf',       'label' => 'รายงาน PDF ผู้บริหาร',   'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'reports/export_excel',      'href' => '/reports/export_excel',      'label' => 'Export Excel / CSV',     'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'safety/work_permit',        'href' => '/safety/work_permit',        'label' => 'ใบอนุญาต LOTO',          'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'iot/monitor',               'href' => '/iot/monitor',               'label' => 'IoT Sensor Monitor',     'section' => 'วิเคราะห์ & รายงาน'],

    // ---- 5. ระบบ & ตั้งค่า ----
    ['key' => 'notifications',             'href' => '/notifications',             'label' => 'ศูนย์แจ้งเตือน',         'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'settings/notifications',    'href' => '/settings/notifications',    'label' => 'รูปแบบการแจ้งเตือน LINE','section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'register',                  'href' => '/register',                  'label' => 'ลงทะเบียนผูกบัญชี LINE', 'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'users',                     'href' => '/users',                     'label' => 'ผู้ใช้งานระบบ',          'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'settings',                  'href' => '/settings',                  'label' => 'ตั้งค่าทั้งหมด',          'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'editor/builder',            'href' => '/editor/builder',            'label' => 'สร้างหน้าเว็บ (Visual Builder)', 'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'pages',                     'href' => '/pages',                     'label' => 'หน้าเว็บที่สร้างเอง',    'section' => 'ระบบ & ตั้งค่า'],
];
