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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            // ตารางเดิมที่สร้างโดยเวอร์ชันเก่าอาจไม่มี resource_type (NOT NULL) — เพิ่มแบบ idempotent (ตรวจ 1 ครั้ง)
            static $schemaReady = false;
            if (!$schemaReady) {
                $hasCol = (bool)$pdo->query("SELECT 1 FROM information_schema.COLUMNS
                                             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs'
                                               AND COLUMN_NAME = 'resource_type'")->fetchColumn();
                if (!$hasCol) {
                    $pdo->exec("ALTER TABLE audit_logs ADD COLUMN resource_type VARCHAR(60) NOT NULL DEFAULT ''");
                }
                $schemaReady = true;
            }

            $userId = $_SESSION['user_id'] ?? 1;
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $resourceType = $module !== '' ? $module : 'system';

            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (user_id, action, module, doc_no, resource_type, resource_id, old_value, new_value, ip_address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$userId, $action, $module, $docNo, $resourceType, $docNo, $oldVal, $newVal, $ip]);
        } catch (Exception $e) {}
    }
}
