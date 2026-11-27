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
    ['key' => 'dashboard',                 'href' => '/dashboard',                 'label' => 'ศูนย์รวม Dashboard',       'section' => '1 ภาพรวม'],
    ['key' => 'repair',                    'href' => '/repair',                    'label' => 'ใบสั่งงานซ่อมทั้งหมด',      'section' => '2 งานซ่อม'],
    ['key' => 'field',                     'href' => '/field',                     'label' => 'โหมดภาคสนาม',             'section' => '2 งานซ่อม'],
    ['key' => 'repair/workload',           'href' => '/repair/workload',           'label' => 'ภาระงานช่าง',             'section' => '2 งานซ่อม'],
    ['key' => 'repair/request',            'href' => '/repair/request',            'label' => 'ฟอร์มแจ้งซ่อมด่วน',      'section' => '2 งานซ่อม'],
    ['key' => 'repair/assign',             'href' => '/repair/assign',             'label' => 'มอบหมายงาน',              'section' => '2 งานซ่อม'],
    ['key' => 'repair/my_tasks',           'href' => '/repair/my_tasks',           'label' => 'งานซ่อมของฉัน',          'section' => '2 งานซ่อม'],
    ['key' => 'repair/tracking',           'href' => '/repair/tracking',           'label' => 'ติดตามงานซ่อม',          'section' => '2 งานซ่อม'],
    ['key' => 'repair/kanban',             'href' => '/repair/kanban',             'label' => 'Kanban Board',           'section' => '2 งานซ่อม'],
    ['key' => 'repair/history',            'href' => '/repair/history',            'label' => 'ประวัติงานซ่อม',         'section' => '2 งานซ่อม'],

    // ---- 2. PM & เครื่องจักร ----
    ['key' => 'pm_am',                     'href' => '/pm_am',                     'label' => 'ตารางแผน PM',            'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'pm_am/calendar',            'href' => '/pm_am/calendar',            'label' => 'ปฏิทิน PM/AM',           'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'pm_am/create',              'href' => '/pm_am/create',              'label' => 'สร้างแผน PM',            'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'pm_am/batch_schedule',      'href' => '/pm_am/batch_schedule',      'label' => 'สร้างแผนแบบกลุ่ม',       'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'pm_am/checksheet',          'href' => '/pm_am/checksheet',          'label' => 'ทำเช็คชีท PM',           'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'asset_registry',            'href' => '/asset_registry',            'label' => 'ทะเบียนเครื่องจักร',     'section' => '4 เครื่องจักร'],
    ['key' => 'qr-sheet',                  'href' => '/qr-sheet',                  'label' => 'QR Sheet เครื่องจักร',   'section' => '4 เครื่องจักร'],
    ['key' => 'scan',                      'href' => '/scan',                      'label' => 'สแกน QR',               'section' => '1 ภาพรวม'],
    ['key' => 'asset_reliability',                           'href' => '/asset-reliability',                           'label' => 'ความน่าเชื่อถือเครื่องจักร',  'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/dashboard',                 'href' => '/asset-reliability',                           'label' => 'แดชบอร์ด Reliability',       'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/critical',                  'href' => '/asset-reliability/critical',                  'label' => 'เครื่องวิกฤต (A–D)',          'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/lifecycle',                 'href' => '/asset-reliability/lifecycle',                 'label' => 'วงจรชีวิตเครื่องจักร',        'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/aging',                     'href' => '/asset-reliability/aging',                     'label' => 'เครื่องเก่า / อายุการใช้งาน',  'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/replacement',               'href' => '/asset-reliability/replacement',               'label' => 'แผนเปลี่ยนชิ้นส่วน',          'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/overhaul',                  'href' => '/asset-reliability/overhaul',                  'label' => 'แผนยกเครื่อง (Overhaul)',      'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/data-quality',              'href' => '/asset-reliability/data-quality',              'label' => 'คุณภาพข้อมูลเครื่องจักร',     'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/reports',                   'href' => '/asset-reliability/reports',                   'label' => 'รายงาน Reliability',          'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_reliability/config',                    'href' => '/asset-reliability/config',                    'label' => 'ตั้งค่า Reliability',         'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'asset_registry/bom_tree',   'href' => '/asset_registry/bom_tree',   'label' => 'BOM Tree ชิ้นส่วน',      'section' => '4 เครื่องจักร'],
    ['key' => 'asset_registry/criticality','href' => '/asset_registry/criticality','label' => 'ลำดับความสำคัญ A/B/C',  'section' => '4 เครื่องจักร'],
    ['key' => 'equipment_borrowing',       'href' => '/equipment_borrowing',       'label' => 'ยืม-คืนอุปกรณ์',         'section' => '5 คลังอะไหล่'],
    ['key' => 'calibration',               'href' => '/calibration',               'label' => 'สอบเทียบเครื่องมือวัด',  'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/instruments',    'href' => '/calibration/instruments',   'label' => 'เครื่องมือวัด (Instrument Master)', 'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/plans',          'href' => '/calibration/plans',         'label' => 'แผนสอบเทียบ',          'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/schedule',       'href' => '/calibration/schedule',      'label' => 'ตารางสอบเทียบ',         'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/dashboard',      'href' => '/calibration/dashboard',     'label' => 'แดชบอร์ดสอบเทียบ',      'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/standards',      'href' => '/calibration/standards',     'label' => 'มาตรฐานอ้างอิง',        'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/procedures',     'href' => '/calibration/procedures',    'label' => 'ขั้นตอนสอบเทียบ',       'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/certificates',   'href' => '/calibration/certificates',  'label' => 'ใบรับรองสอบเทียบ',      'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/oot',            'href' => '/calibration/oot',           'label' => 'OOT / นอกเกณฑ์',       'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/reports',        'href' => '/calibration/reports',       'label' => 'รายงานสอบเทียบ',        'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/data-quality',   'href' => '/calibration/data-quality',  'label' => 'คุณภาพข้อมูลสอบเทียบ',  'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/mobile',         'href' => '/calibration/mobile',        'label' => 'สอบเทียบบนมือถือ',      'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/config',         'href' => '/calibration/config',        'label' => 'ตั้งค่าสอบเทียบ',       'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/calendar',      'href' => '/calibration/calendar',      'label' => 'ปฏิทินสอบเทียบ',         'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/po',            'href' => '/calibration/po',            'label' => 'PO งานสอบเทียบ',         'section' => '9 สอบเทียบ'],
    ['key' => 'calibration/tracking',      'href' => '/calibration/tracking',      'label' => 'ติดตามงานสอบเทียบ',      'section' => '9 สอบเทียบ'],
    ['key' => 'inspections',               'href' => '/inspections',               'label' => 'ตรวจเช็ครอบ (Checklist)','section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'inspections/templates',     'href' => '/inspections/templates',     'label' => 'จัดการ Template ตรวจ',  'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'inspections/run',     'href' => '/inspections/run',     'label' => 'ทำเช็คลิสต์ทันที',  'section' => '3 PM & ตรวจเช็ค'],

    // ---- 3. คลังอะไหล่ ----
    ['key' => 'spare_parts',               'href' => '/spare_parts',               'label' => 'คลังสต็อกอะไหล่',        'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/overview',      'href' => '/spare_parts/overview',      'label' => 'ภาพรวมสต็อก & การเบิก',    'section' => '5 คลังอะไหล่'],
    ['key' => 'suppliers',                   'href' => '/suppliers',                   'label' => 'ผู้ผลิต & คะแนนผู้ขาย',    'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/balances',      'href' => '/spare_parts/balances',      'label' => 'ยอดคงเหลืออะไหล่',       'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/returns',       'href' => '/spare_parts/returns',       'label' => 'สต็อกอะไหล่คืนซาก',       'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/stock_take',    'href' => '/spare_parts/stock_take',    'label' => 'นับสต็อกจริง',             'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/issue_center',  'href' => '/spare_parts/issue_center',  'label' => 'ศูนย์เบิก-จ่าย',         'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/sage_shipments','href' => '/spare_parts/sage_shipments', 'label' => 'Sage 300 I/C Shipments',   'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/sage_po',       'href' => '/spare_parts/sage_po',       'label' => 'รับอะไหล่จาก PO',        'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/optimization',  'href' => '/spare_parts/optimization',  'label' => 'AI EOQ & Dead Stock',    'section' => '5 คลังอะไหล่'],
    ['key' => 'spare_parts/sage_sync',       'href' => '/spare_parts/sage_sync',       'label' => 'ซิงค์สต็อก Sage 300',      'section' => '5 คลังอะไหล่'],

    // ---- 4. วิเคราะห์ & รายงาน ----
    ['key' => 'analytics',                 'href' => '/analytics',                 'label' => 'Data Warehouse & BI',    'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'analytics/kpi',             'href' => '/analytics/kpi',             'label' => 'KPI',                   'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'andon-board',               'href' => '/andon-board',               'label' => 'จอ Andon TV (โรงงาน)',   'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'reports/monthly_pdf',       'href' => '/reports/monthly_pdf',       'label' => 'รายงาน PDF ผู้บริหาร',   'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'reports',                     'href' => '/reports',                     'label' => 'ศูนย์รวมรายงาน',          'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'reports/import_excel',        'href' => '/reports/import_excel',        'label' => 'นำเข้า Excel',            'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'reports/export_excel',      'href' => '/reports/export_excel',      'label' => 'Export Excel / CSV',     'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'iot/monitor',               'href' => '/iot/monitor',               'label' => 'IoT Sensor Monitor',     'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'iot/condition',             'href' => '/iot/condition',             'label' => 'สภาพเครื่องจักร (IoT)',  'section' => '7 รายงาน & วิเคราะห์'],

    // ---- 4.47 ความปลอดภัย & ใบอนุญาตทำงานเสี่ยง (Phase 30) ----
    ['key' => 'safety/work_permit',        'href' => '/safety/work_permit',        'label' => 'ใบอนุญาตทำงานเสี่ยง (PTW)','section' => '6 ความปลอดภัย'],

    // ---- 4.4 ค่าใช้จ่าย & งบประมาณ (Phase 26) ----
    ['key' => 'cost',                      'href' => '/cost',                      'label' => 'ศูนย์วิเคราะห์ต้นทุน',   'section' => '7 รายงาน & วิเคราะห์'],
    ['key' => 'budget',                    'href' => '/budget',                    'label' => 'จัดการงบประมาณ',        'section' => '7 รายงาน & วิเคราะห์'],

    // ---- 4.45 วิเคราะห์ความเสียหาย & RCA (Phase 27) ----
    ['key' => 'rca',                       'href' => '/rca',                       'label' => 'วิเคราะห์ความเสียหาย',   'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'rca/events',                'href' => '/rca/events',                'label' => 'เหตุการณ์ความเสียหาย',  'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'rca/taxonomy',              'href' => '/rca/taxonomy',              'label' => 'จัดการหมวดความเสียหาย', 'section' => '8 ความน่าเชื่อถือ & RCA'],

    // ---- 4.46 วิศวกรรมความเสียหาย (Phase 37) ----
    // ค่าทุกตัวคำนวณมาจาก Reliability Engine ฝั่ง PHP เท่านั้น หน้าเว็บเป็นตัวแสดงผลอย่างเดียว
    // (ดู RELIABILITY_ENGINEERING.md — NULL = คำนวณไม่ได้ ห้ามแทนด้วย 0)
    ['key' => 'reliability',                  'href' => '/reliability',                       'label' => 'ภาพรวมความเสียหาย',            'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/assets',           'href' => '/reliability/assets',                'label' => 'ตารางความเสียหายรายเครื่อง',      'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/failure-modes',    'href' => '/reliability/failure-modes',         'label' => 'การวิเคราะห์โหมดการเสีย',        'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/trend',            'href' => '/reliability/trend',                 'label' => 'แนวโน้มตามเวลา',                  'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/weibull',          'href' => '/reliability/weibull',               'label' => 'การวิเคราะห์ Weibull',           'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/bad-actors',       'href' => '/reliability/bad-actors',            'label' => 'Bad Actors',                     'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/pm-effectiveness', 'href' => '/reliability/pm-effectiveness',      'label' => 'ประสิทธิผลแผน PM',               'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/growth',           'href' => '/reliability/growth',                'label' => 'การเติบโต & ต้นทุน',              'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/studies',          'href' => '/reliability/studies',               'label' => 'งานวิจัยเชิงวิศวกรรม',            'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/data-quality',     'href' => '/reliability/data-quality',          'label' => 'คุณภาพข้อมูล',                  'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'reliability/config',           'href' => '/reliability/config',                'label' => 'ตั้งค่าความเสียหาย',             'section' => '8 ความน่าเชื่อถือ & RCA'],
    ['key' => 'mtbf_mttr',                    'href' => '/mtbf_mttr',                       'label' => 'วิเคราะห์ MTBF/MTTR',              'section' => '8 ความน่าเชื่อถือ & RCA'],

    // ---- 4.5 การอนุมัติ & เอกสาร ----
    ['key' => 'supervisor',                 'href' => '/supervisor',                 'label' => 'คิวงานหัวหน้างาน',      'section' => '2 งานซ่อม'],
    ['key' => 'supervisor/queue',           'href' => '/supervisor/queue',           'label' => 'คิวงานทั้งหมด',          'section' => '2 งานซ่อม'],
    ['key' => 'supervisor/review',          'href' => '/supervisor/review',          'label' => 'ทบทวนคำขอแจ้งซ่อม',       'section' => '2 งานซ่อม'],
    ['key' => 'supervisor/plan',            'href' => '/supervisor/plan',            'label' => 'วางแผน & จัดตาราง',      'section' => '2 งานซ่อม'],
    ['key' => 'supervisor/verify',          'href' => '/supervisor/verify',          'label' => 'ตรวจรับงาน (Verify)',     'section' => '2 งานซ่อม'],
    ['key' => 'workforce',                  'href' => '/workforce',                  'label' => 'กำลังคนและคุณสมบัติ',     'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/technicians',        'href' => '/workforce/technicians',        'label' => 'ข้อมูลช่าง',               'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/skills',             'href' => '/workforce/skills',             'label' => 'ทะเบียนทักษะ',             'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/certifications',     'href' => '/workforce/certifications',     'label' => 'ใบรับรองและสิทธิ์',        'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/training',           'href' => '/workforce/training',           'label' => 'หลักสูตรและอบรม',         'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/capacity',           'href' => '/workforce/capacity',           'label' => 'ความจุและภาระงาน',        'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/shifts',             'href' => '/workforce/shifts',             'label' => 'กะและการลา',              'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/crews',              'href' => '/workforce/crews',              'label' => 'ทีมงาน',                   'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/conflicts',          'href' => '/workforce/conflicts',          'label' => 'มอบหมายงาน (ความพร้อมและการจัดช่าง)', 'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'workforce/mine',               'href' => '/workforce/mine',               'label' => 'ข้อมูลของฉัน',             'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'process_flows',                'href' => '/process-flows',                'label' => 'ผังกระบวนการซ่อมบำรุง',     'section' => '11 เอกสาร & ความรู้'],

    // ---- 4.55 การวางแผนซ่อมบำรุง (Phase 25) ----
    ['key' => 'planning',                   'href' => '/planning',                   'label' => 'ศูนย์วางแผนซ่อมบำรุง',   'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'planning/calendar',          'href' => '/planning/calendar',          'label' => 'ตารางวางแผนงาน (เดือน)',  'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'field/plan',                 'href' => '/field/plan',                 'label' => 'แผนงานของฉัน',          'section' => '3 PM & ตรวจเช็ค'],
    ['key' => 'shutdown',                   'href' => '/shutdown',                   'label' => 'ศูนย์หยุดเครื่อง & Turnaround', 'section' => '3 PM & ตรวจเช็ค'],

    // ---- 4.6 การอนุมัติ & เอกสาร ----
    ['key' => 'approval',                  'href' => '/approval',                  'label' => 'ศูนย์อนุมัติเอกสาร',     'section' => '2 งานซ่อม'],
    ['key' => 'forms',                     'href' => '/forms',                     'label' => 'ศูนย์แบบฟอร์ม (F-EN)',   'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'forms/designer',            'href' => '/forms/designer',            'label' => 'ออกแบบแบบฟอร์มดิจิทัล', 'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'manuals',                   'href' => '/manuals',                   'label' => 'คู่มือการใช้งาน',       'section' => '11 เอกสาร & ความรู้'],

    // ---- 5. ระบบ & ตั้งค่า ----
    ['key' => 'notifications',             'href' => '/notifications',             'label' => 'ศูนย์แจ้งเตือน',         'section' => '1 ภาพรวม'],
    ['key' => 'notifications/history',     'href' => '/notifications/history',     'label' => 'ประวัติการส่ง LINE',      'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'feedback',                    'href' => '/feedback',                    'label' => 'ส่งความคิดเห็น / แจ้งปัญหา', 'section' => '1 ภาพรวม'],
    ['key' => 'roles',                       'href' => '/roles',                       'label' => 'บทบาท & สิทธิ์',            'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'system_health',               'href' => '/settings/health',             'label' => 'สุขภาพระบบ (มอนิเตอร์)',    'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'settings/notifications',    'href' => '/settings/notifications',    'label' => 'รูปแบบการแจ้งเตือน LINE','section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'register',                  'href' => '/register',                  'label' => 'ลงทะเบียนผูกบัญชี LINE', 'section' => '1 ภาพรวม'],
    ['key' => 'users',                     'href' => '/users',                     'label' => 'ผู้ใช้งานระบบ',          'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'audit_log',                 'href' => '/audit-log',                 'label' => 'บันทึกการตรวจสอบ',      'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'settings',                  'href' => '/settings',                  'label' => 'ตั้งค่าทั้งหมด',          'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'profile',                   'href' => '/profile',                   'label' => 'โปรไฟล์',               'section' => '1 ภาพรวม'],
    ['key' => 'editor/builder',            'href' => '/editor/builder',            'label' => 'สร้างหน้าเว็บ (Visual Builder)', 'section' => '12 ระบบ & ตั้งค่า'],
    ['key' => 'pages',                     'href' => '/pages',                     'label' => 'หน้าเว็บที่สร้างเอง',    'section' => '12 ระบบ & ตั้งค่า'],

    // ---- 4.95 ผู้รับเหมา & งานภายนอก (Phase 31) ----
    ['key' => 'contractor/overview',       'href' => '/contractors',               'label' => 'ผู้รับเหมา & งานภายนอก', 'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'contractor',                   'href' => '/contractors',                   'label' => 'ผู้รับเหมา & งานภายนอก',            'section' => '10 กำลังคน & ผู้รับเหมา'],
    ['key' => 'contractor/work',           'href' => '/contractors/work',          'label' => 'งานภายนอก (External Work)','section' => '10 กำลังคน & ผู้รับเหมา'],

    // ---- 4.96 Engineering Change & เอกสารควบคุม (Phase 32) ----
    ['key' => 'engineering_change/overview', 'href' => '/engineering-changes',      'label' => 'Engineering Change (ECR)', 'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'document_control/overview',  'href' => '/documents',                 'label' => 'เอกสารควบคุม (Document Control)', 'section' => '11 เอกสาร & ความรู้'],

    // ---- 4.97 ศูนย์ความรู้ (Phase 38) ----
    // โหลดความรู้ต้องง่ายเหมือนเปิดเอกสาร: roles 3/4/5 อ่านและค้นได้
    // ส่วนการเขียน/อนุมัติ/เผยแพร่ แยกสิทธิ์เหมือนเอกสารควบคุม
    ['key' => 'knowledge',                  'href' => '/knowledge',                 'label' => 'ศูนย์ความรู้ (Knowledge Center)', 'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/search',           'href' => '/knowledge/search',          'label' => 'ค้นหาความรู้',           'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/articles',         'href' => '/knowledge/articles',        'label' => 'บทความความรู้',          'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/articles/create',  'href' => '/knowledge/articles/create', 'label' => 'เขียนบทความใหม่',       'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/gaps',             'href' => '/knowledge/gaps',            'label' => 'ช่องว่างความรู้',        'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/reviews',          'href' => '/knowledge/reviews',         'label' => 'งานทบทวนความรู้',        'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/categories',       'href' => '/knowledge/taxonomy',        'label' => 'หมวดหมู่ความรู้',         'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/tags',             'href' => '/knowledge/taxonomy',        'label' => 'แท็กความรู้',            'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/usage',            'href' => '/knowledge/usage',           'label' => 'สถิติการใช้งาน',         'section' => '11 เอกสาร & ความรู้'],
    ['key' => 'knowledge/config',           'href' => '/knowledge/taxonomy',        'label' => 'ตั้งค่าศูนย์ความรู้',     'section' => '11 เอกสาร & ความรู้'],
];
