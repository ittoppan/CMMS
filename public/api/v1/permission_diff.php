<?php
/**
 * permission_diff.php — Permission Drift Detector (Admin only)
 *
 * GET /api/v1/permission_diff.php            -> ทุกบทบาท
 * GET /api/v1/permission_diff.php?role_id=N  -> บทบาทเดียว
 *
 * ตรวจว่าเมนูที่ role ได้รับ (menu_permissions.is_granted=1) มีสิทธิ์ API
 * (PERMISSION_MATRIX / user_permissions) ตรงกันหรือไม่ เพื่อป้องกัน
 * "เมนูเห็นได้แต่ข้อมูล 403" (เหมือนที่เกิดกับ Foreman/Officer)
 *
 * response: { roles: [ { id, name, granted_menus, drift: [ { menu_key, label, module, has_api_view } ] } ] }
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/auth.php';
require_once __DIR__ . '/../../../src/helpers/permissions.php';
require_once __DIR__ . '/../../../src/helpers/menu_module_map.php';
require_once __DIR__ . '/../../../src/menu_catalog.php';

header('Content-Type: application/json; charset=utf-8');
session_start();

try {
    $pdo = getDb();
    requireLogin($pdo, true); // admin only

    $catalog = require __DIR__ . '/../../../src/menu_catalog.php';
    $labelByKey = [];
    foreach ($catalog as $m) {
        $labelByKey[$m['key']] = $m['label'];
    }

    $roleIdFilter = isset($_GET['role_id']) ? (int)$_GET['role_id'] : 0;
    $roles = $pdo->query("SELECT id, name FROM roles ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
    if ($roleIdFilter > 0) {
        $roles = array_values(array_filter($roles, fn($r) => (int)$r['id'] === $roleIdFilter));
    }

    // granted menus per role
    $grantedByRole = [];
    $stmt = $pdo->query("SELECT role_id, menu_key, is_granted FROM menu_permissions");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rid = (int)$row['role_id'];
        if (!isset($grantedByRole[$rid])) $grantedByRole[$rid] = [];
        $grantedByRole[$rid][$row['menu_key']] = (int)$row['is_granted'];
    }

    $out = [];
    foreach ($roles as $r) {
        $rid = (int)$r['id'];
        $granted = [];
        foreach ($labelByKey as $key => $label) {
            $g = $grantedByRole[$rid][$key] ?? 1; // default visible
            if ($g === 1) $granted[] = $key;
        }
        $drift = [];
        foreach ($granted as $key) {
            $mod = menu_key_to_module($key);
            $hasView = perm_allowed($pdo, $rid, $mod, 'view');
            if (!$hasView) {
                $drift[] = [
                    'menu_key' => $key,
                    'label' => $labelByKey[$key] ?? $key,
                    'module' => $mod,
                    'has_api_view' => false,
                ];
            }
        }
        $out[] = [
            'id' => $rid,
            'name' => $r['name'],
            'granted_menus' => count($granted),
            'drift_count' => count($drift),
            'drift' => $drift,
        ];
    }

    echo json_encode(['roles' => $out], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('permission_diff: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Internal error']);
}
