<?php
/**
 * scripts/verify_menu_permissions.php — ตรวจความถูกต้องของ role-based menus
 *
 * ตรวจสอบ:
 *  ก) หลักลำดับสิทธิ์ Manager ⊇ Asst.Manager ⊇ Foreman ⊇ Operate ครบทุก key
 *  ข) ทุกปุ่มใน bottom nav ของทุก role ชี้ไปเมนูที่ role นั้นเห็น (is_granted=1)
 *  ค) ทุก role เห็น profile, notifications, register
 *  ง) Asst.Manager และ Manager เห็น analytics/kpi
 *  จ) หน้าแรกของแต่ละ role เป็นเมนูที่ role นั้นเห็น
 *
 * CLI: php scripts/verify_menu_permissions.php
 * Exit 0 = ผ่านทั้งหมด, Exit 1 = มีข้อผิดพลาด
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../src/config/db.php';
require __DIR__ . '/../src/bottom_nav.php';
require __DIR__ . '/../src/menu_catalog.php';

$pdo = getDb();
$catalog = require __DIR__ . '/../src/menu_catalog.php';
$catalogKeys = array_column($catalog, 'key');
$keySet = array_flip($catalogKeys);

function grantOf(PDO $pdo, int $rid, string $key): int {
    $st = $pdo->prepare('SELECT is_granted FROM menu_permissions WHERE role_id = ? AND menu_key = ?');
    $st->execute([$rid, $key]);
    $v = $st->fetchColumn();
    return ($v === false) ? 1 : (int)$v;
}

$roles = [];
foreach ($pdo->query('SELECT id, name FROM roles ORDER BY id') as $r) {
    $roles[(int)$r['id']] = $r['name'];
}

$fail = 0;
$pass = 0;
function ok(string $label): void { global $pass; $pass++; echo "  PASS  $label\n"; }
function bad(string $label, string $extra = ''): void { global $fail; $fail++; echo "  FAIL  $label" . ($extra !== '' ? "  [$extra]" : '') . "\n"; }

echo "=== ตรวจสอบ role-based menus ===\n";

// ก) hierarchy
echo "\n[ก] ลำดับสิทธิ์ Manager ⊇ Asst.Manager ⊇ Foreman ⊇ Operate\n";
$hierFail = 0;
foreach ($catalogKeys as $k) {
    $op  = grantOf($pdo, 3, $k);
    $fm  = grantOf($pdo, 7, $k);
    $as  = grantOf($pdo, 6, $k);
    $mg  = grantOf($pdo, 2, $k);
    if (!($op <= $fm && $fm <= $as && $as <= $mg)) {
        $hierFail++;
        if ($hierFail <= 20) bad("key=$k (Operate=$op Foreman=$fm Asst=$as Manager=$mg)");
    }
}
if ($hierFail === 0) ok("ครบทุก key (" . count($catalogKeys) . ") เป็นไปตามลำดับ");
else bad("รวม $hierFail key ที่ละเมิดลำดับ");

// ข) bottom nav
echo "\n[ข] ปุ่มล่างของทุก role ชี้ไปเมนูที่ role เห็น\n";
$bnFail = 0;
foreach ($roles as $rid => $name) {
    $slug = strtolower($name);
    $nav = resolveBottomNavKeys($pdo, $rid, $slug);
    foreach ($nav as $nk) {
        $g = grantOf($pdo, $rid, $nk);
        if ($g !== 1) {
            $bnFail++;
            bad("role=$rid ($name) bottom_nav=$nk is_granted=$g");
        }
    }
}
if ($bnFail === 0) ok("ปุ่มล่างทุกปุ่มของทุก role ชี้ไปเมนูที่เห็น");

// ค) profile/notifications/register
echo "\n[ค] ทุก role เห็น profile, notifications, register\n";
$pnFail = 0;
foreach ($roles as $rid => $name) {
    foreach (['profile','notifications','register'] as $k) {
        if (grantOf($pdo, $rid, $k) !== 1) {
            $pnFail++;
            bad("role=$rid ($name) $k ไม่เห็น");
        }
    }
}
if ($pnFail === 0) ok("ครบทุก role");

// ง) analytics/kpi
echo "\n[ง] Asst.Manager และ Manager เห็น analytics/kpi\n";
foreach ([6 => 'Asst.Manager', 2 => 'Manager'] as $rid => $name) {
    if (grantOf($pdo, $rid, 'analytics/kpi') === 1) ok("$name (role $rid)");
    else bad("$name (role $rid) ไม่เห็น analytics/kpi");
}

// จ) landing page
echo "\n[จ] หน้าแรกของแต่ละ role เป็นเมนูที่ role เห็น\n";
$landingMap = [
    9 => ['path' => '/repair/request', 'key' => 'repair/request'],
    3 => ['path' => '/repair/my_tasks', 'key' => 'repair/my_tasks'],
    7 => ['path' => '/supervisor', 'key' => 'supervisor'],
    2 => ['path' => '/dashboard', 'key' => 'dashboard'],
    6 => ['path' => '/dashboard', 'key' => 'dashboard'],
    5 => ['path' => '/dashboard', 'key' => 'dashboard'],
];
foreach ($landingMap as $rid => $info) {
    $g = grantOf($pdo, $rid, $info['key']);
    if ($g === 1) ok("role $rid (" . $roles[$rid] . ") landing " . $info['path'] . " = เห็น");
    else bad("role $rid (" . $roles[$rid] . ") landing " . $info['path'] . " ไม่เห็น (is_granted=$g)");
}

// extra: adjustment-specific
echo "\n[เพิ่มเติม] User scan=1; Operate/Foreman repair/history=1 & asset_registry=1\n";
if (grantOf($pdo, 9, 'scan') === 1) ok("User scan=1"); else bad("User scan ไม่ใช่ 1");
foreach ([3,7] as $rid) {
    foreach (['repair/history','asset_registry'] as $k) {
        if (grantOf($pdo, $rid, $k) === 1) ok("role $rid $k=1"); else bad("role $rid $k ไม่ใช่ 1");
    }
}

echo "\n========================================\n";
echo "PASS $pass  FAIL $fail\n";
exit($fail ? 1 : 0);
