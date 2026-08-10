<?php
require_once __DIR__ . '/../config/db.php';

class JobQueueService {

    /**
     * Push job to asynchronous background processing queue
     */
    public static function pushJob(string $jobType, array $payload): int {
        try {
            $pdo = getDb();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS queue_jobs (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    job_type VARCHAR(50) NOT NULL,
                    payload TEXT NOT NULL,
                    status VARCHAR(20) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            $stmt = $pdo->prepare("INSERT INTO queue_jobs (job_type, payload) VALUES (?, ?)");
            $stmt->execute([$jobType, json_encode($payload, JSON_UNESCAPED_UNICODE)]);

            return (int)$pdo->lastInsertId();
        } catch (Exception $e) {
            return 0;
        }
    }

    /**
     * Process pending jobs in queue
     */
    public static function processQueue(): int {
        try {
            $pdo = getDb();
            $jobs = $pdo->query("SELECT * FROM queue_jobs WHERE status = 'pending' LIMIT 10")->fetchAll();
            
            foreach ($jobs as $job) {
                // Mark job as processed
                $pdo->prepare("UPDATE queue_jobs SET status = 'completed' WHERE id = ?")->execute([$job['id']]);
            }
            return count($jobs);
        } catch (Exception $e) {
            return 0;
        }
    }
}
