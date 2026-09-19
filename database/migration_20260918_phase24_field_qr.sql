-- ============================================================================
-- migration_20260918_phase24_field_qr.sql
-- Phase 24 — Mobile QR/Barcode & Technician Field Workflow
--
-- Additive only (ไม่แก้/ไม่ลบของเดิม):
--   1) asset_registry.qr_token  — opaque stable token สำหรับ QR payload (CMMS-A-<token>)
--   2) scan_events              — ประวัติการสแกน (retention 180 วัน — ดู scan_purge_old())
--   3) qr_print_log             — ประวัติการพิมพ์ฉลาก QR (auditability)
--
-- หมายเหตุ: ไฟล์นี้เป็นเอกสารประกอบ (run-once) — ตัวที่ใช้จริงคือ
--   scripts/apply_phase24_field_qr.php (idempotent, ตรวจ information_schema ก่อนแก้)
-- ============================================================================

-- 1) Opaque QR token (unique, nullable — backward compatible กับรหัส asset เดิม)
ALTER TABLE `asset_registry`
  ADD COLUMN `qr_token` VARCHAR(32) NULL COMMENT 'Phase 24: opaque token สำหรับ QR payload' AFTER `code`;

CREATE UNIQUE INDEX `uq_asset_qr_token` ON `asset_registry` (`qr_token`);

-- 2) ประวัติการสแกน — user_id/asset_id อ้างอิงได้, ไม่ cascade delete
CREATE TABLE IF NOT EXISTS `scan_events` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) ประวัติการพิมพ์ฉลาก QR
CREATE TABLE IF NOT EXISTS `qr_print_log` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
