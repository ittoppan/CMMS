<?php
require_once __DIR__ . '/../config/db.php';

class AuditTrailService {

    /**
     * Log any system event / action to Audit Trail
     */
    public static function log(string $action, string $module, string $docNo = '', string $oldVal = '', string $newVal = ''): void {
        try {
            $pdo = getDb();
            
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED,
                    action VARCHAR(50) NOT NULL,
                    module VARCHAR(50) NOT NULL,
                    doc_no VARCHAR(100),
                    old_value TEXT,
                    new_value TEXT,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $userId = $_SESSION['user_id'] ?? 1;
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (user_id, action, module, doc_no, old_value, new_value, ip_address)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$userId, $action, $module, $docNo, $oldVal, $newVal, $ip]);
        } catch (Exception $e) {}
    }
}
