<?php
/**
 * run_migration_20260830_spare_issue_requests.php — CLI-only migration runner
 *
 * เดิมไฟล์นี้ชื่อ `run_migration.php` และวางอยู่ที่ web root ทำให้ใครก็ตามที่เปิด URL
 * /run_migration.php สั่งให้ระบบรัน SQL ได้ (ไม่มี auth) — ย้ายมาไว้ใน scripts/ ซึ่งไม่ถูก
 * IIS เสิร์ฟผ่าน HTTP และบังคับให้รันจาก CLI เท่านั้น
 *
 * usage:
 *   php scripts/run_migration_20260830_spare_issue_requests.php --yes
 *
 * ต้องสำรองฐานข้อมูลก่อนรันทุกครั้ง (ดู docs/DATABASE_RECOVERY.md)
 */

if (PHP_SAPI !== 'cli') {
    // ไม่ให้เรียกผ่าน HTTP เด็ดขาด
    http_response_code(404);
    exit;
}

if (!in_array('--yes', $argv ?? [], true)) {
    fwrite(STDERR, "ปฏิเสธการรัน: ต้องระบุ --yes และควรสำรองฐานข้อมูลก่อน\n");
    fwrite(STDERR, "usage: php scripts/run_migration_20260830_spare_issue_requests.php --yes\n");
    exit(1);
}

require __DIR__ . '/../src/config/db.php';

$sqlFile = __DIR__ . '/../database/migration_20260830_spare_issue_requests.sql';
if (!is_file($sqlFile)) {
    fwrite(STDERR, "ไม่พบไฟล์ migration: {$sqlFile}\n");
    exit(1);
}

$pdo = getDb();
$sql = (string)file_get_contents($sqlFile);
$statements = array_filter(array_map('trim', explode(';', $sql)));

$ok = 0;
$failed = 0;
foreach ($statements as $stmt) {
    if ($stmt === '') {
        continue;
    }
    try {
        $pdo->exec($stmt);
        $ok++;
        echo 'OK: ' . substr($stmt, 0, 60) . '...' . PHP_EOL;
    } catch (Throwable $e) {
        $failed++;
        fwrite(STDERR, 'ERR: ' . $e->getMessage() . PHP_EOL);
    }
}

echo "Done — {$ok} statement(s) ok, {$failed} failed\n";
exit($failed > 0 ? 2 : 0);
