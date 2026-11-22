<?php
require_once __DIR__ . '/../src/config/db.php';
$pdo = getDb();
// idempotent: add marker column if missing
$cols = $pdo->query("SHOW COLUMNS FROM approval_requests")->fetchAll(PDO::FETCH_COLUMN);
if (!in_array('approval_token_hashed', $cols, true)) {
    $pdo->exec("ALTER TABLE approval_requests ADD COLUMN approval_token_hashed TINYINT(1) NOT NULL DEFAULT 0");
    echo "added column approval_token_hashed\n";
}
// hash any un-hashed tokens (backup first)
$pdo->exec("CREATE TABLE IF NOT EXISTS approval_requests_backup_prehash AS SELECT * FROM approval_requests WHERE 1=0");
// backup rows that are about to be changed
$pdo->exec("INSERT INTO approval_requests_backup_prehash SELECT * FROM approval_requests WHERE approval_token_hashed=0 AND approval_token IS NOT NULL AND approval_token <> ''");
// hash
$pdo->exec("UPDATE approval_requests SET approval_token = SHA2(approval_token, 256), approval_token_hashed = 1 WHERE approval_token_hashed = 0 AND approval_token IS NOT NULL AND approval_token <> ''");
echo "done\n";
