<?php
/**
 * scripts/ci-bootstrap-db.php — สร้าง schema ของ CMMS จากไฟล์ SQL ในรีโป ลงฐานข้อมูล *สำหรับ CI เท่านั้น*
 *
 * ใช้ใน CI (job `phpdb`, service mysql:8.0) เพื่อให้ชุดทดสอบ scripts/test_*.php ที่ต้องใช้ scratch DB
 * มีโครงสร้างครบ แล้วแต่ละชุดจะ clone โครงสร้างไปยัง <db>_coretest / <db>_misctest ของตัวเอง
 *
 * ⚠️ SAFETY — ไฟล์ SQL ในรีโปมี `USE cmms_tpt;` / `CREATE DATABASE cmms_tpt` อยู่ 15 ไฟล์
 *    ถ้ารันตรง ๆ คำสั่งจะสลับไปเขียนทับ DB จริง (เคยเกิดอุบัติเหตุแบบนี้มาแล้ว)
 *    สคริปต์นี้จึง:
 *      1) บังคับให้ชื่อ DB ลงท้ายด้วย `_ci` เท่านั้น (ไม่ใช่ cmms_tpt แน่นอน)
 *      2) ตัด `USE ...` และ `CREATE DATABASE ...` ทุกตัวออกก่อน execute (คำสั่งที่เหลือรันใน DB ที่เลือก)
 *      3) ตรวจหลังต่อ connection ว่า SELECT DATABASE() ตรงกับชื่อที่อนุญาต
 *      4) ตรวจหลังจบว่ามีตารางเกิดขึ้นจริง (กันกรณี "รันแล้วเหมือนผ่านแต่ไม่เกิดอะไร")
 *
 * ใช้:
 *   php scripts/ci-bootstrap-db.php cmms_ci
 *
 * exit 0 = schema พร้อมใช้, 1 = ผิดพลาด/ไม่ผ่าน guard, 2 = guard ปฏิเสธชื่อ DB
 */

declare(strict_types=1);

$db = $argv[1] ?? '';
if (!preg_match('/^[A-Za-z0-9_]+_ci$/', $db)) {
    fwrite(STDERR, "GUARD: database name must match ^[A-Za-z0-9_]+_ci$ (got '{$db}') — refusing to run\n");
    exit(2);
}

$envPath = dirname(__DIR__) . '/.env';
if (is_file($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        if ($k === 'DB_NAME') continue; // ห้ามให้ .env เปลี่ยน DB เป้าหมาย
        putenv($k . '=' . trim(trim($v), "\"'"));
    }
}

$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';

if ($db === (getenv('DB_NAME') ?: 'cmms_tpt')) {
    fwrite(STDERR, "GUARD: target equals the app database — refusing to run\n");
    exit(2);
}

/** แยก statements + ตัด USE / CREATE DATABASE ทิ้ง (สิ่งที่ทำให้หลุดไปเขียน DB จริง) */
function ci_statements(string $sql): array
{
    $out = [];
    $buf = '';
    foreach (preg_split('/\R/', $sql) as $line) {
        $t = trim($line);
        if ($t === '' || str_starts_with($t, '--') || str_starts_with($t, '#')) continue;
        $buf .= $line . "\n";
        if (str_ends_with($t, ';')) {
            $stmt = rtrim(trim($buf), "; \t\n\r");
            $buf = '';
            if ($stmt === '') continue;
            if (preg_match('/^USE\b/i', $stmt)) continue;
            if (preg_match('/^CREATE\s+DATABASE\b/i', $stmt)) continue;
            $out[] = $stmt;
        }
    }
    return $out;
}

$dsnBase = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $host, $port);
$opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];

try {
    $admin = new PDO($dsnBase, $user, $pass, $opts);

    // ล้างของเก่าให้เริ่มจากศูนย์ (เฉพาะ DB ที่ลงท้าย _ci แล้วเท่านั้น)
    $admin->exec('DROP DATABASE IF EXISTS `' . $db . '`');
    $admin->exec('CREATE DATABASE `' . $db . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo = new PDO($dsnBase . ';dbname=' . $db, $user, $pass, $opts);
    $current = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    if ($current !== $db) {
        fwrite(STDERR, "GUARD: connected to '{$current}' instead of '{$db}' — aborting\n");
        exit(2);
    }
    $pdo->exec("SET time_zone = '+07:00'");

    // แหล่ง schema: ใช้ structure dump ที่ generate จาก DB จริงก่อน (ครบทุกตาราง)
    // ถ้าไม่มีจึง fallback เป็น schema.sql + migration_*.sql (ไฟล์ในรีโปพึ่งพากัน → ได้ไม่ครบ)
    $files = [];
    $structure = dirname(__DIR__) . '/database/ci_schema_structure.sql';
    if (is_file($structure)) {
        $files[] = $structure;
        $source = 'ci_schema_structure.sql';
    } else {
        $source = 'repo sql (schema.sql + migrations)';
        $schema = dirname(__DIR__) . '/database/schema.sql';
        if (is_file($schema)) $files[] = $schema;
        $migrations = glob(dirname(__DIR__) . '/database/migration_*.sql') ?: [];
        sort($migrations, SORT_STRING);
        foreach ($migrations as $m) {
            if (str_contains(basename($m), 'proposal')) continue; // ธรรมเนียมรีโป: proposal ไม่รัน
            $files[] = $m;
        }
    }
    if (!$files) {
        fwrite(STDERR, "no SQL files found under database/\n");
        exit(1);
    }

    $applied = 0;
    $ignored = 0;
    $fatal = [];
    foreach ($files as $file) {
        foreach (ci_statements((string)file_get_contents($file)) as $stmt) {
            try {
                $pdo->exec($stmt);
                $applied++;
            } catch (Throwable $e) {
                $msg = $e->getMessage();
                // idempotent: ไฟล์ในรีโปทับกันเอง (ตาราง/คอลัมน์/index มีอยู่แล้ว)
                if (preg_match('/already exists|Duplicate column|Duplicate key name|Duplicate entry|check that column\/key exists/i', $msg)) {
                    $ignored++;
                    continue;
                }
                $fatal[] = basename($file) . ': ' . $msg;
            }
        }
    }

    $tables = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = " . $pdo->quote($db) . " AND TABLE_TYPE='BASE TABLE'")->fetchColumn();
    echo "ci-bootstrap: db={$db} source={$source} files=" . count($files) . " applied={$applied} ignored={$ignored} fatal=" . count($fatal) . " tables={$tables}\n";
    foreach (array_slice($fatal, 0, 10) as $f) echo "  ! {$f}\n";

    if ($tables < 100) {
        fwrite(STDERR, "ci-bootstrap: too few tables ({$tables}) — schema did not build\n");
        exit(1);
    }
    echo "ci-bootstrap: OK\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'ci-bootstrap error: ' . $e->getMessage() . "\n");
    exit(1);
}
