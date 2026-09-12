-- Migration: Sage 300 Phase 12 — Pending Issue model, PM Planned Parts, Item Code reference key
-- Safe for re-run: guarded column/table existence checks via information_schema.
-- Tables referenced: pm_am_plans, spare_issue_requests, spare_issue_request_items, repair_spare_parts, pm_am_spare_parts

-- 1) PM Planned Parts (per PM master plan, referenced by Sage Item Code — CMMS has no own stock master)
CREATE TABLE IF NOT EXISTS `pm_planned_parts` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `plan_id`          INT UNSIGNED NOT NULL,
  `sage_item_code`   VARCHAR(30) NOT NULL,
  `item_description` VARCHAR(255) NULL,
  `unit`             VARCHAR(20) NULL,
  `qty`              DECIMAL(10,2) NOT NULL DEFAULT 1,
  `note`             VARCHAR(255) NULL,
  `created_by`       INT UNSIGNED NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_ppp_plan_item` (`plan_id`, `sage_item_code`),
  CONSTRAINT `fk_ppp_plan` FOREIGN KEY (`plan_id`) REFERENCES `pm_am_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) spare_issue_requests — add columns used by the Pending-Issue workflow (aligns legacy table with the
--    request API schema). Status enum is expanded additively; legacy values are preserved.
ALTER TABLE `spare_issue_requests`
  ADD COLUMN `work_order_no`    VARCHAR(50) NULL AFTER `work_order_id`,
  ADD COLUMN `technician_id`    INT UNSIGNED NULL AFTER `work_order_no`,
  ADD COLUMN `technician_name`  VARCHAR(255) NULL AFTER `technician_id`,
  ADD COLUMN `request_type`     VARCHAR(20) NOT NULL DEFAULT 'withdrawal' AFTER `technician_name`,
  ADD COLUMN `note`             TEXT NULL AFTER `request_type`,
  ADD COLUMN `created_by`       INT UNSIGNED NULL AFTER `note`,
  ADD COLUMN `total_qty`        DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `remarks`,
  ADD COLUMN `total_value`      DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN `approved_at`      DATETIME NULL,
  ADD COLUMN `rejection_reason` TEXT NULL,
  MODIFY COLUMN `status` ENUM('Requested','Approved','Waiting Issue','Issued','Returned','Cancelled','pending','rejected','partial') NOT NULL DEFAULT 'pending';

-- 3) spare_issue_request_items — Pending Issue tracking (issued/returned quantities + real Sage doc via reconciliation)
ALTER TABLE `spare_issue_request_items`
  ADD COLUMN `issued_qty`   DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `returned_qty` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `issued_at`    DATETIME NULL,
  ADD COLUMN `returned_at`  DATETIME NULL,
  ADD COLUMN `issued_by`    INT UNSIGNED NULL,
  ADD COLUMN `returned_by`  INT UNSIGNED NULL,
  ADD COLUMN `sage_doc_no`  VARCHAR(100) NULL;

-- 4) repair_spare_parts — snapshot Item Code reference key (Sage item may not exist in cache yet)
ALTER TABLE `repair_spare_parts`
  ADD COLUMN `sage_item_code`   VARCHAR(30) NULL,
  ADD COLUMN `item_description` VARCHAR(255) NULL,
  ADD COLUMN `unit`             VARCHAR(20) NULL,
  ADD COLUMN `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 5) pm_am_spare_parts — same snapshot reference key for PM cycles
ALTER TABLE `pm_am_spare_parts`
  ADD COLUMN `sage_item_code`   VARCHAR(30) NULL,
  ADD COLUMN `item_description` VARCHAR(255) NULL,
  ADD COLUMN `unit`             VARCHAR(20) NULL,
  ADD COLUMN `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;