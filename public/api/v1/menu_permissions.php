<?php
/**
 * CMMS-TPT Menu Permissions API — สิทธิ์เมนู PWA ตามบทบาท
 *
 * GET  /api/v1/menu_permissions.php
 *   -> { menus: [...catalog], roles: [...], permissions: { role_id: { menu_key: 1|0 } } }
 *
 * GET  ?user=1
 *   -> { user: { id, full_name, role_id, role_name }, permission: { menu_key: 1|0 } }
 *      (ระบุ role ผ่าน ?role_id= หรือ ?line_user_id= หรือ ?uid= เพื่อจำลอง)
 *
 * POST /api/v1/menu_permissions.php  body: { role_id, grants: { menu_key: 1|0 } }
 *   -> upsert ทีละ role
 */
require_once __DIR__ . '/../../../src/config/db.php';
require_once __DIR__ . '/../../../src/menu_catalog.php';
require_once __DIR__ . '/../../../src/bottom_nav.php';
require_once __DIR__ . '/../../../src/auth.php';
header('Content-Type: application/json; charset=utf-8');
session_start();
require_once __DIR__ . '/../../../src/csrf.php';
// CSRF: ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/DELETE) ต้องผ่านการตรวจ (token หรือ Origin/Referer เดียวกัน)
if (!in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD', 'OPTIONS'], true)) {
    enforceCsrf();
}


try {
    $pdo = getDb();
    $method = $_SERVER['REQUEST_METHOD'];
    $catalog = require __DIR__ . '/../../../src/menu_catalog.php';
    $validMenuKeys = array_flip(array_column($catalog, 'key')); // menu_key => true

    switch ($method) {
        case 'GET':
            $wantsUser = isset($_GET['user']) || isset($_GET['line_user_id']) || isset($_GET['uid']) || isset($_GET['role_id']);

            if ($wantsUser) {
                // ?role_id เท่านั้น = จำลองบทบาท (ไม่มีข้อมูลส่วนตัว) → เปิดได้
                // กรณีอื่น (?user / ?line_user_id / ?uid / session ตัวเอง) → ต้อง login
                $simulateOnly = isset($_GET['role_id'])
                    && !isset($_GET['user']) && !isset($_GET['line_user_id']) && !isset($_GET['uid']);
                if (!$simulateOnly) {
                    requireLogin($pdo);
                }
                // ---- หา role ของผู้ใช้ ----
                $roleId = isset($_GET['role_id']) ? (int)$_GET['role_id'] : 0;
                $lineUid = '';
                if (isset($_GET['line_user_id'])) $lineUid = trim((string)$_GET['line_user_id']);
                if (!$lineUid && isset($_GET['uid'])) $lineUid = trim((string)$_GET['uid']);

                $user = null;
                if ($roleId) {
                    $user = ['id' => 0, 'full_name' => 'จำลองบทบาท', 'role_id' => $roleId, 'simulated' => true];
                } elseif ($lineUid !== '') {
                    $stmt = $pdo->prepare("SELECT id, full_name, role_id, avatar, avatar_path FROM users WHERE line_user_id = ? AND is_active = 1");
                    $stmt->execute([$lineUid]);
                    $user = $stmt->fetch();
                } elseif (!empty($_SESSION['user_id'])) {
                    $stmt = $pdo->prepare("SELECT id, full_name, role_id, avatar, avatar_path FROM users WHERE id = ? AND is_active = 1");
                    $stmt->execute([$_SESSION['user_id']]);
                    $user = $stmt->fetch();
                }

                if (!$user) {
                    http_response_code(404);
                    echo json_encode(['error' => 'ไม่พบผู้ใช้ / ไม่มีสิทธิ์เข้าถึง', 'permission' => null]);
                    exit;
                }

                $uid = (int)$user['role_id'];
                $roleName = '';
                $stmt = $pdo->prepare("SELECT name FROM roles WHERE id = ?");
                $stmt->execute([$uid]);
                $roleName = $stmt->fetchColumn() ?: '';

                // permission ของ role นั้น: default (ไม่มีแถว) = เห็นเมนู
                $perm = [];
                foreach ($catalog as $m) {
                    $perm[$m['key']] = 1;
                }
                $stmt = $pdo->prepare("SELECT menu_key, is_granted FROM menu_permissions WHERE role_id = ?");
                $stmt->execute([$uid]);
                foreach ($stmt->fetchAll() as $row) {
                    $perm[$row['menu_key']] = (int)$row['is_granted'];
                }

                // ปุ่มล่างของบทบาท: อ่านจาก bottom_nav_config (fallback preset)
                // + filter ให้เหลือเฉพาะปุ่มที่เมนูยังเปิดใช้อยู่ (สิทธิ์ 1)
                $bottomNav = resolveBottomNavKeys($pdo, $uid, $roleName);
                $bottomNav = array_values(array_filter(
                    $bottomNav,
                    fn($k) => isset($validMenuKeys[$k]) && (($perm[$k] ?? 1) !== 0)
                ));

                echo json_encode([
                    'user' => [
                        'id'        => (int)($user['id'] ?? 0),
                        'full_name' => $user['full_name'] ?? '',
                        'role_id'   => $uid,
                        'role_name' => $roleName,
                        'avatar_path' => $user['avatar_path'] ?? null,
                        'avatar' => $user['avatar'] ?? null,
                        'simulated' => !empty($user['simulated']),
                    ],
                    'permission' => $perm,
                    'bottom_nav' => $bottomNav,
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }

            // ---- GET: matrix ทั้งหมด (หน้าจัดการสิทธิ์เมนู) ----
            requireLogin($pdo, true); // ข้อมูลสิทธิ์ทั้งหมดของทุกบทบาท = admin เท่านั้น
            $roles = $pdo->query("SELECT id, name, description FROM roles ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);

            // default: ทุกเมนูเห็นทั้งหมด
            $permissions = [];
            foreach ($roles as $r) {
                $permissions[(int)$r['id']] = [];
                foreach ($catalog as $m) {
                    $permissions[(int)$r['id']][$m['key']] = 1;
                }
            }
            $stmt = $pdo->query("SELECT role_id, menu_key, is_granted FROM menu_permissions");
            foreach ($stmt->fetchAll() as $row) {
                $rid = (int)$row['role_id'];
                if (isset($permissions[$rid])) {
                    $permissions[$rid][$row['menu_key']] = (int)$row['is_granted'];
                }
            }

            // ปุ่มล่างต่อบทบาท (ค่าในตาราง หรือ preset เริ่มต้นถ้ายังไม่ตั้งค่า)
            $bottomNav = [];
            foreach ($roles as $r) {
                $bottomNav[(int)$r['id']] = resolveBottomNavKeys($pdo, (int)$r['id'], strtolower((string)$r['name']));
            }
            // pool ของปุ่มที่เลือกได้ (จาก catalog เดียวกับ PWA/PHP)
            $bottomNavKeys = [];
            foreach (bottomNavCatalog()['meta'] as $k => $m) {
                $bottomNavKeys[] = ['key' => $k, 'label' => $m[0]];
            }

            echo json_encode([
                'menus'           => $catalog,
                'roles'           => $roles,
                'permissions'     => $permissions,
                'bottom_nav'      => $bottomNav,     // role_id => [menu_key, ...] เรียงตามลำดับ
                'bottom_nav_keys' => $bottomNavKeys, // pool ที่ใช้เพิ่มปุ่มได้
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'POST':
            requireLogin($pdo, true); // แก้สิทธิ์เมนู = งาน admin เท่านั้น
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $roleId = (int)($data['role_id'] ?? 0);
            $grants = $data['grants'] ?? null;

            if (!$roleId || !is_array($grants)) {
                http_response_code(400);
                echo json_encode(['error' => 'ต้องระบุ role_id และ grants ({menu_key: 0|1})']);
                exit;
            }

            // ตรวจว่า role มีอยู่
            $stmt = $pdo->prepare("SELECT id FROM roles WHERE id = ?");
            $stmt->execute([$roleId]);
            if (!$stmt->fetchColumn()) {
                http_response_code(404);
                echo json_encode(['error' => 'ไม่พบบทบาทนี้']);
                exit;
            }

            $pdo->beginTransaction();
            $upsert = $pdo->prepare(
                "INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE is_granted = VALUES(is_granted)"
            );
            $saved = 0;
            foreach ($grants as $key => $val) {
                if (!isset($validMenuKeys[$key])) continue; // ไม่รู้จักเมนู
                $g = !empty($val) ? 1 : 0;
                $upsert->execute([$roleId, $key, $g]);
                $saved++;
            }

            // ปุ่มล่าง (optional): ลบของเดิมแล้ว insert ใหม่ตามลำดับที่ส่งมา
            // ไม่ส่ง bottom_nav = ไม่แตะการตั้งค่าปุ่มล่างของบทบาทนี้
            $bnSaved = 0;
            if (array_key_exists('bottom_nav', $data)) {
                $bnList = $data['bottom_nav'];
                if (!is_array($bnList)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'bottom_nav ต้องเป็น array ของ menu_key']);
                    exit;
                }
                $pdo->prepare("DELETE FROM bottom_nav_config WHERE role_id = ?")->execute([$roleId]);
                $insBn = $pdo->prepare(
                    "INSERT INTO bottom_nav_config (role_id, menu_key, sort_order) VALUES (?, ?, ?)"
                );
                $bnCat = bottomNavCatalog();
                $order = 0;
                foreach ($bnList as $k) {
                    $k = (string)$k;
                    if (!isset($bnCat['meta'][$k])) continue; // ไม่รู้จักปุ่ม
                    $insBn->execute([$roleId, $k, $order++]);
                    $bnSaved++;
                }
            }
            $pdo->commit();

            $msg = "บันทึกสิทธิ์เมนูของบทบาทสำเร็จ ($saved รายการ)";
            if (array_key_exists('bottom_nav', $data)) {
                $msg .= " และปุ่มล่าง $bnSaved ปุ่ม";
            }
            echo json_encode(['success' => true, 'message' => $msg]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    if (isset($pdo)) { try { $pdo->rollBack(); } catch (Exception $e2) {} }
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
