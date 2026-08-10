<?php
require_once __DIR__ . '/../config/db.php';

class RCAService {

    /**
     * Create 5-Why & Fishbone RCA record for a Work Order
     */
    public static function createRCARecord(array $data): int {
        $pdo = getDb();

        // Ensure table exists
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS rca_records (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                repair_id INT UNSIGNED NOT NULL,
                failure_code VARCHAR(50) NOT NULL,
                why1 VARCHAR(500),
                why2 VARCHAR(500),
                why3 VARCHAR(500),
                why4 VARCHAR(500),
                why5 VARCHAR(500),
                fishbone_man VARCHAR(500),
                fishbone_machine VARCHAR(500),
                fishbone_material VARCHAR(500),
                fishbone_method VARCHAR(500),
                fishbone_measurement VARCHAR(500),
                fishbone_environment VARCHAR(500),
                corrective_action TEXT,
                preventive_action TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $stmt = $pdo->prepare("
            INSERT INTO rca_records 
            (repair_id, failure_code, why1, why2, why3, why4, why5, fishbone_man, fishbone_machine, fishbone_material, fishbone_method, fishbone_measurement, fishbone_environment, corrective_action, preventive_action)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $data['repair_id'],
            $data['failure_code'] ?? 'FAIL-MECH-01',
            $data['why1'] ?? '',
            $data['why2'] ?? '',
            $data['why3'] ?? '',
            $data['why4'] ?? '',
            $data['why5'] ?? '',
            $data['fishbone_man'] ?? '',
            $data['fishbone_machine'] ?? '',
            $data['fishbone_material'] ?? '',
            $data['fishbone_method'] ?? '',
            $data['fishbone_measurement'] ?? '',
            $data['fishbone_environment'] ?? '',
            $data['corrective_action'] ?? '',
            $data['preventive_action'] ?? ''
        ]);

        return (int)$pdo->lastInsertId();
    }
}
