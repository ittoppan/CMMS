<?php
/**
 * scripts/migrate_document_links_entity_types.php
 *
 * Bug fix #18: `document_links.entity_type` ENUM only allowed 9 values, while
 * `doc_entity_labels()`, `doc_assert_entity_exists()` and `doc_options()` all
 * support 12 — including `document`, `revision`, `department`. Calling
 * `doc_link_add()` with one of those three passed validation and then hit an
 * UNCAUGHT PDOException ("Data truncated for column 'entity_type'") on INSERT,
 * surfacing as HTTP 500 through POST /api/v1/document.php (link_add).
 *
 * This migration widens the ENUM to include the three missing targets. It is
 * ADDITIVE and backwards-compatible, and idempotent (safe to re-run).
 *
 * Usage:  php scripts/migrate_document_links_entity_types.php
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

function parseDotEnv(string $path): array {
    $out = [];
    if (!is_file($path)) return $out;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }
    return $out;
}

$env = parseDotEnv(dirname(__DIR__) . '/.env');
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '3306';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASS'] ?? '';
$db   = $env['DB_NAME'] ?? 'cmms_tpt';

$want = "ENUM('asset','pm','work_order','rca','bom','spare_part','engineering_change','failure_event','manual','document','revision','department') NOT NULL";

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$col = $pdo->query("SHOW COLUMNS FROM `document_links` LIKE 'entity_type'")->fetch();
if (!$col) {
    fwrite(STDERR, "ERROR: table document_links / column entity_type not found in $db\n");
    exit(1);
}
echo "Current entity_type: {$col['Type']}\n";

if (strpos((string)$col['Type'], "'department'") !== false) {
    echo "Already includes 'document', 'revision', 'department' — nothing to do.\n";
    exit(0);
}

$pdo->exec("ALTER TABLE `document_links` MODIFY COLUMN `entity_type` $want");
$after = $pdo->query("SHOW COLUMNS FROM `document_links` LIKE 'entity_type'")->fetch();
echo "New entity_type: {$after['Type']}\n";
echo "DONE: widened document_links.entity_type.\n";
