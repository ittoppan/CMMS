<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Handle language toggle parameter
if (isset($_GET['lang'])) {
    $allowedLangs = ['th', 'en', 'jp'];
    $selectedLang = strtolower(trim($_GET['lang']));
    if (in_array($selectedLang, $allowedLangs)) {
        $_SESSION['app_lang'] = $selectedLang;
    }
}

$currentLang = $_SESSION['app_lang'] ?? 'th';

$translations = [
    'th' => [
        'app_name'          => 'CMMS-TPT',
        'dashboard'         => 'แผงควบคุม',
        'repair'            => 'งานซ่อมบำรุง',
        'pm_am'             => 'งาน PM & AM',
        'calibration'       => 'งานสอบเทียบ',
        'asset_registry'    => 'ทะเบียนทรัพย์สิน',
        'spare_parts'       => 'คลังอะไหล่',
        'equipment_borrow'  => 'ยืม-คืนอุปกรณ์',
        'manuals'           => 'คู่มือเครื่องจักร',
        'mtbf_mttr'         => 'MTBF/MTTR',
        'users'             => 'ผู้ใช้งาน',
        'settings'          => 'ตั้งค่าระบบ',
        'bind_line'         => 'ผูก LINE',
        'leaderboard'       => 'ผลงานทีมช่าง',
        'backup'            => 'สำรองข้อมูล',
        'create_repair'     => '+ แจ้งซ่อมใหม่',
        'my_tasks'          => 'งานของฉัน',
        'kanban'            => 'กระดาน Kanban',
        'open_repairs'      => 'งานซ่อมที่เปิดอยู่',
        'pm_due'            => 'PM ครบกำหนด',
        'low_stock'         => 'อะไหล่ใกล้หมด',
        'active_assets'     => 'ทรัพย์สินใช้งาน',
        'search'            => 'ค้นหา...',
        'save'              => 'บันทึก',
        'cancel'            => 'ยกเลิก',
        'status'            => 'สถานะ',
        'action'            => 'จัดการ',
        'language'          => 'ภาษา',
    ],
    'en' => [
        'app_name'          => 'CMMS-TPT',
        'dashboard'         => 'Dashboard',
        'repair'            => 'Repair Orders',
        'pm_am'             => 'PM & AM',
        'calibration'       => 'Calibration',
        'asset_registry'    => 'Asset Registry',
        'spare_parts'       => 'Spare Parts',
        'equipment_borrow'  => 'Equipment Borrow',
        'manuals'           => 'Manuals',
        'mtbf_mttr'         => 'MTBF/MTTR',
        'users'             => 'Users',
        'settings'          => 'Settings',
        'bind_line'         => 'Bind LINE',
        'leaderboard'       => 'KPI Leaderboard',
        'backup'            => 'Backups',
        'create_repair'     => '+ New Repair',
        'my_tasks'          => 'My Tasks',
        'kanban'            => 'Kanban Board',
        'open_repairs'      => 'Open Work Orders',
        'pm_due'            => 'PM Due Soon',
        'low_stock'         => 'Low Stock Items',
        'active_assets'     => 'Active Assets',
        'search'            => 'Search...',
        'save'              => 'Save',
        'cancel'            => 'Cancel',
        'status'            => 'Status',
        'action'            => 'Actions',
        'language'          => 'Language',
    ],
    'jp' => [
        'app_name'          => 'CMMS-TPT',
        'dashboard'         => 'ダッシュボード',
        'repair'            => '修理・保全依頼',
        'pm_am'             => '予防保全 (PM/AM)',
        'calibration'       => '校正管理',
        'asset_registry'    => '設備・資産管理',
        'spare_parts'       => '予備品・在庫',
        'equipment_borrow'  => '工具貸出・返却',
        'manuals'           => '取扱説明書',
        'mtbf_mttr'         => 'MTBF/MTTR分析',
        'users'             => 'ユーザー管理',
        'settings'          => 'システム設定',
        'bind_line'         => 'LINE連携',
        'leaderboard'       => '保全KPIランキング',
        'backup'            => 'バックアップ',
        'create_repair'     => '+ 修理依頼登録',
        'my_tasks'          => 'マイタスク',
        'kanban'            => 'カンバンボード',
        'open_repairs'      => '未完了の修理件数',
        'pm_due'            => 'PM予定件数',
        'low_stock'         => '在庫不足品目',
        'active_assets'     => '稼働中設備',
        'search'            => '検索...',
        'save'              => '保存',
        'cancel'            => 'キャンセル',
        'status'            => 'ステータス',
        'action'            => '操作',
        'language'          => '言語',
    ]
];

function __t($key) {
    global $translations, $currentLang;
    return $translations[$currentLang][$key] ?? $translations['th'][$key] ?? $key;
}
