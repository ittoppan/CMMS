<?php
require_once __DIR__ . '/../config/db.php';

class UXAnalyticsService {

    /**
     * Log Page View & User Interactions for UX Optimization
     */
    public static function logPageView(string $pageName): void {
        try {
            $pdo = getDb();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS ux_analytics_log (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED,
                    page_name VARCHAR(200) NOT NULL,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $userId = $_SESSION['user_id'] ?? 1;
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

            $stmt = $pdo->prepare("INSERT INTO ux_analytics_log (user_id, page_name, ip_address) VALUES (?, ?, ?)");
            $stmt->execute([$userId, $pageName, $ip]);
        } catch (Exception $e) {}
    }
}
