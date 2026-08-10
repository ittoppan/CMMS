-- ============================================================
-- CMMS-TPT Migration: Enlarge repair photo columns (2026-08-02)
-- F-EN-03 mobile form stores up to 5 resized JPEGs as base64
-- data URIs joined with "|" in before_image_path.
-- TEXT (64KB) is too small -> LONGTEXT (4GB).
-- ============================================================

USE `cmms_tpt`;

ALTER TABLE `repair`
  MODIFY COLUMN `before_image_path` LONGTEXT NULL,
  MODIFY COLUMN `after_image_path`  LONGTEXT NULL;
