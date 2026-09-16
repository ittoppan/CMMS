<?php
/**
 * scripts/apply_phase19_offline.php — idempotent DB migration (Phase 19)
 *
 * สร้าง client_action_log + เพิ่ม/ตรวจ performance indexes (เพิ่มเฉพาะที่ยังไม่มี
 * ผ่าน information_schema — ไม่ทำให้ index ซ้ำ/ไม่ทำลายข้อมูลเดิม)
 *
 * วิธีเรียก:  php scripts/apply_phase19_offline.php
 */

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$changed = 0;
$log = function (string $msg) use (&$changed) { echo $msg . PHP_EOL; };

// ---------- 1) client_action_log ----------
$pdo->exec("CREATE TABLE IF NOT EXISTS `client_action_log` (
  `client_action_id` VARCHAR(64) NOT NULL,
  `endpoint`         VARCHAR(255) NULL,
  `method`           VARCHAR(10)  NULL,
  `outcome`          VARCHAR(12)  NOT NULL DEFAULT 'processing',
  `ref_type`         VARCHAR(40)  NULL,
  `ref_id`           INT UNSIGNED NULL,
  `https_status`     INT UNSIGNED NULL,
  `user_id`          INT UNSIGNED NULL,
  `description`      VARCHAR(500) NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at`      DATETIME NULL,
  PRIMARY KEY (`client_action_id`),
  KEY `idx_cal_created` (`created_at`),
  KEY `idx_cal_user` (`user_id`),
  KEY `idx_cal_ref` (`ref_type`, `ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$log((strpos((string)$pdo->query('SHOW TABLES LIKE "client_action_log"')->fetchColumn(), 'client_action_log') !== false) ? '[client_action_log] OK' : '[client_action_log] WARN table check');

// ---------- 2) performance indexes (เพิ่มเฉพาะถ้ายังไม่มี) ----------
$indexes = [
    'idx_ral_repair_id'      => ['repair_activity_log', ['repair_id']],
    'idx_ra_repair_id'       => ['repair_attachments', ['repair_id']],
    'idx_ra_category'        => ['repair_attachments', ['category']],
    'idx_sir_status'         => ['spare_issue_requests', ['status']],
    'idx_sir_work_order'     => ['spare_issue_requests', ['work_order_id']],
    'idx_siri_request_part'  => ['spare_issue_request_items', ['request_id', 'spare_part_id']],
    'idx_wpl_repair_id'      => ['work_pause_logs', ['repair_id']],
    'idx_notif_user_created' => ['notifications', ['user_id', 'created_at']],
    'idx_notif_unread'       => ['notifications', ['user_id', 'read_at']],
    'idx_repair_status_assignee' => ['repair', ['status', 'assigned_to']],
    'idx_repair_created_at'  => ['repair', ['created_at']],
];

foreach ($indexes as $idx => [$table, $cols]) {
    // ตารางนี้มีอยู่ไหม
    $hasTable = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->fetchColumn();
    if (!$hasTable) { $log("  - skip $idx (table $table not found)"); continue; }
    // มี index นี้อยู่แล้วไหม
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?");
    $stmt->execute([$table, $idx]);
    if ((int)$stmt->fetchColumn() > 0) { $log("  ~ $idx (existed)"); continue; }
    try {
        $colSql = implode(', ', array_map(fn($c) => "`$c`", $cols));
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `$idx` ($colSql)");
        $log("  + $idx on $table(" . implode(', ', $cols) . ")");
        $changed++;
    } catch (Exception $e) {
        $log("  ! $idx failed: " . $e->getMessage());
    }
}

echo ($changed === 0 ? "Phase 19: ไม่มีการเปลี่ยนแปลง (ตรวจแล้วครบ)" : "Phase 19: เพิ่ม/ปรับปรุง $changed รายการ") . PHP_EOL;