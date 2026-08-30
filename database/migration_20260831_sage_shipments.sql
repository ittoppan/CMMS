-- Migration: Sage 300 I/C Shipments Reconciliation
-- Add fields to spare_issue_requests and create reconciliation table

-- 1. Add sage_shipment fields to spare_issue_requests
ALTER TABLE `spare_issue_requests`
ADD COLUMN `sage_shipment_status` ENUM('pending','partial','completed','cancelled') NOT NULL DEFAULT 'pending' AFTER `status`,
ADD COLUMN `sage_shipment_no` VARCHAR(50) NULL AFTER `sage_shipment_status`,
ADD COLUMN `sage_shipment_date` DATETIME NULL AFTER `sage_shipment_no`,
ADD COLUMN `sage_shipment_by` INT UNSIGNED NULL AFTER `sage_shipment_date`,
ADD COLUMN `sage_shipment_note` TEXT NULL AFTER `sage_shipment_by`,
ADD COLUMN `sage_updated_at` TIMESTAMP NULL AFTER `sage_shipment_note`,
ADD KEY `idx_sir_sage_status` (`sage_shipment_status`),
ADD CONSTRAINT `fk_sir_sage_by` FOREIGN KEY (`sage_shipment_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Create reconciliation detail table for line-by-line Sage 300 tracking
CREATE TABLE IF NOT EXISTS `spare_issue_sage_shipments` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `request_id`      INT UNSIGNED NOT NULL,
  `item_id`         INT UNSIGNED NOT NULL,
  `sage_qty`        DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'จำนวนที่ตัดใน Sage 300',
  `sage_shipment_no` VARCHAR(50) NULL COMMENT 'เลขที่ Shipment ใน Sage 300',
  `sage_line_no`    INT NULL COMMENT 'บรรทัดใน Sage 300 Shipment',
  `status`          ENUM('pending','partial','completed','cancelled') NOT NULL DEFAULT 'pending' COMMENT 'สถานะการตัดใน Sage',
  `sage_shipment_date` DATETIME NULL,
  `sage_shipment_by` INT UNSIGNED NULL,
  `sage_note`       TEXT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `fk_sis_request` (`request_id`),
  KEY `fk_sis_item` (`item_id`),
  KEY `idx_sis_status` (`status`),
  KEY `idx_sis_sage_shipment` (`sage_shipment_no`),
  CONSTRAINT `fk_sis_request` FOREIGN KEY (`request_id`) REFERENCES `spare_issue_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sis_item` FOREIGN KEY (`item_id`) REFERENCES `spare_issue_request_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sis_sage_by` FOREIGN KEY (`sage_shipment_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Add index for performance
CREATE INDEX `idx_sir_sage_status_wo` ON `spare_issue_requests` (`sage_shipment_status`, `work_order_id`);