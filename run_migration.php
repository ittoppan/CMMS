<?php
require __DIR__ . '/src/config/db.php';
$pdo = getDb();
$sql = file_get_contents(__DIR__ . '/database/migration_20260830_spare_issue_requests.sql');
$statements = array_filter(array_map('trim', explode(';', $sql)));
foreach ($statements as $stmt) {
    if ($stmt) {
        try { 
            $pdo->exec($stmt); 
            echo 'OK: ' . substr($stmt, 0, 60) . '...' . PHP_EOL; 
        }
        catch (Exception $e) { 
            echo 'ERR: ' . $e->getMessage() . PHP_EOL; 
        }
    }
}
echo "Done\n";