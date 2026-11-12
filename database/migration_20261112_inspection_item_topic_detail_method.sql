-- Migration: Inspection template items — add topic/detail/method fields for check sheets
-- Run via PHP runner (split on ';') against db cmms_tpt. Additive only.

USE cmms_tpt;

ALTER TABLE `inspection_template_items`
  ADD COLUMN `topic` VARCHAR(255) NULL AFTER `task`,
  ADD COLUMN `check_detail` TEXT NULL AFTER `topic`,
  ADD COLUMN `check_method` TEXT NULL AFTER `check_detail`;
