<?php
/**
 * CMMS-TPT Bottom Nav Catalog — ปุ่มล่างมือถือ (role-based)
 *
 * แหล่งข้อมูลเดียวของปุ่มล่าง ใช้ร่วมกัน:
 *  - API menu_permissions.php  (คืน bottom_nav + bottom_nav_keys ให้ PWA / หน้า Settings)
 *  - src/includes/footer.php   (render ปุ่มล่างฝั่ง PHP หน้าเดิม)
 *  - หน้า /settings/menus      (ตั้งค่าปุ่มล่างต่อบทบาท + พรีวิว)
 *
 * meta: key => [label, href_php, active_pattern_php, icon_php]
 *   (label ใช้ชื่อเดียวกับ BOTTOM_NAV_ITEMS ฝั่ง PWA)
 * defaults: preset เริ่มต้นต่อบทบาท (slug = ชื่อ roles เป็นตัวพิมพ์เล็ก)
 *   — ใช้เมื่อตาราง bottom_nav_config ยังไม่มีแถวของบทบาทนั้น (ยังไม่เคยตั้งค่า)
 */
return [
    'meta' => [
        'dashboard'             => ['หน้าแรก',     '/',                          '/index.php',        'home'],
        'repair/my_tasks'       => ['งานของฉัน',   '/pages/repair/my_tasks.php', 'my_tasks',          'clipboard'],
        'repair/request'        => ['แจ้งซ่อม',    '/pages/repair/',             'repair',            'wrench'],
        'repair/tracking'       => ['ติดตามงาน',   '/pages/repair/tracking.php', 'tracking',          'search'],
        'pm_am/checksheet'      => ['เช็คชีตตามแผน','/pages/pm_am/checksheet.php','checksheet',        'check'],
        'pm_am/calendar'        => ['แผน PM',      '/pages/pm_am/',              'calendar',          'calendar'],
        'asset_registry'        => ['เครื่องจักร',  '/pages/asset_registry/',     'asset_registry',    'factory'],
        'qr-sheet'              => ['สแกน QR',     '/pages/qr/scanner.php',      'qr',                'qr'],
        'notifications'         => ['แจ้งเตือน',    '/pages/notifications/center.php', 'notification', 'bell'],
        'analytics'             => ['คลังข้อมูล',   '/pages/analytics/bi_warehouse.php', 'bi_warehouse', 'chart'],
        'reports/export_excel'  => ['ส่งออก Excel', '/pages/analytics/',          'analytics',         'table'],
        'reports/monthly_pdf'   => ['รายงาน PDF',   '/pages/analytics/',          'analytics',         'doc'],
        'settings'              => ['ตั้งค่า',      '/pages/settings/',           'settings',          'gear'],
    ],
    'defaults' => [
        'admin'      => ['dashboard', 'repair/request', 'pm_am/calendar', 'asset_registry', 'settings'],
        'manager'    => ['dashboard', 'pm_am/checksheet', 'pm_am/calendar', 'repair/my_tasks', 'asset_registry'],
        'technician' => ['dashboard', 'repair/my_tasks', 'pm_am/checksheet', 'repair/request', 'asset_registry'],
        'operator'   => ['dashboard', 'repair/request', 'repair/tracking', 'qr-sheet', 'notifications'],
        'viewer'     => ['dashboard', 'analytics', 'notifications', 'reports/export_excel', 'reports/monthly_pdf'],
    ],
];
