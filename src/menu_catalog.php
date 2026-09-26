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
    ['key' => 'asset_reliability',                           'href' => '/asset-reliability',                           'label' => 'ความน่าเชื่อถือเครื่องจักร',  'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/dashboard',                 'href' => '/asset-reliability',                           'label' => 'แดชบอร์ด Reliability',       'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/critical',                  'href' => '/asset-reliability/critical',                  'label' => 'เครื่องวิกฤต (A–D)',          'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/lifecycle',                 'href' => '/asset-reliability/lifecycle',                 'label' => 'วงจรชีวิตเครื่องจักร',        'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/aging',                     'href' => '/asset-reliability/aging',                     'label' => 'เครื่องเก่า / อายุการใช้งาน',  'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/replacement',               'href' => '/asset-reliability/replacement',               'label' => 'แผนเปลี่ยนชิ้นส่วน',          'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/overhaul',                  'href' => '/asset-reliability/overhaul',                  'label' => 'แผนยกเครื่อง (Overhaul)',      'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/data-quality',              'href' => '/asset-reliability/data-quality',              'label' => 'คุณภาพข้อมูลเครื่องจักร',     'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/reports',                   'href' => '/asset-reliability/reports',                   'label' => 'รายงาน Reliability',          'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_reliability/config',                    'href' => '/asset-reliability/config',                    'label' => 'ตั้งค่า Reliability',         'section' => 'ความน่าเชื่อถือ & วงจรชีวิต'],
    ['key' => 'asset_registry/bom_tree',   'href' => '/asset_registry/bom_tree',   'label' => 'BOM Tree ชิ้นส่วน',      'section' => 'PM & เครื่องจักร'],
    ['key' => 'asset_registry/criticality','href' => '/asset_registry/criticality','label' => 'ลำดับความสำคัญ A/B/C',  'section' => 'PM & เครื่องจักร'],
    ['key' => 'equipment_borrowing',       'href' => '/equipment_borrowing',       'label' => 'ยืม-คืนอุปกรณ์',         'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration',               'href' => '/calibration',               'label' => 'สอบเทียบเครื่องมือวัด',  'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/instruments',    'href' => '/calibration/instruments',   'label' => 'เครื่องมือวัด (Instrument Master)', 'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/plans',          'href' => '/calibration/plans',         'label' => 'แผนสอบเทียบ',          'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/schedule',       'href' => '/calibration/schedule',      'label' => 'ตารางสอบเทียบ',         'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/dashboard',      'href' => '/calibration/dashboard',     'label' => 'แดชบอร์ดสอบเทียบ',      'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/standards',      'href' => '/calibration/standards',     'label' => 'มาตรฐานอ้างอิง',        'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/procedures',     'href' => '/calibration/procedures',    'label' => 'ขั้นตอนสอบเทียบ',       'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/certificates',   'href' => '/calibration/certificates',  'label' => 'ใบรับรองสอบเทียบ',      'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/oot',            'href' => '/calibration/oot',           'label' => 'OOT / นอกเกณฑ์',       'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/reports',        'href' => '/calibration/reports',       'label' => 'รายงานสอบเทียบ',        'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/data-quality',   'href' => '/calibration/data-quality',  'label' => 'คุณภาพข้อมูลสอบเทียบ',  'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/mobile',         'href' => '/calibration/mobile',        'label' => 'สอบเทียบบนมือถือ',      'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/config',         'href' => '/calibration/config',        'label' => 'ตั้งค่าสอบเทียบ',       'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/calendar',      'href' => '/calibration/calendar',      'label' => 'ปฏิทินสอบเทียบ',         'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/po',            'href' => '/calibration/po',            'label' => 'PO งานสอบเทียบ',         'section' => 'PM & เครื่องจักร'],
    ['key' => 'calibration/tracking',      'href' => '/calibration/tracking',      'label' => 'ติดตามงานสอบเทียบ',      'section' => 'PM & เครื่องจักร'],
    ['key' => 'inspections',               'href' => '/inspections',               'label' => 'ตรวจเช็ครอบ (Checklist)','section' => 'PM & เครื่องจักร'],
    ['key' => 'inspections/templates',     'href' => '/inspections/templates',     'label' => 'จัดการ Template ตรวจ',  'section' => 'PM & เครื่องจักร'],

    // ---- 3. คลังอะไหล่ ----
    ['key' => 'spare_parts',               'href' => '/spare_parts',               'label' => 'คลังสต็อกอะไหล่',        'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/balances',      'href' => '/spare_parts/balances',      'label' => 'ยอดคงเหลืออะไหล่',       'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/returns',       'href' => '/spare_parts/returns',       'label' => 'สต็อกอะไหล่คืนซาก',       'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/issue_center',  'href' => '/spare_parts/issue_center',  'label' => 'ศูนย์เบิก-จ่าย',         'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/sage_shipments','href' => '/spare_parts/sage_shipments', 'label' => 'Sage 300 I/C Shipments',   'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/sage_po',       'href' => '/spare_parts/sage_po',       'label' => 'รับอะไหล่จาก PO',        'section' => 'คลังอะไหล่'],
    ['key' => 'spare_parts/optimization',  'href' => '/spare_parts/optimization',  'label' => 'AI EOQ & Dead Stock',    'section' => 'คลังอะไหล่'],

    // ---- 4. วิเคราะห์ & รายงาน ----
    ['key' => 'analytics',                 'href' => '/analytics',                 'label' => 'Data Warehouse & BI',    'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'andon-board',               'href' => '/andon-board',               'label' => 'จอ Andon TV (โรงงาน)',   'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'reports/monthly_pdf',       'href' => '/reports/monthly_pdf',       'label' => 'รายงาน PDF ผู้บริหาร',   'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'reports/export_excel',      'href' => '/reports/export_excel',      'label' => 'Export Excel / CSV',     'section' => 'วิเคราะห์ & รายงาน'],
    ['key' => 'iot/monitor',               'href' => '/iot/monitor',               'label' => 'IoT Sensor Monitor',     'section' => 'วิเคราะห์ & รายงาน'],

    // ---- 4.47 ความปลอดภัย & ใบอนุญาตทำงานเสี่ยง (Phase 30) ----
    ['key' => 'safety/work_permit',        'href' => '/safety/work_permit',        'label' => 'ใบอนุญาตทำงานเสี่ยง (PTW)','section' => 'ความปลอดภัย & งานที่เสี่ยง'],

    // ---- 4.4 ค่าใช้จ่าย & งบประมาณ (Phase 26) ----
    ['key' => 'cost',                      'href' => '/cost',                      'label' => 'ศูนย์วิเคราะห์ต้นทุน',   'section' => 'ค่าใช้จ่าย & งบประมาณ'],
    ['key' => 'budget',                    'href' => '/budget',                    'label' => 'จัดการงบประมาณ',        'section' => 'ค่าใช้จ่าย & งบประมาณ'],

    // ---- 4.45 วิเคราะห์ความเสียหาย & RCA (Phase 27) ----
    ['key' => 'rca',                       'href' => '/rca',                       'label' => 'วิเคราะห์ความเสียหาย',   'section' => 'วิเคราะห์ความเสียหาย & Root Cause'],
    ['key' => 'rca/events',                'href' => '/rca/events',                'label' => 'เหตุการณ์ความเสียหาย',  'section' => 'วิเคราะห์ความเสียหาย & Root Cause'],
    ['key' => 'rca/taxonomy',              'href' => '/rca/taxonomy',              'label' => 'จัดการหมวดความเสียหาย', 'section' => 'วิเคราะห์ความเสียหาย & Root Cause'],

    // ---- 4.5 การอนุมัติ & เอกสาร ----
    ['key' => 'supervisor',                 'href' => '/supervisor',                 'label' => 'คิวงานหัวหน้างาน',      'section' => 'ควบคุมงาน & วางแผน'],
    ['key' => 'supervisor/queue',           'href' => '/supervisor/queue',           'label' => 'คิวงานทั้งหมด',          'section' => 'ควบคุมงาน & วางแผน'],
    ['key' => 'supervisor/review',          'href' => '/supervisor/review',          'label' => 'ทบทวนคำขอแจ้งซ่อม',       'section' => 'ควบคุมงาน & วางแผน'],
    ['key' => 'supervisor/plan',            'href' => '/supervisor/plan',            'label' => 'วางแผน & จัดตาราง',      'section' => 'ควบคุมงาน & วางแผน'],
    ['key' => 'supervisor/verify',          'href' => '/supervisor/verify',          'label' => 'ตรวจรับงาน (Verify)',     'section' => 'ควบคุมงาน & วางแผน'],

    // ---- 4.55 การวางแผนซ่อมบำรุง (Phase 25) ----
    ['key' => 'planning',                   'href' => '/planning',                   'label' => 'ศูนย์วางแผนซ่อมบำรุง',   'section' => 'การวางแผนซ่อมบำรุง'],
    ['key' => 'planning/calendar',          'href' => '/planning/calendar',          'label' => 'ตารางวางแผนงาน (เดือน)',  'section' => 'การวางแผนซ่อมบำรุง'],
    ['key' => 'field/plan',                 'href' => '/field/plan',                 'label' => 'แผนงานของฉัน',          'section' => 'การวางแผนซ่อมบำรุง'],

    // ---- 4.6 การอนุมัติ & เอกสาร ----
    ['key' => 'approval',                  'href' => '/approval',                  'label' => 'ศูนย์อนุมัติเอกสาร',     'section' => 'การอนุมัติ & เอกสาร'],
    ['key' => 'forms',                     'href' => '/forms',                     'label' => 'ศูนย์แบบฟอร์ม (F-EN)',   'section' => 'การอนุมัติ & เอกสาร'],
    ['key' => 'forms/designer',            'href' => '/forms/designer',            'label' => 'ออกแบบแบบฟอร์มดิจิทัล', 'section' => 'การอนุมัติ & เอกสาร'],
    ['key' => 'manuals',                   'href' => '/manuals',                   'label' => 'คู่มือการใช้งาน',       'section' => 'การอนุมัติ & เอกสาร'],

    // ---- 5. ระบบ & ตั้งค่า ----
    ['key' => 'notifications',             'href' => '/notifications',             'label' => 'ศูนย์แจ้งเตือน',         'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'settings/notifications',    'href' => '/settings/notifications',    'label' => 'รูปแบบการแจ้งเตือน LINE','section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'register',                  'href' => '/register',                  'label' => 'ลงทะเบียนผูกบัญชี LINE', 'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'users',                     'href' => '/users',                     'label' => 'ผู้ใช้งานระบบ',          'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'audit_log',                 'href' => '/audit-log',                 'label' => 'บันทึกการตรวจสอบ',      'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'settings',                  'href' => '/settings',                  'label' => 'ตั้งค่าทั้งหมด',          'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'editor/builder',            'href' => '/editor/builder',            'label' => 'สร้างหน้าเว็บ (Visual Builder)', 'section' => 'ระบบ & ตั้งค่า'],
    ['key' => 'pages',                     'href' => '/pages',                     'label' => 'หน้าเว็บที่สร้างเอง',    'section' => 'ระบบ & ตั้งค่า'],

    // ---- 4.95 ผู้รับเหมา & งานภายนอก (Phase 31) ----
    ['key' => 'contractor/overview',       'href' => '/contractors',               'label' => 'ผู้รับเหมา & งานภายนอก', 'section' => 'ผู้รับเหมา & งานภายนอก'],
    ['key' => 'contractor/work',           'href' => '/contractors/work',          'label' => 'งานภายนอก (External Work)','section' => 'ผู้รับเหมา & งานภายนอก'],
];
