<?php
require_once __DIR__ . '/../config/db.php';

class DataGovernanceService {

    /**
     * Validate Machine Code Format (e.g. A-PT-01)
     */
    public static function validateAssetCode(string $code): bool {
        return (bool)preg_match('/^[A-Z0-9]+-[A-Z0-9]+-[0-9]+$/', trim($code)) || strlen($code) >= 3;
    }

    /**
     * Audit Duplicate Spare Parts in Database
     */
    public static function findDuplicateParts(): array {
        try {
            $pdo = getDb();
            return $pdo->query("
                SELECT name, COUNT(*) AS count
                FROM spare_parts
                GROUP BY name HAVING count > 1
                LIMIT 10
            ")->fetchAll();
        } catch (Exception $e) {
            return [];
        }
    }
}
