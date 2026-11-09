<?php
/**
 * repair.php — shared repair-module helpers
 */

if (!function_exists('repair_log_activity')) {
    /** เขียน repair_activity_log ต่อ 1 งานซ่อม (ใช้ร่วมกันระหว่างหน้า create/edit) */
    function repair_log_activity(PDO $pdo, int $repairId, string $action, string $desc): void {
        $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description) VALUES (?,?,?,?)')
            ->execute([$repairId, $_SESSION['user_id'] ?? null, $action, $desc]);
    }
}
