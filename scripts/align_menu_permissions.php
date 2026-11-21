<?php
/**
 * align_menu_permissions.php — ปรับ menu_permissions ตาม ROLE_MENUS.md (curated roles)
 *
 * CLI only.
 *   php scripts/align_menu_permissions.php            # dry-run (default) แสดงส่วนต่างต่อ role
 *   php scripts/align_menu_permissions.php --apply     # เขียนจริง (upsert is_granted 1/0 ครบทุก key ใน catalog)
 *
 * หลักการ:
 *   - แก้เฉพาะ role ที่ curated: User, Operate, Foreman, Asst.Manager, Manager, Viewer
 *   - ทุก key ใน src/menu_catalog.php จะถูก seed ชัดเจน (1 หรือ 0)
 *   - ไม่แตะ key ที่ไม่อยู่ใน catalog (orphan) และไม่แตะ Admin/Officer/Officer-Read
 *   - ไม่ลบแถวเก่า
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../src/config/db.php';
$pdo = getDb();
$catalog = require __DIR__ . '/../src/menu_catalog.php';
$catalogKeys = array_column($catalog, 'key');

// desired granted keys per curated role (role name => [keys])
$desired = [

    9 => [

        'knowledge',

        'knowledge/articles',

        'knowledge/search',

        'manuals',

        'notifications',

        'profile',

        'register',

        'repair/request',

        'repair/tracking',

    ],

    3 => [

        'equipment_borrowing',

        'field',

        'field/plan',

        'inspections/run',

        'knowledge',

        'knowledge/articles',

        'knowledge/search',

        'manuals',

        'notifications',

        'pm_am/checksheet',

        'profile',

        'register',

        'repair/my_tasks',

        'repair/request',

        'repair/tracking',

        'safety/work_permit',

        'scan',

        'spare_parts/issue_center',

    ],

    7 => [

        'approval',

        'equipment_borrowing',

        'field',

        'field/plan',

        'inspections/run',

        'knowledge',

        'knowledge/articles',

        'knowledge/search',

        'manuals',

        'notifications',

        'planning',

        'planning/calendar',

        'pm_am',

        'pm_am/calendar',

        'pm_am/checksheet',

        'pm_am/create',

        'profile',

        'register',

        'repair',

        'repair/assign',

        'repair/kanban',

        'repair/my_tasks',

        'repair/request',

        'repair/tracking',

        'repair/workload',

        'safety/work_permit',

        'scan',

        'spare_parts',

        'spare_parts/balances',

        'spare_parts/issue_center',

        'spare_parts/overview',

        'supervisor',

        'supervisor/plan',

        'supervisor/queue',

        'supervisor/review',

        'supervisor/verify',

        'workforce',

        'workforce/capacity',

        'workforce/skills',

        'workforce/technicians',

    ],

    6 => [

        'analytics',

        'analytics/kpi',

        'andon-board',

        'approval',

        'asset_registry',

        'asset_registry/bom_tree',

        'asset_registry/criticality',

        'asset_reliability',

        'asset_reliability/aging',

        'asset_reliability/config',

        'asset_reliability/critical',

        'asset_reliability/dashboard',

        'asset_reliability/data-quality',

        'asset_reliability/lifecycle',

        'asset_reliability/overhaul',

        'asset_reliability/replacement',

        'asset_reliability/reports',

        'budget',

        'calibration',

        'calibration/calendar',

        'calibration/certificates',

        'calibration/config',

        'calibration/dashboard',

        'calibration/data-quality',

        'calibration/instruments',

        'calibration/mobile',

        'calibration/oot',

        'calibration/plans',

        'calibration/po',

        'calibration/procedures',

        'calibration/reports',

        'calibration/schedule',

        'calibration/standards',

        'calibration/tracking',

        'contractor',

        'contractor/overview',

        'contractor/work',

        'cost',

        'dashboard',

        'document_control/overview',

        'engineering_change/overview',

        'equipment_borrowing',

        'feedback',

        'field',

        'field/plan',

        'forms',

        'forms/designer',

        'inspections',

        'inspections/run',

        'inspections/templates',

        'knowledge',

        'knowledge/articles',

        'knowledge/articles/create',

        'knowledge/categories',

        'knowledge/config',

        'knowledge/gaps',

        'knowledge/reviews',

        'knowledge/search',

        'knowledge/tags',

        'knowledge/usage',

        'manuals',

        'mtbf_mttr',

        'notifications',

        'notifications/history',

        'planning',

        'planning/calendar',

        'pm_am',

        'pm_am/batch_schedule',

        'pm_am/calendar',

        'pm_am/checksheet',

        'pm_am/create',

        'process_flows',

        'profile',

        'qr-sheet',

        'rca',

        'rca/events',

        'rca/taxonomy',

        'register',

        'reliability',

        'reliability/assets',

        'reliability/bad-actors',

        'reliability/config',

        'reliability/data-quality',

        'reliability/failure-modes',

        'reliability/growth',

        'reliability/pm-effectiveness',

        'reliability/studies',

        'reliability/trend',

        'reliability/weibull',

        'repair',

        'repair/assign',

        'repair/history',

        'repair/kanban',

        'repair/my_tasks',

        'repair/request',

        'repair/tracking',

        'repair/workload',

        'reports',

        'reports/export_excel',

        'reports/import_excel',

        'reports/monthly_pdf',

        'safety/work_permit',

        'scan',

        'shutdown',

        'spare_parts',

        'spare_parts/balances',

        'spare_parts/issue_center',

        'spare_parts/optimization',

        'spare_parts/overview',

        'spare_parts/returns',

        'spare_parts/sage_po',

        'spare_parts/sage_shipments',

        'spare_parts/sage_sync',

        'spare_parts/stock_take',

        'supervisor',

        'supervisor/plan',

        'supervisor/queue',

        'supervisor/review',

        'supervisor/verify',

        'suppliers',

        'workforce',

        'workforce/capacity',

        'workforce/certifications',

        'workforce/conflicts',

        'workforce/crews',

        'workforce/mine',

        'workforce/shifts',

        'workforce/skills',

        'workforce/technicians',

        'workforce/training',

    ],

    2 => [

        'analytics',

        'analytics/kpi',

        'andon-board',

        'approval',

        'asset_registry',

        'asset_registry/bom_tree',

        'asset_registry/criticality',

        'asset_reliability',

        'asset_reliability/aging',

        'asset_reliability/config',

        'asset_reliability/critical',

        'asset_reliability/dashboard',

        'asset_reliability/data-quality',

        'asset_reliability/lifecycle',

        'asset_reliability/overhaul',

        'asset_reliability/replacement',

        'asset_reliability/reports',

        'budget',

        'calibration',

        'calibration/calendar',

        'calibration/certificates',

        'calibration/config',

        'calibration/dashboard',

        'calibration/data-quality',

        'calibration/instruments',

        'calibration/mobile',

        'calibration/oot',

        'calibration/plans',

        'calibration/po',

        'calibration/procedures',

        'calibration/reports',

        'calibration/schedule',

        'calibration/standards',

        'calibration/tracking',

        'contractor',

        'contractor/overview',

        'contractor/work',

        'cost',

        'dashboard',

        'document_control/overview',

        'engineering_change/overview',

        'equipment_borrowing',

        'feedback',

        'field',

        'field/plan',

        'forms',

        'forms/designer',

        'inspections',

        'inspections/run',

        'inspections/templates',

        'iot/condition',

        'iot/monitor',

        'knowledge',

        'knowledge/articles',

        'knowledge/articles/create',

        'knowledge/categories',

        'knowledge/config',

        'knowledge/gaps',

        'knowledge/reviews',

        'knowledge/search',

        'knowledge/tags',

        'knowledge/usage',

        'manuals',

        'mtbf_mttr',

        'notifications',

        'notifications/history',

        'planning',

        'planning/calendar',

        'pm_am',

        'pm_am/batch_schedule',

        'pm_am/calendar',

        'pm_am/checksheet',

        'pm_am/create',

        'process_flows',

        'profile',

        'qr-sheet',

        'rca',

        'rca/events',

        'rca/taxonomy',

        'register',

        'reliability',

        'reliability/assets',

        'reliability/bad-actors',

        'reliability/config',

        'reliability/data-quality',

        'reliability/failure-modes',

        'reliability/growth',

        'reliability/pm-effectiveness',

        'reliability/studies',

        'reliability/trend',

        'reliability/weibull',

        'repair',

        'repair/assign',

        'repair/history',

        'repair/kanban',

        'repair/my_tasks',

        'repair/request',

        'repair/tracking',

        'repair/workload',

        'reports',

        'reports/export_excel',

        'reports/import_excel',

        'reports/monthly_pdf',

        'safety/work_permit',

        'scan',

        'shutdown',

        'spare_parts',

        'spare_parts/balances',

        'spare_parts/issue_center',

        'spare_parts/optimization',

        'spare_parts/overview',

        'spare_parts/returns',

        'spare_parts/sage_po',

        'spare_parts/sage_shipments',

        'spare_parts/sage_sync',

        'spare_parts/stock_take',

        'supervisor',

        'supervisor/plan',

        'supervisor/queue',

        'supervisor/review',

        'supervisor/verify',

        'suppliers',

        'workforce',

        'workforce/capacity',

        'workforce/certifications',

        'workforce/conflicts',

        'workforce/crews',

        'workforce/mine',

        'workforce/shifts',

        'workforce/skills',

        'workforce/technicians',

        'workforce/training',

    ],

    5 => [

        'analytics',

        'analytics/kpi',

        'andon-board',

        'dashboard',

        'notifications',

        'profile',

        'register',

        'reports',

        'reports/export_excel',

        'reports/monthly_pdf',

    ],

];

// ปรับตามคำสั่งผู้ใช้ (2026-11-21): User คง scan; Operate/Foreman คง repair/history + asset_registry
$desired[9] = array_values(array_unique(array_merge($desired[9], ['scan'])));
$desired[3] = array_values(array_unique(array_merge($desired[3], ['repair/history', 'asset_registry'])));
$desired[7] = array_values(array_unique(array_merge($desired[7], ['repair/history', 'asset_registry'])));

$apply = in_array('--apply', $argv ?? [], true);

// Build target grant map: role_id => key => 0/1
$targets = [];
foreach ($desired as $rid => $grantedList) {
    $set = array_flip($grantedList);
    foreach ($catalogKeys as $k) {
        $targets[$rid][$k] = isset($set[$k]) ? 1 : 0;
    }
}

$roles = array_keys($targets);

// current rows for these roles
function currentFor(PDO $pdo, int $rid): array {
    $st = $pdo->prepare('SELECT menu_key, is_granted FROM menu_permissions WHERE role_id = ?');
    $st->execute([$rid]);
    $out = [];
    foreach ($st->fetchAll() as $r) $out[$r['menu_key']] = (int)$r['is_granted'];
    return $out;
}

$plan = [];
$totalChanges = 0;
foreach ($roles as $rid) {
    $cur = currentFor($pdo, $rid);
    $changes = [];
    foreach ($catalogKeys as $k) {
        $curVal = array_key_exists($k, $cur) ? $cur[$k] : 1; // default unseen = 1
        $want = $targets[$rid][$k];
        if ($curVal !== $want) {
            $changes[] = ['key'=>$k,'from'=>$curVal,'to'=>$want,'existed'=>array_key_exists($k,$cur)];
            $totalChanges++;
        }
    }
    $plan[$rid] = $changes;
}

// role name lookup
$roleNames = [];
foreach ($pdo->query('SELECT id, name FROM roles') as $r) $roleNames[(int)$r['id']] = $r['name'];

echo "== แผนปรับ menu_permissions (curated roles) ==
";
foreach ($roles as $rid) {
    echo "
[Role {$rid} " . ($roleNames[$rid] ?? '') . "] changes=" . count($plan[$rid]) . "
";
    // summary add/remove
    $add=[]; $rem=[];
    foreach ($plan[$rid] as $c) {
        if ($c['to']===1) $add[]=$c['key']; else $rem[]=$c['key'];
    }
    echo "  จะเพิ่ม (" . count($add) . "): " . implode(', ', $add) . "
";
    echo "  จะซ่อน (" . count($rem) . "): " . implode(', ', $rem) . "
";
}
echo "
รวมการเปลี่ยนแปลง: {$totalChanges} แถว
";

if (!$apply) {
    echo "
(dry-run) ยังไม่เขียนลง DB — ใส่ --apply เพื่อใช้งานจริง
";
    exit(0);
}

$pdo->beginTransaction();
try {
    $upsert = $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted)');
    $n=0;
    foreach ($roles as $rid) {
        foreach ($catalogKeys as $k) {
            $upsert->execute([$rid, $k, $targets[$rid][$k]]);
            $n++;
        }
    }
    $pdo->commit();
    echo "apply เสร็จ: {$n} แถว (upsert)
";
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'ล้มเหลว: ' . $e->getMessage() . "
");
    exit(1);
}
