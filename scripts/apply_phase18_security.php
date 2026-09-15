<?php
/**
 * scripts/apply_phase18_security.php — idempotent DB migration (Phase 18)
 *
 * ใช้งานกับฐานข้อมูลจริงที่รันอยู่แล้ว (audit_logs อาจถูกสร้างแบบ runtime
 * โดย AuditTrailService เดิม): สร้าง/เพิ่มคอลัมน์ + index + seed เมนู
 * โดยไม่ทำลายข้อมูลเดิม
 *
 * วิธีเรียก:  php scripts/apply_phase18_security.php
 *           (อ่าน DB creds จาก .env ผ่าน src/config/db.php)
 */

require_once __DIR__ . '/../src/config/db.php';
require_once __DIR__ . '/../src/config/settings_defaults.php';

$pdo = getDb();
$changed = 0;
$log = function (string $msg) use (&$changed) { echo $msg . PHP_EOL; };

// ---------- 1) ตารางหลัก (CREATE ถ้ายังไม่มี) ----------
$columns = [
    'user_id'        => 'INT UNSIGNED NULL',
    'user_name'      => 'VARCHAR(150) NULL',
    'action'         => 'VARCHAR(60) NOT NULL',
    'module'         => 'VARCHAR(60) NULL',
    'doc_no'         => 'VARCHAR(100) NULL',
    'resource_type'  => 'VARCHAR(60) NOT NULL',
    'resource_id'    => 'VARCHAR(64) NULL',
    'description'    => 'VARCHAR(500) NULL',
    'old_value'      => 'TEXT NULL',
    'new_value'      => 'TEXT NULL',
    'ip_address'     => 'VARCHAR(45) NULL',
    'user_agent'     => 'VARCHAR(250) NULL',
    'request_id'     => 'VARCHAR(64) NULL',
    'severity'       => "VARCHAR(10) NOT NULL DEFAULT 'info'",
];
$indexes = [
    'idx_audit_created_at' => ['created_at'],
    'idx_audit_user_id'    => ['user_id'],
    'idx_audit_action'     => ['action'],
    'idx_audit_resource'   => ['resource_type', 'resource_id'],
    'idx_audit_severity'   => ['severity'],
];

// ---- create ----
$pdo->exec("CREATE TABLE IF NOT EXISTS audit_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INT UNSIGNED NULL,
    user_name VARCHAR(150) NULL,
    action VARCHAR(60) NOT NULL,
    module VARCHAR(60) NULL,
    doc_no VARCHAR(100) NULL,
    resource_type VARCHAR(60) NOT NULL,
    resource_id VARCHAR(64) NULL,
    description VARCHAR(500) NULL,
    old_value TEXT NULL,
    new_value TEXT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(250) NULL,
    request_id VARCHAR(64) NULL,
    severity VARCHAR(10) NOT NULL DEFAULT 'info'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// ---- add columns (idempotent via information_schema) ----
$existing = [];
$stmt = $pdo->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs'");
foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $c) { $existing[$c] = true; }

foreach ($columns as $col => $def) {
    if (!isset($existing[$col])) {
        $pdo->exec("ALTER TABLE audit_logs ADD COLUMN `$col` $def" . ($col === 'created_at' ? '' : ''));
        $log("  + column: $col");
        $changed++;
    }
}

// ---- add indexes (idempotent via information_schema) ----
$haveIdx = [];
$stmt = $pdo->query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs'");
foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $i) { $haveIdx[$i] = true; }
foreach ($indexes as $name => $cols) {
    if (!isset($haveIdx[$name])) {
        $pdo->exec("ALTER TABLE audit_logs ADD INDEX `$name` (`" . implode('`, `', $cols) . "`)");
        $log("  + index: $name");
        $changed++;
    }
}

// ---------- 2) ตารางเก่าจาก AuditTrailService: module เป็น NOT NULL (runtime) → ล็อคให้ NULL ----------
try {
    $pdo->exec("ALTER TABLE audit_logs MODIFY COLUMN module VARCHAR(60) NULL");
    $pdo->exec("ALTER TABLE audit_logs MODIFY COLUMN doc_no VARCHAR(100) NULL");
    $log("  + column nullable: module, doc_no");
    $changed++;
} catch (Throwable $e) {
    $log("  (nullable fix skipped: " . $e->getMessage() . ")");
}

// ---------- 3) seed เมนู audit_log (เพิ่มเฉพาะ role ยังไม่มีแถว) ----------
$hasMenuPerm = false;
try {
    $stmt = $pdo->query("SELECT menu_key FROM menu_permissions WHERE menu_key = 'audit_log' LIMIT 1");
    $hasMenuPerm = (bool)$stmt->fetchColumn();
} catch (Throwable $e) {
    $log("  (menu_permissions unavailable: " . $e->getMessage() . ")");
}
if ($hasMenuPerm === false) {
    $ins = $pdo->prepare("INSERT INTO menu_permissions (role_id, menu_key, is_granted)
                          SELECT r.id, 'audit_log', CASE WHEN r.id IN (1,2,6) THEN 1 ELSE 0 END
                          FROM roles r
                          WHERE NOT EXISTS (SELECT 1 FROM menu_permissions mp
                                            WHERE mp.role_id = r.id AND mp.menu_key = 'audit_log')");
    $ins->execute();
    $log("  + seeded menu_permissions audit_log for " . $ins->rowCount() . " roles");
    $changed++;
} else {
    $log("  - menu_permissions.audit_log already seeded");
}

// ---------- 3) ข้อมูลที่มีอยู่แล้ว: resource_type = module เดิม ----------
$filled = (int)$pdo->query("SELECT COUNT(*) FROM audit_logs WHERE resource_type <> '' OR resource_type IS NOT NULL")->fetchColumn();
if ($filled === 0) {
    $pdo->exec("UPDATE audit_logs SET resource_type = COALESCE(NULLIF(module,''), 'system') WHERE resource_type = '' OR resource_type IS NULL");
}
// module ที่ไม่มีค่า → ใช้ resource_type
$pdo->exec("UPDATE audit_logs SET module = COALESCE(resource_type, 'system') WHERE module IS NULL OR module = ''");

if ($changed === 0) {
    $log("[OK] Phase 18 security migration — ไม่มีการเปลี่ยนแปลง (ฐานข้อมูลพร้อมใช้งานแล้ว)");
} else {
    $log("[OK] Phase 18 security migration — เปลี่ยนแปลง $changed รายการเรียบร้อย");
}