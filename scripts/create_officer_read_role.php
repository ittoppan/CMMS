<?php
require_once __DIR__ . '/../src/config/db.php';
$pdo = getDb();
// insert role if not exists
$stmt = $pdo->prepare("SELECT id FROM roles WHERE name = 'Officer-Read' LIMIT 1");
$stmt->execute();
$id = $stmt->fetchColumn();
if ($id === false) {
    $pdo->prepare("INSERT INTO roles (name, description) VALUES ('Officer-Read', 'Officer (อ่านอย่างเดียว) — ดูข้อมูลได้ แต่ไม่แก้ไข')")->execute();
    $id = (int)$pdo->lastInsertId();
    echo "created role id=$id\n";
} else {
    echo "existing role id=$id\n";
}
// copy menu_permissions from role 8 (Officer) if none exist
$cnt = (int)$pdo->query("SELECT COUNT(*) FROM menu_permissions WHERE role_id = " . (int)$id)->fetchColumn();
if ($cnt === 0) {
    $pdo->exec("INSERT INTO menu_permissions (role_id, menu_key, is_granted) SELECT " . (int)$id . ", menu_key, is_granted FROM menu_permissions WHERE role_id = 8");
    echo "copied menu_permissions from role 8\n";
}
// copy bottom_nav if table exists
try {
    $pdo->exec("INSERT INTO role_bottom_nav (role_id, menu_key, sort_order) SELECT " . (int)$id . ", menu_key, sort_order FROM role_bottom_nav WHERE role_id = 8");
    echo "copied bottom_nav\n";
} catch (Exception $e) { echo "bottom_nav skip: " . $e->getMessage() . "\n"; }
echo "ROLE_ID=" . $id . "\n";
