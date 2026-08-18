<?php
/**
 * flag_default_passwords.php — ตั้ง users.must_change_password = 1 ให้บัญชีที่
 * ยังใช้รหัสเริ่มต้น/รหัสอ่อนที่รู้จัก (ต้องเปลี่ยนรหัสครั้งแรกหลังล็อกอิน)
 *
 * วิธีใช้:
 *   php scripts/flag_default_passwords.php            # ตรวจทุกบัญชี active
 *   php scripts/flag_default_passwords.php --list     # ดูรายชื่อเท่านั้น (ไม่เขียน)
 *   php scripts/flag_default_passwords.php --user=E01117   # เฉพาะบัญชีเดียว
 *
 * ⚠️ อ่าน bcrypt hash ได้ทางเดียว (password_verify) — ตรวจเทียบกับลิสต์รหัส
 * ที่พบบ่อยเท่านั้น ตรวจรหัสที่แข็งแรงกว่าไม่ออก (ถูกต้องตามหลักความปลอดภัย)
 */
require __DIR__ . '/../src/config/db.php';

// ลิสต์รหัสเริ่มต้น/อ่อนที่พบบ่อย — เพิ่มได้ถ้ารู้ว่าองค์กรเคยตั้งอะไร
$DEFAULTS = [
    'password', '1234', '123456', '12345678', 'admin', 'toppan',
    'P@ssw0rd', 'Passw0rd', 'password123', 'changeme', 'toppan123',
];

$pdo = getDb();
$listOnly = in_array('--list', $argv, true);
$onlyUser = null;
foreach ($argv as $a) {
    if (str_starts_with($a, '--user=')) $onlyUser = trim(substr($a, 7));
}

$sql = "SELECT id, username, full_name, password, must_change_password FROM users WHERE is_active = 1";
$params = [];
if ($onlyUser !== null) {
    $sql .= " AND username = ?";
    $params[] = $onlyUser;
}
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$users = $stmt->fetchAll();

$flagged = 0;
foreach ($users as $u) {
    if (empty($u['password'])) continue;
    $isDefault = false;
    foreach ($DEFAULTS as $d) {
        if (password_verify($d, $u['password'])) { $isDefault = true; break; }
    }
    if (!$isDefault) continue;

    if ($listOnly) {
        echo "จะ flag: {$u['username']} ({$u['full_name']}) — ใช้รหัสเริ่มต้น\n";
        $flagged++;
        continue;
    }
    $pdo->prepare("UPDATE users SET must_change_password = 1 WHERE id = ?")->execute([(int)$u['id']]);
    echo "flagged: {$u['username']} ({$u['full_name']})\n";
    $flagged++;
}

echo ($listOnly ? "จะตั้งบังคับ " : "ตั้งบังคับเปลี่ยนรหัส ") . $flagged . " บัญชี\n";
