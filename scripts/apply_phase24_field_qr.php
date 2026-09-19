<?php
/**
 * scripts/apply_phase24_field_qr.php — idempotent DB migration (Phase 24)
 *
 * ทำ 3 อย่าง (ตรวจก่อนแก้ทุกขั้น — รันซ้ำได้ปลอดภัย):
 *   1) เพิ่มคอลัมน์ asset_registry.qr_token + UNIQUE index (ถ้ายังไม่มี)
 *   2) สร้างตาราง scan_events / qr_print_log (ถ้ายังไม่มี)
 *   3) backfill qr_token ให้เครื่องจักรที่ยังไม่มี (opaque token)
 *
 * วิธีเรียก:  php scripts/apply_phase24_field_qr.php
 */

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$changed = 0;
$log = function (string $msg): void { echo $msg . PHP_EOL; };

/** มีคอลัมน์นี้หรือยัง */
$hasColumn = function (string $table, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
};

/** มี index นี้หรือยัง */
$hasIndex = function (string $table, string $index) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $st->execute([$table, $index]);
    return (int)$st->fetchColumn() > 0;
};

// ---------- 1) asset_registry.qr_token ----------
if (!$hasColumn('asset_registry', 'qr_token')) {
    $pdo->exec("ALTER TABLE `asset_registry`
                ADD COLUMN `qr_token` VARCHAR(32) NULL COMMENT 'Phase 24: opaque token สำหรับ QR payload' AFTER `code`");
    $log('+ asset_registry.qr_token');
    $changed++;
} else {
    $log('~ asset_registry.qr_token (existed)');
}

if (!$hasIndex('asset_registry', 'uq_asset_qr_token')) {
    try {
        $pdo->exec('CREATE UNIQUE INDEX `uq_asset_qr_token` ON `asset_registry` (`qr_token`)');
        $log('+ index uq_asset_qr_token');
        $changed++;
    } catch (Throwable $e) {
        $log('! index uq_asset_qr_token failed: ' . $e->getMessage());
    }
} else {
    $log('~ index uq_asset_qr_token (existed)');
}

// ---------- 2) ตาราง scan_events / qr_print_log ----------
$pdo->exec("CREATE TABLE IF NOT EXISTS `scan_events` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       INT UNSIGNED NULL,
  `raw_code`      VARCHAR(255) NOT NULL,
  `resolved_type` VARCHAR(20) NOT NULL DEFAULT 'unknown',
  `resolved_id`   INT UNSIGNED NULL,
  `asset_id`      INT UNSIGNED NULL,
  `source`        VARCHAR(20) NOT NULL DEFAULT 'camera',
  `context`       VARCHAR(60) NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scan_created` (`created_at`),
  KEY `idx_scan_user` (`user_id`),
  KEY `idx_scan_asset` (`asset_id`),
  KEY `idx_scan_type` (`resolved_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$log('~ scan_events ready');

$pdo->exec("CREATE TABLE IF NOT EXISTS `qr_print_log` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id`   INT UNSIGNED NOT NULL,
  `printed_by` INT UNSIGNED NULL,
  `template`   VARCHAR(60) NOT NULL DEFAULT 'a4-sheet',
  `qr_count`   INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qrprint_asset` (`asset_id`),
  KEY `idx_qrprint_created` (`created_at`),
  KEY `idx_qrprint_user` (`printed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$log('~ qr_print_log ready');

// ---------- 3) backfill qr_token ----------
$missing = $pdo->query("SELECT id FROM asset_registry WHERE qr_token IS NULL OR qr_token = ''")->fetchAll(PDO::FETCH_COLUMN);
$filled = 0;
foreach ($missing as $id) {
    $done = false;
    for ($attempt = 0; $attempt < 5 && !$done; $attempt++) {
        $token = strtoupper(bin2hex(random_bytes(8))); // 16 hex chars
        try {
            $st = $pdo->prepare('UPDATE asset_registry SET qr_token = ? WHERE id = ? AND (qr_token IS NULL OR qr_token = "")');
            $st->execute([$token, (int)$id]);
            $done = true;
            $filled++;
        } catch (Throwable $e) {
            // ชน unique — ลองใหม่
        }
    }
}
if ($missing) {
    if ($filled) { $log("+ backfilled qr_token: $filled/" . count($missing)); $changed += $filled; }
    else { $log('~ backfill: no rows changed'); }
} else {
    $log('~ backfill: all assets already have qr_token');
}

echo ($changed === 0 ? "Phase 24: ไม่มีการเปลี่ยนแปลง (ตรวจแล้วครบ)" : "Phase 24: เปลี่ยนแปลง $changed รายการ") . PHP_EOL;
